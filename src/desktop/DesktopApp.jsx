import { useEffect, useMemo, useRef, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { tidByName, TYPES } from "../calc.js";
import { getGlobalCss, lookupShip, haptic, parseEFT, readClipboardText } from "../lib/core.js";
import { useFitSession } from "../use-fit-session.js";
import { ImportFitSheet, DamageProfileSheet, initKeyboardTracking, SheetFrame } from "../components/ui.jsx";
import { DialogFrame } from "./ContextMenu.jsx";
import { deskCss } from "./kit.jsx";
import { useBackdrop, Backdrop } from "./Backdrop.jsx";
import { SnapshotModal } from "../components/snapshot.jsx";
import { ShoppingListSheet } from "../components/shopping-list.jsx";
import { ShipInfoSheet } from "../components/FittingsScreen.jsx";
import DeskSettings from "./Settings.jsx";
import { ChooserSheet, PilotSheet } from "../components/layout.jsx";
import { FeedbackModal } from "../components/feedback.jsx";
import { EsiImportModal, EsiExportModal } from "../components/esi-ui.jsx";
import { SkillsProvider } from "../components/skill-mark.jsx";
import { IconClipboard, IconCharacter } from "../components/glyphs.jsx";
import Workspace, { useLayoutState, openWindow, dockWindow, detachWindow, toggleWindow, openInspector, Button } from "./Workspace.jsx";
import Menu from "./Menu.jsx";
import DeskBrowser from "./Browser.jsx";
import { FirepowerPanel } from "./Firepower.jsx";
import ExportDialog from "./ExportDialog.jsx";
import CargoPanel from "./Cargo.jsx";
import GraphsPanel from "./Graphs.jsx";
import PricePanel from "./Price.jsx";
import ImplantsPanel from "./Implants.jsx";
import DronesPanel from "./Drones.jsx";
import FightersPanel from "./Fighters.jsx";
import { ProjectedPanel, CommandPanel, BoostersPanel, EnvironmentPanel } from "./Effects.jsx";
import { WINDOWS, isFloatId, readLayoutState } from "./layout.js";
import { activeFitRef, targetKey } from "./inspect.js";
import { InspectContext } from "./inspect-context.jsx";
import { ItemsContext } from "./items-context.jsx";
import { addItem, accepts as itemAccepts } from "./items.js";
import { InspectorView, inspectorTitle } from "./Inspector.jsx";
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

const SATELLITE = (() => { try { const id = new URLSearchParams(window.location.search).get("satellite"); return WINDOWS.some(w => w.id === id) || isFloatId(id) ? id : null; } catch { return null; } })();
const INSPECTOR_WINDOWS = new Set(["info", "variations", "mutate"]);

/** The visible workspace's size, for placing a new inspector inside it. */
const workspaceView = () => ({ w: window.innerWidth, h: Math.max(200, window.innerHeight - 74) });

/**
 * The selection and the inspector windows, for the main app and a popped-out window alike. A
 * selection made in either is posted to the other, so a Variations window on a second monitor
 * follows a click in the Fitting table on the first.
 */
function useInspectorState(s, { setLayoutState, post, adderRef, remoteAdd }) {
  const [selection, setSelection] = useState(null);
  const fitRef = useMemo(() => activeFitRef(s.fitsDB, s.activeFit), [s.fitsDB, s.activeFit]);
  // The callbacks read the latest post/remoteAdd through a ref, so the context value only changes
  // when the selection or the fit does — not on every render of the app.
  const latest = useRef(null); latest.current = { post, remoteAdd };
  const value = useMemo(() => ({
    fitRef, selection,
    select: (target) => { setSelection(target); latest.current.post?.({ type: "select", target }); },
    inspect: (target, tab = "info", opts = {}) => {
      if (!target) return;
      if (setLayoutState) openInspector(setLayoutState, { target, tab, key: targetKey(target) }, { view: workspaceView(), fresh: !!opts.fresh });
      else latest.current.post?.({ type: "inspect", target, tab, fresh: !!opts.fresh });
    },
    fitModule: (rack, mod) => { if (adderRef?.current) adderRef.current(rack, mod); else latest.current.remoteAdd?.(rack, mod); },
  }), [fitRef, selection, setLayoutState, adderRef]);
  return { value, setSelection };
}

export default function DesktopRoot() {
  return SATELLITE ? <SatelliteApp id={SATELLITE} /> : <DesktopApp />;
}

const PinGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    <path d="M10 1.8 14.2 6l-2.1.7-2.6 2.6.3 3.2-1.4 1.4-2.6-2.6L2.3 14.8 1.2 13.7l3.5-3.5-2.6-2.6 1.4-1.4 3.2.3 2.6-2.6Z" />
  </svg>
);

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
function useWindowContents(s, isOpen, sheet, { adderRef, remoteAdd, cols, setCols, openValidation, openProfilePicker, selection, windows, setFloatTab, inspect, bd, notify } = {}) {
  const ship = useActiveShip(s);
  // One full calculation for every native stat window (stat-panels.jsx).
  const cs = useFitStats(s, ship);
  const issues = useMemo(() => fitIssues(cs, s.slots, s.drones), [cs, s.slots, s.drones]);
  const stats = useDeskStats(s, {
    snapshot: isOpen("cargo") || isOpen("drones") || isOpen("projected") || sheet === "shipinfo" || sheet === "snapshot",
    drones: isOpen("drones"),
  });
  const hullAttrs = TYPES[tidByName(s.activeFit?.ship)]?.attrs ?? null;
  const shipFighter = { cap: hullAttrs?.fighterCapacity ?? 0, tubes: hullAttrs?.fighterTubes ?? 0, light: hullAttrs?.fighterLightSlots ?? 0,
                        heavy: hullAttrs?.fighterHeavySlots ?? 0, support: hullAttrs?.fighterSupportSlots ?? 0 };
  // Adding any item from anywhere (Browser double-click, a drop on a window): items.js, with this
  // window's session, the fit's own stats (drone bandwidth, max drones) and the Fitting window.
  const hasFighters = shipFighter.tubes > 0;
  const items = {
    hasFighters,
    accepts: (to, item) => itemAccepts(to, item, { hasFighters }),
    add: (item, to, extra) => {
      const msg = addItem({ s, cs, shipFighter, ...extra,
        fitModule: (rack, mod) => { if (adderRef?.current) adderRef.current(rack, mod); else remoteAdd?.(rack, mod); } }, item, to);
      if (msg) notify?.("none", msg, 2500);
      return msg;
    },
  };
  const renderWindow = (id) => <ItemsContext.Provider value={items}>{renderInner(id)}</ItemsContext.Provider>;
  const renderInner = (id) => {
    // A floating inspector shows the item it was opened on; the full-time windows, the selection.
    if (isFloatId(id)) {
      const w = windows?.[id];
      return w?.target ? <InspectorView s={s} ship={ship} cs={cs} target={w.target} tab={w.tab} onTab={(tb) => setFloatTab?.(id, tb)} pinned /> : null;
    }
    if (INSPECTOR_WINDOWS.has(id)) return <InspectorView s={s} ship={ship} cs={cs} target={selection} only={id} />;
    if (STAT_SECTIONS[id]) return <StatsWindow s={s} ship={ship} sections={STAT_SECTIONS[id]} id={id} />;
    switch (id) {
      case "browser": return <DeskBrowser s={s} ship={ship} adderRef={adderRef} remoteAdd={remoteAdd} />;
      case "fitting": return <FittingWindow s={s} ship={ship} adderRef={adderRef} cols={cols?.fitting} setCols={(c) => setCols?.("fitting", c)} />;
      case "graphs": return <GraphsPanel s={s} />;
      case "resources": return <ResourcesPanel s={s} ship={ship} cs={cs} />;
      case "capacitor": return <CapacitorPanel cs={cs} />;
      case "price": return <PricePanel s={s} ship={ship} />;
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
      // Carriers keep the phone's screen for now: fighter squadrons need their tube and ability layout.
      // A hull with fighter tubes flies squadrons instead (the phone's rule: tubes, not bay size).
      case "drones": return shipFighter.tubes > 0 ? <FightersPanel s={s} stats={stats} shipFighter={shipFighter} /> : <DronesPanel s={s} stats={stats} />;
      case "implants": return <ImplantsPanel s={s} />;
      case "projected": return <ProjectedPanel s={s} jamTarget={{ strength: cs?.sensorStrength ?? 0, type: cs?.sensorType ?? "", resist: s.projectedEffects?.ecmResist ?? 1 }} />;
      case "command": return <CommandPanel s={s} />;
      case "boosters": return <BoostersPanel s={s} />;
      case "environment": return <EnvironmentPanel s={s} />;
      case "notes": return <NotesWindow s={s} />;
      // Settings is an ordinary window here, laid out for the desktop (Settings.jsx).
      case "settings": return <DeskSettings s={s} bd={bd} />;
      default: return null;
    }
  };
  // "Fitting · Sleipnir": the window title says which hull you are editing.
  const windowTitle = (id) => {
    if (isFloatId(id)) return inspectorTitle(windows?.[id]?.target, windows?.[id]?.tab, s);
    if (INSPECTOR_WINDOWS.has(id) && selection) return inspectorTitle(selection, id, s);
    if (id === "drones" && shipFighter.tubes > 0) return t("Fighters");
    return id === "fitting" && s.activeFit?.ship ? `${t("Fitting")} · ${s.activeFit.ship}` : t(WINDOWS.find(w => w.id === id)?.title ?? id);
  };
  // The Fitting window's title bar carries the fit's validity, so the Validation window can stay
  // closed until there is something to read. A full-time item window offers to pin what it is
  // showing into a window of its own, which then stays put while the selection moves on.
  const windowExtra = (id) => {
    if (id === "fitting" && cs) return <ValidityBadge issues={issues} onOpen={() => openValidation?.()} />;
    if (INSPECTOR_WINDOWS.has(id) && selection && inspect) return <TitleButton label={t("Pin in its own window")} onClick={() => inspect(selection, id, { fresh: true })}><PinGlyph /></TitleButton>;
    return null;
  };
  return { ship, stats, renderWindow, windowTitle, windowExtra };
}

