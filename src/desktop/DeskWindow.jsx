import { useEffect, useRef } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { TITLE_H, GRID } from "./layout.js";

// One workspace window: title bar, body, and the resize edges. Geometry lives in the parent; this
// only turns pointer and key input into `onDrag(kind, edges, dx, dy)` calls against the rect the
// gesture started from, so a drag is always measured from where it began rather than accumulated
// move by move (accumulating drifts once snapping starts rounding the intermediate steps).
//
// Pointer capture keeps a drag alive when the cursor leaves the window or the workspace, which the
// mockup could only approximate by ending drags on `buttons === 0`.

const EDGE = 6, TOP_EDGE = 4, CORNER = 14;
const HANDLES = [
  { edges: "l", style: { left: -EDGE / 2, top: 0, bottom: 0, width: EDGE }, cursor: "ew-resize" },
  { edges: "r", style: { right: -EDGE / 2, top: 0, bottom: 0, width: EDGE }, cursor: "ew-resize" },
  { edges: "b", style: { bottom: -EDGE / 2, left: 0, right: 0, height: EDGE }, cursor: "ns-resize" },
  { edges: "t", style: { top: -TOP_EDGE / 2, left: 0, right: 0, height: TOP_EDGE }, cursor: "ns-resize" },
];

const Grip = () => (
  <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true" style={{ flex: "none" }}>
    {[2, 6].map(x => [2, 6, 10].map(y => <circle key={`${x}${y}`} cx={x} cy={y} r="1" fill="currentColor" />))}
  </svg>
);
const PopOutGlyph = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2">
    <path d="M6.5 1.5h3v3M9.5 1.5 5 6M8 6.5v3h-6.5v-6.5h3" />
  </svg>
);

export function TitleButton({ label, onClick, children }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      style={{ width: 22, height: 22, display: "grid", placeItems: "center", padding: 0, border: "none", borderRadius: 4,
               background: "transparent", color: C.textMute, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>
      {children}
    </button>
  );
}

export default function DeskWindow({ id, title, rect, z, focused, locked, onFocus, onDragStart, onDrag, onDragEnd,
                                     onDragCancel, onKeyNudge, onClose, onPopOut, extra, children }) {
  const drag = useRef(null);

  // Escape cancels a drag in progress, putting the window back where the gesture started.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || !drag.current) return;
      const d = drag.current; drag.current = null;
      try { d.el.releasePointerCapture(d.pointerId); } catch { /* already released */ }
      onDragCancel(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, onDragCancel]);

  const begin = (kind, edges) => (e) => {
    if (e.button !== 0) return;
    onFocus(id);
    if (locked) return;
    // Buttons in the title bar (pop-out, close, "+ Add") must not start a drag.
    if (kind === "move" && e.target.closest("button,input,select,textarea")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind, edges, px: e.clientX, py: e.clientY, pointerId: e.pointerId, el: e.currentTarget };
    onDragStart(id);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    onDrag(id, d.kind, d.edges, e.clientX - d.px, e.clientY - d.py);
  };
  const end = (e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    onDragEnd(id);
  };
  const pointer = (kind, edges) => ({ onPointerDown: begin(kind, edges), onPointerMove: move, onPointerUp: end, onPointerCancel: end });

  // Keyboard path: focus the title bar, arrows move one grid step (Alt: one pixel), Shift+arrows
  // resize from the bottom-right corner.
  const onTitleKey = (e) => {
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!k || locked) return;
    e.preventDefault();
    const step = e.altKey ? 1 : GRID;
    onKeyNudge(id, e.shiftKey ? "resize" : "move", k[0] * step, k[1] * step);
  };

  const border = focused ? C.accent : C.borderStrong;
  return (
    <section role="group" aria-label={title} onPointerDownCapture={() => onFocus(id)}
      style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: z,
               display: "flex", flexDirection: "column", boxSizing: "border-box", background: C.surface,
               border: `1px solid ${border}`, borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,.45)" }}>
      <div tabIndex={0} onKeyDown={onTitleKey} {...pointer("move", "")}
        aria-label={t("{title} window. Arrow keys move it, Shift and arrow keys resize it.", { title })}
        style={{ height: TITLE_H, flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "0 4px 0 10px",
                 background: C.surfaceAlt, borderBottom: `1px solid ${C.border}`, borderRadius: "5px 5px 0 0",
                 color: C.textMute, cursor: locked ? "default" : "grab", userSelect: "none", touchAction: "none", outline: "none" }}>
        <Grip />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid,
                       whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
        <span style={{ flex: 1 }} />
        {extra}
        <TitleButton label={t("Pop out")} onClick={() => onPopOut(id)}><PopOutGlyph /></TitleButton>
        <TitleButton label={t("Close")} onClick={() => onClose(id)}>×</TitleButton>
      </div>
      {/* lineHeight 1.3: the root's 145% is inherited as a fixed 26px, which made every line of the
          phone components hosted here as tall as a touch target whatever its font size. */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", borderRadius: "0 0 5px 5px", lineHeight: 1.3 }}>{children}</div>
      {!locked && HANDLES.map(h => (
        <div key={h.edges} aria-hidden="true" {...pointer("resize", h.edges)}
          style={{ position: "absolute", ...h.style, cursor: h.cursor, touchAction: "none" }} />
      ))}
      {!locked && (
        <div aria-hidden="true" {...pointer("resize", "rb")}
          style={{ position: "absolute", right: 0, bottom: 0, width: CORNER, height: CORNER, cursor: "nwse-resize", touchAction: "none",
                   display: "grid", placeItems: "end", padding: 2, boxSizing: "border-box", color: C.textMute }}>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1"><path d="M7 1 1 7M7 4 4 7" /></svg>
        </div>
      )}
    </section>
  );
}
