import { useEffect, useMemo, useRef, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { tidByName } from "../calc.js";
import { getGlobalCss, lookupShip, haptic, parseEFT, readClipboardText } from "../lib/core.js";
import { useFitSession } from "../use-fit-session.js";
import { ImportFitSheet, DamageProfileSheet, initKeyboardTracking } from "../components/ui.jsx";
import { SnapshotModal } from "../components/snapshot.jsx";
import { ShoppingListSheet } from "../components/shopping-list.jsx";
import { ShipInfoSheet } from "../components/FittingsScreen.jsx";
import { SettingsOverlay } from "../components/settings.jsx";
import { ChooserSheet, PilotSheet } from "../components/layout.jsx";
import { FeedbackModal } from "../components/feedback.jsx";
import { EsiImportModal, EsiExportModal } from "../components/esi-ui.jsx";
import { SkillsProvider } from "../components/skill-mark.jsx";
import { IconClipboard, IconCharacter } from "../components/glyphs.jsx";
import Workspace, { useLayoutState, openWindow, dockWindow, detachWindow, toggleWindow, Button } from "./Workspace.jsx";
import Menu from "./Menu.jsx";
import DeskBrowser from "./Browser.jsx";
import { FirepowerPanel } from "./Firepower.jsx";
import ExportDialog from "./ExportDialog.jsx";
import CargoPanel from "./Cargo.jsx";
import { ProjectedPanel, CommandPanel, BoostersPanel, EnvironmentPanel } from "./Effects.jsx";
import { WINDOWS } from "./layout.js";
import { useSessionSync } from "./sync.js";
import { IS_TAURI, openOsWindow, closeThisWindow, onThisWindowClosing } from "./os-window.js";
import { TitleButton } from "./DeskWindow.jsx";
import { ResourcesPanel, CapacitorPanel, TargetingPanel, DefensePanel, ValidationPanel, ValidityBadge, fitIssues, useFitStats } from "./stat-panels.jsx";
import { useActiveShip, useDeskStats, STAT_SECTIONS, StatsWindow, FittingWindow, GraphsWindow, BrowserWindow,
         CargoWindow, DronesWindow, ImplantsWindow, EffectsWindow, NotesWindow } from "./windows.jsx";

// The desktop app. The fit session (use-fit-session.js) is the phone's, so every edit, setting and
// saved fit means the same thing in both. Around it: a header carrying everything the phone keeps in
// its menu, the open-fit tabs, and the window workspace.
//
// A window popped out to another monitor is this same app started as `?satellite=<id>`, showing
// that one window and kept in step with the main one by sync.js.

const SATELLITE = (() => { try { const id = new URLSearchParams(window.location.search).get("satellite"); return WINDOWS.some(w => w.id === id) ? id : null; } catch { return null; } })();

export default function DesktopRoot() {
  return SATELLITE ? <SatelliteApp id={SATELLITE} /> : <DesktopApp />;
}

function useBanner() {
  const [banner, setBanner] = useState(null);
  const notify = (kind, msg, ms) => { setBanner(kind == null ? null : { kind, msg }); if (ms) setTimeout(() => setBanner(null), ms); };
  const view = banner && <div role="status" style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 300,
    background: banner.kind === "success" ? C.success : C.surfaceAlt, color: banner.kind === "success" ? "#0e0e10" : C.textMid,
    border: banner.kind === "success" ? "none" : `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700,
    boxShadow: "0 6px 20px rgba(0,0,0,.35)" }}>{banner.kind === "success" ? "✓ " : ""}{banner.msg}</div>;
  return { notify, view };
}

/** What every window shows, for the main app and for a popped-out window alike. */
function useWindowContents(s, isOpen, sheet, { adderRef, remoteAdd, cols, setCols, openValidation, openProfilePicker } = {}) {
  const ship = useActiveShip(s);
  // One full calculation for every native stat window (stat-panels.jsx).
  const cs = useFitStats(s, ship);
  const issues = useMemo(() => fitIssues(cs, s.slots, s.drones), [cs, s.slots, s.drones]);
  const stats = useDeskStats(s, {
    snapshot: isOpen("cargo") || isOpen("drones") || isOpen("projected") || sheet === "shipinfo" || sheet === "snapshot",
    drones: isOpen("drones"),
  });
  const renderWindow = (id) => {
    if (STAT_SECTIONS[id]) return <StatsWindow s={s} ship={ship} sections={STAT_SECTIONS[id]} id={id} />;
    switch (id) {
      case "browser": return <DeskBrowser s={s} ship={ship} adderRef={adderRef} remoteAdd={remoteAdd} />;
      case "fitting": return <FittingWindow s={s} ship={ship} adderRef={adderRef} cols={cols?.fitting} setCols={(c) => setCols?.("fitting", c)} />;
      case "graphs": return <GraphsWindow s={s} ship={ship} />;
      case "resources": return <ResourcesPanel s={s} ship={ship} cs={cs} />;
      case "capacitor": return <CapacitorPanel cs={cs} />;
      case "defense": return <DefensePanel s={s} cs={cs} onPickProfile={() => openProfilePicker?.()} />;
      // Remote reps and mining sit under the firepower they belong with, only on fits that have them.
      case "firepower": return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, minHeight: 0 }}><FirepowerPanel s={s} ship={ship} cs={cs} /></div>
          {((cs?.remoteRepModules?.length ?? 0) > 0 || (cs?.mining?.totalM3S ?? 0) > 0) &&
            <div style={{ flex: "none", maxHeight: "45%", overflowY: "auto", borderTop: `1px solid ${C.border}` }}>
              <StatsWindow s={s} ship={ship} sections={STAT_SECTIONS.repsmining} id="repsmining" />
            </div>}
        </div>
      );
      case "validation": return <ValidationPanel cs={cs} issues={issues} />;
      case "targeting": return <TargetingPanel s={s} cs={cs} />;
      case "cargo": return <CargoPanel s={s} capacity={cs?.cargoCapacity ?? stats.snapshot?.cargoCapacity ?? 0} />;
      case "drones": return <DronesWindow s={s} stats={stats} />;
      case "implants": return <ImplantsWindow s={s} />;
      case "projected": return <ProjectedPanel s={s} jamTarget={{ strength: cs?.sensorStrength ?? 0, type: cs?.sensorType ?? "", resist: s.projectedEffects?.ecmResist ?? 1 }} />;
      case "command": return <CommandPanel s={s} />;
      case "boosters": return <BoostersPanel s={s} />;
      case "environment": return <EnvironmentPanel s={s} />;
      case "notes": return <NotesWindow s={s} />;
      default: return null;
    }
  };
  // "Fitting · Sleipnir": the window title says which hull you are editing.
  const windowTitle = (id) => id === "fitting" && s.activeFit?.ship ? `${t("Fitting")} · ${s.activeFit.ship}` : t(WINDOWS.find(w => w.id === id)?.title ?? id);
  // The Fitting window's title bar carries the fit's validity, so the Validation window can stay
  // closed until there is something to read.
  const windowExtra = (id) => id === "fitting" && cs ? <ValidityBadge issues={issues} onOpen={() => openValidation?.()} /> : null;
  return { ship, stats, renderWindow, windowTitle, windowExtra };
}

/** One window, popped out into its own OS window. Closing it (or Dock) puts it back in the workspace. */
function SatelliteApp({ id }) {
  const banner = useBanner();
  const s = useFitSession({ onFitOpened: () => {}, notify: banner.notify });
  const adderRef = useRef(null);
  const sync = useSessionSync(s, { onMessage: (m) => { if (m.type === "add") adderRef.current?.(m.secKey, m.mod); } });
  useEffect(() => { initKeyboardTracking(); }, []);
  useEffect(() => {
    sync.post({ type: "hello", id });
    return onThisWindowClosing(() => sync.post({ type: "closed", id }));
  }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const { renderWindow, windowTitle } = useWindowContents(s, (w) => w === id, null,
    { adderRef, remoteAdd: (secKey, mod) => sync.post({ type: "add", secKey, mod }) });
  const title = windowTitle(id);
  useEffect(() => { document.title = `${title} · Axis`; }, [title]);
  return (
    <SkillsProvider value={s.fitSkills}>
      <style>{getGlobalCss()}</style>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: C.surface, color: C.text, fontSize: 13 }}>
        <div style={{ height: 28, flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "0 4px 0 10px", background: C.surfaceAlt,
                      borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid }}>{title}</span>
          <span style={{ flex: 1 }} />
          <TitleButton label={t("Dock")} onClick={() => { sync.post({ type: "closed", id }); closeThisWindow(); }}>⇲</TitleButton>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{renderWindow(id)}</div>
      </div>
      {banner.view}
    </SkillsProvider>
  );
}

function DesktopApp() {
  const banner = useBanner();
  const s = useFitSession({
    // The fit lives in its own window here, so opening one changes no navigation.
    onFitOpened: () => {},
    notify: banner.notify,
  });
  const flash = (kind, msg, ms = 3000) => banner.notify(kind, msg, ms);
  useEffect(() => { initKeyboardTracking(); }, []);

  const [layoutState, setLayoutState] = useLayoutState();
  const isOpen = (id) => layoutState.windows[id]?.open && !layoutState.windows[id]?.detached;

  const [sheet, setSheet] = useState(null);   // which header dialog is open
  const [importInitial, setImportInitial] = useState(null);
  const close = () => setSheet(null);

  // ── Pop-out: a real OS window per detached window ─────────────────────────────────────────────
  const popups = useRef({});
  const adderRef = useRef(null);
  const sync = useSessionSync(s, {
    onMessage: (m) => {
      if (m.type === "hello") sync.sendAll();
      if (m.type === "add") adderRef.current?.(m.secKey, m.mod);
      if (m.type === "closed" && WINDOWS.some(w => w.id === m.id)) { delete popups.current[m.id]; dockWindow(setLayoutState, m.id); }
    },
  });
  const popOut = async (id) => {
    const g = layoutState.windows[id];
    const url = `/?satellite=${encodeURIComponent(id)}`;
    const w = await openOsWindow(id, { url, width: Math.round(g.w), height: Math.round(g.h), title: `${windowTitle(id)} · Axis` });
    if (!w) { flash("none", IS_TAURI ? t("Couldn't open a new window.") : t("Couldn't open a new window. Allow pop-ups for Axis and try again.")); return; }
    popups.current[id] = w;
    detachWindow(setLayoutState, id);
  };
  const dock = (id) => { try { popups.current[id]?.close(); } catch { /* already gone */ } delete popups.current[id]; };
  // The Browser's Market mode adds through the Fitting window. Docked here, that is adderRef;
  // popped out, it is another OS window, so the add goes over the channel; closed, there is nothing
  // to add into, and saying so beats a click that does nothing.
  const remoteAdd = (secKey, mod) => {
    if (layoutState.windows.fitting?.open && layoutState.windows.fitting?.detached) sync.post({ type: "add", secKey, mod });
    else flash("none", t("Open the Fitting window to add modules."));
  };
  const setCols = (id, c) => setLayoutState(st => ({ ...st, cols: { ...st.cols, [id]: c } }));
  const { ship, stats, renderWindow, windowTitle, windowExtra } = useWindowContents(s, isOpen, sheet,
    { adderRef, remoteAdd, cols: layoutState.cols, setCols, openValidation: () => openWindow(setLayoutState, "validation"), openProfilePicker: () => setSheet("dmgprofile") });
  // Windows left detached by a previous session have no OS window any more: bring them home.
  useEffect(() => {
    for (const w of WINDOWS) if (layoutState.windows[w.id]?.detached) dockWindow(setLayoutState, w.id);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const shipMeta = useMemo(() => {
    const sh = s.activeFit?.ship ? lookupShip(s.activeFit.ship) : null;
    return { faction: sh?.race ?? "", cls: sh?.hullClass ?? sh?.groupName ?? "" };
  }, [s.activeFit]);

  // Same golden path as the phone's "From EFT": read the clipboard and import straight away, falling
  // back to the paste sheet pre-filled with whatever was found.
  // ── Keyboard shortcuts (pyfa's where it has one) ─────────────────────────────────────────────
  //   Ctrl+V  paste an EFT fit from anywhere — no Import click first
  //   Ctrl+C  copy the fit as EFT, through the include-what dialog
  //   Ctrl+D  optimise the fit's price (pyfa's binding)
  // All three stand down while a text field has focus, so they never steal that field's own copy,
  // paste or typing; Ctrl+C also stands down while text on the page is selected. Ctrl+Z / Ctrl+Y are
  // the session's own (use-fit-session.js).
  const keysRef = useRef(null);
  keysRef.current = { s, hasFit: !!s.activeFit?.ship, sheet };
  useEffect(() => {
    const typing = (el) => !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || typing(e.target)) return;
      const { s: cur, hasFit, sheet: open } = keysRef.current;
      const k = e.key.toLowerCase();
      if (k === "d" && hasFit) { e.preventDefault(); cur.optimizeFitPrice(); }
      if (k === "c" && hasFit && !open && !window.getSelection()?.toString()) { e.preventDefault(); setSheet("exporteft"); }
    };
    const onPaste = (e) => {
      if (typing(e.target) || keysRef.current.sheet) return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (!text.trim()) return;
      const parsed = parseEFT(text);
      if (parsed.error) {
        // Only speak up when it looked like a fit: a stray paste of anything else stays silent.
        if (/^\s*\[/.test(text)) flash("none", t("That isn't a fit Axis can read: {why}", { why: parsed.error }), 4000);
        return;
      }
      e.preventDefault();
      keysRef.current.s.importFit(parsed);
      flash("success", t('Imported "{name}"', { name: parsed.fitName }));
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("paste", onPaste);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("paste", onPaste); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const importFromClipboard = async () => {
    close();
    const { text, why } = await readClipboardText();
    if (text == null) { setImportInitial({ text: "", err: why ? t("Couldn't read the clipboard — {why}. Paste manually below.", { why }) : t("Couldn't read the clipboard. Paste manually below.") }); setSheet("importeft"); return; }
    if (!text.trim()) { setImportInitial({ text: "", err: t("The clipboard is empty — copy a fit first, then tap this again.") }); setSheet("importeft"); return; }
    const parsed = parseEFT(text);
    if (parsed.error) { setImportInitial({ text, err: parsed.error }); setSheet("importeft"); return; }
    haptic();
    s.importFit(parsed);
    flash("success", t('Imported "{name}"', { name: parsed.fitName }));
  };

  const newTab = () => { s.wantNewTab.current = true; s.setNewTabIntent(true); openWindow(setLayoutState, "browser"); };
  const hasFit = !!s.activeFit?.ship;

  return (
    <SkillsProvider value={s.fitSkills}>
      <style>{getGlobalCss()}</style>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: C.bg, color: C.text, fontSize: 13 }}>
        <header style={{ height: 44, flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "0 12px 0 16px",
                         background: C.surface, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 12, flex: "none" }}>
            <span style={{ fontWeight: 700, letterSpacing: ".18em", fontSize: 14 }}>AXIS</span>
            {/* The app icon's turquoise/red split. Brand marks, so the same in every theme. */}
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22d3ee" }} />
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444" }} />
          </div>
          {/* Open fits, in the header itself: same tab list and rules as the phone's strip
              (lib/fit-tabs.js). The strip scrolls on its own when there are many. */}
          <div role="tablist" aria-label={t("Open fits")} style={{ flex: 1, minWidth: 0, alignSelf: "stretch", display: "flex", alignItems: "flex-end", gap: 2, overflowX: "auto" }}>
            {(s.openFitTabs.length ? s.openFitTabs : (hasFit ? [{ ship: s.activeFit.ship, name: s.activeFit.fitName, id: "current" }] : [])).map(tb => {
              const on = tb.ship === s.activeFit?.ship && tb.name === s.activeFit?.fitName;
              return (
                <div key={`${tb.ship}:${tb.id}:${tb.name}`} role="tab" aria-selected={on}
                  style={{ height: 32, display: "flex", alignItems: "center", gap: 8, padding: "0 10px 0 12px", borderRadius: "6px 6px 0 0",
                           background: on ? C.bg : "transparent", border: `1px solid ${on ? C.border : "transparent"}`, borderBottom: "none",
                           marginBottom: -1, cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}
                  onClick={() => s.loadFit(tb.ship, tb.name, undefined, true)}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: on ? C.text : C.textMid }}>{tb.ship}</span>
                  <span style={{ fontSize: 13.5, color: C.textMid }}>{tb.name}</span>
                  {s.openFitTabs.length > 0 && <button type="button" aria-label={t("Close tab")} title={t("Close tab")}
                    onClick={(e) => { e.stopPropagation(); s.closeFitTab(tb); }}
                    style={{ border: "none", background: "none", color: C.textMid, cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>}
                </div>
              );
            })}
            <button type="button" aria-label={t("Open a fit in a new tab")} title={t("Open a fit in a new tab")} onClick={newTab}
              style={{ height: 32, width: 30, flex: "none", border: "none", background: "none", color: C.textMid, cursor: "pointer", fontSize: 16 }}>+</button>
          </div>
          {/* The two things changed all the time stay on the bar; everything else is in a menu. */}
          {hasFit && <Button onClick={() => setSheet("pilot")}>
            {s.fitSkillLabel ?? t("All Skills V")}
            {!s.skillCheck.ok && <span style={{ color: C.warning, marginLeft: 6 }}>{t({ one: "{n} missing", other: "{n} missing" }, { n: s.skillCheck.missing.length })}</span>}
          </Button>}
          <Button onClick={() => setSheet("dmgprofile")}>{s.dmgProfile?.name ?? "Uniform"}</Button>
          <Menu label={<>{t("Windows")} <span aria-hidden="true" style={{ fontSize: 9 }}>▼</span></>} items={WINDOWS.map(w => ({
            label: t(w.title), checked: !!(layoutState.windows[w.id]?.open),
            hint: layoutState.windows[w.id]?.detached ? t("popped out") : undefined, onSelect: () => toggleWindow(setLayoutState, w.id),
          }))} />
          <Menu ariaLabel={t("Menu")} label={<span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>☰</span>} items={[
            { heading: t("Fit") },
            { label: t("Import Fit"), onSelect: () => setSheet("import"), hint: "Ctrl+V" },
            { label: t("Export Fit"), onSelect: () => setSheet("export"), disabled: !hasFit, hint: "Ctrl+C" },
            { label: t("Export Snapshot"), onSelect: () => setSheet("snapshot"), disabled: !hasFit },
            { label: t("Ship info"), onSelect: () => setSheet("shipinfo"), disabled: !hasFit },
            { label: t("Optimize Fit Price"), onSelect: () => s.optimizeFitPrice(), disabled: !hasFit, hint: "Ctrl+D" },
            { label: t("Shopping List"), onSelect: () => setSheet("shopping"), disabled: !hasFit },
            { divider: true },
            { label: t("Settings"), onSelect: () => setSheet("settings") },
            { label: t("Send Feedback"), onSelect: () => setSheet("feedback") },
          ]} />
        </header>

        <Workspace state={layoutState} setState={setLayoutState} renderWindow={renderWindow} windowTitle={windowTitle} windowExtra={windowExtra}
          onPopOut={popOut} onDock={dock} />
      </div>

      {banner.view}

      {/* "EFT" and "EVE" stay as they are — one is a file format's name, the other the game's. */}
      {sheet === "import" && <ChooserSheet title={t("Import Fit")} onClose={close} options={[
        { icon: IconClipboard, label: t("From EFT"), sub: t("Paste from clipboard"), onSelect: importFromClipboard },
        { icon: IconCharacter, label: t("From EVE Character"), sub: t("A saved fitting or a ship in your hangar"), onSelect: () => setSheet("esiimport") },
      ]} />}
      {sheet === "export" && <ChooserSheet title={t("Export Fit")} onClose={close} options={[
        { icon: IconClipboard, label: t("To EFT"), sub: t("Copy to clipboard"), onSelect: () => setSheet("exporteft") },
        { icon: IconCharacter, label: t("To EVE Character"), sub: t("Save into in-game fittings"), onSelect: () => setSheet("esiexport") },
      ]} />}
      {sheet === "importeft" && <ImportFitSheet onClose={() => { close(); setImportInitial(null); }} onImport={s.importFit} initialText={importInitial?.text} initialErr={importInitial?.err} />}
      {sheet === "exporteft" && <ExportDialog s={s} onClose={close} onCopied={(ok) => flash(ok ? "success" : "none", ok ? t("Fit copied to clipboard") : t("Couldn't copy to the clipboard"))} />}
      {sheet === "esiimport" && <EsiImportModal onClose={close} onImport={s.importFit} />}
      {sheet === "esiexport" && <EsiExportModal activeFit={s.activeFit} slots={s.slots} drones={s.drones} cargoItems={s.cargoItems} fighters={s.fighters} implants={s.implants} boosters={s.boosters} onClose={close} />}
      {sheet === "dmgprofile" && <DamageProfileSheet current={s.dmgProfile} onSelect={s.setDmgProfile} onClose={close} />}
      {sheet === "pilot" && <PilotSheet pilot={s.slots?.pilot ?? null} setPilot={p => s.setSlots(prev => ({ ...prev, pilot: p || undefined }))}
        missing={s.skillCheck.missing} appSkills={s.skills} skillProfiles={s.skillProfiles} onClose={close} />}
      {sheet === "shipinfo" && hasFit && <ShipInfoSheet ship={ship ?? { name: s.activeFit.ship }} cs={stats.snapshot} onClose={close} />}
      {sheet === "snapshot" && <SnapshotModal onClose={close} assist={s.projectedEffects?.assist} cargoItems={s.cargoItems} fitName={s.activeFit?.fitName}
        shipName={s.activeFit?.ship} shipTypeID={tidByName(s.activeFit?.ship)} shipFaction={shipMeta.faction} shipClass={shipMeta.cls} slots={s.slots}
        cs={stats.snapshot} drones={s.drones} fighters={s.fighters} implants={s.implants} boosters={s.boosters} cmdFits={s.cmdFits} projFits={s.projFits}
        fitsDB={s.fitsDB} sourceSkills={s.sourceSkills} skillLabel={s.fitSkillLabel} dmgProfile={s.dmgProfile} priceHub={s.priceHub} priceSource={s.priceSource} />}
      {sheet === "shopping" && <ShoppingListSheet slots={s.slots} onClose={close} />}
      {sheet === "feedback" && <FeedbackModal activeFit={s.activeFit} slots={s.slots} implants={s.implants} boosters={s.boosters} drones={s.drones}
        fighters={s.fighters} cargo={s.cargoItems} projFits={s.projFits} cmdFits={s.cmdFits} fitsDB={s.fitsDB} onClose={close} />}
      {sheet === "settings" && <SettingsOverlay onClose={close} skills={s.skills} setSkills={s.setSkills} skillProfiles={s.skillProfiles}
        setSkillProfiles={s.setSkillProfiles} openInNewTab={s.openInNewTab} setOpenInNewTab={s.setOpenInNewTab} priceHub={s.priceHub}
        setPriceHub={s.setPriceHub} priceSource={s.priceSource} setPriceSource={s.setPriceSource} themePref={s.themePref} setThemePref={s.setThemePref}
        autoFillHardpoints={s.autoFillHardpoints} setAutoFillHardpoints={s.setAutoFillHardpoints} closeBrowserOnAdd={s.closeBrowserOnAdd}
        setCloseBrowserOnAdd={s.setCloseBrowserOnAdd} locale={s.locale} setLocale={s.setLocale} />}
    </SkillsProvider>
  );
}
