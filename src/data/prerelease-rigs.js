// PRE-RELEASE rigs: the pirate-faction "Synchronizer" rigs CCP has shown but not yet shipped.
//
// Hand-written, NOT generated. Everything here comes from one screenshot of the in-game info windows
// (five Medium Synchronizers, shown on a CCP stream, 2026-11-01). The rigs are on no server we can
// read: not in pyfa's eve.db and not in CCP's SDE (build 3662168 has no "Synchronizer" type). Nothing
// here is pyfa-validated, and the UI labels every one "Pre-release".
//
// What the screenshot says, per rig: one penalty, four bonuses, and "the bonuses provided by this rig
// increase by a flat +1% for every <faction> module fitted to this ship". Owen's reading, which is
// what is implemented:
//   - the +1% is one percentage POINT per module (10% -> 11%), on the four bonuses only. The
//     penalty does not grow.
//   - ABYSSAL modules never count, even when their base type is a faction module. Every other fitted
//     module whose name starts with the faction's name does, offline ones included ("fitted").
//   - a skill reduces the penalty by 10% per level (50% at V): see SKILL below.
//
// CCP's Fractured Skies expansion notes (2026-11-06) then gave all nine rigs in text. Every bonus and
// penalty matched; they also confirmed the ECM reading below, named the skill Synchronization
// Rigging (10% less drawback per level), and said only one Synchronizer fits a ship at a time.
//
// What was guessed rather than read off the screenshot:
//   - Small and Large sizes. Only Medium was shown. Owen asked for all three with the same numbers.
//   - typeIDs (990901+), the group, the market group and the attribute/effect IDs: placeholders
//     well clear of CCP's ranges. Never exported to ESI.
//   - volume and HP: copied from the T1 rigs of each size. Calibration is 250 on every size, from
//     later word Owen passed on (2026-11-01). Only that one figure was given, so all sizes share it.
//   - which dogma attribute each line touches, written the way CCP writes the nearest existing rig
//     (comments name it). Every rig modifier is stacking-penalised, like any rig's.
//   - "LCM strength" on the Dread Guristas rig is read as ECM strength: Guristas are the ECM faction
//     and the screenshot's font draws E and L alike.
//
// How it gets in: dogma-engine-init.js calls applyPrereleaseRigs() on the raw bundles before
// initEngine(), and core.js calls applyPrereleaseRigModules() on the module list and market tree
// before it indexes them. The per-module count is the engine's (Fit._synchronizeRigs), driven by the
// `sync` field on each rig type.
//
// The four empire navy Synchronizers (Republic Fleet, Federation Navy, Caldari Navy, Imperial Navy)
// came later, from four Large info windows Owen passed on. They have four bonuses and NO penalty, so
// the skill does nothing for them. Same +1% rule, same 250 calibration, same three sizes.
//
// It retires itself: everything is skipped once the bundle has a type named "Medium Dark Blood
// Synchronizer". When CCP ships them, delete this file, its call sites and the pre-release skill
// control (lib/prerelease-skill.js and its users), and add the real effects to the bundle.

import { isPrereleaseModule } from './prerelease-modules.js';

const GROUP = 990950;
const GROUP_NAME = 'Rig Synchronizer';
const SKILL_ID = 990940;
export const PRERELEASE_SKILL_NAME = 'Synchronization Rigging';
// The SKILL_CATALOG key calc.js derives for it (camel-cased name). App.jsx sets it on every pilot.
// Its level is stored under its own key (lib/prerelease-skill.js), so the rename kept everyone's.
export const PRERELEASE_SKILL_KEY = 'synchronizationRigging';

