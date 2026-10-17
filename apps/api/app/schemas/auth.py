"""
CAUSAL API — Authentication schemas (Phase 9).

Pydantic request/response models for auth and user endpoints.
Passwords are never included in response schemas.
"""

from __future__ import annotations

import uuid
from datetime import datetime

import re
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.user import UserRole

_EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ── Auth request schemas ────────────────────────────────────────


class LoginRequest(BaseModel):
    """Credentials for local username/password login."""

    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=256)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        clean = v.strip().lower()
        if not _EMAIL_REGEX.match(clean):
            raise ValueError(f"Invalid email address: {v!r}")
        return clean


class TokenResponse(BaseModel):
    """JWT access token response."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


# ── User schemas ────────────────────────────────────────────────


class UserResponse(BaseModel):
    """Public user representation — never includes hashed_password."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    role: str
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class RegisterRequest(BaseModel):
    """Public self-registration request — always creates a VIEWER account."""

    email: str = Field(..., min_length=3, max_length=255)
    display_name: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=8, max_length=256)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        clean = v.strip().lower()
        if not _EMAIL_REGEX.match(clean):
            raise ValueError(f"Invalid email address: {v!r}")
        return clean

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v


class UserCreate(BaseModel):
    """Admin-only request to create a new user account."""

    email: str = Field(..., min_length=3, max_length=255)
    display_name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, max_length=256)
    role: str = Field(default=UserRole.VIEWER)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        clean = v.strip().lower()
        if not _EMAIL_REGEX.match(clean):
            raise ValueError(f"Invalid email address: {v!r}")
        return clean

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in UserRole.ALL:
            raise ValueError(f"Invalid role {v!r}. Must be one of {UserRole.ALL}.")
        return v


class UserRoleUpdate(BaseModel):
    """Admin-only request to update a user's role."""

    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in UserRole.ALL:
            raise ValueError(f"Invalid role {v!r}. Must be one of {UserRole.ALL}.")
        return v


class MeResponse(BaseModel):
    """Current authenticated user's profile (same as UserResponse)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    role: str
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
