# FileBox — on-device file & folder manager

A local-first React Native (Expo SDK 57) app for browsing, organizing, previewing and
sharing files. **Everything lives on the phone** — no account, no sign-in, no cloud. The
app is gated by the device's own security (Face ID / fingerprint / passcode) when the
device has a lock enrolled.

```
Plan.md                     # implementation plan (scope, architecture, phases)
frontend_react_native/      # the app: Expo (iOS / Android / web)
backend_fastapi_async/      # legacy cloud backend — kept for reference, unused by the app
```

## Quickstart

```powershell
cd frontend_react_native
npm install
npx expo start          # scan the QR code with Expo Go (iOS/Android)
```

Notes:

- File content is stored in the app's private documents directory; metadata lives in a
  local SQLite database (migrated and seeded on first launch: `Documents/`, `Photos/`,
  `Welcome.txt`).
- App lock activates only when the device has a screen lock enrolled; it can be toggled
  in Settings → App Lock. The web build skips the lock.
- iOS Face ID requires a development build (permission string is configured via the
  `expo-local-authentication` plugin); passcode/fingerprint fallback works in Expo Go.

## Features

- Files & folders: create, nest, rename, move, breadcrumbs, duplicate-name prevention
- Import from device (files, photos & videos) with a local save progress tracker
- Views: list/grid (persisted), sort, search, recent, starred
- Preview: images, video, audio, text — and save/share any file via the OS share sheet
- Trash: soft delete of whole subtrees, restore, delete-forever, empty trash
- Storage dashboard: local usage vs device free space
- Security: Face ID / fingerprint / passcode app lock, local activity log
- UX: long-press context menu, empty/error states, dark + light theme,
  native tabs on mobile, custom tab bar on web

## Legacy backend (optional)

`backend_fastapi_async/` is the original cloud implementation (FastAPI + SQLAlchemy async,
Celery, Docker, share links, permissions, accounts). The app no longer uses it — it stays
in the repo as a working, tested reference:

```powershell
cd backend_fastapi_async
python -m venv .venv
.venv\Scripts\pip install -e ".[dev]"
.venv\Scripts\python -m uvicorn app.main:app --reload --port 4000
```

## Verification

| Check | Command | Status |
|---|---|---|
| Frontend types | `npx tsc --noEmit` | clean |
| Frontend lint | `npm run lint` | 0 errors |
| Bundles | `npx expo export --platform web/ios/android` | all three export |
| Backend unit/API tests (legacy) | `python -m pytest -q` | 10/10 pass |
| Backend lint (legacy) | `python -m ruff check app tests scripts` | clean |
| End-to-end smoke (legacy) | `powershell -File scripts\e2e-smoke.ps1` (API running) | 36/36 pass |

## Notes

- v1 scope excludes MFA, billing, password-protected links, resumable/S3 uploads
  (see `Plan.md` Phase 8).
- No Alembic on the backend: schema is created on startup (`Base.metadata.create_all`).
- Web is supported (SPA mode, `web.output: "single"`); SQLite on web is alpha upstream
  (WASM via Metro — see `metro.config.js`).
