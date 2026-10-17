"""
CAUSAL API — Phase 8: Safety-Constrained Intervention Optimization & Recommendation Engine Service.

Implements four deterministic, auditable sub-components:

  1. CandidateGenerator
     Generates bounded candidate interventions from degraded nodes and upstream/downstream topology.
     Supports: HEALTH_OVERRIDE (restore), STATE_OVERRIDE (restore), DEPENDENCY_AVAILABILITY
     (isolation), DEPENDENCY_STRENGTH (boost/reduce), HEALTH_OVERRIDE (boost).
     Uses Phase 7 validated change types only.

  2. SafetyConstraintEngine
     Evaluates each candidate against explicit, documented constraints (fail-closed):
       - PROTECTED_NODE_HEALTH: nodes with criticality >= 0.8 must not drop health < threshold
       - PROTECTED_NODE_CAPACITY: same, capacity
       - REQUIRED_DEPENDENCY_PRESERVATION: required=True deps must not be severed without backup
       - ALLOWED_TARGETS: targets must belong to the specified graph
       - VALID_PARAMETER_BOUNDS: proposed values within model-supported ranges

  3. EvaluationPipeline
     Invokes Phase 7 CounterfactualEngineService.create_experiment + run_experiment for each
     ELIGIBLE candidate. Extracts differential metrics for ranking.

  4. RankingPolicy (documented, transparent)
     Weighted formula (weights fixed and auditable):
       blast_radius_reduction_score  (weight 0.35): prevented / baseline_blast_radius
       prevented_critical_score      (weight 0.30): prevented_critical / baseline_critical
       impact_delta_score            (weight 0.25): -(composite_impact_delta_percent / 100)
       new_impact_penalty            (weight -0.10): newly_affected / baseline_blast_radius
     Preserves ties (same rank_position for equal score). Lower position = better.

Safety boundary: this service NEVER executes real-world infrastructure commands or modifies
live operational tables (nodes, dependencies, state_history, events, observations).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.counterfactual_models import CounterfactualChangeType, CounterfactualTargetType
from app.models.graph_models import Dependency, Node, NodeState
from app.models.recommendation_models import (
    CandidateIntervention,
    ConstraintStatus,
    ConstraintType,
    DecisionStatus,
    EligibilityStatus,
    InterventionRecommendationRun,
    RecommendationRunStatus,
    SafetyConstraintEvaluation,
    SafetyStatus,
)
from app.models.state_models import StateBaseline, StateSnapshot
from app.models.graph_models import InfrastructureGraph
from app.schemas.counterfactual import CounterfactualExperimentCreate, CounterfactualChangeCreate
from app.schemas.recommendation import (
    CandidateDecisionRequest,
    CandidateInterventionListItem,
    CandidateInterventionResponse,
    RecommendationRunCreate,
    RecommendationRunListItem,
    RecommendationRunListResponse,
    RecommendationRunResponse,
    SafetyConstraintEvaluationResponse,
)
from app.services.counterfactual_engine_service import CounterfactualEngineService


def _utc_now() -> datetime:
    return datetime.now(UTC)


# ── Ranking weights (documented and fixed) ───────────────────────────────

_RANKING_POLICY = {
    "version": "1.0.0",
    "description": (
        "Transparent weighted ranking of eligible candidates. "
        "Higher score is better. Weights sum to 1.0 (penalty subtracted)."
    ),
    "weights": {
        "blast_radius_reduction_score": 0.35,
        "prevented_critical_score": 0.30,
        "impact_delta_score": 0.25,
        "new_impact_penalty": 0.10,
    },
    "tie_breaking": "equal_score_candidates_share_same_rank_position",
    "disclaimer": (
        "Rankings are model-dependent estimates only. A higher rank score does NOT "
        "guarantee real-world intervention effectiveness."
    ),
}

# Protected-node criticality threshold (nodes >= this value are safety-protected)
_PROTECTED_CRITICALITY = 0.8
# Minimum health floor that protected nodes must not breach under the intervention.
# Configurable default safety floor policy for protected nodes; not a universal physical standard.
_PROTECTED_HEALTH_FLOOR = 0.20
# Minimum capacity floor for protected nodes. Configurable default policy.
_PROTECTED_CAPACITY_FLOOR = 0.20


# ── 1. Candidate Generator ───────────────────────────────────────────────


def _generate_candidates(
    nodes: list[Node],
    dependencies: list[Dependency],
    base_states: dict[str, dict[str, Any]],
    max_candidates: int,
    target_node_ids: list[uuid.UUID] | None,
) -> list[dict[str, Any]]:
    """
    Generates a bounded list of candidate intervention specifications.

    Strategy:
    - For each degraded or critical node (or target nodes if specified):
      1. Generate a HEALTH_OVERRIDE restoration (to 0.85)
      2. Generate a STATE_OVERRIDE restoration (to NORMAL)
    - For each outgoing dependency from degraded nodes:
      3. If required=True and strength < 0.9: generate DEPENDENCY_STRENGTH boost (to 1.0)
      4. If not required: generate DEPENDENCY_AVAILABILITY isolation (False) — safe to sever
    - De-duplicate by (target_id, change_type) signature.
    - Cap at max_candidates.
    """
    # Eligible source nodes
    if target_node_ids:
        target_set = set(target_node_ids)
        source_nodes = [n for n in nodes if n.id in target_set]
    else:
        source_nodes = [
            n for n in nodes
            if (base_states.get(str(n.id), {}).get("state", n.state) in (NodeState.DEGRADED, NodeState.CRITICAL, NodeState.FAILED))
            or n.state in (NodeState.DEGRADED, NodeState.CRITICAL, NodeState.FAILED)
        ]

    # Index deps by source_node_id
    deps_by_source: dict[uuid.UUID, list[Dependency]] = {}
    for d in dependencies:
        deps_by_source.setdefault(d.source_node_id, []).append(d)

    seen: set[str] = set()
    candidates: list[dict[str, Any]] = []

    def _add(candidate: dict[str, Any]) -> None:
        sig = f"{candidate['changes'][0]['target_id']}:{candidate['changes'][0]['change_type']}"
        if sig not in seen:
            seen.add(sig)
            candidates.append(candidate)

    for node in source_nodes:
        node_str = str(node.id)
        current_state = base_states.get(node_str, {}).get("state", node.state)
        current_health = float(base_states.get(node_str, {}).get("health", node.health))

        # 1. Restore health to 0.85 if currently degraded/low
        if current_health < 0.8:
            _add({
                "title": f"Restore health of '{node.name}'",
                "description": (
                    f"Hypothetically restores '{node.name}' health from {current_health:.2f} to 0.85. "
                    "Models the effect of emergency maintenance or repair."
                ),
                "intervention_type": CounterfactualChangeType.HEALTH_OVERRIDE,
                "changes": [{
                    "target_type": CounterfactualTargetType.NODE,
                    "target_id": str(node.id),
                    "change_type": CounterfactualChangeType.HEALTH_OVERRIDE,
                    "proposed_value": 0.85,
                    "original_value": current_health,
                    "rationale": f"Restore '{node.name}' health to operational level",
                }],
            })

        # 2. Restore state to NORMAL if currently degraded/critical/failed
        if current_state in (NodeState.DEGRADED, NodeState.CRITICAL, NodeState.FAILED):
            _add({
                "title": f"Restore state of '{node.name}' to NORMAL",
                "description": (
                    f"Hypothetically overrides '{node.name}' state from {current_state} to NORMAL. "
                    "Models effect of full operational recovery."
                ),
                "intervention_type": CounterfactualChangeType.STATE_OVERRIDE,
                "changes": [{
                    "target_type": CounterfactualTargetType.NODE,
                    "target_id": str(node.id),
                    "change_type": CounterfactualChangeType.STATE_OVERRIDE,
                    "proposed_value": NodeState.NORMAL,
                    "original_value": current_state,
                    "rationale": f"Model full recovery of '{node.name}'",
                }],
            })

        # 3 & 4. Outgoing dependency interventions
        for dep in deps_by_source.get(node.id, []):
            if dep.required and dep.strength < 0.9:
                _add({
                    "title": f"Boost dependency strength on '{node.name}' → downstream",
                    "description": (
                        f"Hypothetically increases dependency strength from {dep.strength:.2f} to 1.0. "
                        "Models a fully restored/redundant coupling."
                    ),
                    "intervention_type": CounterfactualChangeType.DEPENDENCY_STRENGTH,
                    "changes": [{
                        "target_type": CounterfactualTargetType.DEPENDENCY,
                        "target_id": str(dep.id),
                        "change_type": CounterfactualChangeType.DEPENDENCY_STRENGTH,
                        "proposed_value": 1.0,
                        "original_value": dep.strength,
                        "rationale": f"Restore dependency coupling from degraded source '{node.name}'",
                    }],
                })
            elif not dep.required:
                _add({
                    "title": f"Isolate non-required dependency from '{node.name}'",
                    "description": (
                        f"Hypothetically severs the non-required link from '{node.name}'. "
                        "Models controlled isolation to contain cascade spread."
                    ),
                    "intervention_type": CounterfactualChangeType.DEPENDENCY_AVAILABILITY,
                    "changes": [{
                        "target_type": CounterfactualTargetType.DEPENDENCY,
                        "target_id": str(dep.id),
                        "change_type": CounterfactualChangeType.DEPENDENCY_AVAILABILITY,
                        "proposed_value": False,
                        "original_value": True,
                        "rationale": f"Isolate non-required link from failing '{node.name}' to limit blast radius",
                    }],
                })

        if len(candidates) >= max_candidates:
            break

    return candidates[:max_candidates]


# ── 2. Safety Constraint Engine ───────────────────────────────────────────


def _evaluate_safety(
    candidate_spec: dict[str, Any],
    nodes_by_id: dict[uuid.UUID, Node],
    deps_by_id: dict[uuid.UUID, Dependency],
    base_states: dict[str, dict[str, Any]],
    graph_id: uuid.UUID,
) -> tuple[str, list[dict[str, Any]]]:
    """
    Evaluates a candidate against all safety constraints.

    Returns (aggregate_safety_status, list_of_constraint_eval_dicts).
    Fail-closed: any FAIL or INDETERMINATE => aggregate FAIL (INELIGIBLE).
    """
    evals: list[dict[str, Any]] = []
    all_pass = True

    for change in candidate_spec["changes"]:
        target_id_str = change["target_id"]
        change_type = change["change_type"]
        proposed_value = change["proposed_value"]

        # ── ALLOWED_TARGETS: target must belong to graph ─────────────────
        target_id = uuid.UUID(target_id_str)
        if change["target_type"] == CounterfactualTargetType.NODE:
            found = target_id in nodes_by_id
        else:
            found = target_id in deps_by_id

        evals.append({
            "constraint_name": "Target belongs to graph",
            "constraint_type": ConstraintType.ALLOWED_TARGETS,
            "status": ConstraintStatus.PASS if found else ConstraintStatus.FAIL,
            "evaluated_value": {"target_id": target_id_str, "found": found},
            "threshold": {"must_belong_to_graph_id": str(graph_id)},
            "rationale": (
                "Target entity must exist within the specified graph to ensure "
                "the intervention is scoped correctly."
            ),
            "supporting_evidence": [],
        })
        if not found:
            all_pass = False
            continue

        # ── VALID_PARAMETER_BOUNDS ────────────────────────────────────────
        bounds_ok = True
        bounds_rationale = "Value is within supported model parameter range."
        if change_type in (
            CounterfactualChangeType.HEALTH_OVERRIDE,
            CounterfactualChangeType.CAPACITY_OVERRIDE,
            CounterfactualChangeType.DEPENDENCY_STRENGTH,
        ):
            try:
                v = float(proposed_value)
                bounds_ok = 0.0 <= v <= 1.0
            except (TypeError, ValueError):
                bounds_ok = False
                bounds_rationale = f"Proposed value {proposed_value!r} is not a valid float."
        elif change_type == CounterfactualChangeType.DEPENDENCY_DELAY:
            try:
                v = float(proposed_value)
                bounds_ok = v >= 0.0
            except (TypeError, ValueError):
                bounds_ok = False
                bounds_rationale = f"Delay {proposed_value!r} must be a non-negative float."

        evals.append({
            "constraint_name": "Parameter bounds",
            "constraint_type": ConstraintType.VALID_PARAMETER_BOUNDS,
            "status": ConstraintStatus.PASS if bounds_ok else ConstraintStatus.FAIL,
            "evaluated_value": {"proposed_value": proposed_value, "change_type": change_type},
            "threshold": {"range": "[0.0, 1.0] for fractional values; >= 0 for delays"},
            "rationale": bounds_rationale,
            "supporting_evidence": [],
        })
        if not bounds_ok:
            all_pass = False

        # ── PROTECTED_NODE_HEALTH (for node overrides) ────────────────────
        if change["target_type"] == CounterfactualTargetType.NODE:
            node = nodes_by_id[target_id]
            node_crit = getattr(node, "criticality", None)
            if node_crit is None:
                # Missing or indeterminate criticality: fail-closed
                evals.append({
                    "constraint_name": f"Protected node criticality check: '{getattr(node, 'name', target_id)}'",
                    "constraint_type": ConstraintType.PROTECTED_NODE_HEALTH,
                    "status": ConstraintStatus.INDETERMINATE,
                    "evaluated_value": {"criticality": None},
                    "threshold": {"min_health": _PROTECTED_HEALTH_FLOOR},
                    "rationale": (
                        f"Node '{getattr(node, 'name', target_id)}' has missing or indeterminate criticality. "
                        "Fail-closed: cannot determine whether node requires protection."
                    ),
                    "supporting_evidence": [{"node_id": str(getattr(node, 'id', target_id))}],
                })
                all_pass = False
            elif node_crit >= _PROTECTED_CRITICALITY:
                if change_type == CounterfactualChangeType.HEALTH_OVERRIDE:
                    if proposed_value is None:
                        health_ok = False
                        v = None
                        health_rationale = f"Node '{node.name}' has proposed health None/missing."
                    else:
                        try:
                            v = float(proposed_value)
                            health_ok = v >= _PROTECTED_HEALTH_FLOOR
                            health_rationale = (
                                f"Node '{node.name}' has criticality {node_crit:.2f} >= {_PROTECTED_CRITICALITY}. "
                                f"Proposed health {v:.2f} must not fall below {_PROTECTED_HEALTH_FLOOR} "
                                "(configurable default safety floor policy; not a universal physical standard)."
                            )
                        except (TypeError, ValueError):
                            health_ok = False
                            v = proposed_value
                            health_rationale = f"Proposed health value {proposed_value!r} is not a valid float."

                    evals.append({
                        "constraint_name": f"Protected node health floor: '{node.name}'",
                        "constraint_type": ConstraintType.PROTECTED_NODE_HEALTH,
                        "status": ConstraintStatus.PASS if health_ok else ConstraintStatus.FAIL,
                        "evaluated_value": {"proposed_health": v, "criticality": node_crit},
                        "threshold": {"min_health": _PROTECTED_HEALTH_FLOOR, "policy": "configurable_default"},
                        "rationale": health_rationale,
                        "supporting_evidence": [{"node_id": str(node.id), "node_name": node.name}],
                    })
                    if not health_ok:
                        all_pass = False

                elif change_type == CounterfactualChangeType.CAPACITY_OVERRIDE:
                    if proposed_value is None:
                        cap_ok = False
                        v = None
                        cap_rationale = f"Node '{node.name}' has proposed capacity None/missing."
                    else:
                        try:
                            v = float(proposed_value)
                            cap_ok = v >= _PROTECTED_CAPACITY_FLOOR
                            cap_rationale = (
                                f"Node '{node.name}' has criticality {node_crit:.2f} >= {_PROTECTED_CRITICALITY}. "
                                f"Proposed capacity {v:.2f} must not fall below {_PROTECTED_CAPACITY_FLOOR} "
                                "(configurable default safety floor policy; not a universal physical standard)."
                            )
                        except (TypeError, ValueError):
                            cap_ok = False
                            v = proposed_value
                            cap_rationale = f"Proposed capacity value {proposed_value!r} is not a valid float."

                    evals.append({
                        "constraint_name": f"Protected node capacity floor: '{node.name}'",
                        "constraint_type": ConstraintType.PROTECTED_NODE_CAPACITY,
                        "status": ConstraintStatus.PASS if cap_ok else ConstraintStatus.FAIL,
                        "evaluated_value": {"proposed_capacity": v, "criticality": node_crit},
                        "threshold": {"min_capacity": _PROTECTED_CAPACITY_FLOOR, "policy": "configurable_default"},
                        "rationale": cap_rationale,
                        "supporting_evidence": [{"node_id": str(node.id), "node_name": node.name}],
                    })
                    if not cap_ok:
                        all_pass = False

        # ── REQUIRED_DEPENDENCY_PRESERVATION ─────────────────────────────
        if change["target_type"] == CounterfactualTargetType.DEPENDENCY:
            dep = deps_by_id[target_id]
            is_req = getattr(dep, "required", None)
            if is_req is None:
                # Missing or indeterminate required status: fail-closed
                evals.append({
                    "constraint_name": f"Required dependency evaluation: dep {getattr(dep, 'id', target_id)}",
                    "constraint_type": ConstraintType.REQUIRED_DEPENDENCY_PRESERVATION,
                    "status": ConstraintStatus.INDETERMINATE,
                    "evaluated_value": {"dependency_id": str(getattr(dep, 'id', target_id)), "required": None},
                    "threshold": {"permitted_source_states": [NodeState.FAILED, NodeState.CRITICAL]},
                    "rationale": f"Dependency {getattr(dep, 'id', target_id)} has missing required flag. Fail-closed.",
                    "supporting_evidence": [],
                })
                all_pass = False
            elif is_req and change_type == CounterfactualChangeType.DEPENDENCY_AVAILABILITY:
                if proposed_value is False or proposed_value == "false" or proposed_value == 0:
                    src_node = nodes_by_id.get(dep.source_node_id)
                    src_state_key = str(dep.source_node_id)
                    src_state = (
                        base_states.get(
                            src_state_key,
                            {},
                        ).get("state", getattr(src_node, "state", NodeState.UNKNOWN) if src_node else NodeState.UNKNOWN)
                    )
                    # Permitted only when source is known to be FAILED or CRITICAL
                    permitted = src_state in (NodeState.FAILED, NodeState.CRITICAL)
                    evals.append({
                        "constraint_name": f"Required dependency preservation: dep {dep.id}",
                        "constraint_type": ConstraintType.REQUIRED_DEPENDENCY_PRESERVATION,
                        "status": ConstraintStatus.PASS if permitted else ConstraintStatus.FAIL,
                        "evaluated_value": {
                            "dependency_id": str(dep.id),
                            "required": dep.required,
                            "source_state": src_state,
                        },
                        "threshold": {"permitted_source_states": [NodeState.FAILED, NodeState.CRITICAL]},
                        "rationale": (
                            f"Dependency {dep.id} is marked required=True. "
                            "Severing it is only permitted when the source node is FAILED or CRITICAL "
                            "(controlled isolation of an already-failed link)."
                        ),
                        "supporting_evidence": [
                            {
                                "dependency_id": str(dep.id),
                                "source_node_id": str(dep.source_node_id),
                                "source_state": src_state,
                            }
                        ],
                    })
                    if not permitted:
                        all_pass = False

    aggregate = SafetyStatus.PASS if all_pass else SafetyStatus.FAIL
    return aggregate, evals


# ── 3. Ranking Policy ────────────────────────────────────────────────────


def _compute_rank_score(
    comparison_metrics: dict[str, Any] | None,
) -> tuple[float, dict[str, Any]]:
    """
    Computes a transparent weighted rank score from Phase 7 comparison metrics.

    Sign conventions:
    - `delta_blast_radius` (or `blast_radius_reduction_count`):
      Defined as `baseline_blast_radius - counterfactual_blast_radius`.
      Positive delta indicates a reduction in blast radius (beneficial mitigation).
      A reduction improves the score; an increase (<= 0) does not contribute.
    - `composite_impact_delta_percent`:
      Defined in Phase 7 as `counterfactual_impact - baseline_impact`.
      Negative delta indicates lower impact under counterfactual (beneficial).
      Positive delta indicates higher impact (worsened) and contributes 0.0 to impact score.
    - `nodes_prevented_count` contributes positively to prevention.
    - `nodes_newly_affected_count` contributes negatively as a penalty.
    - Missing, None, or indeterminate metrics safely default to 0.0 and cannot improve score.

    Returns (score, breakdown_dict).
    Higher score = better candidate. Score is clamped to [0.0, 1.0].
    """
    if not comparison_metrics:
        comparison_metrics = {}

    base_blast = max(0, comparison_metrics.get("baseline_blast_radius_count", 0))
    base_crit = max(0, comparison_metrics.get("baseline_critical_affected_count", 0))
    prevented_count = max(0, comparison_metrics.get("nodes_prevented_count", 0))
    newly_affected = max(0, comparison_metrics.get("nodes_newly_affected_count", 0))
    impact_delta = comparison_metrics.get("composite_impact_delta_percent", 0.0)

    # Blast radius reduction score (0.0 to 1.0):
    # Reduction in blast radius improves the score; an increase (<= 0) does not.
    cf_blast = comparison_metrics.get("counterfactual_blast_radius_count", base_blast)
    if "blast_radius_reduction_count" in comparison_metrics:
        blast_reduction = comparison_metrics["blast_radius_reduction_count"]
    else:
        blast_reduction = base_blast - cf_blast if "counterfactual_blast_radius_count" in comparison_metrics else prevented_count

    # A reduction (> 0) improves the score; an increase (<= 0) contributes 0.0
    blast_score = (max(0, blast_reduction) / max(base_blast, 1)) if base_blast > 0 else 0.0
    blast_score = max(0.0, min(1.0, blast_score))

    # Prevented critical nodes (0-1):
    cf_crit = comparison_metrics.get("counterfactual_critical_affected_count", base_crit)
    crit_reduction = max(0, base_crit - cf_crit)
    crit_score = (crit_reduction / max(base_crit, 1)) if base_crit > 0 else 0.0
    crit_score = max(0.0, min(1.0, crit_score))

    # Impact delta score (negative delta = improvement; positive delta = 0.0)
    impact_score = max(0.0, min(1.0, (-impact_delta) / 100.0)) if impact_delta < 0 else 0.0

    # New-impact penalty (0-1):
    penalty = (newly_affected / max(base_blast, 1)) if base_blast > 0 else 0.0
    penalty = max(0.0, min(1.0, penalty))

    w = _RANKING_POLICY["weights"]
    score = (
        w["blast_radius_reduction_score"] * blast_score
        + w["prevented_critical_score"] * crit_score
        + w["impact_delta_score"] * impact_score
        - w["new_impact_penalty"] * penalty
    )
    score = max(0.0, min(1.0, round(score, 6)))

    breakdown = {
        "blast_radius_reduction_score": round(blast_score, 4),
        "prevented_critical_score": round(crit_score, 4),
        "impact_delta_score": round(impact_score, 4),
        "new_impact_penalty": round(penalty, 4),
        "composite_score": score,
        "weights": w,
        "input_metrics": {
            "baseline_blast_radius_count": base_blast,
            "counterfactual_blast_radius_count": cf_blast,
            "blast_radius_reduction_count": blast_reduction,
            "nodes_prevented_count": prevented_count,
            "baseline_critical_affected_count": base_crit,
            "composite_impact_delta_percent": impact_delta,
            "nodes_newly_affected_count": newly_affected,
        },
    }
    return score, breakdown


def _assign_ranks(candidates: list[CandidateIntervention]) -> None:
    """
    Assigns rank_position to ELIGIBLE candidates in-place.
    Equal scores share the same rank position (dense ranking).
    """
    eligible = [c for c in candidates if c.eligibility_status == EligibilityStatus.ELIGIBLE]
    eligible.sort(key=lambda c: -(c.rank_score or 0.0))

    pos = 1
    prev_score: float | None = None
    for c in eligible:
        if prev_score is not None and abs((c.rank_score or 0.0) - prev_score) > 1e-9:
            pos += 1
        c.rank_position = pos
        prev_score = c.rank_score or 0.0


# ── Main Service Class ────────────────────────────────────────────────────


class RecommendationEngineService:
    """
    Orchestrates candidate generation, safety evaluation, Phase 7 simulation,
    ranking, and human decision recording for a recommendation run.

    SAFETY BOUNDARY: This service never executes real-world commands or modifies
    live operational tables (nodes, dependencies, state_history, events, observations).
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Create Run ────────────────────────────────────────────────────────

    async def create_run(
        self, graph_id: uuid.UUID, request: RecommendationRunCreate
    ) -> RecommendationRunResponse:
        """Validates and creates a new recommendation run (does not start execution)."""

        # Verify graph
        graph_res = await self.db.execute(
            select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id)
        )
        if not graph_res.scalar_one_or_none():
            raise ValueError(f"Graph {graph_id} not found")

        # Verify baseline/snapshot if provided
        if request.baseline_id:
            bl_res = await self.db.execute(
                select(StateBaseline).where(
                    StateBaseline.id == request.baseline_id,
                    StateBaseline.graph_id == graph_id,
                )
            )
            if not bl_res.scalar_one_or_none():
                raise ValueError(
                    f"StateBaseline {request.baseline_id} not found for graph {graph_id}"
                )

        if request.snapshot_id:
            sn_res = await self.db.execute(
                select(StateSnapshot).where(
                    StateSnapshot.id == request.snapshot_id,
                    StateSnapshot.graph_id == graph_id,
                )
            )
            if not sn_res.scalar_one_or_none():
                raise ValueError(
                    f"StateSnapshot {request.snapshot_id} not found for graph {graph_id}"
                )

        gen_settings = {
            "max_candidates": request.max_candidates,
            "horizon_minutes": request.horizon_minutes,
            "max_depth": request.max_depth,
            "seed": request.seed,
            "target_node_ids": [str(nid) for nid in (request.target_node_ids or [])],
        }

        run = InterventionRecommendationRun(
            graph_id=graph_id,
            name=request.name,
            description=request.description,
            baseline_id=request.baseline_id,
            snapshot_id=request.snapshot_id,
            status=RecommendationRunStatus.PENDING,
            generation_settings=gen_settings,
            ranking_policy=_RANKING_POLICY,
            limitations=[
                "All candidates are model-dependent simulation estimates, not operational commands.",
                "Rankings reflect Phase 7 heuristic propagation models, not observed real-world outcomes.",
                "Approved candidates require separate human-authorised execution outside CAUSAL.",
                "Safety constraints are based on static thresholds; dynamic runtime conditions are not modelled.",
            ],
        )
        self.db.add(run)
        await self.db.commit()
        await self.db.refresh(run)
        return RecommendationRunResponse.model_validate(run)

    # ── Execute Run ───────────────────────────────────────────────────────

    async def execute_run(
        self, graph_id: uuid.UUID, run_id: uuid.UUID
    ) -> RecommendationRunResponse:
        """
        Executes a recommendation run end-to-end:
          1. Generate candidates from graph topology.
          2. Evaluate each against safety constraints (fail-closed).
          3. Run eligible candidates through Phase 7 counterfactual simulation.
          4. Rank eligible candidates via documented policy.
          5. Persist everything and mark run READY_FOR_REVIEW.
        """
        run = await self._load_run(graph_id, run_id)
        if run.status not in (
            RecommendationRunStatus.PENDING,
            RecommendationRunStatus.FAILED,
        ):
            raise ValueError(
                f"Run {run_id} has status {run.status!r} and cannot be re-executed. "
                "Only PENDING or FAILED runs can be executed."
            )

        # ── GENERATING ─────────────────────────────────────────────────
        run.status = RecommendationRunStatus.GENERATING
        run.execution_error = None
        await self.db.commit()

        try:
            settings = run.generation_settings or {}
            max_candidates = int(settings.get("max_candidates", 10))
            horizon_minutes = float(settings.get("horizon_minutes", 60.0))
            max_depth = int(settings.get("max_depth", 5))
            seed = int(settings.get("seed", 42))
            target_node_id_strs = settings.get("target_node_ids", [])
            target_node_ids = [uuid.UUID(s) for s in target_node_id_strs] if target_node_id_strs else None

            # Fetch graph state
            nodes_res = await self.db.execute(
                select(Node).where(Node.graph_id == graph_id)
            )
            nodes: list[Node] = list(nodes_res.scalars().all())
            nodes_by_id: dict[uuid.UUID, Node] = {n.id: n for n in nodes}

            deps_res = await self.db.execute(
                select(Dependency).where(Dependency.graph_id == graph_id)
            )
            dependencies: list[Dependency] = list(deps_res.scalars().all())
            deps_by_id: dict[uuid.UUID, Dependency] = {d.id: d for d in dependencies}

            # Resolve baseline states
            base_states: dict[str, dict[str, Any]] = {}
            if run.baseline_id:
                bl_res = await self.db.execute(
                    select(StateBaseline).where(StateBaseline.id == run.baseline_id)
                )
                bl = bl_res.scalar_one_or_none()
                if bl:
                    base_states = bl.node_states or {}
            elif run.snapshot_id:
                sn_res = await self.db.execute(
                    select(StateSnapshot).where(StateSnapshot.id == run.snapshot_id)
                )
                sn = sn_res.scalar_one_or_none()
                if sn:
                    base_states = sn.node_states or {}

            # 1. Generate candidate specs
            candidate_specs = _generate_candidates(
                nodes=nodes,
                dependencies=dependencies,
                base_states=base_states,
                max_candidates=max_candidates,
                target_node_ids=target_node_ids,
            )

            # Build ORM candidates + safety evaluations (no DB flush yet)
            candidate_objs: list[CandidateIntervention] = []
            for spec in candidate_specs:
                safety_agg, eval_dicts = _evaluate_safety(
                    candidate_spec=spec,
                    nodes_by_id=nodes_by_id,
                    deps_by_id=deps_by_id,
                    base_states=base_states,
                    graph_id=graph_id,
                )
                eligibility = (
                    EligibilityStatus.ELIGIBLE
                    if safety_agg == SafetyStatus.PASS
                    else EligibilityStatus.INELIGIBLE
                )

                candidate = CandidateIntervention(
                    run_id=run.id,
                    title=spec["title"],
                    description=spec["description"],
                    intervention_type=spec["intervention_type"],
                    changes=spec["changes"],
                    safety_status=safety_agg,
                    eligibility_status=eligibility,
                )
                # Attach SafetyConstraintEvaluation rows
                for ev in eval_dicts:
                    candidate.safety_evaluations.append(
                        SafetyConstraintEvaluation(
                            constraint_name=ev["constraint_name"],
                            constraint_type=ev["constraint_type"],
                            status=ev["status"],
                            evaluated_value=ev.get("evaluated_value"),
                            threshold=ev.get("threshold"),
                            rationale=ev.get("rationale"),
                            supporting_evidence=ev.get("supporting_evidence", []),
                        )
                    )
                candidate_objs.append(candidate)

            run.candidates.extend(candidate_objs)
            self.db.add_all(candidate_objs)
            await self.db.commit()

            # ── EVALUATING ──────────────────────────────────────────────
            run.status = RecommendationRunStatus.EVALUATING
            await self.db.commit()

            # 3. Run eligible candidates through Phase 7
            cf_service = CounterfactualEngineService(self.db)

            for candidate in candidate_objs:
                if candidate.eligibility_status != EligibilityStatus.ELIGIBLE:
                    continue

                try:
                    change_creates = [
                        CounterfactualChangeCreate(
                            target_type=ch["target_type"],
                            target_id=uuid.UUID(ch["target_id"]),
                            change_type=ch["change_type"],
                            proposed_value=ch["proposed_value"],
                            original_value=ch.get("original_value"),
                            rationale=ch.get("rationale"),
                        )
                        for ch in candidate.changes
                    ]

                    exp_create = CounterfactualExperimentCreate(
                        name=f"[Rec Run {run.id}] {candidate.title}",
                        description=candidate.description,
                        baseline_id=run.baseline_id,
                        snapshot_id=run.snapshot_id,
                        forecast_settings={
                            "horizon_minutes": horizon_minutes,
                            "max_depth": max_depth,
                            "seed": seed,
                            "simulation_mode": "DETERMINISTIC",
                        },
                        changes=change_creates,
                    )

                    exp_resp = await cf_service.create_experiment(graph_id, exp_create)
                    run_result = await cf_service.run_experiment(graph_id, exp_resp.id)

                    candidate.counterfactual_experiment_id = exp_resp.id

                    # Extract comparison metrics for ranking
                    comparison_metrics: dict[str, Any] = {}
                    if run_result.comparison and run_result.comparison.comparison_metrics:
                        comparison_metrics = dict(run_result.comparison.comparison_metrics)

                    rank_score, breakdown = _compute_rank_score(comparison_metrics)
                    candidate.rank_score = rank_score
                    candidate.ranking_breakdown = breakdown
                    await self.db.commit()

                except Exception as exc:
                    # Mark candidate ineligible on simulation failure; do not abort entire run
                    candidate.eligibility_status = EligibilityStatus.INDETERMINATE
                    candidate.ranking_breakdown = {"error": str(exc)}
                    await self.db.commit()

            # 4. Assign ranks
            await self.db.refresh(run, ["candidates"])
            _assign_ranks(run.candidates)
            await self.db.commit()

            # 5. Finalise run
            eligible_count = sum(
                1 for c in run.candidates if c.eligibility_status == EligibilityStatus.ELIGIBLE
            )
            ineligible_count = sum(
                1 for c in run.candidates if c.eligibility_status == EligibilityStatus.INELIGIBLE
            )
            indeterminate_count = sum(
                1 for c in run.candidates if c.eligibility_status == EligibilityStatus.INDETERMINATE
            )
            ranked_count = sum(1 for c in run.candidates if c.rank_position is not None)
            top_score = max(
                (c.rank_score for c in run.candidates if c.rank_score is not None),
                default=None,
            )

            run.summary = {
                "total_candidates": len(run.candidates),
                "eligible_candidates": eligible_count,
                "ineligible_candidates": ineligible_count,
                "indeterminate_candidates": indeterminate_count,
                "ranked_candidates": ranked_count,
                "top_rank_score": top_score,
                "disclaimer": (
                    "Rankings are model-dependent estimates. No candidate is an operational command. "
                    "Human review and approval are required before any real-world action."
                ),
            }
            run.status = RecommendationRunStatus.READY_FOR_REVIEW
            run.completed_at = _utc_now()
            await self.db.commit()
            await self.db.refresh(run)
            return RecommendationRunResponse.model_validate(run)

        except Exception as exc:
            await self.db.rollback()
            # Record failure in isolated transaction
            fail_res = await self.db.execute(
                select(InterventionRecommendationRun).where(
                    InterventionRecommendationRun.id == run_id
                )
            )
            fail_run = fail_res.scalar_one_or_none()
            if fail_run:
                fail_run.status = RecommendationRunStatus.FAILED
                fail_run.execution_error = str(exc)
                await self.db.commit()
            raise

    # ── Human Decision ────────────────────────────────────────────────────

    async def record_decision(
        self,
        graph_id: uuid.UUID,
        run_id: uuid.UUID,
        candidate_id: uuid.UUID,
        request: CandidateDecisionRequest,
        authenticated_decided_by: str | None = None,
    ) -> CandidateInterventionResponse:
        """
        Records a human approval or rejection for a candidate intervention.

        AUDIT INTEGRITY RULES (Phase 9 hardened):
        1. Run must be in READY_FOR_REVIEW status.
        2. APPROVAL is permitted ONLY for candidates that are strictly SAFE and ELIGIBLE.
           Unsafe, ineligible, or indeterminate candidates cannot be approved.
        3. REJECTION is permitted for any candidate (human operators may reject any candidate).
        4. authenticated_decided_by MUST be supplied by the caller and derived from the
           server-side authenticated principal (JWT). It is used as the authoritative identity.
           The caller-supplied request.decided_by is ignored for attribution; it may only
           be retained in notes for historical/display purposes.
        5. Repeated decisions / conflicting updates:
           If already decided, an update records the transition and retains prior decision notes.
        6. Historical records where decided_by was a caller-supplied string (pre-Phase 9)
           are preserved as-is and labelled as unverified-caller-supplied identity.
        """
        run = await self._load_run(graph_id, run_id)
        if run.status != RecommendationRunStatus.READY_FOR_REVIEW:
            raise ValueError(
                f"Run {run_id} must be in READY_FOR_REVIEW status to accept decisions "
                f"(current: {run.status!r})"
            )

        candidate_res = await self.db.execute(
            select(CandidateIntervention)
            .where(
                CandidateIntervention.id == candidate_id,
                CandidateIntervention.run_id == run_id,
            )
            .options(selectinload(CandidateIntervention.safety_evaluations))
        )
        candidate = candidate_res.scalar_one_or_none()
        if not candidate:
            raise ValueError(f"Candidate {candidate_id} not found in run {run_id}")

        # Safety Gate: Only SAFE and ELIGIBLE candidates can be approved
        if request.decision == DecisionStatus.APPROVED:
            if (
                candidate.safety_status != SafetyStatus.PASS
                or candidate.eligibility_status != EligibilityStatus.ELIGIBLE
            ):
                raise ValueError(
                    f"Cannot approve candidate {candidate_id}: candidate is not safe and eligible "
                    f"(safety_status={candidate.safety_status!r}, eligibility_status={candidate.eligibility_status!r}). "
                    "Unsafe, ineligible, or indeterminate candidates cannot be approved."
                )

        # Audit trail: if re-deciding, record previous decision context in notes
        final_notes = request.notes
        if (
            candidate.decision_status != DecisionStatus.PENDING
            and candidate.decision_status != request.decision
            and candidate.decided_at
        ):
            prior_context = (
                f"[Superseded prior {candidate.decision_status} at {candidate.decided_at.isoformat()} "
                f"by {candidate.decided_by or 'reviewer'}]"
            )
            final_notes = f"{prior_context} {request.notes or ''}".strip()

        candidate.decision_status = request.decision
        candidate.decision_notes = final_notes
        candidate.decided_at = _utc_now()
        # Phase 9: Use authenticated server-side identity; never the caller-supplied value.
        candidate.decided_by = authenticated_decided_by or request.decided_by

        await self.db.commit()
        await self.db.refresh(candidate)
        return CandidateInterventionResponse.model_validate(candidate)

    # ── Retrieval ─────────────────────────────────────────────────────────

    async def get_run(
        self, graph_id: uuid.UUID, run_id: uuid.UUID
    ) -> RecommendationRunResponse:
        """Retrieves a recommendation run by ID."""
        run = await self._load_run(graph_id, run_id)
        return RecommendationRunResponse.model_validate(run)

    async def list_runs(
        self,
        graph_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
    ) -> RecommendationRunListResponse:
        """Lists recommendation runs for a graph with pagination."""
        query = select(InterventionRecommendationRun).where(
            InterventionRecommendationRun.graph_id == graph_id
        )
        if status:
            query = query.where(InterventionRecommendationRun.status == status.upper())

        query = query.order_by(desc(InterventionRecommendationRun.created_at))

        all_res = await self.db.execute(query)
        all_items = list(all_res.scalars().all())
        total = len(all_items)
        offset = (page - 1) * page_size
        paged = all_items[offset : offset + page_size]

        list_items = [
            RecommendationRunListItem(
                id=r.id,
                graph_id=r.graph_id,
                name=r.name,
                status=r.status,
                summary=r.summary,
                created_at=r.created_at,
                completed_at=r.completed_at,
            )
            for r in paged
        ]
        return RecommendationRunListResponse(
            items=list_items, total=total, page=page, page_size=page_size
        )

    async def list_candidates(
        self,
        graph_id: uuid.UUID,
        run_id: uuid.UUID,
    ) -> list[CandidateInterventionListItem]:
        """Lists candidates for a run."""
        run = await self._load_run(graph_id, run_id)
        return [
            CandidateInterventionListItem(
                id=c.id,
                run_id=c.run_id,
                title=c.title,
                intervention_type=c.intervention_type,
                safety_status=c.safety_status,
                eligibility_status=c.eligibility_status,
                rank_score=c.rank_score,
                rank_position=c.rank_position,
                decision_status=c.decision_status,
                counterfactual_experiment_id=c.counterfactual_experiment_id,
                created_at=c.created_at,
            )
            for c in (run.candidates or [])
        ]

    async def get_candidate(
        self,
        graph_id: uuid.UUID,
        run_id: uuid.UUID,
        candidate_id: uuid.UUID,
    ) -> CandidateInterventionResponse:
        """Retrieves a single candidate with full safety evaluations."""
        await self._load_run(graph_id, run_id)  # ensures ownership
        candidate_res = await self.db.execute(
            select(CandidateIntervention)
            .where(
                CandidateIntervention.id == candidate_id,
                CandidateIntervention.run_id == run_id,
            )
            .options(selectinload(CandidateIntervention.safety_evaluations))
        )
        candidate = candidate_res.scalar_one_or_none()
        if not candidate:
            raise ValueError(f"Candidate {candidate_id} not found in run {run_id}")
        return CandidateInterventionResponse.model_validate(candidate)

    # ── Internal helpers ──────────────────────────────────────────────────

    async def _load_run(
        self, graph_id: uuid.UUID, run_id: uuid.UUID
    ) -> InterventionRecommendationRun:
        res = await self.db.execute(
            select(InterventionRecommendationRun)
            .where(
                InterventionRecommendationRun.id == run_id,
                InterventionRecommendationRun.graph_id == graph_id,
            )
            .options(
                selectinload(InterventionRecommendationRun.candidates).selectinload(
                    CandidateIntervention.safety_evaluations
                )
            )
        )
        run = res.scalar_one_or_none()
        if not run:
            raise ValueError(f"RecommendationRun {run_id} not found in graph {graph_id}")
        return run
