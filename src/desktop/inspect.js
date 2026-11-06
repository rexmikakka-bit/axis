// What an inspector window is looking at, and how it finds that thing again.
//
// A TARGET is a small serialisable description of one item — "the module in mid slot 4 of fit 17 on
// the Sleipnir", "drone stack 1730…", "Damage Control II from the market". It is what the app-wide
// selection holds, what a pinned inspector window stores in the saved layout (so it comes back after
// a restart), and what a popped-out inspector carries to another OS window. React-free and pure, so
// the regression suite pins the resolution rules.
//
// A fitted item is addressed by SLOT, not by type: swap a Gyrostabilizer II for a faction one from
// the Variations window and the window keeps showing that slot, which is what you were looking at.
// The pinned typeID is only a fallback for when the slot has since been emptied.
//
// Kinds:
//   module   {ship, fitId, fitName, sec, slot, typeID}   a fitted module (sec: high/mid/low/rigs/services/subsystems)
//   drone    {ship, fitId, fitName, id, typeID}          a drone stack
//   implant  {ship, fitId, fitName, slot, typeID}        implant slot 1–10
//   booster  {ship, fitId, fitName, id, typeID}
//   charge   {ship, fitId, fitName, sec, slot, typeID}   the charge LOADED in a fitted module: follows the
//                                                        slot, so reloading shows the new round
//   type     {typeID, rack?, roll?}                      any item by type: market, cargo, a charge, a variant

import { tidByName } from '../calc.js';

export const KINDS = ['module', 'drone', 'implant', 'booster', 'charge', 'type'];
export const SECS = ['high', 'mid', 'low', 'rigs', 'services', 'subsystems'];
const EMPTY_IMPLANT = '[Empty]';

const fitOf = (fitRef) => ({ ship: fitRef?.ship ?? null, fitId: fitRef?.fitId ?? null, fitName: fitRef?.fitName ?? null });

export const moduleTarget = (fitRef, sec, slot, typeID) => ({ kind: 'module', ...fitOf(fitRef), sec, slot, typeID: typeID ?? null });
export const chargeTarget = (fitRef, sec, slot, typeID) => ({ kind: 'charge', ...fitOf(fitRef), sec, slot, typeID: typeID ?? null });
const bareAmmo = (n) => String(n ?? '').replace(/\s*\(\d+\)$/, '');
export const droneTarget = (fitRef, id, typeID) => ({ kind: 'drone', ...fitOf(fitRef), id, typeID: typeID ?? null });
export const implantTarget = (fitRef, slot, typeID) => ({ kind: 'implant', ...fitOf(fitRef), slot, typeID: typeID ?? null });
export const boosterTarget = (fitRef, id, typeID) => ({ kind: 'booster', ...fitOf(fitRef), id, typeID: typeID ?? null });
// `roll` is an abyssal module that is not fitted anywhere (a saved roll, a MutaMarket contract, as the
// Variations list shows them): {name, mutaplasmid, mutations, abyssalItemId}. Its window shows THAT
// roll's numbers through the phone's abyssal info path, not the base module's.
export const typeTarget = (typeID, rack, roll) => ({ kind: 'type', typeID: Number(typeID), ...(rack ? { rack } : {}), ...(roll ? { roll } : {}) });
function cleanRoll(r) {
  if (!r || typeof r !== 'object' || !r.mutations || typeof r.mutations !== 'object') return null;
  const mutations = {};
  for (const [k, v] of Object.entries(r.mutations)) if (typeof v === 'number' && Number.isFinite(v)) mutations[k] = v;
  if (!Object.keys(mutations).length) return null;
  return { name: typeof r.name === 'string' ? r.name : null, mutaplasmid: typeof r.mutaplasmid === 'string' ? r.mutaplasmid : null,
           mutations, abyssalItemId: r.abyssalItemId ?? null };
}
const rollKey = (r) => r.abyssalItemId != null ? String(r.abyssalItemId) : Object.entries(r.mutations).sort().map(([k, v]) => `${k}=${v}`).join(',');

/** The active fit's identity: ship, the saved record's id, and its name. */
export function activeFitRef(fitsDB, activeFit) {
  if (!activeFit?.ship) return null;
  const rec = fitsDB?.[activeFit.ship]?.find(f => f.name === activeFit.fitName);
  return { ship: activeFit.ship, fitId: rec?.id ?? null, fitName: activeFit.fitName };
}

/** One string per item, so two windows on the same thing can be told apart from two on different ones. */
export function targetKey(t) {
  if (!t) return '';
  const fit = `${t.ship}#${t.fitId ?? t.fitName}`;
  switch (t.kind) {
    case 'module': return `m:${fit}:${t.sec}:${t.slot}`;
    case 'charge': return `c:${fit}:${t.sec}:${t.slot}`;
    case 'drone': return `d:${fit}:${t.id}`;
    case 'implant': return `i:${fit}:${t.slot}`;
    case 'booster': return `b:${fit}:${t.id}`;
    case 'type': return t.roll ? `t:${t.typeID}:r:${rollKey(t.roll)}` : `t:${t.typeID}`;
    default: return '';
  }
}

