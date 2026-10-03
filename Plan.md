# File & Folder Management App — Implementation Plan

**Stack:** React Native (Expo SDK 57, expo-router) + FastAPI (async, SQLAlchemy 2.0)
**Workspace:**
- `frontend_react_native/` — existing Expo template (expo-router, NativeTabs, TypeScript strict, `@/*` path alias)
- `backend_fastapi_async/` — currently **empty**; will be scaffolded from scratch

---

## 0. Scope Decisions (answers to the three scoping questions)

| Question | Decision | Rationale |
|---|---|---|
| **1. Backend scope** | **Full FastAPI backend included** | The backend folder exists and an API reference was supplied; a frontend-only mock layer would be thrown away. |
| **2. Collaboration** | **Full team collaboration in v1** (multi-user permission enforcement, Shared with Me, share links) — but **no real-time sync** | "Shared with Me" and Viewer/Editor permissions are core to the spec; real-time/websockets are out of scope. |
| **3. Feature depth** | **Phase 2 (deferred):** MFA screens, Storage/Billing with real subscription tiers & payments, security activity logs, password-protected links, chunked/resumable uploads (S3 presigned) | Keeps v1 shippable. UI placeholders (read-only tier cards, "coming soon" MFA toggle) are included so screens still exist. |

**v1 definition of done:** a user can register → sign in → browse a nested folder tree → create/rename/move/delete/restore/star files & folders → upload → preview images/video/text → share with another user (viewer/editor) → create & revoke public links → see storage usage.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────┐
│  React Native (Expo, expo-router)           │
│  ├─ (auth)  sign-in / sign-up / forgot      │
│  └─ (app)   Tabs: Files | Shared | Recent | │
│              Profile                        │
│      └─ stack: folder/[id], starred, trash, │
│                links, storage, settings     │
│  Providers: QueryClient, AuthStore,         │
│             UploadStore, ThemeProvider      │
└──────────────┬──────────────────────────────┘
               │  axios + Authorization: Bearer <JWT>
               │  interceptor → auto-refresh on 401
┌──────────────▼──────────────────────────────┐
│  FastAPI (async)                            │
│  routers: auth / nodes / files / share / me │
│  services: StorageDriver (Local | S3 stub)  │
│  security: bcrypt + JWT (access + refresh)  │
└──────┬───────────────────────┬──────────────┘
       │                       │
  SQLite (aiosqlite)      storage/ (local disk)
  SQLAlchemy 2.0 async    sha256 object keys
