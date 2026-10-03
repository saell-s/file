from __future__ import annotations

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "filebox",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.jobs"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=True,
    broker_connection_retry_on_startup=True,
    result_expires=3600,
    beat_schedule={
        "purge-expired-trash": {
            "task": "app.tasks.jobs.purge_expired_trash",
            "schedule": 3600.0,
        },
        "cleanup-expired-links": {
            "task": "app.tasks.jobs.cleanup_expired_links",
            "schedule": 3600.0,
        },
        "recompute-storage-stats": {
            "task": "app.tasks.jobs.aggregate_all_storage",
            "schedule": 86400.0,
        },
    },
)
