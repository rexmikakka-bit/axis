import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C, THEMES, THEME_LABELS } from "../theme.js";
import { availableLocales, t } from "../lib/i18n.js";
import { SKILL_CATALOG } from "../calc.js";
import { allPriceableTypeIDs } from "../lib/core.js";
import { primePrices, getCachedPrices } from "../prices.js";
import { SKILL_GROUPS, GROUP_COLORS, SKILL_PRESETS, PRESET_COLORS } from "../components/settings.jsx";
import { useBackup, boldFill } from "../components/backup.jsx";
import { isFallbackMode } from "../lib/fits-store.js";
import * as esi from "../lib/esi.js";
import { ESI_SCOPES } from "../esi-config.js";
import { ASSET_SCOPE, assetLocation } from "../lib/abyssal-library.js";
import { readAbyssals, saveAbyssalScan } from "../lib/abyssal-store.js";
import { scanAbyssals, importAbyssals } from "../lib/abyssal-import.js";
import { requireOnline } from "../lib/network-request.js";
import { EsiSkillAlignPanel, useEsiCharacters, friendlyError } from "../components/esi-ui.jsx";
import { PrereleaseSkillControl } from "../components/prerelease-skill.jsx";
import { BackdropControls } from "./Backdrop.jsx";
import { TYPE, WEIGHT } from "./kit.jsx";

// The desktop Settings window: the phone's settings, laid out for a monitor — the sections down the
// left, the chosen one filling the rest, desktop type sizes and controls. Every setting writes the
// same session value the phone's Settings sheet does, from the same catalogues (SKILL_GROUPS,
// SKILL_PRESETS, availableLocales, THEMES), so the two cannot offer different choices.
//
// Every section is drawn here in desktop controls. Backup and ESI keep the phone's STATE and actions
// (backup.jsx useBackup, esi-ui.jsx useEsiCharacters): file and login flows with careful states, and a
// second copy of those would be a second place for them to go wrong. Only the drawing is the desktop's.

const SECTIONS = [
  ["skills", "Skills"], ["interface", "Interface"], ["market", "Market"],
  ["backup", "Backup"], ["esi", "ESI"], ["about", "About"],
];
const SECTION_KEY = "axis_desk_settings_section";

// Anything can ask for Settings open at a section ("esi" from the Browser's My Abyssals): the section
// is remembered first, so a Settings window that is not open yet starts there, and an open one
// switches. DesktopApp opens the window on the same event.
export const SETTINGS_EVENT = "axis-open-settings";
/** Fired when a sync saves rolls, so the Browser's My Abyssals re-reads them. */
export const ABYSSALS_CHANGED = "axis-abyssals-changed";
export function requestSettings(section) {
  try { localStorage.setItem(SECTION_KEY, section); } catch { /* still switches an open window */ }
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: section }));
}

// ── Small desktop controls ─────────────────────────────────────────────────────────────────────
function Heading({ children, first }) {
  return <div style={{ fontSize: TYPE.section, fontWeight: WEIGHT.value, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid,
                       margin: first ? "0 0 8px" : "22px 0 8px" }}>{children}</div>;
}
function Note({ children }) {
  return <div style={{ fontSize: TYPE.small, color: C.textMid, lineHeight: 1.45, marginTop: 6 }}>{children}</div>;
}
function Switch({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} onClick={() => onChange(!on)}
      style={{ flex: "none", width: 34, height: 20, borderRadius: 10, padding: 2, cursor: "pointer", display: "flex", justifyContent: on ? "flex-end" : "flex-start",
               background: on ? C.accent : C.surfaceAlt, border: `1px solid ${on ? C.accent : C.borderStrong}`, transition: "background .15s" }}>
      <span style={{ width: 14, height: 14, borderRadius: 7, background: on ? C.bg : C.textMid }} />
    </button>
  );
}
/** A setting: its name and what it does on the left, the control on the right. */
function Row({ label, note, children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "10px 0", borderBottom: `1px solid ${C.border}88` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: TYPE.label, color: C.text }}>{label}</div>
        {note && <div style={{ fontSize: TYPE.small, color: C.textMid, lineHeight: 1.45, marginTop: 3 }}>{note}</div>}
      </div>
      <div style={{ flex: "none", paddingTop: 1 }}>{children}</div>
    </div>
  );
}
function Choice({ on, onClick, children, color = C.accent, lang, title }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} lang={lang} title={title}
      style={{ height: 28, padding: "0 12px", borderRadius: 6, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
               background: on ? `${color}22` : C.surfaceAlt, border: `1px solid ${on ? color : C.borderStrong}`, color: on ? color : C.text }}>{children}</button>
  );
}
const Choices = ({ children }) => <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>;
const button = (primary) => ({ height: 28, padding: "0 12px", borderRadius: 6, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
  background: primary ? C.accent : C.surfaceAlt, border: `1px solid ${primary ? C.accent : C.borderStrong}`, color: primary ? C.bg : C.text });
const input = () => ({ height: 28, boxSizing: "border-box", padding: "0 10px", borderRadius: 6, fontSize: 13, background: C.bg, border: `1px solid ${C.borderStrong}`, color: C.text, outline: "none" });

