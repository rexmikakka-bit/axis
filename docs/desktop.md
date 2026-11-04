# Axis desktop

The desktop app lives on the `desktop-workspace` branch. Owen's design spec is
`docs/desktop-handoff.md` (its mockup is in `docs/desktop/`). Owen's standing rules for it:

- **Every phone feature exists on desktop.** The mockup is not a feature list; where it is silent,
  the phone app is the spec.
- **The mockup's numbers are cosmetic.** Every figure shown must be the one the phone shows.
- A separate app, so desktop-only features never weigh on the phone build.

## Running it

| command | what it does |
| --- | --- |
| `npm run dev:desktop` | dev server on <http://localhost:5180/> |
| `npm run build:desktop` | production build into `dist-desktop/` (page emitted as `index.html`) |
| `npm run tauri dev` | the native Windows app (needs Rust + MSVC build tools, below) |
| `npm run tauri build` | NSIS + MSI installers |

`npm run verify` builds both apps, so a desktop break fails the gate.

Tauri prerequisites on Windows: Rust from <https://rustup.rs>, the Visual Studio C++ Build Tools
("Desktop development with C++" workload), and WebView2 (already present on Windows 10/11).

The dev servers are separate origins, so `localhost:5180` has its own IndexedDB and localStorage,
separate from the phone's dev server on 5173. Fits made in one don't show up in the other.

## How it is put together

```
desktop.html                    entry page (boot screen + theme pick, same as index.html)
vite.desktop.config.js          its own build; the phone's vite.config.js never sees it
src/use-fit-session.js          THE fit session — shared with the phone's App.jsx
src/desktop/main.jsx            boot (fit store, migrations, locale), same order as src/main.jsx
src/desktop/DesktopApp.jsx      header, fit tabs, dialogs, satellite (pop-out) mode
src/desktop/Workspace.jsx       window manager UI: chips, workspace, status bar
src/desktop/DeskWindow.jsx      one window's chrome: drag, resize, keyboard, Escape-cancel
src/desktop/layout.js           pure geometry: presets, snapping, rescue, persistence (suite-pinned)
src/desktop/windows.jsx         what each window contains
src/desktop/sync.js             keeps popped-out windows in step (BroadcastChannel)
src-tauri/                      the Tauri 2 shell
```

**One session, two shells.** `useFitSession()` holds everything about the fit and the app's
settings: the fit library, the fit being edited, its pilot, links and projections, tabs, recent
fits, undo, price optimisation, and every persisted preference. The phone's `App.jsx` and the
desktop's `DesktopApp.jsx` both call it, so an edit means the same thing in both. The session
reaches the shell only through two callbacks: `onFitOpened(keepPage)` and `notify(kind, msg, ms)`.
**Add new fit state to the session, not to either shell**, or the other app silently lacks it.

**Windows host the phone's own components.** Fitting = `FitTab`, Browser = `FittingsScreen`'s ship
library and fit list, Effects = `EffectsScreen`, plus `CargoScreen`, `DronesScreen`,
`ImplantsScreen` and `GraphTab`. The stat windows are `StatsTab` with its new `sections` prop, which
renders only some cards and draws them flush inside the window. Those components' pickers and info
sheets open as the phone's bottom sheets, which centre at 430 px on a wide screen. A desktop-shaped
layout (e.g. the mockup's column table for Fitting) can replace any one of these later. Until it
does, the phone's version is what renders, so no feature goes missing in the meantime.

**Pop-out** opens `?satellite=<window id>` with `window.open`: the same app, showing one window
and running its own session from the same storage. `sync.js` mirrors changes both ways. It sends
one message per render with every changed value, and the receiver applies the whole message in a
single handler. This matters because the session autosaves `slots` into whichever fit `activeFit`
names. If a receiver rendered the new `activeFit` and the old `slots` separately, it would overwrite
the newly opened fit with the previous one's modules. A satellite never writes
`axis_desktop_layout`.

**Layout** state is `axis_desktop_layout` (version-stamped, validated field by field on read, so
bad data falls back to the Default preset). It holds every window's geometry, open and detached
state, z-order, the snap toggles, the lock, and named layouts.

## Status

Done:
- **Window manager:** move, resize from every edge, focus and z-order, both snap toggles, lock,
  Escape to cancel a drag, arrow-key and Shift+arrow keyboard path, the three presets, named
  layouts, off-screen rescue, and persistence.
- **Windows:** every phone screen has one.
- **Header:** everything from the phone's menu (import/export EFT and EVE, snapshot, optimise
  price, shopping list, feedback, settings, pilot, damage profile, ship info), plus the open-fit
  tabs.
- **Pop-out:** real OS windows, kept in sync with the main window.
- **Notes:** a desktop-only window saving free text as `notes` on the fit record.
- **Tauri:** the shell is scaffolded (`src-tauri/`).

Not done yet:
- **Tauri never built:** Rust wasn't installed. First run: `npm run tauri dev`.
- **Untested under Tauri:** pop-out. If Tauri doesn't honour `window.open`, switch it to
  `@tauri-apps/api`'s `WebviewWindow`. BroadcastChannel should work across Tauri windows (one
  origin, one WebView2 environment).
- **ESI login:** the phone gets its callback through Capacitor's deep link
  (`eveauth-visviva://`). Desktop needs Tauri's deep-link plugin for the same scheme, or a loopback
  redirect. ceve-market prices and ESI calls need native HTTP too (Tauri's http plugin); in the
  browser build they hit CORS exactly as on the phone's web build.
- **Desktop-shaped layouts from the mockup:**
  - the Fitting column table with resizable columns;
  - the Market/Ships toggle in the Browser (today the Browser is the ship library, and modules are
    picked from the Fitting window's slots, as on the phone);
  - an Avg column in Defense (the window shows the phone's resist table, including its per-layer
    multiplier).
- **App icon:** generated from the 256 px favicon; a 1024 px master would be sharper.
- **Dev console:** a React key warning shows when opening the Fits list. It's pre-existing, from
  `FittingsScreen`, also happens on mobile, and hasn't been found yet.
