"""
CAUSAL API — System State Summary Service (Phase 4).

Generates descriptive graph-level state summaries:
- Total nodes
- Known vs unknown state counts
- Operational state breakdown
- Health and capacity averages (with explicit denominators, never assuming unknown is 0 or healthy)
- Average criticality from Phase 2
- Latest state update timestamp
- Completeness ratio
- Consistency warning and invalid counts
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.graph_models import InfrastructureGraph, Node
from app.models.state_models import StateHistory
from app.schemas.state import SystemStateSummaryResponse
from app.services.current_state_service import CurrentStateService
from app.services.state_consistency_service import StateConsistencyService


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SystemStateSummaryService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.current_state_service = CurrentStateService(db)

    async def get_summary(
        self, graph_id: uuid.UUID
    ) -> SystemStateSummaryResponse:
        # Check graph
        res = await self.db.execute(
            select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id)
        )
        graph = res.scalar_one_or_none()
        if not graph:
            raise HTTPException(
                status_code=404,
                detail=f"Graph {graph_id} not found",
            )

        curr = await self.current_state_service.get_graph_state(graph_id)

        total_nodes = len(curr.nodes)
        known_nodes = sum(1 for n in curr.nodes if n.is_known)
        unknown_nodes = total_nodes - known_nodes

        state_counts: dict[str, int] = {
            "NORMAL": 0,
            "DEGRADED": 0,
            "CRITICAL": 0,
            "FAILED": 0,
            "RECOVERING": 0,
            "UNKNOWN": 0,
        }

        health_values: list[float] = []
        capacity_values: list[float] = []
        criticality_values: list[float] = []

        latest_update: datetime | None = None

        for n in curr.nodes:
            s = n.state if n.is_known else "UNKNOWN"
            state_counts[s] = state_counts.get(s, 0) + 1

            if n.health is not None:
                health_values.append(n.health)
            if n.capacity is not None:
                capacity_values.append(n.capacity)
            criticality_values.append(n.criticality)

            if n.last_observed_at:
                if latest_update is None or n.last_observed_at > latest_update:
                    latest_update = n.last_observed_at

        avg_health = (
            round(sum(health_values) / len(health_values), 4)
            if health_values
            else None
        )
        avg_capacity = (
            round(sum(capacity_values) / len(capacity_values), 4)
            if capacity_values
            else None
        )
        avg_criticality = (
            round(sum(criticality_values) / len(criticality_values), 4)
            if criticality_values
            else 0.5
        )

        nodes_data = [
            {
                "node_id": nd.node_id,
                "node_name": nd.node_name,
                "state": nd.state,
                "health": nd.health,
                "capacity": nd.capacity,
            }
            for nd in curr.nodes
        ]
        consistency = StateConsistencyService.evaluate_graph_nodes(graph_id, nodes_data)

        completeness = (known_nodes / total_nodes) if total_nodes > 0 else 1.0

        return SystemStateSummaryResponse(
            graph_id=graph_id,
            as_of=_utc_now(),
            total_nodes=total_nodes,
            nodes_with_known_state=known_nodes,
            nodes_with_unknown_state=unknown_nodes,
            count_by_operational_state=state_counts,
            average_health=avg_health,
            health_denominator=len(health_values),
            average_capacity=avg_capacity,
            capacity_denominator=len(capacity_values),
            average_criticality=round(avg_criticality, 4),
            latest_state_update_at=latest_update,
            completeness_ratio=round(completeness, 4),
            consistency_warning_count=consistency.warning_count,
            consistency_invalid_count=consistency.invalid_count,
        )
