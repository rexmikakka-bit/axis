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

## The desktop redesign (Owen, 2026-11-04)

Owen: "I want this to be its own thing, not just a cheap port of the mobile app to desktop", and
"take any precautions to not unintentionally break anything on the mobile app". So windows are
desktop-native components in `src/desktop/`, displaying the shared session and engine. Phone
components are reused only for deep flows: the module menu, item info, the pickers, and the
import/export and settings dialogs. A phone file only changes to gain an optional prop the phone
never passes.

| Window | State |
| --- | --- |
| Header | One row: fit tabs, the pilot, the damage profile, a Windows checklist menu, and ☰ for the phone's hamburger items. Save layout is in the status bar. |
| Browser | Native (`Browser.jsx`): Market and Ships trees that expand in place; Market lists the selected category's items below the tree. A rack button narrows Market to that rack's modules; with none lit it is CCP's whole market tree (`market-tree.json`, the cargo picker's), so drones, implants, boosters, charges and hold items are there too. Double-click does the item's own action, right-click lists every other destination, and any row drags onto a window. |
| Items | `items.js` is the one place that knows what an item is (module and rack, charge, drone, fighter, implant, booster, ship, cargo) and how it is added. The windows' add rules moved there, so the Browser, drag-and-drop and the windows cannot disagree. `items-context.jsx` gives every window `add` / `accepts` and `useItemDrop`; a charge dropped on one Fitting row loads only that row (and its group), anywhere else in the window every module that takes it. Raw materials and fuel are not in the bundled market tree, so they can't be added yet. |
| Fitting | Native table (`FitTable.jsx`) through FitTab's `TableView` prop: CPU, PG, Cap/s, Range, Info and ISK columns, resizable. |
| Resources, Capacitor, Targeting and mobility, Validation | Native (`stat-panels.jsx`), over ONE `useFitStats` call made with the phone Stats page's options. Validation's verdict also shows on the Fitting title bar. |
| Firepower | Native (`Firepower.jsx`). The ammo ranking is an in-window table. |
| Defense, Cargo | Native (`stat-panels.jsx` DefensePanel, `Cargo.jsx`). |
| Projected, Command links, Boosters, Environment | Native (`Effects.jsx`): the phone's Effects tab split into four windows. The Projected window mirrors the phone card's arithmetic in `projectedLines`, so keep the two in step. |
| Fit price, Implants, Drones | Native (`Price.jsx`, `Implants.jsx`, `Drones.jsx`). Price mirrors the phone Fit Value card's pricing rules, so keep the two in step. A hull with fighter tubes gets `Fighters.jsx` in the same window instead (same launch rule as the phone's DronesScreen). |
| Graphs | Native (`Graphs.jsx`), after pyfa's graph window: many fits × many targets, one line per pair through the phone's own generateCurve, and the Application profile (best ammo per range, stitched and coloured by round). Compact when narrow (controls fold away) or expanded; there is also a Graphs layout preset. Engagement uses the phone's flight-vector wheels (`VectorCompass`, with `size`/`bare` for the desktop); speeds stay a percent of each fit's top speed, shown in m/s against the first fit and target. Targets can be typed sig/speed (`kind: "custom"`, or Edit on a preset). Axis maximums are typed per graph and axis pair; a typed X widens each curve's data through generateCurve's `xZoom`, not just the axis. |
| Mouse model | Left click selects, double click does the row's main action, right click opens a context menu (`ContextMenu.jsx`). The Fitting table multi-selects (ctrl/shift, Delete removes) in `FitTable.jsx`; every other list (Market, Implants, Drones, Boosters, Cargo) uses `useRowSelect`. A fit in the Ships tree is the exception: one click opens it, as in pyfa. The phone's pickers open as centred dialogs because the desktop roots provide `DialogFrame` through `SheetFrame` (`lib/sheet-frame.js`): `BottomSheet`, `ItemInfoSheet` and `SubsystemPickerSheet` hand their rendering to it, and the bare sheets (pilot, chooser, shopping list, ESI, feedback) swap their outer styles through `useDeskSheet`. |
| Item windows | An item (fitted module, drone, implant, booster, or any type) is a TARGET (`inspect.js`: addressed by slot, not type, so a swap keeps the window). Every list click sets the app-wide selection (`inspect-context.jsx`), which the full-time Info / Variations / Mutaplasmid windows show; double click or the menu opens a floating INSPECTOR (`Inspector.jsx`) pinned to one target. Inspectors are layout entries flagged `float` with an `insp:` id: their own layer above the workspace, not scrolling with it, snapping only to each other, kept across restarts and presets, left out of saved layouts, capped at 24, pop-out capable. Edits go through `lib/fit-ops.js` — FitTab's editing rules moved there and the phone calls them too — so they work with the Fitting window closed. |
| Variations | `Variations.jsx`, after mutamarket.com: a column per attribute (Columns menu, remembered per item group), sortable headers (first click puts the best values first), min/max filters per column plus "no worse than the reference", bars for where each value sits in the range on screen, search, owned rolls / MutaMarket chips, and any row as the comparison reference. Rows and filter rules are the phone's (`variation-items.js`, `compare.js`). |
| Workspace | Saved layouts: double-click to rename, right-click for Rename / Update / Delete; built-ins can be hidden. Your own background picture (`Backdrop.jsx`, IndexedDB; set in Settings › Interface) under a theme-coloured scrim and blur. Scrollbars are `deskCss()` in `kit.jsx`. Stat grids reflow with window width (`KV` without `cols`). |
| Shortcuts | Ctrl+V pastes an EFT fit from anywhere; Ctrl+C opens the copy dialog (`ExportDialog.jsx`); Ctrl+D optimises price. The state dot: click on/off, right-click overheats, ctrl-click offlines. |

