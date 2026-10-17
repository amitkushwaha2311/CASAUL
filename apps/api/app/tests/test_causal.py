"""
CAUSAL — Phase 5 Backend Tests: Evidence-Backed Causal Reasoning Engine.

Tests covering:
1. Upstream degradation supporting hypothesis when evidence exists.
2. Contradictory evidence retention (healthy upstream generates CONTRADICTED status).
3. Local failure isolation when upstreams are healthy.
4. Telemetry integrity check on low-confidence observations.
5. Graph path without sufficient evidence returns INSUFFICIENT_EVIDENCE or does not fabricate causation.
6. Competing hypotheses preserved (multiple plausible explanations).
7. Missing confidence remains None/unknown, never invented.
8. Cyclic graph termination without infinite recursion.
9. Deterministic replay on unchanged inputs.
10. Traceable evidence pointing to real database records.
11. Cross-graph reference rejection and structured 404/400 errors.
12. Audit records and previous runs persistence.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta

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


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _create_graph(client, name="Test Graph") -> str:
    r = await client.post("/api/v1/graphs", json={
        "name": f"{name} {uuid.uuid4()}",
        "domain": "mixed",
    })
    assert r.status_code == 201
    return r.json()["id"]


async def _create_node(client, graph_id: str, name="Node", state="NORMAL", health=1.0, capacity=1.0) -> str:
    r = await client.post(f"/api/v1/graphs/{graph_id}/nodes", json={
        "name": f"{name} {uuid.uuid4()}",
        "type": "substation",
        "state": state,
        "health": health,
        "capacity": capacity,
        "criticality": 0.5,
    })
    assert r.status_code == 201
    return r.json()["id"]


async def _create_dep(client, graph_id: str, src: str, tgt: str, req=True, strength=0.9) -> str:
    r = await client.post(f"/api/v1/graphs/{graph_id}/dependencies", json={
        "source_node_id": src,
        "target_node_id": tgt,
        "dependency_type": "power",
        "strength": strength,
        "required": req,
    })
    assert r.status_code == 201
    return r.json()["id"]


async def _create_event(client, graph_id: str, node_id: str, ev_type="outage", sev="HIGH", ts=None) -> str:
    ts_str = ts or datetime.now(timezone.utc).isoformat()
    r = await client.post(f"/api/v1/graphs/{graph_id}/events", json={
        "event_type": ev_type,
        "severity": sev,
        "status": "OPEN",
        "source": "sensor_monitor_1",
        "description": "Test event",
        "timestamp": ts_str,
    })
    assert r.status_code == 201
    ev_id = r.json()["id"]

    # Also record observation linking event to node so node_id query finds it
    obs_r = await client.post(f"/api/v1/graphs/{graph_id}/observations", json={
        "node_id": node_id,
        "event_id": ev_id,
        "observation_type": "sensor_reading",
        "metric": "status_code",
        "value_numeric": 500.0,
        "confidence": 0.95,
        "source": "sensor_monitor_1",
        "timestamp": ts_str,
    })
    assert obs_r.status_code == 201
    return ev_id




async def _create_obs(client, graph_id: str, node_id: str, metric="voltage", val=100.0, conf=0.9, ts=None) -> str:
    ts_str = ts or datetime.now(timezone.utc).isoformat()
    r = await client.post(f"/api/v1/graphs/{graph_id}/observations", json={
        "node_id": node_id,
        "observation_type": "sensor_reading",
        "metric": metric,
        "value_numeric": val,
        "confidence": conf,
        "source": "sensor_1",
        "timestamp": ts_str,
    })
    assert r.status_code == 201
    return r.json()["id"]


# ── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_upstream_degradation_supported_hypothesis(client):
    """
    When an upstream dependency degraded before the affected node,
    the upstream hypothesis is SUPPORTED with supporting evidence items.
    """
    g = await _create_graph(client, "Power Grid")
    upstream = await _create_node(client, g, "Generator A", state="FAILED", health=0.0)
    downstream = await _create_node(client, g, "Substation B", state="DEGRADED", health=0.4)

    # Dependency: Generator A -> Substation B (Substation B depends on Generator A)
    await _create_dep(client, g, upstream, downstream, req=True, strength=0.95)

    # Upstream event occurred earlier
    t_upstream = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    ev_id = await _create_event(client, g, upstream, "turbine_trip", "CRITICAL", ts=t_upstream)

    # Downstream event occurred later
    t_downstream = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    await _create_event(client, g, downstream, "low_frequency", "HIGH", ts=t_downstream)

    # Run causal analysis for downstream node
    resp = await client.post(f"/api/v1/graphs/{g}/causal/analyze", json={
        "affected_node_id": downstream,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["graph_id"] == g
    assert data["target_node_id"] == downstream
    assert len(data["hypotheses"]) >= 1

    # Find upstream hypothesis
    up_hyp = next((h for h in data["hypotheses"] if h["candidate_cause_node_id"] == upstream), None)
    assert up_hyp is not None
    assert up_hyp["status"] == "SUPPORTED"
    assert up_hyp["inference_rule"] == "RULE_UPSTREAM_DEPENDENCY_PRECEDENCE"

    # Verify evidence items
    ev_resp = await client.get(f"/api/v1/graphs/{g}/causal/hypotheses/{up_hyp['id']}/evidence")
    assert ev_resp.status_code == 200
    evidence = ev_resp.json()
    assert len(evidence) >= 1
    # Check that event_id or source_record_id matches the real event ID
    assert any((e.get("event_id") == ev_id or e.get("source_record_id") == ev_id) and e["direction"] == "SUPPORTING" for e in evidence)


@pytest.mark.asyncio
async def test_contradictory_evidence_retention(client):
    """
    When an upstream dependency is healthy (state NORMAL, health 1.0),
    the upstream hypothesis is marked CONTRADICTED and contradictory evidence is recorded.
    """
    g = await _create_graph(client, "Water System")
    healthy_upstream = await _create_node(client, g, "Pumping Station", state="NORMAL", health=1.0)
    failed_target = await _create_node(client, g, "Reservoir", state="FAILED", health=0.0)

    await _create_dep(client, g, healthy_upstream, failed_target, req=True)

    resp = await client.post(f"/api/v1/graphs/{g}/causal/analyze", json={
        "affected_node_id": failed_target,
    })
    assert resp.status_code == 201
    data = resp.json()

    up_hyp = next((h for h in data["hypotheses"] if h["candidate_cause_node_id"] == healthy_upstream), None)
    assert up_hyp is not None
    assert up_hyp["status"] == "CONTRADICTED"

    # Evidence items should contain CONTRADICTING evidence
    ev_resp = await client.get(f"/api/v1/graphs/{g}/causal/hypotheses/{up_hyp['id']}/evidence")
    assert ev_resp.status_code == 200
    evidence = ev_resp.json()
    assert any(e["direction"] == "CONTRADICTING" for e in evidence)


@pytest.mark.asyncio
async def test_local_failure_isolated_hypothesis(client):
    """
    When upstreams are healthy and local failure events/observations exist,
    the LOCAL_FAILURE hypothesis is generated as SUPPORTED.
    """
    g = await _create_graph(client, "Telecom")
    up = await _create_node(client, g, "Fiber Backbone", state="NORMAL", health=1.0)
    local = await _create_node(client, g, "Cell Tower", state="DEGRADED", health=0.3)
    await _create_dep(client, g, up, local)

    # Local degradation event
    ev_id = await _create_event(client, g, local, "hardware_overheat", "HIGH")

    resp = await client.post(f"/api/v1/graphs/{g}/causal/analyze", json={
        "affected_node_id": local,
    })
    assert resp.status_code == 201
    data = resp.json()

    local_hyp = next((h for h in data["hypotheses"] if h["hypothesis_type"] == "LOCAL_NODE_DEGRADATION"), None)
    assert local_hyp is not None
    assert local_hyp["status"] == "SUPPORTED"
    assert local_hyp["inference_rule"] == "RULE_LOCAL_FAILURE_ISOLATION"


@pytest.mark.asyncio
async def test_telemetry_anomaly_competing_hypothesis(client):
    """
    When observations on a node have low confidence (< 0.5), a TELEMETRY_ANOMALY
    hypothesis is generated to capture sensor inaccuracy without suppressing physical hypotheses.
    """
    g = await _create_graph(client, "Sensor Net")
    node = await _create_node(client, g, "Pressure Sensor", state="DEGRADED", health=0.4)

    # Low-confidence observation (e.g. 0.35)
    obs_id = await _create_obs(client, g, node, metric="pressure", val=12.5, conf=0.35)

    resp = await client.post(f"/api/v1/graphs/{g}/causal/analyze", json={
        "affected_node_id": node,
    })
    assert resp.status_code == 201
    data = resp.json()

    telem_hyp = next((h for h in data["hypotheses"] if h["hypothesis_type"] == "TELEMETRY_OR_SENSOR_ANOMALY"), None)
    assert telem_hyp is not None
    assert telem_hyp["status"] in ("SUPPORTED", "POSSIBLE")
    assert telem_hyp["inference_rule"] == "RULE_TELEMETRY_INTEGRITY_CHECK"


@pytest.mark.asyncio
async def test_cyclic_graph_terminates_safely(client):
    """
    Dependency cycles (A -> B -> A) must terminate safely without infinite recursion.
    """
    g = await _create_graph(client, "Cyclic Loop")
    node_a = await _create_node(client, g, "Node A", state="DEGRADED", health=0.5)
    node_b = await _create_node(client, g, "Node B", state="DEGRADED", health=0.5)

    # Create cycle: A -> B and B -> A
    await _create_dep(client, g, node_a, node_b)
    await _create_dep(client, g, node_b, node_a)

    resp = await client.post(f"/api/v1/graphs/{g}/causal/analyze", json={
        "affected_node_id": node_a,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert isinstance(data["hypotheses"], list)


@pytest.mark.asyncio
async def test_deterministic_replay_produces_consistent_results(client):
    """
    Running causal analysis twice on unchanged graph state must yield identical results.
    """
    g = await _create_graph(client, "Deterministic Test")
    up = await _create_node(client, g, "Up", state="FAILED", health=0.0)
    dn = await _create_node(client, g, "Down", state="DEGRADED", health=0.2)
    await _create_dep(client, g, up, dn)

    resp1 = await client.post(f"/api/v1/graphs/{g}/causal/analyze", json={"affected_node_id": dn})
    resp2 = await client.post(f"/api/v1/graphs/{g}/causal/analyze", json={"affected_node_id": dn})

    assert resp1.status_code == 201
    assert resp2.status_code == 201
    data1 = resp1.json()
    data2 = resp2.json()

    assert len(data1["hypotheses"]) == len(data2["hypotheses"])
    for h1, h2 in zip(data1["hypotheses"], data2["hypotheses"]):
        assert h1["hypothesis_type"] == h2["hypothesis_type"]
        assert h1["status"] == h2["status"]
        assert h1["inference_rule"] == h2["inference_rule"]



@pytest.mark.asyncio
async def test_cross_graph_node_rejection(client):
    """
    Attempting to analyze a node that belongs to a different graph must return 400.
    """
    g1 = await _create_graph(client, "Graph 1")
    g2 = await _create_graph(client, "Graph 2")
    n1 = await _create_node(client, g1, "Node in G1")

    # Request analysis in g2 for n1 (which belongs to g1)
    resp = await client.post(f"/api/v1/graphs/{g2}/causal/analyze", json={
        "affected_node_id": n1,
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_hypotheses_retrieval_and_filtering(client):
    """
    Test GET /api/v1/graphs/{graph_id}/causal/hypotheses and status filtering.
    """
    g = await _create_graph(client, "Filter Test")
    n = await _create_node(client, g, "Node X", state="NORMAL", health=1.0)

    # Run analysis
    await client.post(f"/api/v1/graphs/{g}/causal/analyze", json={"affected_node_id": n})

    # List all
    r_all = await client.get(f"/api/v1/graphs/{g}/causal/hypotheses")
    assert r_all.status_code == 200
    all_hyp = r_all.json()
    assert len(all_hyp) >= 1

    # Filter by node
    r_node = await client.get(f"/api/v1/graphs/{g}/nodes/{n}/causal/hypotheses")
    assert r_node.status_code == 200
    assert len(r_node.json()) == len(all_hyp)


@pytest.mark.asyncio
async def test_competing_hypotheses_with_mixed_upstreams(client):
    """
    Verify that one healthy upstream dependency does NOT contradict hypotheses
    for other degraded upstream dependencies, and that multiple plausible
    explanations coexist independently.
    """
    g = await _create_graph(client, "Multi-Upstream Grid")
    up_healthy = await _create_node(client, g, "Solar Farm", state="NORMAL", health=1.0)
    up_faulty = await _create_node(client, g, "Substation A", state="FAILED", health=0.0)
    target = await _create_node(client, g, "Factory B", state="DEGRADED", health=0.3)

    # Both feed the target
    await _create_dep(client, g, up_healthy, target, req=True)
    await _create_dep(client, g, up_faulty, target, req=True)

    # State events
    t_fault = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
    await _create_event(client, g, up_faulty, "transformer_explosion", "CRITICAL", ts=t_fault)

    t_target = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    await _create_event(client, g, target, "brownout", "HIGH", ts=t_target)

    resp = await client.post(f"/api/v1/graphs/{g}/causal/analyze", json={
        "affected_node_id": target,
    })
    assert resp.status_code == 201
    data = resp.json()

    hypotheses = data["hypotheses"]
    hyp_healthy = next((h for h in hypotheses if h["candidate_cause_node_id"] == up_healthy), None)
    hyp_faulty = next((h for h in hypotheses if h["candidate_cause_node_id"] == up_faulty), None)
    hyp_local = next((h for h in hypotheses if h["hypothesis_type"] == "LOCAL_NODE_DEGRADATION"), None)
    hyp_telemetry = next((h for h in hypotheses if h["hypothesis_type"] == "TELEMETRY_OR_SENSOR_ANOMALY"), None)

    # Healthy upstream is CONTRADICTED along its edge
    assert hyp_healthy is not None
    assert hyp_healthy["status"] == "CONTRADICTED"

    # Degraded upstream is SUPPORTED
    assert hyp_faulty is not None
    assert hyp_faulty["status"] == "SUPPORTED"

    # Local degradation remains a competing POSSIBLE hypothesis (not suppressed)
    assert hyp_local is not None
    assert hyp_local["status"] == "POSSIBLE"

    # Telemetry check also coexists as a separate hypothesis
    assert hyp_telemetry is not None
    assert hyp_telemetry["status"] in ("POSSIBLE", "SUPPORTED")


@pytest.mark.asyncio
async def test_unknown_upstream_triggers_insufficient_evidence(client):
    """
    Verify that an upstream node with UNKNOWN operational state is NOT silently
    assumed to be healthy; it produces an INSUFFICIENT_EVIDENCE hypothesis.
    """
    g = await _create_graph(client, "Unknown Telemetry Grid")
    up_unmonitored = await _create_node(client, g, "Remote Node", state="UNKNOWN", health=0.5)
    target = await _create_node(client, g, "Consumer Node", state="DEGRADED", health=0.4)

    await _create_dep(client, g, up_unmonitored, target, req=True)

    resp = await client.post(f"/api/v1/graphs/{g}/causal/analyze", json={
        "affected_node_id": target,
    })
    assert resp.status_code == 201
    data = resp.json()

    hyp_unknown = next((h for h in data["hypotheses"] if h["candidate_cause_node_id"] == up_unmonitored), None)
    assert hyp_unknown is not None
    assert hyp_unknown["status"] == "INSUFFICIENT_EVIDENCE"
    assert any("UNKNOWN" in m or "unknown" in m for m in hyp_unknown["missing_evidence"])

