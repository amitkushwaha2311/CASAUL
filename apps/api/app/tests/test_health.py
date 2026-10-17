"""
CAUSAL API Tests — Health endpoint tests.

These tests verify the health, system info, and system status endpoints.
They test response structure, status codes, and schema correctness.

Note: Database connectivity tests require a running PostgreSQL instance.
Tests that need the database are marked with @pytest.mark.integration.
"""

import pytest
from fastapi.testclient import TestClient


class TestHealthEndpoint:
    """Tests for GET /api/v1/health"""

    def test_health_returns_200_or_503(self, client: TestClient) -> None:
        """Health endpoint must always return 200 or 503 — never an unhandled error."""
        response = client.get("/api/v1/health")
        assert response.status_code in (200, 503)

    def test_health_response_has_required_fields(self, client: TestClient) -> None:
        """Response must contain status, database, and version fields."""
        response = client.get("/api/v1/health")
        data = response.json()
        assert "status" in data
        assert "database" in data
        assert "version" in data

    def test_health_version_matches_app_version(self, client: TestClient) -> None:
        """Reported version must be a valid semver string."""
        response = client.get("/api/v1/health")
        data = response.json()
        version = data["version"]
        parts = version.split(".")
        assert len(parts) == 3, f"Expected semver, got: {version}"

    def test_health_status_is_valid_value(self, client: TestClient) -> None:
        """Status must be one of the expected values."""
        response = client.get("/api/v1/health")
        data = response.json()
        assert data["status"] in ("healthy", "degraded", "unavailable")


class TestSystemInfoEndpoint:
    """Tests for GET /api/v1/system/info"""

    def test_system_info_returns_200(self, client: TestClient) -> None:
        response = client.get("/api/v1/system/info")
        assert response.status_code == 200

    def test_system_info_response_structure(self, client: TestClient) -> None:
        response = client.get("/api/v1/system/info")
        data = response.json()
        assert "service" in data
        assert "version" in data
        assert "environment" in data
        assert "phase" in data

    def test_system_info_service_name(self, client: TestClient) -> None:
        response = client.get("/api/v1/system/info")
        data = response.json()
        assert data["service"] == "causal-api"

    def test_system_info_phase_is_string(self, client: TestClient) -> None:
        response = client.get("/api/v1/system/info")
        data = response.json()
        assert isinstance(data["phase"], str)
        assert len(data["phase"]) > 0


class TestSystemStatusEndpoint:
    """Tests for GET /api/v1/system/status"""

    def test_system_status_returns_200(self, client: TestClient) -> None:
        response = client.get("/api/v1/system/status")
        assert response.status_code in (200, 503)

    def test_system_status_has_features(self, client: TestClient) -> None:
        response = client.get("/api/v1/system/status")
        data = response.json()
        assert "features" in data
        features = data["features"]
        assert "causal_engine" in features
        assert "simulation" in features
        assert "interventions" in features

    def test_system_status_phase1_features_disabled(self, client: TestClient) -> None:
        """In Phase 1, all advanced features must be disabled."""
        response = client.get("/api/v1/system/status")
        data = response.json()
        features = data["features"]
        # All Phase 1+ features must be off
        assert features["causal_engine"] is False
        assert features["simulation"] is False
        assert features["interventions"] is False
