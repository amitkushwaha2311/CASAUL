"""
CAUSAL API — Phase 7: Counterfactual Simulation Engine Service.

Implements the deterministic, auditable counterfactual simulation engine:
- Compares an immutable baseline against explicitly defined hypothetical changes.
- Reuses Phase 6 CascadePredictionEngine for both branches:
  - Branch A: Baseline forecast.
  - Branch B: Counterfactual forecast with overrides applied to an isolated in-memory copy.
- Computes detailed differential outcome comparison.
- Never mutates live operational state or historical records.
- Discloses uncertainty, heuristic calibration status, and model boundaries.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cascade_models import CascadeForecastRun, CascadePredictedNode
from app.models.counterfactual_models import (
    CounterfactualChange,
    CounterfactualChangeType,
    CounterfactualComparison,
    CounterfactualExperiment,
    CounterfactualExperimentStatus,
    CounterfactualTargetType,
)
from app.models.graph_models import Dependency, InfrastructureGraph, Node, NodeState
from app.models.state_models import StateBaseline, StateSnapshot
from app.schemas.cascade import CascadeForecastRequest
from app.schemas.counterfactual import (
    CounterfactualChangeResponse,
    CounterfactualComparisonResponse,
    CounterfactualExperimentCreate,
    CounterfactualExperimentListItem,
    CounterfactualExperimentListResponse,
    CounterfactualExperimentResponse,
    CounterfactualRunResultResponse,
)
from app.services.cascade_engine_service import CascadePredictionEngine


def _utc_now() -> datetime:
    return datetime.now(UTC)


class CounterfactualEngineService:
    """
    Simulation service for defining, executing, and auditing counterfactual experiments.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_experiment(
        self, graph_id: uuid.UUID, request: CounterfactualExperimentCreate
    ) -> CounterfactualExperimentResponse:
        """
        Validates targets and creates an auditable counterfactual experiment definition.
        """
        # 1. Verify graph existence
        graph_stmt = select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id)
        graph_res = await self.db.execute(graph_stmt)
        graph = graph_res.scalar_one_or_none()
        if not graph:
            raise ValueError(f"Graph {graph_id} not found")

        # 2. Verify baseline or snapshot reference if provided
        base_states_lookup: dict[str, Any] = {}
        completeness_ratio = 1.0

        if request.baseline_id:
            bl_stmt = select(StateBaseline).where(
                StateBaseline.id == request.baseline_id, StateBaseline.graph_id == graph_id
            )
            bl_res = await self.db.execute(bl_stmt)
            baseline = bl_res.scalar_one_or_none()
            if not baseline:
                raise ValueError(
                    f"StateBaseline {request.baseline_id} not found or does not belong to graph {graph_id}"
                )
            base_states_lookup = baseline.node_states or {}
            completeness_ratio = baseline.completeness_ratio

        elif request.snapshot_id:
            sn_stmt = select(StateSnapshot).where(
                StateSnapshot.id == request.snapshot_id, StateSnapshot.graph_id == graph_id
            )
            sn_res = await self.db.execute(sn_stmt)
            snapshot = sn_res.scalar_one_or_none()
            if not snapshot:
                raise ValueError(
                    f"StateSnapshot {request.snapshot_id} not found or does not belong to graph {graph_id}"
                )
            base_states_lookup = snapshot.node_states or {}
            completeness_ratio = snapshot.completeness_ratio

        # 3. Fetch nodes and dependencies to validate target ownership
        nodes_res = await self.db.execute(select(Node).where(Node.graph_id == graph_id))
        graph_nodes = {n.id: n for n in nodes_res.scalars().all()}

        deps_res = await self.db.execute(select(Dependency).where(Dependency.graph_id == graph_id))
        graph_deps = {d.id: d for d in deps_res.scalars().all()}

        # 4. Validate each proposed change and populate original_value if omitted
        change_records: list[CounterfactualChange] = []
        for ch in request.changes:
            target_id = ch.target_id
            orig_val = ch.original_value

            if ch.target_type == CounterfactualTargetType.NODE:
                if target_id not in graph_nodes:
                    raise ValueError(
                        f"Target node {target_id} does not belong to graph {graph_id}"
                    )
                node = graph_nodes[target_id]
                node_str_id = str(target_id)
                b_node = base_states_lookup.get(node_str_id, {})

                if orig_val is None:
                    if ch.change_type == CounterfactualChangeType.STATE_OVERRIDE:
                        orig_val = b_node.get("state", node.state)
                    elif ch.change_type == CounterfactualChangeType.HEALTH_OVERRIDE:
                        orig_val = b_node.get("health", node.health)
                    elif ch.change_type == CounterfactualChangeType.CAPACITY_OVERRIDE:
                        orig_val = b_node.get("capacity", node.capacity)
                    elif ch.change_type == CounterfactualChangeType.AVAILABILITY_OVERRIDE:
                        orig_val = b_node.get("availability", None)

            elif ch.target_type == CounterfactualTargetType.DEPENDENCY:
                if target_id not in graph_deps:
                    raise ValueError(
                        f"Target dependency {target_id} does not belong to graph {graph_id}"
                    )
                dep = graph_deps[target_id]
                if orig_val is None:
                    if ch.change_type == CounterfactualChangeType.DEPENDENCY_AVAILABILITY:
                        orig_val = True  # active in baseline
                    elif ch.change_type == CounterfactualChangeType.DEPENDENCY_STRENGTH:
                        orig_val = dep.strength
                    elif ch.change_type == CounterfactualChangeType.DEPENDENCY_DELAY:
                        meta = dep.metadata_ or {}
                        orig_val = meta.get("propagation_delay_seconds", None)

            change_rec = CounterfactualChange(
                target_type=ch.target_type,
                target_id=target_id,
                change_type=ch.change_type,
                original_value=orig_val,
                proposed_value=ch.proposed_value,
                unit=ch.unit,
                rationale=ch.rationale,
            )
            change_records.append(change_rec)

        # 5. Build experiment record
        settings_dict = request.forecast_settings.model_dump(mode="json")
        init_node_id = settings_dict.get("initiating_node_id")
        if init_node_id and uuid.UUID(str(init_node_id)) not in graph_nodes:
            raise ValueError(
                f"Initiating node {init_node_id} does not belong to graph {graph_id}"
            )

        summary_dict = {
            "total_changes": len(change_records),
            "baseline_completeness_ratio": completeness_ratio,
            "disclaimer": (
                "Simulation-only: Counterfactual outputs are model-dependent estimates, "
                "not observed facts or real-world guarantees."
            ),
        }

        experiment = CounterfactualExperiment(
            graph_id=graph_id,
            name=request.name,
            description=request.description,
            baseline_id=request.baseline_id,
            snapshot_id=request.snapshot_id,
            status=CounterfactualExperimentStatus.PENDING,
            rule_version="1.0.0",
            forecast_settings=settings_dict,
            summary=summary_dict,
            changes=change_records,
        )

        self.db.add(experiment)
        await self.db.commit()
        await self.db.refresh(experiment)

        return CounterfactualExperimentResponse.model_validate(experiment)

    async def run_experiment(
        self, graph_id: uuid.UUID, experiment_id: uuid.UUID, *, force: bool = False
    ) -> CounterfactualRunResultResponse:
        """
        Executes both forecast branches (Baseline vs Counterfactual) using Phase 6
        CascadePredictionEngine and computes an auditable differential outcome comparison.
        """
        stmt = (
            select(CounterfactualExperiment)
            .where(
                CounterfactualExperiment.id == experiment_id,
                CounterfactualExperiment.graph_id == graph_id,
            )
            .options(
                selectinload(CounterfactualExperiment.changes),
                selectinload(CounterfactualExperiment.comparison),
            )
        )
        res = await self.db.execute(stmt)
        experiment = res.scalar_one_or_none()
        if not experiment:
            raise ValueError(f"Experiment {experiment_id} not found in graph {graph_id}")

        # Idempotency check: if already completed and not force, return existing result
        if (
            experiment.status == CounterfactualExperimentStatus.COMPLETED
            and not force
            and experiment.baseline_forecast_id
            and experiment.counterfactual_forecast_id
            and experiment.comparison
        ):
            return await self.get_results(graph_id, experiment_id)

        # Mark as RUNNING
        experiment.status = CounterfactualExperimentStatus.RUNNING
        experiment.execution_error = None
        await self.db.commit()

        try:
            # 1. Resolve baseline node states
            base_states: dict[str, dict[str, Any]] = {}
            completeness_ratio = 1.0

            if experiment.baseline_id:
                bl_res = await self.db.execute(
                    select(StateBaseline).where(StateBaseline.id == experiment.baseline_id)
                )
                bl = bl_res.scalar_one_or_none()
                if bl:
                    base_states = bl.node_states or {}
                    completeness_ratio = bl.completeness_ratio

            elif experiment.snapshot_id:
                sn_res = await self.db.execute(
                    select(StateSnapshot).where(StateSnapshot.id == experiment.snapshot_id)
                )
                sn = sn_res.scalar_one_or_none()
                if sn:
                    base_states = sn.node_states or {}
                    completeness_ratio = sn.completeness_ratio

            # 2. Prepare overrides for Branch B (Counterfactual)
            node_overrides: dict[str, dict[str, Any]] = {}
            dep_overrides: dict[str, dict[str, Any]] = {}

            for ch in experiment.changes:
                target_str = str(ch.target_id)
                if ch.target_type == CounterfactualTargetType.NODE:
                    if target_str not in node_overrides:
                        node_overrides[target_str] = {}

                    if ch.change_type == CounterfactualChangeType.STATE_OVERRIDE:
                        node_overrides[target_str]["state"] = ch.proposed_value
                    elif ch.change_type == CounterfactualChangeType.HEALTH_OVERRIDE:
                        node_overrides[target_str]["health"] = float(ch.proposed_value)
                    elif ch.change_type == CounterfactualChangeType.CAPACITY_OVERRIDE:
                        node_overrides[target_str]["capacity"] = float(ch.proposed_value)
                    elif ch.change_type == CounterfactualChangeType.AVAILABILITY_OVERRIDE:
                        node_overrides[target_str]["availability"] = float(ch.proposed_value)

                elif ch.target_type == CounterfactualTargetType.DEPENDENCY:
                    if target_str not in dep_overrides:
                        dep_overrides[target_str] = {}

                    if ch.change_type == CounterfactualChangeType.DEPENDENCY_AVAILABILITY:
                        dep_overrides[target_str]["active"] = bool(ch.proposed_value)
                    elif ch.change_type == CounterfactualChangeType.DEPENDENCY_STRENGTH:
                        dep_overrides[target_str]["strength"] = float(ch.proposed_value)
                    elif ch.change_type == CounterfactualChangeType.DEPENDENCY_DELAY:
                        dep_overrides[target_str]["delay_seconds"] = float(ch.proposed_value)

            # 3. Construct Forecast Request matching experiment settings
            settings = experiment.forecast_settings or {}
            init_node = settings.get("initiating_node_id")
            forecast_req = CascadeForecastRequest(
                horizon_minutes=float(settings.get("horizon_minutes", 60.0)),
                max_depth=int(settings.get("max_depth", 5)),
                simulation_mode=str(settings.get("simulation_mode", "DETERMINISTIC")),
                seed=settings.get("seed", 42),
                propagation_probability_threshold=float(
                    settings.get("propagation_probability_threshold", 0.2)
                ),
                initiating_node_id=uuid.UUID(str(init_node)) if init_node else None,
                custom_delay_assumptions=settings.get("custom_delay_assumptions"),
            )

            cascade_engine = CascadePredictionEngine(self.db)

            # ── Branch A: Baseline Forecast ───────────────────────────────────
            # Holds identical settings without any hypothetical overrides
            base_forecast_resp = await cascade_engine.run_forecast(
                graph_id,
                forecast_req,
                base_node_states=base_states if base_states else None,
                experiment_context={
                    "experiment_id": str(experiment.id),
                    "branch": "BASELINE",
                    "baseline_id": str(experiment.baseline_id) if experiment.baseline_id else None,
                    "snapshot_id": str(experiment.snapshot_id) if experiment.snapshot_id else None,
                },
            )

            # ── Branch B: Counterfactual Forecast ─────────────────────────────
            # Same baseline, identical settings, with hypothetical changes applied
            cf_forecast_resp = await cascade_engine.run_forecast(
                graph_id,
                forecast_req,
                base_node_states=base_states if base_states else None,
                node_overrides=node_overrides if node_overrides else None,
                dependency_overrides=dep_overrides if dep_overrides else None,
                experiment_context={
                    "experiment_id": str(experiment.id),
                    "branch": "COUNTERFACTUAL",
                    "total_changes": len(experiment.changes),
                },
            )

            # 4. Compute Differential Outcome Comparison
            comparison_obj = await self._compute_comparison(
                experiment=experiment,
                base_forecast=base_forecast_resp,
                cf_forecast=cf_forecast_resp,
                completeness_ratio=completeness_ratio,
            )

            # 5. Persist comparison and finalize experiment
            if experiment.comparison:
                # Update existing comparison
                comp = experiment.comparison
                comp.nodes_affected_both = comparison_obj["nodes_affected_both"]
                comp.nodes_affected_baseline_only = comparison_obj["nodes_affected_baseline_only"]
                comp.nodes_affected_counterfactual_only = comparison_obj[
                    "nodes_affected_counterfactual_only"
                ]
                comp.nodes_timing_differ = comparison_obj["nodes_timing_differ"]
                comp.nodes_severity_differ = comparison_obj["nodes_severity_differ"]
                comp.critical_nodes_summary = comparison_obj["critical_nodes_summary"]
                comp.uncertainty_differences = comparison_obj["uncertainty_differences"]
                comp.comparison_metrics = comparison_obj["comparison_metrics"]
                comp.warnings = comparison_obj["warnings"]
                comp.limitations = comparison_obj["limitations"]
            else:
                comp = CounterfactualComparison(
                    experiment_id=experiment.id,
                    nodes_affected_both=comparison_obj["nodes_affected_both"],
                    nodes_affected_baseline_only=comparison_obj["nodes_affected_baseline_only"],
                    nodes_affected_counterfactual_only=comparison_obj[
                        "nodes_affected_counterfactual_only"
                    ],
                    nodes_timing_differ=comparison_obj["nodes_timing_differ"],
                    nodes_severity_differ=comparison_obj["nodes_severity_differ"],
                    critical_nodes_summary=comparison_obj["critical_nodes_summary"],
                    uncertainty_differences=comparison_obj["uncertainty_differences"],
                    comparison_metrics=comparison_obj["comparison_metrics"],
                    warnings=comparison_obj["warnings"],
                    limitations=comparison_obj["limitations"],
                )
                self.db.add(comp)
                experiment.comparison = comp

            experiment.baseline_forecast_id = getattr(base_forecast_resp, "id", None) or getattr(base_forecast_resp, "run_id", None)
            experiment.counterfactual_forecast_id = getattr(cf_forecast_resp, "id", None) or getattr(cf_forecast_resp, "run_id", None)
            experiment.status = CounterfactualExperimentStatus.COMPLETED
            experiment.completed_at = _utc_now()
            experiment.summary = {
                "comparison_metrics": comparison_obj["comparison_metrics"],
                "total_changes": len(experiment.changes),
                "baseline_completeness_ratio": completeness_ratio,
            }

            await self.db.commit()
            await self.db.refresh(experiment)

            return await self.get_results(graph_id, experiment.id)

        except Exception as exc:
            await self.db.rollback()
            # Record failed experiment in an isolated transaction
            fail_stmt = select(CounterfactualExperiment).where(
                CounterfactualExperiment.id == experiment_id
            )
            fail_res = await self.db.execute(fail_stmt)
            fail_exp = fail_res.scalar_one_or_none()
            if fail_exp:
                fail_exp.status = CounterfactualExperimentStatus.FAILED
                fail_exp.execution_error = str(exc)
                await self.db.commit()
            raise

    async def _compute_comparison(
        self,
        experiment: CounterfactualExperiment,
        base_forecast: Any,
        cf_forecast: Any,
        completeness_ratio: float,
    ) -> dict[str, Any]:
        """
        Compares baseline and counterfactual outcomes at identical forecast horizons.
        """
        base_nodes: dict[str, Any] = {
            str(n.node_id): n for n in base_forecast.predicted_nodes
        }
        cf_nodes: dict[str, Any] = {
            str(n.node_id): n for n in cf_forecast.predicted_nodes
        }

        all_node_ids = set(base_nodes.keys()) | set(cf_nodes.keys())

        nodes_affected_both: list[dict[str, Any]] = []
        nodes_affected_baseline_only: list[dict[str, Any]] = []  # Prevented
        nodes_affected_counterfactual_only: list[dict[str, Any]] = []  # New adverse impact
        nodes_timing_differ: list[dict[str, Any]] = []
        nodes_severity_differ: list[dict[str, Any]] = []

        base_critical_count = 0
        cf_critical_count = 0
        critical_prevented: list[str] = []
        critical_newly_affected: list[str] = []

        for nid in all_node_ids:
            in_base = nid in base_nodes
            in_cf = nid in cf_nodes

            b_item = base_nodes.get(nid)
            c_item = cf_nodes.get(nid)

            node_name = (b_item.node_name if b_item else None) or (
                c_item.node_name if c_item else "Unknown"
            )
            criticality = (b_item.criticality if b_item else None) or (
                c_item.criticality if c_item else 0.5
            )

            if criticality >= 0.7:
                if in_base:
                    base_critical_count += 1
                if in_cf:
                    cf_critical_count += 1

            if in_base and not in_cf:
                # Node was affected in baseline, but NOT in counterfactual -> PREVENTED!
                b_ttr = b_item.time_to_impact_range
                b_point_s = b_ttr.point_estimate_seconds if b_ttr else None
                nodes_affected_baseline_only.append(
                    {
                        "node_id": nid,
                        "node_name": node_name,
                        "criticality": criticality,
                        "baseline_status": b_item.forecast_status,
                        "baseline_impact_level": b_item.predicted_impact_level,
                        "baseline_point_impact_seconds": b_point_s,
                        "difference_category": "PREVENTED",
                        "explanation": (
                            "Failure propagation prevented in counterfactual branch. "
                            "Node remains operational."
                        ),
                    }
                )
                if criticality >= 0.7:
                    critical_prevented.append(node_name)

            elif not in_base and in_cf:
                # Node was unaffected in baseline, but affected in counterfactual -> NEW ADVERSE IMPACT!
                c_ttr = c_item.time_to_impact_range
                c_point_s = c_ttr.point_estimate_seconds if c_ttr else None
                nodes_affected_counterfactual_only.append(
                    {
                        "node_id": nid,
                        "node_name": node_name,
                        "criticality": criticality,
                        "counterfactual_status": c_item.forecast_status,
                        "counterfactual_impact_level": c_item.predicted_impact_level,
                        "counterfactual_point_impact_seconds": c_point_s,
                        "difference_category": "NEW_IMPACT",
                        "explanation": (
                            "Node affected only in counterfactual branch due to applied modifications."
                        ),
                    }
                )
                if criticality >= 0.7:
                    critical_newly_affected.append(node_name)

            elif in_base and in_cf:
                # Affected in both branches: check for timing or severity shifts
                b_ttr = b_item.time_to_impact_range
                c_ttr = c_item.time_to_impact_range
                b_time = b_ttr.point_estimate_seconds if b_ttr else None
                c_time = c_ttr.point_estimate_seconds if c_ttr else None
                time_delta = round(c_time - b_time, 1) if (b_time is not None and c_time is not None) else None

                both_entry = {
                    "node_id": nid,
                    "node_name": node_name,
                    "criticality": criticality,
                    "baseline_impact_level": b_item.predicted_impact_level,
                    "counterfactual_impact_level": c_item.predicted_impact_level,
                    "baseline_point_impact_seconds": b_time,
                    "counterfactual_point_impact_seconds": c_time,
                    "time_delta_seconds": time_delta,
                }
                nodes_affected_both.append(both_entry)

                if time_delta is not None and abs(time_delta) > 1.0:
                    timing_entry = dict(both_entry)
                    timing_entry["difference_category"] = "DELAYED" if time_delta > 0 else "ACCELERATED"
                    timing_entry["explanation"] = (
                        f"Impact delayed by {time_delta:.1f}s in counterfactual"
                        if time_delta > 0
                        else f"Impact accelerated by {abs(time_delta):.1f}s in counterfactual"
                    )
                    nodes_timing_differ.append(timing_entry)

                if b_item.predicted_impact_level != c_item.predicted_impact_level:
                    severity_entry = dict(both_entry)
                    severity_entry["difference_category"] = "SEVERITY_CHANGED"
                    severity_entry["explanation"] = (
                        f"Impact level shifted from {b_item.predicted_impact_level} to {c_item.predicted_impact_level}"
                    )
                    nodes_severity_differ.append(severity_entry)

        # High-level comparison metrics
        base_blast_count = len(base_nodes)
        cf_blast_count = len(cf_nodes)
        blast_reduction = base_blast_count - cf_blast_count

        base_summary = getattr(base_forecast, "impact_summary", None) or getattr(base_forecast, "summary", None)
        cf_summary = getattr(cf_forecast, "impact_summary", None) or getattr(cf_forecast, "summary", None)

        if hasattr(base_summary, "composite_criticality_impact_percent"):
            base_comp_pct = float(base_summary.composite_criticality_impact_percent)
            base_max_depth = int(base_summary.max_depth_reached)
        elif isinstance(base_summary, dict):
            base_comp_pct = float(base_summary.get("composite_criticality_impact_percent", 0.0))
            base_max_depth = int(base_summary.get("max_depth_reached", 0))
        else:
            base_comp_pct = 0.0
            base_max_depth = 0

        if hasattr(cf_summary, "composite_criticality_impact_percent"):
            cf_comp_pct = float(cf_summary.composite_criticality_impact_percent)
            cf_max_depth = int(cf_summary.max_depth_reached)
        elif isinstance(cf_summary, dict):
            cf_comp_pct = float(cf_summary.get("composite_criticality_impact_percent", 0.0))
            cf_max_depth = int(cf_summary.get("max_depth_reached", 0))
        else:
            cf_comp_pct = 0.0
            cf_max_depth = 0

        comp_delta_pct = round(cf_comp_pct - base_comp_pct, 1)

        comparison_metrics = {
            "baseline_blast_radius_count": base_blast_count,
            "counterfactual_blast_radius_count": cf_blast_count,
            "blast_radius_reduction_count": blast_reduction,
            "nodes_prevented_count": len(nodes_affected_baseline_only),
            "nodes_newly_affected_count": len(nodes_affected_counterfactual_only),
            "baseline_composite_impact_percent": base_comp_pct,
            "counterfactual_composite_impact_percent": cf_comp_pct,
            "composite_impact_delta_percent": comp_delta_pct,
            "baseline_critical_affected_count": base_critical_count,
            "counterfactual_critical_affected_count": cf_critical_count,
            "baseline_max_depth": base_max_depth,
            "counterfactual_max_depth": cf_max_depth,
            "horizon_minutes": base_forecast.horizon_minutes,
        }

        critical_nodes_summary = {
            "baseline_critical_affected_count": base_critical_count,
            "counterfactual_critical_affected_count": cf_critical_count,
            "critical_nodes_prevented": critical_prevented,
            "critical_nodes_newly_affected": critical_newly_affected,
        }

        uncertainty_differences = {
            "baseline_completeness_ratio": completeness_ratio,
            "calibration_status": "HEURISTIC_ESTIMATE",
            "model_assumptions_hold_constant": True,
            "note": (
                "Differences are derived solely from applied hypothetical overrides. "
                "Forecast engine parameters, horizon, and stochastic seed were held constant."
            ),
        }

        warnings: list[str] = []
        if completeness_ratio < 0.9:
            warnings.append(
                f"Baseline state has incomplete sensor coverage ({completeness_ratio*100:.1f}%). "
                "Unobserved components may harbor hidden failure modes."
            )
        if len(nodes_affected_counterfactual_only) > 0:
            warnings.append(
                f"Counterfactual intervention introduces {len(nodes_affected_counterfactual_only)} "
                "newly affected downstream nodes (secondary ripple effect)."
            )

        limitations: list[str] = [
            (
                "A reduced predicted blast radius does NOT constitute proof that the intervention "
                "will succeed on real-world infrastructure."
            ),
            (
                "Counterfactual outputs are model-dependent estimates under uncalibrated heuristic "
                "propagation assumptions."
            ),
            (
                "Interventions in Phase 7 are simulation inputs, not automated remediation commands "
                "or physical operating instructions."
            ),
        ]

        return {
            "nodes_affected_both": nodes_affected_both,
            "nodes_affected_baseline_only": nodes_affected_baseline_only,
            "nodes_affected_counterfactual_only": nodes_affected_counterfactual_only,
            "nodes_timing_differ": nodes_timing_differ,
            "nodes_severity_differ": nodes_severity_differ,
            "critical_nodes_summary": critical_nodes_summary,
            "uncertainty_differences": uncertainty_differences,
            "comparison_metrics": comparison_metrics,
            "warnings": warnings,
            "limitations": limitations,
        }

    async def get_experiment(
        self, graph_id: uuid.UUID, experiment_id: uuid.UUID
    ) -> CounterfactualExperimentResponse:
        """Retrieves an experiment definition by ID."""
        stmt = (
            select(CounterfactualExperiment)
            .where(
                CounterfactualExperiment.id == experiment_id,
                CounterfactualExperiment.graph_id == graph_id,
            )
            .options(
                selectinload(CounterfactualExperiment.changes),
                selectinload(CounterfactualExperiment.comparison),
            )
        )
        res = await self.db.execute(stmt)
        exp = res.scalar_one_or_none()
        if not exp:
            raise ValueError(f"Experiment {experiment_id} not found in graph {graph_id}")
        return CounterfactualExperimentResponse.model_validate(exp)

    async def list_experiments(
        self,
        graph_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
    ) -> CounterfactualExperimentListResponse:
        """Lists counterfactual experiments for a graph with pagination."""
        query = select(CounterfactualExperiment).where(
            CounterfactualExperiment.graph_id == graph_id
        )
        if status:
            query = query.where(CounterfactualExperiment.status == status.upper())

        query = query.options(selectinload(CounterfactualExperiment.changes)).order_by(
            desc(CounterfactualExperiment.created_at)
        )

        all_res = await self.db.execute(query)
        all_items = list(all_res.scalars().all())
        total = len(all_items)

        offset = (page - 1) * page_size
        paged_items = all_items[offset : offset + page_size]

        list_items = [
            CounterfactualExperimentListItem(
                id=item.id,
                graph_id=item.graph_id,
                name=item.name,
                status=item.status,
                total_changes=len(item.changes),
                baseline_forecast_id=item.baseline_forecast_id,
                counterfactual_forecast_id=item.counterfactual_forecast_id,
                created_at=item.created_at,
                completed_at=item.completed_at,
            )
            for item in paged_items
        ]

        return CounterfactualExperimentListResponse(
            items=list_items, total=total, page=page, page_size=page_size
        )

    async def get_comparison(
        self, graph_id: uuid.UUID, experiment_id: uuid.UUID
    ) -> CounterfactualComparisonResponse:
        """Retrieves the differential outcome comparison for an experiment."""
        stmt = (
            select(CounterfactualComparison)
            .join(CounterfactualExperiment)
            .where(
                CounterfactualComparison.experiment_id == experiment_id,
                CounterfactualExperiment.graph_id == graph_id,
            )
        )
        res = await self.db.execute(stmt)
        comp = res.scalar_one_or_none()
        if not comp:
            raise ValueError(
                f"Comparison not found for experiment {experiment_id}. Ensure experiment has completed."
            )
        return CounterfactualComparisonResponse.model_validate(comp)

    async def get_results(
        self, graph_id: uuid.UUID, experiment_id: uuid.UUID
    ) -> CounterfactualRunResultResponse:
        """
        Retrieves full results including experiment, baseline forecast,
        counterfactual forecast, and comparison.
        """
        exp_resp = await self.get_experiment(graph_id, experiment_id)

        base_forecast_dict: dict[str, Any] | None = None
        cf_forecast_dict: dict[str, Any] | None = None
        comp_resp: CounterfactualComparisonResponse | None = None

        cascade_engine = CascadePredictionEngine(self.db)

        if exp_resp.baseline_forecast_id:
            try:
                base_f = await cascade_engine.get_forecast_details(
                    graph_id, exp_resp.baseline_forecast_id
                )
                base_forecast_dict = base_f.model_dump(mode="json")
            except Exception:
                base_forecast_dict = None

        if exp_resp.counterfactual_forecast_id:
            try:
                cf_f = await cascade_engine.get_forecast_details(
                    graph_id, exp_resp.counterfactual_forecast_id
                )
                cf_forecast_dict = cf_f.model_dump(mode="json")
            except Exception:
                cf_forecast_dict = None

        try:
            comp_resp = await self.get_comparison(graph_id, experiment_id)
        except Exception:
            comp_resp = None

        return CounterfactualRunResultResponse(
            experiment=exp_resp,
            baseline_forecast=base_forecast_dict,
            counterfactual_forecast=cf_forecast_dict,
            comparison=comp_resp,
        )
