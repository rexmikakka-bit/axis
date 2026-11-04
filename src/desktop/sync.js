import { useEffect, useRef } from "react";
import { fitsPatch, applyFitsPatch } from "./fits-patch.js";

// Keeps several desktop windows of the app on one fit session. A popped-out window is the same app
// started as `?satellite=<window id>`; it runs its own useFitSession against the same storage, and
// this hook mirrors every change between them over a BroadcastChannel.
//
// ONE message per render, carrying every value that changed, applied in ONE handler on the other
// side. That is load-bearing, not tidiness: the session autosaves `slots` into whichever fit
// `activeFit` names, so a receiver that took a new activeFit and the old slots in two separate
// renders would write the previous fit's modules into the newly opened one. Applying the whole
// message inside one event handler lets React batch it into a single render.
//
// Echo suppression: a value received is remembered by reference, and the sender side skips any value
// that is still that same object. Structured cloning hands the receiver fresh objects, so the
// receiver's own change detection would otherwise bounce every update straight back.
//
// fitsDB is sent as a patch of the hulls whose arrays changed (the session already replaces exactly
// one hull's array per edit), never the whole library.

const CHANNEL = "axis-session";

// [value key, setter key] on the session object.
export const SYNC_KEYS = [
  ["activeFit", "setActiveFit"], ["slots", "setSlots"], ["drones", "setDrones"], ["fighters", "setFighters"],
  ["cargoItems", "setCargoItems"], ["implants", "setImplants"], ["boosters", "setBoosters"],
  ["projFits", "setProjFits"], ["cmdFits", "setCmdFits"], ["dmgProfile", "setDmgProfile"], ["tgtProfile", "setTgtProfile"],
  ["factorInReload", "setFactorInReload"], ["skills", "setSkills"], ["skillProfiles", "setSkillProfiles"],
  ["openTabs", "setOpenTabs"], ["implantLoadouts", "setImplantLoadouts"], ["priceHub", "setPriceHub"],
  ["priceSource", "setPriceSource"], ["themePref", "setThemePref"], ["locale", "setLocale"],
  ["openInNewTab", "setOpenInNewTab"], ["autoFillHardpoints", "setAutoFillHardpoints"], ["closeBrowserOnAdd", "setCloseBrowserOnAdd"],
];


export function useSessionSync(s, { onMessage } = {}) {
  const sent = useRef(null);        // the session values as of the last message we sent or received
  const remote = useRef(new Map()); // key -> the object we last RECEIVED for it
  const remoteHulls = useRef(new Map());
  const chan = useRef(null);
  const sRef = useRef(s); sRef.current = s;
  const onMsg = useRef(onMessage); onMsg.current = onMessage;

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel(CHANNEL);
    chan.current = c;
    c.onmessage = (e) => {
      const m = e.data;
      if (!m || typeof m !== "object") return;
      if (m.type === "state") {
        const cur = sRef.current;
        for (const [k, setter] of SYNC_KEYS) if (k in m.values) { remote.current.set(k, m.values[k]); cur[setter]?.(m.values[k]); }
        if (m.fits) {
          for (const [ship, arr] of Object.entries(m.fits)) remoteHulls.current.set(ship, arr);
          cur.setFitsDB(db => applyFitsPatch(db, m.fits));
        }
      } else onMsg.current?.(m);
    };
    return () => { c.close(); chan.current = null; };
  }, []);

  // After every render: send whatever changed since last time, in one message.
  useEffect(() => {
    const prev = sent.current;
    const now = Object.fromEntries(SYNC_KEYS.map(([k]) => [k, s[k]]));
    now.fitsDB = s.fitsDB;
    sent.current = now;
    if (!prev || !chan.current) return;
    const values = {};
    let any = false;
    for (const [k] of SYNC_KEYS) {
      if (now[k] === prev[k]) continue;
      if (remote.current.get(k) === now[k]) continue;   // just applied from another window
      values[k] = now[k]; any = true;
    }
    let fits = fitsPatch(prev.fitsDB, now.fitsDB);
    if (fits) {
      for (const ship of Object.keys(fits)) if (remoteHulls.current.get(ship) === fits[ship]) delete fits[ship];
      if (!Object.keys(fits).length) fits = null;
    }
    if (!any && !fits) return;
    try { chan.current.postMessage({ type: "state", values, fits }); } catch { /* an uncloneable value: skip this round */ }
  });

  return {
    post: (m) => { try { chan.current?.postMessage(m); } catch { /* channel closed */ } },
    // Everything, unconditionally: the answer to a newly opened window's "hello", in case this
    // window holds edits the shared storage has not caught up with yet.
    sendAll: () => {
      const cur = sRef.current;
      try { chan.current?.postMessage({ type: "state", values: Object.fromEntries(SYNC_KEYS.map(([k]) => [k, cur[k]])), fits: null }); } catch { /* skip */ }
    },
  };
}
