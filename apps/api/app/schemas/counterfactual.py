"""
CAUSAL API — Phase 7: Counterfactual Simulation Engine Schemas.

Pydantic schemas for:
- Hypothetical changes (node overrides, capacity/health adjustments, dependency availability)
- Counterfactual experiments
- Differential outcome comparisons
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.counterfactual_models import (
    CounterfactualChangeType,
    CounterfactualExperimentStatus,
    CounterfactualTargetType,
)
from app.models.graph_models import NodeState


class CounterfactualChangeCreate(BaseModel):
    """
    Specification of a single hypothetical change applied to the simulation state.
    """

    target_type: str = Field(..., description="Target type: 'NODE' or 'DEPENDENCY'")
    target_id: uuid.UUID = Field(..., description="UUID of target node or dependency")
    change_type: str = Field(..., description="Type of hypothetical modification")
    original_value: Any | None = Field(
        default=None, description="Original baseline value (auto-filled if omitted)"
    )
    proposed_value: Any = Field(..., description="Hypothetical value to apply in simulation")
    unit: str | None = Field(default=None, max_length=50, description="Optional unit of measurement")
    rationale: str | None = Field(
        default=None, max_length=1000, description="User-provided rationale for this change"
    )

    @field_validator("target_type")
    @classmethod
    def validate_target_type(cls, v: str) -> str:
        upper = v.upper()
        if upper not in CounterfactualTargetType.ALL:
            raise ValueError(
                f"Invalid target_type {v!r}. Must be one of: {CounterfactualTargetType.ALL}"
            )
        return upper

    @field_validator("change_type")
    @classmethod
    def validate_change_type(cls, v: str) -> str:
        upper = v.upper()
        if upper not in CounterfactualChangeType.ALL:
            raise ValueError(
                f"Invalid change_type {v!r}. Must be one of: {CounterfactualChangeType.ALL}"
            )
        return upper

    @field_validator("proposed_value")
    @classmethod
    def validate_proposed_value(cls, v: Any, info: Any) -> Any:
        change_type = info.data.get("change_type")
        if not change_type:
            return v

        if change_type == CounterfactualChangeType.STATE_OVERRIDE:
            if not isinstance(v, str) or v.upper() not in NodeState.ALL:
                raise ValueError(
                    f"State override value must be a valid NodeState string: {NodeState.ALL}"
                )
            return v.upper()

        if change_type in (
            CounterfactualChangeType.HEALTH_OVERRIDE,
            CounterfactualChangeType.CAPACITY_OVERRIDE,
            CounterfactualChangeType.AVAILABILITY_OVERRIDE,
            CounterfactualChangeType.DEPENDENCY_STRENGTH,
        ):
            try:
                num = float(v)
            except (ValueError, TypeError):
                raise ValueError(f"Value for {change_type} must be a numeric float") from None
            if not (0.0 <= num <= 1.0):
                raise ValueError(f"Value for {change_type} must be between 0.0 and 1.0 (got {num})")
            return num

        if change_type == CounterfactualChangeType.DEPENDENCY_AVAILABILITY:
            if not isinstance(v, bool):
                if str(v).lower() in ("true", "1", "yes"):
                    return True
                elif str(v).lower() in ("false", "0", "no"):
                    return False
                raise ValueError("DEPENDENCY_AVAILABILITY must be a boolean (True/False)")
            return v

        if change_type == CounterfactualChangeType.DEPENDENCY_DELAY:
            try:
                delay = float(v)
            except (ValueError, TypeError):
                raise ValueError("DEPENDENCY_DELAY must be a numeric float in seconds") from None
            if delay < 0.0:
                raise ValueError("DEPENDENCY_DELAY must be non-negative (>= 0.0s)")
            return delay

        return v


class CounterfactualChangeResponse(BaseModel):
    """
    Persisted representation of a hypothetical change.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    experiment_id: uuid.UUID
    target_type: str
    target_id: uuid.UUID
    change_type: str
    original_value: Any | None = None
    proposed_value: Any
    unit: str | None = None
    rationale: str | None = None
    created_at: datetime


