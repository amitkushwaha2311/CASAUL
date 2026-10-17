"""
CAUSAL API — Event and Observation models (Phase 3).

Defines the core temporal entities:
  - Event: something that occurred at a specific time.
  - Observation: a measured/observed fact, usually linked to an event and a node.
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
    String,
    Text,
    JSON,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class EventSeverity:
    INFO = "INFO"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"
    ALL = (INFO, LOW, MEDIUM, HIGH, CRITICAL)

class EventStatus:
    OPEN = "OPEN"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"
    DISMISSED = "DISMISSED"
    ALL = (OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED)


class Event(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "events"

    graph_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    severity: Mapped[str] = mapped_column(String(50), nullable=False, default=EventSeverity.INFO)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default=EventStatus.OPEN)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    
    evidence: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)

    # Relationships
    graph: Mapped["InfrastructureGraph"] = relationship(
        "InfrastructureGraph"
    )
    observations: Mapped[list["Observation"]] = relationship(
        "Observation",
        back_populates="event",
        cascade="all, delete-orphan",
        lazy="select",
    )

    __table_args__ = (
        Index("ix_events_graph_id", "graph_id"),
        Index("ix_events_timestamp", "timestamp"),
        Index("ix_events_severity", "severity"),
        Index("ix_events_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<Event id={self.id} type={self.event_type!r} severity={self.severity!r}>"


class Observation(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "observations"

    graph_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    node_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    observation_type: Mapped[str] = mapped_column(String(100), nullable=False)
    metric: Mapped[str] = mapped_column(String(100), nullable=False)
    
    # Practical representation for varying value types
    value_numeric: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    value_boolean: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    value_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)

    # Relationships
    graph: Mapped["InfrastructureGraph"] = relationship("InfrastructureGraph")
    node: Mapped["Node"] = relationship("Node")
    event: Mapped["Event"] = relationship("Event", back_populates="observations")

    __table_args__ = (
        Index("ix_observations_graph_id", "graph_id"),
        Index("ix_observations_node_id", "node_id"),
        Index("ix_observations_event_id", "event_id"),
        Index("ix_observations_timestamp", "timestamp"),
    )

    def __repr__(self) -> str:
        return f"<Observation id={self.id} metric={self.metric!r}>"
