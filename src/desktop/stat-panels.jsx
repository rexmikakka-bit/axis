import { useMemo } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { calcFitStats, peakRegen, PEAK_REGEN_AT_PCT, TYPES, tidByName, usesTurretHardpoint, usesLauncherHardpoint } from "../calc.js";
import { cargoVolume, canLoadCharge } from "../lib/core.js";
import { resourceColor } from "../components/ui.jsx";
import { KV, UsageBar, SectionLabel, Empty, TYPE } from "./kit.jsx";

// Desktop-native stat windows. Display only: every figure comes from ONE calcFitStats call made
// with exactly the options the phone's Stats page passes (tabs.jsx StatsTab `csOpts`), so a number
// here and the same number on the phone cannot differ. If StatsTab's options change, change them
// here too.

/** The fit's full stats, as the phone's Stats page computes them. Null with no fit. */
export function useFitStats(s, ship) {
  return useMemo(() => {
    if (!ship || !s.slots) return null;
    const pe = s.projectedEffects;
    try {
      return calcFitStats(ship, s.slots, s.drones ?? [], s.fitSkills, {
        implants: s.implants, boosters: s.boosters, factorInReload: s.factorInReload, externalBursts: s.externalBursts,
        projectedWebMult: pe?.webMult, projectedNeutGJs: pe?.neutGJs, projectedCapGJs: pe?.capGJs, projectedDebuffs: pe?.debuffs,
        projectedBoosts: pe?.boosts, projectedEcm: pe?.ecm, damageProfile: s.dmgProfile?.p, targetResists: s.tgtProfile?.r,
        pilotSec: s.slots?.pilotSec, systemSecurity: s.slots?.systemSecurity,
        fighters: (s.fighters ?? []).map(f => ({ name: f.name, qty: f.qty ?? 1, active: f.active, abilities: f.abilities })),
      }) ?? null;
    } catch { return null; }
  }, [ship, s.slots, s.drones, s.fitSkills, s.implants, s.boosters, s.factorInReload, s.externalBursts, s.projectedEffects, s.dmgProfile, s.tgtProfile, s.fighters]);
}

const fmtN = (n) => (n == null || n === 0) ? "0" : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
const fmtF = (n) => n == null ? "0.0" : n >= 100 ? n.toFixed(0) : n.toFixed(2);
const exact = (n, d = 2, unit = "") => n == null ? undefined : `${n.toLocaleString(undefined, { maximumFractionDigits: d })}${unit}`;

// Drone bay and bandwidth in use, counted the way the phone's Validation card counts them.
function droneUse(drones) {
  const rec = (d) => TYPES[d.typeID] ?? TYPES[tidByName(d.name)];
  const bw = (d) => rec(d)?.attrs?.droneBandwidthUsed ?? rec(d)?.a?.droneBandwidthUsed ?? d.bandwidth ?? 5;
  const vol = (d) => rec(d)?.attrs?.volume ?? rec(d)?.a?.volume ?? d.volume ?? 5;
  const list = drones ?? [];
  return {
    bay: list.reduce((a, d) => a + (d.qty ?? 0) * vol(d), 0),
    bandwidth: list.filter(d => d.active).reduce((a, d) => a + (d.qty ?? 0) * bw(d), 0),
    inSpace: list.filter(d => d.active).reduce((a, d) => a + (d.qty ?? 0), 0),
  };
}

export function ResourcesPanel({ s, ship, cs }) {
  if (!ship || !cs) return <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;
  const hard = (s.slots?.high ?? []).reduce((acc, m) => {
    if (!m || m.type === "empty") return acc;
    const ty = TYPES[m.typeID] ?? TYPES[String(m.typeID)];
    if (usesTurretHardpoint(ty?.e)) acc.turrets++; else if (usesLauncherHardpoint(ty?.e)) acc.launchers++;
    return acc;
  }, { turrets: 0, launchers: 0 });
  const d = droneUse(s.drones);
  const int = (n) => String(Math.round(n));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", padding: "10px 12px" }}>
      <UsageBar label={t("CPU")} labelColor={resourceColor("cpu")} used={cs.cpuUsed ?? 0} total={cs.cpuTotal ?? 0} unit="tf" />
      <UsageBar label={t("PG")} labelColor={resourceColor("pg")} used={cs.pgUsed ?? 0} total={cs.pgTotal ?? 0} unit="MW"
        fmt={(n) => n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 0 : 1 })} />
      <UsageBar label={t("Calibration")} used={cs.calUsed ?? 0} total={cs.calTotal ?? 400} color={resourceColor("cal")} fmt={int} />
      <UsageBar label={t("Drone bay")} used={d.bay} total={cs.droneBay ?? 0} unit="m³" fmt={int} />
      <UsageBar label={t("Bandwidth")} used={d.bandwidth} total={cs.droneBandwidth ?? 0} unit="Mbit/s" fmt={int} />
      <UsageBar label={t("Drones")} used={d.inSpace} total={cs.maxActiveDrones ?? 0} fmt={int} />
      <UsageBar label={t("Turrets")} used={hard.turrets} total={ship.turrets ?? 0} fmt={int} />
      <UsageBar label={t("Launchers")} used={hard.launchers} total={ship.launchers ?? 0} fmt={int} />
    </div>
  );
}

