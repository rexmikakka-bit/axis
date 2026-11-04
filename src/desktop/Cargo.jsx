import { useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { TYPES, tidByName } from "../calc.js";
import { eveIcon } from "../lib/icons.js";
import { cargoVolume, cargoUnitVolume } from "../lib/core.js";
import { CargoBrowserSheet } from "../components/cargo.jsx";
import { Empty, TYPE } from "./kit.jsx";

// The desktop Cargo window: the hold as an Item / Qty table (docs/desktop-handoff.md, "Cargo") with
// the quantity typed straight into its cell. Items are added through the phone's cargo picker and
// stored in the same shape the phone's CargoScreen writes ({id, name, qty, vol, typeID}), so a hold
// packed on either app reads the same on the other.

export default function CargoPanel({ s, capacity }) {
  const [picker, setPicker] = useState(false);
  if (!s.activeFit?.ship) return <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;
  const items = s.cargoItems ?? [];
  const used = cargoVolume(items);
  const cap = Math.round(capacity || 0);
  const over = used > cap + 1e-6;
  const setQty = (id, qty) => s.setCargoItems(prev => (prev ?? []).map(e => e.id === id ? { ...e, qty: Math.max(1, Math.round(qty) || 1) } : e));
  const remove = (id) => s.setCargoItems(prev => (prev ?? []).filter(e => e.id !== id));
  // As the phone's addItem: a second pick of the same item adds one to its stack.
  const add = (item) => s.setCargoItems(prev => {
    const list = prev ?? [];
    if (list.some(e => e.name === item.name)) return list.map(e => e.name === item.name ? { ...e, qty: e.qty + 1 } : e);
    return [...list, { id: Date.now(), name: item.name, qty: 1, vol: item.vol ?? cargoUnitVolume(item), icon: item.icon, typeID: item.typeID }];
  });
  // m³ per stack rides in the row tooltip: the window is narrow by default and the name is what you read.
  const cols = "18px minmax(0,1fr) 52px 16px";
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", flex: "none", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: TYPE.label, color: C.textMid }}>{t("Cargo")}</span>
        <span style={{ fontSize: TYPE.value, color: over ? C.danger : C.text, fontVariantNumeric: "tabular-nums" }}>
          {used.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span style={{ color: C.textMid }}>/ {cap.toLocaleString()} m³</span>
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setPicker(true)}
          style={{ height: 26, padding: "0 12px", borderRadius: 6, fontSize: 12.5, cursor: "pointer", background: C.surfaceAlt, border: `1px solid ${C.borderStrong}`, color: C.text }}>
          + {t("Add")}
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: cols, columnGap: 8, padding: "5px 12px", flex: "none", fontSize: TYPE.section,
                    letterSpacing: ".05em", textTransform: "uppercase", color: C.textMid, borderBottom: `1px solid ${C.border}` }}>
        <span /><span>{t("Item")}</span><span style={{ textAlign: "right" }}>{t("Qty")}</span><span />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {!items.length && <div style={{ padding: "10px 12px", fontSize: TYPE.label, color: C.textMid }}>{t("Cargo bay is empty")}</div>}
        {items.map(e => {
          const tid = e.typeID ?? tidByName(e.name);
          const vol = (e.vol ?? TYPES[tid]?.attrs?.volume ?? 0) * (e.qty ?? 0);
          return (
            <div key={e.id} title={`${e.name} · ${vol.toLocaleString(undefined, { maximumFractionDigits: 1 })} m³`} style={{ display: "grid", gridTemplateColumns: cols, columnGap: 8, alignItems: "center", minHeight: 28, padding: "0 12px", borderBottom: `1px solid ${C.border}99` }}>
              <span>{tid && <img className="eve-icon" src={eveIcon(tid, 32)} width={18} height={18} alt="" onError={ev => { ev.target.style.visibility = "hidden"; }} />}</span>
              <span title={e.name} style={{ fontSize: TYPE.label, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
              <input type="text" inputMode="numeric" value={e.qty} onChange={ev => { const n = parseInt(ev.target.value.replace(/[^0-9]/g, ""), 10); if (n > 0) setQty(e.id, n); }} aria-label={t("Quantity of {name}", { name: e.name })}
                style={{ width: "100%", boxSizing: "border-box", height: 24, textAlign: "right", fontSize: TYPE.label, padding: "0 4px",
                         background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontVariantNumeric: "tabular-nums" }} />

              <button type="button" onClick={() => remove(e.id)} aria-label={t("Remove {name}", { name: e.name })} title={t("Remove")}
                style={{ border: "none", background: "none", color: C.textMid, cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
            </div>
          );
        })}
      </div>
      {picker && <CargoBrowserSheet slots={s.slots} onAdd={add} onClose={() => setPicker(false)} />}
    </div>
  );
}
