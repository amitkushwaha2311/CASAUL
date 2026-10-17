"""
CAUSAL API — Phase 7 REST endpoints for Counterfactual Simulation Engine.

Endpoints:
  POST /api/v1/graphs/{graph_id}/counterfactuals
  GET  /api/v1/graphs/{graph_id}/counterfactuals
  GET  /api/v1/graphs/{graph_id}/counterfactuals/{experiment_id}
  POST /api/v1/graphs/{graph_id}/counterfactuals/{experiment_id}/run
  GET  /api/v1/graphs/{graph_id}/counterfactuals/{experiment_id}/results
  GET  /api/v1/graphs/{graph_id}/counterfactuals/{experiment_id}/comparison
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.graph_models import InfrastructureGraph
from app.schemas.counterfactual import (
    CounterfactualComparisonResponse,
    CounterfactualExperimentCreate,
    CounterfactualExperimentListResponse,
    CounterfactualExperimentResponse,
    CounterfactualRunResultResponse,
)
from app.services.counterfactual_engine_service import CounterfactualEngineService

router = APIRouter(tags=["counterfactuals"])


async def _verify_graph_exists(graph_id: uuid.UUID, db: AsyncSession) -> None:
    res = await db.execute(select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id))
    if not res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Graph {graph_id} not found",
        )


@router.post(
    "/graphs/{graph_id}/counterfactuals",
    response_model=CounterfactualExperimentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Define a counterfactual experiment",
    description="Registers an auditable experiment specifying a baseline and explicit hypothetical changes.",
)
async def create_counterfactual_experiment(
    graph_id: uuid.UUID,
    request: CounterfactualExperimentCreate,
    db: AsyncSession = Depends(get_db),
) -> CounterfactualExperimentResponse:
    await _verify_graph_exists(graph_id, db)
    service = CounterfactualEngineService(db)
    try:
        return await service.create_experiment(graph_id, request)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/graphs/{graph_id}/counterfactuals",
    response_model=CounterfactualExperimentListResponse,
    status_code=status.HTTP_200_OK,
    summary="List counterfactual experiments",
    description="Lists persisted counterfactual experiment runs for the given graph with pagination.",
)
async def list_counterfactual_experiments(
    graph_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
) -> CounterfactualExperimentListResponse:
    await _verify_graph_exists(graph_id, db)
    service = CounterfactualEngineService(db)
    return await service.list_experiments(
        graph_id=graph_id, page=page, page_size=page_size, status=status_filter
    )


@router.get(
    "/graphs/{graph_id}/counterfactuals/{experiment_id}",
    response_model=CounterfactualExperimentResponse,
    status_code=status.HTTP_200_OK,
    summary="Get counterfactual experiment definition",
    description="Retrieves experiment configuration, status, and applied hypothetical changes.",
)
async def get_counterfactual_experiment(
    graph_id: uuid.UUID,
    experiment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> CounterfactualExperimentResponse:
    await _verify_graph_exists(graph_id, db)
    service = CounterfactualEngineService(db)
    try:
        return await service.get_experiment(graph_id, experiment_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post(
    "/graphs/{graph_id}/counterfactuals/{experiment_id}/run",
    response_model=CounterfactualRunResultResponse,
    status_code=status.HTTP_200_OK,
    summary="Execute paired counterfactual simulation",
    description=(
        "Executes Branch A (Baseline) and Branch B (Counterfactual) through the Phase 6 forecast engine "
        "and computes differential outcome metrics."
    ),
)
async def run_counterfactual_experiment(
    graph_id: uuid.UUID,
    experiment_id: uuid.UUID,
    force: bool = Query(default=False, description="Force re-run even if already completed"),
    db: AsyncSession = Depends(get_db),
) -> CounterfactualRunResultResponse:
    await _verify_graph_exists(graph_id, db)
    service = CounterfactualEngineService(db)
    try:
        return await service.run_experiment(graph_id, experiment_id, force=force)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Counterfactual simulation failed: {str(e)}",
        )


@router.get(
    "/graphs/{graph_id}/counterfactuals/{experiment_id}/comparison",
    response_model=CounterfactualComparisonResponse,
    status_code=status.HTTP_200_OK,
    summary="Get differential outcome comparison",
    description="Returns detailed differences between baseline and counterfactual branches.",
)
async def get_counterfactual_comparison(
    graph_id: uuid.UUID,
    experiment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> CounterfactualComparisonResponse:
    await _verify_graph_exists(graph_id, db)
    service = CounterfactualEngineService(db)
    try:
        return await service.get_comparison(graph_id, experiment_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get(
    "/graphs/{graph_id}/counterfactuals/{experiment_id}/results",
    response_model=CounterfactualRunResultResponse,
    status_code=status.HTTP_200_OK,
    summary="Get complete counterfactual results",
    description="Returns the experiment definition, both forecast runs, and differential comparison.",
)
async def get_counterfactual_results(
    graph_id: uuid.UUID,
    experiment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> CounterfactualRunResultResponse:
    await _verify_graph_exists(graph_id, db)
    service = CounterfactualEngineService(db)
    try:
        return await service.get_results(graph_id, experiment_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
