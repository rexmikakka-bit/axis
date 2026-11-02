import { computeCommandBursts, computeProjectedReps, projectionResistances, assistanceFactors,
         applyRemoteRepDiminishing, calcRangeFactor, stackingPenalty, tidByName } from "../calc.js";

// What OTHER fits do to a fit: the command links it sits under and the modules projected onto it.
//
// Lifted out of App.jsx so the damage graph can apply them to its target fit. The graph used to read
// a target fit bare, so a Tempest under a Vigil's painter showed 360 m on the graph against the 1022 m
// on its own page, and the same Tempest under skirmish links lost both its sig reduction and its speed.
// One function means the two cannot drift apart.

export const NO_BURSTS = [];
// Identity-stable on purpose: App's memos compare by reference, and a fresh object here would make a
// single tap recalculate the whole fit twice. `sigList`/`webList` are the per-source values before
// stacking, for a caller that has to stack its OWN painters and webs into the same pool.
export const NO_PROJECTION = {reps:{shield:0,armor:0,hull:0},webMult:1,neutGJs:0,capGJs:0,capEntries:[],
  debuffs:null,boosts:{lock:[],scan:[]},ecm:[],ecmResist:1,sigList:[],webList:[]};

/** Every active command fit in `cmdFitsList`, resolved against `fitsDB`, as one burst list. */
export function buildExternalBursts(cmdFitsList, fitsDB, sourceSkills) {
  const out=[];
  for(const cf of (cmdFitsList??[])){
    // `active` is opt-OUT (undefined counts as on), so fits saved before the toggle existed keep
    // applying and no storage migration is needed.
    if(cf.active===false)continue;
    const fit=fitsDB?.[cf.ship]?.find(f=>f.name===cf.fitName);
    if(!fit)continue;
    // The BOOSTER'S OWN fit decides who flies it: its `slots.pilot` if it names one, otherwise the
    // app-wide sheet — the same resolution the Effects tab uses to DRAW this list. That shared
    // resolver is the point. The two used to be computed separately and silently disagreed: the
    // applied burst took the local sheet while the card beside it was hardcoded to all V, so a
    // Vargur under Sleipnir links read 141.9k EHP against pyfa's 146k with the card still saying
    // 22.5%. They only matched while every skill was unset (and so defaulted to V); the moment a
    // real character was synced from ESI they came apart.
    const bursts=computeCommandBursts({name:cf.ship,typeID:tidByName(cf.ship)},fit.slots,sourceSkills(fit),{implants:fit.implants,boosters:fit.boosters});
    for(const b of bursts)out.push(b);
  }
  return out.length?out:NO_BURSTS;
}

/**
 * The combined effect of `projFits` on the ship `shipName` fitted with `slots`, which is flown on
 * `skills` and sits under `externalBursts`. Returns NO_PROJECTION when nothing is projected.
 */