// Attributes. One drawback and four bonus slots per rig, like CCP's `drawback` (1138) on its rigs.
const A_DRAWBACK = 990901;
const A_BONUS = [990902, 990903, 990904, 990905];
const NEW_ATTRS = {
  [A_DRAWBACK]: { n: 'synchronizerDrawback', s: 1, h: 1, d: 0 },
  [A_BONUS[0]]: { n: 'synchronizerBonus1', s: 1, h: 1, d: 0 },
  [A_BONUS[1]]: { n: 'synchronizerBonus2', s: 1, h: 1, d: 0 },
  [A_BONUS[2]]: { n: 'synchronizerBonus3', s: 1, h: 1, d: 0 },
  [A_BONUS[3]]: { n: 'synchronizerBonus4', s: 1, h: 1, d: 0 },
};
export const SYNC_BONUS_ATTRS = ['synchronizerBonus1', 'synchronizerBonus2', 'synchronizerBonus3', 'synchronizerBonus4'];

// Groups and skills the modifiers filter on.
const G_ENERGY_TURRET = 53, G_PROJECTILE = 55, G_HYBRID = 74, G_NOS = 68, G_NEUT = 71, G_ECM = 201;
const S_DRONES = 3436, S_AFTERBURNER = 3450, S_MISSILES = 3319, S_SHIELD_OP = 3416, S_REPAIR = 3393;

const ship = (attr, src) => ({ domain: 'shipID', func: 'ItemModifier', modifiedAttributeID: attr, modifyingAttributeID: src, operation: 6 });
const group = (g, attr, src) => ({ domain: 'shipID', func: 'LocationGroupModifier', groupID: g, modifiedAttributeID: attr, modifyingAttributeID: src, operation: 6 });
const skill = (s, attr, src) => ({ domain: 'shipID', func: 'LocationRequiredSkillModifier', skillTypeID: s, modifiedAttributeID: attr, modifyingAttributeID: src, operation: 6 });
const drones = (attr, src) => ({ domain: 'charID', func: 'OwnerRequiredSkillModifier', skillTypeID: S_DRONES, modifiedAttributeID: attr, modifyingAttributeID: src, operation: 6 });
const [B1, B2, B3, B4] = A_BONUS, D = A_DRAWBACK;

// Dogma attribute IDs used below.
const RECHARGE = 55, SHIELD_HP = 263, ARMOR_HP = 265, HULL_HP = 9, SIG = 552, WARP_SPEED = 600;
const DRONE_RANGE = 458, LOCK_RANGE = 76, WEB_RESIST = 2115, VELOCITY = 37, CAP_NEED = 6;
const DAMAGE = 64, FALLOFF = 158, TRACKING = 160, OPTIMAL = 54, FALLOFF_EFF = 2044;
const NOS_AMOUNT = 90, NEUT_AMOUNT = 97, OVERHEAT_CYCLE = 1206, SPEED_FACTOR = 20, OVERHEAT_SPEED = 1223;
const DURATION = 73, REPAIR_AMOUNT = 84, CAP_CAPACITY = 482;
const MISSILE_DAMAGES = [114, 116, 117, 118];
const SHIELD_RESONANCES = [271, 272, 273, 274];
const ECM_STRENGTHS = [238, 239, 240, 241];

