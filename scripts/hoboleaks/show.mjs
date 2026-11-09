#!/usr/bin/env node
// show.mjs <name substring> — print resolved types from _patch.json readably: attributes by name,
// effects with their modifiers (attribute names, not IDs). For checking a pre-release model by eye.
import fs from 'fs';
import { fileURLToPath } from 'url';
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const P = JSON.parse(fs.readFileSync(here('./_patch.json'), 'utf8'));
const evedb = JSON.parse(fs.readFileSync(here('./_evedb.json'), 'utf8'));
const B_EFFECTS = JSON.parse(fs.readFileSync(here('../../src/data/dogma-effects.json'), 'utf8'));
const aName = new Map(evedb.attrs.map(a => [a.id, a.name]));
for (const [id, a] of Object.entries(P.attrs)) aName.set(Number(id), a.n);
const eName = new Map(Object.entries(evedb.effects).map(([n, id]) => [Number(id), n]));
for (const [id, e] of Object.entries(P.effects)) eName.set(Number(id), e.name);
const skill = (id) => evedb.attrs && id ? `skill ${id}` : '';
const mods = (id) => P.effects[id]?.m ?? B_EFFECTS[id]?.m ?? null;
const fmtMod = (m) => `${m.func}${m.groupID ? `[group ${m.groupID}]` : ''}${m.skillTypeID ? `[skill ${m.skillTypeID}]` : ''} ${m.domain}: ${aName.get(m.modifiedAttributeID) ?? m.modifiedAttributeID} op${m.operation} ← ${aName.get(m.modifyingAttributeID) ?? m.modifyingAttributeID}`;
const q = process.argv.slice(2).join(' ').toLowerCase();
for (const [id, t] of Object.entries(P.types)) {
  if (!t.name.toLowerCase().includes(q)) continue;
  console.log(`\n${id} ${t.name} (${t.group}, group ${t.groupID})`);
  console.log('  attrs: ' + Object.entries(t.attrs).map(([a, v]) => `${aName.get(Number(a)) ?? a}=${v}`).join(', '));
  for (const e of t.effects) {
    const m = mods(e);
    console.log(`  effect ${e} ${eName.get(e) ?? '?'}${P.effects[e] ? ' (new/changed)' : ''}${m == null ? ' — NOT IN BUNDLE' : ''}`);
    for (const x of m ?? []) console.log('     ' + fmtMod(x));
  }
  if (t.unresolved.length) console.log('  unresolved: ' + JSON.stringify(t.unresolved));
}
