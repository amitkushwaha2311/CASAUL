"""
CAUSAL API — System model.

Represents a monitored infrastructure system (power grid, water network, etc.).
Phase 1 establishes the table only.
The full infrastructure graph schema comes in Phase 2.
"""

import uuid
from enum import Enum

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class SystemDomain(str, Enum):
    """Infrastructure domain categories."""

    POWER = "power"
    WATER = "water"
    TELECOM = "telecom"
    HEALTHCARE = "healthcare"
    TRANSPORTATION = "transportation"
    INDUSTRIAL = "industrial"
    UNKNOWN = "unknown"


class SystemStatus(str, Enum):
    """Operational status of a monitored system."""

    NORMAL = "normal"
    DEGRADED = "degraded"
    CRITICAL = "critical"
    FAILED = "failed"
    RECOVERING = "recovering"
    SIMULATION = "simulation"
    UNKNOWN = "unknown"


class System(UUIDMixin, TimestampMixin, Base):
    """
    A top-level monitored infrastructure system.

    Phase 2 will extend this with the dependency graph,
    node topology, sensor streams, and causal model links.
    """

    __tablename__ = "systems"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    domain: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default=SystemDomain.UNKNOWN.value,
    )
    status: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default=SystemStatus.UNKNOWN.value,
        index=True,
    )
    # JSONB metadata bag for future extensibility
    metadata_: Mapped[dict | None] = mapped_column(
        "metadata",
        JSONB,
        nullable=True,
        default=None,
    )

    # Created by (nullable — auth is not yet implemented)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    __table_args__ = (
        Index("ix_systems_domain_status", "domain", "status"),
    )

    def __repr__(self) -> str:
        return f"<System id={self.id} name={self.name!r} domain={self.domain!r}>"
