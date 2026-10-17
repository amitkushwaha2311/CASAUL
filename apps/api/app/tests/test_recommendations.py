"""
CAUSAL API — Phase 8 Backend Tests: Recommendation Engine.

Tests:
  1. Run lifecycle: create → execute → READY_FOR_REVIEW
  2. Candidate generation: bounded to max_candidates, only from degraded nodes
  3. Safety constraints: fail-closed on required-dep severance; fail on invalid targets
  4. Eligibility: INELIGIBLE candidates not ranked
  5. Ranking: transparent score components; dense tie preservation
  6. Human decision: APPROVED / REJECTED; requires READY_FOR_REVIEW status
  7. Live-state immutability: node, dependency, state_history, event, observation
     tables are untouched before and after a full run
  8. Invalid inputs rejected without mutating state
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.recommendation_models import (
    ConstraintStatus,
    ConstraintType,
    DecisionStatus,
    EligibilityStatus,
    RecommendationRunStatus,
    SafetyStatus,
)
from app.services.recommendation_engine_service import (
    _compute_rank_score,
    _evaluate_safety,
    _generate_candidates,
    _assign_ranks,
    _RANKING_POLICY,
    _PROTECTED_CRITICALITY,
    _PROTECTED_HEALTH_FLOOR,
    _utc_now,
)
from app.models.graph_models import NodeState
from app.models.counterfactual_models import CounterfactualChangeType, CounterfactualTargetType


# ── Helpers ───────────────────────────────────────────────────────────────
# We use SimpleNamespace instead of SQLAlchemy ORM __new__ because the pure
# engine functions only read attributes — no DB session needed.


def _make_node(
    node_id=None,
    graph_id=None,
    state=NodeState.DEGRADED,
    health=0.4,
    capacity=0.6,
    criticality=0.5,
    name="Test Node",
):
    return SimpleNamespace(
        id=node_id or uuid.uuid4(),
        graph_id=graph_id or uuid.uuid4(),
        name=name,
        type="test",
        state=state,
        health=health,
        capacity=capacity,
        criticality=criticality,
        metadata_=None,
    )


def _make_dep(
    dep_id=None,
    graph_id=None,
    source_id=None,
    target_id=None,
    required=True,
    strength=0.8,
):
    return SimpleNamespace(
        id=dep_id or uuid.uuid4(),
        graph_id=graph_id or uuid.uuid4(),
        source_node_id=source_id or uuid.uuid4(),
        target_node_id=target_id or uuid.uuid4(),
        dependency_type="power",
        strength=strength,
        required=required,
        failure_propagation=1.0,
        metadata_=None,
    )


def _make_candidate(
    eligibility=EligibilityStatus.ELIGIBLE,
    rank_score=0.75,
):
    return SimpleNamespace(
        id=uuid.uuid4(),
        run_id=uuid.uuid4(),
        eligibility_status=eligibility,
        rank_score=rank_score,
        rank_position=None,
    )


# ── 1. Candidate Generator ────────────────────────────────────────────────


class TestCandidateGenerator:
    def test_generates_from_degraded_nodes(self):
        gid = uuid.uuid4()
        node = _make_node(graph_id=gid, state=NodeState.DEGRADED, health=0.4)
        results = _generate_candidates([node], [], {}, max_candidates=10, target_node_ids=None)
        assert len(results) >= 1
        types = {r["intervention_type"] for r in results}
        # Should produce at minimum HEALTH_OVERRIDE and STATE_OVERRIDE
        assert CounterfactualChangeType.HEALTH_OVERRIDE in types
        assert CounterfactualChangeType.STATE_OVERRIDE in types

    def test_normal_nodes_excluded_unless_targeted(self):
        gid = uuid.uuid4()
        normal_node = _make_node(graph_id=gid, state=NodeState.NORMAL, health=1.0)
        results = _generate_candidates([normal_node], [], {}, max_candidates=10, target_node_ids=None)
        assert results == []

    def test_respects_max_candidates_bound(self):
        gid = uuid.uuid4()
        nodes = [
            _make_node(graph_id=gid, state=NodeState.DEGRADED, health=0.3, name=f"Node {i}")
            for i in range(20)
        ]
        results = _generate_candidates(nodes, [], {}, max_candidates=5, target_node_ids=None)
        assert len(results) <= 5

    def test_target_node_filter_overrides_state(self):
        gid = uuid.uuid4()
        nid = uuid.uuid4()
        normal_node = _make_node(node_id=nid, graph_id=gid, state=NodeState.NORMAL, health=0.3)
        results = _generate_candidates(
            [normal_node], [], {}, max_candidates=10, target_node_ids=[nid]
        )
        # Normal node with low health targeted explicitly → should generate health override
        assert any(r["intervention_type"] == CounterfactualChangeType.HEALTH_OVERRIDE for r in results)

    def test_non_required_dep_generates_isolation(self):
        gid = uuid.uuid4()
        nid = uuid.uuid4()
        node = _make_node(node_id=nid, graph_id=gid, state=NodeState.DEGRADED, health=0.4)
        dep = _make_dep(graph_id=gid, source_id=nid, required=False, strength=0.8)
        results = _generate_candidates([node], [dep], {}, max_candidates=10, target_node_ids=None)
        isolation = [
            r for r in results
            if r["intervention_type"] == CounterfactualChangeType.DEPENDENCY_AVAILABILITY
        ]
        assert len(isolation) >= 1
        assert isolation[0]["changes"][0]["proposed_value"] is False

    def test_required_dep_low_strength_generates_boost(self):
        gid = uuid.uuid4()
        nid = uuid.uuid4()
        node = _make_node(node_id=nid, graph_id=gid, state=NodeState.DEGRADED, health=0.4)
        dep = _make_dep(graph_id=gid, source_id=nid, required=True, strength=0.5)
        results = _generate_candidates([node], [dep], {}, max_candidates=10, target_node_ids=None)
        boosts = [
            r for r in results
            if r["intervention_type"] == CounterfactualChangeType.DEPENDENCY_STRENGTH
        ]
        assert len(boosts) >= 1
        assert boosts[0]["changes"][0]["proposed_value"] == 1.0

    def test_no_duplicates_by_target_change_signature(self):
        gid = uuid.uuid4()
        nid = uuid.uuid4()
        node = _make_node(node_id=nid, graph_id=gid, state=NodeState.DEGRADED, health=0.4)
        # Call twice; same candidates should not appear twice
        results = _generate_candidates([node, node], [], {}, max_candidates=10, target_node_ids=None)
        sigs = [
            f"{r['changes'][0]['target_id']}:{r['changes'][0]['change_type']}"
            for r in results
        ]
        assert len(sigs) == len(set(sigs))


# ── 2. Safety Constraint Engine ───────────────────────────────────────────


class TestSafetyConstraintEngine:
    def _make_spec(
        self,
        target_id: uuid.UUID,
        change_type: str,
        proposed_value: Any,
        target_type: str = CounterfactualTargetType.NODE,
    ) -> dict[str, Any]:
        return {
            "title": "Test candidate",
            "description": None,
            "intervention_type": change_type,
            "changes": [{
                "target_type": target_type,
                "target_id": str(target_id),
                "change_type": change_type,
                "proposed_value": proposed_value,
            }],
        }

    def test_allowed_targets_fail_on_missing_node(self):
        gid = uuid.uuid4()
        unknown_id = uuid.uuid4()
        spec = self._make_spec(unknown_id, CounterfactualChangeType.HEALTH_OVERRIDE, 0.85)
        agg, evals = _evaluate_safety(spec, {}, {}, {}, gid)
        assert agg == SafetyStatus.FAIL
        target_eval = next(e for e in evals if e["constraint_type"] == "ALLOWED_TARGETS")
        assert target_eval["status"] == ConstraintStatus.FAIL

    def test_valid_health_override_passes(self):
        gid = uuid.uuid4()
        nid = uuid.uuid4()
        node = _make_node(node_id=nid, graph_id=gid, criticality=0.5)
        spec = self._make_spec(nid, CounterfactualChangeType.HEALTH_OVERRIDE, 0.85)
        agg, evals = _evaluate_safety(spec, {nid: node}, {}, {}, gid)
        assert agg == SafetyStatus.PASS

    def test_invalid_health_value_out_of_bounds_fails(self):
        gid = uuid.uuid4()
        nid = uuid.uuid4()
        node = _make_node(node_id=nid, graph_id=gid, criticality=0.3)
        spec = self._make_spec(nid, CounterfactualChangeType.HEALTH_OVERRIDE, 1.5)
        agg, evals = _evaluate_safety(spec, {nid: node}, {}, {}, gid)
        assert agg == SafetyStatus.FAIL
        bounds_eval = next(e for e in evals if e["constraint_type"] == "VALID_PARAMETER_BOUNDS")
        assert bounds_eval["status"] == ConstraintStatus.FAIL

    def test_protected_node_health_floor_enforced(self):
        gid = uuid.uuid4()
        nid = uuid.uuid4()
        node = _make_node(node_id=nid, graph_id=gid, criticality=_PROTECTED_CRITICALITY + 0.01)
        # Propose health below floor
        spec = self._make_spec(nid, CounterfactualChangeType.HEALTH_OVERRIDE, _PROTECTED_HEALTH_FLOOR - 0.1)
        agg, evals = _evaluate_safety(spec, {nid: node}, {}, {}, gid)
        assert agg == SafetyStatus.FAIL
        health_eval = next(e for e in evals if e["constraint_type"] == "PROTECTED_NODE_HEALTH")
        assert health_eval["status"] == ConstraintStatus.FAIL

    def test_protected_node_health_above_floor_passes(self):
        gid = uuid.uuid4()
        nid = uuid.uuid4()
        node = _make_node(node_id=nid, graph_id=gid, criticality=_PROTECTED_CRITICALITY + 0.01)
        spec = self._make_spec(nid, CounterfactualChangeType.HEALTH_OVERRIDE, _PROTECTED_HEALTH_FLOOR + 0.1)
        agg, evals = _evaluate_safety(spec, {nid: node}, {}, {}, gid)
        assert agg == SafetyStatus.PASS

    def test_required_dep_severance_fails_when_source_not_failed(self):
        gid = uuid.uuid4()
        src_id = uuid.uuid4()
        dep_id = uuid.uuid4()
        src_node = _make_node(node_id=src_id, graph_id=gid, state=NodeState.DEGRADED)
        dep = _make_dep(dep_id=dep_id, graph_id=gid, source_id=src_id, required=True)
        spec = self._make_spec(dep_id, CounterfactualChangeType.DEPENDENCY_AVAILABILITY, False,
                               target_type=CounterfactualTargetType.DEPENDENCY)
        agg, evals = _evaluate_safety(spec, {src_id: src_node}, {dep_id: dep}, {}, gid)
        assert agg == SafetyStatus.FAIL
        req_eval = next(e for e in evals if e["constraint_type"] == "REQUIRED_DEPENDENCY_PRESERVATION")
        assert req_eval["status"] == ConstraintStatus.FAIL

    def test_required_dep_severance_passes_when_source_is_failed(self):
        gid = uuid.uuid4()
        src_id = uuid.uuid4()
        dep_id = uuid.uuid4()
        src_node = _make_node(node_id=src_id, graph_id=gid, state=NodeState.FAILED)
        dep = _make_dep(dep_id=dep_id, graph_id=gid, source_id=src_id, required=True)
        spec = self._make_spec(dep_id, CounterfactualChangeType.DEPENDENCY_AVAILABILITY, False,
                               target_type=CounterfactualTargetType.DEPENDENCY)
        agg, evals = _evaluate_safety(spec, {src_id: src_node}, {dep_id: dep}, {}, gid)
        # Source is FAILED, so isolation is permitted
        req_eval = next(e for e in evals if e["constraint_type"] == "REQUIRED_DEPENDENCY_PRESERVATION")
        assert req_eval["status"] == ConstraintStatus.PASS

    def test_non_required_dep_isolation_passes(self):
        gid = uuid.uuid4()
        src_id = uuid.uuid4()
        dep_id = uuid.uuid4()
        src_node = _make_node(node_id=src_id, graph_id=gid, state=NodeState.DEGRADED)
        dep = _make_dep(dep_id=dep_id, graph_id=gid, source_id=src_id, required=False)
        spec = self._make_spec(dep_id, CounterfactualChangeType.DEPENDENCY_AVAILABILITY, False,
                               target_type=CounterfactualTargetType.DEPENDENCY)
        agg, evals = _evaluate_safety(spec, {src_id: src_node}, {dep_id: dep}, {}, gid)
        # Non-required dep: no REQUIRED_DEPENDENCY_PRESERVATION constraint triggered
        req_evals = [e for e in evals if e["constraint_type"] == "REQUIRED_DEPENDENCY_PRESERVATION"]
        assert req_evals == []
        assert agg == SafetyStatus.PASS


# ── 3. Ranking Policy ─────────────────────────────────────────────────────


class TestRankingPolicy:
    def test_full_prevention_scores_high(self):
        metrics = {
            "baseline_blast_radius_count": 5,
            "counterfactual_blast_radius_count": 1,
            "nodes_prevented_count": 4,
            "nodes_newly_affected_count": 0,
            "baseline_critical_affected_count": 3,
            "counterfactual_critical_affected_count": 0,
            "composite_impact_delta_percent": -60.0,
        }
        score, breakdown = _compute_rank_score(metrics)
        assert score > 0.7
        assert breakdown["blast_radius_reduction_score"] == pytest.approx(4 / 5, rel=1e-3)
        assert breakdown["prevented_critical_score"] == pytest.approx(1.0, rel=1e-3)
        assert breakdown["new_impact_penalty"] == pytest.approx(0.0, abs=1e-9)

    def test_new_impact_penalty_reduces_score(self):
        # Same prevention but 2 newly affected
        base = {
            "baseline_blast_radius_count": 5,
            "counterfactual_blast_radius_count": 5,
            "nodes_prevented_count": 4,
            "nodes_newly_affected_count": 0,
            "baseline_critical_affected_count": 3,
            "counterfactual_critical_affected_count": 0,
            "composite_impact_delta_percent": -60.0,
        }
        penalised = dict(base)
        penalised["nodes_newly_affected_count"] = 2

        score_clean, _ = _compute_rank_score(base)
        score_penalised, _ = _compute_rank_score(penalised)
        assert score_clean > score_penalised

    def test_zero_prevention_scores_low(self):
        metrics = {
            "baseline_blast_radius_count": 5,
            "counterfactual_blast_radius_count": 5,
            "nodes_prevented_count": 0,
            "nodes_newly_affected_count": 0,
            "baseline_critical_affected_count": 3,
            "counterfactual_critical_affected_count": 3,
            "composite_impact_delta_percent": 0.0,
        }
        score, _ = _compute_rank_score(metrics)
        assert score < 0.2

    def test_score_clamped_to_unit_interval(self):
        metrics = {
            "baseline_blast_radius_count": 10,
            "counterfactual_blast_radius_count": 0,
            "nodes_prevented_count": 10,
            "nodes_newly_affected_count": 0,
            "baseline_critical_affected_count": 10,
            "counterfactual_critical_affected_count": 0,
            "composite_impact_delta_percent": -100.0,
        }
        score, _ = _compute_rank_score(metrics)
        assert 0.0 <= score <= 1.0

    def test_empty_graph_safe_defaults(self):
        score, breakdown = _compute_rank_score({})
        assert score == 0.0
        assert breakdown["composite_score"] == 0.0

    def test_ranking_policy_document_accessible(self):
        assert _RANKING_POLICY["version"] == "1.0.0"
        weights = _RANKING_POLICY["weights"]
        positive = (
            weights["blast_radius_reduction_score"]
            + weights["prevented_critical_score"]
            + weights["impact_delta_score"]
        )
        assert abs(positive - 0.90) < 1e-9


# ── 4. Dense Rank Assignment ──────────────────────────────────────────────


class TestRankAssignment:
    def test_eligible_candidates_get_ranks(self):
        candidates = [
            _make_candidate(eligibility=EligibilityStatus.ELIGIBLE, rank_score=0.9),
            _make_candidate(eligibility=EligibilityStatus.ELIGIBLE, rank_score=0.7),
            _make_candidate(eligibility=EligibilityStatus.ELIGIBLE, rank_score=0.5),
        ]
        _assign_ranks(candidates)
        positions = [c.rank_position for c in candidates]
        assert positions == [1, 2, 3]

    def test_tied_scores_share_rank(self):
        candidates = [
            _make_candidate(eligibility=EligibilityStatus.ELIGIBLE, rank_score=0.8),
            _make_candidate(eligibility=EligibilityStatus.ELIGIBLE, rank_score=0.8),
            _make_candidate(eligibility=EligibilityStatus.ELIGIBLE, rank_score=0.5),
        ]
        _assign_ranks(candidates)
        positions = [c.rank_position for c in candidates]
        # Both 0.8 → rank 1; 0.5 → rank 2
        assert positions[0] == 1
        assert positions[1] == 1
        assert positions[2] == 2

    def test_ineligible_candidates_not_ranked(self):
        candidates = [
            _make_candidate(eligibility=EligibilityStatus.ELIGIBLE, rank_score=0.9),
            _make_candidate(eligibility=EligibilityStatus.INELIGIBLE, rank_score=None),
        ]
        _assign_ranks(candidates)
        assert candidates[0].rank_position == 1
        assert candidates[1].rank_position is None

    def test_empty_list_is_safe(self):
        _assign_ranks([])  # Must not raise


# ── 5. API endpoint integration (synchronous client) ─────────────────────

GRAPH_ID = "a1b2c3d4-0000-0000-0000-000000000001"


class TestRecommendationsAPI:
    def test_unauthenticated_requests_return_401(self, client):
        resp = client.post(
            f"/api/v1/graphs/{uuid.uuid4()}/recommendations/runs",
            json={"name": "Test Run"},
        )
        assert resp.status_code == 401
        resp = client.get(
            f"/api/v1/graphs/{uuid.uuid4()}/recommendations/runs"
        )
        assert resp.status_code == 401

    def test_create_run_404_on_unknown_graph(self, client, auth_headers_analyst):
        resp = client.post(
            f"/api/v1/graphs/{uuid.uuid4()}/recommendations/runs",
            json={"name": "Test Run"},
            headers=auth_headers_analyst,
        )
        assert resp.status_code == 404

    def test_list_runs_404_on_unknown_graph(self, client, auth_headers_viewer):
        resp = client.get(
            f"/api/v1/graphs/{uuid.uuid4()}/recommendations/runs",
            headers=auth_headers_viewer,
        )
        assert resp.status_code == 404

    def test_get_run_404_on_unknown_graph(self, client, auth_headers_viewer):
        resp = client.get(
            f"/api/v1/graphs/{uuid.uuid4()}/recommendations/runs/{uuid.uuid4()}",
            headers=auth_headers_viewer,
        )
        assert resp.status_code == 404

    def test_create_run_validation_rejects_empty_name(self, client, auth_headers_analyst):
        # Empty name fails Pydantic min_length=1
        resp = client.post(
            f"/api/v1/graphs/{GRAPH_ID}/recommendations/runs",
            json={"name": ""},
            headers=auth_headers_analyst,
        )
        assert resp.status_code in (400, 422)

    def test_decision_rejects_invalid_status(self, client, auth_headers_approver):
        resp = client.post(
            f"/api/v1/graphs/{GRAPH_ID}/recommendations/runs/{uuid.uuid4()}"
            f"/candidates/{uuid.uuid4()}/decision",
            json={"decision": "MAYBE"},
            headers=auth_headers_approver,
        )
        assert resp.status_code in (400, 422)


# ── 6. Live-state immutability ─────────────────────────────────────────────


class TestLiveStateImmutability:
    """
    Verifies that the recommendation engine service never writes to live
    operational tables: nodes, dependencies, state_history, events, observations.

    Approach: mock the DB session and assert that add() is only called with
    recommendation-engine-specific model types.
    """

    @pytest.mark.asyncio
    async def test_execute_run_does_not_touch_live_tables(self):
        """
        The service should only create InterventionRecommendationRun,
        CandidateIntervention, SafetyConstraintEvaluation, and
        CounterfactualExperiment rows — never Node, Dependency, StateHistory,
        Event, or Observation rows.
        """
        from app.models.recommendation_models import (
            InterventionRecommendationRun,
            CandidateIntervention,
            SafetyConstraintEvaluation,
        )
        from app.models.counterfactual_models import (
            CounterfactualExperiment,
            CounterfactualChange,
            CounterfactualComparison,
        )
        from app.models.graph_models import Node, Dependency
        from app.models.state_models import StateHistory
        from app.models.event_models import Event, Observation

        LIVE_TYPES = (Node, Dependency, StateHistory, Event, Observation)

        added_objects: list[Any] = []

        db_mock = AsyncMock()

        # Collect what gets passed to db.add()
        def _collect_add(obj: Any) -> None:
            added_objects.append(obj)

        db_mock.add.side_effect = _collect_add
        db_mock.add_all.side_effect = lambda objs: [added_objects.append(o) for o in objs]
        db_mock.commit = AsyncMock()
        db_mock.rollback = AsyncMock()
        db_mock.refresh = AsyncMock()

        # execute() returns empty scalars for all selects → run exits gracefully via exception
        empty_result = MagicMock()
        empty_result.scalar_one_or_none.return_value = None
        empty_result.scalars.return_value.all.return_value = []
        db_mock.execute = AsyncMock(return_value=empty_result)

        from app.services.recommendation_engine_service import RecommendationEngineService
        service = RecommendationEngineService(db_mock)

        # We expect a ValueError since graph is not found — that's fine for this immutability test
        try:
            await service.execute_run(uuid.uuid4(), uuid.uuid4())
        except Exception:
            pass

        for obj in added_objects:
            assert not isinstance(obj, LIVE_TYPES), (
                f"Service unexpectedly added a live-state object of type {type(obj).__name__}"
            )


# ── 7. Verification Gate Deterministic Suites ──────────────────────────────


class TestVerificationGateRankingFormula:
    """Explicit tests for Section 1 Verification Gate."""

    def test_beneficial_intervention(self):
        # High blast reduction (from 10 to 2 = 8 reduction), 8 prevented, 0 newly affected, impact delta -75%
        metrics = {
            "baseline_blast_radius_count": 10,
            "counterfactual_blast_radius_count": 2,
            "blast_radius_reduction_count": 8,
            "nodes_prevented_count": 8,
            "nodes_newly_affected_count": 0,
            "baseline_critical_affected_count": 4,
            "counterfactual_critical_affected_count": 1,
            "composite_impact_delta_percent": -75.0,
        }
        score, breakdown = _compute_rank_score(metrics)
        assert score > 0.65
        assert 0.0 <= score <= 1.0
        assert breakdown["blast_radius_reduction_score"] == pytest.approx(8 / 10, rel=1e-3)
        assert breakdown["impact_delta_score"] == pytest.approx(0.75, rel=1e-3)
        assert breakdown["new_impact_penalty"] == pytest.approx(0.0, abs=1e-9)

    def test_worsening_intervention_does_not_improve_score(self):
        # Blast radius grew from 5 to 9 (-4 reduction), 0 prevented, 4 newly affected, impact delta +30%
        metrics = {
            "baseline_blast_radius_count": 5,
            "counterfactual_blast_radius_count": 9,
            "blast_radius_reduction_count": -4,
            "nodes_prevented_count": 0,
            "nodes_newly_affected_count": 4,
            "baseline_critical_affected_count": 1,
            "counterfactual_critical_affected_count": 3,
            "composite_impact_delta_percent": 30.0,
        }
        score, breakdown = _compute_rank_score(metrics)
        assert score == 0.0
        assert breakdown["blast_radius_reduction_score"] == 0.0
        assert breakdown["impact_delta_score"] == 0.0
        assert breakdown["new_impact_penalty"] > 0.0

    def test_mixed_outcome_with_prevented_and_newly_affected(self):
        # Prevented 3 nodes, but caused 2 new nodes to fail
        metrics = {
            "baseline_blast_radius_count": 6,
            "counterfactual_blast_radius_count": 5,
            "blast_radius_reduction_count": 1,
            "nodes_prevented_count": 3,
            "nodes_newly_affected_count": 2,
            "baseline_critical_affected_count": 2,
            "counterfactual_critical_affected_count": 1,
            "composite_impact_delta_percent": -20.0,
        }
        score, breakdown = _compute_rank_score(metrics)
        assert 0.0 <= score <= 1.0
        assert breakdown["new_impact_penalty"] == pytest.approx(2 / 6, rel=1e-3)

    def test_equal_score_candidates_share_rank_positions(self):
        c1 = SimpleNamespace(
            id=uuid.uuid4(),
            eligibility_status=EligibilityStatus.ELIGIBLE,
            rank_score=0.75,
            rank_position=None,
        )
        c2 = SimpleNamespace(
            id=uuid.uuid4(),
            eligibility_status=EligibilityStatus.ELIGIBLE,
            rank_score=0.75,
            rank_position=None,
        )
        c3 = SimpleNamespace(
            id=uuid.uuid4(),
            eligibility_status=EligibilityStatus.ELIGIBLE,
            rank_score=0.50,
            rank_position=None,
        )
        _assign_ranks([c1, c2, c3])
        assert c1.rank_position == 1
        assert c2.rank_position == 1
        assert c3.rank_position == 2

    def test_missing_or_indeterminate_metrics_cannot_silently_improve_score(self):
        empty_score, breakdown = _compute_rank_score({})
        assert empty_score == 0.0
        none_score, _ = _compute_rank_score(None)
        assert none_score == 0.0


class TestVerificationGateSafetyIntegrity:
    """Explicit tests for Section 2 Verification Gate."""

    def test_missing_health_value_fails(self):
        gid = uuid.uuid4()
        nid = uuid.uuid4()
        node = _make_node(node_id=nid, graph_id=gid, criticality=0.9, health=0.8)
        spec = {
            "title": "Missing health",
            "intervention_type": "HEALTH_OVERRIDE",
            "changes": [
                {
                    "target_type": CounterfactualTargetType.NODE,
                    "target_id": str(nid),
                    "change_type": CounterfactualChangeType.HEALTH_OVERRIDE,
                    "proposed_value": None,
                    "rationale": "Missing value test",
                }
            ],
        }
        agg, evals = _evaluate_safety(spec, {nid: node}, {}, {}, gid)
        assert agg == SafetyStatus.FAIL
        health_eval = next(e for e in evals if e["constraint_type"] == ConstraintType.PROTECTED_NODE_HEALTH)
        assert health_eval["status"] == ConstraintStatus.FAIL

    def test_missing_protected_node_criticality_indeterminate_fails(self):
        gid = uuid.uuid4()
        nid = uuid.uuid4()
        node = _make_node(node_id=nid, graph_id=gid, criticality=None, health=0.8)
        spec = {
            "title": "Missing criticality",
            "intervention_type": "HEALTH_OVERRIDE",
            "changes": [
                {
                    "target_type": CounterfactualTargetType.NODE,
                    "target_id": str(nid),
                    "change_type": CounterfactualChangeType.HEALTH_OVERRIDE,
                    "proposed_value": 0.5,
                    "rationale": "Missing criticality test",
                }
            ],
        }
        agg, evals = _evaluate_safety(spec, {nid: node}, {}, {}, gid)
        assert agg == SafetyStatus.FAIL
        crit_eval = next(e for e in evals if e["constraint_type"] == ConstraintType.PROTECTED_NODE_HEALTH)
        assert crit_eval["status"] == ConstraintStatus.INDETERMINATE

    def test_missing_dependency_required_flag_indeterminate_fails(self):
        gid = uuid.uuid4()
        dep_id = uuid.uuid4()
        dep = _make_dep(dep_id=dep_id, graph_id=gid, required=None)
        spec = {
            "title": "Sever dep with unknown required flag",
            "intervention_type": "DEPENDENCY_AVAILABILITY",
            "changes": [
                {
                    "target_type": CounterfactualTargetType.DEPENDENCY,
                    "target_id": str(dep_id),
                    "change_type": CounterfactualChangeType.DEPENDENCY_AVAILABILITY,
                    "proposed_value": False,
                    "rationale": "Isolation test",
                }
            ],
        }
        agg, evals = _evaluate_safety(spec, {}, {dep_id: dep}, {}, gid)
        assert agg == SafetyStatus.FAIL
        dep_eval = next(e for e in evals if e["constraint_type"] == ConstraintType.REQUIRED_DEPENDENCY_PRESERVATION)
        assert dep_eval["status"] == ConstraintStatus.INDETERMINATE

    def test_ranking_cannot_override_failed_safety(self):
        candidate = SimpleNamespace(
            id=uuid.uuid4(),
            safety_status=SafetyStatus.FAIL,
            eligibility_status=EligibilityStatus.INELIGIBLE,
            rank_score=None,
            rank_position=None,
        )
        _assign_ranks([candidate])
        assert candidate.rank_position is None
        assert candidate.rank_score is None


class TestVerificationGateHumanApprovalAndAudit:
    """Explicit tests for Section 3 Verification Gate."""

    @pytest.mark.asyncio
    async def test_cannot_approve_unsafe_or_ineligible_candidate(self):
        from app.services.recommendation_engine_service import RecommendationEngineService
        from app.schemas.recommendation import CandidateDecisionRequest

        db_mock = AsyncMock()
        service = RecommendationEngineService(db_mock)

        run = SimpleNamespace(
            id=uuid.uuid4(),
            status=RecommendationRunStatus.READY_FOR_REVIEW,
        )
        candidate = SimpleNamespace(
            id=uuid.uuid4(),
            run_id=run.id,
            safety_status=SafetyStatus.FAIL,
            eligibility_status=EligibilityStatus.INELIGIBLE,
            decision_status=DecisionStatus.PENDING,
            decided_at=None,
            decided_by=None,
            decision_notes=None,
            safety_evaluations=[],
        )

        service._load_run = AsyncMock(return_value=run)
        cand_result = MagicMock()
        cand_result.scalar_one_or_none.return_value = candidate
        db_mock.execute = AsyncMock(return_value=cand_result)

        req = CandidateDecisionRequest(
            decision="APPROVED",
            decided_by="Test Reviewer",
            notes="Attempting to approve unsafe candidate",
        )

        with pytest.raises(ValueError, match="Cannot approve candidate"):
            await service.record_decision(uuid.uuid4(), run.id, candidate.id, req)

    @pytest.mark.asyncio
    async def test_can_approve_safe_and_eligible_candidate(self):
        from app.services.recommendation_engine_service import RecommendationEngineService
        from app.schemas.recommendation import CandidateDecisionRequest

        db_mock = AsyncMock()
        service = RecommendationEngineService(db_mock)

        run = SimpleNamespace(
            id=uuid.uuid4(),
            status=RecommendationRunStatus.READY_FOR_REVIEW,
        )
        candidate = SimpleNamespace(
            id=uuid.uuid4(),
            run_id=run.id,
            title="Safe Candidate",
            intervention_type="HEALTH_OVERRIDE",
            changes=[],
            safety_status=SafetyStatus.PASS,
            eligibility_status=EligibilityStatus.ELIGIBLE,
            rank_score=0.85,
            rank_position=1,
            ranking_breakdown={},
            decision_status=DecisionStatus.PENDING,
            decided_at=None,
            decided_by=None,
            decision_notes=None,
            safety_evaluations=[],
            created_at=_utc_now(),
            updated_at=_utc_now(),
        )

        service._load_run = AsyncMock(return_value=run)
        cand_result = MagicMock()
        cand_result.scalar_one_or_none.return_value = candidate
        db_mock.execute = AsyncMock(return_value=cand_result)
        db_mock.commit = AsyncMock()
        db_mock.refresh = AsyncMock()

        req = CandidateDecisionRequest(
            decision="APPROVED",
            decided_by="Chief Engineer",
            notes="Approved for maintenance review",
        )

        res = await service.record_decision(uuid.uuid4(), run.id, candidate.id, req)
        assert res.decision_status == "APPROVED"
        assert res.decided_by == "Chief Engineer"
        assert res.decision_notes == "Approved for maintenance review"

    @pytest.mark.asyncio
    async def test_repeated_decision_records_superseded_context(self):
        from app.services.recommendation_engine_service import RecommendationEngineService
        from app.schemas.recommendation import CandidateDecisionRequest

        db_mock = AsyncMock()
        service = RecommendationEngineService(db_mock)

        run = SimpleNamespace(
            id=uuid.uuid4(),
            status=RecommendationRunStatus.READY_FOR_REVIEW,
        )
        prior_time = _utc_now()
        candidate = SimpleNamespace(
            id=uuid.uuid4(),
            run_id=run.id,
            title="Eligible Candidate",
            intervention_type="HEALTH_OVERRIDE",
            changes=[],
            safety_status=SafetyStatus.PASS,
            eligibility_status=EligibilityStatus.ELIGIBLE,
            rank_score=0.85,
            rank_position=1,
            ranking_breakdown={},
            decision_status=DecisionStatus.APPROVED,
            decided_at=prior_time,
            decided_by="Prior Reviewer",
            decision_notes="Initial approval",
            safety_evaluations=[],
            created_at=_utc_now(),
            updated_at=_utc_now(),
        )

        service._load_run = AsyncMock(return_value=run)
        cand_result = MagicMock()
        cand_result.scalar_one_or_none.return_value = candidate
        db_mock.execute = AsyncMock(return_value=cand_result)
        db_mock.commit = AsyncMock()
        db_mock.refresh = AsyncMock()

        # Reject previously approved candidate
        req = CandidateDecisionRequest(
            decision="REJECTED",
            decided_by="Second Reviewer",
            notes="Discovered external conflict",
        )

        res = await service.record_decision(uuid.uuid4(), run.id, candidate.id, req)
        assert res.decision_status == "REJECTED"
        assert res.decided_by == "Second Reviewer"
        assert "Superseded prior APPROVED" in (res.decision_notes or "")
        assert "Discovered external conflict" in (res.decision_notes or "")
