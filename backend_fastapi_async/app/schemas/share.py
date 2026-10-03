from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.auth import UserBrief
from app.schemas.node import NodeOut


class PermissionInvite(BaseModel):
    node_id: str
    email: EmailStr
    permission: str = Field(default="viewer", pattern="^(viewer|editor)$")


class PermissionUpdate(BaseModel):
    permission: str = Field(pattern="^(viewer|editor)$")


class PermissionOut(BaseModel):
    id: str
    node_id: str
    node_name: str = ""
    permission: str
    user: UserBrief
    created_at: datetime


class ShareLinkCreate(BaseModel):
    node_id: str
    permission: str = Field(default="viewer", pattern="^(viewer|editor)$")
    expires_in_hours: int | None = Field(default=None, ge=1, le=24 * 365)


class ShareLinkOut(BaseModel):
    id: str
    node_id: str
    node_name: str
    token: str
    url: str
    permission: str
    expires_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime


class SharedNodeOut(BaseModel):
    node: NodeOut
    owner: UserBrief
    permission: str
    granted_at: datetime