// One entry per faction. `v` is [drawback, bonus1..4] in the attribute's own sign: a "reduction" or a
// resistance is negative, because op 6 multiplies by (1 + v/100). `m` is the modifier list per slot.
// The four empire navy rigs have no drawback: their `v[0]` is null and `m[0]` empty.
// `icon` borrows the iconID of the existing rig family closest to each one's weapon bonus.
const FACTIONS = [
  {
    prefix: 'Dark Blood', icon: 3203 /* energy weapon rigs */,
    v: [200, 10, 10, 5, 5],
    m: [
      [ship(RECHARGE, D)],                                                       // Capacitor Control Circuit's line, inverted
      [group(G_NOS, NOS_AMOUNT, B1), group(G_NEUT, NEUT_AMOUNT, B1)],
      [group(G_NOS, OVERHEAT_CYCLE, B2), group(G_NEUT, OVERHEAT_CYCLE, B2)],     // their overload bonus is the cycle-time cut
      [group(G_NOS, OPTIMAL, B3), group(G_NEUT, OPTIMAL, B3), group(G_NOS, FALLOFF_EFF, B3), group(G_NEUT, FALLOFF_EFF, B3)],
      [group(G_ENERGY_TURRET, DAMAGE, B4)],
    ],
    lines: [
      ['200%', 'penalty to ship capacitor recharge time'],
      ['10%', 'bonus to Energy Nosferatu and Energy Neutralizer drain amount'],
      ['10%', 'bonus to the benefits of overheating Energy Nosferatu and Energy Neutralizer modules'],
      ['5%', 'bonus to Energy Nosferatu and Energy Neutralizer optimal range and effectiveness falloff'],
      ['5%', 'bonus to energy turret damage'],
    ],
  },
  {
    prefix: 'Domination', icon: 3201 /* projectile weapon rigs */,
    v: [-30, -10, 10, 5, 5],
    m: [
      [ship(SHIELD_HP, D), ship(ARMOR_HP, D), ship(HULL_HP, D)],
      [ship(SIG, B1)],
      [group(G_PROJECTILE, FALLOFF, B2)],                                       // Projectile Ambit Extension
      [group(G_PROJECTILE, DAMAGE, B3)],
      [ship(WARP_SPEED, B4)],
    ],
    lines: [
      ['30%', 'penalty to ship shield, armor and structure hitpoints'],
      ['10%', 'reduction in signature radius'],
      ['10%', 'bonus to projectile falloff'],
      ['5%', 'bonus to projectile damage'],
      ['5%', 'bonus to warp speed'],
    ],
  },
  {
    prefix: 'Dread Guristas', icon: 3200 /* drone rigs */,
    v: [-60, 10, 10, -5, 5],
    m: [
      // The ship's droneControlDistance stands in for the character's (dogma-engine.js charID note).
      [ship(DRONE_RANGE, D)],
      [drones(SHIELD_HP, B1), drones(ARMOR_HP, B1), drones(HULL_HP, B1)],       // Drone Durability Enhancer
      [drones(DAMAGE, B2)],
      SHIELD_RESONANCES.map(r => ship(r, B3)),
      [...ECM_STRENGTHS.map(a => group(G_ECM, a, B4)), group(G_ECM, OPTIMAL, B4)],
    ],
    lines: [
      ['60%', 'penalty to maximum drone control range'],
      ['10%', 'bonus to drone hitpoints'],
      ['10%', 'bonus to drone damage'],
      ['5%', 'bonus to shield resistances'],
      ['5%', 'bonus to ECM strength and optimal range'],
    ],
  },
  {
    prefix: 'Shadow Serpentis', icon: 3202 /* hybrid weapon rigs */,
    v: [-60, -10, 10, 5, 5],
    m: [
      [ship(LOCK_RANGE, D)],
      [ship(WEB_RESIST, B1)],                                                    // same shape as effect 8517
      [group(G_HYBRID, FALLOFF, B2)],                                           // Hybrid Ambit Extension
      [group(G_HYBRID, DAMAGE, B3)],
      [ship(VELOCITY, B4)],
    ],
    lines: [
      ['60%', 'penalty to ships maximum targeting range'],
      ['10%', 'bonus to stasis webifier resistance'],
      ['10%', 'bonus to hybrid turret falloff'],
      ['5%', 'bonus to hybrid turret damage'],
      ['5%', 'bonus to ship maximum velocity'],
    ],
  },
  {
    prefix: 'True Sansha', icon: 3196 /* navigation rigs */,
    v: [400, 10, 10, 5, 5],
    m: [
      // Afterburners are the propulsion modules requiring Afterburner; MWDs require High Speed
      // Maneuvering, so this leaves them alone.
      [skill(S_AFTERBURNER, CAP_NEED, D)],
      [skill(S_AFTERBURNER, SPEED_FACTOR, B1)],
      [skill(S_AFTERBURNER, OVERHEAT_SPEED, B2)],
      [group(G_ENERGY_TURRET, DAMAGE, B3)],
      [group(G_ENERGY_TURRET, TRACKING, B4)],                                    // Energy Metastasis Adjuster
    ],
    lines: [
      ['400%', 'penalty to the capacitor activation cost of Afterburner modules'],
      ['10%', 'bonus to Afterburner velocity bonus'],
      ['10%', 'bonus to the benefits of overheating Afterburner modules'],
      ['5%', 'bonus to energy turret damage'],
      ['5%', 'bonus to energy turret tracking'],
    ],
  },
  // The empire navy four, from a second set of screenshots (Large only shown, 2026-11-01).
  {
    prefix: 'Republic Fleet', icon: 3201 /* projectile weapon rigs */,
    v: [null, 5, 5, -5, 5],
    m: [
      [],
      [group(G_PROJECTILE, DAMAGE, B1)],
      [group(G_PROJECTILE, TRACKING, B2)],
      // Ancillary boosters require Shield Operation too, so they are included.
      [skill(S_SHIELD_OP, DURATION, B3)],
      [ship(VELOCITY, B4)],
    ],
    lines: [
      ['5%', 'bonus to Projectile Turret damage'],
      ['5%', 'bonus to Projectile Turret tracking'],
      ['5%', 'bonus to Shield Booster cycle time'],
      ['5%', 'bonus to ship Maximum Velocity'],
    ],
  },
  {
    prefix: 'Federation Navy', icon: 3202 /* hybrid weapon rigs */,
    v: [null, 5, 5, 5, 5],
    m: [
      [],
      [group(G_HYBRID, DAMAGE, B1)],
      [group(G_HYBRID, TRACKING, B2)],
      [skill(S_REPAIR, REPAIR_AMOUNT, B3)],                                     // ancillary repairers included
      [ship(HULL_HP, B4)],
    ],
    lines: [
      ['5%', 'bonus to Hybrid Weapon damage'],
      ['5%', 'bonus to Hybrid Weapon tracking'],
      ['5%', 'bonus to Armor Repairer amount'],
      ['5%', 'bonus to Structure hitpoints'],
    ],
  },
  {
    prefix: 'Caldari Navy', icon: 3197 /* launcher rigs */,
    v: [null, 5, 5, 5, 5],
    m: [
      [],
      // A ship-located skill filter also reaches loaded charges (dogma-engine.js), as hull missile
      // bonuses do. An owner-located one would not.
      MISSILE_DAMAGES.map(a => skill(S_MISSILES, a, B1)),
      [skill(S_MISSILES, VELOCITY, B2)],
      [ship(SHIELD_HP, B3)],
      [ship(LOCK_RANGE, B4)],
    ],
    lines: [
      ['5%', 'bonus to Missile Damage'],
      ['5%', 'bonus to Missile maximum velocity'],
      ['5%', 'bonus to Shield hitpoints'],
      ['5%', 'bonus to maximum targeting range'],
    ],
  },
  {
    prefix: 'Imperial Navy', icon: 3203 /* energy weapon rigs */,
    v: [null, 5, -5, 5, 5],
    m: [
      [],
      [group(G_ENERGY_TURRET, DAMAGE, B1)],
      [group(G_ENERGY_TURRET, CAP_NEED, B2)],
      [ship(CAP_CAPACITY, B3)],
      [ship(ARMOR_HP, B4)],
    ],
    lines: [
      ['5%', 'bonus to Energy Turret damage'],
      ['5%', 'reduction in Energy Turret capacitor activation cost'],
      ['5%', 'bonus to maximum Capacitor amount'],
      ['5%', 'bonus to Armor hitpoints'],
    ],
  },
];

