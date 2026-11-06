# Axis desktop: Open Workspace handoff

Status: design approved in principle by Owen, not yet built. Reference mockup: board **E · Open Workspace** (1440 wide reference, exported alongside this doc). Boards A–D were earlier directions; Owen chose E. Do not build A–D.

Owen's design rule, which overrides taste: **form follows function.** Functionality first; the look should fall out of good functional design. No decoration. When a detail below conflicts with how Axis already works, ask Owen before guessing.

---

## 0. How to use this doc

1. Read `CLAUDE.md`, `docs/ui-conventions.md`, then this file. Name the existing Axis screen/component each new piece follows (CLAUDE.md requires this).
2. **Do not write code first.** Reply with: a plan, your recommendation on each item in section 10 (Open decisions), and the milestone you propose to start with.
3. Work on a branch (`desktop-workspace`), never main. Keep diffs to `App.jsx`, `calc.js`, `ui.jsx` targeted.
4. This is a **presentation-layer** project. Do not touch `calc.js` / `dogma-engine.js` numbers. `npm run verify` must stay green at every milestone.

Hard constraints that already exist in the repo and apply here:
- Offline-first. No CDN. The mockup loads Google Fonts; production must use the bundled Saira (`src/assets/fonts/saira-latin.woff2`).
- Colors come from `src/theme.js` via `C` (and `dmgColor`, `STATE_COLORS`), so all five themes (dark, light, amarr, sansha, intaki) keep working. The hex values below are the **dark** palette for reference. Never hard-code them.
- User-visible strings go through `src/i18n` (there is an i18n check in `npm run verify`).
- Mobile app must not regress. The desktop workspace is an additional layout, not a replacement.

---

## 1. Screen anatomy (top to bottom)

