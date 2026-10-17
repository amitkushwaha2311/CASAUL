"""
CAUSAL API — Phase 10: Unified Resilience Assessment Model.

Defines:
  - ResilienceAssessment: Typed, read-oriented assessment record that assembles
    references and summaries from existing Phase 2–9 persisted records.
  - AssessmentStatus: Lifecycle state of an assessment.

Design principles:
  - Read-oriented: assembles pointers to existing Phase 2–9 records; does NOT
    duplicate inference, forecasting, counterfactual, or recommendation logic.
  - Source-faithful: every metric is traced to its authoritative source record.
    Missing or incompatible sources are surfaced explicitly, not fabricated.
  - Simulation-only: NEVER triggers real-world infrastructure control.
  - Authorization-aware: graph_id ownership is enforced by the API layer.
  - Append-only audit: assessment creation is recorded in the audit log.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


def _utc_now() -> datetime:
    return datetime.now(UTC)


class AssessmentStatus:
    """Lifecycle state of a resilience assessment."""

    ASSEMBLING = "ASSEMBLING"       # In progress
    READY = "READY"                  # Fully assembled; may have warnings
    PARTIAL = "PARTIAL"              # Some sources missing/stale; still usable
    FAILED = "FAILED"                # Fatal assembly error
    ALL = (ASSEMBLING, READY, PARTIAL, FAILED)


class ResilienceAssessment(UUIDMixin, TimestampMixin, Base):
    """
    Unified resilience assessment for a graph.

    Assembles references to existing Phase 2–9 records into a single,
    navigable summary. Does NOT duplicate the inference, forecasting,
    counterfactual, or recommendation engines.

    Source references are stored as nullable UUIDs. When a reference is None,
    the corresponding section is marked unavailable.

    Metadata fields (warnings, limitations, missing_sources) surface any
    incompatibility, staleness, or missing evidence explicitly.
    """

    __tablename__ = "resilience_assessments"

    # ── Owning graph ──────────────────────────────────────────────────────────
    graph_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=AssessmentStatus.ASSEMBLING,
        index=True,
    )

    # ── Phase 4 references ────────────────────────────────────────────────────
    baseline_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("state_baselines.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("state_snapshots.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # ── Phase 5 reference ─────────────────────────────────────────────────────
    causal_run_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("causal_inference_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # ── Phase 6 reference ─────────────────────────────────────────────────────
    forecast_run_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("cascade_forecast_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # ── Phase 7 reference ─────────────────────────────────────────────────────
    counterfactual_experiment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("counterfactual_experiments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # ── Phase 8 reference ─────────────────────────────────────────────────────
    recommendation_run_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("intervention_recommendation_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # ── Assembled summaries (cached at assembly time) ─────────────────────────
    # These are non-authoritative summaries assembled from authoritative sources.
    # Re-assemble if upstream records change.
    graph_summary: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    impact_summary: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    uncertainty_summary: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    recommendation_summary: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # ── Provenance metadata ───────────────────────────────────────────────────
    # Sources that were expected but unavailable at assembly time
    missing_sources: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    # Stale or contradictory source conditions detected
    warnings: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    # Non-negotiable limitations that must be disclosed
    limitations: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )

    # Rule / model versions used at assembly time for traceability
    model_versions: Mapped[dict[str, str]] = mapped_column(
        JSON, nullable=False, default=dict
    )

    # Actor who requested the assessment (server-side principal, not caller-supplied)
    created_by_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # When the assembly completed (None if still in ASSEMBLING / FAILED)
    assembled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Fatal error detail (only populated when status == FAILED)
    assembly_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    graph: Mapped[Any] = relationship("InfrastructureGraph")
    baseline: Mapped[Any] = relationship("StateBaseline")
    snapshot: Mapped[Any] = relationship("StateSnapshot")
    causal_run: Mapped[Any] = relationship("CausalInferenceRun")
    forecast_run: Mapped[Any] = relationship("CascadeForecastRun")
    counterfactual_experiment: Mapped[Any] = relationship("CounterfactualExperiment")
    recommendation_run: Mapped[Any] = relationship("InterventionRecommendationRun")
    creator: Mapped[Any] = relationship("User", foreign_keys=[created_by_id])

    __table_args__ = (
        Index("ix_assessment_graph_id", "graph_id"),
        Index("ix_assessment_status", "status"),
        Index("ix_assessment_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<ResilienceAssessment id={self.id} graph_id={self.graph_id} "
            f"status={self.status}>"
        )
