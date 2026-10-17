"""
CAUSAL API — Phase 6: Probabilistic, Time-Aware Cascade Prediction Models.

Defines:
  - CascadeForecastRun: Auditable container recording a cascade forecast execution.
  - CascadePredictedNode: Predicted downstream impact on an individual node.
  - CascadePropagationPath: Directed propagation path linking source to target.

Design principles:
  - Advisory and simulation-only: NEVER mutates live operational state.
  - Direction: source → target means TARGET DEPENDS ON SOURCE. A disturbance at source
    may propagate downstream to target.
  - Uncertainty-aware: Distinguishes observed state from predicted forecast,
    and labels heuristic estimates vs calibrated probabilities.
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


class CalibrationStatus:
    """Status indicating how probabilities in the forecast were derived."""

    HEURISTIC_ESTIMATE = "HEURISTIC_ESTIMATE"
    CALIBRATED = "CALIBRATED"
    UNAVAILABLE = "UNAVAILABLE"
    ALL = (HEURISTIC_ESTIMATE, CALIBRATED, UNAVAILABLE)


class CascadeNodeForecastStatus:
    """Operational status of a node relative to the cascade simulation."""

    ALREADY_AFFECTED = "ALREADY_AFFECTED"  # Already failed or degraded in observed state
    PREDICTED_AFFECTED = "PREDICTED_AFFECTED"  # Predicted to become degraded/failed within horizon
    UNAFFECTED = "UNAFFECTED"  # Modeled to remain operational throughout horizon
    ALL = (ALREADY_AFFECTED, PREDICTED_AFFECTED, UNAFFECTED)


class CascadeImpactLevel:
    """Potential operational consequence level based on node criticality."""

    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    ALL = (CRITICAL, HIGH, MEDIUM, LOW)


class SimulationMode:
    """Execution mode of the cascade engine."""

    DETERMINISTIC = "DETERMINISTIC"
    MONTE_CARLO = "MONTE_CARLO"
    ALL = (DETERMINISTIC, MONTE_CARLO)


class DelaySource:
    """Source of propagation delay estimates."""

    METADATA = "METADATA"  # Explicitly documented in dependency metadata
    HEURISTIC_DEFAULT = "HEURISTIC_DEFAULT"  # Documented domain default heuristic
    UNKNOWN = "UNKNOWN"  # Delay timing cannot be established
    ALL = (METADATA, HEURISTIC_DEFAULT, UNKNOWN)


class CascadeForecastRun(UUIDMixin, TimestampMixin, Base):
    """
    Auditable persistent record of a cascade simulation execution.
    """

    __tablename__ = "cascade_forecast_runs"

    graph_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    initiating_node_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("nodes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    rule_version: Mapped[str] = mapped_column(String(50), nullable=False, default="1.0.0")
    simulation_mode: Mapped[str] = mapped_column(
        String(50), nullable=False, default=SimulationMode.DETERMINISTIC
    )
    calibration_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default=CalibrationStatus.HEURISTIC_ESTIMATE
    )

    horizon_minutes: Mapped[float] = mapped_column(Float, nullable=False, default=60.0)
    max_depth: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    seed: Mapped[int | None] = mapped_column(Integer, nullable=True, default=42)

    source_state_timestamp: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # High-level aggregate metrics
    total_already_affected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_predicted_affected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_critical_affected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_depth_reached: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Structured context & impact summaries (domains, assumptions, limitations)
    simulation_settings: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    summary: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Relationships
    graph: Mapped[InfrastructureGraph] = relationship("InfrastructureGraph")
    initiating_node: Mapped[Node | None] = relationship("Node", foreign_keys=[initiating_node_id])
    predicted_nodes: Mapped[list[CascadePredictedNode]] = relationship(
        "CascadePredictedNode",
        back_populates="forecast",
        cascade="all, delete-orphan",
        lazy="select",
    )
    propagation_paths: Mapped[list[CascadePropagationPath]] = relationship(
        "CascadePropagationPath",
        back_populates="forecast",
        cascade="all, delete-orphan",
        lazy="select",
    )

    __table_args__ = (
        Index("ix_cascade_forecast_graph_id", "graph_id"),
        Index("ix_cascade_forecast_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<CascadeForecastRun id={self.id} graph_id={self.graph_id} "
            f"mode={self.simulation_mode} predicted={self.total_predicted_affected}>"
        )


class CascadePredictedNode(UUIDMixin, TimestampMixin, Base):
    """
    Detailed forecast outcome for an individual node in the graph.
    """

    __tablename__ = "cascade_predicted_nodes"

    forecast_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cascade_forecast_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    node_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    forecast_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default=CascadeNodeForecastStatus.PREDICTED_AFFECTED
    )
    current_state: Mapped[str] = mapped_column(String(50), nullable=False)
    predicted_state: Mapped[str] = mapped_column(String(50), nullable=False)
    predicted_impact_level: Mapped[str] = mapped_column(
        String(50), nullable=False, default=CascadeImpactLevel.MEDIUM
    )

    # Timing estimates (seconds from simulation reference start)
    earliest_impact_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    latest_impact_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    time_to_impact_range: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Propagation probability estimates (clearly marked as heuristic or calibrated)
    propagation_probability_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    propagation_probability_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    propagation_probability_point: Mapped[float | None] = mapped_column(Float, nullable=True)
    calibration_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default=CalibrationStatus.HEURISTIC_ESTIMATE
    )

    depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Auditable path and causal ancestry
    path_summary: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    contributing_causes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    assumptions: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    limitations: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    # Relationships
    forecast: Mapped[CascadeForecastRun] = relationship(
        "CascadeForecastRun", back_populates="predicted_nodes"
    )
    node: Mapped[Node] = relationship("Node")

    __table_args__ = (
        Index("ix_cascade_nodes_forecast_id", "forecast_id"),
        Index("ix_cascade_nodes_node_id", "node_id"),
    )

    def __repr__(self) -> str:
        return (
            f"<CascadePredictedNode id={self.id} node_id={self.node_id} "
            f"status={self.forecast_status} impact={self.predicted_impact_level}>"
        )


class CascadePropagationPath(UUIDMixin, TimestampMixin, Base):
    """
    Directed propagation edge traversed during the cascade forecast.
    """

    __tablename__ = "cascade_propagation_paths"

    forecast_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cascade_forecast_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_node_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_node_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dependency_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("dependencies.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    hop_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    estimated_delay_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    delay_source: Mapped[str] = mapped_column(
        String(50), nullable=False, default=DelaySource.HEURISTIC_DEFAULT
    )
    attenuation_factor: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    propagation_rationale: Mapped[str] = mapped_column(Text, nullable=False)

    # Relationships
    forecast: Mapped[CascadeForecastRun] = relationship(
        "CascadeForecastRun", back_populates="propagation_paths"
    )
    source_node: Mapped[Node] = relationship("Node", foreign_keys=[source_node_id])
    target_node: Mapped[Node] = relationship("Node", foreign_keys=[target_node_id])
    dependency: Mapped[Dependency | None] = relationship("Dependency")

    __table_args__ = (
        Index("ix_cascade_paths_forecast_id", "forecast_id"),
        Index("ix_cascade_paths_source_target", "source_node_id", "target_node_id"),
    )

    def __repr__(self) -> str:
        return (
            f"<CascadePropagationPath forecast_id={self.forecast_id} "
            f"hop={self.hop_number} {self.source_node_id} → {self.target_node_id}>"
        )
