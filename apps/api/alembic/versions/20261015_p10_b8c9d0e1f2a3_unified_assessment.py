"""
CAUSAL — Phase 10 Alembic migration.

Adds: resilience_assessments table.

This migration creates storage for assembled resilience assessment records
that reference existing Phase 2–9 records. It does NOT modify any existing
Phase 1–9 tables.

Migration ID: 20261015_p10_b8c9d0e1f2a3_unified_assessment
Revises:      a7b8c9d0e1f2  (Phase 9: auth_rbac_audit_integrity)
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# ---------------------------------------------------------------------------
revision = "b8c9d0e1f2a3"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None
# ---------------------------------------------------------------------------


def upgrade() -> None:
    op.create_table(
        "resilience_assessments",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),

        # Owning graph
        sa.Column(
            "graph_id",
            sa.Uuid(),
            sa.ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
            nullable=False,
        ),

        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="ASSEMBLING"),

        # Phase 4 references
        sa.Column(
            "baseline_id",
            sa.Uuid(),
            sa.ForeignKey("state_baselines.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "snapshot_id",
            sa.Uuid(),
            sa.ForeignKey("state_snapshots.id", ondelete="SET NULL"),
            nullable=True,
        ),

        # Phase 5 reference
        sa.Column(
            "causal_run_id",
            sa.Uuid(),
            sa.ForeignKey("causal_inference_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),

        # Phase 6 reference
        sa.Column(
            "forecast_run_id",
            sa.Uuid(),
            sa.ForeignKey("cascade_forecast_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),

        # Phase 7 reference
        sa.Column(
            "counterfactual_experiment_id",
            sa.Uuid(),
            sa.ForeignKey("counterfactual_experiments.id", ondelete="SET NULL"),
            nullable=True,
        ),

        # Phase 8 reference
        sa.Column(
            "recommendation_run_id",
            sa.Uuid(),
            sa.ForeignKey("intervention_recommendation_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),

        # Cached summaries
        sa.Column("graph_summary", sa.JSON(), nullable=True),
        sa.Column("impact_summary", sa.JSON(), nullable=True),
        sa.Column("uncertainty_summary", sa.JSON(), nullable=True),
        sa.Column("recommendation_summary", sa.JSON(), nullable=True),

        # Provenance
        sa.Column("missing_sources", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("warnings", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("limitations", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("model_versions", sa.JSON(), nullable=False, server_default="{}"),

        # Actor attribution
        sa.Column("created_by_email", sa.String(255), nullable=True),
        sa.Column(
            "created_by_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),

        # Lifecycle
        sa.Column("assembled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assembly_error", sa.Text(), nullable=True),

        # Standard timestamp fields (set by Alembic mixin convention)
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    op.create_index("ix_assessment_graph_id", "resilience_assessments", ["graph_id"])
    op.create_index("ix_assessment_status", "resilience_assessments", ["status"])
    op.create_index("ix_assessment_created_at", "resilience_assessments", ["created_at"])
    op.create_index("ix_assessment_creator", "resilience_assessments", ["created_by_id"])


def downgrade() -> None:
    op.drop_index("ix_assessment_creator", "resilience_assessments")
    op.drop_index("ix_assessment_created_at", "resilience_assessments")
    op.drop_index("ix_assessment_status", "resilience_assessments")
    op.drop_index("ix_assessment_graph_id", "resilience_assessments")
    op.drop_table("resilience_assessments")
