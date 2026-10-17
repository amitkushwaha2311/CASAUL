"""
CAUSAL API — Phase 3 Event & Observation REST API + WebSocket stream.

Events describe WHAT is happening in the infrastructure.
They do NOT determine WHY it is happening (that is Phase 5 — Causal Engine).

Endpoints:
    Events:
        POST   /graphs/{graph_id}/events
        GET    /graphs/{graph_id}/events
        GET    /graphs/{graph_id}/events/{event_id}
        PATCH  /graphs/{graph_id}/events/{event_id}
        DELETE /graphs/{graph_id}/events/{event_id}
        GET    /graphs/{graph_id}/event-statistics
        GET    /graphs/{graph_id}/timeline

    Observations:
        POST   /graphs/{graph_id}/observations
        GET    /graphs/{graph_id}/observations
        GET    /graphs/{graph_id}/observations/{observation_id}
        PATCH  /graphs/{graph_id}/observations/{observation_id}
        DELETE /graphs/{graph_id}/observations/{observation_id}

    Node history:
        GET    /graphs/{graph_id}/nodes/{node_id}/events
        GET    /graphs/{graph_id}/nodes/{node_id}/observations

    WebSocket:
        WS     /ws/graphs/{graph_id}/events
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.event import (
    EventCreate, EventUpdate, EventResponse, EventStatisticsResponse,
    ObservationCreate, ObservationUpdate, ObservationResponse,
)
from app.services.event_service import EventService, ObservationService, connection_manager

router = APIRouter(tags=["events"])
ws_router = APIRouter(tags=["websocket"])


# ── Event CRUD ─────────────────────────────────────────────────────────────

@router.post(
    "/graphs/{graph_id}/events",
    response_model=EventResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an event",
)
async def create_event(
    graph_id: uuid.UUID,
    data: EventCreate,
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    svc = EventService(db)
    event = await svc.create(graph_id, data)
    return EventResponse.model_validate(event, from_attributes=True)


@router.get(
    "/graphs/{graph_id}/events",
    response_model=list[EventResponse],
    summary="List events in a graph",
)
async def list_events(
    graph_id: uuid.UUID,
    node_id: uuid.UUID | None = Query(default=None),
    event_type: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    event_status: str | None = Query(default=None, alias="status"),
    source: str | None = Query(default=None),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> list[EventResponse]:
    svc = EventService(db)
    events = await svc.list_events(
        graph_id,
        node_id=node_id,
        event_type=event_type,
        severity=severity,
        status=event_status,
        source=source,
        start_time=start_time,
        end_time=end_time,
        page=page,
        page_size=page_size,
    )
    return [EventResponse.model_validate(e, from_attributes=True) for e in events]


@router.get(
    "/graphs/{graph_id}/events/{event_id}",
    response_model=EventResponse,
    summary="Get a single event",
)
async def get_event(
    graph_id: uuid.UUID,
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    svc = EventService(db)
    event = await svc.get(graph_id, event_id)
    return EventResponse.model_validate(event, from_attributes=True)


@router.patch(
    "/graphs/{graph_id}/events/{event_id}",
    response_model=EventResponse,
    summary="Update an event (status, severity, etc.)",
)
async def update_event(
    graph_id: uuid.UUID,
    event_id: uuid.UUID,
    data: EventUpdate,
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    svc = EventService(db)
    event = await svc.update(graph_id, event_id, data)
    return EventResponse.model_validate(event, from_attributes=True)


@router.delete(
    "/graphs/{graph_id}/events/{event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
    summary="Delete an event",
)
async def delete_event(
    graph_id: uuid.UUID,
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    svc = EventService(db)
    await svc.delete(graph_id, event_id)


# ── Event statistics & timeline ────────────────────────────────────────────

@router.get(
    "/graphs/{graph_id}/event-statistics",
    response_model=EventStatisticsResponse,
    summary="Get event statistics for a graph",
)
async def get_event_statistics(
    graph_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> EventStatisticsResponse:
    svc = EventService(db)
    stats = await svc.get_statistics(graph_id)
    return EventStatisticsResponse(**stats)


@router.get(
    "/graphs/{graph_id}/timeline",
    response_model=list[EventResponse],
    summary="Get chronological event timeline",
    description="Returns events in chronological order (oldest first). Use for historical analysis.",
)
async def get_timeline(
    graph_id: uuid.UUID,
    node_id: uuid.UUID | None = Query(default=None),
    severity: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> list[EventResponse]:
    svc = EventService(db)
    events = await svc.get_timeline(
        graph_id,
        node_id=node_id,
        severity=severity,
        event_type=event_type,
        start_time=start_time,
        end_time=end_time,
        page=page,
        page_size=page_size,
    )
    return [EventResponse.model_validate(e, from_attributes=True) for e in events]


# ── Observation CRUD ───────────────────────────────────────────────────────

@router.post(
    "/graphs/{graph_id}/observations",
    response_model=ObservationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an observation",
)
async def create_observation(
    graph_id: uuid.UUID,
    data: ObservationCreate,
    db: AsyncSession = Depends(get_db),
) -> ObservationResponse:
    svc = ObservationService(db)
    obs = await svc.create(graph_id, data)
    return ObservationResponse.model_validate(obs, from_attributes=True)


@router.get(
    "/graphs/{graph_id}/observations",
    response_model=list[ObservationResponse],
    summary="List observations in a graph",
)
async def list_observations(
    graph_id: uuid.UUID,
    node_id: uuid.UUID | None = Query(default=None),
    event_id: uuid.UUID | None = Query(default=None),
    observation_type: str | None = Query(default=None),
    metric: str | None = Query(default=None),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> list[ObservationResponse]:
    svc = ObservationService(db)
    obs_list = await svc.list_observations(
        graph_id,
        node_id=node_id,
        event_id=event_id,
        observation_type=observation_type,
        metric=metric,
        start_time=start_time,
        end_time=end_time,
        page=page,
        page_size=page_size,
    )
    return [ObservationResponse.model_validate(o, from_attributes=True) for o in obs_list]


@router.get(
    "/graphs/{graph_id}/observations/{observation_id}",
    response_model=ObservationResponse,
    summary="Get a single observation",
)
async def get_observation(
    graph_id: uuid.UUID,
    observation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> ObservationResponse:
    svc = ObservationService(db)
    obs = await svc.get(graph_id, observation_id)
    return ObservationResponse.model_validate(obs, from_attributes=True)


@router.patch(
    "/graphs/{graph_id}/observations/{observation_id}",
    response_model=ObservationResponse,
    summary="Update an observation",
)
async def update_observation(
    graph_id: uuid.UUID,
    observation_id: uuid.UUID,
    data: ObservationUpdate,
    db: AsyncSession = Depends(get_db),
) -> ObservationResponse:
    svc = ObservationService(db)
    obs = await svc.update(graph_id, observation_id, data)
    return ObservationResponse.model_validate(obs, from_attributes=True)


@router.delete(
    "/graphs/{graph_id}/observations/{observation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
    summary="Delete an observation",
)
async def delete_observation(
    graph_id: uuid.UUID,
    observation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    svc = ObservationService(db)
    await svc.delete(graph_id, observation_id)


# ── Node event/observation history ─────────────────────────────────────────

@router.get(
    "/graphs/{graph_id}/nodes/{node_id}/events",
    response_model=list[EventResponse],
    summary="Get event history for a node",
    description="Returns events that have at least one observation associated with this node.",
)
async def node_event_history(
    graph_id: uuid.UUID,
    node_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> list[EventResponse]:
    svc = EventService(db)
    events = await svc.list_events(
        graph_id, node_id=node_id, page=page, page_size=page_size
    )
    return [EventResponse.model_validate(e, from_attributes=True) for e in events]


@router.get(
    "/graphs/{graph_id}/nodes/{node_id}/observations",
    response_model=list[ObservationResponse],
    summary="Get observation history for a node",
)
async def node_observation_history(
    graph_id: uuid.UUID,
    node_id: uuid.UUID,
    metric: str | None = Query(default=None),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> list[ObservationResponse]:
    svc = ObservationService(db)
    obs_list = await svc.list_observations(
        graph_id,
        node_id=node_id,
        metric=metric,
        start_time=start_time,
        end_time=end_time,
        page=page,
        page_size=page_size,
    )
    return [ObservationResponse.model_validate(o, from_attributes=True) for o in obs_list]


# ── WebSocket stream ───────────────────────────────────────────────────────

@ws_router.websocket("/ws/graphs/{graph_id}/events")
async def websocket_event_stream(
    websocket: WebSocket,
    graph_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    WebSocket endpoint for real-time event stream.

    Clients subscribe by connecting to this endpoint.
    When any event is created for graph_id, a notification is broadcast.

    Message format:
        {
            "type": "event.created",
            "graph_id": "...",
            "event_id": "...",
            "timestamp": "...",
            "severity": "HIGH",
            "event_type": "degradation"
        }

    NOTE: This is single-process only.
    Distributed broadcasting requires Redis pub/sub or similar (future concern).
    """
    from sqlalchemy import select
    from app.models.graph_models import InfrastructureGraph

    graph_id_str = str(graph_id)

    # Validate the graph exists
    result = await db.execute(
        select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id)
    )
    graph = result.scalar_one_or_none()
    if not graph:
        await websocket.close(code=4004)
        return

    await connection_manager.connect(graph_id_str, websocket)

    try:
        # Send a connected acknowledgment
        await websocket.send_text(json.dumps({
            "type": "connected",
            "graph_id": graph_id_str,
        }))

        # Keep alive — listen for client messages (ping/close)
        while True:
            try:
                msg = await websocket.receive_text()
                # Echo pings back
                data = json.loads(msg)
                if data.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    finally:
        connection_manager.disconnect(graph_id_str, websocket)
