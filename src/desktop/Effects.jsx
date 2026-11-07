import { useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { tidByName, calcRangeFactor, stackingPenalty, jamChanceFrom, computeCommandBursts } from "../calc.js";
import { WARFARE_BUFF_UNIT } from "../lib/core.js";
import { projectedFitEffects, projectedSource } from "../lib/projection.js";
import { PROJECTED_MODULES, MAX_QTY, isProjectedModule, makeProjectedModule, projectedModuleLabel, scriptLabel, scriptsFor, clampQty } from "../lib/projected-modules.js";
import { FitPickerSheet, BoosterPickerSheet, EnvironmentPickerSheet, boosterSideEffectState, BoosterIcon, buildBoosterFromName,
         hasCommandBursts, boosterBonuses, boosterSlotOf } from "../components/effects.jsx";
import { Empty, TYPE } from "./kit.jsx";
import { useRowSelect } from "./ContextMenu.jsx";
import { tabFits } from "./tab-fits.js";
import { useInspect } from "./inspect-context.jsx";
import { boosterTarget } from "./inspect.js";
import { useItemDrop, useFitDrop, DropHint } from "./items-context.jsx";
import { ContextMenu } from "./ContextMenu.jsx";
import { LINK_DEFS, CATEGORIES, STRENGTHS, ALL_LINKS, BUFF_NAMES, LINK_UNIT, linksOf, makeLink, isLink, linkLabel, linkBursts } from "../lib/command-links.js";

// The phone's Effects screen, split into four desktop windows (Owen floated splitting it):
// Boosters, Projected, Command links, Environment. Each edits the same session state the phone's
// tabs do (boosters, projFits, cmdFits, slots.environment) and reuses the phone's pickers, so a
// change made here is the same change the phone would make.

// Functions, not objects: a style built at module scope copies the theme's colours once, at load,
// and kept them after a theme switch (the + Fit / + Booster buttons). C reads the current palette.
const rowStyle = () => ({ display: "flex", alignItems: "center", gap: 10, minHeight: 32, padding: "4px 12px", borderBottom: `1px solid ${C.border}99` });
const btn = () => ({ height: 26, padding: "0 12px", borderRadius: 6, fontSize: 12.5, cursor: "pointer", background: C.surfaceAlt, border: `1px solid ${C.borderStrong}`, color: C.text });
const smallBtn = () => ({ height: 22, padding: "0 8px", borderRadius: 5, fontSize: 12, cursor: "pointer", background: "transparent", border: `1px solid ${C.borderStrong}`, color: C.textMid });

function Header({ children, onAdd, addLabel }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, flex: "none" }}>
      <span style={{ fontSize: TYPE.small, color: C.textMid, flex: 1 }}>{children}</span>
      {onAdd && <button type="button" style={btn()} onClick={onAdd}>+ {addLabel}</button>}
    </div>
  );
}
const Check = ({ on, onClick, title }) => (
  <input type="checkbox" checked={on} onChange={onClick} title={title} aria-label={title} style={{ width: 16, height: 16, accentColor: C.accent, flex: "none", cursor: "pointer" }} />
);
const Remove = ({ onClick, label }) => (
  <button type="button" onClick={onClick} aria-label={label} title={label}
    style={{ border: "none", background: "none", color: C.textMid, cursor: "pointer", fontSize: 15, padding: "0 2px", flex: "none" }}>×</button>
);
// `drop` (useItemDrop) makes the whole window a drop target for browser items.
const Shell = ({ children, drop, dropLabel }) => (
  <div {...drop?.props} style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
    {drop && <DropHint over={drop.over} ok={drop.ok} label={dropLabel} />}{children}
  </div>
);
const Body = ({ children, list }) => <div {...list} style={{ flex: 1, minHeight: 0, overflowY: "auto", outline: "none" }}>{children}</div>;
const None = ({ children }) => <div style={{ padding: "12px", fontSize: TYPE.label, color: C.textMid }}>{children}</div>;

