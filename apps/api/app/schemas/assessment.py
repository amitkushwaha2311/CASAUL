"""
CAUSAL API — Phase 10: Resilience Assessment Pydantic schemas.

All schemas are read-oriented. The assessment is created by the server from
existing Phase 2–9 records; clients cannot inject fabricated summaries.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# ── Request schemas ────────────────────────────────────────────────────────────


class AssessmentCreate(BaseModel):
    """
    Request to create a new resilience assessment for a graph.

    All referenced IDs must belong to the same graph. The server validates
    ownership before assembling.
    """

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None

    # Phase 4 — optional baseline or snapshot anchor
    baseline_id: uuid.UUID | None = None
    snapshot_id: uuid.UUID | None = None

    # Phase 5 — causal inference run
    causal_run_id: uuid.UUID | None = None

    # Phase 6 — cascade forecast run
    forecast_run_id: uuid.UUID | None = None

    # Phase 7 — counterfactual experiment
    counterfactual_experiment_id: uuid.UUID | None = None

    # Phase 8 — recommendation run
    recommendation_run_id: uuid.UUID | None = None


# ── Evidence / lineage sub-schemas ─────────────────────────────────────────────


class SourceReference(BaseModel):
    """A traceable reference to a source record."""

    record_type: str
    record_id: str
    description: str
    timestamp: datetime | None = None
    url_hint: str | None = None  # Non-authoritative path hint for UI linking


class EvidenceLineageItem(BaseModel):
    """One item in the evidence lineage for a hypothesis."""

    direction: str       # SUPPORTING | CONTRADICTING | NEUTRAL
    evidence_type: str
    summary: str
    source_record_type: str | None = None
    source_record_id: str | None = None
    observed_at: datetime | None = None
    confidence: float | None = None


class HypothesisSummary(BaseModel):
    """Compact summary of a causal hypothesis."""

    hypothesis_id: str
    hypothesis_type: str
    status: str
    explanation: str
    inference_rule: str
    evidence_completeness_ratio: float
    supporting_count: int
    contradicting_count: int
    neutral_count: int
    missing_evidence: list[str]
    unresolved_assumptions: list[str]
    affected_node_id: str | None = None
    affected_node_name: str | None = None
    candidate_cause_node_id: str | None = None
    candidate_cause_node_name: str | None = None


class ForecastNodeSummary(BaseModel):
    """Compact summary of a predicted cascade node impact."""

    node_id: str
    node_name: str
    forecast_status: str         # ALREADY_AFFECTED | PREDICTED_AFFECTED | UNAFFECTED
    predicted_impact_level: str  # CRITICAL | HIGH | MEDIUM | LOW
    calibration_status: str      # HEURISTIC_ESTIMATE | CALIBRATED | UNAVAILABLE
    earliest_impact_seconds: float | None = None
    latest_impact_seconds: float | None = None
    depth: int


class CounterfactualSummaryItem(BaseModel):
    """Concise differential outcome summary."""

    prevented_node_count: int          # Nodes affected in baseline only
    newly_introduced_node_count: int   # Nodes affected in counterfactual only
    shared_affected_node_count: int    # Nodes affected in both branches
    timing_differences_count: int      # Nodes with different timing estimates
    has_critical_prevention: bool      # At least one CRITICAL node prevented
    warnings: list[str]
    limitations: list[str]


class CandidateSummary(BaseModel):
    """Compact summary of a recommendation candidate and its decision."""

    candidate_id: str
    title: str
    intervention_type: str
    safety_status: str      # PASS | FAIL | INDETERMINATE
    eligibility_status: str
    rank_position: int | None
    rank_score: float | None
    decision_status: str    # PENDING | APPROVED | REJECTED
    decided_by: str | None
    decided_at: datetime | None


# ── Section-specific response schemas ─────────────────────────────────────────


class AssessmentGraphSummary(BaseModel):
    """Phase 2 graph and Phase 3 event summary."""

    graph_id: str
    graph_name: str
    node_count: int
    dependency_count: int
    active_event_count: int
    critical_event_count: int
    degraded_node_count: int
    critical_node_count: int
    failed_node_count: int
    data_available: bool
    source_reference: SourceReference | None = None


class AssessmentImpactSummary(BaseModel):
    """
    Impact and uncertainty summary assembled from Phase 5, 6, 7, and 8.

    Every metric explicitly identifies its source and semantic type.
    UNAVAILABLE values are surfaced rather than fabricated.
    """

    # Phase 5 causal summary
    hypotheses_total: int | None = None
    hypotheses_supported: int | None = None
    hypotheses_contradicted: int | None = None
    hypotheses_unresolved: int | None = None
    causal_source: SourceReference | None = None
    causal_available: bool = False

    # Phase 6 forecast summary
    forecast_horizon_minutes: float | None = None
    forecast_already_affected: int | None = None
    forecast_predicted_affected: int | None = None
    forecast_critical_affected: int | None = None
    forecast_calibration_status: str | None = None
    forecast_source: SourceReference | None = None
    forecast_available: bool = False

    # Phase 7 counterfactual summary
    counterfactual_summary: CounterfactualSummaryItem | None = None
    counterfactual_source: SourceReference | None = None
    counterfactual_available: bool = False

    # Phase 8 recommendation summary
    recommendation_eligible_count: int | None = None
    recommendation_ineligible_count: int | None = None
    recommendation_approved_count: int | None = None
    recommendation_rejected_count: int | None = None
    recommendation_pending_count: int | None = None
    recommendation_source: SourceReference | None = None
    recommendation_available: bool = False

    # Cross-cutting
    data_freshness_warning: bool = False
    missing_sources: list[str] = Field(default_factory=list)


class AssessmentEvidenceLineage(BaseModel):
    """
    Full evidence lineage for the assessment.

    Every conclusion is traced to its source record.
    Missing or conflicting evidence is explicitly surfaced.
    """

    assessment_id: str
    graph_id: str
    causal_run_id: str | None = None
    analyzed_at: datetime | None = None
    rule_version: str | None = None
    hypotheses: list[HypothesisSummary] = Field(default_factory=list)
    total_hypotheses: int = 0
    evidence_completeness_avg: float | None = None
    missing_evidence_summary: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    causal_available: bool = False


class AssessmentDecisions(BaseModel):
    """
    Recommendation decisions and audit references.

    Human decisions remain immutable through this interface.
    """

    assessment_id: str
    graph_id: str
    recommendation_run_id: str | None = None
    run_name: str | None = None
    run_status: str | None = None
    candidates: list[CandidateSummary] = Field(default_factory=list)
    total_candidates: int = 0
    approved_count: int = 0
    rejected_count: int = 0
    pending_count: int = 0
    recommendation_available: bool = False
    limitations: list[str] = Field(default_factory=list)


# ── Main assessment response schemas ──────────────────────────────────────────


class AssessmentListItem(BaseModel):
    """Compact assessment list item for paginated listing."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    graph_id: uuid.UUID
    name: str
    description: str | None
    status: str
    created_by_email: str | None
    assembled_at: datetime | None
    created_at: datetime
    has_causal: bool = False
    has_forecast: bool = False
    has_counterfactual: bool = False
    has_recommendation: bool = False
    warning_count: int = 0
    missing_source_count: int = 0


class AssessmentResponse(BaseModel):
    """Full assessment response including all summaries."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    graph_id: uuid.UUID
    name: str
    description: str | None
    status: str

    # Source record IDs (nullable when not provided at creation time)
    baseline_id: uuid.UUID | None
    snapshot_id: uuid.UUID | None
    causal_run_id: uuid.UUID | None
    forecast_run_id: uuid.UUID | None
    counterfactual_experiment_id: uuid.UUID | None
    recommendation_run_id: uuid.UUID | None

    # Assembled summaries
    graph_summary: dict[str, Any] | None
    impact_summary: dict[str, Any] | None
    uncertainty_summary: dict[str, Any] | None
    recommendation_summary: dict[str, Any] | None

    # Provenance
    missing_sources: list[str]
    warnings: list[str]
    limitations: list[str]
    model_versions: dict[str, str]

    # Actor
    created_by_email: str | None
    created_by_id: uuid.UUID | None

    # Timestamps
    assembled_at: datetime | None
    assembly_error: str | None
    created_at: datetime


class AssessmentListResponse(BaseModel):
    """Paginated list of assessments."""

    items: list[AssessmentListItem]
    total: int
    page: int
    page_size: int
    has_next: bool
