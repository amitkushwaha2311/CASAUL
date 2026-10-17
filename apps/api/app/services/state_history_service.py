"""
CAUSAL API — State History Service (Phase 4).

Provides append-only persistence and query capabilities for validated node state changes.
Maintains auditable provenance linking to events and observations.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Sequence

from fastapi import HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event_models import Event, Observation
from app.models.graph_models import InfrastructureGraph, Node
from app.models.state_models import StateHistory
from app.schemas.state import StateHistoryResponse


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class StateHistoryService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def record_entry(
        self,
        graph_id: uuid.UUID,
        node_id: uuid.UUID,
        source: str,
        observed_at: datetime,
        *,
        state: str | None = None,
        health: float | None = None,
        capacity: float | None = None,
        availability: float | None = None,
        metric: str | None = None,
        value_numeric: float | None = None,
        value_text: str | None = None,
        confidence: float | None = None,
        event_id: uuid.UUID | None = None,
        observation_id: uuid.UUID | None = None,
        change_reason: str | None = None,
        provenance_metadata: dict[str, Any] | None = None,
    ) -> StateHistory:
        """
        Append a new validated entry to state history.
        Enforces UTC timestamps and valid confidence [0.0, 1.0].
        """
        if observed_at.tzinfo is None:
            observed_at = observed_at.replace(tzinfo=timezone.utc)

        if confidence is not None:
            if not (0.0 <= confidence <= 1.0):
                raise HTTPException(
                    status_code=422,
                    detail="confidence must be between 0.0 and 1.0",
                )

        history_entry = StateHistory(
            graph_id=graph_id,
            node_id=node_id,
            event_id=event_id,
            observation_id=observation_id,
            state=state,
            health=health,
            capacity=capacity,
            availability=availability,
            metric=metric,
            value_numeric=value_numeric,
            value_text=value_text,
            confidence=confidence,
            source=source,
            change_reason=change_reason,
            observed_at=observed_at,
            recorded_at=_utc_now(),
            provenance_metadata=provenance_metadata,
        )
        self.db.add(history_entry)
        await self.db.flush()
        return history_entry

    async def list_node_history(
        self,
        graph_id: uuid.UUID,
        node_id: uuid.UUID,
        *,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> list[StateHistory]:
        # Validate node belongs to graph
        result = await self.db.execute(
            select(Node).where(Node.id == node_id, Node.graph_id == graph_id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=404,
                detail=f"Node {node_id} not found in graph {graph_id}",
            )

        q = select(StateHistory).where(
            StateHistory.graph_id == graph_id,
            StateHistory.node_id == node_id,
        )

        if start_time:
            q = q.where(StateHistory.observed_at >= start_time)
        if end_time:
            q = q.where(StateHistory.observed_at <= end_time)

        q = q.order_by(desc(StateHistory.observed_at), desc(StateHistory.id))
        offset = (page - 1) * page_size
        q = q.offset(offset).limit(page_size)

        res = await self.db.execute(q)
        return list(res.scalars().all())

    async def list_graph_history(
        self,
        graph_id: uuid.UUID,
        *,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> list[StateHistory]:
        # Validate graph
        result = await self.db.execute(
            select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=404,
                detail=f"Graph {graph_id} not found",
            )

        q = select(StateHistory).where(StateHistory.graph_id == graph_id)

        if start_time:
            q = q.where(StateHistory.observed_at >= start_time)
        if end_time:
            q = q.where(StateHistory.observed_at <= end_time)

        q = q.order_by(desc(StateHistory.observed_at), desc(StateHistory.id))
        offset = (page - 1) * page_size
        q = q.offset(offset).limit(page_size)

        res = await self.db.execute(q)
        return list(res.scalars().all())
