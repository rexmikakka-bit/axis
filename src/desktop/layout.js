// The desktop workspace's window geometry: presets, snapping, the off-screen rescue and the saved
// layout. Pure functions over plain objects, no React, so the regression suite can pin them — the
// window manager is the part of the desktop app where a wrong number loses you a window.
//
// Coordinates are plain pixels from the workspace's top-left. A window is
// {x, y, w, h, open, detached, z}; a layout is {[windowId]: window}.

import { cleanTarget, targetKey } from './inspect.js';

export const GRID = 8;            // Snap to grid: positions and sizes round to this
export const SNAP_DIST = 12;      // Snap to windows: how close an edge has to be to catch
export const SNAP_GAP = 8;        // ...and the gutter left between two windows snapped side by side
export const MIN_W = 160;
export const MIN_H = 80;
export const TITLE_H = 28;
// How much of a window's title bar must stay inside the visible workspace after a load, a viewport
// resize or a preset. Enough to grab it; dragging is never clamped on the far sides, so a window can
// still be parked partly out of view on purpose.
export const RESCUE_STRIP = 48;

// Chip and title order. `title` is the English key t() looks up.
// Every phone screen has a home here. The phone's Effects tab is four windows (Projected, Command
// links, Boosters, Environment), Graphs its Graph page, Validation the top card of its Stats page.
export const WINDOWS = [
  { id: 'browser', title: 'Browser' },
  { id: 'fitting', title: 'Fitting' },
  { id: 'projected', title: 'Projected' },
  { id: 'command', title: 'Command links' },
  { id: 'boosters', title: 'Boosters' },
  { id: 'environment', title: 'Environment' },
  { id: 'cargo', title: 'Cargo' },
  { id: 'resources', title: 'Resources' },
  { id: 'defense', title: 'Defense' },
  { id: 'firepower', title: 'Firepower' },
  { id: 'capacitor', title: 'Capacitor' },
  { id: 'targeting', title: 'Targeting and mobility' },
  { id: 'price', title: 'Fit price' },
  { id: 'validation', title: 'Validation' },
  { id: 'graphs', title: 'Graphs' },
  { id: 'drones', title: 'Drones' },
  { id: 'implants', title: 'Implants' },
  { id: 'notes', title: 'Notes' },
  // The hull being fitted (the phone's Ship info sheet). An ordinary window, so it stacks with the
  // others and follows the open fit; a hull opened from the market is a floating inspector instead.
  { id: 'shipinfo', title: 'Ship info' },
  // Full-time item windows: they follow whatever is selected in any list (desktop/inspect.js).
  { id: 'info', title: 'Info' },
  { id: 'variations', title: 'Variations' },
  { id: 'mutate', title: 'Mutaplasmid' },
  { id: 'settings', title: 'Settings' },
];
export const WINDOW_IDS = WINDOWS.map(w => w.id);

// [x, y, w, h, open]. Drawn at a 1440 px reference width and ~990 px of workspace height.
//
// Two 320 px stat columns rather than the mockup's single 404 px one: the windows hold the phone's
// own stat cards, and at their real heights (measured on a battlecruiser: defense ~480 px of content,
// fit value ~300) one column would need about 1,600 px. Heights are content + the 28 px title bar,
// rounded to the grid.
// One 448 px stat column: wide enough for the label/value grids to run two columns, which is what
// keeps each stat window short. The Fitting table is the mockup's ~720 px. Validation and Fit price
// start closed: their headline (valid / N issues, the fit's total) rides on the Fitting window's
// title bar instead, and either opens from the Windows menu.
const STATS = { resources: [8, 184], defense: [200, 368], capacitor: [576, 152], targeting: [736, 248] };
const column = (col, x, w) => Object.fromEntries(Object.entries(col).map(([id, [y, h]]) => [id, [x, y, w, h, true]]));
const CLOSED_BY_DEFAULT = { drones: [296, 120, 500, 420, false], implants: [340, 160, 400, 480, false], notes: [380, 200, 320, 200, false],
                            command: [300, 640, 356, 300, false], boosters: [340, 600, 380, 360, false], environment: [380, 660, 340, 140, false],
                            graphs: [200, 40, 1000, 640, false], validation: [620, 120, 356, 160, false], price: [620, 160, 356, 380, false],
                            info: [984, 200, 448, 600, false], variations: [160, 96, 1000, 600, false], mutate: [536, 120, 440, 560, false],
                            settings: [340, 64, 760, 760, false], shipinfo: [520, 72, 480, 700, false] };

