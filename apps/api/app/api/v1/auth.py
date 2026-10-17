"""
CAUSAL API — Authentication and User Management REST endpoints (Phase 9).

Endpoints:
  POST /api/v1/auth/login          — Authenticate and receive JWT access token
  POST /api/v1/auth/logout         — Record logout (client discards token)
  GET  /api/v1/auth/me             — Get current authenticated user profile
  GET  /api/v1/users               — List users (ADMIN only)
  POST /api/v1/users               — Create user (ADMIN only)
  GET  /api/v1/users/{user_id}     — Get user by ID (ADMIN only)
  PATCH /api/v1/users/{user_id}/role  — Update role (ADMIN only)
  POST /api/v1/users/{user_id}/deactivate — Deactivate account (ADMIN only)

Security:
  - Login returns a short-lived JWT; no refresh tokens in this boundary.
  - decided_by is NEVER accepted from request body as authoritative identity;
    authenticated actor is always derived from the JWT.
  - Audit records are written for every login attempt and admin operation.
  - Response bodies never include hashed_password.
  - 401 for unauthenticated; 403 for insufficient role; 404 masked as 403
    for user lookups to avoid leaking existence.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token
from app.core.config import get_settings
from app.core.dependencies import get_current_active_user, require_admin
from app.core.logging import get_logger
from app.db.session import get_db
from app.models.audit_log import AuditAction
from app.models.user import User, UserRole
from app.schemas.auth import (
    LoginRequest,
    MeResponse,
    RegisterRequest,
    TokenResponse,
    UserCreate,
    UserResponse,
    UserRoleUpdate,
)
from app.services.audit_service import AuditService
from app.services.user_service import UserService

logger = get_logger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])


def _correlation_id(request: Request) -> str:
    """Extract or synthesise a request correlation ID."""
    return request.headers.get("X-Correlation-ID", str(uuid.uuid4()))


# ── Authentication endpoints ────────────────────────────────────


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Public self-registration — creates a VIEWER account and returns a JWT",
    description=(
        "Creates a new user account with the VIEWER role. "
        "Email must be unique. Password is hashed immediately; plaintext is discarded. "
        "Returns a JWT access token so the user is logged in immediately after registration."
    ),
)
async def register(
    request: Request,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    svc = UserService(db)
    correlation_id = _correlation_id(request)

    try:
        user = await svc.create_user(
            email=body.email,
            display_name=body.display_name,
            plaintext_password=body.password,
            role=UserRole.VIEWER,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    settings = get_settings()
    token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    await AuditService.log(
        db,
        action=AuditAction.USER_CREATED,
        outcome="success",
        actor=user,
        resource_type="user",
        resource_id=user.id,
        description=f"User self-registered: {user.email!r}",
        correlation_id=correlation_id,
    )
    await db.commit()

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )



@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate and obtain a JWT access token",
    description=(
        "Validates email/password credentials and returns a signed JWT. "
        "The token must be included as `Authorization: Bearer <token>` on "
        "all protected requests. Tokens expire after the configured interval."
    ),
)
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    svc = UserService(db)
    correlation_id = _correlation_id(request)

    user = await svc.authenticate(body.email, body.password)

    if not user:
        # Audit login failure — do not log the supplied password
        await AuditService.log_auth_failure(
            db,
            email=body.email,
            reason="invalid_credentials",
            correlation_id=correlation_id,
        )
        await db.commit()
        # Generic message to avoid credential oracle
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings = get_settings()
    token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    # Update last_login_at
    user.last_login_at = datetime.now(UTC)

    await AuditService.log(
        db,
        action=AuditAction.AUTH_LOGIN_SUCCESS,
        outcome="success",
        actor=user,
        resource_type="user",
        resource_id=user.id,
        description="User logged in successfully.",
        correlation_id=correlation_id,
    )
    await db.commit()

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
    summary="Record logout (client must discard the token)",
    description=(
        "Records a logout audit event. JWT tokens are stateless; the client "
        "is responsible for discarding the token. This endpoint does NOT "
        "invalidate the token server-side (token invalidation would require "
        "a token blacklist / Redis, which is not in scope for this boundary)."
    ),
)
async def logout(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await AuditService.log(
        db,
        action=AuditAction.AUTH_LOGOUT,
        outcome="success",
        actor=current_user,
        resource_type="user",
        resource_id=current_user.id,
        description="User logged out.",
        correlation_id=_correlation_id(request),
    )
    await db.commit()


@router.get(
    "/me",
    response_model=MeResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current authenticated user profile",
)
async def get_me(
    current_user: User = Depends(get_current_active_user),
) -> MeResponse:
    return MeResponse.model_validate(current_user)


# ── User management endpoints (ADMIN only) ──────────────────────


@users_router.get(
    "",
    response_model=list[UserResponse],
    status_code=status.HTTP_200_OK,
    summary="List all user accounts (ADMIN only)",
)
async def list_users(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[UserResponse]:
    svc = UserService(db)
    users = await svc.list_users()
    return [UserResponse.model_validate(u) for u in users]


@users_router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new user account (ADMIN only)",
)
async def create_user(
    request: Request,
    body: UserCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    svc = UserService(db)
    try:
        user = await svc.create_user(
            email=body.email,
            display_name=body.display_name,
            plaintext_password=body.password,
            role=body.role,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await AuditService.log(
        db,
        action=AuditAction.USER_CREATED,
        outcome="success",
        actor=current_user,
        resource_type="user",
        resource_id=user.id,
        description=f"Admin created user {user.email!r} with role {user.role}.",
        context={"new_user_email": user.email, "new_user_role": user.role},
        correlation_id=_correlation_id(request),
    )
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


# ── Audit log read endpoint (ADMIN only) ─────────────────────────


@users_router.get(
    "/audit-logs",
    status_code=status.HTTP_200_OK,
    summary="List recent audit records (ADMIN only)",
    description="Returns the most recent audit log entries. Read-only; no modification.",
    tags=["audit"],
)
async def list_audit_logs(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = 100,
) -> list[dict]:
    from sqlalchemy import desc, select
    from app.models.audit_log import AuditLog

    result = await db.execute(
        select(AuditLog).order_by(desc(AuditLog.created_at)).limit(min(limit, 500))
    )
    logs = result.scalars().all()
    return [
        {
            "id": str(l.id),
            "action": l.action,
            "outcome": l.outcome,
            "actor_email": l.actor_email,
            "resource_type": l.resource_type,
            "resource_id": str(l.resource_id) if l.resource_id else None,
            "description": l.description,
            "correlation_id": l.correlation_id,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]


@users_router.get(
    "/{user_id}",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a user by ID (ADMIN only)",
)
async def get_user(
    user_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    svc = UserService(db)
    user = await svc.get_by_id(user_id)
    # Return 403 instead of 404 to avoid leaking existence information
    if not user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions.")
    return UserResponse.model_validate(user)


@users_router.patch(
    "/{user_id}/role",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a user's role (ADMIN only)",
)
async def update_user_role(
    request: Request,
    user_id: uuid.UUID,
    body: UserRoleUpdate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    svc = UserService(db)
    try:
        user = await svc.update_role(user_id, body.role)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await AuditService.log(
        db,
        action=AuditAction.USER_ROLE_CHANGED,
        outcome="success",
        actor=current_user,
        resource_type="user",
        resource_id=user.id,
        description=f"Role updated to {body.role!r}.",
        context={"new_role": body.role},
        correlation_id=_correlation_id(request),
    )
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@users_router.post(
    "/{user_id}/deactivate",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Deactivate a user account (ADMIN only)",
)
async def deactivate_user(
    request: Request,
    user_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    # Prevent self-deactivation
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account.",
        )
    svc = UserService(db)
    try:
        user = await svc.deactivate(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions.")

    await AuditService.log(
        db,
        action=AuditAction.USER_DEACTIVATED,
        outcome="success",
        actor=current_user,
        resource_type="user",
        resource_id=user.id,
        description=f"User {user.email!r} deactivated.",
        correlation_id=_correlation_id(request),
    )
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)