| Region | Height | Contents |
| --- | --- | --- |
| Header | 48px | `AXIS` wordmark (14px, 700, letter-spacing .18em) + two dots (cyan, red = the icon's turquoise/red split). Right side: "Skills: All V", "Damage profile: Uniform", "Import pyfa" (secondary buttons, 30px high, radius 6); "Export Snapshot" (primary, accent fill, dark text). Mockup also shows "Sample data, numbers and prices illustrative": **remove in production.** |
| Fit tabs | 36px | pyfa-style tabs, like Axis mobile: `Ship  fit name`, an orange dirty dot (`●`) when unsaved, × per tab, `+` to add. Active tab has surface background and border, no bottom border. |
| Window chips row | 36px | Label `WINDOWS`, then one chip per window (14 chips, order in section 3). Chip is "on" (accent-tinted) when its window is open. Click toggles open/closed. Right end: "Save layout as…" button (named layouts, not built in the mockup). |
| Workspace | flexible, default 1000px | Absolutely-positioned windows over a faint 16px dot grid (the grid is visible only while "Snap to grid" is on). Scrolls (`overflow:auto`) when windows extend past it. |
| Height grab bar | 10px | Centered 48×3px pill. Drag up/down to resize the whole workspace (min 400px, default 1000px). Total app height = workspace + 160px. |
| Status bar | 30px | Left: `DETACHED` tray (empty text: "None. Pop a window out to send it to another monitor."; otherwise one chip per detached window, click to dock). Right: `LAYOUT` + preset chips (Default, Mirrored, Focus), then toggles: Lock layout, Snap to windows, Snap to grid. |

The workspace coordinate system is plain pixels from the workspace's top-left. 1440px wide is only the reference size the presets were drawn at (section 4).

---

## 2. Window manager behavior (the core feature)

Every panel is a window with identical chrome.

### Chrome
- Title bar 28px: six-dot grip icon, title (11px, 600, uppercase, letter-spacing .06em, muted text), spacer, optional per-window extra control (only Projected has one: "+ Add"), pop-out button (22px), close button `×` (22px).
- 1px border, radius 6, shadow `0 4px 16px rgba(0,0,0,.45)`, background = surface. Title bar background = surfaceAlt. Focused (topmost) window border = accent; others = borderStrong.
- Body scrolls (`overflow:auto`) inside the window.

### Move
- Drag by the title bar. Buttons in the title bar must not start a drag.
- Cursor is `grab` while unlocked, `default` when Lock layout is on. **Lock layout disables moving and resizing**, but still allows bring-to-front, column resizing, and the chips/close.
- Position clamps to `x >= 0, y >= 0` only. There is no upper clamp (an earlier hard clamp to 1440×750 made it impossible to drag into space opened by widening the screen; do not reintroduce it). Provide a rescue (see section 10) so a window can't be lost off-screen.

### Resize
- Edges: left, right, bottom (6px hit area), top (4px hit area, above the title bar), plus a 14px south-east corner grip with a small diagonal glyph. Cursors: `ew-resize`, `ns-resize`, `nwse-resize`.
- Minimum size 160×80. Resizing from left/top moves the window origin so the opposite edge stays fixed.
- Owen's motivating case: "drag down the bottom of the fitting window so I don't have to scroll."

### Focus / z-order
- Any mousedown inside a window brings it to the front (z = max + 1). Opening a window from its chip also brings it to the front.

### Snapping (two independent toggles, both on by default)
- **Snap to grid:** positions and sizes round to multiples of 8px.
- **Snap to windows:** threshold **12px**, applied after grid snap. For the moving or resizing edge, candidate targets from every other open, non-detached window are:
  - same-edge alignment: other.left / other.right / other.top / other.bottom;
  - adjacency with an **8px gap**: other.right + 8 for a left edge, other.left − 8 for a right edge, same vertically.
  - Move: test the window's left edge and right edge against the x targets, top and bottom against the y targets; take the nearest within threshold. Resize: only the edge(s) being dragged snap.
- Optional polish Owen has not asked for: draw a 1px accent guide line while snapped.

### Chips, close, pop-out
- Closing a window (×) just hides it; geometry is remembered so reopening restores it. Reopening brings it to front.
- **Pop-out** removes the window from the workspace and puts it in the Detached tray. In the mockup this is only a stand-in (it didn't open a real window). Real behavior is an open decision (section 10). Clicking the tray chip docks it back at its previous geometry.

### Layout presets
Three presets, applied via the status bar chips. Applying one replaces all window geometry and open/closed state (and re-stacks z in list order). Numbers are `x, y, w, h` in px.

**Default**
| Window | x | y | w | h | Open |
| --- | --- | --- | --- | --- | --- |
| Browser | 8 | 8 | 280 | 970 | yes |
| Fitting | 296 | 8 | 724 | 648 | yes |
| Projected | 296 | 664 | 444 | 314 | yes |
| Cargo | 748 | 664 | 272 | 314 | yes |
| Resources | 1028 | 8 | 404 | 164 | yes |
| Defense | 1028 | 180 | 404 | 270 | yes |
| Firepower | 1028 | 458 | 404 | 104 | yes |
| Capacitor | 1028 | 570 | 404 | 80 | yes |
| Targeting | 1028 | 658 | 404 | 88 | yes |
| Mobility | 1028 | 754 | 404 | 88 | yes |
| Fit price | 1028 | 850 | 404 | 128 | yes |
| Drones | 300 | 120 | 300 | 160 | no |
| Implants | 340 | 160 | 360 | 340 | no |
| Notes | 380 | 200 | 320 | 200 | no |

**Mirrored:** same windows, the stat column (x 1028, w 404) moves to x 8, Browser moves to x 1152 (w 280), Fitting x 420 (w 724), Projected x 420 (w 444), Cargo x 872 (w 272).

**Focus:** Browser closed. Fitting x 8, w 780. Projected x 8, w 780. Stat column at x 796, **w 636**. Cargo closed.

The three stat-column heights above (164/270/104/80/88/88/128) are sized to their content with a little slack. Windows with `kv` grids are 24px per row.

### Persistence (not in the mockup, required in the build)
- Persist current layout (all geometry, open state, z-order, column widths, workspace height, both snap toggles, lock) across launches. Follow the existing convention: settings in localStorage under `axis_*` keys, with a storage migration if shape changes (`lib/storage-migrate.js`).
- "Save layout as…" stores named layouts next to the three built-ins. Built-ins are not editable.

---

## 3. Windows: contents and exact formatting

Shared: body font Saira 13px; numbers are Saira with `font-variant-numeric: tabular-nums` (Axis uses Saira everywhere; do not add a mono font). Section labels are 10px uppercase, letter-spacing .06em, textMid. Row separators are 1px `border` at ~60% alpha. `kv` grids = two columns, 16px column gap, 24px rows, label textMid left, value right (12px).

Window chip / title order: Browser, Fitting, Projected, Cargo, Resources, Defense, Firepower, Capacitor, Targeting, Mobility, Fit price, Drones, Implants (title: "Implants and boosters"), Notes.

### Browser
One browser that toggles between **Market** and **Ships** (pyfa style). Owen explicitly wants a single browser, not two.
- Top: segmented control (Market | Ships, accent tint on active), then a search field (placeholder "Search modules" / "Search ships and fits").
- **Market mode:** slot chips (High, Mid, Low, Rig, "Hide unfittable"), the category tree (caret + 14px folder/module icon + name; selected leaf has surfaceAlt background and a 2px accent left bar; indent 14px/level), then a column legend `MODULE · META · CPU · PG · ISK` (CPU cyan, PG red), then item rows. **Item rows are two lines** (this fixed text overlap at 280px): line 1 = 16px icon + name with ellipsis; line 2 = `Meta N`, CPU (cyan), PG (red), and price right-aligned, 11px, muted.
- **Ships mode:** header `Ship or saved fit` / `DPS · EHP`; tree of groups (bold) → hulls → saved fits; fits show `DPS · EHP` on the right (e.g. `584 · 37.3k`). Icons: folder for groups, hull glyph for ships, lines glyph for fits.
- Replace the placeholder icons with Axis's real item/ship art (art is bundled; see `docs/data-pipeline.md`).

### Fitting (the main table)
Title: `Fitting · <hull>`. Grid columns (gap 8px, side padding 12px):
`12px state dot | 16px icon | 1fr module · charge | CPU·PG | Cap/s | Range | Effect | ISK`
Default widths of the five resizable columns: **88, 46, 92, 108, 46 px**.
- Header row 24px, uppercase 10px. `CPU` is cyan and `PG` is red in the header.
- **Rack header rows** (22px, surfaceAlt): `HIGH 7 / 7`, `MID 5 / 5`, `LOW 5 / 5`, `RIG 2 / 2`. **All four names use one color (textMid); do not color-code by slot.** Right side of the header row: CPU·PG sum (rigs show `Cal 300 / 400`), net cap/s sum (a leading `+` means net gain), and on HIGH the fit DPS (`584 DPS`). The ISK sum is blank until prices exist.
- **Module rows** 24px: state dot (active green `#1ded96`; online-only grey; offline/overheat per `STATE_COLORS`), module icon, module name then ` · charge` in muted text, an `OH` tag in the overheat color right after the name when overheated. CPU cyan and PG red (`·` separator), cap use (`—` when zero, `+2.28` for a gain), range (`16.5 + 39.4 km` = optimal + falloff), effect text, ISK. The first row is shown "selected" (surfaceAlt) in the mockup.
- The **default turret effect is tracking** (Owen asked for this). The mockup shows `9.15 s` because the tracking value was not in the pyfa screenshot: see section 9.
- Effect examples: `+22.9% dmg` (gyro), `−60% speed` (web), `+33.8%` (burst), `60k / 38.2 s` (ancillary shield booster).
- Column resizing: see section 5.
- Per-module effectiveness (e.g. "60%" for a T2 web) was an earlier Owen requirement; it lives in the Effect column.

### Projected
Table `☐ | Source | Effect | Value | Range` (default widths 18px, 1fr, 108, 74, 48; Effect/Value/Range resizable). Each row has a checkbox; unchecked rows render at 55% opacity and must be excluded from calculation. "+ Add" button in the title bar. Owen asked for this tab and wants it draggable out to its own window like the other bottom tabs. **The rows in the mockup are invented sample data** (remote shield rep, web, neut, target painter).

### Cargo
`Item | Qty` (Qty column 70px, resizable). 25px rows.

### Drones
`Drone | Range | ISK`. Sample: `5x Hornet EC-300 · 7.5 km · 29k`. (Closed by default.)

### Implants and boosters
Numbered implant list (1–10, name with ellipsis), then a `BOOSTERS` section. (Closed by default.) Slot numbers in the sample are sequential only; real slot mapping must come from the data.

### Notes
Plain textarea, free text per fit. (Closed by default.)

### Resources
Two-column grid of six bars, 10px row gap, 24px column gap: **CPU** (cyan label), **PG** (red label), Calibration, Drone bay, Bandwidth, Turrets (textMid labels). Each: label left, `used / total unit` right (e.g. `659.0 / 659.1 tf`, `1,993 / 2,009 MW`, `25 / 25 m³`, `0 / 25 Mbit/s`, `5 / 5`), 4px bar beneath filled to the percentage. Below the grid: `Launchers 0 / 2` and `Drones 0 / 5` in 11px muted text. **No price in this window** (moved to Fit price).

### Defense
Order top to bottom:
1. `Total EHP` and `Damage profile` as a `kv` pair at the top.
2. Resist table: columns `Layer | EM | Th | Kin | Exp | Avg | EHP`. Grid `48px, 4×1fr, 52px, 46px`, 6px gap. Header colors use `dmgColor` (EM blue, Th red, Kin grey, Exp orange). Each resist cell is the value (12px) above a 3px bar filled to that percentage in the damage color. Rows: Shield, Armor, Hull (36px each).
3. **Avg column (new):** mean of the four resists, one decimal (e.g. `73.3`), and underneath, in 10px muted text, the **multiplier = 1 − avg/100 to 3 decimals** (`×0.267`). Owen asked for "average resist multipliers for shield, armor, and hull." If this should instead average the *resonances* (equivalent here) or be weighted by the damage profile, ask him.
4. `RECHARGE RATES` label and a 2-column `kv` of: Shield active, Shield passive, Armor, Hull (`EHP/s`). **The mapping from pyfa's panel is a guess**: see section 9.
- No second damage-profile display anywhere in this window (Owen removed the duplicate).

### Firepower
`kv`: DPS, Volley, Optimal, Falloff, Drone DPS, Drone range. No damage-type split bar (pyfa doesn't show one here).

### Capacitor
`kv` with value text 600 weight: **State, Lifetime, Delta, Capacity.**
- **Color rule (Owen's request):** State, Lifetime and Delta are **danger red when the cap is unstable, success green when stable**; Capacity stays plain text.
- Unstable: State `Unstable`, Lifetime `12m 40s`, Delta `−1.19 GJ/s`. Stable: State `Stable`, Lifetime `Stable 74.1%`.

### Targeting
`kv`: Lock range, Scan resolution, Max locked targets, Sensor strength.

### Mobility
`kv`: Max velocity, Align time, Warp speed, Signature radius, Cargo.

### Fit price (new window)
- Top row: `TOTAL, EXCL. CHARACTER` label left, total right at 16px 600 (`628M ISK`).
- 2-column `kv` breakdown: Ship, Fittings, Drones, Cargo bay, Character.
- Divider, then **market source row**: label `Source`, chips `Fuzzwork` (selected, accent) and `ceve-market`, a hub chip `Jita ▾`, and muted text `sell price, refreshed hourly`.
- The source/hub options and the "refreshed hourly" behavior come from `src/prices.js` (`MARKET_SOURCES`, `MARKET_HUBS`, hour TTL). Wire to those; do not invent a new price layer. Note the CORS caveat in `prices.js` (ceve only works through native networking in the shipped app, not `npm run dev`).
- pyfa's "Total" excludes Character (628M = 279M + 208M + 29k + 141M; Character is 2.13B). Owen's pyfa shows it that way; keep that behavior and label.

---

## 4. Tokens (dark theme values; use `C`, not hex)

| Role | Mockup hex | `theme.js` key |
| --- | --- | --- |
| App background | `#0f0f10` | `bg` |
| Window / header / status surface | `#1a1a1d` | `surface` |
| Title bars, rack headers, selected row, button fill | `#222226` | `surfaceAlt` |
| Hairlines, bar tracks | `#2e2e33` | `border` |
| Control borders, window border (unfocused) | `#3a3a40` | `borderStrong` |
| Primary text | `#f2f2f3` | `text` |
| Secondary text | `#9898a6` | `textMid` |
| Muted text | `#78788a` | `textMute` |
| Accent / selection / focused window / chip "on" | `#4f8ef7` (tint `rgba(79,142,247,.1)`) | `accent`, `accentLight`, `accentBorder` |
| Danger / unstable cap / PG | `#ef4444` | `danger` |
| Success / stable cap | `#22c55e` | `success` |
| Overheat / dirty-tab dot | `#f97316` | `overheat` |
| Module active dot | `#1ded96` | `active` |
| CPU | `#22d3ee` | **no key.** Same hue as `C.low`. See section 10. |
| PG | `#ef4444` | **no key.** Same as `C.danger`. See section 10. |

Damage colors from `dmgColor`: EM `#60a5fa`, Thermal `#ef4444`, Kinetic `#cbd5e1`, Explosive `#f97316`.
Chips: 22px high, 11px text, radius 11px; on = accentLight fill + accent border + accent text; off = transparent + borderStrong + textMid. Buttons: 30px high, radius 6. Inputs: 28px high, radius 6.
Type: Saira, body 13px; table 12px; section labels 10px; window titles 11px.

---

## 5. Column resizing

- Applies to the Fitting table (CPU·PG, Cap/s, Range, Effect, ISK), the Projected table (Effect, Value, Range) and Cargo (Qty). The flexible name/source/item column absorbs the difference.
- Handle: an 8px-wide invisible strip on the **left edge** of each resizable header cell (`col-resize` cursor). Dragging **left widens** the column (its right edge stays put); dragging right narrows it. Minimum 32px.
- Widths are per window type, persisted with the layout, and apply to every row's grid template (header and rows must use the same template).
- Cells must truncate with ellipsis, never wrap or overlap, at any width.

---

## 6. Sample fit used in the mockup (use as a parity fixture)

This is Owen's real fit and the numbers come from his **pyfa screenshot** (so they are the pyfa ground truth for parity checks, subject to the skill/profile settings he had in pyfa: confirm "Character: All 5" means all V).

```
[Sleipnir, arty standard v2]

Gyrostabilizer II
Gyrostabilizer II
Tracking Enhancer II
'Dyad' Co-Processor I
Dark Blood Power Diagnostic System

50MN Cold-Gas Enduring Microwarpdrive
Multispectrum Shield Hardener II
Federation Navy Stasis Webifier
Dread Guristas Warp Disruptor
X-Large Ancillary Shield Booster, Navy Cap Booster 400

720mm Howitzer Artillery II, Domination EMP M
720mm Howitzer Artillery II, Domination EMP M
Skirmish Command Burst II, Rapid Deployment Charge
720mm Howitzer Artillery II, Domination EMP M
Skirmish Command Burst II, Interdiction Maneuvers Charge
720mm Howitzer Artillery II, Domination EMP M
720mm Howitzer Artillery II, Domination EMP M

Medium Ancillary Current Router II
Medium Polycarbon Engine Housing II

Hornet EC-300 x5

High-grade Snake Alpha
High-grade Snake Beta
High-grade Snake Gamma
High-grade Snake Delta
High-grade Snake Epsilon
Mid-grade Snake Omega
Eifyr and Co. 'Rogue' Evasive Maneuvering EM-705
Zor's Custom Navigation Hyper-Link
Eifyr and Co. 'Gunslinger' Surgical Strike SS-905
Skirmish Command Mindlink

Standard Blue Pill Booster
Agency 'Overclocker' SB7 Dose III

Quake M x300
Tremor M x300
Navy Cap Booster 400 x56
Nanite Repair Paste x400
Domination Depleted Uranium M x300
Domination EMP M x500
Domination Fusion M x300
Domination Phased Plasma M x300
Optimal Range Script x1
Tracking Speed Script x1
Agency 'Overclocker' SB5 Dose II x2
Agency 'Pyrolancea' DB5 Dose II x2
Standard Blue Pill Booster x2
Standard Drop Booster x2
```

Per-module values read from the screenshot (PG / CPU / cap per second / range / effect):

| Module | PG | CPU | Cap/s | Range | Effect |
| --- | --- | --- | --- | --- | --- |
| 720mm Howitzer Artillery II ×5 | 223 | 24 | – | 16.5 + 39.4 km | col value 9.15 (see section 9) |
| Skirmish Command Burst II ×2 | 110 | 55 | 0.417 | 49.4 km | +33.8% |
| 50MN Cold-Gas Enduring MWD | 150 | 50 | 9.75 | – | – |
| Multispectrum Shield Hardener II (overheated) | 1 | 44 | 3.2 | – | – |
| Federation Navy Stasis Webifier | 1 | 25 | 0.75 | 18.7 km | −60% |
| Dread Guristas Warp Disruptor | 1 | 23 | 3 | 34.8 km | −1 |
| X-Large Ancillary Shield Booster (overheated) | 500 | 200 | – | – | 60k / 38.2 s (+60s) |
| Gyrostabilizer II ×2 | 1 | 30 | – | – | +22.9% |
| Tracking Enhancer II | 1 | 15 | – | – | – |
| 'Dyad' Co-Processor I | 1 | – | – | – | – |
| Dark Blood Power Diagnostic System | – | 12 | +2.28 (gain) | – | – |
| Rigs ×2 | – | – | – | – | Calibration 300 / 400 total |

Fit-level numbers (pyfa):
- CPU 659.0 / 659.1 tf (99.99%); PG 1,993 / 2,009 MW (99.21%); Calibration 300 / 400; Drone bay 25 / 25 m³; Bandwidth 0 / 25 Mbit/s; Turrets 5 / 5; Launchers 0 / 2; Drones 0 / 5.
- Resists % (EM/Th/Kin/Exp) and EHP: Shield 84.8 / 75.6 / 63.4 / 69.5, 22.1k; Armor 90.0 / 67.5 / 25.0 / 10.0, 8.24k; Hull 33.0 ×4, 6.9k; Total EHP 37.3k. Derived averages: 73.3 / 48.1 / 33.0, multipliers ×0.267 / ×0.519 / ×0.670.
- Firepower: weapon DPS 584, drone DPS 0, volley 6,155. Optimal 16.5 km, falloff 39.4 km.
- Capacitor: 2.61k GJ total, lasts 12m 40s, −1.19 GJ/s (unstable).
- Targeting: 7 targets, 87.5 km range, 330 mm scan res, 24 sensor strength, 60 km drone range. Mobility: 2,397 m/s, align 9.91 s, signature 1.44k, warp 3.5 AU/s, cargo 715 m³.
- Price: Ship 279M, Fittings 208M, Drones 29k, Cargo bay 141M, Character 2.13B, Total 628M.
- Slot states in the screenshot: all active (✓) except low slots and rigs, which are online-only (○). The Multispectrum Shield Hardener and the Ancillary Shield Booster carry the red overheat icon.

Sanity checks from the data: summed CPU = 659 (24×5 + 55×2 + 50+44+25+23+200 + 30+30+15+12), summed PG ≈ 1,992–1,993.

---

## 7. Interaction implementation notes (for the real build)

The mockup used plain mouse events on a container and a hard-coded coordinate frame. Production should differ:
- Use **pointer events with `setPointerCapture`** on the title bar/handle, so a drag continues when the cursor leaves the workspace. The mockup had to end drags on `buttons === 0` as a workaround.
- Window geometry is state (array of `{id, x, y, w, h, open, detached, z}`) updated during drag. Consider a ref plus `requestAnimationFrame` instead of `setState` per mousemove if it's slow with the fitting table mounted.
- Window snapping reads other windows' rects each move event; it's O(n) with n ≤ 14, no concern.
- Keep a **keyboard path**: windows must be reachable and movable without a mouse (e.g. focus the title bar and use arrow keys; Shift+arrows to resize; Escape cancels). The mockup has none.
- Add real ARIA: toggle chips are `aria-pressed`, windows are `role="group"` with a label, resize handles are decorative to AT but keyboard-equivalent exists.
- Recompute/clamp on viewport resize so no window is entirely unreachable (see rescue, section 10).
- Don't let the workspace unmount the heavy windows on close if re-mount is expensive; but closed windows must not recompute.

---

## 8. Suggested milestones (each ends with `npm run verify` green)

1. **Shell and window manager** with empty placeholder windows: chrome, move, resize (all edges), z-order, chips row, grab bar, presets, lock, both snap toggles, persistence. Acceptance: all of section 2 works with dummy content; layout survives reload.
2. **Fitting window** wired to the real fit state and existing module components (state dots, icons, charge, heat tag), rack headers with sums, column resizing.
3. **Stat windows** (Resources, Defense incl. Avg and recharge, Firepower, Capacitor with colors, Targeting, Mobility) fed from `calcFitStats`. No new calculations except display derivations (avg resist/multiplier, resonance, cap color rule).
4. **Browser window** (Market/Ships toggle) reusing the existing mobile browser logic and `ship-taxonomy.js`; real art.
5. **Fit tabs and header actions**, multi-fit state, Import pyfa, Export Snapshot.
6. **Fit price window** wired to `prices.js` (source, hub, cache TTL).
7. **Projected window.** Needs engine support: check what `calc.js` already supports for projected effects before designing the data model; this one may need Owen's input.
8. **Cargo, Drones, Implants and boosters, Notes**, then detached windows (depends on the shell decision), keyboard path, named layouts.

Parity check throughout: load the Sleipnir fit from section 6 and compare to the pyfa numbers there.

---

## 9. Placeholders in the mockup (confirm before treating as truth)

- **Turret tracking value.** Owen wants tracking as the default turret effect. The mockup shows `9.15 s` in that column (it was the unlabeled value next to the artillery in his pyfa screenshot, interpreted as cycle time). Get the real tracking figure and which pyfa column that was.
- **Per-module prices.** The pyfa price column was clipped in the screenshot, so module rows show `—`. Only the totals are real.
- **Recharge rates mapping.** pyfa shows two rows × four columns (`57.6 EHP/s`, `1568.2 EHP/s`, `0.0`, `0.0`, and a row with `1568.2`, `0.0`, `0.0`). The mockup labels them Shield active 1,568.2, Shield passive 57.6, Armor 0.0, Hull 0.0. That mapping is a guess; ask Owen what the two rows mean.
- **Projected rows** are fabricated sample effects.
- **Heat/state icons** were inferred from the screenshot's red flame icons (hardener and ancillary booster) and green/yellow state marks.
- **Implant slot numbers** are sequential placeholders.
- **Icons** in the mockup are simple stroke glyphs, not game art.
- Fit tabs other than the Sleipnir were removed; earlier concepts showed Hurricane/Drake tabs that were also invented.

---

## 10. Open decisions (recommend an answer for each in your plan)

1. **Desktop shell.** Options: browser/PWA at a desktop breakpoint of the existing app; Tauri; Electron. Affects offline, file access (pyfa import), and the multi-window question. Owen has not decided.
2. **Detached windows.** What does "pop out" mean for real: a second OS window sharing state (needs a shell that supports it, or `window.open` plus `BroadcastChannel`/shared worker), or only a floating layer? This is why the mockup's button is a stand-in.
3. **Responsive vs separate layout.** One React app with the workspace shown at a width breakpoint and the mobile UI below it, versus a separate entry point. Mobile must not regress either way.
4. **CPU and PG colors.** `theme.js` has no CPU/PG tokens. Either add `C.cpu`/`C.pg` per theme (preferred, since cyan collides with `low` and red with `danger` in some themes) or reuse existing keys. Owen to approve any theme change; check all five palettes for contrast.
5. **Rescue for off-screen windows.** The mockup has no upper bound on x/y. Suggested: on load/resize/preset, ensure at least a 48px strip of every open window's title bar is inside the visible workspace; "Default" preset also acts as the reset.
6. **Layout scope.** One global layout vs layout per fit tab. Mockup is global.
7. **Workspace height.** The mockup's draggable grab bar and 1000px default exist only because the mockup is embedded in a canvas. A real desktop app should fill the window instead. Keep the grab bar only if it still makes sense (e.g. tall monitors in a browser).
8. **Real "average resist."** Confirm the Avg definition (simple mean, which equals 1 − mean resonance) is what Owen wants, versus a damage-profile-weighted value.

---

## 11. Files to carry into the code session

- This file, committed to `docs/desktop-handoff.md`.
- The exported **E · Open Workspace** artboard (HTML + a PNG screenshot) in `docs/desktop/` as visual reference. If an exported file and this document disagree, this document describes intent, the export shows exact pixels.
- Owen's pyfa screenshot of the Sleipnir fit (the numbers in section 6 come from it).
- Suggested pointer for `CLAUDE.md` (only add if Owen agrees): "Desktop workspace UI: see `docs/desktop-handoff.md` before touching it."