// Small/Medium/Large: rigSize, and the T1 rigs' volume (5/10/20 m3) and mass/HP.
const SIZES = [
  { name: 'Small', rigSize: 1, volume: 5, mg: 990901 },
  { name: 'Medium', rigSize: 2, volume: 10, mg: 990902 },
  { name: 'Large', rigSize: 3, volume: 20, mg: 990903 },
];
const MG_ROOT = 990900;
const MG_RIGS = 1111;
const RIG_SLOT_EFFECT = 2663;
const CALIBRATION = 250;

// Effect IDs: 990900 + faction*10 + slot (0 = drawback, 1..4 = bonuses), and the skill's.
const effectID = (fi, slot) => 990900 + fi * 10 + slot;
const EFF_SKILL = 990990;
const EFF_SKILL_PRESCALE = 2725; // Armor Rigging's: rigDrawbackBonus (1139) *= skillLevel
const A_SKILL_BONUS = 1139;      // rigDrawbackBonus, the attribute every rigging skill carries

export const PRERELEASE_NOTICE = 'PRE-RELEASE: arrives with Fractured Skies on 10 November. Its bonuses are from the expansion notes, not the game data yet, so a figure may still change when it goes live. Only one Synchronizer fits a ship.';
const SKILL_NOTICE = 'PRE-RELEASE: arrives with Fractured Skies (25 million ISK in the empire schools). 10% less Synchronizer rig drawback per level, 50% at V. No character has it yet, so Axis applies the level you set here to every pilot.';

