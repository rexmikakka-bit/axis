// PRE-RELEASE balance: the Fractured Skies (24.02) ship and module changes, from CCP's expansion notes
// (eveonline.com/news/view/fractured-skies-expansion-notes, 2026-11-06), applied before CCP's data and
// pyfa carry them. Hand-written, NOT generated, and not pyfa-validated: the release notes say so.
//
// Every change names the value it expects to FIND (`from`) as well as the one it writes (`to`), and
// is applied only when every `from` in its group still matches. The notes' "from" figures all
// matched our bundle when this was written, so the day CCP's data carries the change the `from` stops
// matching and the group switches itself off — the same self-retiring rule as data-patches.json's
// value overrides. The regression suite pins each group as applied, so that day it fails and says
// which groups to delete; when they are all gone, delete this file and its call sites
// (dogma-engine-init.js, core.js's trait edits, calc.js's Integrated Sensor Array read).
//
// Raw bundles, before initEngine(): attributes are by ID, required skills by name.
//
// Hull bonuses scale with skill level through the SKILL's prescale effect on a named ship attribute
// (Caldari Cruiser multiplies shipBonusCC/CC2/CC3 by its level), so a new per-level bonus has to sit
// on an attribute that skill already scales. Each one below says which, and none edits an effect
// another hull shares: a hull losing a bonus has that effect taken off ITS list, and a new bonus is a
// new effect.
//
// Not modelled: the navy light fighters' Heavy Rocket Salvo charge count (20 -> 24) and rearm time
// (4 s -> 3 s). Our bundle carries no charge or rearm attribute for any fighter, so neither feeds a
// figure Axis shows.

const A = {
  hp: 9, power: 11, velocity: 37, capacity: 38, recharge: 55, shield: 263, armor: 265, cap: 482, sig: 552,
  capNeed: 6, explosionDelay: 281, reqSkill3: 184, reqSkill3Level: 279,
  radar: 208, ladar: 209, mag: 210, grav: 211,
  sensorDampRes: 2112, weaponDisruptRes: 2113, armorHPBonusAdd: 1159,
  shipBonusAC: 478, eliteHG2: 693, shipBonusCC3: 1535, shipBonusCF: 463, shipBonus3CF: 1624, eliteGunship2: 675,
  calCore2: 1515, calCore3: 2683, galCore3: 2685, calOff2: 1510, plateMassAdd: 3328,
  atkEM: 2227, atkTh: 2228, atkKin: 2229, atkExp: 2230, msEM: 2131, msTh: 2132, msKin: 2133, msExp: 2134,
};
const S_MISSILE_OP = 3319;
const DMG = { em: 114, ex: 116, kin: 117, th: 118 };
const owner = (skill, attr, src) => ({ domain: 'charID', func: 'OwnerRequiredSkillModifier', skillTypeID: skill, modifiedAttributeID: attr, modifyingAttributeID: src, operation: 6 });
const onShip = (attr, src) => ({ domain: 'shipID', func: 'ItemModifier', modifiedAttributeID: attr, modifyingAttributeID: src, operation: 6 });

// New attributes: the Integrated Sensor Array's light-fighter application bonus. Fighters never enter
// the dogma engine, so calc.js reads these off an ACTIVE array by name (section 9b).
export const ISA_EXPLOSION_VELOCITY = 'lightFighterAttackExplosionVelocityBonus';
export const ISA_EXPLOSION_RADIUS = 'lightFighterAttackExplosionRadiusBonus';
const NEW_ATTRS = {
  991001: { n: ISA_EXPLOSION_VELOCITY, s: 1, h: 1, d: 0 },
  991002: { n: ISA_EXPLOSION_RADIUS, s: 1, h: 0, d: 0 },
};

