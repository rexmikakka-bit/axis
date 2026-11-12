import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C } from "../theme.js";
import { Dialog } from "./kit.jsx";
import { useInspect } from "./inspect-context.jsx";

// The desktop's right-click menu: opens at the pointer, kept inside the window, closes on a pick, an
// outside click, Escape, or the window losing focus. Items are {label, onSelect, disabled?, hint?,
// danger?, checked?, icon?, submenu?} or {divider:true} or {heading}. An item with a `submenu` (items
// of the same shape) opens it beside itself on hover or click, flipping left at the screen's edge —
// pyfa's Charge ▸ Depleted Uranium ▸ Republic Fleet. `icon` is an image URL drawn before the label.

// One column of the menu. Submenus are drawn INSIDE the root's element (fixed-positioned), so a click
// in one is not an "outside" click that closes the whole menu.
function Panel({ x, y, items, onClose, depth = 0, flipFrom = null }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y, ready: false });
  const [sub, setSub] = useState(null);   // {index, x, y, left}: the open submenu and where it hangs
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    // A submenu that would run off the right edge opens to the left of its parent item instead.
    const nx = depth > 0 && x + r.width > window.innerWidth - 4 && flipFrom != null ? flipFrom - r.width : x;
    setPos({ x: Math.max(4, Math.min(nx, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)), ready: true });
  }, [x, y, depth, flipFrom]);
  const openSub = (i, el) => { const r = el.getBoundingClientRect(); setSub({ index: i, x: r.right + 2, y: r.top - 5, left: r.left - 2 }); };
  const list = items.filter(Boolean);
  return (
    <div ref={depth === 0 ? undefined : ref} role="menu" onContextMenu={e => e.preventDefault()}
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 700 + depth, minWidth: depth ? 190 : 210, maxHeight: "calc(100vh - 8px)", overflowY: "auto", padding: 4,
               background: C.surface, border: `1px solid ${C.borderStrong}`, borderRadius: 7, boxShadow: "0 10px 28px rgba(0,0,0,.5)", lineHeight: 1.3,
               visibility: depth && !pos.ready ? "hidden" : "visible" }}
      {...(depth === 0 ? { "data-root": true } : {})}>
      {depth === 0 && <span ref={ref} style={{ display: "none" }} />}
      {list.map((it, i) => {
        if (it.divider) return <div key={i} style={{ height: 1, background: C.border, margin: "4px 6px" }} />;
        if (it.heading) return <div key={i} style={{ padding: "5px 10px 2px", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid }}>{it.heading}</div>;
        const hasSub = Array.isArray(it.submenu) && it.submenu.length > 0, open = sub?.index === i;
        return (
          <button key={i} type="button" role="menuitem" aria-haspopup={hasSub ? "menu" : undefined} aria-expanded={hasSub ? open : undefined} disabled={it.disabled}
            onClick={(e) => { if (hasSub) { openSub(i, e.currentTarget); return; } onClose(); it.onSelect?.(); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "none", borderRadius: 5,
                     background: open ? C.surfaceAlt : "transparent",
                     color: it.disabled ? C.textMute : it.danger ? C.danger : C.text, fontSize: 13, textAlign: "left", cursor: it.disabled ? "default" : "pointer" }}
            onMouseEnter={e => { if (it.disabled) return; e.currentTarget.style.background = C.surfaceAlt; if (hasSub) openSub(i, e.currentTarget); else setSub(null); }}
            onMouseLeave={e => { if (!open) e.currentTarget.style.background = "transparent"; }}>
            <span style={{ width: 12, color: C.accent, flex: "none" }}>{it.checked ? "●" : ""}</span>
            {it.icon && <img className="eve-icon" src={it.icon} width={18} height={18} alt="" style={{ flex: "none" }} onError={ev => { ev.target.style.visibility = "hidden"; }} />}
            <span style={{ flex: 1, whiteSpace: "nowrap" }}>{it.label}</span>
            {it.hint && <span style={{ fontSize: 11.5, color: C.textMid, whiteSpace: "nowrap" }}>{it.hint}</span>}
            {hasSub && <span aria-hidden="true" style={{ color: C.textMid, fontSize: 11, flex: "none" }}>›</span>}
          </button>
        );
      })}
      {sub && list[sub.index]?.submenu && <Panel key={sub.index} x={sub.x} y={sub.y} flipFrom={sub.left} items={list[sub.index].submenu} onClose={onClose} depth={depth + 1} />}
    </div>
  );
}

