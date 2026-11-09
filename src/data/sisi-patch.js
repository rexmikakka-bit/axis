// PRE-RELEASE items, from CCP's own test-server data: everything Fractured Skies (10 November 2026)
// adds that Axis carries ahead of pyfa's eve.db.
//
// sisi-patch.json is GENERATED from a Hoboleaks TQ->SiSi diff (SiSi build 3682781) by
// scripts/hoboleaks/build-patch.mjs, which says how. It holds real typeIDs, attributes, effects and
// trait text, in the dogma bundle's own shapes. Do not hand-edit it; rerun the scripts. NOT
// pyfa-validated: pyfa has none of it yet, and the UI labels every item "Pre-release".
//
// What it carries: the 27 Synchronizer rigs and the Synchronization Rigging skill, the Naga and Talos
// Navy Issue and Tornado Fleet Issue, the ten 'Xyston' rigging implants, the Imperial Navy web,
// scrambler and disruptor, the four 'Vigilant' Vital modules and the four SARO boosters. It also adds
// the Synchronizer set marker (rigSet*Module = 1, and the effect that counts it) to the 603 faction
// modules that carry one on SiSi.
//
// The one hand-written type is the Oracle Navy Issue: it is on Tranquility already, so the diff has
// its new effects but none of its attributes, and our eve.db predates it. Its attributes are the
// expansion notes' stat card (below), under its real typeID and with its real effects.
//
// How it gets in: dogma-engine-init.js calls applySisiPatch() on the raw bundles before initEngine();
// core.js calls applyPrereleaseRecords() on the module list, market tree and icon map, and
// applyPrereleaseVariations() on the variation families. It retires itself item by item: a type the
// bundle already has (by typeID or name) is skipped, so a regenerated eve.db quietly takes over. Once
// the bundle has all of them, delete this file, sisi-patch.json and their call sites.

import PATCH from './sisi-patch.json' with { type: 'json' };

export const SISI_BUILD = PATCH.source?.build ?? null;

// One literal on purpose: check-suite-deps reads `from '…'` as an import, so a string ending in the
// word "from" followed by a `+` continuation trips it.
export const PRERELEASE_NOTICE = 'PRE-RELEASE: arrives with Fractured Skies on 10 November. Its figures are CCP\'s test-server data (Singularity), not yet checked against pyfa, so one may still change when it goes live.';

const ORACLE_NI = PATCH.oracleNavyIssue?.typeID ?? 95629;
const ORACLE = 4302;
// The Oracle Navy Issue's stat card (CCP's "Fractured Skies in focus" post and the expansion notes),
// laid over the Oracle's own attributes. Its three bonus attributes are the ones its real effects read.
const ORACLE_NI_ATTRS = {
  14: 7, 13: 3, 12: 7, 102: 6, 101: 0, 11: 1200, 48: 345,
  263: 2000, 265: 2700, 9: 2500, 37: 225, 70: 0.47, 76: 70000, 564: 230, 208: 22, 192: 7,
  795: -10,   // shipBonusABC1: large energy turret activation cost
  1889: 15,   // shipBonusABC2: large energy turret damage
  5205: 7.5,  // shipBonusABC3: large energy turret optimal range
};
const ORACLE_NI_TRAITS = {
  skills: [{ header: 'Amarr Battlecruiser bonuses (per skill level):', bonuses: [
    { number: '10%', text: 'reduction in Large Energy Turret activation cost' },
    { number: '15%', text: 'bonus to Large Energy Turret damage' },
    { number: '7.5%', text: 'bonus to Large Energy Turret optimal range' }] }],
  role: { header: 'Role Bonus:', bonuses: [
    { number: '95%', text: 'reduction in Large Energy Turret powergrid requirement' },
    { number: '50%', text: 'reduction in Large Energy Turret CPU requirement' },
    { number: '50%', text: 'reduction in Large Energy Turret activation cost' }] },
};

