import { TYPES, tidByName, calcFitStats, stackingPenalty } from "../calc.js";
import { buildExternalBursts, buildProjectedEffects } from "./projection.js";

// A SAVED FIT standing in for the target on the damage graph, reduced to the two things the
// application maths actually asks a target for: signature radius and speed.
//
// Deliberately NOT resists. Those stay with Stats > Firepower, which is the single place the target
// resist profile is set — a DPS curve silently pre-corrected for one hull's resist spread is harder
// to read, not easier, because the arithmetic you are doing in your head no longer matches what is
// drawn. Sig and speed are different: they feed tracking and missile application, which nobody does
// in their head.
//
// Lives here rather than in GraphTab.jsx so the regression suite can reach it — the suite cannot
// import JSX, and this is the only part of the feature with real numbers in it.

const PROP_GROUPS = new Set(['Propulsion Module', 'Afterburner', 'Microwarpdrive']);
const MJD_GROUPS = new Set(['Micro Jump Drive', 'Micro Jump Field Generators']);
const EFF_MWD = 6730;   // moduleBonusMicrowarpdrive — the one thing that tells an MWD from an AB
const ON = new Set(['active', 'overheated']);
const RACKS = ['high', 'mid', 'low'];

const slotTid = (m) => m?.typeID ?? tidByName(m?.name);

/** Is this slot entry a prop mod? Slot entries carry `typeID`, `name`, or both. */
export function isPropSlot(m) {
  const t = slotTid(m);
  return !!t && PROP_GROUPS.has(TYPES[t]?.gn);
}
const isMjdSlot = (m) => { const t = slotTid(m); return !!t && MJD_GROUPS.has(TYPES[t]?.gn); };

// "Core X-Type 500MN Microwarpdrive" -> "500MN MWD". The chip has to fit three of these on a phone
// row (tri-prop), and the size and kind are what tell them apart; the full name rides on the title.
function propLabel(name, kind) {
  const size = (name ?? '').match(/(\d+)\s*MN/i);
  return `${size ? `${size[1]}MN ` : ''}${kind === 'mwd' ? 'MWD' : 'AB'}`;
}

/**
 * The fitted prop mods on `fit`, and which one it was saved running.
 *
 * A ship runs at most ONE prop mod: group 46 carries maxGroupActive 1, so a dual- or tri-prop fit
 * (100MN AB + 50MN MWD + 10MN AB) is a choice of which one is on, never a sum. The MJD is a
 * different group and runs alongside, blooming sig +150% while it spools.
 */
export function targetFitProps(fit) {
  const props = [], seen = new Set();
  let savedProp = 'none', hasMjd = false, savedMjd = false;
  for (const rack of RACKS) (fit?.slots?.[rack] ?? []).forEach((m, i) => {
    if (!m) return;
    if (isMjdSlot(m)) { hasMjd = true; if (ON.has(m.state)) savedMjd = true; return; }
    if (!isPropSlot(m)) return;
    const tid = slotTid(m);
    const id = `${rack}:${i}`;
    if (ON.has(m.state) && savedProp === 'none') savedProp = id;
    // Two identical unmutated modules are the same choice; a mutated one is its own roll.
    const dupKey = m.mutaplasmid ? id : String(tid);
    if (seen.has(dupKey)) { if (savedProp === id) savedProp = props.find(p => p.tid === tid)?.id ?? id; return; }
    seen.add(dupKey);
    const kind = (TYPES[tid]?.e ?? []).includes(EFF_MWD) ? 'mwd' : 'ab';
    const name = m.name ?? TYPES[tid]?.n ?? '';
    props.push({ id, tid, name, kind, label: propLabel(name, kind) });
  });
  return { props, savedProp, hasMjd, savedMjd };
}

/**
 * The sig/speed a saved fit presents with a chosen prop mod running, and what a warp scrambler
 * leaves of it.
 *
 * The prop STATE is forced rather than read off the fit as saved: which one its owner happened to
 * leave on is not the question being asked. `sel.prop` is a prop id from targetFitProps, 'none', or
 * absent for "as saved"; `sel.mjd` likewise. Every other prop mod is set to 'online' — fitted but
 * idle, so its mass and fitting cost stay — since only one can run.
 *
 * The fit's OWN surroundings come with it: the command links it sits under and the modules
 * projected onto it (`ctx.fitsDB` + `ctx.sourceSkills`, resolved exactly as App does for the fit you
 * are editing). Without them a Tempest painted by a Vigil read 360 m here and 1022 m on its own page.
 * Incoming painters and webs are ALSO handed back per source in `incoming`, because your own
 * painters and webs land in the same stacking pool as theirs — see stackedOnTop.
 *
 * A scrambler shuts off a microwarpdrive and a micro jump drive, never an afterburner. Against a
 * fit running its MWD, `scrammed` falls back to the fastest afterburner it also carries — the
 * reason anyone fits both — or to no prop at all. Null when a scram changes nothing.
 *
 * Returns null if the fit cannot be computed at all; the caller shows the reference as stale rather
 * than silently resetting the engagement.
 */
