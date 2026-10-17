"""
CAUSAL API — Infrastructure Graph models (Phase 2).

Defines the three core graph entities:
  - InfrastructureGraph: the top-level container
  - Node: a system entity within the graph
  - Dependency: a directed relationship source → target

Dependency semantics:
  source → target means TARGET DEPENDS ON SOURCE.

Example:
  Power Station → Hospital  (Hospital depends on Power Station)

These models are DOMAIN-INDEPENDENT. The "type" and "domain" fields
are free-form strings so the engine works with any infrastructure
without code changes.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import (
    Boolean,
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


# ── NodeState constants ────────────────────────────────────────────────────
# Stored as strings in the DB for readability; validated at the service layer.
# Required states per Phase 2 spec:

class NodeState:
    """
    Conceptual node states.

    Phase 2 does NOT build a state machine — these are validated labels only.
    Do NOT add business logic here.
    """

    NORMAL = "NORMAL"
    DEGRADED = "DEGRADED"
    CRITICAL = "CRITICAL"
    FAILED = "FAILED"
    RECOVERING = "RECOVERING"
    UNKNOWN = "UNKNOWN"

    ALL: tuple[str, ...] = (NORMAL, DEGRADED, CRITICAL, FAILED, RECOVERING, UNKNOWN)

    # Basic consistency: health above this threshold is inconsistent with FAILED
    FAILED_MAX_HEALTH: float = 0.1
    # Health below this threshold is inconsistent with NORMAL
    NORMAL_MIN_HEALTH: float = 0.5


# ── Range constants ────────────────────────────────────────────────────────

HEALTH_MIN = 0.0
HEALTH_MAX = 1.0
CAPACITY_MIN = 0.0
CAPACITY_MAX = 1.0
CRITICALITY_MIN = 0.0
CRITICALITY_MAX = 1.0
STRENGTH_MIN = 0.0
STRENGTH_MAX = 1.0
FAILURE_PROPAGATION_MIN = 0.0
FAILURE_PROPAGATION_MAX = 1.0


# ── InfrastructureGraph ────────────────────────────────────────────────────

class InfrastructureGraph(UUIDMixin, TimestampMixin, Base):
    """
    Top-level container for a directed dependency graph.

    The domain field is descriptive only — arbitrary strings are accepted.
    Possible values: power, healthcare, water, telecom, transport, mixed, etc.
    The graph engine works with any domain without code changes.
    """

    __tablename__ = "infrastructure_graphs"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    domain: Mapped[str | None] = mapped_column(String(100), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    metadata_: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata", JSON, nullable=True, default=None
    )

    # Relationships (lazy-loaded; used by services, not exposed in API)
    nodes: Mapped[list["Node"]] = relationship(
        "Node",
        back_populates="graph",
        cascade="all, delete-orphan",
        lazy="select",
    )
    dependencies: Mapped[list["Dependency"]] = relationship(
        "Dependency",
        back_populates="graph",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<InfrastructureGraph id={self.id} name={self.name!r}>"


# ── Node ──────────────────────────────────────────────────────────────────

class Node(UUIDMixin, TimestampMixin, Base):
    """
    A system entity within an InfrastructureGraph.

    Node types are generic (power_source, facility, network, etc.).
    The type field is a free-form string — no hardcoded enum.

    Health, capacity, and criticality are normalised 0.0–1.0 floats.
    Validation is enforced at the service layer via NodeState and range constants.
    """

    __tablename__ = "nodes"

    graph_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Operational state — one of NodeState.ALL values
    state: Mapped[str] = mapped_column(
        String(50), nullable=False, default=NodeState.NORMAL
    )

    # Normalised metrics [0.0, 1.0]
    health: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    capacity: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    criticality: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)

    # Optional geographic/logical location (lat, lon, zone, etc.)
    location: Mapped[dict[str, Any] | None] = mapped_column(
        JSON, nullable=True, default=None
    )
    metadata_: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata", JSON, nullable=True, default=None
    )

    # Relationships
    graph: Mapped["InfrastructureGraph"] = relationship(
        "InfrastructureGraph", back_populates="nodes"
    )

    __table_args__ = (
        Index("ix_nodes_graph_id", "graph_id"),
    )

    def __repr__(self) -> str:
        return f"<Node id={self.id} name={self.name!r} state={self.state!r}>"


# ── Dependency ────────────────────────────────────────────────────────────

class Dependency(UUIDMixin, TimestampMixin, Base):
    """
    A directed dependency edge between two Nodes in the same graph.

    Semantics:
        source_node → target_node
        means: TARGET depends on SOURCE.

    Example:
        Power Station (source) → Hospital (target)
        Hospital depends on Power Station.

    Uniqueness: (graph_id, source_node_id, target_node_id) is unique.
    Self-loops are rejected at the service layer (source != target).

    failure_propagation is DATA ONLY in Phase 2.
    Phase 6 will interpret it for cascade prediction.
    """

    __tablename__ = "dependencies"

    graph_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
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

    # Generic type string — physical, logical, energy, water, control, etc.
    dependency_type: Mapped[str] = mapped_column(String(100), nullable=False)

    # Dependency strength [0.0, 1.0]
    strength: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)

    # True: target fundamentally requires source
    required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Data-only in Phase 2 — interpreted by Phase 6 cascade engine
    failure_propagation: Mapped[float] = mapped_column(
        Float, nullable=False, default=1.0
    )

    metadata_: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata", JSON, nullable=True, default=None
    )

    # Relationships
    graph: Mapped["InfrastructureGraph"] = relationship(
        "InfrastructureGraph", back_populates="dependencies"
    )
    source_node: Mapped["Node"] = relationship(
        "Node", foreign_keys=[source_node_id]
    )
    target_node: Mapped["Node"] = relationship(
        "Node", foreign_keys=[target_node_id]
    )

    __table_args__ = (
        # Prevent duplicate edges in the same graph
        UniqueConstraint(
            "graph_id",
            "source_node_id",
            "target_node_id",
            name="uq_dependency_edge",
        ),
        Index("ix_dependencies_graph_id", "graph_id"),
        Index("ix_dependencies_source_node_id", "source_node_id"),
        Index("ix_dependencies_target_node_id", "target_node_id"),
    )

    def __repr__(self) -> str:
        return (
            f"<Dependency id={self.id} "
            f"source={self.source_node_id} → target={self.target_node_id}>"
        )
