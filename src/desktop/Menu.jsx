import { useEffect, useRef, useState } from "react";
import { C } from "../theme.js";
import { ContextMenu } from "./ContextMenu.jsx";

// A header dropdown: a button that opens a list beneath it. Closes on a pick, an outside click or
// Escape. Items are {label, onSelect, checked?, disabled?, hint?} or {divider:true} or {heading}.
// Checkable items (the Windows list) leave the menu open, so several can be toggled in one visit.
// An item's `context` ([{label, onSelect}]) is its right-click menu (the Windows list's "Pop out").

export default function Menu({ label, items, align = "right", ariaLabel, buttonStyle }) {
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState(null);   // {x, y, items}: an item's right-click menu
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const down = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down, true); window.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={ariaLabel} onClick={() => setOpen(o => !o)}
        style={{ height: 28, padding: "0 10px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
                 display: "flex", alignItems: "center", gap: 6,
                 background: open ? C.surfaceAlt : "transparent", border: `1px solid ${open ? C.borderStrong : "transparent"}`, color: C.text, ...buttonStyle }}>
        {label}
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", top: "calc(100% + 4px)", [align]: 0, zIndex: 400, minWidth: 220, maxHeight: "70vh", overflowY: "auto",
                                  background: C.surface, border: `1px solid ${C.borderStrong}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.45)", padding: 4 }}>
          {items.filter(Boolean).map((it, i) => {
            if (it.divider) return <div key={i} style={{ height: 1, background: C.border, margin: "4px 6px" }} />;
            if (it.heading) return <div key={i} style={{ padding: "6px 10px 2px", fontSize: 11.5, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid }}>{it.heading}</div>;
            const checkable = it.checked !== undefined;
            return (
              <button key={i} type="button" role={checkable ? "menuitemcheckbox" : "menuitem"} aria-checked={checkable ? !!it.checked : undefined}
                disabled={it.disabled} onClick={() => { it.onSelect?.(); if (!checkable) setOpen(false); }}
                onContextMenu={it.context ? (e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, items: it.context.map(c => ({ ...c, onSelect: () => { setOpen(false); c.onSelect?.(); } })) }); } : undefined}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "none", borderRadius: 5,
                         background: "transparent", color: it.disabled ? C.textMute : C.text, fontSize: 13.5, textAlign: "left",
                         cursor: it.disabled ? "default" : "pointer" }}
                onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = C.surfaceAlt; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                {checkable && <span aria-hidden="true" style={{ width: 14, color: C.accent, fontWeight: 700 }}>{it.checked ? "✓" : ""}</span>}
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.hint && <span style={{ fontSize: 12, color: C.textMid }}>{it.hint}</span>}
              </button>
            );
          })}
        </div>
      )}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </div>
  );
}
