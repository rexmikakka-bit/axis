import { createContext, useContext, useRef, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { eveIcon } from "../lib/icons.js";
import { TYPES } from "../calc.js";
import { DMG, STATE_COLORS, STATE_GLOW, STATE_LABELS, MUTA_BY_TYPE, getCompatibleCharges, canLoadCharge } from "../lib/core.js";
import { ContextMenu } from "./ContextMenu.jsx";
import { useInspect } from "./inspect-context.jsx";
import { moduleTarget, chargeTarget } from "./inspect.js";
import { useItems, useItemDrop, DropHint } from "./items-context.jsx";
import { currentDrag, draggedItem, isItemDrag, itemKind } from "./items.js";
import { resourceColor } from "../components/ui.jsx";
import { getCachedPrices } from "../prices.js";

// The desktop Fitting window's table (docs/desktop-handoff.md section 3, "Fitting"). Drawn by
// FitTab through its `TableView` prop: FitTab keeps every piece of editing logic — the module menu,
// the module picker, state changes, removing, copying, drag-reordering, undo — and hands this
// component the rows plus the handlers, so the table edits a fit exactly the way the phone does.
//
// Columns: state · icon · module · charge | CPU | PG | Cap/s | Range | Info | ISK. The figure
// columns are resizable from their header's left edge (dragging left widens), widths persisted with
// the layout. Per-module CPU/PG/cap come from the engine's fitted items, so they include every skill,
// rig and bonus the fit's own totals do.

export const FIT_COLS = [
  { id: "cpu", label: "CPU", w: 40 },
  { id: "pg", label: "PG", w: 48 },
  { id: "cap", label: "Cap/s", w: 42 },
  { id: "range", label: "Range", w: 92 },
  { id: "info", label: "Info", w: 92 },
  { id: "isk", label: "ISK", w: 48 },
];
const MIN_COL = 32;

const num = (n, d = 1) => n == null || !Number.isFinite(n) ? "" : (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(d).replace(/\.0+$/, ""));
const isk = (n) => n == null ? "—" : n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n));
const k = (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));

// The per-module figures the phone's row chips show, as the Range and Info cells.
function rangeOf(e, row) {
  if (!e) return null;
  const opt = e.optimal, fal = e.falloff;
  if (e.isWDFG) return `${Math.round((e.warpScrambleRange ?? 0) / 100) / 10} km`;
  if (!(opt > 0 || fal > 0)) return null;
  const heated = row.state !== "overheated" && e.heatedOptimal ? e.heatedOptimal : null;
  return { text: `${num(opt)}${fal > 0 ? ` + ${num(fal)}` : ""} km`, heated };
}
function infoOf(e) {
  if (!e) return null;
  if (e.tracking > 0) return { text: `${t("Tr")} ${(+e.tracking).toFixed(2)}`, color: C.warning, title: `${t("Tracking — radians/second")}: ${e.tracking}` };
  if (e.strengthText) return { text: e.strengthText, color: C.warning };
  if (e.isASB) return e.hasCharges ? { text: `${k(e.totalEHP ?? e.totalHP)} / ${e.totalS}s`, color: C.high } : { text: `${k(e.ehpS)} EHP/s`, color: C.textMid };
  if (e.isAAR) return e.hasPaste ? { text: `${k(e.totalEHP ?? e.totalHP)} / ${e.totalS}s`, color: C.high } : { text: `${k(e.ehpS ?? 0)} EHP/s`, color: C.textMid };
  if (e.isRAH && e.rahResistPct) return { node: e.rahResistPct.map((v, i) => <span key={i} style={{ color: [DMG.em.color, DMG.th.color, DMG.kin.color, DMG.exp.color][i] }}>{i ? " " : ""}{Number(v.toFixed(0))}</span>) };
  if (e.isBreacher && !e.noPod) return { text: `${k(e.totalAbs)} / ${Math.round(e.totalPct)}%`, color: C.danger };
  return null;
}

