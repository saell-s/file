from __future__ import annotations

import time

from app.core.config import settings
from app.core.redis import get_redis

_memory: dict[str, tuple[int, float]] = {}


async def rate_limit_ok(key: str, limit: int | None = None, window: int | None = None) -> bool:
    """Fixed-window counter. Returns False when the caller exceeded `limit`."""
    limit = limit or settings.login_rate_limit
    window = window or settings.login_rate_window_seconds
    client = await get_redis()
    if client is None:
        count, started = _memory.get(key, (0, time.monotonic()))
        if time.monotonic() - started > window:
            count, started = 0, time.monotonic()
        count += 1
        _memory[key] = (count, started)
        return count <= limit
    try:
        pipe = client.pipeline()
        pipe.incr(key)
        pipe.expire(key, window, nx=True)
        results = await pipe.execute()
        return int(results[0]) <= limit
    except Exception:  # noqa: BLE001
        return True
