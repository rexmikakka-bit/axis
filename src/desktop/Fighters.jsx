import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { tidByName } from "../calc.js";
import { eveIcon } from "../lib/icons.js";
import { useRowSelect } from "./ContextMenu.jsx";
import { useInspect } from "./inspect-context.jsx";
import { typeTarget } from "./inspect.js";
import { UsageBar, Empty, TYPE } from "./kit.jsx";
import { fighterAttrs, fighterClassOf } from "./items.js";
import { useItemDrop, DropHint, useItems } from "./items-context.jsx";

// The desktop Fighters window, for carriers, supercarriers and structures with fighter tubes: the
// bay, the tubes and the per-class launch limits on top, then one row per squadron — launched,
// squadrons, the engine's DPS / speed / EHP for it, and its abilities as toggles beneath the name.
//
// Same rules and the same stored shape as the phone's DronesScreen ({id, name, tier, typeID, role,
// qty, active, abilities}): a new squadron launches only if there is BOTH a free tube and a free
// slot of its own class, else it waits in the bay, which is legal; the class limits count LAUNCHED
// squadrons, as the tube count beside them does. The numbers are calcFitStats' fighterDetails.

// Theme colours by NAME, resolved where they are drawn: a module-scope copy would keep the palette
// the app started with after a theme switch.
const CLASSES = [["Light", "light", "rig"], ["Heavy", "heavy", "warning"], ["Support", "support", "accent"]];
const KIND_COLOR = { damage: "high", speed: "accent", tackle: "warning" };
const attrsOf = fighterAttrs;
const fmtK = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n ?? 0));

