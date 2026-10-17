import uuid
from typing import Any

from sqlalchemy import String, Float, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import UUIDMixin, TimestampMixin


class Node(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "nodes"

    graph_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    state: Mapped[str] = mapped_column(String(50), nullable=False, default="NORMAL")
    health: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    capacity: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    criticality: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    location: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)

    # Relationships can be added if needed, for example:
    # graph = relationship("InfrastructureGraph")
