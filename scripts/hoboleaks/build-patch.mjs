#!/usr/bin/env node
/**
 * build-patch.mjs — the pre-release data Axis ships, generated from a Hoboleaks TQ→SiSi diff.
 *
 *     curl -sL https://www.hoboleaks.space/ -o scripts/hoboleaks/_page.html
 *     node scripts/hoboleaks/parse.mjs scripts/hoboleaks/_page.html > scripts/hoboleaks/_sisi.json
 *     node scripts/hoboleaks/resolve.mjs > scripts/hoboleaks/_patch.json
 *     node scripts/hoboleaks/build-patch.mjs          # writes src/data/sisi-patch.json
 *
 * Writes, in the dogma bundle's own shapes (src/data/dogma-*.json):
 *   types       the new types Axis carries ahead of its data (the list below), complete
 *   addToTypes  additions to types the bundle already has: the Synchronizer set markers on faction
 *               modules, and the effects the Oracle Navy Issue gains
 *   effects     the new or changed effects those use;  attrs  the new attributes they use
 *   descriptions, traits   for the info sheet
 * src/data/sisi-patch.js applies it before initEngine(). Refuses to write when a chosen type has an
 * attribute it could not resolve or an effect it cannot find — fix resolve.mjs, never guess.
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const ROOT = here('../../');
const sisi = JSON.parse(fs.readFileSync(here('./_sisi.json'), 'utf8'));
const evedb = JSON.parse(fs.readFileSync(here('./_evedb.json'), 'utf8'));
const B_TYPES = JSON.parse(fs.readFileSync(ROOT + 'src/data/dogma-types.json', 'utf8'));
const B_EFFECTS = JSON.parse(fs.readFileSync(ROOT + 'src/data/dogma-effects.json', 'utf8'));
const B_ATTRS = JSON.parse(fs.readFileSync(ROOT + 'src/data/dogma-attrs.json', 'utf8'));

// What Axis carries ahead of its data, by name (a whole family where it says so).
const WANT = [
  /^(Small|Medium|Large) .+ Synchronizer$/,
  /^Synchronization Rigging$/,
  /^(Naga Navy Issue|Talos Navy Issue|Tornado Fleet Issue)$/,
  /^Vigilant Tyrannos 'Xyston' .+-1020$/,
  /^Imperial Navy (Stasis Webifier|Warp Scrambler|Warp Disruptor)$/,
  /^'Vigilant' Vital /,
  /^SARO (Monitoring|Pursuit|Forensic|Enforcement) Booster$/,
];
// Category per group, for the groups the bundle does not know yet (Synchronizers, rigging implants).
const NEW_GROUP_CATEGORY = { 'Rig Synchronizer': 7, 'Cyber Rigging': 20 };

const P = JSON.parse(fs.readFileSync(here('./_patch.json'), 'utf8'));
const picked = sisi.newItems.filter(i => WANT.some(re => re.test(i.name)));
// resolve.mjs output for exactly these (rerun so the patch never depends on an old --types list).
const ids = picked.map(i => i.typeID);
const resolved = Object.fromEntries(Object.entries(P.types).filter(([id]) => ids.includes(Number(id))));
const missingResolve = ids.filter(id => !resolved[id]);
if (missingResolve.length) { console.error(`resolve.mjs has not run for: ${missingResolve.join(', ')} — run it without --types`); process.exit(1); }

const skillName = (id) => B_TYPES[id]?.n ?? picked.find(i => i.typeID === id)?.name ?? null;
const catOfGroup = (gid, gname) => Object.values(B_TYPES).find(t => t.g === gid)?.c ?? NEW_GROUP_CATEGORY[gname] ?? null;
const out = { source: { build: sisi.build, generated: sisi.generated }, types: {}, addToTypes: {}, effects: {}, attrs: {}, info: {}, descriptions: {}, traits: {} };
const problems = [];
// Labels with no fitting meaning that do not resolve to one attribute: left out, never guessed.
const SKIP_UNRESOLVED = new Set(['Ansiblex Activation Cost', 'Virus Coherence Bonus']);

for (const item of picked) {
  const r = resolved[item.typeID];
  const unresolved = r.unresolved.filter(([l]) => !SKIP_UNRESOLVED.has(l));
  if (unresolved.length) problems.push(`${item.name}: unresolved ${JSON.stringify(unresolved)}`);
  if (r.missingEffects.length) problems.push(`${item.name}: effects not found ${r.missingEffects.join(', ')}`);
  const c = catOfGroup(r.groupID, r.group);
  if (c == null) problems.push(`${item.name}: no category for group ${r.groupID} ${r.group}`);
  const a = Object.fromEntries(Object.entries(r.attrs).map(([k, v]) => [k, v]));
  const rs = [182, 183, 184].map(k => a[k]).filter(Boolean).map(skillName).filter(Boolean);
  const meta = item.attrs.find(([l]) => l === 'metaGroupID')?.[1];
  const level = item.attrs.find(([l]) => l === 'Meta Level' || l === 'metaLevel')?.[1];
  out.types[item.typeID] = { n: item.name, g: r.groupID, gn: r.group, c, a, e: r.effects, rs,
    ...(meta != null && { mg: meta }), ...(typeof level === 'number' && { ml: level }) };
  // Type-level fields the dogma shape has no room for, for the module list and the art:
  // iconID, market group ("3876 (Medium)"), variation parent, and implant/booster slot.
  const raw = (l) => item.attrs.find(([k]) => k === l)?.[1];
  const mkt = /^(\d+) \((.*)\)$/.exec(String(raw('marketGroupID') ?? ''));
  out.info[item.typeID] = { icon: raw('iconID') ?? null, market: mkt ? [Number(mkt[1]), mkt[2]] : null,
    parent: raw('variationParentTypeID') ?? null, slot: raw('Implant Slot') ?? raw('Booster Slot') ?? null };
  if (item.description) out.descriptions[item.typeID] = item.description;
  const b = sisi.bonuses[item.typeID];
  if (b) out.traits[item.typeID] = b.lines;
}

// Existing types the diff changes in ways those new types depend on: the Synchronizer set marker
// (rigSet*Module = 1) and its effect on every faction module, and the Oracle Navy Issue's new effects.
const effectId = new Map(Object.entries(evedb.effects).map(([n, id]) => [n, Number(id)]));
for (const [id, e] of Object.entries(sisi.effects)) effectId.set(e.fields.effectName ?? e.name, Number(id));
const attrIdByName = new Map(evedb.attrs.map(a => [a.name, a.id]));
for (const [id, a] of Object.entries(sisi.attributes)) if (a.fields.name) attrIdByName.set(a.fields.name, Number(id));
for (const [tid, t] of Object.entries(sisi.typeAttribs)) {
  const marks = t.changes.filter(([l]) => /^rigSet.*Module$/.test(l));
  if (!marks.length || !B_TYPES[tid]) continue;
  const te = sisi.typeEffects[tid];
  out.addToTypes[tid] = { n: t.name,
    a: Object.fromEntries(marks.map(([l, , v]) => [attrIdByName.get(l), v])),
    e: (te?.added ?? []).filter(n => /SetRigGroup$/.test(n)).map(n => effectId.get(n)) };
}
// The Oracle Navy Issue is on TQ already but not in our bundle: sisi-patch.js gives it our stat-card
// attributes (data/sisi-patch.js) under its real typeID, with these real effects.
const oracle = Object.entries(sisi.typeEffects).find(([, t]) => t.name === 'Oracle Navy Issue');
if (oracle) out.oracleNavyIssue = { typeID: Number(oracle[0]), e: oracle[1].added.map(n => effectId.get(n)) };

// Effects and attributes the above use that the bundle does not have (or that the diff changed).
const usedEffects = new Set([...Object.values(out.types).flatMap(t => t.e), ...Object.values(out.addToTypes).flatMap(t => t.e), ...(out.oracleNavyIssue?.e ?? [])]);
for (const id of usedEffects) {
  if (id == null) { problems.push('an effect name did not resolve to an ID'); continue; }
  const e = sisi.effects[id];
  if (e) out.effects[id] = { c: e.fields.effectCategory ?? 0, m: e.fields.modifierInfo ?? [] };
  else if (!B_EFFECTS[id]) problems.push(`effect ${id} is in neither the bundle nor the diff`);
}
const usedAttrs = new Set([...Object.values(out.types).flatMap(t => Object.keys(t.a).map(Number)), ...Object.values(out.addToTypes).flatMap(t => Object.keys(t.a).map(Number)),
  ...Object.values(out.effects).flatMap(e => e.m.flatMap(m => [m.modifiedAttributeID, m.modifyingAttributeID]))]);
for (const id of usedAttrs) {
  if (B_ATTRS[id]) continue;
  const a = sisi.attributes[id]?.fields;
  if (a?.attributeID != null) out.attrs[id] = { n: a.name, s: a.stackable ?? 1, h: a.highIsGood ?? 1, d: a.defaultValue ?? 0 };
  else problems.push(`attribute ${id} is in neither the bundle nor the diff`);
}

if (problems.length) { console.error('Not written:\n  ' + problems.join('\n  ')); process.exit(1); }
fs.writeFileSync(ROOT + 'src/data/sisi-patch.json', JSON.stringify(out));
console.error(`sisi-patch.json: build ${sisi.build} · ${Object.keys(out.types).length} new types · ${Object.keys(out.addToTypes).length} existing types amended · ${Object.keys(out.effects).length} effects · ${Object.keys(out.attrs).length} attributes`);
