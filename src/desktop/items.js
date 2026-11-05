import { TYPES, tidByName } from "../calc.js";
import { REAL_MODULE_BROWSER, REAL_STRUCTURE_MODULE_BROWSER, OFF_MARKET_MODULES, REAL_DRONE_BROWSER, FIGHTER_CATALOG,
         DRONE_FLIGHT, droneAddQty, cargoUnitVolume, canLoadCharge, IMPLANT_NAME_TO_SLOT, isBoosterName } from "../lib/core.js";
import { buildBoosterFromName } from "../components/effects.jsx";
import { t } from "../lib/i18n.js";

// What an item IS on a fit, and how it gets added — one place for the Browser's double-click and
// right-click, and for dragging an item onto a window. Every add rule here is the one the matching
// window already used (Drones, Fighters, Implants, Boosters, Cargo), moved out so the add works with
// that window closed, and so a drop and a double-click can never disagree. The windows call these too.
//
// Kinds: module (with its rack), charge, drone, fighter, implant, booster, ship, cargo. "cargo" is
// everything else — ore, salvage, a subsystem, a blueprint — and anything can also go in the hold.

/** The drag payload type: JSON {typeID, name}. Its own type, so a dragged file or text is ignored. */
export const ITEM_MIME = "application/x-axis-item";

const typeOf = (tid) => (tid == null ? null : TYPES[tid] ?? TYPES[String(tid)] ?? null);

// typeID -> {rack, mod}, from the same trees the module browser shows (plus the off-market modules
// the search reaches), so fitting from anywhere hands addMod the browser's own module entry.
let moduleIndex = null;
function moduleEntry(tid) {
  if (!moduleIndex) {
    moduleIndex = new Map();
    const walk = (nodes, rack) => { for (const n of nodes ?? []) { for (const m of n.mods ?? []) if (m.typeID != null && !moduleIndex.has(m.typeID)) moduleIndex.set(m.typeID, { rack, mod: m }); walk(n.children, rack); } };
    for (const [rack, tree] of Object.entries(REAL_MODULE_BROWSER)) walk(tree, rack);
    for (const [rack, tree] of Object.entries(REAL_STRUCTURE_MODULE_BROWSER)) walk(tree, rack);
    for (const [rack, mods] of Object.entries(OFF_MARKET_MODULES)) for (const m of mods ?? []) if (m.typeID != null && !moduleIndex.has(m.typeID)) moduleIndex.set(m.typeID, { rack, mod: m });
  }
  return moduleIndex.get(Number(tid)) ?? null;
}
let droneIndex = null;
const droneEntry = (tid) => {
  droneIndex ??= new Map(REAL_DRONE_BROWSER.flatMap(g => g.subGroups ? g.subGroups.flatMap(s => s.drones) : (g.drones ?? [])).map(d => [d.typeID, d]));
  return droneIndex.get(Number(tid)) ?? null;
};
let fighterIndex = null;
const fighterEntry = (tid) => {
  fighterIndex ??= new Map(Object.values(FIGHTER_CATALOG).flatMap(byRace => Object.values(byRace).flat()).map(f => [f.typeID, f]));
  return fighterIndex.get(Number(tid)) ?? null;
};

/** {kind, rack?, slot?} for an item {typeID, name}. */
export function itemKind(item) {
  const tid = item?.typeID ?? (item?.name ? tidByName(item.name) : null);
  const td = typeOf(tid), name = item?.name ?? td?.n ?? "";
  const c = td?.c ?? td?.category;
  if (c === 6) return { kind: "ship" };
  if (c === 18) return { kind: "drone" };
  if (c === 87) return { kind: "fighter" };
  if (c === 8) return { kind: "charge" };
  if (c === 20 || IMPLANT_NAME_TO_SLOT.has(name) || isBoosterName(name)) {
    if (isBoosterName(name)) return { kind: "booster" };
    const slot = IMPLANT_NAME_TO_SLOT.get(name) ?? td?.attrs?.implantness ?? td?.a?.implantness;
    if (slot) return { kind: "implant", slot: Number(slot) };
  }
  const m = tid != null ? moduleEntry(tid) : null;
  if (m) return { kind: "module", rack: m.rack };
  return { kind: "cargo" };
}