// Art. None of these typeIDs is on CCP's image server yet, so a hull shows its base hull's render and
// a Synchronizer the icon of the rig family nearest its weapon bonus (its own icons are new too).
const RIG_ICON = { 'Dark Blood': 3203, Domination: 3201, 'Dread Guristas': 3200, 'Shadow Serpentis': 3202,
  'True Sansha': 3196, 'Republic Fleet': 3201, 'Federation Navy': 3202, 'Caldari Navy': 3197, 'Imperial Navy': 3203 };
const SYNC_RE = /^(Small|Medium|Large) (.+) Synchronizer$/;
const RIG_SIZE = { Small: 1, Medium: 2, Large: 3 };
const MG_RIGS = 1111, MG_SYNC = 990900;   // the Synchronizers' parent group: a placeholder, its real ID is not in the diff
// The rigging implants' parent under Skill Hardwiring (531): a placeholder too.
const MG_SKILL_HARDWIRING = 531, MG_RIGGING_IMPLANTS = 990901;
// CCP's SiSi data gives the 'Vigilant' Vital Cap Recharger metaGroupID 0 where its three siblings carry
// 63, the new Aberrant group. Display only (lib/meta.js); the dogma is untouched.
const MG_ABERRANT = 63;

const ADDED = new Set();
const SHIP_NAMES = new Set();
/** typeID -> the typeID whose art stands in for it. */
export const PRERELEASE_ART = {};
/** typeID -> trait entry in ship-traits.json's shape, for core.js to merge into shipTraits. */
export const PRERELEASE_TRAITS = {};
/** typeID -> description, for the info sheet's Info tab. */
export const PRERELEASE_DESCRIPTIONS = {};

// Hoboleaks trait text -> { skills: [{header, bonuses}], role, misc }. Its list gives every section
// twice, first flattened and then one line per bonus with showinfo links; the second copy is read.
function parseTraits(lines) {
  const strip = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const isHeader = l => /:$/.test(l) && !/^[\d.+-]+(%|x)\s/.test(l);
  const start = lines.findIndex(isHeader);
  if (start < 0) return null;
  const out = {};
  let cur = null;
  for (const raw of lines.slice(start).map(strip)) {
    if (isHeader(raw)) {
      cur = { header: raw, bonuses: [] };
      if (/per skill level/i.test(raw)) (out.skills ??= []).push(cur);
      else if (/^Role Bonus/i.test(raw)) out.role = cur;
      else out.misc = cur;
      continue;
    }
    const m = /^([\d.+-]+(?:%|x| m))\s+(.*)$/.exec(raw);
    cur?.bonuses.push(m ? { number: m[1], text: m[2] } : { text: `• ${raw}` });
  }
  return out;
}

