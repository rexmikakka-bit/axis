import { useMemo, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { tidByName } from "../calc.js";
import { eveIcon } from "../lib/icons.js";
import { implantSetMembers, applyImplantSet, searchImplants } from "../lib/core.js";
import { ItemDetailSheet } from "../components/ui.jsx";
import { ImplantPicker, ImplantLoadoutSheet } from "../components/implants.jsx";
import Menu from "./Menu.jsx";
import { useRowSelect } from "./ContextMenu.jsx";
import { Empty, TYPE } from "./kit.jsx";

// The desktop Implants window: the ten slots as a numbered list in two groups, a search across every
// slot that fits straight into the right one, implant sets, and saved loadouts (save, load, rename,
// delete). Same edits the phone's ImplantsScreen makes, through its own picker and loadout sheet.

const EMPTY = "[Empty]";
const GROUPS = [{ id: "attrs", label: "Attribute Enhancers", slots: [1, 2, 3, 4, 5] }, { id: "hardwirings", label: "Hardwirings", slots: [6, 7, 8, 9, 10] }];

export default function ImplantsPanel({ s }) {
  const [picker, setPicker] = useState(null);
  const [detail, setDetail] = useState(null);
  const [query, setQuery] = useState("");
  const [naming, setNaming] = useState(null);
  const [loadoutsOpen, setLoadoutsOpen] = useState(false);
  const results = useMemo(() => searchImplants(query), [query]);
  const rs = useRowSelect();
  if (!s.activeFit?.ship) return <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;
  const implants = s.implants ?? [];
  const set = s.setImplants;
  const filled = implants.filter(i => i.name !== EMPTY).length;
  const fitInto = (item) => { set(prev => prev.map(i => i.slot === item.slot ? { ...i, name: item.name, bonus: null } : i)); setQuery(""); };
  const fitSet = (st) => { set(prev => applyImplantSet(prev, st)); setQuery(""); };
  const clearSlot = (slot) => set(prev => prev.map(i => i.slot === slot ? { ...i, name: EMPTY, bonus: null } : i));
  const loadouts = s.implantLoadouts ?? [];
  const saveLoadout = () => {
    const name = (naming ?? "").trim(); setNaming(null);
    if (name) s.setImplantLoadouts(prev => [...(prev ?? []), { id: Date.now(), name, implants: [...implants] }]);
  };
  const row = { display: "flex", alignItems: "center", gap: 9, minHeight: 30, padding: "0 12px", borderBottom: `1px solid ${C.border}99` };
  const withRow = (key, o) => { const p = rs.rowProps(key, o); return { ...p, style: { ...row, ...p.style } }; };
  const showDetail = (imp, slot, tab) => setDetail({ ...imp, slot, typeID: imp.typeID ?? tidByName(imp.name), tab });
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", flex: "none", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: TYPE.label, color: C.textMid, flex: 1 }}>{t("{n}/10 fitted", { n: filled })}</span>
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
                  onOpen: () => fitInto(item),
                  items: () => {
                    const tid = item.typeID ?? tidByName(item.name), st = implantSetMembers(item.name);
                    return [
                      { label: fitted ? t("Fitted") : t("Fit implant"), hint: t("Double-click"), disabled: fitted, onSelect: () => fitInto(item) },
                      st && { label: t("+ {set} set", { set: st.setName }), onSelect: () => fitSet(st) },
                      { divider: true },
                      { label: t("Show info"), onSelect: () => setDetail({ ...item, typeID: tid, tab: "info" }) },
                      { label: t("Variations"), onSelect: () => setDetail({ ...item, typeID: tid, tab: "vars" }) },
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
                    onOpen: () => empty ? setPicker({ slot: n, name: EMPTY }) : showDetail(imp, n, "info"),
                    items: () => empty
                      ? [{ label: t("Add implant…"), hint: t("Double-click"), onSelect: () => setPicker({ slot: n, name: EMPTY }) }]
                      : [
                          { label: t("Show info"), hint: t("Double-click"), onSelect: () => showDetail(imp, n, "info") },
                          { label: t("Variations"), onSelect: () => showDetail(imp, n, "vars") },
                          { label: t("Change implant…"), onSelect: () => setPicker({ slot: n, name: imp.name }) },
                          implantSetMembers(imp.name) && { label: t("+ {set} set", { set: implantSetMembers(imp.name).setName }), onSelect: () => fitSet(implantSetMembers(imp.name)) },
                          { divider: true },
                          { label: t("Remove implant"), hint: "Del", danger: true, onSelect: () => clearSlot(n) },
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
      {detail && (() => {
        const st = implantSetMembers(detail.name);
        const fitted = implants.find(i => i.slot === detail.slot)?.name === detail.name;
        const acts = [];
        if (st) acts.push({ label: t("+ {set} set", { set: st.setName }), primary: true, onClick: () => fitSet(st) });
        if (!fitted) acts.push({ label: t("Fit implant"), primary: !st, onClick: () => fitInto(detail) });
        else {
          acts.push({ label: t("Change implant"), onClick: () => setPicker({ slot: detail.slot, name: detail.name }) });
          acts.push({ label: t("Remove implant"), danger: true, onClick: () => clearSlot(detail.slot) });
        }
        return <ItemDetailSheet key={detail.tab} typeID={detail.typeID} name={detail.name} actions={acts} initialTab={detail.tab}
          onSwap={v => set(prev => prev.map(i => i.slot === detail.slot ? { ...i, name: v.name, bonus: null } : i))} onClose={() => setDetail(null)} />;
      })()}
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
