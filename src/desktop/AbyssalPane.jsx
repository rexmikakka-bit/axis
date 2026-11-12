import { useEffect, useMemo, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { eveIcon } from "../lib/icons.js";
import { REAL_MODULE_BROWSER } from "../lib/core.js";
import { libraryModule } from "../lib/abyssal-library.js";
import { readAbyssals, editAbyssal } from "../lib/abyssal-store.js";
import { abyssalsForSlot, abyssalMarketGroups, abyssalContainerGroups, abyssalSearchWords, abyssalMatchesSearch, atJita44 } from "../lib/abyssal-browser.js";
import { derivedAttributes } from "../lib/compare.js";
import { rolledAttributes } from "../lib/variation-items.js";
import { abyssalGrade } from "../lib/eft-export.js";
import { AbyssalBadge, FitCost, fitCostParts, fmtMutaVal, mutaLabel } from "../components/ui.jsx";
import { variantCostFits, fitCostRatioOf } from "../lib/core.js";
import { useInspect } from "./inspect-context.jsx";
import { ContextMenu } from "./ContextMenu.jsx";
import { typeTarget } from "./inspect.js";
import { dragProps } from "./items.js";
import { requestSettings, ABYSSALS_CHANGED } from "./Settings.jsx";
import { IS_WEB } from "./os-window.js";
import { DesktopAppNote } from "./update-check.jsx";

// Market › My Abyssals: your saved rolls (the phone module picker's My Abyssals, components/
// abyssal-library.jsx), across every rack at once. Same store, same grouping and filters
// (lib/abyssal-browser.js): by module type — the module browser's own tree, under its rack — or by
// container, with Favorites and Jita 4-4. A roll fits AS that roll (libraryModule), by double-click
// or by dragging it onto the Fitting window, and opens as itself in an item window.
//
// New rolls come in from EVE through Settings › ESI (each character's Sync abyssals — the phone
// library's own scan and import); "Sync from EVE…" here opens it, and what it saves shows up here.

const RACKS = [["high", "High"], ["mid", "Mid"], ["low", "Low"], ["rigs", "Rig"]];
const PAGE = 60;

// The roll as an item window target: its own numbers, not the base module's (inspect.js typeTarget).
const rollTarget = (r) => typeTarget(r.typeID, undefined, { name: r.label || r.name, mutaplasmid: r.mutaplasmid ?? null, mutations: r.mutations, abyssalItemId: r.itemId });
const rackOf = (r) => (r.slot === "rig" ? "rigs" : r.slot);

export default function AbyssalPane({ s, ship, search, fit, rowProps, TreeRow, headroom }) {
  const insp = useInspect();
  const [records, setRecords] = useState(null);
  const [error, setError] = useState("");
  const [groupBy, setGroupBy] = useState("market");
  const [favorites, setFavorites] = useState(false);
  const [jita, setJita] = useState(false);
  const [open, setOpen] = useState(() => new Set());
  const [selected, setSelected] = useState(null);
  const [ctx, setCtx] = useState(null);   // a category's right-click menu, {x, y, items}
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => {
    let live = true;
    const load = () => readAbyssals().then(r => { if (live) setRecords(r); }).catch(e => { if (live) setError(e.message); });
    load();
    window.addEventListener(ABYSSALS_CHANGED, load);   // a sync in Settings › ESI
    return () => { live = false; window.removeEventListener(ABYSSALS_CHANGED, load); };
  }, []);
  useEffect(() => setLimit(PAGE), [selected, search, favorites, jita, groupBy]);

  const words = abyssalSearchWords(search);
  const all = records ?? [];
  const matching = all.filter(r => (!favorites || r.favorite) && (!jita || atJita44(r)) && abyssalMatchesSearch(r, words));
  // By module type: one branch per rack, each the module browser's own tree with only what you own.
  const tree = useMemo(() => groupBy === "container" ? abyssalContainerGroups(matching)
    : RACKS.map(([rack, label]) => {
        const children = abyssalMarketGroups(abyssalsForSlot(matching, rack), REAL_MODULE_BROWSER[rack] ?? []);
        return { id: `rack:${rack}`, name: t(label), records: [], children, count: children.reduce((n, c) => n + c.count, 0) };
      }).filter(n => n.count > 0),
  [records, groupBy, favorites, jita, search]);   // eslint-disable-line react-hooks/exhaustive-deps
  const find = (nodes, id) => { for (const n of nodes) { if (n.id === id) return n; const f = find(n.children ?? [], id); if (f) return f; } return null; };
  const flat = (n) => [...(n.records ?? []), ...(n.children ?? []).flatMap(flat)];
  const shown = words.length ? matching : selected ? (() => { const n = find(tree, selected); return n ? flat(n) : []; })() : [];
  const fitted = new Set(Object.values(s.slots ?? {}).flatMap(v => (Array.isArray(v) ? v : [])).map(m => m?.abyssalItemId).filter(Boolean));

  const favorite = async (r) => { try { setRecords(await editAbyssal(r.itemId, { favorite: !r.favorite })); } catch (e) { setError(e.message); } };
  const fitRoll = (r) => fit(rackOf(r), libraryModule(r));
  const toggle = (n) => {
    if ((n.children ?? []).length) setOpen(o => { const x = new Set(o); x.has(n.id) ? x.delete(n.id) : x.add(n.id); return x; });
    setSelected(n.id);
  };
  const renderNodes = (nodes, depth) => nodes.map(n => {
    const kids = (n.children ?? []).length > 0, isOpen = open.has(n.id);
    return (
      <div key={n.id} role="group">
        <TreeRow depth={depth} open={isOpen} leaf={!kids} selected={selected === n.id} label={n.other ? t("Other modules") : n.name}
          icon={n.iconTid ? eveIcon(n.iconTid, 32) : null} sub={String(n.count)} onClick={() => toggle(n)} title={n.subtitle}
          onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, items: [
            kids ? { label: isOpen ? t("Collapse") : t("Expand"), onSelect: () => toggle(n) } : { label: t("Show items"), onSelect: () => toggle(n) },
            { label: t("Collapse all"), disabled: open.size === 0, onSelect: () => setOpen(new Set()) },
          ] }); }} />
        {kids && isOpen && renderNodes(n.children, depth + 1)}
      </div>
    );
  });

  const chip = (on, label, onClick) => (
    <button type="button" aria-pressed={on} onClick={onClick}
      style={{ height: 22, padding: "0 9px", borderRadius: 11, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
               background: on ? C.accentLight : "transparent", border: `1px solid ${on ? C.accent : C.borderStrong}`, color: on ? C.accent : C.textMid }}>{label}</button>
  );

  if (records == null && !error) return <div style={{ padding: "10px 12px", fontSize: 13, color: C.textMid }}>{t("Loading…")}</div>;
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "0 10px 6px", flex: "none" }}>
        {chip(groupBy === "market", t("Module type"), () => { setGroupBy("market"); setSelected(null); setOpen(new Set()); })}
        {chip(groupBy === "container", t("Containers"), () => { setGroupBy("container"); setSelected(null); setOpen(new Set()); })}
        <span style={{ flex: 1 }} />
        {chip(favorites, `★ ${t("Favorites")}`, () => setFavorites(v => !v))}
        {chip(jita, t("Jita 4-4"), () => setJita(v => !v))}
        {!IS_WEB && chip(false, t("Sync from EVE…"), () => requestSettings("esi"))}
      </div>
      {error && <div role="alert" style={{ padding: "4px 12px", fontSize: 12.5, color: C.danger }}>{error}</div>}
      {!all.length ? (
        <div style={{ padding: "10px 12px", fontSize: 13, color: C.textMid, lineHeight: 1.45 }}>
          {t("No saved abyssal modules yet.")} {IS_WEB ? t("Save one from its info window.") : t("Sync them from EVE in Settings › ESI, or save one from its info window.")}
          <DesktopAppNote style={{ marginTop: 6 }}>{t("Syncing your abyssal modules from EVE needs the desktop app.")}</DesktopAppNote>
        </div>
      ) : <>
        {!words.length && <div role="tree" style={{ flex: "1 1 45%", minHeight: 80, overflowY: "auto", borderBottom: `1px solid ${C.border}` }}>
          {tree.length ? renderNodes(tree, 0) : <div style={{ padding: "10px 12px", fontSize: 13, color: C.textMid }}>{t("No saved modules match these filters.")}</div>}
        </div>}
        <div style={{ flex: words.length ? "1 1 auto" : "1 1 55%", minHeight: 80, overflowY: "auto" }}>
          {!shown.length && <div style={{ padding: "10px 12px", fontSize: 13, color: C.textMid }}>{words.length ? t("Nothing found") : t("Pick a category above.")}</div>}
          {shown.slice(0, limit).map(r => {
            const onFit = fitted.has(r.itemId);
            const grade = abyssalGrade(r.mutaplasmid);
            const label = r.label || r.name;
            const derived = derivedAttributes(rolledAttributes(r));
            const rp = rowProps(`abyssal:${r.itemId}`, { target: rollTarget(r), onOpen: () => { if (ship && !onFit) fitRoll(r); }, items: [
              { label: onFit ? t("On this fit") : t("Fit"), hint: t("Double-click"), disabled: !ship || onFit, onSelect: () => fitRoll(r) },
              { divider: true },
              { label: t("Show info"), onSelect: () => insp.inspect(rollTarget(r), "info") },
              { label: t("Variations"), onSelect: () => insp.inspect(rollTarget(r), "variations") },
              { label: r.favorite ? t("Remove from favorites") : t("Add to favorites"), onSelect: () => favorite(r) },
            ] });
            return (
              <div key={r.itemId} role="option" tabIndex={0} {...rp} {...dragProps({ ...libraryModule(r), name: r.name })}
                title={onFit ? t("Already on this fit") : t("Double-click to fit · drag onto the Fitting window")}
                style={{ ...rp.style, padding: "6px 10px 7px", borderBottom: `1px solid ${C.border}99`, outline: "none", opacity: onFit ? 0.6 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <img className="eve-icon" src={eveIcon(r.typeID, 32)} width={18} height={18} alt="" style={{ flex: "none" }} onError={e => { e.target.style.visibility = "hidden"; }} />
                  <span title={label} style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                  {grade && <AbyssalBadge grade={grade} />}
                  {r.favorite && <span title={t("Favorite")} style={{ color: C.accent, fontSize: 12 }}>★</span>}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "1px 10px", marginTop: 3, paddingLeft: 26, fontSize: 12, color: C.textMid, fontVariantNumeric: "tabular-nums" }}>
                  {/* The rolled CPU and grid as the market rows show a module's: the phone's glyphs (FitCost
                      reads the roll's own cpu/power), red where the fit cannot afford it, with "won't fit". */}
                  <span className="desk-plain-figures" style={{ display: "inline-flex" }}><FitCost item={{ typeID: r.typeID, mutations: r.mutations }} headroom={headroom} size={12} /></span>
                  {headroom && variantCostFits(fitCostParts({ typeID: r.typeID }, r.mutations), { cpu: 0, pg: 0, calib: 0 }, headroom, fitCostRatioOf(headroom, r.typeID)) === false
                    && <span style={{ color: C.danger, whiteSpace: "nowrap" }}>{t("won't fit")}</span>}
                  {Object.entries(r.mutations).filter(([a]) => !["cpu", "power"].includes(a)).map(([a, v]) =>
                    <span key={a}>{mutaLabel(a)} <span style={{ color: C.text }}>{fmtMutaVal(a, v)}</span></span>)}
                  {Object.entries(derived ?? {}).map(([a, v]) => <span key={a}>{mutaLabel(a)} <span style={{ color: C.text }}>{fmtMutaVal(a, v)}</span></span>)}
                </div>
                <div style={{ paddingLeft: 26, marginTop: 2, fontSize: 11.5, color: C.textMute, overflowWrap: "anywhere" }}>
                  {onFit && <span style={{ color: C.accent }}>{t("On this fit")} · </span>}
                  {!r.available && <span style={{ color: C.danger }}>{t("Not found in last asset scan")} · </span>}
                  {r.characterName} · {r.location}
                </div>
              </div>
            );
          })}
          {shown.length > limit && <button type="button" onClick={() => setLimit(n => n + PAGE)}
            style={{ display: "block", margin: "10px auto", height: 26, padding: "0 12px", borderRadius: 6, fontSize: 12.5, cursor: "pointer", background: C.surfaceAlt, border: `1px solid ${C.borderStrong}`, color: C.text }}>
            {t("Show more")}</button>}
        </div>
      </>}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </>
  );
}
