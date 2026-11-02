// PRE-RELEASE hulls: the four navy attack battlecruisers CCP has announced for Fractured Skies.
//
// Hand-written, NOT generated. The ships are on no server we can read: not in pyfa's eve.db and not in
// CCP's SDE. Nothing here is pyfa-validated, and the UI labels every hull "Pre-release". Sources, all
// 2026-11-01:
//   - CCP's "Fractured Skies in focus" news post (eveonline.com/news/view/fractured-skies-in-focus).
//     Its four "IN DEVELOPMENT" stat cards give each hull's slot layout, hardpoints, per-level
//     bonuses and role bonuses; every bonus below is copied from those cards.
//   - stats Owen passed on: powergrid/CPU, shield/armor/structure HP, speed, inertia, lock range, scan
//     resolution and sensor strength for the Oracle, Talos and Tornado. The Naga's fitting line only;
//     the rest of its stats were not shown.
//
// What was guessed rather than read off a source:
//   - the Naga Navy Issue's HP, speed, inertia, lock range, scan resolution and sensor strength:
//     scaled off the Naga by how much the other three grew over their base hulls.
//   - everything no source covers (signature, capacitor, cargo, mass, heat, resists, drone bay): the
//     base hull's.
//   - which dogma attribute each bonus line touches, written the way CCP writes the base hull's.
//   - typeIDs (990001-990004): placeholders well clear of CCP's range. Never exported to ESI. The art is
//     the base hull's (PRERELEASE_SHIP_ART).
//
// How it gets in: dogma-engine-init.js calls applyPrereleaseShips() on the raw bundles BEFORE
// initEngine(), so the engine, the ship browser (backfillHullsFromTypes files any category-6 type by
// its group name) and lookupShip() all see these as ordinary hulls.
//
// It retires itself: a hull is skipped as soon as the real bundle carries a type with the same name.
// Once CCP's data has all four, delete this file and its call sites (dogma-engine-init.js, core.js's
// shipTraits merge, lib/icons.js's art alias and the isPrereleaseShip users). Saved fits survive the
// swap: the library is keyed by hull NAME, not typeID.

export const PRERELEASE_TYPE_IDS = new Set();

const ORACLE_NI = 990001, TALOS_NI = 990002, NAGA_NI = 990003, TORNADO_FI = 990004;

/** Placeholder typeID -> the base hull whose art stands in for it. */
export const PRERELEASE_SHIP_ART = { [ORACLE_NI]: 4302, [TALOS_NI]: 4308, [NAGA_NI]: 4306, [TORNADO_FI]: 4310 };

// Skills and groups the modifiers filter on.
const S_LARGE_ENERGY = 3309, S_LARGE_HYBRID = 3307, S_CRUISE = 3326, S_TORPEDO = 3325, S_HSM = 3454;
const G_CRUISE_LAUNCHER = 506, G_TORPEDO_LAUNCHER = 508, G_ARMOR_PLATE = 329;

// Every bonus attribute is CCP's own shipBonus{A,G,C,M}BC1..3, which the four battlecruiser skills
// already scale by level (each skill carries a prescale effect for all three).
const ABC1 = 795, ABC2 = 1889, ABC3 = 5205, GBC1 = 747, GBC2 = 746, GBC3 = 5046;
const CBC1 = 743, CBC2 = 745, CBC3 = 5044, MBC1 = 748, MBC2 = 749, MBC3 = 5207;
const LARGE_TURRET_POWER = 1786, LARGE_TURRET_CPU = 1787; // bcLargeTurretPower/CPU (0.05/0.5): the role's 95%/50%

const OPTIMAL = 54, FALLOFF = 158, POWER = 30, CPU = 50, MASS_ADDITION = 796, VELOCITY = 37, MWD_SIG = 554;
const EM = 114, EXPLOSIVE = 116, KINETIC = 117, THERMAL = 118;

const skillMod = (s, attr, src, op = 6) => ({ domain: 'shipID', func: 'LocationRequiredSkillModifier', skillTypeID: s, modifiedAttributeID: attr, modifyingAttributeID: src, operation: op });
const groupMod = (g, attr, src, op = 6) => ({ domain: 'shipID', func: 'LocationGroupModifier', groupID: g, modifiedAttributeID: attr, modifyingAttributeID: src, operation: op });
const LAUNCHERS = [G_CRUISE_LAUNCHER, G_TORPEDO_LAUNCHER];
const MISSILES = [S_CRUISE, S_TORPEDO];
const onMissiles = (attrs, src) => MISSILES.flatMap(s => attrs.map(a => skillMod(s, a, src)));