```

### Key design choice — single polymorphic `nodes` table
Instead of separate `folders` and `files` tables, both are rows in one `nodes` table with `type ∈ {'folder','file'}`. This makes the tree a pure **adjacency list** (`parent_id`), so move/rename/star/trash/breadcrumb/share logic is written **once** instead of twice.

- `parent_id = NULL` → sits at root
- `type='file'` rows carry `size`, `mime_type`, `storage_key`, `sha256`
- Trash = soft delete (`is_deleted`, `deleted_at`) applied to a node **and** its subtree via recursive CTE

---

## 2. Backend Plan — `backend_fastapi_async/`

### 2.1 Directory structure

```
backend_fastapi_async/
├── pyproject.toml              # deps + pytest config + ruff
├── .env.example                # SECRET_KEY, DATABASE_URL, STORAGE_DIR, CORS_ORIGINS
├── app/
│   ├── main.py                 # FastAPI app, CORS, lifespan, router mounting, /api/health
│   ├── core/
│   │   ├── config.py           # pydantic-settings
│   │   ├── database.py         # async engine, sessionmaker, get_db dependency
│   │   ├── security.py         # bcrypt hash/verify, create/decode JWT (access+refresh)
│   │   └── deps.py             # get_current_user, require_owner/permission helpers
│   ├── models/
│   │   ├── user.py             # User
│   │   ├── node.py             # Node (folder|file)
│   │   └── share.py            # NodePermission, ShareLink
│   ├── schemas/
│   │   ├── auth.py  user.py  node.py  share.py
│   ├── api/
│   │   ├── auth.py             # register, login, refresh, logout
│   │   ├── nodes.py            # tree CRUD, star, trash, move, search, breadcrumbs
│   │   ├── files.py            # upload (multipart), download/stream, preview
│   │   ├── share.py            # permissions, shared-with-me, link CRUD/revoke
│   │   └── me.py               # profile, change password, storage usage, activity log
│   └── services/
│       ├── storage.py          # StorageDriver ABC → LocalDriver (+ S3Driver stub)
│       └── tree.py             # subtree ops: recursive CTE, move guard, trash/restore
├── storage/                    # gitignored object store (sha256-named files)
├── tests/
│   ├── conftest.py             # in-memory SQLite + TestClient fixtures, temp storage dir
│   ├── test_auth.py  test_tree.py  test_files.py  test_share.py
└── README.md                   # run instructions
```

### 2.2 Dependencies (`pyproject.toml`)

```
fastapi, uvicorn[standard], sqlalchemy[asyncio]>=2.0, aiosqlite,
pydantic>=2, pydantic-settings, python-jose[cryptography] (or pyjwt),
passlib[bcrypt] (or argon2), python-multipart, aiofiles, httpx (tests), pytest, pytest-asyncio, ruff
```

> **Prerequisite:** Python is **not installed** on this machine (`python`/`py`/`uv`/`pip` all missing). Install **Python 3.12+** (or `uv`) before Phase 1. Node 24 + npm 11 are already available.

### 2.3 Data model

**`users`**
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| email | str unique index | login handle |
| hashed_password | str | bcrypt |
| full_name | str | |
| storage_limit_bytes | int | default 15 GB (free tier) |
| created_at | datetime | |

**`nodes`** (folders + files)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| owner_id | fk users.id | |
| parent_id | fk nodes.id NULL | **adjacency list**; NULL = root |
| node_type | enum folder/file | |
| name | str | unique among siblings `(owner_id, parent_id, name, not deleted)` |
| size | int | 0 for folders; stored bytes for files |
| mime_type / storage_key / sha256 | str NULL | files only |
| is_starred | bool default false | |
| is_deleted | bool default false | soft-delete flag |
| deleted_at / deleted_root_id | datetime / uuid NULL | `deleted_root_id` = the ancestor that was trashed, so Restore puts the subtree back correctly |
| created_at / updated_at | datetime | `updated_at` = "recently edited" |

**`node_permissions`** (collaboration)
| column | notes |
|---|---|
| id, node_id fk, grantee_id fk, permission enum(`viewer`/`editor`) | unique `(node_id, grantee_id)` |
| granted_by fk, created_at | |

**`share_links`** (public/private links)
| column | notes |
|---|---|
| id, node_id fk, token str unique(22 char url-safe) | |
| permission enum(`viewer`/`editor`) | |
| expires_at NULL, revoked_at NULL | revoke = set `revoked_at` |
| password_hash NULL | **phase 2** — column exists, enforcement deferred |
| created_by fk, created_at | |

**`activity_log`** (feeds Recent view + future security logs)
`id, user_id, node_id, action enum(upload/download/view/edit/delete/restore/share/login), ip, created_at`

### 2.4 API surface

**Auth** (`app/api/auth.py`)
| method | path | purpose |
|---|---|---|
| POST | `/api/auth/register` | create user + seed welcome folder |
| POST | `/api/auth/token` | OAuth2 password form **or** JSON `{email,password}` → `{access_token, refresh_token}` |
| POST | `/api/auth/refresh` | rotate refresh → new access |
| POST | `/api/auth/logout` | (client discards tokens; server-side denylist in phase 2) |

**Nodes / folders** (`app/api/nodes.py`)
| method | path | purpose |
|---|---|---|
| GET | `/api/nodes?parent_id=&sort=&view=` | list children (folder first, then name/size/date) |
| GET | `/api/nodes/{id}/breadcrumbs` | ancestor chain `Home > Documents > Invoices` |
| POST | `/api/nodes/folders` | create folder `{name, parent_id}` |
| PATCH | `/api/nodes/{id}` | rename / move `{name?, parent_id?}` with cycle guard |
| DELETE | `/api/nodes/{id}` | soft-delete subtree → trash |
| GET | `/api/nodes/starred` | starred items |
| POST | `/api/nodes/{id}/star` | toggle star |
| GET | `/api/trash` | trashed roots |
| POST | `/api/trash/{id}/restore` | restore subtree |
| DELETE | `/api/trash/{id}` | **permanent** delete + remove objects from disk |
| DELETE | `/api/trash` | empty trash |
| GET | `/api/search?q=` | name search across non-deleted nodes |
| GET | `/api/recent` | activity-log driven recent list |

**Files** (`app/api/files.py`)
| method | path | purpose |
|---|---|---|
| POST | `/api/files/upload` | multipart `UploadFile` + `parent_id` → stream to disk, sha256, quota check |
| GET | `/api/files/{id}/download` | `FileResponse` with correct filename (attachment) |
| GET | `/api/files/{id}/preview` | inline/streamed content for the lightbox (images/video/text; supports HTTP Range) |

**Sharing** (`app/api/share.py`)
| method | path | purpose |
|---|---|---|
| GET | `/api/share/shared-with-me` | nodes where I have a `node_permission` |
| POST | `/api/share/permissions` | invite `{node_id, email, permission}` |
| PATCH | `/api/share/permissions/{id}` | change Viewer ↔ Editor |
| DELETE | `/api/share/permissions/{id}` | remove collaborator |
| GET | `/api/share/links` | all **my** active links (for the Links Manager) |
| POST | `/api/share/links` | create `{node_id, permission, expires_in?}` → returns full URL |
| DELETE | `/api/share/links/{id}` | **revoke** |
| GET | `/api/share/links/{token}` | resolve a link (public, permission-limited) |

**Me** (`app/api/me.py`)
`GET /api/me` (profile), `PATCH /api/me`, `POST /api/me/password`, `GET /api/me/storage` (`{used_bytes, limit_bytes, by_type: {image, video, doc, other}}`), `GET /api/me/activity` (security log — phase 2 screen).

### 2.5 Cross-cutting behaviors

- **Auth:** `Depends(get_current_user)` reads `Authorization: Bearer`. Ownership/permission checks in `core/deps.py` → `require_node_access(node, user, min_permission)`.
- **Tree safety:** rename/move rejects moving a folder into its own descendant (ancestor walk); delete uses `WITH RECURSIVE` to tag the subtree with `deleted_root_id`.
- **Quota:** sum sizes before accepting upload → `413` with a clear message.
- **CORS:** `CORS_ORIGINS` from env (Expo web dev server `http://localhost:8081`).
- **Storage abstraction:** `StorageDriver` interface (`save/open/delete/url`); `LocalDriver` implements v1, `S3Driver` is a stub so presigned uploads drop in later.
- **Rate limiting:** skip in v1 (documented as phase 2).