export const fighterAttrs = (f) => { const tid = f.typeID ?? (f.name ? tidByName(f.name) : null); return typeOf(tid)?.attrs ?? null; };
export const fighterClassOf = (f) => { const a = fighterAttrs(f); return a?.fighterSquadronIsHeavy ? "Heavy" : a?.fighterSquadronIsSupport ? "Support" : "Light"; };

// ── The add rules ──────────────────────────────────────────────────────────────────────────────

/**
 * The phone's DronesScreen rule: a new stack launches only if a whole flight fits the free bandwidth
 * and the free drone slots (droneAddQty), else it waits in the bay; a drone already in the bay gets
 * another flight. `cap` is {bw, max}: bandwidth and max active drones.
 */
export function addDrone(s, d, cap) {
  const drones = s.drones ?? [];
  const ex = drones.find(e => e.name === d.name && !e.mutaplasmid);
  if (ex) { s.setDrones(prev => (prev ?? []).map(e => e.id === ex.id ? { ...e, qty: e.qty + DRONE_FLIGHT } : e)); return; }
  const rec = typeOf(d.typeID ?? tidByName(d.name)), a = rec?.attrs ?? null;
  const bwOf = (x) => typeOf(x.typeID ?? tidByName(x.name))?.attrs?.droneBandwidthUsed ?? x.bandwidth ?? 5;
  const bwUsed = drones.filter(x => x.active).reduce((n, x) => n + x.qty * bwOf(x), 0);
  const inSpace = drones.filter(x => x.active).reduce((n, x) => n + x.qty, 0);
  const bandwidth = a?.droneBandwidthUsed ?? d.bandwidth ?? 5;
  const { qty, active } = droneAddQty({ bandwidth, bwFree: (cap?.bw ?? 0) - bwUsed, slotsFree: (cap?.max ?? 5) - inSpace });
  s.setDrones(prev => [...(prev ?? []), { id: Date.now(), name: d.name, size: d.size, qty, active, range: a?.maxRange ?? d.maxRange ?? d.range ?? 0, falloff: a?.falloff ?? d.falloff ?? 0,
    tracking: a?.trackingSpeed ?? d.tracking ?? 0, velocity: a?.maxVelocity ?? d.maxVelocity ?? d.velocity ?? 0, hp: a?.hp ?? d.hp ?? 0, dps: d.dps ?? 0,
    bandwidth, volume: a?.volume ?? d.volume ?? 5, typeID: d.typeID }]);
}

/**
 * The phone's fighter rule: a new squadron launches only with BOTH a free tube and a free slot of
 * its own class (launched squadrons count), else it waits in the bay. `shipFighter` is the hull's
 * {tubes, light, heavy, support}; `classOf(f, i)` may supply calcFitStats' class for fitted ones.
 */
export function addFighter(s, f, shipFighter, classOf = (x) => fighterClassOf(x)) {
  const fighters = s.fighters ?? [];
  const launched = { Light: 0, Heavy: 0, Support: 0 };
  fighters.forEach((x, i) => { if (x.active !== false) launched[classOf(x, i)] += x.qty ?? 1; });
  const tubesUsed = fighters.reduce((n, x) => n + (x.active !== false ? (x.qty ?? 1) : 0), 0);
  const cls = fighterClassOf(f);
  const free = ((shipFighter?.tubes ?? 0) - tubesUsed) > 0 && ((shipFighter?.[cls.toLowerCase()] ?? 0) - launched[cls]) > 0;
  s.setFighters(prev => [...(prev ?? []), { id: Date.now(), name: f.name, tier: f.tier, typeID: f.typeID, role: f.role || null, qty: 1, active: free, abilities: {} }]);
}

