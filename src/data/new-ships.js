// Hulls CCP has shipped but our eve.db does not carry yet: the Alliance Tournament XXI Amarr hulls.
//
// Hand-copied from CCP's own static data, NOT generated: SDE build 3662168 (2026-10-30), files
// types.jsonl, typeDogma.jsonl, typeBonus.jsonl and dogmaEffects.jsonl from
// https://developers.eveonline.com/static-data. Every attribute value, effect, skill requirement and
// fitting allowance below is CCP's. The bundles come from pyfa's eve.db, and no pyfa release has
// these hulls yet (v2.69.3 is the latest), so nothing here is pyfa-validated.
//
// History: until 2026-11-01 this file was prerelease-ships.js, built from CCP's preview screenshots
// with placeholder typeIDs 990001/990002 and the UI labelled both hulls "Pre-release". The live data
// corrected three things the screenshots got wrong: Herald shield kinetic resist 70% (not 55%),
// Herald capacitor recharge 187.5 s (not 187 s), and neither hull needs a third skill to fly.
//
// How it gets in: dogma-engine-init.js calls applyNewShips() on the raw bundles BEFORE initEngine(),
// so the engine, the ship browser (backfillHullsFromTypes files any category-6 type by its group
// name) and lookupShip()'s shipFromDogma() all see these as ordinary hulls.
//
// It retires itself piece by piece: a hull, effect, attribute, skill effect or fitting allowance is
// added only if the bundle does not already have it. Once a regenerated bundle carries both hulls,
// delete this file and its call sites (dogma-engine-init.js, core.js's shipTraits merge).
//
// ⚠️ pyfa 2.69.3's eve.db (build 3624425) contains pyfa's OWN hand copies of both hulls, under
// invented typeIDs 1000000/1000001 and with bonuses as eos effects 100100-100209 that carry no
// modifier data. Regenerating from that db would put a second, bonus-less "Herald" and "Penitence"
// in the bundle alongside these. Stay on 3579973, or have build-bundle.py drop those two typeIDs,
// until a pyfa eve.db carries CCP's real types (97793/97904).
//
// Descriptions: the Penitence's is CCP's, with its two U+FFFD characters (CCP's broken quote marks)
// restored to quotes and its "Penintence" typo fixed. The Herald's in CCP's data is a copy-paste mistake: it is the "Sanguinary
// Savant" SKIN blurb, which 35 SKINs share. We keep the text CCP's preview showed instead.

const HERALD = 97793, PENITENCE = 97904;

// New in this build: the Herald's laser optimal bonus moved to its own attribute (571), and the
// Penitence's drone range bonus is a new one (6476). Each has a skill effect that scales it by level.
const NEW_EFFECTS = {
  13042: { c: 0, m: [{ domain: 'shipID', func: 'LocationRequiredSkillModifier', modifiedAttributeID: 54, modifyingAttributeID: 571, operation: 6, skillTypeID: 3303 }] }, // eliteBonusGunshipLaserOptimal2
  13044: { c: 0, m: [{ domain: 'shipID', func: 'ItemModifier', modifiedAttributeID: 571, modifyingAttributeID: 280, operation: 0 }] },  // gunshipSkillMultiplier3 (Assault Frigates)
  13045: { c: 0, m: [{ domain: 'charID', func: 'ItemModifier', modifiedAttributeID: 458, modifyingAttributeID: 6476, operation: 2 }] }, // eliteBonusHeavyGunshipDroneControlRange2
  13046: { c: 0, m: [{ domain: 'shipID', func: 'ItemModifier', modifiedAttributeID: 6476, modifyingAttributeID: 280, operation: 0 }] }, // warshipSkillMultiplier3 (Amarr Cruiser)
};
const NEW_ATTRS = { 6476: { n: 'eliteBonusHeavyGunship3', s: 1, h: 1, d: 0 } };
const SKILL_EFFECTS = { 'Assault Frigates': 13044, 'Amarr Cruiser': 13046 };

