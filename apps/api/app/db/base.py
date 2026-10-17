"""
CAUSAL API — SQLAlchemy declarative base.

All models must inherit from Base.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base for all SQLAlchemy models."""
    pass
