// The options a fit's displayed stats are computed with: ONE builder for every place that runs
// calcFitStats on the open fit for display — the phone's Stats page, the desktop stat windows, and
// the snapshot card on both. Each used to spell its own object out, and the snapshot's lost the
// projected webs, neuts and debuffs: a user's card read a Cenotaph's unwebbed speed while the Stats
// tab beside it read the webbed one (2026-11-11). A new calcFitStats option belongs here, and then
// every view gets it.
//
// Takes the session's own fields as they are named there (use-fit-session.js), so a caller passes
// what it already holds rather than re-deriving it.
export function fitStatsOptions({ implants, boosters, factorInReload, externalBursts, projectedEffects, dmgProfile, tgtProfile, slots, fighters } = {}) {
  const pe = projectedEffects;
  return {
    implants, boosters, factorInReload, externalBursts,
    projectedWebMult: pe?.webMult, projectedNeutGJs: pe?.neutGJs, projectedCapGJs: pe?.capGJs, projectedDebuffs: pe?.debuffs,
    projectedBoosts: pe?.boosts, projectedEcm: pe?.ecm,
    damageProfile: dmgProfile?.p, targetResists: tgtProfile?.r,
    pilotSec: slots?.pilotSec, systemSecurity: slots?.systemSecurity,
    fighters: (fighters ?? []).map(f => ({ name: f.name, qty: f.qty ?? 1, active: f.active, abilities: f.abilities })),
  };
}
