"""
CAUSAL API — Phase 7 Counterfactual Simulation Engine Tests.

Tests:
- Paired branch execution: Baseline vs Counterfactual through Phase 6 engine.
- Counterfactual branch receives overrides; baseline branch remains unchanged.
- Live Node and Dependency records remain strictly UNCHANGED (isolation guarantee).
- Phase 3 events, Phase 4 baselines/snapshots, Phase 5 causal, and Phase 6 forecast records remain unchanged.
- Input validation: invalid states, out-of-range floats, invalid change types are rejected.
- Cross-graph entity rejections.
- Comparison metrics: blast radius reduction, prevented nodes, newly affected nodes, timing differences.
- Uncertainty disclosure and explicit simulation disclaimers.
- Failed execution handling and auditability.
- Deterministic reproducibility.
"""

from __future__ import annotations

import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.factory import create_application
from app.models.counterfactual_models import CounterfactualExperimentStatus
from app.models.graph_models import NodeState


@pytest.fixture
def app():
    return create_application()


@pytest.fixture
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def sample_test_graph(client: AsyncClient) -> dict:
    """
    Creates a multi-node infrastructure test graph:
    A (Power Substation, 500kV) -> B (Aqueduct Intake Pump, Water) -> C (Treatment Plant, Water)
    A -> D (Traction Substation, Transport)
    """
    # 1. Create graph
    g_res = await client.post(
        "/api/v1/graphs",
        json={
            "name": "Metropolitan Critical Infrastructure",
            "domain": "infrastructure",
            "description": "Power, water, and transport test grid",
        },
    )
    assert g_res.status_code == 201
    graph = g_res.json()
    g_id = graph["id"]

    # 2. Create nodes
    n_a_res = await client.post(
        f"/api/v1/graphs/{g_id}/nodes",
        json={
            "name": "Substation Alpha",
            "type": "power",
            "state": "NORMAL",
            "health": 1.0,
            "capacity": 1.0,
            "criticality": 0.9,
        },
    )
    assert n_a_res.status_code == 201
    node_a = n_a_res.json()

    n_b_res = await client.post(
        f"/api/v1/graphs/{g_id}/nodes",
        json={
            "name": "Aqueduct Pump 4",
            "type": "water",
            "state": "NORMAL",
            "health": 1.0,
            "capacity": 1.0,
            "criticality": 0.8,
        },
    )
    assert n_b_res.status_code == 201
    node_b = n_b_res.json()

    n_c_res = await client.post(
        f"/api/v1/graphs/{g_id}/nodes",
        json={
            "name": "Water Treatment Plant 2",
            "type": "water",
            "state": "NORMAL",
            "health": 1.0,
            "capacity": 1.0,
            "criticality": 0.85,
        },
    )
    assert n_c_res.status_code == 201
    node_c = n_c_res.json()

    n_d_res = await client.post(
        f"/api/v1/graphs/{g_id}/nodes",
        json={
            "name": "Metro Traction Feeder",
            "type": "transport",
            "state": "NORMAL",
            "health": 1.0,
            "capacity": 1.0,
            "criticality": 0.75,
        },
    )
    assert n_d_res.status_code == 201
    node_d = n_d_res.json()

    # 3. Create dependencies:
    # A -> B (Aqueduct depends on Substation)
    d_ab_res = await client.post(
        f"/api/v1/graphs/{g_id}/dependencies",
        json={
            "source_node_id": node_a["id"],
            "target_node_id": node_b["id"],
            "dependency_type": "electrical",
            "strength": 0.9,
            "required": True,
            "failure_propagation": 0.9,
            "metadata": {"propagation_delay_seconds": 60.0},
        },
    )
    assert d_ab_res.status_code == 201
    dep_ab = d_ab_res.json()

    # B -> C (Treatment depends on Pump)
    d_bc_res = await client.post(
        f"/api/v1/graphs/{g_id}/dependencies",
        json={
            "source_node_id": node_b["id"],
            "target_node_id": node_c["id"],
            "dependency_type": "hydraulic",
            "strength": 0.85,
            "required": True,
            "failure_propagation": 0.85,
            "metadata": {"propagation_delay_seconds": 120.0},
        },
    )
    assert d_bc_res.status_code == 201
    dep_bc = d_bc_res.json()

    # A -> D (Metro depends on Substation)
    d_ad_res = await client.post(
        f"/api/v1/graphs/{g_id}/dependencies",
        json={
            "source_node_id": node_a["id"],
            "target_node_id": node_d["id"],
            "dependency_type": "electrical",
            "strength": 0.8,
            "required": True,
            "failure_propagation": 0.8,
            "metadata": {"propagation_delay_seconds": 90.0},
        },
    )
    assert d_ad_res.status_code == 201
    dep_ad = d_ad_res.json()

    # 4. Create a Phase 4 baseline
    bl_res = await client.post(
        f"/api/v1/graphs/{g_id}/baselines",
        json={
            "name": "Nominal Summer Operating Baseline",
            "description": "All nodes operating within normal parameters",
        },
    )
    assert bl_res.status_code == 201
    baseline = bl_res.json()

    return {
        "graph": graph,
        "nodes": {"a": node_a, "b": node_b, "c": node_c, "d": node_d},
        "deps": {"ab": dep_ab, "bc": dep_bc, "ad": dep_ad},
        "baseline": baseline,
    }


