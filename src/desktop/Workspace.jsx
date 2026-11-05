import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import DeskWindow from "./DeskWindow.jsx";
import { WINDOWS, PRESETS, GRID, presetLayout, fitToHeight, bringToFront, snapMove, snapResize, clampIntoView, canvasSize,
         readLayoutState, writeLayoutState, cleanLayout, MIN_W, MIN_H, floatsOf, dockedOf, openFloat,
         renameNamed, overwriteNamed, deleteNamed, setPresetHidden } from "./layout.js";
import { ContextMenu } from "./ContextMenu.jsx";

// The window manager: the window chips, a workspace of freely placed windows, and a status bar
// holding the detached tray and the layout controls. What a window CONTAINS is the caller's
// (`renderWindow`); this only places, stacks and remembers them.

/** The persisted layout state (axis_desktop_layout), shared by the app and the workspace. */
export function useLayoutState() {
  const [state, setState] = useState(() => readLayoutState(localStorage));
  useEffect(() => { writeLayoutState(localStorage, state); }, [state]);
  return [state, setState];
}

/** Mark a window docked again (its OS window was closed), raising it in the workspace. */
export const dockWindow = (setState, id) => setState(s => ({
  ...s, windows: bringToFront({ ...s.windows, [id]: { ...s.windows[id], open: true, detached: false } }, id),
}));
export const detachWindow = (setState, id) => setState(s => ({ ...s, windows: { ...s.windows, [id]: { ...s.windows[id], detached: true } } }));

/** Open-and-raise a closed window, or close an open one (the header's Windows menu). */
export const toggleWindow = (setState, id) => setState(s => {
  const w = s.windows[id];
  if (w.open && !w.detached) return { ...s, windows: { ...s.windows, [id]: { ...w, open: false } } };
  return { ...s, windows: bringToFront({ ...s.windows, [id]: { ...w, open: true, detached: false } }, id) };
});

/**
 * Open (or raise) a floating inspector on `target` at `tab` — see layout.js openFloat. `view` is the
 * visible workspace's size, for placing a new window inside it.
 */
export const openInspector = (setState, spec, opts) => setState(s => ({ ...s, windows: openFloat(s.windows, spec, opts).layout }));

/** Open (and raise) a window from outside the workspace — e.g. the Browser when "+" starts a new tab. */
export const openWindow = (setState, id) => setState(s => ({
  ...s, windows: bringToFront({ ...s.windows, [id]: { ...s.windows[id], open: true, detached: false } }, id),
}));

// Chip: 22 px, radius 11. On = accent tint; off = transparent with a strong border.
export function Chip({ on, onClick, children, title, pressed = true, onContextMenu, onDoubleClick }) {
  return (
    <button type="button" onClick={onClick} onContextMenu={onContextMenu} onDoubleClick={onDoubleClick} title={title} aria-pressed={pressed ? !!on : undefined}
      style={{ height: 24, padding: "0 10px", borderRadius: 12, fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
               background: on ? C.accentLight : "transparent", border: `1px solid ${on ? C.accent : C.borderStrong}`,
               color: on ? C.accent : C.textMid }}>
      {children}
    </button>
  );
}
export function Button({ primary, onClick, children, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ height: 28, padding: "0 12px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: disabled ? "default" : "pointer",
               whiteSpace: "nowrap", opacity: disabled ? 0.5 : 1,
               background: primary ? C.accent : C.surfaceAlt, border: `1px solid ${primary ? C.accent : C.borderStrong}`,
               color: primary ? C.bg : C.text }}>
      {children}
    </button>
  );
}
const SectionLabel = ({ children }) => (
  <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid, whiteSpace: "nowrap" }}>{children}</span>
);

