// The level of the pre-release Synchronization Rigging skill (data/prerelease-rigs.js).
//
// App-wide and outside the skill sheet on purpose. The skill is not in the game data yet, so no character has it:
// an ESI-synced pilot would always read 0 and an unset one would read V, and neither is something a
// user can change from where they are looking. App.jsx instead lays this one level over every
// pilot's skills, and the control for it sits in plain sight (Settings > Skills, and the rig's own
// info sheet). Delete with the rigs.
//
// A tiny external store so the settings panel, the info sheet and App.jsx all see one value.

import { useSyncExternalStore } from "react";

const KEY = "axis_prerelease_synchronizer_rigging";
const listeners = new Set();

function read() {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (localStorage.getItem(KEY) != null && Number.isInteger(v) && v >= 0 && v <= 5) return v;
  } catch {}
  return 5; // unset skills count as V everywhere else in Axis
}

let level = read();

export function getSyncSkillLevel() { return level; }

export function setSyncSkillLevel(v) {
  level = Math.max(0, Math.min(5, Math.round(Number(v) || 0)));
  try { localStorage.setItem(KEY, String(level)); } catch {}
  for (const l of listeners) l();
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

export function useSyncSkillLevel() {
  return useSyncExternalStore(subscribe, getSyncSkillLevel, getSyncSkillLevel);
}
