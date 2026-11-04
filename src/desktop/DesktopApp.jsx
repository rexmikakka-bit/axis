import { useEffect, useMemo, useState } from "react";
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
import { ExportFitModal, ChooserSheet, PilotSheet } from "../components/layout.jsx";
import { FeedbackModal } from "../components/feedback.jsx";
import { EsiImportModal, EsiExportModal } from "../components/esi-ui.jsx";
import { SkillsProvider } from "../components/skill-mark.jsx";
import { IconClipboard, IconCharacter } from "../components/glyphs.jsx";
import Workspace, { useLayoutState, openWindow, Button } from "./Workspace.jsx";
import { useActiveShip, useDeskStats, STAT_SECTIONS, StatsWindow, FittingWindow, GraphsWindow, ResourcesWindow, BrowserWindow,
         CargoWindow, DronesWindow, ImplantsWindow, EffectsWindow, NotesWindow } from "./windows.jsx";

// The desktop app. The fit session (use-fit-session.js) is the phone's, so every edit, setting and
// saved fit means the same thing in both. Around it: a header carrying everything the phone keeps in
// its menu, the open-fit tabs, and the window workspace.

export default function DesktopApp() {
  const [banner, setBanner] = useState(null);
  const s = useFitSession({
    // The fit lives in its own window here, so opening one changes no navigation.
    onFitOpened: () => {},
    notify: (kind, msg, ms) => { setBanner(kind == null ? null : { kind, msg }); if (ms) setTimeout(() => setBanner(null), ms); },
  });
  const flash = (kind, msg, ms = 3000) => { setBanner({ kind, msg }); setTimeout(() => setBanner(null), ms); };
  useEffect(() => { initKeyboardTracking(); }, []);

  const [layoutState, setLayoutState] = useLayoutState();
  const isOpen = (id) => layoutState.windows[id]?.open && !layoutState.windows[id]?.detached;

  const [sheet, setSheet] = useState(null);   // which header dialog is open
  const [importInitial, setImportInitial] = useState(null);
  const close = () => setSheet(null);

  const ship = useActiveShip(s);
  const stats = useDeskStats(s, {
    snapshot: isOpen("cargo") || isOpen("drones") || isOpen("effects") || sheet === "shipinfo" || sheet === "snapshot",
    drones: isOpen("drones"),
  });
  const shipMeta = useMemo(() => {
    const sh = s.activeFit?.ship ? lookupShip(s.activeFit.ship) : null;
    return { faction: sh?.race ?? "", cls: sh?.hullClass ?? sh?.groupName ?? "" };
  }, [s.activeFit]);

  // Same golden path as the phone's "From EFT": read the clipboard and import straight away, falling
  // back to the paste sheet pre-filled with whatever was found.
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

  const renderWindow = (id) => {
    if (STAT_SECTIONS[id]) return <StatsWindow s={s} ship={ship} sections={STAT_SECTIONS[id]} id={id} />;
    switch (id) {
      case "browser": return <BrowserWindow s={s} />;
      case "fitting": return <FittingWindow s={s} ship={ship} />;
      case "graphs": return <GraphsWindow s={s} ship={ship} />;
      case "resources": return <ResourcesWindow s={s} ship={ship} />;
      case "cargo": return <CargoWindow s={s} stats={stats} />;
      case "drones": return <DronesWindow s={s} stats={stats} />;
      case "implants": return <ImplantsWindow s={s} />;
      case "effects": return <EffectsWindow s={s} stats={stats} />;
      case "notes": return <NotesWindow s={s} />;
      default: return null;
    }
  };
  // "Fitting · Sleipnir", as the window title says which hull you are editing.
  const windowTitle = (id) => id === "fitting" && s.activeFit?.ship ? `${t("Fitting")} · ${s.activeFit.ship}` : undefined;

  const newTab = () => { s.wantNewTab.current = true; s.setNewTabIntent(true); openWindow(setLayoutState, "browser"); };
  const hasFit = !!s.activeFit?.ship;

  return (
    <SkillsProvider value={s.fitSkills}>
      <style>{getGlobalCss()}</style>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: C.bg, color: C.text, fontSize: 13 }}>
        <header style={{ height: 48, flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "0 16px",
                         background: C.surface, borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
            <span style={{ fontWeight: 700, letterSpacing: ".18em", fontSize: 14 }}>AXIS</span>
            {/* The app icon's turquoise/red split. Brand marks, so the same in every theme. */}
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22d3ee" }} />
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444" }} />
          </div>
          {hasFit && <Button onClick={() => setSheet("shipinfo")}>{t("Ship info")}</Button>}
          <span style={{ flex: 1 }} />
          {/* The pilot this fit is flown with, and whether they can fly it — the phone header's skill mark. */}
          {hasFit && <Button onClick={() => setSheet("pilot")}>
            {t("Pilot: {name}", { name: s.fitSkillLabel ?? t("All Skills V") })}
            {!s.skillCheck.ok && <span style={{ color: C.warning, marginLeft: 6 }}>{t({ one: "{n} missing", other: "{n} missing" }, { n: s.skillCheck.missing.length })}</span>}
          </Button>}
          <Button onClick={() => setSheet("dmgprofile")}>{t("Damage profile: {name}", { name: s.dmgProfile?.name ?? "Uniform" })}</Button>
          <Button onClick={() => setSheet("import")}>{t("Import")}</Button>
          <Button onClick={() => setSheet("export")} disabled={!hasFit}>{t("Export")}</Button>
          <Button onClick={() => s.optimizeFitPrice()} disabled={!hasFit}>{t("Optimize Fit Price")}</Button>
          <Button onClick={() => setSheet("shopping")} disabled={!hasFit}>{t("Shopping List")}</Button>
          <Button onClick={() => setSheet("feedback")}>{t("Send Feedback")}</Button>
          <Button onClick={() => setSheet("settings")}>{t("Settings")}</Button>
          <Button primary onClick={() => setSheet("snapshot")} disabled={!hasFit}>{t("Export Snapshot")}</Button>
        </header>

        {/* Open fits. Same tab list and rules as the phone's strip (lib/fit-tabs.js). */}
        <div role="tablist" style={{ height: 36, flex: "none", display: "flex", alignItems: "flex-end", gap: 2, padding: "0 12px",
                                     background: C.bg, borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
          {(s.openFitTabs.length ? s.openFitTabs : (hasFit ? [{ ship: s.activeFit.ship, name: s.activeFit.fitName, id: "current" }] : [])).map(tb => {
            const on = tb.ship === s.activeFit?.ship && tb.name === s.activeFit?.fitName;
            return (
              <div key={`${tb.ship}:${tb.id}:${tb.name}`} role="tab" aria-selected={on}
                style={{ height: 30, display: "flex", alignItems: "center", gap: 8, padding: "0 10px 0 12px", borderRadius: "6px 6px 0 0",
                         background: on ? C.surface : "transparent", border: `1px solid ${on ? C.border : "transparent"}`, borderBottom: "none",
                         marginBottom: -1, cursor: "pointer", whiteSpace: "nowrap" }}
                onClick={() => s.loadFit(tb.ship, tb.name, undefined, true)}>
                <span style={{ fontSize: 12, fontWeight: 700, color: on ? C.text : C.textMid }}>{tb.ship}</span>
                <span style={{ fontSize: 12, color: C.textMid }}>{tb.name}</span>
                {s.openFitTabs.length > 0 && <button type="button" aria-label={t("Close tab")} title={t("Close tab")}
                  onClick={(e) => { e.stopPropagation(); s.closeFitTab(tb); }}
                  style={{ border: "none", background: "none", color: C.textMute, cursor: "pointer", fontSize: 13, padding: 0 }}>×</button>}
              </div>
            );
          })}
          <button type="button" aria-label={t("Open a fit in a new tab")} title={t("Open a fit in a new tab")} onClick={newTab}
            style={{ height: 30, width: 30, border: "none", background: "none", color: C.textMid, cursor: "pointer", fontSize: 16 }}>+</button>
        </div>

        <Workspace state={layoutState} setState={setLayoutState} renderWindow={renderWindow} windowTitle={windowTitle} />
      </div>

      {banner && <div role="status" style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 300,
        background: banner.kind === "success" ? C.success : C.surfaceAlt, color: banner.kind === "success" ? "#0e0e10" : C.textMid,
        border: banner.kind === "success" ? "none" : `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700,
        boxShadow: "0 6px 20px rgba(0,0,0,.35)" }}>{banner.kind === "success" ? "✓ " : ""}{banner.msg}</div>}

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
      {sheet === "exporteft" && <ExportFitModal activeFit={s.activeFit} slots={s.slots} implants={s.implants} boosters={s.boosters} drones={s.drones} fighters={s.fighters} cargo={s.cargoItems} onClose={close} />}
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
