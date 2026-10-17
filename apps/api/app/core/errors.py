"""
CAUSAL API — Structured error handling.

All API errors return a consistent JSON envelope.
Stack traces are never exposed in production responses.
"""

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger

logger = get_logger(__name__)


# ── Error response model ──────────────────────────────────────

def error_response(
    code: str,
    message: str,
    details: Any = None,
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
) -> JSONResponse:
    """Build a standardised error JSON response, preserving backward compatibility."""
    body: dict[str, Any] = {
        "error": {
            "code": code,
            "message": message,
        },
        "detail": details if details is not None else message,
    }
    if details is not None:
        body["error"]["details"] = details

    return JSONResponse(status_code=status_code, content=body)


# ── Exception handlers ────────────────────────────────────────

async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    logger.warning(
        "http_exception",
        status_code=exc.status_code,
        path=str(request.url.path),
        detail=exc.detail,
    )
    return error_response(
        code="HTTP_ERROR",
        message=str(exc.detail),
        status_code=exc.status_code,
    )


from fastapi.encoders import jsonable_encoder


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    # exc.errors() in Pydantic v2 can contain Exception objects inside ctx
    clean_errors = jsonable_encoder(exc.errors())
    logger.warning(
        "validation_error",
        path=str(request.url.path),
        errors=clean_errors,
    )
    return error_response(
        code="VALIDATION_ERROR",
        message="Request validation failed.",
        details=clean_errors,
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
    )


async def unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    logger.error(
        "unhandled_exception",
        path=str(request.url.path),
        exc_type=type(exc).__name__,
        # Do NOT log the full stack trace message in production
        exc_info=True,
    )
    return error_response(
        code="INTERNAL_SERVER_ERROR",
        message="An unexpected error occurred.",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers on the application."""
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)  # type: ignore[arg-type]
