// What a Synchronizer rig does, spelled out for its Info page (Fractured Skies). The rig's numbers
// are plain attributes (rigHybridTurretDamageBonus 5, hullHpBonus 5, ...), but on their own they read
// as a list of internal names: what each one bonuses lives in the rig's EFFECTS, and that every
// fitted faction module grows all of them lives in a set effect. This reads both out of the data, so
// a new Synchronizer, or CCP moving a bonus, shows up here without an edit.
//
// How the data is shaped (dogma-engine.js _applyRigSetMarkers has the mechanics):
//   - a self effect adds (op 2) or subtracts (op 3) rigSet<Faction>Bonus to each bonus attribute;
//     those are the bonuses that grow, and op 3 is how a negative one grows in magnitude;
//   - most bonuses then reach the ship through one modifier each (a group, a skill, or the hull);
//   - a turret or missile damage bonus goes through a hidden multiplier first: a modifier on the
//     rig's own group writes it, and a second modifier carries it to the weapons.
import { TYPES, EFFECTS_DATA, ATTR_META } from "../dogma-engine-init.js";
import { t } from "./i18n.js";

export const SYNCHRONIZER_GROUP = 5140;

// What a modified attribute is called on the page. Anything missing falls back to its own name.
const TARGET_LABEL = {
  damageMultiplier: () => t("Damage"), missileDamageMultiplier: () => t("Missile damage"),
  hp: () => t("Structure HP"), armorHP: () => t("Armor HP"), shieldCapacity: () => t("Shield HP"),
  capacitorCapacity: () => t("Capacitor capacity"), armorDamageAmount: () => t("Repair amount"),
  trackingSpeed: () => t("Tracking"), capacitorNeed: () => t("Activation cost"), maxVelocity: () => t("Velocity"),
  duration: () => t("Cycle time"), maxTargetRange: () => t("Lock range"), powerTransferAmount: () => t("Drain amount"),
  energyNeutralizerAmount: () => t("Neutralization amount"), overloadSelfDurationBonus: () => t("Overheat bonus"),
  overloadSpeedFactorBonus: () => t("Overheat bonus"), maxRange: () => t("Optimal range"),
  falloff: () => t("Falloff"), falloffEffectiveness: () => t("Falloff"), speedFactor: () => t("Speed boost"),
  stasisWebifierResistance: () => t("Incoming web strength"), signatureRadius: () => t("Signature radius"),
  warpSpeedMultiplier: () => t("Warp speed"), cpuOutput: () => t("CPU output"),
  scanGravimetricStrengthBonus: () => t("Jam strength"), scanLadarStrengthBonus: () => t("Jam strength"),
  scanMagnetometricStrengthBonus: () => t("Jam strength"), scanRadarStrengthBonus: () => t("Jam strength"),
  shieldEmDamageResonance: () => t("Shield EM resistance"), shieldThermalDamageResonance: () => t("Shield thermal resistance"),
  shieldKineticDamageResonance: () => t("Shield kinetic resistance"), shieldExplosiveDamageResonance: () => t("Shield explosive resistance"),
  armorEmDamageResonance: () => t("Armor EM resistance"), armorThermalDamageResonance: () => t("Armor thermal resistance"),
  armorKineticDamageResonance: () => t("Armor kinetic resistance"), armorExplosiveDamageResonance: () => t("Armor explosive resistance"),
};
// What a bonus applies to, by the group or skill its modifier names. Anything missing falls back to
// the group's or skill's own name; the hull itself needs none.
const GROUP_SCOPE = { 53: () => t("energy turrets"), 55: () => t("projectile turrets"), 74: () => t("hybrid turrets"),
  68: () => t("energy nosferatu"), 71: () => t("energy neutralizers"), 201: () => t("ECM") };
const SKILL_SCOPE = { 3393: () => t("armor repairers"), 3416: () => t("shield boosters"), 21802: () => t("capital shield boosters"),
  3319: () => t("missiles"), 3450: () => t("afterburners"), 3436: () => t("drones"), 3427: () => t("ECM") };