/** One window, popped out into its own OS window. Closing it (or Dock) puts it back in the workspace. */
function SatelliteApp({ id }) {
  const banner = useBanner();
  const s = useFitSession({ onFitOpened: () => {}, notify: banner.notify });
  const adderRef = useRef(null);
  const sync = useSessionSync(s, { onMessage: (m) => {
    if (m.type === "add") adderRef.current?.(m.secKey, m.mod);
    if (m.type === "select") insp.setSelection(m.target ?? null);
  } });
  useEffect(() => { initKeyboardTracking(); }, []);
  useEffect(() => {
    sync.post({ type: "hello", id });
    return onThisWindowClosing(() => sync.post({ type: "closed", id }));
  }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const remoteAdd = (secKey, mod) => sync.post({ type: "add", secKey, mod });
  // A popped-out inspector reads what it was showing from the saved layout the main window wrote
  // just before opening it; its tab is its own from then on.
  const [floatWin, setFloatWin] = useState(() => isFloatId(id) ? readLayoutState(localStorage).windows[id] ?? null : null);
  const insp = useInspectorState(s, { post: sync.post, adderRef, remoteAdd });
  const { renderWindow, windowTitle } = useWindowContents(s, (w) => w === id, null,
    { adderRef, remoteAdd, selection: insp.value.selection, windows: floatWin ? { [id]: floatWin } : undefined,
      setFloatTab: (_, tab) => setFloatWin(w => w && { ...w, tab }), inspect: insp.value.inspect, notify: (k, m, ms) => banner.notify(k, m, ms) });
  const title = windowTitle(id);
  useEffect(() => { document.title = `${title} · Axis`; }, [title]);
  return (
    <InspectContext.Provider value={insp.value}>
    <SheetFrame.Provider value={DialogFrame}><SkillsProvider value={s.fitSkills}>
      <style>{getGlobalCss() + deskCss()}</style>
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
    </SkillsProvider></SheetFrame.Provider>
    </InspectContext.Provider>
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
  const bd = useBackdrop();
  const isOpen = (id) => layoutState.windows[id]?.open && !layoutState.windows[id]?.detached;

  const [sheet, setSheet] = useState(null);   // which header dialog is open
  const [importInitial, setImportInitial] = useState(null);
  const close = () => setSheet(null);

  // ── Pop-out: a real OS window per detached window ─────────────────────────────────────────────
  const popups = useRef({});
  const adderRef = useRef(null);
  const sync = useSessionSync(s, {
    onMessage: (m) => {
      if (m.type === "hello") { sync.sendAll(); sync.post({ type: "select", target: insp.value.selection }); }
      if (m.type === "add") adderRef.current?.(m.secKey, m.mod);
      if (m.type === "select") insp.setSelection(m.target ?? null);
      if (m.type === "inspect" && m.target) insp.value.inspect(m.target, m.tab, { fresh: m.fresh });
      if (m.type === "closed" && (WINDOWS.some(w => w.id === m.id) || isFloatId(m.id))) { delete popups.current[m.id]; dockWindow(setLayoutState, m.id); }
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
  const insp = useInspectorState(s, { setLayoutState, post: sync.post, adderRef, remoteAdd });
  const setFloatTab = (id, tab) => setLayoutState(st => st.windows[id] ? { ...st, windows: { ...st.windows, [id]: { ...st.windows[id], tab } } } : st);
  const { ship, stats, renderWindow, windowTitle, windowExtra } = useWindowContents(s, isOpen, sheet,
    { adderRef, remoteAdd, cols: layoutState.cols, setCols, openValidation: () => openWindow(setLayoutState, "validation"), openProfilePicker: () => setSheet("dmgprofile"),
      selection: insp.value.selection, windows: layoutState.windows, setFloatTab, inspect: insp.value.inspect, bd, notify: flash });
  // Windows left detached by a previous session have no OS window any more: bring them home.
  useEffect(() => {
    for (const id of Object.keys(layoutState.windows)) if (layoutState.windows[id]?.detached) dockWindow(setLayoutState, id);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  // The selection follows the fit: a module picked in one fit means nothing in the next one opened.
  useEffect(() => { const sel = insp.value.selection; if (sel && sel.kind !== "type" && sel.ship !== s.activeFit?.ship) insp.setSelection(null); }, [s.activeFit]);   // eslint-disable-line react-hooks/exhaustive-deps
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
    <InspectContext.Provider value={insp.value}><SheetFrame.Provider value={DialogFrame}><SkillsProvider value={s.fitSkills}>
      <style>{getGlobalCss() + deskCss()}</style>
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
                           background: on ? C.bg : "transparent", borderTop: `1px solid ${on ? C.border : "transparent"}`, borderLeft: `1px solid ${on ? C.border : "transparent"}`, borderRight: `1px solid ${on ? C.border : "transparent"}`, borderBottom: "none",
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
            { label: t("Settings"), onSelect: () => openWindow(setLayoutState, "settings") },
            { label: t("Send Feedback"), onSelect: () => setSheet("feedback") },
          ]} />
        </header>

        <Workspace state={layoutState} setState={setLayoutState} renderWindow={renderWindow} windowTitle={windowTitle} windowExtra={windowExtra}
          onPopOut={popOut} onDock={dock} backdrop={<Backdrop url={bd.url} settings={bd.settings} />} />
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
    </SkillsProvider></SheetFrame.Provider></InspectContext.Provider>
  );
}
