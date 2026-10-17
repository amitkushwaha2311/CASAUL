"""
CAUSAL API — Common Pydantic response schemas.

These are the shared envelope types used across all API endpoints.
"""

from typing import Any, Generic, TypeVar

from pydantic import BaseModel

DataT = TypeVar("DataT")


class ErrorDetail(BaseModel):
    """Inner error object."""

    code: str
    message: str
    details: Any = None


class ErrorResponse(BaseModel):
    """Standardised error envelope."""

    error: ErrorDetail


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    database: str
    version: str


class SystemInfoResponse(BaseModel):
    """System information response."""

    service: str
    version: str
    environment: str
    phase: str


class SystemStatusResponse(BaseModel):
    """Aggregated system status."""

    api: str
    database: str
    version: str
    features: dict[str, bool]
