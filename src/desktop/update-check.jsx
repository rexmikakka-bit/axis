/* global __AXIS_DESKTOP_VERSION__ */
import { useEffect, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { openExternal } from "./os-window.js";
import { TYPE } from "./kit.jsx";

// "A new version of Axis is out" — pyfa's update notice, for the desktop app. On launch, at most once a
// day, it asks GitHub for the newest desktop release (tags "desktop-X.Y.Z", prereleases included: every
// desktop build is one for now) and compares it with the version this build was made from. A newer
// one gets a card in the corner: Download opens the release page, Later hides it until the next
// launch, Skip this version stays quiet until a newer one still. Offline or any error: silence.
//
// Notify only. Installing in place is Tauri's updater plugin, which needs a signing key and a
// latest.json per release; this needs neither, and nothing here would have to change to add it.

export const APP_VERSION = typeof __AXIS_DESKTOP_VERSION__ === "string" ? __AXIS_DESKTOP_VERSION__ : "0.0.0";
const RELEASES = "https://api.github.com/repos/rexmikakka-bit/axis/releases?per_page=30";
const CHECK_KEY = "axis_update_check";   // {at, latest: {version, url}} — the last answer, and when
const SKIP_KEY = "axis_update_skip";     // a version the user said to skip
const DAY = 24 * 60 * 60 * 1000;

const parse = (v) => (String(v).match(/^(\d+)\.(\d+)\.(\d+)$/) ?? []).slice(1).map(Number);
/** 1 if a is newer than b, -1 if older, 0 if the same (or either is unreadable). */
export function compareVersions(a, b) {
  const x = parse(a), y = parse(b);
  if (x.length !== 3 || y.length !== 3) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) ?? "null"); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* not remembered */ } };

/** The newest desktop release on GitHub, {version, url}, or null. Throws on a network error. */
async function fetchLatest() {
  const res = await fetch(RELEASES, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  let best = null;
  for (const r of await res.json()) {
    const v = /^desktop-(\d+\.\d+\.\d+)$/.exec(r?.tag_name ?? "")?.[1];
    if (!v || r.draft) continue;
    if (!best || compareVersions(v, best.version) > 0) best = { version: v, url: r.html_url };
  }
  return best;
}

/**
 * The newest release if it is newer than this build. `force` (Settings' button) asks GitHub now and
 * ignores the skip; otherwise a day-old answer is reused and a skipped version stays quiet.
 * Returns {latest, newer} — latest may be null if GitHub has none or could not be reached.
 */
export async function checkForUpdate({ force = false } = {}) {
  const saved = read(CHECK_KEY);
  let latest = saved?.latest ?? null;
  if (force || !saved || !(Date.now() - saved.at < DAY)) {
    latest = await fetchLatest();
    write(CHECK_KEY, { at: Date.now(), latest });
  }
  const newer = !!latest && compareVersions(latest.version, APP_VERSION) > 0 && (force || read(SKIP_KEY) !== latest.version);
  return { latest, newer };
}

/** The corner card. Mounted once, in the main window. */
export function UpdateBanner() {
  const [latest, setLatest] = useState(null);
  useEffect(() => {
    let live = true;
    // A moment after launch, so the check never competes with the app's own loading.
    const id = setTimeout(() => {
      checkForUpdate().then(({ latest: l, newer }) => { if (live && newer) setLatest(l); }).catch(() => { /* offline: say nothing */ });
    }, 4000);
    return () => { live = false; clearTimeout(id); };
  }, []);
  if (!latest) return null;
  const btn = (primary) => ({ height: 28, padding: "0 12px", borderRadius: 6, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
    background: primary ? C.accent : "transparent", border: `1px solid ${primary ? C.accent : C.borderStrong}`, color: primary ? C.bg : C.text });
  return (
    <div role="status" aria-live="polite" style={{ position: "fixed", right: 16, bottom: 48, zIndex: 650, width: 320, maxWidth: "calc(100vw - 32px)",
      background: C.surface, border: `1px solid ${C.accent}`, borderRadius: 10, padding: "12px 14px", boxShadow: "0 10px 30px rgba(0,0,0,.45)" }}>
      <div style={{ fontSize: TYPE.value, color: C.text, fontWeight: 600 }}>{t("Axis {version} is out", { version: latest.version })}</div>
      <div style={{ fontSize: TYPE.small, color: C.textMid, marginTop: 3 }}>{t("You have {version}. The download page has what changed.", { version: APP_VERSION })}</div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" style={btn(true)} onClick={() => { openExternal(latest.url); setLatest(null); }}>{t("Download")}</button>
        <button type="button" style={btn()} onClick={() => setLatest(null)}>{t("Later")}</button>
        <button type="button" style={{ ...btn(), border: "none", color: C.textMid }} onClick={() => { write(SKIP_KEY, latest.version); setLatest(null); }}>{t("Skip this version")}</button>
      </div>
    </div>
  );
}

/** Settings > About: the version, and a check on demand. */
export function UpdateCheckRow() {
  const [state, setState] = useState(null);   // null | "checking" | {latest, newer} | "error"
  const check = () => {
    setState("checking");
    checkForUpdate({ force: true }).then(setState).catch(() => setState("error"));
  };
  const btn = { height: 28, padding: "0 12px", borderRadius: 6, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
    background: C.surfaceAlt, border: `1px solid ${C.borderStrong}`, color: C.text };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "12px 0 4px" }}>
      <span style={{ fontSize: TYPE.label, color: C.text }}>{t("Version {version}", { version: APP_VERSION })}</span>
      <button type="button" style={btn} disabled={state === "checking"} onClick={check}>{state === "checking" ? t("Checking…") : t("Check for updates")}</button>
      {state === "error" && <span style={{ fontSize: TYPE.small, color: C.danger }}>{t("Couldn't reach GitHub. Try again later.")}</span>}
      {state && typeof state === "object" && (state.newer
        ? <span style={{ fontSize: TYPE.small, color: C.text }}>{t("Axis {version} is out", { version: state.latest.version })} ·{" "}
            <button type="button" onClick={() => openExternal(state.latest.url)} style={{ border: "none", background: "none", padding: 0, color: C.accent, cursor: "pointer", font: "inherit" }}>{t("Download")}</button></span>
        : <span style={{ fontSize: TYPE.small, color: C.success }}>{t("You're up to date")}</span>)}
    </div>
  );
}
