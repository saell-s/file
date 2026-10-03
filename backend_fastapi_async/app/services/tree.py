from __future__ import annotations

from datetime import timedelta

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request, conflict, not_found
from app.models import ActivityAction, ActivityLog, Node, NodeType
from app.models.user import utcnow


async def log_activity(
    db: AsyncSession,
    user_id: str,
    action: ActivityAction,
    node_id: str | None = None,
    detail: str | None = None,
    ip: str | None = None,
) -> None:
    db.add(ActivityLog(user_id=user_id, node_id=node_id, action=action, detail=detail, ip=ip))


async def subtree_ids(db: AsyncSession, root_id: str) -> list[str]:
    subtree = select(Node.id).where(Node.id == root_id).cte("subtree", recursive=True)
    child = Node.__table__.alias("subtree_child")
    subtree = subtree.union(select(child.c.id).where(child.c.parent_id == subtree.c.id))
    rows = await db.scalars(select(subtree.c.id))
    return list(rows)


async def ancestors(db: AsyncSession, node: Node) -> list[Node]:
    chain: list[Node] = []
    current = node.parent_id
    seen = 0
    while current and seen < 64:
        parent = await db.get(Node, current)
        if parent is None:
            break
        chain.append(parent)
        current = parent.parent_id
        seen += 1
    chain.reverse()
    return chain


async def unique_sibling_name(
    db: AsyncSession, owner_id: str, parent_id: str | None, name: str
) -> str:
    base = name.strip() or "Untitled"
    conditions = [Node.is_deleted.is_(False)]
    if parent_id is None:
        conditions += [Node.owner_id == owner_id, Node.parent_id.is_(None)]
    else:
        conditions.append(Node.parent_id == parent_id)
    existing = await db.scalars(select(Node.name).where(*conditions))
    taken = set(existing)
    if base not in taken:
        return base
    stem, dot, ext = base.rpartition(".")
    stem = stem or base
    counter = 2
    while True:
        candidate = f"{stem} ({counter}){dot}{ext}" if dot else f"{base} ({counter})"
        if candidate not in taken:
            return candidate
        counter += 1


async def assert_no_duplicate(db: AsyncSession, node: Node, name: str) -> None:
    conditions = [Node.is_deleted.is_(False), Node.name == name, Node.id != node.id]
    if node.parent_id is None:
        conditions += [Node.owner_id == node.owner_id, Node.parent_id.is_(None)]
    else:
        conditions.append(Node.parent_id == node.parent_id)
    row = await db.scalar(select(Node.id).where(*conditions))
    if row is not None:
        raise conflict(f'"{name}" already exists here')


async def create_folder(db: AsyncSession, owner_id: str, name: str, parent_id: str | None) -> Node:
    safe_name = await unique_sibling_name(db, owner_id, parent_id, name)
    node = Node(
        owner_id=owner_id,
        parent_id=parent_id,
        node_type=NodeType.folder,
        name=safe_name,
        size=0,
    )
    db.add(node)
    await db.flush()
    await log_activity(db, owner_id, ActivityAction.create, node.id, detail=safe_name)
    return node


async def trash_node(db: AsyncSession, node: Node) -> int:
    ids = await subtree_ids(db, node.id)
    now = utcnow()
    await db.execute(
        update(Node)
        .where(Node.id.in_(ids), Node.is_deleted.is_(False))
        .values(is_deleted=True, deleted_at=now, deleted_root_id=node.id)
    )
    await db.refresh(node)
    await log_activity(db, node.owner_id, ActivityAction.delete, node.id, detail=node.name)
    return len(ids)


async def restore_node(db: AsyncSession, node: Node) -> int:
    if node.deleted_root_id != node.id:
        raise bad_request("Only the top of a deleted branch can be restored")
    rows = await db.scalars(
        select(Node.id).where(Node.deleted_root_id == node.id, Node.is_deleted.is_(True))
    )
    ids = list(rows)
    await db.execute(
        update(Node)
        .where(Node.id.in_(ids))
        .values(is_deleted=False, deleted_at=None, deleted_root_id=None)
    )
    await db.refresh(node)
    await log_activity(db, node.owner_id, ActivityAction.restore, node.id, detail=node.name)
    return len(ids)