const SHIPS = [
  {
    id: HERALD, name: 'Herald', g: 893, gn: 'Electronic Attack Ship', mg: 4, ml: 5,
    rs: ['Amarr Frigate', 'Electronic Attack Ships'],
    a: {
      3: 0, 4: 1010100, 9: 1100, 11: 69, 12: 5, 13: 5, 14: 2, 15: 0, 19: 1, 21: 0, 37: 420, 38: 165,
      48: 222, 49: 0, 55: 187500, 70: 3.3, 76: 69000, 79: 2000, 101: 0, 102: 2, 109: 0.67, 110: 0.67,
      111: 0.67, 113: 0.67, 124: 16777215, 129: 15, 136: 1, 153: 1.67e-06, 161: 28100, 162: 39,
      182: 3331, 183: 28615, 188: 0, 192: 7, 208: 21, 209: 0, 210: 0, 211: 0, 217: 394, 246: 394,
      263: 664, 265: 1337, 267: 0.5, 268: 0.2, 269: 0.375, 270: 0.65, 271: 1, 272: 0.125, 273: 0.3,
      274: 0.8, 277: 5, 278: 1, 283: 60, 422: 2, 464: -5, 479: 625000, 482: 675, 484: 0.75, 485: 12.5,
      511: 0, 524: 0.75, 525: 1, 552: 35, 564: 650, 571: 20, 600: 5, 633: 5, 661: 3000, 662: 0.05,
      673: -4, 675: 40, 1132: 400, 1137: 2, 1154: 2, 1178: 100, 1179: 0.01, 1196: 0.01, 1198: 0.01,
      1199: 100, 1200: 100, 1224: 1, 1250: -5, 1259: 0.5, 1261: 0.63, 1262: 0.5, 1271: 20, 1281: 1,
      1547: 1, 1555: 50, 1768: 11338, 1803: -50, 2045: 0.5, 2112: 1, 2113: 1, 2115: 1,
      5796: 2147483647000, 6364: 9000,
    },
    e: [1179, 3241, 3242, 3243, 3244, 3466, 4902, 6354, 7018, 13042],
    // canFitShipType1 (1302) = the Herald on every Assault Damage Control.
    fits: [47254, 47255, 47256, 47257, 47258, 52230, 84961],
    traits: {
      skills: [
        { header: 'Amarr Frigate bonuses (per skill level):', bonuses: [
          { number: '12.5%', text: 'bonus to Weapon Disruptor effectiveness' },
          { number: '5%', text: 'bonus to Small Energy Turret rate of fire' }] },
        { header: 'Assault Frigates bonuses (per skill level):', bonuses: [
          { number: '20%', text: 'bonus to Small Energy Turret optimal range' },
          { number: '40%', text: 'bonus to Small Energy Turret damage' },
          { number: '4%', text: 'bonus to all armor resistances' }] },
        { header: 'Electronic Attack Ships bonuses (per skill level):', bonuses: [
          { number: '5%', text: 'reduction in ship capacitor recharge time' }] },
      ],
      role: { header: 'Role Bonus:', bonuses: [
        { number: '50%', text: 'increase in capacitor warfare resistance' },
        { number: '50%', text: 'reduction in Microwarpdrive signature radius penalty' },
        { text: '• Can fit Assault Damage Controls' }] },
      desc: 'His Justice is Swift and Decisive. His Tolerance is Limited.\n– The Scriptures, Book I, The Code of Demeanor\n\nEmpress Catiz Tash-Murkon watched closely as the Caldari awarded vessels surrounded by controversy and accusations of pirate-connections for Alliance Tournament XXI.',
    },
  },
  {
    id: PENITENCE, name: 'Penitence', g: 906, gn: 'Combat Recon Ship', mg: 4, ml: 5, vp: 1,
    rs: ['Amarr Cruiser', 'Recon Ships'],
    a: {
      3: 0, 4: 11810000, 9: 2400, 11: 1450, 12: 7, 13: 6, 14: 5, 15: 0, 19: 1, 21: 0, 37: 230, 38: 475,
      48: 460, 49: 0, 55: 360000, 70: 0.48, 76: 110500, 79: 4500, 101: 4, 102: 2, 109: 0.67, 110: 0.67,
      111: 0.67, 113: 0.67, 124: 16777215, 129: 580, 136: 1, 153: 8.13e-07, 161: 118000, 162: 176,
      182: 3335, 183: 22761, 188: 0, 192: 10, 208: 28, 209: 0, 210: 0, 211: 0, 217: 394, 246: 394,
      263: 2730, 265: 3540, 267: 0.5, 268: 0.2, 269: 0.375, 270: 0.65, 271: 1, 272: 0.125, 273: 0.3,
      274: 0.8, 277: 5, 278: 1, 283: 300, 422: 2, 478: 10, 479: 1250000, 482: 3800, 484: 0.75,
      524: 0.75, 525: 1, 552: 140, 564: 300, 600: 4, 633: 5, 656: 25, 793: 12.5, 962: 50, 963: 40,
      1132: 400, 1137: 2, 1154: 2, 1178: 100, 1179: 0.01, 1196: 0.01, 1198: 0.01, 1199: 100,
      1200: 100, 1224: 0.75, 1247: 10, 1259: 0.71, 1261: 0.76, 1262: 0.63, 1271: 50, 1281: 1,
      1537: 30, 1547: 2, 1555: 200, 1768: 11337, 1825: -20, 1958: 1, 2045: 1, 2112: 1, 2113: 1,
      2115: 1, 3250: -50, 5796: 2147483647000, 6364: 11500, 6476: 7500,
    },
    e: [1910, 2181, 2189, 2305, 3468, 4994, 4995, 4996, 4997, 5165, 6230, 6233, 6234, 6238, 6395, 8362, 13045],
    // canFitShipType1 (1302) = the Penitence on every Warp Disruption Field Generator and on the plain
    // Cynosural Field Generator I (not the covert or industrial cynos).
    fits: [4248, 21096, 28654, 37608, 37610, 37611, 37612, 37613, 85035],
    traits: {
      skills: [
        { header: 'Amarr Cruiser bonuses (per skill level):', bonuses: [
          { number: '10%', text: 'bonus to Weapon Disruptor effectiveness' },
          { number: '25%', text: 'bonus to Drone hitpoints and damage' },
          { text: '7500m bonus to Drone operation range' }] },
        { header: 'Recon Ships bonuses (per skill level):', bonuses: [
          { number: '50%', text: 'bonus to Energy Nosferatu and Energy Neutralizer optimal range' },
          { number: '30%', text: 'bonus to Energy Nosferatu and Energy Neutralizer falloff range' },
          { number: '40%', text: 'bonus to Energy Nosferatu and Energy Neutralizer drain amount' }] },
        { header: 'Heavy Interdiction Cruisers bonuses (per skill level):', bonuses: [
          { number: '10%', text: 'bonus to Warp Disruption Field Generator range' }] },
      ],
      role: { header: 'Role Bonus:', bonuses: [
        { text: '• Cannot be detected by directional scanners' },
        { text: '• Can fit Warp Disruption Field Generator and Cynosural Field Generator modules' },
        { number: '20%', text: 'bonus to all armor resistances' },
        { number: '12.5%', text: 'bonus to Drone microwarp velocity' },
        { number: '50%', text: 'reduction to signature radius penalty from Warp Disruption Field Generator' }] },
      desc: 'Empress Catiz Tash-Murkon watched closely as the Caldari awarded vessels surrounded by controversy and accusations of pirate-connections for Alliance Tournament XXI. Wanting to send a clear message of Amarrian faith, solidarity, and strength, she therefore commissioned two powerful and significant designs from Khanid Innovations, in a symbolic gesture toward the kingdom she helped bring closer to the Empire through her trade agreements.\n\nIn an official statement introducing the Penitence, the Empress states: “The enemies of Amarr need to be reminded that the empire was destined by God to rule over the universe in His name. The Penitence is a symbolic spearhead ready to pierce the heart of blasphemers and harbingers of sin. By placing the most formidable pilots in New Eden in these exclusive hulls, we send a clear message.\n\nOnly the penitent will be spared, should they encounter the holy wrath of the Amarr empire.”',
    },
  },
];