export default function FightersPanel({ s, stats, shipFighter }) {
  // "+" opens the Browser narrowed to fighters; its double-click (or a drag) lands here.
  const itemOps = useItems();
  const rs = useRowSelect();
  const insp = useInspect();
  const drop = useItemDrop("fighters");
  if (!s.activeFit?.ship) return <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;
  const fighters = s.fighters ?? [];
  const info = stats.fighterInfo ?? [];
  const set = (fn) => s.setFighters(prev => fn(prev ?? []));
  const classOf = (f, i) => info[i]?.class ?? fighterClassOf(f);
  const launched = { Light: 0, Heavy: 0, Support: 0 };
  fighters.forEach((f, i) => { if (f.active !== false) launched[classOf(f, i)] += f.qty ?? 1; });
  const tubesUsed = fighters.reduce((a, f) => a + (f.active !== false ? (f.qty ?? 1) : 0), 0);
  const bayUsed = fighters.reduce((a, f, i) => {
    const at = attrsOf(f);
    return a + (f.qty ?? 1) * (info[i]?.sqSize ?? at?.fighterSquadronMaxSize ?? 0) * (at?.volume ?? 0);
  }, 0);
  const dps = info.reduce((a, d) => a + (d?.active !== false ? (d?.dps || 0) : 0), 0);
  // The add rule lives in items.js, shared with the Browser and drag-and-drop.
  const toggle = (id) => set(l => l.map(f => f.id === id ? { ...f, active: f.active === false } : f));
  const setQty = (id, n) => set(l => l.map(f => f.id === id ? { ...f, qty: Math.max(1, n) } : f));
  const remove = (id) => set(l => l.filter(f => f.id !== id));
  const toggleAbility = (id, key, on) => set(l => l.map(f => f.id === id ? { ...f, abilities: { ...(f.abilities || {}), [key]: !on } } : f));
  const cols = "18px 64px minmax(150px,1fr) 60px 70px 56px 16px";
  const cell = { fontSize: TYPE.small, color: C.textMid, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const int = (n) => String(Math.round(n));
  return (
    <div {...drop.props} {...rs.blankProps([{ label: t("Add fighters…"), onSelect: () => itemOps.browse("fighters") }])} style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
      <DropHint over={drop.over} ok={drop.ok} label={t("Add to fighter bay")} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "8px 16px", padding: "10px 12px", flex: "none", borderBottom: `1px solid ${C.border}` }}>
        <UsageBar label={t("Fighter bay")} used={bayUsed} total={shipFighter.cap} unit="m³" fmt={fmtK} />
        <UsageBar label={t("Tubes")} used={tubesUsed} total={shipFighter.tubes} fmt={int} color={C.high} />
        {CLASSES.filter(([, k]) => (shipFighter[k] ?? 0) > 0).map(([cls, k, col]) => (
          <UsageBar key={k} label={t(cls)} used={launched[cls]} total={shipFighter[k]} fmt={int} color={C[col]} labelColor={C[col]} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: cols, columnGap: 8, alignItems: "center", padding: "6px 12px", flex: "none", fontSize: TYPE.section,
                    letterSpacing: ".05em", textTransform: "uppercase", color: C.textMid, borderBottom: `1px solid ${C.border}` }}>
        <span /><span style={{ textAlign: "right" }}>{t("Sqd")}</span><span>{t("Squadron")} · <span style={{ color: C.high, textTransform: "none" }}>{fmtK(dps)} DPS</span></span>
        <span style={{ textAlign: "right" }}>DPS</span><span style={{ textAlign: "right" }}>{t("Speed")}</span><span style={{ textAlign: "right" }}>EHP</span>
        <button type="button" onClick={() => itemOps.browse("fighters")} aria-label={t("Add fighters")} title={t("Add fighters")}
          style={{ border: "none", background: "none", color: C.accent, cursor: "pointer", fontSize: 16, padding: 0 }}>+</button>
      </div>
      <div {...rs.listProps({ onDelete: remove })} style={{ flex: 1, minHeight: 0, overflowY: "auto", outline: "none" }}>
        {!fighters.length && <div style={{ padding: 12, fontSize: TYPE.label, color: C.textMid }}>{t("No fighter squadrons. Use + to add some.")}</div>}
        {fighters.map((f, i) => {
          const d = info[i] ?? {}, on = f.active !== false, tid = f.typeID ?? tidByName(f.name), cls = classOf(f, i);
          const col = C[CLASSES.find(([c]) => c === cls)?.[2]] ?? C.textMid;
          const rp = rs.rowProps(f.id, {
            target: tid ? typeTarget(tid) : undefined,
            onOpen: () => remove(f.id),
            items: [
              { label: on ? t("Return to the bay") : t("Launch"), onSelect: () => toggle(f.id) },
              { label: t("Add a squadron"), onSelect: () => setQty(f.id, (f.qty ?? 1) + 1) },
              { divider: true },
              { label: t("Show info"), disabled: !tid, onSelect: () => insp.inspect(typeTarget(tid), "info") },
              { label: t("Variations"), disabled: !tid, onSelect: () => insp.inspect(typeTarget(tid), "variations") },
              tid && { label: t("Show in market"), onSelect: () => itemOps.showInMarket(tid) },
              { divider: true },
              { label: t("Remove"), hint: t("double-click · Del"), danger: true, onSelect: () => remove(f.id) },
            ],
          });
          return (
            <div key={f.id} {...rp} style={{ ...rp.style, padding: "4px 12px 6px", borderBottom: `1px solid ${C.border}99`, opacity: on ? 1 : 0.65 }}>
              <div style={{ display: "grid", gridTemplateColumns: cols, columnGap: 8, alignItems: "center", minHeight: 28 }}>
                <input type="checkbox" checked={on} onChange={() => toggle(f.id)} title={on ? t("Launched") : t("In the bay")} aria-label={t("Launched")}
                  style={{ width: 16, height: 16, accentColor: C.accent }} />
                <input type="text" inputMode="numeric" value={f.qty ?? 1} aria-label={t("Squadrons of {name}", { name: f.name })}
                  onChange={e => { const n = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10); if (n > 0) setQty(f.id, n); }}
                  style={{ width: "100%", boxSizing: "border-box", height: 24, textAlign: "right", fontSize: TYPE.label, padding: "0 4px", background: C.bg,
                           border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontVariantNumeric: "tabular-nums" }} />
                <span title={f.name} style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                  {tid && <img className="eve-icon" src={eveIcon(tid, 32)} width={20} height={20} alt="" onError={e => { e.target.style.visibility = "hidden"; }} />}
                  <span style={{ fontSize: TYPE.label, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  <span style={{ fontSize: TYPE.small, color: col, flex: "none" }}>{t(cls)}</span>
                  {d.sqSize > 0 && <span style={{ fontSize: TYPE.small, color: C.textMid, flex: "none" }}>×{d.sqSize}</span>}
                </span>
                <span style={{ ...cell, color: d.dps ? C.high : C.textMid }}>{d.dps ? fmtK(d.dps) : "—"}</span>
                <span style={cell} title={d.burstFrom ? t("With {ability}", { ability: d.burstFrom }) : undefined}>
                  {(d.speedActive ?? d.speed) ? `${Math.round(d.speedActive ?? d.speed)} m/s` : "—"}</span>
                <span style={cell}>{d.ehp ? fmtK(d.ehp) : "—"}</span>
                <button type="button" onClick={() => remove(f.id)} aria-label={t("Remove {name}", { name: f.name })}
                  style={{ border: "none", background: "none", color: C.textMid, cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
              </div>
              {(d.abilities ?? []).length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 90, marginTop: 2 }}>
                  {d.abilities.map(ab => {
                    const c = C[KIND_COLOR[ab.kind]] ?? C.textMid;
                    return (
                      <button key={ab.key} type="button" aria-pressed={!!ab.active} onClick={e => { e.stopPropagation(); toggleAbility(f.id, ab.key, ab.active); }}
                        style={{ height: 22, padding: "0 9px", borderRadius: 11, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                                 background: ab.active ? `${c}22` : "transparent", border: `1px solid ${ab.active ? `${c}88` : C.borderStrong}`, color: ab.active ? c : C.textMid }}>
                        {ab.label}{ab.kind === "damage" && ab.active && ab.dps ? ` · ${fmtK(ab.dps)}` : ""}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {rs.view}
    </div>
  );
}
