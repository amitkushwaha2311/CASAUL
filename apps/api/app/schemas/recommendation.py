"""
CAUSAL API — Phase 8: Recommendation Engine Pydantic Schemas.

Request and response schemas for:
  - InterventionRecommendationRun lifecycle (create, list, detail)
  - CandidateIntervention with safety, eligibility, ranking, and decision
  - SafetyConstraintEvaluation audit records
  - Human decision (approve / reject) request
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.recommendation_models import (
    ConstraintStatus,
    ConstraintType,
    DecisionStatus,
    EligibilityStatus,
    RecommendationRunStatus,
    SafetyStatus,
)


# ── Safety Constraint Evaluation ──────────────────────────────────────────


class SafetyConstraintEvaluationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    candidate_id: uuid.UUID
    constraint_name: str
    constraint_type: str
    status: str
    evaluated_value: Any | None = None
    threshold: Any | None = None
    rationale: str | None = None
    supporting_evidence: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime


# ── Candidate Intervention ─────────────────────────────────────────────────


class CandidateInterventionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    run_id: uuid.UUID
    title: str
    description: str | None = None
    intervention_type: str
    changes: list[dict[str, Any]] = Field(default_factory=list)

    counterfactual_experiment_id: uuid.UUID | None = None

    safety_status: str
    eligibility_status: str

    rank_score: float | None = None
    rank_position: int | None = None
    ranking_breakdown: dict[str, Any] = Field(default_factory=dict)

    decision_status: str
    decision_notes: str | None = None
    decided_at: datetime | None = None
    decided_by: str | None = None

    safety_evaluations: list[SafetyConstraintEvaluationResponse] = Field(default_factory=list)

    created_at: datetime
    updated_at: datetime


class CandidateInterventionListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    run_id: uuid.UUID
    title: str
    intervention_type: str
    safety_status: str
    eligibility_status: str
    rank_score: float | None = None
    rank_position: int | None = None
    decision_status: str
    counterfactual_experiment_id: uuid.UUID | None = None
    created_at: datetime


# ── Human Decision Request ─────────────────────────────────────────────────


class CandidateDecisionRequest(BaseModel):
    """Request body to approve or reject a candidate intervention."""

    decision: str = Field(
        ...,
        description="Decision status: APPROVED or REJECTED",
    )
    notes: str | None = Field(
        default=None,
        max_length=2000,
        description="Optional human reviewer notes or rationale",
    )
    decided_by: str | None = Field(
        default=None,
        max_length=255,
        description=(
            "Audit attribution label of the human reviewer (e.g. name or reviewer ID). "
            "NOTE: This is a caller-supplied audit label and not a cryptographically verified "
            "identity, as system-wide user authentication is managed in a separate phase."
        ),
    )

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, v: str) -> str:
        upper = v.upper()
        if upper not in (DecisionStatus.APPROVED, DecisionStatus.REJECTED):
            raise ValueError(
                f"Invalid decision {v!r}. Must be 'APPROVED' or 'REJECTED'."
            )
        return upper


# ── Recommendation Run Create ──────────────────────────────────────────────


class RecommendationRunCreate(BaseModel):
    """Request payload to start a new recommendation run."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)

    baseline_id: uuid.UUID | None = Field(
        default=None,
        description="Phase 4 StateBaseline to anchor the simulation baseline",
    )
    snapshot_id: uuid.UUID | None = Field(
        default=None,
        description="Phase 4 StateSnapshot to anchor the simulation baseline",
    )

    # Generation settings (bounded)
    max_candidates: int = Field(
        default=10,
        ge=1,
        le=30,
        description="Maximum number of candidate interventions to generate",
    )
    horizon_minutes: float = Field(
        default=60.0,
        ge=1.0,
        le=1440.0,
        description="Simulation time horizon passed to Phase 7 experiments",
    )
    max_depth: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Maximum cascade depth passed to Phase 7 experiments",
    )
    seed: int = Field(
        default=42,
        description="Reproducibility seed for Phase 7 experiments",
    )
    target_node_ids: list[uuid.UUID] | None = Field(
        default=None,
        description="Optional: restrict candidate generation to these nodes",
    )


# ── Recommendation Run Responses ───────────────────────────────────────────


class RecommendationRunSummary(BaseModel):
    """High-level aggregate summary attached to a completed run."""

    total_candidates: int
    eligible_candidates: int
    ineligible_candidates: int
    indeterminate_candidates: int
    ranked_candidates: int
    top_rank_score: float | None
    disclaimer: str


class RecommendationRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    graph_id: uuid.UUID
    name: str
    description: str | None = None
    baseline_id: uuid.UUID | None = None
    snapshot_id: uuid.UUID | None = None
    status: str
    generation_settings: dict[str, Any] = Field(default_factory=dict)
    ranking_policy: dict[str, Any] = Field(default_factory=dict)
    summary: dict[str, Any] | None = None
    limitations: list[str] = Field(default_factory=list)
    execution_error: str | None = None
    completed_at: datetime | None = None
    candidates: list[CandidateInterventionResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class RecommendationRunListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    graph_id: uuid.UUID
    name: str
    status: str
    summary: dict[str, Any] | None = None
    created_at: datetime
    completed_at: datetime | None = None


class RecommendationRunListResponse(BaseModel):
    items: list[RecommendationRunListItem]
    total: int
    page: int
    page_size: int
