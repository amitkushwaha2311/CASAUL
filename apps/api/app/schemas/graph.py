"""
CAUSAL API — Phase 2 Pydantic schemas for the Graph Engine.

These schemas define the REST API surface.
SQLAlchemy models are NOT exposed directly.

Schemas are intentionally separate from models so the API contract
can evolve independently of the persistence layer.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.graph_models import (
    NodeState,
    HEALTH_MIN, HEALTH_MAX,
    CAPACITY_MIN, CAPACITY_MAX,
    CRITICALITY_MIN, CRITICALITY_MAX,
    STRENGTH_MIN, STRENGTH_MAX,
    FAILURE_PROPAGATION_MIN, FAILURE_PROPAGATION_MAX,
)


# ── Helpers ────────────────────────────────────────────────────────────────

def _validate_unit_float(v: float, name: str) -> float:
    """Validate that a float is in [0.0, 1.0]."""
    if not (0.0 <= v <= 1.0):
        raise ValueError(f"{name} must be between 0.0 and 1.0, got {v}")
    return v


# ── InfrastructureGraph schemas ────────────────────────────────────────────

class GraphCreate(BaseModel):
    """Schema for creating a new InfrastructureGraph."""

    name: str = Field(..., min_length=1, max_length=255, description="Human-readable graph name")
    description: str | None = Field(None, description="Optional description")
    domain: str | None = Field(
        None, max_length=100,
        description="Descriptive domain (e.g. power, healthcare, water). Any string accepted."
    )
    version: int = Field(1, ge=1, description="Graph schema version")
    metadata: dict[str, Any] | None = Field(None, description="Arbitrary metadata bag")


class GraphUpdate(BaseModel):
    """Schema for partial update of an InfrastructureGraph."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    domain: str | None = Field(None, max_length=100)
    version: int | None = Field(None, ge=1)
    metadata: dict[str, Any] | None = None


class GraphResponse(BaseModel):
    """Schema for a full InfrastructureGraph API response."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    description: str | None
    domain: str | None
    version: int
    metadata: dict[str, Any] | None = Field(None, alias="metadata_")
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm(cls, obj: Any) -> "GraphResponse":
        return cls.model_validate(obj)


# ── Node schemas ───────────────────────────────────────────────────────────

class NodeCreate(BaseModel):
    """Schema for creating a Node within a graph."""

    name: str = Field(..., min_length=1, max_length=255)
    type: str = Field(
        ..., min_length=1, max_length=100,
        description=(
            "Node type. Generic — examples: power_source, facility, network, "
            "transport, service, storage, control, sensor, resource, custom."
        )
    )
    description: str | None = None
    state: str = Field(
        NodeState.NORMAL,
        description=f"Operational state. Must be one of: {', '.join(NodeState.ALL)}"
    )
    health: float = Field(1.0, ge=HEALTH_MIN, le=HEALTH_MAX, description="Health [0.0, 1.0]")
    capacity: float = Field(1.0, ge=CAPACITY_MIN, le=CAPACITY_MAX, description="Capacity [0.0, 1.0]")
    criticality: float = Field(0.5, ge=CRITICALITY_MIN, le=CRITICALITY_MAX, description="Criticality [0.0, 1.0]")
    location: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None

    @field_validator("state")
    @classmethod
    def state_must_be_valid(cls, v: str) -> str:
        if v not in NodeState.ALL:
            raise ValueError(
                f"Invalid state '{v}'. Must be one of: {', '.join(NodeState.ALL)}"
            )
        return v

    @model_validator(mode="after")
    def check_state_health_consistency(self) -> "NodeCreate":
        """Prevent obviously contradictory state/health combinations."""
        if self.state == NodeState.FAILED and self.health > NodeState.FAILED_MAX_HEALTH:
            raise ValueError(
                f"State FAILED is inconsistent with health={self.health:.2f}. "
                f"FAILED nodes must have health <= {NodeState.FAILED_MAX_HEALTH}."
            )
        if self.state == NodeState.NORMAL and self.health < NodeState.NORMAL_MIN_HEALTH:
            raise ValueError(
                f"State NORMAL is inconsistent with health={self.health:.2f}. "
                f"NORMAL nodes must have health >= {NodeState.NORMAL_MIN_HEALTH}."
            )
        return self


class NodeUpdate(BaseModel):
    """Schema for partial update of a Node."""

    name: str | None = Field(None, min_length=1, max_length=255)
    type: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    state: str | None = None
    health: float | None = Field(None, ge=HEALTH_MIN, le=HEALTH_MAX)
    capacity: float | None = Field(None, ge=CAPACITY_MIN, le=CAPACITY_MAX)
    criticality: float | None = Field(None, ge=CRITICALITY_MIN, le=CRITICALITY_MAX)
    location: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None

    @field_validator("state")
    @classmethod
    def state_must_be_valid(cls, v: str | None) -> str | None:
        if v is not None and v not in NodeState.ALL:
            raise ValueError(
                f"Invalid state '{v}'. Must be one of: {', '.join(NodeState.ALL)}"
            )
        return v


class NodeStateUpdate(BaseModel):
    """Schema for controlled state/health/capacity updates via NodeStateService."""

    state: str | None = None
    health: float | None = Field(None, ge=HEALTH_MIN, le=HEALTH_MAX)
    capacity: float | None = Field(None, ge=CAPACITY_MIN, le=CAPACITY_MAX)

    @field_validator("state")
    @classmethod
    def state_must_be_valid(cls, v: str | None) -> str | None:
        if v is not None and v not in NodeState.ALL:
            raise ValueError(
                f"Invalid state '{v}'. Must be one of: {', '.join(NodeState.ALL)}"
            )
        return v


class NodeResponse(BaseModel):
    """Schema for a full Node API response."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    graph_id: uuid.UUID
    name: str
    type: str
    description: str | None
    state: str
    health: float
    capacity: float
    criticality: float
    location: dict[str, Any] | None
    metadata: dict[str, Any] | None = Field(None, alias="metadata_")
    created_at: datetime
    updated_at: datetime


