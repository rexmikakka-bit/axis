import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import DeskWindow from "./DeskWindow.jsx";
import { WINDOWS, PRESETS, GRID, presetLayout, fitToHeight, bringToFront, snapMove, snapResize, rescue, canvasSize,
         readLayoutState, writeLayoutState, cleanLayout, MIN_W, MIN_H } from "./layout.js";

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

/** Open (and raise) a window from outside the workspace — e.g. the Browser when "+" starts a new tab. */
export const openWindow = (setState, id) => setState(s => ({
  ...s, windows: bringToFront({ ...s.windows, [id]: { ...s.windows[id], open: true, detached: false } }, id),
}));

// Chip: 22 px, radius 11. On = accent tint; off = transparent with a strong border.
export function Chip({ on, onClick, children, title, pressed = true }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={pressed ? !!on : undefined}
      style={{ height: 22, padding: "0 9px", borderRadius: 11, fontSize: 11, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
               background: on ? C.accentLight : "transparent", border: `1px solid ${on ? C.accent : C.borderStrong}`,
               color: on ? C.accent : C.textMid }}>
      {children}
    </button>
  );
}
export function Button({ primary, onClick, children, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ height: 30, padding: "0 12px", borderRadius: 6, fontSize: 12, fontWeight: primary ? 600 : 500, cursor: disabled ? "default" : "pointer",
               whiteSpace: "nowrap", opacity: disabled ? 0.5 : 1,
               background: primary ? C.accent : C.surfaceAlt, border: `1px solid ${primary ? C.accent : C.borderStrong}`,
               color: primary ? C.bg : C.text }}>
      {children}
    </button>
  );
}
const SectionLabel = ({ children }) => (
  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid, whiteSpace: "nowrap" }}>{children}</span>
);

