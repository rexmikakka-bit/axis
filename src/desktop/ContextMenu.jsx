import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C } from "../theme.js";
import { Dialog } from "./kit.jsx";
import { useInspect } from "./inspect-context.jsx";

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
  // Portalled for the same reason as kit.jsx Dialog: a docked window's menu must not open under an item window.
  return createPortal(
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
    </div>,
    document.body,
  );
}

/**
 * The desktop list-row mouse model, for windows with one selection at a time (Implants, Drones,
 * Boosters, Cargo, the Market list): left click selects, double click does the row's main action,
 * right click selects and opens a menu. `rowProps(key, {onOpen, items, target})` spreads onto the row
 * (`target`, an inspect.js target, also becomes the app-wide selection the item windows follow);
 * `view` renders the open menu. The Fitting table has its own multi-select version (FitTable.jsx).
 */
export function useRowSelect() {
  const [sel, setSel] = useState(null);
  const [menu, setMenu] = useState(null);
  const { select } = useInspect();
  const rowProps = (key, { onOpen, items, target } = {}) => {
    const on = sel === key;
    return {
      "aria-selected": on,
      className: "no-select",
      onClick: () => { setSel(key); if (target) select(target); },
      onDoubleClick: onOpen ? (e) => { if (!e.target.closest("input, button, select")) onOpen(); } : undefined,
      onContextMenu: items ? (e) => { e.preventDefault(); setSel(key); if (target) select(target); setMenu({ x: e.clientX, y: e.clientY, items: typeof items === "function" ? items() : items }); } : undefined,
      style: { cursor: "default", background: on ? C.accentLight : "transparent", boxShadow: on ? `inset 2px 0 0 ${C.accent}` : "none" },
      onMouseEnter: (e) => { if (!on) e.currentTarget.style.background = C.surfaceAlt; },
      onMouseLeave: (e) => { e.currentTarget.style.background = on ? C.accentLight : "transparent"; },
    };
  };
  // On the list's container: clicking a row focuses it, so Delete / Escape act on this window only.
  const listProps = ({ onDelete } = {}) => ({
    tabIndex: -1,
    onKeyDown: (e) => {
      if (e.target.tagName === "INPUT") return;
      if ((e.key === "Delete" || e.key === "Backspace") && sel != null && onDelete) { e.preventDefault(); onDelete(sel); setSel(null); }
      if (e.key === "Escape") setSel(null);
    },
    style: { outline: "none" },
  });
  const view = menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />;
  return { sel, setSel, rowProps, listProps, view };
}

/**
 * BottomSheet's props, drawn as a desktop dialog. Provided app-wide through ui.jsx's SheetFrame, so
 * every phone sheet (pickers, info, variations) opens centred instead of rising from the bottom.
 * `headerExtra` / `footerExtra` keep their places; `dismissRequested` (the module picker's "rack is
 * full, close yourself") closes it; a full-height sheet gets a tall dialog.
 */
export function DialogFrame({ title, onClose, children, headerExtra, footerExtra, dismissRequested, fillHeight, height }) {
  useEffect(() => { if (dismissRequested) onClose?.(); }, [dismissRequested]);   // eslint-disable-line react-hooks/exhaustive-deps
  const tall = fillHeight || height === "100vh" || height === "88vh";
  return (
    <Dialog title={title} onClose={onClose} width={tall ? 720 : 640}>
      <div style={{ display: "flex", flexDirection: "column", minHeight: tall ? "70vh" : undefined, maxHeight: "calc(100vh - 150px)" }}>
        {headerExtra && <div style={{ flex: "none" }}>{headerExtra}</div>}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{children}</div>
        {footerExtra && <div style={{ flex: "none" }}>{footerExtra}</div>}
      </div>
    </Dialog>
  );
}
