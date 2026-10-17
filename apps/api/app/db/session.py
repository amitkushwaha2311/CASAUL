"""
CAUSAL API — Database session management.

Uses SQLAlchemy async engine + session factory.
The engine is created once and shared across the application.
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from app.core.config import get_settings

settings = get_settings()


def get_async_database_url(url: str) -> str:
    """Normalize database URL for async engines (asyncpg / aiosqlite)."""
    if not url:
        return url
    if url.startswith("sqlite://"):
        return url.replace("sqlite://", "sqlite+aiosqlite://", 1)
    if (
        url.startswith("postgresql://")
        or url.startswith("postgres://")
        or url.startswith("postgresql+asyncpg://")
    ):
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        asyncpg_params: dict[str, str] = {}
        sslmode = query_params.get("sslmode", [""])[0]
        ssl_val = query_params.get("ssl", [""])[0]
        if sslmode in ("require", "verify-ca", "verify-full") or ssl_val in ("require", "true", "1"):
            asyncpg_params["ssl"] = "require"
        return urlunparse((
            "postgresql+asyncpg",
            parsed.netloc,
            parsed.path,
            parsed.params,
            urlencode(asyncpg_params),
            parsed.fragment,
        ))
    return url


from sqlalchemy.pool import NullPool

engine = create_async_engine(
    get_async_database_url(settings.DATABASE_URL),
    echo=False,          # Set to True for SQL debugging
    poolclass=NullPool,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields a database session.

    Usage:
        @router.get("/example")
        async def example(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