/** A target read back from storage or a URL: the same shape, or null if it isn't one. */
export function cleanTarget(raw) {
  if (!raw || typeof raw !== 'object' || !KINDS.includes(raw.kind)) return null;
  const tid = raw.typeID == null ? null : Number(raw.typeID);
  if (tid != null && !Number.isFinite(tid)) return null;
  if (raw.kind === 'type') return tid ? typeTarget(tid, typeof raw.rack === 'string' ? raw.rack : undefined, cleanRoll(raw.roll) ?? undefined) : null;
  if (typeof raw.ship !== 'string' || !raw.ship) return null;
  const fit = { ship: raw.ship, fitId: raw.fitId ?? null, fitName: typeof raw.fitName === 'string' ? raw.fitName : null };
  if (raw.kind === 'module') return SECS.includes(raw.sec) && raw.slot != null ? moduleTarget(fit, raw.sec, raw.slot, tid) : null;
  if (raw.kind === 'charge') return SECS.includes(raw.sec) && raw.slot != null ? chargeTarget(fit, raw.sec, raw.slot, tid) : null;
  if (raw.kind === 'implant') return Number.isInteger(raw.slot) && raw.slot >= 1 && raw.slot <= 10 ? implantTarget(fit, raw.slot, tid) : null;
  return raw.id != null ? (raw.kind === 'drone' ? droneTarget(fit, raw.id, tid) : boosterTarget(fit, raw.id, tid)) : null;
}

// The saved fit record a target names: by id when it has one (a rename keeps the window), else name.
function fitRecord(fitsDB, t) {
  const list = fitsDB?.[t.ship] ?? [];
  return (t.fitId != null ? list.find(f => f.id === t.fitId) : null) ?? (t.fitName != null ? list.find(f => f.name === t.fitName) : null) ?? null;
}

/**
 * Where a target's item is now. `s` is {fitsDB, activeFit, slots, drones, implants, boosters} — the
 * session's live values, which are ahead of fitsDB's autosaved copy for the active fit.
 *
 * Returns {status, item, typeID, name, live}:
 *   status 'ok'     the item is there; `live` says whether it is in the fit being edited (editable)
 *   status 'empty'  the slot or stack is gone; typeID/name fall back to what was pinned
 *   status 'nofit'  the fit itself was deleted
 */
export function resolveTarget(t, s) {
  if (!t) return { status: 'none', item: null, typeID: null, name: null, live: false };
  if (t.kind === 'type') {
    const roll = t.roll ? { typeID: t.typeID, name: t.roll.name, mutaplasmid: t.roll.mutaplasmid, mutations: t.roll.mutations, abyssalItemId: t.roll.abyssalItemId } : null;
    return { status: 'ok', item: roll, typeID: t.typeID, name: roll?.name ?? null, live: false };
  }
  const rec = fitRecord(s.fitsDB, t);
  const live = !!(s.activeFit && s.activeFit.ship === t.ship && (rec ? rec.name === s.activeFit.fitName : t.fitName === s.activeFit.fitName));
  if (!rec && !live) return { status: 'nofit', item: null, typeID: t.typeID, name: null, live: false };
  const src = live ? { slots: s.slots, drones: s.drones, implants: s.implants, boosters: s.boosters }
                   : { slots: rec.slots, drones: rec.drones, implants: rec.implants, boosters: rec.boosters };
  let item = null;
  if (t.kind === 'module' || t.kind === 'charge') item = (src.slots?.[t.sec] ?? []).find(m => m.id === t.slot) ?? null;
  // A charge is whatever that module has loaded now; `item` stays the module, which holds the slot.
  if (t.kind === 'charge') {
    const ammo = item?.ammo ? bareAmmo(item.ammo) : null;
    if (!ammo) return { status: 'empty', item: null, typeID: t.typeID, name: null, live };
    return { status: 'ok', item, typeID: tidByName(ammo) ?? t.typeID, name: ammo, live };
  }
  if (t.kind === 'drone') item = (src.drones ?? []).find(d => d.id === t.id) ?? null;
  if (t.kind === 'booster') item = (src.boosters ?? []).find(b => b.id === t.id) ?? null;
  if (t.kind === 'implant') item = (src.implants ?? []).find(i => i.slot === t.slot) ?? null;
  const vacant = !item || item.type === 'empty' || item.name === EMPTY_IMPLANT || (t.kind === 'module' && !item.typeID);
  if (vacant) return { status: 'empty', item: null, typeID: t.typeID, name: null, live };
  return { status: 'ok', item, typeID: item.typeID ?? t.typeID, name: item.name ?? null, live };
}

/**
 * Which tabs an inspector offers for a resolved target, in order. `info` always; Variations for
 * anything with a family; Mutate for a module or drone a mutaplasmid applies to (or already rolled);
 * Adaptation (an RAH) and Charge only for a fitted module, since they edit a slot.
 */
export function inspectorTabs(t, r, { mutable = false, takesCharges = false, rah = false } = {}) {
  if (!t || r.status === 'none') return [];
  const tabs = [];
  const editable = r.status === 'ok' && r.live;
  // No State tab: the state dot and the row's menu already set it, and Remove / Fill / Duplicate are
  // on the menu too (Owen, 2026-11-05). What only that tab had — a Reactive Armor Hardener's
  // adaptation — keeps a tab of its own.
  if (t.kind === 'module' && editable && t.sec !== 'subsystems') { if (rah) tabs.push('rah'); if (takesCharges) tabs.push('charge'); }
  if (t.kind === 'charge') return ['info'];
  tabs.push('info', 'variations');
  if ((t.kind === 'module' || t.kind === 'drone') && editable && (mutable || r.item?.mutaplasmid)) tabs.push('mutate');
  return tabs;
}