/** Into its own slot, replacing what is there (the phone's implant picker). */
export function addImplant(s, item, slot) {
  s.setImplants(prev => (prev ?? []).map(i => i.slot === slot ? { ...i, name: item.name, bonus: null } : i));
}

export function addBooster(s, name) { s.setBoosters(prev => [...(prev ?? []), buildBoosterFromName(name)]); }

/** As the phone's addItem: a second pick of the same item adds `qty` to its stack. */
export function addCargo(s, item, qty = 1) {
  s.setCargoItems(prev => {
    const list = prev ?? [];
    if (list.some(e => e.name === item.name)) return list.map(e => e.name === item.name ? { ...e, qty: e.qty + qty } : e);
    return [...list, { id: Date.now(), name: item.name, qty, vol: item.vol ?? cargoUnitVolume(item), icon: item.icon, typeID: item.typeID }];
  });
}

/** The slot patch the phone's charge tab writes: the round, and as many as the module holds. */
export function chargePatch(mod, charge) {
  const vol = typeOf(charge.typeID ?? tidByName(charge.name))?.attrs?.volume ?? 1;
  const cap = typeOf(mod.typeID)?.attrs?.capacity ?? 0;
  const nc = cap > 0 && vol > 0 ? Math.floor(cap / vol) : undefined;
  return { ammo: charge.name, charges: nc, maxCharges: nc };
}
/** Fitted modules that can load this charge, as [rackKey, index]. */
export function chargeTargets(slots, charge) {
  const out = [];
  for (const key of ["high", "mid", "low"]) (slots?.[key] ?? []).forEach((m, i) => { if (m?.typeID && m.type !== "empty" && canLoadCharge(m.typeID, charge.name)) out.push([key, i]); });
  return out;
}
/**
 * pyfa's double-click on a charge: load it into every fitted module that takes it, or only into the
 * modules whose ids are in `only` (a drop onto one row, or a grouped row's members). Returns the count.
 */
export function loadCharge(s, charge, only = null) {
  const ids = only ? new Set(only) : null;
  const targets = chargeTargets(s.slots, charge).filter(([k, i]) => !ids || ids.has(s.slots[k][i].id));
  if (!targets.length) return 0;
  s.setSlots(prev => {
    const next = { ...prev };
    for (const [key] of targets) if (next[key] === prev[key]) next[key] = (prev[key] ?? []).slice();
    for (const [key, i] of targets) next[key][i] = { ...next[key][i], ...chargePatch(next[key][i], charge) };
    return next;
  });
  return targets.length;
}

// ── Routing ────────────────────────────────────────────────────────────────────────────────────

/** Where an item goes by default, and the label that action reads as. */
export function defaultAction(item, { slots, hasFighters } = {}) {
  const k = itemKind(item);
  switch (k.kind) {
    case "module": return { to: "fitting", label: t("Fit") };
    case "charge": return chargeTargets(slots, item).length ? { to: "fitting", label: t("Load into compatible modules") } : { to: "cargo", label: t("Add to cargo") };
    case "drone": return hasFighters ? { to: "cargo", label: t("Add to cargo") } : { to: "drones", label: t("Add to drone bay") };
    case "fighter": return hasFighters ? { to: "fighters", label: t("Add to fighter bay") } : { to: "cargo", label: t("Add to cargo") };
    case "implant": return { to: "implants", label: t("Plug in") };
    case "booster": return { to: "boosters", label: t("Add booster") };
    case "ship": return { to: null, label: t("Show info") };
    default: return { to: "cargo", label: t("Add to cargo") };
  }
}

/** Which destinations can take this item. "cargo" takes anything but a ship. */
export function accepts(to, item, { hasFighters } = {}) {
  const k = itemKind(item).kind;
  switch (to) {
    case "fitting": return k === "module" || k === "charge";
    case "drones": return k === "drone" && !hasFighters;
    case "fighters": return k === "fighter" && !!hasFighters;
    case "implants": return k === "implant";
    case "boosters": return k === "booster";
    case "cargo": return k !== "ship";
    default: return false;
  }
}

