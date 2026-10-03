from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.errors import forbidden, not_found, unauthorized
from app.core.security import decode_token
from app.models import Node, NodePermission, Permission, ShareLink, User
from app.models.share import PERM_ORDER

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(request: Request, db: DbSession) -> User:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise unauthorized("Missing bearer token")
    user_id = decode_token(auth.removeprefix("Bearer ").strip())
    if not user_id:
        raise unauthorized()
    user = await db.get(User, user_id)
    if user is None:
        raise unauthorized("Account no longer exists")
    return user


async def get_optional_user(request: Request, db: DbSession) -> User | None:
    try:
        return await get_current_user(request, db)
    except Exception:  # noqa: BLE001
        return None


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


async def require_file_access(
    db: AsyncSession, node: Node | None, user: User | None, share_token: str | None
) -> None:
    """Files can be reached by an authenticated user OR by a valid public share link."""
    if node is None or node.is_deleted:
        raise not_found("Item not found")
    if user is not None:
        await require_access(db, node, user)
        return
    if share_token:
        link = await resolve_share_link(db, share_token)
        current: Node | None = node
        depth = 0
        while current is not None and depth < 64:
            if current.id == link.node_id:
                return
            current = await db.get(Node, current.parent_id) if current.parent_id else None
            depth += 1
    raise unauthorized("Sign in or provide a valid share link")


async def _permission_for(db: AsyncSession, node: Node, user: User) -> Permission | None:
    """Walk the ancestor chain looking for a grant to `user`. Grants inherit downwards."""
    current: Node | None = node
    depth = 0
    while current is not None and depth < 64:
        if current.owner_id == user.id:
            return Permission.editor
        row = await db.scalar(
            select(NodePermission).where(
                NodePermission.node_id == current.id, NodePermission.grantee_id == user.id
            )
        )
        if row is not None:
            return row.permission
        current = await db.get(Node, current.parent_id) if current.parent_id else None
        depth += 1
    return None


async def resolve_access(db: AsyncSession, node: Node, user: User) -> Permission | None:
    return await _permission_for(db, node, user)


async def require_access(
    db: AsyncSession, node: Node | None, user: User, minimum: Permission = Permission.viewer
) -> Node:
    if node is None or node.is_deleted:
        raise not_found("Item not found")
    access = await _permission_for(db, node, user)
    if access is None:
        raise not_found("Item not found")
    if PERM_ORDER[access] < PERM_ORDER[minimum]:
        raise forbidden("Editor permission required for this action")
    return node


async def require_owner(db: AsyncSession, node: Node | None, user: User) -> Node:
    if node is None or node.is_deleted:
        raise not_found("Item not found")
    if node.owner_id != user.id:
        raise forbidden("Only the owner can do that")
    return node


async def resolve_share_link(db: AsyncSession, token: str) -> ShareLink:
    from app.models.user import as_utc, utcnow

    link = await db.scalar(select(ShareLink).where(ShareLink.token == token))
    if link is None or link.revoked_at is not None:
        raise not_found("This link is no longer available")
    if link.expires_at is not None and as_utc(link.expires_at) <= utcnow():
        raise not_found("This link has expired")
    return link
