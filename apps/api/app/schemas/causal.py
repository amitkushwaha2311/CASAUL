"""
CAUSAL API — Pydantic schemas for Phase 5: Causal Reasoning & Evidence Engine.

Defines schemas for:
- Evidence items (supporting, contradicting, neutral with provenance)
- Causal hypothesis representations
- Causal inference request and response
- Filtering and listing hypotheses
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# ── Evidence Schemas ─────────────────────────────────────────────────────────

class EvidenceItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    hypothesis_id: uuid.UUID
    graph_id: uuid.UUID
    related_node_id: uuid.UUID | None = None
    direction: Literal["SUPPORTING", "CONTRADICTING", "NEUTRAL"]
    evidence_type: str
    summary: str
    source_record_type: Literal["observation", "event", "dependency", "state_history"]
    source_record_id: uuid.UUID | None = None
    event_id: uuid.UUID | None = None
    observation_id: uuid.UUID | None = None
    dependency_id: uuid.UUID | None = None
    observed_at: datetime | None = None
    source: str | None = None
    confidence: float | None = None
    details: dict[str, Any] | None = None
    created_at: datetime


# ── Hypothesis Schemas ──────────────────────────────────────────────────────

class HypothesisResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    run_id: uuid.UUID
    graph_id: uuid.UUID
    affected_node_id: uuid.UUID
    affected_node_name: str | None = None
    candidate_cause_node_id: uuid.UUID | None = None
    candidate_cause_node_name: str | None = None

    hypothesis_type: Literal[
        "UPSTREAM_DEPENDENCY_FAILURE",
        "LOCAL_NODE_DEGRADATION",
        "TELEMETRY_OR_SENSOR_ANOMALY",
        "EXTERNAL_ENVIRONMENTAL_SHOCK",
        "INSUFFICIENT_EVIDENCE",
    ]
    inference_rule: str
    status: Literal["SUPPORTED", "POSSIBLE", "CONTRADICTED", "INSUFFICIENT_EVIDENCE"]

    explanation: str
    evidence_completeness_ratio: float
    unresolved_assumptions: list[str] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)
    confidence_assessment: str | None = None
    evidence_items: list[EvidenceItemResponse] = Field(default_factory=list)
    metadata: dict[str, Any] | None = Field(None, alias="metadata_")
    created_at: datetime


class CausalAnalysisRequest(BaseModel):
    target_node_id: uuid.UUID | None = Field(
        None, description="Optional target node to diagnose. If omitted, all degraded/critical nodes are evaluated."
    )
    affected_node_id: uuid.UUID | None = Field(
        None, description="Alias for target_node_id."
    )
    max_hops: int = Field(2, ge=1, le=5, description="Maximum upstream dependency depth to evaluate.")
    as_of: datetime | None = Field(
        None, description="Logical timestamp up to which evidence is considered (defaults to current time)."
    )

    def get_node_id(self) -> uuid.UUID | None:
        return self.target_node_id or self.affected_node_id



class CausalInferenceRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    graph_id: uuid.UUID
    target_node_id: uuid.UUID | None = None
    rule_version: str
    analyzed_at: datetime
    total_hypotheses_generated: int
    hypotheses: list[HypothesisResponse]
    input_context: dict[str, Any] | None = None
    created_at: datetime
