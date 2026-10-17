"""
CAUSAL API — Event & Observation services (Phase 3).

EventService: CRUD + filtering + statistics for Events.
ObservationService: CRUD + filtering + optional node-state updates for Observations.

CRITICAL: No causal inference here.
Events/Observations describe WHAT happened.
WHY is Phase 5 (Causal Engine).
"""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.graph_models import InfrastructureGraph, Node
from app.models.event_models import Event, EventSeverity, EventStatus, Observation
from app.schemas.event import (
    EventCreate, EventUpdate, ObservationCreate, ObservationUpdate,
    VALID_TRANSITIONS, STATE_UPDATE_METRICS,
)
from app.services.graph_service import NodeStateService
from app.schemas.graph import NodeStateUpdate


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def _require_graph(db: AsyncSession, graph_id: uuid.UUID) -> InfrastructureGraph:
    result = await db.execute(
        select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id)
    )
    graph = result.scalar_one_or_none()
    if not graph:
        raise HTTPException(status_code=404, detail=f"Graph {graph_id} not found")
    return graph


async def _require_node(
    db: AsyncSession, graph_id: uuid.UUID, node_id: uuid.UUID
) -> Node:
    result = await db.execute(
        select(Node).where(Node.id == node_id, Node.graph_id == graph_id)
    )
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(
            status_code=404,
            detail=f"Node {node_id} not found in graph {graph_id}",
        )
    return node


# ── WebSocket connection manager ────────────────────────────────────────────

class ConnectionManager:
    """
    In-process WebSocket connection manager.

    Graph clients subscribe to a specific graph_id.
    When an event is created, all subscribers for that graph are notified.

    NOTE: This is single-process only.
    Distributed broadcasting (e.g. Redis pub/sub) is a future infrastructure concern.
    """

    def __init__(self) -> None:
        # graph_id → list of WebSocket connections
        self._subscriptions: dict[str, list[Any]] = {}

    async def connect(self, graph_id: str, websocket: Any) -> None:
        await websocket.accept()
        self._subscriptions.setdefault(graph_id, []).append(websocket)

    def disconnect(self, graph_id: str, websocket: Any) -> None:
        subs = self._subscriptions.get(graph_id, [])
        if websocket in subs:
            subs.remove(websocket)

    async def broadcast(self, graph_id: str, message: dict[str, Any]) -> None:
        import json
        dead = []
        for ws in self._subscriptions.get(graph_id, []):
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(graph_id, ws)


# Singleton connection manager — shared across all requests in this process
connection_manager = ConnectionManager()


# ── EventService ───────────────────────────────────────────────────────────

