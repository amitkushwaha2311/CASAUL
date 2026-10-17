"""
CAUSAL API Tests — Configuration tests.
"""

import pytest
from app.core.config import Settings


class TestSettings:
    """Test that settings load correctly and validation works."""

    def test_settings_can_be_instantiated(self) -> None:
        """Settings must be instantiable with default values."""
        settings = Settings(
            DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/db",
            DATABASE_SYNC_URL="postgresql://user:pass@localhost:5432/db",
            SECRET_KEY="a_sufficiently_long_test_secret_key_value",
        )
        assert settings is not None

    def test_cors_origins_list_parses_single(self) -> None:
        settings = Settings(
            DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/db",
            DATABASE_SYNC_URL="postgresql://u:p@localhost:5432/db",
            CORS_ORIGINS="http://localhost:3000",
        )
        assert settings.cors_origins_list == ["http://localhost:3000"]

    def test_cors_origins_list_parses_multiple(self) -> None:
        settings = Settings(
            DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/db",
            DATABASE_SYNC_URL="postgresql://u:p@localhost:5432/db",
            CORS_ORIGINS="http://localhost:3000,http://localhost:3001",
        )
        assert len(settings.cors_origins_list) == 2
        assert "http://localhost:3000" in settings.cors_origins_list
        assert "http://localhost:3001" in settings.cors_origins_list

    def test_app_version_is_set(self) -> None:
        settings = Settings(
            DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/db",
            DATABASE_SYNC_URL="postgresql://u:p@localhost:5432/db",
        )
        assert settings.APP_VERSION == "0.1.0"

    def test_phase1_features_default_disabled(self) -> None:
        """All Phase 2+ features must default to disabled."""
        settings = Settings(
            DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/db",
            DATABASE_SYNC_URL="postgresql://u:p@localhost:5432/db",
        )
        assert settings.ENABLE_CAUSAL_ENGINE is False
        assert settings.ENABLE_SIMULATION is False
        assert settings.ENABLE_INTERVENTIONS is False

    def test_is_production_returns_false_in_dev(self) -> None:
        settings = Settings(
            APP_ENV="development",
            DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/db",
            DATABASE_SYNC_URL="postgresql://u:p@localhost:5432/db",
        )
        assert settings.is_production is False

    def test_is_production_returns_true_in_production(self) -> None:
        settings = Settings(
            APP_ENV="production",
            DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/db",
            DATABASE_SYNC_URL="postgresql://u:p@localhost:5432/db",
        )
        assert settings.is_production is True

    def test_requires_secure_secret_key_in_staging_and_prod(self) -> None:
        s_dev = Settings(
            APP_ENV="development",
            DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/db",
            DATABASE_SYNC_URL="postgresql://u:p@localhost:5432/db",
        )
        assert s_dev.requires_secure_secret_key is False

        s_staging = Settings(
            APP_ENV="staging",
            DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/db",
            DATABASE_SYNC_URL="postgresql://u:p@localhost:5432/db",
        )
        assert s_staging.requires_secure_secret_key is True

        s_prod = Settings(
            APP_ENV="production",
            DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/db",
            DATABASE_SYNC_URL="postgresql://u:p@localhost:5432/db",
        )
        assert s_prod.requires_secure_secret_key is True
