from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.helpers import auth, create_folder, login, upload_file


async def _register(client: AsyncClient, email: str) -> tuple[str, str]:
    response = await client.post(
        "/api/auth/register", json={"email": email, "password": "password123"}
    )
    assert response.status_code == 201, response.text
    return email, "password123"


@pytest.mark.asyncio
async def test_permissions_and_shared_with_me(client: AsyncClient) -> None:
    owner = await login(client, *(await _register(client, "owner@example.com")))
    guest = await login(client, *(await _register(client, "guest@example.com")))
    owner_token = owner["access_token"]
    guest_token = guest["access_token"]

    folder = await create_folder(client, owner_token, "Team")
    await upload_file(client, owner_token, "plan.txt", b"the plan", parent_id=folder["id"])

    invite = await client.post(
        "/api/share/permissions",
        json={"node_id": folder["id"], "email": "guest@example.com", "permission": "viewer"},
        headers=auth(owner_token),
    )
    assert invite.status_code == 201, invite.text
    perm_id = invite.json()["id"]

    missing = await client.post(
        "/api/share/permissions",
        json={"node_id": folder["id"], "email": "ghost@example.com", "permission": "viewer"},
        headers=auth(owner_token),
    )
    assert missing.status_code == 404

    shared = await client.get("/api/share/shared-with-me", headers=auth(guest_token))
    assert shared.status_code == 200
    entries = shared.json()
    assert len(entries) == 1
    assert entries[0]["node"]["name"] == "Team"
    assert entries[0]["owner"]["email"] == "owner@example.com"
    assert entries[0]["permission"] == "viewer"

    children = await client.get(f"/api/nodes?parent_id={folder['id']}", headers=auth(guest_token))
    assert children.status_code == 200
    assert [i["name"] for i in children.json()["items"]] == ["plan.txt"]

    as_viewer = await client.post(
        "/api/nodes/folders",
        json={"name": "Nope", "parent_id": folder["id"]},
        headers=auth(guest_token),
    )
    assert as_viewer.status_code == 403

    rename_by_guest = await client.patch(
        f"/api/nodes/{folder['id']}", json={"name": "Hacked"}, headers=auth(guest_token)
    )
    assert rename_by_guest.status_code == 403

    upgraded = await client.patch(
        f"/api/share/permissions/{perm_id}",
        json={"permission": "editor"},
        headers=auth(owner_token),
    )
    assert upgraded.status_code == 200

    as_editor = await client.post(
        "/api/nodes/folders",
        json={"name": "GuestFolder", "parent_id": folder["id"]},
        headers=auth(guest_token),
    )
    assert as_editor.status_code == 201

    permissions = await client.get(
        f"/api/share/permissions?node_id={folder['id']}", headers=auth(owner_token)
    )
    assert permissions.status_code == 200
    assert len(permissions.json()) == 1


@pytest.mark.asyncio
async def test_share_links_lifecycle(client: AsyncClient) -> None:
    owner = await login(client, *(await _register(client, "linkowner@example.com")))
    token = owner["access_token"]
    folder = await create_folder(client, token, "Public")
    await upload_file(client, token, "readme.md", b"# hello", parent_id=folder["id"])

    created = await client.post(
        "/api/share/links",
        json={"node_id": folder["id"], "permission": "viewer", "expires_in_hours": 24},
        headers=auth(token),
    )
    assert created.status_code == 201, created.text
    link = created.json()
    assert link["url"].endswith(link["token"])
    assert link["permission"] == "viewer"

    listing = await client.get("/api/share/links", headers=auth(token))
    assert len(listing.json()) == 1

    resolved = await client.get(f"/api/share/links/{link['token']}/resolve")
    assert resolved.status_code == 200
    assert resolved.json()["node"]["name"] == "Public"

    anonymous_preview_ok = await client.get(f"/api/nodes/{folder['id']}")
    assert anonymous_preview_ok.status_code in {401, 403, 404}

    revoked = await client.delete(f"/api/share/links/{link['id']}", headers=auth(token))
    assert revoked.status_code == 200

    after_revoke = await client.get(f"/api/share/links/{link['token']}/resolve")
    assert after_revoke.status_code == 404


@pytest.mark.asyncio
async def test_viewer_cannot_escalate_link_permission(client: AsyncClient) -> None:
    owner = await login(client, *(await _register(client, "owner2@example.com")))
    guest = await login(client, *(await _register(client, "guest2@example.com")))
    folder = await create_folder(client, owner["access_token"], "Shared")
    await client.post(
        "/api/share/permissions",
        json={"node_id": folder["id"], "email": "guest2@example.com", "permission": "viewer"},
        headers=auth(owner["access_token"]),
    )

    attempt = await client.post(
        "/api/share/links",
        json={"node_id": folder["id"], "permission": "editor"},
        headers=auth(guest["access_token"]),
    )
    assert attempt.status_code == 403