const fmtDur = (sec) => {
  if (sec == null) return "?";
  sec = Math.round(sec);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), r = sec % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
};

/** Everything the phone's Capacitor card shows, without its two tap-to-toggle cells. */
export function CapacitorPanel({ cs }) {
  if (!cs) return <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;
  const stable = !!cs.capStable;
  const tone = stable ? C.success : C.danger;
  const regen = peakRegen(cs.capCapacity, cs.capRechargeMs);
  const capIn = regen + (cs.capFillPS ?? 0);
  const neut = (1 - (cs.energyWarfareResist ?? 1)) * 100;
  return (
    <KV cols={2} rows={[
      [t("State"), stable ? t("Stable") : t("Unstable"), { color: tone }],
      [stable ? t("Stable at") : t("Lasts"), stable ? `${((cs.capLevel ?? 1) * 100).toFixed(1)}%` : fmtDur(cs.capTime), { color: tone }],
      [t("Delta"), `${(cs.capDelta ?? 0) >= 0 ? "+" : ""}${fmtF(cs.capDelta ?? 0)} GJ/s`, { color: tone, title: exact(cs.capDelta, 3, " GJ/s") }],
      [t("Capacity"), `${fmtN(cs.capCapacity ?? 0)} GJ`, { title: exact(cs.capCapacity, 2, " GJ") }],
      [t("In"), `+${fmtF(capIn)} GJ/s`, { color: C.success }],
      [t("Out"), `−${fmtF(cs.capDrainPS ?? 0)} GJ/s`, { color: C.danger }],
      [t("Peak regen at {pct}%", { pct: PEAK_REGEN_AT_PCT }), `${fmtF(regen)} GJ/s`],
      [t("Neut resist"), `${neut.toFixed(1)}%`, { color: neut > 0.05 ? C.rig : undefined }],
    ]} />
  );
}

/** The phone's "Targeting and Misc" card, every row, as one grid. */
export function TargetingPanel({ s, cs }) {
  if (!cs) return <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;
  const x = cs.exact ?? {};
  const abOn = cs.maxVelocityAB && cs.maxVelocityAB !== cs.maxVelocity;
  const cargoUsed = cargoVolume(s.cargoItems);
  const jammers = [...new Set((s.projectedEffects?.ecm ?? []).filter(e => (e.byType?.[cs.sensorType] ?? 0) > 0).map(e => e.ship).filter(Boolean))].join(", ");
  return (
    <>
      <SectionLabel>{t("Targeting")}</SectionLabel>
      <KV cols={2} rows={[
        [t("Lock range"), `${fmtF(cs.targetRange ?? 0)} km`, { title: exact(x.targetRange, 3, " km") }],
        [t("Scan res."), `${fmtN(cs.scanRes ?? 0)} mm`, { title: exact(x.scanRes, 2, " mm") }],
        [t("Targets"), String(Math.round(cs.maxTargets ?? 0))],
        [t("Sensor strength"), `${cs.sensorStrength ?? 0}${cs.sensorType ? ` ${cs.sensorType}` : ""}`,
          { title: cs.jamChance > 0 ? `${t("{pct}% Jam chance", { pct: cs.jamChance })}${jammers ? ` (${jammers})` : ""}` : exact(x.sensorStrength, 2) }],
        cs.jamChance > 0 && [t("Jam chance"), `${cs.jamChance}%`, { color: C.danger }],
        cs.droneBay > 0 && [t("Drone range"), `${fmtN(Math.round((cs.droneControlRange ?? 0) / 1000))} km`],
      ]} />
      <SectionLabel>{t("Mobility")}</SectionLabel>
      <KV cols={2} rows={[
        [t("Speed"), `${Math.round(abOn ? cs.maxVelocityAB : (cs.maxVelocity ?? 0))} m/s`, { title: exact(abOn ? x.maxVelocityAB : x.maxVelocity, 2, " m/s") }],
        [t("Align time"), `${fmtF(cs.alignTime ?? 0)} s`, { title: exact(x.alignTime, 3, " s") }],
        [t("Signature radius"), `${fmtN(cs.sigRadius ?? 0)} m`, { title: exact(x.sigRadius, 2, " m") }],
        [t("Warp speed"), `${fmtF(cs.warpSpeed ?? 3)} AU/s`, { title: exact(x.warpSpeed, 3, " AU/s") }],
        [t("Cargo"), `${fmtN(cargoUsed)} / ${fmtN(cs.cargoCapacity ?? 0)} m³`],
        [t("Mass"), `${fmtN(cs.mass ?? 0)} kg`, { title: cs.mass != null ? `${Math.round(cs.mass).toLocaleString()} kg` : undefined }],
      ]} />
    </>
  );
}

