"""Phase 9 — Identity, Access Control, Audit Integrity & Operational Readiness

Adds:
  - users table: hashed_password, role, last_login_at
  - audit_logs table: outcome, actor_email, resource_type, resource_id, context
  - Preserves historical decided_by provenance in candidate_interventions
  - Supports both SQLite and PostgreSQL via batch_alter_table with introspection

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-10-14
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # ── users extensions ───────────────────────────────────────────────────
    user_cols = {c['name'] for c in insp.get_columns('users')}
    user_indices = {idx['name'] for idx in insp.get_indexes('users')}

    with op.batch_alter_table('users') as batch_op:
        if 'hashed_password' not in user_cols:
            batch_op.add_column(sa.Column('hashed_password', sa.String(length=255), nullable=True))
        if 'role' not in user_cols:
            batch_op.add_column(
                sa.Column(
                    'role',
                    sa.String(length=50),
                    nullable=False,
                    server_default='VIEWER',
                )
            )
        if 'last_login_at' not in user_cols:
            batch_op.add_column(sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True))
        if 'ix_users_role' not in user_indices:
            batch_op.create_index('ix_users_role', ['role'], unique=False)

    # ── audit_logs extensions ──────────────────────────────────────────────
    audit_cols = {c['name'] for c in insp.get_columns('audit_logs')}
    audit_indices = {idx['name'] for idx in insp.get_indexes('audit_logs')}

    with op.batch_alter_table('audit_logs') as batch_op:
        if 'outcome' not in audit_cols:
            batch_op.add_column(
                sa.Column(
                    'outcome',
                    sa.String(length=32),
                    nullable=False,
                    server_default='success',
                )
            )
        if 'actor_email' not in audit_cols:
            batch_op.add_column(sa.Column('actor_email', sa.String(length=255), nullable=True))
        if 'resource_type' not in audit_cols:
            batch_op.add_column(sa.Column('resource_type', sa.String(length=128), nullable=True))
        if 'resource_id' not in audit_cols:
            batch_op.add_column(sa.Column('resource_id', sa.Uuid(), nullable=True))
        if 'context' not in audit_cols:
            batch_op.add_column(sa.Column('context', sa.JSON(), nullable=True))
        if 'ix_audit_logs_resource' not in audit_indices:
            batch_op.create_index('ix_audit_logs_resource', ['resource_type', 'resource_id'], unique=False)
        if 'ix_audit_logs_actor_action' not in audit_indices:
            batch_op.create_index('ix_audit_logs_actor_action', ['actor_id', 'action'], unique=False)
        if 'ix_audit_logs_outcome' not in audit_indices:
            batch_op.create_index('ix_audit_logs_outcome', ['outcome'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('audit_logs') as batch_op:
        batch_op.drop_index('ix_audit_logs_outcome')
        batch_op.drop_index('ix_audit_logs_actor_action')
        batch_op.drop_index('ix_audit_logs_resource')
        batch_op.drop_column('context')
        batch_op.drop_column('resource_id')
        batch_op.drop_column('resource_type')
        batch_op.drop_column('actor_email')
        batch_op.drop_column('outcome')

    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_index('ix_users_role')
        batch_op.drop_column('last_login_at')
        batch_op.drop_column('role')
        batch_op.drop_column('hashed_password')