const PRESET_GEOMETRY = {
  default: {
    browser: [8, 8, 240, 560, true], cargo: [8, 576, 240, 408, true],
    fitting: [256, 8, 720, 600, true], projected: [256, 616, 356, 368, true], firepower: [620, 616, 356, 368, true],
    ...column(STATS, 984, 448), ...CLOSED_BY_DEFAULT,
  },
  mirrored: {
    ...column(STATS, 8, 448),
    fitting: [464, 8, 720, 600, true], projected: [464, 616, 356, 368, true], firepower: [828, 616, 356, 368, true],
    browser: [1192, 8, 240, 560, true], cargo: [1192, 576, 240, 408, true], ...CLOSED_BY_DEFAULT,
  },
  // No browser: the fit gets the room.
  focus: {
    browser: [8, 8, 240, 560, false], cargo: [8, 576, 240, 408, false],
    fitting: [8, 8, 960, 600, true], projected: [8, 616, 476, 368, true], firepower: [492, 616, 476, 368, true],
    ...column(STATS, 976, 456), ...CLOSED_BY_DEFAULT,
  },
  // Graph-centric: the Graphs window takes most of the screen, with the fit and its firepower beside
  // it so a change to either redraws the curves in view. Everything else opens from the Windows menu.
  graphs: {
    ...column(STATS, 984, 448), ...CLOSED_BY_DEFAULT,
    resources: [984, 8, 448, 184, false], defense: [984, 200, 448, 368, false], capacitor: [984, 576, 448, 152, false], targeting: [984, 736, 448, 248, false],
    browser: [8, 8, 240, 560, false], cargo: [8, 576, 240, 408, false], projected: [256, 616, 356, 368, false],
    fitting: [8, 8, 640, 584, true], firepower: [8, 600, 640, 384, true], graphs: [656, 8, 776, 976, true],
  },
  // Owen's own arrangement (2026-11-05), drawn on a 1640x1136 workspace: a full-height browser, a tall
  // Fitting table over one tabbed window of the fit's contents, and the stat column with Capacitor
  // and Fit price side by side. The tabs' own rects are where each goes when pulled out of the group.
  standard: {
    ...CLOSED_BY_DEFAULT,
    browser: [8, 8, 336, 1128, true], fitting: [352, 8, 832, 808, true],
    drones: [352, 824, 832, 312, true], cargo: [1616, 8, 400, 192, true], implants: [1240, 912, 352, 208, true],
    boosters: [340, 600, 380, 360, true], projected: [352, 792, 832, 328, true], command: [300, 640, 356, 300, true],
    environment: [892, 792, 340, 140, false],
    resources: [1192, 8, 448, 208, true], defense: [1192, 224, 448, 304, true], firepower: [1192, 536, 448, 200, true],
    capacitor: [1192, 744, 216, 120, true], price: [1416, 744, 224, 120, true], targeting: [1192, 872, 448, 264, true],
  },
};
// A preset's tab groups: host -> [tabs, host first; the tab shown].
const PRESET_GROUPS = {
  standard: { drones: [['drones', 'cargo', 'implants', 'boosters', 'projected', 'command'], 'cargo'] },
};
// The workspace a preset is drawn for, when it is not the 1440 x PRESET_HEIGHT the others share. Such
// a preset is squeezed to a smaller workspace in both directions (fitPreset).
const PRESET_SIZE = { standard: [1640, 1136] };
export const PRESETS = [
  { id: 'default', title: 'Default' },
  { id: 'standard', title: 'Standard' },
  { id: 'mirrored', title: 'Mirrored' },
  { id: 'focus', title: 'Focus' },
  { id: 'graphs', title: 'Graphs' },
];

/** A fresh layout from a built-in preset, re-stacked in list order. */
export function presetLayout(id) {
  const g = PRESET_GEOMETRY[id] ?? PRESET_GEOMETRY.default;
  const out = {};
  WINDOW_IDS.forEach((wid, i) => {
    const [x, y, w, h, open] = g[wid];
    out[wid] = { x, y, w, h, open, detached: false, z: i + 1 };
  });
  for (const [host, [stack, active]] of Object.entries(PRESET_GROUPS[id] ?? {})) {
    out[host] = { ...out[host], stack, active };
    for (const m of stack) if (m !== host) out[m] = { ...out[m], in: host };
  }
  return out;
}

