import { useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { TYPES, tidByName } from "../calc.js";
import { eveIcon } from "../lib/icons.js";
import { cargoVolume, cargoUnitVolume } from "../lib/core.js";
import { useRowSelect } from "./ContextMenu.jsx";
import { useInspect } from "./inspect-context.jsx";
import { typeTarget } from "./inspect.js";
import { variantMenuItems } from "./variant-menu.jsx";
import { Empty, TYPE } from "./kit.jsx";
import { useItemDrop, DropHint, useItems } from "./items-context.jsx";

// The desktop Cargo window: the hold as an Item / Qty table (docs/desktop-handoff.md, "Cargo") with
// the quantity typed straight into its cell. Items are added from the Browser ("+ Add" narrows it to cargo) and
// stored in the same shape the phone's CargoScreen writes ({id, name, qty, vol, typeID}), so a hold
// packed on either app reads the same on the other.

export default function CargoPanel({ s, capacity }) {
  // "+ Add" opens the Browser narrowed to what cargo takes; its double-click (or a drag) lands here.
  const itemOps = useItems();
  const insp = useInspect();
  const setInfo = (tid) => insp.inspect(typeTarget(tid), "info");
  const rs = useRowSelect();
  const drop = useItemDrop("cargo");
  if (!s.activeFit?.ship) return <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;
  const items = s.cargoItems ?? [];
  const used = cargoVolume(items);
  const cap = Math.round(capacity || 0);
  const over = used > cap + 1e-6;
  const setQty = (id, qty) => s.setCargoItems(prev => (prev ?? []).map(e => e.id === id ? { ...e, qty: Math.max(1, Math.round(qty) || 1) } : e));
  const remove = (id) => s.setCargoItems(prev => (prev ?? []).filter(e => e.id !== id));
  // A stack swapped for another variant. If the hold already has a stack of that variant, they merge,
  // as adding the same item twice does.
  const swapTo = (e, v, name) => s.setCargoItems(prev => {
    const list = prev ?? [];
    const same = list.find(x => x.id !== e.id && !x.mutaplasmid && Number(x.typeID ?? tidByName(x.name)) === Number(v.typeID));
    if (same) return list.filter(x => x.id !== e.id).map(x => x === same ? { ...x, qty: (x.qty ?? 0) + (e.qty ?? 0) } : x);
    return list.map(x => x.id === e.id ? { id: x.id, name, qty: x.qty, vol: cargoUnitVolume({ name, typeID: v.typeID }), typeID: v.typeID } : x);
  });
  // As the phone's addItem: a second pick of the same item adds one to its stack.
  // m³ per stack rides in the row tooltip: the window is narrow by default and the name is what you read.
  const cols = "18px minmax(0,1fr) 52px 16px";
  return (
    <div {...drop.props} {...rs.blankProps([{ label: t("Add to cargo…"), onSelect: () => itemOps.browse("cargo") }])} style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
      <DropHint over={drop.over} ok={drop.ok} label={t("Add to cargo")} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", flex: "none", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: TYPE.label, color: C.textMid }}>{t("Cargo")}</span>
        <span style={{ fontSize: TYPE.value, color: over ? C.danger : C.text, fontVariantNumeric: "tabular-nums" }}>
          {used.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span style={{ color: C.textMid }}>/ {cap.toLocaleString()} m³</span>
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => itemOps.browse("cargo")}
          style={{ height: 26, padding: "0 12px", borderRadius: 6, fontSize: 12.5, cursor: "pointer", background: C.surfaceAlt, border: `1px solid ${C.borderStrong}`, color: C.text }}>
          + {t("Add")}
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: cols, columnGap: 8, padding: "5px 12px", flex: "none", fontSize: TYPE.section,
                    letterSpacing: ".05em", textTransform: "uppercase", color: C.textMid, borderBottom: `1px solid ${C.border}` }}>
        <span /><span>{t("Item")}</span><span style={{ textAlign: "right" }}>{t("Qty")}</span><span />
      </div>
      <div {...rs.listProps({ onDelete: remove })} style={{ flex: 1, minHeight: 0, overflowY: "auto", outline: "none" }}>
        {!items.length && <div style={{ padding: "10px 12px", fontSize: TYPE.label, color: C.textMid }}>{t("Cargo bay is empty")}</div>}
        {items.map(e => {
          const tid = e.typeID ?? tidByName(e.name);
          const vol = (e.vol ?? TYPES[tid]?.attrs?.volume ?? 0) * (e.qty ?? 0);
          // As the Fitting window's: hover for the variants, click for the Variations window. Only for
          // an item that has variants; a rolled abyssal stays what it is.
          const variants = tid && !e.mutaplasmid ? variantMenuItems(tid, { isCurrent: (v) => Number(v.typeID) === Number(tid), onPick: (v, name) => swapTo(e, v, name) }) : undefined;
          const rp = rs.rowProps(e.id, { target: tid ? typeTarget(tid) : undefined, onOpen: () => remove(e.id), items: [
            { label: t("Show info"), disabled: !tid, onSelect: () => setInfo(tid) },
            variants && { label: t("Variations…"), onSelect: () => insp.inspect(typeTarget(tid), "variations"), submenu: variants },
            tid && { label: t("Show in market"), onSelect: () => itemOps.showInMarket(tid) },
            { divider: true },
            { label: t("Remove"), hint: t("double-click · Del"), danger: true, onSelect: () => remove(e.id) },
          ] });
          return (
            <div key={e.id} {...rp} title={`${e.name} · ${vol.toLocaleString(undefined, { maximumFractionDigits: 1 })} m³`} style={{ ...rp.style, display: "grid", gridTemplateColumns: cols, columnGap: 8, alignItems: "center", minHeight: 28, padding: "0 12px", borderBottom: `1px solid ${C.border}99` }}>
              <span>{tid && <img className="eve-icon" src={eveIcon(tid, 32)} width={18} height={18} alt="" onError={ev => { ev.target.style.visibility = "hidden"; }} />}</span>
              <span title={e.name} style={{ fontSize: TYPE.label, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
              <QtyInput qty={e.qty} onSet={(n) => setQty(e.id, n)} label={t("Quantity of {name}", { name: e.name })} />

              <button type="button" onClick={() => remove(e.id)} aria-label={t("Remove {name}", { name: e.name })} title={t("Remove")}
                style={{ border: "none", background: "none", color: C.textMid, cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
            </div>
          );
        })}
      </div>
      {rs.view}
    </div>
  );
}

// The quantity cell. It can be cleared while typing (select the 1, type 3); each number typed applies
// at once, and leaving it empty puts the stack's quantity back.
function QtyInput({ qty, onSet, label }) {
  const [draft, setDraft] = useState(null);
  return (
    <input type="text" inputMode="numeric" value={draft ?? qty} aria-label={label}
      onChange={ev => { const v = ev.target.value.replace(/[^0-9]/g, ""); setDraft(v); const n = parseInt(v, 10); if (n > 0) onSet(n); }}
      onFocus={ev => ev.target.select()} onBlur={() => setDraft(null)}
      onKeyDown={ev => { if (ev.key === "Enter" || ev.key === "Escape") ev.currentTarget.blur(); }}
      style={{ width: "100%", boxSizing: "border-box", height: 24, textAlign: "right", fontSize: TYPE.label, padding: "0 4px",
               background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontVariantNumeric: "tabular-nums" }} />
  );
}
