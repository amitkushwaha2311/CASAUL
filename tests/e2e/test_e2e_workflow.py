"""
CAUSAL — Phase 11 End-to-End Integration Test Suite
====================================================
17-step full system workflow validation.

Exercises the complete CAUSAL workflow from topology creation through unified
resilience assessment. Communicates over HTTP against a running or automatically-started
API server.

Usage:
  cd apps/api && .venv/Scripts/pytest ../../tests/e2e/test_e2e_workflow.py -v

The suite is:
  - Deterministic: consistent assertions matching the API contract
  - Idempotent: creates uniquely-named resources with UUID suffix
  - Non-destructive: operates on its own graph
  - Self-bootstrapping: starts uvicorn server process if port 8000 is not already running
"""

import os
import sys
import time
import uuid
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import pytest
import httpx

# ── Configuration ─────────────────────────────────────────────────────────────

BASE_URL = os.getenv("CAUSAL_API_URL", "http://127.0.0.1:8000")
ADMIN_EMAIL = os.getenv("CAUSAL_ADMIN_EMAIL", "admin@causal.local")
ADMIN_PASS = os.getenv("CAUSAL_ADMIN_PASS", "AdminPassword123!")
TIMEOUT = 30.0

RUN_ID = uuid.uuid4().hex[:8]
GRAPH_NAME = f"e2e-infra-{RUN_ID}"

state: dict = {}