// New effects, each for one bonus line no existing effect states.
const NEW_EFFECTS = {
  // Cerberus: kinetic 5%/lvl on its own (Caldari Cruiser scales shipBonusCC3).
  991101: { c: 0, m: [owner(S_MISSILE_OP, DMG.kin, A.shipBonusCC3)] },
  // Hawk: 5%/lvl EM, thermal, explosive and 10%/lvl kinetic (Caldari Frigate scales CF and 3CF).
  991102: { c: 0, m: [owner(S_MISSILE_OP, DMG.em, A.shipBonusCF), owner(S_MISSILE_OP, DMG.th, A.shipBonusCF), owner(S_MISSILE_OP, DMG.ex, A.shipBonusCF)] },
  991103: { c: 0, m: [owner(S_MISSILE_OP, DMG.kin, A.shipBonus3CF)] },
  // Vengeance: 3%/lvl armor hitpoints (Assault Frigates scales eliteBonusGunship2).
  991104: { c: 0, m: [onShip(A.armor, A.eliteGunship2)] },
  // Tengu / Proteus Electronic Efficiency Gate: 3%/lvl sensor dampener and weapon disruption
  // resistance (each Core Systems skill scales its Core3).
  991105: { c: 0, m: [onShip(A.sensorDampRes, A.calCore3), onShip(A.weaponDisruptRes, A.calCore3)] },
  991106: { c: 0, m: [onShip(A.sensorDampRes, A.galCore3), onShip(A.weaponDisruptRes, A.galCore3)] },
};

