from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Filebox"
    environment: str = "development"
    debug: bool = True

    api_prefix: str = "/api"
    secret_key: str = "change-me-in-production-please-32-bytes-min"
    access_token_ttl_minutes: int = 30
    refresh_token_ttl_days: int = 14
    jwt_algorithm: str = "HS256"

    database_url: str = "sqlite+aiosqlite:///./filebox.db"

    storage_dir: Path = Path("./storage")
    max_upload_bytes: int = 2 * 1024 * 1024 * 1024
    default_storage_limit_bytes: int = 15 * 1024 * 1024 * 1024

    cors_origins: str = "http://localhost:8081,http://localhost:19006,http://localhost:8080,http://localhost:3000,http://localhost:19000"

    redis_url: str = "redis://localhost:6379/0"
    redis_enabled: bool = True
    cache_ttl_seconds: int = 30

    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    event_bus: str = "redis-streams"  # noop | redis-streams | kafka
    event_stream: str = "filebox:events"
    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_topic: str = "filebox.events"

    login_rate_limit: int = 10
    login_rate_window_seconds: int = 300

    public_share_base_url: str = "http://localhost:4000/s"
    thumbnail_size: int = 256
    trash_retention_days: int = 30

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()


def sync_database_url(url: str | None = None) -> str:
    url = url or settings.database_url
    return url.replace("sqlite+aiosqlite://", "sqlite+pysqlite://").replace(
        "postgresql+asyncpg://", "postgresql+psycopg://"
    )
