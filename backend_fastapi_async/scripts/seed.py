"""Seed the database with a demo account and a realistic folder tree.

Usage:
    python scripts/seed.py            # create demo@example.com / password123
    python scripts/seed.py --reset    # drop + recreate tables first
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.database import Base, SessionLocal, engine, init_db  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models import ActivityAction, ActivityLog, Node, NodeType, User  # noqa: E402
from app.services.storage import driver  # noqa: E402

DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "password123"

TREE = {
    "Documents": {
        "Invoices": {
            "invoice-2026-01.txt": b"Invoice #2026-01 - $1,250.00\n",
            "invoice-2026-02.txt": b"Invoice #2026-02 - $980.00\n",
        },
        "Reports": {"q1-summary.txt": b"Q1 revenue up 18% year over year.\n"},
        "readme.txt": b"Everything important lives here.\n",
    },
    "Photos": {
        "banner.txt": b"Placeholder for an image asset.\n",
    },
    "Shared": {
        "onboarding.txt": b"Share this folder with a teammate to try collaboration.\n",
    },
    "archive.zip": b"PK\x03\x04 pretend zip payload",
}


async def seed(reset: bool = False) -> None:
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    await init_db()
    async with engine.begin() as conn:
        if reset:
            await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        user = await db.scalar(select(User).where(User.email == DEMO_EMAIL))
        if user is None:
            user = User(
                email=DEMO_EMAIL,
                full_name="Demo User",
                hashed_password=hash_password(DEMO_PASSWORD),
            )
            db.add(user)
            await db.flush()
            print(f"created user {DEMO_EMAIL} (password: {DEMO_PASSWORD})")
        else:
            await db.execute(delete(Node).where(Node.owner_id == user.id))
            print(f"reset tree for {DEMO_EMAIL}")

        async def add_folder(name: str, parent: str | None) -> Node:
            node = Node(owner_id=user.id, parent_id=parent, node_type=NodeType.folder, name=name)
            db.add(node)
            await db.flush()
            return node

        async def add_file(name: str, parent: str | None, content: bytes) -> None:
            saved = await driver.save_stream(_iter(content))
            node = Node(
                owner_id=user.id,
                parent_id=parent,
                node_type=NodeType.file,
                name=name,
                size=saved.size,
                mime_type="application/zip" if name.endswith(".zip") else "text/plain",
                storage_key=saved.key,
                sha256=saved.sha256,
            )
            db.add(node)
            await db.flush()

        async def walk(spec: dict, parent: str | None) -> None:
            for name, value in spec.items():
                if isinstance(value, dict):
                    folder = await add_folder(name, parent)
                    await walk(value, folder.id)
                else:
                    await add_file(name, parent, value)

        await walk(TREE, None)
        db.add(ActivityLog(user_id=user.id, action=ActivityAction.login, detail="seed script"))
        await db.commit()
        print("seed complete: Documents/, Photos/, Shared/, archive.zip")


async def _iter(data: bytes):  # noqa: ANN202
    yield data


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args()
    asyncio.run(seed(reset=args.reset))
