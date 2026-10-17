"""
CAUSAL API — Phase 6: Probabilistic, Time-Aware Cascade Prediction Engine Service.

Implements the deterministic, reproducible cascade simulation engine:
- Traverses downstream along established dependency directions:
  source_node → target_node (target depends on source).
- Accounts for node state, dependency strength, required flag, and failure_propagation.
- Computes time-to-impact intervals and heuristic probability bounds.
- Prevents cyclic traversal and double-counting of converging paths.
- Enforces strict simulation horizon and depth bounds.
- Supports deterministic execution and reproducible seeded Monte Carlo sampling.
- Persists auditable forecast runs without mutating live operational state.
"""

from __future__ import annotations

import random
import uuid
from collections import deque
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cascade_models import (
    CalibrationStatus,
    CascadeForecastRun,
    CascadeImpactLevel,
    CascadeNodeForecastStatus,
    CascadePredictedNode,
    CascadePropagationPath,
    DelaySource,
    SimulationMode,
)
from app.models.graph_models import Dependency, InfrastructureGraph, Node, NodeState
from app.schemas.cascade import (
    CascadeForecastListItem,
    CascadeForecastListResponse,
    CascadeForecastRequest,
    CascadeForecastResponse,
    CascadeImpactSummary,
    CascadeTimelineEvent,
    CascadeTimelineResponse,
    PredictedNodeDetail,
    PropagationPathDetail,
    TimeToImpactRange,
)


def _utc_now() -> datetime:
    return datetime.now(UTC)


# Standard documented heuristic propagation delay table (seconds)
HEURISTIC_DELAY_DEFAULTS: dict[str, float] = {
    "power": 60.0,
    "electrical": 60.0,
    "telecom": 120.0,
    "control": 120.0,
    "data": 120.0,
    "water": 600.0,
    "flow": 600.0,
    "hydraulic": 600.0,
    "cooling": 300.0,
    "fuel": 900.0,
    "chemical": 900.0,
    "default": 300.0,
}


