// PRE-RELEASE modules: the four "Aberrant" meta modules of Fractured Skies (24.02), from CCP's
// expansion notes (2026-11-06). Hand-written, NOT generated, not pyfa-validated.
//
// "Modified versions of existing passive modules that now feature a new active effect. Their passive
// effects are weaker than their equivalent Tech I modules, but when activated, they have a much more
// powerful active effect that lasts for a short duration before going on cooldown." The notes give
// each one's passive and active figure and the 20 s duration / 2 min cooldown, nothing else.
//
// PLACEHOLDERS (Owen, 2026-11-06: "placeholder stats for now"): every other attribute — fitting cost,
// HP, volume, required skill, the Overdrive's cargo penalty — is the Tech I module's. typeIDs
// 991201-991204 are placeholders well clear of CCP's range and are never exported to ESI.
//
// The active bonus ADDS to the passive one (later word from CCP, Owen 2026-11-06): an Overdrive's 8%
// passive and 15% active make 23% while it runs. Added, not multiplied. The figures below are the
// notes' own, each as a percentage; `mult` marks the Cap Recharger, whose attribute is a recharge-
// time MULTIPLIER (12% faster is 0.88), so its total becomes 1 - 37% = 0.63 while active.
//
// How it works in the engine: the module keeps the Tech I module's own effects, which read one bonus
// attribute (implantBonusVelocity, shieldBoostMultiplier, speedFactor,
// capacitorRechargeRateMultiplier). That attribute holds the PASSIVE figure, and an active-only
// effect (category 1) assigns it the passive-plus-active total from `aberrantActiveBonus` while the
// module runs. Self-targeting effects run before the module's ship-targeting ones (dogma-engine.js),
// so the Tech I effect reads the assigned value — and one module stays ONE bonus in its stacking
// group, as an in-game module is.
//
// It retires itself: skipped once the bundle has a type with the same name. Then delete this file and
// its call sites (dogma-engine-init.js, core.js, lib/icons.js, lib/esi-fits.js, components/ui.jsx).

const META_ABERRANT = 990;   // placeholder metaGroupID; lib/meta.js labels it "Aberrant"
const A_ACTIVE = 991003;
const DURATION = 73, REACTIVATION_DELAY = 669;
const NEW_ATTRS = { [A_ACTIVE]: { n: 'aberrantActiveBonus', s: 1, h: 1, d: 0 } };

const MODULES = [
  { id: 991201, name: "Vigilant 'Vital' Overdrive Injector System", base: 1244, attr: 1076, passive: 8, active: 15,
    what: 'ship maximum velocity', source: 'Communications section of the Collapsed Drifter Cache' },
  { id: 991202, name: "Vigilant 'Vital' Shield Boost Amplifier", base: 11561, attr: 548, passive: 24, active: 43.2,
    what: 'shield booster amount', source: 'Logistics section of the Collapsed Drifter Cache' },
  { id: 991203, name: "Vigilant 'Vital' Drone Navigation Computer", base: 24395, attr: 20, passive: 20, active: 36,
    what: 'drone and fighter velocity', source: 'Fabricated Rogue Cache' },
  { id: 991204, name: "Vigilant 'Vital' Cap Recharger", base: 1195, attr: 144, passive: 12, active: 25, mult: true,
    what: 'capacitor recharge rate', source: 'Engineering section of the Collapsed Drifter Cache' },
];
// A percentage as the attribute stores it: as-is, or for a multiplier attribute, 1 - pct.
const asAttr = (m, pct) => (m.mult ? Math.round((1 - pct / 100) * 1e6) / 1e6 : pct);
const pctText = (v) => `${Math.round(v * 100) / 100}%`;

