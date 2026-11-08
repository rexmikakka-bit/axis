import { useEffect, useMemo, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { tidByName } from "../calc.js";
import { eveIcon } from "../lib/icons.js";
import { implantSetMembers, applyImplantSet, searchImplants } from "../lib/core.js";
import { ImplantPicker, ImplantLoadoutSheet } from "../components/implants.jsx";
import Menu from "./Menu.jsx";
import { useRowSelect } from "./ContextMenu.jsx";
import { useInspect } from "./inspect-context.jsx";
import { implantTarget, typeTarget } from "./inspect.js";
import { Empty, TYPE } from "./kit.jsx";
import { fetchPrices } from "../prices.js";
import { fmtResource } from "../lib/fmt.js";
import { useItemDrop, DropHint } from "./items-context.jsx";

// The desktop Implants window: the ten slots as a numbered list in two groups, a search across every
// slot that fits straight into the right one, implant sets, and saved loadouts (save, load, rename,
// delete). Same edits the phone's ImplantsScreen makes, through its own picker and loadout sheet.

const EMPTY = "[Empty]";
const GROUPS = [{ id: "attrs", label: "Attribute Enhancers", slots: [1, 2, 3, 4, 5] }, { id: "hardwirings", label: "Hardwirings", slots: [6, 7, 8, 9, 10] }];

export default function ImplantsPanel({ s }) {
  const [picker, setPicker] = useState(null);
  const insp = useInspect();
  const [query, setQuery] = useState("");
  const [naming, setNaming] = useState(null);
  const [loadoutsOpen, setLoadoutsOpen] = useState(false);
  const results = useMemo(() => searchImplants(query), [query]);
  const rs = useRowSelect();
  const drop = useItemDrop("implants");
  // What the plugged-in set costs, at the chosen hub — shown in the header's empty space.
  const setIds = (s.implants ?? []).filter(i => i.name && i.name !== EMPTY).map(i => i.typeID ?? tidByName(i.name)).filter(Boolean);
  const setKey = setIds.join(",");
  const [setValue, setSetValue] = useState(null);   // {total, missing}
  useEffect(() => {
    if (!setIds.length) { setSetValue(null); return; }
    let live = true;
    fetchPrices(setIds, s.priceHub, s.priceSource).then(m => {
      if (!live) return;
      const prices = setIds.map(id => m?.get(id) ?? m?.get(String(id)));
      setSetValue({ total: prices.reduce((a, p) => a + (p > 0 ? p : 0), 0), missing: prices.filter(p => !(p > 0)).length });
    }).catch(() => { if (live) setSetValue(null); });
    return () => { live = false; };
  }, [setKey, s.priceHub, s.priceSource]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!s.activeFit?.ship) return <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;
  const implants = s.implants ?? [];
  const set = s.setImplants;
  const filled = implants.filter(i => i.name !== EMPTY).length;
  const fitInto = (item) => { set(prev => prev.map(i => i.slot === item.slot ? { ...i, name: item.name, bonus: null } : i)); setQuery(""); };
  const fitSet = (st) => { set(prev => applyImplantSet(prev, st)); setQuery(""); };
  const clearSlot = (slot) => set(prev => prev.map(i => i.slot === slot ? { ...i, name: EMPTY, bonus: null } : i));
  const loadouts = s.implantLoadouts ?? [];
  // The loadout the fitted implants ARE: the saved one whose every slot matches, empty slots
  // included. Worked out rather than remembered, so changing one implant after loading drops the
  // name instead of claiming a loadout that is no longer what is fitted.
  const bySlot = (list) => { const m = new Map(); for (const i of list ?? []) if (i?.name && i.name !== EMPTY) m.set(i.slot, i.name); return m; };
  const fittedBySlot = bySlot(implants);
  const current = filled ? loadouts.find(lo => { const m = bySlot(lo.implants); return m.size === fittedBySlot.size && [...m].every(([k, v]) => fittedBySlot.get(k) === v); }) : null;
  const saveLoadout = () => {
    const name = (naming ?? "").trim(); setNaming(null);
    if (name) s.setImplantLoadouts(prev => [...(prev ?? []), { id: Date.now(), name, implants: [...implants] }]);
  };
  const row = { display: "flex", alignItems: "center", gap: 9, minHeight: 30, padding: "0 12px", borderBottom: `1px solid ${C.border}99` };
  const withRow = (key, o) => { const p = rs.rowProps(key, o); return { ...p, style: { ...row, ...p.style } }; };
  // A fitted implant opens as its slot (so a swap in its Variations window lands in that slot); a
  // search result is just a type.
  const showDetail = (imp, slot, tab) => insp.inspect(implantTarget(insp.fitRef, slot, imp.typeID ?? tidByName(imp.name)), tab);
  const showType = (item, tab) => insp.inspect(typeTarget(item.typeID ?? tidByName(item.name)), tab);
  return (
    <div {...drop.props} style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
      <DropHint over={drop.over} ok={drop.ok} label={t("Plug in")} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", flex: "none", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: TYPE.label, color: C.textMid }}>{t("{n}/10 fitted", { n: filled })}</span>
        <span style={{ flex: 1, minWidth: 0, textAlign: "right", paddingRight: 6, fontSize: TYPE.label, color: C.textMid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          title={setValue?.missing ? t("{n} without a price at {hub}", { n: setValue.missing, hub: s.priceHub ?? "Jita" }) : t("Set value at {hub}", { hub: s.priceHub ?? "Jita" })}>
          {current && <span title={t("The saved loadout these implants match")} style={{ color: C.accent }}>{current.name}</span>}
          {current && setValue && setValue.total > 0 && <span style={{ margin: "0 6px" }}>·</span>}
          {setValue && setValue.total > 0 && <><span style={{ color: C.text }}>{fmtResource(setValue.total)}</span> ISK{setValue.missing ? " +" : ""}</>}
        </span>
        {naming == null
          ? <Menu label={`${t("Loadouts")} ▾`} buttonStyle={{ height: 26, border: `1px solid ${C.borderStrong}`, fontSize: 12.5 }} items={[
              { label: t("Save current as…"), onSelect: () => setNaming(""), disabled: !filled },
              loadouts.length ? { label: t("Manage loadouts…"), onSelect: () => setLoadoutsOpen(true) } : null,
              loadouts.length ? { divider: true } : null,
              ...loadouts.map(lo => ({ label: lo.name, hint: t("{n} implants", { n: (lo.implants ?? []).filter(i => i.name !== EMPTY).length }),
                                       onSelect: () => lo.implants?.length && set(lo.implants.map(i => ({ ...i }))) })),
            ]} />
          : <input autoFocus value={naming} onChange={e => setNaming(e.target.value)} placeholder={t("Loadout name...")} aria-label={t("Loadout name...")}
              onKeyDown={e => { if (e.key === "Enter") saveLoadout(); if (e.key === "Escape") setNaming(null); }} onBlur={saveLoadout}
              style={{ height: 26, width: 150, boxSizing: "border-box", padding: "0 8px", borderRadius: 6, fontSize: 12.5, background: C.bg, border: `1px solid ${C.accent}`, color: C.text, outline: "none" }} />}
        {filled > 0 && <button type="button" onClick={() => set(Array.from({ length: 10 }, (_, i) => ({ slot: i + 1, name: EMPTY, bonus: null })))}
          title={t("Clear every implant from this fit")}
          style={{ height: 26, padding: "0 10px", borderRadius: 6, fontSize: 12.5, cursor: "pointer", background: "transparent", border: `1px solid ${C.borderStrong}`, color: C.danger }}>{t("Clear")}</button>}
      </div>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Search all implants...")} aria-label={t("Search all implants...")}
        style={{ height: 28, margin: "8px 12px 4px", boxSizing: "border-box", width: "calc(100% - 24px)", padding: "0 10px", borderRadius: 6, fontSize: 13,
                 background: C.bg, border: `1px solid ${C.borderStrong}`, color: C.text, outline: "none", flex: "none" }} />
      <div {...rs.listProps({ onDelete: k => { if (k.startsWith("s:")) clearSlot(+k.slice(2)); } })} style={{ flex: 1, minHeight: 0, overflowY: "auto", outline: "none" }}>
        {results
          ? (results.length ? results.map(item => {
              const fitted = implants.find(i => i.slot === item.slot)?.name === item.name;
              return (
                <div key={item.typeID} {...withRow(`r:${item.typeID}`, {
                  target: typeTarget(item.typeID ?? tidByName(item.name)),
                  onOpen: () => fitInto(item),
                  items: () => {
                    const st = implantSetMembers(item.name);
                    return [
                      { label: fitted ? t("Fitted") : t("Fit implant"), hint: t("Double-click"), disabled: fitted, onSelect: () => fitInto(item) },
                      st && { label: t("+ {set} set", { set: st.setName }), onSelect: () => fitSet(st) },
                      { divider: true },
                      { label: t("Show info"), onSelect: () => showType(item, "info") },
                      { label: t("Variations"), onSelect: () => showType(item, "variations") },
                    ];
                  },
                })}>
                  <span style={{ width: 22, fontSize: TYPE.small, color: C.textMid, textAlign: "right" }}>{item.slot}</span>
                  <img className="eve-icon" src={eveIcon(item.typeID ?? tidByName(item.name), 32)} width={20} height={20} alt="" onError={e => { e.target.style.visibility = "hidden"; }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: TYPE.label, color: fitted ? C.accent : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                  {implantSetMembers(item.name) && <button type="button" onClick={e => { e.stopPropagation(); fitSet(implantSetMembers(item.name)); }}
                    style={{ height: 22, padding: "0 8px", borderRadius: 5, fontSize: 12, cursor: "pointer", background: "transparent", border: `1px solid ${C.borderStrong}`, color: C.textMid }}>{t("+ set")}</button>}
                </div>
              );
            }) : <div style={{ padding: 12, fontSize: TYPE.label, color: C.textMid }}>{t('No implants match "{q}"', { q: query.trim() })}</div>)
          : GROUPS.map(g => (
            <div key={g.id}>
              <div style={{ padding: "8px 12px 4px", fontSize: TYPE.section, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid }}>{t(g.label)}</div>
              {g.slots.map(n => {
                const imp = implants.find(i => i.slot === n);
                const empty = !imp || imp.name === EMPTY;
                return (
                  <div key={n} {...withRow(`s:${n}`, {
                    target: empty ? undefined : implantTarget(insp.fitRef, n, imp.typeID ?? tidByName(imp.name)),
                    onOpen: () => empty ? setPicker({ slot: n, name: EMPTY }) : clearSlot(n),
                    items: () => empty
                      ? [{ label: t("Add implant…"), hint: t("Double-click"), onSelect: () => setPicker({ slot: n, name: EMPTY }) }]
                      : [
                          { label: t("Show info"), onSelect: () => showDetail(imp, n, "info") },
                          { label: t("Variations"), onSelect: () => showDetail(imp, n, "variations") },
                          { label: t("Change implant…"), onSelect: () => setPicker({ slot: n, name: imp.name }) },
                          implantSetMembers(imp.name) && { label: t("+ {set} set", { set: implantSetMembers(imp.name).setName }), onSelect: () => fitSet(implantSetMembers(imp.name)) },
                          { divider: true },
                          { label: t("Remove implant"), hint: t("double-click · Del"), danger: true, onSelect: () => clearSlot(n) },
                        ],
                  })}>
                    <span style={{ width: 22, fontSize: TYPE.small, color: C.textMid, textAlign: "right" }}>{n}</span>
                    {empty ? <span style={{ width: 20 }} /> : <img className="eve-icon" src={eveIcon(imp.typeID ?? tidByName(imp.name), 32)} width={20} height={20} alt="" onError={e => { e.target.style.visibility = "hidden"; }} />}
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: TYPE.label, color: empty ? C.textMid : C.text }}>
                      {empty ? t("Empty") : imp.name}{!empty && imp.bonus && <span style={{ color: C.rig, fontSize: TYPE.small }}> · {imp.bonus}</span>}
                    </span>
                    {!empty && <button type="button" aria-label={t("Remove implant")} title={t("Remove implant")} onClick={e => { e.stopPropagation(); clearSlot(n); }}
                      style={{ border: "none", background: "none", color: C.textMid, cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>}
                  </div>
                );
              })}
            </div>
          ))}
      </div>
      {picker && <ImplantPicker slot={picker.slot} current={picker.name}
        onSelect={opt => set(prev => prev.map(i => i.slot === picker.slot ? { ...i, name: opt.name, bonus: opt.bonus ?? null } : i))}
        onSelectSet={fitSet} onClear={() => clearSlot(picker.slot)} onClose={() => setPicker(null)} />}
      {rs.view}
      {loadoutsOpen && <ImplantLoadoutSheet loadouts={loadouts}
        onLoad={lo => lo.implants?.length && set(lo.implants.map(i => ({ ...i })))}
        onRename={(id, name) => s.setImplantLoadouts(prev => prev.map(l => l.id === id ? { ...l, name: (name ?? "").trim() || l.name } : l))}
        onDelete={id => s.setImplantLoadouts(prev => prev.filter(l => l.id !== id))} onClose={() => setLoadoutsOpen(false)} />}
    </div>
  );
}