// ── Boosters ─────────────────────────────────────────────────────────────────────────────────
// A booster's side effects as a list, the way a link's buffs read in Command links: a checkbox per
// side effect to simulate it, the stat on the left, the change on the right (red while it applies).
// The data and the toggle are the phone card's (boosterSideEffectState), so the two cannot disagree.
function SideEffects({ booster, onUpdate }) {
  const [open, setOpen] = useState(false);
  const { effects, chancePct, toggled } = boosterSideEffectState(booster);
  if (!effects.length) return null;
  const on = effects.filter(e => e.enabled).length;
  return (
    <div style={{ padding: open ? "0 12px 8px 38px" : "0 12px 4px 38px" }}>
      {/* Collapsed by default (Owen); the header still says how many are being simulated, so a
          penalty that is on never hides. Its own click, kept off the row's select / double-click. */}
      <button type="button" aria-expanded={open} onClick={ev => { ev.stopPropagation(); setOpen(v => !v); }} onDoubleClick={ev => ev.stopPropagation()}
        style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 22, width: "100%", padding: 0, border: "none", background: "none", cursor: "pointer", textAlign: "left" }}>
        <span aria-hidden="true" style={{ fontSize: 9, color: C.textMid, width: 10, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" }}>▶</span>
        <span style={{ fontSize: TYPE.small, color: C.warning }}>{t("Side effects")}</span>
        <span style={{ fontSize: TYPE.small, color: C.textMid }}>{t("{pct}% chance each", { pct: chancePct })}</span>
        {on > 0 && <span style={{ fontSize: TYPE.small, color: C.danger, marginLeft: "auto" }}>{t("{n} simulated", { n: on })}</span>}
      </button>
      {open && effects.map((e, i) => (
        <label key={e.key ?? i} title={t("Simulate this side effect")} onDoubleClick={ev => ev.stopPropagation()}
          style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 24, cursor: "pointer", paddingLeft: 18 }}>
          <input type="checkbox" checked={!!e.enabled} onChange={() => onUpdate(toggled(i))}
            style={{ width: 14, height: 14, accentColor: C.danger, flex: "none", cursor: "pointer", margin: 0 }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: TYPE.small, color: e.enabled ? C.text : C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</span>
          <span style={{ fontSize: TYPE.label, color: e.enabled ? C.danger : C.textMid, fontVariantNumeric: "tabular-nums" }}>{e.sign}{e.magnitude}%</span>
        </label>
      ))}
    </div>
  );
}

export function BoostersPanel({ s }) {
  const [picker, setPicker] = useState(false);
  const insp = useInspect();
  const rs = useRowSelect();
  const drop = useItemDrop("boosters");
  if (!s.activeFit?.ship) return <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;
  const list = [...(s.boosters ?? [])].sort((a, b) => boosterSlotOf(a) - boosterSlotOf(b));
  const set = (fn) => s.setBoosters(prev => fn(prev ?? []));
  const remove = (id) => set(bs => bs.filter(x => x.id !== id));
  const toggle = (id) => set(bs => bs.map(x => x.id === id ? { ...x, active: !x.active } : x));
  const bTarget = (b) => boosterTarget(insp.fitRef, b.id, tidByName(b.name));
  const show = (b, tab) => insp.inspect(bTarget(b), tab);
  return (
    <Shell drop={drop} dropLabel={t("Add booster")}>
      <Header onAdd={() => setPicker(true)} addLabel={t("Booster")}>{t("Toggle boosters to simulate their stat effects on this fit.")}</Header>
      <Body list={rs.listProps({ onDelete: remove })}>
        {!list.length && <None>{t("No boosters added")}</None>}
        {list.map(b => {
          const known = !!tidByName(b.name);
          const bonuses = known ? boosterBonuses(b) : [];
          const rp = rs.rowProps(b.id, {
            target: known ? bTarget(b) : undefined,
            onOpen: known ? () => show(b, "info") : undefined,
            items: () => [
              { label: b.active ? t("Deactivate") : t("Activate"), onSelect: () => toggle(b.id) },
              { divider: true },
              { label: t("Show info"), hint: t("Double-click"), disabled: !known, onSelect: () => show(b, "info") },
              { label: t("Variations"), disabled: !known, onSelect: () => show(b, "variations") },
              { divider: true },
              { label: t("Remove"), hint: "Del", danger: true, onSelect: () => remove(b.id) },
            ],
          });
          return (
            <div key={b.id} {...rp} style={{ ...rp.style, borderBottom: `1px solid ${C.border}99`, opacity: b.active ? 1 : 0.6 }}>
              <div style={{ ...rowStyle(), borderBottom: "none" }}>
                <Check on={!!b.active} onClick={() => toggle(b.id)} title={t("Active")} />
                <BoosterIcon name={b.name} size={22} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: TYPE.label, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
                  <div style={{ fontSize: TYPE.small, color: known ? C.rig : C.warning }}>
                    {known ? <><span style={{ color: C.textMid }}>{t("Slot {n}", { n: boosterSlotOf(b) })}</span>{bonuses.length ? ` · ${bonuses.join(" · ")}` : ""}</>
                           : t("No longer in the game. Has no effect.")}
                  </div>
                </div>
                <Remove onClick={() => set(bs => bs.filter(x => x.id !== b.id))} label={t("Remove")} />
              </div>
              <SideEffects booster={b} onUpdate={nb => set(bs => bs.map(x => x.id === b.id ? nb : x))} />
            </div>
          );
        })}
      </Body>
      {picker && <BoosterPickerSheet onAdd={b => set(prev => [...prev, b])} onClose={() => setPicker(false)} />}
      {rs.view}
    </Shell>
  );
}

