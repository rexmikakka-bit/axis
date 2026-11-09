#!/usr/bin/env node
// compare.mjs "<our name>" [...] — our engine's type (pre-release data applied) against the resolved
// SiSi type of the same name: every attribute either side has that differs, by name.
import fs from 'fs';
import { fileURLToPath } from 'url';
import { TYPES, tidByName } from '../../src/calc.js';
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const P = JSON.parse(fs.readFileSync(here('./_patch.json'), 'utf8'));
const evedb = JSON.parse(fs.readFileSync(here('./_evedb.json'), 'utf8'));
const B_ATTRS = JSON.parse(fs.readFileSync(here('../../src/data/dogma-attrs.json'), 'utf8'));
const aName = new Map(evedb.attrs.map(a => [a.id, a.name]));
for (const [id, a] of Object.entries(B_ATTRS)) aName.set(Number(id), a.n);
for (const [id, a] of Object.entries(P.attrs)) aName.set(Number(id), a.n);
const SKIP = new Set(['mainColor', 'propulsionGraphicID', 'gfxBoosterID', 'typeColorScheme', 'fwLpKill', 'maxDirectionalScanRange', 'uniformity',
  'maxPassengers', 'cargoScanResistance', 'powerLoad', 'cpuLoad', 'damage', 'heatCapacityHi', 'heatCapacityMed', 'heatCapacityLow', 'metaLevelOld', 'techLevel']);
for (const name of process.argv.slice(2)) {
  const sisi = Object.entries(P.types).find(([, t]) => t.name === name);
  const ourId = tidByName(name), ours = TYPES[ourId];
  console.log(`\n== ${name}: ours ${ourId ?? '—'}, SiSi ${sisi?.[0] ?? '—'}`);
  if (!sisi || !ours) continue;
  // Ours by ID when the type carries `a`; pre-release types built by name carry only `attrs`.
  const idByName = new Map([...aName].map(([id, n]) => [n, id]));
  const mine = { ...(ours.a ?? {}) };
  for (const [n, v] of Object.entries(ours.attrs ?? {})) { const id = idByName.get(n); if (id != null && mine[id] == null) mine[id] = v; }
  const real = sisi[1].attrs;
  const ids = new Set([...Object.keys(real), ...Object.keys(mine)].map(Number));
  const rows = [];
  for (const id of ids) {
    const n = aName.get(id) ?? id; if (SKIP.has(n)) continue;
    const r = real[id], m = mine[id];
    if (r == null && m == null) continue;
    if (r != null && m != null && Math.abs(r - m) <= 1e-9 * Math.max(1, Math.abs(r))) continue;
    rows.push(`   ${n}: ours ${m ?? '—'} · SiSi ${r ?? '—'}`);
  }
  console.log(rows.length ? rows.join('\n') : '   (no differences)');
  const ourEff = new Set((ours.e ?? []).map(Number)), realEff = new Set(sisi[1].effects);
  const onlyReal = [...realEff].filter(e => !ourEff.has(e)), onlyOurs = [...ourEff].filter(e => !realEff.has(e));
  if (onlyReal.length || onlyOurs.length) console.log(`   effects only in SiSi: ${onlyReal.join(', ') || '—'} · only ours: ${onlyOurs.join(', ') || '—'}`);
}