export const PRERELEASE_RIG_TYPE_IDS = new Set();
// typeID -> trait entry, for core.js to merge into shipTraits (the info sheet's Traits tab).
export const PRERELEASE_RIG_TRAITS = {};
// typeID -> description, for the info sheet's Info tab.
export const PRERELEASE_RIG_DESCRIPTIONS = {};
// typeID -> iconID, for core.js to merge into TYPE_ICONS.
const ICONS = {};
const RIGS = [];

/** Mutates the raw dogma bundles. Must run before initEngine() converts attribute IDs to names. */
export function applyPrereleaseRigs(types, effects, attrs) {
  if (RIGS.length) return RIGS.map(r => r.name);
  if (Object.values(types).some(t => t.n === 'Medium Dark Blood Synchronizer')) return [];
  for (const [id, a] of Object.entries(NEW_ATTRS)) attrs[id] ??= a;

  FACTIONS.forEach((f, fi) => {
    const slots = f.m.flatMap((mods, slot) => mods.length ? [slot] : []);
    for (const slot of slots) effects[effectID(fi, slot)] = { c: 0, m: f.m[slot] };
    SIZES.forEach((s, si) => {
      const id = 990901 + fi * 3 + si;
      const name = `${s.name} ${f.prefix} Synchronizer`;
      const a = {
        4: 200, 9: 40, 38: 0, 161: s.volume, 162: 100, 422: 1, 633: 0,
        1153: CALIBRATION, 1547: s.rigSize,
        1544: 1,   // maxGroupFitted: one Synchronizer per ship (the expansion notes)
        ...(f.v[0] != null && { [A_DRAWBACK]: f.v[0] }),
        ...Object.fromEntries(A_BONUS.map((aid, i) => [aid, f.v[i + 1]])),
      };
      types[id] = {
        n: name, g: GROUP, gn: GROUP_NAME, c: 7, mg: 4, a,
        e: [RIG_SLOT_EFFECT, ...slots.map(slot => effectID(fi, slot))],
        sync: f.prefix,
      };
      PRERELEASE_RIG_TYPE_IDS.add(id);
      ICONS[id] = f.icon;
      RIGS.push({ id, name, size: s, faction: f });
      PRERELEASE_RIG_TRAITS[id] = {
        misc: {
          header: 'Misc bonus:',
          bonuses: [
            ...f.lines.map(([number, text]) => ({ number, text })),
            { text: `• the bonuses provided by this rig increase by a flat +1% for every ${f.prefix} module fitted to this ship (abyssal modules excluded)` },
          ],
        },
      };
      PRERELEASE_RIG_DESCRIPTIONS[id] = f.v[0] == null ? PRERELEASE_NOTICE
        : `${PRERELEASE_NOTICE} The penalty is reduced by the ${PRERELEASE_SKILL_NAME} skill, also pre-release: set its level below or in Settings > Skills.`;
    });
  });

  // The skill: Armor Rigging's shape (attributes, prescale), pointed at the synchronizer group.
  effects[EFF_SKILL] = { c: 0, m: [{ domain: 'shipID', func: 'LocationGroupModifier', groupID: GROUP, modifiedAttributeID: A_DRAWBACK, modifyingAttributeID: A_SKILL_BONUS, operation: 6 }] };
  types[SKILL_ID] = {
    n: PRERELEASE_SKILL_NAME, g: 269, gn: 'Rigging', c: 16,
    a: { 4: 0, 38: 0, 161: 0.01, 162: 1, 180: 165, 181: 166, 182: 26252, 275: 3, 277: 3, 280: 0, [A_SKILL_BONUS]: -10 },
    e: [EFF_SKILL_PRESCALE, EFF_SKILL],
  };
  PRERELEASE_RIG_DESCRIPTIONS[SKILL_ID] = SKILL_NOTICE;
  return RIGS.map(r => r.name);
}