const attrName = (id) => ATTR_META[id]?.n ?? ATTR_META[String(id)]?.n ?? null;
const camel = (n) => String(n).replace(/([a-z\d])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
let groupNames = null;
const groupName = (g) => {
  if (!groupNames) { groupNames = new Map(); for (const ty of Object.values(TYPES)) if (ty?.g != null && ty.gn && !groupNames.has(ty.g)) groupNames.set(ty.g, ty.gn); }
  return groupNames.get(Number(g)) ?? null;
};
function scopeOf(m) {
  if (m.groupID != null) return GROUP_SCOPE[m.groupID]?.() ?? groupName(m.groupID);
  if (m.skillTypeID != null) return SKILL_SCOPE[m.skillTypeID]?.() ?? TYPES[m.skillTypeID]?.n ?? null;
  return null;
}
const isResonance = (n) => /DamageResonance$/.test(n ?? "");
const mods = (typeID) => (TYPES[typeID]?.e ?? []).flatMap(eid => EFFECTS_DATA[eid]?.m ?? EFFECTS_DATA[String(eid)]?.m ?? []);

/**
 * A Synchronizer's bonuses, or null for any other item:
 * {faction, setAttr, perModule, bonuses: [{attr, label, scope, sign}], drawback: {attr, label} | null}.
 * `attr` is the rig's own attribute holding the number; `sign` turns it into what the row prints
 * (-1 for a resonance, which the page shows as a resistance gained). Bonuses that print the same
 * label for the same attribute are one row, their scopes joined.
 */
export function synchronizerBonuses(typeID) {
  const td = TYPES[typeID] ?? TYPES[String(typeID)];
  if (!td || Number(td.g) !== SYNCHRONIZER_GROUP) return null;
  const all = mods(typeID);
  const setAttr = Object.keys(td.attrs ?? {}).find(n => /^rigSet.+Bonus$/.test(n));
  const setID = all.find(m => attrName(m.modifyingAttributeID) === setAttr)?.modifyingAttributeID;
  const growing = [...new Set(all.filter(m => setID != null && m.modifyingAttributeID === setID).map(m => m.modifiedAttributeID))];
  const rows = [];
  const add = (bonusID, m) => {
    const target = attrName(m.modifiedAttributeID);
    const label = TARGET_LABEL[target]?.() ?? camel(target);
    const scope = scopeOf(m), attr = attrName(bonusID), sign = isResonance(target) ? -1 : 1;
    const same = rows.find(r => r.attr === attr && r.label === label);
    if (same) { if (scope && !same.scopes.includes(scope)) same.scopes.push(scope); return; }
    rows.push({ attr, label, scopes: scope ? [scope] : [], sign });
  };
  for (const bonusID of growing) {
    for (const m of all.filter(x => x.modifyingAttributeID === bonusID && x.domain !== "itemID")) {
      // The hidden-multiplier hop: the rig writes it on itself (its own group), then carries it on.
      if (m.func === "LocationGroupModifier" && Number(m.groupID) === SYNCHRONIZER_GROUP) {
        for (const m2 of all.filter(x => x.modifyingAttributeID === m.modifiedAttributeID)) add(bonusID, m2);
      } else add(bonusID, m);
    }
  }
  const dm = all.find(m => attrName(m.modifyingAttributeID) === "drawback");
  const drawback = dm ? { attr: "drawback", label: TARGET_LABEL[attrName(dm.modifiedAttributeID)]?.() ?? camel(attrName(dm.modifiedAttributeID)) } : null;
  // What one fitted faction module adds: its rigSet<Faction>Module (1 for every one today).
  const markerName = setAttr?.replace(/Bonus$/, "Module");
  const marker = markerName ? Object.values(TYPES).find(ty => ty?.attrs?.[markerName] != null) : null;
  return {
    faction: String(td.n ?? "").replace(/^(Small|Medium|Large|Capital|X-Large)\s+/, "").replace(/\s+Synchronizer$/, ""),
    setAttr, perModule: marker?.attrs?.[markerName] ?? 1, drawback,
    bonuses: rows.map(r => ({ attr: r.attr, label: r.scopes.length ? `${r.label} (${r.scopes.join(", ")})` : r.label, sign: r.sign })),
    // Everything above, so the page's attribute list can leave them out instead of repeating them.
    attrs: [setAttr, ...growing.map(attrName), ...all.filter(m => m.func === "LocationGroupModifier" && Number(m.groupID) === SYNCHRONIZER_GROUP).map(m => attrName(m.modifiedAttributeID)), dm && "drawback"].filter(Boolean),
  };
}
