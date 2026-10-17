"""Phase 7 — Deterministic Counterfactual Simulation Engine

Creates the Phase 7 counterfactual simulation tables:
  - counterfactual_experiments: auditable record of counterfactual experiment definitions and status
  - counterfactual_changes: hypothetical parameter and state overrides applied to simulation copy
  - counterfactual_comparisons: differential outcome comparison between baseline and counterfactual branches

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-10-12
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── counterfactual_experiments ───────────────────────────────────────────
    op.create_table(
        'counterfactual_experiments',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('graph_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('baseline_id', sa.Uuid(), nullable=True),
        sa.Column('snapshot_id', sa.Uuid(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='PENDING'),
        sa.Column('rule_version', sa.String(length=50), nullable=False, server_default='1.0.0'),
        sa.Column('forecast_settings', sa.JSON(), nullable=False),
        sa.Column('baseline_forecast_id', sa.Uuid(), nullable=True),
        sa.Column('counterfactual_forecast_id', sa.Uuid(), nullable=True),
        sa.Column('execution_error', sa.Text(), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('summary', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.ForeignKeyConstraint(['graph_id'], ['infrastructure_graphs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['baseline_id'], ['state_baselines.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['snapshot_id'], ['state_snapshots.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['baseline_forecast_id'], ['cascade_forecast_runs.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['counterfactual_forecast_id'], ['cascade_forecast_runs.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cf_exp_graph_id'), 'counterfactual_experiments', ['graph_id'], unique=False)
    op.create_index(op.f('ix_cf_exp_status'), 'counterfactual_experiments', ['status'], unique=False)
    op.create_index(op.f('ix_cf_exp_created_at'), 'counterfactual_experiments', ['created_at'], unique=False)

    # ── counterfactual_changes ───────────────────────────────────────────────
    op.create_table(
        'counterfactual_changes',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('experiment_id', sa.Uuid(), nullable=False),
        sa.Column('target_type', sa.String(length=50), nullable=False),
        sa.Column('target_id', sa.Uuid(), nullable=False),
        sa.Column('change_type', sa.String(length=50), nullable=False),
        sa.Column('original_value', sa.JSON(), nullable=True),
        sa.Column('proposed_value', sa.JSON(), nullable=False),
        sa.Column('unit', sa.String(length=50), nullable=True),
        sa.Column('rationale', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.ForeignKeyConstraint(['experiment_id'], ['counterfactual_experiments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cf_change_experiment_id'), 'counterfactual_changes', ['experiment_id'], unique=False)
    op.create_index(op.f('ix_cf_change_target'), 'counterfactual_changes', ['target_type', 'target_id'], unique=False)

    # ── counterfactual_comparisons ───────────────────────────────────────────
    op.create_table(
        'counterfactual_comparisons',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('experiment_id', sa.Uuid(), nullable=False),
        sa.Column('nodes_affected_both', sa.JSON(), nullable=False),
        sa.Column('nodes_affected_baseline_only', sa.JSON(), nullable=False),
        sa.Column('nodes_affected_counterfactual_only', sa.JSON(), nullable=False),
        sa.Column('nodes_timing_differ', sa.JSON(), nullable=False),
        sa.Column('nodes_severity_differ', sa.JSON(), nullable=False),
        sa.Column('critical_nodes_summary', sa.JSON(), nullable=False),
        sa.Column('uncertainty_differences', sa.JSON(), nullable=False),
        sa.Column('comparison_metrics', sa.JSON(), nullable=False),
        sa.Column('warnings', sa.JSON(), nullable=False),
        sa.Column('limitations', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.ForeignKeyConstraint(['experiment_id'], ['counterfactual_experiments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('experiment_id')
    )
    op.create_index(op.f('ix_cf_comp_experiment_id'), 'counterfactual_comparisons', ['experiment_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_cf_comp_experiment_id'), table_name='counterfactual_comparisons')
    op.drop_table('counterfactual_comparisons')

    op.drop_index(op.f('ix_cf_change_target'), table_name='counterfactual_changes')
    op.drop_index(op.f('ix_cf_change_experiment_id'), table_name='counterfactual_changes')
    op.drop_table('counterfactual_changes')

    op.drop_index(op.f('ix_cf_exp_created_at'), table_name='counterfactual_experiments')
    op.drop_index(op.f('ix_cf_exp_status'), table_name='counterfactual_experiments')
    op.drop_index(op.f('ix_cf_exp_graph_id'), table_name='counterfactual_experiments')
    op.drop_table('counterfactual_experiments')
