from __future__ import annotations

import logging
import time
from typing import Any

from app.core.config import settings
from app.core.redis import get_redis

logger = logging.getLogger(__name__)

_memory: dict[str, tuple[float, str]] = {}


def _mem_get(key: str) -> str | None:
    item = _memory.get(key)
    if item is None:
        return None
    expires, value = item
    if expires < time.monotonic():
        _memory.pop(key, None)
        return None
    return value


def _mem_set(key: str, value: str, ttl: int) -> None:
    _memory[key] = (time.monotonic() + ttl, value)


async def cache_get(key: str) -> Any | None:
    client = await get_redis()
    if client is None:
        raw = _mem_get(key)
    else:
        try:
            raw = await client.get(key)
        except Exception:  # noqa: BLE001
            raw = _mem_get(key)
    if raw is None:
        return None
    import json

    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


async def cache_set(key: str, value: Any, ttl: int | None = None) -> None:
    import json

    ttl = ttl if ttl is not None else settings.cache_ttl_seconds
    raw = json.dumps(value, default=str)
    client = await get_redis()
    if client is None:
        _mem_set(key, raw, ttl)
        return
    try:
        await client.set(key, raw, ex=ttl)
    except Exception:  # noqa: BLE001
        _mem_set(key, raw, ttl)


async def cache_delete(*keys: str) -> None:
    import contextlib

    for key in keys:
        _memory.pop(key, None)
    client = await get_redis()
    if client is None or not keys:
        return
    with contextlib.suppress(Exception):
        await client.delete(*keys)


def cache_delete_sync(*keys: str) -> None:
    import contextlib

    from app.core.redis import get_sync_redis

    for key in keys:
        _memory.pop(key, None)
    client = get_sync_redis()
    if client is None or not keys:
        return
    with contextlib.suppress(Exception):
        client.delete(*keys)


def cache_set_sync(key: str, value: Any, ttl: int | None = None) -> None:
    import json

    from app.core.redis import get_sync_redis

    ttl = ttl if ttl is not None else settings.cache_ttl_seconds
    raw = json.dumps(value, default=str)
    client = get_sync_redis()
    if client is None:
        _mem_set(key, raw, ttl)
        return
    try:
        client.set(key, raw, ex=ttl)
    except Exception:  # noqa: BLE001
        _mem_set(key, raw, ttl)


def storage_cache_key(user_id: str) -> str:
    return f"storage:{user_id}"