// Settings the table needs from outside FitTab: price hub/source and the persisted column widths.
// A context rather than props because FitTab renders the table itself (TableView), and a component
// made per render would remount the whole table on every edit.
export const FitTableConfig = createContext({});

/**
 * The state dot, with pyfa's mouse bindings (Owen, 2026-11-04):
 *   click        running <-> idle: active <-> online, or online <-> offline for a module that
 *                cannot be activated
 *   right-click  overheat (or cool back down to active)
 *   ctrl-click   offline (or back online)
 * Each only offers a state the module supports (validStatesFor), and goes through FitTab's own
 * setRowState, so a grouped row changes every module in its group as the phone's dot does.
 */
function StateToggle({ row, states, onSet }) {
  const has = (st) => states.includes(st);
  const cur = row.state ?? "online";
  const click = (e) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) { if (has("offline")) onSet(cur === "offline" ? "online" : "offline"); return; }
    if (has("active")) onSet(cur === "active" || cur === "overheated" ? "online" : "active");
    else if (has("offline")) onSet(cur === "offline" ? "online" : "offline");
  };
  const context = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (has("overheated")) onSet(cur === "overheated" ? "active" : "overheated");
  };
  // The phone StateDot's light, not a plain circle: filled in the state colour with STATE_GLOW's
  // halo, so a running module reads as a lamp that is on (Owen asked for that look back).
  const color = STATE_COLORS[cur] ?? C.textMid, glow = STATE_GLOW[cur] ?? 0;
  return (
    <button type="button" onClick={click} onContextMenu={context}
      title={`${STATE_LABELS[cur]?.() ?? cur} — ${t("click: on/off · right-click: overheat · ctrl-click: offline")}`}
      aria-label={STATE_LABELS[cur]?.() ?? cur}
      style={{ width: 16, height: 16, padding: 0, border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center" }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: color, boxShadow: glow ? `0 0 ${glow}px ${color}` : "none",
                     transition: "background-color .18s ease, box-shadow .18s ease" }} />
    </button>
  );
}

