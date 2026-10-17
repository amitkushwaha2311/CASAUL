"""Phase 2 — Infrastructure Graph Engine

Creates the three core graph tables:
  - infrastructure_graphs: top-level directed graph containers
  - nodes: system entities within a graph
  - dependencies: directed dependency edges (source → target means target depends on source)

Design decisions:
  - UUID primary keys for distributed-safe IDs
  - JSON (not JSONB) for metadata fields: allows SQLite for dev/test, PostgreSQL for production
  - Uniqueness constraint on (graph_id, source_node_id, target_node_id) prevents duplicate edges
  - All metric columns have CHECK constraints enforcing [0.0, 1.0] ranges
  - CASCADE deletes: removing a graph removes all its nodes and dependencies
  - Proper indexes on foreign keys and frequently-queried columns

Revision ID: a1b2c3d4e5f6
Revises: e09ac39151e3
Create Date: 2026-10-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "e09ac39151e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── infrastructure_graphs ──────────────────────────────────────────────
    op.create_table(
        "infrastructure_graphs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("domain", sa.String(length=100), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_infrastructure_graphs_id"), "infrastructure_graphs", ["id"], unique=False
    )

    # ── nodes ──────────────────────────────────────────────────────────────
    op.create_table(
        "nodes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "graph_id",
            sa.Uuid(),
            sa.ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("state", sa.String(length=50), nullable=False, server_default="NORMAL"),
        sa.Column("health", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("capacity", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("criticality", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("location", sa.JSON(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        # Range constraints — enforced at service layer too; DB is double safety
        sa.CheckConstraint("health >= 0.0 AND health <= 1.0", name="ck_nodes_health"),
        sa.CheckConstraint("capacity >= 0.0 AND capacity <= 1.0", name="ck_nodes_capacity"),
        sa.CheckConstraint(
            "criticality >= 0.0 AND criticality <= 1.0", name="ck_nodes_criticality"
        ),
    )
    op.create_index(op.f("ix_nodes_id"), "nodes", ["id"], unique=False)
    op.create_index(op.f("ix_nodes_graph_id"), "nodes", ["graph_id"], unique=False)
    op.create_index("ix_nodes_graph_id_state", "nodes", ["graph_id", "state"], unique=False)

    # ── dependencies ───────────────────────────────────────────────────────
    op.create_table(
        "dependencies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "graph_id",
            sa.Uuid(),
            sa.ForeignKey("infrastructure_graphs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "source_node_id",
            sa.Uuid(),
            sa.ForeignKey("nodes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "target_node_id",
            sa.Uuid(),
            sa.ForeignKey("nodes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("dependency_type", sa.String(length=100), nullable=False),
        sa.Column("strength", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("failure_propagation", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        # No self-loops enforced at service layer (DB CHECK not portable across SQLite/PG)
        sa.UniqueConstraint(
            "graph_id", "source_node_id", "target_node_id", name="uq_dependency_edge"
        ),
        sa.CheckConstraint(
            "strength >= 0.0 AND strength <= 1.0", name="ck_dependencies_strength"
        ),
        sa.CheckConstraint(
            "failure_propagation >= 0.0 AND failure_propagation <= 1.0",
            name="ck_dependencies_failure_propagation",
        ),
    )
    op.create_index(op.f("ix_dependencies_id"), "dependencies", ["id"], unique=False)
    op.create_index(
        op.f("ix_dependencies_graph_id"), "dependencies", ["graph_id"], unique=False
    )
    op.create_index(
        op.f("ix_dependencies_source_node_id"),
        "dependencies",
        ["source_node_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_dependencies_target_node_id"),
        "dependencies",
        ["target_node_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_dependencies_target_node_id"), table_name="dependencies")
    op.drop_index(op.f("ix_dependencies_source_node_id"), table_name="dependencies")
    op.drop_index(op.f("ix_dependencies_graph_id"), table_name="dependencies")
    op.drop_index(op.f("ix_dependencies_id"), table_name="dependencies")
    op.drop_table("dependencies")

    op.drop_index("ix_nodes_graph_id_state", table_name="nodes")
    op.drop_index(op.f("ix_nodes_graph_id"), table_name="nodes")
    op.drop_index(op.f("ix_nodes_id"), table_name="nodes")
    op.drop_table("nodes")

    op.drop_index(op.f("ix_infrastructure_graphs_id"), table_name="infrastructure_graphs")
    op.drop_table("infrastructure_graphs")
