import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { TYPES, tidByName, usesTurretHardpoint, usesLauncherHardpoint } from "../calc.js";
import { checkFitRestriction } from "../components/tabs.jsx";
import { eveIcon } from "../lib/icons.js";
import { REAL_MODULE_BROWSER, REAL_STRUCTURE_MODULE_BROWSER, OFF_MARKET_MODULES, MT_ROOTS, MT_CHILDREN, MT_ITEMS, MT_ALL_ITEMS,
         generateEmptySlots, lookupShip } from "../lib/core.js";
import marketTreeData from "../data/market-tree.json";
import { jargonSearch } from "../lib/jargon.js";
import { metaOf, META_COLORS, compareForBrowser } from "../lib/meta.js";
import { buildShipTaxonomy, shipsUnder } from "../lib/ship-taxonomy.js";
import { nextFitId } from "../lib/fit-tabs.js";
import { getCachedPrices } from "../prices.js";
import { FitCost, fitCostParts } from "../components/ui.jsx";
import { variantCostFits, fitCostRatioOf } from "../lib/core.js";
import { fetchPrices } from "../prices.js";
import { useHeadroom } from "./Inspector.jsx";
import Menu from "./Menu.jsx";
import { ContextMenu, useRowSelect } from "./ContextMenu.jsx";
import { useInspect } from "./inspect-context.jsx";
import { typeTarget } from "./inspect.js";
import { useItems } from "./items-context.jsx";
import { itemKind, defaultAction, dragProps, fitDragProps } from "./items.js";
import AbyssalPane from "./AbyssalPane.jsx";

// The desktop Browser (docs/desktop-handoff.md, "Browser"): one window, Market and Ships, as in
// pyfa. Both are trees that EXPAND IN PLACE — a caret per category, children indented beneath it —
// rather than the phone's drill-down pages. Market lists the selected category's modules in their own
// section below the tree.
//
// Reads the same data the phone's pickers do: REAL_MODULE_BROWSER for modules (with the phone's
// rig-size pruning), buildShipTaxonomy for hulls, the session's fit library for fits. Fitting a
// module goes through the Fitting window's own addMod (FitTab adderRef), so every fitting rule holds.
//
// With no rack chosen (click the lit one again), Market is CCP's whole market tree — the cargo
// picker's — so drones, implants, boosters, charges and plain cargo are all here. Double-click does
// what that item is for (items.js defaultAction: fit, load, launch, plug in, or put in the hold),
// right-click offers every other place it can go, and any row can be dragged onto a window.

const RACKS = [["high", "High"], ["mid", "Mid"], ["low", "Low"], ["rigs", "Rig"]];
const STRUCTURE_RACKS = [["high", "High"], ["mid", "Mid"], ["low", "Low"], ["rigs", "Rig"], ["services", "Service"]];
const INDENT = 14;

const Caret = ({ open }) => (
  <span aria-hidden="true" style={{ width: 10, flex: "none", fontSize: 9, color: C.textMid, transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" }}>▶</span>
);

// `iconSize`: market categories keep 16 px; hulls and fits draw their ship at 24, big enough to tell a
// Rifter from a Breacher at a glance, with the row grown to suit.
// `drag`: props that make the row draggable (a saved fit onto Projected or Command).
function TreeRow({ depth, open, leaf, selected, icon, iconSize = 16, label, sub, onClick, onContextMenu, title, drag }) {
  return (
    <div role="treeitem" aria-expanded={leaf ? undefined : open} aria-selected={selected} onClick={onClick} onContextMenu={onContextMenu} title={title} {...drag}
      style={{ display: "flex", alignItems: "center", gap: iconSize > 16 ? 8 : 6, minHeight: iconSize > 16 ? iconSize + 8 : 26, padding: `2px 10px 2px ${10 + depth * INDENT}px`, cursor: "pointer",
               background: selected ? C.surfaceAlt : "transparent", boxShadow: selected ? `inset 2px 0 0 ${C.accent}` : "none", fontSize: 13.5 }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = `${C.surfaceAlt}99`; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}>
      {leaf ? <span style={{ width: 10, flex: "none" }} /> : <Caret open={open} />}
      {icon && <img className="eve-icon" src={icon} width={iconSize} height={iconSize} alt="" style={{ flex: "none", borderRadius: iconSize > 16 ? 4 : 0 }} onError={e => { e.target.style.visibility = "hidden"; }} />}
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.text }}>{label}</span>
      {sub && <span style={{ fontSize: 12, color: C.textMid, flex: "none" }}>{sub}</span>}
    </div>
  );
}