---

## 3. Frontend Plan — `frontend_react_native/`

### 3.1 Dependencies to add

```
axios                       # HTTP + auth interceptor
@tanstack/react-query       # server cache, invalidation
zustand                     # auth store + upload tracker store
expo-secure-store           # JWT persistence (web fallback: localStorage)
expo-document-picker         # file upload source
expo-image-picker           # photo upload source
expo-file-system            # read/progress for uploads (SDK 57 API)
expo-video                  # video preview
expo-clipboard              # "copy share link"
expo-sharing / expo-intent  # share sheet / open externally
react-native-pdf (phase 2)  # PDF lightbox — risky native dep, gated behind a web fallback
```
> All version-pinned with `npx expo install <pkg>` so they match SDK 57. Per `AGENTS.md`, verify API details against https://docs.expo.dev/versions/v57.0.0/ before coding.

### 3.2 Navigation map (expo-router file tree)

```
src/app/
├── _layout.tsx                 # providers: QueryClientProvider, AuthGate, ThemeProvider; redirects
├── (auth)/
│   ├── _layout.tsx             # Stack, redirects to (app) when token exists
│   ├── sign-in.tsx
│   ├── sign-up.tsx
│   ├── forgot-password.tsx     # "reset link sent" confirmation state
│   └── mfa.tsx                 # phase 2 (screen exists, disabled path)
├── (app)/
│   ├── _layout.tsx             # auth guard: no token → redirect /(auth)/sign-in
│   ├── (tabs)/
│   │   ├── _layout.tsx         # NativeTabs: Files | Shared | Recent | Profile
│   │   ├── index.tsx           # Dashboard / File Explorer (root)
│   │   ├── shared.tsx          # Shared with Me
│   │   ├── recent.tsx          # Recent / Activity
│   │   └── profile.tsx         # Profile menu → settings, storage, links, trash…
│   ├── folder/
│   │   └── [id].tsx            # FolderScreen (reusable, param: folder_id)
│   ├── search.tsx              # full search results
│   ├── starred.tsx
│   ├── trash.tsx
│   ├── links.tsx               # Shared Links Manager
│   ├── storage.tsx             # Storage & Billing dashboard
│   └── settings/
│       ├── profile.tsx         # personal info + change password
│       └── security.tsx        # security log (phase 2 data)
└── preview/
    └── [id].tsx                # FilePreviewModal (modal presentation route)
```

