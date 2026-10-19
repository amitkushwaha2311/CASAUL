"""
CAUSAL API — Current State Service (Phase 4).

Provides authoritative retrieval of the current operational state of:
- One node
- One graph (all nodes)
- A requested subset of nodes

Preserves existing Phase 2 Node operational records as authoritative current state,
enriched with confidence, source, timestamps, and consistency evaluation.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Sequence

from fastapi import HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.graph_models import InfrastructureGraph, Node
from app.models.state_models import StateConsistencyStatus, StateHistory
from app.schemas.state import (
    CurrentGraphStateResponse,
    CurrentNodeStateResponse,
    NodeStateDetail,
    StateProvenance,
)
from app.services.state_consistency_service import StateConsistencyService


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CurrentStateService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_node_state(
        self, graph_id: uuid.UUID, node_id: uuid.UUID
    ) -> CurrentNodeStateResponse:
        # Check node in graph
        res = await self.db.execute(
            select(Node).where(Node.id == node_id, Node.graph_id == graph_id)
        )
        node = res.scalar_one_or_none()
        if not node:
            raise HTTPException(
                status_code=404,
                detail=f"Node {node_id} not found in graph {graph_id}",
            )

        detail = await self._build_node_detail(graph_id, node)
        return CurrentNodeStateResponse(node=detail)

    async def get_graph_state(
        self,
        graph_id: uuid.UUID,
        node_ids: Sequence[uuid.UUID] | None = None,
    ) -> CurrentGraphStateResponse:
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

        q = select(Node).where(Node.graph_id == graph_id)
        if node_ids:
            q = q.where(Node.id.in_(node_ids))

        node_records = (await self.db.execute(q)).scalars().all()

        node_details: list[NodeStateDetail] = []
        for n in node_records:
            node_details.append(await self._build_node_detail(graph_id, n))

        # Overall graph consistency evaluation
        nodes_data = [
            {
                "node_id": nd.node_id,
                "node_name": nd.node_name,
                "state": nd.state,
                "health": nd.health,
                "capacity": nd.capacity,
            }
            for nd in node_details
        ]
        consistency = StateConsistencyService.evaluate_graph_nodes(graph_id, nodes_data)

        known_count = sum(1 for nd in node_details if nd.is_known)
        completeness = (known_count / len(node_details)) if node_details else 1.0

        return CurrentGraphStateResponse(
            graph_id=graph_id,
            graph_name=graph.name,
            as_of=_utc_now(),
            total_nodes=len(node_details),
            nodes=node_details,
            completeness_ratio=round(completeness, 4),
            consistency_status=consistency.status,
        )

    async def _build_node_detail(
        self, graph_id: uuid.UUID, node: Node
    ) -> NodeStateDetail:
        # Lookup latest state history entry to obtain provenance and confidence
        hist_q = (
            select(StateHistory)
            .where(
                StateHistory.graph_id == graph_id,
                StateHistory.node_id == node.id,
            )
            .order_by(desc(StateHistory.observed_at), desc(StateHistory.id))
            .limit(1)
        )
        hist_entry = (await self.db.execute(hist_q)).scalar_one_or_none()

        confidence: float | None = None
        source: str | None = None
        last_observed_at: datetime | None = None
        provenance: StateProvenance | None = None

        if hist_entry:
            confidence = hist_entry.confidence
            source = hist_entry.source
            last_observed_at = hist_entry.observed_at
            
            if hist_entry.observation_id or (hist_entry.change_reason and hist_entry.change_reason.startswith("observation")):
                src_type = "observation"
            elif hist_entry.event_id or (hist_entry.change_reason and hist_entry.change_reason.startswith("event")):
                src_type = "event"
            else:
                src_type = "manual"

            provenance = StateProvenance(
                source=hist_entry.source,
                source_type=src_type,  # type: ignore
                observation_id=hist_entry.observation_id,
                event_id=hist_entry.event_id,
                observed_at=hist_entry.observed_at,
                recorded_at=hist_entry.recorded_at,
                details=hist_entry.provenance_metadata,
            )


        # If confidence or provenance is still absent, look up most recent observation on this node
        if confidence is None or provenance is None or provenance.source_type == "initialization":
            from app.models.event_models import Observation
            obs_q = (
                select(Observation)
                .where(Observation.graph_id == graph_id, Observation.node_id == node.id)
                .order_by(desc(Observation.timestamp), desc(Observation.id))
                .limit(1)
            )
            latest_obs = (await self.db.execute(obs_q)).scalar_one_or_none()
            if latest_obs:
                if confidence is None:
                    confidence = latest_obs.confidence
                source = latest_obs.source
                last_observed_at = latest_obs.timestamp
                provenance = StateProvenance(
                    source=latest_obs.source,
                    source_type="observation",
                    observation_id=latest_obs.id,
                    event_id=latest_obs.event_id,
                    observed_at=latest_obs.timestamp,
                    recorded_at=latest_obs.created_at,
                )

        if not provenance:
            # Fall back to initial topology record (unobserved)
            source = "initial_topology"
            last_observed_at = None
            provenance = StateProvenance(
                source="initial_topology",
                source_type="initialization",
                observed_at=None,
                recorded_at=node.created_at,
            )


        # Validate node consistency
        issues = StateConsistencyService.validate_node(
            node_id=node.id,
            node_name=node.name,
            state=node.state,
            health=node.health,
            capacity=node.capacity,
        )
        c_status = StateConsistencyStatus.VALID
        if any(i.severity == StateConsistencyStatus.INVALID for i in issues):
            c_status = StateConsistencyStatus.INVALID
        elif any(i.severity == StateConsistencyStatus.WARNING for i in issues):
            c_status = StateConsistencyStatus.WARNING
        elif any(i.severity == StateConsistencyStatus.UNKNOWN for i in issues):
            c_status = StateConsistencyStatus.UNKNOWN

        return NodeStateDetail(
            node_id=node.id,
            graph_id=graph_id,
            node_name=node.name,
            node_type=node.type,
            state=node.state,
            health=node.health,
            capacity=node.capacity,
            availability=node.capacity,  # capacity/availability proxy when not explicitly decoupled
            criticality=node.criticality,
            last_observed_at=last_observed_at,
            last_state_change_at=node.updated_at,
            confidence=confidence,
            source=source,
            consistency_status=c_status,
            is_known=node.state is not None,
            provenance=provenance,
        )
