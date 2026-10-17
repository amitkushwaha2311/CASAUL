"""
CAUSAL API — System State & Digital Twin models (Phase 4).

Entities:
  - StateHistory: Immutable, append-only history of node state changes and observations.
  - StateBaseline: Named, immutable baseline reference state for a graph.
  - StateSnapshot: Immutable snapshot of system/node state at a point in time.
  - Scenario: Named container for scenario-scoped state snapshots without mutating live state.
  - SourceReliability: Domain-independent metadata regarding sensor or source reliability.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class StateConsistencyStatus:
    VALID = "VALID"
    WARNING = "WARNING"
    INVALID = "INVALID"
    UNKNOWN = "UNKNOWN"
    ALL = (VALID, WARNING, INVALID, UNKNOWN)


class SourceReliabilityStatus:
    ACTIVE = "ACTIVE"
    DEGRADED = "DEGRADED"
    UNRELIABLE = "UNRELIABLE"
    UNKNOWN = "UNKNOWN"
    ALL = (ACTIVE, DEGRADED, UNRELIABLE, UNKNOWN)


class StateHistory(UUIDMixin, TimestampMixin, Base):
    """
    Append-only record of validated state transitions and measurements for a node.
    """

    __tablename__ = "state_history"

    graph_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    node_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    observation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("observations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    state: Mapped[str | None] = mapped_column(String(50), nullable=True)
    health: Mapped[float | None] = mapped_column(Float, nullable=True)
    capacity: Mapped[float | None] = mapped_column(Float, nullable=True)
    availability: Mapped[float | None] = mapped_column(Float, nullable=True)

    metric: Mapped[str | None] = mapped_column(String(100), nullable=True)
    value_numeric: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    change_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)

    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, index=True
    )

    provenance_metadata: Mapped[dict[str, Any] | None] = mapped_column(
        JSON, nullable=True
    )

    # Relationships
    graph: Mapped["InfrastructureGraph"] = relationship("InfrastructureGraph")
    node: Mapped["Node"] = relationship("Node")
    event: Mapped["Event"] = relationship("Event")
    observation: Mapped["Observation"] = relationship("Observation")

    __table_args__ = (
        Index("ix_state_history_graph_id", "graph_id"),
        Index("ix_state_history_node_id", "node_id"),
        Index("ix_state_history_observed_at", "observed_at"),
        Index("ix_state_history_recorded_at", "recorded_at"),
    )

    def __repr__(self) -> str:
        return f"<StateHistory id={self.id} node_id={self.node_id} state={self.state}>"


class StateBaseline(UUIDMixin, TimestampMixin, Base):
    """
    Immutable baseline reference state for a graph.
    """

    __tablename__ = "state_baselines"

    graph_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    # Compact representation of node states in this baseline:
    # { node_id: { state, health, capacity, availability, confidence, source, observed_at } }
    node_states: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    completeness_ratio: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)

    # Relationship
    graph: Mapped["InfrastructureGraph"] = relationship("InfrastructureGraph")

    __table_args__ = (
        Index("ix_state_baselines_graph_id", "graph_id"),
        Index("ix_state_baselines_captured_at", "captured_at"),
    )

    def __repr__(self) -> str:
        return f"<StateBaseline id={self.id} name={self.name!r}>"


class StateSnapshot(UUIDMixin, TimestampMixin, Base):
    """
    Immutable state snapshot of a graph at a given point in time.
    """

    __tablename__ = "state_snapshots"

    graph_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    snapshot_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="LIVE"
    )  # LIVE or RECONSTRUCTED
    
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, index=True
    )
    effective_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

    # Compact representation of node states:
    # { node_id: { state, health, capacity, availability, confidence, source, observed_at, ... } }
    node_states: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    summary: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    completeness_ratio: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)

    # Relationship
    graph: Mapped["InfrastructureGraph"] = relationship("InfrastructureGraph")

    __table_args__ = (
        Index("ix_state_snapshots_graph_id", "graph_id"),
        Index("ix_state_snapshots_effective_at", "effective_at"),
    )

    def __repr__(self) -> str:
        return f"<StateSnapshot id={self.id} type={self.snapshot_type} effective_at={self.effective_at}>"


class Scenario(UUIDMixin, TimestampMixin, Base):
    """
    Named container for scenario-scoped state snapshots without mutating live state.
    """

    __tablename__ = "scenarios"

    graph_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    base_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("state_snapshots.id", ondelete="SET NULL"),
        nullable=True,
    )
    base_baseline_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("state_baselines.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Scenario-isolated node state overrides: { node_id: { state, health, capacity, ... } }
    state_overrides: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)

    # Relationships
    graph: Mapped["InfrastructureGraph"] = relationship("InfrastructureGraph")
    base_snapshot: Mapped["StateSnapshot | None"] = relationship("StateSnapshot")
    base_baseline: Mapped["StateBaseline | None"] = relationship("StateBaseline")

    __table_args__ = (
        Index("ix_scenarios_graph_id", "graph_id"),
    )

    def __repr__(self) -> str:
        return f"<Scenario id={self.id} name={self.name!r}>"


class SourceReliability(UUIDMixin, TimestampMixin, Base):
    """
    Domain-independent registry for sensor / data-source reliability metadata.
    """

    __tablename__ = "source_reliabilities"

    source: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default=SourceReliabilityStatus.ACTIVE
    )
    reliability_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)

    def __repr__(self) -> str:
        return f"<SourceReliability source={self.source!r} status={self.status}>"
