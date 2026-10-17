"""
CAUSAL API — Graph, Node, Dependency CRUD services (Phase 2).

Service layer enforces domain rules and orchestrates repositories.
Services own validation logic; repositories own persistence.
"""

from __future__ import annotations

import uuid
from typing import Sequence

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.graph_models import (
    InfrastructureGraph,
    Node,
    Dependency,
    NodeState,
    HEALTH_MIN, HEALTH_MAX,
    CAPACITY_MIN, CAPACITY_MAX,
    CRITICALITY_MIN, CRITICALITY_MAX,
    STRENGTH_MIN, STRENGTH_MAX,
    FAILURE_PROPAGATION_MIN, FAILURE_PROPAGATION_MAX,
)
from app.repositories.graph_repository import GraphRepository
from app.repositories.node_repository import NodeRepository
from app.repositories.dependency_repository import DependencyRepository
from app.schemas.graph import (
    GraphCreate, GraphUpdate,
    NodeCreate, NodeUpdate,
    DependencyCreate, DependencyUpdate,
    NodeStateUpdate,
)


# ── Error helpers ──────────────────────────────────────────────────────────

def _not_found(resource: str, resource_id: object) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"error": {"code": f"{resource.upper()}_NOT_FOUND",
                          "message": f"{resource} {resource_id} not found."}},
    )


def _conflict(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"error": {"code": code, "message": message}},
    )


def _bad_request(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"error": {"code": code, "message": message}},
    )


# ── GraphService ───────────────────────────────────────────────────────────

class GraphService:
    """CRUD service for InfrastructureGraph."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = GraphRepository(db)

    async def create(self, data: GraphCreate) -> InfrastructureGraph:
        return await self._repo.create(
            name=data.name,
            description=data.description,
            domain=data.domain,
            version=data.version,
            metadata=data.metadata,
        )

    async def get(self, graph_id: uuid.UUID) -> InfrastructureGraph:
        graph = await self._repo.get(graph_id)
        if not graph:
            raise _not_found("Graph", graph_id)
        return graph

    async def list_all(self) -> Sequence[InfrastructureGraph]:
        return await self._repo.list_all()

    async def update(self, graph_id: uuid.UUID, data: GraphUpdate) -> InfrastructureGraph:
        graph = await self.get(graph_id)
        update_fields = data.model_dump(exclude_unset=True)
        return await self._repo.update(graph, **update_fields)

    async def delete(self, graph_id: uuid.UUID) -> None:
        graph = await self.get(graph_id)
        await self._repo.delete(graph)


# ── NodeService ────────────────────────────────────────────────────────────

class NodeService:
    """CRUD service for Node."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = NodeRepository(db)
        self._graph_repo = GraphRepository(db)

    async def create(self, graph_id: uuid.UUID, data: NodeCreate) -> Node:
        # Ensure graph exists
        graph = await self._graph_repo.get(graph_id)
        if not graph:
            raise _not_found("Graph", graph_id)

        return await self._repo.create(
            graph_id=graph_id,
            name=data.name,
            type=data.type,
            description=data.description,
            state=data.state,
            health=data.health,
            capacity=data.capacity,
            criticality=data.criticality,
            location=data.location,
            metadata=data.metadata,
        )

    async def get(self, graph_id: uuid.UUID, node_id: uuid.UUID) -> Node:
        node = await self._repo.get_in_graph(node_id, graph_id)
        if not node:
            raise _not_found("Node", node_id)
        return node

    async def list_by_graph(self, graph_id: uuid.UUID) -> Sequence[Node]:
        # Validate graph exists
        graph = await self._graph_repo.get(graph_id)
        if not graph:
            raise _not_found("Graph", graph_id)
        return await self._repo.list_by_graph(graph_id)

    async def update(self, graph_id: uuid.UUID, node_id: uuid.UUID, data: NodeUpdate) -> Node:
        node = await self.get(graph_id, node_id)
        update_fields = data.model_dump(exclude_unset=True)

        # Validate state if being updated
        if "state" in update_fields and update_fields["state"] not in NodeState.ALL:
            raise _bad_request(
                "INVALID_STATE",
                f"State must be one of: {', '.join(NodeState.ALL)}"
            )

        # Merge with existing values for consistency check
        merged_state = update_fields.get("state", node.state)
        merged_health = update_fields.get("health", node.health)
        _check_state_health_consistency(merged_state, merged_health)

        return await self._repo.update(node, **update_fields)

    async def delete(self, graph_id: uuid.UUID, node_id: uuid.UUID) -> None:
        node = await self.get(graph_id, node_id)
        await self._repo.delete(node)


# ── DependencyService ──────────────────────────────────────────────────────

