from __future__ import annotations

import secrets
from datetime import timedelta

from fastapi import APIRouter, status
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, require_owner, resolve_access, resolve_share_link
from app.core.errors import bad_request, forbidden, not_found
from app.models import ActivityAction, Node, NodePermission, Permission, ShareLink, User
from app.models.user import utcnow
from app.schemas.auth import UserBrief
from app.schemas.node import node_out
from app.schemas.share import (
    PermissionInvite,
    PermissionOut,
    PermissionUpdate,
    SharedNodeOut,
    ShareLinkCreate,
    ShareLinkOut,
)
from app.services import tree
from app.services.events import publish

router = APIRouter(prefix="/share", tags=["share"])


def _brief(user: User) -> UserBrief:
    return UserBrief(id=user.id, email=user.email, full_name=user.full_name)


def _link_out(link: ShareLink, node_name: str) -> ShareLinkOut:
    return ShareLinkOut(
        id=link.id,
        node_id=link.node_id,
        node_name=node_name,
        token=link.token,
        url=f"{settings.public_share_base_url}/{link.token}",
        permission=link.permission.value,
        expires_at=link.expires_at,
        revoked_at=link.revoked_at,
        created_at=link.created_at,
    )


def _perm_out(perm: NodePermission, node: Node, grantee: User) -> PermissionOut:
    return PermissionOut(
        id=perm.id,
        node_id=perm.node_id,
        node_name=node.name,
        permission=perm.permission.value,
        user=_brief(grantee),
        created_at=perm.created_at,
    )


@router.get("/shared-with-me", response_model=list[SharedNodeOut])
async def shared_with_me(db: DbSession, user: CurrentUser) -> list[SharedNodeOut]:
    rows = await db.execute(
        select(NodePermission, Node, User)
        .join(Node, Node.id == NodePermission.node_id)
        .join(User, User.id == Node.owner_id)
        .where(
            NodePermission.grantee_id == user.id,
            Node.is_deleted.is_(False),
            Node.owner_id != user.id,
        )
        .order_by(NodePermission.created_at.desc())
    )
    return [
        SharedNodeOut(
            node=node_out(node),
            owner=_brief(owner),
            permission=perm.permission.value,
            granted_at=perm.created_at,
        )
        for perm, node, owner in rows.all()
    ]


@router.get("/permissions", response_model=list[PermissionOut])
async def list_permissions(node_id: str, db: DbSession, user: CurrentUser) -> list[PermissionOut]:
    node = await db.get(Node, node_id)
    await require_owner(db, node, user)
    rows = await db.execute(
        select(NodePermission, User)
        .join(User, User.id == NodePermission.grantee_id)
        .where(NodePermission.node_id == node_id)
    )
    return [_perm_out(perm, node, grantee) for perm, grantee in rows.all()]


@router.post("/permissions", response_model=PermissionOut, status_code=status.HTTP_201_CREATED)
async def invite(body: PermissionInvite, db: DbSession, user: CurrentUser) -> PermissionOut:
    node = await db.get(Node, body.node_id)
    await require_owner(db, node, user)
    grantee = await db.scalar(select(User).where(User.email == body.email.lower().strip()))
    if grantee is None:
        raise not_found("No account with that email address")
    if grantee.id == user.id:
        raise bad_request("You already own this item")
    existing = await db.scalar(
        select(NodePermission).where(
            NodePermission.node_id == node.id, NodePermission.grantee_id == grantee.id
        )
    )
    permission = Permission(body.permission)
    if existing is not None:
        existing.permission = permission
        perm = existing
    else:
        perm = NodePermission(
            node_id=node.id, grantee_id=grantee.id, granted_by=user.id, permission=permission
        )
        db.add(perm)
    await db.flush()
    await tree.log_activity(db, user.id, ActivityAction.share, node.id, detail=grantee.email)
    await db.commit()
    return _perm_out(perm, node, grantee)


