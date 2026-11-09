#!/usr/bin/env node
/**
 * resolve.mjs — turn parse.mjs's output into dogma data with real IDs.
 *
 *     node scripts/hoboleaks/resolve.mjs [--types 96144,95630,...] > scripts/hoboleaks/_patch.json
 *
 * Hoboleaks shows a new item's attributes by DISPLAY name, and several attributes can share one
 * ("Missile Damage Bonus" is five of them). Each label is resolved, in order, by:
 *   1. an attribute NAME (Hoboleaks prints the internal name when there is no display name),
 *   2. the one display-name candidate the item's own effects actually read (modifyingAttributeID),
 *   3. the one candidate other types in the same group carry in our bundle,
 *   4. a single candidate outright.
 * Anything left over is reported, never guessed. Effect names map to IDs through pyfa's eve.db
 * (scripts/hoboleaks/_evedb.json) and the diff's own new effects.
 *
 * Output: { types: {typeID: {name, group, groupID, attrs: {attrID: value}, effects: [effectID],
 *                    removedEffects: [effectID], unresolved: [[label, value, candidates]]}},
 *           effects: {effectID: {name, c, m}}, attrs: {attrID: {n, ...}} }
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const sisi = JSON.parse(fs.readFileSync(here('./_sisi.json'), 'utf8'));
const evedb = JSON.parse(fs.readFileSync(here('./_evedb.json'), 'utf8'));
const ROOT = here('../../');
const B_TYPES = JSON.parse(fs.readFileSync(ROOT + 'src/data/dogma-types.json', 'utf8'));
const B_EFFECTS = JSON.parse(fs.readFileSync(ROOT + 'src/data/dogma-effects.json', 'utf8'));
const B_ATTRS = JSON.parse(fs.readFileSync(ROOT + 'src/data/dogma-attrs.json', 'utf8'));

const want = (() => { const i = process.argv.indexOf('--types'); return i > 0 ? new Set(process.argv[i + 1].split(',').map(Number)) : null; })();

// Attribute tables: by internal name, by display name.
const byName = new Map(), byDisplay = new Map();
const addAttr = (id, name, display) => {
  if (name) byName.set(name, Number(id));
  if (display) { if (!byDisplay.has(display)) byDisplay.set(display, new Set()); byDisplay.get(display).add(Number(id)); }
};
for (const a of evedb.attrs) addAttr(a.id, a.name, a.display);
for (const [id, a] of Object.entries(B_ATTRS)) addAttr(id, a.n, null);
for (const [id, a] of Object.entries(sisi.attributes)) addAttr(id, a.fields.name ?? a.name, a.fields.displayName ?? null);
// Hoboleaks labels a handful of type columns by their own words.
const COLUMN = { Capacity: 38, Volume: 161, Mass: 4, radius: 162 };
// Type-level fields that are not dogma attributes at all.
const META = new Set(['quoteID', 'quoteAuthorID', 'designerIDs', 'wreckTypeID', 'certificateTemplate', 'isisGroupID', 'metaLevel', 'descriptionID', 'typeID', 'typeNameID', 'iconID', 'basePrice', 'metaGroupID', 'marketGroupID', 'portionSize',
  'published', 'groupID', 'isDynamicType', 'graphicID', 'soundID', 'raceID', 'factionID', 'sofFactionName', 'variationParentTypeID']);

// Effects: name -> id.
const effectId = new Map(Object.entries(evedb.effects).map(([n, id]) => [n, Number(id)]));
for (const [id, e] of Object.entries(sisi.effects)) effectId.set(e.fields.effectName ?? e.name, Number(id));
const effectMods = (id) => sisi.effects[id]?.fields?.modifierInfo ?? B_EFFECTS[id]?.m ?? [];

// Group name -> id, for the same-group lookup.
const groupIdByName = new Map(Object.entries(evedb.groups).map(([id, n]) => [n, Number(id)]));
const typesInGroup = (gid) => Object.values(B_TYPES).filter(t => t.g === gid);

// How many bundle types carry each attribute: the last tie-break, for a label several attributes
// share (a hull's "Structure EM Damage Resistance" is emDamageResonance on nearly every ship).
const popularity = new Map();
for (const t of Object.values(B_TYPES)) for (const id of Object.keys(t.a ?? {})) popularity.set(Number(id), (popularity.get(Number(id)) ?? 0) + 1);
// Words of a label or an attribute name, for matching a display label to a NEW attribute (the diff
// gives new attributes a displayNameID but no text): "Federation Navy Modules Fitted" ~ rigSetGallenteNavyBonus
// is matched through the item's own effects rather than words alone, see below.
const words = (s) => new Set(String(s).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2));
const NEW_ATTRS = new Map(Object.entries(sisi.attributes).filter(([, a]) => a.fields.attributeID != null).map(([id, a]) => [Number(id), a.fields.name]));

const out = { types: {}, effects: {}, attrs: {} };
const usedEffects = new Set();

for (const item of sisi.newItems) {
  if (want && !want.has(item.typeID)) continue;
  const groupID = item.attrs.find(([l]) => l === 'groupID')?.[1] ?? groupIdByName.get(item.group) ?? null;
  const te = sisi.typeEffects[item.typeID];
  const effects = (te?.added ?? []).map(n => effectId.get(n)).filter(x => x != null);
  const missingEffects = (te?.added ?? []).filter(n => !effectId.has(n));
  const reads = new Set(effects.flatMap(id => effectMods(id).flatMap(m => [m.modifyingAttributeID, m.domain === 'itemID' ? m.modifiedAttributeID : null]).filter(x => x != null)));
  const peers = groupID != null ? typesInGroup(groupID) : [];
  const t = { name: item.name, group: item.group, groupID, attrs: {}, effects, unresolved: [], missingEffects };
  const labelCount = new Map(); for (const [l] of item.attrs) labelCount.set(l, (labelCount.get(l) ?? 0) + 1);
  const pending = [];
  for (const [label, value] of item.attrs) {
    if (META.has(label)) continue;
    if (label === 'groupID') continue;
    let id = COLUMN[label] ?? byName.get(label) ?? null;
    if (id == null) {
      const known = [...(byDisplay.get(label) ?? [])];
      const lw = words(label);
      const newRead = [...NEW_ATTRS.keys()].filter(n => reads.has(n) && [...words(NEW_ATTRS.get(n))].filter(w => lw.has(w)).length >= 2);
      const cands = newRead.length && !known.some(c => reads.has(c)) ? newRead : known;
      // A label shown as often as it has candidates is each of them ("Rig Slots" twice: rigSlots
      // and upgradeSlotsLeft), all with the one value.
      if (cands.length > 1 && labelCount.get(label) === cands.length) { for (const c of cands) t.attrs[c] = value; continue; }
      const viaEffects = cands.filter(c => reads.has(c));
      const viaPeers = cands.filter(c => peers.some(p => p.a?.[c] != null));
      const byPop = [...cands].sort((a, b) => (popularity.get(b) ?? 0) - (popularity.get(a) ?? 0));
      const popular = byPop.length > 1 && (popularity.get(byPop[0]) ?? 0) > 10 * Math.max(1, popularity.get(byPop[1]) ?? 0) ? byPop[0] : null;
      id = viaEffects.length === 1 ? viaEffects[0] : viaPeers.length === 1 ? viaPeers[0] : cands.length === 1 ? cands[0] : popular;
      if (id == null) { if (!cands.length || cands.every(c => NEW_ATTRS.has(c))) pending.push([label, value]); else t.unresolved.push([label, value, cands]); continue; }
    }
    t.attrs[id] = value;
  }
  // Labels with no known attribute at all are new attributes: match each to a new attribute the
  // item's effects use and nothing has claimed yet, by the words they share. Ambiguity is reported.
  // Several labels can share most of their words ("Nosferatu and Energy Neutralizer Drain Amount Bonus"
  // and "... Overheat Bonus"), so they are matched together: every pending label against every free new
  // attribute, the strongest pair taken first, words matching on a shared stem (overheat ~ overheating).
  // A pair is scored by shared words over the attribute's own words, so a longer name only wins by
  // actually sharing more. A tie for the best remaining pair is reported, not broken.
  const free = new Set([...NEW_ATTRS.keys()].filter(id => reads.has(id) && t.attrs[id] == null));
  const share = (a, b) => { let k = 0; for (const x of a) for (const y of b) if (x === y || (x.length >= 5 && y.length >= 5 && (x.startsWith(y) || y.startsWith(x)))) { k++; break; } return k; };
  const left = new Map(pending.map(([l, v]) => [l, v]));
  while (left.size && free.size) {
    const pairs = [];
    for (const [l] of left) for (const id of free) {
      const aw = [...words(NEW_ATTRS.get(id))].filter(w => w !== 'rig'), k = share(words(l), aw);
      if (k) pairs.push([l, id, k / aw.length + k / 100]);
    }
    if (!pairs.length) break;
    pairs.sort((a, b) => b[2] - a[2]);
    if (pairs.length > 1 && pairs[0][2] === pairs[1][2] && (pairs[0][0] === pairs[1][0] || pairs[0][1] === pairs[1][1])) break;
    const [l, id] = pairs[0];
    t.attrs[id] = left.get(l); left.delete(l); free.delete(id);
  }
  for (const [l, v] of left) t.unresolved.push([l, v, [...free]]);
  for (const e of effects) usedEffects.add(e);
  out.types[item.typeID] = t;
}
// Effects the chosen types use that the diff defines (new or changed): their modifiers, and category.
for (const id of usedEffects) {
  const e = sisi.effects[id];
  if (e) out.effects[id] = { name: e.fields.effectName ?? e.name, c: e.fields.effectCategory ?? 0, m: e.fields.modifierInfo ?? [] };
}
for (const [id, a] of Object.entries(sisi.attributes)) if (a.fields.attributeID != null) out.attrs[id] = { n: a.fields.name, ...a.fields };

process.stdout.write(JSON.stringify(out, null, 1));
const unresolved = Object.values(out.types).filter(t => t.unresolved.length || t.missingEffects.length);
console.error(`${Object.keys(out.types).length} types · ${Object.keys(out.effects).length} diff-defined effects · ${Object.keys(out.attrs).length} new attributes · ${unresolved.length} types with something unresolved`);
for (const t of unresolved.slice(0, 40)) console.error(`  ${t.name}: ${t.unresolved.map(([l, v, c]) => `${l}=${v} [${c.join('|')}]`).join('; ')}${t.missingEffects.length ? ` · effects not found: ${t.missingEffects.join(', ')}` : ''}`);
