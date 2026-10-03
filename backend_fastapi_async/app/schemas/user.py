from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas.auth import UserOut


class ProfileOut(UserOut):
    pass


class StorageOut(BaseModel):
    used_bytes: int
    limit_bytes: int
    percent_used: float
    by_type: dict[str, dict[str, int]] = {}
    tier: str = "free"


class SecurityEventOut(BaseModel):
    id: str
    action: str
    detail: str | None = None
    ip: str | None = None
    created_at: datetime
