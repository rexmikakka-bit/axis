import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { C } from "../theme.js";
import { Dialog } from "./kit.jsx";

// The desktop's right-click menu: opens at the pointer, kept inside the window, closes on a pick, an
// outside click, Escape, or the window losing focus. Items are {label, onSelect, disabled?, hint?,
// danger?, checked?} or {divider:true} or {heading}.

export function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) });
  }, [x, y]);
  useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", onClose);
    return () => { document.removeEventListener("pointerdown", down, true); window.removeEventListener("keydown", key); window.removeEventListener("blur", onClose); };
  }, [onClose]);
  return (
    <div ref={ref} role="menu" onContextMenu={e => e.preventDefault()}
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 700, minWidth: 210, padding: 4, background: C.surface, border: `1px solid ${C.borderStrong}`,
               borderRadius: 7, boxShadow: "0 10px 28px rgba(0,0,0,.5)", lineHeight: 1.3 }}>
      {items.filter(Boolean).map((it, i) => {
        if (it.divider) return <div key={i} style={{ height: 1, background: C.border, margin: "4px 6px" }} />;
        if (it.heading) return <div key={i} style={{ padding: "5px 10px 2px", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid }}>{it.heading}</div>;
        return (
          <button key={i} type="button" role="menuitem" disabled={it.disabled}
            onClick={() => { onClose(); it.onSelect?.(); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "none", borderRadius: 5, background: "transparent",
                     color: it.disabled ? C.textMute : it.danger ? C.danger : C.text, fontSize: 13, textAlign: "left", cursor: it.disabled ? "default" : "pointer" }}
            onMouseEnter={e => { if (!it.disabled) e.currentTarget.style.background = C.surfaceAlt; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
            <span style={{ width: 12, color: C.accent }}>{it.checked ? "●" : ""}</span>
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.hint && <span style={{ fontSize: 11.5, color: C.textMid }}>{it.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A frame with BottomSheet's props, drawn as a desktop dialog: hands phone sheets a desktop home. */
export function DialogFrame({ title, onClose, children }) {
  return <Dialog title={title} onClose={onClose} width={640}>{children}</Dialog>;
}
