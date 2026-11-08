import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { calcFitStats, computeProjectedReps, calcAngularSpeed, tidByName, isT3Cruiser, t3cSlotLayout, TYPES } from "../calc.js";
import { lookupShip, getCompatibleCharges, NAVY_AMMO_PREFIXES } from "../lib/core.js";
import { metaOf } from "../lib/meta.js";
import { weaponRacks } from "../lib/ammo-compare.js";
import { buildExternalBursts, buildProjectedEffects } from "../lib/projection.js";
import { targetFitProfile } from "../lib/graph-target.js";
import { GRAPH_CONFIG, generateCurve, TARGET_PROFILES, TARGET_FIT, profileTarget, interpCurveAt,
         defaultEngRangeKm, engagementDistanceM, usesEngRange, usesTimeWindow, DEFAULT_WINDOW_S, VectorCompass, ScrubField, IDEAL_SIG, COMPASS_DIRS } from "../components/GraphTab.jsx";
import { FitPickerSheet } from "../components/effects.jsx";
import { tabFits } from "./tab-fits.js";
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
  const pe = buildProjectedEffects({ projFits: fit.projFits, fitsDB: s.fitsDB, sourceSkills: s.sourceSkills, shipName: ship, slots: fit.slots, skills, externalBursts: eb, implants: fit.implants, boosters: fit.boosters });
  const opts = { implants: fit.implants, boosters: fit.boosters, factorInReload: s.factorInReload, externalBursts: eb,
    projectedWebMult: pe.webMult, projectedNeutGJs: pe.neutGJs, projectedCapGJs: pe.capGJs, projectedDebuffs: pe.debuffs,
    projectedBoosts: pe.boosts, pilotSec: fit.slots?.pilotSec, systemSecurity: fit.slots?.systemSecurity,
    fighters: (fit.fighters ?? []).map(f => ({ name: f.name, qty: f.qty ?? 1, active: f.active, abilities: f.abilities })), ...extraOpts };
  const calc = (slots) => { try { return calcFitStats(sh, slots, fit.drones ?? [], skills, opts) ?? null; } catch { return null; } };
  let ownProj = null;
  try { ownProj = computeProjectedReps({ name: ship, typeID: tidByName(ship) }, fit.slots, skills, { implants: fit.implants, boosters: fit.boosters, drones: fit.drones, externalBursts: eb }); } catch { /* none */ }
  return { ship: sh, skills, cs: calc(fit.slots), ownProj, calc };
}

const num = (v) => typeof v === "number" && Number.isFinite(v);
const customLabel = (tg) => `${t("Custom")} · ${num(tg.sig) && tg.sig < IDEAL_SIG ? `${Math.round(tg.sig)} m` : "∞"} · ${Math.round(tg.vel ?? 0)} m/s`;