export function buildProjectedEffects({projFits, fitsDB, sourceSkills, shipName, slots, skills, externalBursts}) {
  if(!projFits?.length)return NO_PROJECTION;
  // Collected, not summed: incoming remote reps go through a diminishing-returns curve that
  // needs every source's amount AND cycle time together (applyRemoteRepDiminishing).
  const repEntries={shield:[],armor:[],hull:[]};
  const webMults=[]; let neutGJs=0, capGJs=0;
  const capEntries=[];   // projected Remote Capacitor Transmitters, kept for the Projected list
  const col={sig:[],lock:[],scan:[],trk:[],topt:[],tfall:[],mrng:[],edly:[],avel:[],acld:[]};
  const boosts={lock:[],scan:[]};   // projected Remote Sensor Boosters -> attribute pool, not the debuff stack
  // ECM is kept as raw per-type strengths, range-factored but NOT yet reduced to one number —
  // which of the four attributes matters depends on the TARGET's sensor type, which calcFitStats
  // (not this function) knows. See calcFitStats's jamChance for the combination itself.
  const ecmEntries=[];
  // Target EWAR resistance. Overwhelmingly a COMMAND BURST effect (buff 19, Electronic Hardening)
  // rather than a hull attribute, so externalBursts has to go in or every boosted fit reads as
  // having no resistance and projected damps/disruptors hit at full strength. Applied PER SOURCE
  // MODULE, before stacking — stack(b*r) != stack(b)*r, and eos does the former.
  const R=shipName?projectionResistances({name:shipName,typeID:tidByName(shipName)},slots,skills,{externalBursts}):null;
  const rz=k=>(R&&Number.isFinite(R[k])?R[k]:1);
  // disallowAssistance (in practice: an ACTIVE HIC bubble) refuses ALL incoming remote
  // assistance - reps and remote sensor boosters - while still taking EWAR normally. Short of
  // that, Siege/Triage/Bastion/Industrial Core IMPEDANCE scales each kind down (to ~0 for reps
  // and cap). assistanceFactors folds both rules into one multiplier per kind.
  const AF=assistanceFactors(R);
  for(const pf of projFits){
    if(pf.active===false)continue;   // see buildExternalBursts — opt-out, so old saves stay active
    const fit=fitsDB?.[pf.ship]?.find(f=>f.name===pf.fitName);
    if(!fit)continue;
    // A PROJECTED fit is another pilot's ship, so the local skill sheet has no business scaling its
    // logi reps, webs or neuts — sourceSkills resolves it from that fit's own pilot.
    // The projected fit's OWN command links (e.g. a Guardian sitting under its own Sleipnir's
    // Rapid Repair burst) boost ITS reps before they ever reach the target — read from that
    // fit's saved cmdFits, not the locally-edited fit's, or a boosted logi projects as if unboosted.
    const eff=computeProjectedReps({name:pf.ship,typeID:tidByName(pf.ship)},fit.slots,sourceSkills(fit),{implants:fit.implants,boosters:fit.boosters,drones:fit.drones,externalBursts:buildExternalBursts(fit.cmdFits,fitsDB,sourceSkills)});
    const rangeM=(pf.rangeKm??30)*1000;
    const rf=(o,fo)=>calcRangeFactor(o,fo,rangeM,true);
    if(AF.rep>0)for(const r of eff.reps)repEntries[r.kind].push({amount:r.amount*AF.rep*rf(r.optimal,r.falloff),cycleS:r.cycleS});
    for(const w of eff.webs)webMults.push(1+(w.speedFactor*rz('web')*rf(w.optimal,w.falloff))/100);
    for(const n of eff.neuts)neutGJs+=n.gjPerSec*rz('neut')*rf(n.optimal,n.falloff);
    // Remote capacitor transfer is ASSISTANCE: refused wholesale by disallowAssistance (an
    // active HIC bubble), and NOT reduced by the target's EWAR resistance the way a neut is.
    // Capacitor impedance (siege et al.) does reduce it.
    if(AF.cap>0)for(const c of (eff.caps||[])){const g=c.gjPerSec*AF.cap*rf(c.optimal,c.falloff);if(g>0){capGJs+=g;capEntries.push({name:c.name,ship:pf.ship,gjPerSec:g});}}
    for(const p of (eff.painters||[]))col.sig.push(p.sigBonus*rz('painter')*rf(p.optimal,p.falloff));
    for(const d of (eff.damps||[])){col.lock.push(d.lockBonus*rz('damp')*rf(d.optimal,d.falloff));col.scan.push(d.scanResBonus*rz('damp')*rf(d.optimal,d.falloff));}
    // Remote Sensor Booster: ASSISTANCE (not resisted), and a BONUS — so it must compete with the
    // ship's own signal amps/Sensor Optimization burst in one penalized group. Only the attribute
    // pool can do that, so these are handed to calcFitStats rather than stacked here.
    if(AF.assist>0)for(const b of (eff.sensorBoosts||[])){if(b.lockBonus)boosts.lock.push(b.lockBonus*AF.assist*rf(b.optimal,b.falloff));if(b.scanResBonus)boosts.scan.push(b.scanResBonus*AF.assist*rf(b.optimal,b.falloff));}
    for(const td of (eff.trackDisr||[])){const f=rz('disrupt')*rf(td.optimal,td.falloff);col.trk.push(td.tracking*f);col.topt.push(td.optimalBonus*f);col.tfall.push(td.falloffBonus*f);}
    for(const g of (eff.guideDisr||[])){const f=rz('disrupt')*rf(g.optimal,g.falloff);col.mrng.push(g.missileRange*f);col.edly.push(g.explosionDelay*f);col.avel.push(g.aoeVel*f);col.acld.push(g.aoeCloud*f);}
    // ECM jammers carry remoteResistanceID 2253 = ECMResistance, so they are resisted like any other
    // EWAR (eos multiplies the strength by getResistance before addProjectedEcm). ECCM is priced in
    // separately, on the denominator: jamChance divides by this fit's engine-computed sensorStrength.
    for(const e of (eff.ecm||[])){const f=rz('ecm')*rf(e.optimal,e.falloff);const bt={};for(const k in e.byType)bt[k]=(e.byType[k]||0)*f;ecmEntries.push({byType:bt,ship:pf.ship});}
  }
  const reps={shield:applyRemoteRepDiminishing(repEntries.shield),armor:applyRemoteRepDiminishing(repEntries.armor),hull:applyRemoteRepDiminishing(repEntries.hull)};
  const webMult=webMults.length?stackingPenalty(webMults):1;
  const stackPct=(arr)=>arr.length?(stackingPenalty(arr.map(p=>1+p/100))-1)*100:0;
  const debuffs={sig:stackPct(col.sig),lockRange:stackPct(col.lock),scanRes:stackPct(col.scan),tracking:stackPct(col.trk),turretOptimal:stackPct(col.topt),turretFalloff:stackPct(col.tfall),missileRange:stackPct(col.mrng),explosionDelay:stackPct(col.edly),aoeVel:stackPct(col.avel),aoeCloud:stackPct(col.acld)};
  const hasDebuff=Object.values(debuffs).some(v=>Math.abs(v)>0.05);
  // ecmResist is handed out so the Projected card can scale a jammer the same way this function
  // does; the card applies its OWN range factor (it has a per-card range slider), so it cannot reuse
  // ecmEntries directly.
  return {reps,webMult,neutGJs,capGJs,capEntries,debuffs:hasDebuff?debuffs:null,boosts,ecm:ecmEntries,ecmResist:rz('ecm'),assist:AF,
          sigList:col.sig,webList:webMults};
}
