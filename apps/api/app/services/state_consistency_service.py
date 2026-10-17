"""
CAUSAL API — State Consistency Engine (Phase 4).

Validates canonical state combinations against explicit, documented rules.
Does NOT rewrite contradictory state into different state without recording.
Establishes consistency with project rules, not physical omniscient truth.

Rules:
1. FAILED + health > 0.1: INVALID (A declared failed node cannot have healthy vitality).
2. NORMAL + health < 0.5: INVALID (A normal operational state requires health >= 0.5).
3. CRITICAL + health >= 0.8: WARNING (Warning: critical operational state with high health).
4. DEGRADED + health == 1.0: WARNING (Warning: degraded state with full 1.0 health).
5. RECOVERING + health <= 0.05: WARNING (Warning: recovering node with near-zero health).
6. capacity == 0.0 and state == NORMAL: WARNING (Warning: normal node reported with 0 capacity).
7. Missing health and missing state: UNKNOWN.
8. Otherwise: VALID.
"""

from __future__ import annotations

import uuid
from typing import Any

from app.models.graph_models import Node, NodeState
from app.models.state_models import StateConsistencyStatus
from app.schemas.state import NodeConsistencyIssue, StateConsistencyResponse


class StateConsistencyService:
    """Service enforcing centralized, rule-based state consistency checks."""

    @staticmethod
    def validate_node(
        node_id: uuid.UUID,
        node_name: str,
        state: str | None,
        health: float | None,
        capacity: float | None,
    ) -> list[NodeConsistencyIssue]:
        issues: list[NodeConsistencyIssue] = []

        if state is None and health is None:
            issues.append(
                NodeConsistencyIssue(
                    node_id=node_id,
                    node_name=node_name,
                    rule_code="INSUFFICIENT_DATA",
                    severity=StateConsistencyStatus.UNKNOWN,
                    message="Neither state nor health have been observed for this node.",
                    state=state,
                    health=health,
                    capacity=capacity,
                )
            )
            return issues

        # Invariant 1: FAILED with high health
        if state == NodeState.FAILED and health is not None and health > NodeState.FAILED_MAX_HEALTH:
            issues.append(
                NodeConsistencyIssue(
                    node_id=node_id,
                    node_name=node_name,
                    rule_code="FAILED_STATE_HIGH_HEALTH",
                    severity=StateConsistencyStatus.INVALID,
                    message=f"Node state is FAILED but health is {health:.2f} (> {NodeState.FAILED_MAX_HEALTH}).",
                    state=state,
                    health=health,
                    capacity=capacity,
                )
            )

        # Invariant 2: NORMAL with sub-threshold health
        if state == NodeState.NORMAL and health is not None and health < NodeState.NORMAL_MIN_HEALTH:
            issues.append(
                NodeConsistencyIssue(
                    node_id=node_id,
                    node_name=node_name,
                    rule_code="NORMAL_STATE_LOW_HEALTH",
                    severity=StateConsistencyStatus.INVALID,
                    message=f"Node state is NORMAL but health is {health:.2f} (< {NodeState.NORMAL_MIN_HEALTH}).",
                    state=state,
                    health=health,
                    capacity=capacity,
                )
            )

        # Invariant 3: CRITICAL with high health
        if state == NodeState.CRITICAL and health is not None and health >= 0.8:
            issues.append(
                NodeConsistencyIssue(
                    node_id=node_id,
                    node_name=node_name,
                    rule_code="CRITICAL_STATE_HIGH_HEALTH",
                    severity=StateConsistencyStatus.WARNING,
                    message=f"Node state is CRITICAL but reported health is high ({health:.2f}).",
                    state=state,
                    health=health,
                    capacity=capacity,
                )
            )

        # Invariant 4: DEGRADED with 1.0 health
        if state == NodeState.DEGRADED and health is not None and health >= 0.99:
            issues.append(
                NodeConsistencyIssue(
                    node_id=node_id,
                    node_name=node_name,
                    rule_code="DEGRADED_STATE_FULL_HEALTH",
                    severity=StateConsistencyStatus.WARNING,
                    message=f"Node state is DEGRADED but health is {health:.2f}.",
                    state=state,
                    health=health,
                    capacity=capacity,
                )
            )

        # Invariant 5: RECOVERING with near-zero health
        if state == NodeState.RECOVERING and health is not None and health <= 0.05:
            issues.append(
                NodeConsistencyIssue(
                    node_id=node_id,
                    node_name=node_name,
                    rule_code="RECOVERING_STATE_NEAR_ZERO_HEALTH",
                    severity=StateConsistencyStatus.WARNING,
                    message=f"Node state is RECOVERING but health is near zero ({health:.2f}).",
                    state=state,
                    health=health,
                    capacity=capacity,
                )
            )

        # Invariant 6: Zero capacity with NORMAL state
        if state == NodeState.NORMAL and capacity is not None and capacity <= 0.0:
            issues.append(
                NodeConsistencyIssue(
                    node_id=node_id,
                    node_name=node_name,
                    rule_code="NORMAL_STATE_ZERO_CAPACITY",
                    severity=StateConsistencyStatus.WARNING,
                    message="Node operational state is NORMAL but capacity is 0.0.",
                    state=state,
                    health=health,
                    capacity=capacity,
                )
            )

        return issues

    @classmethod
    def evaluate_graph_nodes(
        cls,
        graph_id: uuid.UUID,
        nodes_data: list[dict[str, Any]],
    ) -> StateConsistencyResponse:
        total_checked = len(nodes_data)
        all_issues: list[NodeConsistencyIssue] = []
        valid_count = 0
        warning_count = 0
        invalid_count = 0
        unknown_count = 0

        for nd in nodes_data:
            node_issues = cls.validate_node(
                node_id=nd["node_id"],
                node_name=nd.get("node_name", str(nd["node_id"])),
                state=nd.get("state"),
                health=nd.get("health"),
                capacity=nd.get("capacity"),
            )
            if not node_issues:
                valid_count += 1
            else:
                all_issues.extend(node_issues)
                severities = {issue.severity for issue in node_issues}
                if StateConsistencyStatus.INVALID in severities:
                    invalid_count += 1
                elif StateConsistencyStatus.WARNING in severities:
                    warning_count += 1
                elif StateConsistencyStatus.UNKNOWN in severities:
                    unknown_count += 1

        overall_status: str = StateConsistencyStatus.VALID
        if invalid_count > 0:
            overall_status = StateConsistencyStatus.INVALID
        elif warning_count > 0:
            overall_status = StateConsistencyStatus.WARNING
        elif unknown_count > 0 and valid_count == 0:
            overall_status = StateConsistencyStatus.UNKNOWN

        return StateConsistencyResponse(
            graph_id=graph_id,
            status=overall_status,  # type: ignore
            total_checked=total_checked,
            valid_count=valid_count,
            warning_count=warning_count,
            invalid_count=invalid_count,
            unknown_count=unknown_count,
            issues=all_issues,
        )
