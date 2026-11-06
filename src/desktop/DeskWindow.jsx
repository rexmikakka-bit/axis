import { useEffect, useRef, useState } from "react";
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

// A window's tab, for a window holding several (layout.js tab groups). Click shows it; drag it along
// the strip to reorder; drag it clear of the title bar to make it a window of its own (or onto another
// window's title bar to move it there); right-click for the same as a menu; × closes just that one.
// Under Lock layout a tab still reorders — nothing moves or resizes — but it cannot be pulled out.
const TEAR_PX = 8;
function Tab({ id, title, on, locked, onSelect, onClose, onOut, onMenu, onSlide, onSlideEnd }) {
  const press = useRef(null);
  const [tearing, setTearing] = useState(false);
  const down = (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    e.stopPropagation();
    press.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
  };
  const move = (e) => {
    const p = press.current; if (!p) return;
    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= TEAR_PX) { p.moved = true; setTearing(true); }
    if (p.moved) onSlide?.(id, e.clientX, e.clientY);
  };
  const up = (e) => {
    const p = press.current; press.current = null; setTearing(false);
    if (!p) return;
    if (!p.moved) { onSelect(id); return; }
    // Released on its own title bar: a new place in the strip. Anywhere else: out of the group.
    const bar = e.currentTarget.closest("[data-titlebar]")?.getBoundingClientRect();
    if (bar && e.clientX >= bar.left && e.clientX <= bar.right && e.clientY >= bar.top && e.clientY <= bar.bottom) { onSlideEnd?.(id, true); return; }
    onSlideEnd?.(id, false);
    if (!locked) onOut(id, e.clientX, e.clientY);
  };
  return (
    <div role="tab" data-tab data-tabid={id} aria-selected={on} title={locked ? `${title} · ${t("drag along the strip to reorder")}` : `${title} · ${t("drag to reorder, or out to separate")}`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { press.current = null; setTearing(false); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onMenu(e, id); }}
      style={{ display: "flex", alignItems: "center", gap: 4, height: TITLE_H - 6, padding: "0 4px 0 9px", borderRadius: 5, minWidth: 0, flex: "0 1 auto",
               cursor: locked ? "pointer" : tearing ? "grabbing" : "pointer", touchAction: "none",
               background: on ? C.surface : "transparent", border: `1px solid ${on ? C.borderStrong : "transparent"}`,
               outline: tearing ? `1px dashed ${C.accent}` : "none", opacity: tearing ? 0.7 : 1 }}>
      <span style={{ fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", color: on ? C.text : C.textMid,
                     whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
      <button type="button" aria-label={t("Close {title}", { title })} title={t("Close {title}", { title })} onClick={(e) => { e.stopPropagation(); onClose(id); }}
        style={{ width: 16, height: 16, padding: 0, border: "none", borderRadius: 3, background: "transparent", color: C.textMute, cursor: "pointer", fontSize: 12, lineHeight: 1 }}>×</button>
    </div>
  );
}

// `tabs` ([{id, title}], two or more) draws a tab strip in place of the title; `activeTab` is the one
// shown. `collapsed` draws the title bar alone. `dropTarget` lights the title bar while another
// window is dragged over it (dropping there combines the two).
export default function DeskWindow({ id, title, rect, z, focused, locked, floating = false, onFocus, onDragStart, onDrag, onDragEnd,
                                     onDragCancel, onKeyNudge, onClose, onPopOut, extra, children,
                                     tabs = null, activeTab, onTab, onCloseTab, onTabOut, onTabMenu, onTabMove, collapsed = false, onToggleCollapse, dropTarget = false, ghost = false }) {
  const drag = useRef(null);

  // Reordering tabs: while one is dragged along the strip, `slot` is where it would land (an index
  // into the strip WITHOUT it) and an accent bar marks the spot; releasing on the bar puts it there.
  const strip = useRef(null);
  const [slot, setSlot] = useState(null);   // {id, index, x}
  const slide = (tabId, cx, cy) => {
    const el = strip.current; if (!el) return;
    const box = el.getBoundingClientRect();
    if (cy < box.top - 6 || cy > box.bottom + 6) { setSlot(null); return; }   // off the strip: it is being pulled out
    const others = [...el.querySelectorAll("[data-tab]")].filter(n => n.dataset.tabid !== tabId);
    let index = others.length, x = others.length ? others[others.length - 1].getBoundingClientRect().right - box.left : 0;
    for (let i = 0; i < others.length; i++) {
      const r = others[i].getBoundingClientRect();
      if (cx < r.left + r.width / 2) { index = i; x = r.left - box.left - 2; break; }
    }
    setSlot(cur => (cur?.id === tabId && cur.index === index ? cur : { id: tabId, index, x }));
  };
  const slideEnd = (tabId, inBar) => { const sl = slot; setSlot(null); if (inBar && sl?.id === tabId) onTabMove?.(tabId, sl.index); };

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
    if (kind === "move" && e.target.closest("button,input,select,textarea,[data-tab]")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind, edges, px: e.clientX, py: e.clientY, pointerId: e.pointerId, el: e.currentTarget };
    onDragStart(id);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    onDrag(id, d.kind, d.edges, e.clientX - d.px, e.clientY - d.py, e.clientX, e.clientY);
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
      style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: collapsed ? TITLE_H : rect.h, zIndex: z,
               display: "flex", flexDirection: "column", boxSizing: "border-box", background: C.surface,
               // See-through while held over another title bar, so the "drop to add as a tab" under it shows.
               opacity: ghost ? 0.45 : 1,
               border: `1px solid ${border}`, borderRadius: 6,
               // An inspector floats over the workspace, and its shadow is what says so.
               boxShadow: floating ? "0 14px 40px rgba(0,0,0,.6), 0 2px 6px rgba(0,0,0,.4)" : "0 4px 16px rgba(0,0,0,.45)" }}>
      <div data-titlebar tabIndex={0} onKeyDown={onTitleKey} {...pointer("move", "")}
        onDoubleClick={(e) => { if (!floating && onToggleCollapse && !e.target.closest("button,input,select,textarea,[data-tab]")) onToggleCollapse(id); }}
        aria-label={t("{title} window. Arrow keys move it, Shift and arrow keys resize it.", { title })}
        style={{ height: TITLE_H, flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "0 4px 0 10px",
                 background: dropTarget ? C.accentLight : C.surfaceAlt, borderBottom: `1px solid ${dropTarget ? C.accent : C.border}`,
                 borderRadius: collapsed ? 5 : "5px 5px 0 0", boxShadow: dropTarget ? `inset 0 0 0 1px ${C.accent}` : "none",
                 color: C.textMute, cursor: locked ? "default" : "grab", userSelect: "none", touchAction: "none", outline: "none" }}>
        <Grip />
        {tabs?.length > 1
          ? <div ref={strip} role="tablist" style={{ position: "relative", display: "flex", alignItems: "center", gap: 2, minWidth: 0, overflow: "hidden", flex: "0 1 auto" }}>
              {tabs.map(tb => <Tab key={tb.id} id={tb.id} title={tb.title} on={tb.id === activeTab} locked={locked}
                onSelect={onTab} onClose={onCloseTab} onOut={onTabOut} onMenu={onTabMenu} onSlide={slide} onSlideEnd={slideEnd} />)}
              {slot && <span aria-hidden="true" style={{ position: "absolute", left: Math.max(0, slot.x), top: 3, bottom: 3, width: 2, borderRadius: 1, background: C.accent }} />}
            </div>
          /* An inspector is titled with an item name, which reads as a name only in its own case. */
          : <span style={floating ? { fontSize: 13, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } : { fontSize: 12, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid,
                       whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>}
        <span style={{ flex: 1 }} />
        {dropTarget && <span style={{ fontSize: 11.5, color: C.accent, whiteSpace: "nowrap" }}>{t("Drop to add as a tab")}</span>}
        {extra}
        {!floating && onToggleCollapse && <TitleButton label={collapsed ? t("Expand") : t("Collapse")} onClick={() => onToggleCollapse(id)}>
          <span style={{ fontSize: 10, display: "inline-block", transform: collapsed ? "rotate(-90deg)" : "none" }}>▾</span></TitleButton>}
        <TitleButton label={t("Pop out")} onClick={() => onPopOut(activeTab ?? id)}><PopOutGlyph /></TitleButton>
        <TitleButton label={t("Close")} onClick={() => onClose(id)}>×</TitleButton>
      </div>
      {/* lineHeight 1.3: the root's 145% is inherited as a fixed 26px, which made every line of the
          phone components hosted here as tall as a touch target whatever its font size. */}
      {/* Hidden, not unmounted, while collapsed: what the window holds (a scroll position, a half-typed
          search) is still there when it opens again. */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", borderRadius: "0 0 5px 5px", lineHeight: 1.3, display: collapsed ? "none" : undefined }}>{children}</div>
      {!locked && !collapsed && HANDLES.map(h => (
        <div key={h.edges} aria-hidden="true" {...pointer("resize", h.edges)}
          style={{ position: "absolute", ...h.style, cursor: h.cursor, touchAction: "none" }} />
      ))}
      {!locked && !collapsed && (
        <div aria-hidden="true" {...pointer("resize", "rb")}
          style={{ position: "absolute", right: 0, bottom: 0, width: CORNER, height: CORNER, cursor: "nwse-resize", touchAction: "none",
                   display: "grid", placeItems: "end", padding: 2, boxSizing: "border-box", color: C.textMute }}>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1"><path d="M7 1 1 7M7 4 4 7" /></svg>
        </div>
      )}
    </section>
  );
}
