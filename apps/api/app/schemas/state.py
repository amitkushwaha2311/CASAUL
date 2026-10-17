"""
CAUSAL API — Pydantic schemas for Phase 4: System State & Digital Twin Engine.

Defines schemas for:
- Current state representation (node, graph)
- State history records and queries
- State reconstruction at timestamp
- Consistency validation
- Baseline capture and responses
- Snapshot capture and responses
- State comparison (baseline vs current, snapshot vs current, snapshot A vs B)
- Scenario management (isolated snapshots without mutating live state)
- System summary metrics
- Source reliability metadata
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ── Provenance & Confidence metadata ────────────────────────────────────────

class StateProvenance(BaseModel):
    """Auditable origin details for a state attribute or entry."""
    source: str
    source_type: Literal["observation", "event", "baseline", "initialization", "manual", "reconstruction"]
    observation_id: uuid.UUID | None = None
    event_id: uuid.UUID | None = None
    baseline_id: uuid.UUID | None = None
    observed_at: datetime | None = None
    recorded_at: datetime | None = None
    details: dict[str, Any] | None = None


# ── Current Node & Graph State ──────────────────────────────────────────────

class NodeStateDetail(BaseModel):
    """Canonical representation of an individual node's operational state."""
    model_config = ConfigDict(from_attributes=True)

    node_id: uuid.UUID
    graph_id: uuid.UUID
    node_name: str
    node_type: str
    state: str  # NORMAL, DEGRADED, CRITICAL, FAILED, RECOVERING, or UNKNOWN
    health: float | None = None  # None if never observed
    capacity: float | None = None  # None if never observed
    availability: float | None = None  # None if not explicitly tracked
    criticality: float = 0.5
    last_observed_at: datetime | None = None
    last_state_change_at: datetime | None = None
    confidence: float | None = None  # None if unknown
    source: str | None = None
    consistency_status: str = "VALID"  # VALID, WARNING, INVALID, UNKNOWN
    is_known: bool = True
    provenance: StateProvenance | None = None


class CurrentGraphStateResponse(BaseModel):
    """Canonical graph state containing all nodes and overall consistency."""
    graph_id: uuid.UUID
    graph_name: str
    as_of: datetime
    total_nodes: int
    nodes: list[NodeStateDetail]
    completeness_ratio: float
    consistency_status: str


class CurrentNodeStateResponse(BaseModel):
    """Canonical current state response for a single node."""
    node: NodeStateDetail


# ── State History ───────────────────────────────────────────────────────────

class StateHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    graph_id: uuid.UUID
    node_id: uuid.UUID
    event_id: uuid.UUID | None = None
    observation_id: uuid.UUID | None = None
    state: str | None = None
    health: float | None = None
    capacity: float | None = None
    availability: float | None = None
    metric: str | None = None
    value_numeric: float | None = None
    value_text: str | None = None
    confidence: float | None = None
    source: str
    change_reason: str | None = None
    observed_at: datetime
    recorded_at: datetime
    provenance_metadata: dict[str, Any] | None = None


# ── State Consistency ───────────────────────────────────────────────────────

class NodeConsistencyIssue(BaseModel):
    node_id: uuid.UUID
    node_name: str
    rule_code: str
    severity: Literal["WARNING", "INVALID", "UNKNOWN"]
    message: str
    state: str | None = None
    health: float | None = None
    capacity: float | None = None


class StateConsistencyResponse(BaseModel):
    graph_id: uuid.UUID
    status: Literal["VALID", "WARNING", "INVALID", "UNKNOWN"]
    total_checked: int
    valid_count: int
    warning_count: int
    invalid_count: int
    unknown_count: int
    issues: list[NodeConsistencyIssue]


# ── State Reconstruction ───────────────────────────────────────────────────

class StateReconstructionResponse(BaseModel):
    graph_id: uuid.UUID
    node_id: uuid.UUID | None = None
    requested_timestamp: datetime
    effective_timestamp: datetime | None = None
    reconstructed_at: datetime
    is_complete: bool
    completeness_ratio: float
    records_evaluated: int
    completeness_note: str | None = None
    nodes: list[NodeStateDetail]


# ── Baselines ───────────────────────────────────────────────────────────────

class BaselineCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    is_active: bool = False
    metadata: dict[str, Any] | None = None


class BaselineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    graph_id: uuid.UUID
    name: str
    description: str | None = None
    is_active: bool
    captured_at: datetime
    completeness_ratio: float
    node_count: int
    node_states: dict[str, Any]
    metadata: dict[str, Any] | None = Field(None, alias="metadata_")
    created_at: datetime


# ── Snapshots ──────────────────────────────────────────────────────────────

class SnapshotCreate(BaseModel):
    name: str | None = Field(None, max_length=255)
    snapshot_type: Literal["LIVE", "RECONSTRUCTED"] = "LIVE"
    effective_at: datetime | None = None  # defaults to current UTC if LIVE
    metadata: dict[str, Any] | None = None


class SnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    graph_id: uuid.UUID
    name: str | None = None
    snapshot_type: str
    captured_at: datetime
    effective_at: datetime
    completeness_ratio: float
    node_count: int
    node_states: dict[str, Any]
    summary: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = Field(None, alias="metadata_")
    created_at: datetime


# ── Comparisons ─────────────────────────────────────────────────────────────

class NodeStateDiff(BaseModel):
    node_id: uuid.UUID
    node_name: str
    field_name: str  # state, health, capacity, availability, etc.
    previous_value: Any
    current_value: Any
    previous_timestamp: datetime | None = None
    current_timestamp: datetime | None = None
    change_type: Literal["MODIFIED", "ADDED", "REMOVED", "UNCHANGED"]


class NodeComparisonDetail(BaseModel):
    node_id: uuid.UUID
    node_name: str
    is_changed: bool
    diffs: list[NodeStateDiff]


class StateComparisonResponse(BaseModel):
    graph_id: uuid.UUID
    comparison_type: Literal["BASELINE_VS_CURRENT", "SNAPSHOT_VS_CURRENT", "SNAPSHOT_VS_SNAPSHOT"]
    source_a_label: str
    source_b_label: str
    source_a_timestamp: datetime | None = None
    source_b_timestamp: datetime | None = None
    total_nodes_compared: int
    changed_nodes_count: int
    unchanged_nodes_count: int
    completeness_limitations: str | None = None
    node_comparisons: list[NodeComparisonDetail]


# ── Scenarios ───────────────────────────────────────────────────────────────

class ScenarioCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    base_snapshot_id: uuid.UUID | None = None
    base_baseline_id: uuid.UUID | None = None
    state_overrides: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] | None = None


class ScenarioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    graph_id: uuid.UUID
    name: str
    description: str | None = None
    base_snapshot_id: uuid.UUID | None = None
    base_baseline_id: uuid.UUID | None = None
    state_overrides: dict[str, Any]
    metadata: dict[str, Any] | None = Field(None, alias="metadata_")
    created_at: datetime
    updated_at: datetime


# ── System Summary ──────────────────────────────────────────────────────────

class SystemStateSummaryResponse(BaseModel):
    graph_id: uuid.UUID
    as_of: datetime
    total_nodes: int
    nodes_with_known_state: int
    nodes_with_unknown_state: int
    count_by_operational_state: dict[str, int]
    average_health: float | None = None  # None if no known health
    health_denominator: int = 0
    average_capacity: float | None = None  # None if no known capacity
    capacity_denominator: int = 0
    average_criticality: float = 0.5
    latest_state_update_at: datetime | None = None
    completeness_ratio: float
    consistency_warning_count: int
    consistency_invalid_count: int


# ── Source Reliability ──────────────────────────────────────────────────────

class SourceReliabilityCreate(BaseModel):
    source: str = Field(..., min_length=1, max_length=100)
    status: Literal["ACTIVE", "DEGRADED", "UNRELIABLE", "UNKNOWN"] = "ACTIVE"
    reliability_score: float | None = Field(None, ge=0.0, le=1.0)
    description: str | None = None
    metadata: dict[str, Any] | None = None


class SourceReliabilityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source: str
    status: str
    reliability_score: float | None = None
    last_validated_at: datetime | None = None
    description: str | None = None
    metadata: dict[str, Any] | None = Field(None, alias="metadata_")
    created_at: datetime
    updated_at: datetime