// `onPopOut(id)` / `onDock(id)` let the app open and close the real OS window; the workspace only
// records the detached state they report back through `setState`.
// `backdrop` (optional) is drawn behind the workspace and does not scroll with it — the user's
// background picture (Backdrop.jsx).
export default function Workspace({ state, setState, renderWindow, windowTitle, windowExtra, onPopOut, onDock, backdrop }) {
  const layout = state.windows;
  // `extra` rides along only when the windows actually changed, so a pointer move that snaps to the
  // same spot re-renders nothing.
  const setLayout = useCallback((fn, extra) => setState(s => {
    const next = typeof fn === "function" ? fn(s.windows) : fn;
    return next === s.windows ? s : { ...s, windows: next, ...extra };
  }), []);
  const layoutRef = useRef(layout); layoutRef.current = layout;

  // ── Resizing the program window never moves a window ─────────────────────────────────────────
  // It used to: an off-screen "rescue" ran on every resize (and on load, and after a preset) and
  // WROTE each window back inside the new edge, so shrinking the window and growing it again left an
  // arrangement squashed to the left — and Lock layout, which only stops your own drags, could not
  // stop it (Owen, 2026-11-05). The workspace scrolls, so a window past the edge is still in reach and
  // stays exactly where it was put. Only the inspector layer, which does not scroll, needs keeping in
  // view, and that is done where it is DRAWN (clampIntoView below), never by changing the saved rect.
  const wsRef = useRef(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const viewRef = useRef(view); viewRef.current = view;
  useLayoutEffect(() => {
    const el = wsRef.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setView({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    // An untouched built-in preset (first launch, or nothing moved since) is fitted to this
    // workspace's height; anything the user arranged is left exactly where they put it.
    const el = wsRef.current;
    if (el && PRESETS.some(p => p.id === state.preset) && JSON.stringify(dockedOf(state.windows)) === JSON.stringify(presetLayout(state.preset)))
      // From the preset itself, not s.windows: StrictMode runs this twice, and scaling the already
      // scaled layout again squeezed it twice over. Inspector windows ride along untouched.
      setState(s => PRESETS.some(p => p.id === s.preset) ? { ...s, windows: { ...fitToHeight(presetLayout(s.preset), el.clientHeight), ...floatsOf(s.windows) } } : s);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Window operations ─────────────────────────────────────────────────────────────────────────
  const focus = useCallback((id) => setLayout(l => bringToFront(l, id)), [setLayout]);
  const toggle = (id) => setLayout(l => {
    const w = l[id];
    if (w.open && !w.detached) return { ...l, [id]: { ...w, open: false } };
    return bringToFront({ ...l, [id]: { ...w, open: true, detached: false } }, id);
  });
  // An inspector is made for one look at one item, so closing it forgets it; a workspace window only hides.
  const close = useCallback((id) => setLayout(l => {
    if (!l[id]?.float) return { ...l, [id]: { ...l[id], open: false } };
    const out = { ...l }; delete out[id]; return out;
  }), [setLayout]);
  const popOutLocal = useCallback((id) => setLayout(l => ({ ...l, [id]: { ...l[id], detached: true } })), [setLayout]);
  const popOut = onPopOut ?? popOutLocal;
  const dock = (id) => { onDock?.(id); setLayout(l => bringToFront({ ...l, [id]: { ...l[id], detached: false, open: true } }, id)); };

  // Drags are measured from the rect the gesture started at (see DeskWindow).
  const dragStart = useRef({});
  const opts = { grid: state.snapGrid, windows: state.snapWindows };
  const optsRef = useRef(opts); optsRef.current = opts;
  // Kept out of the state updaters on purpose: StrictMode runs updaters twice, and one that deletes
  // the start rect would find it already gone on the second run.
  // Moving a workspace window means the layout is no longer the preset; moving an inspector does not.
  const dockedEdit = (id) => layoutRef.current[id]?.float ? undefined : { preset: null };
  // An inspector is dragged from where it is DRAWN (clamped into view), not its saved spot off-screen.
  const onDragStart = useCallback((id) => { const w = layoutRef.current[id];
    dragStart.current[id] = w?.float ? { ...clampIntoView(w, viewRef.current.w, viewRef.current.h) } : { ...w }; }, []);
  const onDrag = useCallback((id, kind, edges, dx, dy) => setLayout(l => {
    const s = dragStart.current[id]; if (!s) return l;
    const r = kind === "move" ? { ...snapMove(l, id, s.x + dx, s.y + dy, optsRef.current), w: s.w, h: s.h }
                              : snapResize(l, id, s, edges, dx, dy, optsRef.current);
    const w = l[id];
    if (r.x === w.x && r.y === w.y && r.w === w.w && r.h === w.h) return l;
    return { ...l, [id]: { ...w, ...r } };
  }, dockedEdit(id)), [setLayout]);   // eslint-disable-line react-hooks/exhaustive-deps
  const onDragEnd = useCallback((id) => { delete dragStart.current[id]; }, []);
  const onDragCancel = useCallback((id) => {
    const s = dragStart.current[id]; delete dragStart.current[id];
    if (s) setLayout(l => ({ ...l, [id]: { ...l[id], x: s.x, y: s.y, w: s.w, h: s.h } }));
  }, [setLayout]);
  const onKeyNudge = useCallback((id, kind, dx, dy) => setLayout(l => {
    const w = l[id];
    const r = kind === "move" ? { x: Math.max(0, w.x + dx), y: Math.max(0, w.y + dy) }
                              : { w: Math.max(MIN_W, w.w + dx), h: Math.max(MIN_H, w.h + dy) };
    return { ...l, [id]: { ...w, ...r } };
  }, dockedEdit(id)), [setLayout]);   // eslint-disable-line react-hooks/exhaustive-deps

  const applyPreset = (id) => {
    const h = wsRef.current?.clientHeight;
    setState(s => ({ ...s, windows: { ...fitToHeight(presetLayout(id), h), ...floatsOf(s.windows) }, preset: id }));
  };
  const applyNamed = (name) => {
    setState(s => s.named[name] ? { ...s, windows: { ...dockedOf(cleanLayout(s.named[name])), ...floatsOf(s.windows) }, preset: `named:${name}` } : s);
  };
  const [naming, setNaming] = useState(null);   // the "Save layout as…" field's text, or null when closed
  const saveNamed = () => {
    const name = (naming ?? "").trim();
    if (!name) { setNaming(null); return; }
    // A layout is the arrangement of the workspace; the inspectors open right now are not part of it.
    setState(s => ({ ...s, named: { ...s.named, [name]: dockedOf(s.windows) }, preset: `named:${name}` }));
    setNaming(null);
  };
  // A saved layout's chip: double click renames it in place; right click for the rest. A built-in
  // one cannot be renamed or deleted, but it can be taken off the bar and put back.
  const [renaming, setRenaming] = useState(null);   // {from, text}
  const [chipMenu, setChipMenu] = useState(null);   // {x, y, items}
  const commitRename = () => { if (renaming) setState(s => renameNamed(s, renaming.from, renaming.text)); setRenaming(null); };
  const hiddenPresets = state.hidden ?? [];
  const restoreItems = hiddenPresets.length ? [{ divider: true }, { heading: t("Hidden layouts") },
    ...hiddenPresets.map(id => ({ label: t("Show {name}", { name: t(PRESETS.find(p => p.id === id)?.title ?? id) }), onSelect: () => setState(s => setPresetHidden(s, id, false)) }))] : [];
  const openChipMenu = (e, items) => { e.preventDefault(); setChipMenu({ x: e.clientX, y: e.clientY, items: [...items, ...restoreItems] }); };
  const namedMenu = (name) => [
    { label: t("Apply"), onSelect: () => applyNamed(name) },
    { label: t("Rename…"), hint: t("Double-click"), onSelect: () => setRenaming({ from: name, text: name }) },
    { label: t("Update to the current arrangement"), onSelect: () => setState(s => overwriteNamed(s, name)) },
    { divider: true },
    { label: t("Delete"), danger: true, onSelect: () => { if (window.confirm(t('Delete the layout "{name}"?', { name }))) setState(s => deleteNamed(s, name)); } },
  ];
  const presetMenu = (p) => [
    { label: t("Apply"), onSelect: () => applyPreset(p.id) },
    { label: t("Built-in layouts can't be renamed or deleted"), disabled: true },
    { label: t("Hide from the bar"), onSelect: () => setState(s => setPresetHidden(s, p.id, true)) },
  ];
  const setFlag = (k) => setState(s => ({ ...s, [k]: !s[k] }));

  const shown = (w) => w.open && !w.detached;
  const top = Math.max(...Object.values(layout).filter(w => shown(w) && !w.float).map(w => w.z), 0);
  const floatTop = Math.max(...Object.values(layout).filter(w => shown(w) && w.float).map(w => w.z), 0);
  const size = canvasSize(layout);
  const floats = Object.entries(layout).filter(([, w]) => w.float);
  const detached = [...WINDOWS.map(w => w.id), ...floats.map(([id]) => id)].filter(id => layout[id].detached && layout[id].open);
  const win = (id, g, isTop, title) => (
    <DeskWindow key={id} id={id} title={title} rect={g} z={g.z} focused={isTop} locked={state.locked} floating={!!g.float}
      onFocus={focus} onDragStart={onDragStart} onDrag={onDrag} onDragEnd={onDragEnd} onDragCancel={onDragCancel}
      onKeyNudge={onKeyNudge} onClose={close} onPopOut={popOut} extra={windowExtra?.(id)}>
      {renderWindow(id)}
    </DeskWindow>
  );

  return (
    <>
      {/* Workspace. Which windows are open is the header's Windows menu (toggleWindow). The
          inspector layer sits over it without scrolling with it, and lets clicks through
          everywhere it has no window — nothing is dimmed, nothing is blocked. */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
        {backdrop}
        <div ref={wsRef} style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative", zIndex: 1,
                                  backgroundImage: state.snapGrid ? `radial-gradient(${C.border} 1px, transparent 1px)` : "none",
                                  backgroundSize: `${GRID * 2}px ${GRID * 2}px`, backgroundAttachment: "local" }}>
          <div style={{ position: "relative", width: size.w, height: size.h, minWidth: "100%", minHeight: "100%" }}>
            {WINDOWS.map(w => { const g = layout[w.id]; return shown(g) ? win(w.id, g, g.z === top, windowTitle?.(w.id) ?? t(w.title)) : null; })}
          </div>
        </div>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 2 }}>
          {floats.map(([id, g]) => shown(g)
            ? <div key={id} style={{ pointerEvents: "auto" }}>{win(id, clampIntoView(g, view.w, view.h), g.z === floatTop, windowTitle?.(id) ?? id)}</div>
            : null)}
        </div>
      </div>

      {/* Status bar */}
      <footer style={{ height: 30, flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "0 12px",
                       background: C.surface, borderTop: `1px solid ${C.border}`, overflowX: "auto" }}>
        <SectionLabel>{t("Detached")}</SectionLabel>
        {detached.length
          ? detached.map(id => <Chip key={id} pressed={false} onClick={() => dock(id)} title={t("Dock")}>{windowTitle?.(id) ?? id}</Chip>)
          : <span style={{ fontSize: 12, color: C.textMid, whiteSpace: "nowrap" }}>{t("None. Pop a window out to send it to another monitor.")}</span>}
        <span style={{ flex: 1 }} />
        <SectionLabel>{t("Layout")}</SectionLabel>
        {PRESETS.filter(p => !hiddenPresets.includes(p.id)).map(p => <Chip key={p.id} on={state.preset === p.id} onClick={() => applyPreset(p.id)}
          title={t("Right-click for options")} onContextMenu={(e) => openChipMenu(e, presetMenu(p))}>{t(p.title)}</Chip>)}
        {Object.keys(state.named).map(name => renaming?.from === name
          ? <input key={name} autoFocus value={renaming.text} aria-label={t("Layout name")} onChange={(e) => setRenaming(r => ({ ...r, text: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }} onBlur={commitRename}
              style={{ height: 22, width: 140, boxSizing: "border-box", padding: "0 8px", borderRadius: 11, fontSize: 11.5,
                       background: C.bg, border: `1px solid ${C.accent}`, color: C.text, outline: "none" }} />
          : <Chip key={name} on={state.preset === `named:${name}`} onClick={() => applyNamed(name)} title={t("Double-click to rename · right-click for options")}
              onDoubleClick={() => setRenaming({ from: name, text: name })} onContextMenu={(e) => openChipMenu(e, namedMenu(name))}>{name}</Chip>)}
        {chipMenu && <ContextMenu x={chipMenu.x} y={chipMenu.y} items={chipMenu.items} onClose={() => setChipMenu(null)} />}
        {naming == null
          ? <Chip pressed={false} onClick={() => setNaming("")}>{t("Save layout as…")}</Chip>
          : <form onSubmit={(e) => { e.preventDefault(); saveNamed(); }} style={{ display: "flex", gap: 6 }}>
              <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} placeholder={t("Layout name")}
                onKeyDown={(e) => { if (e.key === "Escape") setNaming(null); }} aria-label={t("Layout name")}
                style={{ height: 22, width: 140, boxSizing: "border-box", padding: "0 8px", borderRadius: 11, fontSize: 11.5,
                         background: C.bg, border: `1px solid ${C.borderStrong}`, color: C.text, outline: "none" }} />
              <Chip on onClick={saveNamed}>{t("Save")}</Chip>
            </form>}
        <span style={{ width: 8 }} />
        <Chip on={state.locked} onClick={() => setFlag("locked")}>{t("Lock layout")}</Chip>
        <Chip on={state.snapWindows} onClick={() => setFlag("snapWindows")}>{t("Snap to windows")}</Chip>
        <Chip on={state.snapGrid} onClick={() => setFlag("snapGrid")}>{t("Snap to grid")}</Chip>
      </footer>
    </>
  );
}