let applied = false;
/** Mutates the raw dogma bundles. Must run before initEngine() converts attribute IDs to names. */
export function applySisiPatch(types, effects, attrs) {
  if (applied) return [...ADDED];
  applied = true;
  for (const [id, a] of Object.entries(PATCH.attrs)) attrs[id] ??= a;
  for (const [id, e] of Object.entries(PATCH.effects)) effects[id] ??= e;
  const names = new Set(Object.values(types).map(t => t.n));

  for (const [id, t] of Object.entries(PATCH.types)) {
    if (types[id] || names.has(t.n)) continue;
    const info = PATCH.info?.[id] ?? {};
    types[id] = { ...t, a: { ...t.a }, e: [...t.e] };
    if (/^'Vigilant' Vital /.test(t.n) && !t.mg) types[id].mg = MG_ABERRANT;
    ADDED.add(Number(id));
    if (t.c === 6) { SHIP_NAMES.add(t.n); if (info.parent) PRERELEASE_ART[id] = info.parent; }
    const traits = PATCH.traits[id] && parseTraits(PATCH.traits[id]);
    // CCP's trait text leaves out a Synchronizer's CPU drawback (attribute 1138, -10 on every one),
    // which is the one penalty the Synchronization Rigging skill reduces, so it is added from the data.
    if (traits?.misc && SYNC_RE.test(t.n) && t.a[1138])
      traits.misc.bonuses.splice(/penalty/.test(traits.misc.bonuses[0]?.text ?? '') ? 1 : 0, 0, { number: `${Math.abs(t.a[1138])}%`, text: 'penalty to ship CPU output (reduced by Synchronization Rigging)' });
    if (traits) PRERELEASE_TRAITS[id] = t.c === 6 ? { ...traits, desc: PRERELEASE_NOTICE } : traits;
    // CCP's text carries showinfo links; the bundled descriptions are plain text, so these are too.
    PRERELEASE_DESCRIPTIONS[id] = [PRERELEASE_NOTICE, PATCH.descriptions[id]?.replace(/<[^>]+>/g, '')].filter(Boolean).join('\n\n');
  }

  // The Synchronizer set markers and their effects, on modules the bundle already has.
  for (const [id, x] of Object.entries(PATCH.addToTypes)) {
    const t = types[id];
    if (!t) continue;
    t.a ??= {};
    for (const [k, v] of Object.entries(x.a)) t.a[k] ??= v;
    for (const e of x.e) if (e != null && !t.e.includes(e)) t.e.push(e);
  }

  // The Oracle Navy Issue: our stat card, its real typeID and effects.
  if (!types[ORACLE_NI] && !names.has('Oracle Navy Issue') && types[ORACLE]) {
    const base = types[ORACLE];
    types[ORACLE_NI] = { n: 'Oracle Navy Issue', g: base.g, gn: base.gn, c: 6, a: { ...base.a, ...ORACLE_NI_ATTRS },
      e: [...(PATCH.oracleNavyIssue?.e ?? [])], rs: base.rs, mg: 4, ml: 8 };
    ADDED.add(ORACLE_NI);
    SHIP_NAMES.add('Oracle Navy Issue');
    PRERELEASE_ART[ORACLE_NI] = ORACLE;
    PRERELEASE_TRAITS[ORACLE_NI] = { ...ORACLE_NI_TRAITS, desc: PRERELEASE_NOTICE };
    PRERELEASE_DESCRIPTIONS[ORACLE_NI] = PRERELEASE_NOTICE;
  }
  return [...ADDED];
}

const metaLabel = t => (t.mg === 4 ? 'Faction' : (t.mg === MG_ABERRANT || /^'Vigilant' Vital /.test(t.n)) ? 'Aberrant' : 'T1');

/**
 * The added modules into modules.json's records, the market tree and the icon map; the implants into
 * the implant picker's table (HARDWIRING_IMPLANTS' shape). core.js, before it indexes any of them.
 * A module with a variation parent is filed as its parent's sibling, on its parent's record with its
 * own fitting figures; the Synchronizers get their own market group under Rigs.
 */
