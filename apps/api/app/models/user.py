"""
CAUSAL API — User model (Phase 9 hardened).

Phase 9 adds:
  - hashed_password for local username/password authentication
  - role field (VIEWER / ANALYST / APPROVER / ADMIN)
  - is_active / is_superuser flags (already present)
  - last_login_at for audit visibility

Authentication architecture:
  Local JWT-based auth is the replaceable boundary implemented here.
  The SECRET_KEY used for signing is loaded from environment config;
  it MUST be set to a strong random value in production.

IMPORTANT: Do NOT store plaintext passwords. Hash with passlib before saving.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class UserRole:
    """
    CAUSAL platform roles (least-privilege ordered).

    VIEWER   — read-only: graphs, forecasts, evidence, experiment results.
    ANALYST  — VIEWER + create scenarios, simulations, recommendation runs.
    APPROVER — ANALYST + record recommendation decisions (when policy permits).
    ADMIN    — APPROVER + manage user accounts and permitted configuration.
    """

    VIEWER = "VIEWER"
    ANALYST = "ANALYST"
    APPROVER = "APPROVER"
    ADMIN = "ADMIN"

    ALL = (VIEWER, ANALYST, APPROVER, ADMIN)

    # Ordered least → most privileged for containment checks
    _ORDER = {VIEWER: 0, ANALYST: 1, APPROVER: 2, ADMIN: 3}

    @classmethod
    def has_at_least(cls, user_role: str, required_role: str) -> bool:
        """Return True if user_role is >= required_role in privilege order."""
        return cls._ORDER.get(user_role, -1) >= cls._ORDER.get(required_role, 999)


class User(UUIDMixin, TimestampMixin, Base):
    """
    Platform user account.

    Authentication uses hashed passwords + JWT signed with SECRET_KEY.
    This is a replaceable boundary: replace this model + auth.py service
    when integrating an external identity provider (OIDC, SAML, etc.).

    Identity guarantee:
      - Passwords are hashed via bcrypt (via passlib); plaintext is never stored.
      - JWT tokens are short-lived (configurable) and signed with HMAC-SHA256.
      - Tokens carry user_id (UUID) and role as claims; claims are verified
        server-side on every request.
      - decided_by and similar caller-supplied strings are NOT used as
        authoritative identity; the authenticated server-side principal is used.
    """

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Role-based access control
    role: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=UserRole.VIEWER,
        index=True,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("ix_users_email_active", "email", "is_active"),
        Index("ix_users_role", "role"),
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r} role={self.role}>"
