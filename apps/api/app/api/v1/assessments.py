"""
CAUSAL API — Phase 10: Unified Resilience Assessment endpoints.

Endpoints:
  POST /api/v1/graphs/{graph_id}/assessments           — ANALYST+
  GET  /api/v1/graphs/{graph_id}/assessments           — VIEWER+
  GET  /api/v1/graphs/{graph_id}/assessments/{id}      — VIEWER+
  GET  /api/v1/graphs/{graph_id}/assessments/{id}/evidence  — VIEWER+
  GET  /api/v1/graphs/{graph_id}/assessments/{id}/impacts   — VIEWER+
  GET  /api/v1/graphs/{graph_id}/assessments/{id}/decisions — VIEWER+

Authorization:
  - All endpoints require authentication (Phase 9 Bearer JWT).
  - Viewers can read assessments for authorized graphs.
  - Assessment creation requires ANALYST or above.
  - Graph ownership is validated server-side for every linked record.
  - Human decisions remain immutable through this interface.

Safety boundary:
  - Does not execute inference, forecasting, counterfactual, or recommendation engines.
  - Does not modify nodes, events, state_history, or any Phase 1–9 operational tables.
  - Assessment creation is recorded in the audit log.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_analyst, require_viewer
from app.db.session import get_db
from app.models.assessment_models import ResilienceAssessment
from app.models.audit_log import AuditAction
from app.models.graph_models import InfrastructureGraph
from app.models.user import User
from app.schemas.assessment import (
    AssessmentCreate,
    AssessmentDecisions,
    AssessmentEvidenceLineage,
    AssessmentImpactSummary,
    AssessmentListResponse,
    AssessmentResponse,
)
from app.services.assessment_service import AssessmentService
from app.services.audit_service import AuditService

router = APIRouter(tags=["assessments"])


def _cid(request: Request) -> str:
    return request.headers.get("X-Correlation-ID", str(uuid.uuid4()))


async def _verify_graph_exists(graph_id: uuid.UUID, db: AsyncSession) -> None:
    """Raise 404 if the graph does not exist."""
    result = await db.execute(
        select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Graph {graph_id} not found.",
        )


async def _get_assessment_or_404(
    graph_id: uuid.UUID,
    assessment_id: uuid.UUID,
    db: AsyncSession,
) -> ResilienceAssessment:
    """Fetch assessment and verify it belongs to the graph."""
    svc = AssessmentService(db)
    assessment = await svc.get_assessment(assessment_id)
    if assessment is None or assessment.graph_id != graph_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assessment {assessment_id} not found for graph {graph_id}.",
        )
    return assessment


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post(
    "/graphs/{graph_id}/assessments",
    response_model=AssessmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a resilience assessment (ANALYST+)",
    description=(
        "Assemble a new unified resilience assessment from existing Phase 2–9 records. "
        "Does not re-execute any inference, forecasting, counterfactual, or recommendation engine. "
        "All referenced record IDs are validated for graph ownership before assembly."
    ),
)
async def create_assessment(
    graph_id: uuid.UUID,
    data: AssessmentCreate,
    request: Request,
    current_user: User = Depends(require_analyst),
    db: AsyncSession = Depends(get_db),
) -> AssessmentResponse:
    await _verify_graph_exists(graph_id, db)
    svc = AssessmentService(db)
    assessment = await svc.create_assessment(graph_id, data, actor=current_user)

    await AuditService.log(
        db,
        action=AuditAction.SIMULATION_STARTED,  # Closest existing action; assessment assembly
        actor=current_user,
        resource_type="resilience_assessment",
        resource_id=assessment.id,
        description=f"Resilience assessment '{data.name}' created for graph {graph_id}.",
        context={"graph_id": str(graph_id), "status": assessment.status},
        correlation_id=_cid(request),
    )
    await db.commit()
    await db.refresh(assessment)
    return AssessmentResponse.model_validate(assessment, from_attributes=True)


@router.get(
    "/graphs/{graph_id}/assessments",
    response_model=AssessmentListResponse,
    summary="List resilience assessments (VIEWER+)",
)
async def list_assessments(
    graph_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> AssessmentListResponse:
    await _verify_graph_exists(graph_id, db)
    svc = AssessmentService(db)
    return await svc.list_assessments(graph_id, page=page, page_size=page_size)


@router.get(
    "/graphs/{graph_id}/assessments/{assessment_id}",
    response_model=AssessmentResponse,
    summary="Get a resilience assessment (VIEWER+)",
)
async def get_assessment(
    graph_id: uuid.UUID,
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> AssessmentResponse:
    assessment = await _get_assessment_or_404(graph_id, assessment_id, db)
    return AssessmentResponse.model_validate(assessment, from_attributes=True)


@router.get(
    "/graphs/{graph_id}/assessments/{assessment_id}/evidence",
    response_model=AssessmentEvidenceLineage,
    summary="Get evidence lineage (VIEWER+)",
    description=(
        "Returns the full evidence lineage for the linked Phase 5 causal inference run. "
        "Every hypothesis is traced to its source records. "
        "Missing or unavailable evidence is explicitly surfaced."
    ),
)
async def get_evidence(
    graph_id: uuid.UUID,
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> AssessmentEvidenceLineage:
    assessment = await _get_assessment_or_404(graph_id, assessment_id, db)
    svc = AssessmentService(db)
    return await svc.get_evidence_lineage(assessment)


@router.get(
    "/graphs/{graph_id}/assessments/{assessment_id}/impacts",
    response_model=AssessmentImpactSummary,
    summary="Get impact and uncertainty summary (VIEWER+)",
    description=(
        "Returns the impact and uncertainty summary assembled from Phase 5–8 records. "
        "Clearly distinguishes observed impacts from predicted impacts. "
        "UNAVAILABLE values are returned explicitly rather than fabricated."
    ),
)
async def get_impacts(
    graph_id: uuid.UUID,
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> AssessmentImpactSummary:
    assessment = await _get_assessment_or_404(graph_id, assessment_id, db)
    svc = AssessmentService(db)
    return await svc.get_impacts(assessment)


@router.get(
    "/graphs/{graph_id}/assessments/{assessment_id}/decisions",
    response_model=AssessmentDecisions,
    summary="Get recommendation decisions (VIEWER+)",
    description=(
        "Returns linked recommendation candidates and their human decision status. "
        "Decisions are read-only through this interface; use the recommendations API to approve/reject."
    ),
)
async def get_decisions(
    graph_id: uuid.UUID,
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> AssessmentDecisions:
    assessment = await _get_assessment_or_404(graph_id, assessment_id, db)
    svc = AssessmentService(db)
    return await svc.get_decisions(assessment)