// ── Projected ────────────────────────────────────────────────────────────────────────────────
/**
 * What one projected fit does to the edited fit at `rangeKm`, as label/value lines. The phone's
 * Projected card's arithmetic (effects.jsx), line for line: range factor per module, stacking within
 * the same effect, the target's assistance factors on reps and cap, and the target's ECM resistance
 * on jam chance. Keep the two in step.
 */
export function projectedLines(eff, rangeKm, assist, jamTarget, ewarResist) {
  const rf = (o, fo) => calcRangeFactor(o, fo, rangeKm * 1000, true);
  const af = assist ?? { rep: 1, cap: 1, assist: 1 };
  const rz = (k) => ewarResist?.[k] ?? 1;   // this fit's EWAR resistance, per source module
  const reps = { shield: 0, armor: 0, hull: 0 };
  for (const r of eff.reps ?? []) reps[r.kind] += r.rawPS * af.rep * rf(r.optimal, r.falloff);
  const webMs = (eff.webs ?? []).map(w => 1 + (w.speedFactor * rz("web") * rf(w.optimal, w.falloff)) / 100);
  const webMult = webMs.length ? stackingPenalty(webMs) : 1;
  const neut = (eff.neuts ?? []).reduce((a, n) => a + n.gjPerSec * rz("neut") * rf(n.optimal, n.falloff), 0);
  const cap = (eff.caps ?? []).reduce((a, c) => a + c.gjPerSec * af.cap * rf(c.optimal, c.falloff), 0);
  const stk = (arr) => arr.length ? (stackingPenalty(arr.map(p => 1 + p / 100)) - 1) * 100 : 0;
  const paint = stk((eff.painters ?? []).map(p => p.sigBonus * rz("painter") * rf(p.optimal, p.falloff)));
  const damp = stk((eff.damps ?? []).map(d => d.lockBonus * rz("damp") * rf(d.optimal, d.falloff)));
  const tdTrack = stk((eff.trackDisr ?? []).map(td => td.tracking * rz("disrupt") * rf(td.optimal, td.falloff)));
  const tdOpt = stk((eff.trackDisr ?? []).map(td => (td.optimalBonus || 0) * rz("disrupt") * rf(td.optimal, td.falloff)));
  const tdFall = stk((eff.trackDisr ?? []).map(td => (td.falloffBonus || 0) * rz("disrupt") * rf(td.optimal, td.falloff)));
  // Remote tracking computers: a boost, so the target's assistance impedance scales it.
  const rtcF = (b) => af.assist * rf(b.optimal, b.falloff);
  const rtcTrack = stk((eff.trackBoosts ?? []).map(b => (b.tracking || 0) * rtcF(b)));
  const rtcRange = Math.max(stk((eff.trackBoosts ?? []).map(b => (b.optimalBonus || 0) * rtcF(b))),
                            stk((eff.trackBoosts ?? []).map(b => (b.falloffBonus || 0) * rtcF(b))));
  const gd = stk((eff.guideDisr ?? []).map(g => g.missileRange * rz("disrupt") * rf(g.optimal, g.falloff)));
  // A precision script moves a guidance disruptor onto explosion velocity instead.
  const gdAoe = stk((eff.guideDisr ?? []).map(g => (g.aoeVel || 0) * rz("disrupt") * rf(g.optimal, g.falloff)));
  const ecmMax = Math.max(0, ...(eff.ecm ?? []).map(e => Math.max(0, ...Object.values(e.byType)) * rf(e.optimal, e.falloff)));
  const jam = jamChanceFrom((eff.ecm ?? []).map(e => ({ byType: Object.fromEntries(Object.entries(e.byType).map(([k, v]) => [k, (v || 0) * (jamTarget?.resist ?? 1) * rf(e.optimal, e.falloff)])) })),
    jamTarget?.strength ?? 0, jamTarget?.type ?? "");
  const out = [];
  if (reps.shield > 0) out.push([t("Remote shield rep"), `+${Math.round(reps.shield)} HP/s`, C.mid]);
  if (reps.armor > 0) out.push([t("Remote armor rep"), `+${Math.round(reps.armor)} HP/s`, C.warning]);
  if (reps.hull > 0) out.push([t("Remote hull rep"), `+${Math.round(reps.hull)} HP/s`, C.danger]);
  if (webMs.length) out.push([t("Webified"), `−${Math.round((1 - webMult) * 100)}% ${t("speed")}`, C.accent]);
  if (neut > 0.05) out.push([t("Neutralised"), `−${Math.round(neut)} GJ/s`, C.danger]);
  if (cap > 0.05) out.push([t("Remote capacitor"), `+${Math.round(cap)} GJ/s`, C.rig]);
  if (Math.abs(paint) > 0.5) out.push([t("Target painted"), `+${Math.round(paint)}% ${t("signature")}`, C.warning]);
  if (Math.abs(damp) > 0.5) out.push([t("Damped"), `${Math.round(damp)}% ${t("lock range")}`, C.accent]);
  if (Math.abs(tdTrack) > 0.5) out.push([t("Tracking disrupted"), `${Math.round(tdTrack)}% ${t("tracking")}`, C.accent]);
  if (Math.abs(tdOpt) > 0.5 || Math.abs(tdFall) > 0.5) out.push([t("Turret range disrupted"), `${Math.round(Math.abs(tdOpt) >= Math.abs(tdFall) ? tdOpt : tdFall)}%`, C.accent]);
  if (rtcTrack > 0.5) out.push([t("Tracking boosted"), `+${Math.round(rtcTrack)}% ${t("tracking")}`, C.success]);
  if (rtcRange > 0.5) out.push([t("Turret range boosted"), `+${Math.round(rtcRange)}%`, C.success]);
  if (Math.abs(gd) > 0.5) out.push([t("Guidance disrupted"), `${Math.round(gd)}% ${t("missile range")}`, C.accent]);
  if (Math.abs(gdAoe) > 0.5) out.push([t("Guidance disrupted"), `${Math.round(gdAoe)}% ${t("explosion velocity")}`, C.accent]);
  if (ecmMax > 0.5) out.push([t("ECM strength"), String(Math.round(ecmMax)), C.accent]);
  if (jam > 0.05) out.push([t("Jam chance"), `${jam.toFixed(1)}%`, C.danger]);
  return out;
}

