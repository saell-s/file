from __future__ import annotations

import io
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings, sync_database_url
from app.models import Node, NodeType, ShareLink, User
from app.services.cache import cache_set_sync, storage_cache_key
from app.services.storage import driver, thumbnail_key_for
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

_session_factory: sessionmaker | None = None


def get_session() -> Session:
    global _session_factory
    if _session_factory is None:
        engine = create_engine(
            sync_database_url(),
            future=True,
            connect_args={"check_same_thread": False} if settings.is_sqlite else {},
        )
        _session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    return _session_factory()


def _usage(session: Session, owner_id: str) -> dict:
    total = session.scalar(
        select(func.coalesce(func.sum(Node.size), 0)).where(
            Node.owner_id == owner_id,
            Node.node_type == NodeType.file,
            Node.is_deleted.is_(False),
        )
    )
    rows = session.execute(
        select(Node.mime_type, func.coalesce(func.sum(Node.size), 0), func.count(Node.id))
        .where(
            Node.owner_id == owner_id,
            Node.node_type == NodeType.file,
            Node.is_deleted.is_(False),
        )
        .group_by(Node.mime_type)
    )
    by_type: dict[str, dict[str, int]] = {}
    for mime, size, count in rows:
        bucket = (mime or "").split("/", 1)[0] or "other"
        entry = by_type.setdefault(bucket, {"bytes": 0, "count": 0})
        entry["bytes"] += int(size)
        entry["count"] += int(count)
    return {"used_bytes": int(total or 0), "by_type": by_type}


@celery_app.task(name="app.tasks.jobs.purge_objects")
def purge_objects(keys: list[str]) -> int:
    driver.delete_many(keys)
    return len(keys)


@celery_app.task(name="app.tasks.jobs.generate_thumbnail")
def generate_thumbnail(node_id: str) -> str | None:
    from PIL import Image

    session = get_session()
    try:
        node = session.get(Node, node_id)
        if node is None or node.node_type != NodeType.file or not node.storage_key:
            return None
        if not (node.mime_type or "").startswith("image/"):
            return None
        data = driver.read_bytes(node.storage_key)
        if not data:
            return None
        with Image.open(io.BytesIO(data)) as img:
            img = img.convert("RGB")
            img.thumbnail((settings.thumbnail_size, settings.thumbnail_size))
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=80, optimize=True)
        key = thumbnail_key_for(node.id)
        driver.write_bytes(key, buffer.getvalue())
        node.thumbnail_key = key
        session.commit()
        return key
    except Exception:  # noqa: BLE001
        logger.warning("thumbnail generation failed for %s", node_id, exc_info=True)
        session.rollback()
        return None
    finally:
        session.close()


@celery_app.task(name="app.tasks.jobs.purge_expired_trash")
def purge_expired_trash() -> int:
    cutoff = datetime.now(UTC) - timedelta(days=settings.trash_retention_days)
    session = get_session()
    removed = 0
    try:
        roots = (
            session.scalars(
                select(Node).where(
                    Node.is_deleted.is_(True),
                    Node.deleted_root_id == Node.id,
                    Node.deleted_at.is_not(None),
                    Node.deleted_at < cutoff,
                )
            )
        ).all()

        for node in roots:
            keys = _purge_sync(session, node)
            driver.delete_many(keys)
            removed += 1
        session.commit()
    except Exception:  # noqa: BLE001
        logger.warning("trash purge failed", exc_info=True)
        session.rollback()
    finally:
        session.close()
    return removed


def _purge_sync(session: Session, node: Node) -> list[str]:
    from sqlalchemy import delete as sa_delete

    ids: list[str] = []
    stack = [node.id]
    while stack:
        current = stack.pop()
        ids.append(current)
        child_ids = session.scalars(select(Node.id).where(Node.parent_id == current))
        stack.extend(child_ids)
    rows = session.execute(select(Node.storage_key, Node.thumbnail_key).where(Node.id.in_(ids)))
    keys = {k for pair in rows.all() for k in pair if k}
    session.execute(sa_delete(Node).where(Node.id.in_(ids)))
    orphans = []
    for key in sorted(keys):
        remaining = session.scalar(
            select(func.count(Node.id)).where(
                (Node.storage_key == key) | (Node.thumbnail_key == key)
            )
        )
        if not remaining:
            orphans.append(key)
    return orphans


@celery_app.task(name="app.tasks.jobs.cleanup_expired_links")
def cleanup_expired_links() -> int:
    session = get_session()
    try:
        stale = datetime.now(UTC) - timedelta(days=7)
        result = (
            session.query(ShareLink)
            .filter(
                ((ShareLink.expires_at.is_not(None)) & (ShareLink.expires_at < stale))
                | ((ShareLink.revoked_at.is_not(None)) & (ShareLink.revoked_at < stale))
            )
            .delete(synchronize_session=False)
        )
        session.commit()
        return int(result or 0)
    finally:
        session.close()


@celery_app.task(name="app.tasks.jobs.aggregate_storage")
def aggregate_storage(user_id: str) -> dict:
    session = get_session()
    try:
        stats = _usage(session, user_id)
        cache_set_sync(storage_cache_key(user_id), stats)
        return stats
    finally:
        session.close()


@celery_app.task(name="app.tasks.jobs.aggregate_all_storage")
def aggregate_all_storage() -> int:
    session = get_session()
    try:
        user_ids = session.scalars(select(User.id)).all()
        for uid in user_ids:
            cache_set_sync(storage_cache_key(uid), _usage(session, uid))
        return len(user_ids)
    finally:
        session.close()
