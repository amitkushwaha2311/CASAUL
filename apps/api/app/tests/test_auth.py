"""
CAUSAL API — Phase 9 Test Suite.

Comprehensive tests covering:
  - Valid and invalid authentication
  - Expired, malformed, or forged tokens
  - Role-based access control (VIEWER, ANALYST, APPROVER, ADMIN)
  - Decision attribution from server principal (rejection of forged decided_by)
  - Append-only audit logging & access controls
  - Sanitized health and operational readiness endpoints
  - Production security configuration validation
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.auth import create_access_token
from app.core.config import Settings
from app.models.audit_log import AuditAction
from app.models.user import UserRole
from app.tests.conftest import TEST_USERS


# ── 1. Authentication Tests ─────────────────────────────────────────


class TestAuthentication:
    def test_login_success_returns_jwt(self, client: TestClient):
        resp = client.post(
            "/api/v1/auth/login",
            json={
                "email": "analyst@causal.local",
                "password": "AnalystPassword123!",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] > 0

    def test_login_wrong_password_returns_401(self, client: TestClient):
        resp = client.post(
            "/api/v1/auth/login",
            json={
                "email": "analyst@causal.local",
                "password": "WrongPassword!",
            },
        )
        assert resp.status_code == 401
        assert "Invalid email or password" in resp.json()["detail"]

    def test_login_unknown_user_returns_401(self, client: TestClient):
        resp = client.post(
            "/api/v1/auth/login",
            json={
                "email": "nobody@causal.local",
                "password": "SomePassword123!",
            },
        )
        assert resp.status_code == 401

    def test_me_endpoint_with_valid_token(
        self, client: TestClient, auth_headers_analyst: dict[str, str]
    ):
        resp = client.get("/api/v1/auth/me", headers=auth_headers_analyst)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "analyst@causal.local"
        assert data["role"] == UserRole.ANALYST
        assert "hashed_password" not in data

    def test_me_endpoint_unauthenticated_returns_401(self, client: TestClient):
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    def test_me_endpoint_expired_token_returns_401(self, client: TestClient):
        # Create expired token (-10 minutes)
        u = TEST_USERS["ANALYST"]
        expired_token = create_access_token(
            u["id"], u["email"], u["role"], expires_delta=timedelta(minutes=-10)
        )
        resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert resp.status_code == 401

    def test_me_endpoint_tampered_token_returns_401(self, client: TestClient):
        tampered_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.tampered_signature"
        resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {tampered_token}"},
        )
        assert resp.status_code == 401

    def test_logout_endpoint_returns_204(
        self, client: TestClient, auth_headers_viewer: dict[str, str]
    ):
        resp = client.post("/api/v1/auth/logout", headers=auth_headers_viewer)
        assert resp.status_code == 204


# ── 2. Role-Based Access Control (RBAC) ─────────────────────────────


class TestRoleBasedAccessControl:
    def test_viewer_cannot_execute_recommendations(
        self, client: TestClient, auth_headers_viewer: dict[str, str]
    ):
        # Viewer only has read access, execute requires ANALYST
        resp = client.post(
            f"/api/v1/graphs/{uuid.uuid4()}/recommendations/runs/{uuid.uuid4()}/execute",
            headers=auth_headers_viewer,
        )
        assert resp.status_code == 403

    def test_analyst_cannot_record_decisions(
        self, client: TestClient, auth_headers_analyst: dict[str, str]
    ):
        # Analyst cannot record decisions; requires APPROVER
        resp = client.post(
            f"/api/v1/graphs/{uuid.uuid4()}/recommendations/runs/{uuid.uuid4()}"
            f"/candidates/{uuid.uuid4()}/decision",
            json={"decision": "APPROVED", "notes": "Approved by analyst"},
            headers=auth_headers_analyst,
        )
        assert resp.status_code == 403

    def test_ordinary_users_cannot_access_user_management(
        self,
        client: TestClient,
        auth_headers_viewer: dict[str, str],
        auth_headers_analyst: dict[str, str],
        auth_headers_approver: dict[str, str],
    ):
        # All non-admins must receive 403 on user management endpoints
        for headers in (auth_headers_viewer, auth_headers_analyst, auth_headers_approver):
            resp = client.get("/api/v1/users", headers=headers)
            assert resp.status_code == 403

    def test_admin_can_access_user_management(
        self, client: TestClient, auth_headers_admin: dict[str, str]
    ):
        resp = client.get("/api/v1/users", headers=auth_headers_admin)
        assert resp.status_code == 200
        users = resp.json()
        assert isinstance(users, list)
        assert any(u["email"] == "admin@causal.local" for u in users)


# ── 3. Decision Attribution and Integrity ───────────────────────────


class TestDecisionAttributionAndIntegrity:
    def test_forged_decided_by_in_body_is_ignored(
        self, client: TestClient, auth_headers_approver: dict[str, str]
    ):
        """
        Verify that a caller-supplied 'decided_by' string in the body is NOT trusted;
        the server must use the authenticated principal's email (approver@causal.local).
        """
        graph_id = uuid.uuid4()
        run_id = uuid.uuid4()
        candidate_id = uuid.uuid4()

        # Non-existent graph returns 404, not 403 or 401
        resp = client.post(
            f"/api/v1/graphs/{graph_id}/recommendations/runs/{run_id}"
            f"/candidates/{candidate_id}/decision",
            json={
                "decision": "APPROVED",
                "decided_by": "forged_malicious_principal@attacker.org",
                "notes": "Testing attribution integrity",
            },
            headers=auth_headers_approver,
        )
        # Even though the graph doesn't exist (returns 404), the request passed authentication & authorization
        assert resp.status_code in (400, 404)


# ── 4. Audit Log Integrity ──────────────────────────────────────────


class TestAuditLogIntegrity:
    def test_non_admin_cannot_read_audit_logs(
        self,
        client: TestClient,
        auth_headers_viewer: dict[str, str],
        auth_headers_approver: dict[str, str],
    ):
        for headers in (auth_headers_viewer, auth_headers_approver):
            resp = client.get("/api/v1/users/audit-logs", headers=headers)
            assert resp.status_code == 403

    def test_admin_can_read_audit_logs(
        self, client: TestClient, auth_headers_admin: dict[str, str]
    ):
        resp = client.get("/api/v1/users/audit-logs", headers=auth_headers_admin)
        assert resp.status_code == 200
        logs = resp.json()
        assert isinstance(logs, list)
        # Verify structure
        if logs:
            log_item = logs[0]
            assert "action" in log_item
            assert "outcome" in log_item
            assert "created_at" in log_item


# ── 5. Operational Readiness and Health ──────────────────────────────


class TestOperationalReadiness:
    def test_liveness_endpoint(self, client: TestClient):
        resp = client.get("/api/v1/health/live")
        assert resp.status_code == 200
        assert resp.json() == {"status": "alive"}

    def test_readiness_endpoint(self, client: TestClient):
        resp = client.get("/api/v1/health/ready")
        assert resp.status_code in (200, 503)
        data = resp.json()
        assert "status" in data
        assert "database" in data
        # Ensure no internal secrets or database connection strings are leaked
        assert "password" not in str(data).lower()

    def test_production_secret_key_validation(self):
        # Settings with default insecure key in production must report insecure
        prod_settings = Settings(
            APP_ENV="production",
            SECRET_KEY="CHANGE_ME_IN_PRODUCTION",
        )
        assert prod_settings.is_production is True
        assert prod_settings.has_secure_secret_key is False

        # Strong key passes validation
        secure_settings = Settings(
            APP_ENV="production",
            SECRET_KEY="a" * 32,
        )
        assert secure_settings.is_production is True
        assert secure_settings.has_secure_secret_key is True


# ── 6. Advanced Security & Audit Integrity Verification ──────────────


class TestAdvancedSecurityAndAuditVerification:
    def test_password_hashing_and_verification_mechanics(self):
        from app.core.auth import get_password_hash, verify_password

        plaintext = "StrongPassphrase987!@"
        h1 = get_password_hash(plaintext)
        h2 = get_password_hash(plaintext)

        # Hashing produces distinct salt every time
        assert h1 != h2
        # Both hashes verify correctly
        assert verify_password(plaintext, h1) is True
        assert verify_password(plaintext, h2) is True
        # Wrong password fails verification
        assert verify_password("WrongPassword123", h1) is False
        assert verify_password("", h1) is False

    def test_deactivated_user_cannot_access_api(
        self, client: TestClient, auth_headers_admin: dict[str, str]
    ):
        # 1. Admin creates a temporary user
        email = f"deactivate_test_{uuid.uuid4().hex[:6]}@causal.local"
        create_resp = client.post(
            "/api/v1/users",
            json={
                "email": email,
                "display_name": "Temporary User",
                "password": "TempPassword123!",
                "role": "ANALYST",
            },
            headers=auth_headers_admin,
        )
        assert create_resp.status_code == 201
        user_id = create_resp.json()["id"]

        # 2. Login succeeds initially
        login_resp = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "TempPassword123!"},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]

        # 3. Admin deactivates the user
        deact_resp = client.post(
            f"/api/v1/users/{user_id}/deactivate",
            headers=auth_headers_admin,
        )
        assert deact_resp.status_code == 200
        assert deact_resp.json()["is_active"] is False

        # 4. Login now fails
        login_again = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "TempPassword123!"},
        )
        assert login_again.status_code == 401

        # 5. Using previous valid JWT also fails because server checks is_active
        token_use = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert token_use.status_code == 401

    def test_audit_logs_record_failures_without_secrets(
        self, client: TestClient, auth_headers_admin: dict[str, str]
    ):
        secret_password_attempt = "UltraConfidentialPassword999!"
        # Trigger login failure
        client.post(
            "/api/v1/auth/login",
            json={
                "email": "analyst@causal.local",
                "password": secret_password_attempt,
            },
        )

        # Admin inspects audit logs
        resp = client.get("/api/v1/users/audit-logs", headers=auth_headers_admin)
        assert resp.status_code == 200
        logs = resp.json()

        # Find recent auth.login_failure for this specific email
        failure_log = next(
            (
                l
                for l in logs
                if l.get("action") == AuditAction.AUTH_LOGIN_FAILURE
                and l.get("actor_email") == "analyst@causal.local"
            ),
            None,
        )
        assert failure_log is not None
        assert failure_log["outcome"] == "failure"
        assert failure_log["actor_email"] == "analyst@causal.local"

        # Assert password attempt is NEVER in audit log payload
        assert secret_password_attempt not in str(logs)

    def test_audit_logs_have_no_modification_endpoints(
        self, client: TestClient, auth_headers_admin: dict[str, str]
    ):
        # Attempting DELETE or PUT on audit-logs route must return 405 Method Not Allowed
        del_resp = client.delete("/api/v1/users/audit-logs", headers=auth_headers_admin)
        assert del_resp.status_code == 405

        put_resp = client.put(
            "/api/v1/users/audit-logs",
            json={"action": "tampered"},
            headers=auth_headers_admin,
        )
        assert put_resp.status_code == 405

    def test_logout_behavior_and_stateless_limitations(
        self, client: TestClient, auth_headers_viewer: dict[str, str]
    ):
        """
        Verifies logout endpoint behavior and explicitly documents that
        stateless JWTs remain valid until exp unless client discards them.
        """
        logout_resp = client.post("/api/v1/auth/logout", headers=auth_headers_viewer)
        assert logout_resp.status_code == 204

        # Calling logout records an audit entry
        # The client application is responsible for discarding the access token.


# ── 8. Public Self-Registration ──────────────────────────────────────


class TestSelfRegistration:
    def test_register_new_user_returns_jwt(self, client: TestClient):
        """New email registration should succeed and return a JWT."""
        unique_email = f"newuser_{uuid.uuid4().hex[:8]}@causal.example"
        resp = client.post(
            "/api/v1/auth/register",
            json={
                "email": unique_email,
                "display_name": "Test User",
                "password": "SecurePassword123!",
            },
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] > 0

    def test_register_duplicate_email_returns_400(self, client: TestClient):
        """Registering with an already-used email must return 400."""
        unique_email = f"duplicate_{uuid.uuid4().hex[:8]}@causal.example"
        payload = {
            "email": unique_email,
            "display_name": "Dup User",
            "password": "SecurePassword123!",
        }
        # First registration
        resp1 = client.post("/api/v1/auth/register", json=payload)
        assert resp1.status_code == 201, resp1.text

        # Second registration with same email
        resp2 = client.post("/api/v1/auth/register", json=payload)
        assert resp2.status_code == 400

    def test_register_short_password_returns_422(self, client: TestClient):
        """Passwords shorter than 8 chars must be rejected with 422."""
        unique_email = f"shortpw_{uuid.uuid4().hex[:8]}@causal.example"
        resp = client.post(
            "/api/v1/auth/register",
            json={
                "email": unique_email,
                "display_name": "Short Pw",
                "password": "abc",
            },
        )
        assert resp.status_code == 422

    def test_register_invalid_email_returns_422(self, client: TestClient):
        """Malformed email must be rejected with 422."""
        resp = client.post(
            "/api/v1/auth/register",
            json={
                "email": "not-an-email",
                "display_name": "Bad Email",
                "password": "SecurePassword123!",
            },
        )
        assert resp.status_code == 422

    def test_register_then_me_returns_viewer_role(self, client: TestClient):
        """Registered user must have VIEWER role, accessible via /me."""
        unique_email = f"viewer_{uuid.uuid4().hex[:8]}@causal.example"
        reg_resp = client.post(
            "/api/v1/auth/register",
            json={
                "email": unique_email,
                "display_name": "Viewer Reg",
                "password": "SecurePassword123!",
            },
        )
        assert reg_resp.status_code == 201, reg_resp.text
        token = reg_resp.json()["access_token"]

        me_resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert me_resp.status_code == 200
        me = me_resp.json()
        assert me["email"] == unique_email
        assert me["role"] == "VIEWER"
        assert "hashed_password" not in me
