// Pasting ONE module, abyssal or not, in any of the forms it arrives in. Shared by the phone's
// module-search paste, the desktop's Ctrl+V and the Fitting window's right-click Paste.
//
//   1. The MutaMarket / pyfa text (pyfa's service/port/muta.py renderMutant), three lines:
//        Stasis Webifier II
//        Unstable Stasis Webifier Mutaplasmid
//        maxRange 14280.6, speedFactor -62.7
//   2. EVE's own form. Copying a mutated item in the game gives an ITEM LINK, not its numbers:
//        <url=showinfo:47702//1043512345678>Abyssal Stasis Webifier</url>
//      typeID is the abyssal type, itemID the one rolled item. Its roll lives with CCP, so it is read
//      from ESI's public /dogma/dynamic/items endpoint (no login), exactly as pyfa's
//      parseDynamicItemString / fetchDynamicItem do and as the My Abyssals import already does. This
//      is the form that "didn't work": Axis only ever read the text form.
//   3. A plain module, as an EFT line: "Warp Scrambler II" or "425mm AutoCannon II, Republic Fleet EMP M".
//
// The parse is an EFT-import module entry ({name, typeID, slot, charge?, state?, mutaplasmid?,
// mutations?, abyssalItemId?}); pastedSlot() turns it into a real slot through buildSlotsFromEFT, the
// path an EFT import takes, so a pasted module gets its type, default state and charge count exactly
// as an imported one does.

import { TYPES, tidByName } from '../calc.js';
import { MUTA_BY_NAME, buildSlotsFromEFT, guessSlotFromDogma, mutaAttrRanges } from './core.js';
import mutaplasmids from '../data/mutaplasmids.json' with { type: 'json' };
import { dynamicItemToModule } from './abyssal-library.js';
import { publicJSON } from './abyssal-import.js';

/** Form 1, the MutaMarket/pyfa text. Null when it is not one. */
export function parseAbyssalText(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) return null;
  const baseName = lines[0], mutaName = lines[1];
  const baseTid = tidByName(baseName); if (!baseTid) return null;
  const mutaID = MUTA_BY_NAME[mutaName.toLowerCase()]; if (!mutaID) return null;
  const mutations = {};
  for (const part of lines.slice(2).join(', ').split(',')) {
    const mt = part.trim().match(/^([A-Za-z][A-Za-z0-9]*)\s+(-?[\d.]+(?:e-?\d+)?)/i);
    if (mt) mutations[mt[1]] = Number(mt[2]);
  }
  if (!Object.keys(mutations).length) return null;
  return { name: baseName, typeID: baseTid, slot: guessSlotFromDogma(baseTid), mutaplasmid: mutaID, mutations };
}

/** Form 2, EVE's item link: {typeID, itemID}, or null. */
export function parseItemLink(text) {
  const m = /showinfo:(\d+)\/\/(\d+)/.exec(String(text ?? ''));
  return m ? { typeID: Number(m[1]), itemID: Number(m[2]) } : null;
}

/** A pasted item link's rolled module, read from ESI. Throws with a readable message. */
export async function resolveItemLink({ typeID, itemID }, { signal, fetchJSON = publicJSON } = {}) {
  const dynamic = await fetchJSON(`/dogma/dynamic/items/${typeID}/${itemID}/`, signal);
  const m = dynamicItemToModule({ type_id: typeID, item_id: itemID, location_id: 0 }, dynamic, { characterId: null, characterName: '' }, '');
  return { name: m.name, typeID: m.typeID, slot: guessSlotFromDogma(m.typeID), mutaplasmid: m.mutaplasmid, mutations: m.mutations, abyssalItemId: m.itemId };
}

const OFFLINE_TAG = /\s+\/OFFLINE$/i;
/** Form 3, one EFT module line (optionally ", Charge", optionally " /OFFLINE"). Null when it is not a module. */
export function parseModuleLine(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length !== 1 || lines[0].startsWith('[')) return null;
  const offline = OFFLINE_TAG.test(lines[0]);
  const [name, ammo] = lines[0].replace(OFFLINE_TAG, '').split(/\s*,\s*/);
  const tid = tidByName(name);
  const cat = TYPES[tid]?.c;
  if (!tid || (cat !== 7 && cat !== 66)) return null;
  return { name, typeID: tid, slot: guessSlotFromDogma(tid), ...(ammo && tidByName(ammo) ? { charge: ammo } : {}), ...(offline ? { state: 'offline' } : {}) };
}

/**
 * What `text` is, as one module: {kind:'module', mod} at once, {kind:'link', link} to resolve with
 * resolveItemLink (it needs the network), or null when it is none of the three forms.
 */
export function parsePastedModule(text) {
  const link = parseItemLink(text);
  if (link) return { kind: 'link', link };
  const abyssal = parseAbyssalText(text);
  if (abyssal) return { kind: 'module', mod: abyssal };
  const plain = parseModuleLine(text);
  return plain ? { kind: 'module', mod: plain } : null;
}

/**
 * A parsed module as a fitted slot for `ship`: {secKey, slot} (the slot without an id), or null when
 * the hull has no rack it goes in. Built through buildSlotsFromEFT, so type, default state and
 * charge count come out as an EFT import's do.
 */
export function pastedSlot(ship, mod) {
  if (!ship || !mod?.typeID) return null;
  const built = buildSlotsFromEFT(ship, [mod]);
  for (const secKey of ['high', 'mid', 'low', 'rigs', 'services', 'subsystems']) {
    const hit = (built?.[secKey] ?? []).find(x => x?.typeID === mod.typeID);
    if (!hit) continue;
    const slot = { ...hit };
    delete slot.id;
    if (mod.abyssalItemId) slot.abyssalItemId = mod.abyssalItemId;
    return { secKey, slot };
  }
  return null;
}

/**
 * A slot's module as clipboard text: form 1 when it is rolled (what the phone's Mutaplasmid "Copy"
 * writes, and what pyfa and MutaMarket read), else its EFT line. Either pastes back here.
 */
export function moduleToText(mod) {
  const muta = mod?.mutaplasmid ? mutaplasmids[mod.mutaplasmid] : null;
  if (muta) {
    const pairs = mutaAttrRanges(mod.mutaplasmid, mod.typeID).map(r => `${r.name} ${mod.mutations?.[r.name] ?? r.base}`).join(', ');
    return `${TYPES[mod.typeID]?.n ?? mod.name}\n${muta.n}\n${pairs}`;
  }
  const ammo = mod?.ammo ? mod.ammo.replace(/\s*\(\d+\)$/, '') : null;
  return `${mod?.name ?? ''}${ammo ? `, ${ammo}` : ''}${mod?.state === 'offline' ? ' /OFFLINE' : ''}`;
}
