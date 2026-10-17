"""
CAUSAL API — Node repository (Phase 2).

Pure persistence layer for Node.
No domain logic — only CRUD operations against the database.
"""

from __future__ import annotations

import uuid
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.graph_models import Node


class NodeRepository:
    """Repository for Node CRUD operations."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create(self, *, graph_id: uuid.UUID, name: str, type: str,
                     description: str | None = None, state: str = "NORMAL",
                     health: float = 1.0, capacity: float = 1.0,
                     criticality: float = 0.5, location: dict | None = None,
                     metadata: dict | None = None) -> Node:
        node = Node(
            graph_id=graph_id,
            name=name,
            type=type,
            description=description,
            state=state,
            health=health,
            capacity=capacity,
            criticality=criticality,
            location=location,
            metadata_=metadata,
        )
        self._db.add(node)
        await self._db.flush()
        await self._db.refresh(node)
        return node

    async def get(self, node_id: uuid.UUID) -> Node | None:
        result = await self._db.execute(
            select(Node).where(Node.id == node_id)
        )
        return result.scalar_one_or_none()

    async def get_in_graph(self, node_id: uuid.UUID, graph_id: uuid.UUID) -> Node | None:
        result = await self._db.execute(
            select(Node).where(Node.id == node_id, Node.graph_id == graph_id)
        )
        return result.scalar_one_or_none()

    async def list_by_graph(self, graph_id: uuid.UUID) -> Sequence[Node]:
        result = await self._db.execute(
            select(Node).where(Node.graph_id == graph_id).order_by(Node.created_at)
        )
        return result.scalars().all()

    async def update(self, node: Node, **fields: object) -> Node:
        for key, value in fields.items():
            if key == "metadata":
                setattr(node, "metadata_", value)
            else:
                setattr(node, key, value)
        await self._db.flush()
        await self._db.refresh(node)
        return node

    async def delete(self, node: Node) -> None:
        await self._db.delete(node)
        await self._db.flush()
