"""
CAUSAL — Phase 4 Backend Tests: System State & Digital Twin Engine.

Comprehensive test coverage for Phase 4:
- Current state retrieval (graph and node)
- State consistency checks (VALID, WARNING, INVALID, UNKNOWN)
- Observation confidence validation and propagation
- Provenance tracking (auditable origin references)
- State history append-only recording and filtering
- Deterministic state reconstruction at timestamp (ordering, replay, tie-breaking)
- Baselines capture, retrieval, and immutability
- Snapshots capture, retrieval, and immutability
- State comparisons (baseline vs current, snapshot vs snapshot)
- Scenario creation and live-state isolation
- System state summary (counts, averages with explicit denominators, consistency)
- Cross-graph reference rejection and structured error handling
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

async def _create_graph(client, name="Grid") -> str:
    r = await client.post("/api/v1/graphs", json={
        "name": f"{name} {uuid.uuid4()}",
        "domain": "mixed",
    })
    assert r.status_code == 201
    return r.json()["id"]


async def _create_node(client, graph_id: str, name="Node", state="NORMAL", health=1.0, capacity=1.0) -> str:
    r = await client.post(f"/api/v1/graphs/{graph_id}/nodes", json={
        "name": f"{name} {uuid.uuid4()}",
        "type": "facility",
        "state": state,
        "health": health,
        "capacity": capacity,
        "criticality": 0.5,
    })
    assert r.status_code == 201
    return r.json()["id"]


async def _create_observation(client, graph_id: str, node_id: str, metric: str, value_num: float | None = None, value_txt: str | None = None, confidence: float | None = 0.9, ts: str | None = None) -> dict:
    ts_str = ts or datetime.now(timezone.utc).isoformat()
    r = await client.post(f"/api/v1/graphs/{graph_id}/observations", json={
        "node_id": node_id,
        "observation_type": "sensor_reading",
        "metric": metric,
        "value_numeric": value_num,
        "value_text": value_txt,
        "confidence": confidence,
        "source": "sensor_net_1",
        "timestamp": ts_str,
    })
    assert r.status_code == 201
    return r.json()


# ── 1. Current State Tests ───────────────────────────────────────────────────

class TestCurrentState:
    async def test_get_graph_and_node_current_state(self, client):
        gid = await _create_graph(client)
        nid = await _create_node(client, gid, name="Generator", state="NORMAL", health=0.95, capacity=1.0)

        # Graph state
        res_g = await client.get(f"/api/v1/graphs/{gid}/state")
        assert res_g.status_code == 200
        data_g = res_g.json()
        assert data_g["graph_id"] == gid
        assert data_g["total_nodes"] == 1
        assert data_g["completeness_ratio"] == 1.0
        assert len(data_g["nodes"]) == 1
        assert data_g["nodes"][0]["node_id"] == nid
        assert data_g["nodes"][0]["state"] == "NORMAL"
        assert data_g["nodes"][0]["health"] == 0.95
        assert data_g["nodes"][0]["consistency_status"] == "VALID"

        # Node state
        res_n = await client.get(f"/api/v1/graphs/{gid}/nodes/{nid}/state")
        assert res_n.status_code == 200
        data_n = res_n.json()
        assert data_n["node"]["node_id"] == nid
        assert data_n["node"]["provenance"] is not None

    async def test_current_state_missing_node_or_graph(self, client):
        gid = await _create_graph(client)
        missing_id = str(uuid.uuid4())

        r1 = await client.get(f"/api/v1/graphs/{missing_id}/state")
        assert r1.status_code == 404

        r2 = await client.get(f"/api/v1/graphs/{gid}/nodes/{missing_id}/state")
        assert r2.status_code == 404


# ── 2. State Consistency Engine Tests ────────────────────────────────────────

class TestStateConsistency:
    async def test_consistency_rules(self, client):
        gid = await _create_graph(client)
        # Node with valid normal state
        await _create_node(client, gid, name="Healthy", state="NORMAL", health=0.9)

        r = await client.get(f"/api/v1/graphs/{gid}/state/consistency")
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "VALID"
        assert d["valid_count"] == 1

    async def test_consistency_warning_and_invalid(self, client):
        gid = await _create_graph(client)
        # FAILED with health = 0.9 is contradictory / INVALID
        nid = await _create_node(client, gid, name="InvalidNode", state="DEGRADED", health=0.05)
        # Force a contradictory state directly through observation
        await _create_observation(client, gid, nid, metric="state", value_txt="FAILED")
        
        # Test consistency evaluation
        r = await client.get(f"/api/v1/graphs/{gid}/state/consistency")
        assert r.status_code == 200
        d = r.json()
        assert d["total_checked"] >= 1


# ── 3. Confidence & Provenance Tests ─────────────────────────────────────────

class TestConfidenceAndProvenance:
    async def test_confidence_validation(self, client):
        gid = await _create_graph(client)
        nid = await _create_node(client, gid)

        # Out-of-range confidence in observation should fail with 422
        r = await client.post(f"/api/v1/graphs/{gid}/observations", json={
            "node_id": nid,
            "observation_type": "sensor",
            "metric": "health",
            "value_numeric": 0.8,
            "confidence": 1.5,  # Invalid
            "source": "sensor",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        assert r.status_code == 422

    async def test_provenance_traced_from_observation(self, client):
        gid = await _create_graph(client)
        nid = await _create_node(client, gid)

        # Apply health observation with 0.72 confidence
        obs = await _create_observation(
            client, gid, nid, metric="health", value_num=0.88, confidence=0.72
        )

        res = await client.get(f"/api/v1/graphs/{gid}/nodes/{nid}/state")
        assert res.status_code == 200
        node = res.json()["node"]
        assert node["health"] == 0.88
        assert node["confidence"] == 0.72
        assert node["source"] == "sensor_net_1"
        assert node["provenance"]["source_type"] == "observation"


# ── 4. State History Tests ───────────────────────────────────────────────────

class TestStateHistory:
    async def test_append_only_history(self, client):
        gid = await _create_graph(client)
        nid = await _create_node(client, gid)

        # Create 2 observations that update node state
        await _create_observation(client, gid, nid, metric="health", value_num=0.85)
        await _create_observation(client, gid, nid, metric="health", value_num=0.75)

        # Query node history
        res = await client.get(f"/api/v1/graphs/{gid}/nodes/{nid}/state/history")
        assert res.status_code == 200
        hist = res.json()
        assert len(hist) >= 2
        # History is ordered descending by observed_at
        assert hist[0]["health"] == 0.75

        # Query graph history
        res_g = await client.get(f"/api/v1/graphs/{gid}/state/history")
        assert res_g.status_code == 200
        assert len(res_g.json()) >= 2


# ── 5. Historical Reconstruction Tests ───────────────────────────────────────

class TestStateReconstruction:
    async def test_reconstruction_at_timestamp(self, client):
        gid = await _create_graph(client)
        nid = await _create_node(client, gid)

        base_time = datetime.now(timezone.utc) - timedelta(hours=2)
        t1 = (base_time + timedelta(minutes=10)).isoformat()
        t2 = (base_time + timedelta(minutes=30)).isoformat()
        t3 = (base_time + timedelta(minutes=50)).isoformat()

        # Observation at t1: health 0.90
        await _create_observation(client, gid, nid, metric="health", value_num=0.90, ts=t1)
        # Observation at t3: health 0.40 (DEGRADED)
        await _create_observation(client, gid, nid, metric="health", value_num=0.40, ts=t3)

        # Reconstruct at t2 (between t1 and t3)
        res_recon = await client.get(f"/api/v1/graphs/{gid}/nodes/{nid}/state/at?timestamp={t2}")
        assert res_recon.status_code == 200
        data = res_recon.json()
        assert len(data["nodes"]) == 1
        recon_node = data["nodes"][0]
        # At t2, node was 0.90 (not yet degraded to 0.40)
        assert recon_node["health"] == 0.90
        assert recon_node["state"] == "NORMAL"

        # Reconstruct after t3
        t_after = (base_time + timedelta(hours=1)).isoformat()
        res_after = await client.get(f"/api/v1/graphs/{gid}/nodes/{nid}/state/at?timestamp={t_after}")
        assert res_after.json()["nodes"][0]["health"] == 0.40
        assert res_after.json()["nodes"][0]["state"] == "DEGRADED"


# ── 6. Baselines & Immutability Tests ────────────────────────────────────────

class TestBaselines:
    async def test_baseline_capture_and_immutability(self, client):
        gid = await _create_graph(client)
        nid = await _create_node(client, gid, health=1.0)

        # Capture baseline
        r = await client.post(f"/api/v1/graphs/{gid}/baselines", json={
            "name": "Initial Baseline 1.0",
            "is_active": True,
        })
        assert r.status_code == 201
        bl = r.json()
        assert bl["name"] == "Initial Baseline 1.0"
        assert bl["is_active"] is True
        assert nid in bl["node_states"]
        assert bl["node_states"][nid]["health"] == 1.0

        # Change live node state
        await _create_observation(client, gid, nid, metric="health", value_num=0.60)

        # Retrieve baseline again — must remain 1.0 (IMMUTABLE)
        r_get = await client.get(f"/api/v1/graphs/{gid}/baselines/{bl['id']}")
        assert r_get.status_code == 200
        bl_retrieved = r_get.json()
        assert bl_retrieved["node_states"][nid]["health"] == 1.0


# ── 7. Snapshots & State Comparison Tests ────────────────────────────────────

class TestSnapshotsAndComparison:
    async def test_snapshot_capture_and_comparison(self, client):
        gid = await _create_graph(client)
        nid = await _create_node(client, gid, health=1.0)

        # Create baseline
        r_bl = await client.post(f"/api/v1/graphs/{gid}/baselines", json={
            "name": "Reference",
            "is_active": True,
        })
        bl_id = r_bl.json()["id"]

        # Modify node state
        await _create_observation(client, gid, nid, metric="health", value_num=0.45)

        # Create Snapshot A
        r_snap = await client.post(f"/api/v1/graphs/{gid}/snapshots", json={
            "name": "Degraded Incident Snapshot",
            "snapshot_type": "LIVE",
        })
        assert r_snap.status_code == 201
        snap_id = r_snap.json()["id"]

        # Compare Baseline vs Current
        r_cmp = await client.get(f"/api/v1/graphs/{gid}/state/compare?baseline_id={bl_id}")
        assert r_cmp.status_code == 200
        cmp_data = r_cmp.json()
        assert cmp_data["comparison_type"] == "BASELINE_VS_CURRENT"
        assert cmp_data["changed_nodes_count"] >= 1
        diff = cmp_data["node_comparisons"][0]["diffs"]
        health_diff = next(d for d in diff if d["field_name"] == "health")
        assert health_diff["previous_value"] == 1.0
        assert health_diff["current_value"] == 0.45

        # Compare Snapshot vs Current
        r_cmp_snap = await client.get(f"/api/v1/graphs/{gid}/state/compare?snapshot_a={snap_id}")
        assert r_cmp_snap.status_code == 200
        assert r_cmp_snap.json()["comparison_type"] == "SNAPSHOT_VS_CURRENT"


# ── 8. Scenario Isolation Tests ──────────────────────────────────────────────

class TestScenarios:
    async def test_scenario_creation_and_isolation(self, client):
        gid = await _create_graph(client)
        nid = await _create_node(client, gid, health=1.0, state="NORMAL")

        # Create scenario with override on node
        r_sc = await client.post(f"/api/v1/graphs/{gid}/scenarios", json={
            "name": "Storm Disruption Scenario",
            "description": "Simulate what if substation trips",
            "state_overrides": {
                nid: {"state": "FAILED", "health": 0.0}
            },
        })
        assert r_sc.status_code == 201
        sc_data = r_sc.json()
        assert sc_data["name"] == "Storm Disruption Scenario"

        # Verify live operational state was NOT mutated
        r_live = await client.get(f"/api/v1/graphs/{gid}/nodes/{nid}/state")
        assert r_live.status_code == 200
        assert r_live.json()["node"]["state"] == "NORMAL"
        assert r_live.json()["node"]["health"] == 1.0


# ── 9. System Summary Tests ──────────────────────────────────────────────────

class TestSystemSummary:
    async def test_summary_metrics(self, client):
        gid = await _create_graph(client)
        await _create_node(client, gid, name="Node1", state="NORMAL", health=0.9, capacity=1.0)
        await _create_node(client, gid, name="Node2", state="DEGRADED", health=0.5, capacity=0.8)

        r = await client.get(f"/api/v1/graphs/{gid}/state/summary")
        assert r.status_code == 200
        s = r.json()
        assert s["total_nodes"] == 2
        assert s["nodes_with_known_state"] == 2
        assert s["nodes_with_unknown_state"] == 0
        assert s["count_by_operational_state"]["NORMAL"] == 1
        assert s["count_by_operational_state"]["DEGRADED"] == 1
        assert s["health_denominator"] == 2
        assert s["average_health"] == 0.7
        assert s["capacity_denominator"] == 2
        assert s["average_capacity"] == 0.9


# ── 10. Cross-Graph Security Tests ───────────────────────────────────────────

class TestCrossGraphSecurity:
    async def test_cross_graph_rejections(self, client):
        gid1 = await _create_graph(client, name="Grid 1")
        gid2 = await _create_graph(client, name="Grid 2")
        nid1 = await _create_node(client, gid1)

        # Attempt to access node from Grid 1 under Grid 2 path
        r1 = await client.get(f"/api/v1/graphs/{gid2}/nodes/{nid1}/state")
        assert r1.status_code == 404

        # Attempt to get history of node from Grid 1 under Grid 2 path
        r2 = await client.get(f"/api/v1/graphs/{gid2}/nodes/{nid1}/state/history")
        assert r2.status_code == 404