// New effects, for bonuses no existing ABC effect covers. A ship-located skill filter reaches loaded
// charges in our engine (dogma-engine.js), which is how the missile bonuses land on the missile.
const NEW_EFFECTS = {
  990101: { c: 0, m: [skillMod(S_LARGE_ENERGY, OPTIMAL, ABC3)] },                     // Oracle NI: optimal
  990103: { c: 0, m: [skillMod(S_LARGE_HYBRID, FALLOFF, GBC1)] },                     // Talos NI: falloff
  990105: { c: 0, m: [groupMod(G_ARMOR_PLATE, MASS_ADDITION, GBC3)] },                // Talos NI: plate mass
  990106: { c: 0, m: LAUNCHERS.map(g => groupMod(g, POWER, LARGE_TURRET_POWER, 0)) }, // Naga NI: launcher PG
  990107: { c: 0, m: LAUNCHERS.map(g => groupMod(g, CPU, LARGE_TURRET_CPU, 0)) },     // Naga NI: launcher CPU
  990108: { c: 0, m: onMissiles([KINETIC], CBC1) },                                  // Naga NI: kinetic damage
  990109: { c: 0, m: onMissiles([EM, THERMAL, EXPLOSIVE], CBC2) },                   // Naga NI: other damage
  990110: { c: 0, m: onMissiles([VELOCITY], CBC3) },                                 // Naga NI: missile velocity
  990111: { c: 0, m: [skillMod(S_HSM, MWD_SIG, MBC3)] },                              // Tornado FI: MWD signature (effect 4902's shape)
};

const roleFitting = weapon => [
  { number: '95%', text: `reduction in ${weapon} powergrid requirement` },
  { number: '50%', text: `reduction in ${weapon} CPU requirement` },
];

const SHIPS = [
  {
    id: ORACLE_NI, name: 'Oracle Navy Issue', base: 4302,
    a: {
      14: 7, 13: 3, 12: 7, 102: 6, 101: 0, 11: 1200, 48: 345,
      263: 2000, 265: 2700, 9: 2500, 37: 225, 70: 0.47, 76: 70000, 564: 230, 208: 22,
      [ABC1]: -10,  // large energy turret activation cost (effect 5354, as the Oracle)
      [ABC2]: 15,   // large energy turret damage          (effect 5355, as the Oracle)
      [ABC3]: 7.5,  // large energy turret optimal range   (new, 990101)
    },
    e: [4820, 4823, 4826, 5354, 5355, 990101],
    traits: {
      skills: [{ header: 'Amarr Battlecruiser bonuses (per skill level):', bonuses: [
        { number: '10%', text: 'reduction in Large Energy Turret activation cost' },
        { number: '15%', text: 'bonus to Large Energy Turret damage' },
        { number: '7.5%', text: 'bonus to Large Energy Turret optimal range' }] }],
      role: { header: 'Role Bonus:', bonuses: [...roleFitting('Large Energy Turret'),
        { number: '50%', text: 'reduction in Large Energy Turret activation cost' }] },
    },
  },
  {
    id: TALOS_NI, name: 'Talos Navy Issue', base: 4308,
    a: {
      14: 7, 13: 4, 12: 6, 102: 6, 101: 0, 11: 975, 48: 360,
      263: 2200, 265: 2400, 9: 2750, 37: 265, 70: 0.43, 76: 75000, 564: 210, 210: 25,
      [GBC2]: 15,   // large hybrid damage        (effect 5359, as the Talos)
      [GBC1]: 7.5,  // large hybrid falloff       (new, 990103; the Talos's tracking bonus, moved)
      [GBC3]: -15,  // armor plate mass penalty   (new, 990105)
    },
    // 1387 is the Talos's own (a command-burst CPU attribute it does not carry); kept as CCP has it.
    e: [1387, 4821, 4824, 4827, 5359, 990103, 990105],
    traits: {
      skills: [{ header: 'Gallente Battlecruiser bonuses (per skill level):', bonuses: [
        { number: '15%', text: 'bonus to Large Hybrid Turret damage' },
        { number: '7.5%', text: 'bonus to Large Hybrid Turret falloff' },
        { number: '15%', text: 'reduction to Armor Plate mass penalty' }] }],
      role: { header: 'Role Bonus:', bonuses: [...roleFitting('Large Hybrid Turret'),
        { number: '50%', text: 'reduction in Large Hybrid Turret activation cost' }] },
    },
  },
  {
    id: NAGA_NI, name: 'Naga Navy Issue', base: 4306,
    a: {
      14: 7, 13: 7, 12: 3, 102: 0, 101: 6, 11: 650, 48: 475,
      263: 2700, 265: 2000, 9: 2200, 37: 220, 70: 0.5, 76: 80000, 564: 210, 211: 25,
      [CBC1]: 10,   // torpedo and cruise missile kinetic damage             (new, 990108)
      [CBC2]: 5,    // torpedo and cruise missile EM/thermal/explosive damage (new, 990109)
      [CBC3]: 10,   // cruise missile and torpedo max velocity               (new, 990110)
    },
    e: [990106, 990107, 990108, 990109, 990110],
    traits: {
      skills: [{ header: 'Caldari Battlecruiser bonuses (per skill level):', bonuses: [
        { number: '10%', text: 'bonus to Torpedo and Cruise Missile Kinetic Damage' },
        { number: '5%', text: 'bonus to Torpedo and Cruise Missile EM, Thermal, Explosive Damage' },
        { number: '10%', text: 'bonus to Cruise Missile and Torpedo max velocity' }] }],
      role: { header: 'Role Bonus:', bonuses: roleFitting('Cruise Missile and Torpedo Launcher') },
    },
  },
  {
    id: TORNADO_FI, name: 'Tornado Fleet Issue', base: 4310,
    a: {
      14: 7, 13: 6, 12: 4, 102: 6, 101: 0, 11: 865, 48: 375,
      263: 2400, 265: 2250, 9: 2250, 37: 280, 70: 0.52, 76: 65000, 564: 240, 209: 21,
      [MBC1]: -10,  // large projectile rate of fire   (effect 5360, as the Tornado)
      [MBC2]: 7.5,  // large projectile falloff        (effect 5361, as the Tornado)
      [MBC3]: -15,  // MWD signature radius penalty    (new, 990111)
    },
    e: [4822, 4825, 5360, 5361, 990111],
    traits: {
      skills: [{ header: 'Minmatar Battlecruiser bonuses (per skill level):', bonuses: [
        { number: '10%', text: 'bonus to Large Projectile Turret rate of fire' },
        { number: '7.5%', text: 'bonus to Large Projectile Turret falloff range' },
        { number: '15%', text: 'reduction to Microwarpdrive signature radius penalty' }] }],
      role: { header: 'Role Bonus:', bonuses: roleFitting('Large Projectile Turret') },
    },
  },
];

