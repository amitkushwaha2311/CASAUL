"""
CAUSAL API — Phase 8: Safety-Constrained Intervention Optimization & Recommendation Engine Models.

Defines:
  - InterventionRecommendationRun: Auditable container for a recommendation generation run.
  - CandidateIntervention: A single candidate intervention with safety, eligibility, rank, and
    human decision fields.
  - SafetyConstraintEvaluation: Detailed pass/fail record for each safety constraint evaluated
    against a candidate.

Design principles:
  - Simulation-only: NEVER executes real-world infrastructure commands or touches live state.
  - Fail-closed safety: safety evaluation is separate from ranking; only PASS candidates are ranked.
  - Full auditability: every decision (approval / rejection) is persisted with notes and timestamp.
  - Strict live-state immutability: these tables never modify nodes, dependencies, state_history,
    events, or observations.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


def _utc_now() -> datetime:
    return datetime.now(UTC)


# ── Status / label constants ───────────────────────────────────────────────


class RecommendationRunStatus:
    """Lifecycle state of a recommendation generation run."""

    PENDING = "PENDING"
    GENERATING = "GENERATING"
    EVALUATING = "EVALUATING"
    READY_FOR_REVIEW = "READY_FOR_REVIEW"
    FAILED = "FAILED"
    ALL = (PENDING, GENERATING, EVALUATING, READY_FOR_REVIEW, FAILED)


class SafetyStatus:
    """Safety constraint evaluation aggregate result for a candidate."""

    PASS = "PASS"
    FAIL = "FAIL"
    INDETERMINATE = "INDETERMINATE"
    ALL = (PASS, FAIL, INDETERMINATE)


class EligibilityStatus:
    """Eligibility of a candidate to be evaluated via Phase 7 simulation."""

    ELIGIBLE = "ELIGIBLE"
    INELIGIBLE = "INELIGIBLE"
    INDETERMINATE = "INDETERMINATE"
    ALL = (ELIGIBLE, INELIGIBLE, INDETERMINATE)


class DecisionStatus:
    """Human review decision for a candidate."""

    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    ALL = (PENDING, APPROVED, REJECTED)


class ConstraintType:
    """Named safety constraint types supported by the engine."""

    PROTECTED_NODE_HEALTH = "PROTECTED_NODE_HEALTH"
    PROTECTED_NODE_CAPACITY = "PROTECTED_NODE_CAPACITY"
    REQUIRED_DEPENDENCY_PRESERVATION = "REQUIRED_DEPENDENCY_PRESERVATION"
    ALLOWED_TARGETS = "ALLOWED_TARGETS"
    VALID_PARAMETER_BOUNDS = "VALID_PARAMETER_BOUNDS"
    ALL = (
        PROTECTED_NODE_HEALTH,
        PROTECTED_NODE_CAPACITY,
        REQUIRED_DEPENDENCY_PRESERVATION,
        ALLOWED_TARGETS,
        VALID_PARAMETER_BOUNDS,
    )


class ConstraintStatus:
    """Individual constraint evaluation outcome."""

    PASS = "PASS"
    FAIL = "FAIL"
    INDETERMINATE = "INDETERMINATE"
    ALL = (PASS, FAIL, INDETERMINATE)


# ── ORM Models ────────────────────────────────────────────────────────────


class InterventionRecommendationRun(UUIDMixin, TimestampMixin, Base):
    """
    Auditable container for a single recommendation generation run.

    A run is scoped to a graph and optionally pinned to a Phase 4 baseline or snapshot.
    It generates, evaluates, and ranks candidate interventions for human review.
    It NEVER modifies live operational state.
    """

    __tablename__ = "intervention_recommendation_runs"

    graph_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Optional anchor to a Phase 4 baseline or snapshot
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

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=RecommendationRunStatus.PENDING,
        index=True,
    )

    # Settings used during candidate generation (bounded, auditable)
    generation_settings: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )

    # Documented ranking policy applied during this run
    ranking_policy: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )

    # High-level summary produced at the end of the run
    summary: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Non-actionable limitations disclosed with the run
    limitations: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    execution_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    graph: Mapped[Any] = relationship("InfrastructureGraph")
    baseline: Mapped[Any] = relationship("StateBaseline")
    snapshot: Mapped[Any] = relationship("StateSnapshot")
    candidates: Mapped[list["CandidateIntervention"]] = relationship(
        "CandidateIntervention",
        back_populates="run",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="CandidateIntervention.rank_position",
    )

    __table_args__ = (
        Index("ix_rec_run_graph_id", "graph_id"),
        Index("ix_rec_run_status", "status"),
        Index("ix_rec_run_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<InterventionRecommendationRun id={self.id} name={self.name!r} status={self.status}>"


class CandidateIntervention(UUIDMixin, TimestampMixin, Base):
    """
    A single candidate intervention generated and evaluated within a recommendation run.

    Safety evaluation, Phase 7 counterfactual simulation, ranking, and human review
    results are all persisted here for full auditability.

    Decision statuses: PENDING -> APPROVED or REJECTED by a human reviewer.
    """

    __tablename__ = "candidate_interventions"

    run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("intervention_recommendation_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Intervention type label (maps to Phase 7 CounterfactualChangeType values)
    intervention_type: Mapped[str] = mapped_column(String(100), nullable=False)

    # Serialised list of Phase 7 CounterfactualChangeCreate dicts
    changes: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )

    # FK to the Phase 7 counterfactual experiment created for this candidate (nullable until evaluated)
    counterfactual_experiment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("counterfactual_experiments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # -- Safety evaluation --------------------------------------------------
    safety_status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=SafetyStatus.INDETERMINATE,
        index=True,
    )

    # -- Eligibility (derived from safety + validation) ---------------------
    eligibility_status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=EligibilityStatus.INDETERMINATE,
        index=True,
    )

    # -- Ranking (only set for ELIGIBLE candidates) -------------------------
    rank_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    rank_position: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    ranking_breakdown: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )

    # -- Human review decision ----------------------------------------------
    decision_status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=DecisionStatus.PENDING,
        index=True,
    )
    decision_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    decided_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Relationships
    run: Mapped[InterventionRecommendationRun] = relationship(
        "InterventionRecommendationRun", back_populates="candidates"
    )
    counterfactual_experiment: Mapped[Any] = relationship(
        "CounterfactualExperiment", foreign_keys=[counterfactual_experiment_id]
    )
    safety_evaluations: Mapped[list["SafetyConstraintEvaluation"]] = relationship(
        "SafetyConstraintEvaluation",
        back_populates="candidate",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        Index("ix_candidate_run_id", "run_id"),
        Index("ix_candidate_safety_status", "safety_status"),
        Index("ix_candidate_rank_position", "rank_position"),
        Index("ix_candidate_decision_status", "decision_status"),
    )

    def __repr__(self) -> str:
        return (
            f"<CandidateIntervention id={self.id} title={self.title!r} "
            f"safety={self.safety_status} rank={self.rank_position}>"
        )


class SafetyConstraintEvaluation(UUIDMixin, TimestampMixin, Base):
    """
    Detailed pass/fail record for a single safety constraint applied to a candidate.

    Fail-closed: any FAIL result causes the parent candidate to be INELIGIBLE.
    INDETERMINATE results are surfaced as warnings and treated conservatively (also INELIGIBLE).
    """

    __tablename__ = "safety_constraint_evaluations"

    candidate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("candidate_interventions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    constraint_name: Mapped[str] = mapped_column(String(255), nullable=False)
    constraint_type: Mapped[str] = mapped_column(String(100), nullable=False)

    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default=ConstraintStatus.INDETERMINATE
    )

    # Machine-readable evaluated value (e.g. {"health": 0.4})
    evaluated_value: Mapped[Any] = mapped_column(JSON, nullable=True)
    # Machine-readable threshold (e.g. {"min_health": 0.5})
    threshold: Mapped[Any] = mapped_column(JSON, nullable=True)

    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Supporting evidence: node names, dependency labels, rule references, etc.
    supporting_evidence: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )

    # Relationships
    candidate: Mapped[CandidateIntervention] = relationship(
        "CandidateIntervention", back_populates="safety_evaluations"
    )

    __table_args__ = (
        Index("ix_safety_eval_candidate_id", "candidate_id"),
        Index("ix_safety_eval_status", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<SafetyConstraintEvaluation id={self.id} "
            f"constraint={self.constraint_name!r} status={self.status}>"
        )