class CascadePredictionEngine:
    """
    Simulation service for estimating downstream failure propagation across infrastructure graphs.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def run_forecast(
        self,
        graph_id: uuid.UUID,
        request: CascadeForecastRequest,
        *,
        base_node_states: dict[str, dict[str, Any]] | None = None,
        node_overrides: dict[str, dict[str, Any]] | None = None,
        dependency_overrides: dict[str, dict[str, Any]] | None = None,
        experiment_context: dict[str, Any] | None = None,
    ) -> CascadeForecastResponse:
        """
        Executes an uncertainty-aware cascade forecast simulation and persists the run.
        Optionally accepts base_node_states, node_overrides, and dependency_overrides for Phase 7
        counterfactual simulations without mutating live operational state.
        """
        # 1. Fetch graph and all associated nodes and dependencies
        graph_stmt = select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id)
        graph_res = await self.db.execute(graph_stmt)
        graph = graph_res.scalar_one_or_none()
        if not graph:
            raise ValueError(f"Graph {graph_id} not found")

        nodes_stmt = select(Node).where(Node.graph_id == graph_id)
        nodes_res = await self.db.execute(nodes_stmt)
        nodes_list = list(nodes_res.scalars().all())

        if not base_node_states and not node_overrides:
            sim_nodes_list = nodes_list
        else:
            sim_nodes_list = []
            for n in nodes_list:
                n_key = str(n.id)
                n_state = n.state
                n_health = n.health
                n_capacity = n.capacity
                n_criticality = n.criticality

                # Apply baseline/snapshot state if provided
                if base_node_states and n_key in base_node_states:
                    b_info = base_node_states[n_key]
                    if "state" in b_info and b_info["state"] is not None:
                        n_state = b_info["state"]
                    if "health" in b_info and b_info["health"] is not None:
                        n_health = float(b_info["health"])
                    if "capacity" in b_info and b_info["capacity"] is not None:
                        n_capacity = float(b_info["capacity"])

                # Apply hypothetical node overrides if provided
                if node_overrides and n_key in node_overrides:
                    o_info = node_overrides[n_key]
                    if "state" in o_info and o_info["state"] is not None:
                        n_state = o_info["state"]
                    if "health" in o_info and o_info["health"] is not None:
                        n_health = float(o_info["health"])
                    if "capacity" in o_info and o_info["capacity"] is not None:
                        n_capacity = float(o_info["capacity"])

                sim_node = Node(
                    id=n.id,
                    graph_id=n.graph_id,
                    name=n.name,
                    type=n.type,
                    description=n.description,
                    state=n_state,
                    health=n_health,
                    capacity=n_capacity,
                    criticality=n_criticality,
                    location=n.location,
                    metadata_=n.metadata_,
                )
                sim_nodes_list.append(sim_node)

        node_map: dict[uuid.UUID, Node] = {n.id: n for n in sim_nodes_list}

        if request.initiating_node_id and request.initiating_node_id not in node_map:
            raise ValueError(
                f"Initiating node {request.initiating_node_id} does not belong to graph {graph_id}"
            )

        deps_stmt = select(Dependency).where(Dependency.graph_id == graph_id)
        deps_res = await self.db.execute(deps_stmt)
        deps_list = list(deps_res.scalars().all())

        if not dependency_overrides:
            sim_deps_list = deps_list
        else:
            sim_deps_list = []
            for dep in deps_list:
                dep_key = str(dep.id)
                dep_active = True
                dep_strength = dep.strength
                dep_propagation = dep.failure_propagation
                dep_metadata = dict(dep.metadata_ or {})

                if dep_key in dependency_overrides:
                    d_info = dependency_overrides[dep_key]
                    if "active" in d_info and d_info["active"] is False:
                        dep_active = False
                    if "strength" in d_info and d_info["strength"] is not None:
                        dep_strength = float(d_info["strength"])
                    if "delay_seconds" in d_info and d_info["delay_seconds"] is not None:
                        dep_metadata["propagation_delay_seconds"] = float(d_info["delay_seconds"])

                if dep_active:
                    sim_dep = Dependency(
                        id=dep.id,
                        graph_id=dep.graph_id,
                        source_node_id=dep.source_node_id,
                        target_node_id=dep.target_node_id,
                        dependency_type=dep.dependency_type,
                        strength=dep_strength,
                        required=dep.required,
                        failure_propagation=dep_propagation,
                        metadata_=dep_metadata,
                    )
                    sim_deps_list.append(sim_dep)

        # Build downstream adjacency: source -> list of dependencies where target depends on source
        # Semantics: source_node -> target_node means TARGET DEPENDS ON SOURCE.
        # A disturbance at source propagates to target!
        outgoing_deps: dict[uuid.UUID, list[Dependency]] = {n.id: [] for n in sim_nodes_list}
        for dep in sim_deps_list:
            if dep.source_node_id in outgoing_deps:
                outgoing_deps[dep.source_node_id].append(dep)

        nodes_list = sim_nodes_list

        horizon_seconds = request.horizon_minutes * 60.0
        max_depth = request.max_depth
        rng = random.Random(request.seed if request.seed is not None else 42)  # noqa: S311

        # 2. Identify Initial Disturbance Set
        initiating_nodes: list[Node] = []
        already_affected_ids: set[uuid.UUID] = set()

        if request.initiating_node_id:
            init_node = node_map[request.initiating_node_id]
            initiating_nodes.append(init_node)
            already_affected_ids.add(init_node.id)
        else:
            for n in nodes_list:
                if (
                    n.state in (NodeState.DEGRADED, NodeState.CRITICAL, NodeState.FAILED)
                    or n.health < 0.7
                ):
                    initiating_nodes.append(n)
                    already_affected_ids.add(n.id)

        # 3. Breadth-First / Timed Traversal
        # State tracking per node to prevent double-counting and cycles
        # target_id -> dict with best timing, probability, depth, paths
        predicted_node_records: dict[uuid.UUID, dict[str, Any]] = {}
        propagation_path_records: list[dict[str, Any]] = []

        # Initialize initiating nodes
        for init_node in initiating_nodes:
            is_observed_failed = (
                init_node.state
                in (
                    NodeState.DEGRADED,
                    NodeState.CRITICAL,
                    NodeState.FAILED,
                )
                or init_node.health < 0.7
            )

            predicted_node_records[init_node.id] = {
                "node": init_node,
                "forecast_status": (
                    CascadeNodeForecastStatus.ALREADY_AFFECTED
                    if is_observed_failed
                    else CascadeNodeForecastStatus.PREDICTED_AFFECTED
                ),
                "current_state": init_node.state,
                "predicted_state": init_node.state if is_observed_failed else NodeState.DEGRADED,
                "impact_level": self._classify_impact(init_node.criticality),
                "earliest_impact_seconds": 0.0,
                "latest_impact_seconds": 0.0,
                "point_impact_seconds": 0.0,
                "prob_min": 1.0,
                "prob_max": 1.0,
                "prob_point": 1.0,
                "depth": 0,
                "path_summary": [str(init_node.id)],
                "contributing_causes": [],
                "delay_source": DelaySource.METADATA,
                "assumptions": ["Identified as initial disturbance point for simulation run."],
                "limitations": [],
            }

        # Traversal queue items: (node_id, current_depth, cumulative_earliest_s,
        # cumulative_latest_s, cumulative_point_s, current_prob_point, path_chain)
        queue = deque(
            [
                (
                    n.id,
                    0,
                    0.0,
                    0.0,
                    0.0,
                    1.0,
                    [str(n.id)],
                )
                for n in initiating_nodes
            ]
        )

        visited_depth: dict[uuid.UUID, int] = {n.id: 0 for n in initiating_nodes}

        while queue:
            (
                curr_node_id,
                curr_depth,
                curr_earliest_s,
                curr_latest_s,
                curr_point_s,
                curr_prob,
                curr_path_chain,
            ) = queue.popleft()

            if curr_depth >= max_depth:
                continue

            for dep in outgoing_deps.get(curr_node_id, []):
                target_id = dep.target_node_id
                target_node = node_map.get(target_id)
                if not target_node:
                    continue

                # Cycle Prevention: do not traverse back onto active path chain
                if str(target_id) in curr_path_chain:
                    continue

                # Evaluate propagation probability and conditions
                prop_eval = self._evaluate_propagation(
                    dep=dep,
                    source_node=node_map[curr_node_id],
                    target_node=target_node,
                    parent_prob=curr_prob,
                    custom_delays=request.custom_delay_assumptions,
                    mode=request.simulation_mode,
                    rng=rng,
                )

                if not prop_eval["propagates"]:
                    continue

                if prop_eval["prob_point"] < request.propagation_probability_threshold:
                    continue

                step_delay = prop_eval["delay_seconds"]
                target_earliest_s = curr_earliest_s + (step_delay * 0.7)
                target_latest_s = curr_latest_s + (step_delay * 1.4)
                target_point_s = curr_point_s + step_delay

                # Check Horizon Bound: if point time exceeds horizon, exclude from impact
                if target_point_s > horizon_seconds:
                    continue

                target_depth = curr_depth + 1
                new_path_chain = curr_path_chain + [str(target_id)]

                # Record the propagation edge traversed
                path_record = {
                    "id": uuid.uuid4(),
                    "source_node_id": curr_node_id,
                    "source_node_name": node_map[curr_node_id].name,
                    "target_node_id": target_id,
                    "target_node_name": target_node.name,
                    "dependency_id": dep.id,
                    "hop_number": target_depth,
                    "estimated_delay_seconds": step_delay,
                    "delay_source": prop_eval["delay_source"],
                    "attenuation_factor": prop_eval["attenuation_factor"],
                    "propagation_rationale": prop_eval["rationale"],
                }
                propagation_path_records.append(path_record)

                # Merge or record node prediction (Prevent Double-Counting!)
                if target_id not in predicted_node_records:
                    # First time reached: create record
                    pred_state = self._determine_predicted_state(target_node, dep)
                    predicted_node_records[target_id] = {
                        "node": target_node,
                        "forecast_status": (
                            CascadeNodeForecastStatus.ALREADY_AFFECTED
                            if target_id in already_affected_ids
                            else CascadeNodeForecastStatus.PREDICTED_AFFECTED
                        ),
                        "current_state": target_node.state,
                        "predicted_state": pred_state,
                        "impact_level": self._classify_impact(target_node.criticality),
                        "earliest_impact_seconds": round(target_earliest_s, 1),
                        "latest_impact_seconds": round(target_latest_s, 1),
                        "point_impact_seconds": round(target_point_s, 1),
                        "prob_min": prop_eval["prob_min"],
                        "prob_max": prop_eval["prob_max"],
                        "prob_point": prop_eval["prob_point"],
                        "depth": target_depth,
                        "path_summary": new_path_chain,
                        "contributing_causes": [str(curr_node_id)],
                        "delay_source": prop_eval["delay_source"],
                        "assumptions": prop_eval["assumptions"],
                        "limitations": [
                            (
                                "Heuristic propagation model; "
                                "calibration pending empirical verification."
                            )
                        ],
                    }
                    visited_depth[target_id] = target_depth
                    queue.append(
                        (
                            target_id,
                            target_depth,
                            target_earliest_s,
                            target_latest_s,
                            target_point_s,
                            prop_eval["prob_point"],
                            new_path_chain,
                        )
                    )
                else:
                    # Already reached via another path: update with additional contributing
                    # cause and earliest impact time
                    rec = predicted_node_records[target_id]
                    if str(curr_node_id) not in rec["contributing_causes"]:
                        rec["contributing_causes"].append(str(curr_node_id))
                    if target_point_s < rec["point_impact_seconds"]:
                        rec["earliest_impact_seconds"] = round(target_earliest_s, 1)
                        rec["latest_impact_seconds"] = round(target_latest_s, 1)
                        rec["point_impact_seconds"] = round(target_point_s, 1)
                        rec["depth"] = target_depth
                        rec["path_summary"] = new_path_chain
                    # Combine non-mutually exclusive heuristic probabilities
                    rec["prob_point"] = round(
                        1.0 - (1.0 - rec["prob_point"]) * (1.0 - prop_eval["prob_point"]), 2
                    )

        # 4. Synthesize Summary & Metrics
        already_affected_count = sum(
            1
            for r in predicted_node_records.values()
            if r["forecast_status"] == CascadeNodeForecastStatus.ALREADY_AFFECTED
        )
        predicted_affected_count = sum(
            1
            for r in predicted_node_records.values()
            if r["forecast_status"] == CascadeNodeForecastStatus.PREDICTED_AFFECTED
        )
        critical_affected_count = sum(
            1 for r in predicted_node_records.values() if r["node"].criticality >= 0.7
        )
        max_depth_reached = max((r["depth"] for r in predicted_node_records.values()), default=0)

        impact_by_severity = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        impact_by_domain: dict[str, int] = {}
        for r in predicted_node_records.values():
            impact_by_severity[r["impact_level"]] += 1
            domain = r["node"].type.lower()
            impact_by_domain[domain] = impact_by_domain.get(domain, 0) + 1

        total_graph_nodes = len(nodes_list)
        unaffected_count = max(0, total_graph_nodes - len(predicted_node_records))

        # Composite criticality impact percentage formula:
        # (sum of criticalities of affected nodes / sum of criticalities of all nodes) * 100
        sum_total_criticality = sum(n.criticality for n in nodes_list) or 1.0
        sum_affected_criticality = sum(
            r["node"].criticality for r in predicted_node_records.values()
        )
        composite_metric = round((sum_affected_criticality / sum_total_criticality) * 100.0, 1)

        critical_nodes_at_risk = [
            {
                "node_id": str(r["node"].id),
                "name": r["node"].name,
                "criticality": r["node"].criticality,
                "status": r["forecast_status"],
                "impact_level": r["impact_level"],
                "time_to_impact_seconds": r["point_impact_seconds"],
            }
            for r in predicted_node_records.values()
            if r["node"].criticality >= 0.7
        ]

        assumptions_list = [
            "Propagation follows defined dependency direction: target depends on source.",
            (
                f"Simulation bounded to {request.horizon_minutes:.0f} minutes "
                f"and max depth {request.max_depth}."
            ),
            f"Execution mode: {request.simulation_mode} (seed: {request.seed}).",
            (
                "Dependencies without explicit delay metadata use documented heuristic "
                "defaults by domain."
            ),
            (
                "Propagation probabilities are uncalibrated heuristic intervals based "
                "on edge strength and coupling."
            ),
        ]
        if not initiating_nodes:
            assumptions_list.append(
                "No initiating disturbance specified and all nodes currently operate "
                "within normal thresholds."
            )

        warnings_list: list[str] = []
        if any(
            r["delay_source"] == DelaySource.HEURISTIC_DEFAULT
            for r in predicted_node_records.values()
        ):
            warnings_list.append(
                "Timing for one or more downstream hops uses default heuristic delays "
                "due to absent edge delay metadata."
            )
        if any(r["node"].state == NodeState.UNKNOWN for r in predicted_node_records.values()):
            warnings_list.append(
                "Telemetry on one or more path nodes is UNKNOWN; missing records do not "
                "guarantee resilience."
            )

        limitations_list = [
            (
                "Advisory simulation only: forecasts must not be treated as real-time "
                "infrastructure commands."
            ),
            (
                "Does not model automated operator intervention or counterfactual topology "
                "reconfigurations (Phases 7/8)."
            ),
            "Recovery trajectories modeled only where explicit recovery duration data exists.",
        ]

        summary_dict = {
            "total_nodes": total_graph_nodes,
            "total_already_affected": already_affected_count,
            "total_predicted_affected": predicted_affected_count,
            "total_unaffected": unaffected_count,
            "total_critical_affected": critical_affected_count,
            "max_depth_reached": max_depth_reached,
            "impact_by_severity": impact_by_severity,
            "impact_by_domain": impact_by_domain,
            "critical_nodes_at_risk": critical_nodes_at_risk,
            "composite_criticality_impact_percent": composite_metric,
            "composite_metric_explanation": (
                "Criticality-weighted ratio: sum of criticalities of affected nodes "
                "divided by total graph criticality."
            ),
            "assumptions": assumptions_list,
            "warnings": warnings_list,
            "limitations": limitations_list,
        }

        # 5. Persist Forecast Run and Predictions (DO NOT Mutate Live Operational State!)
        sim_settings = request.model_dump(mode="json")
        if experiment_context:
            sim_settings["experiment_context"] = experiment_context

        run_record = CascadeForecastRun(
            graph_id=graph_id,
            initiating_node_id=request.initiating_node_id,
            rule_version="1.0.0",
            simulation_mode=request.simulation_mode,
            calibration_status=CalibrationStatus.HEURISTIC_ESTIMATE,
            horizon_minutes=request.horizon_minutes,
            max_depth=request.max_depth,
            seed=request.seed,
            source_state_timestamp=_utc_now(),
            total_already_affected=already_affected_count,
            total_predicted_affected=predicted_affected_count,
            total_critical_affected=critical_affected_count,
            max_depth_reached=max_depth_reached,
            simulation_settings=sim_settings,
            summary=summary_dict,
        )
        self.db.add(run_record)
        await self.db.flush()

        # Save predicted node records
        for pred_data in predicted_node_records.values():
            n = pred_data["node"]
            time_range_data = {
                "min_seconds": pred_data["earliest_impact_seconds"],
                "max_seconds": pred_data["latest_impact_seconds"],
                "point_estimate_seconds": pred_data["point_impact_seconds"],
                "assumption": f"Delay derived from {pred_data['delay_source']}.",
                "delay_source": pred_data["delay_source"],
            }
            node_rec = CascadePredictedNode(
                forecast_id=run_record.id,
                node_id=n.id,
                forecast_status=pred_data["forecast_status"],
                current_state=pred_data["current_state"],
                predicted_state=pred_data["predicted_state"],
                predicted_impact_level=pred_data["impact_level"],
                earliest_impact_seconds=pred_data["earliest_impact_seconds"],
                latest_impact_seconds=pred_data["latest_impact_seconds"],
                time_to_impact_range=time_range_data,
                propagation_probability_min=pred_data["prob_min"],
                propagation_probability_max=pred_data["prob_max"],
                propagation_probability_point=pred_data["prob_point"],
                calibration_status=CalibrationStatus.HEURISTIC_ESTIMATE,
                depth=pred_data["depth"],
                path_summary=pred_data["path_summary"],
                contributing_causes=pred_data["contributing_causes"],
                assumptions=pred_data["assumptions"],
                limitations=pred_data["limitations"],
            )
            self.db.add(node_rec)

        # Save propagation path records
        for p_data in propagation_path_records:
            path_rec = CascadePropagationPath(
                id=p_data["id"],
                forecast_id=run_record.id,
                source_node_id=p_data["source_node_id"],
                target_node_id=p_data["target_node_id"],
                dependency_id=p_data["dependency_id"],
                hop_number=p_data["hop_number"],
                estimated_delay_seconds=p_data["estimated_delay_seconds"],
                delay_source=p_data["delay_source"],
                attenuation_factor=p_data["attenuation_factor"],
                propagation_rationale=p_data["propagation_rationale"],
            )
            self.db.add(path_rec)

        await self.db.commit()
        await self.db.refresh(run_record)

        return await self.get_forecast_details(graph_id, run_record.id)

    async def get_forecast_details(
        self, graph_id: uuid.UUID, forecast_id: uuid.UUID
    ) -> CascadeForecastResponse:
        """
        Retrieves full details of a persisted cascade forecast run.
        """
        stmt = (
            select(CascadeForecastRun)
            .where(
                CascadeForecastRun.id == forecast_id,
                CascadeForecastRun.graph_id == graph_id,
            )
            .options(
                selectinload(CascadeForecastRun.predicted_nodes).selectinload(
                    CascadePredictedNode.node
                ),
                selectinload(CascadeForecastRun.propagation_paths).selectinload(
                    CascadePropagationPath.source_node
                ),
                selectinload(CascadeForecastRun.propagation_paths).selectinload(
                    CascadePropagationPath.target_node
                ),
            )
        )
        res = await self.db.execute(stmt)
        run = res.scalar_one_or_none()
        if not run:
            raise ValueError(f"Forecast {forecast_id} not found in graph {graph_id}")

        predicted_nodes_details: list[PredictedNodeDetail] = []
        for pn in run.predicted_nodes:
            tr = None
            if pn.time_to_impact_range:
                tr = TimeToImpactRange(**pn.time_to_impact_range)
            predicted_nodes_details.append(
                PredictedNodeDetail(
                    node_id=pn.node_id,
                    node_name=pn.node.name,
                    node_type=pn.node.type,
                    criticality=pn.node.criticality,
                    forecast_status=pn.forecast_status,
                    current_state=pn.current_state,
                    predicted_state=pn.predicted_state,
                    predicted_impact_level=pn.predicted_impact_level,
                    earliest_impact_seconds=pn.earliest_impact_seconds,
                    latest_impact_seconds=pn.latest_impact_seconds,
                    time_to_impact_range=tr,
                    propagation_probability_min=pn.propagation_probability_min,
                    propagation_probability_max=pn.propagation_probability_max,
                    propagation_probability_point=pn.propagation_probability_point,
                    calibration_status=pn.calibration_status,
                    depth=pn.depth,
                    path_summary=pn.path_summary or [],
                    contributing_causes=pn.contributing_causes or [],
                    assumptions=pn.assumptions or [],
                    limitations=pn.limitations or [],
                )
            )

        propagation_paths_details: list[PropagationPathDetail] = []
        for pp in run.propagation_paths:
            propagation_paths_details.append(
                PropagationPathDetail(
                    id=pp.id,
                    source_node_id=pp.source_node_id,
                    source_node_name=pp.source_node.name,
                    target_node_id=pp.target_node_id,
                    target_node_name=pp.target_node.name,
                    dependency_id=pp.dependency_id,
                    hop_number=pp.hop_number,
                    estimated_delay_seconds=pp.estimated_delay_seconds,
                    delay_source=pp.delay_source,
                    attenuation_factor=pp.attenuation_factor,
                    propagation_rationale=pp.propagation_rationale,
                )
            )

        impact_summary = CascadeImpactSummary(**(run.summary or {}))

        return CascadeForecastResponse(
            id=run.id,
            graph_id=run.graph_id,
            initiating_node_id=run.initiating_node_id,
            rule_version=run.rule_version,
            simulation_mode=run.simulation_mode,
            calibration_status=run.calibration_status,
            horizon_minutes=run.horizon_minutes,
            max_depth=run.max_depth,
            seed=run.seed,
            source_state_timestamp=run.source_state_timestamp,
            total_already_affected=run.total_already_affected,
            total_predicted_affected=run.total_predicted_affected,
            total_critical_affected=run.total_critical_affected,
            max_depth_reached=run.max_depth_reached,
            impact_summary=impact_summary,
            predicted_nodes=predicted_nodes_details,
            propagation_paths=propagation_paths_details,
            created_at=run.created_at,
        )

    async def list_forecasts(
        self, graph_id: uuid.UUID, page: int = 1, page_size: int = 20
    ) -> CascadeForecastListResponse:
        """
        Lists paginated historical forecast runs for a graph.
        """
        stmt = (
            select(CascadeForecastRun)
            .where(CascadeForecastRun.graph_id == graph_id)
            .order_by(desc(CascadeForecastRun.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        res = await self.db.execute(stmt)
        runs = list(res.scalars().all())

        count_stmt = select(CascadeForecastRun).where(CascadeForecastRun.graph_id == graph_id)
        count_res = await self.db.execute(count_stmt)
        total = len(list(count_res.scalars().all()))

        items = [
            CascadeForecastListItem(
                id=r.id,
                graph_id=r.graph_id,
                initiating_node_id=r.initiating_node_id,
                rule_version=r.rule_version,
                simulation_mode=r.simulation_mode,
                calibration_status=r.calibration_status,
                horizon_minutes=r.horizon_minutes,
                total_already_affected=r.total_already_affected,
                total_predicted_affected=r.total_predicted_affected,
                total_critical_affected=r.total_critical_affected,
                max_depth_reached=r.max_depth_reached,
                created_at=r.created_at,
            )
            for r in runs
        ]

        return CascadeForecastListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
        )

    async def get_forecast_timeline(
        self, graph_id: uuid.UUID, forecast_id: uuid.UUID
    ) -> CascadeTimelineResponse:
        """
        Constructs a chronological event timeline from a forecast run.
        """
        details = await self.get_forecast_details(graph_id, forecast_id)

        events: list[CascadeTimelineEvent] = []
        for pn in details.predicted_nodes:
            offset_s = (
                pn.time_to_impact_range.point_estimate_seconds
                if pn.time_to_impact_range
                else (pn.earliest_impact_seconds or 0.0)
            )
            events.append(
                CascadeTimelineEvent(
                    timestamp_offset_seconds=offset_s,
                    node_id=pn.node_id,
                    node_name=pn.node_name,
                    event_type=(
                        "INITIAL_DISTURBANCE"
                        if pn.forecast_status == CascadeNodeForecastStatus.ALREADY_AFFECTED
                        else "CASCADE_PROPAGATION"
                    ),
                    forecast_status=pn.forecast_status,
                    predicted_state=pn.predicted_state,
                    impact_level=pn.predicted_impact_level,
                    depth=pn.depth,
                    propagation_probability_point=pn.propagation_probability_point,
                    explanation=(
                        f"Projected impact on {pn.node_name} ({pn.node_type}) at depth {pn.depth} "
                        f"via dependencies [{', '.join(pn.contributing_causes) or 'initial'}]."
                    ),
                )
            )

        events.sort(key=lambda e: (e.timestamp_offset_seconds, e.depth))

        return CascadeTimelineResponse(
            forecast_id=forecast_id,
            graph_id=graph_id,
            horizon_minutes=details.horizon_minutes,
            events=events,
        )

    async def get_forecast_impact(
        self, graph_id: uuid.UUID, forecast_id: uuid.UUID
    ) -> CascadeImpactSummary:
        """
        Returns only the impact and severity summary for a forecast run.
        """
        details = await self.get_forecast_details(graph_id, forecast_id)
        return details.impact_summary

    async def get_node_forecasts(
        self, graph_id: uuid.UUID, node_id: uuid.UUID
    ) -> list[CascadeForecastListItem]:
        """
        Lists historical forecast runs that included the specified node.
        """
        stmt = (
            select(CascadeForecastRun)
            .join(CascadePredictedNode, CascadeForecastRun.id == CascadePredictedNode.forecast_id)
            .where(
                CascadeForecastRun.graph_id == graph_id,
                CascadePredictedNode.node_id == node_id,
            )
            .order_by(desc(CascadeForecastRun.created_at))
            .limit(20)
        )
        res = await self.db.execute(stmt)
        runs = list(res.scalars().all())

        return [
            CascadeForecastListItem(
                id=r.id,
                graph_id=r.graph_id,
                initiating_node_id=r.initiating_node_id,
                rule_version=r.rule_version,
                simulation_mode=r.simulation_mode,
                calibration_status=r.calibration_status,
                horizon_minutes=r.horizon_minutes,
                total_already_affected=r.total_already_affected,
                total_predicted_affected=r.total_predicted_affected,
                total_critical_affected=r.total_critical_affected,
                max_depth_reached=r.max_depth_reached,
                created_at=r.created_at,
            )
            for r in runs
        ]

    # ── Internal Helpers ───────────────────────────────────────────────────

    def _classify_impact(self, criticality: float) -> str:
        """Classify consequence severity based on node criticality."""
        if criticality >= 0.8:
            return CascadeImpactLevel.CRITICAL
        if criticality >= 0.6:
            return CascadeImpactLevel.HIGH
        if criticality >= 0.4:
            return CascadeImpactLevel.MEDIUM
        return CascadeImpactLevel.LOW

    def _determine_predicted_state(self, target_node: Node, dep: Dependency) -> str:
        """Determines expected state under upstream disruption."""
        if dep.required and dep.strength >= 0.8:
            return NodeState.FAILED
        if dep.required or dep.strength >= 0.5:
            return NodeState.CRITICAL
        return NodeState.DEGRADED

    def _evaluate_propagation(
        self,
        dep: Dependency,
        source_node: Node,
        target_node: Node,
        parent_prob: float,
        custom_delays: dict[str, float] | None,
        mode: str,
        rng: random.Random,
    ) -> dict[str, Any]:
        """
        Evaluates heuristic propagation likelihood and timing along a single dependency edge.
        """
        # Determine delay
        delay_source = DelaySource.HEURISTIC_DEFAULT
        step_delay = HEURISTIC_DELAY_DEFAULTS.get(
            dep.dependency_type.lower(), HEURISTIC_DELAY_DEFAULTS["default"]
        )

        if dep.metadata_ and "propagation_delay_seconds" in dep.metadata_:
            try:
                step_delay = float(dep.metadata_["propagation_delay_seconds"])
                delay_source = DelaySource.METADATA
            except (ValueError, TypeError):
                pass
        elif custom_delays and dep.dependency_type.lower() in custom_delays:
            step_delay = float(custom_delays[dep.dependency_type.lower()])
            delay_source = DelaySource.HEURISTIC_DEFAULT

        # Determine heuristic probability interval
        # Base factor reflects edge strength and documented failure_propagation
        edge_factor = dep.strength * dep.failure_propagation

        assumptions: list[str] = []
        if dep.required:
            # Mandatory dependency: failure in provider directly impairs target
            prob_min = round(max(0.40, min(0.95, edge_factor * 0.85)), 2)
            prob_max = round(max(prob_min, min(0.99, edge_factor * 1.05)), 2)
            prob_point = round((prob_min + prob_max) / 2.0, 2)
            attenuation = 1.0
            rationale = (
                f"Required dependency '{dep.dependency_type}' (strength={dep.strength:.2f}) "
                f"provides no fallback mechanism; failure propagation factor is "
                f"{dep.failure_propagation:.2f}."
            )
            assumptions.append(
                f"Target '{target_node.name}' fundamentally requires source '{source_node.name}'."
            )
        else:
            # Optional / non-essential dependency: partial attenuation applies
            if dep.strength < 0.3:
                # Weak non-required edge: propagation heavily attenuated
                prob_min = 0.05
                prob_max = 0.15
                prob_point = 0.10
                attenuation = 0.2
                rationale = (
                    f"Non-required weak dependency '{dep.dependency_type}' "
                    f"(strength={dep.strength:.2f}); attenuation dampens cascading effects."
                )
            else:
                prob_min = round(max(0.15, edge_factor * 0.35), 2)
                prob_max = round(max(prob_min, edge_factor * 0.70), 2)
                prob_point = round((prob_min + prob_max) / 2.0, 2)
                attenuation = 0.6
                rationale = (
                    f"Non-required dependency '{dep.dependency_type}' "
                    f"(strength={dep.strength:.2f}) allows partial operational buffer."
                )
            assumptions.append(
                f"Non-required dependency assumes partial operational buffer "
                f"on '{target_node.name}'."
            )

        # In stochastic Monte Carlo mode, roll against probability
        propagates = True
        if mode == SimulationMode.MONTE_CARLO:
            roll = rng.random()
            propagates = roll <= prob_point

        return {
            "propagates": propagates,
            "delay_seconds": step_delay,
            "delay_source": delay_source,
            "prob_min": prob_min,
            "prob_max": prob_max,
            "prob_point": prob_point,
            "attenuation_factor": attenuation,
            "rationale": rationale,
            "assumptions": assumptions,
        }
