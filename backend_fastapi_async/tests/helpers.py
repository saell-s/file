from __future__ import annotations

from typing import Any

from httpx import AsyncClient


async def login(client: AsyncClient, email: str, password: str = "password123") -> dict[str, Any]:
    response = await client.post("/api/auth/token", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def create_folder(
    client: AsyncClient, token: str, name: str, parent_id: str | None = None
) -> dict[str, Any]:
    response = await client.post(
        "/api/nodes/folders",
        json={"name": name, "parent_id": parent_id},
        headers=auth(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def upload_file(
    client: AsyncClient, token: str, name: str, content: bytes, parent_id: str | None = None
) -> dict[str, Any]:
    data = {}
    if parent_id:
        data["parent_id"] = parent_id
    response = await client.post(
        "/api/files/upload",
        files={"file": (name, content, "text/plain")},
        data=data,
        headers=auth(token),
    )
    assert response.status_code == 201, response.text
    return response.json()