// The height the presets are drawn for: the bottom edge of their tallest column.
export const PRESET_HEIGHT = 984;

/**
 * A preset squeezed (never stretched) to a shorter workspace: every y and height scales by the same
 * factor, rounded to the grid, so columns keep their 8 px gutters and still end at the bottom. A
 * 1440x1000 window leaves ~850 px of workspace, where the unscaled Browser ran past the fold and hid
 * its own search box. Content that no longer fits scrolls inside its window. Floored at two title
 * bars rather than MIN_H: the Resources strip is drawn shorter than MIN_H to begin with, and lifting
 * it to MIN_H here pushed it into the window below.
 */
export function fitToHeight(layout, viewH, refH = PRESET_HEIGHT) {
  if (!(viewH > 0) || viewH >= refH + GRID) return layout;
  const k = (viewH - GRID) / refH;
  const out = {};
  for (const [id, w] of Object.entries(layout)) {
    if (w.float) { out[id] = w; continue; }
    const top = Math.round((w.y - GRID) * k / GRID) * GRID + GRID;
    const bottom = Math.round((w.y + w.h) * k / GRID) * GRID;
    out[id] = { ...w, y: top, h: Math.max(TITLE_H * 2, bottom - top) };
  }
  return out;
}

/** fitToHeight's sideways twin, for a preset drawn wider than 1440: x and width scale, floored at MIN_W. */
export function fitToWidth(layout, viewW, refW) {
  if (!(viewW > 0) || !(refW > 0) || viewW >= refW + GRID) return layout;
  const k = (viewW - GRID) / refW;
  const out = {};
  for (const [id, w] of Object.entries(layout)) {
    if (w.float) { out[id] = w; continue; }
    const left = Math.round((w.x - GRID) * k / GRID) * GRID + GRID;
    const right = Math.round((w.x + w.w) * k / GRID) * GRID;
    out[id] = { ...w, x: left, w: Math.max(MIN_W, right - left) };
  }
  return out;
}

/** Preset `id` fitted to a workspace of `view` ({w, h}): squeezed to it, never stretched. */
export function fitPreset(id, view = {}) {
  const [refW, refH] = PRESET_SIZE[id] ?? [null, PRESET_HEIGHT];
  const tall = fitToHeight(presetLayout(id), view.h, refH);
  return refW ? fitToWidth(tall, view.w, refW) : tall;
}

// ── Floating inspector windows ─────────────────────────────────────────────────────────────────
// Any number of them, created at run time, each pinned to one item (a `target`, desktop/inspect.js)
// and showing one tab of it. They live in the same map as the workspace windows, flagged `float`
// with an `insp:` id, so dragging, resizing, stacking, pop-out and persistence are the same code —
// but they draw on a layer of their own above the workspace and do not scroll with it, which is
// the point: a gun's info stays in view while you work underneath it.
export const FLOAT_PREFIX = 'insp:';
export const MAX_FLOATS = 24;
export const FLOAT_W = 480, FLOAT_H = 560;
export const isFloatId = (id) => typeof id === 'string' && id.startsWith(FLOAT_PREFIX);
const pick = (layout, keep) => Object.fromEntries(Object.entries(layout).filter(([id, w]) => keep(id, w)));
export const floatsOf = (layout) => pick(layout, (id, w) => !!w.float);
export const dockedOf = (layout) => pick(layout, (id, w) => !w.float);

/**
 * `layout` with an inspector on `target` open at `tab` and raised. One window per item: asking again
 * for an item that already has one raises that window and switches its tab, unless `fresh` (Open in
 * a new window), which always adds one. New windows open in the middle of `view` (the visible
 * workspace's size), where the eye already is, and cascade down-right from there, clamped inside it. Past MAX_FLOATS the oldest one goes.
 * Returns {layout, id}.
 */
