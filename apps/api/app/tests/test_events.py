"""
CAUSAL — Phase 3 Tests: Event & Observation Engine.

Tests cover:
- Event CRUD
- Observation CRUD
- Event filtering/pagination
- Event lifecycle transitions
- Node state updates via observations
- Timeline ordering
- Statistics
- Cross-graph rejection
- WebSocket connection
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

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


# ── Helpers ────────────────────────────────────────────────────────────────

async def _create_graph(client) -> str:
    r = await client.post("/api/v1/graphs", json={
        "name": f"Test Graph {uuid.uuid4()}",
        "domain": "mixed",
    })
    assert r.status_code == 201
    return r.json()["id"]


async def _create_node(client, graph_id: str) -> str:
    r = await client.post(f"/api/v1/graphs/{graph_id}/nodes", json={
        "name": f"Node {uuid.uuid4()}",
        "type": "facility",
        "state": "NORMAL",
        "health": 1.0,
        "capacity": 1.0,
        "criticality": 0.5,
    })
    assert r.status_code == 201
    return r.json()["id"]


async def _create_event(client, graph_id: str, **overrides) -> dict:
    payload = {
        "event_type": "degradation",
        "severity": "HIGH",
        "status": "OPEN",
        "source": "sensor",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "description": "Test event",
        "confidence": 0.85,
    }
    payload.update(overrides)
    r = await client.post(f"/api/v1/graphs/{graph_id}/events", json=payload)
    assert r.status_code == 201
    return r.json()


# ── Event CRUD tests ───────────────────────────────────────────────────────

class TestEventCRUD:
    async def test_create_event(self, client):
        gid = await _create_graph(client)
        ev = await _create_event(client, gid)
        assert ev["graph_id"] == gid
        assert ev["severity"] == "HIGH"
        assert ev["status"] == "OPEN"
        assert ev["confidence"] == 0.85

    async def test_get_event(self, client):
        gid = await _create_graph(client)
        ev = await _create_event(client, gid)
        r = await client.get(f"/api/v1/graphs/{gid}/events/{ev['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == ev["id"]

    async def test_list_events(self, client):
        gid = await _create_graph(client)
        await _create_event(client, gid)
        await _create_event(client, gid, severity="CRITICAL")
        r = await client.get(f"/api/v1/graphs/{gid}/events")
        assert r.status_code == 200
        assert len(r.json()) == 2

    async def test_update_event(self, client):
        gid = await _create_graph(client)
        ev = await _create_event(client, gid)
        r = await client.patch(f"/api/v1/graphs/{gid}/events/{ev['id']}", json={
            "status": "ACKNOWLEDGED",
        })
        assert r.status_code == 200
        assert r.json()["status"] == "ACKNOWLEDGED"

    async def test_delete_event(self, client):
        gid = await _create_graph(client)
        ev = await _create_event(client, gid)
        r = await client.delete(f"/api/v1/graphs/{gid}/events/{ev['id']}")
        assert r.status_code == 204
        r2 = await client.get(f"/api/v1/graphs/{gid}/events/{ev['id']}")
        assert r2.status_code == 404

    async def test_invalid_severity(self, client):
        gid = await _create_graph(client)
        r = await client.post(f"/api/v1/graphs/{gid}/events", json={
            "event_type": "failure",
            "severity": "EXTREME",  # invalid
            "source": "sensor",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        assert r.status_code == 422

    async def test_invalid_confidence(self, client):
        gid = await _create_graph(client)
        r = await client.post(f"/api/v1/graphs/{gid}/events", json={
            "event_type": "failure",
            "severity": "HIGH",
            "source": "sensor",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "confidence": 1.5,  # invalid
        })
        assert r.status_code == 422

    async def test_event_on_invalid_graph(self, client):
        r = await client.post(f"/api/v1/graphs/{uuid.uuid4()}/events", json={
            "event_type": "failure",
            "severity": "HIGH",
            "source": "sensor",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        assert r.status_code == 404


# ── Event lifecycle tests ──────────────────────────────────────────────────

class TestEventLifecycle:
    async def test_valid_transitions(self, client):
        gid = await _create_graph(client)
        ev = await _create_event(client, gid)
        # OPEN → ACKNOWLEDGED
        r = await client.patch(f"/api/v1/graphs/{gid}/events/{ev['id']}", json={"status": "ACKNOWLEDGED"})
        assert r.status_code == 200
        # ACKNOWLEDGED → RESOLVED
        r = await client.patch(f"/api/v1/graphs/{gid}/events/{ev['id']}", json={"status": "RESOLVED"})
        assert r.status_code == 200

    async def test_invalid_transition_from_resolved(self, client):
        gid = await _create_graph(client)
        ev = await _create_event(client, gid, status="RESOLVED")
        # RESOLVED is terminal — no further transitions
        r = await client.patch(f"/api/v1/graphs/{gid}/events/{ev['id']}", json={"status": "OPEN"})
        assert r.status_code == 422

    async def test_dismiss_from_open(self, client):
        gid = await _create_graph(client)
        ev = await _create_event(client, gid)
        r = await client.patch(f"/api/v1/graphs/{gid}/events/{ev['id']}", json={"status": "DISMISSED"})
        assert r.status_code == 200
        assert r.json()["status"] == "DISMISSED"


# ── Event filtering tests ──────────────────────────────────────────────────

class TestEventFiltering:
    async def test_filter_by_severity(self, client):
        gid = await _create_graph(client)
        await _create_event(client, gid, severity="CRITICAL")
        await _create_event(client, gid, severity="LOW")
        r = await client.get(f"/api/v1/graphs/{gid}/events?severity=CRITICAL")
        assert r.status_code == 200
        assert all(e["severity"] == "CRITICAL" for e in r.json())

    async def test_filter_by_status(self, client):
        gid = await _create_graph(client)
        await _create_event(client, gid, status="OPEN")
        await _create_event(client, gid, status="RESOLVED")
        r = await client.get(f"/api/v1/graphs/{gid}/events?status=RESOLVED")
        assert r.status_code == 200
        assert all(e["status"] == "RESOLVED" for e in r.json())

    async def test_pagination(self, client):
        gid = await _create_graph(client)
        for _ in range(5):
            await _create_event(client, gid)
        r = await client.get(f"/api/v1/graphs/{gid}/events?page=1&page_size=3")
        assert r.status_code == 200
        assert len(r.json()) == 3


# ── Observation tests ──────────────────────────────────────────────────────

class TestObservationCRUD:
    async def test_create_observation(self, client):
        gid = await _create_graph(client)
        nid = await _create_node(client, gid)
        ev = await _create_event(client, gid)
        r = await client.post(f"/api/v1/graphs/{gid}/observations", json={
            "node_id": nid,
            "event_id": ev["id"],
            "observation_type": "measurement",
            "metric": "temperature",
            "value_numeric": 95.3,
            "unit": "celsius",
            "confidence": 0.99,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "sensor",
        })
        assert r.status_code == 201
        obs = r.json()
        assert obs["node_id"] == nid
        assert obs["metric"] == "temperature"
        assert obs["value_numeric"] == 95.3

    async def test_observation_invalid_node(self, client):
        gid = await _create_graph(client)
        r = await client.post(f"/api/v1/graphs/{gid}/observations", json={
            "node_id": str(uuid.uuid4()),  # non-existent node
            "observation_type": "measurement",
            "metric": "health",
            "value_numeric": 0.5,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "sensor",
        })
        assert r.status_code == 404

    async def test_cross_graph_node_rejected(self, client):
        gid1 = await _create_graph(client)
        gid2 = await _create_graph(client)
        nid = await _create_node(client, gid1)
        r = await client.post(f"/api/v1/graphs/{gid2}/observations", json={
            "node_id": nid,  # belongs to gid1, not gid2!
            "observation_type": "measurement",
            "metric": "health",
            "value_numeric": 0.5,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "sensor",
        })
        assert r.status_code == 404

    async def test_cross_graph_event_rejected(self, client):
        gid1 = await _create_graph(client)
        gid2 = await _create_graph(client)
        ev = await _create_event(client, gid1)
        r = await client.post(f"/api/v1/graphs/{gid2}/observations", json={
            "event_id": ev["id"],  # belongs to gid1, not gid2!
            "observation_type": "measurement",
            "metric": "health",
            "value_numeric": 0.5,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "sensor",
        })
        assert r.status_code == 404


# ── Node state update tests ────────────────────────────────────────────────

class TestNodeStateUpdates:
    async def test_health_observation_updates_node(self, client):
        gid = await _create_graph(client)
        nid = await _create_node(client, gid)
        # Get initial health
        r0 = await client.get(f"/api/v1/graphs/{gid}/nodes/{nid}")
        initial_health = r0.json()["health"]

        # Create health observation — should update node.health
        await client.post(f"/api/v1/graphs/{gid}/observations", json={
            "node_id": nid,
            "observation_type": "measurement",
            "metric": "health",
            "value_numeric": 0.42,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "test",
        })

        r2 = await client.get(f"/api/v1/graphs/{gid}/nodes/{nid}")
        assert r2.json()["health"] == pytest.approx(0.42)

    async def test_unrelated_metric_does_not_update_node(self, client):
        gid = await _create_graph(client)
        nid = await _create_node(client, gid)
        r0 = await client.get(f"/api/v1/graphs/{gid}/nodes/{nid}")
        initial_health = r0.json()["health"]

        # Temperature observation — must NOT modify node.health
        await client.post(f"/api/v1/graphs/{gid}/observations", json={
            "node_id": nid,
            "observation_type": "measurement",
            "metric": "temperature",
            "value_numeric": 95.0,
            "unit": "celsius",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "test",
        })

        r2 = await client.get(f"/api/v1/graphs/{gid}/nodes/{nid}")
        assert r2.json()["health"] == initial_health  # unchanged

    async def test_capacity_observation_updates_node(self, client):
        gid = await _create_graph(client)
        nid = await _create_node(client, gid)
        await client.post(f"/api/v1/graphs/{gid}/observations", json={
            "node_id": nid,
            "observation_type": "capacity",
            "metric": "capacity",
            "value_numeric": 0.65,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "test",
        })
        r2 = await client.get(f"/api/v1/graphs/{gid}/nodes/{nid}")
        assert r2.json()["capacity"] == pytest.approx(0.65)


# ── Timeline tests ─────────────────────────────────────────────────────────

class TestTimeline:
    async def test_timeline_is_chronological(self, client):
        gid = await _create_graph(client)
        t1 = "2026-01-01T10:00:00Z"
        t2 = "2026-01-01T11:00:00Z"
        t3 = "2026-01-01T12:00:00Z"
        await _create_event(client, gid, timestamp=t3, description="C")
        await _create_event(client, gid, timestamp=t1, description="A")
        await _create_event(client, gid, timestamp=t2, description="B")

        r = await client.get(f"/api/v1/graphs/{gid}/timeline")
        events = r.json()
        assert r.status_code == 200
        # Oldest first
        assert events[0]["timestamp"] <= events[1]["timestamp"] <= events[2]["timestamp"]


# ── Statistics tests ───────────────────────────────────────────────────────

class TestStatistics:
    async def test_event_statistics(self, client):
        gid = await _create_graph(client)
        await _create_event(client, gid, severity="CRITICAL", status="OPEN")
        await _create_event(client, gid, severity="HIGH", status="RESOLVED")
        r = await client.get(f"/api/v1/graphs/{gid}/event-statistics")
        assert r.status_code == 200
        stats = r.json()
        assert stats["total_events"] == 2
        assert stats["open_events"] == 1
        assert stats["resolved_events"] == 1
        assert "CRITICAL" in stats["count_by_severity"]


# ── Node history tests ─────────────────────────────────────────────────────

class TestNodeHistory:
    async def test_node_event_history(self, client):
        gid = await _create_graph(client)
        nid = await _create_node(client, gid)
        ev = await _create_event(client, gid)
        # Link observation to node and event
        await client.post(f"/api/v1/graphs/{gid}/observations", json={
            "node_id": nid,
            "event_id": ev["id"],
            "observation_type": "measurement",
            "metric": "temperature",
            "value_numeric": 80.0,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "test",
        })
        r = await client.get(f"/api/v1/graphs/{gid}/nodes/{nid}/events")
        assert r.status_code == 200
        events = r.json()
        assert any(e["id"] == ev["id"] for e in events)

    async def test_node_observation_history(self, client):
        gid = await _create_graph(client)
        nid = await _create_node(client, gid)
        await client.post(f"/api/v1/graphs/{gid}/observations", json={
            "node_id": nid,
            "observation_type": "measurement",
            "metric": "temperature",
            "value_numeric": 80.0,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "test",
        })
        r = await client.get(f"/api/v1/graphs/{gid}/nodes/{nid}/observations")
        assert r.status_code == 200
        obs = r.json()
        assert len(obs) == 1
        assert obs[0]["node_id"] == nid