`_layout.tsx` (root) is rewritten from the current `AppTabs`-only layout: it keeps `ThemeProvider` + `AnimatedSplashOverlay`, adds React Query, the auth store, and a root `Stack` with `(auth)` / `(app)` groups. `AppTabs` moves to `(tabs)/_layout.tsx` with the four new triggers.

**Navigation conventions**
- Sidebar role = **quick-access chips** on the Dashboard header (Recent · Starred · Shared · Trash) + a **Profile tab menu** listing Links, Storage, Settings. (A drawer fights the NativeTabs shell; chips give the same one-tap reach.)
- Back navigation: `folder/[id]` pushes a stack; breadcrumbs rendered from `/api/nodes/{id}/breadcrumbs` with each crumb tappable.

### 3.3 Screen inventory → API mapping

| Screen / view | Primary endpoints | Key UI |
|---|---|---|
| **Dashboard** `/(app)/(tabs)/index` | `GET /api/nodes?parent_id=null`, `GET /api/me/storage` | search bar, grid⇄list toggle (persisted), quick-filter chips, storage progress bar, `Upload` + `New Folder` FAB |
| **Folder** `/(app)/folder/[id]` | `GET /api/nodes?parent_id=`, `GET /api/nodes/{id}/breadcrumbs` | breadcrumb trail, empty state, sort menu |
| **Search** `/(app)/search` | `GET /api/search?q=` | debounced input (300 ms), grouped results |
| **Recent** `/(app)/(tabs)/recent` | `GET /api/recent` | action badges (uploaded/edited/viewed), relative timestamps |
| **Starred** `/(app)/starred` | `GET /api/nodes/starred` | unstar swipe |
| **Shared with Me** `/(app)/(tabs)/shared` | `GET /api/share/shared-with-me` | owner avatar, permission pill (Viewer/Editor) |
| **Links Manager** `/(app)/links` | `GET/DELETE /api/share/links` | token, expiry, copy, **revoke** button |
| **Trash** `/(app)/trash` | `GET /api/trash`, restore/purge | `Restore` / `Delete forever` (confirm), "Empty trash" |
| **Profile** `/(app)/(tabs)/profile` | `GET /api/me` | menu → Settings, Storage, Links, Trash, Log out |
| **Storage & Billing** `/(app)/storage` | `GET /api/me/storage` | donut/bar breakdown by file type, tier cards (Free active; paid = phase 2) |
| **Settings** `/(app)/settings/*` | `PATCH /api/me`, `POST /api/me/password` | validated forms, inline errors |
| **Auth screens** `/(auth)/*` | `register`, `token`, `refresh` | secure token storage, error toasts |

