import { useEffect, useMemo, useState } from "react";
import { C, THEMES, THEME_LABELS } from "../theme.js";
import { availableLocales, t } from "../lib/i18n.js";
import { SKILL_CATALOG } from "../calc.js";
import { allPriceableTypeIDs } from "../lib/core.js";
import { primePrices, getCachedPrices } from "../prices.js";
import { SKILL_GROUPS, GROUP_COLORS, SKILL_PRESETS, PRESET_COLORS } from "../components/settings.jsx";
import { BackupPanel } from "../components/backup.jsx";
import { EsiSettingsPanel, EsiSkillAlignPanel } from "../components/esi-ui.jsx";
import { PrereleaseSkillControl } from "../components/prerelease-skill.jsx";
import { BackdropControls } from "./Backdrop.jsx";
import { TYPE, WEIGHT } from "./kit.jsx";

// The desktop Settings window: the phone's settings, laid out for a monitor — the sections down the
// left, the chosen one filling the rest, desktop type sizes and controls. Every setting writes the
// same session value the phone's Settings sheet does, from the same catalogues (SKILL_GROUPS,
// SKILL_PRESETS, availableLocales, THEMES), so the two cannot offer different choices.
//
// Interface, Market, Skills, Workspace and About are drawn here. Backup and ESI host the phone's own
// panels: they are file and login flows with their own careful states, and a second copy of those
// is a second place for them to go wrong.

const SECTIONS = [
  ["skills", "Skills"], ["interface", "Interface"], ["market", "Market"], ["workspace", "Workspace"],
  ["backup", "Backup"], ["esi", "ESI"], ["about", "About"],
];
const SECTION_KEY = "axis_desk_settings_section";

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
const input = { height: 28, boxSizing: "border-box", padding: "0 10px", borderRadius: 6, fontSize: 13, background: C.bg, border: `1px solid ${C.borderStrong}`, color: C.text, outline: "none" };

// ── Sections ───────────────────────────────────────────────────────────────────────────────────
function InterfaceSection({ s }) {
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
                onKeyDown={e => { if (e.key === "Enter") renameProfile(); if (e.key === "Escape") setRenaming(null); }} style={{ ...input, flex: 1 }} aria-label={t("Profile name...")} />
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
                onKeyDown={e => { if (e.key === "Enter") saveProfile(); if (e.key === "Escape") setNaming(null); }} style={{ ...input, width: 220 }} />
              <button type="button" style={button(true)} onClick={saveProfile}>{t("Save")}</button>
              <button type="button" style={button(false)} onClick={() => setNaming(null)}>{t("Cancel")}</button>
            </>}
      </div>
      <Note>{t("A profile is a copy of the sheet: loading one replaces the sheet, and later edits do not write back.")}</Note>

      <Heading>{t("Skills")}</Heading>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Search skills…")} aria-label={t("Search skills…")} style={{ ...input, width: "100%", marginBottom: 8 }} />
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
  useEffect(() => { try { localStorage.setItem(SECTION_KEY, section); } catch { /* private mode */ } }, [section]);
  const cur = SECTIONS.some(([k]) => k === section) ? section : "skills";
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
          {cur === "interface" && <InterfaceSection s={s} />}
          {cur === "market" && <MarketSection s={s} />}
          {cur === "workspace" && (bd
            ? <><Heading first>{t("Background")}</Heading><div style={{ margin: "0 -16px" }}><BackdropControls bd={bd} /></div></>
            : <Note>{t("The workspace background is set from the main Axis window.")}</Note>)}
          {cur === "backup" && <BackupPanel />}
          {cur === "esi" && <EsiSettingsPanel setSkills={s.setSkills} />}
          {cur === "about" && <AboutSection />}
        </div>
      </div>
    </div>
  );
}
