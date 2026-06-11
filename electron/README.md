# ERPOVO Desktop (Electron)

ERPOVO is a TanStack Start SSR app. The desktop build boots the bundled
production server on `127.0.0.1` and points an Electron `BrowserWindow` at it.
All existing browser features (localStorage demo data, jsPDF print, JSZip
backup/restore) work unchanged.

## One-time install (on your Windows machine)

```
bun install
bun add -d electron @electron/packager electron-builder concurrently wait-on cross-env
```

> The Lovable sandbox cannot install Electron or build a Windows `.exe`. Run
> the commands above on a real Windows (or macOS/Linux) machine.

## Scripts

| Script                  | What it does                                                  |
| ----------------------- | ------------------------------------------------------------- |
| `bun run dev:web`       | Vite dev server only (browser).                               |
| `bun run build:web`     | Production web build (`.output/`).                            |
| `bun run dev:desktop`   | Starts vite dev + Electron pointed at `http://localhost:3000`.|
| `bun run build:desktop` | `build:web` then runs Electron against the built server.      |
| `bun run package:windows` | Builds the web app then packages a Windows installer + portable. |

## Windows installer output

`electron-builder` writes installers to:

```
release/ERPOVO Setup <version>.exe    ← NSIS installer
release/ERPOVO <version> portable.exe ← portable single-file
```

## Files added

- `electron/main.cjs` — main process, menu, window, embedded prod server.
- `electron/preload.cjs` — exposes `window.erpovo` (desktop flag).
- `electron-builder.yml` — Windows packaging config.
- `electron/README.md` — this file.

## Behavior

- Default window 1440x900, min 1200x760, starts maximized.
- App menu: File (Exit), View (Reload, Fullscreen, Zoom, DevTools in dev), Help.
- External links open in the system browser; in-window navigation is locked
  to the embedded server origin.
- DevTools available only when `app.isPackaged === false`.
- Fully offline. No Supabase or internet required.

## Data

Current build uses the existing `localStorage` demo store inside the Electron
renderer (Chromium storage is persistent across launches). The preload exposes
`window.erpovo` so a future phase can add SQLite (`better-sqlite3`) without
touching the React code.

## Known limitations

- Printing uses the in-page jsPDF path (same as the web app); native print
  preview is not customized.
- macOS `.dmg` and Linux `.AppImage` are not wired here — only Windows.
- The TanStack Start production server runs as a child Node process inside
  the packaged app; first launch may take ~2 seconds to become reachable.
