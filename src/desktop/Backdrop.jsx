import { useEffect, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { Dialog, TYPE } from "./kit.jsx";

// Your own picture behind the workspace (Owen, 2026-11-05). It has to stay out of the way of the
// numbers, so it is never shown as-is: it sits under a scrim of the theme's own background colour
// (75% by default) and a blur, both adjustable, and the windows above it keep their solid surfaces.
//
// The picture lives in IndexedDB as a Blob — a photo is megabytes, and localStorage's 5–10 MB is
// already spent on settings — and the knobs in localStorage beside the layout. Desktop only; a
// popped-out window shows no backdrop.

const DB = "axis-desktop", STORE = "blobs", KEY = "background";
const SETTINGS_KEY = "axis_desk_backdrop";
export const BACKDROP_DEFAULTS = { on: true, dim: 75, blur: 4, fit: "cover" };
const MAX_BYTES = 25 * 1024 * 1024;

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no IndexedDB")); return; }
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE); };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve(req?.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}
const readSettings = () => { try { return { ...BACKDROP_DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") }; } catch { return BACKDROP_DEFAULTS; } };

/** The backdrop's picture (as an object URL) and its settings, with setters. */
export function useBackdrop() {
  const [settings, setSettings] = useState(readSettings);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ } }, [settings]);
  const show = (blob) => setUrl(old => { if (old) URL.revokeObjectURL(old); return blob ? URL.createObjectURL(blob) : null; });
  useEffect(() => { idb("readonly", st => st.get(KEY)).then(b => { if (b) show(b); }).catch(() => {}); }, []);
  const setImage = async (file) => {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError(t("That isn't a picture.")); return; }
    if (file.size > MAX_BYTES) { setError(t("That picture is over 25 MB.")); return; }
    try { await idb("readwrite", st => st.put(file, KEY)); show(file); setSettings(s => ({ ...s, on: true })); }
    catch (e) { setError(e.message); }
  };
  const clear = async () => { try { await idb("readwrite", st => st.delete(KEY)); } catch { /* nothing stored */ } show(null); };
  return { settings, setSettings, url, setImage, clear, error };
}

/** The layer itself, for Workspace's `backdrop`: fixed under the windows, never scrolling. */
export function Backdrop({ url, settings }) {
  if (!url || !settings.on) return null;
  const tile = settings.fit === "tile";
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: -24, backgroundImage: `url("${url}")`, backgroundRepeat: tile ? "repeat" : "no-repeat",
                    backgroundSize: tile ? "auto" : settings.fit, backgroundPosition: "center",
                    filter: settings.blur > 0 ? `blur(${settings.blur}px)` : "none" }} />
      <div style={{ position: "absolute", inset: 0, background: C.bg, opacity: settings.dim / 100 }} />
    </div>
  );
}

/** Settings → Workspace background: pick, dim, blur, fit, remove. Changes apply live. */
export function BackdropDialog({ bd, onClose }) {
  const { settings: st, setSettings } = bd;
  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }));
  const row = { display: "grid", gridTemplateColumns: "110px 1fr 52px", alignItems: "center", gap: 12, padding: "8px 16px" };
  const label = { fontSize: TYPE.label, color: C.textMid };
  const btn = (primary) => ({ height: 28, padding: "0 12px", borderRadius: 6, fontSize: 13, cursor: "pointer", background: primary ? C.accent : C.surfaceAlt,
                              border: `1px solid ${primary ? C.accent : C.borderStrong}`, color: primary ? C.bg : C.text });
  return (
    <Dialog title={t("Workspace background")} onClose={onClose} width={460}>
      <div style={{ padding: "12px 16px 4px", fontSize: TYPE.small, color: C.textMid }}>
        {t("A picture of your own behind the windows. It stays dimmed and blurred so the numbers keep their contrast.")}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px" }}>
        {bd.url && <div style={{ width: 96, height: 54, borderRadius: 5, border: `1px solid ${C.border}`, backgroundImage: `url("${bd.url}")`, backgroundSize: "cover", backgroundPosition: "center", flex: "none" }} />}
        <label style={{ ...btn(true), display: "inline-flex", alignItems: "center" }}>
          {bd.url ? t("Choose another…") : t("Choose a picture…")}
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { bd.setImage(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {bd.url && <button type="button" style={btn(false)} onClick={bd.clear}>{t("Remove")}</button>}
        {bd.url && <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: TYPE.label, color: C.text, marginLeft: "auto" }}>
          <input type="checkbox" checked={st.on} onChange={e => set("on", e.target.checked)} style={{ accentColor: C.accent }} />{t("Show")}
        </label>}
      </div>
      {bd.error && <div role="alert" style={{ padding: "0 16px 8px", fontSize: TYPE.small, color: C.danger }}>{bd.error}</div>}
      {/* Never below 40%: under that, a busy picture fights the window edges and the dot grid. */}
      <div style={row}>
        <span style={label}>{t("Dim")}</span>
        <input type="range" min={40} max={95} value={st.dim} onChange={e => set("dim", +e.target.value)} style={{ accentColor: C.accent }} aria-label={t("Dim")} />
        <span style={{ fontSize: TYPE.value, color: C.text, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{st.dim}%</span>
      </div>
      <div style={row}>
        <span style={label}>{t("Blur")}</span>
        <input type="range" min={0} max={20} value={st.blur} onChange={e => set("blur", +e.target.value)} style={{ accentColor: C.accent }} aria-label={t("Blur")} />
        <span style={{ fontSize: TYPE.value, color: C.text, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{st.blur} px</span>
      </div>
      <div style={{ ...row, paddingBottom: 16 }}>
        <span style={label}>{t("Fit")}</span>
        <div style={{ display: "flex", gap: 6 }}>
          {[["cover", t("Fill")], ["contain", t("Fit")], ["tile", t("Tile")]].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={st.fit === k} onClick={() => set("fit", k)}
              style={{ height: 24, padding: "0 10px", borderRadius: 12, fontSize: 12, cursor: "pointer",
                       background: st.fit === k ? C.accentLight : "transparent", border: `1px solid ${st.fit === k ? C.accent : C.borderStrong}`, color: st.fit === k ? C.accent : C.textMid }}>{l}</button>
          ))}
        </div>
        <span />
      </div>
    </Dialog>
  );
}
