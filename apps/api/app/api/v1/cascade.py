"""
CAUSAL API — Phase 6 REST endpoints for Cascade Prediction Engine.

Endpoints:
  POST /api/v1/graphs/{graph_id}/forecasts/cascade
  GET  /api/v1/graphs/{graph_id}/forecasts
  GET  /api/v1/graphs/{graph_id}/forecasts/{forecast_id}
  GET  /api/v1/graphs/{graph_id}/forecasts/{forecast_id}/timeline
  GET  /api/v1/graphs/{graph_id}/forecasts/{forecast_id}/impact
  GET  /api/v1/graphs/{graph_id}/nodes/{node_id}/forecasts
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.graph_models import InfrastructureGraph, Node
from app.schemas.cascade import (
    CascadeForecastListItem,
    CascadeForecastListResponse,
    CascadeForecastRequest,
    CascadeForecastResponse,
    CascadeImpactSummary,
    CascadeTimelineResponse,
)
from app.services.cascade_engine_service import CascadePredictionEngine

router = APIRouter(tags=["forecasts"])


async def _verify_graph_exists(graph_id: uuid.UUID, db: AsyncSession) -> None:
    res = await db.execute(select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id))
    if not res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Graph {graph_id} not found",
        )


async def _verify_node_exists(graph_id: uuid.UUID, node_id: uuid.UUID, db: AsyncSession) -> None:
    res = await db.execute(select(Node).where(Node.id == node_id, Node.graph_id == graph_id))
    if not res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node {node_id} not found in graph {graph_id}",
        )


@router.post(
    "/graphs/{graph_id}/forecasts/cascade",
    response_model=CascadeForecastResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Execute time-aware cascade forecast simulation",
    description="Simulates downstream failure propagation across infrastructure dependency edges with explicit uncertainty bounds.",
)
async def run_cascade_forecast(
    graph_id: uuid.UUID,
    request: CascadeForecastRequest,
    db: AsyncSession = Depends(get_db),
) -> CascadeForecastResponse:
    await _verify_graph_exists(graph_id, db)
    if request.initiating_node_id:
        await _verify_node_exists(graph_id, request.initiating_node_id, db)

    engine = CascadePredictionEngine(db)
    try:
        return await engine.run_forecast(graph_id, request)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/graphs/{graph_id}/forecasts",
    response_model=CascadeForecastListResponse,
    status_code=status.HTTP_200_OK,
    summary="List historical cascade forecasts",
    description="Retrieves paginated historical cascade forecast runs for a specific infrastructure graph.",
)
async def list_cascade_forecasts(
    graph_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> CascadeForecastListResponse:
    await _verify_graph_exists(graph_id, db)
    engine = CascadePredictionEngine(db)
    return await engine.list_forecasts(graph_id, page=page, page_size=page_size)


@router.get(
    "/graphs/{graph_id}/forecasts/{forecast_id}",
    response_model=CascadeForecastResponse,
    status_code=status.HTTP_200_OK,
    summary="Get cascade forecast details",
    description="Retrieves complete results of a historical cascade forecast run by forecast ID.",
)
async def get_cascade_forecast(
    graph_id: uuid.UUID,
    forecast_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> CascadeForecastResponse:
    await _verify_graph_exists(graph_id, db)
    engine = CascadePredictionEngine(db)
    try:
        return await engine.get_forecast_details(graph_id, forecast_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get(
    "/graphs/{graph_id}/forecasts/{forecast_id}/timeline",
    response_model=CascadeTimelineResponse,
    status_code=status.HTTP_200_OK,
    summary="Get cascade forecast event timeline",
    description="Retrieves a chronologically ordered projected timeline of failure events from the forecast simulation.",
)
async def get_cascade_forecast_timeline(
    graph_id: uuid.UUID,
    forecast_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> CascadeTimelineResponse:
    await _verify_graph_exists(graph_id, db)
    engine = CascadePredictionEngine(db)
    try:
        return await engine.get_forecast_timeline(graph_id, forecast_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get(
    "/graphs/{graph_id}/forecasts/{forecast_id}/impact",
    response_model=CascadeImpactSummary,
    status_code=status.HTTP_200_OK,
    summary="Get cascade forecast severity and impact summary",
    description="Retrieves aggregate consequence metrics, domain breakdowns, and critical at-risk nodes.",
)
async def get_cascade_forecast_impact(
    graph_id: uuid.UUID,
    forecast_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> CascadeImpactSummary:
    await _verify_graph_exists(graph_id, db)
    engine = CascadePredictionEngine(db)
    try:
        return await engine.get_forecast_impact(graph_id, forecast_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get(
    "/graphs/{graph_id}/nodes/{node_id}/forecasts",
    response_model=list[CascadeForecastListItem],
    status_code=status.HTTP_200_OK,
    summary="Get cascade forecasts involving a specific node",
    description="Lists past cascade forecast runs where the node was predicted or observed to be affected.",
)
async def get_node_cascade_forecasts(
    graph_id: uuid.UUID,
    node_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[CascadeForecastListItem]:
    await _verify_graph_exists(graph_id, db)
    await _verify_node_exists(graph_id, node_id, db)
    engine = CascadePredictionEngine(db)
    return await engine.get_node_forecasts(graph_id, node_id)