// Trait entries for core.js to merge into shipTraits, filled in by applyNewShips() for the hulls it
// actually added.
export const NEW_SHIP_TRAITS = {};

const CAN_FIT_SHIP_TYPE_1 = 1302;

/** Mutates the raw dogma bundles. Must run before initEngine() converts attribute IDs to names. */
export function applyNewShips(types, effects, attrs) {
  const live = SHIPS.filter(s => !types[s.id]);
  if (!live.length) return [];

  for (const [id, e] of Object.entries(NEW_EFFECTS)) effects[id] ??= e;
  for (const [id, a] of Object.entries(NEW_ATTRS)) attrs[id] ??= a;
  for (const [name, eff] of Object.entries(SKILL_EFFECTS)) {
    const skill = Object.values(types).find(t => t.n === name && t.c === 16);
    if (skill && !skill.e?.includes(eff)) skill.e = [...(skill.e ?? []), eff];
  }

  for (const s of live) {
    const { id, name, g, gn, mg, ml, vp, rs, a, e } = s;
    types[id] = { n: name, g, gn, c: 6, a: { ...a }, e: [...e], rs, mg, ml, ...(vp ? { vp } : {}) };
    NEW_SHIP_TRAITS[id] = s.traits;
    for (const mid of s.fits) {
      const t = types[mid];
      if (t?.a && t.a[CAN_FIT_SHIP_TYPE_1] == null) t.a = { ...t.a, [CAN_FIT_SHIP_TYPE_1]: id };
    }
  }
  return live.map(s => s.name);
}