// One literal on purpose: check-suite-deps reads `from '…'` as an import, so a string ending in the
// word "from" followed by a `+` continuation trips it.
export const PRERELEASE_NOTICE = 'PRE-RELEASE: CCP has announced this ship but not shipped it yet. Its bonuses and stats come off CCP\'s preview images, with a few gaps filled by Axis, so expect them to change when it goes live.';

// Trait entries for core.js to merge into shipTraits, filled in by applyPrereleaseShips() for the
// hulls it actually added.
export const PRERELEASE_TRAITS = {};
const PRERELEASE_NAMES = new Set();

/** Mutates the raw dogma bundles. Must run before initEngine() converts attribute IDs to names. */
export function applyPrereleaseShips(types, effects) {
  if (PRERELEASE_TYPE_IDS.size) return [...PRERELEASE_NAMES];
  const taken = new Set(Object.values(types).map(t => t.n));
  const live = SHIPS.filter(s => !taken.has(s.name) && types[s.base]);
  if (!live.length) return [];

  for (const [id, e] of Object.entries(NEW_EFFECTS)) effects[id] ??= e;

  for (const s of live) {
    const base = types[s.base];
    // Faction meta (mg 4) files it beside the other navy hulls; ml 7 is the navy battlecruisers'.
    types[s.id] = { n: s.name, g: base.g, gn: base.gn, c: 6, a: { ...base.a, ...s.a }, e: [...s.e], rs: base.rs, mg: 4, ml: 7 };
    PRERELEASE_TYPE_IDS.add(s.id);
    PRERELEASE_NAMES.add(s.name);
    PRERELEASE_TRAITS[s.id] = { ...s.traits, desc: PRERELEASE_NOTICE };
  }
  return live.map(s => s.name);
}

/** True for a hull added here, by typeID or by name (the fit library and browser rows hold names). */
export const isPrereleaseShip = idOrName =>
  PRERELEASE_TYPE_IDS.has(Number(idOrName)) || PRERELEASE_NAMES.has(idOrName);