/**
 * Adds the rigs to modules.json's records, the market tree and the icon map. core.js, before indexing.
 * `marketTree` is market-tree.json ({g, t}): the cargo picker's and the desktop Browser's everything
 * view read that tree rather than marketGroups, so without it the rigs showed only under a rig rack.
 */
export function applyPrereleaseRigModules(modulesData, marketGroups, typeIcons, marketTree = null) {
  if (!RIGS.length) return;
  marketGroups[MG_ROOT] ??= { name: 'Synchronizer Rigs (Pre-release)', parent: MG_RIGS };
  for (const s of SIZES) marketGroups[s.mg] ??= { name: `${s.name} Synchronizer Rigs`, parent: MG_ROOT };
  if (marketTree) {
    const first = RIGS[0].id;
    marketTree.g[MG_ROOT] ??= { n: 'Synchronizer Rigs (Pre-release)', p: MG_RIGS, i: first };
    for (const s of SIZES) marketTree.g[s.mg] ??= { n: `${s.name} Synchronizer Rigs`, p: MG_ROOT, i: RIGS.find(r => r.size === s)?.id ?? first };
    for (const r of RIGS) marketTree.t[r.id] ??= [r.size.mg, r.name, r.size.volume];
  }
  for (const r of RIGS) {
    modulesData[r.id] ??= {
      typeID: r.id, name: r.name, groupID: GROUP, groupName: GROUP_NAME,
      marketGroupID: r.size.mg,
      marketGroupPath: ['Ship and Module Modifications', 'Rigs', 'Synchronizer Rigs (Pre-release)', `${r.size.name} Synchronizer Rigs`],
      slot: 'rigs', meta: 'Faction', cpu: 0, pg: 0, cal: CALIBRATION, maxGroupFit: 1, rigSize: r.size.rigSize,
      chargeGroups: [], requiredSkills: [],
    };
    typeIcons[r.id] ??= ICONS[r.id];
  }
}

/** True for a rig or skill added here, or a pre-release Aberrant module (prerelease-modules.js): every
 *  user — the Pre-release badge, the info sheet's traits, the ESI export block — treats them alike. */
export const isPrereleaseRig = typeID => PRERELEASE_RIG_TYPE_IDS.has(Number(typeID)) || Number(typeID) === SKILL_ID || isPrereleaseModule(typeID);

/** True where the skill control means something: the skill itself, or a rig with a penalty. */
export const prereleaseSkillApplies = typeID => Number(typeID) === SKILL_ID
  || (PRERELEASE_RIG_TYPE_IDS.has(Number(typeID)) && RIGS.find(r => r.id === Number(typeID))?.faction.v[0] != null);