// ── Sections ───────────────────────────────────────────────────────────────────────────────────
function InterfaceSection({ s, bd }) {
  const langs = availableLocales();
  return (
    <>
      {langs.length > 1 && <>
        <Heading first>{t("Language")}</Heading>
        <Choices>{langs.map(l => <Choice key={l.code} lang={l.code} on={(s.locale ?? "en") === l.code} onClick={() => s.setLocale?.(l.code)}>{l.native}</Choice>)}</Choices>
        <Note>{t("Ship, module and charge names stay in English in every language — they are what EFT import and export speak, and what the search box matches on.")}</Note>
      </>}
      <Heading first={langs.length < 2}>{t("Theme")}</Heading>
      <Choices>
        {[["system", t("System")], ...THEMES.map(k => [k, k === "dark" ? t("Dark") : k === "light" ? t("Light") : (THEME_LABELS[k] ?? k)])].map(([k, l]) =>
          <Choice key={k} on={(s.themePref ?? "system") === k} onClick={() => s.setThemePref?.(k)}>{l}</Choice>)}
      </Choices>
      <Note>{t("System follows your device's light/dark setting; the rest pin the app regardless. Amarr, Sansha and Intaki are dark themes, in imperial gold, Nation oxblood and cold slate.")}</Note>
      <Heading>{t("Workspace background")}</Heading>
      {bd ? <div style={{ margin: "0 -16px" }}><BackdropControls bd={bd} /></div>
          : <Note>{t("The workspace background is set from the main Axis window.")}</Note>}
      <Heading>{t("Fits")}</Heading>
      <Row label={t("Always open fits in a new tab")} note={t("Off: opening a fit replaces the tab you are in, and the + in the tab strip opens a new one. On: every fit you open gets its own tab.")}>
        <Switch on={!!s.openInNewTab} onChange={s.setOpenInNewTab} label={t("Always open fits in a new tab")} />
      </Row>
      <Row label={t("Auto-fill hardpoints")} note={t("On: picking a turret or launcher from the browser fills every free matching hardpoint, not just the slot you tapped. Off: it fills only that one slot — use Fill Hardpoints on an existing module to fill the rest by hand.")}>
        <Switch on={s.autoFillHardpoints ?? true} onChange={s.setAutoFillHardpoints} label={t("Auto-fill hardpoints")} />
      </Row>
      <Row label={t("Close the module picker after adding one module")} note={t("On: the picker for an empty slot closes as soon as you pick something. Off: it stays open and moves to the next empty slot in the rack.")}>
        <Switch on={!!s.closeBrowserOnAdd} onChange={s.setCloseBrowserOnAdd} label={t("Close the module picker after adding one module")} />
      </Row>
    </>
  );
}

function MarketSection({ s }) {
  const [busy, setBusy] = useState(null), [result, setResult] = useState(null);
  const stored = useMemo(() => getCachedPrices(s.priceHub, s.priceSource).size, [s.priceHub, s.priceSource, result]);
  // The phone's PriceDownloadPanel: every priceable type, Fuzzwork only (one request per batch there,
  // one per item on ceve-market), and a button rather than something done on its own.
  const download = async () => {
    setResult(null);
    const ids = allPriceableTypeIDs();
    setBusy({ done: 0, total: ids.length });
    try {
      const { priced, total } = await primePrices(ids, s.priceHub, s.priceSource, { onProgress: (done, total) => setBusy({ done, total }) });
      setResult({ ok: true, msg: t("Stored {priced} of {total} prices.", { priced: priced.toLocaleString(), total: total.toLocaleString() }) });
    } catch (e) {
      setResult({ ok: false, msg: e?.offline ? t("No connection — prices could not be downloaded.") : t("Download failed: {err}", { err: e.message }) });
    } finally { setBusy(null); }
  };
  return (
    <>
      <Heading first>{t("Price Source")}</Heading>
      {[["fuzzwork", "Fuzzwork Market", t("sell-order percentile, matching pyfa's default. One request for the whole fit; the fastest option.")],
        ["ceve", "ceve-market.org", t("lowest sell order in the hub's region. One small request per item.")]].map(([k, name, note]) => (
        <label key={k} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", cursor: "pointer" }}>
          <input type="radio" name="pricesource" checked={s.priceSource === k} onChange={() => s.setPriceSource(k)} style={{ accentColor: C.accent, marginTop: 3 }} />
          <span><span style={{ fontSize: TYPE.label, color: C.text }}>{name}</span><span style={{ fontSize: TYPE.small, color: C.textMid }}> — {note}</span></span>
        </label>
      ))}
      <Heading>{t("Market Hub")}</Heading>
      <Choices>{["Jita", "Amarr", "Dodixie", "Rens", "Hek"].map(h => <Choice key={h} on={s.priceHub === h} onClick={() => s.setPriceHub(h)}>{h}</Choice>)}</Choices>
      <Note>{t("All sources cache for 1 hour per hub.")}</Note>
      <Heading>{t("Offline Prices")}</Heading>
      {s.priceSource !== "fuzzwork"
        ? <Note>{t("Only available on Fuzzwork, which prices a whole batch in one request. ceve-market needs one request per item, so downloading everything from it is not practical.")}</Note>
        : <>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button type="button" onClick={download} disabled={!!busy} style={{ ...button(false), opacity: busy ? 0.5 : 1 }}>{busy ? t("Downloading…") : t("Download all prices")}</button>
              <span style={{ fontSize: TYPE.small, color: C.textMid }}>{t("{n} prices stored for {hub}.", { n: stored.toLocaleString(), hub: s.priceHub })}</span>
            </div>
            {busy && <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: TYPE.small, color: C.textMid, marginBottom: 5 }}>{t("{done} / {total} items…", { done: busy.done.toLocaleString(), total: busy.total.toLocaleString() })}</div>
              <div style={{ height: 4, borderRadius: 2, background: C.border, overflow: "hidden" }}><div style={{ height: "100%", background: C.accent, width: `${busy.total ? (busy.done / busy.total) * 100 : 0}%` }} /></div>
            </div>}
            {result && !busy && <div style={{ marginTop: 8, fontSize: TYPE.small, color: result.ok ? C.success : C.danger }}>{result.msg}</div>}
            <Note>{t("Downloaded prices stay usable offline and show their age wherever they appear. Items with no sell order in the hub stay blank.")}</Note>
          </>}
    </>
  );
}

