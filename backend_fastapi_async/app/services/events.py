from __future__ import annotations

import json
import logging
import time
from datetime import UTC, datetime
from typing import Any

from app.core.config import settings
from app.core.redis import get_redis, get_sync_redis

logger = logging.getLogger(__name__)

_producer: Any = None

_REDIS_RETRY_SECONDS = 60
_redis_down_until = 0.0
_redis_down_logged = False


def _redis_cooldown_active() -> bool:
    return time.monotonic() < _redis_down_until


def _note_redis_down(exc: BaseException) -> None:
    global _redis_down_until, _redis_down_logged
    _redis_down_until = time.monotonic() + _REDIS_RETRY_SECONDS
    if not _redis_down_logged:
        _redis_down_logged = True
        logger.warning(
            "redis event bus unavailable (%s); suppressing publishes for %ss",
            exc,
            _REDIS_RETRY_SECONDS,
        )


def _note_redis_up() -> None:
    global _redis_down_until, _redis_down_logged
    if _redis_down_logged:
        logger.info("redis event bus available again")
    _redis_down_logged = False
    _redis_down_until = 0.0


def _payload(event_type: str, payload: dict[str, Any]) -> dict[str, str]:
    return {
        "type": event_type,
        "data": json.dumps(payload, default=str),
        "ts": datetime.now(UTC).isoformat(),
    }


async def publish(event_type: str, payload: dict[str, Any]) -> None:
    bus = settings.event_bus
    if bus == "noop":
        logger.debug("event %s %s", event_type, payload)
        return
    try:
        if bus == "redis-streams":
            if _redis_cooldown_active():
                return
            client = await get_redis()
            if client is None:
                _publish_sync_redis(event_type, payload)
                return
            try:
                await client.xadd(
                    settings.event_stream, _payload(event_type, payload), maxlen=10000
                )
            except Exception as exc:  # noqa: BLE001
                _note_redis_down(exc)
                return
            _note_redis_up()
        elif bus == "kafka":
            await _publish_kafka(event_type, payload)
        else:
            logger.warning("unknown event bus %s", bus)
    except Exception:  # noqa: BLE001
        logger.warning("event publish failed for %s", event_type, exc_info=True)


def _publish_sync_redis(event_type: str, payload: dict[str, Any]) -> None:
    if _redis_cooldown_active():
        return
    client = get_sync_redis()
    if client is None:
        return
    try:
        client.xadd(settings.event_stream, _payload(event_type, payload), maxlen=10000)
    except Exception as exc:  # noqa: BLE001
        _note_redis_down(exc)
        return
    _note_redis_up()


async def _publish_kafka(event_type: str, payload: dict[str, Any]) -> None:
    global _producer
    from aiokafka import AIOKafkaProducer

    if _producer is None:
        _producer = AIOKafkaProducer(
            bootstrap_servers=settings.kafka_bootstrap_servers.split(","),
            value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
        )
        await _producer.start()
    await _producer.send_and_wait(settings.kafka_topic, {"type": event_type, "data": payload})


async def shutdown() -> None:
    global _producer
    if _producer is not None:
        import contextlib

        with contextlib.suppress(Exception):
            await _producer.stop()
        _producer = None


def publish_from_task(event_type: str, payload: dict[str, Any]) -> None:
    """Publish from synchronous code (Celery). Kafka is skipped: tasks already run in workers."""
    if settings.event_bus == "redis-streams":
        _publish_sync_redis(event_type, payload)
    else:
        logger.debug("event %s %s", event_type, payload)