export function openFloat(layout, { target, tab, key }, { view = { w: 1440, h: 900 }, fresh = false, seq = Date.now() } = {}) {
  const floats = Object.entries(layout).filter(([, w]) => w.float);
  const same = !fresh && floats.find(([, w]) => w.key === key);
  if (same) {
    const [id, w] = same;
    return { id, layout: bringToFront({ ...layout, [id]: { ...w, tab, open: true } }, id) };
  }
  let out = layout;
  if (floats.length >= MAX_FLOATS) {
    const oldest = floats.reduce((a, b) => (a[1].z <= b[1].z ? a : b))[0];
    out = { ...layout }; delete out[oldest];
  }
  const n = floats.length % 8, step = 28;
  const w = Math.min(FLOAT_W, Math.max(MIN_W, view.w - 2 * GRID)), h = Math.min(FLOAT_H, Math.max(MIN_H, view.h - 2 * GRID));
  // Started a little up-left of dead centre so the cascade's eight steps stay centred overall.
  const x = Math.round(Math.max(GRID, Math.min(view.w - w - GRID, (view.w - w) / 2 - 3 * step + n * step)));
  const y = Math.round(Math.max(GRID, Math.min(view.h - h - GRID, (view.h - h) / 2 - 3 * step + n * step)));
  const id = `${FLOAT_PREFIX}${seq.toString(36)}`;
  return { id, layout: { ...out, [id]: { x, y, w, h, open: true, detached: false, z: topZ(out) + 1, float: true, target, tab, key } } };
}

export const topZ = (layout) => Math.max(0, ...Object.values(layout).map(w => w.z || 0));

/** `id` brought to the front. Returns the same object when it already is, so React skips the render. */
export function bringToFront(layout, id) {
  const top = topZ(layout);
  if (layout[id].z === top && Object.values(layout).filter(w => w.z === top).length === 1) return layout;
  return { ...layout, [id]: { ...layout[id], z: top + 1 } };
}

const roundTo = (v, step) => Math.round(v / step) * step;

// Snap targets an edge can catch on, from every other docked, open window: the SAME edge (left to
// left, right to right — lining windows up), and one gutter past the facing edge (left edge to the
// other's right + 8 — setting them side by side). `lead` is the left/top edge, `trail` the
// right/bottom one. Deliberately no zero-gap target for facing edges: that would butt windows
// together, and being nearer than the gutter target it would win.
function targets(others, axis) {
  const lead = [], trail = [];
  for (const o of others) {
    const a = axis === 'x' ? o.x : o.y, b = axis === 'x' ? o.x + o.w : o.y + o.h;
    lead.push(a, b + SNAP_GAP);
    trail.push(b, a - SNAP_GAP);
  }
  return { lead, trail };
}
// The nearest target to `v` within SNAP_DIST, as a {delta, dist}; null when none is close enough.
function nearest(v, list) {
  let best = null;
  for (const t of list) { const d = Math.abs(t - v); if (d <= SNAP_DIST && (!best || d < best.dist)) best = { delta: t - v, dist: d }; }
  return best;
}
// Snap targets come from the window's own LAYER: a workspace window lines up with workspace windows,
// a floating inspector with other inspectors. The two layers scroll differently (inspectors stay put
// while the workspace scrolls under them), so an edge in one is not a place in the other.
// A tab inside another window is not on screen, and a collapsed window is only its title bar.
const dockedOthers = (layout, id) => Object.entries(layout)
  .filter(([k, w]) => k !== id && w.open && !w.detached && !!w.float === !!layout[id]?.float && !isTabMember(layout, k) && !stackOf(layout, id).includes(k))
  .map(([, w]) => (w.collapsed ? { ...w, h: TITLE_H } : w));

/**
 * Where a window being DRAGGED lands. Grid snap first, then window snap: the window's leading and
 * trailing edge are both tested and whichever is nearer a target moves the window.
 * Only clamped at the near sides (x, y >= 0) — never at the far ones, or space opened up by widening
 * the app could not be dragged into.
 */