### 3.4 Overlay components (`src/components/`)

| Component | Trigger | Behavior |
|---|---|---|
| `FileRow` / `FileCard` | tap → open; **long-press → context menu** | uses `react-native-gesture-handler` `onLongPress`; sheet with Rename · Move · Share · Star · Delete |
| `ContextMenuSheet` | long-press | bottom sheet; rename = inline modal with validation |
| `ShareModal` | context menu → Share | invite by email + Viewer/Editor segmented control, list/remove collaborators, **copy link** (`expo-clipboard`) with expiry selector |
| `FilePreviewModal` | tap on file | image → `expo-image` lightbox; video → `expo-video` full-screen; text/code → monospace scroll; PDF → `react-native-pdf` native / `expo-web-browser` on web; metadata footer + Download/Share actions |
| `UploadProgressTracker` | during upload | fixed bottom-corner overlay: per-file progress ring, queue count, retry on failure, auto-collapse when idle |
| `RenameDialog`, `MovePicker`, `ConfirmDelete` | context menu | `MovePicker` = folder tree picker using `GET /api/nodes?parent_id=` with cycle prevention client-side |
| `StorageBar`, `EmptyState`, `SearchBar`, `Breadcrumbs`, `ViewToggle`, `SortMenu` | various | shared primitives in `src/components/` |

### 3.5 State & data layer

**`src/lib/api.ts`** — axios instance, `baseURL` from `expo-constants` `extra.apiBaseUrl` (default `http://localhost:4000/api`), request interceptor attaches `Authorization: Bearer <access>`, response interceptor **on 401 → POST /api/auth/refresh (single-flight) → retry once**, else logout + redirect.

**`src/store/auth.ts`** (zustand) — `{user, accessToken, setSession, clear}`; tokens persisted via `expo-secure-store` (web: `localStorage`); hydrated before rendering the router (splash stays up until hydrated).

**`src/store/uploads.ts`** (zustand) — queue of `{id, name, size, progress, status: queued|uploading|done|error}`; uses `XMLHttpRequest`/`fetch` with `onUploadProgress` so the tracker updates live; sequential worker (concurrency 2).

**React Query keys**
```
['nodes', parentId, sort]   ['breadcrumbs', id]   ['storage']
['recent'] ['starred'] ['trash'] ['shared'] ['links'] ['search', q]
```
Mutations invalidate `['nodes']` (both old and new parent after move) and `['storage']`.

### 3.6 Theme / visual system

Extend the existing `src/constants/theme.ts` (keep `Colors`, `Spacing`, `Fonts`, `ThemedText`, `ThemedView`):
- add semantic tokens: `tint`, `border`, `danger`, `success`, `warning`, `star`
- components consume `useTheme()` from `src/hooks/use-theme.ts`
- grid = 2-column (`numColumns=2`) on narrow, 3–4 on wide (web/desktop widths); list = 64 px rows with thumbnail, name, meta (size · date), trailing actions
- follow existing conventions: `@/` alias, `StyleSheet.create`, strict TS, no inline comments

---

## 4. Implementation Phases

### Phase 0 — Prerequisites & scaffolding
1. Install **Python 3.12+** (or `uv`) — currently missing on this machine.
2. Create `backend_fastapi_async/pyproject.toml`, `.env.example`, package skeleton, `README.md`.
3. Frontend: `npx expo install` the new deps; confirm `npm run lint` and `npx tsc --noEmit` pass on the untouched template (baseline).

