"""
CAUSAL API — System State & Digital Twin REST endpoints (Phase 4).

Endpoints:
CURRENT STATE:
  GET /api/v1/graphs/{graph_id}/state
  GET /api/v1/graphs/{graph_id}/nodes/{node_id}/state

HISTORICAL STATE:
  GET /api/v1/graphs/{graph_id}/nodes/{node_id}/state/history
  GET /api/v1/graphs/{graph_id}/state/history

HISTORICAL RECONSTRUCTION:
  GET /api/v1/graphs/{graph_id}/state/at
  GET /api/v1/graphs/{graph_id}/nodes/{node_id}/state/at

CONSISTENCY:
  GET /api/v1/graphs/{graph_id}/state/consistency

BASELINES:
  POST /api/v1/graphs/{graph_id}/baselines
  GET /api/v1/graphs/{graph_id}/baselines
  GET /api/v1/graphs/{graph_id}/baselines/{baseline_id}

SNAPSHOTS:
  POST /api/v1/graphs/{graph_id}/snapshots
  GET /api/v1/graphs/{graph_id}/snapshots
  GET /api/v1/graphs/{graph_id}/snapshots/{snapshot_id}

COMPARISONS:
  GET /api/v1/graphs/{graph_id}/state/compare

SCENARIOS:
  POST /api/v1/graphs/{graph_id}/scenarios
  GET /api/v1/graphs/{graph_id}/scenarios
  GET /api/v1/graphs/{graph_id}/scenarios/{scenario_id}

SUMMARY:
  GET /api/v1/graphs/{graph_id}/state/summary
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.graph_models import InfrastructureGraph, Node
from app.schemas.state import (
    BaselineCreate,
    BaselineResponse,
    CurrentGraphStateResponse,
    CurrentNodeStateResponse,
    ScenarioCreate,
    ScenarioResponse,
    SnapshotCreate,
    SnapshotResponse,
    StateComparisonResponse,
    StateConsistencyResponse,
    StateHistoryResponse,
    StateReconstructionResponse,
    SystemStateSummaryResponse,
)
from app.services.current_state_service import CurrentStateService
from app.services.state_baseline_snapshot_service import StateBaselineSnapshotService
from app.services.state_consistency_service import StateConsistencyService
from app.services.state_history_service import StateHistoryService
from app.services.state_reconstruction_service import StateReconstructionService
from app.services.system_state_summary_service import SystemStateSummaryService

router = APIRouter(tags=["state"])


async def _verify_graph_exists(graph_id: uuid.UUID, db: AsyncSession) -> None:
    res = await db.execute(select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id))
    if not res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Graph {graph_id} not found",
        )


async def _verify_node_exists(graph_id: uuid.UUID, node_id: uuid.UUID, db: AsyncSession) -> None:
    res = await db.execute(
        select(Node).where(Node.id == node_id, Node.graph_id == graph_id)
    )
    if not res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node {node_id} not found in graph {graph_id}",
        )


# ── Current State ──────────────────────────────────────────────────────────

@router.get(
    "/graphs/{graph_id}/state",
    response_model=CurrentGraphStateResponse,
    summary="Get current graph state",
    description="Returns the canonical operational state for all nodes in the infrastructure graph.",
)
async def get_graph_state(
    graph_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> CurrentGraphStateResponse:
    await _verify_graph_exists(graph_id, db)
    service = CurrentStateService(db)
    return await service.get_graph_state(graph_id)


@router.get(
    "/graphs/{graph_id}/nodes/{node_id}/state",
    response_model=CurrentNodeStateResponse,
    summary="Get current node state",
    description="Returns the canonical operational state, health, confidence, and provenance for a node.",
)
async def get_node_state(
    graph_id: uuid.UUID,
    node_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> CurrentNodeStateResponse:
    await _verify_graph_exists(graph_id, db)
    await _verify_node_exists(graph_id, node_id, db)
    service = CurrentStateService(db)
    return await service.get_node_state(graph_id, node_id)


# ── Historical State & History ─────────────────────────────────────────────

@router.get(
    "/graphs/{graph_id}/nodes/{node_id}/state/history",
    response_model=list[StateHistoryResponse],
    summary="Get node state history",
    description="Returns append-only audit history of validated state changes for a node.",
)
async def get_node_state_history(
    graph_id: uuid.UUID,
    node_id: uuid.UUID,
    start_time: datetime | None = Query(None, description="Start timestamp filter (UTC)"),
    end_time: datetime | None = Query(None, description="End timestamp filter (UTC)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> list[StateHistoryResponse]:
    await _verify_graph_exists(graph_id, db)
    await _verify_node_exists(graph_id, node_id, db)
    service = StateHistoryService(db)
    records = await service.list_node_history(
        graph_id, node_id, start_time=start_time, end_time=end_time, page=page, page_size=page_size
    )
    return [StateHistoryResponse.model_validate(r) for r in records]


@router.get(
    "/graphs/{graph_id}/state/history",
    response_model=list[StateHistoryResponse],
    summary="Get graph state history",
    description="Returns append-only audit history of validated state changes across the graph.",
)
async def get_graph_state_history(
    graph_id: uuid.UUID,
    start_time: datetime | None = Query(None),
    end_time: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> list[StateHistoryResponse]:
    await _verify_graph_exists(graph_id, db)
    service = StateHistoryService(db)
    records = await service.list_graph_history(
        graph_id, start_time=start_time, end_time=end_time, page=page, page_size=page_size
    )
    return [StateHistoryResponse.model_validate(r) for r in records]


# ── Historical Reconstruction ──────────────────────────────────────────────

def _parse_timestamp(ts_raw: str | datetime) -> datetime:
    if isinstance(ts_raw, datetime):
        return ts_raw.replace(tzinfo=timezone.utc) if ts_raw.tzinfo is None else ts_raw
    # Handle space encoded from + in query strings
    cleaned = ts_raw.replace(" ", "+")
    try:
        dt = datetime.fromisoformat(cleaned)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid ISO-8601 timestamp: {ts_raw}",
        )
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt



@router.get(
    "/graphs/{graph_id}/state/at",
    response_model=StateReconstructionResponse,
    summary="Reconstruct graph state at timestamp",
    description="Deterministically reconstructs graph state at a specified historical timestamp.",
)
async def reconstruct_graph_state_at(
    graph_id: uuid.UUID,
    timestamp: str = Query(..., description="Target historical timestamp (ISO-8601 UTC)"),
    db: AsyncSession = Depends(get_db),
) -> StateReconstructionResponse:
    await _verify_graph_exists(graph_id, db)
    parsed_dt = _parse_timestamp(timestamp)
    service = StateReconstructionService(db)
    return await service.reconstruct_graph_state_at(graph_id, parsed_dt)


@router.get(
    "/graphs/{graph_id}/nodes/{node_id}/state/at",
    response_model=StateReconstructionResponse,
    summary="Reconstruct node state at timestamp",
    description="Deterministically reconstructs a single node's state at a specified historical timestamp.",
)
async def reconstruct_node_state_at(
    graph_id: uuid.UUID,
    node_id: uuid.UUID,
    timestamp: str = Query(..., description="Target historical timestamp (ISO-8601 UTC)"),
    db: AsyncSession = Depends(get_db),
) -> StateReconstructionResponse:
    await _verify_graph_exists(graph_id, db)
    await _verify_node_exists(graph_id, node_id, db)
    parsed_dt = _parse_timestamp(timestamp)
    service = StateReconstructionService(db)
    return await service.reconstruct_node_state_at(graph_id, node_id, parsed_dt)



# ── Consistency ────────────────────────────────────────────────────────────

@router.get(
    "/graphs/{graph_id}/state/consistency",
    response_model=StateConsistencyResponse,
    summary="Evaluate state consistency",
    description="Centralized evaluation of state and health consistency rules for all nodes.",
)
async def get_state_consistency(
    graph_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> StateConsistencyResponse:
    await _verify_graph_exists(graph_id, db)
    current_service = CurrentStateService(db)
    curr = await current_service.get_graph_state(graph_id)
    nodes_data = [
        {
            "node_id": nd.node_id,
            "node_name": nd.node_name,
            "state": nd.state,
            "health": nd.health,
            "capacity": nd.capacity,
        }
        for nd in curr.nodes
    ]
    return StateConsistencyService.evaluate_graph_nodes(graph_id, nodes_data)


# ── Baselines ──────────────────────────────────────────────────────────────

@router.post(
    "/graphs/{graph_id}/baselines",
    response_model=BaselineResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Capture state baseline",
    description="Captures an immutable reference state baseline for comparison.",
)
async def create_baseline(
    graph_id: uuid.UUID,
    data: BaselineCreate,
    db: AsyncSession = Depends(get_db),
) -> BaselineResponse:
    await _verify_graph_exists(graph_id, db)
    service = StateBaselineSnapshotService(db)
    baseline = await service.create_baseline(graph_id, data)
    return BaselineResponse(
        id=baseline.id,
        graph_id=baseline.graph_id,
        name=baseline.name,
        description=baseline.description,
        is_active=baseline.is_active,
        captured_at=baseline.captured_at,
        completeness_ratio=baseline.completeness_ratio,
        node_count=len(baseline.node_states),
        node_states=baseline.node_states,
        metadata_=baseline.metadata_,
        created_at=baseline.created_at,
    )


@router.get(
    "/graphs/{graph_id}/baselines",
    response_model=list[BaselineResponse],
    summary="List state baselines",
    description="Lists all captured baselines for the infrastructure graph.",
)
async def list_baselines(
    graph_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[BaselineResponse]:
    await _verify_graph_exists(graph_id, db)
    service = StateBaselineSnapshotService(db)
    baselines = await service.list_baselines(graph_id)
    return [
        BaselineResponse(
            id=b.id,
            graph_id=b.graph_id,
            name=b.name,
            description=b.description,
            is_active=b.is_active,
            captured_at=b.captured_at,
            completeness_ratio=b.completeness_ratio,
            node_count=len(b.node_states),
            node_states=b.node_states,
            metadata_=b.metadata_,
            created_at=b.created_at,
        )
        for b in baselines
    ]


@router.get(
    "/graphs/{graph_id}/baselines/{baseline_id}",
    response_model=BaselineResponse,
    summary="Get state baseline",
    description="Retrieves a specific baseline by ID.",
)
async def get_baseline(
    graph_id: uuid.UUID,
    baseline_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> BaselineResponse:
    await _verify_graph_exists(graph_id, db)
    service = StateBaselineSnapshotService(db)
    b = await service.get_baseline(graph_id, baseline_id)
    return BaselineResponse(
        id=b.id,
        graph_id=b.graph_id,
        name=b.name,
        description=b.description,
        is_active=b.is_active,
        captured_at=b.captured_at,
        completeness_ratio=b.completeness_ratio,
        node_count=len(b.node_states),
        node_states=b.node_states,
        metadata_=b.metadata_,
        created_at=b.created_at,
    )


# ── Snapshots ──────────────────────────────────────────────────────────────

@router.post(
    "/graphs/{graph_id}/snapshots",
    response_model=SnapshotResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Capture state snapshot",
    description="Captures an immutable snapshot of system state at current time or historical timestamp.",
)
async def create_snapshot(
    graph_id: uuid.UUID,
    data: SnapshotCreate,
    db: AsyncSession = Depends(get_db),
) -> SnapshotResponse:
    await _verify_graph_exists(graph_id, db)
    service = StateBaselineSnapshotService(db)
    snapshot = await service.create_snapshot(graph_id, data)
    return SnapshotResponse(
        id=snapshot.id,
        graph_id=snapshot.graph_id,
        name=snapshot.name,
        snapshot_type=snapshot.snapshot_type,
        captured_at=snapshot.captured_at,
        effective_at=snapshot.effective_at,
        completeness_ratio=snapshot.completeness_ratio,
        node_count=len(snapshot.node_states),
        node_states=snapshot.node_states,
        summary=snapshot.summary,
        metadata_=snapshot.metadata_,
        created_at=snapshot.created_at,
    )


@router.get(
    "/graphs/{graph_id}/snapshots",
    response_model=list[SnapshotResponse],
    summary="List state snapshots",
    description="Lists all state snapshots for the infrastructure graph.",
)
async def list_snapshots(
    graph_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[SnapshotResponse]:
    await _verify_graph_exists(graph_id, db)
    service = StateBaselineSnapshotService(db)
    snapshots = await service.list_snapshots(graph_id)
    return [
        SnapshotResponse(
            id=s.id,
            graph_id=s.graph_id,
            name=s.name,
            snapshot_type=s.snapshot_type,
            captured_at=s.captured_at,
            effective_at=s.effective_at,
            completeness_ratio=s.completeness_ratio,
            node_count=len(s.node_states),
            node_states=s.node_states,
            summary=s.summary,
            metadata_=s.metadata_,
            created_at=s.created_at,
        )
        for s in snapshots
    ]


@router.get(
    "/graphs/{graph_id}/snapshots/{snapshot_id}",
    response_model=SnapshotResponse,
    summary="Get state snapshot",
    description="Retrieves a specific state snapshot by ID.",
)
async def get_snapshot(
    graph_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> SnapshotResponse:
    await _verify_graph_exists(graph_id, db)
    service = StateBaselineSnapshotService(db)
    s = await service.get_snapshot(graph_id, snapshot_id)
    return SnapshotResponse(
        id=s.id,
        graph_id=s.graph_id,
        name=s.name,
        snapshot_type=s.snapshot_type,
        captured_at=s.captured_at,
        effective_at=s.effective_at,
        completeness_ratio=s.completeness_ratio,
        node_count=len(s.node_states),
        node_states=s.node_states,
        summary=s.summary,
        metadata_=s.metadata_,
        created_at=s.created_at,
    )


# ── Comparisons ─────────────────────────────────────────────────────────────

@router.get(
    "/graphs/{graph_id}/state/compare",
    response_model=StateComparisonResponse,
    summary="Compare system states",
    description="Compares baseline vs current state, snapshot vs current state, or two snapshots.",
)
async def compare_states(
    graph_id: uuid.UUID,
    baseline_id: uuid.UUID | None = Query(None, description="Baseline ID to compare against current state"),
    snapshot_a: uuid.UUID | None = Query(None, description="Snapshot ID (for snapshot vs current or snapshot A)"),
    snapshot_b: uuid.UUID | None = Query(None, description="Snapshot B ID (for snapshot A vs B comparison)"),
    db: AsyncSession = Depends(get_db),
) -> StateComparisonResponse:
    await _verify_graph_exists(graph_id, db)
    service = StateBaselineSnapshotService(db)

    if baseline_id is not None:
        return await service.compare_baseline_vs_current(graph_id, baseline_id)
    elif snapshot_a is not None:
        return await service.compare_snapshots(graph_id, snapshot_a, snapshot_b)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must specify either baseline_id or snapshot_a parameter for state comparison",
        )


# ── Scenarios ───────────────────────────────────────────────────────────────

@router.post(
    "/graphs/{graph_id}/scenarios",
    response_model=ScenarioResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create scenario",
    description="Creates an isolated scenario container for state snapshots without mutating live state.",
)
async def create_scenario(
    graph_id: uuid.UUID,
    data: ScenarioCreate,
    db: AsyncSession = Depends(get_db),
) -> ScenarioResponse:
    await _verify_graph_exists(graph_id, db)
    service = StateBaselineSnapshotService(db)
    sc = await service.create_scenario(graph_id, data)
    return ScenarioResponse(
        id=sc.id,
        graph_id=sc.graph_id,
        name=sc.name,
        description=sc.description,
        base_snapshot_id=sc.base_snapshot_id,
        base_baseline_id=sc.base_baseline_id,
        state_overrides=sc.state_overrides,
        metadata_=sc.metadata_,
        created_at=sc.created_at,
        updated_at=sc.updated_at,
    )


@router.get(
    "/graphs/{graph_id}/scenarios",
    response_model=list[ScenarioResponse],
    summary="List scenarios",
    description="Lists all scenario containers for the infrastructure graph.",
)
async def list_scenarios(
    graph_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[ScenarioResponse]:
    await _verify_graph_exists(graph_id, db)
    service = StateBaselineSnapshotService(db)
    scenarios = await service.list_scenarios(graph_id)
    return [
        ScenarioResponse(
            id=sc.id,
            graph_id=sc.graph_id,
            name=sc.name,
            description=sc.description,
            base_snapshot_id=sc.base_snapshot_id,
            base_baseline_id=sc.base_baseline_id,
            state_overrides=sc.state_overrides,
            metadata_=sc.metadata_,
            created_at=sc.created_at,
            updated_at=sc.updated_at,
        )
        for sc in scenarios
    ]


@router.get(
    "/graphs/{graph_id}/scenarios/{scenario_id}",
    response_model=ScenarioResponse,
    summary="Get scenario",
    description="Retrieves an isolated scenario container by ID.",
)
async def get_scenario(
    graph_id: uuid.UUID,
    scenario_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> ScenarioResponse:
    await _verify_graph_exists(graph_id, db)
    service = StateBaselineSnapshotService(db)
    sc = await service.get_scenario(graph_id, scenario_id)
    return ScenarioResponse(
        id=sc.id,
        graph_id=sc.graph_id,
        name=sc.name,
        description=sc.description,
        base_snapshot_id=sc.base_snapshot_id,
        base_baseline_id=sc.base_baseline_id,
        state_overrides=sc.state_overrides,
        metadata_=sc.metadata_,
        created_at=sc.created_at,
        updated_at=sc.updated_at,
    )


# ── Summary ────────────────────────────────────────────────────────────────

@router.get(
    "/graphs/{graph_id}/state/summary",
    response_model=SystemStateSummaryResponse,
    summary="Get system state summary",
    description="Descriptive summary of graph state counts, averages, and consistency metrics.",
)
async def get_system_state_summary(
    graph_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> SystemStateSummaryResponse:
    await _verify_graph_exists(graph_id, db)
    service = SystemStateSummaryService(db)
    return await service.get_summary(graph_id)