export function snapMove(layout, id, x, y, opts = {}) {
  const w = layout[id];
  if (opts.grid) { x = roundTo(x, GRID); y = roundTo(y, GRID); }
  if (opts.windows) {
    const others = dockedOthers(layout, id);
    for (const axis of ['x', 'y']) {
      const { lead, trail } = targets(others, axis);
      const pos = axis === 'x' ? x : y, size = axis === 'x' ? w.w : w.h;
      const a = nearest(pos, lead), b = nearest(pos + size, trail);
      const pick = a && b ? (a.dist <= b.dist ? a : b) : (a ?? b);
      if (pick) { if (axis === 'x') x += pick.delta; else y += pick.delta; }
    }
  }
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

/**
 * The rect of a window being RESIZED from the start rect `r` by a pointer delta (dx, dy).
 * `edges` names the edges being dragged ('l', 'r', 't', 'b'). Only those edges snap. Dragging the
 * left or top edge moves the origin, so the opposite edge stays put.
 */
export function snapResize(layout, id, r, edges, dx, dy, opts = {}) {
  let l = r.x, t = r.y, rr = r.x + r.w, b = r.y + r.h;
  if (edges.includes('l')) l += dx;
  if (edges.includes('r')) rr += dx;
  if (edges.includes('t')) t += dy;
  if (edges.includes('b')) b += dy;
  const snap = (v, list) => {
    if (opts.grid) v = roundTo(v, GRID);
    if (opts.windows) { const n = nearest(v, list); if (n) v += n.delta; }
    return v;
  };
  const others = dockedOthers(layout, id);
  const tx = targets(others, 'x'), ty = targets(others, 'y');
  if (edges.includes('l')) l = Math.max(0, Math.min(snap(l, tx.lead), rr - MIN_W));
  if (edges.includes('r')) rr = Math.max(snap(rr, tx.trail), l + MIN_W);
  if (edges.includes('t')) t = Math.max(0, Math.min(snap(t, ty.lead), b - MIN_H));
  if (edges.includes('b')) b = Math.max(snap(b, ty.trail), t + MIN_H);
  return { x: l, y: t, w: rr - l, h: b - t };
}

/**
 * Where a window is DRAWN in a `viewW` x `viewH` view: pulled in far enough that RESCUE_STRIP px of
 * its title bar is visible, without touching the saved rect, so the window goes back to where it was
 * put when the view grows again. For the inspector layer, which does not scroll. A 0 view is no view.
 */
export function clampIntoView(w, viewW, viewH) {
  if (!(viewW > 0 && viewH > 0)) return w;
  const x = Math.max(0, Math.min(w.x, viewW - RESCUE_STRIP)), y = Math.max(0, Math.min(w.y, viewH - TITLE_H));
  return x === w.x && y === w.y ? w : { ...w, x, y };
}

/**
 * A window being opened, placed where it can be seen: `view` is the visible part of the workspace
 * ({x, y, w, h} — its scroll offset and size). Already wholly inside: unchanged. Partly inside: moved
 * the least that brings all of it in, so it stays near where it was put. Out of sight entirely (left
 * where the workspace was scrolled to last time, or drawn for a wider screen): centred in the view.
 * Shrunk to the view, with a gutter, when larger than it. Returns the same object when nothing moved.
 */
export function placeInView(w, view) {
  if (!w || !view || !(view.w > 0 && view.h > 0)) return w;
  const h = drawnHeight(w);
  const right = view.x + view.w, bottom = view.y + view.h;
  if (w.x >= view.x && w.y >= view.y && w.x + w.w <= right && w.y + h <= bottom) return w;
  const W = Math.max(MIN_W, Math.min(w.w, view.w - 2 * GRID)), H = Math.max(MIN_H, Math.min(w.h, view.h - 2 * GRID));
  const overlaps = w.x < right && w.x + w.w > view.x && w.y < bottom && w.y + h > view.y;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  const x = overlaps ? clamp(w.x, view.x + GRID, right - W - GRID) : view.x + (view.w - W) / 2;
  const y = overlaps ? clamp(w.y, view.y + GRID, bottom - (w.collapsed ? TITLE_H : H) - GRID) : view.y + (view.h - H) / 2;
  return { ...w, x: Math.max(0, roundTo(x, GRID)), y: Math.max(0, roundTo(y, GRID)), w: W, h: H };
}

/**
 * Pull every docked, open window back far enough that RESCUE_STRIP px of its title bar is inside a
 * `viewW` x `viewH` workspace, as a saved change. NOT run on resize, load or a preset any more (see
 * Workspace.jsx): it is kept for an explicit "bring my windows back" action. Returns the same object
 * when nothing moved.
 */
export function rescue(layout, viewW, viewH) {
  if (!(viewW > 0 && viewH > 0)) return layout;
  let changed = false;
  const out = {};
  for (const [id, w] of Object.entries(layout)) {
    let { x, y } = w;
    if (w.open && !w.detached) {
      x = Math.max(0, Math.min(x, viewW - RESCUE_STRIP));
      y = Math.max(0, Math.min(y, viewH - TITLE_H));
    }
    if (x !== w.x || y !== w.y) { changed = true; out[id] = { ...w, x, y }; } else out[id] = w;
  }
  return changed ? out : layout;
}

// ── Tab groups and collapse ────────────────────────────────────────────────────────────────────
// Drag one window's title bar onto another's and they become ONE window with a tab each. The HOST
// keeps the group's rect and lists the tabs in `stack` (host first) with `active` naming the one
// shown; every other member records `in: hostId` and keeps its own rect, untouched, for when it is
// pulled back out. Only docked workspace windows group: an inspector floats on its own layer.
//
// `collapsed` draws a window as its title bar only (double-click the title). The saved height stays,
// and the windows around it do not move — the gap is the arrangement, kept (Owen, 2026-11-05).
// Collapsing is not an arrangement change, so it works with Lock layout on.

/** The window a tab is drawn in: its host, or itself. */
export const hostOf = (layout, id) => (layout[id]?.in && layout[layout[id].in]?.stack?.includes(id) ? layout[id].in : id);
/** Every tab of `id`'s window, host first; a lone window is a stack of one. */
export const stackOf = (layout, id) => { const h = hostOf(layout, id); return layout[h]?.stack?.length > 1 ? layout[h].stack : [h]; };
/** Whether `id` is drawn by another window (a tab that is not its group's host). */
export const isTabMember = (layout, id) => hostOf(layout, id) !== id;
/** The height a window takes on screen. */
export const drawnHeight = (w) => (w?.collapsed ? TITLE_H : w?.h ?? 0);

const stripGroup = ({ stack, active, ...w }) => w;   // eslint-disable-line no-unused-vars
const stripMember = ({ in: _in, ...w }) => w;          // eslint-disable-line no-unused-vars

/**
 * `dragId`'s window joins `targetId`'s as tabs (a whole group dragged in brings every tab), shown on
 * the one dragged. The target's place and size are the group's. Refused — the same layout back — for
 * an inspector, a detached window, or two windows already in one group.
 */
export function combineWindows(layout, dragId, targetId) {
  const host = hostOf(layout, targetId), from = hostOf(layout, dragId);
  const a = layout[from], b = layout[host];
  if (!a || !b || from === host || a.float || b.float || a.detached || b.detached) return layout;
  const incoming = stackOf(layout, dragId), have = stackOf(layout, host);
  const out = { ...layout };
  for (const id of incoming) out[id] = { ...stripGroup(out[id]), in: host, open: true, detached: false, collapsed: false };
  out[host] = { ...stripMember(out[host]), stack: [...have, ...incoming.filter(id => !have.includes(id))], active: dragId, open: true };
  return bringToFront(out, host);
}

/** Show tab `id` in its window. */
export function setActiveTab(layout, id) {
  const host = hostOf(layout, id);
  if (stackOf(layout, id).length < 2 || layout[host].active === id) return layout;
  return { ...layout, [host]: { ...layout[host], active: id } };
}

/**
 * Tab `id` out of its group, as a window of its own at `at` ({x, y}) or just off the group's corner.
 * When the HOST leaves, the next tab takes over the group's place and size. A group left with one tab
 * is an ordinary window again.
 */
export function ungroup(layout, id, at = null) {
  const host = hostOf(layout, id), stack = stackOf(layout, id);
  if (stack.length < 2) return layout;
  const out = { ...layout }, g = layout[host];
  const rest = stack.filter(x => x !== id);
  const place = at ?? { x: g.x + 3 * GRID, y: g.y + 3 * GRID };
  const active = g.active === id || !rest.includes(g.active) ? rest[0] : g.active;
  if (id === host) {
    const next = rest[0];
    out[next] = { ...stripMember(out[next]), x: g.x, y: g.y, w: g.w, h: g.h, z: g.z, collapsed: !!g.collapsed,
                  ...(rest.length > 1 ? { stack: rest, active } : {}) };
    for (const m of rest.slice(1)) out[m] = { ...out[m], in: next };
    out[id] = { ...stripGroup(g), ...place, collapsed: false };
  } else {
    out[id] = { ...stripMember(out[id]), ...place };
    out[host] = rest.length > 1 ? { ...g, stack: rest, active } : stripGroup(g);
  }
  return bringToFront(out, id);
}

/**
 * Tab `id` moved to position `to` in its window's strip. The first tab is the HOST, which holds the
 * window's place and size, so moving another tab to the front hands that over: the window stays put.
 */
export function moveTab(layout, id, to) {
  const host = hostOf(layout, id), stack = stackOf(layout, id);
  const from = stack.indexOf(id);
  if (stack.length < 2 || from < 0) return layout;
  const next = stack.filter(x => x !== id);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, id);
  if (next.every((x, i) => x === stack[i])) return layout;
  const out = { ...layout }, g = layout[host], nh = next[0];
  if (nh === host) { out[host] = { ...g, stack: next }; return out; }
  // The new first tab takes the window over; the old host becomes a tab, its own rect the group's.
  out[nh] = { ...stripMember(out[nh]), x: g.x, y: g.y, w: g.w, h: g.h, z: g.z, collapsed: !!g.collapsed, stack: next, active: g.active, open: true };
  out[host] = { ...stripGroup(g), in: nh, collapsed: false };
  for (const m of next.slice(1)) if (m !== host) out[m] = { ...out[m], in: nh };
  return out;
}

