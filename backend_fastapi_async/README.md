# FileBox Backend

> **Legacy / reference.** The FileBox app is now local-first (on-device storage, no
> sign-in) and no longer calls this API. The backend remains here as a complete,
> tested cloud implementation (accounts, share links, permissions) — see the root
> `README.md`.

Async FastAPI backend for the FileBox file & folder management app.

- **Stack**: FastAPI + SQLAlchemy 2 (async) + Pydantic v2, JWT auth (access + refresh),
  content-addressed local object storage, Redis cache/rate-limit, Celery background jobs,
  pluggable event bus (`noop` | `redis-streams` | `kafka`).
- **Python**: 3.11+ (developed on 3.13). SQLite for local dev, Postgres in Docker.

## Quickstart (local, no Docker)

```powershell
python -m venv .venv
.venv\Scripts\pip install -e ".[dev]"
copy .env.example .env          # optional; sensible defaults are built in
.venv\Scripts\python -m uvicorn app.main:app --reload --port 4000
```

Or with the Makefile (Windows venv paths): `make install`, `make api`.

Health check: <http://127.0.0.1:4000/api/health>

Seed the demo account and a sample tree:

```powershell
.venv\Scripts\python scripts\seed.py   # demo@example.com / password123
```

## Docker / DevOps

```bash
docker compose up --build -d     # postgres, redis, api, worker, beat, consumer
docker compose up -d kafka       # optional event bus (set EVENT_BUS=kafka)
docker compose logs -f api
docker compose down
```

| Service    | Role                                                        |
|------------|-------------------------------------------------------------|
| `api`      | Uvicorn FastAPI app on `:4000`                              |
| `worker`   | Celery worker (thumbnails, trash purge, quota aggregation)  |
| `beat`     | Celery beat (scheduled cleanup jobs)                        |
| `consumer` | Event-bus consumer (redis-streams → side effects)           |
| `postgres` | Primary database in Docker                                 |
| `redis`    | Cache, rate limiting, Celery broker/backend                 |
| `kafka` / `kafka-consumer` | Optional event bus profile                     |

All jobs are wrapped in `try/except` and degrade gracefully when Redis/Celery is not running,
so the API works standalone for development.

## Configuration

Copy `.env.example` to `.env`. Notable variables:

- `DATABASE_URL` — `sqlite+aiosqlite:///./filebox.db` locally, Postgres in Docker.
- `STORAGE_DIR`, `MAX_UPLOAD_BYTES`, `DEFAULT_STORAGE_LIMIT_BYTES` — object storage & quotas.
- `CORS_ORIGINS` — comma-separated origins for the Expo dev/prod servers.
- `EVENT_BUS` — `noop`, `redis-streams` (default) or `kafka`.
- `LOGIN_RATE_LIMIT` / `LOGIN_RATE_WINDOW_SECONDS` — login throttling.

## API surface (prefix `/api`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/token`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| Nodes | `GET /nodes`, `GET /nodes/{id}`, `GET /nodes/{id}/breadcrumbs`, `POST /nodes/folders`, `PATCH /nodes/{id}` (rename/move), `POST /nodes/{id}/star`, `DELETE /nodes/{id}` (trash) |
| Views | `GET /nodes/starred`, `GET /nodes/recent`, `GET /nodes/search?q=` |
| Files | `POST /files/upload` (multipart), `GET /files/{id}/download` (Range, attachment), `GET /files/{id}/preview` (Range, inline), `GET /files/{id}/thumbnail` |
| Trash | `GET /trash`, `POST /trash/{id}/restore`, `DELETE /trash/{id}`, `DELETE /trash` |
| Sharing | `GET /share/shared-with-me`, `GET|POST /share/permissions`, `PATCH|DELETE /share/permissions/{id}`, `GET|POST /share/links`, `DELETE /share/links/{id}`, `GET /share/links/{token}/resolve` |
| Account | `GET|PATCH /me`, `POST /me/password`, `GET /me/storage`, `GET|DELETE /me/activity` |
| Ops | `GET /health` |

Authorization model: ownership + per-node permissions inherited through the folder tree;
share links carry their own viewer/editor permission and can expire or be revoked.

## Tests & lint

```powershell
.venv\Scripts\python -m pytest -q        # 10 tests (auth, tree, files, sharing)
.venv\Scripts\python -m ruff check app tests scripts
```

End-to-end smoke (requires a running server):

```powershell
# with the API running on :4000
powershell -ExecutionPolicy Bypass -File scripts\e2e-smoke.ps1
# 36 checks: auth, folders, upload, range/preview, star/search,
# links + revoke, permissions, trash/restore/purge, quotas, security log
```

## Layout

```
app/
  api/        auth, nodes, files, share, me
  core/       config, database, security (JWT/bcrypt), deps (access rules), errors, redis
  models/     User, Node (polymorphic folder/file), NodePermission, ShareLink, ActivityLog
  schemas/    Pydantic request/response models
  services/   tree (recursive ops), storage (content-addressed drivers), cache, events, rate_limit
  tasks/      Celery app + jobs (thumbnails, purge, cleanup, aggregation)
  worker/     event-bus consumer
scripts/      seed.py
tests/        pytest suite (async, in-memory)
```