export function targetFitProfile(shipName, fit, skills, sel = {}, ctx = {}) {
  const ref = { name: shipName, typeID: tidByName(shipName) };
  if (!ref.typeID || !fit?.slots) return null;
  const { props, savedProp, hasMjd, savedMjd } = targetFitProps(fit);
  const prop = sel.prop === 'none' || props.some(p => p.id === sel.prop) ? sel.prop : savedProp;
  const mjd = hasMjd && (sel.mjd ?? savedMjd);
  const propTid = props.find(p => p.id === prop)?.tid;

  const fitsDB = ctx.fitsDB, sourceSkills = ctx.sourceSkills ?? (() => skills);
  let externalBursts = [], pe = null;
  try {
    if (fitsDB) {
      externalBursts = buildExternalBursts(fit.cmdFits, fitsDB, sourceSkills);
      pe = buildProjectedEffects({ projFits: fit.projFits, fitsDB, sourceSkills, shipName,
                                   slots: fit.slots, skills, externalBursts, implants: fit.implants, boosters: fit.boosters });
    }
  } catch { pe = null; }
  const opts = { implants: fit.implants, boosters: fit.boosters, externalBursts,
                 pilotSec: fit.slots.pilotSec, systemSecurity: fit.slots.systemSecurity,
                 projectedWebMult: pe?.webMult, projectedDebuffs: pe?.debuffs, projectedBoosts: pe?.boosts };

  // Force the chosen prop (by slot id) on and every other prop to idle; MJDs on or idle together.
  const forced = (pickId, mjdOn) => {
    let picked = false, mjdPicked = false;
    const mapSlot = (rack) => (fit.slots[rack] || []).map((m, i) => {
      if (!m) return m;
      if (isMjdSlot(m)) {
        // One MJD at a time, like the prop mods (maxGroupActive 1).
        const on = mjdOn && !mjdPicked;
        if (on) mjdPicked = true;
        const st = on ? (ON.has(m.state) ? m.state : 'active') : (ON.has(m.state) ? 'online' : m.state);
        return st === m.state ? m : { ...m, state: st };
      }
      if (!isPropSlot(m)) return m;
      const want = !picked && pickId != null && `${rack}:${i}` === pickId;
      if (want) picked = true;
      const st = want ? (ON.has(m.state) ? m.state : 'active') : (ON.has(m.state) ? 'online' : m.state);
      return st === m.state ? m : { ...m, state: st };
    });
    return { ...fit.slots, high: mapSlot('high'), mid: mapSlot('mid'), low: mapSlot('low') };
  };
  const run = (slots) => {
    try {
      const cs = calcFitStats(ref, slots, fit.drones ?? [], skills, opts);
      return cs ? { sig: cs.sigRadius, vel: Math.round(cs.maxVelocityAB ?? cs.maxVelocity ?? 0) } : null;
    } catch { return null; }
  };
  const now = run(forced(prop === 'none' ? null : prop, mjd));
  if (!now) return null;

  let scrammed = null;
  const runningMwd = props.find(p => p.id === prop)?.kind === 'mwd';
  if (runningMwd || mjd) {
    let best = null;
    if (runningMwd) {
      for (const ab of props.filter(p => p.kind === 'ab')) {
        const r = run(forced(ab.id, false));
        if (r && (!best || r.vel > best.vel)) best = { ...r, prop: ab.id };
      }
    } else if (propTid != null) {
      const r = run(forced(prop, false));
      if (r) best = { ...r, prop };
    }
    scrammed = best ?? (() => { const r = run(forced(null, false)); return r ? { ...r, prop: 'none' } : null; })();
  }

  return { ...now, scrammed, props, prop, hasMjd, mjd, savedProp, savedMjd,
           incoming: { sigList: pe?.sigList ?? [], webList: pe?.webList ?? [] } };
}

/**
 * How much YOUR painters (or webs) add on top of what the target already has on it, as one
 * multiplier to apply to its already-painted sig (or webbed speed).
 *
 * Every painter on a ship shares one stacking pool, whoever owns it, so a second painter is worth
 * less than the first no matter whose it is. Multiplying your own stack onto the target's painted
 * sig would give both painters full strength. This is stack(theirs + yours) / stack(theirs).
 * `theirs`/`yours` are multipliers (1.3 = +30%, 0.4 = a 60% web).
 */
export function stackedOnTop(theirs, yours) {
  if (!yours?.length) return 1;
  if (!theirs?.length) return stackingPenalty(yours);
  return stackingPenalty([...theirs, ...yours]) / stackingPenalty(theirs);
}