class CounterfactualForecastSettings(BaseModel):
    """
    Simulation parameters held constant across both baseline and counterfactual branches.
    """

    horizon_minutes: float = Field(default=60.0, ge=1.0, le=1440.0)
    max_depth: int = Field(default=5, ge=1, le=20)
    simulation_mode: str = Field(default="DETERMINISTIC")
    seed: int | None = Field(default=42)
    propagation_probability_threshold: float = Field(default=0.2, ge=0.0, le=1.0)
    initiating_node_id: uuid.UUID | None = Field(default=None)
    custom_delay_assumptions: dict[str, float] | None = Field(default=None)


class CounterfactualExperimentCreate(BaseModel):
    """
    Request payload to define a new counterfactual simulation experiment.
    """

    name: str = Field(..., min_length=1, max_length=255, description="Descriptive name")
    description: str | None = Field(default=None, max_length=2000)
    baseline_id: uuid.UUID | None = Field(
        default=None, description="Optional Phase 4 StateBaseline ID"
    )
    snapshot_id: uuid.UUID | None = Field(
        default=None, description="Optional Phase 4 StateSnapshot ID"
    )
    forecast_settings: CounterfactualForecastSettings = Field(
        default_factory=CounterfactualForecastSettings
    )
    changes: list[CounterfactualChangeCreate] = Field(
        ..., min_length=1, max_length=50, description="At least one explicit hypothetical change"
    )


class CounterfactualExperimentResponse(BaseModel):
    """
    Complete response representation of a counterfactual experiment.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    graph_id: uuid.UUID
    name: str
    description: str | None = None
    baseline_id: uuid.UUID | None = None
    snapshot_id: uuid.UUID | None = None
    status: str
    rule_version: str
    forecast_settings: dict[str, Any]
    baseline_forecast_id: uuid.UUID | None = None
    counterfactual_forecast_id: uuid.UUID | None = None
    execution_error: str | None = None
    summary: dict[str, Any] | None = None
    changes: list[CounterfactualChangeResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


class CounterfactualExperimentListItem(BaseModel):
    """
    Compact list item representation of an experiment.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    graph_id: uuid.UUID
    name: str
    status: str
    total_changes: int
    baseline_forecast_id: uuid.UUID | None = None
    counterfactual_forecast_id: uuid.UUID | None = None
    created_at: datetime
    completed_at: datetime | None = None


class CounterfactualExperimentListResponse(BaseModel):
    """
    Paginated list of counterfactual experiments for a graph.
    """

    items: list[CounterfactualExperimentListItem]
    total: int
    page: int
    page_size: int


class CounterfactualComparisonResponse(BaseModel):
    """
    Differential comparison between baseline and counterfactual forecast runs.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    experiment_id: uuid.UUID
    baseline_forecast_id: uuid.UUID | None = None
    counterfactual_forecast_id: uuid.UUID | None = None

    nodes_affected_both: list[dict[str, Any]]
    nodes_affected_baseline_only: list[dict[str, Any]]
    nodes_affected_counterfactual_only: list[dict[str, Any]]
    nodes_timing_differ: list[dict[str, Any]]
    nodes_severity_differ: list[dict[str, Any]]

    critical_nodes_summary: dict[str, Any]
    uncertainty_differences: dict[str, Any]
    comparison_metrics: dict[str, Any]

    warnings: list[str]
    limitations: list[str]
    created_at: datetime


class CounterfactualRunResultResponse(BaseModel):
    """
    Full results payload returning the experiment, both forecast runs, and differential comparison.
    """

    experiment: CounterfactualExperimentResponse
    baseline_forecast: dict[str, Any] | None = None
    counterfactual_forecast: dict[str, Any] | None = None
    comparison: CounterfactualComparisonResponse | None = None
