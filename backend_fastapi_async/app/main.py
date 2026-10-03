from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, files, me, nodes, share
from app.core.config import settings
from app.core.database import dispose_db, init_db
from app.core.redis import close_redis, get_redis

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    await init_db()
    yield
    await close_redis()
    from app.services import events

    await events.shutdown()
    await dispose_db()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Async file & folder management API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Disposition"],
)

API = settings.api_prefix
app.include_router(auth.router, prefix=API)
app.include_router(nodes.router, prefix=API)
app.include_router(nodes.trash_router, prefix=API)
app.include_router(files.router, prefix=API)
app.include_router(share.router, prefix=API)
app.include_router(me.router, prefix=API)


@app.get(f"{API}/health", tags=["ops"])
async def health() -> dict:
    db_ok = True
    try:
        from sqlalchemy import text

        from app.core.database import engine

        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        db_ok = False
    redis_client = await get_redis()
    return {
        "status": "ok" if db_ok else "degraded",
        "database": db_ok,
        "redis": redis_client is not None,
        "event_bus": settings.event_bus,
        "environment": settings.environment,
    }


@app.get("/", include_in_schema=False)
async def root() -> dict:
    return {"service": settings.app_name, "docs": "/docs", "health": f"{API}/health"}