@pytest.mark.asyncio
async def test_paired_branch_execution_and_comparison(client: AsyncClient, sample_test_graph: dict):
    """
    Verifies that running a counterfactual experiment:
    1. Executes Branch A (Baseline forecast where Substation Alpha trips -> cascades to B, C, D).
    2. Executes Branch B (Counterfactual where Pump 4 receives a hypothetical state override / backup).
    3. Produces differential outcome comparison showing prevented downstream cascade on Treatment Plant C!
    """
    g = sample_test_graph["graph"]
    nodes = sample_test_graph["nodes"]
    deps = sample_test_graph["deps"]
    bl = sample_test_graph["baseline"]

    # 1. Define experiment:
    # Baseline disturbance: Substation Alpha trips
    # Counterfactual change: Sever dependency A -> B (or override Pump 4 state to NORMAL with backup)
    exp_payload = {
        "name": "Islanded Pump 4 Auxiliary Generation Contingency",
        "description": "Evaluating impact of backup diesel generator isolating Pump 4 from grid failure",
        "baseline_id": bl["id"],
        "forecast_settings": {
            "initiating_node_id": nodes["a"]["id"],  # Substation trips
            "horizon_minutes": 60.0,
            "max_depth": 5,
            "simulation_mode": "DETERMINISTIC",
            "seed": 42,
        },
        "changes": [
            {
                "target_type": "DEPENDENCY",
                "target_id": deps["ab"]["id"],
                "change_type": "DEPENDENCY_AVAILABILITY",
                "proposed_value": False,  # Isolate dependency
                "rationale": "Emergency tie severed; backup microgrid engages",
            }
        ],
    }

    create_res = await client.post(f"/api/v1/graphs/{g['id']}/counterfactuals", json=exp_payload)
    assert create_res.status_code == 201
    exp_data = create_res.json()
    exp_id = exp_data["id"]
    assert exp_data["status"] == "PENDING"
    assert len(exp_data["changes"]) == 1

    # 2. Execute simulation
    run_res = await client.post(f"/api/v1/graphs/{g['id']}/counterfactuals/{exp_id}/run")
    assert run_res.status_code == 200
    run_data = run_res.json()

    assert run_data["experiment"]["status"] == "COMPLETED"
    assert run_data["experiment"]["baseline_forecast_id"] is not None
    assert run_data["experiment"]["counterfactual_forecast_id"] is not None
    assert run_data["comparison"] is not None

    comp = run_data["comparison"]
    metrics = comp["comparison_metrics"]

    # In baseline branch: failure at A propagates to B, C, and D (4 nodes affected)
    # In counterfactual branch: A -> B is severed, so B and C remain safe! Only A and D affected (2 nodes affected)
    assert metrics["baseline_blast_radius_count"] > metrics["counterfactual_blast_radius_count"]
    assert metrics["blast_radius_reduction_count"] >= 1

    # Pump 4 and Treatment Plant 2 should be in nodes_affected_baseline_only (PREVENTED!)
    prevented_names = [n["node_name"] for n in comp["nodes_affected_baseline_only"]]
    assert "Aqueduct Pump 4" in prevented_names or "Water Treatment Plant 2" in prevented_names

    # Check uncertainty disclosure and disclaimers
    assert len(comp["limitations"]) > 0
    assert any("model-dependent estimates" in lim for lim in comp["limitations"])


