// The rules for editing a fitted module, as pure functions over a fit's `slots`.
//
// These lived inside the phone's FitTab, closed over its state, which meant the only thing in the
// app that could change a module's state, swap it for a variant or remove it was the Fitting tab
// itself. The desktop opens a module in windows of its own (Info, Variations, Mutaplasmid) that have
// to keep working with the Fitting window closed or popped out, so the rules moved here and both
// apps call the same code. React-free, so the regression suite pins them.
//
// `limits` is calcFitStats' `groupLimits`: the engine's maxGroupActive / maxGroupOnline /
// maxGroupFitted per market group, with the Command Ship and Command Processor bonuses folded in.

import { TYPES, tidByName, t3cSlotLayout } from '../calc.js';
import { isGroupableModule, canLoadCharge } from './core.js';
import { fittedAbyssalIds, variationRoll } from './variation-items.js';

// "[Empty <rack> Slot]" is a STORED sentinel, not display text: lib/core.js builds the same string
// and calc.js, esi-fits.js and the regression suite compare against it. It stays English.
const EMPTY_LABELS = { high: 'High', mid: 'Mid', low: 'Low', rigs: 'Rig', services: 'Service' };
export const emptySlotName = (secKey) => `[Empty ${EMPTY_LABELS[secKey]} Slot]`;

// A module stranded by a subsystem swap sits past the end of its rack flagged `orphan`. Freeing a real
// slot in that rack pulls the first one back in, so making room by deleting something else is enough
// to recover it — previously the only way was to delete the stranded module and re-add it by hand.
export const reabsorbOrphans = (arr) => {
  if (!arr.some(m => m.orphan)) return arr;
  const out = [...arr];
  for (;;) {
    const free = out.findIndex(m => !m.orphan && m.type === 'empty');
    const orph = out.findIndex(m => m.orphan);
    if (free < 0 || orph < 0) return out;
    out[free] = { ...out[orph], id: out[free].id, orphan: false };
    out.splice(orph, 1);
  }
};

// "How many of this group may run at once" — activating a second MWD shuts the first one off, and a
// Bifrost may only online ONE Skirmish Command Burst until Command Processor rigs raise the ceiling.
// Both are the SAME CCP mechanic (maxGroupActive / maxGroupOnline), so neither is special-cased here.
// Enforced in the UI rather than the engine so the fit the user sees is the fit that gets calculated.
//
// Every path that can put a module into a constrained state has to come through here: changing a
// module's state and fitting one into an empty slot are separate code paths, and only the first one
// used to check — which is how a second MWD could arrive already active.
const ACTIVE_STATES = new Set(['active', 'overheated']);
const ONLINE_STATES = new Set(['online', 'active', 'overheated']);

export const enforceGroupLimit = (slots, limits, changedId) => {
  const gnOf = m => TYPES[m?.typeID]?.gn;
  const racks = ['high', 'mid', 'low'];
  const changed = racks.flatMap(k => slots[k] ?? []).find(m => m.id === changedId);
  const gn = gnOf(changed);
  const lim = gn ? limits?.[gn] : null;
  if (!lim) return slots;
  const out = { ...slots };
  // Two independent ceilings, applied strongest-first: anything over the ONLINE cap goes offline, and
  // anything still over the ACTIVE cap drops back to online. The module the user just touched always
  // survives — it is the one they expressed intent about — so the demotions come out of the others,
  // oldest slot first.
  for (const [cap, states, demoteTo] of [[lim.online, ONLINE_STATES, 'offline'], [lim.active, ACTIVE_STATES, 'online']]) {
    if (!cap) continue;
    // The changed module only occupies a place if it is actually in the constrained state — setting
    // one burst OFFLINE must free its place rather than reserve it.
    let room = cap - (states.has(changed?.state) ? 1 : 0);
    for (const k of racks) {
      out[k] = (out[k] ?? []).map(m => {
        if (m.id === changedId || gnOf(m) !== gn || !states.has(m.state)) return m;
        if (room > 0) { room--; return m; }
        return { ...m, state: demoteTo };
      });
    }
  }
  return out;
};