/** What a target presents: sig, speed, the scrammed variant and what is already painting/webbing it. */
function targetData(s, tg) {
  if (tg.kind === "fit") {
    const fit = s.fitsDB?.[tg.ship]?.find(f => f.name === tg.fitName);
    if (!fit) return null;
    const p = targetFitProfile(tg.ship, fit, s.sourceSkills(fit), {}, { fitsDB: s.fitsDB, sourceSkills: s.sourceSkills });
    return p && { profileKey: TARGET_FIT, sig: p.sig, vel: p.vel, noMwd: p.scrammed ?? null, incoming: p.incoming, label: `${tg.ship} · ${tg.fitName}` };
  }
  // A typed sig and speed. No MWD-off variant: a typed 200 m can't be split into hull and bloom, so
  // your scrambler has nothing to cut (the phone's custom target says the same).
  if (tg.kind === "custom") {
    const sig = num(tg.sig) ? Math.max(0, tg.sig) : IDEAL_SIG, vel = num(tg.vel) ? Math.max(0, tg.vel) : 0;
    return { profileKey: "custom", sig, vel, noMwd: null, incoming: null, label: customLabel(tg) };
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

// A typed X maximum has to widen the curve's DATA, not just the axis, or a line stops dead where its
// own domain ended. generateCurve already does that through xZoom (the phone's axis zoom); the zoom
// that lands one curve exactly on `xTo` is its own auto range over xTo, so each curve gets its own.
function curveTo(cat, yKey, xKey, params, xTo) {
  const r = generateCurve(cat, yKey, xKey, params);
  if (!(xTo > 0) || !(r.xMax > 0) || Math.abs(r.xMax - xTo) < 1e-9) return r;
  return generateCurve(cat, yKey, xKey, { ...params, xZoom: r.xMax / xTo });
}

/**
 * pyfa's Application Profile for one source and target: every damaging round the fit's main weapon
 * can load (filtered by meta), loaded into the whole rack in turn; at each range the best one wins.
 * Returns {pts, segments:[{ammo, color, from, to}], xMax}. One whole-fit calculation per round, so
 * the caller runs it off the render.
 */
function appProfile(s, fit, src, tgt, inp, yKey, meta, xTo = null) {
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
    const r = curveTo("damage", yKey, "dist", curveParams(APP_PROFILE, { ...src, cs }, tgt, inp), xTo);
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

// `xFixed` / `yFixed` are typed axis maximums (null = fit to the data). Lines past them are clipped.
// `pinX` is a point the user clicked to keep: its line and readout stay put when the pointer leaves,
// and the hover readout takes over only while the pointer is on the plot. Clicking the pin clears it.
function Plot({ series, xLabel, yLabel, showY0, xFixed = null, yFixed = null, pinX = null, onPin }) {
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
  const xMax = xFixed > 0 ? xFixed : Math.max(1e-9, ...series.map(s => s.xMax ?? 0));
  const yMaxRaw = Math.max(0, ...series.flatMap(s => s.pts.map(p => p[1] ?? 0)));
  const yMinAuto = showY0 ? 0 : Math.min(...series.flatMap(s => s.pts.map(p => p[1] ?? 0)), yMaxRaw);
  const yMin = yFixed > 0 ? Math.min(yMinAuto, yFixed * 0.999) : yMinAuto;
  const yMax = yFixed > 0 ? yFixed : yMaxRaw > yMin ? yMaxRaw * 1.05 : yMin + 1;
  const clipId = useRef(`gclip${Math.random().toString(36).slice(2)}`).current;
  const X = (x) => pad.l + (x / xMax) * iw, Y = (y) => pad.t + ih - ((y - yMin) / (yMax - yMin)) * ih;
  const path = (pts) => pts.filter(p => p[1] != null).map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
  const xt = niceTicks(xMax), yt = niceTicks(yMax).filter(v => v >= yMin);
  const xAt = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left - pad.l) / iw) * xMax;
    return x >= 0 && x <= xMax ? x : null;
  };
  const onMove = (e) => setHx(xAt(e));
  const pin = pinX != null && pinX >= 0 && pinX <= xMax ? pinX : null;
  // From the click's own position, not `hx`: a click can land before the hover state has rendered.
  const onClick = (e) => {
    const cx = xAt(e);
    if (cx == null || !onPin) return;
    onPin(pin != null && Math.abs(X(cx) - X(pin)) <= 6 ? null : cx);
  };
  // The readout follows the pointer while it is on the plot, and falls back to the pin.
  const tipX = hx ?? pin;
  return (
    <div ref={box} style={{ flex: 1, minHeight: 0, position: "relative" }}>
      <svg width={W} height={H} onMouseMove={onMove} onMouseLeave={() => setHx(null)} onClick={onClick}
        style={{ display: "block", cursor: onPin ? "crosshair" : undefined }}>
        <title>{pin != null ? t("Click to move the pin; click the pin to clear it") : t("Click to pin this point")}</title>
        {yt.map(v => <g key={`y${v}`}><line x1={pad.l} x2={W - pad.r} y1={Y(v)} y2={Y(v)} stroke={C.border} />
          <text x={pad.l - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill={C.textMid}>{fmt(v)}</text></g>)}
        {xt.map(v => <g key={`x${v}`}><line x1={X(v)} x2={X(v)} y1={pad.t} y2={pad.t + ih} stroke={`${C.border}88`} />
          <text x={X(v)} y={H - pad.b + 16} textAnchor="middle" fontSize="11" fill={C.textMid}>{fmt(v)}</text></g>)}
        <text x={pad.l + iw / 2} y={H - 4} textAnchor="middle" fontSize="11.5" fill={C.textMid}>{xLabel}</text>
        <text x={12} y={pad.t + ih / 2} textAnchor="middle" fontSize="11.5" fill={C.textMid} transform={`rotate(-90 12 ${pad.t + ih / 2})`}>{yLabel}</text>
        <defs><clipPath id={clipId}><rect x={pad.l} y={pad.t - 2} width={iw + 1} height={ih + 4} /></clipPath></defs>
        <g clipPath={`url(#${clipId})`}>
        {series.map(s => s.segments
          ? s.segments.map((g, i) => {
              const seg = s.pts.filter(p => p[0] >= g.from - 1e-9 && p[0] <= g.to + (xMax / 200) + 1e-9);
              return <g key={`${s.key}:${i}`}>
                <path d={path(seg)} fill="none" stroke={g.color} strokeWidth="2.25" strokeDasharray={s.dash} />
                {s.labels && X(g.to) - X(g.from) > 40 && <text x={X(g.from) + 4} y={Y(interpCurveAt(s.pts, g.from) ?? 0) - 6} fontSize="10.5" fill={g.color}>{g.ammo.replace(/ [SMLX]+$/, "")}</text>}
              </g>;
            })
          : <path key={s.key} d={path(s.pts)} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} />)}
        </g>
        {pin != null && <line x1={X(pin)} x2={X(pin)} y1={pad.t} y2={pad.t + ih} stroke={C.accent} strokeWidth="1.5" />}
        {pin != null && series.map(s => { const y = interpCurveAt(s.pts, pin); return y == null ? null : <circle key={`p${s.key}`} cx={X(pin)} cy={Y(y)} r="3.5" fill={s.color} />; })}
        {hx != null && <line x1={X(hx)} x2={X(hx)} y1={pad.t} y2={pad.t + ih} stroke={C.textMid} strokeDasharray="3 3" />}
        {hx != null && series.map(s => { const y = interpCurveAt(s.pts, hx); return y == null ? null : <circle key={`c${s.key}`} cx={X(hx)} cy={Y(y)} r="3.5" fill={s.color} />; })}
      </svg>
      {tipX != null && (
        <div style={{ position: "absolute", top: pad.t + 6, left: Math.max(pad.l, Math.min(X(tipX) + 12, W - 310)), pointerEvents: "none", background: `${C.surface}ee`,
                      border: `1px solid ${hx == null ? C.accent : C.borderStrong}`, borderRadius: 6, padding: "6px 9px", fontSize: 12, lineHeight: 1.45, minWidth: 160, maxWidth: 300 }}>
          <div style={{ color: C.textMid }}>{xLabel}: <span style={{ color: C.text }}>{fmt(tipX)}</span></div>
          {series.map(s => {
            const y = interpCurveAt(s.pts, tipX);
            const seg = s.segments?.find(g => tipX >= g.from - 1e-9 && tipX <= g.to + xMax / 200);
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

// A graphed fit as the legend and readout name it: two fits of one hull differ only by fit name.
const fitLabel = (sc) => `${sc.ship} · ${sc.fitName}`;
// One legend entry. Long fit names are cut with an ellipsis and given whole on hover.
function LegendItem({ swatch, label }) {
  return (
    <span title={label} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.textMid, minWidth: 0, maxWidth: 280 }}>
      <span style={{ flex: "none", display: "inline-flex" }}>{swatch}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </span>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────────────────────────
const Label = ({ children }) => <div style={{ fontSize: TYPE.section, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid, margin: "12px 0 5px" }}>{children}</div>;
const selectStyle = () => ({ width: "100%", height: 28, fontSize: 12.5, background: C.bg, color: C.text, border: `1px solid ${C.borderStrong}`, borderRadius: 5, padding: "0 6px" });
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
const addBtn = () => ({ height: 24, padding: "0 9px", borderRadius: 5, fontSize: 12, cursor: "pointer", background: "transparent", border: `1px solid ${C.borderStrong}`, color: C.textMid });
const fieldStyle = () => ({ width: 64, height: 24, boxSizing: "border-box", padding: "0 6px", borderRadius: 5, fontSize: 12.5, textAlign: "right",
                     fontVariantNumeric: "tabular-nums", background: C.bg, border: `1px solid ${C.borderStrong}`, color: C.text, outline: "none" });

// The phone's flight-vector wheel (GraphTab's VectorCompass, same drag, same double-click to park,
// same frame: east is along the line between the ships), drawn larger and with the desktop's readout.
// Speeds stay a PERCENT of each fit's own top speed, as the sliders were, because one setting drives
// every source and target on the graph; the wheel shows it in m/s against the first of them.
// `mixed`: the lines it drives have different top speeds, so no one m/s is true and only the % shows.
function Wheel({ label, angle, pct, refVel, enemyPos, onAngle, onPct, mixed = false }) {
  const vel = Math.round(refVel * pct / 100);
  const cardinal = COMPASS_DIRS[((Math.round((angle + 90) / 45) % 8) + 8) % 8];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: C.textMid }}>{label}</span>
      <VectorCompass bare size={104} value={angle} velocity={vel} maxVelocity={refVel} enemyPos={enemyPos}
        onChange={onAngle} onVelocityChange={v => onPct(refVel > 0 ? Math.round((v / refVel) * 1000) / 10 : 0)} />
      <span style={{ fontSize: 12, color: C.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {refVel > 0 ? `${angle}° ${cardinal}` : "—"}</span>
      <span style={{ fontSize: 11.5, color: C.textMid, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {refVel > 0 ? (mixed ? `${Math.round(pct)}%` : `${vel} m/s · ${Math.round(pct)}%`) : t("immobilised")}</span>
    </div>
  );
}
// A number you can type or press-and-slide (the phone's ScrubField). Empty means `blank` (∞, Auto).
function NumField({ value, onChange, blank, anchor = 0, title, unit }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <ScrubField value={num(value) ? value : null} display={num(value) ? Math.round(value * 100) / 100 : ""} placeholder={blank} anchor={anchor} title={title}
        onType={e => { const v = e.target.value; onChange(v === "" ? null : Math.max(0, Number(v))); }} onScrub={n => onChange(n)} style={fieldStyle()} />
      {unit && <span style={{ fontSize: 11.5, color: C.textMid }}>{unit}</span>}
    </span>
  );
}

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
  // Transversal in m/s, or (clicked) angular velocity in °/s — the phone's tap toggle. Remembered.
  const [angular, setAngular] = useState(!!saved.angular);
  // Typed axis maximums, per graph and axis pair: a range scale that suits Damage vs distance means
  // nothing on Capacitor vs time. {"damage|dps|dist": {x: 60, y: null}}; null is Auto.
  const [scales, setScales] = useState(saved.scales ?? {});
  // The clicked-in point on the X axis, {key: "<graph>|<x axis>", x}. Keyed because an x of 20 means
  // 20 km on one graph and 20 s on the next; a pin from another graph or axis is simply not shown.
  const [pin, setPin] = useState(saved.pin ?? null);
  const [picker, setPicker] = useState(null);   // "source" | "target"
  // Compact (plot only) or expanded (controls under it). The controls sit BELOW the plot so the plot
  // keeps the window's full width, which a distance or time axis needs far more than height. "auto"
  // follows the window: under 460 px tall the controls fold away, so the graph can sit small in a
  // general workspace and still read; a Controls button overrides either way, and the override is
  // remembered.
  const [panelMode, setPanelMode] = useState(saved.panelMode ?? "auto");
  const rootRef = useRef(null);
  const [rootH, setRootH] = useState(800);
  useLayoutEffect(() => {
    const el = rootRef.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setRootH(e.contentRect.height));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const showPanel = panelMode === "shown" || (panelMode === "auto" && rootH >= 460);
  useEffect(() => { writePrefs({ cat, y: yKey, x: xKey, sources, targets, inp, meta, ignoreResists, showY0, panelMode, scales, angular, pin }); }, [cat, yKey, xKey, sources, targets, inp, meta, ignoreResists, showY0, panelMode, scales, angular, pin]);

  // With no sources chosen, graph the fit being edited.
  const srcList = sources.length ? sources : (s.activeFit?.ship ? [{ ship: s.activeFit.ship, fitName: s.activeFit.fitName, auto: true }] : []);
  const cfg = cat === APP_PROFILE ? null : GRAPH_CONFIG.find(g => g.key === cat);
  const yAxes = cfg ? cfg.yAxes : [{ key: "dps", label: () => t("DPS") }, { key: "volley", label: () => t("Volley") }];
  const xAxes = cfg ? cfg.xAxes : [{ key: "dist", label: () => t("Distance, km") }];
  const y = yAxes.find(a => a.key === yKey)?.key ?? yAxes[0].key;
  const x = xAxes.find(a => a.key === xKey)?.key ?? xAxes[0].key;
  const hasTargets = TARGET_CATS.has(cat);
  const tgtList = hasTargets ? targets : [null];
  const scaleKey = `${cat}|${y}|${x}`, scale = scales[scaleKey] ?? {};
  const setScale = (axis, v) => setScales(m => ({ ...m, [scaleKey]: { ...(m[scaleKey] ?? {}), [axis]: v > 0 ? v : null } }));

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
      const r = curveTo(cat, y, x, curveParams(cat, sd.d, td, inp), scale.x);
      out.push({ key: `${i}:${j}`, pts: r.pts, xMax: r.xMax, color: SRC_COLORS[i % SRC_COLORS.length], dash: DASHES[j % DASHES.length],
                 short: hasTargets ? `${fitLabel(sd.sc)} → ${td.label}` : fitLabel(sd.sc), i, j });
    }); });
    return out;
  }, [cat, y, x, srcData, tgtData, inp, hasTargets, scale.x]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [profiles, setProfiles] = useState({ key: null, series: [] });
  const profKey = cat === APP_PROFILE ? JSON.stringify([srcList, tgtList, inp, meta, y, ignoreResists, scale.x ?? null]) : null;
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
      const r = appProfile(s, sd.fit, sd.d, td, inp, y, meta, scale.x);
      // Round names only on each fit's first target: its other targets' curves run alongside and the labels pile up.
      if (r) done.push({ key: `${i}:${j}`, ...r, labels: !done.some(d => d.i === i), i, color: SRC_COLORS[i % SRC_COLORS.length], dash: DASHES[j % DASHES.length], short: `${fitLabel(sd.sc)} → ${td.label}` });
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
  // The pin, if it belongs to this graph and axis and is still on the plot.
  const pinKey = `${cat}|${x}`;
  const xShown = scale.x > 0 ? scale.x : Math.max(0, ...series.map(sr => sr.xMax ?? 0));
  const pinX = pin?.key === pinKey && pin.x <= xShown ? pin.x : null;
  // The wheels' speeds are a PERCENT of each fit's own top speed, so one setting can mean several
  // m/s. The m/s, the transversal and the angular readout are quoted only when every line on the
  // graph shares them: one top speed among the fits (or your ship parked), and one target speed.
  const velOf = cs => cs?.maxVelocityAB ?? cs?.maxVelocity ?? 0;
  const srcVels = [...new Set(srcData.filter(Boolean).map(sd => Math.round(velOf(sd.d.cs) || sd.d.ship?.maxVelocity || 0)))];
  const tgtVels = [...new Set(tgtData.filter(Boolean).map(td => Math.round(td.vel ?? 0)))];
  const selfRef = srcVels.length === 1 ? srcVels[0] : (velOf(firstCs) || srcData.find(Boolean)?.d.ship?.maxVelocity || 0);
  const tgtRef = tgtData.find(Boolean)?.vel ?? 0;
  const selfMixed = srcVels.length > 1, tgtMixed = tgtVels.length > 1;
  // On a target-speed axis the graph sweeps the target's speed and ignores the Target wheel's, so the
  // target speed is the PINNED one: absolute m/s is the same for every target; a percent is only one
  // m/s if the targets share a top speed. Unpinned there is no single speed to quote.
  const tgtSpeedNow = x === "tgtSpeedMs" ? pinX
    : x === "tgtSpeedPct" ? (pinX != null && !tgtMixed ? tgtRef * pinX / 100 : null)
    : !tgtMixed ? tgtRef * inp.tgtSpeed / 100 : null;
  const selfSpeedNow = inp.atkSpeed === 0 ? 0 : !selfMixed ? selfRef * inp.atkSpeed / 100 : null;
  const showTransversal = tgtSpeedNow != null && selfSpeedNow != null;
  const transversal = showTransversal ? Math.abs(selfSpeedNow * Math.sin(inp.atkAngle * Math.PI / 180) - tgtSpeedNow * Math.sin(inp.tgtAngle * Math.PI / 180)) : 0;
  // Angular velocity at the engagement distance: a pinned point on a distance axis, else the Range
  // field where it is shown, else the fit's weapon reach (the phone's angularDistM).
  const angDistM = x === "dist" && pinX != null ? pinX * 1000
    : showRange ? (inp.rangeKm ?? defaultEngRangeKm(cat, firstCs)) * 1000 : engagementDistanceM(firstCs);
  const angularDeg = showTransversal ? calcAngularSpeed(selfSpeedNow, inp.atkAngle, firstCs?.shipRadius ?? 0, angDistM, tgtSpeedNow, inp.tgtAngle, 0) * 180 / Math.PI : NaN;
  const fmtAngular = v => !Number.isFinite(v) ? "--" : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v >= 0.1 ? v.toFixed(3) : v.toFixed(4);
  const setTarget = (j, patch) => setTargets(l => l.map((x2, k) => k === j ? { ...x2, ...patch } : x2));
  // A custom target starts from whatever the first target presents, so it is a tweak, not a blank.
  const addCustom = () => { const td = tgtData.find(Boolean);
    setTargets(l => [...l, { kind: "custom", sig: td && td.sig < IDEAL_SIG ? Math.round(td.sig) : 150, vel: Math.round(td?.vel ?? 300) }]); };
  const swatch = (i) => <span style={{ width: 14, height: 3, borderRadius: 2, background: SRC_COLORS[i % SRC_COLORS.length], flex: "none" }} />;
  const dashSwatch = (j) => <svg width="18" height="6" style={{ flex: "none" }}><line x1="0" y1="3" x2="18" y2="3" stroke={C.text} strokeWidth="2" strokeDasharray={DASHES[j % DASHES.length]} /></svg>;
  const xLabel = xAxes.find(a => a.key === x)?.label() ?? "";
  // Where a scrub of an Auto axis starts: the maximum the data is showing now.
  const axisAnchor = (axis) => Math.max(1, Math.round(axis === "x" ? Math.max(0, ...series.map(sr => sr.xMax ?? 0)) : Math.max(0, ...series.flatMap(sr => sr.pts.map(p => p[1] ?? 0)))));
  const yLabel = yAxes.find(a => a.key === y)?.label() ?? "";

  return (
    <div ref={rootRef} style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 200, display: "flex", flexDirection: "column", padding: "6px 8px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 24, padding: "0 4px" }}>
          <button type="button" aria-pressed={showPanel} onClick={() => setPanelMode(showPanel ? "hidden" : "shown")}
            title={showPanel ? t("Hide the controls (compact graph)") : t("Show the controls")}
            style={{ ...addBtn(), height: 22, color: showPanel ? C.textMid : C.accent, borderColor: showPanel ? C.borderStrong : C.accent }}>
            {showPanel ? "▾ " : "▴ "}{t("Controls")}
          </button>
          {!showPanel && <span style={{ fontSize: 12, color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {GRAPH_TYPES.find(g => g.key === cat)?.label()} · {yLabel}</span>}
          {panelMode !== "auto" && <button type="button" onClick={() => setPanelMode("auto")} title={t("Fold the controls away automatically when the window is short")}
            style={{ ...addBtn(), height: 22, padding: "0 6px", fontSize: 11.5 }}>{t("Auto")}</button>}
          <span style={{ flex: 1 }} />
          {busy && <span style={{ fontSize: 12.5, color: C.textMid }}>{t("Comparing ammo…")}</span>}
        </div>
        {!series.length && !busy
          ? <div style={{ margin: "auto", fontSize: 13, color: C.textMid }}>{t("Nothing to graph for these fits.")}</div>
          : <Plot series={series} xLabel={xLabel} yLabel={cat === APP_PROFILE ? `${yLabel} · ${t("best ammo")}` : yLabel} showY0={showY0} xFixed={scale.x ?? null} yFixed={scale.y ?? null}
              pinX={pinX} onPin={v => setPin(v == null ? null : { key: pinKey, x: v })} />}
        {/* The legend names each fit once (its colour) and each target once (its dash) rather than every
            fit × target line, so six lines from three fits and two targets is five short entries. */}
        {series.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", padding: "6px 4px 0", fontSize: 12 }}>
            {srcData.map((sd, i) => {
              if (!sd || !series.some(sr => sr.i === i)) return null;
              const rack = series.find(sr => sr.i === i && sr.rack)?.rack;
              const label = fitLabel(sd.sc) + (rack ? ` · ${rack}` : "");
              return <LegendItem key={`s${i}`} label={label}
                swatch={<span style={{ width: 16, height: 3, borderRadius: 2, background: SRC_COLORS[i % SRC_COLORS.length] }} />} />;
            })}
            {hasTargets && tgtData.some(Boolean) && <span style={{ width: 1, alignSelf: "stretch", background: C.border }} />}
            {hasTargets && tgtData.map((td, j) => td && series.some(sr => sr.j === j) ? (
              <LegendItem key={`t${j}`} label={td.label}
                swatch={<svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke={C.text} strokeWidth="2" strokeDasharray={DASHES[j % DASHES.length]} /></svg>} />
            ) : null)}
          </div>
        )}
      </div>

      {/* The controls, as columns that wrap: one row on a wide window, two or more on a narrow one.
          Capped at half the window and scrolled past that, so the plot always keeps its share. The
          flight-vector wheels are the tallest control, so they sit in their own column pinned to the
          right edge instead of wrapping under the rest. */}
      {showPanel && <div style={{ flex: "none", maxHeight: "50%", overflowY: "auto", padding: "0 12px 12px", borderTop: `1px solid ${C.border}`,
                                  display: "flex", gap: 22, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", columnGap: 22, alignItems: "start" }}>
        <div>
        <Label>{t("Graph")}</Label>
        <select value={cat} onChange={e => setCat(e.target.value)} style={selectStyle()} aria-label={t("Graph")}>
          {GRAPH_TYPES.map(g => <option key={g.key} value={g.key}>{g.label()}</option>)}
        </select>
        {/* Each axis on one row: what it plots, then its maximum (empty is Auto). */}
        {[["y", y, setY, yAxes, t("Y axis")], ["x", x, setX, xAxes, t("X axis")]].map(([axis, val, set, axes, aria]) => (
          <div key={axis} style={{ display: "grid", gridTemplateColumns: "14px minmax(0,1fr) auto", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12.5 }}>
            <span style={{ color: C.textMid }}>{axis.toUpperCase()}</span>
            <select value={val} onChange={e => set(e.target.value)} style={selectStyle()} aria-label={aria}>{axes.map(a => <option key={a.key} value={a.key}>{a.label()}</option>)}</select>
            <NumField value={scale[axis]} blank={t("Auto")} anchor={axisAnchor(axis)}
              title={t("Type the axis maximum, or press and slide sideways; empty fits it to the data")} onChange={v => setScale(axis, v)} />
          </div>
        ))}
        <Label>{t("Display")}</Label>
        {(cat === "damage" || cat === APP_PROFILE) && <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 12.5, color: C.text, minHeight: 24 }}>
          <input type="checkbox" checked={ignoreResists} onChange={() => setIgnoreResists(v => !v)} style={{ accentColor: C.accent }} />{t("Ignore target resists")}
        </label>}
        <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 12.5, color: C.text, minHeight: 24 }}>
          <input type="checkbox" checked={showY0} onChange={() => setShowY0(v => !v)} style={{ accentColor: C.accent }} />{t("Always show Y = 0")}
        </label>
        </div>

        <div>
        <Label>{t("Fits")}</Label>
        {srcList.map((sc, i) => <ListRow key={`${sc.ship}:${sc.fitName}`} swatch={swatch(i)} label={`${sc.ship} · ${sc.fitName}`}
          onRemove={sc.auto ? undefined : () => setSources(l => l.filter((_, k) => k !== i))} />)}
        {!srcList.length && <div style={{ fontSize: 12.5, color: C.textMid }}>{t("Open a fit, or add one.")}</div>}
        <button type="button" style={{ ...addBtn(), marginTop: 4 }} onClick={() => setPicker("source")}>+ {t("Add fit")}</button>
        </div>

        {hasTargets && <div>
          <Label>{t("Targets")}</Label>
          {targets.map((tg, j) => {
            const P = tg.kind === "profile" ? TARGET_PROFILES[tg.profile] : null;
            return (
              <div key={j}>
              <ListRow swatch={dashSwatch(j)} label={tg.kind === "fit" ? `${tg.ship} · ${tg.fitName}` : tg.kind === "custom" ? t("Custom") : P?.label() ?? tg.profile}
                onRemove={targets.length > 1 ? () => setTargets(l => l.filter((_, k) => k !== j)) : undefined}>
                {P?.mwdSig != null && <button type="button" aria-pressed={!!tg.mwd} onClick={() => setTarget(j, { mwd: !tg.mwd })}
                  style={{ ...addBtn(), height: 20, padding: "0 6px", color: tg.mwd ? C.accent : C.textMid, borderColor: tg.mwd ? C.accent : C.borderStrong }}>MWD</button>}
                {P && <button type="button" title={t("Edit this target's signature and speed")} onClick={() => { const p = profileTarget(tg.profile, !!tg.mwd);
                    setTarget(j, { kind: "custom", sig: p.sig < IDEAL_SIG ? p.sig : null, vel: p.vel, profile: undefined, mwd: undefined }); }}
                  style={{ ...addBtn(), height: 20, padding: "0 6px" }}>{t("Edit")}</button>}
              </ListRow>
              {tg.kind === "custom" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", padding: "2px 0 6px 25px", fontSize: 12, color: C.textMid }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{t("Sig")}
                    <NumField value={tg.sig} blank="∞" anchor={1000} unit="m" title={t("Type a signature, or press and slide sideways to sweep it")} onChange={v => setTarget(j, { sig: v })} /></label>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{t("Speed")}
                    <NumField value={tg.vel} blank="0" unit="m/s" title={t("Type a speed, or press and slide sideways to sweep it")} onChange={v => setTarget(j, { vel: v ?? 0 })} /></label>
                </div>
              )}
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <Menu label={`+ ${t("Profile")}`} align="left" buttonStyle={{ ...addBtn() }} items={Object.keys(TARGET_PROFILES).map(k => ({
              label: TARGET_PROFILES[k].label(), onSelect: () => setTargets(l => [...l, { kind: "profile", profile: k, mwd: false }]) })).concat([
              { divider: true }, { label: t("Custom sig and speed"), onSelect: addCustom }])} />
            <button type="button" style={addBtn()} onClick={() => setPicker("target")}>+ {t("Fit")}</button>
          </div>
        </div>}

        {/* No heading of its own (each slider names itself), so it drops by one to sit level with
            the first row of the columns beside it. */}
        {(showRange || showWindow || cat === APP_PROFILE) && <div style={{ paddingTop: showRange || showWindow ? 30 : 0 }}>
        {showRange && <Slider label={t("Range")} min={0} max={250} unit=" km" value={Math.round(inp.rangeKm ?? defaultEngRangeKm(cat, firstCs))} onChange={v => setI("rangeKm", v)} />}
        {showWindow && <Slider label={t("Time window")} min={10} max={600} unit=" s" value={inp.windowS ?? DEFAULT_WINDOW_S} onChange={v => setI("windowS", v)} />}
        {cat === APP_PROFILE && <>
          <Label>{t("Ammo")}</Label>
          <div style={{ display: "flex", gap: 4 }}>
            {[["t1", "T1"], ["navy", t("Navy")], ["all", t("All")]].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={meta === k} onClick={() => setMeta(k)}
                style={{ ...addBtn(), flex: 1, color: meta === k ? C.accent : C.textMid, borderColor: meta === k ? C.accent : C.borderStrong, background: meta === k ? C.accentLight : "transparent" }}>{l}</button>
            ))}
          </div>
        </>}
        </div>}
      </div>

      {(hasTargets || cat === "damage") && <div style={{ flex: "none", width: 230 }}>
        <Label>{t("Engagement")}</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          <Wheel label={t("Your ship")} angle={inp.atkAngle} pct={inp.atkSpeed} refVel={selfRef} mixed={selfMixed} enemyPos="E" onAngle={v => setI("atkAngle", v)} onPct={v => setI("atkSpeed", v)} />
          <Wheel label={t("Target")} angle={inp.tgtAngle} pct={inp.tgtSpeed} refVel={tgtRef} mixed={tgtMixed} enemyPos="W" onAngle={v => setI("tgtAngle", v)} onPct={v => setI("tgtSpeed", v)} />
        </div>
        {/* Click to swap between transversal (m/s) and angular velocity (°/s at the engagement range).
            Hidden when the lines on the graph do not share one speed each (see showTransversal). */}
        {showTransversal && <button type="button" onClick={() => setAngular(v => !v)} title={angular ? t("Angular velocity — click for transversal") : t("Transversal — click for angular velocity")}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", width: "100%", marginTop: 6, fontSize: 12.5, color: C.textMid, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
          <span>{angular ? t("Angular velocity") : t("Transversal")}</span>
          <span style={{ color: transversal < 50 ? C.success : transversal > 400 ? C.danger : C.warning, fontVariantNumeric: "tabular-nums" }}>
            {angular ? `${fmtAngular(angularDeg)} °/s @ ${Math.round(angDistM / 100) / 10} km` : `${Math.round(transversal)} m/s`}</span>
        </button>}
      </div>}
      </div>}

      {picker && <FitPickerSheet title={picker === "source" ? t("Graph a fit") : t("Graph against a fit")} fitsDB={s.fitsDB} pinned={tabFits(s.openFitTabs, s.fitsDB)}
        onSelect={(ship, fit) => {
          // A fit already on the graph is not added twice: two identical lines say nothing, and the
          // pair is the line's identity (its React key and its legend entry).
          if (picker === "source") setSources(l => {
            const cur = l.length ? l : srcList.map(({ ship: a, fitName: b }) => ({ ship: a, fitName: b }));
            return cur.some(x => x.ship === ship && x.fitName === fit.name) ? cur : [...cur, { ship, fitName: fit.name }];
          });
          else setTargets(l => l.some(x => x.kind === "fit" && x.ship === ship && x.fitName === fit.name) ? l : [...l, { kind: "fit", ship, fitName: fit.name }]);
        }} onClose={() => setPicker(null)} />}
    </div>
  );
}
