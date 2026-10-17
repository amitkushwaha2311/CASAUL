"""Phase 5 — Causal Reasoning & Evidence Engine

Creates the Phase 5 causal tables:
  - causal_inference_runs: audit log of reasoning engine executions
  - causal_hypotheses: generated explainable hypotheses
  - hypothesis_evidence: traceable evidence items linked to events, observations, dependencies, and state history

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-10-11
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── causal_inference_runs ───────────────────────────────────────────────
    op.create_table(
        'causal_inference_runs',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('graph_id', sa.Uuid(), nullable=False),
        sa.Column('target_node_id', sa.Uuid(), nullable=True),
        sa.Column('rule_version', sa.String(length=50), nullable=False, server_default='1.0.0'),
        sa.Column('analyzed_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('total_hypotheses_generated', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('input_context', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.ForeignKeyConstraint(['graph_id'], ['infrastructure_graphs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['target_node_id'], ['nodes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_causal_runs_graph_id'), 'causal_inference_runs', ['graph_id'], unique=False)
    op.create_index(op.f('ix_causal_runs_analyzed_at'), 'causal_inference_runs', ['analyzed_at'], unique=False)

    # ── causal_hypotheses ───────────────────────────────────────────────────
    op.create_table(
        'causal_hypotheses',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('run_id', sa.Uuid(), nullable=False),
        sa.Column('graph_id', sa.Uuid(), nullable=False),
        sa.Column('affected_node_id', sa.Uuid(), nullable=False),
        sa.Column('candidate_cause_node_id', sa.Uuid(), nullable=True),
        sa.Column('hypothesis_type', sa.String(length=100), nullable=False),
        sa.Column('inference_rule', sa.String(length=100), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='POSSIBLE'),
        sa.Column('explanation', sa.Text(), nullable=False),
        sa.Column('evidence_completeness_ratio', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('unresolved_assumptions', sa.JSON(), nullable=False),
        sa.Column('missing_evidence', sa.JSON(), nullable=False),
        sa.Column('confidence_assessment', sa.Text(), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.ForeignKeyConstraint(['run_id'], ['causal_inference_runs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['graph_id'], ['infrastructure_graphs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['affected_node_id'], ['nodes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['candidate_cause_node_id'], ['nodes.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_causal_hypotheses_graph_id'), 'causal_hypotheses', ['graph_id'], unique=False)
    op.create_index(op.f('ix_causal_hypotheses_affected_node_id'), 'causal_hypotheses', ['affected_node_id'], unique=False)
    op.create_index(op.f('ix_causal_hypotheses_status'), 'causal_hypotheses', ['status'], unique=False)

    # ── hypothesis_evidence ─────────────────────────────────────────────────
    op.create_table(
        'hypothesis_evidence',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('hypothesis_id', sa.Uuid(), nullable=False),
        sa.Column('graph_id', sa.Uuid(), nullable=False),
        sa.Column('related_node_id', sa.Uuid(), nullable=True),
        sa.Column('direction', sa.String(length=50), nullable=False, server_default='SUPPORTING'),
        sa.Column('evidence_type', sa.String(length=100), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('source_record_type', sa.String(length=50), nullable=False),
        sa.Column('source_record_id', sa.Uuid(), nullable=True),
        sa.Column('event_id', sa.Uuid(), nullable=True),
        sa.Column('observation_id', sa.Uuid(), nullable=True),
        sa.Column('dependency_id', sa.Uuid(), nullable=True),
        sa.Column('observed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('source', sa.String(length=100), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.ForeignKeyConstraint(['hypothesis_id'], ['causal_hypotheses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['graph_id'], ['infrastructure_graphs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['related_node_id'], ['nodes.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['observation_id'], ['observations.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['dependency_id'], ['dependencies.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_hypothesis_evidence_hypothesis_id'), 'hypothesis_evidence', ['hypothesis_id'], unique=False)
    op.create_index(op.f('ix_hypothesis_evidence_direction'), 'hypothesis_evidence', ['direction'], unique=False)


def downgrade() -> None:
    op.drop_table('hypothesis_evidence')
    op.drop_table('causal_hypotheses')
    op.drop_table('causal_inference_runs')
