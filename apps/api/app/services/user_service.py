"""
CAUSAL API — User management service (Phase 9).

Handles:
  - User creation (admin only)
  - Credential verification for login
  - Role assignment
  - User listing/retrieval for admin panel

Security rules:
  - Passwords are hashed with bcrypt before storage.
  - Plaintext passwords are never returned or logged.
  - Only ADMIN users can create, update, or deactivate accounts.
  - Email uniqueness is enforced at the DB level.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_password_hash, verify_password
from app.core.logging import get_logger
from app.models.user import User, UserRole

logger = get_logger(__name__)


class UserService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_user(
        self,
        *,
        email: str,
        display_name: str,
        plaintext_password: str,
        role: str = UserRole.VIEWER,
    ) -> User:
        """
        Create a new user account.
        Password is hashed; plaintext is discarded after this call.
        """
        if role not in UserRole.ALL:
            raise ValueError(f"Invalid role {role!r}. Must be one of {UserRole.ALL}.")

        existing = await self.get_by_email(email)
        if existing:
            raise ValueError(f"User with email {email!r} already exists.")

        user = User(
            email=email.lower().strip(),
            display_name=display_name,
            hashed_password=get_password_hash(plaintext_password),
            role=role,
            is_active=True,
            is_superuser=False,
        )
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        logger.info("user_created", user_id=str(user.id), role=role)
        return user

    async def authenticate(self, email: str, plaintext_password: str) -> User | None:
        """
        Verify credentials and return the User if valid, else None.
        Never raises; logs failures without revealing the password.
        """
        user = await self.get_by_email(email)
        if not user:
            # Constant-time-ish: hash a dummy value to avoid timing oracle
            get_password_hash("dummy_to_avoid_timing_oracle")
            logger.warning("auth_user_not_found", email=email)
            return None
        if not user.hashed_password:
            logger.warning("auth_no_password_set", user_id=str(user.id))
            return None
        if not verify_password(plaintext_password, user.hashed_password):
            logger.warning("auth_wrong_password", user_id=str(user.id))
            return None
        if not user.is_active:
            logger.warning("auth_user_inactive", user_id=str(user.id))
            return None
        return user

    async def get_by_email(self, email: str) -> User | None:
        result = await self.db.execute(
            select(User).where(User.email == email.lower().strip())
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def list_users(self) -> list[User]:
        result = await self.db.execute(
            select(User).order_by(User.created_at.desc())
        )
        return list(result.scalars().all())

    async def update_role(self, user_id: uuid.UUID, new_role: str) -> User:
        if new_role not in UserRole.ALL:
            raise ValueError(f"Invalid role {new_role!r}.")
        user = await self.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found.")
        old_role = user.role
        user.role = new_role
        await self.db.flush()
        logger.info("user_role_changed", user_id=str(user_id), old=old_role, new=new_role)
        return user

    async def deactivate(self, user_id: uuid.UUID) -> User:
        user = await self.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found.")
        user.is_active = False
        await self.db.flush()
        logger.info("user_deactivated", user_id=str(user_id))
        return user