// "How many of this group may be FITTED" (maxGroupFitted) is the third sibling of the two above, and
// the one that isn't a state ceiling: a hull takes one Damage Control however you set it, so there is
// nothing to demote and the add has to be refused outright. Rigs and service slots count too — Higgs
// Anchors and ~90 structure rig groups are capped this way.
//
// The cap comes from `limits`, which only knows a group once one of its modules is fitted — and that
// is sufficient, because with none fitted the count is zero and nothing can be over the cap.
const FITTED_RACKS = ['high', 'mid', 'low', 'rigs', 'services'];
export const groupFittedRoom = (slots, limits, typeID, exceptId) => {
  const gn = TYPES[typeID]?.gn;
  const cap = gn ? limits?.[gn]?.fitted : 0;
  if (!cap) return Infinity;
  let n = 0;
  for (const k of FITTED_RACKS) for (const m of slots[k] ?? []) {
    if (m.id !== exceptId && m.typeID && TYPES[m.typeID]?.gn === gn) n++;
  }
  return Math.max(0, cap - n);
};

/**
 * `slots` with the module `modId` in `secKey` merged with `updated`.
 *
 * - `replace` (a variant swap) from a grouped row swaps the whole rack, as its Remove button and
 *   state toggle do — replacing one member of a 5x row would silently split it into 4x + 1x. A
 *   specific abyssal roll is the exception: one physical item fills one slot.
 * - Loading a charge in a grouped high rack fans out to exactly the modules SHARING THAT DISPLAY
 *   ROW, matched on the key computeDisplayRows groups by: name, current ammo and state. Matching on
 *   name alone rewrote three deliberately different Javelin loads at once.
 * - A state change goes through enforceGroupLimit.
 * - An abyssal item already fitted elsewhere in this fit is refused (same slots back).
 */
export function applyModUpdate(prev, secKey, modId, updated, { replace = false, groupIds = null, grouped = true, limits } = {}) {
  const sec = [...(prev[secKey] ?? [])], idx = sec.findIndex(m => m.id === modId);
  if (idx < 0) return prev;
  if (updated.abyssalItemId && fittedAbyssalIds(prev, modId).has(updated.abyssalItemId)) return prev;
  if (replace && !updated.abyssalItemId && !updated.mutaplasmid && groupIds && groupIds.length > 1) {
    const ids = new Set(groupIds);
    return { ...prev, [secKey]: sec.map(m => ids.has(m.id) ? { ...m, ...updated, id: m.id } : m) };
  }
  if (grouped && secKey === 'high' && updated.ammo !== undefined && !replace && isGroupableModule(sec[idx])) {
    const origName = sec[idx].name, origAmmo = sec[idx].ammo, origState = sec[idx].state;
    return { ...prev, [secKey]: sec.map(m => m.name === origName && m.ammo === origAmmo && m.state === origState && isGroupableModule(m) ? { ...m, ...updated, id: m.id } : m) };
  }
  sec[idx] = { ...sec[idx], ...updated };
  if (updated.state !== undefined) return enforceGroupLimit({ ...prev, [secKey]: sec }, limits, modId);
  return { ...prev, [secKey]: sec };
}

/**
 * `slots` with every id in `groupIds` (or just `modId`) emptied. An ORPHAN leaves nothing behind —
 * the ship has no such slot — and a freed slot pulls the first orphan back in.
 */
export function applyRemove(prev, secKey, modId, groupIds) {
  const ids = new Set(groupIds && groupIds.length > 1 ? groupIds : [modId]);
  const arr = [];
  for (const m of prev[secKey] ?? []) {
    if (ids.has(m.id) && m.orphan) continue;
    arr.push(ids.has(m.id) ? { id: m.id, name: emptySlotName(secKey), icon: null, type: 'empty' } : m);
  }
  return { ...prev, [secKey]: reabsorbOrphans(arr) };
}

/** Every member of a display row set to `state`, through the group ceilings. */
export function applyRowState(prev, secKey, ids, state, limits, changedId = ids[0]) {
  const set = new Set(ids);
  const next = { ...prev, [secKey]: (prev[secKey] ?? []).map(m => set.has(m.id) ? { ...m, state } : m) };
  return enforceGroupLimit(next, limits, changedId);
}