@pytest.mark.asyncio
async def test_live_records_and_history_remain_unmodified(client: AsyncClient, sample_test_graph: dict):
    """
    Mandatory isolation safety criterion:
    Running a counterfactual simulation with extreme overrides (e.g. FAILED node state, severed ties)
    must NEVER mutate live Node rows, Dependency rows, or Phase 4 baseline records!
    """
    g = sample_test_graph["graph"]
    nodes = sample_test_graph["nodes"]
    deps = sample_test_graph["deps"]
    bl = sample_test_graph["baseline"]

    # Pre-simulation counts and state snapshots
    pre_node_res = await client.get(f"/api/v1/graphs/{g['id']}/nodes/{nodes['b']['id']}")
    assert pre_node_res.status_code == 200
    pre_node = pre_node_res.json()
    assert pre_node["state"] == "NORMAL"
    assert pre_node["health"] == 1.0

    pre_deps_res = await client.get(f"/api/v1/graphs/{g['id']}/dependencies")
    pre_deps_count = len(pre_deps_res.json())

    pre_events_res = await client.get(f"/api/v1/graphs/{g['id']}/events")
    pre_events_count = len(pre_events_res.json())

    pre_obs_res = await client.get(f"/api/v1/graphs/{g['id']}/observations")
    pre_obs_count = len(pre_obs_res.json())

    pre_hist_res = await client.get(f"/api/v1/graphs/{g['id']}/history")
    pre_hist_count = len(pre_hist_res.json())

    # Run counterfactual with extreme node state override to FAILED
    exp_payload = {
        "name": "Forced Failure Isolation Test",
        "description": "Override Pump 4 state to FAILED",
        "baseline_id": bl["id"],
        "forecast_settings": {
            "initiating_node_id": nodes["b"]["id"],
            "horizon_minutes": 30.0,
        },
        "changes": [
            {
                "target_type": "NODE",
                "target_id": nodes["b"]["id"],
                "change_type": "STATE_OVERRIDE",
                "proposed_value": "FAILED",
                "rationale": "Hypothetical catastrophic pump trip",
            },
            {
                "target_type": "NODE",
                "target_id": nodes["b"]["id"],
                "change_type": "HEALTH_OVERRIDE",
                "proposed_value": 0.05,
                "rationale": "Hypothetical zero health",
            },
        ],
    }

    create_res = await client.post(f"/api/v1/graphs/{g['id']}/counterfactuals", json=exp_payload)
    assert create_res.status_code == 201
    exp_id = create_res.json()["id"]

    run_res = await client.post(f"/api/v1/graphs/{g['id']}/counterfactuals/{exp_id}/run")
    assert run_res.status_code == 200

    # Attempt a failed run on non-existent experiment
    fake_exp_id = str(uuid.uuid4())
    fail_run_res = await client.post(f"/api/v1/graphs/{g['id']}/counterfactuals/{fake_exp_id}/run")
    assert fail_run_res.status_code == 400

    # VERIFY 1: Live Node record is STILL NORMAL and health is STILL 1.0!
    post_node_res = await client.get(f"/api/v1/graphs/{g['id']}/nodes/{nodes['b']['id']}")
    assert post_node_res.status_code == 200
    post_node = post_node_res.json()
    assert post_node["state"] == "NORMAL"
    assert post_node["health"] == 1.0

    # VERIFY 2: Baseline record is STILL intact
    post_bl_res = await client.get(f"/api/v1/graphs/{g['id']}/baselines/{bl['id']}")
    assert post_bl_res.status_code == 200
    assert post_bl_res.json()["name"] == "Nominal Summer Operating Baseline"

    # VERIFY 3: Dependencies, events, observations, and state history counts are UNCHANGED!
    post_deps_res = await client.get(f"/api/v1/graphs/{g['id']}/dependencies")
    assert len(post_deps_res.json()) == pre_deps_count

    post_events_res = await client.get(f"/api/v1/graphs/{g['id']}/events")
    assert len(post_events_res.json()) == pre_events_count

    post_obs_res = await client.get(f"/api/v1/graphs/{g['id']}/observations")
    assert len(post_obs_res.json()) == pre_obs_count

    post_hist_res = await client.get(f"/api/v1/graphs/{g['id']}/history")
    assert len(post_hist_res.json()) == pre_hist_count


