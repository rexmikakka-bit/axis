// PRE-RELEASE modules: the four "Aberrant" meta modules of Fractured Skies (24.02), from CCP's
// expansion notes (2026-11-06). Hand-written, NOT generated, not pyfa-validated.
//
// "Modified versions of existing passive modules that now feature a new active effect. Their passive
// effects are weaker than their equivalent Tech I modules, but when activated, they have a much more
// powerful active effect that lasts for a short duration before going on cooldown." The notes give
// each one's passive and active figure and the 20 s duration / 2 min cooldown, nothing else.
//
// PLACEHOLDERS (Owen, 2026-11-06: "placeholder stats for now"): every other attribute — fitting cost,
// HP, volume, required skill, the Overdrive's cargo penalty — is the Tech I module's. The active
// figure REPLACES the passive one while the module runs (it does not add to it): "15% active speed
// boost" against an 8% passive reads as the module's bonus becoming 15%. typeIDs 991201-991204 are
// placeholders well clear of CCP's range and are never exported to ESI.
//
// How it works in the engine: the module keeps the Tech I module's own effects, which read one bonus
// attribute (implantBonusVelocity, shieldBoostMultiplier, speedFactor,
// capacitorRechargeRateMultiplier). That attribute holds the PASSIVE figure, and an active-only
// effect (category 1) assigns it the ACTIVE figure from `aberrantActiveBonus` while the module runs.
// Self-targeting effects run before the module's ship-targeting ones (dogma-engine.js), so the
// Tech I effect reads the assigned value.
//
// It retires itself: skipped once the bundle has a type with the same name. Then delete this file and
// its call sites (dogma-engine-init.js, core.js, lib/icons.js, lib/esi-fits.js, components/ui.jsx).

const META_ABERRANT = 990;   // placeholder metaGroupID; lib/meta.js labels it "Aberrant"
const A_ACTIVE = 991003;
const DURATION = 73, REACTIVATION_DELAY = 669;
const NEW_ATTRS = { [A_ACTIVE]: { n: 'aberrantActiveBonus', s: 1, h: 1, d: 0 } };

const MODULES = [
  { id: 991201, name: "Vigilant 'Vital' Overdrive Injector System", base: 1244, attr: 1076, passive: 8, active: 15,
    lines: [['8%', 'passive bonus to ship maximum velocity'], ['15%', 'bonus to ship maximum velocity while active']],
    source: 'Communications section of the Collapsed Drifter Cache' },
  { id: 991202, name: "Vigilant 'Vital' Shield Boost Amplifier", base: 11561, attr: 548, passive: 24, active: 43.2,
    lines: [['24%', 'passive bonus to shield booster amount'], ['43.2%', 'bonus to shield booster amount while active']],
    source: 'Logistics section of the Collapsed Drifter Cache' },
  { id: 991203, name: "Vigilant 'Vital' Drone Navigation Computer", base: 24395, attr: 20, passive: 20, active: 36,
    lines: [['20%', 'passive bonus to drone and fighter velocity'], ['36%', 'bonus to drone and fighter velocity while active']],
    source: 'Fabricated Rogue Cache' },
  // A Cap Recharger's bonus is a recharge-time multiplier: 12% faster is 0.88, 25% is 0.75.
  { id: 991204, name: "Vigilant 'Vital' Cap Recharger", base: 1195, attr: 144, passive: 0.88, active: 0.75,
    lines: [['12%', 'passive bonus to capacitor recharge rate'], ['25%', 'bonus to capacitor recharge rate while active']],
    source: 'Engineering section of the Collapsed Drifter Cache' },
];

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
      a: { ...base.a, [m.attr]: m.passive, [A_ACTIVE]: m.active, [DURATION]: 20000, [REACTIVATION_DELAY]: 120000 },
      e: [...base.e, effectID],
    };
    PRERELEASE_MODULE_TYPE_IDS.add(m.id);
    PRERELEASE_MODULE_TRAITS[m.id] = { misc: { header: 'Misc bonus:', bonuses: [
      ...m.lines.map(([number, text]) => ({ number, text })),
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

/** True for a module added here. */
export const isPrereleaseModule = typeID => PRERELEASE_MODULE_TYPE_IDS.has(Number(typeID));
