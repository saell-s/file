from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.helpers import login


@pytest.mark.asyncio
async def test_register_login_refresh_me(client: AsyncClient) -> None:
    response = await client.post(
        "/api/auth/register",
        json={"email": "Ada@Example.com", "password": "password123", "full_name": "Ada"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["user"]["email"] == "ada@example.com"
    assert body["access_token"]

    duplicate = await client.post(
        "/api/auth/register", json={"email": "ada@example.com", "password": "password123"}
    )
    assert duplicate.status_code == 409

    bad = await client.post(
        "/api/auth/token", json={"email": "ada@example.com", "password": "wrongpass1"}
    )
    assert bad.status_code == 401

    tokens = await login(client, "ada@example.com")
    me = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert me.status_code == 200
    assert me.json()["full_name"] == "Ada"

    refreshed = await client.post(
        "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]


@pytest.mark.asyncio
async def test_me_storage_and_profile(client: AsyncClient, user_factory) -> None:
    account = await user_factory("bob@example.com")
    tokens = await login(client, account["email"])
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    storage = await client.get("/api/me/storage", headers=headers)
    assert storage.status_code == 200
    payload = storage.json()
    assert payload["used_bytes"] == 0
    assert payload["limit_bytes"] > 0
    assert payload["percent_used"] == 0

    updated = await client.patch("/api/me", json={"full_name": "Bobby"}, headers=headers)
    assert updated.status_code == 200
    assert updated.json()["full_name"] == "Bobby"

    wrong = await client.post(
        "/api/me/password",
        json={"current_password": "nope", "new_password": "newpassword1"},
        headers=headers,
    )
    assert wrong.status_code == 401

    changed = await client.post(
        "/api/me/password",
        json={"current_password": "password123", "new_password": "newpassword1"},
        headers=headers,
    )
    assert changed.status_code == 200
    await login(client, "bob@example.com", "newpassword1")
