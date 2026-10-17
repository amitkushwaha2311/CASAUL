"""
CAUSAL API — Phase 2 Graph Engine REST API.

All endpoints use /api/v1 prefix (set at router registration).

Endpoints:
    Graph CRUD:
        POST   /graphs
        GET    /graphs
        GET    /graphs/{graph_id}
        PATCH  /graphs/{graph_id}
        DELETE /graphs/{graph_id}

    Node CRUD:
        POST   /graphs/{graph_id}/nodes
        GET    /graphs/{graph_id}/nodes
        GET    /graphs/{graph_id}/nodes/{node_id}
        PATCH  /graphs/{graph_id}/nodes/{node_id}
        DELETE /graphs/{graph_id}/nodes/{node_id}

    Dependency CRUD:
        POST   /graphs/{graph_id}/dependencies
        GET    /graphs/{graph_id}/dependencies
        GET    /graphs/{graph_id}/dependencies/{dependency_id}
        PATCH  /graphs/{graph_id}/dependencies/{dependency_id}
        DELETE /graphs/{graph_id}/dependencies/{dependency_id}

    Graph queries:
        GET /graphs/{graph_id}/nodes/{node_id}/upstream
        GET /graphs/{graph_id}/nodes/{node_id}/downstream
        GET /graphs/{graph_id}/nodes/{node_id}/ancestors
        GET /graphs/{graph_id}/nodes/{node_id}/descendants
        GET /graphs/{graph_id}/nodes/{node_id}/neighborhood?depth=2
        GET /graphs/{graph_id}/paths?source_id=...&target_id=...
        GET /graphs/{graph_id}/statistics
        GET /graphs/{graph_id}/validation
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.graph import (
    GraphCreate, GraphUpdate, GraphResponse,
    NodeCreate, NodeUpdate, NodeResponse,
    DependencyCreate, DependencyUpdate, DependencyResponse,
    NodeSummary, PathResponse, NeighborhoodResponse,
    GraphStatisticsResponse, GraphValidationResponse,
    NodeStateUpdate,
)
from app.services.graph_service import GraphService, NodeService, DependencyService, NodeStateService
from app.services.graph_query_service import GraphQueryService
from app.services.graph_validation_service import GraphValidationService

router = APIRouter(prefix="/graphs", tags=["graphs"])


# ── Graph CRUD ─────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=GraphResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a graph",
)
async def create_graph(
    data: GraphCreate,
    db: AsyncSession = Depends(get_db),
) -> GraphResponse:
    svc = GraphService(db)
    graph = await svc.create(data)
    return GraphResponse.model_validate(graph, from_attributes=True)


@router.get(
    "",
    response_model=list[GraphResponse],
    summary="List all graphs",
)
async def list_graphs(
    db: AsyncSession = Depends(get_db),
) -> list[GraphResponse]:
    svc = GraphService(db)
    graphs = await svc.list_all()
    return [GraphResponse.model_validate(g, from_attributes=True) for g in graphs]


@router.get(
    "/{graph_id}",
    response_model=GraphResponse,
    summary="Get a graph",
)
async def get_graph(
    graph_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> GraphResponse:
    svc = GraphService(db)
    graph = await svc.get(graph_id)
    return GraphResponse.model_validate(graph, from_attributes=True)


@router.patch(
    "/{graph_id}",
    response_model=GraphResponse,
    summary="Update a graph",
)
async def update_graph(
    graph_id: uuid.UUID,
    data: GraphUpdate,
    db: AsyncSession = Depends(get_db),
) -> GraphResponse:
    svc = GraphService(db)
    graph = await svc.update(graph_id, data)
    return GraphResponse.model_validate(graph, from_attributes=True)


@router.delete(
    "/{graph_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
    summary="Delete a graph",
)
async def delete_graph(
    graph_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    svc = GraphService(db)
    await svc.delete(graph_id)


# ── Node CRUD ──────────────────────────────────────────────────────────────

@router.post(
    "/{graph_id}/nodes",
    response_model=NodeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a node",
)
async def create_node(
    graph_id: uuid.UUID,
    data: NodeCreate,
    db: AsyncSession = Depends(get_db),
) -> NodeResponse:
    svc = NodeService(db)
    node = await svc.create(graph_id, data)
    return NodeResponse.model_validate(node, from_attributes=True)


@router.get(
    "/{graph_id}/nodes",
    response_model=list[NodeResponse],
    summary="List nodes in a graph",
)
async def list_nodes(
    graph_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[NodeResponse]:
    svc = NodeService(db)
    nodes = await svc.list_by_graph(graph_id)
    return [NodeResponse.model_validate(n, from_attributes=True) for n in nodes]


@router.get(
    "/{graph_id}/nodes/{node_id}",
    response_model=NodeResponse,
    summary="Get a node",
)
async def get_node(
    graph_id: uuid.UUID,
    node_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> NodeResponse:
    svc = NodeService(db)
    node = await svc.get(graph_id, node_id)
    return NodeResponse.model_validate(node, from_attributes=True)


@router.patch(
    "/{graph_id}/nodes/{node_id}",
    response_model=NodeResponse,
    summary="Update a node",
)
async def update_node(
    graph_id: uuid.UUID,
    node_id: uuid.UUID,
    data: NodeUpdate,
    db: AsyncSession = Depends(get_db),
) -> NodeResponse:
    svc = NodeService(db)
    node = await svc.update(graph_id, node_id, data)
    return NodeResponse.model_validate(node, from_attributes=True)


@router.patch(
    "/{graph_id}/nodes/{node_id}/state",
    response_model=NodeResponse,
    summary="Update node operational state",
    description="Controlled update for state, health, and capacity via NodeStateService.",
)
async def update_node_state(
    graph_id: uuid.UUID,
    node_id: uuid.UUID,
    data: NodeStateUpdate,
    db: AsyncSession = Depends(get_db),
) -> NodeResponse:
    svc = NodeStateService(db)
    node = await svc.update_state(graph_id, node_id, data)
    return NodeResponse.model_validate(node, from_attributes=True)


@router.delete(
    "/{graph_id}/nodes/{node_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
    summary="Delete a node",
)
async def delete_node(
    graph_id: uuid.UUID,
    node_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    svc = NodeService(db)
    await svc.delete(graph_id, node_id)


# ── Dependency CRUD ────────────────────────────────────────────────────────

@router.post(
    "/{graph_id}/dependencies",
    response_model=DependencyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a dependency edge",
    description=(
        "Creates a directed dependency: source_node → target_node. "
        "Semantics: target depends on source."
    ),
)
async def create_dependency(
    graph_id: uuid.UUID,
    data: DependencyCreate,
    db: AsyncSession = Depends(get_db),
) -> DependencyResponse:
    svc = DependencyService(db)
    dep = await svc.create(graph_id, data)
    return DependencyResponse.model_validate(dep, from_attributes=True)


@router.get(
    "/{graph_id}/dependencies",
    response_model=list[DependencyResponse],
    summary="List dependencies in a graph",
)
async def list_dependencies(
    graph_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[DependencyResponse]:
    svc = DependencyService(db)
    deps = await svc.list_by_graph(graph_id)
    return [DependencyResponse.model_validate(d, from_attributes=True) for d in deps]


@router.get(
    "/{graph_id}/dependencies/{dependency_id}",
    response_model=DependencyResponse,
    summary="Get a dependency",
)
async def get_dependency(
    graph_id: uuid.UUID,
    dependency_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> DependencyResponse:
    svc = DependencyService(db)
    dep = await svc.get(graph_id, dependency_id)
    return DependencyResponse.model_validate(dep, from_attributes=True)


@router.patch(
    "/{graph_id}/dependencies/{dependency_id}",
    response_model=DependencyResponse,
    summary="Update a dependency",
)
async def update_dependency(
    graph_id: uuid.UUID,
    dependency_id: uuid.UUID,
    data: DependencyUpdate,
    db: AsyncSession = Depends(get_db),
) -> DependencyResponse:
    svc = DependencyService(db)
    dep = await svc.update(graph_id, dependency_id, data)
    return DependencyResponse.model_validate(dep, from_attributes=True)


@router.delete(
    "/{graph_id}/dependencies/{dependency_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
    summary="Delete a dependency",
)
async def delete_dependency(
    graph_id: uuid.UUID,
    dependency_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    svc = DependencyService(db)
    await svc.delete(graph_id, dependency_id)


# ── Graph traversal queries ────────────────────────────────────────────────

@router.get(
    "/{graph_id}/nodes/{node_id}/upstream",
    response_model=list[NodeSummary],
    summary="Get direct upstream nodes",
    description="Returns nodes that directly affect the given node (direct predecessors).",
)
async def get_upstream(
    graph_id: uuid.UUID,
    node_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[NodeSummary]:
    svc = GraphQueryService(db)
    return await svc.get_upstream_nodes(graph_id, node_id)


@router.get(
    "/{graph_id}/nodes/{node_id}/downstream",
    response_model=list[NodeSummary],
    summary="Get direct downstream nodes",
    description="Returns nodes that directly depend on the given node (direct successors).",
)
async def get_downstream(
    graph_id: uuid.UUID,
    node_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[NodeSummary]:
    svc = GraphQueryService(db)
    return await svc.get_downstream_nodes(graph_id, node_id)


@router.get(
    "/{graph_id}/nodes/{node_id}/ancestors",
    response_model=list[NodeSummary],
    summary="Get all ancestors",
    description="Returns all nodes that can transitively reach the given node.",
)
async def get_ancestors(
    graph_id: uuid.UUID,
    node_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[NodeSummary]:
    svc = GraphQueryService(db)
    return await svc.get_ancestors(graph_id, node_id)


@router.get(
    "/{graph_id}/nodes/{node_id}/descendants",
    response_model=list[NodeSummary],
    summary="Get all descendants",
    description="Returns all nodes transitively reachable from the given node.",
)
async def get_descendants(
    graph_id: uuid.UUID,
    node_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[NodeSummary]:
    svc = GraphQueryService(db)
    return await svc.get_descendants(graph_id, node_id)


@router.get(
    "/{graph_id}/nodes/{node_id}/neighborhood",
    response_model=NeighborhoodResponse,
    summary="Get N-hop neighborhood",
    description="Returns nodes within N dependency hops of the given node.",
)
async def get_neighborhood(
    graph_id: uuid.UUID,
    node_id: uuid.UUID,
    depth: int = Query(default=2, ge=1, le=10, description="Number of hops"),
    db: AsyncSession = Depends(get_db),
) -> NeighborhoodResponse:
    svc = GraphQueryService(db)
    return await svc.get_neighborhood(graph_id, node_id, depth)


@router.get(
    "/{graph_id}/paths",
    response_model=PathResponse,
    summary="Find a dependency path",
    description="Find the shortest directed dependency path between two nodes.",
)
async def find_path(
    graph_id: uuid.UUID,
    source_id: uuid.UUID = Query(..., description="Source node ID"),
    target_id: uuid.UUID = Query(..., description="Target node ID"),
    db: AsyncSession = Depends(get_db),
) -> PathResponse:
    svc = GraphQueryService(db)
    return await svc.find_path(graph_id, source_id, target_id)


@router.get(
    "/{graph_id}/statistics",
    response_model=GraphStatisticsResponse,
    summary="Get graph statistics",
)
async def get_statistics(
    graph_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> GraphStatisticsResponse:
    svc = GraphQueryService(db)
    return await svc.get_statistics(graph_id)


@router.get(
    "/{graph_id}/validation",
    response_model=GraphValidationResponse,
    summary="Validate a graph",
    description=(
        "Validate the graph for structural and value correctness. "
        "Returns ERROR/WARNING/INFO findings. Cycles are INFO, not errors."
    ),
)
async def validate_graph(
    graph_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> GraphValidationResponse:
    svc = GraphValidationService(db)
    return await svc.validate(graph_id)
