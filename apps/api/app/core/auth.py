"""
CAUSAL API — Core authentication service (Phase 9).

Implements the replaceable local authentication boundary:
  - Password hashing / verification via passlib + bcrypt
  - JWT access token creation and verification via python-jose
  - Token claims: sub (user UUID), email, role, exp
  - Expiry validation on every request

Production requirements:
  - SECRET_KEY must be set to a strong random value (≥32 chars).
  - ACCESS_TOKEN_EXPIRE_MINUTES should be ≤ 60 for sensitive deployments.

Security guarantees:
  - Plaintext passwords are never stored, logged, or returned.
  - Token signing uses HMAC-SHA256 (HS256).
  - Expired tokens are rejected; no fallback.
  - Tokens are validated on the server side; client-supplied user IDs
    in path/query/body are never trusted as authoritative identity.

To replace with an external IdP (OIDC/SAML):
  1. Remove create_access_token / verify_password / get_password_hash.
  2. Replace decode_token() with IdP-specific JWT/OIDC introspection.
  3. Keep get_current_user() signature unchanged so all routers continue to work.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt
import bcrypt

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ── Password hashing ────────────────────────────────────────────


def get_password_hash(plaintext: str) -> str:
    """Return the bcrypt hash of a plaintext password."""
    pwd_bytes = plaintext.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plaintext: str, hashed: str) -> bool:
    """Return True if plaintext matches the stored hash."""
    try:
        pwd_bytes = plaintext.encode("utf-8")[:72]
        return bcrypt.checkpw(pwd_bytes, hashed.encode("utf-8"))
    except Exception:
        return False


# ── JWT tokens ──────────────────────────────────────────────────

ALGORITHM = "HS256"


def create_access_token(
    user_id: uuid.UUID,
    email: str,
    role: str,
    expires_delta: timedelta | None = None,
) -> str:
    """
    Create a signed JWT access token.

    Claims:
      sub   — user UUID (str)
      email — user email (for display only; not authoritative for access)
      role  — CAUSAL role string
      exp   — expiry timestamp (UTC)
      iat   — issued-at timestamp (UTC)
    """
    settings = get_settings()
    expire = datetime.now(UTC) + (
        expires_delta
        or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "exp": expire,
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT access token.

    Raises JWTError (from python-jose) if the token is:
      - Malformed or unsigned
      - Expired
      - Signed with a different key
    """
    settings = get_settings()
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])


def extract_token_claims(token: str) -> dict[str, Any] | None:
    """
    Safe wrapper around decode_token.
    Returns claims dict on success, None on any failure.
    Never raises; never logs the token value.
    """
    try:
        return decode_token(token)
    except JWTError as exc:
        logger.debug("jwt_decode_failed", reason=type(exc).__name__)
        return None
