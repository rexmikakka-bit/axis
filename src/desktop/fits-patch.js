// The part of a fit library that changed between two snapshots, for sync.js to send to the other
// windows: {ship: its new array, or null if the hull's last fit was deleted}. By reference, because
// the session replaces exactly one hull's array per edit and leaves every other hull's array the
// same object — the same contract fits-store.js's diffFitsDB relies on. Null when nothing changed.
// Kept free of React so the regression suite can pin it.
export function fitsPatch(prev, next) {
  const out = {};
  let any = false;
  for (const k of Object.keys(next ?? {})) if (prev?.[k] !== next[k]) { out[k] = next[k]; any = true; }
  for (const k of Object.keys(prev ?? {})) if (!(k in (next ?? {}))) { out[k] = null; any = true; }
  return any ? out : null;
}

/** `db` with a patch from fitsPatch applied. */
export function applyFitsPatch(db, patch) {
  const next = { ...db };
  for (const [ship, arr] of Object.entries(patch ?? {})) { if (arr == null) delete next[ship]; else next[ship] = arr; }
  return next;
}