// `onPopOut(id)` / `onDock(id)` let the app open and close the real OS window; the workspace only
// records the detached state they report back through `setState`.
export default function Workspace({ state, setState, renderWindow, windowTitle, windowExtra, onPopOut, onDock }) {
  const layout = state.windows;
  // `extra` rides along only when the windows actually changed, so a pointer move that snaps to the
  // same spot re-renders nothing.
  const setLayout = useCallback((fn, extra) => setState(s => {
    const next = typeof fn === "function" ? fn(s.windows) : fn;
    return next === s.windows ? s : { ...s, windows: next, ...extra };
  }), []);
  const layoutRef = useRef(layout); layoutRef.current = layout;

  // ── Off-screen rescue: on load, on a viewport resize, and after a preset ──────────────────────
  const wsRef = useRef(null);
  const doRescue = useCallback(() => {
    const el = wsRef.current; if (!el) return;
    setLayout(l => rescue(l, el.clientWidth, el.clientHeight));
  }, [setLayout]);
  useLayoutEffect(() => {
    // An untouched built-in preset (first launch, or nothing moved since) is fitted to this
    // workspace's height; anything the user arranged is left exactly where they put it.
    const el = wsRef.current;
    if (el && PRESETS.some(p => p.id === state.preset) && JSON.stringify(state.windows) === JSON.stringify(presetLayout(state.preset)))
      // From the preset itself, not s.windows: StrictMode runs this twice, and scaling the already
      // scaled layout again squeezed it twice over.
      setState(s => PRESETS.some(p => p.id === s.preset) ? { ...s, windows: fitToHeight(presetLayout(s.preset), el.clientHeight) } : s);
    doRescue();
  }, [doRescue]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    window.addEventListener("resize", doRescue);
    return () => window.removeEventListener("resize", doRescue);
  }, [doRescue]);

  // ── Window operations ─────────────────────────────────────────────────────────────────────────
  const focus = useCallback((id) => setLayout(l => bringToFront(l, id)), [setLayout]);
  const toggle = (id) => setLayout(l => {
    const w = l[id];
    if (w.open && !w.detached) return { ...l, [id]: { ...w, open: false } };
    return bringToFront({ ...l, [id]: { ...w, open: true, detached: false } }, id);
  });
  const close = useCallback((id) => setLayout(l => ({ ...l, [id]: { ...l[id], open: false } })), [setLayout]);
  const popOutLocal = useCallback((id) => setLayout(l => ({ ...l, [id]: { ...l[id], detached: true } })), [setLayout]);
  const popOut = onPopOut ?? popOutLocal;
  const dock = (id) => { onDock?.(id); setLayout(l => bringToFront({ ...l, [id]: { ...l[id], detached: false, open: true } }, id)); };

  // Drags are measured from the rect the gesture started at (see DeskWindow).
  const dragStart = useRef({});
  const opts = { grid: state.snapGrid, windows: state.snapWindows };
  const optsRef = useRef(opts); optsRef.current = opts;
  // Kept out of the state updaters on purpose: StrictMode runs updaters twice, and one that deletes
  // the start rect would find it already gone on the second run.
  const onDragStart = useCallback((id) => { dragStart.current[id] = { ...layoutRef.current[id] }; }, []);
  const onDrag = useCallback((id, kind, edges, dx, dy) => setLayout(l => {
    const s = dragStart.current[id]; if (!s) return l;
    const r = kind === "move" ? { ...snapMove(l, id, s.x + dx, s.y + dy, optsRef.current), w: s.w, h: s.h }
                              : snapResize(l, id, s, edges, dx, dy, optsRef.current);
    const w = l[id];
    if (r.x === w.x && r.y === w.y && r.w === w.w && r.h === w.h) return l;
    return { ...l, [id]: { ...w, ...r } };
  }, { preset: null }), [setLayout]);
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
  }, { preset: null }), [setLayout]);

  const applyPreset = (id) => {
    const h = wsRef.current?.clientHeight;
    setState(s => ({ ...s, windows: fitToHeight(presetLayout(id), h), preset: id }));
    requestAnimationFrame(doRescue);
  };
  const applyNamed = (name) => {
    setState(s => s.named[name] ? { ...s, windows: cleanLayout(s.named[name]), preset: `named:${name}` } : s);
    requestAnimationFrame(doRescue);
  };
  const [naming, setNaming] = useState(null);   // the "Save layout as…" field's text, or null when closed
  const saveNamed = () => {
    const name = (naming ?? "").trim();
    if (!name) { setNaming(null); return; }
    setState(s => ({ ...s, named: { ...s.named, [name]: s.windows }, preset: `named:${name}` }));
    setNaming(null);
  };
  const deleteNamed = (name) => setState(s => {
    const named = { ...s.named }; delete named[name];
    return { ...s, named, preset: s.preset === `named:${name}` ? null : s.preset };
  });
  const setFlag = (k) => setState(s => ({ ...s, [k]: !s[k] }));

  const top = Math.max(...Object.values(layout).filter(w => w.open && !w.detached).map(w => w.z), 0);
  const size = canvasSize(layout);
  const detached = WINDOWS.filter(w => layout[w.id].detached && layout[w.id].open);

  return (
    <>
      {/* Workspace. Which windows are open is the header's Windows menu (toggleWindow). */}
      <div ref={wsRef} style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative",
                                backgroundImage: state.snapGrid ? `radial-gradient(${C.border} 1px, transparent 1px)` : "none",
                                backgroundSize: `${GRID * 2}px ${GRID * 2}px`, backgroundAttachment: "local" }}>
        <div style={{ position: "relative", width: size.w, height: size.h, minWidth: "100%", minHeight: "100%" }}>
          {WINDOWS.map(w => {
            const g = layout[w.id];
            if (!g.open || g.detached) return null;
            return (
              <DeskWindow key={w.id} id={w.id} title={windowTitle?.(w.id) ?? t(w.title)} rect={g} z={g.z} focused={g.z === top} locked={state.locked}
                onFocus={focus} onDragStart={onDragStart} onDrag={onDrag} onDragEnd={onDragEnd} onDragCancel={onDragCancel}
                onKeyNudge={onKeyNudge} onClose={close} onPopOut={popOut} extra={windowExtra?.(w.id)}>
                {renderWindow(w.id)}
              </DeskWindow>
            );
          })}
        </div>
      </div>

      {/* Status bar */}
      <footer style={{ height: 30, flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "0 12px",
                       background: C.surface, borderTop: `1px solid ${C.border}`, overflowX: "auto" }}>
        <SectionLabel>{t("Detached")}</SectionLabel>
        {detached.length
          ? detached.map(w => <Chip key={w.id} pressed={false} onClick={() => dock(w.id)} title={t("Dock")}>{t(w.title)}</Chip>)
          : <span style={{ fontSize: 11.5, color: C.textMid, whiteSpace: "nowrap" }}>{t("None. Pop a window out to send it to another monitor.")}</span>}
        <span style={{ flex: 1 }} />
        <SectionLabel>{t("Layout")}</SectionLabel>
        {PRESETS.map(p => <Chip key={p.id} on={state.preset === p.id} onClick={() => applyPreset(p.id)}>{t(p.title)}</Chip>)}
        {Object.keys(state.named).map(name => (
          <span key={name} style={{ display: "inline-flex", alignItems: "center" }}>
            <Chip on={state.preset === `named:${name}`} onClick={() => applyNamed(name)}>{name}</Chip>
            <button type="button" aria-label={t("Delete layout {name}", { name })} title={t("Delete layout {name}", { name })} onClick={() => deleteNamed(name)}
              style={{ border: "none", background: "none", color: C.textMute, cursor: "pointer", fontSize: 13, padding: "0 2px" }}>×</button>
          </span>
        ))}
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
