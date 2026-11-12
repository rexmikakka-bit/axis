import { useEffect, useMemo, useRef, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { tidByName, TYPES } from "../calc.js";
import { eveIcon } from "../lib/icons.js";
import { getGlobalCss, lookupShip, haptic, parseEFT, readClipboardText, moduleByName } from "../lib/core.js";
import { ShipInfoSheet } from "../components/FittingsScreen.jsx";
import { parsePastedModule, resolveItemLink, pastedSlot } from "../lib/abyssal-paste.js";
import { useFitSession } from "../use-fit-session.js";
import { ImportFitSheet, DamageProfileSheet, initKeyboardTracking, SheetFrame, BottomSheet } from "../components/ui.jsx";
import { ContextMenu, DialogFrame, useNativeMenuFallback } from "./ContextMenu.jsx";
import { deskCss, Empty } from "./kit.jsx";
import { useBackdrop, Backdrop } from "./Backdrop.jsx";
import { SnapshotModal } from "../components/snapshot.jsx";
import { ShoppingListSheet } from "../components/shopping-list.jsx";

import DeskSettings, { SETTINGS_EVENT } from "./Settings.jsx";
import { SHIP_INFO_EVENT, requestLayout, requestLockToggle } from "./kit.jsx";
import { ChooserSheet, PilotSheet } from "../components/layout.jsx";
import { FeedbackModal } from "../components/feedback.jsx";
import { EsiImportModal, EsiExportModal } from "../components/esi-ui.jsx";
import { SkillsProvider } from "../components/skill-mark.jsx";
import { IconClipboard, IconCharacter } from "../components/glyphs.jsx";
import Workspace, { useLayoutState, openWindow, dockWindow, detachWindow, toggleWindow, openInspector, Button, reopenClosed, CLOSED_EVENT } from "./Workspace.jsx";
import Menu from "./Menu.jsx";
import DeskBrowser from "./Browser.jsx";
import { FirepowerPanel, RemoteRepsPanel } from "./Firepower.jsx";
import ExportDialog from "./ExportDialog.jsx";
import CargoPanel from "./Cargo.jsx";
import GraphsPanel from "./Graphs.jsx";
import PricePanel from "./Price.jsx";
import ImplantsPanel from "./Implants.jsx";
import DronesPanel from "./Drones.jsx";
import FightersPanel from "./Fighters.jsx";
import { ProjectedPanel, CommandPanel, BoostersPanel, EnvironmentPanel } from "./Effects.jsx";
import { WINDOWS, isFloatId, readLayoutState } from "./layout.js";
import { activeFitRef, targetKey, typeTarget } from "./inspect.js";
import { InspectContext } from "./inspect-context.jsx";
import { ItemsContext } from "./items-context.jsx";
import { addItem, accepts as itemAccepts } from "./items.js";
import { InspectorView, inspectorTitle } from "./Inspector.jsx";
import { useSessionSync } from "./sync.js";
import { IS_TAURI, IS_WEB, openOsWindow, closeThisWindow, onThisWindowClosing } from "./os-window.js";
import { TitleButton } from "./DeskWindow.jsx";
import { UpdateBanner, openDesktopDownload } from "./update-check.jsx";
import { ACTIONS as KEY_ACTIONS, GROUPS as KEY_GROUPS, FIXED as KEY_FIXED, keysFor, keysText, actionFor, onKeymapChange } from "./keymap.js";
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

// The Windows menu's key hints: the first key bound to bringing each window up (keymap.js).
const windowKey = (id) => keysFor(id === "browser" ? "browserSearch" : `win:${id}`)[0];
// The keyboard shortcuts, for the F1 sheet: the live bindings (keymap.js), then the fixed ones and the
// mouse. A function so t() runs at render (lib/i18n.js).
const SHORTCUTS = () => [
  ...KEY_GROUPS.filter(([g]) => g !== "help").map(([g, label]) => [label(), [
    ...KEY_ACTIONS.filter(a => a.group === g && keysFor(a.id).length).map(a => [keysText(a.id), a.label()]),
    ...(g === "fits" ? KEY_FIXED() : []),
  ]]),
  [t("Module state dot"), [
    [t("Click"), t("Run or stop")], [t("Double-click · right-click"), t("Overheat")], [t("Hold · Ctrl-click"), t("Offline")],
  ]],
  [t("Fitting window"), [
    [t("Double-click"), t("Unfit a module")], ["Delete", t("Remove what is selected")], ["Esc", t("Clear the selection")],
  ]],
  [t("This list"), [[keysText("shortcuts") || "—", t("Keyboard shortcuts")], [t("Settings › Keyboard"), t("Change any of these")]]],
];
function ShortcutsSheet({ onClose }) {
  return (
    <BottomSheet title={t("Keyboard shortcuts")} onClose={onClose}>
      <div style={{ padding: "6px 18px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "4px 28px" }}>
        {SHORTCUTS().map(([group, rows]) => (
          <div key={group} style={{ breakInside: "avoid" }}>
            <div style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid, margin: "12px 0 4px" }}>{group}</div>
            {rows.map(([keys, what]) => (
              <div key={keys + what} style={{ display: "flex", justifyContent: "space-between", gap: 16, minHeight: 26, alignItems: "center", borderBottom: `1px solid ${C.border}88` }}>
                <span style={{ fontSize: 13, color: C.text }}>{what}</span>
                <span style={{ fontSize: 12, color: C.textMid, fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", whiteSpace: "nowrap" }}>{keys}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}

/** What every window shows, for the main app and for a popped-out window alike. */
function useWindowContents(s, isOpen, sheet, { adderRef, remoteAdd, cols, setCols, openValidation, openProfilePicker, selection, windows, setFloatTab, inspect, bd, notify, browserMode, openWindowFor, browseRack, browseFor } = {}) {
  const ship = useActiveShip(s);
  // One full calculation for every native stat window (stat-panels.jsx).
  const cs = useFitStats(s, ship);
  const issues = useMemo(() => fitIssues(cs, s.slots, s.drones), [cs, s.slots, s.drones]);
  const stats = useDeskStats(cs);
  const hullAttrs = TYPES[tidByName(s.activeFit?.ship)]?.attrs ?? null;
  const shipFighter = { cap: hullAttrs?.fighterCapacity ?? 0, tubes: hullAttrs?.fighterTubes ?? 0, light: hullAttrs?.fighterLightSlots ?? 0,
                        heavy: hullAttrs?.fighterHeavySlots ?? 0, support: hullAttrs?.fighterSupportSlots ?? 0 };
  // Adding any item from anywhere (Browser double-click, a drop on a window): items.js, with this
  // window's session, the fit's own stats (drone bandwidth, max drones) and the Fitting window.
  const hasFighters = shipFighter.tubes > 0;
  const items = {
    hasFighters,
    // A short message on the app's banner, for windows that refuse something (Fitting's Paste).
    notify: (msg, ms = 3000) => notify?.("none", msg, ms),
    accepts: (to, item) => itemAccepts(to, item, { hasFighters }),
    // Bring up the Browser narrowed to what `to` takes (opts.slot: one implant slot).
    browse: (to, opts) => browseFor?.(to, opts),
    add: (item, to, extra) => {
      // Whatever took the item comes up (Owen): its window opens, or its tab comes to the front.
      // Fighters live in the Drones window.
      const msg = addItem({ s, cs, shipFighter, ...extra, onAdded: (dest) => openWindowFor?.(dest === "fighters" ? "drones" : dest),
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
      case "browser": return <DeskBrowser s={s} ship={ship} cs={cs} adderRef={adderRef} remoteAdd={remoteAdd} modeRequest={browserMode} />;
      case "fitting": return <FittingWindow s={s} ship={ship} cs={cs} adderRef={adderRef} cols={cols?.fitting} setCols={(c) => setCols?.("fitting", c)} onBrowseRack={browseRack} />;
      case "graphs": return <GraphsPanel s={s} />;
      case "resources": return <ResourcesPanel s={s} ship={ship} cs={cs} />;
      case "capacitor": return <CapacitorPanel cs={cs} />;
      case "price": return <PricePanel s={s} ship={ship} />;
      case "defense": return <DefensePanel s={s} cs={cs} onPickProfile={() => openProfilePicker?.()} />;
      // Remote reps and mining sit under the firepower they belong with, only on fits that have them.
      case "firepower": return (
        // Straight under the firepower figures, the window scrolling as one, rather than pinned to its
        // bottom: on a logistics fit the firepower is all zeros and the reps are the point.
        <div style={{ height: "100%", display: "flex", flexDirection: "column", overflowY: "auto" }}>
          {((cs?.remoteRepModules?.length ?? 0) > 0 || (cs?.mining?.totalM3S ?? 0) > 0) ? <>
            <div style={{ flex: "none" }}><FirepowerPanel s={s} ship={ship} cs={cs} /></div>
            <RemoteRepsPanel cs={cs} />
            {(cs?.mining?.totalM3S ?? 0) > 0 && <div style={{ borderTop: `1px solid ${C.border}` }}>
              <StatsWindow s={s} ship={ship} sections={["mining"]} id="mining" /></div>}
          </> : <div style={{ flex: 1, minHeight: 0 }}><FirepowerPanel s={s} ship={ship} cs={cs} /></div>}
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
      // The open fit's hull, keyed on it so a tab switch to another ship starts that ship's sheet fresh.
      case "shipinfo": return ship?.typeID ? <ShipInfoSheet key={ship.typeID} embedded ship={ship} cs={cs} onClose={() => {}} /> : <Empty>{t("Open a fit from the Browser to see it here.")}</Empty>;
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
    if (id === "shipinfo" && s.activeFit?.ship) return `${t("Ship info")} · ${s.activeFit.ship}`;
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
  const textMenu = useNativeMenuFallback();
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
      {textMenu}
    </SkillsProvider></SheetFrame.Provider>
    </InspectContext.Provider>
  );
}

function DesktopApp() {
  const banner = useBanner();
  const textMenu = useNativeMenuFallback();
  const [tabMenu, setTabMenu] = useState(null);   // {x, y, tab}: a fit tab's right-click menu
  const s = useFitSession({
    // The fit lives in its own window here, so opening one changes no navigation.
    onFitOpened: () => {},
    notify: banner.notify,
  });
  const flash = (kind, msg, ms = 3000) => banner.notify(kind, msg, ms);
  useEffect(() => { initKeyboardTracking(); }, []);
  // A window closed: say so, and how to get it back.
  useEffect(() => {
    const said = (e) => {
      const names = (e.detail?.ids ?? []).map(id => t(WINDOWS.find(w => w.id === id)?.title ?? "Info"));
      // The key as bound now (the web build's default differs, and it can be rebound).
      const key = keysFor("reopenWindow")[0];
      if (names.length) flash("none", key ? t("Closed {names} · {key} reopens it", { names: names.join(", "), key }) : t("Closed {names}", { names: names.join(", ") }), 3500);
    };
    window.addEventListener(CLOSED_EVENT, said);
    return () => window.removeEventListener(CLOSED_EVENT, said);
  });
  // The hull's info sheet asked for from a right-click on empty space (the phone's hull-icon tap).
  useEffect(() => {
    const open = () => openShipInfo();
    window.addEventListener(SHIP_INFO_EVENT, open);
    return () => window.removeEventListener(SHIP_INFO_EVENT, open);
  });
  // Settings asked for from inside a window (Settings.jsx requestSettings): open and raise it.
  useEffect(() => {
    const open = () => openWindow(setLayoutState, "settings");
    window.addEventListener(SETTINGS_EVENT, open);
    return () => window.removeEventListener(SETTINGS_EVENT, open);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const [layoutState, setLayoutState] = useLayoutState();
  const bd = useBackdrop();
  // Open, docked, and drawn: a tab that is not its group's shown one counts as closed.
  const isOpen = (id) => { const w = layoutState.windows[id];
    const host = w?.in && layoutState.windows[w.in]?.stack?.includes(id) ? layoutState.windows[w.in] : w;
    return !!(w?.open && !w.detached && (!(host?.stack?.length > 1) || host.active === id)); };

  const [sheet, setSheet] = useState(null);   // which header dialog is open
  const [browserMode, setBrowserMode] = useState(null);   // {mode, n}: a request to the Browser ("+" opens it on Ships)
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
  // Ship info is a floating window on the desktop (an inspector on the hull's type, which draws the
  // phone's Ship info sheet inside it), not the phone's full-screen sheet. One per hull.
  // Which windows have something ACTIVE on the fit, for the red line on their tab when stacked: a
  // link, projection or booster switched on, a system effect, an implant plugged in, a drone or
  // fighter out. Something merely listed but switched off doesn't count.
  const windowLive = (id) => {
    if (!s.activeFit?.ship) return false;
    const on = (x) => x && x.active !== false;
    switch (id) {
      case "command": return (s.cmdFits ?? []).some(on);
      case "projected": return (s.projFits ?? []).some(on);
      case "boosters": return (s.boosters ?? []).some(b => b?.active);
      case "environment": return !!s.slots?.environment;
      case "implants": return (s.implants ?? []).some(i => i?.name && i.name !== "[Empty]");
      case "drones": return (s.drones ?? []).some(d => d?.active && (d.qty ?? 0) > 0) || (s.fighters ?? []).some(f => on(f) && (f.qty ?? 1) > 0);
      default: return false;
    }
  };
  const openShipInfo = () => { if (s.activeFit?.ship) openWindow(setLayoutState, "shipinfo"); };
  // An empty module slot's double-click: the Browser, on Market, filtered to that rack, search focused.
  // What is picked there fits into the rack's first free slot (adderRef), as a Market double-click does.
  const browseRack = (rack) => { openWindow(setLayoutState, "browser"); setBrowserMode({ mode: "market", rack, n: Date.now(), focus: true }); };
  // A window's "+" (Drones, Cargo, Boosters, an empty implant slot): the same Browser, narrowed to what
  // goes there; its double-click then adds to that window.
  const browseFor = (dest, { slot = null } = {}) => { openWindow(setLayoutState, "browser"); setBrowserMode({ mode: "market", dest, slot, n: Date.now(), focus: true }); };
  const setFloatTab = (id, tab) => setLayoutState(st => st.windows[id] ? { ...st, windows: { ...st.windows, [id]: { ...st.windows[id], tab } } } : st);
  const { ship, stats, renderWindow, windowTitle, windowExtra } = useWindowContents(s, isOpen, sheet,
    { adderRef, remoteAdd, cols: layoutState.cols, setCols, openValidation: () => openWindow(setLayoutState, "validation"), openWindowFor: (id) => openWindow(setLayoutState, id), openProfilePicker: () => setSheet("dmgprofile"),
      selection: insp.value.selection, windows: layoutState.windows, setFloatTab, inspect: insp.value.inspect, bd, notify: flash, browserMode, browseRack, browseFor });
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
  // The full list is SHORTCUTS below, which the Keyboard shortcuts sheet (F1 or ?) draws. Everything
  // stands down while a text field has focus — it never steals that field's own copy, paste or
  // typing — except Ctrl+F, whose whole point is to get to the Browser's search from anywhere. Ctrl+C
  // also stands down while text on the page is selected. Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) are the
  // session's own (use-fit-session.js). Ctrl+T, Ctrl+W and Ctrl+Tab are the browser's own in
  // `npm run dev`; they work in the installed app, which has no browser chrome to claim them, and the
  // web build defaults those actions to Alt instead (keymap.js).
  const keysRef = useRef(null);
  const [, keymapTick] = useState(0);
  useEffect(() => onKeymapChange(() => keymapTick(x => x + 1)), []);
  useEffect(() => {
    const typing = (el) => !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    const onKey = (e) => {
      const { s: cur, hasFit, sheet: open, newTab: startTab } = keysRef.current;
      // What the press is bound to (keymap.js: the defaults, with the user's changes on top).
      const a = actionFor(e);
      if (!a) return;
      if (typing(e.target) && a.when !== "anywhere") return;
      if (a.when === "fit" && !hasFit) return;
      if (a.when === "noSelection" && (!hasFit || open || window.getSelection()?.toString())) return;
      const tabs = cur.openFitTabs ?? [];
      const at = tabs.findIndex(tb => tb.ship === cur.activeFit?.ship && tb.name === cur.activeFit?.fitName);
      const step = (d) => { if (tabs.length > 1) { const tb = tabs[(Math.max(at, 0) + d + tabs.length) % tabs.length]; cur.loadFit(tb.ship, tb.name, undefined, true); } };
      // Windows come to the front, never away: open if closed, raised if open, and if it is a tab in
      // another window, made that window's shown tab, in place. Fighters live in the Drones window.
      if (a.id.startsWith("win:")) { const w = a.id.slice(4); e.preventDefault(); openWindow(setLayoutState, w === "fighters" ? "drones" : w); return; }
      if (a.id.startsWith("layout:")) { e.preventDefault(); requestLayout(Number(a.id.slice(7))); return; }
      const run = {
        newTab: startTab,
        closeTab: () => { if (at >= 0) cur.closeFitTab(tabs[at]); },
        nextTab: () => step(1),
        prevTab: () => step(-1),
        copyEft: () => setSheet("exporteft"),
        importFit: () => setSheet("import"),
        exportFit: () => setSheet("export"),
        snapshot: () => setSheet("snapshot"),
        esiImport: IS_WEB ? null : () => setSheet("esiimport"),
        esiExport: IS_WEB ? null : () => setSheet("esiexport"),
        optimizePrice: () => cur.optimizeFitPrice(),
        pickPilot: () => setSheet("pilot"),
        browserSearch: () => { openWindow(setLayoutState, "browser"); setBrowserMode({ n: Date.now(), focus: true }); },
        browserToggle: () => { openWindow(setLayoutState, "browser"); setBrowserMode({ mode: "toggle", n: Date.now() }); },
        lockLayout: () => requestLockToggle(),
        // Reopen the last closed window, where and how it was (Workspace.jsx's closed stack).
        reopenWindow: () => { if (!reopenClosed(setLayoutState, keysRef.current.windows)) flash("none", t("No closed window to reopen"), 2000); },
        shortcuts: () => setSheet("shortcuts"),
      }[a.id];
      if (!run) return;
      e.preventDefault();
      run();
    };
    const onPaste = (e) => {
      if (typing(e.target) || keysRef.current.sheet) return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (!text.trim()) return;
      const parsed = parseEFT(text);
      if (parsed.error) {
        // Not a fit: maybe ONE module (an EVE item link, an abyssal roll, an EFT line). It goes into
        // the open fit's first free slot of its rack, through the Fitting window's own add.
        const one = keysRef.current.hasFit ? parsePastedModule(text) : null;
        if (one) { e.preventDefault(); pasteModule(one); return; }
        // Only speak up when it looked like a fit: a stray paste of anything else stays silent.
        if (/^\s*\[/.test(text)) flash("none", t("That isn't a fit Axis can read: {why}", { why: parsed.error }), 4000);
        return;
      }
      e.preventDefault();
      keysRef.current.s.importFit(parsed);
      flash("success", t('Imported "{name}"', { name: parsed.fitName }));
    };
    const pasteModule = async (one) => {
      const { ship: sh, adder } = keysRef.current;
      let mod = one.mod;
      if (one.kind === "link") {
        flash("loading", t("Reading the roll from EVE…"), 8000);
        try { mod = await resolveItemLink(one.link); } catch (err) { flash("none", t("Couldn't read that item from EVE: {why}", { why: err?.message ?? "" }), 5000); return; }
      }
      const placed = pastedSlot(sh, mod);
      if (!placed || !adder.current) { flash("none", t("{name} doesn't go in any rack this ship has", { name: mod.name }), 4000); return; }
      // The adder takes a browser-style module record; a roll travels as its mutaplasmid + values.
      const n = adder.current(placed.secKey, { ...moduleByName(mod.name), name: mod.name, typeID: mod.typeID,
        ...(mod.mutaplasmid ? { mutaplasmid: mod.mutaplasmid, mutations: { ...mod.mutations }, abyssalItemId: mod.abyssalItemId } : {}) });
      flash(n ? "success" : "none", n ? t("Fitted {name}", { name: mod.name }) : t("No free slot for {name}", { name: mod.name }), 3000);
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

  // "+": a fresh, empty page. The fit you were on keeps its tab (seeded if it had none, so nothing is
  // lost), nothing is open until you pick a fit, and the Browser comes up on Ships with your recent
  // fits — whatever you open next lands in the new tab.
  const newTab = () => {
    const cur = s.activeFit;
    if (cur?.ship && cur?.fitName) s.setOpenTabs(prev => {
      const list = prev ?? [];
      if (list.some(tb => tb.ship === cur.ship && tb.name === cur.fitName)) return list;
      const f = s.fitsDB?.[cur.ship]?.find(x => x.name === cur.fitName);
      return f ? [...list, { ship: cur.ship, id: f.id, name: cur.fitName }] : list;
    });
    s.wantNewTab.current = true; s.setNewTabIntent(true);
    s.setActiveFit(null);
    openWindow(setLayoutState, "browser");
    setBrowserMode({ mode: "ships", n: Date.now() });
  };
  const hasFit = !!s.activeFit?.ship;
  keysRef.current = { s, hasFit, sheet, newTab, ship, adder: adderRef, windows: layoutState.windows };

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
              (lib/fit-tabs.js). The tabs condense to fit; only past their floor does the strip scroll. */}
          <div role="tablist" aria-label={t("Open fits")} style={{ flex: 1, minWidth: 0, alignSelf: "stretch", display: "flex", alignItems: "flex-end", gap: 2, overflowX: "auto" }}>
            {(s.openFitTabs.length ? s.openFitTabs : (hasFit ? [{ ship: s.activeFit.ship, name: s.activeFit.fitName, id: "current" }] : [])).map(tb => {
              const on = tb.ship === s.activeFit?.ship && tb.name === s.activeFit?.fitName;
              return (
                // Many tabs share the bar rather than scroll off it (Owen): each shrinks to fit, the fit
                // name giving way first and the hull name after, the open tab least; the tooltip has the
                // whole of it. Past every tab's floor the strip still scrolls.
                <div key={`${tb.ship}:${tb.id}:${tb.name}`} role="tab" aria-selected={on} title={`${tb.ship} · ${tb.name}`}
                  style={{ height: 32, display: "flex", alignItems: "center", gap: 6, padding: "0 8px 0 10px", borderRadius: "6px 6px 0 0",
                           background: on ? C.bg : "transparent", borderTop: `1px solid ${on ? C.border : "transparent"}`, borderLeft: `1px solid ${on ? C.border : "transparent"}`, borderRight: `1px solid ${on ? C.border : "transparent"}`, borderBottom: "none",
                           marginBottom: -1, cursor: "pointer", whiteSpace: "nowrap", flex: "1 1 0", minWidth: on ? 140 : 36, maxWidth: "max-content", boxSizing: "border-box", overflow: "hidden" }}
                  onClick={() => s.loadFit(tb.ship, tb.name, undefined, true)}
                  onContextMenu={(e) => { e.preventDefault(); setTabMenu({ x: e.clientX, y: e.clientY, tab: tb }); }}>
                  {/* The hull's icon: all a tab squeezed to its floor still shows, and enough to tell them apart. */}
                  <img className="eve-icon" src={eveIcon(tidByName(tb.ship), 32)} width={16} height={16} alt="" style={{ flex: "none", borderRadius: 3 }}
                    onError={e => { e.target.style.visibility = "hidden"; }} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: on ? C.text : C.textMid, flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{tb.ship}</span>
                  <span style={{ fontSize: 13.5, color: C.textMid, flex: "0 1000 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{tb.name}</span>
                  {s.openFitTabs.length > 0 && <button type="button" aria-label={t("Close tab")} title={t("Close tab")}
                    onClick={(e) => { e.stopPropagation(); s.closeFitTab(tb); }}
                    style={{ border: "none", background: "none", color: C.textMid, cursor: "pointer", fontSize: 14, padding: 0, flex: "none" }}>×</button>}
                </div>
              );
            })}
            {!hasFit && s.newTabIntent && (
              <div role="tab" aria-selected style={{ height: 32, display: "flex", alignItems: "center", padding: "0 12px", borderRadius: "6px 6px 0 0", background: C.bg,
                                                      borderTop: `1px solid ${C.border}`, borderLeft: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, marginBottom: -1, flex: "none" }}>
                <span style={{ fontSize: 13.5, color: C.textMid }}>{t("New tab")}</span>
              </div>
            )}
            <button type="button" aria-label={t("Open a fit in a new tab")} title={t("Open a fit in a new tab")} onClick={newTab}
              style={{ height: 32, width: 30, flex: "none", border: "none", background: "none", color: C.textMid, cursor: "pointer", fontSize: 16 }}>+</button>
          </div>
          {/* The pilot stays on the bar; everything else is in a menu. The damage profile went: the
              Defense window's "Incoming" chip sets the same thing where its numbers are (Owen). */}
          {hasFit && <Button onClick={() => setSheet("pilot")}>
            {s.fitSkillLabel ?? t("All Skills V")}
            {!s.skillCheck.ok && <span style={{ color: C.warning, marginLeft: 6 }}>{t({ one: "{n} missing", other: "{n} missing" }, { n: s.skillCheck.missing.length })}</span>}
          </Button>}
          <Menu label={<>{t("Windows")} <span aria-hidden="true" style={{ fontSize: 9 }}>▼</span></>} items={WINDOWS.map(w => ({
            label: t(w.title), checked: !!(layoutState.windows[w.id]?.open),
            hint: layoutState.windows[w.id]?.detached ? t("popped out") : windowKey(w.id), onSelect: () => toggleWindow(setLayoutState, w.id),
            // Right-click: straight into its own OS window, open or not (as its title bar's pop-out button).
            context: [{ label: layoutState.windows[w.id]?.detached ? t("Bring its window to the front") : t("Pop out"), onSelect: () => popOut(w.id) }],
          }))} />
          <Menu ariaLabel={t("Menu")} label={<span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>☰</span>} items={[
            { heading: t("Fit") },
            { label: t("Import Fit"), onSelect: () => setSheet("import"), hint: "Ctrl+O" },
            { label: t("Export Fit"), onSelect: () => setSheet("export"), disabled: !hasFit, hint: "Ctrl+S" },
            { label: t("Export Snapshot"), onSelect: () => setSheet("snapshot"), disabled: !hasFit, hint: keysFor("snapshot")[0] },
            { label: t("Ship info"), onSelect: openShipInfo, disabled: !hasFit },
            { label: t("Optimize Fit Price"), onSelect: () => s.optimizeFitPrice(), disabled: !hasFit, hint: "Ctrl+D" },
            { label: t("Shopping List"), onSelect: () => setSheet("shopping"), disabled: !hasFit },
            { divider: true },
            { label: t("Settings"), onSelect: () => openWindow(setLayoutState, "settings"), hint: "Ctrl+," },
            { label: t("Keyboard shortcuts"), onSelect: () => setSheet("shortcuts"), hint: "F1" },
            { label: t("Send Feedback"), onSelect: () => setSheet("feedback") },
          ]} />
        </header>

        <Workspace state={layoutState} setState={setLayoutState} renderWindow={renderWindow} windowTitle={windowTitle} windowExtra={windowExtra} windowLive={windowLive}
          backgroundItems={hasFit ? [{ heading: s.activeFit.ship }, { label: t("Ship info"), icon: eveIcon(tidByName(s.activeFit.ship), 32), onSelect: openShipInfo }] : null}
          onPopOut={popOut} onDock={dock} backdrop={<Backdrop url={bd.url} settings={bd.settings} />} />
      </div>

      {banner.view}
      {textMenu}
      {tabMenu && (() => {
        const tb = tabMenu.tab, real = s.openFitTabs.length > 0;
        const same = (x) => x.ship === tb.ship && (x.id != null && tb.id != null ? x.id === tb.id : x.name === tb.name);
        const active = tb.ship === s.activeFit?.ship && tb.name === s.activeFit?.fitName;
        const open = () => { if (!active) s.loadFit(tb.ship, tb.name, undefined, true); };
        return <ContextMenu x={tabMenu.x} y={tabMenu.y} onClose={() => setTabMenu(null)} items={[
          { heading: tb.ship },
          { label: t("Ship info"), icon: eveIcon(tidByName(tb.ship), 32), onSelect: () => { open(); openWindow(setLayoutState, "shipinfo"); } },
          { label: t("Open a fit in a new tab"), onSelect: newTab },
          real && { divider: true },
          real && { label: t("Close tab"), onSelect: () => s.closeFitTab(tb) },
          real && { label: t("Close other tabs"), disabled: s.openFitTabs.length < 2, onSelect: () => { open(); s.setOpenTabs(prev => (prev ?? []).filter(same)); } },
        ]} />;
      })()}
      {/* A newer desktop release on GitHub: a card in the corner (update-check.jsx). Main window only. */}
      <UpdateBanner />

      {/* "EFT" and "EVE" stay as they are — one is a file format's name, the other the game's. */}
      {sheet === "shortcuts" && <ShortcutsSheet onClose={close} />}
      {sheet === "import" && <ChooserSheet title={t("Import Fit")} onClose={close} options={[
        { icon: IconClipboard, label: t("From EFT"), sub: t("Paste from clipboard"), onSelect: importFromClipboard },
        // The browser build has no character login: the row stays, pointing at the desktop app.
        IS_WEB ? { icon: IconCharacter, label: t("From EVE Character"), sub: t("Needs the desktop app"), onSelect: () => { close(); openDesktopDownload(); } }
          : { icon: IconCharacter, label: t("From EVE Character"), sub: t("A saved fitting or a ship in your hangar"), onSelect: () => setSheet("esiimport") },
      ]} />}
      {sheet === "export" && <ChooserSheet title={t("Export Fit")} onClose={close} options={[
        { icon: IconClipboard, label: t("To EFT"), sub: t("Copy to clipboard"), onSelect: () => setSheet("exporteft") },
        IS_WEB ? { icon: IconCharacter, label: t("To EVE Character"), sub: t("Needs the desktop app"), onSelect: () => { close(); openDesktopDownload(); } }
          : { icon: IconCharacter, label: t("To EVE Character"), sub: t("Save into in-game fittings"), onSelect: () => setSheet("esiexport") },
      ]} />}
      {sheet === "importeft" && <ImportFitSheet onClose={() => { close(); setImportInitial(null); }} onImport={s.importFit} initialText={importInitial?.text} initialErr={importInitial?.err} />}
      {sheet === "exporteft" && <ExportDialog s={s} onClose={close} onCopied={(ok) => flash(ok ? "success" : "none", ok ? t("Fit copied to clipboard") : t("Couldn't copy to the clipboard"))} />}
      {sheet === "esiimport" && <EsiImportModal onClose={close} onImport={s.importFit} />}
      {sheet === "esiexport" && <EsiExportModal activeFit={s.activeFit} slots={s.slots} drones={s.drones} cargoItems={s.cargoItems} fighters={s.fighters} implants={s.implants} boosters={s.boosters} onClose={close} />}
      {sheet === "dmgprofile" && <DamageProfileSheet current={s.dmgProfile} onSelect={s.setDmgProfile} onClose={close} />}
      {sheet === "pilot" && <PilotSheet pilot={s.slots?.pilot ?? null} setPilot={p => s.setSlots(prev => ({ ...prev, pilot: p || undefined }))}
        missing={s.skillCheck.missing} appSkills={s.skills} skillProfiles={s.skillProfiles} onClose={close} />}
      {sheet === "snapshot" && <SnapshotModal onClose={close} projectedEffects={s.projectedEffects} cargoItems={s.cargoItems} fitName={s.activeFit?.fitName}
        shipName={s.activeFit?.ship} shipTypeID={tidByName(s.activeFit?.ship)} shipFaction={shipMeta.faction} shipClass={shipMeta.cls} slots={s.slots}
        cs={stats.snapshot} drones={s.drones} fighters={s.fighters} implants={s.implants} boosters={s.boosters} cmdFits={s.cmdFits} projFits={s.projFits}
        fitsDB={s.fitsDB} sourceSkills={s.sourceSkills} skillLabel={s.fitSkillLabel} dmgProfile={s.dmgProfile} priceHub={s.priceHub} priceSource={s.priceSource} />}
      {sheet === "shopping" && <ShoppingListSheet slots={s.slots} onClose={close} />}
      {sheet === "feedback" && <FeedbackModal activeFit={s.activeFit} slots={s.slots} implants={s.implants} boosters={s.boosters} drones={s.drones}
        fighters={s.fighters} cargo={s.cargoItems} projFits={s.projFits} cmdFits={s.cmdFits} fitsDB={s.fitsDB} onClose={close} />}
    </SkillsProvider></SheetFrame.Provider></InspectContext.Provider>
  );
}
