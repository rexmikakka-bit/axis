import { useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { TYPES, tidByName } from "../calc.js";
import { eveIcon } from "../lib/icons.js";
import { DRONE_FLIGHT, droneAddQty } from "../lib/core.js";
import { DroneMenu } from "../components/ui.jsx";
import { DroneBrowserSheet } from "../components/drones.jsx";
import { UsageBar, Empty, TYPE } from "./kit.jsx";

// The desktop Drones window: bay, bandwidth and drones-in-space on top, then one table row per
// stack — in space, quantity, name, and the engine's range / tracking / speed / EHP for it. Adding
// follows the phone's DronesScreen exactly: a new stack is launched only if a whole flight fits the
// free bandwidth and the free drone slots (droneAddQty), otherwise it goes to the bay; picking a
// drone already in the bay adds another flight to that stack. A row's name opens the phone's
// DroneMenu (info, variations, abyssal rolls).

const recOf = (d) => { const tid = d.typeID ?? (d.name ? tidByName(d.name) : null); return tid == null ? null : (TYPES[tid] ?? TYPES[String(tid)] ?? null); };
const volOf = (d) => recOf(d)?.attrs?.volume ?? d.volume ?? 5;
const bwOf = (d) => recOf(d)?.attrs?.droneBandwidthUsed ?? d.bandwidth ?? 5;

export default function DronesPanel({ s, stats }) {
  const [picker, setPicker] = useState(false);
  const [menuId, setMenuId] = useState(null);
  if (!s.activeFit?.ship) return <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;
  const drones = s.drones ?? [];
  const bay = drones.reduce((a, d) => a + d.qty * volOf(d), 0);
  const bw = drones.filter(d => d.active).reduce((a, d) => a + d.qty * bwOf(d), 0);
  const inSpace = drones.filter(d => d.active).reduce((a, d) => a + d.qty, 0);
  const cap = { bay: stats.snapshot?.droneBay ?? 0, bw: stats.snapshot?.droneBandwidth ?? 0, max: stats.snapshot?.maxActiveDrones ?? 5 };
  const set = (fn) => s.setDrones(prev => fn(prev ?? []));
  const add = (d) => {
    const ex = drones.find(e => e.name === d.name && !e.mutaplasmid);
    if (ex) { set(list => list.map(e => e === ex ? { ...e, qty: e.qty + DRONE_FLIGHT } : e)); return; }
    set(prev => {
      const a = recOf(d)?.attrs ?? null;
      const bandwidth = a?.droneBandwidthUsed ?? d.bandwidth ?? 5;
      const { qty, active } = droneAddQty({ bandwidth, bwFree: cap.bw - bw, slotsFree: cap.max - inSpace });
      return [...prev, { id: Date.now(), name: d.name, size: d.size, qty, active, range: a?.maxRange ?? d.maxRange ?? d.range ?? 0, falloff: a?.falloff ?? d.falloff ?? 0,
        tracking: a?.trackingSpeed ?? d.tracking ?? 0, velocity: a?.maxVelocity ?? d.maxVelocity ?? d.velocity ?? 0, hp: a?.hp ?? d.hp ?? 0, dps: d.dps ?? 0,
        bandwidth, volume: a?.volume ?? d.volume ?? 5, typeID: d.typeID }];
    });
  };
  const info = (d) => (d.id != null ? stats.droneInfo.find(x => x.id === d.id) : null) ?? stats.droneInfo.find(x => x.name === d.name) ?? {};
  const km = (m) => parseFloat((m / 1000).toFixed(2));
  const cols = "18px 44px minmax(90px,1fr) 76px 62px 50px 16px";
  const cell = { fontSize: TYPE.small, color: C.textMid, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const menuDrone = drones.find(d => d.id === menuId);
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
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
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {!drones.length && <div style={{ padding: 12, fontSize: TYPE.label, color: C.textMid }}>{t("No drones. Use + to add some.")}</div>}
        {drones.map(d => {
          const i = info(d);
          return (
            <div key={d.id} style={{ display: "grid", gridTemplateColumns: cols, columnGap: 8, alignItems: "center", minHeight: 30, padding: "0 12px",
                                     borderBottom: `1px solid ${C.border}99`, opacity: d.active ? 1 : 0.65 }}>
              <input type="checkbox" checked={!!d.active} onChange={() => set(l => l.map(x => x.id === d.id ? { ...x, active: !x.active } : x))}
                title={d.active ? t("In space") : t("In the bay")} aria-label={t("In space")} style={{ width: 16, height: 16, accentColor: C.accent }} />
              <input type="text" inputMode="numeric" value={d.qty} aria-label={t("Quantity of {name}", { name: d.name })}
                onChange={e => { const n = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10); if (n >= 0) set(l => l.map(x => x.id === d.id ? { ...x, qty: n } : x)); }}
                style={{ width: "100%", boxSizing: "border-box", height: 24, textAlign: "right", fontSize: TYPE.label, padding: "0 4px", background: C.bg,
                         border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontVariantNumeric: "tabular-nums" }} />
              <span onClick={() => setMenuId(d.id)} title={d.name} style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, cursor: "pointer" }}>
                <img className="eve-icon" src={eveIcon(d.typeID ?? tidByName(d.name), 32)} width={20} height={20} alt="" onError={e => { e.target.style.visibility = "hidden"; }} />
                <span style={{ fontSize: TYPE.label, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                {d.mutaplasmid && <span style={{ fontSize: 10.5, color: C.danger, border: `1px solid ${C.danger}`, borderRadius: 3, padding: "0 3px" }}>A</span>}
              </span>
              <span style={{ ...cell, color: C.rig }}>{i.optimal > 0 ? `${km(i.optimal)}${i.falloff > 0 ? ` + ${km(i.falloff)}` : ""} km` : "—"}</span>
              <span style={cell}>{i.velocity > 0 ? `${Math.round(i.velocity)} m/s` : "—"}</span>
              <span style={cell}>{i.ehp > 0 ? Math.round(i.ehp).toLocaleString() : "—"}</span>
              <button type="button" onClick={() => set(l => l.filter(x => x.id !== d.id))} aria-label={t("Remove {name}", { name: d.name })}
                style={{ border: "none", background: "none", color: C.textMid, cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
            </div>
          );
        })}
      </div>
      {picker && <DroneBrowserSheet existingDrones={drones} onAdd={add} onClose={() => setPicker(false)} />}
      {menuDrone && <DroneMenu drone={menuDrone} onClose={() => setMenuId(null)}
        onUpdateDrone={u => { set(l => l.map(x => x.id === menuId ? { ...x, ...u } : x)); setMenuId(null); }}
        onUpdateDroneLive={u => set(l => l.map(x => x.id === menuId ? { ...x, ...u } : x))}
        engineItem={stats.fittedDrones?.get(menuId)} />}
    </div>
  );
}
