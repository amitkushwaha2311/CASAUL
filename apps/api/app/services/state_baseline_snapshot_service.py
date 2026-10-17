"""
CAUSAL API — State Baseline & Snapshot Service (Phase 4).

Manages:
- Baseline capture, retrieval, and listing (immutable reference states)
- Snapshot capture, retrieval, and listing (point-in-time states)
- State comparisons:
    * baseline vs current
    * snapshot vs current
    * snapshot A vs snapshot B
- Scenario-scoped states without mutating live operational state.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.graph_models import InfrastructureGraph, Node
from app.models.state_models import Scenario, StateBaseline, StateSnapshot
from app.schemas.state import (
    BaselineCreate,
    BaselineResponse,
    NodeComparisonDetail,
    NodeStateDiff,
    ScenarioCreate,
    ScenarioResponse,
    SnapshotCreate,
    SnapshotResponse,
    StateComparisonResponse,
)
from app.services.current_state_service import CurrentStateService
from app.services.state_reconstruction_service import StateReconstructionService


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class StateBaselineSnapshotService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.current_state_service = CurrentStateService(db)
        self.reconstruction_service = StateReconstructionService(db)

    # ── Baselines ────────────────────────────────────────────────────────────

    async def create_baseline(
        self, graph_id: uuid.UUID, data: BaselineCreate
    ) -> StateBaseline:
        # Fetch current state to form baseline
        curr = await self.current_state_service.get_graph_state(graph_id)

        node_states_map: dict[str, Any] = {}
        for nd in curr.nodes:
            node_states_map[str(nd.node_id)] = {
                "node_id": str(nd.node_id),
                "node_name": nd.node_name,
                "node_type": nd.node_type,
                "state": nd.state,
                "health": nd.health,
                "capacity": nd.capacity,
                "availability": nd.availability,
                "criticality": nd.criticality,
                "confidence": nd.confidence,
                "source": nd.source,
                "observed_at": nd.last_observed_at.isoformat() if nd.last_observed_at else None,
                "consistency_status": nd.consistency_status,
            }

        # If is_active is True, deactivate previous active baselines
        if data.is_active:
            prev_actives = (
                (
                    await self.db.execute(
                        select(StateBaseline).where(
                            StateBaseline.graph_id == graph_id,
                            StateBaseline.is_active == True,  # noqa: E712
                        )
                    )
                )
                .scalars()
                .all()
            )
            for pb in prev_actives:
                pb.is_active = False

        baseline = StateBaseline(
            graph_id=graph_id,
            name=data.name,
            description=data.description,
            is_active=data.is_active,
            captured_at=_utc_now(),
            node_states=node_states_map,
            completeness_ratio=curr.completeness_ratio,
            metadata_=data.metadata,
        )
        self.db.add(baseline)
        await self.db.commit()
        await self.db.refresh(baseline)
        return baseline

    async def get_baseline(
        self, graph_id: uuid.UUID, baseline_id: uuid.UUID
    ) -> StateBaseline:
        res = await self.db.execute(
            select(StateBaseline).where(
                StateBaseline.id == baseline_id,
                StateBaseline.graph_id == graph_id,
            )
        )
        b = res.scalar_one_or_none()
        if not b:
            raise HTTPException(
                status_code=404,
                detail=f"Baseline {baseline_id} not found in graph {graph_id}",
            )
        return b

    async def list_baselines(
        self, graph_id: uuid.UUID
    ) -> list[StateBaseline]:
        # Validate graph
        await self._require_graph(graph_id)
        res = await self.db.execute(
            select(StateBaseline)
            .where(StateBaseline.graph_id == graph_id)
            .order_by(desc(StateBaseline.captured_at))
        )
        return list(res.scalars().all())

    # ── Snapshots ────────────────────────────────────────────────────────────

    async def create_snapshot(
        self, graph_id: uuid.UUID, data: SnapshotCreate
    ) -> StateSnapshot:
        await self._require_graph(graph_id)
        effective_at = data.effective_at or _utc_now()
        if effective_at.tzinfo is None:
            effective_at = effective_at.replace(tzinfo=timezone.utc)

        node_states_map: dict[str, Any] = {}
        completeness = 1.0

        if data.snapshot_type == "RECONSTRUCTED":
            recon = await self.reconstruction_service.reconstruct_graph_state_at(
                graph_id, effective_at
            )
            completeness = recon.completeness_ratio
            for nd in recon.nodes:
                node_states_map[str(nd.node_id)] = {
                    "node_id": str(nd.node_id),
                    "node_name": nd.node_name,
                    "node_type": nd.node_type,
                    "state": nd.state,
                    "health": nd.health,
                    "capacity": nd.capacity,
                    "availability": nd.availability,
                    "criticality": nd.criticality,
                    "confidence": nd.confidence,
                    "source": nd.source,
                    "observed_at": nd.last_observed_at.isoformat() if nd.last_observed_at else None,
                    "consistency_status": nd.consistency_status,
                }
        else:
            curr = await self.current_state_service.get_graph_state(graph_id)
            completeness = curr.completeness_ratio
            for nd in curr.nodes:
                node_states_map[str(nd.node_id)] = {
                    "node_id": str(nd.node_id),
                    "node_name": nd.node_name,
                    "node_type": nd.node_type,
                    "state": nd.state,
                    "health": nd.health,
                    "capacity": nd.capacity,
                    "availability": nd.availability,
                    "criticality": nd.criticality,
                    "confidence": nd.confidence,
                    "source": nd.source,
                    "observed_at": nd.last_observed_at.isoformat() if nd.last_observed_at else None,
                    "consistency_status": nd.consistency_status,
                }

        # Build compact summary
        summary = {
            "total_nodes": len(node_states_map),
            "completeness_ratio": completeness,
            "states": {
                s: sum(1 for n in node_states_map.values() if n.get("state") == s)
                for s in ["NORMAL", "DEGRADED", "CRITICAL", "FAILED", "RECOVERING", "UNKNOWN"]
            },
        }

        snapshot = StateSnapshot(
            graph_id=graph_id,
            name=data.name or f"Snapshot {effective_at.isoformat()}",
            snapshot_type=data.snapshot_type,
            captured_at=_utc_now(),
            effective_at=effective_at,
            node_states=node_states_map,
            summary=summary,
            completeness_ratio=completeness,
            metadata_=data.metadata,
        )
        self.db.add(snapshot)
        await self.db.commit()
        await self.db.refresh(snapshot)
        return snapshot

    async def get_snapshot(
        self, graph_id: uuid.UUID, snapshot_id: uuid.UUID
    ) -> StateSnapshot:
        res = await self.db.execute(
            select(StateSnapshot).where(
                StateSnapshot.id == snapshot_id,
                StateSnapshot.graph_id == graph_id,
            )
        )
        s = res.scalar_one_or_none()
        if not s:
            raise HTTPException(
                status_code=404,
                detail=f"Snapshot {snapshot_id} not found in graph {graph_id}",
            )
        return s

    async def list_snapshots(
        self, graph_id: uuid.UUID
    ) -> list[StateSnapshot]:
        await self._require_graph(graph_id)
        res = await self.db.execute(
            select(StateSnapshot)
            .where(StateSnapshot.graph_id == graph_id)
            .order_by(desc(StateSnapshot.effective_at))
        )
        return list(res.scalars().all())

    # ── Comparisons ──────────────────────────────────────────────────────────

    async def compare_baseline_vs_current(
        self, graph_id: uuid.UUID, baseline_id: uuid.UUID
    ) -> StateComparisonResponse:
        baseline = await self.get_baseline(graph_id, baseline_id)
        curr = await self.current_state_service.get_graph_state(graph_id)

        curr_map = {
            str(nd.node_id): {
                "node_id": str(nd.node_id),
                "node_name": nd.node_name,
                "state": nd.state,
                "health": nd.health,
                "capacity": nd.capacity,
                "availability": nd.availability,
            }
            for nd in curr.nodes
        }

        return self._compare_state_maps(
            graph_id=graph_id,
            comparison_type="BASELINE_VS_CURRENT",
            source_a_label=f"Baseline: {baseline.name}",
            source_b_label="Current Live State",
            source_a_timestamp=baseline.captured_at,
            source_b_timestamp=curr.as_of,
            map_a=baseline.node_states,
            map_b=curr_map,
        )

    async def compare_snapshots(
        self,
        graph_id: uuid.UUID,
        snapshot_a_id: uuid.UUID,
        snapshot_b_id: uuid.UUID | None = None,
    ) -> StateComparisonResponse:
        snap_a = await self.get_snapshot(graph_id, snapshot_a_id)

        if snapshot_b_id is not None:
            snap_b = await self.get_snapshot(graph_id, snapshot_b_id)
            return self._compare_state_maps(
                graph_id=graph_id,
                comparison_type="SNAPSHOT_VS_SNAPSHOT",
                source_a_label=snap_a.name or f"Snapshot {snap_a.id}",
                source_b_label=snap_b.name or f"Snapshot {snap_b.id}",
                source_a_timestamp=snap_a.effective_at,
                source_b_timestamp=snap_b.effective_at,
                map_a=snap_a.node_states,
                map_b=snap_b.node_states,
            )
        else:
            # Snapshot vs Current
            curr = await self.current_state_service.get_graph_state(graph_id)
            curr_map = {
                str(nd.node_id): {
                    "node_id": str(nd.node_id),
                    "node_name": nd.node_name,
                    "state": nd.state,
                    "health": nd.health,
                    "capacity": nd.capacity,
                    "availability": nd.availability,
                }
                for nd in curr.nodes
            }
            return self._compare_state_maps(
                graph_id=graph_id,
                comparison_type="SNAPSHOT_VS_CURRENT",
                source_a_label=snap_a.name or f"Snapshot {snap_a.id}",
                source_b_label="Current Live State",
                source_a_timestamp=snap_a.effective_at,
                source_b_timestamp=curr.as_of,
                map_a=snap_a.node_states,
                map_b=curr_map,
            )

    def _compare_state_maps(
        self,
        graph_id: uuid.UUID,
        comparison_type: str,
        source_a_label: str,
        source_b_label: str,
        source_a_timestamp: datetime | None,
        source_b_timestamp: datetime | None,
        map_a: dict[str, Any],
        map_b: dict[str, Any],
    ) -> StateComparisonResponse:
        all_node_keys = set(map_a.keys()).union(set(map_b.keys()))

        comparisons: list[NodeComparisonDetail] = []
        changed_count = 0
        unchanged_count = 0

        fields_to_compare = ["state", "health", "capacity", "availability"]

        for nid_str in sorted(all_node_keys):
            a_data = map_a.get(nid_str)
            b_data = map_b.get(nid_str)
            node_name = (
                (b_data.get("node_name") if b_data else None)
                or (a_data.get("node_name") if a_data else None)
                or nid_str
            )

            diffs: list[NodeStateDiff] = []
            is_node_changed = False

            for field in fields_to_compare:
                val_a = a_data.get(field) if a_data else None
                val_b = b_data.get(field) if b_data else None

                # Round floats for precision comparison
                if isinstance(val_a, float) and isinstance(val_b, float):
                    is_diff = round(val_a, 4) != round(val_b, 4)
                else:
                    is_diff = val_a != val_b

                if is_diff:
                    is_node_changed = True
                    change_type = (
                        "MODIFIED" if (a_data and b_data) else ("ADDED" if b_data else "REMOVED")
                    )
                    diffs.append(
                        NodeStateDiff(
                            node_id=uuid.UUID(nid_str),
                            node_name=node_name,
                            field_name=field,
                            previous_value=val_a,
                            current_value=val_b,
                            previous_timestamp=source_a_timestamp,
                            current_timestamp=source_b_timestamp,
                            change_type=change_type,  # type: ignore
                        )
                    )

            if is_node_changed:
                changed_count += 1
            else:
                unchanged_count += 1

            comparisons.append(
                NodeComparisonDetail(
                    node_id=uuid.UUID(nid_str),
                    node_name=node_name,
                    is_changed=is_node_changed,
                    diffs=diffs,
                )
            )

        return StateComparisonResponse(
            graph_id=graph_id,
            comparison_type=comparison_type,  # type: ignore
            source_a_label=source_a_label,
            source_b_label=source_b_label,
            source_a_timestamp=source_a_timestamp,
            source_b_timestamp=source_b_timestamp,
            total_nodes_compared=len(all_node_keys),
            changed_nodes_count=changed_count,
            unchanged_nodes_count=unchanged_count,
            completeness_limitations="Note: Differences reflect temporal state variations only; temporal difference does not establish causality.",
            node_comparisons=comparisons,
        )

    # ── Scenarios ────────────────────────────────────────────────────────────

    async def create_scenario(
        self, graph_id: uuid.UUID, data: ScenarioCreate
    ) -> Scenario:
        await self._require_graph(graph_id)

        # Validate base snapshot / baseline belongs to graph if provided
        if data.base_snapshot_id:
            await self.get_snapshot(graph_id, data.base_snapshot_id)
        if data.base_baseline_id:
            await self.get_baseline(graph_id, data.base_baseline_id)

        scenario = Scenario(
            graph_id=graph_id,
            name=data.name,
            description=data.description,
            base_snapshot_id=data.base_snapshot_id,
            base_baseline_id=data.base_baseline_id,
            state_overrides=data.state_overrides,
            metadata_=data.metadata,
        )
        self.db.add(scenario)
        await self.db.commit()
        await self.db.refresh(scenario)
        return scenario

    async def get_scenario(
        self, graph_id: uuid.UUID, scenario_id: uuid.UUID
    ) -> Scenario:
        res = await self.db.execute(
            select(Scenario).where(
                Scenario.id == scenario_id,
                Scenario.graph_id == graph_id,
            )
        )
        sc = res.scalar_one_or_none()
        if not sc:
            raise HTTPException(
                status_code=404,
                detail=f"Scenario {scenario_id} not found in graph {graph_id}",
            )
        return sc

    async def list_scenarios(
        self, graph_id: uuid.UUID
    ) -> list[Scenario]:
        await self._require_graph(graph_id)
        res = await self.db.execute(
            select(Scenario)
            .where(Scenario.graph_id == graph_id)
            .order_by(desc(Scenario.created_at))
        )
        return list(res.scalars().all())

    async def _require_graph(self, graph_id: uuid.UUID) -> InfrastructureGraph:
        res = await self.db.execute(
            select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id)
        )
        graph = res.scalar_one_or_none()
        if not graph:
            raise HTTPException(
                status_code=404,
                detail=f"Graph {graph_id} not found",
            )
        return graph
