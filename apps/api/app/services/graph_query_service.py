"""
CAUSAL API — Graph Query Service (Phase 2).

Provides domain-independent graph traversal using NetworkX as the algorithm layer.

Architecture:
    Database (PostgreSQL) → GraphQueryService → NetworkX DiGraph → Algorithm → Domain result

PostgreSQL is the source of truth.
NetworkX is a computational tool, not a persistence layer.
Raw NetworkX objects are never exposed through the REST API.

Dependency direction convention:
    source_node_id → target_node_id
    means TARGET DEPENDS ON SOURCE.

Therefore in the NetworkX DiGraph we store the edge as:
    source → target
and define:
    UPSTREAM of node N = predecessors of N (nodes that N depends on directly)
    DOWNSTREAM of node N = successors of N (nodes that directly depend on N)
    ANCESTORS of N = all nodes that can reach N (all indirect upstreams)
    DESCENDANTS of N = all nodes reachable from N (all indirect downstreams)
"""

from __future__ import annotations

import uuid
from typing import Sequence

import networkx as nx
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.graph_models import Dependency, Node
from app.repositories.node_repository import NodeRepository
from app.repositories.dependency_repository import DependencyRepository
from app.schemas.graph import (
    GraphStatisticsResponse,
    NodeSummary,
    PathResponse,
    NeighborhoodResponse,
    DependencyResponse,
)


