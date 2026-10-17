"""Phase 6 — Probabilistic, Time-Aware Cascade Prediction Engine

Creates the Phase 6 cascade forecast tables:
  - cascade_forecast_runs: audit log of cascade simulation executions
  - cascade_predicted_nodes: forecast outcomes and impact levels for nodes
  - cascade_propagation_paths: directed propagation paths traversed during simulation

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-10-11
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── cascade_forecast_runs ───────────────────────────────────────────────
    op.create_table(
        'cascade_forecast_runs',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('graph_id', sa.Uuid(), nullable=False),
        sa.Column('initiating_node_id', sa.Uuid(), nullable=True),
        sa.Column('rule_version', sa.String(length=50), nullable=False, server_default='1.0.0'),
        sa.Column('simulation_mode', sa.String(length=50), nullable=False, server_default='DETERMINISTIC'),
        sa.Column('calibration_status', sa.String(length=50), nullable=False, server_default='HEURISTIC_ESTIMATE'),
        sa.Column('horizon_minutes', sa.Float(), nullable=False, server_default='60.0'),
        sa.Column('max_depth', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('seed', sa.Integer(), nullable=True),
        sa.Column('source_state_timestamp', sa.DateTime(timezone=True), nullable=True),
        sa.Column('total_already_affected', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_predicted_affected', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_critical_affected', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('max_depth_reached', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('simulation_settings', sa.JSON(), nullable=True),
        sa.Column('summary', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.ForeignKeyConstraint(['graph_id'], ['infrastructure_graphs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['initiating_node_id'], ['nodes.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cascade_forecast_graph_id'), 'cascade_forecast_runs', ['graph_id'], unique=False)
    op.create_index(op.f('ix_cascade_forecast_created_at'), 'cascade_forecast_runs', ['created_at'], unique=False)

    # ── cascade_predicted_nodes ─────────────────────────────────────────────
    op.create_table(
        'cascade_predicted_nodes',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('forecast_id', sa.Uuid(), nullable=False),
        sa.Column('node_id', sa.Uuid(), nullable=False),
        sa.Column('forecast_status', sa.String(length=50), nullable=False, server_default='PREDICTED_AFFECTED'),
        sa.Column('current_state', sa.String(length=50), nullable=False),
        sa.Column('predicted_state', sa.String(length=50), nullable=False),
        sa.Column('predicted_impact_level', sa.String(length=50), nullable=False, server_default='MEDIUM'),
        sa.Column('earliest_impact_seconds', sa.Float(), nullable=True),
        sa.Column('latest_impact_seconds', sa.Float(), nullable=True),
        sa.Column('time_to_impact_range', sa.JSON(), nullable=True),
        sa.Column('propagation_probability_min', sa.Float(), nullable=True),
        sa.Column('propagation_probability_max', sa.Float(), nullable=True),
        sa.Column('propagation_probability_point', sa.Float(), nullable=True),
        sa.Column('calibration_status', sa.String(length=50), nullable=False, server_default='HEURISTIC_ESTIMATE'),
        sa.Column('depth', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('path_summary', sa.JSON(), nullable=False),
        sa.Column('contributing_causes', sa.JSON(), nullable=False),
        sa.Column('assumptions', sa.JSON(), nullable=False),
        sa.Column('limitations', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.ForeignKeyConstraint(['forecast_id'], ['cascade_forecast_runs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['node_id'], ['nodes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cascade_nodes_forecast_id'), 'cascade_predicted_nodes', ['forecast_id'], unique=False)
    op.create_index(op.f('ix_cascade_nodes_node_id'), 'cascade_predicted_nodes', ['node_id'], unique=False)

    # ── cascade_propagation_paths ───────────────────────────────────────────
    op.create_table(
        'cascade_propagation_paths',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('forecast_id', sa.Uuid(), nullable=False),
        sa.Column('source_node_id', sa.Uuid(), nullable=False),
        sa.Column('target_node_id', sa.Uuid(), nullable=False),
        sa.Column('dependency_id', sa.Uuid(), nullable=True),
        sa.Column('hop_number', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('estimated_delay_seconds', sa.Float(), nullable=True),
        sa.Column('delay_source', sa.String(length=50), nullable=False, server_default='HEURISTIC_DEFAULT'),
        sa.Column('attenuation_factor', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('propagation_rationale', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('(CURRENT_TIMESTAMP)')),
        sa.ForeignKeyConstraint(['forecast_id'], ['cascade_forecast_runs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['source_node_id'], ['nodes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['target_node_id'], ['nodes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['dependency_id'], ['dependencies.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cascade_paths_forecast_id'), 'cascade_propagation_paths', ['forecast_id'], unique=False)
    op.create_index(op.f('ix_cascade_paths_source_target'), 'cascade_propagation_paths', ['source_node_id', 'target_node_id'], unique=False)


def downgrade() -> None:
    op.drop_table('cascade_propagation_paths')
    op.drop_table('cascade_predicted_nodes')
    op.drop_table('cascade_forecast_runs')
