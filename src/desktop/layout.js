// The desktop workspace's window geometry: presets, snapping, the off-screen rescue and the saved
// layout. Pure functions over plain objects, no React, so the regression suite can pin them — the
// window manager is the part of the desktop app where a wrong number loses you a window.
//
// Coordinates are plain pixels from the workspace's top-left. A window is
// {x, y, w, h, open, detached, z}; a layout is {[windowId]: window}.

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
// Every phone screen has a home here: Effects is the phone's Effects tab (boosters, projected fits,
// command links, environment), Graphs its Graph page, Validation the top card of its Stats page.
export const WINDOWS = [
  { id: 'browser', title: 'Browser' },
  { id: 'fitting', title: 'Fitting' },
  { id: 'effects', title: 'Effects' },
  { id: 'cargo', title: 'Cargo' },
  { id: 'resources', title: 'Resources' },
  { id: 'defense', title: 'Defense' },
  { id: 'firepower', title: 'Firepower' },
  { id: 'capacitor', title: 'Capacitor' },
  { id: 'targeting', title: 'Targeting' },
  { id: 'mobility', title: 'Mobility' },
  { id: 'price', title: 'Fit price' },
  { id: 'validation', title: 'Validation' },
  { id: 'graphs', title: 'Graphs' },
  { id: 'drones', title: 'Drones' },
  { id: 'implants', title: 'Implants' },
  { id: 'notes', title: 'Notes' },
];
export const WINDOW_IDS = WINDOWS.map(w => w.id);

// [x, y, w, h, open]. Drawn at a 1440 px reference width and ~990 px of workspace height.
//
// Two 320 px stat columns rather than the mockup's single 404 px one: the windows hold the phone's
// own stat cards, and at their real heights (measured on a battlecruiser: defense ~480 px of content,
// fit value ~300) one column would need about 1,600 px. Heights are content + the 28 px title bar,
// rounded to the grid.
const STAT_A = { resources: [8, 72], defense: [88, 512], capacitor: [608, 144], cargo: [760, 224] };
const STAT_B = { validation: [8, 112], firepower: [128, 272], targeting: [408, 184], mobility: [600, 184], price: [792, 192] };
const column = (col, x, w = 320) => Object.fromEntries(Object.entries(col).map(([id, [y, h]]) => [id, [x, y, w, h, true]]));
const CLOSED_BY_DEFAULT = { drones: [296, 120, 400, 420, false], implants: [340, 160, 400, 480, false], notes: [380, 200, 320, 200, false],
                            graphs: [296, 48, 724, 640, false] };

const PRESET_GEOMETRY = {
  default: {
    browser: [8, 8, 280, 976, true], fitting: [296, 8, 480, 640, true], effects: [296, 656, 480, 328, true],
    ...column(STAT_A, 784), ...column(STAT_B, 1112), ...CLOSED_BY_DEFAULT,
  },
  mirrored: {
    browser: [1152, 8, 280, 976, true], fitting: [664, 8, 480, 640, true], effects: [664, 656, 480, 328, true],
    ...column(STAT_B, 8), ...column(STAT_A, 336), ...CLOSED_BY_DEFAULT,
  },
  // No browser: the fit gets the room.
  focus: {
    browser: [8, 8, 280, 976, false], fitting: [8, 8, 768, 640, true], effects: [8, 656, 768, 328, true],
    ...column(STAT_A, 784), ...column(STAT_B, 1112), ...CLOSED_BY_DEFAULT,
  },
};
export const PRESETS = [
  { id: 'default', title: 'Default' },
  { id: 'mirrored', title: 'Mirrored' },
  { id: 'focus', title: 'Focus' },
];

/** A fresh layout from a built-in preset, re-stacked in list order. */
export function presetLayout(id) {
  const g = PRESET_GEOMETRY[id] ?? PRESET_GEOMETRY.default;
  const out = {};
  WINDOW_IDS.forEach((wid, i) => {
    const [x, y, w, h, open] = g[wid];
    out[wid] = { x, y, w, h, open, detached: false, z: i + 1 };
  });
  return out;
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
const dockedOthers = (layout, id) => Object.entries(layout)
  .filter(([k, w]) => k !== id && w.open && !w.detached).map(([, w]) => w);

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
 * Pull every docked, open window back far enough that RESCUE_STRIP px of its title bar is inside a
 * `viewW` x `viewH` workspace. Run on load, on a viewport resize and after a preset — never during a
 * drag. Returns the same object when nothing moved.
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
  };
}
/** Every known window present and sane; unknown ids dropped. */
export function cleanLayout(raw) {
  const base = presetLayout('default');
  const out = {};
  for (const id of WINDOW_IDS) out[id] = cleanWindow(raw?.[id], base[id]);
  return out;
}

export function defaultLayoutState() {
  return { v: LAYOUT_VERSION, windows: presetLayout('default'), preset: 'default',
           snapGrid: true, snapWindows: true, locked: false, cols: {}, named: {} };
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
  };
}

export function writeLayoutState(storage, state) {
  try { storage?.setItem(LAYOUT_KEY, JSON.stringify(state)); } catch { /* quota or private mode: the layout just won't persist */ }
}

/** How big the workspace's scrollable canvas must be to hold every docked window. */
export function canvasSize(layout) {
  let w = 0, h = 0;
  for (const win of Object.values(layout)) if (win.open && !win.detached) { w = Math.max(w, win.x + win.w); h = Math.max(h, win.y + win.h); }
  return { w: w + GRID, h: h + GRID };
}
