"""
CAUSAL API — Phase 8 REST endpoints for Safety-Constrained Intervention Recommendation Engine
(Phase 9: hardened with authentication and authorization).

Endpoints:
  POST /api/v1/graphs/{graph_id}/recommendations/runs            — ANALYST+
  GET  /api/v1/graphs/{graph_id}/recommendations/runs            — VIEWER+
  GET  /api/v1/graphs/{graph_id}/recommendations/runs/{run_id}   — VIEWER+
  POST /api/v1/graphs/{graph_id}/recommendations/runs/{run_id}/execute  — ANALYST+
  GET  /api/v1/graphs/{graph_id}/recommendations/runs/{run_id}/candidates — VIEWER+
  GET  .../candidates/{candidate_id}                             — VIEWER+
  POST .../candidates/{candidate_id}/decision                    — APPROVER+

Authorization changes (Phase 9):
  - All endpoints require authentication (Bearer JWT).
  - Read operations require VIEWER or above.
  - Simulation/run creation requires ANALYST or above.
  - Decision recording requires APPROVER or above.
  - decided_by is IGNORED from the request body; the server-side
    authenticated principal is used for all attribution.
  - Audit records are written for decision events.

Safety boundary: no endpoint modifies live operational state (nodes, dependencies, state_history,
events, or observations). All simulations are isolated from live infrastructure.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_analyst, require_approver, require_viewer
from app.db.session import get_db
from app.models.graph_models import InfrastructureGraph
from app.models.user import User
from app.schemas.recommendation import (
    CandidateDecisionRequest,
    CandidateInterventionListItem,
    CandidateInterventionResponse,
    RecommendationRunCreate,
    RecommendationRunListResponse,
    RecommendationRunResponse,
)
from app.services.audit_service import AuditService
from app.services.recommendation_engine_service import RecommendationEngineService

router = APIRouter(tags=["recommendations"])


def _cid(request: Request) -> str:
    return request.headers.get("X-Correlation-ID", str(uuid.uuid4()))


async def _verify_graph(graph_id: uuid.UUID, db: AsyncSession) -> None:
    res = await db.execute(
        select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id)
    )
    if not res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Graph {graph_id} not found",
        )


# ── Run lifecycle ─────────────────────────────────────────────────────────


@router.post(
    "/graphs/{graph_id}/recommendations/runs",
    response_model=RecommendationRunResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a recommendation run",
    description=(
        "Creates a new safety-constrained recommendation run scoped to the given graph. "
        "The run is PENDING until /execute is called. Requires ANALYST role."
    ),
)
async def create_recommendation_run(
    graph_id: uuid.UUID,
    request: RecommendationRunCreate,
    req: Request,
    current_user: User = Depends(require_analyst),
    db: AsyncSession = Depends(get_db),
) -> RecommendationRunResponse:
    await _verify_graph(graph_id, db)
    service = RecommendationEngineService(db)
    try:
        return await service.create_run(graph_id, request)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/graphs/{graph_id}/recommendations/runs",
    response_model=RecommendationRunListResponse,
    status_code=status.HTTP_200_OK,
    summary="List recommendation runs",
    description="Lists all recommendation runs for the given graph. Requires VIEWER role.",
)
async def list_recommendation_runs(
    graph_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    current_user: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> RecommendationRunListResponse:
    await _verify_graph(graph_id, db)
    service = RecommendationEngineService(db)
    return await service.list_runs(
        graph_id=graph_id, page=page, page_size=page_size, status=status_filter
    )


@router.get(
    "/graphs/{graph_id}/recommendations/runs/{run_id}",
    response_model=RecommendationRunResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a recommendation run",
    description="Retrieves a recommendation run with its candidates. Requires VIEWER role.",
)
async def get_recommendation_run(
    graph_id: uuid.UUID,
    run_id: uuid.UUID,
    current_user: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> RecommendationRunResponse:
    await _verify_graph(graph_id, db)
    service = RecommendationEngineService(db)
    try:
        return await service.get_run(graph_id, run_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post(
    "/graphs/{graph_id}/recommendations/runs/{run_id}/execute",
    response_model=RecommendationRunResponse,
    status_code=status.HTTP_200_OK,
    summary="Execute a recommendation run",
    description=(
        "Generates candidate interventions, evaluates safety constraints (fail-closed), "
        "runs eligible candidates through the Phase 7 Counterfactual Simulation Engine, "
        "ranks them via the documented ranking policy, and transitions the run to READY_FOR_REVIEW. "
        "No live infrastructure state is modified. Requires ANALYST role."
    ),
)
async def execute_recommendation_run(
    graph_id: uuid.UUID,
    run_id: uuid.UUID,
    current_user: User = Depends(require_analyst),
    db: AsyncSession = Depends(get_db),
) -> RecommendationRunResponse:
    await _verify_graph(graph_id, db)
    service = RecommendationEngineService(db)
    try:
        return await service.execute_run(graph_id, run_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Recommendation run failed: {str(e)}",
        )


# ── Candidates ────────────────────────────────────────────────────────────


@router.get(
    "/graphs/{graph_id}/recommendations/runs/{run_id}/candidates",
    response_model=list[CandidateInterventionListItem],
    status_code=status.HTTP_200_OK,
    summary="List candidates for a recommendation run",
    description="Lists all candidates ordered by rank_position. Requires VIEWER role.",
)
async def list_candidates(
    graph_id: uuid.UUID,
    run_id: uuid.UUID,
    current_user: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> list[CandidateInterventionListItem]:
    await _verify_graph(graph_id, db)
    service = RecommendationEngineService(db)
    try:
        return await service.list_candidates(graph_id, run_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get(
    "/graphs/{graph_id}/recommendations/runs/{run_id}/candidates/{candidate_id}",
    response_model=CandidateInterventionResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a candidate intervention",
    description="Retrieves a candidate with full safety evaluations. Requires VIEWER role.",
)
async def get_candidate(
    graph_id: uuid.UUID,
    run_id: uuid.UUID,
    candidate_id: uuid.UUID,
    current_user: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> CandidateInterventionResponse:
    await _verify_graph(graph_id, db)
    service = RecommendationEngineService(db)
    try:
        return await service.get_candidate(graph_id, run_id, candidate_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# ── Human Decision ────────────────────────────────────────────────────────


@router.post(
    "/graphs/{graph_id}/recommendations/runs/{run_id}/candidates/{candidate_id}/decision",
    response_model=CandidateInterventionResponse,
    status_code=status.HTTP_200_OK,
    summary="Record a human review decision",
    description=(
        "Records an APPROVED or REJECTED human decision for a candidate. "
        "Only candidates in a READY_FOR_REVIEW run may receive decisions. "
        "Requires APPROVER role. "
        "The decided_by field in the request body is IGNORED; "
        "the authenticated server-side principal is used for attribution. "
        "Approval is advisory only — CAUSAL never automatically executes approved interventions."
    ),
)
async def record_candidate_decision(
    graph_id: uuid.UUID,
    run_id: uuid.UUID,
    candidate_id: uuid.UUID,
    request: CandidateDecisionRequest,
    req: Request,
    current_user: User = Depends(require_approver),
    db: AsyncSession = Depends(get_db),
) -> CandidateInterventionResponse:
    await _verify_graph(graph_id, db)
    service = RecommendationEngineService(db)
    try:
        # Override decided_by with the authenticated principal — NEVER trust
        # the caller-supplied value in request.decided_by for attribution.
        authenticated_decided_by = current_user.email
        result = await service.record_decision(
            graph_id,
            run_id,
            candidate_id,
            request,
            authenticated_decided_by=authenticated_decided_by,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Audit the decision
    await AuditService.log_decision(
        db,
        actor=current_user,
        decision=request.decision,
        candidate_id=candidate_id,
        run_id=run_id,
        graph_id=graph_id,
        notes=request.notes,
        correlation_id=_cid(req),
    )
    await db.commit()
    return result