class GraphQueryService:
    """
    Domain-independent graph traversal and statistics service.

    All traversal methods accept graph_id and node IDs.
    All return domain objects, never raw NetworkX structures.
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._node_repo = NodeRepository(db)
        self._dep_repo = DependencyRepository(db)

    # ── NetworkX construction ──────────────────────────────────────────────

    async def _build_nx_graph(
        self, graph_id: uuid.UUID
    ) -> tuple[nx.DiGraph, dict[uuid.UUID, Node]]:
        """
        Build a NetworkX DiGraph from the database.

        Returns (nx_graph, node_map) where node_map maps uuid → Node.
        Edge direction: source → target (target depends on source).
        """
        nodes = await self._node_repo.list_by_graph(graph_id)
        deps = await self._dep_repo.list_by_graph(graph_id)

        node_map: dict[uuid.UUID, Node] = {n.id: n for n in nodes}

        g = nx.DiGraph()
        for node in nodes:
            g.add_node(node.id)

        for dep in deps:
            # source → target: target depends on source
            g.add_edge(dep.source_node_id, dep.target_node_id, dependency_id=dep.id)

        return g, node_map

    def _to_node_summary(self, node: Node) -> NodeSummary:
        return NodeSummary(
            id=node.id,
            name=node.name,
            type=node.type,
            state=node.state,
            health=node.health,
            criticality=node.criticality,
        )

    # ── Traversal methods ──────────────────────────────────────────────────

    async def get_upstream_nodes(
        self, graph_id: uuid.UUID, node_id: uuid.UUID
    ) -> list[NodeSummary]:
        """
        Direct upstream: nodes that directly affect the given node.
        In graph terms: direct predecessors of node_id.
        """
        g, node_map = await self._build_nx_graph(graph_id)
        if node_id not in g:
            return []
        return [
            self._to_node_summary(node_map[pred])
            for pred in g.predecessors(node_id)
            if pred in node_map
        ]

    async def get_downstream_nodes(
        self, graph_id: uuid.UUID, node_id: uuid.UUID
    ) -> list[NodeSummary]:
        """
        Direct downstream: nodes that directly depend on the given node.
        In graph terms: direct successors of node_id.
        """
        g, node_map = await self._build_nx_graph(graph_id)
        if node_id not in g:
            return []
        return [
            self._to_node_summary(node_map[succ])
            for succ in g.successors(node_id)
            if succ in node_map
        ]

    async def get_ancestors(
        self, graph_id: uuid.UUID, node_id: uuid.UUID
    ) -> list[NodeSummary]:
        """
        All nodes that can reach node_id (all transitive upstreams).
        Uses nx.ancestors which follows reverse edges.
        """
        g, node_map = await self._build_nx_graph(graph_id)
        if node_id not in g:
            return []
        ancestor_ids = nx.ancestors(g, node_id)
        return [
            self._to_node_summary(node_map[nid])
            for nid in sorted(ancestor_ids, key=str)  # deterministic ordering
            if nid in node_map
        ]

    async def get_descendants(
        self, graph_id: uuid.UUID, node_id: uuid.UUID
    ) -> list[NodeSummary]:
        """
        All nodes reachable from node_id (all transitive downstreams).
        Uses nx.descendants.
        """
        g, node_map = await self._build_nx_graph(graph_id)
        if node_id not in g:
            return []
        descendant_ids = nx.descendants(g, node_id)
        return [
            self._to_node_summary(node_map[nid])
            for nid in sorted(descendant_ids, key=str)  # deterministic ordering
            if nid in node_map
        ]

    async def get_neighborhood(
        self, graph_id: uuid.UUID, node_id: uuid.UUID, depth: int
    ) -> NeighborhoodResponse:
        """
        Return all nodes within N hops of node_id (in either direction).
        Returns nodes and the dependencies between them.
        """
        g, node_map = await self._build_nx_graph(graph_id)

        if node_id not in g:
            return NeighborhoodResponse(
                center_node_id=node_id,
                depth=depth,
                nodes=[],
                dependencies=[],
            )

        # BFS in both directions up to depth
        undirected = g.to_undirected()
        subgraph_nodes: set[uuid.UUID] = set()
        queue = [(node_id, 0)]
        visited = {node_id}
        while queue:
            current, d = queue.pop(0)
            subgraph_nodes.add(current)
            if d < depth:
                for neighbor in undirected.neighbors(current):
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append((neighbor, d + 1))

        # Collect dependencies within the subgraph
        deps = await self._dep_repo.list_by_graph(graph_id)
        sub_deps = [
            d for d in deps
            if d.source_node_id in subgraph_nodes and d.target_node_id in subgraph_nodes
        ]

        return NeighborhoodResponse(
            center_node_id=node_id,
            depth=depth,
            nodes=[
                self._to_node_summary(node_map[nid])
                for nid in sorted(subgraph_nodes, key=str)
                if nid in node_map
            ],
            dependencies=[
                DependencyResponse.model_validate(d, from_attributes=True)
                for d in sub_deps
            ],
        )

    async def find_path(
        self, graph_id: uuid.UUID, source_id: uuid.UUID, target_id: uuid.UUID
    ) -> PathResponse:
        """
        Find a shortest directed dependency path from source to target.
        Returns found=False if no path exists.
        """
        g, node_map = await self._build_nx_graph(graph_id)

        if source_id not in g or target_id not in g:
            return PathResponse(
                source_id=source_id, target_id=target_id,
                path=[], path_nodes=[], found=False
            )

        try:
            path_ids: list[uuid.UUID] = nx.shortest_path(g, source_id, target_id)
            return PathResponse(
                source_id=source_id,
                target_id=target_id,
                path=path_ids,
                path_nodes=[
                    self._to_node_summary(node_map[nid])
                    for nid in path_ids
                    if nid in node_map
                ],
                found=True,
            )
        except nx.NetworkXNoPath:
            return PathResponse(
                source_id=source_id, target_id=target_id,
                path=[], path_nodes=[], found=False
            )
        except nx.NodeNotFound:
            return PathResponse(
                source_id=source_id, target_id=target_id,
                path=[], path_nodes=[], found=False
            )

    # ── Statistics ─────────────────────────────────────────────────────────

    async def get_statistics(self, graph_id: uuid.UUID) -> GraphStatisticsResponse:
        """
        Compute deterministic graph statistics.

        Does NOT calculate:
        - risk scores
        - failure probabilities
        - cascade predictions
        Those belong to Phase 5+.
        """
        from app.models.graph_models import NodeState

        nodes = list(await self._node_repo.list_by_graph(graph_id))
        deps = list(await self._dep_repo.list_by_graph(graph_id))

        g, _ = await self._build_nx_graph(graph_id)

        # State counts
        state_counts = {s: 0 for s in NodeState.ALL}
        for node in nodes:
            if node.state in state_counts:
                state_counts[node.state] += 1

        # Average metrics
        avg_health = sum(n.health for n in nodes) / len(nodes) if nodes else 0.0
        avg_criticality = sum(n.criticality for n in nodes) / len(nodes) if nodes else 0.0

        # Topology analysis
        undirected = g.to_undirected()
        components = list(nx.connected_components(undirected)) if undirected.nodes else [[]]
        connected_components = len(components) if nodes else 0
        isolated = sum(1 for n in g.nodes if g.degree(n) == 0)

        # Cycle detection using simple cycles (deterministic)
        try:
            cycles = list(nx.simple_cycles(g))
            cycle_count = len(cycles)
        except Exception:
            cycle_count = 0

        return GraphStatisticsResponse(
            graph_id=graph_id,
            node_count=len(nodes),
            dependency_count=len(deps),
            healthy_node_count=state_counts[NodeState.NORMAL],
            degraded_node_count=state_counts[NodeState.DEGRADED],
            critical_node_count=state_counts[NodeState.CRITICAL],
            failed_node_count=state_counts[NodeState.FAILED],
            recovering_node_count=state_counts[NodeState.RECOVERING],
            average_health=round(avg_health, 4),
            average_criticality=round(avg_criticality, 4),
            connected_components=connected_components,
            isolated_nodes=isolated,
            cycle_count=cycle_count,
        )