/** Close one tab: it leaves its group (where it would go back to its own spot) and hides. */
export function closeTab(layout, id) {
  const w = layout[id];
  if (!w) return layout;
  const out = stackOf(layout, id).length > 1 ? ungroup(layout, id, { x: w.x, y: w.y }) : layout;
  return { ...out, [id]: { ...out[id], open: false } };
}

/** Close a whole window: every tab hides and the group dissolves, each back to its own spot. */
export function closeGroup(layout, id) {
  let out = layout;
  for (const m of stackOf(layout, id)) out = closeTab(out, m);
  return out;
}

export function toggleCollapsed(layout, id) {
  const host = hostOf(layout, id);
  if (!layout[host]) return layout;
  return { ...layout, [host]: { ...layout[host], collapsed: !layout[host].collapsed } };
}

/** Group fields read back from storage: dropped unless every member and its host agree. */
function cleanGroups(out) {
  for (const [id, w] of Object.entries(out)) {
    if (!Array.isArray(w.stack)) continue;
    const ok = [...new Set(w.stack)].filter(m => out[m] && !out[m].float && (m === id || out[m].in === id));
    if (ok[0] !== id || ok.length < 2 || w.float || w.detached) { out[id] = stripGroup(w); continue; }
    out[id] = { ...w, stack: ok, active: ok.includes(w.active) ? w.active : ok[0] };
  }
  for (const [id, w] of Object.entries(out)) {
    if (w.in != null && !out[w.in]?.stack?.includes(id)) out[id] = stripMember(w);
  }
  return out;
}

