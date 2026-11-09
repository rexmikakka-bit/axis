#!/usr/bin/env node
/**
 * parse.mjs — turn a saved Hoboleaks TQ→SiSi diff page into structured data.
 *
 *     curl -sL https://www.hoboleaks.space/ -o scripts/hoboleaks/_page.html
 *     node scripts/hoboleaks/parse.mjs scripts/hoboleaks/_page.html > scripts/hoboleaks/_sisi.json
 *
 * Hoboleaks renders its diff as HTML: new items with their attributes (by DISPLAY name), per-type
 * effect additions/removals (by effect NAME), changed effect definitions (with full modifierInfo, by
 * attribute ID), new/changed attribute definitions, per-type attribute changes, and trait text. This
 * pulls each of those out as data; resolve.mjs then maps display names back to attribute IDs.
 *
 * Output: { build, generated, newItems: [{typeID, name, group, attrs: [[label, value]]}],
 *           typeEffects: {typeID: {name, group, added: [names], removed: [names]}},
 *           effects: {effectID: {name, fields: {field: newValue}}},
 *           attributes: {attributeID: {name, fields}}, typeAttribs: {typeID: {name, group, changes: [[label, old, new]]}},
 *           bonuses: {typeID: {name, text}} }
 */
import fs from 'fs';

const html = fs.readFileSync(process.argv[2], 'utf8');
const ent = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const textOf = (h) => ent(h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<(br|\/div|\/tr|\/li|\/h\d|\/p|\/td)[^>]*>/g, '\n').replace(/<[^>]+>/g, ' '))
  .replace(/[ \t]+/g, ' ').split('\n').map(l => l.trim()).filter(Boolean);

// The page's sections, by anchor id, in page order.
const marks = [...html.matchAll(/id="(newitems|removeditems|dgmattribs|dgmeffects|typeattribs|typeeffects|bonuschanges|dynamicitems|expertchanges|stringchanges|changedblueprints|changedreprocessing|clonestates|newfiles|changedfiles)"/g)]
  .map(m => ({ id: m[1], at: m.index })).sort((a, b) => a.at - b.at);