// The changes. `set` is {attrID: [from, to]} — `from: undefined` means "the attribute is absent".
// `drop`/`add` take effects off / put effects on that type. `rs` adds a required-skill name.
const CHANGES = [
  { what: 'Legion: speed 185 -> 200, powergrid 625 -> 650', type: 'Legion', set: { [A.velocity]: [185, 200], [A.power]: [625, 650] } },
  { what: 'Proteus: signature 190 -> 165', type: 'Proteus', set: { [A.sig]: [190, 165] } },
  { what: 'Myrmidon Navy Issue: capacitor 2,900 -> 3,000', type: 'Myrmidon Navy Issue', set: { [A.cap]: [2900, 3000] } },
  { what: 'Catalyst: speed 265 -> 275', type: 'Catalyst', set: { [A.velocity]: [265, 275] } },
  { what: 'Maulus Navy Issue: armor 525 -> 625, structure 550 -> 575', type: 'Maulus Navy Issue', set: { [A.armor]: [525, 625], [A.hp]: [550, 575] } },
  { what: 'Sacrilege: HAC launcher rate of fire 7.5% -> 5%, Amarr Cruiser missile damage 5% -> 7.5%', type: 'Sacrilege',
    set: { [A.eliteHG2]: [-7.5, -5], [A.shipBonusAC]: [5, 7.5] } },
  { what: 'Cerberus: kinetic missile damage 2.5% -> 5% (EM, thermal, explosive stay 2.5%)', type: 'Cerberus',
    set: { [A.shipBonusCC3]: [undefined, 5] }, drop: [899], add: [991101] },
  { what: 'Hawk: 7.5% all missile damage -> 10% kinetic and 5% EM, thermal, explosive', type: 'Hawk',
    set: { [A.shipBonusCF]: [7.5, 5], [A.shipBonus3CF]: [undefined, 10] }, drop: [13025], add: [991102, 991103] },
  { what: 'Vengeance: cap recharge 187.5 s -> 140.625 s, AF cap recharge bonus -> 3% armor HP, shield 664 -> 464, armor 816 -> 1,016', type: 'Vengeance',
    set: { [A.recharge]: [187500, 140625], [A.shield]: [664, 464], [A.armor]: [816, 1016], [A.eliteGunship2]: [-5, 3] }, drop: [1001], add: [991104] },
  { what: 'Tengu Electronic Efficiency Gate: new 3% sensor warfare and weapon disruption resistance', type: 'Tengu Core - Electronic Efficiency Gate',
    set: { [A.calCore3]: [undefined, -3] }, add: [991105] },
  { what: 'Proteus Electronic Efficiency Gate: new 3% sensor warfare and weapon disruption resistance', type: 'Proteus Core - Electronic Efficiency Gate',
    set: { [A.galCore3]: [undefined, -3] }, add: [991106] },
  // 3771 is the plating subsystems' own flat-armor effect (armorHP += armorHPBonusAdd).
  { what: 'Tengu Obfuscation Manifold: ECM 10% -> 12.5%, new +500 armor', type: 'Tengu Core - Obfuscation Manifold',
    set: { [A.calCore2]: [10, 12.5], [A.armorHPBonusAdd]: [undefined, 500] }, add: [3771] },
  { what: 'Legion Augmented Plating: armor +1,000 -> +1,500', type: 'Legion Defensive - Augmented Plating', set: { [A.armorHPBonusAdd]: [1000, 1500] } },
  { what: 'Proteus Augmented Plating: plate mass penalty reduction 25% -> 37.5%', type: 'Proteus Defensive - Augmented Plating', set: { [A.plateMassAdd]: [-25, -37.5] } },
  { what: 'Legion Liquid Crystal Magnifiers: powergrid +400 -> +430', type: 'Legion Offensive - Liquid Crystal Magnifiers', set: { [A.power]: [400, 430] } },
  { what: 'Loki Projectile Scoping Array: powergrid +300 -> +330', type: 'Loki Offensive - Projectile Scoping Array', set: { [A.power]: [300, 330] } },
  { what: 'Tengu Magnetic Infusion Basin: damage 5% -> 7.5%', type: 'Tengu Offensive - Magnetic Infusion Basin', set: { [A.calOff2]: [5, 7.5] } },
  { what: 'Defender Launcher I: activation cost 50 -> 5 GJ', type: 'Defender Launcher I', set: { [A.capNeed]: [50, 5] } },
  { what: 'Defender Missile I: flight time 3 s -> 5 s', type: 'Defender Missile I', set: { [A.explosionDelay]: [3000, 5000] } },
  { what: 'Void Bomb: explosion delay 7.5 s -> 12 s, speed 4,000 -> 2,500', type: 'Void Bomb', set: { [A.explosionDelay]: [7500, 12000], [A.velocity]: [4000, 2500] } },
  { what: 'Integrated Sensor Array: active +20% light fighter attack explosion velocity, -10% explosion radius', type: 'Integrated Sensor Array',
    set: { 991001: [undefined, 20], 991002: [undefined, -10] } },
  // Navy light fighters: shield HP, ability damage, speed, sensor strength.
  ...[
    ['Imperial Navy Templar', A.radar, 7, 10, { [A.atkEM]: [103, 108], [A.msEM]: [187.5, 196.5] }, [867, 910]],
    ['Caldari Navy Dragonfly', A.grav, 7, 10, { [A.atkKin]: [113.5, 118.5], [A.msKin]: [208, 219] }, [785, 824]],
    ['Federation Navy Firbolg', A.mag, 7, 10, { [A.atkTh]: [118.5, 124.5], [A.msTh]: [217.5, 228] }, [743, 780]],
    ['Republic Fleet Einherji', A.ladar, 7, 10, { [A.atkExp]: [97.5, 102], [A.msExp]: [178, 186] }, [908, 953]],
  ].map(([type, sensor, s0, s1, dmg, [v0, v1]]) => ({ what: `${type}: shield 5,445 -> 7,260, damage, speed, sensor strength`, type,
    set: { [A.shield]: [5445, 7260], ...dmg, [A.velocity]: [v0, v1], [sensor]: [s0, s1] } })),
  ...[
    ['Imperial Navy Equite', A.radar, A.msEM, [40, 42], [1040, 1092]],
    ['Caldari Navy Locust', A.grav, A.msKin, [42, 44], [941, 988]],
    ['Federation Navy Satyr', A.mag, A.msTh, [44, 46], [892, 937]],
    ['Republic Fleet Gram', A.ladar, A.msExp, [38, 40], [1090, 1145]],
  ].map(([type, sensor, dmgAttr, dmg, [v0, v1]]) => ({ what: `${type}: shield 2,640 -> 3,520, damage, speed, sensor strength`, type,
    set: { [A.shield]: [2640, 3520], [dmgAttr]: dmg, [A.velocity]: [v0, v1], [sensor]: [8, 12] } })),
  // Tech II heavy fighters now require their racial Fighter Specialization, which is what gives them
  // its +2%/lvl damage (calc.js reads the specialization a fighter names in its required skills).
  ...[
    ['Ametat II', 'Amarr', 92397], ['Malleus II', 'Amarr', 92397], ['Antaeus II', 'Gallente', 92398], ['Cyclops II', 'Gallente', 92398],
    ['Gungnir II', 'Minmatar', 92399], ['Tyrfing II', 'Minmatar', 92399], ['Termite II', 'Caldari', 92400], ['Mantis II', 'Caldari', 92400],
  ].map(([type, race, skillID]) => ({ what: `${type}: requires ${race} Fighter Specialization`, type,
    set: { [A.reqSkill3]: [undefined, skillID], [A.reqSkill3Level]: [undefined, 1] }, rs: `${race} Fighter Specialization` })),
];