async def purge_node(db: AsyncSession, node: Node) -> list[str]:
    """Delete a trashed subtree and return storage keys that are now unreferenced."""
    ids = await subtree_ids(db, node.id)
    rows = await db.execute(select(Node.storage_key, Node.thumbnail_key).where(Node.id.in_(ids)))
    keys = {k for pair in rows.all() for k in pair if k}
    await db.execute(delete(Node).where(Node.id.in_(ids)))
    orphans: list[str] = []
    for key in sorted(keys):
        remaining = await db.scalar(
            select(func.count(Node.id)).where(
                or_(Node.storage_key == key, Node.thumbnail_key == key)
            )
        )
        if not remaining:
            orphans.append(key)
    return orphans


async def move_node(db: AsyncSession, node: Node, target_parent_id: str | None) -> None:
    if target_parent_id is None and node.parent_id is None:
        raise bad_request("Already at the root")
    target = await db.get(Node, target_parent_id) if target_parent_id else None
    if target_parent_id is not None:
        if target is None or target.is_deleted:
            raise not_found("Destination folder not found")
        if target.node_type != NodeType.folder:
            raise bad_request("Cannot move into a file")
        if target.owner_id != node.owner_id:
            raise bad_request("Cannot move items into a folder you do not own")
        if target.id == node.id:
            raise bad_request("Cannot move a folder into itself")
        cursor: Node | None = target
        depth = 0
        while cursor is not None and depth < 64:
            if cursor.id == node.id:
                raise bad_request("Cannot move a folder into its own descendant")
            cursor = await db.get(Node, cursor.parent_id) if cursor.parent_id else None
            depth += 1
    await assert_no_duplicate(db, node, node.name)
    node.parent_id = target_parent_id
    node.updated_at = utcnow()


async def usage_stats(db: AsyncSession, owner_id: str) -> dict:
    total = (
        await db.scalar(
            select(func.coalesce(func.sum(Node.size), 0)).where(
                Node.owner_id == owner_id,
                Node.node_type == NodeType.file,
                Node.is_deleted.is_(False),
            )
        )
        or 0
    )
    by_type_rows = await db.execute(
        select(Node.mime_type, func.coalesce(func.sum(Node.size), 0), func.count(Node.id))
        .where(
            Node.owner_id == owner_id,
            Node.node_type == NodeType.file,
            Node.is_deleted.is_(False),
        )
        .group_by(Node.mime_type)
    )
    by_type: dict[str, dict[str, int]] = {}
    for mime, size, count in by_type_rows:
        bucket = (mime or "").split("/", 1)[0] or "other"
        entry = by_type.setdefault(bucket, {"bytes": 0, "count": 0})
        entry["bytes"] += int(size)
        entry["count"] += int(count)
    return {"used_bytes": int(total), "by_type": by_type}


async def recent_nodes(db: AsyncSession, user_id: str, limit: int = 50) -> list[Node]:
    id_rows = await db.execute(
        select(ActivityLog.node_id, func.max(ActivityLog.created_at).label("last_at"))
        .join(Node, Node.id == ActivityLog.node_id)
        .where(
            ActivityLog.user_id == user_id,
            Node.is_deleted.is_(False),
            ActivityLog.created_at >= utcnow() - timedelta(days=30),
        )
        .group_by(ActivityLog.node_id)
        .order_by(func.max(ActivityLog.created_at).desc())
        .limit(limit)
    )
    node_ids = [row[0] for row in id_rows if row[0]]
    if not node_ids:
        return []
    nodes = await db.scalars(select(Node).where(Node.id.in_(node_ids)))
    order = {nid: i for i, nid in enumerate(node_ids)}
    return sorted(nodes, key=lambda n: order.get(n.id, 0))