@router.patch("/permissions/{perm_id}", response_model=PermissionOut)
async def update_permission(
    perm_id: str, body: PermissionUpdate, db: DbSession, user: CurrentUser
) -> PermissionOut:
    perm = await db.get(NodePermission, perm_id)
    if perm is None:
        raise not_found("Permission not found")
    node = await db.get(Node, perm.node_id)
    await require_owner(db, node, user)
    grantee = await db.get(User, perm.grantee_id)
    perm.permission = Permission(body.permission)
    await db.commit()
    return _perm_out(perm, node, grantee)


@router.delete("/permissions/{perm_id}", response_model=None)
async def revoke_permission(perm_id: str, db: DbSession, user: CurrentUser):  # noqa: ANN201
    perm = await db.get(NodePermission, perm_id)
    if perm is None:
        raise not_found("Permission not found")
    node = await db.get(Node, perm.node_id)
    await require_owner(db, node, user)
    await db.delete(perm)
    await db.commit()
    return {"message": "Access revoked"}


@router.get("/links", response_model=list[ShareLinkOut])
async def my_links(db: DbSession, user: CurrentUser) -> list[ShareLinkOut]:
    rows = await db.execute(
        select(ShareLink, Node.name)
        .join(Node, Node.id == ShareLink.node_id)
        .where(ShareLink.created_by == user.id)
        .order_by(ShareLink.created_at.desc())
    )
    return [_link_out(link, name) for link, name in rows.all()]


@router.post("/links", response_model=ShareLinkOut, status_code=status.HTTP_201_CREATED)
async def create_link(body: ShareLinkCreate, db: DbSession, user: CurrentUser) -> ShareLinkOut:
    node = await db.get(Node, body.node_id)
    if node is None or node.is_deleted:
        raise not_found("Item not found")
    access = await resolve_access(db, node, user)
    if access is None:
        raise not_found("Item not found")
    if access == Permission.viewer and body.permission == Permission.editor:
        raise forbidden("You cannot grant more access than you have")

    token = secrets.token_urlsafe(18)[:24]
    expires_at = (
        utcnow() + timedelta(hours=body.expires_in_hours) if body.expires_in_hours else None
    )
    link = ShareLink(
        node_id=node.id,
        token=token,
        permission=Permission(body.permission),
        created_by=user.id,
        expires_at=expires_at,
    )
    db.add(link)
    await db.flush()
    await tree.log_activity(
        db, user.id, ActivityAction.share, node.id, detail=f"link created ({body.permission})"
    )
    await db.commit()
    await publish("link.created", {"node_id": node.id, "owner_id": user.id})
    return _link_out(link, node.name)


@router.delete("/links/{link_id}", response_model=None)
async def revoke_link(link_id: str, db: DbSession, user: CurrentUser):  # noqa: ANN201
    link = await db.get(ShareLink, link_id)
    if link is None:
        raise not_found("Link not found")
    if link.created_by != user.id:
        node = await db.get(Node, link.node_id)
        if node is None or node.owner_id != user.id:
            raise forbidden("Only the creator or owner can revoke this link")
    if link.revoked_at is None:
        link.revoked_at = utcnow()
        await db.commit()
    node = await db.get(Node, link.node_id)
    return {"message": "Link revoked", "node_name": node.name if node else ""}


@router.get("/links/{token}/resolve", response_model=SharedNodeOut)
async def resolve_link(token: str, db: DbSession) -> SharedNodeOut:
    link = await resolve_share_link(db, token)
    node = await db.get(Node, link.node_id)
    if node is None or node.is_deleted:
        raise not_found("Item not found")
    owner = await db.get(User, node.owner_id)
    link.last_accessed_at = utcnow()
    await db.commit()
    return SharedNodeOut(
        node=node_out(node),
        owner=_brief(owner),
        permission=link.permission.value,
        granted_at=link.created_at,
    )
