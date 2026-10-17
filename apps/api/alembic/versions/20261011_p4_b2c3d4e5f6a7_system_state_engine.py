"""Phase 4 — System State & Digital Twin Engine

Creates the Phase 4 state tables:
  - state_history: append-only history of node state changes and observations
  - state_baselines: named, immutable baseline reference states
  - state_snapshots: immutable system state snapshots at logical points in time
  - scenarios: isolated scenario containers for state snapshots without mutating live state
  - source_reliabilities: domain-independent registry for sensor and source reliability metadata

Revision ID: b2c3d4e5f6a7
Revises: a18668ddffdc
Create Date: 2026-10-11
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a18668ddffdc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── state_history ────────────────────────────────────────────────────────
    op.create_table(
        'state_history',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('graph_id', sa.Uuid(), nullable=False),
        sa.Column('node_id', sa.Uuid(), nullable=False),
        sa.Column('event_id', sa.Uuid(), nullable=True),
        sa.Column('observation_id', sa.Uuid(), nullable=True),
        sa.Column('state', sa.String(length=50), nullable=True),
        sa.Column('health', sa.Float(), nullable=True),
        sa.Column('capacity', sa.Float(), nullable=True),
        sa.Column('availability', sa.Float(), nullable=True),
        sa.Column('metric', sa.String(length=100), nullable=True),
        sa.Column('value_numeric', sa.Float(), nullable=True),
        sa.Column('value_text', sa.Text(), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('source', sa.String(length=100), nullable=False),
        sa.Column('change_reason', sa.String(length=100), nullable=True),
        sa.Column('observed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('provenance_metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.ForeignKeyConstraint(['graph_id'], ['infrastructure_graphs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['node_id'], ['nodes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['observation_id'], ['observations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_state_history_graph_id'), 'state_history', ['graph_id'], unique=False)
    op.create_index(op.f('ix_state_history_node_id'), 'state_history', ['node_id'], unique=False)
    op.create_index(op.f('ix_state_history_observed_at'), 'state_history', ['observed_at'], unique=False)
    op.create_index(op.f('ix_state_history_recorded_at'), 'state_history', ['recorded_at'], unique=False)

    # ── state_baselines ──────────────────────────────────────────────────────
    op.create_table(
        'state_baselines',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('graph_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('captured_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('node_states', sa.JSON(), nullable=False),
        sa.Column('completeness_ratio', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.ForeignKeyConstraint(['graph_id'], ['infrastructure_graphs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_state_baselines_graph_id'), 'state_baselines', ['graph_id'], unique=False)
    op.create_index(op.f('ix_state_baselines_captured_at'), 'state_baselines', ['captured_at'], unique=False)

    # ── state_snapshots ──────────────────────────────────────────────────────
    op.create_table(
        'state_snapshots',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('graph_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=True),
        sa.Column('snapshot_type', sa.String(length=50), nullable=False, server_default='LIVE'),
        sa.Column('captured_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('effective_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('node_states', sa.JSON(), nullable=False),
        sa.Column('summary', sa.JSON(), nullable=True),
        sa.Column('completeness_ratio', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.ForeignKeyConstraint(['graph_id'], ['infrastructure_graphs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_state_snapshots_graph_id'), 'state_snapshots', ['graph_id'], unique=False)
    op.create_index(op.f('ix_state_snapshots_effective_at'), 'state_snapshots', ['effective_at'], unique=False)

    # ── scenarios ────────────────────────────────────────────────────────────
    op.create_table(
        'scenarios',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('graph_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('base_snapshot_id', sa.Uuid(), nullable=True),
        sa.Column('base_baseline_id', sa.Uuid(), nullable=True),
        sa.Column('state_overrides', sa.JSON(), nullable=False),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.ForeignKeyConstraint(['graph_id'], ['infrastructure_graphs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['base_snapshot_id'], ['state_snapshots.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['base_baseline_id'], ['state_baselines.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_scenarios_graph_id'), 'scenarios', ['graph_id'], unique=False)

    # ── source_reliabilities ─────────────────────────────────────────────────
    op.create_table(
        'source_reliabilities',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('source', sa.String(length=100), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='ACTIVE'),
        sa.Column('reliability_score', sa.Float(), nullable=True),
        sa.Column('last_validated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('source')
    )
    op.create_index(op.f('ix_source_reliabilities_source'), 'source_reliabilities', ['source'], unique=True)


def downgrade() -> None:
    op.drop_table('source_reliabilities')
    op.drop_table('scenarios')
    op.drop_table('state_snapshots')
    op.drop_table('state_baselines')
    op.drop_table('state_history')
