"""
CAUSAL API — Phase 6: Cascade Prediction Engine Test Suite.

Verifies:
  - Dependency direction semantics (target depends on source; failure propagates source -> target)
  - Disturbance does not propagate backwards against dependency direction
  - Path without propagation conditions does NOT produce predicted failure
  - Required vs non-required dependency propagation behavior
  - Already failed nodes vs predicted affected nodes distinction
  - Multiple paths reaching the same node without double-counting
  - Cyclic dependency graph termination without infinite loops
  - Horizon and traversal max depth bounding
  - Strict reproducibility for identical inputs and seed
  - Missing delays labeled heuristic default, metadata delays respected
  - Missing probabilities labeled HEURISTIC_ESTIMATE
  - Cross-graph and invalid references rejected
  - Historical auditable forecast retrieval (details, timeline, impact)
  - Forecast generation NEVER mutates live operational node state
"""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.factory import create_application


@pytest.fixture
def app():
    return create_application()


@pytest.fixture
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def _create_graph(client, name="Cascade Test Grid"):
    resp = await client.post(
        "/api/v1/graphs",
        json={
            "name": name,
            "domain": "power",
            "description": "Cascade test graph",
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_node(
    client, graph_id, name, ntype="station", state="NORMAL", health=None, criticality=0.5
):
    if health is None:
        if state == "FAILED":
            health = 0.0
        elif state == "CRITICAL":
            health = 0.3
        elif state == "DEGRADED":
            health = 0.6
        else:
            health = 1.0
    resp = await client.post(
        f"/api/v1/graphs/{graph_id}/nodes",
        json={
            "name": name,
            "type": ntype,
            "state": state,
            "health": health,
            "capacity": 1.0,
            "criticality": criticality,
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_dep(
    client,
    graph_id,
    src_id,
    tgt_id,
    dep_type="electrical",
    strength=1.0,
    req=True,
    fail_prop=1.0,
    metadata=None,
):
    body = {
        "source_node_id": src_id,
        "target_node_id": tgt_id,
        "dependency_type": dep_type,
        "strength": strength,
        "required": req,
        "failure_propagation": fail_prop,
    }
    if metadata:
        body["metadata"] = metadata
    resp = await client.post(f"/api/v1/graphs/{graph_id}/dependencies", json=body)
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_dependency_direction_propagation(client):
    """
    Source -> Target means Target depends on Source.
    A failure at Source propagates downstream to Target.
    A failure at Target does NOT propagate backwards to Source.
    """
    g = await _create_graph(client, "Direction Test Grid")
    source = await _create_node(client, g, "Generator 1", state="FAILED", health=0.0)
    target = await _create_node(client, g, "Substation A", state="NORMAL", health=1.0)
    await _create_dep(client, g, source, target, req=True, strength=0.9)

    # 1. Initiating at source: target should be predicted affected
    resp = await client.post(
        f"/api/v1/graphs/{g}/forecasts/cascade",
        json={
            "initiating_node_id": source,
            "horizon_minutes": 60,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    pred_nodes = {p["node_id"]: p for p in data["predicted_nodes"]}

    assert source in pred_nodes
    assert pred_nodes[source]["forecast_status"] == "ALREADY_AFFECTED"
    assert target in pred_nodes
    assert pred_nodes[target]["forecast_status"] == "PREDICTED_AFFECTED"

    # 2. Initiating at target: source should NOT be affected backwards
    g2 = await _create_graph(client, "Backward Direction Test")
    src2 = await _create_node(client, g2, "Generator 2", state="NORMAL", health=1.0)
    tgt2 = await _create_node(client, g2, "Substation B", state="FAILED", health=0.0)
    await _create_dep(client, g2, src2, tgt2, req=True, strength=0.9)

    resp2 = await client.post(
        f"/api/v1/graphs/{g2}/forecasts/cascade",
        json={
            "initiating_node_id": tgt2,
            "horizon_minutes": 60,
        },
    )
    assert resp2.status_code == 201
    data2 = resp2.json()
    pred_nodes2 = {p["node_id"]: p for p in data2["predicted_nodes"]}

    assert tgt2 in pred_nodes2
    assert src2 not in pred_nodes2  # Failure does not flow upstream against dependency direction


@pytest.mark.asyncio
async def test_weak_optional_path_does_not_propagate(client):
    """
    A path does not prove propagation: a weak, non-required dependency
    with probability below threshold terminates cascade propagation.
    """
    g = await _create_graph(client, "Attenuation Grid")
    src = await _create_node(client, g, "Primary Node", state="FAILED", health=0.0)
    tgt = await _create_node(client, g, "Secondary Node", state="NORMAL", health=1.0)

    # Non-required, weak edge (strength=0.1, failure_propagation=0.2)
    await _create_dep(client, g, src, tgt, req=False, strength=0.1, fail_prop=0.2)

    resp = await client.post(
        f"/api/v1/graphs/{g}/forecasts/cascade",
        json={
            "initiating_node_id": src,
            "propagation_probability_threshold": 0.25,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    pred_node_ids = [p["node_id"] for p in data["predicted_nodes"]]

    assert src in pred_node_ids
    assert tgt not in pred_node_ids  # Below probability threshold: does not propagate


@pytest.mark.asyncio
async def test_already_affected_vs_predicted_affected_distinction(client):
    """
    Nodes already failed/degraded in observed state are labeled ALREADY_AFFECTED,
    while downstream nodes predicted to fail are labeled PREDICTED_AFFECTED.
    """
    g = await _create_graph(client, "Status Label Test")
    n1 = await _create_node(client, g, "Node 1", state="CRITICAL", health=0.3)
    n2 = await _create_node(client, g, "Node 2", state="NORMAL", health=1.0)
    n3 = await _create_node(client, g, "Node 3", state="NORMAL", health=1.0)

    await _create_dep(client, g, n1, n2, req=True)
    await _create_dep(client, g, n2, n3, req=True)

    resp = await client.post(
        f"/api/v1/graphs/{g}/forecasts/cascade",
        json={
            "horizon_minutes": 60,
        },
    )
    assert resp.status_code == 201
    data = resp.json()

    node_dict = {p["node_id"]: p for p in data["predicted_nodes"]}
    assert node_dict[n1]["forecast_status"] == "ALREADY_AFFECTED"
    assert node_dict[n1]["earliest_impact_seconds"] == 0.0

    assert node_dict[n2]["forecast_status"] == "PREDICTED_AFFECTED"
    assert node_dict[n2]["depth"] == 1
    assert node_dict[n2]["earliest_impact_seconds"] > 0

    assert node_dict[n3]["forecast_status"] == "PREDICTED_AFFECTED"
    assert node_dict[n3]["depth"] == 2
    assert node_dict[n3]["earliest_impact_seconds"] > node_dict[n2]["earliest_impact_seconds"]


@pytest.mark.asyncio
async def test_converging_paths_prevent_double_counting(client):
    """
    When multiple upstream paths converge on the same target node,
    the target is recorded once with combined causes and earliest impact.
    """
    g = await _create_graph(client, "Diamond Grid")
    root = await _create_node(client, g, "Root", state="FAILED", health=0.0)
    branch_a = await _create_node(client, g, "Branch A", state="NORMAL", health=1.0)
    branch_b = await _create_node(client, g, "Branch B", state="NORMAL", health=1.0)
    sink = await _create_node(client, g, "Sink", state="NORMAL", health=1.0)

    # Diamond topology: root -> branch_a -> sink, root -> branch_b -> sink
    await _create_dep(client, g, root, branch_a, req=True)
    await _create_dep(client, g, root, branch_b, req=True)
    await _create_dep(client, g, branch_a, sink, req=True)
    await _create_dep(client, g, branch_b, sink, req=True)

    resp = await client.post(
        f"/api/v1/graphs/{g}/forecasts/cascade",
        json={
            "initiating_node_id": root,
            "horizon_minutes": 60,
        },
    )
    assert resp.status_code == 201
    data = resp.json()

    sink_nodes = [p for p in data["predicted_nodes"] if p["node_id"] == sink]
    assert len(sink_nodes) == 1  # Exactly one record for sink, NO double counting!

    sink_rec = sink_nodes[0]
    # Contributing causes include both branch_a and branch_b
    assert branch_a in sink_rec["contributing_causes"]
    assert branch_b in sink_rec["contributing_causes"]


@pytest.mark.asyncio
async def test_cyclic_graph_terminates_safely(client):
    """
    Cyclic dependencies must terminate safely without infinite recursion or loop hangs.
    """
    g = await _create_graph(client, "Cyclic Grid")
    n1 = await _create_node(client, g, "Cycle Node 1", state="FAILED", health=0.0)
    n2 = await _create_node(client, g, "Cycle Node 2", state="NORMAL", health=1.0)
    n3 = await _create_node(client, g, "Cycle Node 3", state="NORMAL", health=1.0)

    # 1 -> 2 -> 3 -> 1
    await _create_dep(client, g, n1, n2, req=True)
    await _create_dep(client, g, n2, n3, req=True)
    await _create_dep(client, g, n3, n1, req=True)

    resp = await client.post(
        f"/api/v1/graphs/{g}/cascade" if False else f"/api/v1/graphs/{g}/forecasts/cascade",
        json={
            "initiating_node_id": n1,
            "max_depth": 5,
            "horizon_minutes": 60,
        },
    )
    assert resp.status_code == 201
    data = resp.json()

    # All 3 nodes reached once without infinite duplication
    assert len(data["predicted_nodes"]) == 3
    assert data["max_depth_reached"] <= 5


@pytest.mark.asyncio
async def test_horizon_bounds_exclude_distant_impacts(client):
    """
    Downstream hops whose cumulative delay exceeds horizon_minutes are excluded.
    """
    g = await _create_graph(client, "Horizon Bound Test")
    n1 = await _create_node(client, g, "Origin", state="FAILED", health=0.0)
    n2 = await _create_node(client, g, "Near Node", state="NORMAL", health=1.0)
    n3 = await _create_node(client, g, "Far Node", state="NORMAL", health=1.0)

    # Custom delays: n1->n2 is 60s, n2->n3 is 3600s
    await _create_dep(client, g, n1, n2, req=True, metadata={"propagation_delay_seconds": 60})
    await _create_dep(client, g, n2, n3, req=True, metadata={"propagation_delay_seconds": 3600})

    # Horizon is 10 minutes (600s). n2 (60s) is in horizon, n3 (3660s) is outside horizon!
    resp = await client.post(
        f"/api/v1/graphs/{g}/forecasts/cascade",
        json={
            "initiating_node_id": n1,
            "horizon_minutes": 10.0,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    pred_node_ids = [p["node_id"] for p in data["predicted_nodes"]]

    assert n1 in pred_node_ids
    assert n2 in pred_node_ids
    assert n3 not in pred_node_ids  # Excluded due to horizon cutoff


@pytest.mark.asyncio
async def test_max_depth_bounding(client):
    """
    Propagation terminates strictly when max_depth is reached.
    """
    g = await _create_graph(client, "Depth Bound Grid")
    nodes = []
    for i in range(6):
        nid = await _create_node(client, g, f"Node {i}", state="FAILED" if i == 0 else "NORMAL")
        nodes.append(nid)

    for i in range(5):
        await _create_dep(client, g, nodes[i], nodes[i + 1], req=True)

    resp = await client.post(
        f"/api/v1/graphs/{g}/forecasts/cascade",
        json={
            "initiating_node_id": nodes[0],
            "max_depth": 2,
        },
    )
    assert resp.status_code == 201
    data = resp.json()

    assert data["max_depth_reached"] == 2
    pred_ids = [p["node_id"] for p in data["predicted_nodes"]]
    assert nodes[0] in pred_ids
    assert nodes[1] in pred_ids
    assert nodes[2] in pred_ids
    assert nodes[3] not in pred_ids  # Excluded by max_depth=2


@pytest.mark.asyncio
async def test_deterministic_reproducibility(client):
    """
    Running the forecast twice with identical inputs and seed produces 100% identical results.
    """
    g = await _create_graph(client, "Reproducibility Grid")
    n1 = await _create_node(client, g, "Source", state="FAILED", health=0.0)
    n2 = await _create_node(client, g, "Node 2", state="NORMAL", health=1.0)
    n3 = await _create_node(client, g, "Node 3", state="NORMAL", health=1.0)

    await _create_dep(client, g, n1, n2, req=True, strength=0.8)
    await _create_dep(client, g, n2, n3, req=False, strength=0.6)

    payload = {
        "initiating_node_id": n1,
        "simulation_mode": "MONTE_CARLO",
        "seed": 999,
        "horizon_minutes": 60,
    }

    r1 = await client.post(f"/api/v1/graphs/{g}/forecasts/cascade", json=payload)
    r2 = await client.post(f"/api/v1/graphs/{g}/forecasts/cascade", json=payload)

    assert r1.status_code == 201
    assert r2.status_code == 201
    d1 = r1.json()
    d2 = r2.json()

    assert d1["total_predicted_affected"] == d2["total_predicted_affected"]
    assert d1["max_depth_reached"] == d2["max_depth_reached"]
    assert [p["node_id"] for p in d1["predicted_nodes"]] == [
        p["node_id"] for p in d2["predicted_nodes"]
    ]


@pytest.mark.asyncio
async def test_calibration_and_delay_source_labels(client):
    """
    Predictions explicitly declare calibration status as HEURISTIC_ESTIMATE
    and separate METADATA delay from HEURISTIC_DEFAULT.
    """
    g = await _create_graph(client, "Labeling Test Grid")
    n1 = await _create_node(client, g, "Source", state="FAILED")
    n2 = await _create_node(client, g, "Explicit Delay Node", state="NORMAL")
    n3 = await _create_node(client, g, "Default Delay Node", state="NORMAL")

    await _create_dep(client, g, n1, n2, req=True, metadata={"propagation_delay_seconds": 180})
    await _create_dep(client, g, n2, n3, req=True)  # No metadata delay

    resp = await client.post(
        f"/api/v1/graphs/{g}/forecasts/cascade",
        json={
            "initiating_node_id": n1,
        },
    )
    assert resp.status_code == 201
    data = resp.json()

    assert data["calibration_status"] == "HEURISTIC_ESTIMATE"
    node_map = {p["node_id"]: p for p in data["predicted_nodes"]}

    assert node_map[n2]["calibration_status"] == "HEURISTIC_ESTIMATE"
    assert node_map[n2]["time_to_impact_range"]["delay_source"] == "METADATA"
    assert node_map[n2]["time_to_impact_range"]["point_estimate_seconds"] == 180.0

    assert node_map[n3]["time_to_impact_range"]["delay_source"] == "HEURISTIC_DEFAULT"


@pytest.mark.asyncio
async def test_historical_auditability_endpoints(client):
    """
    Persisted forecasts can be retrieved via details, timeline, and impact endpoints.
    """
    g = await _create_graph(client, "Audit Grid")
    n1 = await _create_node(client, g, "Node 1", state="FAILED", criticality=0.9)
    n2 = await _create_node(client, g, "Node 2", state="NORMAL", criticality=0.8)
    await _create_dep(client, g, n1, n2, req=True)

    resp = await client.post(
        f"/api/v1/graphs/{g}/forecasts/cascade", json={"initiating_node_id": n1}
    )
    assert resp.status_code == 201
    forecast_id = resp.json()["id"]

    # 1. GET forecast details
    get_resp = await client.get(f"/api/v1/graphs/{g}/forecasts/{forecast_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == forecast_id

    # 2. GET list forecasts
    list_resp = await client.get(f"/api/v1/graphs/{g}/forecasts")
    assert list_resp.status_code == 200
    assert any(item["id"] == forecast_id for item in list_resp.json()["items"])

    # 3. GET timeline
    timeline_resp = await client.get(f"/api/v1/graphs/{g}/forecasts/{forecast_id}/timeline")
    assert timeline_resp.status_code == 200
    assert len(timeline_resp.json()["events"]) >= 2

    # 4. GET impact summary
    impact_resp = await client.get(f"/api/v1/graphs/{g}/forecasts/{forecast_id}/impact")
    assert impact_resp.status_code == 200
    impact = impact_resp.json()
    assert impact["total_predicted_affected"] == 1
    assert impact["composite_criticality_impact_percent"] > 0

    # 5. GET node forecasts
    node_resp = await client.get(f"/api/v1/graphs/{g}/nodes/{n2}/forecasts")
    assert node_resp.status_code == 200
    assert any(item["id"] == forecast_id for item in node_resp.json())


@pytest.mark.asyncio
async def test_cross_graph_access_rejected(client):
    """
    Cross-graph access or non-existent graph/node references return 400 or 404.
    """
    g1 = await _create_graph(client, "Graph 1")
    g2 = await _create_graph(client, "Graph 2")
    n_g2 = await _create_node(client, g2, "Node in G2")

    # Reference node from g2 in forecast for g1: must be rejected!
    resp = await client.post(
        f"/api/v1/graphs/{g1}/forecasts/cascade",
        json={
            "initiating_node_id": n_g2,
        },
    )
    assert resp.status_code in (400, 404)

    # Fake graph ID
    fake_id = str(uuid.uuid4())
    resp_fake = await client.post(f"/api/v1/graphs/{fake_id}/forecasts/cascade", json={})
    assert resp_fake.status_code == 404


@pytest.mark.asyncio
async def test_forecast_does_not_mutate_live_node_state(client):
    """
    CRITICAL: Creating a cascade forecast must NEVER mutate live Node state or health.
    Forecasts are simulation-only containers.
    """
    g = await _create_graph(client, "Immutability Grid")
    src = await _create_node(client, g, "Source", state="FAILED", health=0.0)
    tgt = await _create_node(client, g, "Target", state="NORMAL", health=0.95)
    await _create_dep(client, g, src, tgt, req=True)

    # Run forecast predicting target will fail
    resp = await client.post(
        f"/api/v1/graphs/{g}/forecasts/cascade",
        json={
            "initiating_node_id": src,
        },
    )
    assert resp.status_code == 201

    # Fetch live node directly from DB endpoint
    node_resp = await client.get(f"/api/v1/graphs/{g}/nodes")
    assert node_resp.status_code == 200
    live_nodes = {n["id"]: n for n in node_resp.json()}

    # Target node MUST still be NORMAL with health 0.95!
    assert live_nodes[tgt]["state"] == "NORMAL"
    assert live_nodes[tgt]["health"] == 0.95
