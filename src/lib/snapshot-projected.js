// The snapshot card's Links and Incoming lists (components/snapshot.jsx). React-free, so the
// regression suite can check that the card says what the app applied.
import { computeCommandBursts, calcRangeFactor, tidByName } from "../calc.js";
import { WARFARE_BUFF_UNIT } from "./core.js";
import { projectedFitEffects, projectedSource } from "./projection.js";
import { isProjectedModule } from "./projected-modules.js";
import { t } from "./i18n.js";

// ── projected effects (Links + Incoming) ─────────────────────────────────────────
const shortBurst = (label) => (label || "").replace(/\s*Charge\s*$/i, "").trim();
function warfareFamily(buffID, chargeName = "") {
  if (buffID >= 10 && buffID <= 12) return "Shield Warfare";
  if (buffID >= 13 && buffID <= 15) return "Armor Warfare";
  if (buffID === 16) return "Information Warfare";
  if (/shield/i.test(chargeName)) return "Shield Warfare";
  if (/armor/i.test(chargeName)) return "Armor Warfare";
  if (/sensor|electronic hardening|scan/i.test(chargeName)) return "Information Warfare";
  if (/mining|harvest/i.test(chargeName)) return "Mining Foreman";
  return "Skirmish Warfare";
}
// Buff value already includes skill/mindlink/ship bonuses (read from the calculated fit).
// Most buffs are percentages; buffIDs 3 (cap) and 17 (speed) are absolute — WARFARE_BUFF_UNIT.
function fmtBuff(buffID, value) {
  const unit = WARFARE_BUFF_UNIT[buffID];
  const v = Math.round(value * 10) / 10;
  const sign = v > 0 ? "+" : "";
  return unit ? `${sign}${v}${unit}` : `${sign}${v}%`;
}
// `pe` is the app's own projected-effects result (lib/projection.js buildProjectedEffects), the one
// the Stats tab's numbers are computed from. The card takes from it whatever the app APPLIED rather
// than recomputing: the target's EWAR resistances (each chip is the module's effect as it LANDS on
// this fit; a Shadow Serpentis Synchronizer's web resistance cuts a web the old chip showed whole),
// what this fit accepts in assistance (a sieged dread takes no remote reps), and the remote-rep
// total after diminishing returns.
// `sourceSkills(fit)` is App's per-fit pilot resolver: a link or projected fit is another pilot's
// ship, flown on ITS saved pilot, exactly as the Effects tab and the applied stats read it.
export function buildProjected(cmdFits, projFits, fitsDB, sourceSkills, pe = null) {
  const assist = pe?.assist ?? { rep: 1, cap: 1, assist: 1 };
  const rz = (k) => { const v = pe?.ewarResist?.[k]; return Number.isFinite(v) ? v : 1; };
  const links = [];
  for (const cf of (cmdFits ?? [])) {
    // `active` is opt-OUT — undefined counts as on, so fits saved before the toggle existed keep
    // applying. Must match App.jsx's `===false` test exactly, or the card and the fit disagree.
    if (cf.active === false) continue;
    const fit = fitsDB?.[cf.ship]?.find((f) => f.name === cf.fitName);
    if (!fit) continue;
    let bursts = [];
    try { bursts = computeCommandBursts({ name: cf.ship, typeID: tidByName(cf.ship) }, fit.slots, sourceSkills(fit), { implants: fit.implants, boosters: fit.boosters }); } catch { /* skip */ }
    if (!bursts.length) continue;
    const byCharge = {}, order = []; let warfare = null;
    for (const b of bursts) {
      const nm = shortBurst(b.label);
      warfare = warfare ?? warfareFamily(b.buffID, b.label);
      if (!byCharge[nm]) { byCharge[nm] = []; order.push(nm); }
      byCharge[nm].push(fmtBuff(b.buffID, b.value));
    }
    links.push({ fitName: cf.fitName || cf.ship, hull: cf.ship, warfare: warfare ?? "Warfare Link",
      bursts: order.map((nm) => ({ name: nm, pct: byCharge[nm].join(" · ") })) });
  }
  const incoming = [];
  const remoteReps = { shield: 0, armor: 0, hull: 0 };
  for (const pf of (projFits ?? [])) {
    if (pf.active === false) continue;   // see the cmdFits loop above
    // A saved fit, or a generic projected module's synthetic one (lib/projected-modules.js).
    const src = projectedSource(pf, fitsDB);
    if (!src) continue;
    let eff;
    try { eff = projectedFitEffects(src.ship, src.fit, fitsDB, sourceSkills); } catch { continue; }
    const rangeM = (pf.rangeKm ?? 30) * 1000;
    const rf = (o, fo) => calcRangeFactor(o, fo, rangeM, true);
    const fx = [];
    const add = (name, e, hostile = true) => fx.push({ name, eff: e, hostile });
    // The chip's NAME is the module class that produced the effect and stays English; the value
    // beside it names a stat the app translates everywhere else, so it goes through t(). The sign is
    // inside the key on purpose \u2014 which side of the number it belongs on is a language's business.
    for (const w of (eff.webs || [])) { const f = rf(w.optimal, w.falloff) * rz("web"); if (f > 0.01) add("Stasis Webifier", t("\u2212{pct}% speed", { pct: Math.abs(w.speedFactor * f).toFixed(0) })); }
    for (const n of (eff.neuts || [])) { const f = rf(n.optimal, n.falloff) * rz("neut"); const v = n.gjPerSec * f; if (v > 0.1) add("Energy Neut", t("\u2212{v} GJ/s", { v: v.toFixed(0) })); }
    for (const p of (eff.painters || [])) { const f = rf(p.optimal, p.falloff) * rz("painter"); const v = p.sigBonus * f; if (v > 0.1) add("Target Painter", t("+{pct}% sig", { pct: v.toFixed(0) })); }
    for (const d of (eff.damps || [])) { const f = rf(d.optimal, d.falloff) * rz("damp"); if (d.lockBonus < 0) add("Sensor Damp", t("{pct}% lock", { pct: (d.lockBonus * f).toFixed(0) })); if (d.scanResBonus < 0) add("Sensor Damp", t("{pct}% scan", { pct: (d.scanResBonus * f).toFixed(0) })); }
    for (const td of (eff.trackDisr || [])) { const f = rf(td.optimal, td.falloff) * rz("disrupt"); if (td.tracking < 0) add("Tracking Disr", t("{pct}% track", { pct: (td.tracking * f).toFixed(0) })); if (td.optimalBonus < 0) add("Tracking Disr", t("{pct}% optimal", { pct: (td.optimalBonus * f).toFixed(0) })); }
    for (const g of (eff.guideDisr || [])) { const f = rf(g.optimal, g.falloff) * rz("disrupt"); if (g.missileRange < 0) add("Guidance Disr", t("{pct}% mis. rng", { pct: (g.missileRange * f).toFixed(0) })); if (g.aoeVel < 0) add("Guidance Disr", t("{pct}% expl. vel", { pct: (g.aoeVel * f).toFixed(0) })); }
    for (const r of (eff.reps || [])) { const f = rf(r.optimal, r.falloff); const v = r.rawPS * f * assist.rep; if (v > 0.1) { remoteReps[r.kind] = (remoteReps[r.kind] ?? 0) + v; add(`Remote ${r.kind === "shield" ? "Shield" : r.kind === "armor" ? "Armor" : "Hull"} Rep`, t("+{v} hp/s", { v: v.toFixed(0) }), false); } }
    if (fx.length) incoming.push(isProjectedModule(pf)
      ? { fitName: src.fit.name, hull: t("generic"), rangeKm: pf.rangeKm ?? 30, effects: fx }
      : { fitName: pf.fitName || pf.ship, hull: pf.ship, rangeKm: pf.rangeKm ?? 30, effects: fx });
  }
  // The folded-in rep total is the app's (after diminishing returns), not this list's raw sum.
  if (pe?.reps) for (const k of ["shield", "armor", "hull"]) remoteReps[k] = pe.reps[k] ?? 0;
  return { links, incoming, remoteReps };
}