### Phase 1 — Backend core
1. `core/` config, database, security, deps.
2. Models: `User`, `Node`; migration-free `Base.metadata.create_all` on lifespan (add Alembic only if schema churn demands it).
3. `api/auth.py` (register/login/refresh) + tests.
4. `api/nodes.py` (list, create, rename, move, breadcrumbs, star, trash/restore/purge) + `services/tree.py` recursive ops + tests.
5. `api/files.py` (multipart upload → LocalDriver, download, preview w/ Range) + quota + tests.
6. `GET /api/me/storage`, `/api/recent`, `/api/search`.
7. Verify: `pytest`, `ruff check .`, `uvicorn app.main:app` + `/api/health`.

### Phase 2 — Sharing & collaboration
1. `NodePermission` + `ShareLink` models.
2. `api/share.py` endpoints; permission middleware (`require_node_access`).
3. Tests: viewer cannot write; editor can; revoked/expired links 403; shared-with-me excludes own nodes.

### Phase 3 — Frontend foundation
1. Rewrite `src/app/_layout.tsx`: providers + auth-aware root Stack.
2. `lib/api.ts` (interceptor/refresh), `store/auth.ts` (secure persistence), `hooks`.
3. Auth screens: sign-in, sign-up, forgot-password (+ placeholder MFA route).
4. `(tabs)/_layout.tsx` shell with Files/Shared/Recent/Profile; nav guards.

### Phase 4 — Explorer core
1. Dashboard: list/grid toggle, quick-filter chips, storage bar, New Folder, search bar.
2. `folder/[id]` + breadcrumbs + empty states + sort.
3. Context menu (long-press) + Rename / Move / Delete dialogs.
4. Upload flow: document/image picker → `store/uploads.ts` → **UploadProgressTracker**.

### Phase 5 — Secondary views
1. Recent, Starred, Shared with Me, Trash (restore/permanent delete/empty).
2. Links Manager (create/copy/revoke).
3. `FilePreviewModal` (image/video/text; PDF behind a platform check).

### Phase 6 — User & settings
1. Profile menu, settings/profile, settings/security (log placeholder).
2. Storage & Billing screen (usage breakdown + tier cards, paid tiers read-only).
3. `ShareModal` (invites, permission switch, copy link).

### Phase 7 — Hardening & verification
1. `npm run lint` and `npx tsc --noEmit` clean; `ruff check` + `pytest` green.
2. End-to-end smoke: register → upload → nest folders → share → link revoke → trash → restore.
3. Edge cases: offline (query error states), 401 refresh race, upload failure retry, empty states, permission-denied states, large list pagination (`?page=`).
4. Run `npm run web` for quick visual QA of grid layout; native via `npx expo start`.

### Phase 8 — Deferred (not in v1)
MFA enrollment/challenge, billing & payment tiers, security log UI, password-protected links, chunked/resumable uploads + S3 presigned URLs, sharing via share-sheet, pagination/infinite scroll, Alembic migrations, rate limiting, logout token denylist.

---

## 5. Route ↔ Endpoint quick reference

| Frontend route | Method | Backend path |
|---|---|---|
| `/(auth)/sign-in` | POST | `/api/auth/token` |
| `/(auth)/sign-up` | POST | `/api/auth/register` |
| `/(auth)/forgot-password` | POST | `/api/auth/forgot-password` *(stub in v1: returns generic success)* |
| `/(app)/(tabs)/index` | GET | `/api/nodes?parent_id=null` |
| `/(app)/folder/[id]` | GET | `/api/nodes?parent_id={id}` + `/api/nodes/{id}/breadcrumbs` |
| `/(app)/search` | GET | `/api/search?q=` |
| `/(app)/(tabs)/recent` | GET | `/api/recent` |
| `/(app)/starred` | GET | `/api/nodes/starred` |
| `/(app)/(tabs)/shared` | GET | `/api/share/shared-with-me` |
| `/(app)/links` | GET/DELETE | `/api/share/links[/{id}]` |
| `/(app)/trash` | GET/POST/DELETE | `/api/trash[...]` |
| `/(app)/storage` | GET | `/api/me/storage` |
| `/(app)/settings/profile` | GET/PATCH | `/api/me` |
| upload (any screen) | POST | `/api/files/upload` |
| preview | GET | `/api/files/{id}/preview` |