export const PRERELEASE_MODULE_TYPE_IDS = new Set();
/** Placeholder typeID -> the Tech I module whose art stands in for it. */
export const PRERELEASE_MODULE_ART = Object.fromEntries(MODULES.map(m => [m.id, m.base]));
export const PRERELEASE_MODULE_TRAITS = {};
export const PRERELEASE_MODULE_DESCRIPTIONS = {};
const NOTICE = 'PRE-RELEASE: an Aberrant module from CCP\'s Fractured Skies expansion notes, not in the game data yet. Its passive and active bonuses, 20 second duration and 2 minute cooldown are from the notes; everything else (fitting cost, HP, skills) is a placeholder copied from the Tech I module, so expect it to change when it goes live.';

/** Mutates the raw dogma bundles. Before initEngine(). */
export function applyPrereleaseModules(types, effects, attrs) {
  if (PRERELEASE_MODULE_TYPE_IDS.size) return [...PRERELEASE_MODULE_TYPE_IDS];
  const taken = new Set(Object.values(types).map(t => t.n));
  for (const [id, a] of Object.entries(NEW_ATTRS)) attrs[id] ??= a;
  MODULES.forEach((m, i) => {
    const base = types[m.base];
    if (!base || taken.has(m.name)) return;
    const effectID = 991201 + i;
    effects[effectID] = { c: 1, m: [{ domain: 'itemID', func: 'ItemModifier', modifiedAttributeID: m.attr, modifyingAttributeID: A_ACTIVE, operation: 7 }] };
    types[m.id] = {
      ...base, n: m.name, mg: META_ABERRANT,
      a: { ...base.a, [m.attr]: asAttr(m, m.passive), [A_ACTIVE]: asAttr(m, m.passive + m.active), [DURATION]: 20000, [REACTIVATION_DELAY]: 120000 },
      e: [...base.e, effectID],
    };
    PRERELEASE_MODULE_TYPE_IDS.add(m.id);
    PRERELEASE_MODULE_TRAITS[m.id] = { misc: { header: 'Misc bonus:', bonuses: [
      { number: pctText(m.passive), text: `passive bonus to ${m.what}` },
      { number: pctText(m.active), text: `additional bonus to ${m.what} while active (${pctText(m.passive + m.active)} in all)` },
      { text: '• 20 second duration, 2 minute cooldown' },
    ] } };
    PRERELEASE_MODULE_DESCRIPTIONS[m.id] = `${NOTICE} Rare drop: ${m.source}.`;
  });
  return [...PRERELEASE_MODULE_TYPE_IDS];
}

/** Adds the modules to modules.json's records and the market tree, as their Tech I module's siblings. */
export function applyPrereleaseModuleRecords(modulesData, marketTree = null) {
  for (const m of MODULES) {
    if (!PRERELEASE_MODULE_TYPE_IDS.has(m.id)) continue;
    const base = modulesData[m.base];
    if (!base) continue;
    modulesData[m.id] ??= { ...base, typeID: m.id, name: m.name, meta: 'Aberrant', duration: 20000 };
    const row = marketTree?.t?.[m.base];
    if (row) marketTree.t[m.id] ??= [row[0], m.name, row[2]];
  }
}

/**
 * Files each Aberrant module in its Tech I module's variation family (core.js's moduleVariations,
 * typeID -> the family's list): appended to the list, and that list set for every member, so the
 * Variations tab of any member — the Tech I, the T2, a faction one — offers the Aberrant one, and
 * the Aberrant one's own tab lists the family. Run after the bundle's variations are loaded.
 */
export function applyPrereleaseModuleVariations(moduleVariations) {
  for (const m of MODULES) {
    if (!PRERELEASE_MODULE_TYPE_IDS.has(m.id)) continue;
    const family = moduleVariations[String(m.base)] ?? [{ typeID: m.base, name: null }];
    if (family.some(v => Number(v.typeID) === m.id)) continue;
    const next = [...family, { typeID: m.id, name: m.name, meta: 'Aberrant' }];
    for (const v of next) moduleVariations[String(v.typeID)] = next;
  }
}

/** True for a module added here. */
export const isPrereleaseModule = typeID => PRERELEASE_MODULE_TYPE_IDS.has(Number(typeID));