// With an ✕ to clear it once there is something in it; Escape in the box clears it too.
const SearchBox = ({ value, onChange, placeholder }) => (
  <div style={{ position: "relative", margin: "8px 10px 6px", flex: "none" }}>
    <input data-desk-search value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
      onKeyDown={e => { if (e.key === "Escape" && value) { e.stopPropagation(); onChange(""); } }}
      style={{ height: 28, boxSizing: "border-box", width: "100%", padding: value ? "0 30px 0 10px" : "0 10px", borderRadius: 6, fontSize: 13.5,
               background: C.bg, border: `1px solid ${C.borderStrong}`, color: C.text, outline: "none" }} />
    {value && <button type="button" onClick={() => onChange("")} aria-label={t("Clear search")} title={t("Clear search")}
      style={{ position: "absolute", right: 4, top: 4, width: 20, height: 20, padding: 0, border: "none", borderRadius: 10, cursor: "pointer",
               background: C.surfaceAlt, color: C.textMid, fontSize: 13, lineHeight: "20px" }}>✕</button>}
  </div>
);

// ── Market ─────────────────────────────────────────────────────────────────────────────────────
function useMarketTree(rack, isStructure, hullRigSize) {
  return useMemo(() => {
    const base = (isStructure ? REAL_STRUCTURE_MODULE_BROWSER : REAL_MODULE_BROWSER)[rack] ?? [];
    if (rack !== "rigs" || hullRigSize == null) return base;
    // The phone picker's rig pruning: only this hull's rig size, and a category left with a single
    // "<Size> <name>" child has that child hoisted (ui.jsx ModuleBrowserSheet).
    const keep = m => { const rs = TYPES[String(m.typeID)]?.a?.rigSize; return rs == null || rs === hullRigSize; };
    const prune = ns => ns.map(n => ({ ...n, mods: (n.mods ?? []).filter(keep), children: prune(n.children ?? []) })).filter(n => n.mods.length || n.children.length);
    const SIZE = /^(Small|Medium|Large|X-Large)\s+/;
    const collapse = n => {
      const children = (n.children ?? []).map(collapse);
      if ((n.mods?.length ?? 0) === 0 && children.length === 1) {
        const c = children[0];
        if (SIZE.test(c.name) && c.name.replace(SIZE, "") === n.name) return { ...n, mods: c.mods, children: c.children, iconTid: n.iconTid ?? c.iconTid };
      }
      return { ...n, children };
    };
    return prune(base).map(collapse);
  }, [rack, isStructure, hullRigSize]);
}

// CCP's market groups (market-tree.json, the cargo picker's tree) in the module tree's node shape.
let everything = null;
function marketEverything() {
  if (everything) return everything;
  const node = (gid) => ({ id: `mt:${gid}`, name: marketTreeData.g[gid]?.n ?? String(gid), iconTid: marketTreeData.g[gid]?.i ?? null,
                           mods: MT_ITEMS[gid] ?? [], children: (MT_CHILDREN[gid] ?? []).map(node) });
  return (everything = MT_ROOTS.map(node));
}
// Every item the All search reaches: the market tree, plus the fittable modules CCP does not sell.
let searchable = null;
const allItems = () => searchable ??= [...MT_ALL_ITEMS, ...Object.values(OFF_MARKET_MODULES).flat().filter(m => m.typeID != null && !marketTreeData.t[String(m.typeID)])];
const RACK_KEY = "axis_desk_browser_rack";
const LEGAL_KEY = "axis_desk_browser_legal";
// "Legal": could this module EVER go on this hull, whatever else is fitted? The phone's own fitting
// rules (checkFitRestriction: rig size, CCP's canFitShipGroup/Type whitelists, structure vs ship
// modules, the T3C covert subsystem), plus the two the hull's layout decides on its own: a turret or
// launcher needs a hardpoint of its kind, and a module needs a slot of its rack. Never fitting
// COST: a module that only needs more CPU or grid than is left stays (that is what "won't fit" says).
// Only modules are judged; charges, drones and everything else always pass.
const RACK_SLOTS = { high: "hiSlots", mid: "medSlots", low: "lowSlots", rigs: "rigSlots", services: "serviceSlots" };
function legalOn(ship, subsystems) {
  return (m) => {
    if (!m?.typeID || !ship) return true;
    const k = itemKind(m);
    if (k.kind !== "module") return true;
    if (checkFitRestriction(m.typeID, ship, subsystems)) return false;
    const e = TYPES[m.typeID]?.e ?? TYPES[String(m.typeID)]?.e;
    if (usesTurretHardpoint(e) && !(ship.turrets > 0)) return false;
    if (usesLauncherHardpoint(e) && !(ship.launchers > 0)) return false;
    const slotKey = RACK_SLOTS[k.rack];
    if (slotKey && ship[slotKey] != null && !(ship[slotKey] > 0) && k.rack !== "subsystems") return false;
    return true;
  };
}
/** `nodes` with every module that fails `ok` removed, and every category left empty pruned. */
function pruneTree(nodes, ok) {
  const out = [];
  for (const n of nodes) {
    const mods = (n.mods ?? []).filter(ok), children = pruneTree(n.children ?? [], ok);
    if (mods.length || children.length) out.push({ ...n, mods, children });
  }
  return out;
}
const RECENT_KEY = "axis_desk_recent_shown";
const KIND_LABEL = { module: "Module", charge: "Charge", drone: "Drone", fighter: "Fighter", implant: "Implant", booster: "Booster", ship: "Ship" };

