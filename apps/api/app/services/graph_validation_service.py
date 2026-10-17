"""
CAUSAL API — Graph Validation Service (Phase 2).

Validates an InfrastructureGraph for structural and value correctness.

Validation findings are classified as:
  ERROR   — The graph is invalid and should not be processed further.
  WARNING — A potential problem; the graph may still be functional.
  INFO    — A notable characteristic; not necessarily a problem.

Important:
  CYCLES ARE NOT ERRORS. Infrastructure systems legitimately cycle.
  Example: A → B → C → A (redundant ring topology).
  Cycles are reported as INFO or WARNING, not rejected.
"""

from __future__ import annotations

import uuid

import networkx as nx
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.graph_models import (
    NodeState,
    HEALTH_MIN, HEALTH_MAX,
    CAPACITY_MIN, CAPACITY_MAX,
    CRITICALITY_MIN, CRITICALITY_MAX,
    STRENGTH_MIN, STRENGTH_MAX,
    FAILURE_PROPAGATION_MIN, FAILURE_PROPAGATION_MAX,
)
from app.repositories.node_repository import NodeRepository
from app.repositories.dependency_repository import DependencyRepository
from app.schemas.graph import GraphValidationResponse, ValidationIssue


class GraphValidationService:
    """
    Validates an InfrastructureGraph for structural and value correctness.

    Does NOT:
    - Propagate failures
    - Compute risk scores
    - Determine root causes
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._node_repo = NodeRepository(db)
        self._dep_repo = DependencyRepository(db)

    async def validate(self, graph_id: uuid.UUID) -> GraphValidationResponse:
        """Run all validation checks and return a comprehensive result."""
        issues: list[ValidationIssue] = []

        nodes = list(await self._node_repo.list_by_graph(graph_id))
        deps = list(await self._dep_repo.list_by_graph(graph_id))
        node_ids = {n.id for n in nodes}

        # ── Value validation ───────────────────────────────────────────────
        for node in nodes:
            self._validate_node_values(node, issues)

        for dep in deps:
            self._validate_dependency_values(dep, issues)

        # ── Structural validation ──────────────────────────────────────────
        for dep in deps:
            # Self-dependency
            if dep.source_node_id == dep.target_node_id:
                issues.append(ValidationIssue(
                    severity="ERROR",
                    code="SELF_DEPENDENCY",
                    message=f"Dependency {dep.id} is a self-loop (source == target).",
                    dependency_id=dep.id,
                ))

            # Endpoints must belong to this graph
            if dep.source_node_id not in node_ids:
                issues.append(ValidationIssue(
                    severity="ERROR",
                    code="INVALID_SOURCE_NODE",
                    message=(
                        f"Dependency {dep.id} references source node "
                        f"{dep.source_node_id} which does not belong to this graph."
                    ),
                    dependency_id=dep.id,
                ))
            if dep.target_node_id not in node_ids:
                issues.append(ValidationIssue(
                    severity="ERROR",
                    code="INVALID_TARGET_NODE",
                    message=(
                        f"Dependency {dep.id} references target node "
                        f"{dep.target_node_id} which does not belong to this graph."
                    ),
                    dependency_id=dep.id,
                ))

        # ── Topology analysis via NetworkX ─────────────────────────────────
        g = nx.DiGraph()
        for node in nodes:
            g.add_node(node.id)
        for dep in deps:
            if dep.source_node_id in node_ids and dep.target_node_id in node_ids:
                if dep.source_node_id != dep.target_node_id:
                    g.add_edge(dep.source_node_id, dep.target_node_id)

        # Isolated nodes
        for node in nodes:
            if g.degree(node.id) == 0:
                issues.append(ValidationIssue(
                    severity="WARNING",
                    code="ISOLATED_NODE",
                    message=f"Node '{node.name}' ({node.id}) has no connections.",
                    node_id=node.id,
                ))

        # Disconnected components
        undirected = g.to_undirected()
        if nodes:
            components = list(nx.connected_components(undirected))
            if len(components) > 1:
                issues.append(ValidationIssue(
                    severity="WARNING",
                    code="DISCONNECTED_COMPONENTS",
                    message=(
                        f"Graph has {len(components)} disconnected components. "
                        "Some nodes cannot reach others."
                    ),
                ))

        # Cycle detection — reported as INFO (not ERROR, cycles are valid)
        try:
            cycles = list(nx.simple_cycles(g))
            if cycles:
                issues.append(ValidationIssue(
                    severity="INFO",
                    code="CYCLES_DETECTED",
                    message=(
                        f"Graph contains {len(cycles)} cycle(s). "
                        "Cycles are valid in infrastructure systems (e.g. ring topologies). "
                        "Reported for awareness."
                    ),
                ))
        except Exception:
            pass

        # ── Tally ──────────────────────────────────────────────────────────
        errors = sum(1 for i in issues if i.severity == "ERROR")
        warnings = sum(1 for i in issues if i.severity == "WARNING")
        infos = sum(1 for i in issues if i.severity == "INFO")

        return GraphValidationResponse(
            graph_id=graph_id,
            valid=errors == 0,
            issues=issues,
            error_count=errors,
            warning_count=warnings,
            info_count=infos,
        )

    # ── Value validators ───────────────────────────────────────────────────

    def _validate_node_values(self, node: object, issues: list[ValidationIssue]) -> None:
        """Validate that node metric values are in range and state is recognised."""
        from app.models.graph_models import Node as NodeModel
        node_obj: NodeModel = node  # type: ignore[assignment]

        if not (HEALTH_MIN <= node_obj.health <= HEALTH_MAX):
            issues.append(ValidationIssue(
                severity="ERROR",
                code="INVALID_HEALTH",
                message=f"Node '{node_obj.name}' health={node_obj.health} is outside [0, 1].",
                node_id=node_obj.id,
            ))

        if not (CAPACITY_MIN <= node_obj.capacity <= CAPACITY_MAX):
            issues.append(ValidationIssue(
                severity="ERROR",
                code="INVALID_CAPACITY",
                message=f"Node '{node_obj.name}' capacity={node_obj.capacity} is outside [0, 1].",
                node_id=node_obj.id,
            ))

        if not (CRITICALITY_MIN <= node_obj.criticality <= CRITICALITY_MAX):
            issues.append(ValidationIssue(
                severity="ERROR",
                code="INVALID_CRITICALITY",
                message=(
                    f"Node '{node_obj.name}' criticality={node_obj.criticality} is outside [0, 1]."
                ),
                node_id=node_obj.id,
            ))

        if node_obj.state not in NodeState.ALL:
            issues.append(ValidationIssue(
                severity="ERROR",
                code="INVALID_STATE",
                message=(
                    f"Node '{node_obj.name}' state='{node_obj.state}' is not recognised. "
                    f"Valid states: {', '.join(NodeState.ALL)}"
                ),
                node_id=node_obj.id,
            ))

    def _validate_dependency_values(self, dep: object, issues: list[ValidationIssue]) -> None:
        """Validate that dependency metric values are in range."""
        from app.models.graph_models import Dependency as DepModel
        dep_obj: DepModel = dep  # type: ignore[assignment]

        if not (STRENGTH_MIN <= dep_obj.strength <= STRENGTH_MAX):
            issues.append(ValidationIssue(
                severity="ERROR",
                code="INVALID_STRENGTH",
                message=f"Dependency {dep_obj.id} strength={dep_obj.strength} is outside [0, 1].",
                dependency_id=dep_obj.id,
            ))

        if not (FAILURE_PROPAGATION_MIN <= dep_obj.failure_propagation <= FAILURE_PROPAGATION_MAX):
            issues.append(ValidationIssue(
                severity="ERROR",
                code="INVALID_FAILURE_PROPAGATION",
                message=(
                    f"Dependency {dep_obj.id} failure_propagation="
                    f"{dep_obj.failure_propagation} is outside [0, 1]."
                ),
                dependency_id=dep_obj.id,
            ))
