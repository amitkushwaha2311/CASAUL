"""
CAUSAL API — Application factory (Phase 9 hardened).

Phase 9 additions:
  - Startup validation: reject production runs with insecure SECRET_KEY.
  - Exception handlers registered for consistent error responses.
  - Request correlation ID middleware for structured logging.
  - Separate liveness (/health/live) and readiness (/health/ready) semantics.
"""

import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.api.router import api_router
from app.db.session import engine

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application startup and shutdown lifecycle."""
    settings = get_settings()
    configure_logging(settings.LOG_LEVEL)

    logger.info(
        "causal_api_starting",
        version=settings.APP_VERSION,
        environment=settings.APP_ENV,
    )

    # ── Production & Staging safety checks ─────────────────────
    if settings.requires_secure_secret_key:
        if not settings.has_secure_secret_key:
            env_label = settings.APP_ENV.upper()
            raise RuntimeError(
                f"{env_label} STARTUP REJECTED: SECRET_KEY must be set to a strong random "
                f"value (>=32 chars) before running in {settings.APP_ENV}. "
                "Generate with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        logger.info("startup_security_check_passed")
    else:
        if not settings.has_secure_secret_key:
            logger.warning(
                "startup_insecure_secret_key",
                message="SECRET_KEY is set to the insecure default. "
                        "This is only permitted in development mode.",
            )

    yield

    await engine.dispose()
    logger.info("causal_api_stopped")


# ── Correlation ID middleware ─────────────────────────────────────

async def _correlation_id_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
    """
    Inject a request correlation ID into structlog context vars.
    Accepts X-Correlation-ID from client; generates a UUID if absent.
    """
    cid = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(correlation_id=cid)
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = cid
    return response


def create_application() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    application = FastAPI(
        title="CAUSAL API",
        description=(
            "Causal Resilience & Intervention Engine — "
            "Research-grade platform for cyber-physical system intelligence."
        ),
        version=settings.APP_VERSION,
        docs_url="/api/docs" if settings.APP_ENV != "production" else None,
        redoc_url="/api/redoc" if settings.APP_ENV != "production" else None,
        openapi_url="/api/openapi.json" if settings.APP_ENV != "production" else None,
        lifespan=lifespan,
    )

    # ── Exception handlers ────────────────────────────────────
    register_exception_handlers(application)

    # ── Correlation ID middleware ─────────────────────────────
    application.middleware("http")(_correlation_id_middleware)

    # ── CORS ─────────────────────────────────────────────────
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # ── Routers ──────────────────────────────────────────────
    application.include_router(api_router)

    return application
