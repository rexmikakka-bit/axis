import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { TYPES } from "../calc.js";
import { eveIcon } from "../lib/icons.js";
import { metaOf, META_COLORS } from "../lib/meta.js";
import { variantsOf, variantCostFits, fitCostRatioOf } from "../lib/core.js";
import { fmtResource } from "../lib/fmt.js";
import { fetchPrices } from "../prices.js";
import { sortCompareRows, bestFirstDirection, directionOf } from "../lib/compare.js";
import { abyssalGrade } from "../lib/eft-export.js";
import { variationItems, filterVariationItems, withinPriceCeiling, MARKET_SOURCE } from "../lib/variation-items.js";
import { readAbyssals, readListings, editAbyssal, rememberListings } from "../lib/abyssal-store.js";
import { abyssalTypeIds, listingCost, savedMarketListings, mutaMarketUrl } from "../lib/mutamarket.js";
import { fetchListings } from "../lib/mutamarket-client.js";
import { stationIndexFor, withStations } from "../lib/mutamarket-contracts.js";
import { readMarketSettings, writeMarketSettings, marketStationId } from "../lib/market-settings.js";
import { useOnline } from "../lib/use-online.js";
import { AbyssalSources } from "../components/abyssal-sources.jsx";
import { AbyssalBadge, fitCostParts, fmtMutaVal, fmtMutaDisplay, mutaToDisplay, mutaLabel } from "../components/ui.jsx";
import { ContextMenu, DialogFrame } from "./ContextMenu.jsx";
import Menu from "./Menu.jsx";
import { TYPE } from "./kit.jsx";

// The desktop Variations window: every variant of an item — the meta family, your own abyssal rolls,
// MutaMarket's contracts — as ONE sortable, filterable table with a column per attribute. Laid out
// after mutamarket.com's search: a value per cell with its difference from the reference beneath it,
// optional bars showing where each value sits in the range on screen, and a min/max filter under
// every column header.
//
// The rows, their values and every filter rule are the phone's (lib/variation-items.js,
// lib/compare.js, the same contract fetch and the same market settings), so the two apps cannot
// disagree about what a variant is or whether it fits. What is new is the table, and a REFERENCE
// that can be any row, not only the fitted one: right-click "Compare against this".
//
// `baseline` is the fitted item ({name, typeID, mutations?, mutaplasmid?, abyssalItemId?}) or, for an
// item that is not fitted (a market row), the item itself — labelled REFERENCE, not FITTED.
//
// Too narrow for the table (an item window at its default width), the same rows become CARDS: name
// and price on top, the chosen attributes in a grid beneath that reflows with the width, so nothing
// hides behind a horizontal scroll. Sorting moves to a menu and the min/max boxes to a Filters panel.