const allMods = (nodes) => nodes.flatMap(n => [...(n.mods ?? []), ...allMods(n.children ?? [])]);
const isk = (n) => n == null ? "" : n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n));

// Click selects, double click (or Enter) does the item's own action, right click lists every place
// it can go; drag it onto a window to put it there. `actions` is [{label, onSelect}], primary first.
// A module's fitting cost is the phone's (ui.jsx FitCost: the PG and CPU glyphs, a red figure the fit
// cannot afford) with "won't fit" spelled out beside it; the price sits bottom right.
function ItemRow({ mod, price, actions, onInfo, rowProps, rack, kind, headroom }) {
  const a = TYPES[String(mod.typeID)]?.a ?? {};
  const meta = metaOf(mod.typeID, mod.meta);
  const primary = actions[0];
  const rp = rowProps(mod.typeID ?? mod.name, { target: mod.typeID ? typeTarget(mod.typeID, kind === "module" ? rack : undefined) : undefined, onOpen: () => primary?.onSelect(), items: [
    ...actions.map((x, i) => ({ ...x, hint: i === 0 ? t("Double-click") : undefined })),
    actions.length > 0 && { divider: true },
    { label: t("Show info"), onSelect: () => onInfo({ typeID: mod.typeID, tab: "info" }) },
    kind !== "ship" && { label: t("Variations"), onSelect: () => onInfo({ typeID: mod.typeID, tab: "variations" }) },
  ].filter(Boolean) });
  return (
    <div role="option" tabIndex={0} {...rp} {...dragProps(mod)} onKeyDown={e => { if (e.key === "Enter") primary?.onSelect(); }}
      title={primary ? t("Double-click: {action} · drag onto a window", { action: primary.label }) : undefined}
      style={{ ...rp.style, display: "grid", gridTemplateColumns: "16px minmax(0,1fr) auto", columnGap: 8, rowGap: 1, padding: "5px 10px", outline: "none",
               borderBottom: `1px solid ${C.border}99` }}>
      <img className="eve-icon" src={eveIcon(mod.typeID, 32)} width={16} height={16} alt="" style={{ gridRow: "1 / 3", alignSelf: "center" }} onError={e => { e.target.style.visibility = "hidden"; }} />
      <span style={{ fontSize: 13.5, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", gridColumn: "2 / 4" }}>{mod.name}</span>
      <span style={{ fontSize: 12, color: C.textMid, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0 8px", minWidth: 0, fontVariantNumeric: "tabular-nums" }}>
        {kind && kind !== "module" && kind !== "cargo" && <span>{t(KIND_LABEL[kind])}</span>}
        {(kind === "module" || kind === "charge" || kind === "drone" || kind === "fighter") && <span style={{ color: META_COLORS[meta] ?? C.textMid }}>{meta}</span>}
        {kind === "cargo" && mod.vol != null && <span>{+(+mod.vol).toFixed(2)} m³</span>}
        {/* The phone's glyph line, its figures at regular weight as this row had them before the
            glyphs (Owen: more readable on desktop); a figure the fit cannot afford is still red. */}
        {kind === "module" && <span className="desk-plain-figures" style={{ display: "inline-flex" }}><FitCost item={mod} headroom={headroom} size={12} /></span>}
        {kind === "module" && headroom && variantCostFits(fitCostParts(mod, mod.mutations), { cpu: 0, pg: 0, calib: 0 }, headroom, fitCostRatioOf(headroom, mod.typeID)) === false
          && <span style={{ color: C.danger, whiteSpace: "nowrap" }}>{t("won't fit")}</span>}
      </span>
      <span style={{ fontSize: 12, color: C.textMid, textAlign: "right", alignSelf: "end", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{isk(price)}</span>
    </div>
  );
}

function MarketPane({ s, ship, cs, adderRef, remoteAdd }) {
  const headroom = useHeadroom(s, ship, cs);
  const isStructure = (TYPES[ship?.typeID]?.c ?? TYPES[ship?.typeID]?.category) === 65;
  // null = no rack: everything. Remembered, like the window's other choices.
  const [rack, setRackState] = useState(() => { try { const v = localStorage.getItem(RACK_KEY); return v === "all" ? null : v || null; } catch { return null; } });
  const setRack = (r) => { setRackState(r); try { localStorage.setItem(RACK_KEY, r ?? "all"); } catch { /* private mode */ } };
  const itemOps = useItems();
  const [open, setOpen] = useState(() => new Set());
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const insp = useInspect();
  // A market row opens as a type with its rack, so its Variations window can fit a variant.
  const setInfo = ({ typeID, tab }) => insp.inspect(typeTarget(typeID, rack && itemKind({ typeID }).kind === "module" ? rack : undefined), tab);
  const rs = useRowSelect();
  // "abyssal": the My Abyssals chip, your saved rolls (AbyssalPane) in place of a rack's tree.
  const abyssal = rack === "abyssal" && !isStructure;
  const rackTree = useMarketTree(rack && rack !== "abyssal" ? rack : "high", isStructure, TYPES[ship?.typeID]?.a?.rigSize ?? null);
  // Legal only (on by default; remembered): modules this hull can never fit are left out of the
  // tree, its counts and the search alike.
  const [legal, setLegalState] = useState(() => { try { return localStorage.getItem(LEGAL_KEY) !== "0"; } catch { return true; } });
  const setLegal = (v) => { setLegalState(v); try { localStorage.setItem(LEGAL_KEY, v ? "1" : "0"); } catch { /* private mode */ } };
  const okFor = useMemo(() => legal && ship ? legalOn(ship, s.slots?.subsystems) : null, [legal, ship, s.slots?.subsystems]);
  const fullTree = rack ? rackTree : marketEverything();
  const tree = useMemo(() => okFor ? pruneTree(fullTree, okFor) : fullTree, [fullTree, okFor]);
  // Prices for what is on screen, fetched as the list changes (the shared cache answers what it has at
  // once); nothing is fetched for the whole tree.
  const prices = getCachedPrices(s.priceHub, s.priceSource);
  const [fetched, setFetched] = useState(() => new Map());
  const priceOf = (id) => fetched.get(Number(id)) ?? fetched.get(String(id)) ?? prices.get(String(id)) ?? prices.get(Number(id)) ?? null;

  const find = (nodes, id) => { for (const n of nodes) { if (n.id === id) return n; const f = find(n.children ?? [], id); if (f) return f; } return null; };
  const q = search.trim().toLowerCase();
  // Ordered as on the phone (lib/meta.js compareForBrowser): T2 first, then T1, faction, deadspace,
  // officer, each by meta level. A rack's tree is already built in that order (with its ancillary-first
  // rule); the full market tree is stored A–Z, so its lists are sorted here. A search is the phone's
  // own (jargon.js jargonSearch): blocked by module group, the best match first, meta order inside.
  // Memoised on what the list depends on, which is not the fit: re-running the search on every edit
  // (adding a booster, say) cost ~70 ms a time.
  const items = useMemo(() => q
    ? (jargonSearch(q, rack ? allMods(tree) : okFor ? allItems().filter(okFor) : allItems()) ?? []).slice(0, 200)
    : (selected ? (rack ? find(tree, selected)?.mods ?? [] : [...(find(tree, selected)?.mods ?? [])].sort(compareForBrowser)) : []),
    [q, rack, tree, selected, okFor]);   // eslint-disable-line react-hooks/exhaustive-deps
  // The rows' "won't fit" marks trail the fit by a render: their cost-ratio probe is a whole-fit pass,
  // and deferring it lets the edit itself paint first.
  const rowHeadroom = useDeferredValue(headroom);

  const listedIds = items.map(m => m.typeID).filter(Boolean);
  const listedKey = listedIds.join(",");
  useEffect(() => {
    if (!listedIds.length) return;
    let live = true;
    fetchPrices(listedIds, s.priceHub, s.priceSource).then(m => { if (live && m) setFetched(prev => { const next = new Map(prev); for (const [k, v] of m) next.set(Number(k), v); return next; }); }).catch(() => {});
    return () => { live = false; };
  }, [listedKey, s.priceHub, s.priceSource]);   // eslint-disable-line react-hooks/exhaustive-deps
  const fit = (mod) => {
    if (!ship) return;
    if (adderRef?.current) return adderRef.current(rack, mod);
    remoteAdd?.(rack, mod);
  };
  // A rack's own list fits into that rack, as before; otherwise the item goes where it belongs, and
  // the menu offers every other destination that would take it.
  const DEST_LABEL = { fitting: null, drones: t("Add to drone bay"), fighters: t("Add to fighter bay"), implants: t("Plug in"), boosters: t("Add booster"), cargo: t("Add to cargo") };
  const actionsFor = (m) => {
    const it = { typeID: m.typeID, name: m.name, vol: m.vol };
    if (rack) return [{ label: t("Fit"), onSelect: () => fit(m) }, { label: t("Add to cargo"), onSelect: () => itemOps.add(it, "cargo") }];
    const d = defaultAction(it, { slots: s.slots, hasFighters: itemOps.hasFighters });
    const out = d.to ? [{ label: d.label, onSelect: () => itemOps.add(it, d.to) }] : [];
    for (const to of Object.keys(DEST_LABEL)) if (to !== d.to && to !== "fitting" && itemOps.accepts(to, it)) out.push({ label: DEST_LABEL[to], onSelect: () => itemOps.add(it, to) });
    return out;
  };
  const toggle = (n) => {
    const hasKids = (n.children ?? []).length > 0;
    if (hasKids) setOpen(o => { const x = new Set(o); x.has(n.id) ? x.delete(n.id) : x.add(n.id); return x; });
    if ((n.mods ?? []).length) setSelected(n.id);
  };
  const renderNodes = (nodes, depth) => nodes.map(n => {
    const hasKids = (n.children ?? []).length > 0;
    const isOpen = open.has(n.id);
    return (
      <div key={n.id} role="group">
        <TreeRow depth={depth} open={isOpen} leaf={!hasKids} selected={selected === n.id} label={n.name}
          icon={n.iconTid ? eveIcon(n.iconTid, 32) : null} sub={!hasKids && n.mods?.length ? String(n.mods.length) : null} onClick={() => toggle(n)} />
        {hasKids && isOpen && renderNodes(n.children, depth + 1)}
      </div>
    );
  });

  if (!ship) return <div style={{ padding: 14, fontSize: 13, color: C.textMid }}>{t("Open a fit from the Browser to see it here.")}</div>;
  return (
    <>
      <div style={{ display: "flex", gap: 6, padding: "8px 10px 0", flex: "none", flexWrap: "wrap" }}>
        {(isStructure ? STRUCTURE_RACKS : RACKS).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={rack === k} title={rack === k ? t("Show everything") : undefined}
            onClick={() => { setRack(rack === k ? null : k); setSelected(null); setOpen(new Set()); }}
            style={{ height: 22, padding: "0 10px", borderRadius: 11, fontSize: 12.5, cursor: "pointer",
                     background: rack === k ? C.accentLight : "transparent", border: `1px solid ${rack === k ? C.accent : C.borderStrong}`,
                     color: rack === k ? C.accent : C.textMid }}>{t(label)}</button>
        ))}
        {!isStructure && <button type="button" aria-pressed={abyssal} title={abyssal ? t("Show everything") : t("Your saved abyssal modules")}
          onClick={() => { setRack(abyssal ? null : "abyssal"); setSelected(null); setOpen(new Set()); }}
          style={{ height: 22, padding: "0 10px", borderRadius: 11, fontSize: 12.5, cursor: "pointer",
                   background: abyssal ? `${C.danger}22` : "transparent", border: `1px solid ${abyssal ? C.danger : C.borderStrong}`,
                   color: abyssal ? C.danger : C.textMid }}>{t("My Abyssals")}</button>}
        {!abyssal && <button type="button" aria-pressed={legal} onClick={() => setLegal(!legal)}
          title={legal ? t("Showing only modules this hull can fit. Click to show everything") : t("Show only modules this hull can fit (wrong-size rigs, hull-restricted modules and weapons without a hardpoint are hidden)")}
          style={{ height: 22, padding: "0 10px", borderRadius: 11, fontSize: 12.5, cursor: "pointer", marginLeft: "auto",
                   background: legal ? C.accentLight : "transparent", border: `1px solid ${legal ? C.accent : C.borderStrong}`,
                   color: legal ? C.accent : C.textMid }}>{t("Legal")}</button>}
      </div>
      <SearchBox value={search} onChange={setSearch} placeholder={abyssal ? t("Search your rolls") : rack ? t("Search modules") : t("Search everything")} />
      {abyssal && <AbyssalPane s={s} ship={ship} search={search} rowProps={rs.rowProps} TreeRow={TreeRow}
        fit={(rk, mod) => { if (!ship) return; if (adderRef?.current) adderRef.current(rk, mod); else remoteAdd?.(rk, mod); }} />}
      {!abyssal && <>
      {!q && <div role="tree" style={{ flex: "1 1 50%", minHeight: 80, overflowY: "auto", borderBottom: `1px solid ${C.border}` }}>{renderNodes(tree, 0)}</div>}
      <div style={{ flex: q ? "1 1 auto" : "1 1 50%", minHeight: 80, overflowY: "auto" }}>
        {items.length
          ? items.map(m => <ItemRow key={m.typeID ?? m.name} mod={m} price={priceOf(m.typeID)} actions={actionsFor(m)} onInfo={setInfo} rowProps={rs.rowProps} rack={rack}
              kind={rack ? "module" : itemKind(m).kind} headroom={rowHeadroom} />)
          : <div style={{ padding: "10px 12px", fontSize: 13, color: C.textMid }}>{q ? (rack ? t("No modules found") : t("Nothing found")) : t("Pick a category above.")}</div>}
      </div>
      </>}
      {rs.view}
    </>
  );
}

// ── Ships ──────────────────────────────────────────────────────────────────────────────────────
function ShipsPane({ s }) {
  const tree = useMemo(() => buildShipTaxonomy(), []);
  const [open, setOpen] = useState(() => new Set());
  const [search, setSearch] = useState("");
  const [renaming, setRenaming] = useState(null);   // {ship, id, name}
  const [ctx, setCtx] = useState(null);   // {x, y, items}
  const openCtx = (e, items) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, items }); };
  const fitsDB = s.fitsDB ?? {};
  const toggle = (key) => setOpen(o => { const x = new Set(o); x.has(key) ? x.delete(key) : x.add(key); return x; });

  const createFit = (ship) => {
    const taken = new Set((fitsDB[ship] || []).map(f => f.name));
    const base = t("New Fit"); let name = base, n = 2;
    while (taken.has(name)) name = `${base} ${n++}`;
    const now = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const nf = { id: nextFitId(fitsDB), name, modified: now, tags: [], slots: generateEmptySlots(lookupShip(ship)) };
    s.setFitsDB(prev => ({ ...prev, [ship]: [...(prev[ship] || []), nf] }));
    s.loadFit(ship, name, nf);
  };
  const duplicate = (ship, fit) => {
    const taken = new Set((fitsDB[ship] || []).map(f => f.name));
    const base = `${fit.name} ${t("copy")}`; let name = base, n = 2;
    while (taken.has(name)) name = `${base} ${n++}`;
    const copy = { ...structuredClone(fit), id: nextFitId(fitsDB), name };
    s.setFitsDB(prev => ({ ...prev, [ship]: [...(prev[ship] || []), copy] }));
  };
  const rename = (ship, id, name) => {
    name = name.trim(); setRenaming(null);
    if (!name) return;
    const old = fitsDB[ship]?.find(f => f.id === id);
    if (!old || old.name === name || (fitsDB[ship] || []).some(f => f.name === name)) return;
    s.setFitsDB(prev => ({ ...prev, [ship]: prev[ship].map(f => f.id === id ? { ...f, name } : f) }));
    if (s.activeFit?.ship === ship && s.activeFit?.fitName === old.name) s.setActiveFit({ ship, fitName: name });
  };
  const remove = (ship, fit) => { if (window.confirm(t('Delete "{name}"?', { name: fit.name }))) s.deleteFit(ship, fit); };

  // `withShip`: say which hull, for a row outside its hull's branch (Recent fits).
  const fitRow = (ship, fit, depth, withShip = false) => {
    const on = s.activeFit?.ship === ship && s.activeFit?.fitName === fit.name;
    if (renaming?.ship === ship && renaming?.id === fit.id) return (
      <div key={fit.id} style={{ padding: `2px 10px 2px ${10 + depth * INDENT + 16}px` }}>
        <input autoFocus defaultValue={fit.name} aria-label={t("Fit name")}
          onKeyDown={e => { if (e.key === "Enter") rename(ship, fit.id, e.target.value); if (e.key === "Escape") setRenaming(null); }}
          onBlur={e => rename(ship, fit.id, e.target.value)}
          style={{ width: "100%", height: 24, boxSizing: "border-box", padding: "0 8px", borderRadius: 5, fontSize: 13.5, background: C.bg, border: `1px solid ${C.accent}`, color: C.text, outline: "none" }} />
      </div>
    );
    const actions = [
      { label: t("Open"), onSelect: () => s.loadFit(ship, fit.name) },
      { label: t("Open in New Tab"), onSelect: () => s.openFitInNewTab(ship, fit.name) },
      { label: t("Rename"), onSelect: () => setRenaming({ ship, id: fit.id }) },
      { label: t("Duplicate"), onSelect: () => duplicate(ship, fit) },
      { divider: true },
      { label: t("Delete"), danger: true, onSelect: () => remove(ship, fit) },
    ];
    // A fit is the one tree item where a single click acts: opening it IS selecting it, as in
    // pyfa's ship browser. Right click carries the rest.
    return (
      <div key={fit.id} style={{ display: "flex", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TreeRow depth={depth} leaf selected={on} label={withShip ? <><span style={{ color: C.textMid }}>{ship}</span> {fit.name}</> : fit.name} icon={eveIcon(tidByName(ship), 32)} iconSize={24} onClick={() => s.loadFit(ship, fit.name)}
            onContextMenu={e => openCtx(e, actions)} title={t("Click to open · right-click for more · drag onto Projected or Command")} drag={fitDragProps(ship, fit.name)} />
        </div>
        <Menu label="⋯" ariaLabel={t("Fit actions")} buttonStyle={{ height: 22, padding: "0 6px", color: C.textMid }} items={actions} />
      </div>
    );
  };
  const hullRow = (sh, depth) => {
    const key = `ship:${sh.name}`, fits = fitsDB[sh.name] ?? [], isOpen = open.has(key);
    return (
      <div key={key} role="group">
        <TreeRow depth={depth} open={isOpen} label={sh.name} icon={eveIcon(sh.typeID, 32)} iconSize={24} sub={fits.length ? String(fits.length) : null} onClick={() => toggle(key)}
          onContextMenu={e => openCtx(e, [{ label: t("New Fit"), onSelect: () => createFit(sh.name) }, { label: isOpen ? t("Collapse") : t("Expand"), onSelect: () => toggle(key) }])} />
        {isOpen && <>
          {fits.map(f => fitRow(sh.name, f, depth + 1))}
          <TreeRow depth={depth + 1} leaf label={<span style={{ color: C.accent }}>+ {t("New Fit")}</span>} onClick={() => createFit(sh.name)} />
        </>}
      </div>
    );
  };
  const nodeRow = (n, depth) => {
    const key = `node:${n.key}`, isOpen = open.has(key);
    const count = shipsUnder(n).reduce((a, sh) => a + (fitsDB[sh.name]?.length ?? 0), 0);
    return (
      <div key={key} role="group">
        <TreeRow depth={depth} open={isOpen} label={<span style={{ fontWeight: depth === 0 ? 500 : 400 }}>{n.label}</span>} sub={count ? String(count) : null} onClick={() => toggle(key)} />
        {isOpen && <>{(n.children ?? []).map(c => nodeRow(c, depth + 1))}{(n.ships ?? []).map(sh => hullRow(sh, depth + 1))}</>}
      </div>
    );
  };

  const q = search.trim().toLowerCase();
  const hits = q ? Object.entries(fitsDB).flatMap(([ship, fits]) => [
    ...(ship.toLowerCase().includes(q) ? [{ ship, fit: null }] : []),
    ...fits.filter(f => f.name.toLowerCase().includes(q)).map(fit => ({ ship, fit })),
  ]) : [];
  const shipHits = q ? tree.flatMap(n => shipsUnder(n)).filter(sh => sh.name.toLowerCase().includes(q)).slice(0, 60) : [];
  // The fits you opened last (the session's recentFits, newest first), above the tree; a toggle hides
  // them and is remembered. Each is a normal fit row, labelled with its hull since it sits outside it.
  const [showRecent, setShowRecent] = useState(() => { try { return localStorage.getItem(RECENT_KEY) !== "0"; } catch { return true; } });
  const flipRecent = () => setShowRecent(v => { try { localStorage.setItem(RECENT_KEY, v ? "0" : "1"); } catch { /* private mode */ } return !v; });
  const recent = (s.recentFits ?? []).map(r => ({ ship: r.ship, fit: (fitsDB[r.ship] ?? []).find(f => (r.id != null && f.id === r.id) || f.name === r.name) }))
    .filter(r => r.fit);
  return (
    <>
      <SearchBox value={search} onChange={setSearch} placeholder={t("Search ships and fits")} />
      <div role="tree" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {!q && recent.length > 0 && (
          <div role="group" aria-label={t("Recent fits")} style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: showRecent ? 4 : 0 }}>
            <TreeRow depth={0} open={showRecent} label={<span style={{ fontWeight: 500 }}>{t("Recent fits")}</span>} sub={String(recent.length)} onClick={flipRecent}
              title={showRecent ? t("Hide recent fits") : t("Show recent fits")} />
            {showRecent && recent.map(r => fitRow(r.ship, r.fit, 1, true))}
          </div>
        )}
        {q
          ? <>{shipHits.map(sh => hullRow(sh, 0))}{hits.filter(h => h.fit).map(h => fitRow(h.ship, h.fit, 0))}
              {!shipHits.length && !hits.length && <div style={{ padding: "10px 12px", fontSize: 13, color: C.textMid }}>{t("No ships or fits found")}</div>}</>
          : tree.map(n => nodeRow(n, 0))}
      </div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </>
  );
}

// `modeRequest` ({mode, n, focus}): switch to that mode now — the header's "+" asks for Ships,
// Ctrl+Space for "toggle" (pyfa's ship/market switch) — and with `focus`, put the cursor in the
// search box (Ctrl+F).
export default function DeskBrowser({ s, ship, cs, adderRef, remoteAdd, modeRequest }) {
  const [mode, setMode] = useState("ships");
  const rootRef = useRef(null);
  useEffect(() => {
    if (modeRequest?.mode === "toggle") setMode(m => (m === "ships" ? "market" : "ships"));
    else if (modeRequest?.mode) setMode(modeRequest.mode);
    if (modeRequest?.focus) requestAnimationFrame(() => { const el = rootRef.current?.querySelector("[data-desk-search]"); el?.focus(); el?.select?.(); });
  }, [modeRequest?.n]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={rootRef} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div role="tablist" style={{ display: "flex", margin: "8px 10px 0", border: `1px solid ${C.borderStrong}`, borderRadius: 6, overflow: "hidden", flex: "none" }}>
        {[["market", t("Market")], ["ships", t("Ships")]].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
            style={{ flex: 1, height: 28, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 500,
                     background: mode === id ? C.accentLight : "transparent", color: mode === id ? C.accent : C.textMid }}>{label}</button>
        ))}
      </div>
      {mode === "market" ? <MarketPane s={s} ship={ship} cs={cs} adderRef={adderRef} remoteAdd={remoteAdd} /> : <ShipsPane s={s} />}
    </div>
  );
}
