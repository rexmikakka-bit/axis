import { createContext, useContext, useRef, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { currentDrag, draggedItem, isItemDrag, currentFitDrag, draggedFit, isFitDrag } from "./items.js";

// The app's item operations (items.js addItem with this window's session, stats and Fitting
// window wired in), for any window to add to or take drops for. Provided by DesktopApp's
// useWindowContents, so a popped-out window gets one too.
//
// value: {add(item, to?, extra?), accepts(to, item), browse(to, {slot}?), hasFighters}

const NOOP = { add: () => null, accepts: () => false, browse: () => {}, hasFighters: false };
export const ItemsContext = createContext(NOOP);
export const useItems = () => useContext(ItemsContext);

/**
 * Make a window (or a row) a drop target for browser items. `to` is the destination ("drones",
 * "cargo", ...); `extra` goes to addItem (a row passes `only` to load a charge into itself).
 * Returns {props, over, ok}: spread props on the element; `over` is true while an item hovers, `ok`
 * whether that item would be taken. Drags that are not items (files, text) are left alone.
 */
export function useItemDrop(to, extra) {
  const items = useItems();
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  // No remembered item means the drag started in another OS window (a popped-out Browser), whose
  // module state this window cannot see: let it over, and judge it at drop time from the payload.
  const okFor = () => { const it = currentDrag(); return !it || items.accepts(to, it); };
  const props = {
    onDragEnter: (e) => { if (!isItemDrag(e)) return; depth.current++; setOver(true); },
    onDragLeave: (e) => { if (!isItemDrag(e)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); },
    onDragOver: (e) => {
      if (!isItemDrag(e)) return;
      // An inner target (a module row) claims the drop first; the window under it then stays quiet.
      if (e.defaultPrevented) return;
      if (okFor()) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } else e.dataTransfer.dropEffect = "none";
    },
    onDrop: (e) => {
      depth.current = 0; setOver(false);
      if (!isItemDrag(e) || e.defaultPrevented) return;
      const it = draggedItem(e);
      if (!it || !items.accepts(to, it)) return;
      e.preventDefault();
      items.add(it, to, extra);
    },
  };
  return { props, over, ok: over && okFor() };
}

/**
 * A drop target for saved fits dragged from the ship browser (Projected, Command). `accept(ship,
 * fitName)` decides, `onDrop(ship, fitName)` adds. Same {props, over, ok} as useItemDrop, so the
 * same DropHint draws it.
 */
export function useFitDrop(accept, onDrop) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const okFor = () => { const f = currentFitDrag(); return !f || accept(f.ship, f.fitName); };
  const props = {
    onDragEnter: (e) => { if (!isFitDrag(e)) return; depth.current++; setOver(true); },
    onDragLeave: (e) => { if (!isFitDrag(e)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); },
    onDragOver: (e) => { if (!isFitDrag(e)) return; if (okFor()) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } else e.dataTransfer.dropEffect = "none"; },
    onDrop: (e) => {
      depth.current = 0; setOver(false);
      if (!isFitDrag(e)) return;
      const f = draggedFit(e);
      if (!f || !accept(f.ship, f.fitName)) return;
      e.preventDefault();
      onDrop(f.ship, f.fitName);
    },
  };
  return { props, over, ok: over && okFor() };
}

/** The outline a drop target shows while an item is over it: accent if it takes it, muted if not. */
export function DropHint({ over, ok, label }) {
  if (!over) return null;
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 2, zIndex: 50, pointerEvents: "none", borderRadius: 6,
                                     border: `2px dashed ${ok ? C.accent : C.borderStrong}`, background: ok ? `${C.accent}14` : "transparent",
                                     display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <span style={{ margin: 8, padding: "3px 10px", borderRadius: 10, fontSize: 12, background: C.surface, border: `1px solid ${ok ? C.accent : C.borderStrong}`,
                     color: ok ? C.accent : C.textMid }}>{ok ? label : t("Can't go here")}</span>
    </div>
  );
}