export function ProjectedPanel({ s, jamTarget }) {
  const [picker, setPicker] = useState(false);
  const [modMenu, setModMenu] = useState(null);   // the Default effect menu, {x, y}
  // A fit dragged from the ship browser projects onto this one, as if picked from the list. Not the
  // fit being edited: a fit projecting onto itself is not an engagement.
  const fitOf = (ship, name) => s.fitsDB?.[ship]?.find(f => f.name === name);
  const drop = useFitDrop((ship, name) => !!fitOf(ship, name) && !(ship === s.activeFit?.ship && name === s.activeFit?.fitName),
                          (ship, name) => add(ship, fitOf(ship, name)));
  if (!s.activeFit?.ship) return <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;
  const list = s.projFits ?? [];
  const update = (i, patch) => s.setProjFits(prev => (prev ?? []).map((p, j) => j === i ? { ...p, ...patch } : p));
  // The phone's default range: the shortest optimal of anything on the source that projects.
  const defaultRange = (ship, fit, fallback) => {
    const eff = projectedFitEffects(ship, fit, s.fitsDB, s.sourceSkills);
    const optims = [...eff.reps, ...eff.webs, ...eff.neuts, ...(eff.painters || []), ...(eff.damps || []), ...(eff.trackDisr || []), ...(eff.trackBoosts || []), ...(eff.guideDisr || [])].map(m => m.optimal).filter(v => v > 0);
    return optims.length ? Math.floor(Math.min(...optims) / 1000) : fallback;
  };
  const add = (ship, fit) => s.setProjFits(prev => [...(prev ?? []), { ship, fitName: fit.name, rangeKm: defaultRange(ship, fit, 30) }]);
  // A generic projected module (lib/projected-modules.js), at its optimal range.
  const addModule = (module) => {
    const e = makeProjectedModule(module), src = projectedSource(e, s.fitsDB);
    s.setProjFits(prev => [...(prev ?? []), { ...e, rangeKm: src ? defaultRange(src.ship, src.fit, 10) : 10 }]);
  };
  const moduleMenu = () => PROJECTED_MODULES.map(d => ({ label: d.module, onSelect: () => addModule(d.module) }));
  return (
    <Shell drop={drop} dropLabel={t("Project onto this fit")}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, flex: "none" }}>
        <span style={{ fontSize: TYPE.small, color: C.textMid, flex: 1 }}>{t("Other fits, or stock modules, projecting onto this one. Effects scale with range.")}</span>
        <button type="button" style={btn()} title={t("A stock module projected onto this fit, flown with every skill at V")}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setModMenu({ x: r.left, y: r.bottom + 4 }); }}>+ {t("Default effect")} ▾</button>
        <button type="button" style={btn()} onClick={() => setPicker(true)}>+ {t("Fit")}</button>
      </div>
      <Body>
        {!list.length && <None>{t("No projected fits or effects applied")}</None>}
        {list.map((f, i) => {
          const generic = isProjectedModule(f);
          const src = projectedSource(f, s.fitsDB);
          const on = f.active !== false;
          const range = f.rangeKm ?? 30;
          const lines = src ? projectedLines(projectedFitEffects(src.ship, src.fit, s.fitsDB, s.sourceSkills), range, s.projectedEffects?.assist, jamTarget, s.projectedEffects?.ewarResist) : [];
          const qty = clampQty(f.qty), scripts = generic ? scriptsFor(f.module) : null;
          return (
            <div key={i} style={{ borderBottom: `1px solid ${C.border}`, opacity: on ? 1 : 0.55 }}>
              <div style={{ ...rowStyle(), borderBottom: "none" }}>
                <Check on={on} onClick={() => update(i, { active: !on })} title={on ? t("Applied to this fit") : t("Ignored")} />
                {generic ? <>
                  <div style={{ flex: 1, minWidth: 0, fontSize: TYPE.label, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={projectedModuleLabel(f)}>
                    {projectedModuleLabel(f)} <span style={{ color: C.textMid }}>· {t("default")}</span>
                  </div>
                </> : <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: TYPE.label, color: C.text }}>{f.ship}</span>
                    <span style={{ fontSize: TYPE.label, color: C.textMid }}> · {f.fitName}</span>
                    {!src && <span style={{ fontSize: TYPE.small, color: C.warning }}> · {t("fit not found")}</span>}
                  </div>
                  {src && <button type="button" style={smallBtn()} onClick={() => s.openFitInNewTab(f.ship, f.fitName)} title={t("Open this fit in a new tab")}>{t("Open")}</button>}
                </>}
                <Remove onClick={() => s.setProjFits(prev => (prev ?? []).filter((_, j) => j !== i))} label={t("Remove")} />
              </div>
              {/* A default effect's count, as a plain stepper, and its script — on their own line, so
                  the module's name keeps the header however narrow the window. */}
              {generic && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px 4px 38px", flexWrap: "wrap" }}>
                <span style={{ fontSize: TYPE.small, color: C.textMid }}>{t("Count")}</span>
                <button type="button" style={{ ...smallBtn(), width: 24, padding: 0 }} disabled={qty <= 1} onClick={() => update(i, { qty: qty - 1 })} aria-label={t("One fewer")}>−</button>
                <span style={{ minWidth: 18, textAlign: "center", fontSize: TYPE.label, color: C.text, fontVariantNumeric: "tabular-nums" }}>{qty}</span>
                <button type="button" style={{ ...smallBtn(), width: 24, padding: 0 }} disabled={qty >= MAX_QTY} onClick={() => update(i, { qty: qty + 1 })} aria-label={t("One more")}>+</button>
                {scripts && <select value={f.script ?? ""} onChange={e => update(i, { script: e.target.value || null })} aria-label={t("Script")}
                  style={{ height: 24, fontSize: 12.5, background: C.bg, color: C.text, border: `1px solid ${C.borderStrong}`, borderRadius: 5, padding: "0 4px", marginLeft: 6, minWidth: 0, flex: "1 1 140px" }}>
                  {scripts.map(sc => <option key={sc ?? "none"} value={sc ?? ""}>{sc ? scriptLabel(sc) : t("No script")}</option>)}
                </select>}
              </div>}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px 4px 38px" }}>
                <span style={{ fontSize: TYPE.small, color: C.textMid }}>{t("Range")}</span>
                <input type="range" min={0} max={150} step={1} value={range} onChange={e => update(i, { rangeKm: Math.max(0, +e.target.value) })}
                  aria-label={t("Range")} style={{ flex: 1, minWidth: 60, accentColor: C.accent }} />
                <input type="text" inputMode="numeric" value={range} aria-label={t("Range in km")}
                  onChange={e => { const n = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10); update(i, { rangeKm: Number.isFinite(n) ? n : 0 }); }}
                  style={{ width: 42, height: 24, textAlign: "right", fontSize: TYPE.label, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: "0 4px" }} />
                <span style={{ fontSize: TYPE.small, color: C.textMid }}>km</span>
              </div>
              <div style={{ padding: "0 12px 6px 38px" }}>
                {lines.length ? lines.map(([label, value, color]) => (
                  <div key={label + value} style={{ display: "flex", justifyContent: "space-between", gap: 10, minHeight: 22, alignItems: "center" }}>
                    <span style={{ fontSize: TYPE.small, color: C.textMid }}>{label}</span>
                    <span style={{ fontSize: TYPE.label, color, fontVariantNumeric: "tabular-nums" }}>{value}</span>
                  </div>
                )) : src && <div style={{ fontSize: TYPE.small, color: C.textMid }}>{t("Nothing on this fit projects onto a target")}</div>}
              </div>
            </div>
          );
        })}
      </Body>
      {picker && <FitPickerSheet title={t("Project a Fit")} fitsDB={s.fitsDB} pinned={tabFits(s.openFitTabs, s.fitsDB)}
        onSelect={(ship, fit) => add(ship, fit)} onClose={() => setPicker(false)} />}
      {modMenu && <ContextMenu x={modMenu.x} y={modMenu.y} items={moduleMenu()} onClose={() => setModMenu(null)} />}
    </Shell>
  );
}