# ── Dependency schemas ─────────────────────────────────────────────────────

class DependencyCreate(BaseModel):
    """
    Schema for creating a Dependency edge.

    source_node_id → target_node_id
    means target depends on source.
    """

    source_node_id: uuid.UUID
    target_node_id: uuid.UUID
    dependency_type: str = Field(
        ..., min_length=1, max_length=100,
        description=(
            "Dependency type. Generic — examples: physical, logical, resource, "
            "communication, energy, water, transport, control, service, custom."
        )
    )
    strength: float = Field(
        1.0, ge=STRENGTH_MIN, le=STRENGTH_MAX,
        description="Strength of dependency [0.0, 1.0]. 1.0 = extremely strong."
    )
    required: bool = Field(
        True, description="True if target fundamentally requires source."
    )
    failure_propagation: float = Field(
        1.0, ge=FAILURE_PROPAGATION_MIN, le=FAILURE_PROPAGATION_MAX,
        description="Potential impact strength [0.0, 1.0]. DATA ONLY in Phase 2."
    )
    metadata: dict[str, Any] | None = None

    @model_validator(mode="after")
    def no_self_dependency(self) -> "DependencyCreate":
        if self.source_node_id == self.target_node_id:
            raise ValueError(
                "A node cannot depend on itself (source_node_id == target_node_id)."
            )
        return self


class DependencyUpdate(BaseModel):
    """Schema for partial update of a Dependency."""

    dependency_type: str | None = Field(None, min_length=1, max_length=100)
    strength: float | None = Field(None, ge=STRENGTH_MIN, le=STRENGTH_MAX)
    required: bool | None = None
    failure_propagation: float | None = Field(
        None, ge=FAILURE_PROPAGATION_MIN, le=FAILURE_PROPAGATION_MAX
    )
    metadata: dict[str, Any] | None = None


class DependencyResponse(BaseModel):
    """Schema for a full Dependency API response."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    graph_id: uuid.UUID
    source_node_id: uuid.UUID
    target_node_id: uuid.UUID
    dependency_type: str
    strength: float
    required: bool
    failure_propagation: float
    metadata: dict[str, Any] | None = Field(None, alias="metadata_")
    created_at: datetime
    updated_at: datetime


# ── Traversal schemas ──────────────────────────────────────────────────────

class NodeSummary(BaseModel):
    """Compact node representation used in traversal results."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    type: str
    state: str
    health: float
    criticality: float


class PathResponse(BaseModel):
    """A dependency path between two nodes."""

    source_id: uuid.UUID
    target_id: uuid.UUID
    path: list[uuid.UUID]
    path_nodes: list[NodeSummary]
    found: bool


class NeighborhoodResponse(BaseModel):
    """N-hop neighborhood around a node."""

    center_node_id: uuid.UUID
    depth: int
    nodes: list[NodeSummary]
    dependencies: list[DependencyResponse]


# ── Statistics schema ──────────────────────────────────────────────────────

class GraphStatisticsResponse(BaseModel):
    """
    Deterministic statistics about an InfrastructureGraph.

    Does NOT include:
    - risk scores
    - failure probabilities
    - cascade predictions
    - causal inferences

    Those belong to later phases.
    """

    graph_id: uuid.UUID
    node_count: int
    dependency_count: int

    # State distribution
    healthy_node_count: int
    degraded_node_count: int
    critical_node_count: int
    failed_node_count: int
    recovering_node_count: int

    # Aggregate metrics
    average_health: float
    average_criticality: float

    # Topology
    connected_components: int
    isolated_nodes: int
    cycle_count: int


# ── Validation schemas ─────────────────────────────────────────────────────

class ValidationIssue(BaseModel):
    """A single validation finding."""

    severity: str  # "ERROR" | "WARNING" | "INFO"
    code: str
    message: str
    node_id: uuid.UUID | None = None
    dependency_id: uuid.UUID | None = None


class GraphValidationResponse(BaseModel):
    """Result of validating an InfrastructureGraph."""

    graph_id: uuid.UUID
    valid: bool  # True only when there are zero ERRORs
    issues: list[ValidationIssue]
    error_count: int
    warning_count: int
    info_count: int
