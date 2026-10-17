"""
Alembic environment configuration for CAUSAL API.

Reads DATABASE_SYNC_URL from environment.
Uses the SQLAlchemy declarative Base to autogenerate migrations.
"""

import os
import sys
from logging.config import fileConfig

# Add app parent directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool
from sqlalchemy.ext.asyncio import async_engine_from_config

# Load .env for local development
load_dotenv()

# Import Base and all models so Alembic autogenerate can detect them
from app.db.base import Base
import app.models  # noqa: F401 — registers all model classes


# Alembic Config object
config = context.config

# Override sqlalchemy.url from environment: prefer DATABASE_SYNC_URL, fallback to DATABASE_URL
db_url = os.environ.get("DATABASE_SYNC_URL") or os.environ.get("DATABASE_URL")
if db_url:
    config.set_main_option("sqlalchemy.url", db_url)

# Set up Python logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no DB connection required)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (supports sync and async engines)."""
    url = config.get_main_option("sqlalchemy.url") or ""
    if "+asyncpg" in url or "+aiosqlite" in url:
        asyncio.run(run_async_migrations())
    else:
        connectable = engine_from_config(
            config.get_section(config.config_ini_section, {}),
            prefix="sqlalchemy.",
            poolclass=pool.NullPool,
        )

        with connectable.connect() as connection:
            do_run_migrations(connection)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
