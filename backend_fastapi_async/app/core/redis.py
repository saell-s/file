from __future__ import annotations

import logging
import time
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: Any = None
_client_failed = False
_client_failed_at = 0.0
_failure_logged = False
_RETRY_SECONDS = 60


def get_sync_redis():  # noqa: ANN201
    if not settings.redis_enabled:
        return None
    try:
        import redis

        return redis.Redis.from_url(settings.celery_broker_url, decode_responses=True)
    except Exception as exc:  # noqa: BLE001
        logger.warning("sync redis unavailable: %s", exc)
        return None


async def get_redis():  # noqa: ANN201
    global _client, _client_failed, _client_failed_at, _failure_logged
    if not settings.redis_enabled:
        return None
    if _client_failed and time.monotonic() - _client_failed_at < _RETRY_SECONDS:
        return None
    if _client is not None:
        return _client
    try:
        from redis.asyncio import Redis

        client = Redis.from_url(settings.redis_url, decode_responses=True)
        await client.ping()
        if _failure_logged:
            logger.info("redis cache available again")
        _client = client
        _client_failed = False
        _failure_logged = False
        return client
    except Exception as exc:  # noqa: BLE001
        _client_failed = True
        _client_failed_at = time.monotonic()
        if not _failure_logged:
            _failure_logged = True
            logger.warning(
                "async redis unavailable (%s), using in-process cache; retrying every %ss",
                exc,
                _RETRY_SECONDS,
            )
        return None


async def close_redis() -> None:
    global _client, _client_failed, _failure_logged
    if _client is not None:
        import contextlib

        with contextlib.suppress(Exception):
            await _client.aclose()
    _client = None
    _client_failed = False
    _failure_logged = False
