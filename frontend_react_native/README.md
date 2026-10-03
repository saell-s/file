# FileBox (Expo SDK 57)

Local-first React Native / Expo app: a file & folder manager that stores **everything on
the device** — no account, no server, no cloud. Gated by the device lock (Face ID /
fingerprint / passcode). Ships as iOS, Android and web from one codebase (expo-router,
typed routes).

## Prerequisites

- Node 20+ and npm
- Expo Go on your phone (or a development build), scan the QR from `npx expo start`

## Get started

```bash
npm install
npx expo start          # scan QR with Expo Go, or press w (web), i (iOS), a (Android)
```

No backend needed. Data lives in the app sandbox:

- **Files**: app documents directory (`src/lib/storage.ts`), one subdirectory per folder.
- **Metadata**: SQLite via `expo-sqlite` (`src/lib/db.ts`), migrated + seeded on first
  launch (`Documents/`, `Photos/`, `Welcome.txt`).
- **Lock**: `expo-local-authentication`; enabled in Settings → App Lock, only when the
  device has a screen lock enrolled (web skips the lock). Unlocks persist under the
  `filebox.lockEnabled` key in secure storage.

## Scripts

| Command | Purpose |
|---|---|
| `npm start` | Expo dev server |
| `npm run web` / `android` / `ios` | Platform shortcuts |
| `npm run lint` | ESLint (eslint-config-expo) |
| `npx tsc --noEmit` | Type check (strict, typed routes) |
| `npx expo export --platform web|ios|android` | Production bundle check |

## Structure

```
src/
  app/                  # expo-router routes
    _layout.tsx         # providers (React Query, theme) + lock gate + relock on background
    (app)/(tabs)/       # Files | Recent | Starred | Settings (NativeTabs)
    (app)/              # folder/[id], search, trash, storage, activity, settings/security
    preview/[id]        # file preview (image/video/audio/text) + OS share sheet
  components/           # icons + design-system primitives, nodes list/grid, explorer,
                        # sheets (context menu, move, dialogs), toasts, uploads tracker,
                        # lock screen, screen header
  hooks/use-api.ts      # React Query keys, queries and mutations (backed by local db)
  lib/
    db.ts               # SQLite schema, queries, mutations, seed
    storage.ts          # on-device file content helpers (expo-file-system)
    secure-storage.ts   # expo-secure-store wrapper (localStorage on web)
    errors.ts/format.ts # error messages, formatters
    haptics.ts          # guarded expo-haptics wrapper (native only)
  store/                # zustand: security (lock), upload/import queue, preferences
  constants/theme.ts    # colors (light/dark), spacing, radii, shadows, durations
```

## Design system

| Piece | Where |
|---|---|
| Tokens (colors, spacing, radii, `boxShadow` elevation, durations) | `src/constants/theme.ts` |
| Icons (`@expo/vector-icons` Ionicons, `iconForCategory`, `AppMark`) | `src/components/icons.tsx` |
| Buttons, icon buttons, grouped setting rows, fields, empty/error states, skeletons, progress bars | `src/components/primitives.tsx` |
| Toast API (`toast.success/error/info`) + `ToastHost` | `src/components/toast.tsx` |
| Haptics (`haptics.selection/light/medium/...`, native only) | `src/lib/haptics.ts` |

Screens compose these instead of ad-hoc styles: dark/light themes come from
`useTheme()`, list screens use `NodeList` (pull-to-refresh, skeletons, long-press actions),
and destructive flows go through `ConfirmDialog` so haptics and toasts stay consistent.

## Behavior notes

- **App lock**: shown as an overlay over the mounted stack; auto-relocks when the app
  leaves the foreground. Unlock attempts use biometrics with passcode fallback
  (`disableDeviceFallback: false`); if the device has no screen lock, the gate is skipped.
- **Imports**: picked files (expo-document-picker / expo-image-picker) are copied into the
  app sandbox with a progress queue (`src/store/uploads.ts`), 2 in parallel, per-file retry.
- **Previews**: read directly from local file content; sharing uses the OS share sheet
  (`expo-sharing`) — no network involved.
- **Views**: list vs. grid and sort order persist across launches; the grid switches
  2 → 3 → 4 columns with window width.
- **Web**: SPA mode (`web.output: "single"`) — SQLite runs on WASM (alpha upstream),
  `.wasm` and every other file extension used in the project are wired as Metro assets in
  `metro.config.js` (source extensions stay source). Static rendering
  (`"static"`) hits an upstream SDK 57 serializer bug in dev
  (`Worker chunk not found` for the expo-sqlite web worker); production export
  worked either way, but `"single"` keeps `expo start` → `w` working.
- **Icons**: Ionicons via `@expo/vector-icons` (`src/components/icons.tsx`), preloaded in
  `src/app/_layout.tsx`; file kinds map through `iconForCategory`.
- **Feedback**: every list refresh has a spinner, every long-running action a toast, and
  native targets get haptic ticks on selection, long-press and destructive actions.

## Backend

The repo's `backend_fastapi_async/` is the legacy cloud backend (accounts, share links,
permissions). The app does not use it — see `../README.md` for running it standalone.
