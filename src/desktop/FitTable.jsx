import { createContext, Fragment, useContext, useEffect, useRef, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { eveIcon } from "../lib/icons.js";
import { TYPES, tidByName } from "../calc.js";
import { DMG, STATE_COLORS, STATE_GLOW, STATE_LABELS, MUTA_BY_TYPE, getCompatibleCharges, canLoadCharge, groupChargesForBrowser, gestureTarget, DOUBLE_TAP_MS } from "../lib/core.js";
import { metaOf } from "../lib/meta.js";
import { ContextMenu } from "./ContextMenu.jsx";
import { useInspect } from "./inspect-context.jsx";
import { moduleTarget, chargeTarget } from "./inspect.js";
import { useItems, useItemDrop, DropHint } from "./items-context.jsx";
import { currentDrag, draggedItem, isItemDrag, itemKind, chargePatch } from "./items.js";
import { resourceColor } from "../components/ui.jsx";
import { requestShipInfo } from "./kit.jsx";
import { abyssalGrade, mutaplasmidName } from "../lib/eft-export.js";
import { parsePastedModule, resolveItemLink, pastedSlot, moduleToText } from "../lib/abyssal-paste.js";
import { checkFitRestriction } from "../components/tabs.jsx";
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
// pyfa's Charge menu (right-click a module): every round the module takes, by family — the phone
// picker's own grouping (groupChargesForBrowser) — turret ammo LONG range at the top to SHORT at the
// bottom, and each family's grades in a flyout from less damage to more (T1, then the faction and navy
// versions). A family of one loads straight from the list. The loaded round is marked.
const chargeDamage = (tid) => { const a = TYPES[tid]?.attrs ?? TYPES[String(tid)]?.attrs ?? {};
  return (a.emDamage ?? 0) + (a.thermalDamage ?? 0) + (a.kineticDamage ?? 0) + (a.explosiveDamage ?? 0); };
export function chargeMenuItems(mod, loaded, onLoad) {
  const groups = groupChargesForBrowser(getCompatibleCharges(mod));
  if (!groups.length) return [];
  const turret = groups.some(g => g.range != null);
  // Longest reach first; families with no range multiplier (missiles, by damage type) keep their order.
  const ordered = turret ? [...groups].sort((a, b) => (b.range ?? -Infinity) - (a.range ?? -Infinity) || a.family.localeCompare(b.family)) : groups;
  const item = (c) => ({ label: c.name, icon: eveIcon(c.typeID, 32), checked: c.name === loaded, onSelect: () => onLoad(c) });
  const family = (g) => {
    const grades = [...g.items].sort((a, b) => chargeDamage(a.typeID) - chargeDamage(b.typeID) || a.name.localeCompare(b.name));
    if (grades.length === 1) return item(grades[0]);
    // The family's plain T1 round: the shortest-named T1. "Mjolnir Heavy Missile", not the "Mjolnir
    // Auto-Targeting Heavy Missile I" that shares its family and its meta and does less damage.
    const t1 = grades.filter(v => metaOf(v.typeID, "T1") === "T1");
    const face = (t1.length ? t1.reduce((a, b) => (b.name.length < a.name.length ? b : a)) : null) ?? grades[0];
    return { label: face.name, icon: eveIcon(face.typeID, 32), checked: grades.some(v => v.name === loaded),
             submenu: [{ heading: t("Less damage") }, ...grades.map(item), { heading: t("More damage") }] };
  };
  return [turret && { heading: t("Long range") }, ...ordered.map(family), turret && { heading: t("Short range") }].filter(Boolean);
}

function rangeOf(e, row) {
  if (!e) return null;
  const opt = e.optimal, fal = e.falloff;
  if (e.isWDFG) return `${Math.round((e.warpScrambleRange ?? 0) / 100) / 10} km`;
  if (!(opt > 0 || fal > 0)) return null;
  const heated = row.state !== "overheated" && e.heatedOptimal ? e.heatedOptimal : null;
  return { text: `${num(opt)}${fal > 0 ? ` + ${num(fal)}` : ""} km`, heated };
}
// A neut, nos or remote rep reads per second; a click on it switches every such row to per cycle
// ("600 GJ/24s") and back. One switch for the table, remembered, like the Resources bars'.
const PER_CYCLE_KEY = "axis_desk_info_percycle";
// Right-click Copy / Paste. Copy keeps the whole slot here (charge, state, roll) and writes its text
// to the system clipboard (the EFT line, or a roll's abyssal text) so it also pastes into pyfa or
// EVE. Paste uses the kept slot while the clipboard still holds what was copied, else reads the
// clipboard as a module in any form lib/abyssal-paste.js knows, an item link copied in EVE included.
// A copied roll leaves its abyssalItemId behind: the one rolled item cannot be fitted twice, but its
// roll can.
let deskClip = null;   // { text, secKey, slot }
function infoOf(e, perCycle) {
  if (!e) return null;
  if (e.strengthText && e.strengthCycleS) {
    const cycle = e.strengthText.replace(/ \([^)]*\/s\)$/, "");
    const rate = `${e.strengthPerSec} ${e.strengthPerSecUnit}/s`;
    return { text: perCycle ? cycle : rate, color: C.warning, toggle: true,
             title: `${perCycle ? rate : cycle} · ${t("click to show {what}", { what: perCycle ? t("per second") : t("per cycle") })}` };
  }
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
 * The state dot. pyfa's mouse bindings AND the phone's gestures, so it works for whichever one you
 * come from (Owen, 2026-11-06):
 *   click            running <-> idle: active <-> online, or online <-> offline for a module that
 *                    cannot be activated
 *   right-click      overheat, or cool back down to active         (pyfa)
 *   double-click     the same                                       (the phone's double-tap)
 *   ctrl-click       offline, or back online                        (pyfa)
 *   hold             the same                                       (the phone's hold)
 * Each only offers a state the module supports (validStatesFor), and goes through FitTab's own
 * setRowState, so a grouped row changes every module in its group as the phone's dot does.
 *
 * A double-click arrives as two clicks first, and the first has already run or stopped the module.
 * So the pair is resolved from the state BEFORE the first click (kept per row, outside React, as the
 * phone keeps its gesture memory: a state change can remount the row): active is overheated, and
 * overheated cools to active, rather than whatever the first click left. The double-click never
 * reaches the row, where it would unfit the module.
 */
const HOLD_MS = 450;
const lastDotClick = new Map();   // row id -> { at: event timeStamp, before: state before that click }
function StateToggle({ row, states, onSet }) {
  const has = (st) => states.includes(st);
  const cur = row.state ?? "online";
  const hold = useRef({ timer: null, fired: false });
  useEffect(() => () => clearTimeout(hold.current.timer), []);
  const set = (next, from) => { if (next && next !== from) onSet(next); };
  const down = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();   // not a row press: no row drag, no selection change
    hold.current.fired = false; clearTimeout(hold.current.timer);
    hold.current.timer = setTimeout(() => { hold.current.fired = true; lastDotClick.delete(row.id); set(gestureTarget(states, cur, "hold"), cur); }, HOLD_MS);
  };
  const cancelHold = () => clearTimeout(hold.current.timer);
  const click = (e) => {
    e.stopPropagation(); cancelHold();
    if (hold.current.fired) { hold.current.fired = false; return; }   // the hold already acted
    if (e.ctrlKey || e.metaKey) { lastDotClick.delete(row.id); if (has("offline")) onSet(cur === "offline" ? "online" : "offline"); return; }
    const prev = lastDotClick.get(row.id);
    if (prev && e.timeStamp - prev.at < DOUBLE_TAP_MS) {
      lastDotClick.delete(row.id);
      return set(gestureTarget(states, prev.before, "double"), cur);
    }
    lastDotClick.set(row.id, { at: e.timeStamp, before: cur });
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
    <button type="button" onClick={click} onContextMenu={context} onDoubleClick={e => e.stopPropagation()}
      onPointerDown={down} onPointerUp={cancelHold} onPointerLeave={cancelHold} onPointerCancel={cancelHold}
      title={`${STATE_LABELS[cur]?.() ?? cur} — ${t("click: on/off · double-click or right-click: overheat · hold or ctrl-click: offline")}`}
      aria-label={STATE_LABELS[cur]?.() ?? cur}
      style={{ width: 16, height: 16, padding: 0, border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center" }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: color, boxShadow: glow ? `0 0 ${glow}px ${color}` : "none",
                     transition: "background-color .18s ease, box-shadow .18s ease" }} />
    </button>
  );
}

export function FitTable({ api }) {
  const { hub, source, cols, setCols } = useContext(FitTableConfig);
    const { SECS, getDisplayRows, slots, setSlots, ship, cs, engineStatsBySlotID, validStatesFor,
            openMenu, openEmpty, openSubsystem, setRowState, startRowDrag, moveRowDrag, endRowDrag, dragUI, rowRefs,
            removeMod, duplicateMod, duplicateRoom, updateMod, hardpointRoom, fillHardpoints,
            undo, redo, undoDepth, redoDepth, grouped, setGrouped } = api;

    // ── Desktop mouse model: left click SELECTS (ctrl/cmd adds or removes one, shift extends within the
    // rack), double click UNFITS it (one module of a grouped row per double-click, so it can be repeated;
    // Undo brings it back), right click opens the context menu, with Show info; Delete removes the
    // selection, Escape clears it. The phone's tap-opens-the-sheet does not apply here.
    const insp = useInspect();
    // "Charge rows": each loaded charge on a row of its own under its module (an experiment to compare
    // with the charge-icon column). Remembered.
    const [chargeRows, setChargeRows] = useState(() => { try { return localStorage.getItem("axis_desk_charge_rows") === "1"; } catch { return false; } });
    const flipChargeRows = () => setChargeRows(v => { try { localStorage.setItem("axis_desk_charge_rows", v ? "0" : "1"); } catch { /* private mode */ } return !v; });
    const [chargeMenu, setChargeMenu] = useState(null);   // {x, y, secKey, row, unload}
    const [perCycle, setPerCycleState] = useState(() => { try { return localStorage.getItem(PER_CYCLE_KEY) === "1"; } catch { return false; } });
    const togglePerCycle = () => setPerCycleState(v => { try { localStorage.setItem(PER_CYCLE_KEY, v ? "0" : "1"); } catch { /* private mode */ } return !v; });
    const [blankMenu, setBlankMenu] = useState(null);     // {x, y}: right-click on the table's empty space
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
    const bareAmmo = (a) => (a ? a.replace(/\s*\(\d+\)$/, "") : null);
    // A round into this row's module, or every module of a grouped row (the phone charge tab's count rule).
    const loadInto = (secKey, row, c) => { const ids = new Set(row.groupIds ?? [row.id]);
      setSlots(prev => ({ ...prev, [secKey]: prev[secKey].map(m => ids.has(m.id) ? { ...m, ...chargePatch(m, c) } : m) })); };
    const unloadFrom = (secKey, row) => { const ids = new Set(row.groupIds ?? [row.id]);
      setSlots(prev => ({ ...prev, [secKey]: prev[secKey].map(m => ids.has(m.id) ? { ...m, ammo: null, charges: undefined, maxCharges: undefined } : m) })); };
    const SEC_NAME = { high: "high", mid: "mid", low: "low", rigs: "rig", services: "service" };
    const copyRow = (secKey, row) => {
      const src = (slots[secKey] ?? []).find(m => m.id === row.id);
      if (!src) return;
      const slot = { ...src }; delete slot.id; delete slot.orphan; delete slot.abyssalItemId;
      const text = moduleToText(slot);
      deskClip = { text, secKey, slot };
      navigator.clipboard?.writeText(text).catch(() => {});
    };
    const pasteInto = async (secKey, row) => {
      let text = "";
      try { text = (await navigator.clipboard?.readText()) ?? ""; } catch { /* no permission: fall back to what was copied here */ }
      let paste = deskClip && (!text || text === deskClip.text) ? { secKey: deskClip.secKey, slot: deskClip.slot } : null;
      if (!paste) {
        const p = parsePastedModule(text);
        if (!p) return items.notify(t("The clipboard doesn't hold a module"));
        let mod = p.mod;
        if (p.kind === "link") {
          items.notify(t("Reading the roll from EVE…"), 8000);
          try { mod = await resolveItemLink(p.link); } catch (e) { return items.notify(t("Couldn't read that item from EVE: {why}", { why: e?.message ?? "" }), 5000); }
        }
        paste = pastedSlot(ship, mod);
        if (!paste) return items.notify(t("{name} doesn't go in any rack this ship has", { name: mod.name }));
      }
      const { slot } = paste;
      if (paste.secKey !== secKey) return items.notify(t("{name} goes in a {rack} slot", { name: slot.name, rack: t(SEC_NAME[paste.secKey] ?? paste.secKey) }));
      const why = checkFitRestriction(slot.typeID, ship, slots.subsystems);
      if (why) return items.notify(why);
      // Into an empty slot it has to find a free hardpoint, and stay inside its group's limit, the
      // way Copy to an empty slot does; a module it replaces gives its own back.
      if (row.type === "empty" && duplicateRoom(secKey, slot) < 1) return items.notify(t("No free hardpoint or slot for {name}", { name: slot.name }));
      updateMod(secKey, row.id, slot, false, true, row.groupIds);
    };
    const clipboardItems = (secKey, row) => [
      row.type !== "empty" && { label: t("Copy"), onSelect: () => copyRow(secKey, row) },
      { label: t("Paste"), hint: deskClip ? deskClip.slot.name : undefined, onSelect: () => { pasteInto(secKey, row); } },
    ].filter(Boolean);
    const menuItems = (secKey, row) => {
      if (row.type === "empty") return [{ label: t("Add module…"), onSelect: () => openEmpty(secKey, row.id) }, { divider: true }, ...clipboardItems(secKey, row)];
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
        takesCharges && { label: t("Charge"), submenu: [
          ...chargeMenuItems(row, bareAmmo(row.ammo), c => loadInto(secKey, row, c)),
          row.ammo && { divider: true },
          row.ammo && { label: t("Unload"), danger: true, onSelect: () => unloadFrom(secKey, row) },
        ].filter(Boolean) },
        row.ammo && { label: t("Show charge info…"), onSelect: () => insp.inspect(chargeTarget(insp.fitRef, secKey, row.id), "info") },
        takesCharges && { divider: true },
        (TYPES[row.typeID] ?? TYPES[String(row.typeID)])?.gn === "Armor Resistance Shift Hardener" && { label: t("Adaptation…"), onSelect: () => inspectRow(secKey, row, "rah") },
        { label: t("Show info…"), onSelect: () => inspectRow(secKey, row, "info") },
        { label: t("Variations…"), onSelect: () => inspectRow(secKey, row, "variations") },
        mutable && { label: t("Mutate…"), onSelect: () => inspectRow(secKey, row, "mutate") },
        { divider: true },
        ...clipboardItems(secKey, row),
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
    // State dot, the LOADED CHARGE's icon, the module's icon, then the name and the stat columns. With
    // Charge rows on, the charge has a row of its own under its module instead, so its column goes.
    const template = `12px ${chargeRows ? "" : "20px "}20px minmax(0,1fr) ${widths.map(w => `${w}px`).join(" ")} 16px`;
    const lead = chargeRows ? 3 : 4;   // columns before the stat columns: dot, [charge], icon, name
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
          <button type="button" aria-pressed={chargeRows} onClick={flipChargeRows} title={t("Show each loaded charge on a row of its own under its module")}
            style={{ ...histBtn(true), color: chargeRows ? C.accent : C.textMid, background: chargeRows ? C.accentLight : "transparent", borderColor: chargeRows ? C.accent : C.borderStrong }}>{t("Charge rows")}</button>
          <button type="button" aria-pressed={grouped} onClick={() => setGrouped(g => !g)}
            style={{ ...histBtn(true), color: grouped ? C.accent : C.textMid, background: grouped ? C.accentLight : "transparent", borderColor: grouped ? C.accent : C.borderStrong }}>{t("Grouped")}</button>
        </div>
        {/* Column header */}
        <div style={{ display: "grid", gridTemplateColumns: template, columnGap: 8, alignItems: "center", height: 24, padding: "0 12px", flex: "none",
                      borderBottom: `1px solid ${C.border}`, fontSize: 11.5, fontWeight: 500, letterSpacing: ".05em", textTransform: "uppercase", color: C.textMid }}>
          <span /><span />{!chargeRows && <span />}<span>{chargeRows ? t("Module") : <>{t("Module")} · {t("Charge")}</>}</span>
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
        {blankMenu && <ContextMenu x={blankMenu.x} y={blankMenu.y} onClose={() => setBlankMenu(null)} items={[
          { heading: ship?.name }, { label: t("Ship info"), icon: ship?.typeID ? eveIcon(ship.typeID, 32) : undefined, onSelect: requestShipInfo }]} />}
        {chargeMenu && <ContextMenu x={chargeMenu.x} y={chargeMenu.y} onClose={() => setChargeMenu(null)} items={[
          ...chargeMenuItems(chargeMenu.row, bareAmmo(chargeMenu.row.ammo), c => loadInto(chargeMenu.secKey, chargeMenu.row, c)),
          { divider: true },
          { label: t("Show charge info…"), hint: t("double-click"), onSelect: () => insp.inspect(chargeTarget(insp.fitRef, chargeMenu.secKey, chargeMenu.row.id), "info") },
          { divider: true },
          { label: chargeMenu.row.count > 1 ? t("Unload charge from all {n}", { n: chargeMenu.row.count }) : t("Unload charge"), danger: true, onSelect: () => chargeMenu.unload() },
        ]} />}
        {/* Right-click below the slots: the hull's info, as tapping the hull icon on the phone. */}
        <div tabIndex={0} onKeyDown={onKey} style={{ flex: 1, minHeight: 0, overflowY: "auto", outline: "none" }}
          onContextMenu={(e) => { if (e.target !== e.currentTarget) return; e.preventDefault(); setBlankMenu({ x: e.clientX, y: e.clientY }); }}>
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
                  <span style={{ gridColumn: `1 / ${lead + 1}`, fontWeight: 500, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden" }}>
                    {sec.label} <span style={{ fontWeight: 500 }}>{fitted.length} / {total}</span>
                  </span>
                  {sec.key === "rigs"
                    ? <span style={{ ...cell, gridColumn: `${lead + 1} / ${lead + 3}`, color: C.textMid }}>{t("Cal")} {num(cs?.calUsed ?? 0, 0)} / {num(cs?.calTotal ?? 0, 0)}</span>
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
                      <span />{!chargeRows && <span />}<span style={{ textAlign: "center", color: C.borderStrong }}>+</span>
                      <span style={{ gridColumn: `${lead} / -1` }}>{row.name}</span>
                    </div>
                  );
                  const e = engineStatsBySlotID.get(row.id);
                  const it = item(row.id);
                  const cpu = it?.get?.("cpu"), pg = it?.get?.("power");
                  const capNeed = it?.get?.("capacitorNeed"), dur = it?.get?.("duration") || it?.get?.("speed");
                  const running = row.state === "active" || row.state === "overheated";
                  const capS = running && capNeed > 0 && dur > 0 ? capNeed / (dur / 1000) : null;
                  const rng = rangeOf(e, row), info = infoOf(e, perCycle);
                  const price = row.mutaplasmid ? null : priceOf(row.typeID);
                  const isDragSrc = dragUI?.secKey === sec.key && dragUI?.fromIdx === rowIdx;
                  const isDragOver = dragUI?.secKey === sec.key && dragUI?.overIdx === rowIdx && dragUI?.fromIdx !== rowIdx;
                  const charge = row.ammo ? row.ammo.replace(/\s*\(\d+\)$/, "") : null;
                  const isSel = sel.has(rowKey(sec.key, row.id));
                  const chargeHere = chargeOver === rowKey(sec.key, row.id);
                  const rowBg = row.orphan ? `${C.danger}14` : isDragOver || chargeHere ? C.accentLight : isSel ? C.accentLight : "transparent";
                  const unload = (ev) => { ev?.stopPropagation(); const ids = new Set(row.groupIds ?? [row.id]);
                    setSlots(prev => ({ ...prev, [sec.key]: prev[sec.key].map(m => ids.has(m.id) ? { ...m, ammo: null, charges: undefined, maxCharges: undefined } : m) })); };
                  const showCharge = () => insp.inspect(chargeTarget(insp.fitRef, sec.key, row.id), "info");
                  return (
                    <Fragment key={row.rkey || row.id || row.name}>
                    <div ref={el => { rowRefs.current[sec.key + ":" + rowIdx] = el; }}
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
                      {/* The loaded charge, so a rack's ammo reads at a glance down the column; click it for
                          the charge as the fit computes it (Show charge info). */}
                      {!chargeRows && <span style={{ width: 20, height: 20, opacity: row.state === "offline" ? 0.4 : 1 }}>
                        {charge && tidByName(charge) && <img className="eve-icon" src={eveIcon(tidByName(charge), 32)} width={20} height={20} alt={charge}
                          title={`${charge} · ${t("click for charge info")}`} style={{ cursor: "pointer" }}
                          onClick={ev => { ev.stopPropagation(); insp.inspect(chargeTarget(insp.fitRef, sec.key, row.id), "info"); }}
                          onDoubleClick={ev => ev.stopPropagation()} onError={ev => { ev.target.style.visibility = "hidden"; }} />}
                      </span>}
                      <span style={{ position: "relative", width: 20, height: 20, opacity: row.state === "offline" ? 0.4 : 1 }}>
                        {row.typeID && <img className="eve-icon" src={eveIcon(row.typeID, 32)} width={20} height={20} alt="" onError={ev => { ev.target.style.visibility = "hidden"; }} />}
                        {/* EVE's own abyssal mark: the red corner triangle its item icons carry, where
                            a T2 or faction item has its tech triangle. */}
                        {row.mutaplasmid && <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, width: 8, height: 8, background: C.danger, clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: 13.5 }}>
                        {row.count > 1 && <span style={{ fontSize: 11.5, fontWeight: 500, color: C.textMid, flex: "none" }}>{row.count}×</span>}
                        <span title={row.name} style={{ fontWeight: 500, color: row.orphan ? C.danger : row.state === "offline" ? C.textMid : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "0 1 auto", minWidth: 60 }}>
                          {sec.key === "subsystems" ? (row.name || "").replace(/^.+?\s-\s/, "") : row.name}
                        </span>
                        {/* Which roll: the mutaplasmid's grade (Decayed, Gravid, Unstable…), quiet beside
                            the name; the full mutaplasmid in its tooltip. */}
                        {row.mutaplasmid && <span title={t("Abyssal: {muta}", { muta: mutaplasmidName(row.mutaplasmid) ?? t("mutated module") })}
                          style={{ fontSize: 12, color: resourceColor("pg"), whiteSpace: "nowrap", flex: "none" }}>{abyssalGrade(row.mutaplasmid)}</span>}
                        {row.state === "overheated" && <span style={{ fontSize: 11, fontWeight: 500, color: C.overheat, flex: "none" }}>{t("OH")}</span>}
                        {charge && !chargeRows && <span title={`${charge} · ${row.charges}/${row.maxCharges}`} style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "0 1000 auto", minWidth: 24 }}>· {charge}</span>}
                        {charge && !chargeRows && <button type="button" title={row.count > 1 ? t("Unload charge from all {n}", { n: row.count }) : t("Unload charge")}
                          onClick={unload}
                          style={{ border: "none", background: "none", color: C.textMid, cursor: "pointer", padding: 0, fontSize: 12, flex: "none" }}>×</button>}
                      </span>
                      <span style={{ ...cell, color: resourceColor("cpu") }}>{cpu ? num(cpu) : ""}</span>
                      <span style={{ ...cell, color: resourceColor("pg") }}>{pg ? num(pg) : ""}</span>
                      <span style={{ ...cell, color: C.textMid }}>{capS != null ? num(capS, 2) : "—"}</span>
                      <span style={{ ...cell, color: C.rig }} title={rng?.heated ? `${t("OH")}: ${rng.heated} km` : undefined}>{typeof rng === "string" ? rng : rng?.text ?? ""}</span>
                      <span style={{ ...cell, color: info?.color ?? C.textMid, cursor: info?.toggle ? "pointer" : undefined }} title={info?.title ?? info?.text}
                        onClick={info?.toggle ? (ev => { ev.stopPropagation(); togglePerCycle(); }) : undefined}
                        onDoubleClick={info?.toggle ? (ev => ev.stopPropagation()) : undefined}>{info?.node ?? info?.text ?? ""}</span>
                      <span style={{ ...cell, color: C.textMid }} title={row.mutaplasmid ? t("Abyssal module — value depends on the roll, not the base type") : undefined}>{row.mutaplasmid ? "?" : isk(price)}</span>
                      <span onPointerDown={sec.key === "subsystems" ? undefined : startRowDrag(sec.key, rowIdx)} onPointerMove={moveRowDrag} onPointerUp={endRowDrag} onPointerCancel={endRowDrag}
                        onClick={ev => ev.stopPropagation()} title={t("Drag to reorder")}
                        style={{ cursor: sec.key === "subsystems" ? "default" : "grab", touchAction: "none", color: C.textMid, textAlign: "center", fontSize: 13 }}>{sec.key === "subsystems" ? "" : "≡"}</span>
                    </div>
                    {chargeRows && charge && (
                      // The loaded charge on a row of its own, hung under its module: double-click for
                      // its info, right-click to change or unload it. Not a slot, so it neither selects,
                      // reorders nor takes drops.
                      <div role="row" aria-label={t("Charge: {name}", { name: charge })}
                        onDoubleClick={showCharge} onContextMenu={ev => { ev.preventDefault(); setChargeMenu({ x: ev.clientX, y: ev.clientY, secKey: sec.key, row, unload }); }}
                        style={{ display: "grid", gridTemplateColumns: template, columnGap: 8, alignItems: "center", minHeight: 22, padding: "0 12px",
                                 borderBottom: `1px solid ${C.border}99`, background: `${C.surfaceAlt}66`, color: C.textMid, fontSize: 12.5,
                                 opacity: row.state === "offline" ? 0.5 : 1, cursor: "default" }}>
                        <span />
                        <span style={{ gridColumn: "2 / -1", display: "flex", alignItems: "center", gap: 7, minWidth: 0, paddingLeft: 10 }}>
                          <span aria-hidden="true" style={{ color: C.textMute, flex: "none" }}>↳</span>
                          {tidByName(charge) && <img className="eve-icon" src={eveIcon(tidByName(charge), 32)} width={16} height={16} alt="" style={{ flex: "none" }}
                            onError={ev => { ev.target.style.visibility = "hidden"; }} />}
                          <span title={charge} style={{ color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{charge}</span>
                          {row.charges != null && <span style={{ flex: "none", fontVariantNumeric: "tabular-nums" }}
                            title={row.count > 1 ? t("Charges per module") : t("Charges loaded")}>× {row.charges}{row.count > 1 ? ` ${t("each")}` : ""}</span>}
                          <button type="button" title={row.count > 1 ? t("Unload charge from all {n}", { n: row.count }) : t("Unload charge")} onClick={unload}
                            style={{ border: "none", background: "none", color: C.textMid, cursor: "pointer", padding: 0, fontSize: 12, flex: "none" }}>×</button>
                        </span>
                      </div>
                    )}
                    </Fragment>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
}
