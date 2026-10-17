"""
CAUSAL API — Phase 7: Counterfactual Simulation Engine Models.

Defines:
  - CounterfactualExperiment: Auditable container recording a counterfactual experiment definition and run.
  - CounterfactualChange: Explicit hypothetical parameter or state modification applied to the simulation copy.
  - CounterfactualComparison: Detailed differential outcome comparison between baseline and counterfactual branches.

Design principles:
  - Simulation-only: NEVER mutates live operational state or historical records.
  - Model-dependent estimates: Counterfactual outputs are heuristic model projections, not observed facts or real-world guarantees.
  - Paired execution: Both branches (Baseline vs Counterfactual) execute through the Phase 6 cascade forecast engine.
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


def utc_now() -> datetime:
    return datetime.now(UTC)


class CounterfactualExperimentStatus:
    """Lifecycle state of a counterfactual experiment run."""

    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    ALL = (PENDING, RUNNING, COMPLETED, FAILED)


class CounterfactualTargetType:
    """Target entity type for a hypothetical modification."""

    NODE = "NODE"
    DEPENDENCY = "DEPENDENCY"
    ALL = (NODE, DEPENDENCY)


class CounterfactualChangeType:
    """Supported explicit hypothetical change types."""

    # Node modifications
    STATE_OVERRIDE = "STATE_OVERRIDE"
    HEALTH_OVERRIDE = "HEALTH_OVERRIDE"
    CAPACITY_OVERRIDE = "CAPACITY_OVERRIDE"
    AVAILABILITY_OVERRIDE = "AVAILABILITY_OVERRIDE"

    # Dependency modifications
    DEPENDENCY_AVAILABILITY = "DEPENDENCY_AVAILABILITY"  # e.g., severed connection or backup link
    DEPENDENCY_STRENGTH = "DEPENDENCY_STRENGTH"
    DEPENDENCY_DELAY = "DEPENDENCY_DELAY"

    ALL = (
        STATE_OVERRIDE,
        HEALTH_OVERRIDE,
        CAPACITY_OVERRIDE,
        AVAILABILITY_OVERRIDE,
        DEPENDENCY_AVAILABILITY,
        DEPENDENCY_STRENGTH,
        DEPENDENCY_DELAY,
    )


class CounterfactualExperiment(UUIDMixin, TimestampMixin, Base):
    """
    Auditable persistent record of a counterfactual experiment comparing a baseline
    scenario against one or more hypothetical changes.
    """

    __tablename__ = "counterfactual_experiments"

    graph_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Reference baseline or snapshot (Phase 4)
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
        String(50), nullable=False, default=CounterfactualExperimentStatus.PENDING, index=True
    )
    rule_version: Mapped[str] = mapped_column(String(50), nullable=False, default="1.0.0")

    # Simulation settings held constant across both branches
    forecast_settings: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # Foreign keys to the persisted Phase 6 forecast runs
    baseline_forecast_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("cascade_forecast_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    counterfactual_forecast_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("cascade_forecast_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    execution_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # High-level aggregate experiment summary
    summary: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Relationships
    graph: Mapped[Any] = relationship("InfrastructureGraph")
    baseline: Mapped[Any] = relationship("StateBaseline")
    snapshot: Mapped[Any] = relationship("StateSnapshot")
    baseline_forecast: Mapped[Any] = relationship(
        "CascadeForecastRun", foreign_keys=[baseline_forecast_id]
    )
    counterfactual_forecast: Mapped[Any] = relationship(
        "CascadeForecastRun", foreign_keys=[counterfactual_forecast_id]
    )

    changes: Mapped[list[CounterfactualChange]] = relationship(
        "CounterfactualChange",
        back_populates="experiment",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    comparison: Mapped[CounterfactualComparison | None] = relationship(
        "CounterfactualComparison",
        back_populates="experiment",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        Index("ix_cf_exp_graph_id", "graph_id"),
        Index("ix_cf_exp_status", "status"),
        Index("ix_cf_exp_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<CounterfactualExperiment id={self.id} name={self.name!r} status={self.status}>"


class CounterfactualChange(UUIDMixin, TimestampMixin, Base):
    """
    Explicit hypothetical modification applied to the isolated simulation state copy.
    """

    __tablename__ = "counterfactual_changes"

    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("counterfactual_experiments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    change_type: Mapped[str] = mapped_column(String(50), nullable=False)

    original_value: Mapped[Any] = mapped_column(JSON, nullable=True)
    proposed_value: Mapped[Any] = mapped_column(JSON, nullable=False)

    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    experiment: Mapped[CounterfactualExperiment] = relationship(
        "CounterfactualExperiment", back_populates="changes"
    )

    __table_args__ = (
        Index("ix_cf_change_experiment_id", "experiment_id"),
        Index("ix_cf_change_target", "target_type", "target_id"),
    )

    def __repr__(self) -> str:
        return (
            f"<CounterfactualChange id={self.id} target={self.target_type}:{self.target_id} "
            f"type={self.change_type}>"
        )


class CounterfactualComparison(UUIDMixin, TimestampMixin, Base):
    """
    Persisted differential outcome comparison between the baseline and counterfactual branches.
    """

    __tablename__ = "counterfactual_comparisons"

    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("counterfactual_experiments.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Detailed differential node outcome sets
    nodes_affected_both: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    nodes_affected_baseline_only: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    nodes_affected_counterfactual_only: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    nodes_timing_differ: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    nodes_severity_differ: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )

    critical_nodes_summary: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )
    uncertainty_differences: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )
    comparison_metrics: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )

    warnings: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    limitations: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    # Relationships
    experiment: Mapped[CounterfactualExperiment] = relationship(
        "CounterfactualExperiment", back_populates="comparison"
    )

    __table_args__ = (Index("ix_cf_comp_experiment_id", "experiment_id"),)

    def __repr__(self) -> str:
        return f"<CounterfactualComparison id={self.id} experiment_id={self.experiment_id}>"
