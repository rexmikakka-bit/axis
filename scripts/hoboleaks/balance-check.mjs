#!/usr/bin/env node
// balance-check.mjs — prerelease-balance.js's hand-entered changes against the SiSi per-type changes,
// and the SiSi changes to ships and modules it does not have. Read-only; prints a report.
import fs from 'fs';
import { fileURLToPath } from 'url';
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const sisi = JSON.parse(fs.readFileSync(here('./_sisi.json'), 'utf8'));
const evedb = JSON.parse(fs.readFileSync(here('./_evedb.json'), 'utf8'));
const B_ATTRS = JSON.parse(fs.readFileSync(here('../../src/data/dogma-attrs.json'), 'utf8'));
const src = fs.readFileSync(here('../../src/data/prerelease-balance.js'), 'utf8');

// Every attribute a label can mean (internal name or display name).
const cands = new Map();
const add = (label, id) => { if (!label) return; if (!cands.has(label)) cands.set(label, new Set()); cands.get(label).add(Number(id)); };
for (const a of evedb.attrs) { add(a.name, a.id); add(a.display, a.id); }
for (const [id, a] of Object.entries(B_ATTRS)) add(a.n, id);
for (const [id, a] of Object.entries(sisi.attributes)) add(a.fields.name ?? a.name, id);
const nameOf = new Map(evedb.attrs.map(a => [a.id, a.name])); for (const [id, a] of Object.entries(B_ATTRS)) nameOf.set(Number(id), a.n);

// Pull CHANGES out of the module by evaluating it with stub exports (it has no imports).
const mod = await import('data:text/javascript,' + encodeURIComponent(src.replace(/export const APPLIED_BALANCE[\s\S]*$/, '') + '\nexport { CHANGES };'));
const byName = new Map(Object.values(sisi.typeAttribs).map(t => [t.name, t]));
const effByName = new Map(Object.values(sisi.typeEffects).map(t => [t.name, t]));
const covered = new Set();
let ok = 0, bad = 0;
for (const c of mod.CHANGES) {
  covered.add(c.type);
  const real = byName.get(c.type);
  for (const [k, [from, to]] of Object.entries(c.set ?? {})) {
    const id = Number(k);
    const row = real?.changes.find(([label]) => cands.get(label)?.has(id));
    const tag = `${c.type} · ${nameOf.get(id) ?? id}: ours ${from} -> ${to}`;
    if (id >= 990000) { console.log(`  ? ${tag} (our own attribute; SiSi: ${JSON.stringify(real?.changes.filter(([l]) => /explosion|fighter/i.test(l)) ?? [])})`); continue; }
    if (!row) { bad++; console.log(`  ✗ ${tag} — SiSi has no such change`); continue; }
    if (row[2] === to && (from === undefined ? row[1] == null : row[1] === from)) { ok++; continue; }
    bad++; console.log(`  ✗ ${tag} — SiSi ${row[1]} -> ${row[2]}`);
  }
}
console.log(`\n${ok} of our attribute changes match SiSi exactly, ${bad} do not.\n`);
// SiSi changes to fittable things we do not carry. Noise skipped: isDynamicType flags, the
// Synchronizer set markers (rigSet*Module, carried by the rigs' own data), graphics and art.
const NOISE = /^(isDynamicType|rigSet.*Module|graphicID|iconID|soundID|radius|basePrice|marketGroupID|metaGroupID|descriptionID|typeNameID|published)$/;
console.log('SiSi attribute changes not in prerelease-balance.js:');
for (const t of Object.values(sisi.typeAttribs)) {
  if (covered.has(t.name)) continue;
  const rows = t.changes.filter(([l]) => !NOISE.test(l));
  if (rows.length) console.log(`  ${t.name} (${t.group}): ${rows.map(([l, a, b]) => `${l} ${a} -> ${b}`).join('; ')}`);
}
console.log('\nSiSi effect changes on existing types not in prerelease-balance.js (Synchronizer set-bonus effects skipped):');
for (const t of Object.values(sisi.typeEffects)) {
  if (covered.has(t.name)) continue;
  const add = t.added.filter(e => !/SetRigGroup$/.test(e)), rem = t.removed;
  if ((add.length || rem.length) && !/Synchronizer|Academy|SKIN|Blueprint/.test(t.name)) console.log(`  ${t.name} (${t.group}): +${add.join(', +') || '—'} ${rem.length ? '−' + rem.join(', −') : ''}`);
}
