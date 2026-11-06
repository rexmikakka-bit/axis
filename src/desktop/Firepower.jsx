import { useEffect, useMemo, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { TYPES, usesTurretHardpoint, usesLauncherHardpoint } from "../calc.js";
import { DMG, validStatesFor, NAVY_AMMO_PREFIXES } from "../lib/core.js";
import { META_COLORS } from "../lib/meta.js";
import { weaponRacks, rankAmmo } from "../lib/ammo-compare.js";
import { TargetProfileSheet } from "../components/ui.jsx";
import { KV, Empty, Dialog, TYPE, WEIGHT } from "./kit.jsx";

// The desktop Firepower window: the phone's Firepower card (tabs.jsx StatsTab) figure for figure —
// resist-weighted when a target profile is set, spool ranges, clip damage only for weapons that
// reload — with its ammo advisor as a compact table that scrolls inside the window instead of
// growing the card. The ranking is the phone's own (lib/ammo-compare.js rankAmmo) and a click loads
// the round into the whole rack, as the phone's does.

const fmtDps = (n) => n == null || n < 0.05 ? "0" : n >= 100 ? n.toFixed(0) : n.toFixed(1);
const fmtN = (n) => (n == null || n === 0) ? "0" : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
const isWeapon = (tid) => { const e = TYPES[String(tid)]?.e; return usesTurretHardpoint(e) || usesLauncherHardpoint(e); };

function Toggle({ on, onClick, color, children, title }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} title={title}
      style={{ height: 26, padding: "0 11px", borderRadius: 13, fontSize: 12.5, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
               background: on ? `${color}1f` : "transparent", border: `1px solid ${on ? color : C.borderStrong}`, color: on ? color : C.textMid }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: on ? color : C.textMid }} />{children}
    </button>
  );
}

function Spine({ dmg }) {
  const parts = dmg ? [["em", dmg.em], ["th", dmg.th], ["kin", dmg.kin], ["exp", dmg.exp]].filter(([, v]) => v > 0.08) : [];
  const total = parts.reduce((a, [, v]) => a + v, 0) || 1;
  return (
    <span style={{ width: 3, height: 16, borderRadius: 2, overflow: "hidden", display: "flex", flexDirection: "column", flex: "none", background: parts.length ? "transparent" : C.border }}>
      {parts.map(([k, v]) => <span key={k} style={{ flex: v / total, background: DMG[k].color }} />)}
    </span>
  );
}

