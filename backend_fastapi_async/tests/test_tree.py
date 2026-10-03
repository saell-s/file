from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.helpers import auth, create_folder, login


@pytest.mark.asyncio
async def test_full_tree_flow(client: AsyncClient) -> None:
    tokens = await login(client, *(await _register(client)))

    docs = await create_folder(client, tokens["access_token"], "Documents")
    invoices = await create_folder(client, tokens["access_token"], "Invoices", parent_id=docs["id"])

    listing = await client.get("/api/nodes", headers=auth(tokens["access_token"]))
    assert listing.status_code == 200
    payload = listing.json()
    assert payload["total"] == 1
    assert payload["items"][0]["name"] == "Documents"
    assert payload["items"][0]["type"] == "folder"

    children = await client.get(
        f"/api/nodes?parent_id={docs['id']}", headers=auth(tokens["access_token"])
    )
    assert [item["name"] for item in children.json()["items"]] == ["Invoices"]
    crumbs = children.json()["breadcrumbs"]
    assert [c["name"] for c in crumbs] == ["Documents"]

    deeper = await client.get(
        f"/api/nodes/{invoices['id']}/breadcrumbs", headers=auth(tokens["access_token"])
    )
    assert [c["name"] for c in deeper.json()] == ["Documents", "Invoices"]

    renamed = await client.patch(
        f"/api/nodes/{docs['id']}",
        json={"name": "Work Docs"},
        headers=auth(tokens["access_token"]),
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Work Docs"

    other = await create_folder(client, tokens["access_token"], "Archive")

    duplicate = await client.patch(
        f"/api/nodes/{other['id']}",
        json={"name": "Work Docs"},
        headers=auth(tokens["access_token"]),
    )
    assert duplicate.status_code == 409

    cycle = await client.patch(
        f"/api/nodes/{other['id']}",
        json={"parent_id": other["id"]},
        headers=auth(tokens["access_token"]),
    )
    assert cycle.status_code == 400

    moved = await client.patch(
        f"/api/nodes/{invoices['id']}",
        json={"parent_id": None},
        headers=auth(tokens["access_token"]),
    )
    assert moved.status_code == 200
    assert moved.json()["parent_id"] is None


@pytest.mark.asyncio
async def test_star_search_recent_trash(client: AsyncClient) -> None:
    tokens = await login(client, *(await _register(client)))
    token = tokens["access_token"]

    folder = await create_folder(client, token, "Photos")
    starred = await client.post(f"/api/nodes/{folder['id']}/star", headers=auth(token))
    assert starred.status_code == 200
    assert starred.json()["is_starred"] is True

    star_list = await client.get("/api/nodes/starred", headers=auth(token))
    assert [i["name"] for i in star_list.json()["items"]] == ["Photos"]

    search = await client.get("/api/nodes/search?q=Phot", headers=auth(token))
    assert search.status_code == 200
    assert len(search.json()["items"]) == 1

    recent = await client.get("/api/nodes/recent", headers=auth(token))
    assert recent.status_code == 200
    assert recent.json()["total"] >= 1

    deleted = await client.delete(f"/api/nodes/{folder['id']}", headers=auth(token))
    assert deleted.status_code == 200

    trash = await client.get("/api/trash", headers=auth(token))
    assert [i["name"] for i in trash.json()["items"]] == ["Photos"]

    restored = await client.post(f"/api/trash/{folder['id']}/restore", headers=auth(token))
    assert restored.status_code == 200
    assert (await client.get("/api/trash", headers=auth(token))).json()["items"] == []

    await client.delete(f"/api/nodes/{folder['id']}", headers=auth(token))
    purged = await client.delete(f"/api/trash/{folder['id']}", headers=auth(token))
    assert purged.status_code == 200
    assert (await client.get("/api/trash", headers=auth(token))).json()["items"] == []


async def _register(client: AsyncClient, email: str = "tree@example.com") -> tuple[str, str]:
    response = await client.post(
        "/api/auth/register", json={"email": email, "password": "password123"}
    )
    assert response.status_code == 201, response.text
    return email, "password123"
