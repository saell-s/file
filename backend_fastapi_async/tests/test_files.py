from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.helpers import auth, create_folder, login, upload_file


async def _register(client: AsyncClient, email: str = "files@example.com") -> tuple[str, str]:
    response = await client.post(
        "/api/auth/register", json={"email": email, "password": "password123"}
    )
    assert response.status_code == 201, response.text
    return email, "password123"


@pytest.mark.asyncio
async def test_upload_download_preview_and_stats(client: AsyncClient) -> None:
    tokens = await login(client, *(await _register(client)))
    token = tokens["access_token"]

    node = await upload_file(client, token, "hello.txt", b"hello world")
    assert node["name"] == "hello.txt"
    assert node["size"] == len(b"hello world")
    assert node["type"] == "file"
    assert node["mime_type"] == "text/plain"

    download = await client.get(f"/api/files/{node['id']}/download", headers=auth(token))
    assert download.status_code == 200
    assert download.content == b"hello world"
    assert "attachment" in download.headers.get("content-disposition", "")

    preview = await client.get(f"/api/files/{node['id']}/preview", headers=auth(token))
    assert preview.status_code == 200
    assert preview.content == b"hello world"

    ranged = await client.get(
        f"/api/files/{node['id']}/preview",
        headers={**auth(token), "Range": "bytes=0-4"},
    )
    assert ranged.status_code == 206
    assert ranged.content == b"hello"

    storage = await client.get("/api/me/storage", headers=auth(token))
    assert storage.json()["used_bytes"] == len(b"hello world")
    assert storage.json()["by_type"]["text"]["bytes"] == len(b"hello world")

    duplicate = await upload_file(client, token, "hello.txt", b"second copy")
    assert duplicate["name"] == "hello (2).txt"

    folder = await create_folder(client, token, "Notes")
    inside = await upload_file(client, token, "note.txt", b"inside", parent_id=folder["id"])
    assert inside["parent_id"] == folder["id"]

    listing = await client.get(f"/api/nodes?parent_id={folder['id']}", headers=auth(token))
    assert [i["name"] for i in listing.json()["items"]] == ["note.txt"]


@pytest.mark.asyncio
async def test_upload_rejected_over_quota(client: AsyncClient, user_factory) -> None:
    account = await user_factory("tiny@example.com")
    tokens = await login(client, account["email"])
    token = tokens["access_token"]

    from app.core.database import SessionLocal
    from app.models import User

    async with SessionLocal() as session:
        user = await session.get(User, account["id"])
        user.storage_limit_bytes = 4
        await session.commit()

    response = await client.post(
        "/api/files/upload",
        files={"file": ("big.txt", b"0123456789", "text/plain")},
        headers=auth(token),
    )
    assert response.status_code == 413

    storage = await client.get("/api/me/storage", headers=auth(token))
    assert storage.json()["used_bytes"] == 0


@pytest.mark.asyncio
async def test_download_requires_auth(client: AsyncClient) -> None:
    tokens = await login(client, *(await _register(client)))
    node = await upload_file(client, tokens["access_token"], "secret.txt", b"top secret")

    anonymous = await client.get(f"/api/files/{node['id']}/preview")
    assert anonymous.status_code == 401

    other_tokens = await login(client, *(await _register(client, "intruder@example.com")))
    stranger = await client.get(
        f"/api/files/{node['id']}/preview", headers=auth(other_tokens["access_token"])
    )
    assert stranger.status_code == 404
