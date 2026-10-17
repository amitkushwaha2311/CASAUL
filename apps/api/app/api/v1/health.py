"""
CAUSAL API — Health endpoints (Phase 9 hardened).

Endpoints:
  GET /api/v1/health           — Combined liveness + DB readiness (backward compat)
  GET /api/v1/health/live      — Liveness: is the process running? (never 503)
  GET /api/v1/health/ready     — Readiness: is the DB reachable?
  GET /api/v1/system/info      — Version and environment info
  GET /api/v1/system/status    — Feature flags and component status

Semantics:
  - /live: Always 200 if the process is running. Used by container orchestrators
    to decide whether to restart the container.
  - /ready: Returns 200 only if the database is reachable. Returns 503 otherwise.
    Used by load balancers to decide whether to route traffic.
  - Responses never expose credentials, stack traces, or internal secrets.
  - Authentication is NOT required on health endpoints (infra tooling needs them).
"""

from fastapi import APIRouter, Depends, status, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings, Settings
from app.db.session import engine
from app.schemas.common import HealthResponse, SystemInfoResponse, SystemStatusResponse

router = APIRouter()


# ── Liveness ──────────────────────────────────────────────────

@router.get(
    "/health/live",
    status_code=status.HTTP_200_OK,
    summary="Liveness check",
    description=(
        "Returns 200 when the API process is running. "
        "Never returns 503. Used by container orchestrators."
    ),
    tags=["observability"],
)
async def liveness() -> dict:
    return {"status": "alive"}


# ── Readiness ─────────────────────────────────────────────────

@router.get(
    "/health/ready",
    status_code=status.HTTP_200_OK,
    summary="Readiness check",
    description=(
        "Returns 200 only if the database is reachable. "
        "Returns 503 if essential dependencies are unavailable. "
        "Used by load balancers to decide whether to route traffic."
    ),
    tags=["observability"],
)
async def readiness(
    response: Response,
    settings: Settings = Depends(get_settings),
) -> dict:
    db_status = "connected"
    http_status = status.HTTP_200_OK

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        db_status = "unavailable"
        http_status = status.HTTP_503_SERVICE_UNAVAILABLE

    response.status_code = http_status
    return {
        "status": "ready" if db_status == "connected" else "not_ready",
        "database": db_status,
    }


# ── Combined health (backward compat) ─────────────────────────

@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Returns API liveness and database connectivity status.",
    tags=["observability"],
)
async def health_check(
    response: Response,
    settings: Settings = Depends(get_settings),
) -> HealthResponse:
    """
    Lightweight health check.

    - Returns 200 when API is reachable and database is connected.
    - Returns 503 when database is unavailable.
    """
    db_status = "connected"
    http_status = status.HTTP_200_OK

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        db_status = "unavailable"
        http_status = status.HTTP_503_SERVICE_UNAVAILABLE

    response.status_code = http_status

    return HealthResponse(
        status="healthy" if db_status == "connected" else "degraded",
        database=db_status,
        version=settings.APP_VERSION,
    )


# ── System info ───────────────────────────────────────────────

@router.get(
    "/system/info",
    response_model=SystemInfoResponse,
    summary="System information",
    description="Returns service name, version, and current deployment phase.",
    tags=["observability"],
)
async def system_info(
    settings: Settings = Depends(get_settings),
) -> SystemInfoResponse:
    return SystemInfoResponse(
        service="causal-api",
        version=settings.APP_VERSION,
        environment=settings.APP_ENV,
        phase="9 — Identity, Access Control & Audit",
    )


@router.get(
    "/system/status",
    response_model=SystemStatusResponse,
    summary="System status",
    description="Returns API status, database connectivity, version, and feature flags.",
    tags=["observability"],
)
async def system_status(
    response: Response,
    settings: Settings = Depends(get_settings),
) -> SystemStatusResponse:
    db_status = "connected"
    http_status = status.HTTP_200_OK

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        db_status = "unavailable"
        http_status = status.HTTP_503_SERVICE_UNAVAILABLE

    response.status_code = http_status

    return SystemStatusResponse(
        api="operational",
        database=db_status,
        version=settings.APP_VERSION,
        features={
            "causal_engine": settings.ENABLE_CAUSAL_ENGINE,
            "simulation": settings.ENABLE_SIMULATION,
            "interventions": settings.ENABLE_INTERVENTIONS,
        },
    )