// ── Command links ────────────────────────────────────────────────────────────────────────────
// pyfa's Generic Links menu: Max Links in one click, All Links, then a submenu per category, each link
// with its strength — mindlink strengths on top, then without — as pyfa lays it out.
function linkMenuItems(onAdd) {
  const strengths = (lt) => [
    ...STRENGTHS.map(st => ({ label: t("{n}%/lvl + Mindlink", { n: st }), onSelect: () => onAdd(makeLink(lt, st, true)) })),
    { divider: true },
    ...STRENGTHS.map(st => ({ label: t("{n}%/lvl", { n: st }), onSelect: () => onAdd(makeLink(lt, st, false)) })),
  ];
  return [
    { label: t("Max Links"), hint: t("5%/lvl + Mindlink"), onSelect: () => onAdd(makeLink(ALL_LINKS, 5, true)) },
    { divider: true },
    { label: t("All Links"), submenu: strengths(ALL_LINKS) },
    { divider: true },
    ...CATEGORIES.map(([cat, label]) => ({ label: t(label), submenu: linksOf(cat).map(lt => ({ label: LINK_DEFS[lt][0], submenu: strengths(lt) })) })),
  ];
}

export function CommandPanel({ s }) {
  const [picker, setPicker] = useState(false);
  const [linkMenu, setLinkMenu] = useState(null);   // {x, y, items}
  const addLink = (l) => s.setCmdFits(prev => [...(prev ?? []), l]);
  const setAt = (i, patch) => s.setCmdFits(prev => (prev ?? []).map((p, j) => j === i ? { ...p, ...patch } : p));
  // Right-click anywhere in the window: add a fit, or a generic link — pyfa's command view menu.
  const openMenu = (e) => { e.preventDefault(); setLinkMenu({ x: e.clientX, y: e.clientY, items: [
    { label: t("Add command fit…"), onSelect: () => setPicker(true) },
    { label: t("Generic links"), submenu: linkMenuItems(addLink) },
  ] }); };
  // A dragged fit is taken only if it actually has command bursts running, as the picker filters.
  const fitOf = (ship, name) => s.fitsDB?.[ship]?.find(f => f.name === name);
  const drop = useFitDrop((ship, name) => { const f = fitOf(ship, name); return !!f && hasCommandBursts(ship, f); },
                          (ship, name) => s.setCmdFits(prev => [...(prev ?? []), { ship, fitName: name }]));
  if (!s.activeFit?.ship) return <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;
  const list = s.cmdFits ?? [];
  return (
    <Shell drop={drop} dropLabel={t("Add command links")}>
      <div onContextMenu={openMenu} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, flex: "none" }}>
        <span style={{ fontSize: TYPE.small, color: C.textMid, flex: 1 }}>{t("Command bursts from a fleet support fit, or generic links at a chosen strength.")}</span>
        <button type="button" style={btn()} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setLinkMenu({ x: r.left, y: r.bottom + 4, items: linkMenuItems(addLink) }); }}>
          + {t("Generic links")} ▾</button>
        <button type="button" style={btn()} onClick={() => setPicker(true)}>+ {t("Fit")}</button>
      </div>
      <Body>
        {!list.length && <None>{t("No command links applied. Add a fleet support fit, or generic links (right-click works too).")}</None>}
        {list.map((f, i) => {
          if (isLink(f)) {
            // A generic link: its strength and mindlink edited in place, a line per buff it applies.
            const on = f.active !== false;
            return (
              <div key={i} style={{ borderBottom: `1px solid ${C.border}`, opacity: on ? 1 : 0.55 }}>
                <div style={{ ...rowStyle(), borderBottom: "none" }}>
                  <Check on={on} onClick={() => setAt(i, { active: !on })} title={on ? t("Applied to this fit") : t("Ignored")} />
                  <div style={{ flex: 1, minWidth: 0, fontSize: TYPE.label, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={linkLabel(f)}>
                    {linkLabel(f)} <span style={{ color: C.textMid }}>· {t("generic")}</span>
                  </div>
                  <select value={f.strength} onChange={e => setAt(i, { strength: Number(e.target.value) })} aria-label={t("Strength")} title={t("The command ship's bonus per level, at level V")}
                    style={{ height: 24, fontSize: 12.5, background: C.bg, color: C.text, border: `1px solid ${C.borderStrong}`, borderRadius: 5, padding: "0 4px" }}>
                    {STRENGTHS.map(st => <option key={st} value={st}>{t("{n}%/lvl", { n: st })}</option>)}
                  </select>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: C.textMid, whiteSpace: "nowrap" }} title={t("A warfare mindlink: +25% strength")}>
                    <input type="checkbox" checked={!!f.mindlink} onChange={() => setAt(i, { mindlink: !f.mindlink })} style={{ accentColor: C.accent }} />{t("Mindlink")}
                  </label>
                  <Remove onClick={() => s.setCmdFits(prev => (prev ?? []).filter((_, j) => j !== i))} label={t("Remove")} />
                </div>
                <div style={{ padding: "0 12px 6px 38px" }}>
                  {linkBursts(f).map((b, j) => (
                    <div key={j} style={{ display: "flex", justifyContent: "space-between", gap: 10, minHeight: 22, alignItems: "center" }}>
                      <span style={{ fontSize: TYPE.small, color: C.textMid }}>{t(BUFF_NAMES[b.buffID] ?? "Command burst")}</span>
                      <span style={{ fontSize: TYPE.label, color: C.rig, fontVariantNumeric: "tabular-nums" }}>{b.value > 0 ? "+" : ""}{Math.round(b.value * 10) / 10}{LINK_UNIT}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          const src = s.fitsDB?.[f.ship]?.find(x => x.name === f.fitName);
          const bursts = src ? computeCommandBursts({ name: f.ship, typeID: tidByName(f.ship) }, src.slots, s.sourceSkills(src), { implants: src.implants, boosters: src.boosters }) : [];
          const on = f.active !== false;
          return (
            <div key={i} style={{ borderBottom: `1px solid ${C.border}`, opacity: on ? 1 : 0.55 }}>
              <div style={{ ...rowStyle(), borderBottom: "none" }}>
                <Check on={on} onClick={() => s.setCmdFits(prev => (prev ?? []).map((p, j) => j === i ? { ...p, active: !on } : p))} title={on ? t("Applied to this fit") : t("Ignored")} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: TYPE.label, color: C.text }}>{f.ship}</span>
                  <span style={{ fontSize: TYPE.label, color: C.textMid }}> · {f.fitName}</span>
                </div>
                {src && <button type="button" style={smallBtn()} onClick={() => s.openFitInNewTab(f.ship, f.fitName)} title={t("Open this fit in a new tab")}>{t("Open")}</button>}
                <Remove onClick={() => s.setCmdFits(prev => (prev ?? []).filter((_, j) => j !== i))} label={t("Remove")} />
              </div>
              <div style={{ padding: "0 12px 6px 38px" }}>
                {!bursts.length && <div style={{ fontSize: TYPE.small, color: C.textMid }}>{t("No active command bursts on this fit")}</div>}
                {bursts.map((b, j) => (
                  <div key={j} style={{ display: "flex", justifyContent: "space-between", gap: 10, minHeight: 22, alignItems: "center" }}>
                    <span style={{ fontSize: TYPE.small, color: C.textMid }}>{b.label}</span>
                    <span style={{ fontSize: TYPE.label, color: C.rig, fontVariantNumeric: "tabular-nums" }}>{b.value > 0 ? "+" : ""}{Math.round(b.value * 10) / 10}{WARFARE_BUFF_UNIT[b.buffID] || "%"}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </Body>
      </div>
      {linkMenu && <ContextMenu x={linkMenu.x} y={linkMenu.y} items={linkMenu.items} onClose={() => setLinkMenu(null)} />}
      {picker && <FitPickerSheet title={t("Select Command Ship Fit")} fitsDB={s.fitsDB} filterFn={hasCommandBursts} pinned={tabFits(s.openFitTabs, s.fitsDB, hasCommandBursts)}
        onSelect={(ship, fit) => s.setCmdFits(prev => [...(prev ?? []), { ship, fitName: fit.name }])} onClose={() => setPicker(false)} />}
    </Shell>
  );
}

// ── Environment ──────────────────────────────────────────────────────────────────────────────
export function EnvironmentPanel({ s }) {
  const [picker, setPicker] = useState(false);
  if (!s.activeFit?.ship) return <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;
  const env = s.slots?.environment ?? null;
  const setEnv = (n) => s.setSlots(prev => ({ ...prev, environment: n || undefined }));
  return (
    <Shell>
      <Header>{t("The system this fit is sitting in. Wormhole effects and metaliminal storms change resists, reps, damage, speed and signature for everything in the system.")}</Header>
      <div style={{ ...rowStyle(), minHeight: 40 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: TYPE.small, color: C.textMid }}>{t("Current system")}</div>
          <div style={{ fontSize: TYPE.value, color: env ? C.accent : C.textMid }}>{env ?? t("Normal space (no effects)")}</div>
        </div>
        <button type="button" style={btn()} onClick={() => setPicker(true)}>{t("Change…")}</button>
        {env && <Remove onClick={() => setEnv(null)} label={t("Clear")} />}
      </div>
      {picker && <EnvironmentPickerSheet current={env} onSelect={n => { setEnv(n); setPicker(false); }} onClose={() => setPicker(false)} />}
    </Shell>
  );
}