export function FitTable({ api }) {
  const { hub, source, cols, setCols } = useContext(FitTableConfig);
    const { SECS, getDisplayRows, slots, setSlots, cs, engineStatsBySlotID, validStatesFor,
            openMenu, openEmpty, openSubsystem, setRowState, startRowDrag, moveRowDrag, endRowDrag, dragUI, rowRefs,
            removeMod, duplicateMod, duplicateRoom, hardpointRoom, fillHardpoints,
            undo, redo, undoDepth, redoDepth, grouped, setGrouped } = api;

    // ── Desktop mouse model: left click SELECTS (ctrl/cmd adds or removes one, shift extends within the
    // rack), double click UNFITS it (one module of a grouped row per double-click, so it can be repeated;
    // Undo brings it back), right click opens the context menu, with Show info; Delete removes the
    // selection, Escape clears it. The phone's tap-opens-the-sheet does not apply here.
    const insp = useInspect();
    // Browser items dropped here: a module is fitted to its rack, a charge loads into every module
    // that takes it — or, dropped on one row, into that row (all of a grouped row's members).
    const items = useItems();
    const drop = useItemDrop("fitting");
    const [chargeOver, setChargeOver] = useState(null);   // the row key a charge hovers
    const dragKind = drop.over ? itemKind(currentDrag()).kind : null;
    // Reorder by dragging the ROW, as a desktop list does, not only the phone's ≡ grip: a press arms,
    // and only travel past ROW_DRAG_PX starts the phone's own drag (startRowDrag, which picks the drop
    // row and reorders through FitTab), so a click still selects and a double click still unfits.
    const press = useRef(null);
    const ROW_DRAG_PX = 5;
    const rowReorder = (secKey, rowIdx) => secKey === "subsystems" ? {} : {
      onPointerDown: (e) => { if (e.button === 0) press.current = { secKey, rowIdx, x: e.clientX, y: e.clientY, started: false }; },
      onPointerMove: (e) => {
        const p = press.current; if (!p) return;
        if (!p.started) {
          if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < ROW_DRAG_PX) return;
          p.started = true; startRowDrag(p.secKey, p.rowIdx)(e);
        }
        moveRowDrag(e);
      },
      onPointerUp: () => { const p = press.current; press.current = null; if (p?.started) endRowDrag(); },
      onPointerCancel: () => { const p = press.current; press.current = null; if (p?.started) endRowDrag(); },
    };
    const rowDrop = (secKey, row) => {
      const key = rowKey(secKey, row.id);
      const takes = () => { const it = currentDrag(); return !!it && row.typeID != null && itemKind(it).kind === "charge" && canLoadCharge(row.typeID, it.name); };
      return {
        onDragOver: (e) => { if (!isItemDrag(e) || !takes()) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; if (chargeOver !== key) setChargeOver(key); },
        onDragLeave: () => setChargeOver(k => (k === key ? null : k)),
        onDrop: (e) => {
          setChargeOver(null);
          if (!isItemDrag(e) || !takes()) return;
          const it = draggedItem(e); if (!it) return;
          e.preventDefault();
          items.add(it, "fitting", { only: row.groupIds ?? [row.id] });
        },
      };
    };
    const [sel, setSel] = useState(() => new Set());
    const [anchor, setAnchor] = useState(null);
    const [menu, setMenu] = useState(null);   // {x, y, secKey, row}
    const rowKey = (secKey, id) => `${secKey}:${id}`;
    // The desktop opens a module in its own window (Inspector.jsx) rather than the phone menu, and a
    // click makes it the selection the full-time Info / Variations / Mutaplasmid windows show.
    const inspectRow = (secKey, row, tab) => insp.inspect(moduleTarget(insp.fitRef, secKey, row.id, row.typeID), tab);
    const clickRow = (e, secKey, row, rows) => {
      if (row.type !== "empty") insp.select(moduleTarget(insp.fitRef, secKey, row.id, row.typeID));
      const k = rowKey(secKey, row.id);
      if (e.shiftKey && anchor?.secKey === secKey) {
        const ids = rows.map(r => r.id), a = ids.indexOf(anchor.id), b = ids.indexOf(row.id);
        if (a >= 0 && b >= 0) { const [lo, hi] = a < b ? [a, b] : [b, a]; setSel(new Set(rows.slice(lo, hi + 1).filter(r => r.type !== "empty").map(r => rowKey(secKey, r.id)))); return; }
      }
      if (e.ctrlKey || e.metaKey) { setSel(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }); setAnchor({ secKey, id: row.id }); return; }
      setSel(new Set([k])); setAnchor({ secKey, id: row.id });
    };
    // The selected modules, resolved to their rows (a grouped row carries its whole group).
    const selectedRows = () => SECS.flatMap(sec => getDisplayRows(sec.key).filter(r => r.type !== "empty" && sel.has(rowKey(sec.key, r.id))).map(r => ({ secKey: sec.key, row: r })));
    const removeSelected = () => { for (const { secKey, row } of selectedRows()) if (secKey !== "subsystems") removeMod(secKey, row.id, row.groupIds); setSel(new Set()); };
    const onKey = (e) => {
      if ((e.key === "Delete" || e.key === "Backspace") && sel.size) { e.preventDefault(); removeSelected(); }
      if (e.key === "Escape") setSel(new Set());
    };
    const menuItems = (secKey, row) => {
      if (row.type === "empty") return [{ label: t("Add module…"), onSelect: () => openEmpty(secKey, row.id) }];
      if (secKey === "subsystems") return [{ label: t("Change subsystem…"), onSelect: () => openSubsystem(row) }];
      const src = (slots[secKey] ?? []).find(m => m.id === row.id);
      const states = validStatesFor(row);
      const many = sel.size > 1 && sel.has(rowKey(secKey, row.id));
      const takesCharges = row.type === "weapon" || row.type === "capbooster" || getCompatibleCharges(row).length > 0;
      const mutable = (MUTA_BY_TYPE[row.typeID] ?? MUTA_BY_TYPE[String(row.typeID)] ?? []).length > 0 || row.mutaplasmid;
      const ORDER = ["overheated", "active", "online", "offline"];
      return [
        { heading: row.count > 1 ? `${row.count}× ${row.name}` : row.name },
        ...ORDER.filter(st => states.includes(st)).map(st => ({ label: STATE_LABELS[st](), checked: (row.state ?? "online") === st,
          onSelect: () => setRowState(secKey, row, st), hint: st === "overheated" ? t("right-click dot") : st === "offline" ? t("ctrl-click dot") : undefined })),
        { divider: true },
        takesCharges && { label: row.ammo ? t("Change charge…") : t("Load charge…"), onSelect: () => inspectRow(secKey, row, "charge") },
        row.ammo && { label: t("Show charge info…"), onSelect: () => insp.inspect(chargeTarget(insp.fitRef, secKey, row.id), "info") },
        row.ammo && { label: t("Unload charge"), onSelect: () => { const ids = new Set(row.groupIds ?? [row.id]);
          setSlots(prev => ({ ...prev, [secKey]: prev[secKey].map(m => ids.has(m.id) ? { ...m, ammo: null, charges: undefined, maxCharges: undefined } : m) })); } },
        takesCharges && { divider: true },
        (TYPES[row.typeID] ?? TYPES[String(row.typeID)])?.gn === "Armor Resistance Shift Hardener" && { label: t("Adaptation…"), onSelect: () => inspectRow(secKey, row, "rah") },
        { label: t("Show info…"), onSelect: () => inspectRow(secKey, row, "info") },
        { label: t("Variations…"), onSelect: () => inspectRow(secKey, row, "variations") },
        mutable && { label: t("Mutate…"), onSelect: () => inspectRow(secKey, row, "mutate") },
        { divider: true },
        src && duplicateRoom(secKey, src) > 0 && { label: t("Copy to an empty slot"), onSelect: () => duplicateMod(secKey, src, 1) },
        src && hardpointRoom(secKey, src) > 0 && { label: t("Fill hardpoints ({n})", { n: hardpointRoom(secKey, src) }), onSelect: () => fillHardpoints(secKey, src) },
        many ? { label: t("Remove {n} selected", { n: selectedRows().length }), hint: "Del", danger: true, onSelect: removeSelected }
             : { label: row.count > 1 ? t("Remove all {n}", { n: row.count }) : t("Remove"), hint: row.count > 1 ? "Del" : t("double-click · Del"), danger: true, onSelect: () => removeMod(secKey, row.id, row.groupIds) },
        row.count > 1 && !many && { label: t("Remove one"), hint: t("double-click"), danger: true, onSelect: () => removeMod(secKey, row.id) },
      ];
    };
    const openContext = (e, secKey, row) => {
      e.preventDefault();
      if (!sel.has(rowKey(secKey, row.id))) { setSel(new Set([rowKey(secKey, row.id)])); setAnchor({ secKey, id: row.id }); }
      setMenu({ x: e.clientX, y: e.clientY, secKey, row });
    };
    const widths = FIT_COLS.map(c => cols?.[c.id] ?? c.w);
    const template = `12px 20px minmax(0,1fr) ${widths.map(w => `${w}px`).join(" ")} 16px`;
    const prices = getCachedPrices(hub, source);
    const priceOf = (id) => prices.get(String(id)) ?? prices.get(Number(id)) ?? null;
    const item = (id) => cs?.fittedItems?.get(id);

    // Column resize from a header cell's LEFT edge: dragging left widens (its right edge stays put).
    const drag = useRef(null);
    const startResize = (id) => (e) => {
      e.preventDefault(); e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { id, x: e.clientX, w: cols?.[id] ?? FIT_COLS.find(c => c.id === id).w };
    };
    const moveResize = (e) => {
      const d = drag.current; if (!d) return;
      setCols({ ...(cols ?? {}), [d.id]: Math.max(MIN_COL, Math.round(d.w - (e.clientX - d.x))) });
    };
    const endResize = () => { drag.current = null; };

    const cell = { fontSize: 13, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "right" };
    const histBtn = (on) => ({ height: 24, padding: "0 8px", borderRadius: 5, fontSize: 12.5, border: `1px solid ${C.borderStrong}`, background: "transparent",
                               color: on ? C.text : C.textMute, cursor: on ? "pointer" : "default" });

    return (
      <div {...drop.props} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", lineHeight: 1.3, position: "relative" }}>
        {!chargeOver && <DropHint over={drop.over} ok={drop.ok} label={dragKind === "charge" ? t("Load into compatible modules") : t("Fit")} />}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderBottom: `1px solid ${C.border}`, flex: "none" }}>
          <button type="button" style={histBtn(undoDepth > 0)} disabled={!undoDepth} onClick={() => undo?.()} title={t("Undo last change ({n})", { n: undoDepth })}>↶ {t("Undo")}</button>
          <button type="button" style={histBtn(redoDepth > 0)} disabled={!redoDepth} onClick={() => redo?.()} title={t("Redo last undone change ({n})", { n: redoDepth })}>↷ {t("Redo")}</button>
          <span style={{ flex: 1 }} />
          <button type="button" aria-pressed={grouped} onClick={() => setGrouped(g => !g)}
            style={{ ...histBtn(true), color: grouped ? C.accent : C.textMid, background: grouped ? C.accentLight : "transparent", borderColor: grouped ? C.accent : C.borderStrong }}>{t("Grouped")}</button>
        </div>
        {/* Column header */}
        <div style={{ display: "grid", gridTemplateColumns: template, columnGap: 8, alignItems: "center", height: 24, padding: "0 12px", flex: "none",
                      borderBottom: `1px solid ${C.border}`, fontSize: 11.5, fontWeight: 500, letterSpacing: ".05em", textTransform: "uppercase", color: C.textMid }}>
          <span /><span /><span>{t("Module")} · {t("Charge")}</span>
          {FIT_COLS.map(c => (
            <span key={c.id} style={{ position: "relative", textAlign: "right", color: c.id === "cpu" ? resourceColor("cpu") : c.id === "pg" ? resourceColor("pg") : C.textMid }}>
              <span aria-hidden="true" onPointerDown={startResize(c.id)} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize}
                style={{ position: "absolute", left: -6, top: -4, bottom: -4, width: 8, cursor: "col-resize", touchAction: "none" }} />
              {t(c.label)}
            </span>
          ))}
          <span />
        </div>
        {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.secKey, menu.row)} onClose={() => setMenu(null)} />}
        <div tabIndex={0} onKeyDown={onKey} style={{ flex: 1, minHeight: 0, overflowY: "auto", outline: "none" }}>
          {SECS.map(sec => {
            const rows = getDisplayRows(sec.key);
            const fitted = (slots[sec.key] ?? []).filter(m => m?.typeID && !m.orphan && m.type !== "empty");
            const total = (slots[sec.key] ?? []).filter(m => !m?.orphan).length;
            const sum = (fn) => fitted.reduce((a, m) => a + (fn(m) ?? 0), 0);
            const cpuSum = sum(m => item(m.id)?.get?.("cpu")), pgSum = sum(m => item(m.id)?.get?.("power"));
            return (
              <div key={sec.key}>
                {/* Rack header: one colour for every rack (the handoff's rule), with its sums. */}
                <div style={{ display: "grid", gridTemplateColumns: template, columnGap: 8, alignItems: "center", height: 22, padding: "0 12px",
                              background: C.surfaceAlt, borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.textMid }}>
                  <span style={{ gridColumn: "1 / 4", fontWeight: 500, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden" }}>
                    {sec.label} <span style={{ fontWeight: 500 }}>{fitted.length} / {total}</span>
                  </span>
                  {sec.key === "rigs"
                    ? <span style={{ ...cell, gridColumn: "4 / 6", color: C.textMid }}>{t("Cal")} {num(cs?.calUsed ?? 0, 0)} / {num(cs?.calTotal ?? 0, 0)}</span>
                    : <><span style={{ ...cell, color: C.textMid }}>{num(cpuSum)}</span><span style={{ ...cell, color: C.textMid }}>{num(pgSum)}</span></>}
                  <span /><span /><span /><span /><span />
                </div>
                {rows.map((row, rowIdx) => {
                  if (row.type === "empty") return (
                    <div key={row.id} ref={el => { rowRefs.current[sec.key + ":" + rowIdx] = el; }}
                      onClick={() => setSel(new Set())} onDoubleClick={() => openEmpty(sec.key, row.id)} onContextMenu={e => openContext(e, sec.key, row)}
                      title={t("Double-click to add a module, or pick one in the Browser's Market")}
                      style={{ display: "grid", gridTemplateColumns: template, columnGap: 8, alignItems: "center", minHeight: 26, padding: "0 12px",
                               borderBottom: `1px solid ${C.border}99`, cursor: "default", color: C.textMid, fontSize: 13 }}>
                      <span /><span style={{ textAlign: "center", color: C.borderStrong }}>+</span>
                      <span style={{ gridColumn: "3 / -1" }}>{row.name}</span>
                    </div>
                  );
                  const e = engineStatsBySlotID.get(row.id);
                  const it = item(row.id);
                  const cpu = it?.get?.("cpu"), pg = it?.get?.("power");
                  const capNeed = it?.get?.("capacitorNeed"), dur = it?.get?.("duration") || it?.get?.("speed");
                  const running = row.state === "active" || row.state === "overheated";
                  const capS = running && capNeed > 0 && dur > 0 ? capNeed / (dur / 1000) : null;
                  const rng = rangeOf(e, row), info = infoOf(e);
                  const price = row.mutaplasmid ? null : priceOf(row.typeID);
                  const isDragSrc = dragUI?.secKey === sec.key && dragUI?.fromIdx === rowIdx;
                  const isDragOver = dragUI?.secKey === sec.key && dragUI?.overIdx === rowIdx && dragUI?.fromIdx !== rowIdx;
                  const charge = row.ammo ? row.ammo.replace(/\s*\(\d+\)$/, "") : null;
                  const isSel = sel.has(rowKey(sec.key, row.id));
                  const chargeHere = chargeOver === rowKey(sec.key, row.id);
                  const rowBg = row.orphan ? `${C.danger}14` : isDragOver || chargeHere ? C.accentLight : isSel ? C.accentLight : "transparent";
                  return (
                    <div key={row.rkey || row.id || row.name} ref={el => { rowRefs.current[sec.key + ":" + rowIdx] = el; }}
                      onClick={ev => clickRow(ev, sec.key, row, rows)} onContextMenu={ev => openContext(ev, sec.key, row)} {...rowDrop(sec.key, row)} {...rowReorder(sec.key, rowIdx)}
                      onDoubleClick={() => sec.key === "subsystems" ? openSubsystem(row) : removeMod(sec.key, row.id)} className="no-select"
                      aria-selected={isSel}
                      style={{ display: "grid", gridTemplateColumns: template, columnGap: 8, alignItems: "center", minHeight: 26, padding: "0 12px",
                               borderBottom: `1px solid ${isDragOver ? C.accent : row.orphan ? C.danger : `${C.border}99`}`, cursor: dragUI?.secKey === sec.key ? "grabbing" : "default",
                               opacity: isDragSrc ? 0.45 : 1, background: rowBg, boxShadow: isSel ? `inset 2px 0 0 ${C.accent}` : "none" }}
                      onMouseEnter={ev => { if (!row.orphan && !dragUI && !isSel) ev.currentTarget.style.background = C.surfaceAlt; }}
                      onMouseLeave={ev => { ev.currentTarget.style.background = rowBg; }}>
                      <span onClick={ev => ev.stopPropagation()} style={{ display: "flex", justifyContent: "center" }}>
                        {sec.key === "subsystems" ? null
                          : <StateToggle row={row} states={validStatesFor(row)} onSet={st => setRowState(sec.key, row, st)} />}
                      </span>
                      <span style={{ width: 20, height: 20, opacity: row.state === "offline" ? 0.4 : 1 }}>
                        {row.typeID && <img className="eve-icon" src={eveIcon(row.typeID, 32)} width={20} height={20} alt="" onError={ev => { ev.target.style.visibility = "hidden"; }} />}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: 13.5 }}>
                        {row.count > 1 && <span style={{ fontSize: 11.5, fontWeight: 500, color: C.textMid, flex: "none" }}>{row.count}×</span>}
                        {row.mutaplasmid && <span title={t("Abyssal (mutated) module")} style={{ fontSize: 10.5, fontWeight: 800, color: C.danger, border: `1px solid ${C.danger}`, borderRadius: 3, padding: "0 3px", flex: "none" }}>A</span>}
                        <span title={row.name} style={{ fontWeight: 500, color: row.orphan ? C.danger : row.state === "offline" ? C.textMid : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "0 1 auto", minWidth: 60 }}>
                          {sec.key === "subsystems" ? (row.name || "").replace(/^.+?\s-\s/, "") : row.name}
                        </span>
                        {row.state === "overheated" && <span style={{ fontSize: 11, fontWeight: 500, color: C.overheat, flex: "none" }}>{t("OH")}</span>}
                        {charge && <span title={`${charge} · ${row.charges}/${row.maxCharges}`} style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "0 1000 auto", minWidth: 24 }}>· {charge}</span>}
                        {charge && <button type="button" title={row.count > 1 ? t("Unload charge from all {n}", { n: row.count }) : t("Unload charge")}
                          onClick={ev => { ev.stopPropagation(); const ids = new Set(row.groupIds ?? [row.id]);
                            setSlots(prev => ({ ...prev, [sec.key]: prev[sec.key].map(m => ids.has(m.id) ? { ...m, ammo: null, charges: undefined, maxCharges: undefined } : m) })); }}
                          style={{ border: "none", background: "none", color: C.textMid, cursor: "pointer", padding: 0, fontSize: 12, flex: "none" }}>×</button>}
                      </span>
                      <span style={{ ...cell, color: resourceColor("cpu") }}>{cpu ? num(cpu) : ""}</span>
                      <span style={{ ...cell, color: resourceColor("pg") }}>{pg ? num(pg) : ""}</span>
                      <span style={{ ...cell, color: C.textMid }}>{capS != null ? num(capS, 2) : "—"}</span>
                      <span style={{ ...cell, color: C.rig }} title={rng?.heated ? `${t("OH")}: ${rng.heated} km` : undefined}>{typeof rng === "string" ? rng : rng?.text ?? ""}</span>
                      <span style={{ ...cell, color: info?.color ?? C.textMid }} title={info?.title ?? info?.text}>{info?.node ?? info?.text ?? ""}</span>
                      <span style={{ ...cell, color: C.textMid }} title={row.mutaplasmid ? t("Abyssal module — value depends on the roll, not the base type") : undefined}>{row.mutaplasmid ? "?" : isk(price)}</span>
                      <span onPointerDown={sec.key === "subsystems" ? undefined : startRowDrag(sec.key, rowIdx)} onPointerMove={moveRowDrag} onPointerUp={endRowDrag} onPointerCancel={endRowDrag}
                        onClick={ev => ev.stopPropagation()} title={t("Drag to reorder")}
                        style={{ cursor: sec.key === "subsystems" ? "default" : "grab", touchAction: "none", color: C.textMid, textAlign: "center", fontSize: 13 }}>{sec.key === "subsystems" ? "" : "≡"}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
}
