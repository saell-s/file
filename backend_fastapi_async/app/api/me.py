from __future__ import annotations

from fastapi import APIRouter, Query
from sqlalchemy import delete, func, select

from app.core.deps import CurrentUser, DbSession
from app.core.errors import bad_request, unauthorized
from app.core.security import hash_password, verify_password
from app.models import ActivityAction, ActivityLog, User
from app.schemas.auth import PasswordChange, ProfileUpdate, UserOut
from app.schemas.common import Message
from app.schemas.user import SecurityEventOut, StorageOut
from app.services import tree
from app.services.cache import cache_get, cache_set, storage_cache_key

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=UserOut)
async def get_profile(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.patch("", response_model=UserOut)
async def update_profile(body: ProfileUpdate, user: CurrentUser, db: DbSession) -> UserOut:
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.email is not None and body.email.lower() != user.email:
        taken = await db.scalar(
            select(User.id).where(func.lower(User.email) == body.email.lower(), User.id != user.id)
        )
        if taken is not None:
            raise bad_request("That email is already in use")
        user.email = body.email.lower().strip()
    await db.commit()
    return UserOut.model_validate(user)


@router.post("/password", response_model=Message)
async def change_password(body: PasswordChange, user: CurrentUser, db: DbSession) -> Message:
    if not verify_password(body.current_password, user.hashed_password):
        raise unauthorized("Current password is incorrect")
    user.hashed_password = hash_password(body.new_password)
    db.add(ActivityLog(user_id=user.id, action=ActivityAction.edit, detail="password changed"))
    await db.commit()
    return Message(message="Password updated")


@router.get("/storage", response_model=StorageOut)
async def storage(user: CurrentUser, db: DbSession) -> StorageOut:
    key = storage_cache_key(user.id)
    cached = await cache_get(key)
    if cached is None:
        stats = await tree.usage_stats(db, user.id)
        await cache_set(key, stats, ttl=settings_cache_ttl())
    else:
        stats = cached
    used = int(stats.get("used_bytes", 0))
    limit = user.storage_limit_bytes or 1
    return StorageOut(
        used_bytes=used,
        limit_bytes=limit,
        percent_used=round(min(used / limit, 1.0) * 100, 2),
        by_type=stats.get("by_type", {}),
        tier="free",
    )


def settings_cache_ttl() -> int:
    from app.core.config import settings

    return settings.cache_ttl_seconds


@router.get("/activity", response_model=list[SecurityEventOut])
async def activity(
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[SecurityEventOut]:
    rows = await db.scalars(
        select(ActivityLog)
        .where(ActivityLog.user_id == user.id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    )
    return [
        SecurityEventOut(
            id=r.id,
            action=r.action.value,
            detail=r.detail,
            ip=r.ip,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.delete("/activity", response_model=Message)
async def clear_activity(user: CurrentUser, db: DbSession) -> Message:
    await db.execute(delete(ActivityLog).where(ActivityLog.user_id == user.id))
    await db.commit()
    return Message(message="Activity log cleared")