Readability: native windows use `kit.jsx` sizes (12 px labels in textMid, 12–13 px values) and
never textMute for anything that has to be read.

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
- **Tauri:** the shell builds and runs (`src-tauri/`). MutaMarket sends no CORS headers, so its
  requests go through `tauri-plugin-http` (scoped to `https://mutamarket.com/api/*` in
  `capabilities/default.json`), injected at boot by `setMutaMarketFetch` in `desktop/main.jsx`.
  The dev servers use Vite's `/mutamarket-api` proxy instead.

Not done yet:
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

Test fixture note: hand-built fits without an `id` make `FittingsScreen` warn about a missing React
key (`key={fit.id}`). Real fits always get one when created or imported, so seed test data with ids.

## Next: the Graphs window, modelled on pyfa's (Owen, 2026-11-04)

Owen wants pyfa's graph functionality, which mobile never had room for. Researched in
`Pyfa-master/graphs/`:
- **Graph types:** Damage Stats, Application Profile, Mobility, Capacitor, Warp, Lock time, Shield
  regen, Remote reps, EWAR (`graphs/data/*`).
- **Many lines at once:** a list of SOURCE fits, each with a colour, and a list of TARGETS (fits or
  target profiles), each with a line style. Every source × target pair is a line
  (`graphs/gui/lists.py`).
- **Controls** (`graphs/gui/ctrlPanel.py`):
  - X and Y axis choices, input ranges, and attacker/target speed-and-angle vectors;
  - "ignore resists", show legend, and "always show Y = 0".
- **Application Profile** (`graphs/data/fitApplicationProfile/`): for the dominant weapon group,
  each valid charge's DPS against distance. The plot is the upper envelope, stitched into segments
  coloured by the winning ammo (AMMO_COLORS by base name), with an ammo-meta filter of T1 / Navy /
  All.

Plan for Axis (not started beyond the exports):
- `src/desktop/Graphs.jsx` calls the mobile graph's own `generateCurve(cat, y, x, params)` once per
  source × target pair, so every line matches what mobile draws.
- Helpers it needs are now exported from `GraphTab.jsx`: TARGET_PROFILES, TARGET_FIT, profileTarget,
  interpCurveAt, defaultEngRangeKm, usesEngRange, usesTimeWindow, DEFAULT_WINDOW_S.
- For each source fit, compute `cs` with calcFitStats plus that fit's own buildExternalBursts and
  buildProjectedEffects, and `ownProj` with computeProjectedReps.
- Targets:
  - a profile gives `profileTarget(key, mwd)`;
  - a fit goes through `targetFitProfile` (lib/graph-target.js), which gives sig, vel, scrammed and
    incoming.
- The window: a control panel (type, axes, sources, targets, vectors, range or time window,
  legend) and an SVG plot with a hover crosshair that reads off every series.
- The Application Profile, per source and target:
  - pick the first `weaponRacks` rack, then `getCompatibleCharges`, keeping damaging charges that
    pass the meta filter;
  - load each charge into the rack's mounts and compute its cs and its damage-vs-distance curve;
  - sample a common grid, then build the envelope and its segments wherever the winner changes;
  - compute in chunks off the render, because one sweep is a whole-fit calculation per charge.

Also still phone components and due for a desktop redesign: Fit price, Drones, Implants.