// ── Persistence ────────────────────────────────────────────────────────────────
// Settings live in localStorage under axis_* keys, like every other preference. A new key with its
// own version stamp rather than a storage-migrate.js entry: nothing older than this exists to migrate,
// and `readLayoutState` validates everything it reads, so a hand-edited or half-written value falls
// back to the Default preset instead of crashing the workspace.
export const LAYOUT_KEY = 'axis_desktop_layout';
export const LAYOUT_VERSION = 1;

const num = (v, lo = -Infinity) => Number.isFinite(v) && v >= lo;
function cleanWindow(w, fallback) {
  if (!w || typeof w !== 'object') return fallback;
  return {
    x: num(w.x, 0) ? w.x : fallback.x, y: num(w.y, 0) ? w.y : fallback.y,
    w: num(w.w, MIN_W) ? w.w : fallback.w, h: num(w.h, MIN_H) ? w.h : fallback.h,
    open: typeof w.open === 'boolean' ? w.open : fallback.open,
    detached: w.detached === true,
    z: num(w.z, 0) ? w.z : fallback.z,
    // Tab group and collapse fields ride along as read; cleanGroups (below) keeps only a consistent group.
    ...(w.collapsed === true ? { collapsed: true } : {}),
    ...(Array.isArray(w.stack) ? { stack: w.stack.filter(x => typeof x === 'string'), active: typeof w.active === 'string' ? w.active : null } : {}),
    ...(typeof w.in === 'string' ? { in: w.in } : {}),
  };
}
/**
 * Every known window present and sane; unknown ids dropped. Inspector windows survive when their
 * target still reads as one (cleanTarget) — a hand-edited or outdated entry is dropped, never shown
 * half-built — and come back docked, since the OS window they may have been in is gone.
 */
