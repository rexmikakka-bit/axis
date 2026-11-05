import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { calcFitStats, computeProjectedReps, tidByName, isT3Cruiser, t3cSlotLayout, TYPES } from "../calc.js";
import { lookupShip, getCompatibleCharges, NAVY_AMMO_PREFIXES } from "../lib/core.js";
import { metaOf } from "../lib/meta.js";
import { weaponRacks } from "../lib/ammo-compare.js";
import { buildExternalBursts, buildProjectedEffects } from "../lib/projection.js";
import { targetFitProfile } from "../lib/graph-target.js";
import { GRAPH_CONFIG, generateCurve, TARGET_PROFILES, TARGET_FIT, profileTarget, interpCurveAt,
         defaultEngRangeKm, usesEngRange, usesTimeWindow, DEFAULT_WINDOW_S } from "../components/GraphTab.jsx";
import { FitPickerSheet } from "../components/effects.jsx";
import Menu from "./Menu.jsx";
import { TYPE } from "./kit.jsx";

// The desktop Graphs window, after pyfa's graph window (docs/desktop.md, "Graphs"): several SOURCE
// fits plotted against several TARGETS at once — every source x target pair is one line, colour by
// source, dash by target — plus pyfa's Application Profile, which draws a fit's best ammo at every
// range as one stitched curve coloured by the winning round.
//
// Every curve is the mobile graph's own generateCurve with the parameters the mobile graph builds,
// so a line here and the same engagement on the phone are the same numbers.

const PREFS_KEY = "axis_desktop_graphs";
const SRC_COLORS = ["#4f8ef7", "#ef4444", "#22c55e", "#f59e0b", "#a78bfa", "#22d3ee", "#f472b6", "#eab308"];
const DASHES = ["", "7 4", "2 3", "9 3 2 3", "4 2"];
const APP_PROFILE = "appprofile";
const TARGET_CATS = new Set(["damage", APP_PROFILE]);
const GRAPH_TYPES = [...GRAPH_CONFIG.map(g => ({ key: g.key, label: g.label })),
  { key: APP_PROFILE, label: () => t("Application profile") }];

const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"); } catch { return {}; } };
const writePrefs = (p) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* not persisted */ } };