class DependencyService:
    """CRUD service for Dependency."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = DependencyRepository(db)
        self._node_repo = NodeRepository(db)
        self._graph_repo = GraphRepository(db)

    async def create(self, graph_id: uuid.UUID, data: DependencyCreate) -> Dependency:
        # Validate graph exists
        graph = await self._graph_repo.get(graph_id)
        if not graph:
            raise _not_found("Graph", graph_id)

        # No self-dependency
        if data.source_node_id == data.target_node_id:
            raise _bad_request(
                "SELF_DEPENDENCY",
                "A node cannot depend on itself (source_node_id == target_node_id)."
            )

        # Both nodes must exist in THIS graph
        source = await self._node_repo.get_in_graph(data.source_node_id, graph_id)
        if not source:
            raise _bad_request(
                "INVALID_SOURCE_NODE",
                f"Source node {data.source_node_id} does not exist in graph {graph_id}."
            )

        target = await self._node_repo.get_in_graph(data.target_node_id, graph_id)
        if not target:
            raise _bad_request(
                "INVALID_TARGET_NODE",
                f"Target node {data.target_node_id} does not exist in graph {graph_id}."
            )

        # Duplicate check
        existing = await self._repo.get_by_edge(
            graph_id, data.source_node_id, data.target_node_id
        )
        if existing:
            raise _conflict(
                "DUPLICATE_DEPENDENCY",
                f"A dependency from {data.source_node_id} to {data.target_node_id} "
                "already exists in this graph."
            )

        try:
            return await self._repo.create(
                graph_id=graph_id,
                source_node_id=data.source_node_id,
                target_node_id=data.target_node_id,
                dependency_type=data.dependency_type,
                strength=data.strength,
                required=data.required,
                failure_propagation=data.failure_propagation,
                metadata=data.metadata,
            )
        except IntegrityError:
            await self._db.rollback()
            raise _conflict(
                "DUPLICATE_DEPENDENCY",
                f"A dependency from {data.source_node_id} to {data.target_node_id} "
                "already exists in this graph."
            )

    async def get(self, graph_id: uuid.UUID, dep_id: uuid.UUID) -> Dependency:
        dep = await self._repo.get_in_graph(dep_id, graph_id)
        if not dep:
            raise _not_found("Dependency", dep_id)
        return dep

    async def list_by_graph(self, graph_id: uuid.UUID) -> Sequence[Dependency]:
        graph = await self._graph_repo.get(graph_id)
        if not graph:
            raise _not_found("Graph", graph_id)
        return await self._repo.list_by_graph(graph_id)

    async def update(self, graph_id: uuid.UUID, dep_id: uuid.UUID,
                     data: DependencyUpdate) -> Dependency:
        dep = await self.get(graph_id, dep_id)
        update_fields = data.model_dump(exclude_unset=True)
        return await self._repo.update(dep, **update_fields)

    async def delete(self, graph_id: uuid.UUID, dep_id: uuid.UUID) -> None:
        dep = await self.get(graph_id, dep_id)
        await self._repo.delete(dep)


# ── NodeStateService ───────────────────────────────────────────────────────

class NodeStateService:
    """
    Controlled updates for Node state, health, and capacity.

    Does NOT:
    - Create events
    - Propagate failures
    - Predict failures
    - Determine root causes
    - Choose interventions

    Those belong to future phases (Phase 3 events, Phase 5 causal, Phase 8 interventions).
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._node_repo = NodeRepository(db)

    async def update_state(
        self, graph_id: uuid.UUID, node_id: uuid.UUID, data: NodeStateUpdate
    ) -> Node:
        node = await self._node_repo.get_in_graph(node_id, graph_id)
        if not node:
            raise _not_found("Node", node_id)

        update_fields = data.model_dump(exclude_unset=True)

        # Validate state
        if "state" in update_fields and update_fields["state"] not in NodeState.ALL:
            raise _bad_request(
                "INVALID_STATE",
                f"State must be one of: {', '.join(NodeState.ALL)}"
            )

        # Consistency check on merged values
        merged_state = update_fields.get("state", node.state)
        merged_health = update_fields.get("health", node.health)
        _check_state_health_consistency(merged_state, merged_health)

        updated_node = await self._node_repo.update(node, **update_fields)

        return updated_node




# ── Consistency helpers ────────────────────────────────────────────────────

def _check_state_health_consistency(state: str, health: float) -> None:
    """
    Enforce basic state/health consistency.

    Uses NodeState thresholds as a single centralised rule.
    Does not build an elaborate state machine in Phase 2.
    """
    if state == NodeState.FAILED and health > NodeState.FAILED_MAX_HEALTH:
        raise _bad_request(
            "INCONSISTENT_STATE_HEALTH",
            f"State FAILED is inconsistent with health={health:.2f}. "
            f"FAILED nodes must have health <= {NodeState.FAILED_MAX_HEALTH}."
        )
    if state == NodeState.NORMAL and health < NodeState.NORMAL_MIN_HEALTH:
        raise _bad_request(
            "INCONSISTENT_STATE_HEALTH",
            f"State NORMAL is inconsistent with health={health:.2f}. "
            f"NORMAL nodes must have health >= {NodeState.NORMAL_MIN_HEALTH}."
        )