// Collapsed to one line in the window — what is loaded, and the button — with the ranking in a dialog
// big enough to read whole names. Picking a round loads it and closes the dialog.
function AmmoSection({ s, ship, opts }) {
  const racks = useMemo(() => weaponRacks(s.slots), [s.slots]);
  const [open, setOpen] = useState(null);   // rack index whose picker is open
  if (!racks.length) return null;
  return (
    <div style={{ flex: "none", borderTop: `1px solid ${C.border}`, padding: "6px 0" }}>
      {racks.map((r, i) => (
        <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 12px", minHeight: 28 }}>
          <span style={{ fontSize: TYPE.label, color: C.textMid, flex: "none" }}>{t("Ammo")}</span>
          <span title={`${r.mounts.length}× ${r.name}`} style={{ fontSize: TYPE.label, color: C.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.ammo ? r.ammo.replace(/\s*\(\d+\)$/, "") : <span style={{ color: C.textMid }}>{t("None loaded")}</span>}
            {racks.length > 1 && <span style={{ color: C.textMid }}> · {r.mounts.length}× {r.name}</span>}
          </span>
          <button type="button" onClick={() => setOpen(i)}
            style={{ height: 26, padding: "0 12px", borderRadius: 6, fontSize: 12.5, cursor: "pointer", flex: "none",
                     background: C.surfaceAlt, border: `1px solid ${C.borderStrong}`, color: C.text }}>{t("Change…")}</button>
        </div>
      ))}
      {open != null && racks[open] && (
        <Dialog title={`${t("Ammo")} · ${racks[open].mounts.length}× ${racks[open].name}`} onClose={() => setOpen(null)} width={760}>
          <AmmoTable s={s} ship={ship} opts={opts} rack={racks[open]} onPicked={() => setOpen(null)} />
        </Dialog>
      )}
    </div>
  );
}

// Which kind of round a row is, so a list of thirty reads as a handful of choices. The phone shows
// the same split as a badge per row (tabs.jsx: NAVY / T2 / T1, with the two T2 lines coloured): T2
// splits into its two lines by lib/ammo-compare's `line` — more damage than the family's T1 round
// (Conflagration, Fury, Rage) or less, bought for range or application (Aurora, Spike, Javelin,
// Precision). Navy is the same round as T1 hitting harder; Faction here is the pirate rounds.
const TIERS = [
  { key: "t2dmg", label: () => t("T2 · damage"), color: META_COLORS.T2 },
  // null: the theme's C.low, read at render so a theme switch reaches it (see tierColor).
  { key: "t2app", label: () => t("T2 · range"), color: null },
  { key: "t2prec", label: () => t("T2 · precision"), color: null },
  { key: "t2", label: () => "T2", color: META_COLORS.T2 },
  { key: "navy", label: () => t("Navy"), color: META_COLORS.Faction },
  { key: "faction", label: () => t("Faction"), color: META_COLORS.Officer },
  { key: "storyline", label: () => t("Storyline"), color: META_COLORS.Storyline },
  { key: "t1", label: () => "T1", color: META_COLORS.T1 },
];
const TIER = Object.fromEntries(TIERS.map(x => [x.key, x]));
const tierColor = (x) => x.color ?? C.low;
const isNavyRound = (name) => NAVY_AMMO_PREFIXES.some(p => name.startsWith(p + " "));
function tierOf(r) {
  if (isNavyRound(r.name)) return "navy";
  if (r.meta === "T2") return r.line === "dmg" ? "t2dmg" : r.line === "app" ? (/Precision/.test(r.name) ? "t2prec" : "t2app") : "t2";
  if (r.meta === "Faction") return "faction";
  if (r.meta === "Storyline") return "storyline";
  return "t1";
}
const GROUP_KEY = "axis_desk_ammo_group";
const TierBadge = ({ tier }) => (
  <span style={{ justifySelf: "start", padding: "1px 7px", borderRadius: 9, fontSize: 11.5, whiteSpace: "nowrap", color: tierColor(TIER[tier]),
                 border: `1px solid ${tierColor(TIER[tier])}66`, background: `${tierColor(TIER[tier])}14` }}>{TIER[tier].label()}</span>
);

function AmmoTable({ s, ship, opts, rack, onPicked }) {
  const [result, setResult] = useState(null);
  // Grouped by kind of round (remembered), or one list by DPS; a chip narrows it to one kind.
  const [grouped, setGrouped] = useState(() => { try { return localStorage.getItem(GROUP_KEY) !== "0"; } catch { return true; } });
  const flipGrouped = () => setGrouped(v => { try { localStorage.setItem(GROUP_KEY, v ? "0" : "1"); } catch { /* private mode */ } return !v; });
  const [only, setOnly] = useState(null);
  const rackKey = rack ? `${rack.name}|${rack.mounts.length}|${rack.ammo}` : "";
  useEffect(() => {
    if (!rack) return;
    let dead = false;
    // Off the render, as the phone does: a sweep is a calculation per round.
    const id = setTimeout(() => { if (!dead) setResult(rankAmmo(ship, s.slots, s.drones ?? [], s.fitSkills, opts, rack, false)); }, 0);
    return () => { dead = true; clearTimeout(id); };
  }, [ship, s.slots, s.drones, s.fitSkills, opts, rackKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  const all = [...(result?.rows ?? [])].flatMap(r => (r.variants ?? [r]).filter(v => !v.unscored)).sort((a, b) => (b.dps ?? 0) - (a.dps ?? 0))
    .map(r => ({ ...r, tier: tierOf(r) }));
  // A T2 family with no T1 round to measure damage against (lib/ammo-compare's `line` is null) is
  // split by reach instead: within the rack, the T2 rounds that reach further than the shortest are
  // the range line (Barrage, Tremor, Aurora, Spike), the shortest the damage line (Hail, Quake, Scorch).
  const reach = (r) => (r.optimal ?? 0) + (r.falloff ?? 0);
  const plainT2 = all.filter(r => r.tier === "t2");
  if (plainT2.length > 1) {
    const shortest = Math.min(...plainT2.map(reach));
    for (const r of plainT2) r.tier = reach(r) > shortest + 1e-6 ? "t2app" : "t2dmg";
  }
  const best = all[0];
  const present = TIERS.filter(x => all.some(r => r.tier === x.key));
  const rows = only ? all.filter(r => r.tier === only) : all;
  // Grouped: the kinds in TIERS order, each by DPS, under a heading naming it and its best figure.
  const sections = grouped ? present.filter(x => !only || x.key === only).map(x => ({ tier: x, rows: rows.filter(r => r.tier === x.key) })) : [{ tier: null, rows }];
  const load = (row) => {
    s.setSlots(prev => {
      const next = { ...prev };
      for (const { key } of rack.mounts) if (next[key] === prev[key]) next[key] = (prev[key] ?? []).slice();
      for (const { key, index } of rack.mounts) next[key][index] = { ...next[key][index], ammo: row.name, charges: row.charges, maxCharges: row.charges };
      return next;
    });
    onPicked?.();
  };
  const range = (r) => r.optimal == null ? "" : r.falloff > 0 ? `${Math.round(r.optimal)} + ${Math.round(r.falloff)} km` : `${Math.round(r.optimal)} km`;
  const cols = "4px minmax(0,1fr) 112px 70px 70px 110px";
  const chip = (on, label, onClick, color = C.accent) => (
    <button type="button" aria-pressed={on} onClick={onClick}
      style={{ height: 24, padding: "0 10px", borderRadius: 12, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
               background: on ? `${color}22` : "transparent", border: `1px solid ${on ? color : C.borderStrong}`, color: on ? color : C.textMid }}>{label}</button>
  );
  return (
    <div style={{ padding: "4px 0 8px" }}>
      {present.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "6px 16px 8px" }}>
          {chip(!only, t("All"), () => setOnly(null))}
          {present.map(x => <span key={x.key}>{chip(only === x.key, x.label(), () => setOnly(o => o === x.key ? null : x.key), tierColor(x))}</span>)}
          <span style={{ flex: 1 }} />
          {chip(grouped, t("Group by kind"), flipGrouped)}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: cols, columnGap: 12, padding: "6px 16px", position: "sticky", top: 0, background: C.surface, zIndex: 1,
                    fontSize: TYPE.section, fontWeight: WEIGHT.value, letterSpacing: ".05em", textTransform: "uppercase", color: C.textMid, borderBottom: `1px solid ${C.border}` }}>
        <span /><span>{t("Charge")}</span><span>{t("Kind")}</span><span style={{ textAlign: "right" }}>{result?.targeted ? t("Applied") : t("DPS")}</span>
        <span style={{ textAlign: "right" }}>{t("Volley")}</span><span style={{ textAlign: "right" }}>{t("Range")}</span>
      </div>
      {!result && <div style={{ padding: "10px 16px", fontSize: TYPE.label, color: C.textMid }}>{t("Comparing ammo…")}</div>}
      {sections.map(sec => <div key={sec.tier?.key ?? "all"}>
        {sec.tier && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px 4px", fontSize: TYPE.section, letterSpacing: ".05em",
                        textTransform: "uppercase", color: tierColor(sec.tier), borderTop: `1px solid ${C.border}` }}>
            <span style={{ width: 3, height: 12, borderRadius: 2, background: tierColor(sec.tier) }} />
            {sec.tier.label()}
            <span style={{ color: C.textMid, textTransform: "none", letterSpacing: 0 }}>· {t({ one: "{n} round", other: "{n} rounds" }, { n: sec.rows.length })}</span>
          </div>
        )}
        {sec.rows.map(r => {
        const loaded = r.name === rack.ammo;
        return (
          <div key={r.name} role="button" tabIndex={0} onClick={() => load(r)} onKeyDown={e => { if (e.key === "Enter") load(r); }}
            title={loaded ? t("Loaded") : t("Load into every {name}", { name: rack.name })}
            style={{ display: "grid", gridTemplateColumns: cols, columnGap: 12, alignItems: "center", minHeight: 32, padding: "0 16px",
                     cursor: "pointer", fontSize: 13.5, fontVariantNumeric: "tabular-nums", background: loaded ? C.accentLight : "transparent",
                     boxShadow: loaded ? `inset 3px 0 0 ${C.accent}` : "none" }}
            onMouseEnter={e => { if (!loaded) e.currentTarget.style.background = C.surfaceAlt; }}
            onMouseLeave={e => { if (!loaded) e.currentTarget.style.background = "transparent"; }}>
            <Spine dmg={r.dmg} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: loaded ? C.accent : C.text }}>
              {r.name}
              {loaded && <span style={{ color: C.accent, fontSize: TYPE.small, marginLeft: 8 }}>{t("loaded")}</span>}
              {r === best && !loaded && <span style={{ color: C.success, fontSize: TYPE.small, marginLeft: 8 }}>{t("best")}</span>}
            </span>
            <TierBadge tier={r.tier} />
            <span style={{ textAlign: "right", color: C.text }}>{fmtDps(r.dps)}</span>
            <span style={{ textAlign: "right", color: C.textMid }}>{fmtN(r.volley)}</span>
            <span style={{ textAlign: "right", color: C.rig, whiteSpace: "nowrap" }}>{range(r)}</span>
          </div>
        );
      })}
      </div>)}
    </div>
  );
}