// pyfa's ammo colours (graphs/data/fitApplicationProfile/graph.py AMMO_COLORS), by base name, so the
// stitched curve's colours mean the same round in both tools. Missiles take their damage type's.
const AMMO_COLORS = {
  Null: "#b3b3a6", Void: "#801a33", Spike: "#c2ff2b", Javelin: "#70fb00", Antimatter: "#5a4040", Iridium: "#1ab3b3", Lead: "#72787d",
  Plutonium: "#009644", Thorium: "#947f73", Uranium: "#5ee649", Tungsten: "#3a3a70", Iron: "#994d4d",
  Scorch: "#eb4fff", Conflagration: "#00b840", Gleam: "#b5915e", Aurora: "#a61237", Multifrequency: "#cccccc", Gamma: "#0566f2",
  Xray: "#00bd86", Ultraviolet: "#6b00bd", Standard: "#e6b300", Infrared: "#f24005", Microwave: "#f28e05", Radio: "#e30a0a",
  Quake: "#c79a52", Hail: "#ff9900", Tremor: "#8a7a5f", Barrage: "#c45302", "Carbonized Lead": "#c051d6", "Depleted Uranium": "#6700cf",
  EMP: "#19c2c2", Fusion: "#de8c21", Nuclear: "#7ab80f", "Phased Plasma": "#b80f36", Proton: "#377475", "Titanium Sabot": "#5a7fa0",
  Occult: "#bd0026", Mystic: "#fcae91", Tetryon: "#f03b20", Baryon: "#fd8d3c", Meson: "#fecc5c",
  Mjolnir: "#4d90d9", Inferno: "#d9584f", Scourge: "#c1c9d3", Nova: "#e0932e",
};
const AMMO_KEYS = Object.keys(AMMO_COLORS).sort((a, b) => b.length - a.length);
function ammoColor(name) {
  const k = AMMO_KEYS.find(k => name.includes(k));
  if (k) return AMMO_COLORS[k];
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 65% 60%)`;
}
const chargeDamage = (tid) => { const a = TYPES[String(tid)]?.attrs ?? TYPES[String(tid)]?.a ?? {};
  return (a.emDamage ?? 0) + (a.thermalDamage ?? 0) + (a.kineticDamage ?? 0) + (a.explosiveDamage ?? 0); };
const isNavy = (name) => NAVY_AMMO_PREFIXES.some(p => name.startsWith(p));

/** A saved fit, ready to graph: its hull, stats and outgoing projection, on its own pilot and links. */
function sourceData(s, ship, fit, extraOpts = {}) {
  let sh = lookupShip(ship) ?? { name: ship, typeID: tidByName(ship) };
  if (isT3Cruiser(sh.name)) {
    const l = t3cSlotLayout((fit.slots?.subsystems ?? []).filter(x => x?.typeID));
    sh = { ...sh, turrets: l.turrets, launchers: l.launchers, hiSlots: l.hiSlots, medSlots: l.medSlots, lowSlots: l.lowSlots, rigSlots: l.rigSlots };
  }
  const skills = s.sourceSkills(fit);
  const eb = buildExternalBursts(fit.cmdFits, s.fitsDB, s.sourceSkills);
  const pe = buildProjectedEffects({ projFits: fit.projFits, fitsDB: s.fitsDB, sourceSkills: s.sourceSkills, shipName: ship, slots: fit.slots, skills, externalBursts: eb });
  const opts = { implants: fit.implants, boosters: fit.boosters, factorInReload: s.factorInReload, externalBursts: eb,
    projectedWebMult: pe.webMult, projectedNeutGJs: pe.neutGJs, projectedCapGJs: pe.capGJs, projectedDebuffs: pe.debuffs,
    projectedBoosts: pe.boosts, pilotSec: fit.slots?.pilotSec, systemSecurity: fit.slots?.systemSecurity,
    fighters: (fit.fighters ?? []).map(f => ({ name: f.name, qty: f.qty ?? 1, active: f.active, abilities: f.abilities })), ...extraOpts };
  const calc = (slots) => { try { return calcFitStats(sh, slots, fit.drones ?? [], skills, opts) ?? null; } catch { return null; } };
  let ownProj = null;
  try { ownProj = computeProjectedReps({ name: ship, typeID: tidByName(ship) }, fit.slots, skills, { implants: fit.implants, boosters: fit.boosters, drones: fit.drones, externalBursts: eb }); } catch { /* none */ }
  return { ship: sh, skills, cs: calc(fit.slots), ownProj, calc };
}

/** What a target presents: sig, speed, the scrammed variant and what is already painting/webbing it. */
function targetData(s, tg) {
  if (tg.kind === "fit") {
    const fit = s.fitsDB?.[tg.ship]?.find(f => f.name === tg.fitName);
    if (!fit) return null;
    const p = targetFitProfile(tg.ship, fit, s.sourceSkills(fit), {}, { fitsDB: s.fitsDB, sourceSkills: s.sourceSkills });
    return p && { profileKey: TARGET_FIT, sig: p.sig, vel: p.vel, noMwd: p.scrammed ?? null, incoming: p.incoming, label: `${tg.ship} · ${tg.fitName}` };
  }
  const base = profileTarget(tg.profile, !!tg.mwd);
  if (!base) return null;
  const P = TARGET_PROFILES[tg.profile];
  return { profileKey: tg.profile, sig: base.sig, vel: base.vel, noMwd: tg.mwd && P.mwdSig != null ? profileTarget(tg.profile, false) : null, incoming: null,
           label: `${P.label()}${tg.mwd ? " (MWD)" : ""}` };
}

function curveParams(cat, src, tgt, inp) {
  const maxVel = src.cs?.maxVelocityAB ?? src.cs?.maxVelocity ?? src.ship?.maxVelocity ?? 500;
  const selfVel = maxVel * (inp.atkSpeed / 100);
  const tgtVel = (tgt?.vel ?? 0) * (inp.tgtSpeed / 100);
  return { targetProfile: tgt?.profileKey ?? "ideal", shipVelFrac: selfVel / (src.ship?.maxVelocity || 500), ship: src.ship ?? {}, cs: src.cs,
    ownProj: src.ownProj, selfVel, targetVel: tgtVel, selfAngle: inp.atkAngle, targetAngle: inp.tgtAngle, tgtSig: tgt?.sig, tgtSpeed: tgtVel,
    tgtNoMwd: tgt?.noMwd ?? null, tgtIncoming: tgt?.incoming ?? null, xZoom: 1,
    engRangeKm: inp.rangeKm ?? defaultEngRangeKm(cat === APP_PROFILE ? "damage" : cat, src.cs), timeWindowS: inp.windowS ?? DEFAULT_WINDOW_S };
}

/**
 * pyfa's Application Profile for one source and target: every damaging round the fit's main weapon
 * can load (filtered by meta), loaded into the whole rack in turn; at each range the best one wins.
 * Returns {pts, segments:[{ammo, color, from, to}], xMax}. One whole-fit calculation per round, so
 * the caller runs it off the render.
 */
function appProfile(s, fit, src, tgt, inp, yKey, meta) {
  const racks = weaponRacks(fit.slots).sort((a, b) => b.mounts.length - a.mounts.length);
  const rack = racks[0];
  if (!rack) return null;
  const first = fit.slots[rack.mounts[0].key][rack.mounts[0].index];
  const charges = getCompatibleCharges(first).filter(c => chargeDamage(c.typeID) > 0).filter(c => {
    if (meta === "all") return true;
    const m = metaOf(c.typeID, "T1");
    return meta === "navy" ? (m === "T1" || isNavy(c.name) || m === "Faction") : (m === "T1" && !isNavy(c.name));
  });
  const curves = [];
  for (const c of charges) {
    const slots = { ...fit.slots };
    for (const { key } of rack.mounts) slots[key] = (slots[key] ?? []).slice();
    for (const { key, index } of rack.mounts) slots[key][index] = { ...slots[key][index], ammo: c.name };
    const cs = src.calc(slots);
    if (!cs) continue;
    const r = generateCurve("damage", yKey, "dist", curveParams(APP_PROFILE, { ...src, cs }, tgt, inp));
    curves.push({ name: c.name, pts: r.pts, xMax: r.xMax });
  }
  if (!curves.length) return null;
  const xMax = Math.max(...curves.map(c => c.xMax));
  const N = 200, pts = [], segments = [];
  for (let i = 0; i <= N; i++) {
    const x = (xMax * i) / N;
    let best = null, by = -1;
    for (const c of curves) { const y = x <= c.xMax ? (interpCurveAt(c.pts, x) ?? 0) : 0; if (y > by) { by = y; best = c; } }
    pts.push([x, by]);
    const last = segments[segments.length - 1];
    if (!last || last.ammo !== best.name) segments.push({ ammo: best.name, color: ammoColor(best.name), from: x, to: x });
    else last.to = x;
  }
  return { pts, segments, xMax, rack: `${rack.mounts.length}× ${rack.name}` };
}

// ── The plot ─────────────────────────────────────────────────────────────────────────────────
function niceTicks(max, n = 5) {
  if (!(max > 1e-6)) return [0];
  const raw = max / n, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const out = []; for (let v = 0; v <= max + step * 1e-6; v += step) out.push(+v.toFixed(6));
  return [...new Set(out)];
}
const fmt = (v) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);

function Plot({ series, xLabel, yLabel, showY0 }) {
  const box = useRef(null);
  const [size, setSize] = useState({ w: 600, h: 360 });
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(200, e.contentRect.width), h: Math.max(160, e.contentRect.height) }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const [hx, setHx] = useState(null);
  const pad = { l: 52, r: 14, t: 12, b: 34 };
  const W = size.w, H = size.h, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const xMax = Math.max(1e-9, ...series.map(s => s.xMax ?? 0));
  const yMaxRaw = Math.max(0, ...series.flatMap(s => s.pts.map(p => p[1] ?? 0)));
  const yMin = showY0 ? 0 : Math.min(...series.flatMap(s => s.pts.map(p => p[1] ?? 0)), yMaxRaw);
  const yMax = yMaxRaw > yMin ? yMaxRaw * 1.05 : yMin + 1;
  const X = (x) => pad.l + (x / xMax) * iw, Y = (y) => pad.t + ih - ((y - yMin) / (yMax - yMin)) * ih;
  const path = (pts) => pts.filter(p => p[1] != null).map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
  const xt = niceTicks(xMax), yt = niceTicks(yMax).filter(v => v >= yMin);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left - pad.l) / iw) * xMax;
    setHx(x >= 0 && x <= xMax ? x : null);
  };
  return (
    <div ref={box} style={{ flex: 1, minHeight: 0, position: "relative" }}>
      <svg width={W} height={H} onMouseMove={onMove} onMouseLeave={() => setHx(null)} style={{ display: "block" }}>
        {yt.map(v => <g key={`y${v}`}><line x1={pad.l} x2={W - pad.r} y1={Y(v)} y2={Y(v)} stroke={C.border} />
          <text x={pad.l - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill={C.textMid}>{fmt(v)}</text></g>)}
        {xt.map(v => <g key={`x${v}`}><line x1={X(v)} x2={X(v)} y1={pad.t} y2={pad.t + ih} stroke={`${C.border}88`} />
          <text x={X(v)} y={H - pad.b + 16} textAnchor="middle" fontSize="11" fill={C.textMid}>{fmt(v)}</text></g>)}
        <text x={pad.l + iw / 2} y={H - 4} textAnchor="middle" fontSize="11.5" fill={C.textMid}>{xLabel}</text>
        <text x={12} y={pad.t + ih / 2} textAnchor="middle" fontSize="11.5" fill={C.textMid} transform={`rotate(-90 12 ${pad.t + ih / 2})`}>{yLabel}</text>
        {series.map(s => s.segments
          ? s.segments.map((g, i) => {
              const seg = s.pts.filter(p => p[0] >= g.from - 1e-9 && p[0] <= g.to + (xMax / 200) + 1e-9);
              return <g key={`${s.key}:${i}`}>
                <path d={path(seg)} fill="none" stroke={g.color} strokeWidth="2.25" strokeDasharray={s.dash} />
                {s.labels && X(g.to) - X(g.from) > 40 && <text x={X(g.from) + 4} y={Y(interpCurveAt(s.pts, g.from) ?? 0) - 6} fontSize="10.5" fill={g.color}>{g.ammo.replace(/ [SMLX]+$/, "")}</text>}
              </g>;
            })
          : <path key={s.key} d={path(s.pts)} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} />)}
        {hx != null && <line x1={X(hx)} x2={X(hx)} y1={pad.t} y2={pad.t + ih} stroke={C.textMid} strokeDasharray="3 3" />}
        {hx != null && series.map(s => { const y = interpCurveAt(s.pts, hx); return y == null ? null : <circle key={`c${s.key}`} cx={X(hx)} cy={Y(y)} r="3.5" fill={s.color} />; })}
      </svg>
      {hx != null && (
        <div style={{ position: "absolute", top: pad.t + 6, left: Math.min(X(hx) + 12, W - 250), pointerEvents: "none", background: `${C.surface}ee`,
                      border: `1px solid ${C.borderStrong}`, borderRadius: 6, padding: "6px 9px", fontSize: 12, lineHeight: 1.45, minWidth: 160, maxWidth: 240 }}>
          <div style={{ color: C.textMid }}>{xLabel}: <span style={{ color: C.text }}>{fmt(hx)}</span></div>
          {series.map(s => {
            const y = interpCurveAt(s.pts, hx);
            const seg = s.segments?.find(g => hx >= g.from - 1e-9 && hx <= g.to + xMax / 200);
            return y == null ? null : (
              <div key={s.key} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: seg?.color ?? s.color, flex: "none" }} />
                <span style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{s.short}{seg ? ` · ${seg.ammo}` : ""}</span>
                <span style={{ color: C.text, fontVariantNumeric: "tabular-nums" }}>{fmt(y)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────────────────────────
const Label = ({ children }) => <div style={{ fontSize: TYPE.section, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid, margin: "12px 0 5px" }}>{children}</div>;
const selectStyle = { width: "100%", height: 28, fontSize: 12.5, background: C.bg, color: C.text, border: `1px solid ${C.borderStrong}`, borderRadius: 5, padding: "0 6px" };
function Slider({ label, value, onChange, min = 0, max = 100, unit = "%" }) {
  return (
    <label style={{ display: "grid", gridTemplateColumns: "82px minmax(0,1fr) 50px", alignItems: "center", gap: 6, fontSize: 12.5, color: C.textMid, minHeight: 26 }}>
      {label}<input type="range" min={min} max={max} value={value} onChange={e => onChange(+e.target.value)} style={{ accentColor: C.accent }} />
      <span style={{ textAlign: "right", color: C.text, fontVariantNumeric: "tabular-nums" }}>{value}{unit}</span>
    </label>
  );
}
const ListRow = ({ swatch, label, onRemove, children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 7, minHeight: 26, fontSize: 12.5 }}>
    {swatch}<span title={typeof label === "string" ? label : undefined} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.text }}>{label}</span>
    {children}
    {onRemove && <button type="button" onClick={onRemove} aria-label={t("Remove")} style={{ border: "none", background: "none", color: C.textMid, cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>}
  </div>
);
const addBtn = { height: 24, padding: "0 9px", borderRadius: 5, fontSize: 12, cursor: "pointer", background: "transparent", border: `1px solid ${C.borderStrong}`, color: C.textMid };

export default function GraphsPanel({ s }) {
  const saved = useMemo(readPrefs, []);
  const [cat, setCat] = useState(saved.cat ?? "damage");
  const [yKey, setY] = useState(saved.y ?? null);
  const [xKey, setX] = useState(saved.x ?? null);
  const [sources, setSources] = useState(saved.sources ?? []);
  const [targets, setTargets] = useState(saved.targets ?? [{ kind: "profile", profile: "cruiser", mwd: false }]);
  const [inp, setInp] = useState({ atkSpeed: 0, atkAngle: 0, tgtSpeed: 100, tgtAngle: 90, rangeKm: null, windowS: null, ...(saved.inp ?? {}) });
  const [meta, setMeta] = useState(saved.meta ?? "navy");
  const [ignoreResists, setIgnoreResists] = useState(!!saved.ignoreResists);
  const [showY0, setShowY0] = useState(saved.showY0 ?? true);
  const [picker, setPicker] = useState(null);   // "source" | "target"
  useEffect(() => { writePrefs({ cat, y: yKey, x: xKey, sources, targets, inp, meta, ignoreResists, showY0 }); }, [cat, yKey, xKey, sources, targets, inp, meta, ignoreResists, showY0]);

  // With no sources chosen, graph the fit being edited.
  const srcList = sources.length ? sources : (s.activeFit?.ship ? [{ ship: s.activeFit.ship, fitName: s.activeFit.fitName, auto: true }] : []);
  const cfg = cat === APP_PROFILE ? null : GRAPH_CONFIG.find(g => g.key === cat);
  const yAxes = cfg ? cfg.yAxes : [{ key: "dps", label: () => t("DPS") }, { key: "volley", label: () => t("Volley") }];
  const xAxes = cfg ? cfg.xAxes : [{ key: "dist", label: () => t("Distance, km") }];
  const y = yAxes.find(a => a.key === yKey)?.key ?? yAxes[0].key;
  const x = xAxes.find(a => a.key === xKey)?.key ?? xAxes[0].key;
  const hasTargets = TARGET_CATS.has(cat);
  const tgtList = hasTargets ? targets : [null];

  const srcData = useMemo(() => srcList.map(sc => {
    const fit = s.fitsDB?.[sc.ship]?.find(f => f.name === sc.fitName);
    return fit ? { sc, fit, d: sourceData(s, sc.ship, fit, ignoreResists ? {} : { targetResists: s.tgtProfile?.r }) } : null;
  }), [JSON.stringify(srcList), s.fitsDB, s.sourceSkills, s.factorInReload, s.tgtProfile, ignoreResists]);   // eslint-disable-line react-hooks/exhaustive-deps
  const tgtData = useMemo(() => tgtList.map(tg => tg ? targetData(s, tg) : null), [JSON.stringify(tgtList), s.fitsDB, s.sourceSkills]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Ordinary curves are cheap enough to compute in the render; the application profile is one
  // whole-fit calculation per round, so it runs off the render and lands when ready.
  const plain = useMemo(() => {
    if (cat === APP_PROFILE) return [];
    const out = [];
    srcData.forEach((sd, i) => { if (!sd) return; tgtList.forEach((tg, j) => {
      const td = tgtData[j];
      if (hasTargets && !td) return;
      const r = generateCurve(cat, y, x, curveParams(cat, sd.d, td, inp));
      out.push({ key: `${i}:${j}`, pts: r.pts, xMax: r.xMax, color: SRC_COLORS[i % SRC_COLORS.length], dash: DASHES[j % DASHES.length],
                 short: hasTargets ? `${sd.sc.ship} → ${td.label}` : `${sd.sc.ship} · ${sd.sc.fitName}`, i, j });
    }); });
    return out;
  }, [cat, y, x, srcData, tgtData, inp, hasTargets]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [profiles, setProfiles] = useState({ key: null, series: [] });
  const profKey = cat === APP_PROFILE ? JSON.stringify([srcList, tgtList, inp, meta, y, ignoreResists]) : null;
  useEffect(() => {
    if (!profKey) return;
    let dead = false;
    const jobs = [];
    srcData.forEach((sd, i) => { if (sd) tgtList.forEach((tg, j) => { if (tgtData[j]) jobs.push([sd, i, tgtData[j], j]); }); });
    const done = [];
    const step = (k) => {
      if (dead) return;
      if (k >= jobs.length) { setProfiles({ key: profKey, series: done }); return; }
      const [sd, i, td, j] = jobs[k];
      const r = appProfile(s, sd.fit, sd.d, td, inp, y, meta);
      // Round names only on each fit's first target: its other targets' curves run alongside and the labels pile up.
      if (r) done.push({ key: `${i}:${j}`, ...r, labels: !done.some(d => d.i === i), i, color: SRC_COLORS[i % SRC_COLORS.length], dash: DASHES[j % DASHES.length], short: `${sd.sc.ship} → ${td.label}` });
      setTimeout(() => step(k + 1), 0);
    };
    setTimeout(() => step(0), 0);
    return () => { dead = true; };
  }, [profKey, srcData, tgtData]);   // eslint-disable-line react-hooks/exhaustive-deps
  const series = cat === APP_PROFILE ? (profiles.key === profKey ? profiles.series : []) : plain;
  const busy = cat === APP_PROFILE && profiles.key !== profKey;

  const firstCs = srcData.find(Boolean)?.d.cs;
  const showRange = cat !== APP_PROFILE && usesEngRange(cat, x);
  const showWindow = cat !== APP_PROFILE && usesTimeWindow(cat, y, x);
  const setI = (k, v) => setInp(p => ({ ...p, [k]: v }));
  const swatch = (i) => <span style={{ width: 14, height: 3, borderRadius: 2, background: SRC_COLORS[i % SRC_COLORS.length], flex: "none" }} />;
  const dashSwatch = (j) => <svg width="18" height="6" style={{ flex: "none" }}><line x1="0" y1="3" x2="18" y2="3" stroke={C.text} strokeWidth="2" strokeDasharray={DASHES[j % DASHES.length]} /></svg>;
  const xLabel = xAxes.find(a => a.key === x)?.label() ?? "";
  const yLabel = yAxes.find(a => a.key === y)?.label() ?? "";

  return (
    <div style={{ height: "100%", display: "flex", minHeight: 0 }}>
      <div style={{ width: 250, flex: "none", overflowY: "auto", padding: "4px 12px 12px", borderRight: `1px solid ${C.border}` }}>
        <Label>{t("Graph")}</Label>
        <select value={cat} onChange={e => setCat(e.target.value)} style={selectStyle} aria-label={t("Graph")}>
          {GRAPH_TYPES.map(g => <option key={g.key} value={g.key}>{g.label()}</option>)}
        </select>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
          <select value={y} onChange={e => setY(e.target.value)} style={selectStyle} aria-label={t("Y axis")}>{yAxes.map(a => <option key={a.key} value={a.key}>{a.label()}</option>)}</select>
          <select value={x} onChange={e => setX(e.target.value)} style={selectStyle} aria-label={t("X axis")}>{xAxes.map(a => <option key={a.key} value={a.key}>{a.label()}</option>)}</select>
        </div>

        <Label>{t("Fits")}</Label>
        {srcList.map((sc, i) => <ListRow key={`${sc.ship}:${sc.fitName}`} swatch={swatch(i)} label={`${sc.ship} · ${sc.fitName}`}
          onRemove={sc.auto ? undefined : () => setSources(l => l.filter((_, k) => k !== i))} />)}
        {!srcList.length && <div style={{ fontSize: 12.5, color: C.textMid }}>{t("Open a fit, or add one.")}</div>}
        <button type="button" style={{ ...addBtn, marginTop: 4 }} onClick={() => setPicker("source")}>+ {t("Add fit")}</button>

        {hasTargets && <>
          <Label>{t("Targets")}</Label>
          {targets.map((tg, j) => {
            const P = tg.kind === "profile" ? TARGET_PROFILES[tg.profile] : null;
            return (
              <ListRow key={j} swatch={dashSwatch(j)} label={tg.kind === "fit" ? `${tg.ship} · ${tg.fitName}` : P?.label() ?? tg.profile}
                onRemove={targets.length > 1 ? () => setTargets(l => l.filter((_, k) => k !== j)) : undefined}>
                {P?.mwdSig != null && <button type="button" aria-pressed={!!tg.mwd} onClick={() => setTargets(l => l.map((x2, k) => k === j ? { ...x2, mwd: !x2.mwd } : x2))}
                  style={{ ...addBtn, height: 20, padding: "0 6px", color: tg.mwd ? C.accent : C.textMid, borderColor: tg.mwd ? C.accent : C.borderStrong }}>MWD</button>}
              </ListRow>
            );
          })}
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <Menu label={`+ ${t("Profile")}`} align="left" buttonStyle={{ ...addBtn }} items={Object.keys(TARGET_PROFILES).map(k => ({
              label: TARGET_PROFILES[k].label(), onSelect: () => setTargets(l => [...l, { kind: "profile", profile: k, mwd: false }]) }))} />
            <button type="button" style={addBtn} onClick={() => setPicker("target")}>+ {t("Fit")}</button>
          </div>
        </>}

        {(hasTargets || cat === "damage") && <>
          <Label>{t("Engagement")}</Label>
          <Slider label={t("Your speed")} value={inp.atkSpeed} onChange={v => setI("atkSpeed", v)} />
          <Slider label={t("Your angle")} value={inp.atkAngle} max={180} unit="°" onChange={v => setI("atkAngle", v)} />
          <Slider label={t("Target speed")} value={inp.tgtSpeed} onChange={v => setI("tgtSpeed", v)} />
          <Slider label={t("Target angle")} value={inp.tgtAngle} max={180} unit="°" onChange={v => setI("tgtAngle", v)} />
        </>}
        {showRange && <Slider label={t("Range")} min={0} max={250} unit=" km" value={Math.round(inp.rangeKm ?? defaultEngRangeKm(cat, firstCs))} onChange={v => setI("rangeKm", v)} />}
        {showWindow && <Slider label={t("Time window")} min={10} max={600} unit=" s" value={inp.windowS ?? DEFAULT_WINDOW_S} onChange={v => setI("windowS", v)} />}
        {cat === APP_PROFILE && <>
          <Label>{t("Ammo")}</Label>
          <div style={{ display: "flex", gap: 4 }}>
            {[["t1", "T1"], ["navy", t("Navy")], ["all", t("All")]].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={meta === k} onClick={() => setMeta(k)}
                style={{ ...addBtn, flex: 1, color: meta === k ? C.accent : C.textMid, borderColor: meta === k ? C.accent : C.borderStrong, background: meta === k ? C.accentLight : "transparent" }}>{l}</button>
            ))}
          </div>
        </>}
        <Label>{t("Display")}</Label>
        {(cat === "damage" || cat === APP_PROFILE) && <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 12.5, color: C.text, minHeight: 24 }}>
          <input type="checkbox" checked={ignoreResists} onChange={() => setIgnoreResists(v => !v)} style={{ accentColor: C.accent }} />{t("Ignore target resists")}
        </label>}
        <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 12.5, color: C.text, minHeight: 24 }}>
          <input type="checkbox" checked={showY0} onChange={() => setShowY0(v => !v)} style={{ accentColor: C.accent }} />{t("Always show Y = 0")}
        </label>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: "6px 8px 8px" }}>
        {busy && <div style={{ fontSize: 12.5, color: C.textMid, padding: "2px 4px" }}>{t("Comparing ammo…")}</div>}
        {!series.length && !busy
          ? <div style={{ margin: "auto", fontSize: 13, color: C.textMid }}>{t("Nothing to graph for these fits.")}</div>
          : <Plot series={series} xLabel={xLabel} yLabel={cat === APP_PROFILE ? `${yLabel} · ${t("best ammo")}` : yLabel} showY0={showY0} />}
        {series.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", padding: "6px 4px 0", fontSize: 12 }}>
            {series.map(sr => (
              <span key={sr.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.textMid }}>
                <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke={sr.color} strokeWidth="2.5" strokeDasharray={sr.dash} /></svg>
                {sr.short}{sr.rack ? ` · ${sr.rack}` : ""}
              </span>
            ))}
          </div>
        )}
      </div>

      {picker && <FitPickerSheet title={picker === "source" ? t("Graph a fit") : t("Graph against a fit")} fitsDB={s.fitsDB} pinned={s.openFitTabs}
        onSelect={(ship, fit) => {
          if (picker === "source") setSources(l => [...(l.length ? l : srcList.map(({ ship: a, fitName: b }) => ({ ship: a, fitName: b }))), { ship, fitName: fit.name }]);
          else setTargets(l => [...l, { kind: "fit", ship, fitName: fit.name }]);
        }} onClose={() => setPicker(null)} />}
    </div>
  );
}