/**
 * The phone's Validation card's checks (tabs.jsx StatsTab), as a list of {sev, msg}. Same rules in
 * the same order; keep the two in step.
 */
export function fitIssues(cs, slots, drones) {
  if (!cs) return [];
  const fr = (n) => Math.abs(n) >= 100 ? String(Math.round(Math.abs(n))) : Math.abs(n).toFixed(1);
  const issues = [];
  if ((cs.cpuUsed ?? 0) > (cs.cpuTotal ?? 0) + 0.01) issues.push({ sev: "err", msg: t("CPU overloaded by {n} tf", { n: fr(cs.cpuUsed - cs.cpuTotal) }) });
  if ((cs.pgUsed ?? 0) > (cs.pgTotal ?? 0) + 0.01) issues.push({ sev: "err", msg: t("Powergrid overloaded by {n} MW", { n: fr(cs.pgUsed - cs.pgTotal) }) });
  if ((cs.calUsed ?? 0) > (cs.calTotal ?? 0) + 0.01) issues.push({ sev: "err", msg: t("Calibration exceeded by {n} points", { n: fr(cs.calUsed - cs.calTotal) }) });
  const d = droneUse(drones);
  if ((cs.droneBay ?? 0) > 0 && d.bay > cs.droneBay + 0.01) issues.push({ sev: "err", msg: t("Drone bay over capacity by {n} m³", { n: fr(d.bay - cs.droneBay) }) });
  if ((cs.droneBandwidth ?? 0) > 0 && d.bandwidth > cs.droneBandwidth + 0.01) issues.push({ sev: "err", msg: t("Drone bandwidth exceeded by {n} Mbit/s", { n: fr(d.bandwidth - cs.droneBandwidth) }) });
  if ((cs.maxActiveDrones ?? 0) > 0 && d.inSpace > cs.maxActiveDrones) issues.push({ sev: "err", msg: t("{n} drones in space — only {cap} can be launched", { n: d.inSpace, cap: cs.maxActiveDrones }) });
  for (const g of (cs.groupOverFitted ?? [])) issues.push({ sev: "err", msg: t("{count} {group} modules fitted — only {cap} allowed", { count: g.count, group: g.group, cap: g.cap === 1 ? t("one") : g.cap }) });
  const bad = new Map();
  for (const sec of ["high", "mid", "low", "rigs", "services"]) for (const m of (slots?.[sec] ?? [])) {
    if (!m?.typeID || !m.ammo || m.type === "empty" || canLoadCharge(m.typeID, m.ammo)) continue;
    const charge = String(m.ammo).replace(/\s*\(\d+\)$/, ""), key = `${m.name}\u0000${charge}`;
    bad.set(key, { module: m.name, charge, n: (bad.get(key)?.n ?? 0) + 1 });
  }
  for (const b of bad.values()) issues.push({ sev: "err", msg: t("{module} can't load {charge}", { module: b.n > 1 ? `${b.n}× ${b.module}` : b.module, charge: b.charge }) });
  return issues;
}

/** "Valid" or "N issues", for the Fitting window's title bar. Opens the Validation window. */
export function ValidityBadge({ issues, onOpen }) {
  const n = issues.length;
  const color = n ? (issues.some(i => i.sev === "err") ? C.danger : C.warning) : C.success;
  return (
    <button type="button" onClick={onOpen} title={n ? issues.map(i => i.msg).join("\n") : t("No fitting issues detected.")}
      style={{ height: 22, padding: "0 9px", borderRadius: 11, border: `1px solid ${color}`, background: "transparent", color,
               fontSize: 12, fontWeight: 500, cursor: "pointer", marginRight: 4 }}>
      {n ? t({ one: "{n} issue", other: "{n} issues" }, { n }) : t("Valid")}
    </button>
  );
}

export function ValidationPanel({ cs, issues }) {
  if (!cs) return <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;
  if (!issues.length) return <div style={{ padding: "10px 12px", fontSize: TYPE.label, color: C.success }}>✓ {t("No fitting issues detected.")}</div>;
  return (
    <div style={{ padding: "6px 0" }}>
      {issues.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", fontSize: TYPE.label, color: C.text }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, flex: "none", background: it.sev === "err" ? C.danger : C.warning }} />{it.msg}
        </div>
      ))}
    </div>
  );
}

export { TYPE };
