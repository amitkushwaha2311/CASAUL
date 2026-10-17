"""
CAUSAL — Seed Initial Platform Users (Phase 9).

Seeds representative accounts for each platform role:
  - admin@causal.local     (ADMIN)
  - approver@causal.local  (APPROVER)
  - analyst@causal.local   (ANALYST)
  - viewer@causal.local    (VIEWER)

Usage:
    python -m app.scripts.seed_users
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[3]))

from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole
from app.core.auth import get_password_hash

DEFAULT_USERS = [
    {
        "email": "admin@causal.local",
        "display_name": "System Administrator",
        "password": "AdminPassword123!",
        "role": UserRole.ADMIN,
        "is_superuser": True,
    },
    {
        "email": "approver@causal.local",
        "display_name": "Operations Approver",
        "password": "ApproverPassword123!",
        "role": UserRole.APPROVER,
        "is_superuser": False,
    },
    {
        "email": "analyst@causal.local",
        "display_name": "Resilience Analyst",
        "password": "AnalystPassword123!",
        "role": UserRole.ANALYST,
        "is_superuser": False,
    },
    {
        "email": "viewer@causal.local",
        "display_name": "Audit Viewer",
        "password": "ViewerPassword123!",
        "role": UserRole.VIEWER,
        "is_superuser": False,
    },
]


async def seed_users() -> None:
    async with AsyncSessionLocal() as db:
        for u_data in DEFAULT_USERS:
            result = await db.execute(select(User).where(User.email == u_data["email"]))
            existing = result.scalar_one_or_none()
            if existing:
                existing.role = u_data["role"]
                existing.hashed_password = get_password_hash(u_data["password"])
                existing.is_active = True
                print(f"Updated user: {u_data['email']} ({u_data['role']})")
            else:
                user = User(
                    email=u_data["email"],
                    display_name=u_data["display_name"],
                    hashed_password=get_password_hash(u_data["password"]),
                    role=u_data["role"],
                    is_active=True,
                    is_superuser=u_data["is_superuser"],
                )
                db.add(user)
                print(f"Created user: {u_data['email']} ({u_data['role']})")
        await db.commit()
    print("User seeding completed successfully.")


if __name__ == "__main__":
    asyncio.run(seed_users())
