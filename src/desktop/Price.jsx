import { useEffect, useMemo, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { TYPES, tidByName } from "../calc.js";
import { canLoadCharge, loadedChargeCount } from "../lib/core.js";
import { metaOf } from "../lib/meta.js";
import { fetchPrices, priceAsOf, MARKET_HUBS, MARKET_SOURCES } from "../prices.js";
import { fmtPriceAge } from "../lib/fmt.js";
import { abyssalValue } from "../lib/abyssal-value.js";
import { useAbyssalData } from "../lib/use-abyssal-data.js";
import { Empty, TYPE } from "./kit.jsx";
import { eveIcon } from "../lib/icons.js";
import { ContextMenu } from "./ContextMenu.jsx";
import { useInspect } from "./inspect-context.jsx";
import { typeTarget } from "./inspect.js";

// The desktop Fit price window (docs/desktop-handoff.md, "Fit price"): the total, a breakdown by
// group that opens to its items, and the market source and hub. The pricing rules are the phone's
// Fit Value card's (tabs.jsx StatsTab), line for line — charges priced by the LOAD, boosters and
// cargo in the fit, implants beside it, abyssal rolls valued from their roll and never from the base
// type's market price. Keep the two in step.

const isk = (n) => n == null ? "—" : n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(Math.round(n));
const SOURCE_LABEL = { fuzzwork: "Fuzzwork", ceve: "ceve-market" };

export default function PricePanel({ s, ship }) {
  const slots = s.slots ?? {};
  const abyssalData = useAbyssalData(slots);
  const [menu, setMenu] = useState(null);   // a row's right-click menu, {x, y, items}
  const insp = useInspect();
  const items = useMemo(() => {
    const all = [...(slots.high ?? []), ...(slots.mid ?? []), ...(slots.low ?? []), ...(slots.rigs ?? []), ...(slots.subsystems ?? [])];
    const ammo = (m) => { const nm = (m.ammo || "").replace(/\s*\(\d+\)$/, ""); return nm ? tidByName(nm) : null; };
    return {
      ship: ship?.typeID ? [{ typeID: ship.typeID, qty: 1 }] : [],
      modules: all.filter(m => m?.typeID).map(m => ({ typeID: m.typeID, qty: 1, mod: m, abyssal: m.mutaplasmid != null || metaOf(m.typeID, null) === "Abyssal" })),
      charges: all.filter(m => m?.ammo && canLoadCharge(m.typeID, m.ammo)).map(m => ({ typeID: ammo(m), qty: loadedChargeCount(m, ammo(m)) })).filter(x => x.typeID),
      drones: [
        ...(s.drones ?? []).map(d => ({ typeID: d.typeID ?? tidByName(d.name), qty: d.qty ?? 1, abyssal: d.mutaplasmid != null || metaOf(d.typeID, null) === "Abyssal" })),
        ...(s.fighters ?? []).map(f => { const tid = f.typeID ?? tidByName(f.name); return { typeID: tid, qty: (f.qty ?? 1) * ((tid != null ? TYPES[tid]?.attrs?.fighterSquadronMaxSize : 0) || 1) }; }),
      ].filter(d => d.typeID),
      cargo: (s.cargoItems ?? []).map(c => ({ typeID: c.typeID ?? tidByName(c.name), qty: c.qty ?? 1 })).filter(c => c.typeID && c.qty > 0),
      boosters: (s.boosters ?? []).map(b => ({ typeID: tidByName(b.name), qty: 1 })).filter(x => x.typeID),
      implants: (s.implants ?? []).filter(i => i?.name && i.name !== "[Empty]").map(i => ({ typeID: tidByName(i.name), qty: 1 })).filter(x => x.typeID),
    };
  }, [ship, slots, s.implants, s.boosters, s.drones, s.fighters, s.cargoItems]);
  const ids = useMemo(() => { const set = new Set(); for (const g of Object.values(items)) for (const { typeID } of g) if (typeID) set.add(typeID); return [...set]; }, [items]);
  const key = useMemo(() => ids.slice().sort((a, b) => a - b).join(","), [ids]);
  const [prices, setPrices] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!ids.length) return;
    let dead = false;
    setLoading(true); setError(null);
    fetchPrices(ids, s.priceHub, s.priceSource)
      .then(m => { if (!dead) { setPrices(m); setLoading(false); } })
      .catch(e => { if (!dead) { setLoading(false); setError(e?.offline ? t("No connection — market prices need internet") : t("Couldn't fetch market prices — try again")); } });
    return () => { dead = true; };
  }, [key, s.priceHub, s.priceSource]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState({});

  const rows = useMemo(() => {
    const out = {};
    for (const [group, list] of Object.entries(items)) {
      const merged = new Map();
      for (const { typeID, qty, abyssal, mod } of list) {
        const k = abyssal ? `${typeID}*${mod?.id ?? merged.size}` : String(typeID);
        const val = abyssal ? abyssalValue(mod, abyssalData) : { price: prices?.get(typeID) ?? 0 };
        const e = merged.get(k) ?? { key: k, typeID, abyssal: !!abyssal, qty: 0, unit: val.price };
        e.qty += qty ?? 1; merged.set(k, e);
      }
      out[group] = [...merged.values()].map(e => ({ ...e, name: TYPES[String(e.typeID)]?.n ?? `#${e.typeID}`, total: e.unit == null ? null : e.unit * e.qty }))
        .sort((a, b) => (a.total == null) - (b.total == null) || (b.total ?? 0) - (a.total ?? 0));
    }
    return out;
  }, [items, prices, abyssalData]);
  const totals = Object.fromEntries(Object.entries(rows).map(([g, list]) => [g, list.reduce((a, r) => a + (r.total ?? 0), 0)]));
  const fit = Object.entries(totals).filter(([g]) => g !== "implants").reduce((a, [, v]) => a + v, 0);
  const unknown = rows.modules?.filter(r => r.abyssal && r.unit == null).length ?? 0;
  const age = fmtPriceAge(priceAsOf(ids, s.priceHub, s.priceSource));
  if (!ship) return <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;
  const GROUPS = [["ship", t("Ship")], ["modules", t("Modules")], ["charges", t("Charges")], ["drones", t("Drones")], ["cargo", t("Cargo")], ["boosters", t("Boosters")]];
  const chip = (on) => ({ height: 24, padding: "0 10px", borderRadius: 12, fontSize: 12, cursor: "pointer", background: on ? C.accentLight : "transparent",
                          border: `1px solid ${on ? C.accent : C.borderStrong}`, color: on ? C.accent : C.textMid });
  const Row = ({ g, label, value, dim }) => {
    const list = rows[g] ?? [], expandable = list.length > 0 && !loading, isOpen = expandable && open[g];
    return (
      <>
        <div onClick={expandable ? () => setOpen(o => ({ ...o, [g]: !o[g] })) : undefined}
          onContextMenu={expandable ? e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, items: [
            { label: isOpen ? t("Collapse") : t("Expand"), onSelect: () => setOpen(o => ({ ...o, [g]: !o[g] })) }] }); } : undefined}
          style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 28, padding: "0 12px", cursor: expandable ? "pointer" : "default", borderTop: `1px solid ${C.border}99` }}>
          <span style={{ width: 10, fontSize: 9, color: C.textMid, transform: isOpen ? "rotate(90deg)" : "none", opacity: expandable ? 1 : 0 }}>▶</span>
          <span style={{ flex: 1, fontSize: TYPE.label, color: dim ? C.textMid : C.text }}>{label}</span>
          <span style={{ fontSize: TYPE.value, color: dim ? C.textMid : C.text, fontVariantNumeric: "tabular-nums" }}>{loading ? "…" : isk(value)}</span>
        </div>
        {isOpen && list.map(r => (
          <div key={r.key} onContextMenu={r.typeID ? e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, items: [
              { label: t("Show info"), icon: eveIcon(r.typeID, 32), onSelect: () => insp.inspect(typeTarget(r.typeID), "info") }] }); } : undefined}
            style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 24, padding: "0 12px 0 30px", background: `${C.surfaceAlt}88` }}>
            <span title={r.name} style={{ flex: 1, minWidth: 0, fontSize: TYPE.small, color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.qty > 1 && <span style={{ color: C.text }}>{r.qty}× </span>}{r.name}{r.abyssal && <span style={{ color: C.textMid }}> · {t("abyssal")}</span>}
            </span>
            <span style={{ fontSize: TYPE.small, color: r.total == null ? C.textMid : C.text, fontVariantNumeric: "tabular-nums" }}
              title={r.abyssal ? t("Abyssal module — value depends on the roll, not the base type") : undefined}>{r.total == null ? "—" : isk(r.total)}</span>
          </div>
        ))}
      </>
    );
  };
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "10px 12px 4px", flex: "none" }}>
        <span style={{ fontSize: TYPE.section, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid, flex: 1 }}>{t("Fit total, excl. implants")}</span>
        <span style={{ fontSize: 17, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>{loading ? "…" : `${isk(fit)}${unknown ? " + ?" : ""} ISK`}</span>
      </div>
      {(totals.implants ?? 0) > 0 && <div style={{ padding: "0 12px 4px", textAlign: "right", fontSize: TYPE.small, color: C.textMid }}>
        {t("with implants")} <span style={{ color: C.text }}>{isk(fit + totals.implants)}</span></div>}
      {(unknown > 0 || abyssalData.loading || error) && <div role="status" style={{ padding: "0 12px 6px", fontSize: TYPE.small, color: C.warning }}>
        {error ?? (abyssalData.loading ? t("Loading saved module details…") : t({ one: "Known subtotal; {n} abyssal module has no confirmed value.", other: "Known subtotal; {n} abyssal modules have no confirmed value." }, { n: unknown }))}
      </div>}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {GROUPS.map(([g, label]) => <Row key={g} g={g} label={label} value={totals[g]} />)}
        <Row g="implants" label={t("Implants")} value={totals.implants} dim />
      </div>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "8px 12px", borderTop: `1px solid ${C.border}` }}>
        <span style={{ fontSize: TYPE.small, color: C.textMid }}>{t("Source")}</span>
        {MARKET_SOURCES.map(src => <button key={src} type="button" aria-pressed={s.priceSource === src} onClick={() => s.setPriceSource(src)} style={chip(s.priceSource === src)}>{SOURCE_LABEL[src] ?? src}</button>)}
        <select value={s.priceHub} onChange={e => s.setPriceHub(e.target.value)} aria-label={t("Market hub")}
          style={{ height: 24, fontSize: 12, background: C.bg, color: C.text, border: `1px solid ${C.borderStrong}`, borderRadius: 5 }}>
          {MARKET_HUBS.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        {age && <span style={{ fontSize: TYPE.small, color: C.textMid }}>{t("sell prices, {age}", { age })}</span>}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