/**
 * Where subsystem `typeID` goes on a fit of `shipName` with `subsystems` fitted: { slotId } of the
 * subsystem it replaces, { same: true } when it is already there, or { error } — a subsystem for a
 * different hull, or a fit with no subsystem slots. Its slot is its subSystemSlot attribute (125 core …
 * 128 propulsion), which also orders the fit's subsystems, so an empty slot is found by that index.
 */
export function subsystemSwapTarget(subsystems, typeID, shipName) {
  const a = TYPES[typeID]?.attrs ?? TYPES[typeID]?.a ?? {};
  const hull = shipName ? tidByName(shipName) : null;
  if (a.fitsToShipType != null && hull != null && Number(a.fitsToShipType) !== Number(hull)) return { error: 'hull' };
  const subs = subsystems ?? [];
  const slotOf = (x) => (TYPES[x?.typeID]?.attrs ?? TYPES[x?.typeID]?.a ?? {}).subSystemSlot;
  const target = subs.find(x => x?.typeID && slotOf(x) === a.subSystemSlot) ?? subs[Math.round(a.subSystemSlot ?? 0) - 125];
  if (!target) return { error: 'slot' };
  if (Number(target.typeID) === Number(typeID)) return { same: true };
  return { slotId: target.id };
}

/**
 * A T3 cruiser's subsystem `slotId` swapped for `sub`, and every rack re-laid out for the new
 * subsystem set: slots that still exist keep their modules, new ones arrive empty, and a module whose
 * slot went away is kept past the end flagged `orphan` (see reabsorbOrphans) rather than deleted.
 */
export function applySubsystemSwap(prev, slotId, sub) {
  const subs = [...(prev.subsystems ?? [])];
  const idx = subs.findIndex(s => s.id === slotId);
  if (idx >= 0) subs[idx] = { ...subs[idx], name: sub.name, typeID: sub.typeID, type: 'subsystem' };
  const layout = t3cSlotLayout(subs.filter(s => s.typeID));
  const isReal = m => m && m.typeID && m.type !== 'empty';
  const fit = (key, count) => {
    const cur = prev[key] ?? [];
    const out = [];
    for (let i = 0; i < count; i++)
      out.push(cur[i] ? { ...cur[i], orphan: false } : { id: `${key[0]}${i}`, name: emptySlotName(key), icon: null, type: 'empty' });
    for (let i = count; i < cur.length; i++) if (isReal(cur[i])) out.push({ ...cur[i], orphan: true });
    return out;
  };
  return { ...prev, subsystems: subs, high: fit('high', layout.hiSlots), mid: fit('mid', layout.medSlots), low: fit('low', layout.lowSlots), rigs: fit('rigs', layout.rigSlots) };
}

/**
 * The update that swaps fitted module `mod` for variant `v` (a stock variant or an abyssal roll):
 * - a variant that cannot load the current charge unloads it, as pyfa's module replace does
 *   (localReplace.py) — Hail is legal in a 425mm AutoCannon II and not in a 425mm AutoCannon I;
 * - the charge count is recomputed, since variants can have different bays (cap boosters);
 * - the roll and its ownership travel with `v`, and are explicitly CLEARED for a stock variant,
 *   including the unmutated row of the fitted type.
 */
export function variantSwapPatch(mod, v) {
  const ammo = mod.ammo && v.typeID && !canLoadCharge(v.typeID, mod.ammo) ? undefined : mod.ammo;
  let nc = ammo ? mod.charges : undefined;
  if (ammo && v.typeID) {
    const newTd = TYPES[v.typeID] ?? TYPES[String(v.typeID)];
    const cap = newTd?.attrs?.capacity ?? 0;
    const cTid = tidByName((mod.ammo || '').replace(/\s*\(\d+\)$/, ''));
    const vol = cTid ? (TYPES[cTid]?.attrs?.volume ?? 1) : 1;
    nc = cap > 0 && vol > 0 ? Math.floor(cap / vol) : undefined;
  }
  return { name: v.name, typeID: v.typeID, state: mod.state, ammo, charges: nc, maxCharges: nc, ...variationRoll(v) };
}
