"""
CAUSAL API — Phase 6 Pydantic Schemas for Cascade Prediction Engine.

Defines schemas for:
  - Cascade forecast requests (horizon, bounds, mode, seed, threshold)
  - Individual predicted node outcomes (with uncertainty intervals and time-to-impact)
  - Directed propagation paths and delay sources
  - Severity and impact summary metrics
  - Chronological cascade timeline events
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class CascadeForecastRequest(BaseModel):
    """Parameters for running a cascade forecast simulation."""

    initiating_node_id: uuid.UUID | None = Field(
        None,
        description="Optional initial disturbed node. If None, all currently degraded/failed nodes serve as disturbances.",
    )
    horizon_minutes: float = Field(
        60.0,
        ge=1.0,
        le=1440.0,
        description="Simulation time horizon in minutes (max 24 hours).",
    )
    max_depth: int = Field(
        5,
        ge=1,
        le=20,
        description="Maximum dependency traversal depth.",
    )
    simulation_mode: Literal["DETERMINISTIC", "MONTE_CARLO"] = Field(
        "DETERMINISTIC",
        description="Execution mode: DETERMINISTIC heuristic or reproducible MONTE_CARLO sampling.",
    )
    seed: int | None = Field(
        42,
        description="Random seed for deterministic reproducibility in stochastic modes.",
    )
    propagation_probability_threshold: float = Field(
        0.2,
        ge=0.0,
        le=1.0,
        description="Minimum heuristic probability required to include a downstream node as predicted affected.",
    )
    custom_delay_assumptions: dict[str, float] | None = Field(
        None,
        description="Optional custom delay assumptions in seconds keyed by dependency type (e.g. {'power': 45.0}).",
    )


class TimeToImpactRange(BaseModel):
    """Time-to-impact interval and underlying assumption."""

    min_seconds: float
    max_seconds: float
    point_estimate_seconds: float
    assumption: str
    delay_source: Literal["METADATA", "HEURISTIC_DEFAULT", "UNKNOWN"]


class PredictedNodeDetail(BaseModel):
    """Detailed forecast outcome for an individual node."""

    model_config = ConfigDict(from_attributes=True)

    node_id: uuid.UUID
    node_name: str
    node_type: str
    criticality: float
    forecast_status: Literal["ALREADY_AFFECTED", "PREDICTED_AFFECTED", "UNAFFECTED"]
    current_state: str
    predicted_state: str
    predicted_impact_level: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    earliest_impact_seconds: float | None = None
    latest_impact_seconds: float | None = None
    time_to_impact_range: TimeToImpactRange | None = None
    propagation_probability_min: float | None = None
    propagation_probability_max: float | None = None
    propagation_probability_point: float | None = None
    calibration_status: Literal["HEURISTIC_ESTIMATE", "CALIBRATED", "UNAVAILABLE"] = (
        "HEURISTIC_ESTIMATE"
    )
    depth: int = 0
    path_summary: list[str] = Field(default_factory=list)
    contributing_causes: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class PropagationPathDetail(BaseModel):
    """Directed propagation edge traversed during simulation."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_node_id: uuid.UUID
    source_node_name: str
    target_node_id: uuid.UUID
    target_node_name: str
    dependency_id: uuid.UUID | None = None
    hop_number: int = 1
    estimated_delay_seconds: float | None = None
    delay_source: Literal["METADATA", "HEURISTIC_DEFAULT", "UNKNOWN"] = "HEURISTIC_DEFAULT"
    attenuation_factor: float = 1.0
    propagation_rationale: str


class CascadeImpactSummary(BaseModel):
    """High-level summary of cascade forecast consequences."""

    total_nodes: int
    total_already_affected: int
    total_predicted_affected: int
    total_unaffected: int
    total_critical_affected: int
    max_depth_reached: int
    impact_by_severity: dict[str, int]
    impact_by_domain: dict[str, int]
    critical_nodes_at_risk: list[dict[str, Any]]
    composite_criticality_impact_percent: float
    composite_metric_explanation: str
    assumptions: list[str]
    warnings: list[str]
    limitations: list[str]


class CascadeForecastResponse(BaseModel):
    """Complete cascade forecast response."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    graph_id: uuid.UUID
    initiating_node_id: uuid.UUID | None = None
    rule_version: str = "1.0.0"
    simulation_mode: str = "DETERMINISTIC"
    calibration_status: str = "HEURISTIC_ESTIMATE"
    horizon_minutes: float
    max_depth: int
    seed: int | None = None
    source_state_timestamp: datetime | None = None
    total_already_affected: int
    total_predicted_affected: int
    total_critical_affected: int
    max_depth_reached: int
    impact_summary: CascadeImpactSummary
    predicted_nodes: list[PredictedNodeDetail]
    propagation_paths: list[PropagationPathDetail]
    created_at: datetime


class CascadeTimelineEvent(BaseModel):
    """Chronological event in the cascade simulation timeline."""

    timestamp_offset_seconds: float
    estimated_time: datetime | None = None
    node_id: uuid.UUID
    node_name: str
    event_type: str
    forecast_status: str
    predicted_state: str
    impact_level: str
    depth: int
    propagation_probability_point: float | None = None
    explanation: str


class CascadeTimelineResponse(BaseModel):
    """Chronological event feed of projected failure timeline."""

    forecast_id: uuid.UUID
    graph_id: uuid.UUID
    horizon_minutes: float
    events: list[CascadeTimelineEvent]


class CascadeForecastListItem(BaseModel):
    """Brief summary item for forecast run listings."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    graph_id: uuid.UUID
    initiating_node_id: uuid.UUID | None = None
    rule_version: str
    simulation_mode: str
    calibration_status: str
    horizon_minutes: float
    total_already_affected: int
    total_predicted_affected: int
    total_critical_affected: int
    max_depth_reached: int
    created_at: datetime


class CascadeForecastListResponse(BaseModel):
    """Paginated list of cascade forecasts."""

    items: list[CascadeForecastListItem]
    total: int
    page: int
    page_size: int