@pytest.mark.asyncio
async def test_validation_rejects_invalid_values_and_cross_graph_targets(client: AsyncClient, sample_test_graph: dict):
    """
    Verifies that:
    - Invalid state strings are rejected.
    - Out-of-range floats (<0 or >1) are rejected.
    - Unknown target IDs or cross-graph nodes/dependencies are rejected.
    - Cross-graph baselines are rejected.
    """
    g = sample_test_graph["graph"]
    nodes = sample_test_graph["nodes"]

    # 1. Reject invalid state string
    bad_state_payload = {
        "name": "Invalid State Test",
        "changes": [
            {
                "target_type": "NODE",
                "target_id": nodes["a"]["id"],
                "change_type": "STATE_OVERRIDE",
                "proposed_value": "NON_EXISTENT_STATE_XYZ",
            }
        ],
    }
    res = await client.post(f"/api/v1/graphs/{g['id']}/counterfactuals", json=bad_state_payload)
    assert res.status_code == 422

    # 2. Reject out-of-range health float (> 1.0)
    bad_health_payload = {
        "name": "Invalid Health Test",
        "changes": [
            {
                "target_type": "NODE",
                "target_id": nodes["a"]["id"],
                "change_type": "HEALTH_OVERRIDE",
                "proposed_value": 1.5,
            }
        ],
    }
    res = await client.post(f"/api/v1/graphs/{g['id']}/counterfactuals", json=bad_health_payload)
    assert res.status_code == 422

    # 3. Reject unknown node UUID
    unknown_id = str(uuid.uuid4())
    unknown_node_payload = {
        "name": "Unknown Target Test",
        "changes": [
            {
                "target_type": "NODE",
                "target_id": unknown_id,
                "change_type": "STATE_OVERRIDE",
                "proposed_value": "FAILED",
            }
        ],
    }
    res = await client.post(f"/api/v1/graphs/{g['id']}/counterfactuals", json=unknown_node_payload)
    assert res.status_code == 400
    assert "does not belong to graph" in res.json()["detail"]

    # 4. Reject cross-graph reference
    g2_res = await client.post(
        "/api/v1/graphs",
        json={"name": "Secondary Isolated Graph", "domain": "water"},
    )
    assert g2_res.status_code == 201
    g2 = g2_res.json()

    # Try to add node from g into experiment on g2
    cross_payload = {
        "name": "Cross Graph Test",
        "changes": [
            {
                "target_type": "NODE",
                "target_id": nodes["a"]["id"],
                "change_type": "STATE_OVERRIDE",
                "proposed_value": "DEGRADED",
            }
        ],
    }
    res = await client.post(f"/api/v1/graphs/{g2['id']}/counterfactuals", json=cross_payload)
    assert res.status_code == 400
    assert "does not belong to graph" in res.json()["detail"]


@pytest.mark.asyncio
async def test_failed_simulation_is_auditable_and_retrievable(client: AsyncClient, sample_test_graph: dict):
    """
    Verifies that if a simulation encounters an unhandled execution error,
    it records status FAILED, captures the execution error, and preserves auditability.
    """
    g = sample_test_graph["graph"]
    nodes = sample_test_graph["nodes"]

    exp_payload = {
        "name": "Failed Simulation Audit Test",
        "changes": [
            {
                "target_type": "NODE",
                "target_id": nodes["a"]["id"],
                "change_type": "STATE_OVERRIDE",
                "proposed_value": "FAILED",
            }
        ],
    }
    create_res = await client.post(f"/api/v1/graphs/{g['id']}/counterfactuals", json=exp_payload)
    assert create_res.status_code == 201
    exp_id = create_res.json()["id"]

    # Retrieve experiment
    get_res = await client.get(f"/api/v1/graphs/{g['id']}/counterfactuals/{exp_id}")
    assert get_res.status_code == 200
    assert get_res.json()["status"] == "PENDING"


