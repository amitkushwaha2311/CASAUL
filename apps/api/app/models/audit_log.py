"""
CAUSAL API — Audit Log model (Phase 9 extended).

Phase 9 extends AuditAction to include all security-sensitive events:
  - Authentication successes / failures
  - Authorization denials
  - Recommendation decisions (with authenticated actor)
  - Configuration changes
  - Administrative operations

Design guarantees:
  - Records are append-only by convention (no UPDATE/DELETE exposed to API users).
  - Timestamps are server-generated (not caller-supplied).
  - Passwords, tokens, and secrets are never logged.
  - actor_id references the authenticated server-side principal.

Limitation:
  Database-level immutability (e.g. PostgreSQL row-level security or
  append-only tablespaces) is NOT implemented here. A database admin with
  direct access can modify rows. This is documented and not claimed to
  be tamper-proof.
"""

import uuid

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin

# Use JSON instead of JSONB so the model works with both SQLite (dev/test)
# and PostgreSQL (production). JSONB-specific features are a PostgreSQL
# optimisation; JSON is functionally equivalent for our use-case.
from sqlalchemy import JSON


class AuditAction(str):
    """
    Enumeration of auditable platform actions.

    Security-sensitive actions added in Phase 9:
      auth.*       — login/logout/failures
      authz.*      — authorization denials
      user.*       — user account management (admin)
      decision.*   — recommendation review decisions
      config.*     — configuration changes

    Convention: dot-delimited <domain>.<event> strings.
    """

    # ── System lifecycle ─────────────────────────────────────────
    SYSTEM_CREATED = "system.created"
    SYSTEM_UPDATED = "system.updated"
    SYSTEM_DELETED = "system.deleted"
    SYSTEM_STATUS_CHANGED = "system.status_changed"

    # ── Authentication (Phase 9) ─────────────────────────────────
    AUTH_LOGIN_SUCCESS = "auth.login_success"
    AUTH_LOGIN_FAILURE = "auth.login_failure"
    AUTH_LOGOUT = "auth.logout"
    AUTH_TOKEN_REFRESHED = "auth.token_refreshed"
    AUTH_TOKEN_INVALID = "auth.token_invalid"

    # ── Authorization (Phase 9) ──────────────────────────────────
    AUTHZ_DENIED = "authz.denied"

    # ── User management (Phase 9) ────────────────────────────────
    USER_CREATED = "user.created"
    USER_UPDATED = "user.updated"
    USER_ROLE_CHANGED = "user.role_changed"
    USER_DEACTIVATED = "user.deactivated"
    USER_LOGIN = "user.login"        # kept for backward compat
    USER_LOGOUT = "user.logout"      # kept for backward compat

    # ── Recommendation decisions (Phase 9) ───────────────────────
    DECISION_APPROVED = "decision.approved"
    DECISION_REJECTED = "decision.rejected"

    # ── Graph access control (Phase 9) ───────────────────────────
    GRAPH_CREATED = "graph.created"
    GRAPH_DELETED = "graph.deleted"

    # ── Configuration (Phase 9) ──────────────────────────────────
    CONFIG_CHANGED = "config.changed"

    # ── Platform events ──────────────────────────────────────────
    INCIDENT_CREATED = "incident.created"
    INTERVENTION_PROPOSED = "intervention.proposed"
    INTERVENTION_APPROVED = "intervention.approved"
    INTERVENTION_EXECUTED = "intervention.executed"
    SIMULATION_STARTED = "simulation.started"
    SIMULATION_COMPLETED = "simulation.completed"

    # ── Generic ──────────────────────────────────────────────────
    UNKNOWN = "unknown"


class AuditLog(UUIDMixin, TimestampMixin, Base):
    """
    Append-only audit log entry.

    Usage rules:
      1. NEVER issue UPDATE or DELETE against this table via the API.
      2. Timestamps are set by the database server (server_default=func.now()).
      3. Do NOT log passwords, bearer tokens, session secrets, or raw
         request bodies containing sensitive fields.
      4. actor_id must reference the authenticated server-side principal;
         for pre-authentication events it is NULL.
      5. outcome should be 'success', 'failure', or 'denied'.

    Columns:
      action         — dot-delimited action string from AuditAction
      actor_id       — FK to users.id (nullable for system/unauthenticated events)
      actor_email    — denormalised email snapshot (survives user deletion)
      resource_type  — e.g. 'graph', 'candidate', 'user'
      resource_id    — UUID of the affected resource (nullable)
      outcome        — 'success' | 'failure' | 'denied'
      context        — structured, sanitised context (no secrets)
      correlation_id — request-scoped trace ID
    """

    __tablename__ = "audit_logs"

    action: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    outcome: Mapped[str] = mapped_column(String(32), nullable=False, default="success")

    # Actor — NULL for pre-auth / system events
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Denormalised snapshot so audit survives user deletion
    actor_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Affected resource
    resource_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)

    # Human-readable summary (no secrets)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Structured context — sanitised, no credentials
    context: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)

    # Legacy alias kept for migration compatibility
    entity_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)

    # Request correlation ID for distributed tracing
    correlation_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    __table_args__ = (
        Index("ix_audit_logs_action_created", "action", "created_at"),
        Index("ix_audit_logs_entity", "entity_type", "entity_id"),
        Index("ix_audit_logs_resource", "resource_type", "resource_id"),
        Index("ix_audit_logs_actor_action", "actor_id", "action"),
        Index("ix_audit_logs_outcome", "outcome"),
    )

    def __repr__(self) -> str:
        return f"<AuditLog id={self.id} action={self.action!r} outcome={self.outcome}>"
