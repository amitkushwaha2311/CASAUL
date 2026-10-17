"""
CAUSAL API — Causal Reasoning & Evidence Engine models (Phase 5).

Defines:
  - CausalInferenceRun: Audit container recording an execution of the reasoning engine.
  - CausalHypothesis: Individual, explainable hypothesis explaining a node condition.
  - HypothesisEvidence: Traceable evidence item linking directly to existing records.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class HypothesisStatus:
    SUPPORTED = "SUPPORTED"
    POSSIBLE = "POSSIBLE"
    CONTRADICTED = "CONTRADICTED"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    ALL = (SUPPORTED, POSSIBLE, CONTRADICTED, INSUFFICIENT_EVIDENCE)


class EvidenceDirection:
    SUPPORTING = "SUPPORTING"
    CONTRADICTING = "CONTRADICTING"
    NEUTRAL = "NEUTRAL"
    ALL = (SUPPORTING, CONTRADICTING, NEUTRAL)


class HypothesisType:
    UPSTREAM_DEPENDENCY_FAILURE = "UPSTREAM_DEPENDENCY_FAILURE"
    LOCAL_NODE_DEGRADATION = "LOCAL_NODE_DEGRADATION"
    TELEMETRY_OR_SENSOR_ANOMALY = "TELEMETRY_OR_SENSOR_ANOMALY"
    EXTERNAL_ENVIRONMENTAL_SHOCK = "EXTERNAL_ENVIRONMENTAL_SHOCK"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    ALL = (
        UPSTREAM_DEPENDENCY_FAILURE,
        LOCAL_NODE_DEGRADATION,
        TELEMETRY_OR_SENSOR_ANOMALY,
        EXTERNAL_ENVIRONMENTAL_SHOCK,
        INSUFFICIENT_EVIDENCE,
    )


class CausalInferenceRun(UUIDMixin, TimestampMixin, Base):
    """
    Audit record of an execution of the causal reasoning engine.
    """

    __tablename__ = "causal_inference_runs"

    graph_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_node_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    rule_version: Mapped[str] = mapped_column(String(50), nullable=False, default="1.0.0")
    analyzed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, index=True
    )
    total_hypotheses_generated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Summary bag of analysis context (target condition, timestamps, flags)
    input_context: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Relationships
    graph: Mapped["InfrastructureGraph"] = relationship("InfrastructureGraph")
    target_node: Mapped["Node | None"] = relationship("Node")
    hypotheses: Mapped[list["CausalHypothesis"]] = relationship(
        "CausalHypothesis",
        back_populates="run",
        cascade="all, delete-orphan",
        lazy="select",
    )

    __table_args__ = (
        Index("ix_causal_runs_graph_id", "graph_id"),
        Index("ix_causal_runs_analyzed_at", "analyzed_at"),
    )

    def __repr__(self) -> str:
        return f"<CausalInferenceRun id={self.id} graph_id={self.graph_id} count={self.total_hypotheses_generated}>"


class CausalHypothesis(UUIDMixin, TimestampMixin, Base):
    """
    An explainable, evidence-backed hypothesis regarding an observed node condition.
    """

    __tablename__ = "causal_hypotheses"

    run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("causal_inference_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    graph_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    affected_node_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    candidate_cause_node_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("nodes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    hypothesis_type: Mapped[str] = mapped_column(String(100), nullable=False)
    inference_rule: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default=HypothesisStatus.POSSIBLE
    )

    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_completeness_ratio: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    unresolved_assumptions: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    missing_evidence: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    # Auditable metadata & limitations
    confidence_assessment: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)

    # Relationships
    run: Mapped["CausalInferenceRun"] = relationship(
        "CausalInferenceRun", back_populates="hypotheses"
    )
    affected_node: Mapped["Node"] = relationship("Node", foreign_keys=[affected_node_id])
    candidate_cause_node: Mapped["Node | None"] = relationship(
        "Node", foreign_keys=[candidate_cause_node_id]
    )
    evidence_items: Mapped[list["HypothesisEvidence"]] = relationship(
        "HypothesisEvidence",
        back_populates="hypothesis",
        cascade="all, delete-orphan",
        lazy="select",
    )

    __table_args__ = (
        Index("ix_causal_hypotheses_graph_id", "graph_id"),
        Index("ix_causal_hypotheses_affected_node_id", "affected_node_id"),
        Index("ix_causal_hypotheses_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<CausalHypothesis id={self.id} rule={self.inference_rule} status={self.status}>"


class HypothesisEvidence(UUIDMixin, TimestampMixin, Base):
    """
    An individual piece of traceable evidence linked to a hypothesis.
    Points to real records: Event, Observation, Dependency, or StateHistory.
    """

    __tablename__ = "hypothesis_evidence"

    hypothesis_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("causal_hypotheses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    graph_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    related_node_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("nodes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    direction: Mapped[str] = mapped_column(
        String(50), nullable=False, default=EvidenceDirection.SUPPORTING
    )
    evidence_type: Mapped[str] = mapped_column(String(100), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)

    # Traceable references to source records
    source_record_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # observation, event, dependency, state_history
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)

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
    dependency_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("dependencies.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Observed & recorded timestamps
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    details: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Relationships
    hypothesis: Mapped["CausalHypothesis"] = relationship(
        "CausalHypothesis", back_populates="evidence_items"
    )
    related_node: Mapped["Node | None"] = relationship("Node")
    event: Mapped["Event | None"] = relationship("Event")
    observation: Mapped["Observation | None"] = relationship("Observation")
    dependency: Mapped["Dependency | None"] = relationship("Dependency")

    __table_args__ = (
        Index("ix_hypothesis_evidence_hypothesis_id", "hypothesis_id"),
        Index("ix_hypothesis_evidence_direction", "direction"),
    )

    def __repr__(self) -> str:
        return f"<HypothesisEvidence id={self.id} type={self.evidence_type} dir={self.direction}>"
