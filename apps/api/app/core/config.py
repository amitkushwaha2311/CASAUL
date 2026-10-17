"""
CAUSAL API — Core configuration (Phase 9 extended).

All configuration is loaded from environment variables using pydantic-settings.
Never hardcode secrets. Never import this at module level in tests — use
get_settings() with dependency injection.

Phase 9 additions:
  - ACCESS_TOKEN_EXPIRE_MINUTES — JWT lifetime
  - has_secure_secret_key property — startup validation helper
"""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────
    APP_ENV: Literal["development", "staging", "production"] = "development"
    APP_VERSION: str = "0.1.0"
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    # ── API Server ───────────────────────────────────────────────
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    # ── Database ─────────────────────────────────────────────────
    DATABASE_URL: str = (
        "postgresql+asyncpg://causal:causal_dev_password@localhost:5432/causal_db"
    )
    DATABASE_SYNC_URL: str = (
        "postgresql://causal:causal_dev_password@localhost:5432/causal_db"
    )

    # ── CORS ─────────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:3000"

    # ── Security ─────────────────────────────────────────────────
    # SECRET_KEY is used to sign JWT access tokens.
    # MUST be set to a strong random value (>=32 chars) in production.
    # Generate with: python -c "import secrets; print(secrets.token_hex(32))"
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION"

    # JWT access token lifetime in minutes.
    # Recommended: <=60 for sensitive deployments.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # ── Feature flags ────────────────────────────────────────────
    ENABLE_CAUSAL_ENGINE: bool = False
    ENABLE_SIMULATION: bool = False
    ENABLE_INTERVENTIONS: bool = False

    @field_validator("SECRET_KEY")
    @classmethod
    def secret_key_must_be_set(cls, v: str) -> str:
        if v == "CHANGE_ME_IN_PRODUCTION":
            # Allow in dev but warn -- enforcement happens at startup
            pass
        return v

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse comma-separated CORS origins into a list."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def requires_secure_secret_key(self) -> bool:
        """True if running in an environment requiring strict secret security (staging or production)."""
        return self.APP_ENV in ("production", "staging")

    @property
    def has_secure_secret_key(self) -> bool:
        """
        True only if SECRET_KEY has been replaced from the insecure default
        AND is at least 32 characters long.

        Use during startup validation:
            if settings.requires_secure_secret_key and not settings.has_secure_secret_key:
                raise RuntimeError("SECRET_KEY must be set in staging or production.")
        """
        return self.SECRET_KEY != "CHANGE_ME_IN_PRODUCTION" and len(self.SECRET_KEY) >= 32


@lru_cache
def get_settings() -> Settings:
    """Return the cached application settings singleton."""
    return Settings()
