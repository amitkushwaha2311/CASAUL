"""
CAUSAL API — Graph repository (Phase 2).

Pure persistence layer for InfrastructureGraph.
No domain logic — only CRUD operations against the database.
"""

from __future__ import annotations

import uuid
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.graph_models import InfrastructureGraph


class GraphRepository:
    """Repository for InfrastructureGraph CRUD operations."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create(self, *, name: str, description: str | None = None,
                     domain: str | None = None, version: int = 1,
                     metadata: dict | None = None) -> InfrastructureGraph:
        graph = InfrastructureGraph(
            name=name,
            description=description,
            domain=domain,
            version=version,
            metadata_=metadata,
        )
        self._db.add(graph)
        await self._db.flush()
        await self._db.refresh(graph)
        return graph

    async def get(self, graph_id: uuid.UUID) -> InfrastructureGraph | None:
        result = await self._db.execute(
            select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id)
        )
        return result.scalar_one_or_none()

    async def list_all(self) -> Sequence[InfrastructureGraph]:
        result = await self._db.execute(
            select(InfrastructureGraph).order_by(InfrastructureGraph.created_at.desc())
        )
        return result.scalars().all()

    async def update(self, graph: InfrastructureGraph, **fields: object) -> InfrastructureGraph:
        for key, value in fields.items():
            if key == "metadata":
                setattr(graph, "metadata_", value)
            else:
                setattr(graph, key, value)
        await self._db.flush()
        await self._db.refresh(graph)
        return graph

    async def delete(self, graph: InfrastructureGraph) -> None:
        await self._db.delete(graph)
        await self._db.flush()