/** What was applied, by description — for the regression suite and anyone asking. */
export const APPLIED_BALANCE = [];

/** Mutates the raw dogma bundles. Before initEngine(). Returns the descriptions applied. */
export function applyPrereleaseBalance(types, effects, attrs) {
  if (APPLIED_BALANCE.length) return APPLIED_BALANCE;
  const idOf = new Map(Object.entries(types).map(([id, t]) => [t.n, id]));
  for (const [id, a] of Object.entries(NEW_ATTRS)) attrs[id] ??= a;
  for (const [id, e] of Object.entries(NEW_EFFECTS)) effects[id] ??= e;
  for (const c of CHANGES) {
    const t = types[idOf.get(c.type)];
    if (!t) continue;
    const a = t.a ?? {};
    const sameAsFrom = Object.entries(c.set ?? {}).every(([k, [from]]) => from === undefined ? a[k] == null : a[k] === from);
    const effectsAsFrom = (c.drop ?? []).every(e => t.e.includes(e)) && (c.add ?? []).every(e => !t.e.includes(e));
    if (!sameAsFrom || !effectsAsFrom) continue;   // CCP's data has moved on: this one retires
    for (const [k, [, to]] of Object.entries(c.set ?? {})) a[k] = to;
    t.a = a;
    if (c.drop || c.add) t.e = [...t.e.filter(e => !(c.drop ?? []).includes(e)), ...(c.add ?? [])];
    if (c.rs && !(t.rs ?? []).includes(c.rs)) t.rs = [...(t.rs ?? []), c.rs];
    APPLIED_BALANCE.push(c.what);
  }
  return APPLIED_BALANCE;
}

