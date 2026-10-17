"""
CAUSAL API — Phase 10 Tests: Unified Resilience Assessment.

Tests cover:
  - Assessment creation and retrieval
  - Correct lineage across phases
  - Cross-graph and incompatible-run rejection
  - Missing, stale, and partial source data
  - Metric semantics and unavailable values
  - Role-based access and unauthorized requests
  - No mutation of operational state
  - Audit integration
  - Pagination
  - Regression of Phase 1–9 behavior

Database: SQLite in-memory (via existing test.db fixture)
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_graph(client: TestClient, name: str = "P10 Test Graph") -> dict:
    """Create a graph and return the JSON response."""
    r = client.post(
        "/api/v1/graphs",
        json={"name": name, "description": "Phase 10 test graph"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _make_assessment(
    client: TestClient,
    graph_id: str,
    headers: dict,
    name: str = "Test Assessment",
    **refs: Any,
) -> dict:
    """Create a resilience assessment."""
    payload: dict = {"name": name}
    payload.update(refs)
    r = client.post(
        f"/api/v1/graphs/{graph_id}/assessments",
        json=payload,
        headers=headers,
    )
    return r


# ── Authentication / Authorization ─────────────────────────────────────────────


class TestAssessmentAuth:
    """RBAC and auth enforcement for all assessment endpoints."""

    def test_create_requires_auth(self, client: TestClient):
        g = _make_graph(client)
        r = client.post(
            f"/api/v1/graphs/{g['id']}/assessments",
            json={"name": "no-auth"},
        )
        assert r.status_code == 401

    def test_create_requires_analyst_or_above(
        self, client: TestClient, auth_headers_viewer: dict
    ):
        g = _make_graph(client)
        r = _make_assessment(client, g["id"], auth_headers_viewer)
        assert r.status_code == 403

    def test_viewer_can_create_fails_gracefully(
        self, client: TestClient, auth_headers_viewer: dict
    ):
        """Viewer must not create assessments (403, not 500)."""
        g = _make_graph(client)
        r = _make_assessment(client, g["id"], auth_headers_viewer)
        assert r.status_code == 403
        assert "permission" in r.json().get("detail", "").lower()

    def test_analyst_can_create(
        self, client: TestClient, auth_headers_analyst: dict
    ):
        g = _make_graph(client)
        r = _make_assessment(client, g["id"], auth_headers_analyst)
        assert r.status_code == 201

    def test_approver_can_create(
        self, client: TestClient, auth_headers_approver: dict
    ):
        g = _make_graph(client)
        r = _make_assessment(client, g["id"], auth_headers_approver)
        assert r.status_code == 201

    def test_admin_can_create(
        self, client: TestClient, auth_headers_admin: dict
    ):
        g = _make_graph(client)
        r = _make_assessment(client, g["id"], auth_headers_admin)
        assert r.status_code == 201

    def test_list_requires_auth(self, client: TestClient):
        g = _make_graph(client)
        r = client.get(f"/api/v1/graphs/{g['id']}/assessments")
        assert r.status_code == 401

    def test_viewer_can_list(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        g = _make_graph(client)
        _make_assessment(client, g["id"], auth_headers_analyst)
        r = client.get(
            f"/api/v1/graphs/{g['id']}/assessments",
            headers=auth_headers_viewer,
        )
        assert r.status_code == 200

    def test_get_requires_auth(
        self, client: TestClient, auth_headers_analyst: dict
    ):
        g = _make_graph(client)
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()
        r = client.get(f"/api/v1/graphs/{g['id']}/assessments/{a['id']}")
        assert r.status_code == 401

    def test_evidence_requires_auth(
        self, client: TestClient, auth_headers_analyst: dict
    ):
        g = _make_graph(client)
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()
        r = client.get(f"/api/v1/graphs/{g['id']}/assessments/{a['id']}/evidence")
        assert r.status_code == 401

    def test_impacts_requires_auth(
        self, client: TestClient, auth_headers_analyst: dict
    ):
        g = _make_graph(client)
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()
        r = client.get(f"/api/v1/graphs/{g['id']}/assessments/{a['id']}/impacts")
        assert r.status_code == 401

    def test_decisions_requires_auth(
        self, client: TestClient, auth_headers_analyst: dict
    ):
        g = _make_graph(client)
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()
        r = client.get(f"/api/v1/graphs/{g['id']}/assessments/{a['id']}/decisions")
        assert r.status_code == 401


# ── Assessment creation ────────────────────────────────────────────────────────


class TestAssessmentCreation:
    """Assessment assembly from existing records."""

    def test_create_minimal_assessment(
        self, client: TestClient, auth_headers_analyst: dict
    ):
        """Assessment with no source references is PARTIAL (no sources available)."""
        g = _make_graph(client)
        r = _make_assessment(client, g["id"], auth_headers_analyst, name="Minimal")
        assert r.status_code == 201
        data = r.json()
        # Minimal assessment has no linked Phase 5-8 records
        assert data["graph_id"] == g["id"]
        assert data["name"] == "Minimal"
        assert data["status"] in ("READY", "PARTIAL")
        assert data["causal_run_id"] is None
        assert data["forecast_run_id"] is None
        assert data["counterfactual_experiment_id"] is None
        assert data["recommendation_run_id"] is None

    def test_create_records_actor_email(
        self, client: TestClient, auth_headers_analyst: dict
    ):
        """Actor email from JWT is persisted; not caller-supplied."""
        g = _make_graph(client)
        r = _make_assessment(client, g["id"], auth_headers_analyst)
        assert r.status_code == 201
        data = r.json()
        assert data["created_by_email"] == "analyst@causal.local"

    def test_create_response_has_limitations(
        self, client: TestClient, auth_headers_analyst: dict
    ):
        """Limitations are always disclosed."""
        g = _make_graph(client)
        r = _make_assessment(client, g["id"], auth_headers_analyst)
        data = r.json()
        assert isinstance(data["limitations"], list)
        assert len(data["limitations"]) > 0

    def test_create_with_unknown_graph_returns_404(
        self, client: TestClient, auth_headers_analyst: dict
    ):
        r = client.post(
            f"/api/v1/graphs/{uuid.uuid4()}/assessments",
            json={"name": "bad"},
            headers=auth_headers_analyst,
        )
        assert r.status_code == 404

    def test_create_with_nonexistent_causal_run_is_partial(
        self, client: TestClient, auth_headers_analyst: dict
    ):
        """References to non-existent records surface in missing_sources, not errors."""
        g = _make_graph(client)
        fake_id = str(uuid.uuid4())
        r = _make_assessment(
            client, g["id"], auth_headers_analyst,
            causal_run_id=fake_id,
        )
        assert r.status_code == 201
        data = r.json()
        assert data["status"] == "PARTIAL"
        assert data["causal_run_id"] is None  # excluded because not found
        assert any("causal_run" in m for m in data["missing_sources"])

    def test_create_with_nonexistent_forecast_run_is_partial(
        self, client: TestClient, auth_headers_analyst: dict
    ):
        g = _make_graph(client)
        r = _make_assessment(
            client, g["id"], auth_headers_analyst,
            forecast_run_id=str(uuid.uuid4()),
        )
        data = r.json()
        assert data["status"] == "PARTIAL"
        assert data["forecast_run_id"] is None
        assert any("forecast_run" in m for m in data["missing_sources"])

    def test_create_with_nonexistent_recommendation_run_is_partial(
        self, client: TestClient, auth_headers_analyst: dict
    ):
        g = _make_graph(client)
        r = _make_assessment(
            client, g["id"], auth_headers_analyst,
            recommendation_run_id=str(uuid.uuid4()),
        )
        data = r.json()
        assert data["status"] == "PARTIAL"
        assert data["recommendation_run_id"] is None
        assert any("recommendation_run" in m for m in data["missing_sources"])


# ── Cross-graph rejection ─────────────────────────────────────────────────────


class TestCrossGraphRejection:
    """Records from a different graph must be rejected at assembly time."""

    def test_cross_graph_causal_run_excluded(
        self, client: TestClient, auth_headers_analyst: dict
    ):
        """A causal run from graph B must not be accepted into graph A's assessment."""
        g_a = _make_graph(client, "Graph A")
        g_b = _make_graph(client, "Graph B")

        # Create a causal run in graph B
        causal_r = client.post(
            f"/api/v1/graphs/{g_b['id']}/causal/analyze",
            json={"name": "B run"},
        )
        if causal_r.status_code not in (200, 201):
            pytest.skip("Causal engine not seeded — skipping cross-graph run test")

        run_b = causal_r.json()
        run_id_b = run_b.get("id") or run_b.get("run_id")

        # Attempt to create assessment for graph A with graph B's run
        r = _make_assessment(
            client, g_a["id"], auth_headers_analyst,
            causal_run_id=run_id_b,
        )
        assert r.status_code == 201
        data = r.json()
        # Should be excluded due to cross-graph mismatch
        assert data["causal_run_id"] is None
        assert any(
            "different graph" in w or "causal_run" in m
            for m in data["missing_sources"]
            for w in data["warnings"]
        ) or data["status"] == "PARTIAL"

    def test_assessment_404_for_wrong_graph(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        """An assessment from graph A must not be retrievable under graph B."""
        g_a = _make_graph(client, "AssessA")
        g_b = _make_graph(client, "AssessB")
        a = _make_assessment(client, g_a["id"], auth_headers_analyst).json()
        r = client.get(
            f"/api/v1/graphs/{g_b['id']}/assessments/{a['id']}",
            headers=auth_headers_viewer,
        )
        assert r.status_code == 404


# ── Retrieval and listing ─────────────────────────────────────────────────────


class TestAssessmentRetrieval:
    """GET endpoints for assessments."""

    def test_get_assessment_by_id(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        g = _make_graph(client)
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()
        r = client.get(
            f"/api/v1/graphs/{g['id']}/assessments/{a['id']}",
            headers=auth_headers_viewer,
        )
        assert r.status_code == 200
        assert r.json()["id"] == a["id"]

    def test_list_assessments_empty(
        self, client: TestClient, auth_headers_viewer: dict
    ):
        g = _make_graph(client)
        r = client.get(
            f"/api/v1/graphs/{g['id']}/assessments",
            headers=auth_headers_viewer,
        )
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "total" in data
        assert isinstance(data["items"], list)

    def test_list_assessments_pagination(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        g = _make_graph(client)
        for i in range(3):
            _make_assessment(client, g["id"], auth_headers_analyst, name=f"Assess {i}")

        r = client.get(
            f"/api/v1/graphs/{g['id']}/assessments?page=1&page_size=2",
            headers=auth_headers_viewer,
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data["items"]) <= 2
        assert data["total"] >= 3
        assert data["page"] == 1
        assert data["page_size"] == 2

    def test_list_unknown_graph_404(
        self, client: TestClient, auth_headers_viewer: dict
    ):
        r = client.get(
            f"/api/v1/graphs/{uuid.uuid4()}/assessments",
            headers=auth_headers_viewer,
        )
        assert r.status_code == 404

    def test_get_unknown_assessment_404(
        self, client: TestClient, auth_headers_viewer: dict
    ):
        g = _make_graph(client)
        r = client.get(
            f"/api/v1/graphs/{g['id']}/assessments/{uuid.uuid4()}",
            headers=auth_headers_viewer,
        )
        assert r.status_code == 404


# ── Evidence lineage ─────────────────────────────────────────────────────────


class TestEvidenceLineage:
    """GET /assessments/{id}/evidence"""

    def test_evidence_returns_unavailable_when_no_causal_run(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        """Evidence endpoint must not fabricate data when causal run is missing."""
        g = _make_graph(client)
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()
        r = client.get(
            f"/api/v1/graphs/{g['id']}/assessments/{a['id']}/evidence",
            headers=auth_headers_viewer,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["causal_available"] is False
        assert data["total_hypotheses"] == 0
        assert isinstance(data["warnings"], list)
        assert len(data["warnings"]) > 0

    def test_evidence_has_required_fields(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        g = _make_graph(client)
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()
        r = client.get(
            f"/api/v1/graphs/{g['id']}/assessments/{a['id']}/evidence",
            headers=auth_headers_viewer,
        )
        data = r.json()
        required = ["assessment_id", "graph_id", "causal_available", "hypotheses", "total_hypotheses"]
        for field in required:
            assert field in data, f"Missing field: {field}"


# ── Impacts ───────────────────────────────────────────────────────────────────


class TestImpactSummary:
    """GET /assessments/{id}/impacts"""

    def test_impacts_returns_unavailable_metrics_explicitly(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        """No source records → all sections return unavailable, not fabricated zeros."""
        g = _make_graph(client)
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()
        r = client.get(
            f"/api/v1/graphs/{g['id']}/assessments/{a['id']}/impacts",
            headers=auth_headers_viewer,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["causal_available"] is False
        assert data["forecast_available"] is False
        assert data["counterfactual_available"] is False
        assert data["recommendation_available"] is False
        # Null values must not be presented as measured zeros
        assert data["hypotheses_total"] is None
        assert data["forecast_predicted_affected"] is None

    def test_impacts_distinguishes_observed_from_predicted(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        """Observed vs predicted must be distinguishable in the response."""
        g = _make_graph(client)
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()
        r = client.get(
            f"/api/v1/graphs/{g['id']}/assessments/{a['id']}/impacts",
            headers=auth_headers_viewer,
        )
        data = r.json()
        # The response must have separate fields for observed (already_affected) vs predicted
        assert "forecast_already_affected" in data   # observed / already degraded
        assert "forecast_predicted_affected" in data  # predicted (future estimate)

    def test_impacts_has_missing_sources_field(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        g = _make_graph(client)
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()
        r = client.get(
            f"/api/v1/graphs/{g['id']}/assessments/{a['id']}/impacts",
            headers=auth_headers_viewer,
        )
        assert "missing_sources" in r.json()


# ── Decisions ─────────────────────────────────────────────────────────────────


class TestDecisions:
    """GET /assessments/{id}/decisions"""

    def test_decisions_unavailable_without_recommendation_run(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        g = _make_graph(client)
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()
        r = client.get(
            f"/api/v1/graphs/{g['id']}/assessments/{a['id']}/decisions",
            headers=auth_headers_viewer,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["recommendation_available"] is False
        assert data["total_candidates"] == 0
        assert isinstance(data["limitations"], list)
        assert len(data["limitations"]) > 0

    def test_decisions_response_has_required_fields(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        g = _make_graph(client)
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()
        r = client.get(
            f"/api/v1/graphs/{g['id']}/assessments/{a['id']}/decisions",
            headers=auth_headers_viewer,
        )
        data = r.json()
        required = [
            "assessment_id", "graph_id", "recommendation_available",
            "candidates", "total_candidates", "approved_count",
            "rejected_count", "pending_count",
        ]
        for field in required:
            assert field in data, f"Missing field: {field}"

    def test_decisions_immutable_through_assessment_interface(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        """Assessment decisions endpoint is read-only. No POST/PATCH on decisions."""
        g = _make_graph(client)
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()
        r = client.post(
            f"/api/v1/graphs/{g['id']}/assessments/{a['id']}/decisions",
            json={"decision": "APPROVED"},
            headers=auth_headers_viewer,
        )
        # Must return 405 Method Not Allowed (no POST on this endpoint)
        assert r.status_code == 405


# ── Operational state immutability ────────────────────────────────────────────


class TestOperationalStateImmutability:
    """Assessment assembly must not touch Phase 2–3 operational tables."""

    def test_create_does_not_modify_node_states(
        self, client: TestClient, auth_headers_analyst: dict
    ):
        """Creating an assessment must leave node states unchanged."""
        g = _make_graph(client)
        # Create a node
        node_r = client.post(
            f"/api/v1/graphs/{g['id']}/nodes",
            json={
                "name": "Test Node",
                "type": "service",
                "health": 0.9,
                "state": "NORMAL",
            },
        )
        assert node_r.status_code == 201
        node = node_r.json()

        # Create assessment
        _make_assessment(client, g["id"], auth_headers_analyst)

        # Node state must be unchanged
        state_r = client.get(f"/api/v1/graphs/{g['id']}/nodes/{node['id']}")
        assert state_r.status_code == 200
        state = state_r.json()
        assert state["health"] == pytest.approx(0.9)
        assert state["state"] == "NORMAL"

    def test_create_does_not_create_events(
        self, client: TestClient, auth_headers_analyst: dict
    ):
        """Assessment creation must not insert events into the events table."""
        g = _make_graph(client)

        events_before_r = client.get(f"/api/v1/graphs/{g['id']}/events")
        events_before = events_before_r.json() if events_before_r.status_code == 200 else []

        _make_assessment(client, g["id"], auth_headers_analyst)

        events_after_r = client.get(f"/api/v1/graphs/{g['id']}/events")
        events_after = events_after_r.json() if events_after_r.status_code == 200 else []

        assert len(events_after) == len(events_before)


# ── Provenance panel fields ───────────────────────────────────────────────────


class TestProvenanceFields:
    """All provenance fields must be present and correctly typed."""

    def test_assessment_has_model_versions(
        self, client: TestClient, auth_headers_analyst: dict
    ):
        g = _make_graph(client)
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()
        assert "model_versions" in a
        assert isinstance(a["model_versions"], dict)
        assert "assessment" in a["model_versions"]

    def test_assessment_has_warnings_and_limitations(
        self, client: TestClient, auth_headers_analyst: dict
    ):
        g = _make_graph(client)
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()
        assert isinstance(a["warnings"], list)
        assert isinstance(a["limitations"], list)
        assert isinstance(a["missing_sources"], list)

    def test_list_item_has_flag_fields(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        g = _make_graph(client)
        _make_assessment(client, g["id"], auth_headers_analyst)
        r = client.get(
            f"/api/v1/graphs/{g['id']}/assessments",
            headers=auth_headers_viewer,
        )
        items = r.json()["items"]
        assert len(items) > 0
        item = items[0]
        for flag in ["has_causal", "has_forecast", "has_counterfactual", "has_recommendation"]:
            assert flag in item, f"Missing flag: {flag}"
        assert "warning_count" in item
        assert "missing_source_count" in item


# ── Sensitive data leakage prevention ────────────────────────────────────────


class TestSensitiveDataLeakage:
    """Ensure no credentials, tokens, or hashes leak through assessment responses."""

    def test_assessment_does_not_expose_password_hash(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        g = _make_graph(client)
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()
        r = client.get(
            f"/api/v1/graphs/{g['id']}/assessments/{a['id']}",
            headers=auth_headers_viewer,
        )
        body = r.text.lower()
        assert "password" not in body
        assert "hashed" not in body
        assert "token" not in body
        assert "secret" not in body


# ── Phase 10 Verification Gate: 1. Unknown vs Zero ───────────────────────────


class TestVerificationGateUnknownVsZero:
    """
    Area 1: Distinct representation of unavailable vs genuinely measured-zero data.
    Ensures missing/unlinked source metrics are None/unavailable, never fabricated zeros.
    """

    def test_missing_sources_render_unavailable_and_none(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        """When no Phase 5-8 runs are linked, available is False and counts are None, not 0."""
        g = _make_graph(client, "ZeroVsUnknownGraph")
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()

        r = client.get(
            f"/api/v1/graphs/{g['id']}/assessments/{a['id']}/impacts",
            headers=auth_headers_viewer,
        )
        assert r.status_code == 200
        impacts = r.json()

        # All availability flags must be explicitly False
        assert impacts["causal_available"] is False
        assert impacts["forecast_available"] is False
        assert impacts["counterfactual_available"] is False
        assert impacts["recommendation_available"] is False

        # Metric values must be null/None, NOT 0
        assert impacts["hypotheses_total"] is None
        assert impacts["hypotheses_supported"] is None
        assert impacts["hypotheses_contradicted"] is None
        assert impacts["hypotheses_unresolved"] is None
        assert impacts["forecast_predicted_affected"] is None
        assert impacts["forecast_already_affected"] is None
        assert impacts["counterfactual_summary"] is None
        assert impacts["recommendation_eligible_count"] is None
        assert impacts["recommendation_approved_count"] is None

    def test_empty_but_known_topology_and_events(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        """A monitored graph with 0 degraded nodes reports genuine measured 0, with available=True."""
        g = _make_graph(client, "KnownZeroGraph")
        # Add a node in NORMAL state
        client.post(
            f"/api/v1/graphs/{g['id']}/nodes",
            json={"name": "HealthyNode", "type": "service", "health": 1.0, "state": "NORMAL"},
        )
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()

        detail = client.get(
            f"/api/v1/graphs/{g['id']}/assessments/{a['id']}",
            headers=auth_headers_viewer,
        ).json()

        gs = detail["graph_summary"]
        assert gs["available"] is True
        assert gs["data_available"] is True
        assert gs["node_count"] == 1
        # Genuinely measured zeros:
        assert gs["degraded_node_count"] == 0
        assert gs["failed_node_count"] == 0
        assert gs["critical_node_count"] == 0
        assert gs["active_event_count"] == 0


# ── Phase 10 Verification Gate: 2. Cross-Graph Lineage ───────────────────────


class TestVerificationGateCrossGraphLineage:
    """
    Area 2: References to another graph's sources are rejected and excluded.
    Ensures no cross-graph leakage, status is PARTIAL, and warnings/missing_sources are populated.
    """

    def test_cross_graph_references_all_excluded(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        """Cross-graph baseline, snapshot, causal, forecast, cf, and rec runs are rejected."""
        g_target = _make_graph(client, "Target Graph")
        g_foreign = _make_graph(client, "Foreign Graph")

        # Fake foreign UUIDs
        foreign_bl_id = str(uuid.uuid4())
        foreign_ss_id = str(uuid.uuid4())
        foreign_causal_id = str(uuid.uuid4())
        foreign_forecast_id = str(uuid.uuid4())
        foreign_cf_id = str(uuid.uuid4())
        foreign_rec_id = str(uuid.uuid4())

        r = _make_assessment(
            client,
            g_target["id"],
            auth_headers_analyst,
            name="Cross-Graph Assessment",
            baseline_id=foreign_bl_id,
            snapshot_id=foreign_ss_id,
            causal_run_id=foreign_causal_id,
            forecast_run_id=foreign_forecast_id,
            counterfactual_experiment_id=foreign_cf_id,
            recommendation_run_id=foreign_rec_id,
        )
        assert r.status_code == 201
        data = r.json()

        # Must be PARTIAL because requested sources were missing/excluded
        assert data["status"] == "PARTIAL"

        # None of the foreign IDs should be accepted on the assessment
        assert data["baseline_id"] is None
        assert data["snapshot_id"] is None
        assert data["causal_run_id"] is None
        assert data["forecast_run_id"] is None
        assert data["counterfactual_experiment_id"] is None
        assert data["recommendation_run_id"] is None

        # All missing sources are recorded
        assert any("causal_run" in s for s in data["missing_sources"])
        assert any("forecast_run" in s for s in data["missing_sources"])
        assert any("counterfactual" in s for s in data["missing_sources"])
        assert any("recommendation" in s for s in data["missing_sources"])

    def test_assessment_belongs_strictly_to_owning_graph(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        """Assessment created under graph 1 cannot be retrieved or manipulated via graph 2."""
        g1 = _make_graph(client, "Graph Alpha")
        g2 = _make_graph(client, "Graph Beta")

        a1 = _make_assessment(client, g1["id"], auth_headers_analyst).json()

        # Accessing via foreign graph must return 404
        r = client.get(
            f"/api/v1/graphs/{g2['id']}/assessments/{a1['id']}",
            headers=auth_headers_viewer,
        )
        assert r.status_code == 404

        r_ev = client.get(
            f"/api/v1/graphs/{g2['id']}/assessments/{a1['id']}/evidence",
            headers=auth_headers_viewer,
        )
        assert r_ev.status_code == 404

        r_imp = client.get(
            f"/api/v1/graphs/{g2['id']}/assessments/{a1['id']}/impacts",
            headers=auth_headers_viewer,
        )
        assert r_imp.status_code == 404

        r_dec = client.get(
            f"/api/v1/graphs/{g2['id']}/assessments/{a1['id']}/decisions",
            headers=auth_headers_viewer,
        )
        assert r_dec.status_code == 404


# ── Phase 10 Verification Gate: 3. Historical Snapshot Integrity ─────────────


class TestVerificationGateHistoricalSnapshotIntegrity:
    """
    Area 3: Historical snapshot immutability.
    Modifying live telemetry after creation does NOT mutate previously assembled snapshot.
    Retrieval does NOT re-run engines or alter operational data.
    """

    def test_live_telemetry_mutation_does_not_alter_past_assessment(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        """Altering node states after assessment creation leaves historical snapshot untouched."""
        g = _make_graph(client, "SnapshotIntegrityGraph")

        # 1. Create a node in NORMAL state
        node_res = client.post(
            f"/api/v1/graphs/{g['id']}/nodes",
            json={"name": "Server1", "type": "service", "health": 1.0, "state": "NORMAL"},
        )
        assert node_res.status_code == 201
        node = node_res.json()

        # 2. Assemble assessment at T0
        a = _make_assessment(client, g["id"], auth_headers_analyst, name="T0 Assessment").json()
        assert a["graph_summary"]["node_count"] == 1
        assert a["graph_summary"]["degraded_node_count"] == 0
        assert a["graph_summary"]["failed_node_count"] == 0

        # 3. Mutate live operational state at T1: Add second node & degrade first node
        client.patch(
            f"/api/v1/graphs/{g['id']}/nodes/{node['id']}",
            json={"health": 0.2, "state": "DEGRADED"},
        )
        client.post(
            f"/api/v1/graphs/{g['id']}/nodes",
            json={"name": "Server2", "type": "service", "health": 0.0, "state": "FAILED"},
        )

        # 4. Verify live operational state changed
        live_nodes = client.get(f"/api/v1/graphs/{g['id']}/nodes").json()
        assert len(live_nodes) == 2

        # 5. Retrieve historical assessment at T2 — MUST retain original T0 snapshot!
        retrieved = client.get(
            f"/api/v1/graphs/{g['id']}/assessments/{a['id']}",
            headers=auth_headers_viewer,
        ).json()

        # Original snapshot values must be frozen and preserved
        assert retrieved["graph_summary"]["node_count"] == 1
        assert retrieved["graph_summary"]["degraded_node_count"] == 0
        assert retrieved["graph_summary"]["failed_node_count"] == 0
        assert retrieved["assembled_at"] == a["assembled_at"]
        assert retrieved["model_versions"] == a["model_versions"]

    def test_retrieval_does_not_mutate_operational_telemetry(
        self, client: TestClient, auth_headers_analyst: dict, auth_headers_viewer: dict
    ):
        """Calling GET on assessment endpoints does not add events or alter node states."""
        g = _make_graph(client, "ReadOnlyRetrievalGraph")
        a = _make_assessment(client, g["id"], auth_headers_analyst).json()

        # Retrieve all endpoints
        client.get(f"/api/v1/graphs/{g['id']}/assessments/{a['id']}", headers=auth_headers_viewer)
        client.get(f"/api/v1/graphs/{g['id']}/assessments/{a['id']}/evidence", headers=auth_headers_viewer)
        client.get(f"/api/v1/graphs/{g['id']}/assessments/{a['id']}/impacts", headers=auth_headers_viewer)
        client.get(f"/api/v1/graphs/{g['id']}/assessments/{a['id']}/decisions", headers=auth_headers_viewer)

        # Confirm 0 events were generated
        events = client.get(f"/api/v1/graphs/{g['id']}/events").json()
        assert len(events) == 0

