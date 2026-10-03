"""Event-bus consumer worker.

Usage:
    python -m app.worker.consumer --bus redis
    python -m app.worker.consumer --bus kafka

Consumes domain events published by the API (Redis Streams or Kafka) and fans
them out to Celery jobs. This keeps slow/duplicable work out of the request
cycle and lets external systems subscribe to the same stream later.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging

from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("filebox.consumer")

GROUP = "filebox-workers"


def handle(event_type: str, data: dict) -> None:
    logger.info("event %s -> %s", event_type, data)
    try:
        if event_type == "file.uploaded":
            from app.tasks.jobs import aggregate_storage

            aggregate_storage.delay(data.get("owner_id"))
        elif event_type == "node.deleted":
            from app.tasks.jobs import aggregate_storage

            if data.get("owner_id"):
                aggregate_storage.delay(data["owner_id"])
    except Exception:  # noqa: BLE001
        logger.warning("handler failed for %s", event_type, exc_info=True)


def _dispatch(fields: dict) -> None:
    event_type = fields.get("type", "unknown")
    raw = fields.get("data", "{}")
    try:
        data = json.loads(raw) if isinstance(raw, str) else dict(raw)
    except (TypeError, ValueError):
        data = {}
    handle(event_type, data)


async def run_redis() -> None:
    from app.core.redis import get_redis

    client = await get_redis()
    if client is None:
        raise SystemExit("Redis is not available; start Redis or use --bus kafka")
    import contextlib

    with contextlib.suppress(Exception):
        await client.xgroup_create(settings.event_stream, GROUP, id="0", mkstream=True)
    logger.info("consuming stream %s as group %s", settings.event_stream, GROUP)
    while True:
        try:
            blocks = await client.xreadgroup(
                GROUP, "worker-1", {settings.event_stream: ">"}, count=20, block=5000
            )
        except Exception:  # noqa: BLE001
            logger.warning("stream read failed", exc_info=True)
            await asyncio.sleep(2)
            continue
        if not blocks:
            continue
        for _stream, messages in blocks:
            for message_id, fields in messages:
                _dispatch(fields)
                await client.xack(settings.event_stream, GROUP, message_id)


async def run_kafka() -> None:
    from aiokafka import AIOKafkaConsumer

    consumer = AIOKafkaConsumer(
        settings.kafka_topic,
        bootstrap_servers=settings.kafka_bootstrap_servers.split(","),
        group_id=GROUP,
        enable_auto_commit=False,
        auto_offset_reset="earliest",
    )
    await consumer.start()
    logger.info("consuming kafka topic %s", settings.kafka_topic)
    try:
        async for message in consumer:
            try:
                payload = json.loads(message.value.decode("utf-8"))
            except (ValueError, AttributeError):
                continue
            handle(payload.get("type", "unknown"), payload.get("data") or {})
            await consumer.commit()
    finally:
        await consumer.stop()


async def main(bus: str) -> None:
    if bus == "kafka":
        await run_kafka()
    elif bus in {"redis", "redis-streams"}:
        await run_redis()
    else:
        raise SystemExit(f"unsupported bus: {bus}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Filebox event consumer")
    parser.add_argument(
        "--bus",
        default="redis" if settings.event_bus != "kafka" else "kafka",
        choices=["redis", "kafka"],
    )
    args = parser.parse_args()
    try:
        asyncio.run(main(args.bus))
    except KeyboardInterrupt:
        logger.info("consumer stopped")
