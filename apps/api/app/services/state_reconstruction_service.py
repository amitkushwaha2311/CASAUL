"""
CAUSAL API — State Reconstruction Service (Phase 4).

Deterministic historical state reconstruction for a node or an entire graph at a requested timestamp.
Ordering principle:
- Considers events, observations, and state_history strictly up to requested timestamp.
- Orders records deterministically by (observed_at ASC, recorded_at ASC, id ASC).
- Replays state updates idempotently from node creation or initial records up to T.
- Respects metric rules: only supported state metrics ('health', 'capacity', 'state') modify state fields.
- Reports completeness ratio and limitation notes when historical data is partial.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event_models import Event, Observation
from app.models.graph_models import InfrastructureGraph, Node, NodeState
from app.models.state_models import StateConsistencyStatus, StateHistory
from app.schemas.state import (
    NodeStateDetail,
    StateProvenance,
    StateReconstructionResponse,
)
from app.services.state_consistency_service import StateConsistencyService


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class StateReconstructionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def reconstruct_graph_state_at(
        self,
        graph_id: uuid.UUID,
        target_timestamp: datetime,
    ) -> StateReconstructionResponse:
        # Validate graph
        res = await self.db.execute(
            select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id)
        )
        graph = res.scalar_one_or_none()
        if not graph:
            raise HTTPException(
                status_code=404,
                detail=f"Graph {graph_id} not found",
            )

        if target_timestamp.tzinfo is None:
            target_timestamp = target_timestamp.replace(tzinfo=timezone.utc)

        # Retrieve all nodes in the graph
        nodes = (
            (await self.db.execute(select(Node).where(Node.graph_id == graph_id)))
            .scalars()
            .all()
        )

        reconstructed_nodes: list[NodeStateDetail] = []
        total_records_evaluated = 0

        for node in nodes:
            node_detail, records_count = await self._reconstruct_node_at(
                graph_id, node, target_timestamp
            )
            reconstructed_nodes.append(node_detail)
            total_records_evaluated += records_count

        known_count = sum(1 for n in reconstructed_nodes if n.is_known)
        completeness_ratio = (known_count / len(reconstructed_nodes)) if reconstructed_nodes else 1.0

        completeness_note = None
        graph_created = graph.created_at.replace(tzinfo=timezone.utc) if graph.created_at.tzinfo is None else graph.created_at
        if target_timestamp < graph_created:
            completeness_note = (
                f"Requested timestamp {target_timestamp.isoformat()} precedes graph creation "
                f"at {graph.created_at.isoformat()}. State is prior to system tracking."
            )
        elif completeness_ratio < 1.0:
            completeness_note = f"Partial history: {len(reconstructed_nodes) - known_count} nodes lack observations prior to target timestamp."

        return StateReconstructionResponse(
            graph_id=graph_id,
            requested_timestamp=target_timestamp,
            effective_timestamp=target_timestamp,
            reconstructed_at=_utc_now(),
            is_complete=(completeness_ratio == 1.0),
            completeness_ratio=round(completeness_ratio, 4),
            records_evaluated=total_records_evaluated,
            completeness_note=completeness_note,
            nodes=reconstructed_nodes,
        )

    async def reconstruct_node_state_at(
        self,
        graph_id: uuid.UUID,
        node_id: uuid.UUID,
        target_timestamp: datetime,
    ) -> StateReconstructionResponse:
        # Validate node in graph
        res = await self.db.execute(
            select(Node).where(Node.id == node_id, Node.graph_id == graph_id)
        )
        node = res.scalar_one_or_none()
        if not node:
            raise HTTPException(
                status_code=404,
                detail=f"Node {node_id} not found in graph {graph_id}",
            )

        if target_timestamp.tzinfo is None:
            target_timestamp = target_timestamp.replace(tzinfo=timezone.utc)

        node_detail, records_count = await self._reconstruct_node_at(
            graph_id, node, target_timestamp
        )

        completeness_note = None
        node_created = node.created_at.replace(tzinfo=timezone.utc) if node.created_at.tzinfo is None else node.created_at
        if target_timestamp < node_created:
            completeness_note = (
                f"Requested timestamp {target_timestamp.isoformat()} precedes node creation "
                f"at {node.created_at.isoformat()}."
            )


        return StateReconstructionResponse(
            graph_id=graph_id,
            node_id=node_id,
            requested_timestamp=target_timestamp,
            effective_timestamp=target_timestamp,
            reconstructed_at=_utc_now(),
            is_complete=node_detail.is_known,
            completeness_ratio=1.0 if node_detail.is_known else 0.0,
            records_evaluated=records_count,
            completeness_note=completeness_note,
            nodes=[node_detail],
        )

    async def _reconstruct_node_at(
        self,
        graph_id: uuid.UUID,
        node: Node,
        target_timestamp: datetime,
    ) -> tuple[NodeStateDetail, int]:
        """
        Reconstruct node state at target timestamp by querying StateHistory and Observations up to target_timestamp.
        Deterministic tie-breaking: observed_at ASC, recorded_at ASC, id ASC.
        """
        # First query StateHistory
        hist_q = (
            select(StateHistory)
            .where(
                StateHistory.graph_id == graph_id,
                StateHistory.node_id == node.id,
                StateHistory.observed_at <= target_timestamp,
            )
            .order_by(
                asc(StateHistory.observed_at),
                asc(StateHistory.recorded_at),
                asc(StateHistory.id),
            )
        )
        hist_records = (await self.db.execute(hist_q)).scalars().all()

        # Also query direct Observations up to target_timestamp in case any were not yet mirrored
        obs_q = (
            select(Observation)
            .where(
                Observation.graph_id == graph_id,
                Observation.node_id == node.id,
                Observation.timestamp <= target_timestamp,
            )
            .order_by(
                asc(Observation.timestamp),
                asc(Observation.id),
            )
        )
        obs_records = (await self.db.execute(obs_q)).scalars().all()

        def _as_utc(dt: datetime) -> datetime:
            return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt

        # Initial baseline state from node creation if node existed before target_timestamp
        node_created = _as_utc(node.created_at)
        target_ts = _as_utc(target_timestamp)
        is_prior_to_node = target_ts < node_created

        # Default starting state
        curr_state = NodeState.NORMAL if not is_prior_to_node else "UNKNOWN"
        curr_health: float | None = 1.0 if not is_prior_to_node else None
        curr_capacity: float | None = 1.0 if not is_prior_to_node else None
        curr_availability: float | None = 1.0 if not is_prior_to_node else None
        last_observed: datetime | None = node_created if not is_prior_to_node else None
        confidence: float | None = None
        source: str = "initial_topology" if not is_prior_to_node else "unknown"
        last_provenance: StateProvenance | None = None

        total_records = len(hist_records) + len(obs_records)

        # Replay observations chronologically
        # Combine records with unified sorting key: (timestamp, sequence_type, id)
        unified_events: list[dict[str, Any]] = []

        for h in hist_records:
            unified_events.append({
                "time": _as_utc(h.observed_at),
                "recorded_at": _as_utc(h.recorded_at),
                "id": str(h.id),
                "type": "history",
                "obj": h,
            })

        for o in obs_records:
            unified_events.append({
                "time": _as_utc(o.timestamp),
                "recorded_at": _as_utc(o.created_at),
                "id": str(o.id),
                "type": "observation",
                "obj": o,
            })


        # Deterministic sorting
        unified_events.sort(key=lambda x: (x["time"], x["recorded_at"], x["id"]))

        for item in unified_events:
            t = item["type"]
            rec = item["obj"]

            if t == "history":
                h: StateHistory = rec
                if h.state is not None:
                    curr_state = h.state
                if h.health is not None:
                    curr_health = h.health
                if h.capacity is not None:
                    curr_capacity = h.capacity
                if h.availability is not None:
                    curr_availability = h.availability
                confidence = h.confidence
                source = h.source
                last_observed = h.observed_at
                last_provenance = StateProvenance(
                    source=h.source,
                    source_type="observation" if h.observation_id else ("event" if h.event_id else "reconstruction"),
                    observation_id=h.observation_id,
                    event_id=h.event_id,
                    observed_at=h.observed_at,
                    recorded_at=h.recorded_at,
                    details=h.provenance_metadata,
                )

            elif t == "observation":
                o: Observation = rec
                # Only supported metrics update canonical state
                if o.metric == "health" and o.value_numeric is not None:
                    curr_health = o.value_numeric
                    if curr_health <= 0.1:
                        curr_state = NodeState.FAILED
                    elif curr_health < 0.5:
                        curr_state = NodeState.DEGRADED
                elif o.metric == "capacity" and o.value_numeric is not None:
                    curr_capacity = o.value_numeric
                elif o.metric == "state" and o.value_text is not None:
                    curr_state = o.value_text.upper()

                confidence = o.confidence
                source = o.source
                last_observed = o.timestamp
                last_provenance = StateProvenance(
                    source=o.source,
                    source_type="observation",
                    observation_id=o.id,
                    event_id=o.event_id,
                    observed_at=o.timestamp,
                    recorded_at=o.created_at,
                )

        if not last_provenance and not is_prior_to_node:
            last_provenance = StateProvenance(
                source="initial_topology",
                source_type="initialization",
                observed_at=node.created_at,
                recorded_at=node.created_at,
            )

        # Consistency check on reconstructed values
        issues = StateConsistencyService.validate_node(
            node_id=node.id,
            node_name=node.name,
            state=curr_state if not is_prior_to_node else None,
            health=curr_health,
            capacity=curr_capacity,
        )
        c_status = StateConsistencyStatus.VALID
        if any(i.severity == StateConsistencyStatus.INVALID for i in issues):
            c_status = StateConsistencyStatus.INVALID
        elif any(i.severity == StateConsistencyStatus.WARNING for i in issues):
            c_status = StateConsistencyStatus.WARNING
        elif any(i.severity == StateConsistencyStatus.UNKNOWN for i in issues) or is_prior_to_node:
            c_status = StateConsistencyStatus.UNKNOWN

        detail = NodeStateDetail(
            node_id=node.id,
            graph_id=graph_id,
            node_name=node.name,
            node_type=node.type,
            state=curr_state,
            health=curr_health,
            capacity=curr_capacity,
            availability=curr_availability,
            criticality=node.criticality,
            last_observed_at=last_observed,
            last_state_change_at=last_observed,
            confidence=confidence,
            source=source,
            consistency_status=c_status,
            is_known=not is_prior_to_node,
            provenance=last_provenance,
        )

        return detail, total_records