const SORT_KEY = "axis_desk_varsort", COLS_KEY = "axis_desk_varcols", BARS_KEY = "axis_desk_varbars";
const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k) ?? "null") ?? d; } catch { return d; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const hubSource = () => { try { return [localStorage.getItem("axis_pricehub") || "Jita", localStorage.getItem("axis_pricesource") || "fuzzwork"]; } catch { return ["Jita", "fuzzwork"]; } };
const LABELS = { cpu: "CPU", power: "Powergrid", upgradeCost: "Calibration" };
const colLabel = (k) => t(LABELS[k] ?? mutaLabel(k));
const num = (v) => typeof v === "number" && Number.isFinite(v);
const parseNum = (s) => { const n = parseFloat(String(s).replace(/[^0-9.+-eE]/g, "")); return Number.isFinite(n) ? n : null; };

// Module scope, so a re-render (prices or contracts arriving) never remounts a box being typed in.
// Uncontrolled and applied on blur / Enter; keyed on the applied value so Clear filters empties it.
function FilterBox({ k, value, onSet, onAtLeastRef }) {
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center", justifyContent: "flex-end" }}>
      {["min", "max"].map(side => (
        <input key={`${side}:${value?.[side] ?? ""}`} defaultValue={value?.[side] ?? ""} placeholder={side === "min" ? t("min") : t("max")}
          aria-label={`${colLabel(k)} ${side === "min" ? t("min") : t("max")}`}
          onBlur={e => onSet(k, side, e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
          style={{ width: 50, height: 20, boxSizing: "border-box", padding: "0 4px", fontSize: 11.5, textAlign: "right", borderRadius: 4,
                   background: C.bg, border: `1px solid ${value?.[side] != null ? C.accent : C.border}`, color: C.text, outline: "none" }} />
      ))}
      {onAtLeastRef ? <button type="button" title={t("No worse than the reference")} aria-label={t("No worse than the reference")} onClick={onAtLeastRef}
        style={{ width: 18, height: 20, padding: 0, border: "none", background: "none", color: C.textMid, cursor: "pointer", fontSize: 11.5 }}>≥</button>
        : <span aria-hidden="true" style={{ width: 18, flex: "none" }} />}
    </div>
  );
}
// Where the value sits between the worst and best on screen; longer is better, whichever way the
// attribute runs. mutamarket.com's "attribute bars".
function Bar({ span, v }) {
  if (!span || v == null) return null;
  const frac = (v - span.lo) / (span.hi - span.lo), good = span.highGood ? frac : 1 - frac;
  return (
    <div style={{ height: 3, marginTop: 3, borderRadius: 2, background: C.border, overflow: "hidden" }}>
      <div style={{ width: `${Math.max(4, good * 100)}%`, height: "100%", background: good > 0.66 ? C.success : good > 0.33 ? C.accent : C.textMute }} />
    </div>
  );
}
function Delta({ d, better, fmt, inline }) {
  if (d == null || Math.abs(d) < 1e-9) return null;
  const Tag = inline ? "span" : "div";
  return <Tag style={{ fontSize: 11.5, color: better == null ? C.textMid : better ? C.success : C.danger }}>{d > 0 ? "+" : "−"}{fmt(Math.abs(d))}</Tag>;
}
// The table needs its name column plus roughly this much per value column before it stops fitting.
const NAME_W = 240, COL_W = 96, CARD_MAX = 680;
// A callback ref, so it attaches whenever the element appears (the empty state renders none).
function useWidth() {
  const ro = useRef(null), [w, setW] = useState(0);
  useEffect(() => () => ro.current?.disconnect(), []);
  const ref = useCallback((el) => {
    ro.current?.disconnect(); ro.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    ro.current = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.current.observe(el);
  }, []);
  return [ref, w];
}

export default function DeskVariations({ typeID, baseline, fitted = true, resourceHeadroom, usedAbyssalIds = new Set(), onSwap, swapLabel, onInspect }) {
  const online = useOnline();
  const vars = useMemo(() => (typeID ? variantsOf(typeID) : []).map(v => ({ ...v, meta: metaOf(v.typeID, v.meta) })), [typeID]);
  const group = TYPES[typeID]?.gn ?? String(typeID);

  // ── Settings that outlive one item: sort, columns per item group, bars ───────────────────────
  const [sort, setSort] = useState(() => readJSON(SORT_KEY, { by: "price", dir: "asc" }));
  useEffect(() => writeJSON(SORT_KEY, sort), [sort]);
  const [colsByGroup, setColsByGroup] = useState(() => readJSON(COLS_KEY, {}));
  useEffect(() => writeJSON(COLS_KEY, colsByGroup), [colsByGroup]);
  const [bars, setBars] = useState(() => readJSON(BARS_KEY, true) !== false);
  useEffect(() => writeJSON(BARS_KEY, bars), [bars]);
  const [market, setMarket] = useState(readMarketSettings);
  const [showAbyssals, setShowAbyssals] = useState(() => market.showAbyssals);
  const [sources, setSources] = useState(() => market.sources);
  const [fitsOnly, setFitsOnly] = useState(() => market.fitsOnly);
  useEffect(() => { setMarket(m => writeMarketSettings({ ...m, showAbyssals, sources, fitsOnly })); }, [showAbyssals, sources, fitsOnly]);

  // ── Settings that belong to this item: filters, search, reference, selection ─────────────────
  const [filters, setFilters] = useState({});
  const [query, setQuery] = useState("");
  const [refKey, setRefKey] = useState("fitted");
  const [sel, setSel] = useState(null);
  const [menu, setMenu] = useState(null);
  const [editSources, setEditSources] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [rootRef, width] = useWidth();
  useEffect(() => { setFilters({}); setQuery(""); setRefKey("fitted"); setSel(null); }, [typeID]);

  // ── Data: prices, owned rolls, contracts — exactly the phone's three fetches ─────────────────
  const [prices, setPrices] = useState(null);
  const ids = vars.map(v => v.typeID).filter(Boolean);
  const idKey = ids.slice().sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (!ids.length) { setPrices(null); return; }
    let live = true; const [hub, src] = hubSource();
    fetchPrices(ids, hub, src).then(m => { if (live) setPrices(m); }).catch(() => { if (live) setPrices(new Map()); });
    return () => { live = false; };
  }, [idKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [owned, setOwned] = useState([]), [ownedError, setOwnedError] = useState("");
  useEffect(() => { let live = true; readAbyssals().then(r => { if (live) setOwned(r); }).catch(e => { if (live) setOwnedError(e.message); }); return () => { live = false; }; }, []);
  const marketTypes = abyssalTypeIds([typeID, ...ids]);
  const marketKey = marketTypes.join(",");
  const marketOn = showAbyssals && sources.includes(MARKET_SOURCE) && marketTypes.length > 0;
  const [listings, setListings] = useState([]);
  const [mstate, setMstate] = useState({ busy: false, error: "", truncated: false });
  useEffect(() => {
    if (!marketOn) { setListings([]); setMstate({ busy: false, error: "", truncated: false }); return; }
    let live = true; const ctrl = new AbortController();
    setMstate({ busy: true, error: "", truncated: false });
    (async () => {
      try {
        const pages = await Promise.all(marketKey.split(",").map(id => fetchListings(
          { typeId: Number(id), regionId: market.regionId, maxPrice: market.maxPrice, singleItem: !market.allContracts, showAuctions: market.showAuctions },
          { signal: ctrl.signal })));
        const index = await stationIndexFor(market.regionId);
        const located = withStations(pages.flatMap(p => p.listings), index, { stationId: marketStationId(market) });
        if (live) { setListings(located); setMstate({ busy: false, error: "", truncated: pages.some(p => p.truncated) }); }
      } catch (e) {
        if (!live || e.name === "AbortError") return;
        let saved = [];
        try { saved = savedMarketListings(await readListings(), { typeIds: marketTypes, regionId: market.regionId, stationId: marketStationId(market), maxPrice: market.maxPrice, singleItem: !market.allContracts, showAuctions: market.showAuctions }); } catch { /* none saved */ }
        if (live) { setListings(saved); setMstate({ busy: false, error: e.message, truncated: false, cached: true }); }
      }
    })();
    return () => { live = false; ctrl.abort(); };
  }, [marketOn, marketKey, market.regionId, market.maxPrice, market.jitaOnly, market.allContracts, market.showAuctions, online]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!typeID) return <div style={{ padding: 14, fontSize: TYPE.label, color: C.textMid }}>{t("No variation data available.")}</div>;

  // ── Rows ─────────────────────────────────────────────────────────────────────────────────────
  const abyssal = !!baseline?.mutations && Object.keys(baseline.mutations).length > 0;
  const base = { name: baseline?.name ?? TYPES[typeID]?.n, typeID, mutations: abyssal ? baseline.mutations : undefined, mutaplasmid: baseline?.mutaplasmid, abyssalItemId: baseline?.abyssalItemId };
  const comparison = variationItems(vars, base, listings.length ? [...owned, ...listings] : owned);
  const attributes = comparison.attributes;
  const visibleCols = (colsByGroup[group] ?? attributes.slice(0, 8)).filter(k => attributes.includes(k));
  const rowPrice = (r) => (r.record?.source === MARKET_SOURCE ? listingCost(r.record) : null) ?? (r.mod.mutations ? null : prices?.get(Number(r.typeID))) ?? null;
  const baseCost = fitCostParts({ typeID }, baseline?.mutations), costRatio = fitCostRatioOf(resourceHeadroom, typeID);
  const fitsOf = (r) => !resourceHeadroom || r.isBaseline ? null : variantCostFits(fitCostParts({ typeID: r.typeID }, r.mod.mutations), baseCost, resourceHeadroom, costRatio);
  const ref = comparison.rows.find(r => r.key === refKey) ?? comparison.rows[0];
  const disp = (k, v) => num(v) ? mutaToDisplay(k, v) : null;

  // Every filter in one pass, counting what each one removed so the status line can say so.
  const counts = { sources: 0, budget: 0, fits: 0, columns: 0, search: 0 };
  const bySource = filterVariationItems(comparison.rows, showAbyssals, sources);
  counts.sources = comparison.rows.length - bySource.length;
  const q = query.trim().toLowerCase();
  const kept = bySource.filter(r => {
    if (r.isBaseline || r.key === ref?.key) return true;
    if (!withinPriceCeiling(rowPrice(r), showAbyssals ? market.maxPrice : null)) { counts.budget++; return false; }
    if (fitsOnly && fitsOf(r) === false) { counts.fits++; return false; }
    if (q && ![r.record?.label, r.mod.name, r.record?.sellerName, r.record?.characterName, r.record?.location].some(s => s && s.toLowerCase().includes(q))) { counts.search++; return false; }
    for (const [k, f] of Object.entries(filters)) {
      const v = k === "price" ? rowPrice(r) : disp(k, r.values?.[k]);
      if ((f.min != null && !(v != null && v >= f.min)) || (f.max != null && !(v != null && v <= f.max))) { counts.columns++; return false; }
    }
    return true;
  });
  const activeSort = ["price", "meta", ...attributes].includes(sort.by) ? sort.by : "price";
  const rows = sortCompareRows(kept, { by: activeSort, dir: sort.dir, prices, toDisplay: mutaToDisplay });
  const sortBy = (by) => setSort(cur => cur.by === by
    ? { by, dir: cur.dir === "asc" ? "desc" : "asc" }
    : { by, dir: by === "price" || by === "meta" ? "asc" : bestFirstDirection(by, kept.map(r => ({ value: r.values?.[by], typeID: r.typeID })), mutaToDisplay) });

  // A chosen column no variant has a value for (an attribute of the mutaplasmid, not of this item)
  // says nothing, so it is left out — judged before the filters, so columns don't come and go as you type.
  const shownCols = visibleCols.filter(k => filters[k] || bySource.some(r => num(r.values?.[k])));

  // The range each column spans on screen, for the bars, and which end is the good one.
  const span = {};
  for (const k of shownCols) {
    const vals = rows.map(r => disp(k, r.values?.[k])).filter(num);
    if (vals.length < 2) continue;
    const lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi === lo) continue;
    const hiRow = rows.find(r => disp(k, r.values?.[k]) === hi), loRow = rows.find(r => disp(k, r.values?.[k]) === lo);
    span[k] = { lo, hi, highGood: directionOf(k, hiRow.values[k], loRow.values[k], hiRow.typeID) !== false };
  }
  const refPrice = ref && !ref.mod.mutations ? rowPrice(ref) : null;

  // ── Actions ──────────────────────────────────────────────────────────────────────────────────
  const canSwap = (r) => !!onSwap && !(fitted && r.isBaseline) && !(r.mod.abyssalItemId && usedAbyssalIds.has(r.mod.abyssalItemId));
  const swap = (r) => {
    if (!canSwap(r)) return;
    if (r.record?.source === MARKET_SOURCE) rememberListings([r.record]).catch(() => {});
    onSwap(r.mod);
  };
  const favorite = async (record) => { try { setOwned(await editAbyssal(record.itemId, { favorite: !record.favorite })); } catch (e) { setOwnedError(e.message); } };
  const rowMenu = (e, r) => {
    e.preventDefault(); setSel(r.key);
    const url = r.record?.source === MARKET_SOURCE ? mutaMarketUrl(r.record.slug) : null;
    setMenu({ x: e.clientX, y: e.clientY, items: [
      onSwap && { label: swapLabel ?? t("Swap in"), hint: t("Double-click"), disabled: !canSwap(r), onSelect: () => swap(r) },
      { label: t("Compare against this"), disabled: r.key === ref?.key, onSelect: () => setRefKey(r.key) },
      refKey !== "fitted" && { label: fitted ? t("Compare against the fitted one") : t("Compare against the reference"), onSelect: () => setRefKey("fitted") },
      { divider: true },
      onInspect && { label: t("Show info"), onSelect: () => onInspect(r.typeID) },
      url && { label: t("Open on MutaMarket"), onSelect: () => window.open(url, "_blank", "noopener") },
      r.record && r.record.source !== MARKET_SOURCE && { label: r.record.favorite ? t("Remove from favorites") : t("Add to favorites"), onSelect: () => favorite(r.record) },
      { label: t("Copy name"), onSelect: () => navigator.clipboard?.writeText(r.record?.label || r.mod.name).catch(() => {}) },
    ] });
  };
  const setFilter = (k, side, text) => setFilters(f => {
    const v = parseNum(text), cur = { ...(f[k] ?? {}) };
    if (v == null) delete cur[side]; else cur[side] = v;
    const out = { ...f };
    if (cur.min == null && cur.max == null) delete out[k]; else out[k] = cur;
    return out;
  });
  // The phone's padlock: "no worse than the reference" on one attribute, as a min or a max.
  const atLeastRef = (k) => {
    const v = disp(k, ref?.values?.[k]); if (v == null || !span[k]) return;
    setFilters(f => ({ ...f, [k]: span[k].highGood ? { min: v } : { max: v } }));
  };
  const toggleCol = (k) => setColsByGroup(m => {
    const cur = m[group] ?? attributes.slice(0, 8);
    const next = cur.includes(k) ? cur.filter(x => x !== k) : attributes.filter(a => cur.includes(a) || a === k);
    return { ...m, [group]: next };
  });

  // ── View ─────────────────────────────────────────────────────────────────────────────────────
  const abyssalCapable = TYPES[typeID]?.c === 7 && marketTypes.length > 0;
  const chip = (on, label, onClick, color = C.accent) => (
    <button type="button" aria-pressed={on} onClick={onClick}
      style={{ height: 24, padding: "0 10px", borderRadius: 12, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
               background: on ? `${color}22` : "transparent", border: `1px solid ${on ? color : C.borderStrong}`, color: on ? color : C.textMid }}>{label}</button>
  );
  const owns = sources.includes("owned") && showAbyssals, mm = sources.includes(MARKET_SOURCE) && showAbyssals;
  const toggleSource = (src) => {
    const on = showAbyssals && sources.includes(src);
    const next = on ? sources.filter(s => s !== src) : [...new Set([...sources, src])];
    setSources(next);
    setShowAbyssals(next.length > 0);
  };
  const hidden = [
    counts.budget && t("{n} over budget", { n: counts.budget }), counts.fits && t("{n} won't fit", { n: counts.fits }),
    counts.columns && t("{n} filtered out", { n: counts.columns }), counts.search && t("{n} not matching the search", { n: counts.search }),
  ].filter(Boolean);
  const th = { position: "sticky", top: 0, zIndex: 2, background: C.surfaceAlt, padding: "5px 8px", fontSize: TYPE.section, letterSpacing: ".04em",
               textTransform: "uppercase", color: C.textMid, fontWeight: 500, textAlign: "right", whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}`, cursor: "pointer", userSelect: "none" };
  const fth = { position: "sticky", top: 27, zIndex: 2, background: C.surface, padding: "3px 4px", borderBottom: `1px solid ${C.border}` };
  const sortMark = (k) => activeSort === k ? <span style={{ color: C.accent }}>{sort.dir === "asc" ? " ▲" : " ▼"}</span> : null;
  const filterBox = (k) => <FilterBox k={k} value={filters[k]} onSet={setFilter} onAtLeastRef={k !== "price" && span[k] ? () => atLeastRef(k) : null} />;
  const cards = width > 0 && width < Math.min(CARD_MAX, NAME_W + COL_W * (shownCols.length + 1));
  const sortLabel = (k) => k === "meta" ? t("Meta level") : k === "price" ? t("Price") : colLabel(k);
  const sortItems = ["meta", "price", ...attributes].map(k => ({
    label: `${sortLabel(k)}${activeSort === k ? (sort.dir === "asc" ? "  ▲" : "  ▼") : ""}`, onSelect: () => sortBy(k) }));
  const filterKeys = ["price", ...shownCols];

  // The pieces both layouts share: who the row is, and one attribute's value against the reference.
  const nameBlock = (r, meta, fits, inUse, isRef, maxW) => {
    const v = r.mod, record = r.record, grade = abyssalGrade(v.mutaplasmid);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <img className="eve-icon" src={eveIcon(v.typeID, 32)} width={20} height={20} alt="" onError={e => { e.target.style.visibility = "hidden"; }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ color: r.isBaseline ? C.accent : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: maxW }} title={record?.label || v.name}>
            {record?.label || v.name}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 11.5, color: C.textMid, marginTop: 1 }}>
            <span style={{ color: META_COLORS[meta] ?? C.textMid }}>{meta}</span>
            {r.isBaseline && <span style={{ color: C.accent }}>{fitted ? t("FITTED") : t("REFERENCE")}</span>}
            {r.isStockBase && <span>{t("UNMUTATED")}</span>}
            {!r.isBaseline && isRef && <span style={{ color: C.accent }}>{t("COMPARING")}</span>}
            {v.mutations && grade && <AbyssalBadge grade={grade} />}
            {record?.source === MARKET_SOURCE && <span style={{ color: C.success }}>{t("MutaMarket")}{record.contractKind === "bid" ? ` · ${t("BID")}` : ""}{record.contractItems > 1 ? ` · ${t("×{n} ITEMS", { n: record.contractItems })}` : ""}</span>}
            {record && record.source !== MARKET_SOURCE && <span>{record.favorite ? "★ " : ""}{record.characterName} · {record.location}</span>}
            {record?.source === MARKET_SOURCE && record.sellerName && <span>{record.sellerName}</span>}
            {fits === false && <span style={{ color: C.danger }}>{t("won't fit")}</span>}
            {inUse && <span style={{ color: C.warning }}>{t("Fitted elsewhere in this fit")}</span>}
          </div>
        </div>
      </div>
    );
  };
  const valueOf = (r, k, isRef) => {
    const raw = r.values?.[k], val = disp(k, raw), rv = disp(k, ref?.values?.[k]);
    const d = !isRef && val != null && rv != null ? val - rv : null;
    const better = d == null || Math.abs(d) < 1e-9 ? null : directionOf(k, raw, ref.values[k], r.typeID);
    return { raw, val, d, better, text: num(raw) ? fmtMutaVal(k, raw) : "—" };
  };
  const priceBlock = (r, price, isRef, align = "right") => (
    <div style={{ textAlign: align }}>
      <div style={{ color: price != null ? C.text : C.textMid }}>{price != null ? fmtResource(price) : "—"}</div>
      {!isRef && price != null && refPrice != null && <Delta d={price - refPrice} better={price < refPrice} fmt={fmtResource} />}
      {r.record?.estimatedValue != null && <div style={{ fontSize: 11, color: C.textMid }} title={t("MutaMarket's estimate")}>~{fmtResource(r.record.estimatedValue)}</div>}
    </div>
  );
  const rowInfo = (r) => ({
    meta: metaOf(r.mod.typeID, r.mod.meta), price: rowPrice(r), fits: fitsOf(r), isRef: r.key === ref?.key,
    inUse: !!r.mod.abyssalItemId && usedAbyssalIds.has(r.mod.abyssalItemId) && !r.isBaseline,
  });
  const rowEvents = (r) => ({ onClick: () => setSel(r.key), onDoubleClick: () => swap(r), onContextMenu: e => rowMenu(e, r) });

  return (
    <div ref={rootRef} style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <style>{`.dv-row:hover td,.dv-card:hover{background:${C.surfaceAlt}}.dv-row.sel td,.dv-card.sel{background:${C.accentLight}}.dv-row.ref td,.dv-card.ref{background:${C.accent}12}`}</style>
      {/* Toolbar: what is in the list, then how it is shown. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "8px 10px", borderBottom: `1px solid ${C.border}`, flex: "none" }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Search name, seller, location")} aria-label={t("Search name, seller, location")}
          style={{ height: 26, width: 210, boxSizing: "border-box", padding: "0 9px", borderRadius: 6, fontSize: 12.5, background: C.bg, border: `1px solid ${C.borderStrong}`, color: C.text, outline: "none" }} />
        {abyssalCapable && <>
          {chip(owns, t("My rolls"), () => toggleSource("owned"), C.danger)}
          {chip(mm, t("MutaMarket"), () => toggleSource(MARKET_SOURCE), C.danger)}
          <button type="button" onClick={() => setEditSources(true)} title={t("Edit abyssal sources")}
            style={{ height: 24, padding: "0 8px", borderRadius: 12, fontSize: 12, cursor: "pointer", background: "transparent", border: `1px solid ${C.borderStrong}`, color: C.textMid }}>{t("Sources…")}</button>
        </>}
        {resourceHeadroom && chip(fitsOnly, t("Only what fits"), () => setFitsOnly(v => !v))}
        <span style={{ flex: 1 }} />
        {cards && <Menu label={`${t("Sort")}: ${sortLabel(activeSort)} ${sort.dir === "asc" ? "▲" : "▼"}`} ariaLabel={t("Sort by")} align="right"
          buttonStyle={{ height: 24, border: `1px solid ${C.borderStrong}`, fontSize: 12, fontWeight: 400, borderRadius: 12 }} items={sortItems} />}
        {cards && chip(showFilters || Object.keys(filters).length > 0,
          Object.keys(filters).length ? t("Filters ({n})", { n: Object.keys(filters).length }) : t("Filters"), () => setShowFilters(v => !v))}
        {chip(bars, t("Bars"), () => setBars(v => !v))}
        <Menu label={`${t("Columns")} ▾`} buttonStyle={{ height: 24, border: `1px solid ${C.borderStrong}`, fontSize: 12, fontWeight: 400, borderRadius: 12 }} align="right"
          items={attributes.map(k => ({ label: colLabel(k), checked: visibleCols.includes(k), onSelect: () => toggleCol(k), keepOpen: true }))} />
        {Object.keys(filters).length > 0 && <button type="button" onClick={() => setFilters({})}
          style={{ height: 24, padding: "0 8px", borderRadius: 12, fontSize: 12, cursor: "pointer", background: "transparent", border: `1px solid ${C.borderStrong}`, color: C.danger }}>{t("Clear filters")}</button>}
      </div>
      <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px", fontSize: 12, color: C.textMid, flex: "none", flexWrap: "wrap" }}>
        <span>{t({ one: "{n} variant", other: "{n} variants" }, { n: rows.length })} · {ref?.isBaseline ? (fitted ? t("vs fitted") : t("vs reference")) : t("vs {name}", { name: ref?.record?.label || ref?.mod.name })}</span>
        {hidden.length > 0 && <span>· {hidden.join(" · ")}</span>}
        {marketOn && mstate.busy && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="vv-spin" aria-hidden="true" style={{ width: 10, height: 10, border: `2px solid ${C.border}`, borderTopColor: C.accent, borderRadius: "50%", display: "inline-block" }} />{t("Checking contracts…")}</span>}
        {marketOn && mstate.error && <span style={{ color: C.danger }}>{mstate.error}</span>}
        {mstate.cached && <span>{t("Showing saved listings only. Availability has not been refreshed.")}</span>}
        {marketOn && mstate.truncated && <span>{t("Showing the cheapest listings only — narrow the price range to see the rest.")}</span>}
        {ownedError && <span style={{ color: C.danger }}>{ownedError}</span>}
      </div>
      {cards && showFilters && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "4px 14px", padding: "6px 10px 8px",
                      borderTop: `1px solid ${C.border}`, background: C.surfaceAlt, flex: "none", maxHeight: 180, overflowY: "auto" }}>
          {filterKeys.map(k => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span title={sortLabel(k)} style={{ flex: 1, minWidth: 0, fontSize: 12, color: filters[k] ? C.accent : C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sortLabel(k)}</span>
              {filterBox(k)}
            </div>
          ))}
        </div>
      )}
      {cards ? (
        <div role="list" style={{ flex: 1, minHeight: 0, overflow: "auto", borderTop: `1px solid ${C.border}`, fontVariantNumeric: "tabular-nums", lineHeight: 1.25 }}>
          {rows.map(r => {
            const { meta, price, fits, isRef, inUse } = rowInfo(r);
            return (
              <div role="listitem" key={r.key} className={`dv-card${sel === r.key ? " sel" : ""}${isRef ? " ref" : ""}`} {...rowEvents(r)}
                style={{ padding: "7px 10px 8px", borderBottom: `1px solid ${C.border}88`, cursor: "default", opacity: fits === false ? 0.6 : 1, fontSize: TYPE.label }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>{nameBlock(r, meta, fits, inUse, isRef, "100%")}</div>
                  <div style={{ flex: "none", whiteSpace: "nowrap" }}>{priceBlock(r, price, isRef)}</div>
                </div>
                {shownCols.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: "5px 12px", marginTop: 6, paddingLeft: 28 }}>
                    {shownCols.map(k => {
                      const c = valueOf(r, k, isRef);
                      return (
                        <div key={k} style={{ minWidth: 0 }}>
                          <div title={colLabel(k)} style={{ fontSize: 11, color: activeSort === k ? C.accent : C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{colLabel(k)}</div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" }}>
                            <span style={{ color: num(c.raw) ? C.text : C.textMute }}>{c.text}</span>
                            <Delta d={c.d} better={c.better} fmt={x => fmtMutaDisplay(k, x)} inline />
                          </div>
                          {bars && <Bar span={span[k]} v={c.val} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {!rows.length && <div style={{ padding: 14, fontSize: TYPE.label, color: C.textMid }}>{t("Nothing matches these filters.")}</div>}
        </div>
      ) : (
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", borderTop: `1px solid ${C.border}` }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", fontVariantNumeric: "tabular-nums", lineHeight: 1.25 }}>
          <thead>
            <tr>
              <th onClick={() => sortBy("meta")} style={{ ...th, textAlign: "left", left: 0, zIndex: 3, minWidth: 230 }}>{t("Item")}{sortMark("meta")}</th>
              <th onClick={() => sortBy("price")} style={th}>{t("Price")}{sortMark("price")}</th>
              {shownCols.map(k => <th key={k} onClick={() => sortBy(k)} title={colLabel(k)} style={th}>{colLabel(k)}{sortMark(k)}</th>)}
            </tr>
            <tr>
              <th style={{ ...fth, left: 0, zIndex: 3 }} />
              <th style={fth}>{filterBox("price")}</th>
              {shownCols.map(k => <th key={k} style={fth}>{filterBox(k)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const { meta, price, fits, isRef, inUse } = rowInfo(r);
              const td = { padding: "5px 8px", borderBottom: `1px solid ${C.border}88`, textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap", fontSize: TYPE.label };
              return (
                <tr key={r.key} className={`dv-row${sel === r.key ? " sel" : ""}${isRef ? " ref" : ""}`} {...rowEvents(r)}
                  style={{ cursor: "default", opacity: fits === false ? 0.6 : 1 }}>
                  <td style={{ ...td, textAlign: "left", position: "sticky", left: 0, zIndex: 1, background: C.surface, whiteSpace: "normal" }}>
                    {nameBlock(r, meta, fits, inUse, isRef, 260)}
                  </td>
                  <td style={td}>{priceBlock(r, price, isRef)}</td>
                  {shownCols.map(k => {
                    const c = valueOf(r, k, isRef);
                    return (
                      <td key={k} style={td}>
                        <div style={{ color: num(c.raw) ? C.text : C.textMute }}>{c.text}</div>
                        <Delta d={c.d} better={c.better} fmt={x => fmtMutaDisplay(k, x)} />
                        {bars && <Bar span={span[k]} v={c.val} />}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div style={{ padding: 14, fontSize: TYPE.label, color: C.textMid }}>{t("Nothing matches these filters.")}</div>}
      </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {editSources && <AbyssalSources Sheet={DialogFrame} records={owned} selection={sources} market={market}
        onMarketChange={next => setMarket(writeMarketSettings(next))} onRecordsChange={setOwned}
        onChange={next => { setSources(next); if (next.length) setShowAbyssals(true); }} onClose={() => setEditSources(false)} />}
    </div>
  );
}