# ── Server Lifecycle Management Fixture ───────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def ensure_api_server():
    """
    Ensure the API server is responding on BASE_URL.
    If not already running, spawn a dedicated uvicorn subprocess and shut it down cleanly after tests.
    """
    # Check if server is already reachable
    try:
        r = httpx.get(f"{BASE_URL}/api/v1/health/live", timeout=2.0)
        if r.status_code == 200:
            yield
            return
    except Exception:
        pass

    # Find apps/api directory
    current_file = Path(__file__).resolve()
    repo_root = current_file.parents[2]
    api_dir = repo_root / "apps" / "api"
    python_bin = sys.executable

    # Spawn uvicorn process
    proc = subprocess.Popen(
        [python_bin, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=str(api_dir),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # Wait for server to become responsive
    deadline = time.time() + 15.0
    server_ready = False
    while time.time() < deadline:
        try:
            r = httpx.get(f"{BASE_URL}/api/v1/health/live", timeout=1.0)
            if r.status_code == 200:
                server_ready = True
                break
        except Exception:
            time.sleep(0.5)

    if not server_ready:
        proc.terminate()
        stdout, stderr = proc.communicate(timeout=5)
        raise RuntimeError(
            f"Failed to start E2E test server on {BASE_URL}.\nStdout: {stdout.decode()}\nStderr: {stderr.decode()}"
        )

    try:
        yield
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


# ── Helpers ───────────────────────────────────────────────────────────────────

def api(method: str, path: str, *, token: str | None = None, **kwargs) -> httpx.Response:
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    url = f"{BASE_URL}{path}"
    resp = httpx.request(method, url, headers=headers, timeout=TIMEOUT, **kwargs)
    return resp


def require_200(resp: httpx.Response, label: str) -> dict:
    assert resp.status_code == 200, (
        f"[{label}] Expected 200, got {resp.status_code}: {resp.text}"
    )
    return resp.json()


def require_201(resp: httpx.Response, label: str) -> dict:
    assert resp.status_code == 201, (
        f"[{label}] Expected 201, got {resp.status_code}: {resp.text}"
    )
    return resp.json()


# ── Step 1: Health / Liveness ─────────────────────────────────────────────────

def test_step_01_health_live():
    """API liveness endpoint must return status 'alive'."""
    resp = api("GET", "/api/v1/health/live")
    assert resp.status_code == 200, f"Health live failed: {resp.text}"
    data = resp.json()
    assert data.get("status") == "alive", f"Unexpected liveness status: {data}"


# ── Step 2: Health / Readiness ────────────────────────────────────────────────

def test_step_02_health_ready():
    """API readiness endpoint must report status."""
    resp = api("GET", "/api/v1/health/ready")
    assert resp.status_code in (200, 503), f"Unexpected status: {resp.status_code}"
    data = resp.json()
    assert "status" in data


# ── Step 3: Authentication ────────────────────────────────────────────────────

def test_step_03_authenticate():
    """Obtain JWT access token for admin user via POST /api/v1/auth/login."""
    resp = api("POST", "/api/v1/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASS,
    })
    assert resp.status_code == 200, f"Auth failed: {resp.text}"
    token_data = resp.json()
    assert "access_token" in token_data
    assert token_data.get("token_type") == "bearer"
    state["token"] = token_data["access_token"]


# ── Step 4: Verify Identity ───────────────────────────────────────────────────

def test_step_04_auth_me():
    """Authenticated /auth/me endpoint must return admin profile."""
    assert "token" in state, "Auth step must run first"
    resp = api("GET", "/api/v1/auth/me", token=state["token"])
    data = require_200(resp, "auth/me")
    assert data.get("role") == "ADMIN", f"Expected ADMIN role, got: {data.get('role')}"
    assert data.get("email") == ADMIN_EMAIL
    state["user_id"] = data.get("id")


# ── Step 5: Graph Creation ────────────────────────────────────────────────────

def test_step_05_create_graph():
    """Create a named infrastructure topology graph."""
    assert "token" in state
    resp = api("POST", "/api/v1/graphs", token=state["token"], json={
        "name": GRAPH_NAME,
        "description": f"E2E test graph {RUN_ID}",
        "domain": "test",
        "metadata": {"e2e": True, "run_id": RUN_ID},
    })
    data = require_201(resp, "create_graph")
    assert data.get("name") == GRAPH_NAME
    state["graph_id"] = data["id"]


# ── Step 6: Add Nodes ─────────────────────────────────────────────────────────

def test_step_06_add_nodes():
    """Add infrastructure nodes to the graph."""
    assert "graph_id" in state
    gid = state["graph_id"]
    tok = state["token"]

    nodes = [
        {"name": "router-01", "type": "network", "criticality": 0.9, "state": "NORMAL", "health": 1.0},
        {"name": "server-01", "type": "server", "criticality": 0.8, "state": "NORMAL", "health": 1.0},
        {"name": "db-01",     "type": "database", "criticality": 0.95, "state": "NORMAL", "health": 1.0},
    ]
    state["node_ids"] = []
    for n in nodes:
        resp = api("POST", f"/api/v1/graphs/{gid}/nodes", token=tok, json=n)
        assert resp.status_code == 201, f"Add node failed: {resp.text}"
        state["node_ids"].append(resp.json()["id"])

    assert len(state["node_ids"]) == 3


# ── Step 7: Add Dependencies (Edges) ──────────────────────────────────────────

def test_step_07_add_edges():
    """Add dependency edges between nodes."""
    assert "node_ids" in state
    gid = state["graph_id"]
    tok = state["token"]
    nids = state["node_ids"]

    deps = [
        {"source_node_id": nids[0], "target_node_id": nids[1], "dependency_type": "network", "strength": 0.9},
        {"source_node_id": nids[1], "target_node_id": nids[2], "dependency_type": "database", "strength": 0.95},
    ]
    for d in deps:
        resp = api("POST", f"/api/v1/graphs/{gid}/dependencies", token=tok, json=d)
        assert resp.status_code == 201, f"Add dependency failed: {resp.text}"


# ── Step 8: Record Infrastructure Event ───────────────────────────────────────

def test_step_08_create_event():
    """Record an infrastructure telemetry event."""
    assert "graph_id" in state
    gid = state["graph_id"]
    tok = state["token"]
    nid = state["node_ids"][0]

    resp = api("POST", f"/api/v1/graphs/{gid}/events", token=tok, json={
        "event_type": "FAILURE",
        "severity": "HIGH",
        "source": "e2e-sensor",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "description": f"E2E simulated failure on router-01 ({RUN_ID})",
        "confidence": 0.95,
        "evidence": {"raw_reading": "link_down", "node_id": nid},
        "metadata_": {"source": "e2e", "run_id": RUN_ID},
    })
    assert resp.status_code == 201, f"Create event failed: {resp.text}"
    state["event_id"] = resp.json()["id"]


# ── Step 9: State Snapshot & Baseline ─────────────────────────────────────────

def test_step_09_state_snapshot():
    """Capture a system baseline and a state snapshot."""
    assert "graph_id" in state
    gid = state["graph_id"]
    tok = state["token"]

    # Baseline capture
    resp_base = api("POST", f"/api/v1/graphs/{gid}/baselines", token=tok, json={
        "name": f"e2e-baseline-{RUN_ID}",
        "description": "E2E nominal baseline",
    })
    assert resp_base.status_code == 201, f"Baseline failed: {resp_base.text}"
    state["baseline_id"] = resp_base.json()["id"]

    # Snapshot capture
    resp_snap = api("POST", f"/api/v1/graphs/{gid}/snapshots", token=tok, json={
        "name": f"e2e-snapshot-{RUN_ID}",
        "snapshot_type": "LIVE",
    })
    assert resp_snap.status_code == 201, f"Snapshot failed: {resp_snap.text}"
    state["snapshot_id"] = resp_snap.json()["id"]


# ── Step 10: Causal Analysis Run ─────────────────────────────────────────────

def test_step_10_causal_run():
    """Execute causal hypothesis reasoning analysis."""
    assert "graph_id" in state
    gid = state["graph_id"]
    tok = state["token"]
    nid = state["node_ids"][0]

    resp = api("POST", f"/api/v1/graphs/{gid}/causal/analyze", token=tok, json={
        "target_node_id": nid,
        "max_hops": 2,
    })
    assert resp.status_code == 201, f"Causal analyze failed: {resp.text}"
    data = resp.json()
    assert "total_hypotheses_generated" in data
    state["causal_run_id"] = data["id"]


# ── Step 11: List Hypotheses ──────────────────────────────────────────────────

def test_step_11_list_hypotheses():
    """Retrieve evidence-backed causal hypotheses."""
    assert "causal_run_id" in state
    gid = state["graph_id"]
    tok = state["token"]

    resp = api("GET", f"/api/v1/graphs/{gid}/causal/hypotheses", token=tok)
    assert resp.status_code == 200, f"List hypotheses failed: {resp.text}"
    data = resp.json()
    assert isinstance(data, list)


# ── Step 12: Cascade Forecast Run ────────────────────────────────────────────

def test_step_12_forecast_run():
    """Execute time-aware cascade failure forecast."""
    assert "graph_id" in state
    gid = state["graph_id"]
    tok = state["token"]
    nid = state["node_ids"][0]

    resp = api("POST", f"/api/v1/graphs/{gid}/forecasts/cascade", token=tok, json={
        "initiating_node_id": nid,
        "horizon_minutes": 60.0,
        "max_depth": 5,
        "simulation_mode": "DETERMINISTIC",
    })
    assert resp.status_code == 201, f"Cascade forecast failed: {resp.text}"
    state["forecast_id"] = resp.json()["id"]


# ── Step 13: Counterfactual Experiment ───────────────────────────────────────

def test_step_13_counterfactual():
    """Define a deterministic counterfactual simulation experiment."""
    assert "graph_id" in state
    gid = state["graph_id"]
    tok = state["token"]
    nid = state["node_ids"][0]

    resp = api("POST", f"/api/v1/graphs/{gid}/counterfactuals", token=tok, json={
        "name": f"e2e-cf-{RUN_ID}",
        "description": "E2E counterfactual: restore router-01",
        "baseline_id": state.get("baseline_id"),
        "changes": [
            {
                "target_type": "NODE",
                "target_id": nid,
                "change_type": "STATE_OVERRIDE",
                "proposed_value": "NORMAL",
                "rationale": "E2E test intervention restore",
            }
        ],
    })
    assert resp.status_code == 201, f"Counterfactual failed: {resp.text}"
    state["cf_id"] = resp.json()["id"]


# ── Step 14: Recommendation Run ──────────────────────────────────────────────

def test_step_14_recommendation_run():
    """Create a safety-constrained intervention recommendation run."""
    assert "graph_id" in state
    gid = state["graph_id"]
    tok = state["token"]

    resp = api("POST", f"/api/v1/graphs/{gid}/recommendations/runs", token=tok, json={
        "name": f"e2e-rec-{RUN_ID}",
        "description": "E2E recommendation run",
        "baseline_id": state.get("baseline_id"),
        "max_candidates": 5,
        "horizon_minutes": 60.0,
    })
    assert resp.status_code == 201, f"Recommendation run failed: {resp.text}"
    state["rec_run_id"] = resp.json()["id"]


# ── Step 15: Security Audit Trail ────────────────────────────────────────────

def test_step_15_audit_trail():
    """Verify security audit log records authenticated actions.

    The audit-log endpoint lives on users_router (prefix /users), so the
    full path is /api/v1/users/audit-logs.  It is ADMIN-only.
    """
    assert "token" in state
    resp = api("GET", "/api/v1/users/audit-logs", token=state["token"])
    assert resp.status_code == 200, f"Audit log failed: {resp.text}"
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0, "Expected at least one audit record (login event)"


# ── Step 16: Unified Resilience Assessment ───────────────────────────────────

def test_step_16_assessment():
    """Create and retrieve a unified resilience assessment."""
    assert "graph_id" in state
    gid = state["graph_id"]
    tok = state["token"]

    resp = api("POST", f"/api/v1/graphs/{gid}/assessments", token=tok, json={
        "name": f"e2e-assessment-{RUN_ID}",
        "description": f"E2E unified assessment ({RUN_ID})",
        "baseline_id": state.get("baseline_id"),
        "causal_run_id": state.get("causal_run_id"),
        "forecast_run_id": state.get("forecast_id"),
        "counterfactual_experiment_id": state.get("cf_id"),
        "recommendation_run_id": state.get("rec_run_id"),
    })
    assert resp.status_code == 201, f"Assessment create failed: {resp.text}"
    aid = resp.json()["id"]
    state["assessment_id"] = aid

    # Retrieve the assembled assessment detail
    resp2 = api("GET", f"/api/v1/graphs/{gid}/assessments/{aid}", token=tok)
    data = require_200(resp2, "get_assessment")
    assert data.get("id") == aid
    assert data.get("graph_id") == gid


# ── Step 17: Unauthorized Access Check (RBAC) ────────────────────────────────

def test_step_17_rbac_enforcement():
    """Confirm unauthenticated requests to auth-protected endpoints are rejected.

    /api/v1/auth/me requires a valid JWT (require_active_user dependency).
    Issuing the request without a token must produce 401 Unauthorized.

    Note: graph endpoints (/api/v1/graphs/*) were intentionally left open in
    Phase 2 and do not enforce authentication themselves; auth-level RBAC is
    enforced on sensitive management and audit endpoints.
    """
    resp = api("GET", "/api/v1/auth/me")  # No token — must return 401
    assert resp.status_code == 401, (
        f"Expected 401 for unauthenticated /auth/me, got {resp.status_code}: {resp.text}"
    )