export function cleanLayout(raw) {
  const base = presetLayout('default');
  const out = {};
  for (const id of WINDOW_IDS) out[id] = cleanWindow(raw?.[id], base[id]);
  if (raw && typeof raw === 'object') {
    const floats = Object.entries(raw).filter(([id, w]) => isFloatId(id) && w && typeof w === 'object').slice(-MAX_FLOATS);
    for (const [id, w] of floats) {
      const target = cleanTarget(w.target);
      if (!target) continue;
      const g = cleanWindow(w, { x: GRID, y: GRID, w: FLOAT_W, h: FLOAT_H, open: true, detached: false, z: 1 });
      out[id] = { ...g, open: true, detached: false, float: true, target, key: targetKey(target), tab: typeof w.tab === 'string' ? w.tab : 'info' };
    }
  }
  return cleanGroups(out);
}

export function defaultLayoutState() {
  return { v: LAYOUT_VERSION, windows: presetLayout('default'), preset: 'default',
           snapGrid: true, snapWindows: true, locked: false, cols: {}, named: {}, hidden: [] };
}

/** The saved layout state, or the default when there is none or it does not parse. */
export function readLayoutState(storage) {
  const d = defaultLayoutState();
  let raw;
  try { raw = JSON.parse(storage?.getItem(LAYOUT_KEY) ?? 'null'); } catch { return d; }
  if (!raw || typeof raw !== 'object' || raw.v !== LAYOUT_VERSION) return d;
  const named = {};
  if (raw.named && typeof raw.named === 'object') {
    for (const [name, lay] of Object.entries(raw.named)) if (name.trim() && lay && typeof lay === 'object') named[name] = cleanLayout(lay);
  }
  const cols = {};
  if (raw.cols && typeof raw.cols === 'object') {
    for (const [win, widths] of Object.entries(raw.cols)) {
      if (!widths || typeof widths !== 'object') continue;
      const ok = Object.entries(widths).filter(([, v]) => num(v, 32));
      if (ok.length) cols[win] = Object.fromEntries(ok);
    }
  }
  return {
    v: LAYOUT_VERSION,
    windows: cleanLayout(raw.windows),
    preset: typeof raw.preset === 'string' ? raw.preset : null,
    snapGrid: raw.snapGrid !== false, snapWindows: raw.snapWindows !== false, locked: raw.locked === true,
    cols, named,
    hidden: Array.isArray(raw.hidden) ? raw.hidden.filter(id => PRESETS.some(p => p.id === id)) : [],
  };
}

export function writeLayoutState(storage, state) {
  try { storage?.setItem(LAYOUT_KEY, JSON.stringify(state)); } catch { /* quota or private mode: the layout just won't persist */ }
}

/** How big the workspace's scrollable canvas must be to hold every docked window. */
export function canvasSize(layout) {
  let w = 0, h = 0;
  for (const [id, win] of Object.entries(layout)) if (win.open && !win.detached && !win.float && !isTabMember(layout, id)) { w = Math.max(w, win.x + win.w); h = Math.max(h, win.y + drawnHeight(win)); }
  return { w: w + GRID, h: h + GRID };
}

// ── Saved layouts: rename, overwrite, delete; built-ins hidden ─────────────────────────────────
// Pure, over the whole layout state, so the status bar's menu and the suite share one rule each.

/** `from` renamed to `to` (trimmed). Refused — the same state back — for a blank name or one taken. */
export function renameNamed(state, from, to) {
  const name = (to ?? '').trim();
  if (!state.named[from] || !name || name === from || state.named[name]) return state;
  // Rebuilt in the same order, so a rename does not move the chip to the end of the bar.
  const named = Object.fromEntries(Object.entries(state.named).map(([k, v]) => [k === from ? name : k, v]));
  return { ...state, named, preset: state.preset === `named:${from}` ? `named:${name}` : state.preset };
}
/** `name` overwritten with the workspace as it is now (its inspector windows left out). */
export function overwriteNamed(state, name) {
  if (!state.named[name]) return state;
  return { ...state, named: { ...state.named, [name]: dockedOf(state.windows) }, preset: `named:${name}` };
}
export function deleteNamed(state, name) {
  if (!state.named[name]) return state;
  const named = { ...state.named }; delete named[name];
  return { ...state, named, preset: state.preset === `named:${name}` ? null : state.preset };
}
/** A built-in layout taken off the status bar (they cannot be deleted), or put back. */
export function setPresetHidden(state, id, hide) {
  const cur = state.hidden ?? [];
  const hidden = hide ? [...new Set([...cur, id])] : cur.filter(x => x !== id);
  return { ...state, hidden };
}
