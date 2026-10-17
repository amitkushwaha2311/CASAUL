"""
CAUSAL API — Append-only audit service (Phase 9).

Central service for writing security-sensitive audit records.

Usage:
    from app.services.audit_service import AuditService

    await AuditService.log(
        db,
        action=AuditAction.AUTH_LOGIN_SUCCESS,
        actor=user,
        resource_type="user",
        resource_id=user.id,
        outcome="success",
        context={"ip": request.client.host},
        correlation_id=correlation_id,
    )

Rules:
  1. This service only appends records — it never updates or deletes.
  2. Never pass passwords, tokens, or secrets to context.
  3. Failures in audit logging are caught and logged to stderr;
     they do NOT propagate to break the main request.
  4. Timestamps are set by the DB server_default (func.now()), not caller.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.audit_log import AuditAction, AuditLog
from app.models.user import User

logger = get_logger(__name__)


class AuditService:
    """Append-only audit log writer."""

    @staticmethod
    async def log(
        db: AsyncSession,
        *,
        action: str,
        outcome: str = "success",
        actor: User | None = None,
        actor_id: uuid.UUID | None = None,
        actor_email: str | None = None,
        resource_type: str | None = None,
        resource_id: uuid.UUID | None = None,
        description: str | None = None,
        context: dict[str, Any] | None = None,
        correlation_id: str | None = None,
    ) -> None:
        """
        Append one audit record.

        actor takes precedence over actor_id / actor_email if provided.
        context must be sanitised by the caller (no credentials, no tokens).
        Failures are swallowed so audit never breaks primary operations.
        """
        try:
            resolved_actor_id = actor.id if actor else actor_id
            resolved_email = actor.email if actor else actor_email

            entry = AuditLog(
                action=action,
                outcome=outcome,
                actor_id=resolved_actor_id,
                actor_email=resolved_email,
                resource_type=resource_type,
                resource_id=resource_id,
                description=description,
                context=context or {},
                correlation_id=correlation_id,
            )
            db.add(entry)
            await db.flush()  # flush within the existing transaction

        except Exception as exc:  # noqa: BLE001
            # Audit failure must never mask the original operation error
            logger.error(
                "audit_write_failed",
                action=action,
                exc_type=type(exc).__name__,
            )

    @staticmethod
    async def log_auth_failure(
        db: AsyncSession,
        *,
        email: str | None = None,
        reason: str,
        correlation_id: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        """
        Convenience method for login failures.
        NEVER include passwords or tokens in reason/context.
        """
        ctx: dict[str, Any] = {"reason": reason}
        if context:
            ctx.update(context)
        await AuditService.log(
            db,
            action=AuditAction.AUTH_LOGIN_FAILURE,
            outcome="failure",
            actor_email=email,  # no actor_id; user may not exist
            description="Authentication failed.",
            context=ctx,
            correlation_id=correlation_id,
        )

    @staticmethod
    async def log_authz_denied(
        db: AsyncSession,
        *,
        actor: User,
        resource_type: str | None = None,
        resource_id: uuid.UUID | None = None,
        required_role: str | None = None,
        correlation_id: str | None = None,
    ) -> None:
        """Convenience method for authorization denials."""
        await AuditService.log(
            db,
            action=AuditAction.AUTHZ_DENIED,
            outcome="denied",
            actor=actor,
            resource_type=resource_type,
            resource_id=resource_id,
            description="Access denied.",
            context={"required_role": required_role, "user_role": actor.role},
            correlation_id=correlation_id,
        )

    @staticmethod
    async def log_decision(
        db: AsyncSession,
        *,
        actor: User,
        decision: str,
        candidate_id: uuid.UUID,
        run_id: uuid.UUID,
        graph_id: uuid.UUID,
        notes: str | None = None,
        correlation_id: str | None = None,
    ) -> None:
        """Convenience method for recommendation approval/rejection decisions."""
        action = (
            AuditAction.DECISION_APPROVED
            if decision.upper() == "APPROVED"
            else AuditAction.DECISION_REJECTED
        )
        await AuditService.log(
            db,
            action=action,
            outcome="success",
            actor=actor,
            resource_type="candidate_intervention",
            resource_id=candidate_id,
            description=f"Candidate {candidate_id} {decision.lower()} by {actor.email}.",
            context={
                "run_id": str(run_id),
                "graph_id": str(graph_id),
                "decision": decision,
                "notes_provided": notes is not None,
            },
            correlation_id=correlation_id,
        )
