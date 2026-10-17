"""
CAUSAL API Tests — Shared fixtures.
"""

import asyncio
import uuid
from typing import AsyncGenerator, Generator

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport

from app.factory import create_application
from app.core.config import Settings


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Provide a single event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def test_settings() -> Settings:
    """Override settings for tests."""
    return Settings(
        APP_ENV="development",
        DATABASE_URL="postgresql+asyncpg://causal:causal_dev_password@localhost:5432/causal_db",
        DATABASE_SYNC_URL="postgresql://causal:causal_dev_password@localhost:5432/causal_db",
        CORS_ORIGINS="http://localhost:3000",
        SECRET_KEY="test_secret_key_at_least_32_chars_long",
        LOG_LEVEL="WARNING",
    )


@pytest.fixture(scope="session")
def app(test_settings: Settings):
    """Create the FastAPI application for testing."""
    application = create_application()
    return application


@pytest.fixture(scope="session")
def client(app) -> TestClient:
    """Synchronous test client."""
    return TestClient(app, raise_server_exceptions=False)


@pytest_asyncio.fixture(scope="session")
async def async_client(app) -> AsyncGenerator[AsyncClient, None]:
    """Async test client."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


# ── Phase 9 Auth Fixtures ─────────────────────────────────────────

TEST_USERS = {
    "ADMIN": {
        "id": uuid.UUID("73850a08-b999-44da-9b83-086fa55abcc9"),
        "email": "admin@causal.local",
        "role": "ADMIN",
    },
    "APPROVER": {
        "id": uuid.UUID("5c452d6a-7a79-44b6-b160-29c4c98bc514"),
        "email": "approver@causal.local",
        "role": "APPROVER",
    },
    "ANALYST": {
        "id": uuid.UUID("fbf627d9-bdf8-4dd5-8b41-f0defc8d10cc"),
        "email": "analyst@causal.local",
        "role": "ANALYST",
    },
    "VIEWER": {
        "id": uuid.UUID("6330b264-cd48-42e2-ab66-93e241d4b1c3"),
        "email": "viewer@causal.local",
        "role": "VIEWER",
    },
}


@pytest.fixture
def auth_headers_admin() -> dict[str, str]:
    from app.core.auth import create_access_token
    u = TEST_USERS["ADMIN"]
    token = create_access_token(u["id"], u["email"], u["role"])
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_approver() -> dict[str, str]:
    from app.core.auth import create_access_token
    u = TEST_USERS["APPROVER"]
    token = create_access_token(u["id"], u["email"], u["role"])
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_analyst() -> dict[str, str]:
    from app.core.auth import create_access_token
    u = TEST_USERS["ANALYST"]
    token = create_access_token(u["id"], u["email"], u["role"])
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_viewer() -> dict[str, str]:
    from app.core.auth import create_access_token
    u = TEST_USERS["VIEWER"]
    token = create_access_token(u["id"], u["email"], u["role"])
    return {"Authorization": f"Bearer {token}"}

