// Generic projected effects: a stock T2 EWAR module projected onto the fit, as many as you like, with
// no source fit to carry it — the projected-module half of pyfa's Projected view, and the projected
// counterpart of lib/command-links.js. Stored in a fit's projFits beside the projected FITS, as
//   { kind: "module", module, script, qty, rangeKm, active }
// and resolved here to a synthetic source fit: `qty` copies of the module, charged with `script`, on
// a Capsule. A Capsule has no hull bonuses, so each module projects at its own strength with every
// skill at V, which is how pyfa projects a bare module — and the effect then goes through exactly the
// path a projected fit does (computeProjectedReps, then range, resistance and stacking).
//
// Pure, no React: the regression suite pins the numbers.

export const MODULE_KIND = "module";
export const MAX_QTY = 10;
const SOURCE_HULL = "Capsule";

// [module, rack, scripts]. `null` in scripts is "no script", which a disruptor or damp runs at half
// strength on both of its attributes. Names are CCP's and stay English.
export const PROJECTED_MODULES = [
  ["Stasis Webifier II", "mid"],
  ["Target Painter II", "mid"],
  ["Remote Sensor Dampener II", "mid", [null, "Targeting Range Dampening Script", "Scan Resolution Dampening Script"]],
  ["Tracking Disruptor II", "mid", [null, "Optimal Range Disruption Script", "Tracking Speed Disruption Script"]],
  ["Guidance Disruptor II", "mid", [null, "Missile Range Disruption Script", "Missile Precision Disruption Script"]],
  ["Small Energy Neutralizer II", "high"],
  ["Medium Energy Neutralizer II", "high"],
  ["Heavy Energy Neutralizer II", "high"],
].map(([module, rack, scripts]) => ({ module, rack, scripts: scripts ?? null }));

const DEF = Object.fromEntries(PROJECTED_MODULES.map(d => [d.module, d]));
export const scriptsFor = (module) => DEF[module]?.scripts ?? null;

export const isProjectedModule = (entry) => entry?.kind === MODULE_KIND;
export const clampQty = (n) => Math.max(1, Math.min(MAX_QTY, Math.round(Number(n) || 1)));
/** A new entry, one module, unscripted. */
export const makeProjectedModule = (module, rangeKm = 10) =>
  ({ kind: MODULE_KIND, module, script: null, qty: 1, rangeKm });

/** "2× Tracking Disruptor II". */
export const projectedModuleLabel = (entry) => `${clampQty(entry?.qty)}× ${entry?.module ?? ""}`;
/** "Optimal Range Disruption" for "Optimal Range Disruption Script"; null for no script. */
export const scriptLabel = (script) => script ? script.replace(/ Script$/, "") : null;

/** The synthetic source fit for an entry, or null for a module this table does not know. */
export function projectedModuleFit(entry, tidByName) {
  const d = DEF[entry?.module];
  if (!d) return null;
  const typeID = tidByName(d.module);
  if (!typeID) return null;
  const script = d.scripts?.includes(entry.script) ? entry.script : null;
  const mods = Array.from({ length: clampQty(entry.qty) }, (_, i) => ({
    id: `pm${i}`, name: d.module, typeID, type: "passive", state: "active", ...(script ? { ammo: script } : {}) }));
  return { name: projectedModuleLabel(entry), generic: true,
           slots: { high: d.rack === "high" ? mods : [], mid: d.rack === "mid" ? mods : [], low: [], rigs: [] } };
}

/**
 * Who a projFits entry is: { ship, fit } for a projected fit found in `fitsDB`, the synthetic Capsule
 * fit for a generic module, null when a saved fit has since been deleted. Every reader of projFits goes
 * through this, so a generic entry can never reach code that looks it up by ship and fit name.
 */
export function projectedSource(entry, fitsDB, tidByName) {
  if (isProjectedModule(entry)) {
    const fit = projectedModuleFit(entry, tidByName);
    return fit ? { ship: SOURCE_HULL, fit } : null;
  }
  const fit = fitsDB?.[entry?.ship]?.find(f => f.name === entry?.fitName);
  return fit ? { ship: entry.ship, fit } : null;
}