class EventService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        graph_id: uuid.UUID,
        data: EventCreate,
        *,
        broadcast: bool = True,
    ) -> Event:
        await _require_graph(self.db, graph_id)

        # Ensure timestamp is UTC
        ts = data.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        event = Event(
            graph_id=graph_id,
            event_type=data.event_type,
            severity=data.severity,
            status=data.status,
            source=data.source,
            timestamp=ts,
            received_at=_utc_now(),
            description=data.description,
            confidence=data.confidence,
            evidence=data.evidence,
            metadata_=data.metadata_,
        )
        self.db.add(event)
        await self.db.commit()
        await self.db.refresh(event)

        if broadcast:
            await connection_manager.broadcast(
                str(graph_id),
                {
                    "type": "event.created",
                    "graph_id": str(graph_id),
                    "event_id": str(event.id),
                    "timestamp": event.timestamp.isoformat(),
                    "severity": event.severity,
                    "event_type": event.event_type,
                },
            )
        return event

    async def get(self, graph_id: uuid.UUID, event_id: uuid.UUID) -> Event:
        result = await self.db.execute(
            select(Event).where(Event.id == event_id, Event.graph_id == graph_id)
        )
        event = result.scalar_one_or_none()
        if not event:
            raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
        return event

    async def list_events(
        self,
        graph_id: uuid.UUID,
        *,
        node_id: uuid.UUID | None = None,
        event_type: str | None = None,
        severity: str | None = None,
        status: str | None = None,
        source: str | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> list[Event]:
        await _require_graph(self.db, graph_id)

        q = select(Event).where(Event.graph_id == graph_id)

        if node_id is not None:
            # Filter events that have at least one observation on this node
            obs_subq = select(Observation.event_id).where(
                Observation.node_id == node_id,
                Observation.graph_id == graph_id,
                Observation.event_id.is_not(None),
            )
            q = q.where(Event.id.in_(obs_subq))
        if event_type:
            q = q.where(Event.event_type == event_type)
        if severity:
            q = q.where(Event.severity == severity.upper())
        if status:
            q = q.where(Event.status == status.upper())
        if source:
            q = q.where(Event.source == source)
        if start_time:
            q = q.where(Event.timestamp >= start_time)
        if end_time:
            q = q.where(Event.timestamp <= end_time)

        # Deterministic ordering: newest first, tie-break by id
        q = q.order_by(Event.timestamp.desc(), Event.id.desc())

        offset = (page - 1) * page_size
        q = q.offset(offset).limit(page_size)

        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def update(
        self, graph_id: uuid.UUID, event_id: uuid.UUID, data: EventUpdate
    ) -> Event:
        event = await self.get(graph_id, event_id)

        if data.status is not None:
            current = event.status
            new_status = data.status
            allowed = VALID_TRANSITIONS.get(current, set())
            if new_status != current and new_status not in allowed:
                raise HTTPException(
                    status_code=422,
                    detail=f"Invalid transition {current} → {new_status}. Allowed: {allowed or 'none (terminal)'}",
                )
            event.status = new_status

        if data.severity is not None:
            event.severity = data.severity
        if data.description is not None:
            event.description = data.description
        if data.confidence is not None:
            event.confidence = data.confidence
        if data.evidence is not None:
            event.evidence = data.evidence
        if data.metadata_ is not None:
            event.metadata_ = data.metadata_

        await self.db.commit()
        await self.db.refresh(event)
        return event

    async def delete(self, graph_id: uuid.UUID, event_id: uuid.UUID) -> None:
        event = await self.get(graph_id, event_id)
        await self.db.delete(event)
        await self.db.commit()

    async def get_statistics(self, graph_id: uuid.UUID) -> dict[str, Any]:
        await _require_graph(self.db, graph_id)

        events_result = await self.db.execute(
            select(Event).where(Event.graph_id == graph_id)
        )
        events = list(events_result.scalars().all())

        obs_count_result = await self.db.execute(
            select(func.count(Observation.id)).where(Observation.graph_id == graph_id)
        )
        obs_count = obs_count_result.scalar_one() or 0

        severity_counts = Counter(e.severity for e in events)
        type_counts = Counter(e.event_type for e in events)

        return {
            "total_events": len(events),
            "open_events": sum(1 for e in events if e.status == "OPEN"),
            "acknowledged_events": sum(1 for e in events if e.status == "ACKNOWLEDGED"),
            "resolved_events": sum(1 for e in events if e.status == "RESOLVED"),
            "dismissed_events": sum(1 for e in events if e.status == "DISMISSED"),
            "count_by_severity": dict(severity_counts),
            "count_by_type": dict(type_counts),
            "observation_count": obs_count,
        }

    async def get_timeline(
        self,
        graph_id: uuid.UUID,
        *,
        node_id: uuid.UUID | None = None,
        severity: str | None = None,
        event_type: str | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> list[Event]:
        """Timeline = events sorted oldest-first (chronological)."""
        await _require_graph(self.db, graph_id)

        q = select(Event).where(Event.graph_id == graph_id)

        if node_id:
            obs_subq = select(Observation.event_id).where(
                Observation.node_id == node_id,
                Observation.graph_id == graph_id,
                Observation.event_id.is_not(None),
            )
            q = q.where(Event.id.in_(obs_subq))
        if severity:
            q = q.where(Event.severity == severity.upper())
        if event_type:
            q = q.where(Event.event_type == event_type)
        if start_time:
            q = q.where(Event.timestamp >= start_time)
        if end_time:
            q = q.where(Event.timestamp <= end_time)

        # Timeline: oldest first, tie-break by id for determinism
        q = q.order_by(Event.timestamp.asc(), Event.id.asc())

        offset = (page - 1) * page_size
        q = q.offset(offset).limit(page_size)

        result = await self.db.execute(q)
        return list(result.scalars().all())


# ── ObservationService ─────────────────────────────────────────────────────

class ObservationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        graph_id: uuid.UUID,
        data: ObservationCreate,
    ) -> Observation:
        await _require_graph(self.db, graph_id)

        # Validate node belongs to graph
        if data.node_id is not None:
            await _require_node(self.db, graph_id, data.node_id)

        # Validate event belongs to graph
        if data.event_id is not None:
            result = await self.db.execute(
                select(Event).where(Event.id == data.event_id, Event.graph_id == graph_id)
            )
            if not result.scalar_one_or_none():
                raise HTTPException(
                    status_code=404,
                    detail=f"Event {data.event_id} not found in graph {graph_id}",
                )

        ts = data.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        obs = Observation(
            graph_id=graph_id,
            node_id=data.node_id,
            event_id=data.event_id,
            observation_type=data.observation_type,
            metric=data.metric,
            value_numeric=data.value_numeric,
            value_text=data.value_text,
            value_boolean=data.value_boolean,
            value_json=data.value_json,
            unit=data.unit,
            confidence=data.confidence,
            timestamp=ts,
            source=data.source,
            metadata_=data.metadata_,
        )
        self.db.add(obs)

        # Explicit node state update for designated metrics only, BEFORE commit.
        # RULE: Only "health", "capacity", or "state" metrics on numeric/text
        # observations cause a direct node state update.
        # Unrelated metrics (temperature, voltage, pressure, ...) NEVER
        # silently modify node state — this keeps Phase 3 deterministic.
        if data.node_id is not None and data.metric in STATE_UPDATE_METRICS:
            await self._apply_node_state_update(graph_id, data)

        await self.db.commit()
        await self.db.refresh(obs)
        return obs

    async def _apply_node_state_update(
        self, graph_id: uuid.UUID, data: ObservationCreate
    ) -> None:
        """
        Explicit, rule-based node state update from observation.
        Only called for metrics in STATE_UPDATE_METRICS.
        No causal inference performed here.

        If the update violates consistency rules (e.g. health < 0.5 but state is NORMAL),
        the node state is also adjusted to DEGRADED to remain consistent.
        """
        update_kwargs: dict[str, Any] = {}

        if data.metric == "health" and data.value_numeric is not None:
            update_kwargs["health"] = data.value_numeric
            # Auto-adjust state for consistency when health is low
            h = data.value_numeric
            if h <= 0.1:
                update_kwargs["state"] = "FAILED"
            elif h < 0.5:
                update_kwargs["state"] = "DEGRADED"
        elif data.metric == "capacity" and data.value_numeric is not None:
            update_kwargs["capacity"] = data.value_numeric
        elif data.metric == "state" and data.value_text is not None:
            update_kwargs["state"] = data.value_text.upper()

        if update_kwargs and data.node_id:
            from app.schemas.graph import NodeStateUpdate
            from app.models.state_models import StateHistory
            svc = NodeStateService(self.db)
            try:
                updated_node = await svc.update_state(graph_id, data.node_id, NodeStateUpdate(**update_kwargs))
                # Also append to StateHistory for Phase 4 Digital Twin provenance
                hist_entry = StateHistory(
                    graph_id=graph_id,
                    node_id=data.node_id,
                    event_id=data.event_id,
                    observation_id=None,  # obs not yet committed; linked via timestamp and node
                    state=updated_node.state,
                    health=updated_node.health,
                    capacity=updated_node.capacity,
                    availability=updated_node.capacity,
                    metric=data.metric,
                    value_numeric=data.value_numeric,
                    value_text=data.value_text,
                    confidence=data.confidence,
                    source=data.source,
                    change_reason=f"observation_update:{data.metric}",
                    observed_at=data.timestamp if data.timestamp.tzinfo else data.timestamp.replace(tzinfo=timezone.utc),
                    recorded_at=_utc_now(),
                    provenance_metadata={"observation_metric": data.metric, "source": data.source},
                )
                self.db.add(hist_entry)
            except Exception:
                # If state update fails validation, skip silently
                # (do not corrupt the observation record)
                pass


    async def get(
        self, graph_id: uuid.UUID, observation_id: uuid.UUID
    ) -> Observation:
        result = await self.db.execute(
            select(Observation).where(
                Observation.id == observation_id, Observation.graph_id == graph_id
            )
        )
        obs = result.scalar_one_or_none()
        if not obs:
            raise HTTPException(
                status_code=404, detail=f"Observation {observation_id} not found"
            )
        return obs

    async def list_observations(
        self,
        graph_id: uuid.UUID,
        *,
        node_id: uuid.UUID | None = None,
        event_id: uuid.UUID | None = None,
        observation_type: str | None = None,
        metric: str | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> list[Observation]:
        await _require_graph(self.db, graph_id)
        q = select(Observation).where(Observation.graph_id == graph_id)

        if node_id:
            q = q.where(Observation.node_id == node_id)
        if event_id:
            q = q.where(Observation.event_id == event_id)
        if observation_type:
            q = q.where(Observation.observation_type == observation_type)
        if metric:
            q = q.where(Observation.metric == metric)
        if start_time:
            q = q.where(Observation.timestamp >= start_time)
        if end_time:
            q = q.where(Observation.timestamp <= end_time)

        q = q.order_by(Observation.timestamp.desc(), Observation.id.desc())
        offset = (page - 1) * page_size
        q = q.offset(offset).limit(page_size)

        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def update(
        self,
        graph_id: uuid.UUID,
        observation_id: uuid.UUID,
        data: ObservationUpdate,
    ) -> Observation:
        obs = await self.get(graph_id, observation_id)
        if data.confidence is not None:
            obs.confidence = data.confidence
        if data.metadata_ is not None:
            obs.metadata_ = data.metadata_
        await self.db.commit()
        await self.db.refresh(obs)
        return obs

    async def delete(self, graph_id: uuid.UUID, observation_id: uuid.UUID) -> None:
        obs = await self.get(graph_id, observation_id)
        await self.db.delete(obs)
        await self.db.commit()
