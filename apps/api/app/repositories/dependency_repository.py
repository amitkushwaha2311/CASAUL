"""
CAUSAL API — Dependency repository (Phase 2).

Pure persistence layer for Dependency.
No domain logic — only CRUD operations against the database.
"""

from __future__ import annotations

import uuid
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.graph_models import Dependency


class DependencyRepository:
    """Repository for Dependency CRUD operations."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create(self, *, graph_id: uuid.UUID, source_node_id: uuid.UUID,
                     target_node_id: uuid.UUID, dependency_type: str,
                     strength: float = 1.0, required: bool = True,
                     failure_propagation: float = 1.0,
                     metadata: dict | None = None) -> Dependency:
        dep = Dependency(
            graph_id=graph_id,
            source_node_id=source_node_id,
            target_node_id=target_node_id,
            dependency_type=dependency_type,
            strength=strength,
            required=required,
            failure_propagation=failure_propagation,
            metadata_=metadata,
        )
        self._db.add(dep)
        await self._db.flush()
        await self._db.refresh(dep)
        return dep

    async def get(self, dependency_id: uuid.UUID) -> Dependency | None:
        result = await self._db.execute(
            select(Dependency).where(Dependency.id == dependency_id)
        )
        return result.scalar_one_or_none()

    async def get_in_graph(self, dependency_id: uuid.UUID, graph_id: uuid.UUID) -> Dependency | None:
        result = await self._db.execute(
            select(Dependency).where(
                Dependency.id == dependency_id,
                Dependency.graph_id == graph_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_by_graph(self, graph_id: uuid.UUID) -> Sequence[Dependency]:
        result = await self._db.execute(
            select(Dependency).where(Dependency.graph_id == graph_id).order_by(Dependency.created_at)
        )
        return result.scalars().all()

    async def get_by_edge(self, graph_id: uuid.UUID, source_id: uuid.UUID,
                          target_id: uuid.UUID) -> Dependency | None:
        """Look up an existing edge by its (graph, source, target) triplet."""
        result = await self._db.execute(
            select(Dependency).where(
                Dependency.graph_id == graph_id,
                Dependency.source_node_id == source_id,
                Dependency.target_node_id == target_id,
            )
        )
        return result.scalar_one_or_none()

    async def update(self, dep: Dependency, **fields: object) -> Dependency:
        for key, value in fields.items():
            if key == "metadata":
                setattr(dep, "metadata_", value)
            else:
                setattr(dep, key, value)
        await self._db.flush()
        await self._db.refresh(dep)
        return dep

    async def delete(self, dep: Dependency) -> None:
        await self._db.delete(dep)
        await self._db.flush()
