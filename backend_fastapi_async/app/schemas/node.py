from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models import Node
from app.schemas.auth import UserBrief


class NodeOut(BaseModel):
    id: str
    name: str
    type: str
    parent_id: str | None = None
    size: int = 0
    mime_type: str | None = None
    is_starred: bool = False
    is_deleted: bool = False
    deleted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    has_thumbnail: bool = False
    owner: UserBrief | None = None
    permission: str | None = None


class NodeCreate(BaseModel):
    name: str = Field(default="New Folder", min_length=1, max_length=255)
    parent_id: str | None = None


class NodeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    parent_id: str | None = None


class StarToggle(BaseModel):
    is_starred: bool | None = None


class BreadcrumbOut(BaseModel):
    id: str
    name: str


class NodeListOut(BaseModel):
    items: list[NodeOut] = Field(default_factory=list)
    total: int = 0
    breadcrumbs: list[BreadcrumbOut] = Field(default_factory=list)


class RecentItemOut(NodeOut):
    last_action: str | None = None
    last_action_at: datetime | None = None


def node_out(
    node: Node,
    owner: UserBrief | None = None,
    permission: str | None = None,
    include_owner: bool = False,
) -> NodeOut:
    return NodeOut(
        id=node.id,
        name=node.name,
        type=node.type,
        parent_id=node.parent_id,
        size=node.size,
        mime_type=node.mime_type,
        is_starred=node.is_starred,
        is_deleted=node.is_deleted,
        deleted_at=node.deleted_at,
        created_at=node.created_at,
        updated_at=node.updated_at,
        has_thumbnail=bool(node.thumbnail_key),
        owner=owner if include_owner else None,
        permission=permission,
    )