---

## 6. Risks & open items

| Risk | Mitigation |Check
|---|---|
| **Python not installed** | Phase 0 prerequisite; without it, backend can be written but not executed/tested. |
| PDF preview native dep (`react-native-pdf`) | Ship behind a platform check; web/native fallback = `expo-web-browser` external open. Verify Expo SDK 57 compat first. |
| `expo-router/unstable-native-tabs` API drift | Read https://docs.expo.dev/versions/v57.0.0/ before editing tab layout (per `AGENTS.md`). |
| Local disk storage in multi-device deploys | `StorageDriver` abstraction leaves an S3 drop-in point; documented as phase 2. |
| Token refresh races | Single-flight refresh promise in the axios interceptor. |
| Deep tree operations (move/delete) | Recursive CTE + cycle guard, covered by `test_tree.py`. |

## 7. Open questions (non-blocking; defaults chosen)

1. **API port** — default `:4000` (Expo typically uses `:8081`). *Set in `.env`.*
2. **Real email delivery** — v1 returns a generic "if the account exists…" response for forgot-password. *Confirm if an email provider is wanted.*
3. **Seed data** — plan includes a `seed.py` to create a demo user + sample tree for fast manual testing. *Say if you'd rather not.*

Backend Fastapi Use async and uv add

---

## 8. Implementation status (2026-10-02)

Phases 0–7 completed the original cloud design. Phase 9 then **pivoted the app to
local-first** (no sign-in, on-device storage, device-lock gate); the backend is now a
legacy reference the app no longer talks to.

| Phase | Status | Notes |
|---|---|---|
| 0 — Prerequisites | done | Python 3.13 venv at `backend_fastapi_async/.venv`; Node 24 / npm 11. Docker not installed locally (compose YAML validated, not run). |
| 1 — Backend foundation | done (legacy) | `app/core`, models, storage driver, JWT auth, health. |
| 2 — Sharing & permissions | done (legacy) | `api/share.py`, inherited node permissions, link revoke/expiry. |
| 3 — Frontend foundation | superseded | Auth gate replaced by the lock gate (Phase 9). |
| 4 — Explorer core | done | Explorer, breadcrumbs, context menu, import queue + tracker (now local). |
| 5 — Secondary views | adapted | Recent/Starred/Trash kept; Shared & Links removed; preview reads local files + OS share sheet. |
| 6 — User & settings | adapted | Profile/password removed; App Lock settings + local security log + local storage dashboard. |
| 7 — Hardening | done | See verification table below. |
| 8 — Deferred | deferred | MFA (placeholder route), billing, password links, chunked/S3 uploads. |
| 9 — Local-first pivot | done | See below. |
| 10 — UI/UX pass | done | See below. |

### Phase 10 — UI/UX pass (2026-10-02)

Directive: improve the front end. Emoji/unicode glyphs replaced by one real design system.

- **Tokens**: `constants/theme.ts` gained soft tints (`tintSoft`, `dangerSoft`, `successSoft`),
  `scrim`, `Shadows` via cross-platform `boxShadow`, `Radius`, `Duration`, `Spacing`.
- **Icons**: `components/icons.tsx` wraps Ionicons (`@expo/vector-icons`), with
  `iconForCategory` (file kind → glyph), `IconTile`, `AppMark`; font preloaded in
  `app/_layout.tsx`. The `Icons`/`glyphFor` emoji maps are gone.
- **Primitives**: `components/primitives.tsx` rebuilt around `Screen`, `Group`,
  `SectionHeader`, `AppButton` (4 variants + loading), `IconButton`, `PressScale`,
  `SettingRow` (icon tile + switch + chevron), `Field`, `EmptyState`, `ErrorBanner`,
  `Spinner`, `Skeleton`/`SkeletonRows`, `ProgressBar`.