export function applyPrereleaseRecords(modulesData, marketGroups, typeIcons, marketTree = null, implantTable = null) {
  const ids = [...ADDED].filter(id => PATCH.types[id]);
  const syncSizes = new Map();
  for (const id of ids) {
    // The patch's own copy: its attributes are still keyed by ID (initEngine renamed the bundle's).
    const t = PATCH.types[id], info = PATCH.info?.[id] ?? {}, a = t.a ?? {};
    if (info.icon != null) typeIcons[id] ??= info.icon;
    // Implants and boosters: the phone's pickers read the implant table and the booster groups (core.js
    // BOOSTER_DATA, built from the types), the desktop Browser reads the market tree. Boosters go in
    // their existing Booster Slot group; the rigging implants' group is new, so it gets a "Rigging
    // Implants" parent under Skill Hardwiring, the shape of Armor Implants > Implant Slot 10.
    if (t.c === 20) {
      if (t.g !== 303 && info.slot && implantTable) {
        const fam = ((implantTable[info.slot] ??= {})['Rigging Implants'] ??= []);
        if (!fam.includes(t.n)) fam.push(t.n);
      }
      const mg = info.market?.[0];
      if (marketTree && mg != null) {
        if (!marketTree.g[mg] && t.g !== 303) {
          marketTree.g[MG_RIGGING_IMPLANTS] ??= { n: 'Rigging Implants', p: MG_SKILL_HARDWIRING, i: Number(id) };
          marketTree.g[mg] = { n: info.market[1], p: MG_RIGGING_IMPLANTS, i: Number(id) };
        }
        if (marketTree.g[mg]) marketTree.t[id] ??= [mg, t.n, a[161] ?? 0];
      }
      continue;
    }
    if (t.c !== 7) continue;
    const sync = SYNC_RE.exec(t.n);
    const parent = info.parent != null ? modulesData[info.parent] : null;
    const mg = info.market?.[0];
    if (sync) {
      typeIcons[id] = RIG_ICON[sync[2]] ?? typeIcons[id];
      syncSizes.set(mg, { size: sync[1], first: syncSizes.get(mg)?.first ?? id });
      modulesData[id] ??= {
        typeID: id, name: t.n, groupID: t.g, groupName: t.gn, marketGroupID: mg,
        marketGroupPath: ['Ship and Module Modifications', 'Rigs', 'Synchronizer Rigs', `${sync[1]} Synchronizer Rigs`],
        slot: 'rigs', meta: 'Faction', cpu: 0, pg: 0, cal: a[1153] ?? 0, maxGroupFit: a[1544] ?? null, rigSize: RIG_SIZE[sync[1]],
        drawback: a[1138] ?? null, chargeGroups: [], requiredSkills: t.rs ?? [],
      };
    } else if (parent) {
      modulesData[id] ??= { ...parent, typeID: id, name: t.n, meta: metaLabel(t), marketGroupID: mg ?? parent.marketGroupID,
        cpu: a[50] ?? 0, pg: a[30] ?? 0, duration: a[73] ?? parent.duration, capUse: a[6] ?? parent.capUse,
        speedFactor: a[20] ?? parent.speedFactor, capRechargeMult: a[144] ?? parent.capRechargeMult,
        optimal: a[54] != null ? a[54] / 1000 : parent.optimal, requiredSkills: t.rs ?? parent.requiredSkills };
    } else continue;
    if (marketTree) marketTree.t[id] ??= [mg ?? parent?.marketGroupID, t.n, a[161] ?? 0];
  }
  if (syncSizes.size) {
    marketGroups[MG_SYNC] ??= { name: 'Synchronizer Rigs', parent: MG_RIGS };
    if (marketTree) marketTree.g[MG_SYNC] ??= { n: 'Synchronizer Rigs', p: MG_RIGS, i: [...syncSizes.values()][0].first };
    for (const [mg, s] of [...syncSizes].sort((x, y) => RIG_SIZE[x[1].size] - RIG_SIZE[y[1].size])) {
      marketGroups[mg] ??= { name: `${s.size} Synchronizer Rigs`, parent: MG_SYNC };
      if (marketTree) marketTree.g[mg] ??= { n: `${s.size} Synchronizer Rigs`, p: MG_SYNC, i: s.first };
    }
  }
}

/**
 * Files each added module with a variation parent in that parent's family (core.js's moduleVariations,
 * typeID -> the family's list), so the Variations tab of any member offers it and its own tab lists
 * the family. Run after the bundle's variations are loaded.
 */
export function applyPrereleaseVariations(moduleVariations) {
  for (const id of ADDED) {
    const parent = PATCH.info?.[id]?.parent, t = PATCH.types[id];
    if (parent == null || !t || t.c !== 7) continue;
    const family = moduleVariations[String(parent)] ?? [{ typeID: parent, name: null }];
    if (family.some(v => Number(v.typeID) === id)) continue;
    const next = [...family, { typeID: id, name: t.n, meta: metaLabel(t) }];
    for (const v of next) moduleVariations[String(v.typeID)] = next;
  }
}

/** True for any item added here, by typeID — the "Pre-release" badge and the info sheet's traits. */
export const isPrereleaseType = typeID => ADDED.has(Number(typeID));
/** True for a hull added here, by typeID or by name (the fit library and browser rows hold names). */
export const isPrereleaseShip = idOrName => SHIP_NAMES.has(idOrName) || (ADDED.has(Number(idOrName)) && SHIP_NAMES.has(PATCH.types[idOrName]?.n ?? (Number(idOrName) === ORACLE_NI ? 'Oracle Navy Issue' : null)));