function SkillsSection({ s }) {
  const skills = s.skills ?? {};
  const lvl = (k) => skills[k] ?? 0;
  const setSkills = s.setSkills;
  const [open, setOpen] = useState({});
  const [query, setQuery] = useState("");
  const [naming, setNaming] = useState(null);
  const [renaming, setRenaming] = useState(null);   // {id, text}
  const profiles = s.skillProfiles ?? [];
  const matches = (map) => SKILL_CATALOG.every(e => lvl(e.key) === (map[e.key] ?? 0));
  const trainedIn = (map) => SKILL_CATALOG.filter(e => (map?.[e.key] ?? 5) > 0).length;
  const q = query.trim().toLowerCase();
  const groups = q ? SKILL_GROUPS.map(g => ({ ...g, skills: g.skills.filter(k => k.label.toLowerCase().includes(q)) })).filter(g => g.skills.length) : SKILL_GROUPS;
  const saveProfile = () => {
    const name = (naming ?? "").trim(); setNaming(null);
    if (name) s.setSkillProfiles(prev => [...(prev ?? []), { id: String(Date.now()), name, skills: { ...skills } }]);
  };
  const renameProfile = () => {
    const name = (renaming?.text ?? "").trim();
    if (renaming && name) s.setSkillProfiles(prev => prev.map(p => p.id === renaming.id ? { ...p, name } : p));
    setRenaming(null);
  };
  const LevelButtons = ({ k, color }) => (
    <div style={{ display: "flex", gap: 2 }}>
      {[0, 1, 2, 3, 4, 5].map(n => {
        const on = n === 0 ? lvl(k) === 0 : lvl(k) >= n;
        return (
          <button key={n} type="button" onClick={() => setSkills(prev => ({ ...prev, [k]: n }))} title={n === 0 ? t("Untrained") : t("Set to level {n}", { n })}
            aria-pressed={lvl(k) === n}
            style={{ width: 22, height: 20, padding: 0, borderRadius: 3, fontSize: 11.5, cursor: "pointer", fontVariantNumeric: "tabular-nums",
                     border: `1px solid ${lvl(k) === n ? color : "transparent"}`,
                     background: n === 0 ? "transparent" : on ? `${color}cc` : C.surfaceAlt, color: n === 0 ? (on ? C.text : C.textMute) : on ? C.bg : C.textMid }}>{n === 0 ? "–" : n}</button>
        );
      })}
    </div>
  );
  return (
    <>
      <Heading first>{t("Skill sheet")}</Heading>
      <Note>{t("Your own skills. A fit uses them only when its pilot is set to “My skills” with the pilot button above the fit; every other fit is flown at All Skills V unless you pick a pilot for it.")}</Note>
      <div style={{ height: 8 }} />
      <Choices>
        {SKILL_PRESETS.map(p => <Choice key={p.id} on={matches(p.map)} color={PRESET_COLORS[p.id]} onClick={() => setSkills({ ...p.map })}>{p.label()}</Choice>)}
      </Choices>
      <Note>{t("Unset skills count as level V. Alpha is CCP's own clone ceiling, from the game data. A fit can fly a different pilot from its Pilot button.")}</Note>
      <div style={{ marginTop: 12 }}><EsiSkillAlignPanel setSkills={setSkills} /></div>
      <PrereleaseSkillControl />

      <Heading>{t("Skill profiles")}</Heading>
      {profiles.map(p => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.border}88` }}>
          {renaming?.id === p.id
            ? <input autoFocus value={renaming.text} onChange={e => setRenaming(r => ({ ...r, text: e.target.value }))} onBlur={renameProfile}
                onKeyDown={e => { if (e.key === "Enter") renameProfile(); if (e.key === "Escape") setRenaming(null); }} style={{ ...input(), flex: 1 }} aria-label={t("Profile name...")} />
            : <span onDoubleClick={() => setRenaming({ id: p.id, text: p.name })} style={{ flex: 1, minWidth: 0, fontSize: TYPE.label, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>}
          <span style={{ fontSize: TYPE.small, color: C.textMid, flex: "none" }}>{t({ one: "{n} trained skill", other: "{n} trained skills" }, { n: trainedIn(p.skills) })}</span>
          <button type="button" style={button(false)} onClick={() => setSkills({ ...p.skills })}>{t("Load")}</button>
          <button type="button" style={button(false)} onClick={() => setRenaming({ id: p.id, text: p.name })}>{t("Rename")}</button>
          <button type="button" style={{ ...button(false), color: C.danger }} onClick={() => s.setSkillProfiles(prev => prev.filter(x => x.id !== p.id))}>{t("Delete")}</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {naming == null
          ? <button type="button" style={button(false)} onClick={() => setNaming("")}>{t("Save As Skill Profile…")}</button>
          : <>
              <input autoFocus value={naming} onChange={e => setNaming(e.target.value)} placeholder={t("Profile name...")} aria-label={t("Profile name...")}
                onKeyDown={e => { if (e.key === "Enter") saveProfile(); if (e.key === "Escape") setNaming(null); }} style={{ ...input(), width: 220 }} />
              <button type="button" style={button(true)} onClick={saveProfile}>{t("Save")}</button>
              <button type="button" style={button(false)} onClick={() => setNaming(null)}>{t("Cancel")}</button>
            </>}
      </div>
      <Note>{t("A profile is a copy of the sheet: loading one replaces the sheet, and later edits do not write back.")}</Note>

      <Heading>{t("Skills")}</Heading>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Search skills…")} aria-label={t("Search skills…")} style={{ ...input(), width: "100%", marginBottom: 8 }} />
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
        {groups.map(g => {
          const isOpen = !!q || !!open[g.label];
          const trained = g.skills.filter(k => lvl(k.key) > 0).length;
          const color = GROUP_COLORS[g.label] ?? C.accent;
          return (
            <div key={g.label} style={{ borderBottom: `1px solid ${C.border}` }}>
              <div onClick={() => setOpen(o => ({ ...o, [g.label]: !o[g.label] }))} role="button" aria-expanded={isOpen}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: C.surfaceAlt, cursor: "pointer" }}>
                <span aria-hidden="true" style={{ width: 10, fontSize: 9, color: C.textMid, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .12s" }}>▶</span>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flex: "none" }} />
                <span style={{ flex: 1, fontSize: TYPE.label, color: C.text }}>{g.label}</span>
                <span style={{ fontSize: TYPE.small, color: trained === g.skills.length ? C.success : C.textMid, fontVariantNumeric: "tabular-nums" }}>{trained}/{g.skills.length}</span>
                <button type="button" onClick={e => { e.stopPropagation(); setSkills(prev => ({ ...prev, ...Object.fromEntries(g.skills.map(k => [k.key, 5])) })); }}
                  style={{ ...button(false), height: 22, padding: "0 8px", fontSize: 12 }}>{t("All V")}</button>
                <button type="button" onClick={e => { e.stopPropagation(); setSkills(prev => ({ ...prev, ...Object.fromEntries(g.skills.map(k => [k.key, 0])) })); }}
                  style={{ ...button(false), height: 22, padding: "0 8px", fontSize: 12 }}>{t("None")}</button>
              </div>
              {isOpen && g.skills.map(k => (
                <div key={k.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 10px 3px 36px", borderTop: `1px solid ${C.border}66` }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: TYPE.label, color: lvl(k.key) ? C.text : C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.label}</span>
                  <LevelButtons k={k.key} color={color} />
                </div>
              ))}
            </div>
          );
        })}
        {!groups.length && <div style={{ padding: 10, fontSize: TYPE.label, color: C.textMid }}>{t('No skills match "{q}"', { q: query.trim() })}</div>}
      </div>
      <Note>{t("{skills} skills across {groups} groups — every skill the engine reads plus every skill a fittable item requires.", { skills: SKILL_GROUPS.reduce((n, g) => n + g.skills.length, 0), groups: SKILL_GROUPS.length })}</Note>
    </>
  );
}

// Backup and ESI in desktop controls. The state and every action are the phone's own (backup.jsx
// useBackup; esi-ui.jsx useEsiCharacters, friendlyError, and lib/esi.js), so restore, merge, undo,
// pyfa import, login and skill sync each exist once; only the drawing is new. Sentences are the
// phone's keys, so they keep their translations.
const card = () => ({ padding: "12px 14px", marginTop: 10, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8 });
const danger = () => ({ ...button(false), color: C.danger, borderColor: `${C.danger}88` });
const strong = { color: C.text, fontWeight: WEIGHT.value };

function BackupSection() {
  const b = useBackup();
  const { status, pending, setPending, pasted, setPasted, fileRef, xmlPending, setXmlPending, xmlBusy, xmlRef, undo, busy, mine } = b;
  return (
    <>
      {/* The phone's own overlay: every bulk write ends in a reload, and the page must not take a
          second write while one is in flight. Portalled over everything, windows included. */}
      {busy && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: C.bg }}>
          <span className="vv-spin" style={{ width: 30, height: 30, borderRadius: "50%", border: `3px solid ${C.border}`, borderTopColor: C.accent }} />
          <div style={{ fontSize: TYPE.label, color: C.textMid }}>{busy}</div>
          <div style={{ fontSize: TYPE.small, color: C.textMute }}>{t("Don't close the app.")}</div>
        </div>, document.body)}

      <Heading first>{t("Backup & Restore")}</Heading>
      <div style={{ fontSize: TYPE.label, color: C.textMid }}>
        {boldFill(t("{fitCount} across {shipCount} stored here.", {
          fitCount: t({ one: "{fits} fit", other: "{fits} fits" }, { n: mine.fits }),
          shipCount: t({ one: "{ships} ship", other: "{ships} ships" }, { n: mine.ships }) }), { fits: mine.fits.toLocaleString(), ships: mine.ships }, strong)}
      </div>
      <Note>{t("Your fits live only in this browser's storage. Clearing site data, switching browsers, or opening the app on a different port will lose them. Export a file to keep them safe or move them to another device.")}</Note>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" onClick={b.download} style={button(true)}>{t("Download backup")}</button>
        <button type="button" onClick={b.copyJson} style={button(false)}>{t("Copy as JSON")}</button>
      </div>

      <Heading>{t("Restore")}</Heading>
      {!pending ? (
        <>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={b.onFile} style={{ display: "none" }} />
          <button type="button" onClick={() => fileRef.current?.click()} style={button(false)}>{t("Choose backup file…")}</button>
          <Note>{t("…or paste the JSON:")}</Note>
          <textarea value={pasted} onChange={e => setPasted(e.target.value)} placeholder='{"app":"axis",...}'
            style={{ width: "100%", boxSizing: "border-box", minHeight: 72, marginTop: 6, padding: 8, borderRadius: 6, fontSize: 12.5, fontFamily: "monospace",
                     background: C.bg, border: `1px solid ${C.borderStrong}`, color: C.text, resize: "vertical", outline: "none" }} />
          <button type="button" onClick={() => b.parseBackup(pasted)} disabled={!pasted.trim()} style={{ ...button(false), marginTop: 6, opacity: pasted.trim() ? 1 : 0.45 }}>{t("Load pasted backup")}</button>
        </>
      ) : (
        <div style={{ ...card(), borderColor: C.accent }}>
          <div style={{ fontSize: TYPE.label, color: C.text }}>
            {boldFill(t("Backup contains {fitCount} across {shipCount}.", {
              fitCount: t({ one: "{fits} fit", other: "{fits} fits" }, { n: pending.count.fits }),
              shipCount: t({ one: "{ships} ship", other: "{ships} ships" }, { n: pending.count.ships }) }), { fits: pending.count.fits, ships: pending.count.ships }, strong)}
          </div>
          {pending.obj.exportedAt && <Note>{t("Exported {when}", { when: new Date(pending.obj.exportedAt).toLocaleString() })}</Note>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button type="button" onClick={() => b.apply("merge")} style={button(true)}>{t("Merge (keep mine)")}</button>
            <button type="button" style={danger()} onClick={() => {
              if (window.confirm(t({ one: "Replace ALL {n} local fit and your settings with this backup? This cannot be undone.", other: "Replace ALL {n} local fits and your settings with this backup? This cannot be undone." }, { n: mine.fits }))) b.apply("replace"); }}>
              {t("Replace everything")}</button>
            <button type="button" onClick={() => { setPending(null); setPasted(""); }} style={button(false)}>{t("Cancel")}</button>
          </div>
          <Note>{boldFill(t("{merge} adds the imported fits alongside yours (duplicates get renamed, your skills and settings are untouched). {replace} wipes everything here first."),
            { merge: t("Merge"), replace: t("Replace") }, strong)}</Note>
        </div>
      )}

      {!pending && <>
        <Heading>{t("Import from pyfa")}</Heading>
        <Note>{boldFill(t("In pyfa, use {menu} to write an XML file, then choose it here. Your existing fits are kept — imported ones are added alongside them."),
          { menu: "File → Backup All Fittings" }, strong)}</Note>
        <input ref={xmlRef} type="file" accept=".xml,text/xml,application/xml" onChange={b.onXmlFile} style={{ display: "none" }} />
        {!xmlPending && !xmlBusy && <button type="button" onClick={() => xmlRef.current?.click()} style={{ ...button(false), marginTop: 10 }}>{t("Choose pyfa XML file…")}</button>}
        {xmlBusy && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: TYPE.small, color: C.textMid, marginBottom: 6 }}>
              {t("Converting {done} / {total} fits…", { done: xmlBusy.done.toLocaleString(), total: xmlBusy.total.toLocaleString() })}</div>
            <div style={{ height: 4, borderRadius: 2, background: C.surfaceAlt, overflow: "hidden" }}>
              <div style={{ height: "100%", background: C.accent, width: `${xmlBusy.total ? (xmlBusy.done / xmlBusy.total) * 100 : 0}%` }} /></div>
          </div>
        )}
        {xmlPending && (
          <div style={{ ...card(), borderColor: C.accent }}>
            <div style={{ fontSize: TYPE.label, color: C.text }}>
              {boldFill(t("Ready to import {fitCount} across {shipCount}.", {
                fitCount: t({ one: "{fits} fit", other: "{fits} fits" }, { n: xmlPending.fits }),
                shipCount: t({ one: "{ships} ship", other: "{ships} ships" }, { n: xmlPending.ships }) }), { fits: xmlPending.fits.toLocaleString(), ships: xmlPending.ships.toLocaleString() }, strong)}
            </div>
            <Note>
              {boldFill(t("A pyfa XML backup doesn't record implants, boosters, or which module each charge was loaded into — it lists all ammo together in the cargo hold. Ammo was put back into {modCount}; anything left over stays in cargo.", {
                modCount: t({ one: "{mods} module", other: "{mods} modules" }, { n: xmlPending.reloaded }) }), { mods: xmlPending.reloaded.toLocaleString() }, strong)}
              {xmlPending.skipped > 0 && <> {t({ one: "{n} fitting couldn't be read and was skipped.", other: "{n} fittings couldn't be read and were skipped." }, { n: xmlPending.skipped })}</>}
              {xmlPending.unresolved.length > 0 && <> {t({ one: "{n} item name wasn't recognised (e.g. {names}) and was left out.", other: "{n} item names weren't recognised (e.g. {names}) and were left out." }, { n: xmlPending.unresolved.length, names: xmlPending.unresolved.slice(0, 3).join(", ") })}</>}
            </Note>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" onClick={b.applyXml} style={button(true)}>{t({ one: "Add {fits} fit", other: "Add {fits} fits" }, { n: xmlPending.fits, fits: xmlPending.fits.toLocaleString() })}</button>
              <button type="button" onClick={() => setXmlPending(null)} style={button(false)}>{t("Cancel")}</button>
            </div>
          </div>
        )}

        {undo && <>
          <Heading>{t("Undo")}</Heading>
          <div style={{ fontSize: TYPE.label, color: C.text }}>
            {boldFill(t({ one: "Undo available — restores the {fits} fit you had before the {what}.", other: "Undo available — restores the {fits} fits you had before the {what}." },
              { n: undo.fits, what: b.undoLabel(undo.label) }), { fits: undo.fits.toLocaleString() }, strong)}
          </div>
          <Note>{t("Taken {when}. Saved fits only — skills and settings aren't part of the copy. Replaced by the next import or reset.", { when: undo.at ? new Date(undo.at).toLocaleString() : t("earlier") })}</Note>
          <button type="button" onClick={b.doUndo} style={{ ...button(false), marginTop: 10, color: C.accent, borderColor: C.accent }}>{t("Undo {what}", { what: b.undoLabel(undo.label) })}</button>
        </>}

        <Heading>{t("Clear fit library")}</Heading>
        <Note>{t("Deletes every saved fit on this device. Skills, settings and tag colours are kept.")}{!isFallbackMode() && ` ${t("A copy is kept so you can undo it.")}`}</Note>
        <button type="button" onClick={b.clearLibrary} disabled={mine.fits === 0} style={{ ...danger(), marginTop: 10, opacity: mine.fits === 0 ? 0.45 : 1 }}>
          {t({ one: "Delete all {fits} fit", other: "Delete all {fits} fits" }, { n: mine.fits, fits: mine.fits.toLocaleString() })}</button>
      </>}

      {status && <div role="status" style={{ marginTop: 14, fontSize: TYPE.label, color: status.ok ? C.success : C.danger }}>{status.msg}</div>}
    </>
  );
}

// One character's abyssal collection, synced from Settings rather than through an empty slot's module
// picker. The phone library's own scan and import (lib/abyssal-import.js, lib/abyssal-store.js), so
// a roll synced here is the same record the picker would save. "Sync" takes every location the scan
// finds; "Choose locations…" stops after the scan for the same checklist the phone shows.
function AbyssalSync({ c, saved, onSaved }) {
  const allowed = c.scopes?.includes(ASSET_SCOPE);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(null);
  const [scan, setScan] = useState(null), [picked, setPicked] = useState([]);
  const [report, setReport] = useState(null), [error, setError] = useState("");
  const ctl = useRef(null);
  useEffect(() => () => ctl.current?.abort(), []);
  const run = async (task) => {
    if (ctl.current) return;
    const abort = new AbortController(); ctl.current = abort; setBusy(true); setError(""); setReport(null);
    try { requireOnline(); await task(abort.signal); }
    catch (e) { if (e.name !== "AbortError") setError(friendlyError(e)); }
    finally { ctl.current = null; setBusy(false); setProgress(null); try { onSaved(await readAbyssals()); } catch { /* shown on next read */ } }
  };
  const importFrom = async (result, locations, signal) => {
    const r = await importAbyssals(result, locations, await readAbyssals(), { signal, onProgress: setProgress,
      onBatch: async (batch) => { onSaved(await saveAbyssalScan(batch, result)); } });
    if (!signal.aborted) { setReport(r); setScan(null); }
  };
  const locationsOf = (result) => [...new Set(result.candidates.map(a => String(a.location_id)))];
  const syncAll = () => run(async (signal) => { const result = await scanAbyssals(c, { signal, onProgress: setProgress }); if (!signal.aborted) await importFrom(result, locationsOf(result), signal); });
  const chooseLocations = () => run(async (signal) => { const result = await scanAbyssals(c, { signal, onProgress: setProgress }); if (!signal.aborted) { setScan(result); setPicked(locationsOf(result)); } });
  const grant = async () => { setError(""); try { await esi.beginLogin([...new Set([...ESI_SCOPES, ASSET_SCOPE, ...(c.scopes ?? [])])]); } catch (e) { setError(friendlyError(e)); } };
  const byId = scan ? new Map(scan.assets.map(a => [a.item_id, a])) : null;
  const locations = new Map();
  for (const a of scan?.candidates ?? []) { const k = String(a.location_id), old = locations.get(k); locations.set(k, { name: assetLocation(a, byId, scan.names), count: (old?.count ?? 0) + 1 }); }
  return (
    <div style={{ padding: "2px 0 8px 46px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: TYPE.small, color: C.textMid, flex: 1, minWidth: 140 }}>
          {t("Abyssal modules")}: <span style={{ color: C.text }}>{saved}</span> {t("saved")}
          {progress && <> · {progress.stage === "scan" ? t("Scanning assets") : t("Importing modules")} {progress.done} / {progress.total}</>}
          {report && <span style={{ color: report.failures.length ? C.warning : C.success }}> · {t("Imported {n}; failed {failed}.", { n: report.imported, failed: report.failures.length })}</span>}
        </span>
        {!allowed && <button type="button" onClick={grant} style={button(false)} title={t("Log in again with permission to read this character's assets")}>{t("Allow asset access")}</button>}
        {allowed && !busy && <button type="button" onClick={syncAll} style={button(false)} title={t("Scan this character's assets and save every abyssal module found")}>{t("Sync abyssals")}</button>}
        {allowed && !busy && !scan && <button type="button" onClick={chooseLocations} style={{ ...button(false), color: C.textMid }}>{t("Choose locations…")}</button>}
        {busy && <button type="button" onClick={() => ctl.current?.abort()} style={button(false)}>{t("Cancel")}</button>}
      </div>
      {error && <div role="alert" style={{ marginTop: 4, fontSize: TYPE.small, color: C.danger, wordBreak: "break-word" }}>{error}</div>}
      {scan && (
        <div style={{ marginTop: 8, padding: "8px 10px", background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ flex: 1, fontSize: TYPE.small, color: C.textMid }}>{t("Containers and locations")} ({scan.candidates.length})</span>
            <button type="button" onClick={() => setPicked([...locations.keys()])} style={{ ...button(false), height: 24 }}>{t("Select all")}</button>
            <button type="button" onClick={() => setPicked([])} style={{ ...button(false), height: 24 }}>{t("Clear")}</button>
          </div>
          {[...locations].map(([k, l]) => (
            <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0", fontSize: TYPE.label, color: C.text, overflowWrap: "anywhere" }}>
              <input type="checkbox" checked={picked.includes(k)} onChange={e => setPicked(p => e.target.checked ? [...p, k] : p.filter(x => x !== k))} style={{ accentColor: C.accent }} />
              {l.name} <span style={{ color: C.textMid }}>({l.count})</span>
            </label>
          ))}
          <Note>{t("ESI assets can be cached for about an hour. Unresolved locations show their IDs.")}</Note>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" disabled={!picked.length} onClick={() => run(signal => importFrom(scan, picked, signal))} style={{ ...button(true), opacity: picked.length ? 1 : 0.45 }}>{t("Import selected locations")}</button>
            <button type="button" onClick={() => setScan(null)} style={button(false)}>{t("Cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function EsiSection({ s }) {
  const { characters, activeId, loginError, refresh, switchActive, remove } = useEsiCharacters();
  const [busy, setBusy] = useState(null);       // characterId being synced
  const [error, setError] = useState(null);
  const [synced, setSynced] = useState(null);   // {id, msg}
  const [waiting, setWaiting] = useState(false);
  // Saved rolls, for each character's count beside its Sync button.
  const [rolls, setRolls] = useState([]);
  useEffect(() => { let live = true; readAbyssals().then(r => { if (live) setRolls(r); }).catch(() => {}); return () => { live = false; }; }, []);
  // A login finishing (the eveauth-visviva link, esi-desktop.js) changes the characters: stop waiting.
  useEffect(() => { setWaiting(false); }, [characters.length]);
  useEffect(() => { esi.handleWebRedirectOnLoad().then(r => { if (r) refresh(); }).catch(e => setError(friendlyError(e))); }, [refresh]);
  const connect = async () => {
    setError(null);
    try { await esi.beginLogin(); setWaiting(true); } catch (e) { setError(friendlyError(e)); }
  };
  // Same as the phone's: the FULL map (an untrained skill is absent from ESI's answer, and absent
  // means V here), also cached per character for fits that name this pilot.
  const sync = async (id) => {
    setBusy(id); setError(null); setSynced(null);
    try {
      const full = esi.esiSkillsToFullSkillMap(await esi.getCharacterSkills(id));
      s.setSkills(full); esi.storeCharacterSkills(id, full);
      const trained = Object.values(full).filter(v => v > 0).length;
      setSynced({ id, msg: t({ one: "Synced {n} trained skill.", other: "Synced {n} trained skills." }, { n: trained }) });
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
  };
  return (
    <>
      <Heading first>{t("EVE ESI Connection")}</Heading>
      <Note>{t("Connect an EVE character to sync skills and import/export saved fits directly from the game.")}</Note>

      <Heading>{t("Characters")}</Heading>
      {!characters.length && <div style={{ fontSize: TYPE.label, color: C.textMid, padding: "6px 0" }}>{t("Not connected")}</div>}
      {characters.map(c => {
        const on = c.characterId === activeId;
        return (
          <div key={c.characterId} style={{ borderBottom: `1px solid ${C.border}88` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0 4px" }}>
            <input type="radio" name="esi-active" checked={on} onChange={() => switchActive(c.characterId)} aria-label={t("Active character")} title={t("Active character")} style={{ accentColor: C.accent }} />
            <img src={`https://images.evetech.net/characters/${c.characterId}/portrait?size=64`} width={32} height={32} alt="" style={{ borderRadius: 4, flex: "none" }}
              onError={e => { e.target.style.visibility = "hidden"; }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: TYPE.label, color: on ? C.accent : C.text }}>{c.characterName}</div>
              <div style={{ fontSize: TYPE.small, color: C.textMid }}>
                {t({ one: "{n} scope granted", other: "{n} scopes granted" }, { n: c.scopes?.length ?? 0 })}
                {synced?.id === c.characterId && <span style={{ color: C.success }}> · ✓ {synced.msg}</span>}
              </div>
            </div>
            <button type="button" onClick={() => sync(c.characterId)} disabled={busy != null} style={{ ...button(false), opacity: busy != null && busy !== c.characterId ? 0.5 : 1 }}>
              {busy === c.characterId ? t("Syncing…") : t("Sync skills")}</button>
            <button type="button" onClick={() => remove(c.characterId)} style={danger()}>{t("Unlink")}</button>
          </div>
          <AbyssalSync c={c} saved={rolls.filter(r => String(r.characterId) === String(c.characterId)).length}
            onSaved={(r) => { setRolls(r); window.dispatchEvent(new Event(ABYSSALS_CHANGED)); }} />
          </div>
        );
      })}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
        <button type="button" onClick={connect} style={button(!characters.length)}>{characters.length ? `+ ${t("Add character")}` : t("Connect with EVE SSO")}</button>
        {waiting && <span style={{ fontSize: TYPE.small, color: C.textMid }}>{t("Finish signing in in your browser; Axis picks it up when EVE sends you back.")}</span>}
      </div>
      {(error || loginError) && <div role="alert" style={{ marginTop: 10, fontSize: TYPE.label, color: C.danger, lineHeight: 1.45, wordBreak: "break-word" }}>{error || loginError}</div>}

      <Heading>{t("Abyssal modules and market access")}</Heading>
      <Note>{t('My Abyssals can read personal assets and item names with your permission. Choose which locations to import. It cannot move your items or read corporate assets.')}</Note>
      <Note>{t('Imported rolls stay on this device and remain usable offline. Unlinking a character keeps its saved modules; forgetting them is a separate action. Library records and saved contracts are not included in fit backups.')}</Note>
      <Note>{t('MutaMarket browsing needs no character login. Axis sends module types and filters, not your inventory. Public ESI lookups resolve contract locations; prices and availability can be delayed.')}</Note>
      <Note>{t('Copy EVE contract links from the shopping list without logging in. Opening a contract in a running EVE client requires optional contract access.')}</Note>
    </>
  );
}