- **Feedback**: `lib/haptics.ts` (guarded native haptics) and `components/toast.tsx`
  (`toast.success/error/info` + `ToastHost` mounted in `app/_layout.tsx`) — long-press,
  star, rename, move, trash, restore, import errors now confirm themselves.
- **Screens**: shared `ScreenHeader` (safe-area aware, back button, large titles);
  `nodes.tsx` list/grid with real thumbnails, category icons, pull-to-refresh;
  `explorer.tsx` FAB + quick chips + storage strip + sort sheet; settings/storage/security
  switched to grouped rows; preview modal got star/share and a metadata card; lock screen,
  activity log, upload tracker, web tab bar and the launch splash all restyled (AppMark,
  no Expo template assets).
- **Cleanup**: removed template leftovers (`themed-view`, `hint-row`, `web-badge`,
  `external-link`, `components/ui`, `animated-icon.web.tsx` + its CSS module) and dead
  exports (`Badge`, `Divider`, `Row`, `MaxContentWidth`, `HitSlop`).
- **Metro**: `metro.config.js` now treats every file extension used in the project (plus
  `wasm`/`sqlite`/`db`/font containers) as an importable asset, while source extensions
  stay source.

### Phase 9 — Local-first pivot (2026-10-02)

Directive: run on a phone, no sign-in, use device security, store files on the phone.

- **Storage**: file content in the app sandbox (`src/lib/storage.ts`, expo-file-system
  new API); metadata in SQLite (`src/lib/db.ts`, expo-sqlite) with migration + seed
  (`Documents/`, `Photos/`, `Welcome.txt`).
- **Data layer**: `src/hooks/use-api.ts` rewritten over local db (same hook names);
  removed shared/links/permissions/profile/password hooks, `lib/api.ts`, `store/auth.ts`.
- **Lock**: `store/security.ts` + `components/lock-screen.tsx` overlay in `app/_layout.tsx`;
  `expo-local-authentication` (biometrics with passcode fallback), auto-relock on
  background, only when the device has a screen lock enrolled; web skips the lock;
  enabled flag persisted under `filebox.lockEnabled`.
- **Routes**: removed `(auth)/`, `links`, `shared`, `profile`, standalone `starred`;
  tabs are now Files | Recent | Starred | Settings; new `settings/security`.
- **Sharing**: OS share sheet via `expo-sharing` (replaces links/invites).
- **Deps added**: `expo-sqlite`, `expo-local-authentication`, `expo-file-system`
  (direct); removed `axios`, `expo-clipboard`. `metro.config.js` wires `.wasm` for
  SQLite-on-web; `app.json` adds the `expo-local-authentication` plugin (Face ID string)
  and sets `web.output: "single"` (static rendering hits an upstream SDK 57 dev-server
  serializer bug — `Worker chunk not found` for the expo-sqlite web worker).
- **Backend**: kept in-repo, untested by the app; pytest/ruff/E2E still green.

**Verification**

| Check | Result |
|---|---|
| `npx tsc --noEmit` (frontend) | clean |
| `npm run lint` | 0 errors, 0 warnings |
| `npx expo export --platform web / ios / android` | all three bundle |
| `npx expo install --check` | dependencies up to date |
| `npx expo start --web` | `GET /` 200, dev bundle 200 (~8.4 MB), no worker error |
| `pytest -q` (legacy backend) | 10/10 pass |
| `ruff check app tests scripts` (legacy backend) | clean |
| E2E smoke (`backend_fastapi_async/scripts/e2e-smoke.ps1`, API on `:4000`) | 36/36 pass |

**Extras beyond this plan**: quick-access chips, persisted view/sort preferences,
responsive grid columns, debounced search, duplicate filename prevention, activity log
with clear action, per-app READMEs, and a shared design system (Phase 10) covering icons,
toasts, haptics, skeletons and grouped settings rows.

**Known follow-ups**: on-device QA (Expo Go on a real phone) — lint/typecheck/bundles
are the automated checks here; `docker compose up --build` where Docker is available.