export function FirepowerPanel({ s, ship, cs }) {
  const [picker, setPicker] = useState(false);
  const heatMounts = useMemo(() => {
    const out = [];
    for (const key of ["high", "mid", "low"]) (s.slots?.[key] ?? []).forEach((m, index) => {
      if (!m?.typeID || m.name === "[Empty]" || !isWeapon(m.typeID) || !validStatesFor(m).includes("overheated")) return;
      out.push({ key, index });
    });
    return out;
  }, [s.slots]);
  // The options the phone's Firepower card ranks ammo with (its csOpts).
  const opts = useMemo(() => {
    const pe = s.projectedEffects;
    return { implants: s.implants, boosters: s.boosters, factorInReload: s.factorInReload, externalBursts: s.externalBursts,
      projectedWebMult: pe?.webMult, projectedNeutGJs: pe?.neutGJs, projectedCapGJs: pe?.capGJs, projectedDebuffs: pe?.debuffs,
      projectedBoosts: pe?.boosts, projectedEcm: pe?.ecm, damageProfile: s.dmgProfile?.p, targetResists: s.tgtProfile?.r,
      pilotSec: s.slots?.pilotSec, systemSecurity: s.slots?.systemSecurity,
      fighters: (s.fighters ?? []).map(f => ({ name: f.name, qty: f.qty ?? 1, active: f.active, abilities: f.abilities })) };
  }, [s.implants, s.boosters, s.factorInReload, s.externalBursts, s.projectedEffects, s.dmgProfile, s.tgtProfile, s.slots, s.fighters]);
  if (!ship || !cs) return <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;

  const allHot = heatMounts.length > 0 && heatMounts.every(({ key, index }) => s.slots[key][index].state === "overheated");
  const toggleHeat = () => s.setSlots(prev => {
    const next = { ...prev };
    for (const { key } of heatMounts) if (next[key] === prev[key]) next[key] = (prev[key] ?? []).slice();
    for (const { key, index } of heatMounts) next[key][index] = { ...next[key][index], state: allHot ? "active" : "overheated" };
    return next;
  });

  const tgt = !!(s.tgtProfile?.r && s.tgtProfile.r.some(v => v > 0));
  const eff = cs.effective ?? {};
  const w = (tgt ? eff.weaponDps : cs.weaponDps) ?? {}, tot = (tgt ? eff.totalDps : cs.totalDps) ?? {}, vol = (tgt ? eff.totalVolley : cs.totalVolley) ?? {};
  const d = tgt ? eff.droneDps : cs.droneDps, f = tgt ? eff.fighterDps : cs.fighterDps;
  const spool = !!cs.hasSpoolWeapon;
  const rangeOf = (lo, hi) => spool ? `${fmtDps(lo)}–${fmtDps(hi)}` : fmtDps(lo);
  const clip = (tgt ? eff.clipVolley : cs.clipVolley) ?? {};
  const hasClip = (cs.clipWeapons ?? 0) > 0 && (clip.total ?? 0) > 0;
  const split = tot;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px 2px", flexWrap: "wrap", flex: "none" }}>
        {heatMounts.length > 0 && <Toggle on={allHot} onClick={toggleHeat} color={C.overheat} title={t("Overheat every gun")}>{t("Heat")}</Toggle>}
        <Toggle on={!!s.factorInReload} onClick={() => s.setFactorInReload(v => !v)} color={C.accent} title={t("Average reload time into DPS")}>{t("Reload")}</Toggle>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setPicker(true)}
          style={{ height: 26, padding: "0 11px", borderRadius: 13, fontSize: 12.5, cursor: "pointer", background: "transparent",
                   border: `1px solid ${tgt ? C.accent : C.borderStrong}`, color: tgt ? C.accent : C.textMid }}>
          {t("Target")}: {s.tgtProfile?.n ?? t("None (0%)")}
        </button>
      </div>
      <div style={{ flex: "none" }}>
        <KV min={150} rows={[
          [t("Weapon DPS"), rangeOf(w.total ?? 0, (tgt ? eff.weaponDpsMax : cs.weaponDpsMax) ?? 0), { color: C.accent }],
          [t("Drone DPS"), fmtDps((d?.total ?? 0) + (f?.total ?? 0))],
          [t("Total DPS"), rangeOf(tot.total ?? 0, (tgt ? eff.totalDpsMax : cs.totalDpsMax) ?? 0), { color: C.text, weight: 600 }],
          [t("Volley"), spool ? `${fmtDps(vol.total ?? 0)}–${fmtDps((tgt ? eff.totalVolleyMax : cs.totalVolleyMax) ?? 0)}` : fmtDps(vol.total ?? 0)],
          hasClip && [t("Clip Dmg"), fmtN(clip.total ?? 0), { title: (clip.total ?? 0).toLocaleString() }],
          hasClip && (cs.clipSeconds ?? 0) > 0 && [t("Clip Duration"), `${Math.round(cs.clipSeconds)}s${(cs.clipReloadSeconds ?? 0) > 0 ? ` (+${Math.round(cs.clipReloadSeconds)}s)` : ""}`],
          spool && (cs.weaponSpoolTimeS ?? 0) > 0 && [t("Spool-up time"), `${cs.weaponSpoolTimeS.toFixed(1)}s`],
        ]} />
        {(split.total ?? 0) > 0 && (
          <div style={{ display: "flex", gap: 12, padding: "0 12px 6px", fontSize: TYPE.small, flexWrap: "wrap" }}>
            {[["EM", split.em, DMG.em.color], ["Thermal", split.th, DMG.th.color], ["Kinetic", split.kin, DMG.kin.color], ["Explosive", split.exp, DMG.exp.color]]
              .filter(([, v]) => (v ?? 0) > 0.05).map(([l, v, c]) => (
                <span key={l}><span style={{ color: c, fontWeight: 500 }}>{fmtDps(v)}</span> <span style={{ color: C.textMid }}>{l}</span></span>
              ))}
          </div>
        )}
      </div>
      <AmmoSection s={s} ship={ship} opts={opts} />
      <span style={{ flex: 1 }} />
      {picker && <TargetProfileSheet current={s.tgtProfile} onSelect={s.setTgtProfile} onClose={() => setPicker(false)} />}
    </div>
  );
}
