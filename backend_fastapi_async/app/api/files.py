from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import APIRouter, File, Form, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.core.deps import (
    CurrentUser,
    DbSession,
    OptionalUser,
    require_access,
    require_file_access,
)
from app.core.errors import not_found, too_large
from app.models import ActivityAction, ActivityLog, Node, NodeType, Permission, User
from app.schemas.auth import UserBrief
from app.schemas.node import NodeOut, node_out
from app.services import tree
from app.services.events import publish
from app.services.storage import driver

router = APIRouter(prefix="/files", tags=["files"])

CHUNK = 1024 * 1024
RANGE_RE = None


def _guess_mime(filename: str, fallback: str | None) -> str:
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or fallback or "application/octet-stream"


def _owner_brief(user: User | None) -> UserBrief | None:
    return UserBrief(id=user.id, email=user.email, full_name=user.full_name) if user else None


def _file_stream(path: Path, start: int, end: int):
    with open(path, "rb") as handle:
        handle.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = handle.read(min(CHUNK, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def range_response(
    path: Path,
    media_type: str,
    filename: str | None,
    range_header: str | None,
    inline: bool,
) -> StreamingResponse:
    size = path.stat().st_size
    headers = {"Accept-Ranges": "bytes", "Content-Length": str(size)}
    disposition = "inline" if inline else "attachment"
    if filename:
        safe = filename.replace('"', "")
        headers["Content-Disposition"] = f'{disposition}; filename="{safe}"'
    else:
        headers["Content-Disposition"] = disposition

    start, end = 0, size - 1
    status_code = status.HTTP_200_OK
    if range_header and range_header.startswith("bytes="):
        spec = range_header.removeprefix("bytes=").split(",")[0].strip()
        left, _, right = spec.partition("-")
        try:
            if left and right:
                start, end = int(left), min(int(right), size - 1)
            elif left:
                start, end = int(left), size - 1
            elif right:
                start, end = max(size - int(right), 0), size - 1
        except ValueError:
            start, end = 0, size - 1
        if start > end or start >= size:
            return StreamingResponse(
                iter([]),
                status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
                headers={"Content-Range": f"bytes */{size}"},
            )
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
        headers["Content-Length"] = str(end - start + 1)
        status_code = status.HTTP_206_PARTIAL_CONTENT

    return StreamingResponse(
        _file_stream(path, start, end),
        status_code=status_code,
        media_type=media_type,
        headers=headers,
    )


async def _usage_bytes(db, user_id: str) -> int:  # noqa: ANN001
    total = await db.scalar(
        select(func.coalesce(func.sum(Node.size), 0)).where(
            Node.owner_id == user_id,
            Node.node_type == NodeType.file,
            Node.is_deleted.is_(False),
        )
    )
    return int(total or 0)


@router.post("/upload", response_model=NodeOut, status_code=status.HTTP_201_CREATED)
async def upload_file(
    db: DbSession,
    user: CurrentUser,
    request: Request,
    file: UploadFile = File(...),
    parent_id: str | None = Form(default=None),
) -> NodeOut:
    parent: Node | None = None
    if parent_id:
        parent = await db.get(Node, parent_id)
        await require_access(db, parent, user, minimum=Permission.editor)

    used = await _usage_bytes(db, user.id)
    declared = 0
    try:
        declared = int(request.headers.get("content-length") or 0)
    except ValueError:
        declared = 0
    if declared and used + declared > user.storage_limit_bytes:
        raise too_large("This upload would exceed your storage limit")

    original = file.filename or "upload.bin"

    async def chunks():  # noqa: ANN202
        while True:
            chunk = await file.read(CHUNK)
            if not chunk:
                break
            yield chunk

    try:
        saved = await driver.save_stream(chunks())
    except PermissionError:
        raise too_large("This upload exceeds your storage limit") from None

    used = await _usage_bytes(db, user.id)
    if used + saved.size > user.storage_limit_bytes:
        if not await _referenced(db, saved.key):
            driver.delete(saved.key)
        raise too_large("This upload would exceed your storage limit")

    safe_name = await tree.unique_sibling_name(db, user.id, parent_id, original)
    node = Node(
        owner_id=user.id,
        parent_id=parent_id,
        node_type=NodeType.file,
        name=safe_name,
        size=saved.size,
        mime_type=_guess_mime(original, file.content_type),
        storage_key=saved.key,
        sha256=saved.sha256,
    )
    db.add(node)
    await db.flush()
    db.add(
        ActivityLog(
            user_id=user.id, node_id=node.id, action=ActivityAction.upload, detail=safe_name
        )
    )
    await db.commit()
    await _invalidate(user.id, parent_id)
    await publish(
        "file.uploaded",
        {
            "node_id": node.id,
            "owner_id": user.id,
            "parent_id": parent_id,
            "size": node.size,
            "mime_type": node.mime_type,
        },
    )
    _schedule_thumbnail(node)
    owner = await db.get(User, user.id)
    return node_out(node, owner=_owner_brief(owner))


async def _referenced(db, key: str) -> bool:  # noqa: ANN001
    count = await db.scalar(select(func.count(Node.id)).where(Node.storage_key == key))
    return bool(count)


def _schedule_thumbnail(node: Node) -> None:
    import contextlib

    if not (node.mime_type or "").startswith("image/"):
        return
    with contextlib.suppress(Exception):
        from app.tasks.jobs import generate_thumbnail

        generate_thumbnail.delay(node.id)


async def _invalidate(user_id: str, parent_id: str | None) -> None:
    from app.services.cache import cache_delete, storage_cache_key

    await cache_delete(storage_cache_key(user_id))


@router.get("/{node_id}/download")
async def download(  # noqa: ANN201
    node_id: str,
    db: DbSession,
    request: Request,
    user: OptionalUser,
    share_token: str | None = Query(default=None),
):
    node = await db.get(Node, node_id)
    await require_file_access(db, node, user, share_token)
    if node.node_type != NodeType.file or not node.storage_key:
        raise not_found("Not a downloadable file")
    path = driver.path_for(node.storage_key)
    if not path.is_file():
        raise not_found("File content is missing")
    if user is not None:
        db.add(ActivityLog(user_id=user.id, node_id=node.id, action=ActivityAction.download))
        await db.commit()
    return range_response(
        path,
        node.mime_type or "application/octet-stream",
        node.name,
        request.headers.get("range"),
        inline=False,
    )


@router.get("/{node_id}/preview")
async def preview(  # noqa: ANN201
    node_id: str,
    db: DbSession,
    request: Request,
    user: OptionalUser,
    share_token: str | None = Query(default=None),
):
    node = await db.get(Node, node_id)
    await require_file_access(db, node, user, share_token)
    if node.node_type != NodeType.file or not node.storage_key:
        raise not_found("Not a previewable file")
    path = driver.path_for(node.storage_key)
    if not path.is_file():
        raise not_found("File content is missing")
    return range_response(
        path,
        node.mime_type or "application/octet-stream",
        None,
        request.headers.get("range"),
        inline=True,
    )


@router.get("/{node_id}/thumbnail")
async def thumbnail(  # noqa: ANN201
    node_id: str,
    db: DbSession,
    user: OptionalUser,
    share_token: str | None = Query(default=None),
):
    node = await db.get(Node, node_id)
    await require_file_access(db, node, user, share_token)
    if not node.thumbnail_key:
        raise not_found("No thumbnail available")
    path = driver.path_for(node.thumbnail_key)
    if not path.is_file():
        raise not_found("No thumbnail available")
    return StreamingResponse(
        _file_stream(path, 0, path.stat().st_size - 1),
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=3600"},
    )
