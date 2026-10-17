import uuid
from typing import Any

from sqlalchemy import String, Float, Boolean, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import UUIDMixin, TimestampMixin


class Dependency(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "dependencies"

    graph_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"), nullable=False, index=True)
    source_node_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False, index=True)
    target_node_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False, index=True)
    
    dependency_type: Mapped[str] = mapped_column(String(100), nullable=False)
    strength: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    failure_propagation: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)

    __table_args__ = (
        UniqueConstraint("graph_id", "source_node_id", "target_node_id", name="uq_dependency_edge"),
    )
