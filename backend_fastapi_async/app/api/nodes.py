from __future__ import annotations

from fastapi import APIRouter, Query, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, DbSession, require_access, require_owner
from app.core.errors import bad_request, forbidden, not_found
from app.models import Node, NodePermission, NodeType, Permission, User
from app.schemas.auth import UserBrief
from app.schemas.common import Message
from app.schemas.node import (
    BreadcrumbOut,
    NodeCreate,
    NodeListOut,
    NodeOut,
    NodeUpdate,
    node_out,
)
from app.services import tree
from app.services.events import publish

router = APIRouter(prefix="/nodes", tags=["nodes"])
trash_router = APIRouter(prefix="/trash", tags=["trash"])

SORTABLE = {
    "name": Node.name,
    "size": Node.size,
    "date": Node.updated_at,
    "created": Node.created_at,
}


def _owner_brief(user: User | None) -> UserBrief | None:
    return UserBrief(id=user.id, email=user.email, full_name=user.full_name) if user else None


async def _owner_map(db: AsyncSession, nodes: list[Node]) -> dict[str, UserBrief]:
    owner_ids = {n.owner_id for n in nodes}
    if not owner_ids:
        return {}
    rows = await db.scalars(select(User).where(User.id.in_(owner_ids)))
    return {u.id: UserBrief(id=u.id, email=u.email, full_name=u.full_name) for u in rows}


