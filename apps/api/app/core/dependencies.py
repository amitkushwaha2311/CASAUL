"""
CAUSAL API — FastAPI authentication/authorization dependencies (Phase 9).

Provides injectable dependencies for:
  - get_current_user()      — validates Bearer token, returns authenticated User
  - require_role(role)      — asserts the user has at least `role`
  - get_current_active_user — alias requiring active account
  - optional_current_user   — returns None for unauthenticated requests

Usage example:
    @router.post("/graphs", ...)
    async def create_graph(
        data: GraphCreate,
        current_user: User = Depends(require_role(UserRole.ANALYST)),
        db: AsyncSession = Depends(get_db),
    ):
        ...

Security rules:
  1. NEVER trust path/query/body-supplied user IDs as authoritative identity.
  2. ALWAYS derive the actor from get_current_user() / require_role().
  3. Return 401 for missing/invalid auth, 403 for insufficient permissions.
  4. Do not reveal whether a resource exists to unauthorised callers.
"""

from __future__ import annotations

import uuid
from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import extract_token_claims
from app.core.logging import get_logger
from app.db.session import get_db
from app.models.user import User, UserRole

logger = get_logger(__name__)

# ── Bearer scheme ───────────────────────────────────────────────

_bearer_scheme = HTTPBearer(auto_error=False)

# ── Shared 401 response ─────────────────────────────────────────

_CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Authentication required.",
    headers={"WWW-Authenticate": "Bearer"},
)


# ── Core dependency ─────────────────────────────────────────────


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Validate the Bearer token and return the authenticated User.

    Raises HTTP 401 if:
      - No Authorization header is present.
      - The token is malformed, expired, or signed with a wrong key.
      - The user referenced by the token does not exist or is inactive.
    """
    if not credentials:
        raise _CREDENTIALS_EXCEPTION

    claims = extract_token_claims(credentials.credentials)
    if not claims:
        logger.warning("auth_token_invalid", reason="decode_failed")
        raise _CREDENTIALS_EXCEPTION

    user_id_str = claims.get("sub")
    if not user_id_str:
        raise _CREDENTIALS_EXCEPTION

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise _CREDENTIALS_EXCEPTION

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise _CREDENTIALS_EXCEPTION

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Alias for get_current_user; explicitly names the 'active' requirement."""
    return current_user


async def optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """
    Return the authenticated User if a valid token is present, else None.
    Never raises; suitable for endpoints that behave differently for
    authenticated vs. unauthenticated callers.
    """
    if not credentials:
        return None
    claims = extract_token_claims(credentials.credentials)
    if not claims:
        return None
    try:
        user_id = uuid.UUID(claims.get("sub", ""))
    except ValueError:
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    return user if (user and user.is_active) else None


# ── Role-based access control dependency factory ────────────────


def require_role(minimum_role: str) -> Callable:
    """
    Return a FastAPI dependency that enforces a minimum role.

    Usage:
        current_user = Depends(require_role(UserRole.ANALYST))

    Raises:
        HTTP 401 — not authenticated
        HTTP 403 — authenticated but insufficient role
    """

    async def _check_role(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if not UserRole.has_at_least(current_user.role, minimum_role):
            logger.warning(
                "authz_denied",
                user_id=str(current_user.id),
                user_role=current_user.role,
                required_role=minimum_role,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions.",
            )
        return current_user

    return _check_role


# ── Admin-only shortcut ─────────────────────────────────────────

require_admin = require_role(UserRole.ADMIN)
require_approver = require_role(UserRole.APPROVER)
require_analyst = require_role(UserRole.ANALYST)
require_viewer = require_role(UserRole.VIEWER)