function AboutSection() {
  const [before, after] = t("Fitting calculations are validated against {pyfa}, and its environment-effect data is used with thanks. pyfa is licensed GPLv3.").split("{pyfa}");
  return (
    <>
      <Heading first>{t("About Axis")}</Heading>
      <div style={{ fontSize: TYPE.label, color: C.text, lineHeight: 1.5 }}>{before}<a href="https://github.com/pyfa-org/Pyfa" target="_blank" rel="noreferrer" style={{ color: C.accent }}>pyfa</a>{after}</div>
      <Note>{t("Unofficial, fan-made tool — not affiliated with, endorsed by, or sponsored by Fenris Creations. EVE Online and all related materials are used with limited permission; all intellectual property belongs to Fenris Creations.")}</Note>
    </>
  );
}

export default function DeskSettings({ s, bd }) {
  const [section, setSection] = useState(() => { try { return localStorage.getItem(SECTION_KEY) || "skills"; } catch { return "skills"; } });
  useEffect(() => {
    const go = (e) => { if (typeof e.detail === "string") setSection(e.detail); };
    window.addEventListener(SETTINGS_EVENT, go);
    return () => window.removeEventListener(SETTINGS_EVENT, go);
  }, []);
  useEffect(() => { try { localStorage.setItem(SECTION_KEY, section); } catch { /* private mode */ } }, [section]);
  // "workspace" was its own section until the background moved into Interface.
  const cur = section === "workspace" ? "interface" : SECTIONS.some(([k]) => k === section) ? section : "skills";
  return (
    <div style={{ height: "100%", display: "flex", minHeight: 0 }}>
      <nav aria-label={t("Settings")} style={{ width: 148, flex: "none", padding: "8px 6px", borderRight: `1px solid ${C.border}`, background: C.surfaceAlt, overflowY: "auto" }}>
        {SECTIONS.map(([k, label]) => (
          <button key={k} type="button" aria-current={cur === k ? "page" : undefined} onClick={() => setSection(k)}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", marginBottom: 2, borderRadius: 5, border: "none", cursor: "pointer", fontSize: TYPE.label,
                     background: cur === k ? C.accentLight : "transparent", color: cur === k ? C.accent : C.text, boxShadow: cur === k ? `inset 2px 0 0 ${C.accent}` : "none" }}>
            {/* "ESI" is CCP's own name for the API and is the same word in every client language. */}
            {k === "esi" ? "ESI" : t(label)}
          </button>
        ))}
      </nav>
      <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "14px 18px 24px" }}>
        <div style={{ maxWidth: 720 }}>
          {cur === "skills" && <SkillsSection s={s} />}
          {cur === "interface" && <InterfaceSection s={s} bd={bd} />}
          {cur === "market" && <MarketSection s={s} />}
          {cur === "backup" && <BackupSection />}
          {cur === "esi" && <EsiSection s={s} />}
          {cur === "about" && <AboutSection />}
        </div>
      </div>
    </div>
  );
}