@router.get("", response_model=NodeListOut)
async def list_nodes(
    db: DbSession,
    user: CurrentUser,
    parent_id: str | None = Query(default=None),
    sort: str = Query(default="name"),
    order: str = Query(default="asc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
) -> NodeListOut:
    breadcrumbs: list[BreadcrumbOut] = []
    if parent_id is None:
        conditions = [Node.parent_id.is_(None), Node.owner_id == user.id]
    else:
        parent = await db.get(Node, parent_id)
        await require_access(db, parent, user)
        conditions = [Node.parent_id == parent_id]
        chain = await tree.ancestors(db, parent)
        breadcrumbs = [
            BreadcrumbOut(id=n.id, name=n.name) for n in [*chain, parent] if not n.is_deleted
        ]
    conditions.append(Node.is_deleted.is_(False))

    sort_col = SORTABLE.get(sort, Node.name)
    direction = sort_col.desc() if order == "desc" else sort_col.asc()
    type_rank = case((Node.node_type == NodeType.folder, 0), else_=1)

    total = await db.scalar(select(func.count(Node.id)).where(*conditions)) or 0
    rows = await db.execute(
        select(Node, User)
        .join(User, User.id == Node.owner_id)
        .where(*conditions)
        .order_by(type_rank, direction, Node.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [node_out(node, owner=_owner_brief(owner)) for node, owner in rows.all()]
    return NodeListOut(items=items, total=total, breadcrumbs=breadcrumbs)


@router.get("/starred", response_model=NodeListOut)
async def starred(db: DbSession, user: CurrentUser) -> NodeListOut:
    rows = await db.execute(
        select(Node, User)
        .join(User, User.id == Node.owner_id)
        .where(
            Node.owner_id == user.id,
            Node.is_starred.is_(True),
            Node.is_deleted.is_(False),
        )
        .order_by(Node.updated_at.desc())
    )
    items = [node_out(node, owner=_owner_brief(owner)) for node, owner in rows.all()]
    return NodeListOut(items=items, total=len(items))


@router.get("/search", response_model=NodeListOut)
async def search(
    db: DbSession,
    user: CurrentUser,
    q: str = Query(min_length=1, max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
) -> NodeListOut:
    shared = (
        select(NodePermission.node_id.label("id"))
        .where(NodePermission.grantee_id == user.id)
        .cte("shared_roots", recursive=True)
    )
    child = Node.__table__.alias("shared_child")
    shared = shared.union(select(child.c.id).where(child.c.parent_id == shared.c.id))

    pattern = f"%{q.strip()}%"
    rows = await db.execute(
        select(Node, User)
        .join(User, User.id == Node.owner_id)
        .where(
            Node.is_deleted.is_(False),
            Node.name.ilike(pattern),
            or_(
                Node.owner_id == user.id,
                Node.id.in_(select(shared.c.id)),
            ),
        )
        .order_by(Node.name)
        .limit(limit)
    )
    items = [node_out(node, owner=_owner_brief(owner)) for node, owner in rows.all()]
    return NodeListOut(items=items, total=len(items))


@router.get("/recent", response_model=NodeListOut)
async def recent(db: DbSession, user: CurrentUser) -> NodeListOut:
    nodes = await tree.recent_nodes(db, user.id)
    owners = await _owner_map(db, nodes)
    items = [node_out(n, owner=owners.get(n.owner_id)) for n in nodes]
    return NodeListOut(items=items, total=len(items))


@router.post("/folders", response_model=NodeOut, status_code=status.HTTP_201_CREATED)
async def create_folder(body: NodeCreate, db: DbSession, user: CurrentUser) -> NodeOut:
    parent_id = body.parent_id
    if parent_id is not None:
        parent = await db.get(Node, parent_id)
        await require_access(db, parent, user, minimum=Permission.editor)
    node = await tree.create_folder(db, user.id, body.name.strip(), parent_id)
    await db.commit()
    return node_out(node, owner=_owner_brief(user))


@router.get("/{node_id}", response_model=NodeOut)
async def get_node(node_id: str, db: DbSession, user: CurrentUser) -> NodeOut:
    node = await db.get(Node, node_id)
    await require_access(db, node, user)
    owner = await db.get(User, node.owner_id)
    return node_out(node, owner=_owner_brief(owner))


@router.get("/{node_id}/breadcrumbs", response_model=list[BreadcrumbOut])
async def breadcrumbs(node_id: str, db: DbSession, user: CurrentUser) -> list[BreadcrumbOut]:
    node = await db.get(Node, node_id)
    await require_access(db, node, user)
    chain = await tree.ancestors(db, node)
    return [BreadcrumbOut(id=n.id, name=n.name) for n in [*chain, node] if not n.is_deleted]


@router.patch("/{node_id}", response_model=NodeOut)
async def update_node(node_id: str, body: NodeUpdate, db: DbSession, user: CurrentUser) -> NodeOut:
    node = await db.get(Node, node_id)
    await require_owner(db, node, user)
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise bad_request("Name cannot be empty")
        await tree.assert_no_duplicate(db, node, name)
        node.name = name[:255]
    if "parent_id" in body.model_fields_set:
        await tree.move_node(db, node, body.parent_id)
    await db.commit()
    owner = await db.get(User, node.owner_id)
    return node_out(node, owner=_owner_brief(owner))


@router.post("/{node_id}/star", response_model=NodeOut)
async def toggle_star(node_id: str, db: DbSession, user: CurrentUser) -> NodeOut:
    node = await db.get(Node, node_id)
    await require_owner(db, node, user)
    node.is_starred = not node.is_starred
    await db.commit()
    owner = await db.get(User, node.owner_id)
    return node_out(node, owner=_owner_brief(owner))


@router.delete("/{node_id}", response_model=Message)
async def delete_node(node_id: str, db: DbSession, user: CurrentUser) -> Message:
    node = await db.get(Node, node_id)
    await require_owner(db, node, user)
    count = await tree.trash_node(db, node)
    await db.commit()
    await publish("node.deleted", {"node_id": node.id, "owner_id": user.id, "count": count})
    return Message(message=f"Moved {count} item(s) to trash")


@trash_router.get("", response_model=NodeListOut)
async def list_trash(db: DbSession, user: CurrentUser) -> NodeListOut:
    rows = await db.execute(
        select(Node, User)
        .join(User, User.id == Node.owner_id)
        .where(
            Node.owner_id == user.id,
            Node.is_deleted.is_(True),
            Node.deleted_root_id == Node.id,
        )
        .order_by(Node.deleted_at.desc())
    )
    items = [node_out(node, owner=_owner_brief(owner)) for node, owner in rows.all()]
    return NodeListOut(items=items, total=len(items))


@trash_router.post("/{node_id}/restore", response_model=Message)
async def restore(node_id: str, db: DbSession, user: CurrentUser) -> Message:
    node = await db.get(Node, node_id)
    if node is None or not node.is_deleted:
        raise not_found("Item not found in trash")
    if node.owner_id != user.id:
        raise forbidden("Only the owner can do that")
    count = await tree.restore_node(db, node)
    await db.commit()
    await publish("node.restored", {"node_id": node.id, "owner_id": user.id})
    return Message(message=f"Restored {count} item(s)")


@trash_router.delete("/{node_id}", response_model=Message)
async def purge(node_id: str, db: DbSession, user: CurrentUser) -> Message:
    node = await db.get(Node, node_id)
    if node is None or not node.is_deleted:
        raise not_found("Item not found in trash")
    if node.owner_id != user.id:
        raise forbidden("Only the owner can do that")
    keys = await tree.purge_node(db, node)
    await db.commit()
    await _delete_objects(keys)
    return Message(message="Permanently deleted")


@trash_router.delete("", response_model=Message)
async def empty_trash(db: DbSession, user: CurrentUser) -> Message:
    rows = (
        await db.scalars(
            select(Node).where(
                Node.owner_id == user.id,
                Node.is_deleted.is_(True),
                Node.deleted_root_id == Node.id,
            )
        )
    ).all()
    keys: list[str] = []
    for node in rows:
        keys.extend(await tree.purge_node(db, node))
    await db.commit()
    await _delete_objects(keys)
    return Message(message=f"Deleted {len(rows)} item(s) permanently")


async def _delete_objects(keys: list[str]) -> None:
    if not keys:
        return
    try:
        from app.tasks.jobs import purge_objects

        purge_objects.delay(keys)
    except Exception:  # noqa: BLE001
        from app.services.storage import driver

        driver.delete_many(keys)
