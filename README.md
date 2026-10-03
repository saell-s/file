# FileBox

**A private file manager for your phone.** FileBox organizes, previews and shares the
files already on your device — with nothing uploaded anywhere.

There is no account, no sign-in and no cloud. Every file and folder lives inside the
app's own private storage on the phone, and the whole app sits behind your device's
lock screen (Face ID, fingerprint or passcode) when you turn the lock on. It is the
feel of a stock Files app with none of the data leaving your hand.

---

## What the app does

FileBox is where you keep things you want on your phone but not in your camera roll or
a cloud drive: work documents, PDFs, recordings, screenshots, installers, notes.

- **Import anything** — pick files, photos or videos from other apps; they are copied
  into FileBox's private folder with a live progress tracker.
- **Organize like a real file system** — nested folders, breadcrumbs, rename, move,
  duplicate-name protection, and a sort order of your choice.
- **Browse two ways** — a clean list view or an image-first grid; your choice is
  remembered across launches.
- **Find it fast** — instant search across every file and folder, plus *Recent* and
  *Starred* smart views.
- **Preview in place** — images, video, audio and text/code render right in the app;
  anything else gets a metadata card.
- **Share the OS way** — send any file through the standard share sheet (AirDrop,
  Messages, email, …) — never through FileBox servers, because there are none.
- **Delete safely** — trash keeps deleted items until you restore them or empty it;
  nothing vanishes on accident.
- **See your space** — a storage dashboard breaks usage down by file type against the
  device's free space.
- **Lock it down** — optional biometric/passcode app lock, plus a local security log
  of unlocks and destructive actions.

Out of the box it ships seeded with `Documents/`, `Photos/` and a `Welcome.txt` so the
app is never an empty box.

## How it stays private

| Principle | What it means in practice |
|---|---|
| Files never leave the device | Content is written to the app sandbox with `expo-file-system`; sharing goes through the OS share sheet only |
| Metadata is local | Names, sizes and folders live in an on-device SQLite database (`expo-sqlite`) |
| No account system | There is nothing to sign into; no email, no password, no tracking |
| Device lock is the only key | `expo-local-authentication` reuses Face ID / fingerprint / passcode — the app never stores its own password |
| Works offline | Every feature is available in airplane mode |

Deleting the app deletes your files with it — FileBox has no copy anywhere else.

## Quickstart

```powershell
cd frontend_react_native
npm install
npx expo start          # scan the QR code with Expo Go (iOS/Android), or press w for web
```

Notes:

- App lock activates only when the device has a screen lock enrolled; toggle it in
  *Settings → App Lock*. The web build skips the lock.
- iOS Face ID needs a development build (the permission string ships via the
  `expo-local-authentication` plugin); passcode/fingerprint fallback works in Expo Go.

## Repository layout

```
Plan.md                     # implementation plan (scope, architecture, phases)
frontend_react_native/      # the app: Expo SDK 57 (iOS / Android / web)
backend_fastapi_async/      # legacy cloud backend — kept as a tested reference, unused
```

### Frontend at a glance

```
src/
  app/          # routes — tabs (Files, Recent, Starred, Settings), folder,
                # search, trash, storage, activity, security, preview
  components/   # design system: icons, primitives, nodes, explorer,
                # sheets, toasts, uploads tracker, lock screen
  lib/          # db.ts (SQLite), storage.ts (sandbox files), haptics, format
  store/        # zustand — security (lock), upload queue, preferences
  constants/    # theme tokens (colors, spacing, radii, shadows)
```

## Legacy backend (optional)

`backend_fastapi_async/` is the original cloud implementation (FastAPI + SQLAlchemy
async, Celery, Docker, accounts, share links, permissions). The app no longer talks to
it — it remains in the repo as a working, tested reference:

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
| Frontend lint | `npm run lint` | 0 errors, 0 warnings |
| Bundles | `npx expo export --platform web/ios/android` | all three export |
| Dev web server | `npx expo start --web` | `GET /` + bundle 200 |
| Backend unit/API tests (legacy) | `python -m pytest -q` | 10/10 pass |
| Backend lint (legacy) | `python -m ruff check app tests scripts` | clean |
| End-to-end smoke (legacy) | `powershell -File scripts\e2e-smoke.ps1` (API running) | 36/36 pass |

## Notes

- v1 scope excludes MFA, billing, password-protected links, resumable/S3 uploads
  (see `Plan.md` Phase 8).
- No Alembic on the backend: schema is created on startup (`Base.metadata.create_all`).
- Web runs in SPA mode (`web.output: "single"`); SQLite on web is alpha upstream
  (WASM loaded as a Metro asset — see `metro.config.js`).
- Architecture, phase history and the UI/UX pass are documented in `Plan.md`.