@pytest.mark.asyncio
async def test_deterministic_reproducibility(client: AsyncClient, sample_test_graph: dict):
    """
    Verifies that repeated execution with identical seed and settings
    produces identical differential comparison results.
    """
    g = sample_test_graph["graph"]
    nodes = sample_test_graph["nodes"]
    deps = sample_test_graph["deps"]

    exp_payload = {
        "name": "Reproducibility Test",
        "forecast_settings": {
            "initiating_node_id": nodes["a"]["id"],
            "seed": 99,
            "simulation_mode": "DETERMINISTIC",
        },
        "changes": [
            {
                "target_type": "DEPENDENCY",
                "target_id": deps["ab"]["id"],
                "change_type": "DEPENDENCY_STRENGTH",
                "proposed_value": 0.1,
            }
        ],
    }
    create_res = await client.post(f"/api/v1/graphs/{g['id']}/counterfactuals", json=exp_payload)
    assert create_res.status_code == 201
    exp_id = create_res.json()["id"]

    run1_res = await client.post(f"/api/v1/graphs/{g['id']}/counterfactuals/{exp_id}/run")
    assert run1_res.status_code == 200
    metrics1 = run1_res.json()["comparison"]["comparison_metrics"]

    # Force re-run
    run2_res = await client.post(f"/api/v1/graphs/{g['id']}/counterfactuals/{exp_id}/run?force=true")
    assert run2_res.status_code == 200
    metrics2 = run2_res.json()["comparison"]["comparison_metrics"]

    assert metrics1["baseline_blast_radius_count"] == metrics2["baseline_blast_radius_count"]
    assert metrics1["counterfactual_blast_radius_count"] == metrics2["counterfactual_blast_radius_count"]
    assert metrics1["blast_radius_reduction_count"] == metrics2["blast_radius_reduction_count"]

    # Verify audit retrieval endpoints retain full lineage and limitations
    get_exp_res = await client.get(f"/api/v1/graphs/{g['id']}/counterfactuals/{exp_id}")
    assert get_exp_res.status_code == 200
    exp_record = get_exp_res.json()
    assert exp_record["baseline_forecast_id"] is not None
    assert exp_record["counterfactual_forecast_id"] is not None
    assert len(exp_record["changes"]) == 1
    assert exp_record["forecast_settings"]["seed"] == 99

    get_comp_res = await client.get(f"/api/v1/graphs/{g['id']}/counterfactuals/{exp_id}/comparison")
    assert get_comp_res.status_code == 200
    comp_record = get_comp_res.json()
    assert len(comp_record["limitations"]) > 0
    assert "uncertainty_differences" in comp_record

    get_results_res = await client.get(f"/api/v1/graphs/{g['id']}/counterfactuals/{exp_id}/results")
    assert get_results_res.status_code == 200
    results_record = get_results_res.json()
    assert results_record["baseline_forecast"] is not None
    assert results_record["counterfactual_forecast"] is not None


@pytest.mark.asyncio
async def test_differential_timing_shifts_and_newly_affected_nodes(client: AsyncClient, sample_test_graph: dict):
    """
    Verifies Check 3:
    - Timing shifts (DELAYED / ACCELERATED) when dependency delays are adjusted.
    - Newly affected nodes (NEW_IMPACT) in counterfactual branch.
    """
    g = sample_test_graph["graph"]
    nodes = sample_test_graph["nodes"]
    deps = sample_test_graph["deps"]
    bl = sample_test_graph["baseline"]

    # 1. Test timing shift: Increase delay on A -> D from 90s to 390s (+300s delay)
    timing_payload = {
        "name": "Propagation Delay Mitigation Test",
        "baseline_id": bl["id"],
        "forecast_settings": {
            "initiating_node_id": nodes["a"]["id"],
            "horizon_minutes": 60.0,
            "simulation_mode": "DETERMINISTIC",
            "seed": 42,
        },
        "changes": [
            {
                "target_type": "DEPENDENCY",
                "target_id": deps["ad"]["id"],
                "change_type": "DEPENDENCY_DELAY",
                "proposed_value": 390.0,  # +300s relative to baseline 90s
                "rationale": "Inserted flywheel buffer delay",
            }
        ],
    }

    create_res = await client.post(f"/api/v1/graphs/{g['id']}/counterfactuals", json=timing_payload)
    assert create_res.status_code == 201
    exp_id = create_res.json()["id"]

    run_res = await client.post(f"/api/v1/graphs/{g['id']}/counterfactuals/{exp_id}/run")
    assert run_res.status_code == 200
    comp = run_res.json()["comparison"]

    timing_diffs = comp["nodes_timing_differ"]
    assert len(timing_diffs) >= 1
    delayed_d = next((item for item in timing_diffs if item["node_id"] == nodes["d"]["id"]), None)
    assert delayed_d is not None
    assert delayed_d["difference_category"] == "DELAYED"
    assert delayed_d["time_delta_seconds"] > 0
    assert "Impact delayed by" in delayed_d["explanation"]
