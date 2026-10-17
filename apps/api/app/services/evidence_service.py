"""
CAUSAL API — Evidence Collection Service (Phase 5).

Gathers traceable, authentic evidence for causal hypothesis generation from:
- Phase 2 Infrastructure graph dependencies (directed upstream/downstream edges)
- Phase 3 Events (severity, status, source, confidence, timestamps)
- Phase 3 Observations (metric, numeric/text/boolean values, confidence, timestamps)
- Phase 4 State History (validated state transitions, recorded timestamps, confidence)

CRITICAL RULES:
- Every evidence item points to an authentic existing record ID.
- Never fabricates timestamps, confidence, sources, or provenance.
- Missing confidence remains None (unknown); never defaulted to 1.0.
- Respects graph direction: source -> target means target depends on source.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Sequence

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.causal_models import EvidenceDirection
from app.models.event_models import Event, Observation
from app.models.graph_models import Dependency, Node
from app.models.state_models import StateHistory


class EvidenceRecord:
    def __init__(
        self,
        evidence_type: str,
        direction: str,
        summary: str,
        source_record_type: str,
        source_record_id: uuid.UUID | None,
        related_node_id: uuid.UUID | None = None,
        event_id: uuid.UUID | None = None,
        observation_id: uuid.UUID | None = None,
        dependency_id: uuid.UUID | None = None,
        observed_at: datetime | None = None,
        source: str | None = None,
        confidence: float | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.evidence_type = evidence_type
        self.direction = direction
        self.summary = summary
        self.source_record_type = source_record_type
        self.source_record_id = source_record_id
        self.related_node_id = related_node_id
        self.event_id = event_id
        self.observation_id = observation_id
        self.dependency_id = dependency_id
        self.observed_at = observed_at
        self.source = source
        self.confidence = confidence
        self.details = details or {}


class EvidenceCollectionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_node_events(
        self, graph_id: uuid.UUID, node_id: uuid.UUID, limit: int = 10
    ) -> list[Event]:
        # Events linked directly or via observations
        q = (
            select(Event)
            .join(Observation, Observation.event_id == Event.id)
            .where(Event.graph_id == graph_id, Observation.node_id == node_id)
            .order_by(desc(Event.timestamp))
            .limit(limit)
        )
        return list((await self.db.execute(q)).scalars().all())

    async def get_node_observations(
        self, graph_id: uuid.UUID, node_id: uuid.UUID, limit: int = 20
    ) -> list[Observation]:
        q = (
            select(Observation)
            .where(Observation.graph_id == graph_id, Observation.node_id == node_id)
            .order_by(desc(Observation.timestamp))
            .limit(limit)
        )
        return list((await self.db.execute(q)).scalars().all())

    async def get_node_history(
        self, graph_id: uuid.UUID, node_id: uuid.UUID, limit: int = 20
    ) -> list[StateHistory]:
        q = (
            select(StateHistory)
            .where(StateHistory.graph_id == graph_id, StateHistory.node_id == node_id)
            .order_by(desc(StateHistory.observed_at))
            .limit(limit)
        )
        return list((await self.db.execute(q)).scalars().all())

    async def get_dependency_edge(
        self, graph_id: uuid.UUID, source_node_id: uuid.UUID, target_node_id: uuid.UUID
    ) -> Dependency | None:
        q = select(Dependency).where(
            Dependency.graph_id == graph_id,
            Dependency.source_node_id == source_node_id,
            Dependency.target_node_id == target_node_id,
        )
        return (await self.db.execute(q)).scalar_one_or_none()