const section = (id) => {
  const i = marks.findIndex(m => m.id === id);
  if (i < 0) return [];
  const end = marks.slice(i + 1).find(m => m.at > marks[i].at)?.at ?? html.length;
  return textOf(html.slice(marks[i].at, end));
};
const num = (s) => { if (s === 'None') return null; const n = Number(s); return Number.isFinite(n) ? n : s; };
// Python-literal modifierInfo ("[{'domain': 'shipID', ...}]") as JSON.
const pyList = (s) => JSON.parse(s.replace(/'/g, '"').replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false'));

const out = { build: /Build: (\d+)\)\s*$/.exec(textOf(html.slice(0, marks[0]?.at ?? 0)).find(l => /Comparing/.test(l)) ?? '')?.[1] ?? null,
  generated: textOf(html.slice(0, marks[0]?.at ?? 0)).find(l => /^Generated @/.test(l)) ?? null,
  newItems: [], typeEffects: {}, effects: {}, attributes: {}, typeAttribs: {}, bonuses: {} };

// ── New items: "<id> - <name>", description lines, the group name, then "Click to toggle … N
// attributes." followed by "label: value" lines. The index list at the top (showinfo links) is skipped.
{
  const L = section('newitems');
  const head = /^(\d+) - (.+)$/;
  for (let i = 0; i < L.length; i++) {
    const m = head.exec(L[i]); if (!m) continue;
    const toggle = L.findIndex((l, j) => j > i && /^Click to toggle showing the \d+ attributes\./.test(l));
    if (toggle < 0) break;
    const nextHead = L.findIndex((l, j) => j > i && head.test(l));
    if (nextHead >= 0 && nextHead < toggle) continue;   // an item without an attribute block
    // Between the heading and the group line: the description ("No Description" when there is none).
    const desc = L.slice(i + 1, toggle - 1).join('\n');
    const item = { typeID: Number(m[1]), name: m[2], group: L[toggle - 1], description: desc === 'No Description' ? '' : desc, attrs: [] };
    // The first attribute shares the toggle line.
    const first = L[toggle].replace(/^Click to toggle showing the \d+ attributes\.\s*/, '');
    const lines = [first, ...L.slice(toggle + 1, nextHead < 0 ? L.length : nextHead)];
    for (const l of lines) { const a = /^(.+?): (.*)$/.exec(l); if (a) item.attrs.push([a[1], num(a[2])]); }
    out.newItems.push(item);
    i = (nextHead < 0 ? L.length : nextHead) - 1;
  }
}

// ── Effects per type: "<id> - <name> (<group>)", "Added Effects:", names, "Removed Effects:", names.
{
  const L = section('typeeffects'); let cur = null, mode = null;
  for (const l of L) {
    const m = /^(\d+) - (.+) \((.+)\)$/.exec(l);
    if (m) { cur = out.typeEffects[m[1]] = { name: m[2], group: m[3], added: [], removed: [] }; mode = null; continue; }
    if (!cur) continue;
    // Long lists put the heading on the "Click to toggle showing the N effects." line itself.
    if (/Added Effects:s*$/.test(l)) { mode = 'added'; continue; }
    if (/Removed Effects:s*$/.test(l)) { mode = 'removed'; continue; }
    if (mode && /^[A-Za-z0-9_]+$/.test(l)) cur[mode].push(l);
  }
}

// ── Effect definitions: "<id> - <name>", then "field: old => new" lines; modifierInfo spans lines.
{
  const L = section('dgmeffects'); let cur = null;
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    const m = /^(\d+) - ([A-Za-z0-9_]+)$/.exec(l);
    if (m) { cur = out.effects[m[1]] = { name: m[2], fields: {} }; continue; }
    if (!cur) continue;
    if (/^modifierInfo:/.test(l)) {
      // "modifierInfo: <old>" "=>" "<new>" — the new list is the line after "=>".
      const arrow = L.indexOf('=>', i);
      const nv = L[arrow + 1];
      cur.fields.modifierInfo = nv && nv.startsWith('[') ? pyList(nv) : [];
      i = arrow + 1; continue;
    }
    const f = /^([A-Za-z]+): (.*?) => (.*)$/.exec(l);
    if (f) cur.fields[f[1]] = num(f[3]);
  }
}

// ── Attribute definitions: "<id> - <name>", "field: old => new".
{
  const L = section('dgmattribs'); let cur = null;
  for (const l of L) {
    const m = /^(\d+) - ([A-Za-z0-9_]+)$/.exec(l);
    if (m) { cur = out.attributes[m[1]] = { name: m[2], fields: {} }; continue; }
    const f = cur && /^([A-Za-z]+): (.*?) => (.*)$/.exec(l);
    if (f) cur.fields[f[1]] = num(f[3]);
  }
}

// ── Attributes per type: "<id> - <name> (<group>)", "label: old => new".
{
  const L = section('typeattribs'); let cur = null;
  for (const l of L) {
    const m = /^(\d+) - (.+) \((.+)\)$/.exec(l);
    if (m) { cur = out.typeAttribs[m[1]] = { name: m[2], group: m[3], changes: [] }; continue; }
    const f = cur && /^(.+?): (.*?) => (.*)$/.exec(l);
    if (f) cur.changes.push([f[1], num(f[2]), num(f[3])]);
  }
}

// ── Trait text per type: kept as text; ships' bonus lines.
{
  const L = section('bonuschanges'); let cur = null;
  for (const l of L) {
    const m = /^(\d+) - (.+)$/.exec(l);
    if (m && !/:/.test(m[2])) { cur = out.bonuses[m[1]] = { name: m[2], lines: [] }; continue; }
    if (cur) cur.lines.push(l);
  }
}

process.stdout.write(JSON.stringify(out, null, 1));
console.error(`build ${out.build} · ${out.newItems.length} new items with attributes · ${Object.keys(out.typeEffects).length} types with effect changes · ${Object.keys(out.effects).length} effects · ${Object.keys(out.attributes).length} attributes · ${Object.keys(out.typeAttribs).length} types with attribute changes · ${Object.keys(out.bonuses).length} trait changes`);
