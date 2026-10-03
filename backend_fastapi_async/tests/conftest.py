from __future__ import annotations

import os
import tempfile
from pathlib import Path

import httpx
import pytest_asyncio

_TMP = Path(tempfile.mkdtemp(prefix="filebox-test-"))
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{_TMP}/test.db")
os.environ.setdefault("STORAGE_DIR", str(_TMP / "storage"))
os.environ.setdefault("EVENT_BUS", "noop")
os.environ.setdefault("REDIS_ENABLED", "false")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")


@pytest_asyncio.fixture(autouse=True)
async def _fresh_db():
    from app.core.database import Base, engine, init_db

    await init_db()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
def _eager_celery():
    from app.tasks.celery_app import celery_app

    previous = celery_app.conf.task_always_eager
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = False
    yield
    celery_app.conf.task_always_eager = previous


@pytest_asyncio.fixture
async def client():
    from app.core.redis import close_redis
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as http_client:
        yield http_client
    await close_redis()


@pytest_asyncio.fixture
async def user_factory():
    async def factory(email: str, password: str = "password123", name: str = "Test User"):  # noqa: ANN201
        from app.core.database import SessionLocal
        from app.core.security import hash_password
        from app.models import User

        async with SessionLocal() as session:
            user = User(email=email, full_name=name, hashed_password=hash_password(password))
            session.add(user)
            await session.commit()
            await session.refresh(user)
        return {"email": email, "password": password, "id": user.id}

    return factory
