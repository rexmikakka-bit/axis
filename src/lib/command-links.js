// Generic command links: warfare bursts at a chosen strength, without a booster fit to carry them —
// pyfa's "Generic Links" (eos/saveddata/commandLink.py), whose table and formula this mirrors so the
// two tools give one number. Stored in a fit's command list beside the command FITS, as
//   { kind: "link", linkType, strength, mindlink, active }
// and turned into the same {buffID, value, label} bursts a command fit produces (calc.js
// computeCommandBursts), so collectBursts' strongest-of-each-buff rule treats both alike.
//
// Strength is the command ship's hull bonus per level, at level V; on top of it every link assumes max
// Command Specialist skills and a T2 burst, and optionally a warfare mindlink:
//   value = base × 1.5 (skills) × 1.25 (T2) × (1 + 5 × strength%) × (1.25 with mindlink)
//
// Only the buffs calc.js applies are offered: Shield, Armor, Skirmish and Information. Expedition and
// Mining bursts are not modelled by the engine (from a real command fit either), so offering them here
// would add a link that changes nothing.
//
// Pure, no React: the regression suite pins the numbers.

export const LINK_KIND = "link";
export const STRENGTHS = [5, 4, 3, 2, 1, 0];
export const ALL_LINKS = "all";

const SKILL_MULTIPLIER = 1.5, TECH_MULTIPLIER = 1.25, MINDLINK_MULTIPLIER = 1.25;

// buffID -> base value: the command burst charge's warfareBuffXMultiplier (pyfa's table).
const BASE = {
  10: -8.0, 11: -8.0, 12: 8.0,
  13: -8.0, 14: -8.0, 15: 8.0,
  20: -6.0, 60: -6.0, 21: 12.0, 22: 12.0,
  16: 9.0, 26: 18.0, 17: 9.0, 18: 18.0, 19: -9.0,
};

// linkType -> [label, category, buffIDs]. Labels are CCP's burst charge names, which stay English.
export const LINK_DEFS = {
  shield_all: ["All Shield Links", "shield", [10, 11, 12]],
  shield_harmonizing: ["Shield Harmonizing", "shield", [10]],
  shield_active: ["Active Shielding", "shield", [11]],
  shield_extension: ["Shield Extension", "shield", [12]],
  armor_all: ["All Armor Links", "armor", [13, 14, 15]],
  armor_energizing: ["Armor Energizing", "armor", [13]],
  armor_rapid: ["Rapid Repair", "armor", [14]],
  armor_reinforcement: ["Armor Reinforcement", "armor", [15]],
  skirmish_all: ["All Skirmish Links", "skirmish", [20, 60, 21, 22]],
  skirmish_evasive: ["Evasive Maneuvers", "skirmish", [20, 60]],
  skirmish_interdiction: ["Interdiction Maneuvers", "skirmish", [21]],
  skirmish_rapid: ["Rapid Deployment", "skirmish", [22]],
  information_all: ["All Information Links", "information", [16, 26, 17, 18, 19]],
  info_sensor: ["Sensor Optimization", "information", [16, 26]],
  info_superiority: ["Electronic Superiority", "information", [17]],
  info_hardening: ["Electronic Hardening", "information", [18, 19]],
};
// In category order (shield, armor, skirmish, information), so its lines read the way the menu does.
LINK_DEFS[ALL_LINKS] = ["All Links", null, [...new Set(["shield_all", "armor_all", "skirmish_all", "information_all"].flatMap(k => LINK_DEFS[k][2]))]];
/** Every link buff is a percentage. */
export const LINK_UNIT = "%";

export const CATEGORIES = [["shield", "Shield"], ["armor", "Armor"], ["skirmish", "Skirmish"], ["information", "Information"]];
/** A category's link types, its "All …" first. */
export const linksOf = (category) => Object.keys(LINK_DEFS).filter(k => LINK_DEFS[k][1] === category)
  .sort((a, b) => (a.endsWith("_all") ? 0 : 1) - (b.endsWith("_all") ? 0 : 1));

export function linkMultiplier(strength, mindlink) {
  return SKILL_MULTIPLIER * TECH_MULTIPLIER * (1 + (Number(strength) || 0) / 100 * 5) * (mindlink ? MINDLINK_MULTIPLIER : 1);
}

export const isLink = (entry) => entry?.kind === LINK_KIND;
/** A new link entry (pyfa's Max Links is `makeLink(ALL_LINKS, 5, true)`). */
export const makeLink = (linkType, strength, mindlink) => ({ kind: LINK_KIND, linkType, strength: Number(strength), mindlink: !!mindlink });

/** "Skirmish · Evasive Maneuvers", "All Links". */
export function linkLabel(entry) {
  const d = LINK_DEFS[entry?.linkType];
  if (!d) return String(entry?.linkType ?? "");
  const cat = CATEGORIES.find(c => c[0] === d[1])?.[1];
  return cat && !entry.linkType.endsWith("_all") ? `${cat} · ${d[0]}` : d[0];
}
/** "5%/lvl + Mindlink". */
export const strengthLabel = (entry, mindlinkWord = "Mindlink") => `${entry.strength}%/lvl${entry.mindlink ? ` + ${mindlinkWord}` : ""}`;

/** The bursts a link applies: {buffID, value, label}, as computeCommandBursts returns. */
export function linkBursts(entry) {
  const d = LINK_DEFS[entry?.linkType];
  if (!d || !STRENGTHS.includes(Number(entry.strength))) return [];
  const m = linkMultiplier(entry.strength, entry.mindlink), label = `${d[0]} (${strengthLabel(entry)})`;
  return d[2].filter(id => BASE[id] != null).map(buffID => ({ buffID, value: BASE[buffID] * m, label }));
}

/** A stored link read back: the same shape, or null when it is not one this build can apply. */
export function cleanLink(raw) {
  if (!isLink(raw) || !LINK_DEFS[raw.linkType] || !STRENGTHS.includes(Number(raw.strength))) return null;
  return { ...makeLink(raw.linkType, raw.strength, raw.mindlink), ...(raw.active === false ? { active: false } : {}) };
}

// What each buff does, for a line per buff under a link ("Signature radius −17.6%"). English, as the
// rest of this file; the screens translate them where they are drawn.
export const BUFF_NAMES = {
  10: "Shield resistances", 11: "Shield repair cycle and cap", 12: "Shield HP",
  13: "Armor resistances", 14: "Armor repair cycle and cap", 15: "Armor HP",
  20: "Signature radius", 60: "Agility", 21: "Tackle range", 22: "Propulsion speed boost",
  16: "Scan resolution", 26: "Targeting range", 17: "EWAR range and strength", 18: "Sensor strength", 19: "EWAR resistance",
};