// Trait text, edited line by line. Each edit names the line it expects; a line that is no longer
// there (CCP's text has changed) is left alone, like the value changes above.
// [type, section ('skills' header text or 'role'), match {number, text}, replacement lines]
const TRAIT_EDITS = [
  ['Sacrilege', 'Amarr Cruiser bonuses (per skill level):', { number: '5%', text: 'bonus to Heavy Missile and Heavy Assault Missile damage' },
    [{ number: '7.5%', text: 'bonus to Heavy Missile and Heavy Assault Missile damage' }]],
  ['Sacrilege', 'Heavy Assault Cruisers bonuses (per skill level):', { number: '7.5%', text: 'bonus to Rapid Light Missile, Heavy Missile and Heavy Assault Missile Launcher rate of fire' },
    [{ number: '5%', text: 'bonus to Rapid Light Missile, Heavy Missile and Heavy Assault Missile Launcher rate of fire' }]],
  ['Cerberus', 'Caldari Cruiser bonuses (per skill level):', { number: '2.5%', text: 'bonus to Light Missile, Heavy Missile and Heavy Assault Missile damage' },
    [{ number: '5%', text: 'bonus to Light Missile, Heavy Missile and Heavy Assault Missile kinetic damage' },
     { number: '2.5%', text: 'bonus to Light Missile, Heavy Missile and Heavy Assault Missile EM, thermal and explosive damage' }]],
  ['Hawk', 'Caldari Frigate bonuses (per skill level):', { number: '7.5%', text: 'bonus to Light Missile and Rocket damage' },
    [{ number: '10%', text: 'bonus to Light Missile and Rocket kinetic damage' },
     { number: '5%', text: 'bonus to Light Missile and Rocket EM, thermal and explosive damage' }]],
  ['Vengeance', 'Assault Frigates bonuses (per skill level):', { number: '5%', text: 'bonus to ship capacitor recharge rate' },
    [{ number: '3%', text: 'bonus to Armor hitpoints' }]],
  ['Tengu Core - Electronic Efficiency Gate', 'Caldari Core Systems bonuses (per skill level):', { number: '5%', text: 'bonus to max targeting range' },
    [{ number: '5%', text: 'bonus to max targeting range' }, { number: '3%', text: 'bonus to Sensor Warfare and Weapon Disruption resistances' }]],
  ['Proteus Core - Electronic Efficiency Gate', 'Gallente Core Systems bonuses (per skill level):', { number: '5%', text: 'bonus to max targeting range' },
    [{ number: '5%', text: 'bonus to max targeting range' }, { number: '3%', text: 'bonus to Sensor Warfare and Weapon Disruption resistances' }]],
  ['Tengu Core - Obfuscation Manifold', 'Caldari Core Systems bonuses (per skill level):', { number: '10%', text: 'bonus to ECM Target Jammer strength and optimal range' },
    [{ number: '12.5%', text: 'bonus to ECM Target Jammer strength and optimal range' }]],
  ['Tengu Core - Obfuscation Manifold', 'role', { text: '• +3 Mid Slots, +1 Low Slot' }, [{ text: '• +3 Mid Slots, +1 Low Slot' }, { text: '• +500 Armor HP' }]],
  ['Legion Defensive - Augmented Plating', 'role', { text: '• +1000 Armor HP' }, [{ text: '• +1500 Armor HP' }]],
  ['Proteus Defensive - Augmented Plating', 'role', { number: '25%', text: 'reduction in Armor Plate mass penalty' },
    [{ number: '37.5%', text: 'reduction in Armor Plate mass penalty' }]],
  ['Legion Offensive - Liquid Crystal Magnifiers', 'role', { text: '• +400 PWG, +90 CPU' }, [{ text: '• +430 PWG, +90 CPU' }]],
  ['Loki Offensive - Projectile Scoping Array', 'role', { text: '• +300 PWG, +30 CPU' }, [{ text: '• +330 PWG, +30 CPU' }]],
  ['Tengu Offensive - Magnetic Infusion Basin', 'Caldari Offensive Systems bonuses (per skill level):', { number: '5%', text: 'bonus to Medium Hybrid Turret damage' },
    [{ number: '7.5%', text: 'bonus to Medium Hybrid Turret damage' }]],
];

/**
 * Applies the trait edits to core.js's shipTraits (typeID -> traits), for the types whose balance
 * change is live. `idOf(name)` is the name -> typeID lookup. Copies each entry it touches.
 */
export function applyPrereleaseTraitEdits(shipTraits, idOf) {
  let edited = 0;
  for (const [type, section, match, lines] of TRAIT_EDITS) {
    // Only where the type's balance change is live: text describing a change that has retired
    // would contradict CCP's own (by then updated) traits.
    const change = CHANGES.find(c => c.type === type);
    if (!change || !APPLIED_BALANCE.includes(change.what)) continue;
    const id = idOf(type), tr = id != null ? shipTraits[id] : null;
    if (!tr) continue;
    const next = { ...tr, skills: (tr.skills ?? []).map(s => ({ ...s, bonuses: [...s.bonuses] })), role: tr.role && { ...tr.role, bonuses: [...tr.role.bonuses] } };
    const list = section === 'role' ? next.role?.bonuses : next.skills.find(s => s.header === section)?.bonuses;
    const at = list ? list.findIndex(b => (b.number ?? null) === (match.number ?? null) && b.text === match.text) : -1;
    if (at < 0) continue;
    list.splice(at, 1, ...lines);
    shipTraits[id] = next;
    edited++;
  }
  return edited;
}