export function ContextMenu({ x, y, items, onClose }) {
  const root = useRef(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const el = root.current?.firstElementChild; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) });
  }, [x, y]);
  useEffect(() => {
    const down = (e) => { if (!root.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", onClose);
    return () => { document.removeEventListener("pointerdown", down, true); window.removeEventListener("keydown", key); window.removeEventListener("blur", onClose); };
  }, [onClose]);
  // Portalled for the same reason as kit.jsx Dialog: a docked window's menu must not open under an item window.
  return createPortal(<div ref={root} style={{ display: "contents" }}><Panel x={pos.x} y={pos.y} items={items} onClose={onClose} /></div>, document.body);
}

/**
 * The desktop list-row mouse model, for windows with one selection at a time (Implants, Drones,
 * Boosters, Cargo, the Market list): left click selects, double click does the row's main action,
 * right click selects and opens a menu. `rowProps(key, {onOpen, items, target, repeat})` spreads onto the row
 * (`target`, an inspect.js target, also becomes the app-wide selection the item windows follow);
 * `view` renders the open menu. The Fitting table has its own multi-select version (FitTable.jsx).
 */
export function useRowSelect() {
  const [sel, setSel] = useState(null);
  const [menu, setMenu] = useState(null);
  const { select } = useInspect();
  // `repeat`: every further pair of fast clicks repeats the action, so six quick clicks on a Browser
  // module fit three of it. A browser sends ONE dblclick for a run of fast clicks (only when the click
  // count reaches 2), so this counts the clicks themselves: the 2nd, 4th, 6th... For rows whose action
  // ADDS and leaves the row in place. A removing row keeps plain double-click: the next row slides
  // under the pointer, and a third and fourth click would remove a different item.
  const rowProps = (key, { onOpen, items, target, repeat = false } = {}) => {
    const on = sel === key;
    const free = (e) => !e.target.closest("input, button, select");
    return {
      "aria-selected": on,
      className: "no-select",
      onClick: (e) => { setSel(key); if (target) select(target); if (repeat && onOpen && e.detail >= 2 && e.detail % 2 === 0 && free(e)) onOpen(); },
      onDoubleClick: onOpen && !repeat ? (e) => { if (free(e)) onOpen(); } : undefined,
      onContextMenu: items ? (e) => { e.preventDefault(); e.stopPropagation(); setSel(key); if (target) select(target); setMenu({ x: e.clientX, y: e.clientY, items: typeof items === "function" ? items() : items }); } : undefined,
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
  // A picker opened from "+ Booster", "+ Fit", Cargo's "+ Add"… is for typing into: its search box
  // gets the cursor straight away (Owen). The FIRST text field, whichever sheet it is; a sheet with
  // none is left alone. After the frame, so the field exists and the dialog has taken focus.
  const bodyRef = useRef(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = bodyRef.current?.querySelector('input:not([type]), input[type="text"], input[type="search"]');
      if (el && !el.disabled && !el.readOnly) el.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <Dialog title={title} onClose={onClose} width={tall ? 720 : 640}>
      <div ref={bodyRef} style={{ display: "flex", flexDirection: "column", minHeight: tall ? "70vh" : undefined, maxHeight: "calc(100vh - 150px)" }}>
        {headerExtra && <div style={{ flex: "none" }}>{headerExtra}</div>}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{children}</div>
        {footerExtra && <div style={{ flex: "none" }}>{footerExtra}</div>}
      </div>
    </Dialog>
  );
}
