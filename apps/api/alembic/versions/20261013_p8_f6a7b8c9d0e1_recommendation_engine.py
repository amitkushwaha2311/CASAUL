"""Phase 8 — Safety-Constrained Intervention Optimization & Recommendation Engine

Creates the Phase 8 recommendation engine tables:
  - intervention_recommendation_runs: auditable containers for recommendation generation runs
  - candidate_interventions: individual generated candidates with safety, eligibility, rank,
    and human decision fields
  - safety_constraint_evaluations: per-constraint pass/fail audit records (fail-closed)

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-10-13
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- intervention_recommendation_runs -----------------------------------
    op.create_table(
        'intervention_recommendation_runs',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('graph_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('baseline_id', sa.Uuid(), nullable=True),
        sa.Column('snapshot_id', sa.Uuid(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='PENDING'),
        sa.Column('generation_settings', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('ranking_policy', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('summary', sa.JSON(), nullable=True),
        sa.Column('limitations', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('execution_error', sa.Text(), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.ForeignKeyConstraint(['graph_id'], ['infrastructure_graphs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['baseline_id'], ['state_baselines.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['snapshot_id'], ['state_snapshots.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_rec_run_graph_id', 'intervention_recommendation_runs', ['graph_id'])
    op.create_index('ix_rec_run_status', 'intervention_recommendation_runs', ['status'])
    op.create_index('ix_rec_run_created_at', 'intervention_recommendation_runs', ['created_at'])

    # -- candidate_interventions --------------------------------------------
    op.create_table(
        'candidate_interventions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('run_id', sa.Uuid(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('intervention_type', sa.String(length=100), nullable=False),
        sa.Column('changes', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('counterfactual_experiment_id', sa.Uuid(), nullable=True),
        sa.Column('safety_status', sa.String(length=50), nullable=False, server_default='INDETERMINATE'),
        sa.Column('eligibility_status', sa.String(length=50), nullable=False, server_default='INDETERMINATE'),
        sa.Column('rank_score', sa.Float(), nullable=True),
        sa.Column('rank_position', sa.Integer(), nullable=True),
        sa.Column('ranking_breakdown', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('decision_status', sa.String(length=50), nullable=False, server_default='PENDING'),
        sa.Column('decision_notes', sa.Text(), nullable=True),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('decided_by', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.ForeignKeyConstraint(['run_id'], ['intervention_recommendation_runs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['counterfactual_experiment_id'], ['counterfactual_experiments.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_candidate_run_id', 'candidate_interventions', ['run_id'])
    op.create_index('ix_candidate_safety_status', 'candidate_interventions', ['safety_status'])
    op.create_index('ix_candidate_rank_position', 'candidate_interventions', ['rank_position'])
    op.create_index('ix_candidate_decision_status', 'candidate_interventions', ['decision_status'])

    # -- safety_constraint_evaluations -------------------------------------
    op.create_table(
        'safety_constraint_evaluations',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('candidate_id', sa.Uuid(), nullable=False),
        sa.Column('constraint_name', sa.String(length=255), nullable=False),
        sa.Column('constraint_type', sa.String(length=100), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='INDETERMINATE'),
        sa.Column('evaluated_value', sa.JSON(), nullable=True),
        sa.Column('threshold', sa.JSON(), nullable=True),
        sa.Column('rationale', sa.Text(), nullable=True),
        sa.Column('supporting_evidence', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.ForeignKeyConstraint(['candidate_id'], ['candidate_interventions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_safety_eval_candidate_id', 'safety_constraint_evaluations', ['candidate_id'])
    op.create_index('ix_safety_eval_status', 'safety_constraint_evaluations', ['status'])


def downgrade() -> None:
    op.drop_index('ix_safety_eval_status', table_name='safety_constraint_evaluations')
    op.drop_index('ix_safety_eval_candidate_id', table_name='safety_constraint_evaluations')
    op.drop_table('safety_constraint_evaluations')

    op.drop_index('ix_candidate_decision_status', table_name='candidate_interventions')
    op.drop_index('ix_candidate_rank_position', table_name='candidate_interventions')
    op.drop_index('ix_candidate_safety_status', table_name='candidate_interventions')
    op.drop_index('ix_candidate_run_id', table_name='candidate_interventions')
    op.drop_table('candidate_interventions')

    op.drop_index('ix_rec_run_created_at', table_name='intervention_recommendation_runs')
    op.drop_index('ix_rec_run_status', table_name='intervention_recommendation_runs')
    op.drop_index('ix_rec_run_graph_id', table_name='intervention_recommendation_runs')
    op.drop_table('intervention_recommendation_runs')
