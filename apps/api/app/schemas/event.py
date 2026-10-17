"""
CAUSAL API — Pydantic schemas for Phase 3: Event & Observation Engine.

Design notes:
- EventSeverity stored as uppercase strings: INFO, LOW, MEDIUM, HIGH, CRITICAL
- EventStatus lifecycle: OPEN → ACKNOWLEDGED → RESOLVED | DISMISSED
- Confidence is 0.0..1.0 — NOT causality. It represents certainty of the observation.
- Observations support 4 value types: numeric, text, boolean, json (one per observation).
- Timestamps are always UTC ISO-8601.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ── Constants ──────────────────────────────────────────────────────────────

VALID_SEVERITIES = ("INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL")
VALID_STATUSES = ("OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED")

# Valid lifecycle transitions: from_status → {allowed to_statuses}
VALID_TRANSITIONS: dict[str, set[str]] = {
    "OPEN": {"ACKNOWLEDGED", "RESOLVED", "DISMISSED"},
    "ACKNOWLEDGED": {"RESOLVED", "DISMISSED"},
    "RESOLVED": set(),  # terminal
    "DISMISSED": set(),  # terminal
}

# Metrics that are allowed to trigger explicit node state updates:
STATE_UPDATE_METRICS = {"health", "capacity", "state"}


# ── Event Schemas ──────────────────────────────────────────────────────────

class EventCreate(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=100)
    severity: str = Field(default="INFO")
    status: str = Field(default="OPEN")
    source: str = Field(..., min_length=1, max_length=100)
    timestamp: datetime
    description: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    evidence: dict[str, Any] | None = None
    metadata_: dict[str, Any] | None = None

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: str) -> str:
        v = v.upper()
        if v not in VALID_SEVERITIES:
            raise ValueError(f"severity must be one of {VALID_SEVERITIES}")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        v = v.upper()
        if v not in VALID_STATUSES:
            raise ValueError(f"status must be one of {VALID_STATUSES}")
        return v


class EventUpdate(BaseModel):
    severity: str | None = None
    status: str | None = None
    description: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    evidence: dict[str, Any] | None = None
    metadata_: dict[str, Any] | None = None

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.upper()
        if v not in VALID_SEVERITIES:
            raise ValueError(f"severity must be one of {VALID_SEVERITIES}")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.upper()
        if v not in VALID_STATUSES:
            raise ValueError(f"status must be one of {VALID_STATUSES}")
        return v


class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    graph_id: uuid.UUID
    event_type: str
    severity: str
    status: str
    source: str
    timestamp: datetime
    received_at: datetime
    description: str | None
    confidence: float | None
    evidence: dict[str, Any] | None
    metadata_: dict[str, Any] | None = Field(None, alias="metadata_")
    created_at: datetime
    updated_at: datetime


class EventStatisticsResponse(BaseModel):
    total_events: int
    open_events: int
    acknowledged_events: int
    resolved_events: int
    dismissed_events: int
    count_by_severity: dict[str, int]
    count_by_type: dict[str, int]
    observation_count: int


# ── Observation Schemas ─────────────────────────────────────────────────────

class ObservationCreate(BaseModel):
    node_id: uuid.UUID | None = None
    event_id: uuid.UUID | None = None
    observation_type: str = Field(..., min_length=1, max_length=100)
    metric: str = Field(..., min_length=1, max_length=100)
    value_numeric: float | None = None
    value_text: str | None = None
    value_boolean: bool | None = None
    value_json: dict[str, Any] | None = None
    unit: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    timestamp: datetime
    source: str = Field(..., min_length=1, max_length=100)
    metadata_: dict[str, Any] | None = None


class ObservationUpdate(BaseModel):
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    metadata_: dict[str, Any] | None = None


class ObservationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    graph_id: uuid.UUID
    node_id: uuid.UUID | None
    event_id: uuid.UUID | None
    observation_type: str
    metric: str
    value_numeric: float | None
    value_text: str | None
    value_boolean: bool | None
    value_json: dict[str, Any] | None
    unit: str | None
    confidence: float | None
    timestamp: datetime
    source: str
    metadata_: dict[str, Any] | None = Field(None, alias="metadata_")
    created_at: datetime