/**
 * Add `item` to destination `to` (default: its own). `env` = {s, cs, shipFighter, fitModule(rack, mod),
 * only?} — `only` limits a charge to particular module ids (a drop onto one row). Returns a short
 * message for the banner, or null when nothing happened.
 */
export function addItem(env, item, to) {
  const { s, cs, shipFighter, fitModule } = env;
  const hasFighters = (shipFighter?.tubes ?? 0) > 0;
  const k = itemKind(item);
  to ??= defaultAction(item, { slots: s.slots, hasFighters }).to;
  if (!to || !accepts(to, item, { hasFighters })) return null;
  const tid = item.typeID ?? tidByName(item.name);
  switch (to) {
    case "fitting":
      if (k.kind === "charge") { const n = loadCharge(s, item, env.only); return n ? t("Loaded {name}", { name: item.name }) : t("Nothing fitted takes {name}", { name: item.name }); }
      fitModule?.(k.rack, moduleEntry(tid)?.mod ?? item);
      return null;
    case "drones": addDrone(s, { ...(droneEntry(tid) ?? {}), name: item.name, typeID: tid }, { bw: cs?.droneBandwidth ?? 0, max: cs?.maxActiveDrones ?? 5 }); return null;
    case "fighters": addFighter(s, { ...(fighterEntry(tid) ?? {}), name: item.name, typeID: tid }, shipFighter); return null;
    case "implants": addImplant(s, item, k.slot); return null;
    case "boosters": addBooster(s, item.name); return null;
    case "cargo": addCargo(s, { ...item, typeID: tid }); return t("Added {name} to cargo", { name: item.name });
    default: return null;
  }
}

// ── Drag and drop ──────────────────────────────────────────────────────────────────────────────

// The item being dragged, for highlighting a drop target while the drag is still over it: the
// browser only hands the payload over at drop time, and during dragover reveals just its type.
let dragging = null;
export const currentDrag = () => dragging;

/** Props for a draggable item row. */
export function dragProps(item) {
  return {
    draggable: true,
    onDragEnd: () => { dragging = null; },
    onDragStart: (e) => {
      dragging = { typeID: item.typeID ?? null, name: item.name };
      e.dataTransfer.setData(ITEM_MIME, JSON.stringify({ typeID: item.typeID ?? null, name: item.name }));
      e.dataTransfer.setData("text/plain", item.name);
      e.dataTransfer.effectAllowed = "copy";
    },
  };
}
// A saved FIT, dragged from the ship browser onto Projected or Command: its own payload type, so a
// fit is never offered to an item window or an item to a fit window. JSON {ship, fitName}.
export const FIT_MIME = "application/x-axis-fit";
let draggingFit = null;
export const currentFitDrag = () => draggingFit;
export function fitDragProps(ship, fitName) {
  return {
    draggable: true,
    onDragEnd: () => { draggingFit = null; },
    onDragStart: (e) => {
      draggingFit = { ship, fitName };
      e.dataTransfer.setData(FIT_MIME, JSON.stringify(draggingFit));
      e.dataTransfer.setData("text/plain", `${ship} · ${fitName}`);
      e.dataTransfer.effectAllowed = "copy";
    },
  };
}
export const draggedFit = (e) => { try { return JSON.parse(e.dataTransfer.getData(FIT_MIME) || "null"); } catch { return null; } };
export const isFitDrag = (e) => Array.from(e.dataTransfer?.types ?? []).includes(FIT_MIME);

export const draggedItem = (e) => { try { return JSON.parse(e.dataTransfer.getData(ITEM_MIME) || "null"); } catch { return null; } };
export const isItemDrag = (e) => Array.from(e.dataTransfer?.types ?? []).includes(ITEM_MIME);
