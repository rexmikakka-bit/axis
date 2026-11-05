import { useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { TYPES, tidByName } from "../calc.js";
import { eveIcon } from "../lib/icons.js";
import { DRONE_FLIGHT, MUTA_BY_TYPE } from "../lib/core.js";
import { DroneBrowserSheet } from "../components/drones.jsx";
import { UsageBar, Empty, TYPE } from "./kit.jsx";
import { useRowSelect } from "./ContextMenu.jsx";
import { useInspect } from "./inspect-context.jsx";
import { droneTarget } from "./inspect.js";
import { addDrone } from "./items.js";
import { useItemDrop, DropHint } from "./items-context.jsx";

// The desktop Drones window: bay, bandwidth and drones-in-space on top, then one table row per
// stack — in space, quantity, name, and the engine's range / tracking / speed / EHP for it. Adding
// follows the phone's DronesScreen exactly: a new stack is launched only if a whole flight fits the
// free bandwidth and the free drone slots (droneAddQty), otherwise it goes to the bay; picking a
// drone already in the bay adds another flight to that stack. Rows follow the desktop click model (useRowSelect):
// double click or the right-click menu opens the drone in an item window (Inspector.jsx).

const recOf = (d) => { const tid = d.typeID ?? (d.name ? tidByName(d.name) : null); return tid == null ? null : (TYPES[tid] ?? TYPES[String(tid)] ?? null); };
const volOf = (d) => recOf(d)?.attrs?.volume ?? d.volume ?? 5;
const bwOf = (d) => recOf(d)?.attrs?.droneBandwidthUsed ?? d.bandwidth ?? 5;

export default function DronesPanel({ s, stats }) {
  const [picker, setPicker] = useState(false);
  const insp = useInspect();
  const open = (d, tab) => insp.inspect(droneTarget(insp.fitRef, d.id, d.typeID ?? tidByName(d.name)), tab);
  const rs = useRowSelect();
  const drop = useItemDrop("drones");
  if (!s.activeFit?.ship) return <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;
  const drones = s.drones ?? [];
  const bay = drones.reduce((a, d) => a + d.qty * volOf(d), 0);
  const bw = drones.filter(d => d.active).reduce((a, d) => a + d.qty * bwOf(d), 0);
  const inSpace = drones.filter(d => d.active).reduce((a, d) => a + d.qty, 0);
  const cap = { bay: stats.snapshot?.droneBay ?? 0, bw: stats.snapshot?.droneBandwidth ?? 0, max: stats.snapshot?.maxActiveDrones ?? 5 };
  const set = (fn) => s.setDrones(prev => fn(prev ?? []));
  // The add rule lives in items.js, shared with the Browser and drag-and-drop.
  const add = (d) => addDrone(s, d, cap);
  const info = (d) => (d.id != null ? stats.droneInfo.find(x => x.id === d.id) : null) ?? stats.droneInfo.find(x => x.name === d.name) ?? {};
  const km = (m) => parseFloat((m / 1000).toFixed(2));
  const cols = "18px 44px minmax(90px,1fr) 76px 62px 50px 16px";
  const cell = { fontSize: TYPE.small, color: C.textMid, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const toggleActive = (id) => set(l => l.map(x => x.id === id ? { ...x, active: !x.active } : x));
  const remove = (id) => set(l => l.filter(x => x.id !== id));
  const items = (d) => {
    const hasMuta = (MUTA_BY_TYPE[d.typeID] ?? MUTA_BY_TYPE[String(d.typeID)] ?? []).length > 0 || d.mutaplasmid;
    return [
      { label: d.active ? t("Recall to bay") : t("Launch"), onSelect: () => toggleActive(d.id) },
      { label: t("Add a flight (+{n})", { n: DRONE_FLIGHT }), onSelect: () => set(l => l.map(x => x.id === d.id ? { ...x, qty: x.qty + DRONE_FLIGHT } : x)) },
      { divider: true },
      { label: t("Show info"), hint: t("Double-click"), onSelect: () => open(d, "info") },
      { label: t("Variations"), onSelect: () => open(d, "variations") },
      hasMuta && { label: t("Mutate"), onSelect: () => open(d, "mutate") },
      { divider: true },
      { label: t("Remove"), hint: "Del", danger: true, onSelect: () => remove(d.id) },
    ];
  };
  return (
    <div {...drop.props} style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
      <DropHint over={drop.over} ok={drop.ok} label={t("Add to drone bay")} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "8px 16px", padding: "10px 12px", flex: "none", borderBottom: `1px solid ${C.border}` }}>
        <UsageBar label={t("Drone bay")} used={bay} total={cap.bay} unit="m³" fmt={n => String(Math.round(n))} />
        <UsageBar label={t("Bandwidth")} used={bw} total={cap.bw} unit="Mbit/s" fmt={n => String(Math.round(n))} />
        <UsageBar label={t("In space")} used={inSpace} total={cap.max} fmt={n => String(Math.round(n))} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: cols, columnGap: 8, alignItems: "center", padding: "6px 12px", flex: "none", fontSize: TYPE.section,
                    letterSpacing: ".05em", textTransform: "uppercase", color: C.textMid, borderBottom: `1px solid ${C.border}` }}>
        <span /><span style={{ textAlign: "right" }}>{t("Qty")}</span><span>{t("Drone")}</span>
        <span style={{ textAlign: "right" }}>{t("Range")}</span><span style={{ textAlign: "right" }}>{t("Speed")}</span><span style={{ textAlign: "right" }}>EHP</span>
        <button type="button" onClick={() => setPicker(true)} aria-label={t("Add drones")} title={t("Add drones")}
          style={{ border: "none", background: "none", color: C.accent, cursor: "pointer", fontSize: 16, padding: 0 }}>+</button>
      </div>
      <div {...rs.listProps({ onDelete: remove })} style={{ flex: 1, minHeight: 0, overflowY: "auto", outline: "none" }}>
        {!drones.length && <div style={{ padding: 12, fontSize: TYPE.label, color: C.textMid }}>{t("No drones. Use + to add some.")}</div>}
        {drones.map(d => {
          const i = info(d);
          const rp = rs.rowProps(d.id, { onOpen: () => open(d, "info"), items: () => items(d), target: droneTarget(insp.fitRef, d.id, d.typeID ?? tidByName(d.name)) });
          return (
            <div key={d.id} {...rp} style={{ ...rp.style, display: "grid", gridTemplateColumns: cols, columnGap: 8, alignItems: "center", minHeight: 30, padding: "0 12px",
                                     borderBottom: `1px solid ${C.border}99`, opacity: d.active ? 1 : 0.65 }}>
              <input type="checkbox" checked={!!d.active} onChange={() => toggleActive(d.id)}
                title={d.active ? t("In space") : t("In the bay")} aria-label={t("In space")} style={{ width: 16, height: 16, accentColor: C.accent }} />
              <input type="text" inputMode="numeric" value={d.qty} aria-label={t("Quantity of {name}", { name: d.name })}
                onChange={e => { const n = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10); if (n >= 0) set(l => l.map(x => x.id === d.id ? { ...x, qty: n } : x)); }}
                style={{ width: "100%", boxSizing: "border-box", height: 24, textAlign: "right", fontSize: TYPE.label, padding: "0 4px", background: C.bg,
                         border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontVariantNumeric: "tabular-nums" }} />
              <span title={d.name} style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                <img className="eve-icon" src={eveIcon(d.typeID ?? tidByName(d.name), 32)} width={20} height={20} alt="" onError={e => { e.target.style.visibility = "hidden"; }} />
                <span style={{ fontSize: TYPE.label, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                {d.mutaplasmid && <span style={{ fontSize: 10.5, color: C.danger, border: `1px solid ${C.danger}`, borderRadius: 3, padding: "0 3px" }}>A</span>}
              </span>
              <span style={{ ...cell, color: C.rig }}>{i.optimal > 0 ? `${km(i.optimal)}${i.falloff > 0 ? ` + ${km(i.falloff)}` : ""} km` : "—"}</span>
              <span style={cell}>{i.velocity > 0 ? `${Math.round(i.velocity)} m/s` : "—"}</span>
              <span style={cell}>{i.ehp > 0 ? Math.round(i.ehp).toLocaleString() : "—"}</span>
              <button type="button" onClick={() => remove(d.id)} aria-label={t("Remove {name}", { name: d.name })}
                style={{ border: "none", background: "none", color: C.textMid, cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
            </div>
          );
        })}
      </div>
      {picker && <DroneBrowserSheet existingDrones={drones} onAdd={add} onClose={() => setPicker(false)} />}
      {rs.view}
    </div>
  );
}
