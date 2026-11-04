import { useMemo, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { calcFitStats, computeFitCostRatios, TYPES, tidByName, isT3Cruiser, t3cSlotLayout } from "../calc.js";
import { lookupShip } from "../lib/core.js";
import { FitTab, StatsTab } from "../components/tabs.jsx";
import { GraphTab } from "../components/GraphTab.jsx";
import { ResourceStrip, ModuleBrowserSheet } from "../components/ui.jsx";
import { FittingsScreen } from "../components/FittingsScreen.jsx";
import { CargoScreen } from "../components/cargo.jsx";
import { DronesScreen } from "../components/drones.jsx";
import { ImplantsScreen } from "../components/implants.jsx";
import { EffectsScreen } from "../components/effects.jsx";
import { FitTable, FitTableConfig } from "./FitTable.jsx";

// What goes inside each desktop window. Every window hosts the phone's own component for that job,
// fed from the same fit session, so the two apps cannot disagree on a number or lack each other's
// features. Desktop-shaped layouts replace these one at a time; until one does, the phone's is what
// renders.

const EMPTY = [];

/** The hull record the fitting components expect: a T3 cruiser's slots come from its subsystems. */
export function useActiveShip(s) {
  return useMemo(() => {
    const sh = s.activeFit?.ship ? lookupShip(s.activeFit.ship) : null;
    if (!sh || !isT3Cruiser(sh.name)) return sh;
    const layout = t3cSlotLayout((s.slots?.subsystems ?? []).filter(x => x?.typeID));
    return { ...sh, turrets: layout.turrets, launchers: layout.launchers,
             hiSlots: layout.hiSlots, medSlots: layout.medSlots, lowSlots: layout.lowSlots, rigSlots: layout.rigSlots };
  }, [s.activeFit?.ship, s.slots?.subsystems]);
}

/**
 * The whole-fit figures the phone's App.jsx computes for its Cargo, Drones, Effects and ship-info
 * screens, the same three calcFitStats calls with the same options. The phone gates them on which
 * screen is showing; the desktop shows them all at once, so it gates on which windows are open.
 */
export function useDeskStats(s, want) {
  const ship = s.activeFit?.ship;
  const snapshot = useMemo(() => {
    if (!ship || !want.snapshot) return null;
    try {
      const sh = lookupShip(ship) ?? { name: ship, typeID: tidByName(ship) };
      return calcFitStats(sh, s.slots, s.drones ?? [], s.fitSkills, { fighters: s.fighters, implants: s.implants, boosters: s.boosters,
        externalBursts: s.externalBursts, projectedEcm: s.projectedEffects?.ecm, pilotSec: s.slots?.pilotSec, systemSecurity: s.slots?.systemSecurity });
    } catch { return null; }
  }, [ship, s.slots, s.drones, s.fighters, s.fitSkills, s.implants, s.boosters, s.externalBursts, s.projectedEffects, want.snapshot]);
  const droneCs = useMemo(() => {
    if (!ship || !want.drones) return null;
    try {
      return calcFitStats({ name: ship, typeID: tidByName(ship) }, s.slots, s.drones ?? [], s.fitSkills, { implants: s.implants, boosters: s.boosters,
        externalBursts: s.externalBursts, projectedEffects: s.projectedEffects, pilotSec: s.slots?.pilotSec, systemSecurity: s.slots?.systemSecurity });
    } catch { return null; }
  }, [ship, s.slots, s.drones, s.fitSkills, s.implants, s.boosters, s.externalBursts, s.projectedEffects, want.drones]);
  const fighterInfo = useMemo(() => {
    if (!ship || !(s.fighters?.length) || !want.drones) return EMPTY;
    try {
      const cs = calcFitStats({ name: ship, typeID: tidByName(ship) }, s.slots, s.drones ?? [], s.fitSkills, { implants: s.implants, boosters: s.boosters,
        externalBursts: s.externalBursts, damageProfile: s.dmgProfile?.p, pilotSec: s.slots?.pilotSec, systemSecurity: s.slots?.systemSecurity,
        fighters: s.fighters.map(f => ({ name: f.name, qty: f.qty ?? 1, active: f.active, abilities: f.abilities })) });
      return cs?.fighterDetails ?? EMPTY;
    } catch { return EMPTY; }
  }, [ship, s.slots, s.drones, s.fitSkills, s.implants, s.boosters, s.externalBursts, s.fighters, s.dmgProfile, want.drones]);
  return { snapshot, droneInfo: droneCs?.droneInfo ?? EMPTY, fittedDrones: droneCs?.fittedDrones ?? null, fighterInfo };
}

export function NoFit() {
  return <div style={{ padding: 16, fontSize: 12, color: C.textMute }}>{t("Open a fit from the Browser to see it here.")}</div>;
}

// The phone's StatsTab sections, one group per window.
export const STAT_SECTIONS = {
  defense: ["resists", "recharge"],
  repsmining: ["remotereps", "mining"],
  price: ["fitvalue"],
};

export function StatsWindow({ s, ship, sections, id }) {
  if (!ship) return <NoFit />;
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <StatsTab ship={ship} slots={s.slots} setSlots={s.setSlots} skills={s.fitSkills} implants={s.implants} boosters={s.boosters}
        drones={s.drones} fighters={s.fighters} cargoItems={s.cargoItems} factorInReload={s.factorInReload} setFactorInReload={s.setFactorInReload}
        externalBursts={s.externalBursts} projectedReps={s.projectedReps} projectedEffects={s.projectedEffects}
        dmgProfile={s.dmgProfile} setDmgProfile={s.setDmgProfile} tgtProfile={s.tgtProfile} setTgtProfile={s.setTgtProfile}
        priceHub={s.priceHub} setPriceHub={s.setPriceHub} priceSource={s.priceSource} sections={sections} scrollKey={`desk:${id}`} />
    </div>
  );
}

export function FittingWindow({ s, ship, adderRef, cols, setCols }) {
  if (!ship) return <NoFit />;
  return (
    <FitTableConfig.Provider value={{ hub: s.priceHub, source: s.priceSource, cols, setCols }}>
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <FitTab TableView={FitTable} adderRef={adderRef} undo={s.undo} undoDepth={s.undoDepth} redo={s.redo} redoDepth={s.redoDepth} ship={ship} slots={s.slots} setSlots={s.setSlots}
        skills={s.fitSkills} implants={s.implants} boosters={s.boosters} drones={s.drones} factorInReload={s.factorInReload}
        externalBursts={s.externalBursts} projectedEffects={s.projectedEffects} dmgProfile={s.dmgProfile} tgtProfile={s.tgtProfile}
        autoFillHardpoints={s.autoFillHardpoints} closeBrowserOnAdd={s.closeBrowserOnAdd} />
    </div>
    </FitTableConfig.Provider>
  );
}

export function GraphsWindow({ s, ship }) {
  if (!ship) return <NoFit />;
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <GraphTab ship={ship} slots={s.slots} skills={s.fitSkills} implants={s.implants} boosters={s.boosters} drones={s.drones} fighters={s.fighters}
        factorInReload={s.factorInReload} externalBursts={s.externalBursts} projectedEffects={s.projectedEffects} tgtProfile={s.tgtProfile}
        fitsDB={s.fitsDB} sourceSkills={s.sourceSkills} openFitTabs={s.openFitTabs} onOpenFit={s.openFitInNewTab} />
    </div>
  );
}

export function ResourcesWindow({ s, ship }) {
  if (!ship) return <NoFit />;
  return <ResourceStrip ship={ship} slots={s.slots} skills={s.fitSkills} implants={s.implants} boosters={s.boosters} drones={s.drones} factorInReload={s.factorInReload} />;
}

// Segmented control: the phone's FIT_SUBTABS bar in miniature (accent tint on the active segment).
function Segmented({ value, onChange, options }) {
  return (
    <div role="tablist" style={{ display: "flex", margin: "8px 10px 0", border: `1px solid ${C.borderStrong}`, borderRadius: 6, overflow: "hidden", flex: "none" }}>
      {options.map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={value === id} onClick={() => onChange(id)}
          style={{ flex: 1, height: 28, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                   background: value === id ? C.accentLight : "transparent", color: value === id ? C.accent : C.textMid }}>{label}</button>
      ))}
    </div>
  );
}

const MARKET_SLOTS = [["high", "High"], ["mid", "Mid"], ["low", "Low"], ["rigs", "Rig"]];

/**
 * The module side of the Browser: the phone's module picker, drawn inline, aimed at whichever rack
 * the slot chips select. Picking a module fits it into the first empty slot of that rack through the
 * Fitting window's own addMod (see FitTab's adderRef), so every fitting rule holds. With the Fitting
 * window in another OS window, the add is sent to it over the sync channel instead.
 */
function MarketBrowser({ s, ship, adderRef, remoteAdd }) {
  const isStructure = (TYPES[ship?.typeID]?.c ?? TYPES[ship?.typeID]?.category) === 65;
  const racks = isStructure ? [...MARKET_SLOTS.filter(([k]) => k !== "rigs"), ["rigs", "Rig"], ["services", "Service"]] : MARKET_SLOTS;
  const [slotType, setSlotType] = useState("high");
  const cs = useMemo(() => {
    if (!ship || !s.slots) return null;
    try { return calcFitStats(ship, s.slots, s.drones ?? [], s.fitSkills, { implants: s.implants, boosters: s.boosters, externalBursts: s.externalBursts }); } catch { return null; }
  }, [ship, s.slots, s.drones, s.fitSkills, s.implants, s.boosters, s.externalBursts]);
  // FitTab's resourceHeadroom, the same three totals and the same lazy cost-ratio probe.
  const ratioCache = useMemo(() => ({ val: null }), [ship, s.slots, s.fitSkills, s.implants, s.boosters]);
  const headroom = {
    pg: { used: cs?.pgUsed ?? 0, total: cs?.pgTotal ?? 0 },
    cpu: { used: cs?.cpuUsed ?? 0, total: cs?.cpuTotal ?? 0 },
    cal: { used: cs?.calUsed ?? 0, total: cs?.calTotal ?? 400 },
    get ratios() {
      if (!ratioCache.val) ratioCache.val = (ship && s.slots) ? computeFitCostRatios(ship, s.slots, s.fitSkills,
        { implants: s.implants, boosters: s.boosters, pilotSec: s.slots?.pilotSec, systemSecurity: s.slots?.systemSecurity }) : new Map();
      return ratioCache.val;
    },
  };
  if (!ship) return <NoFit />;
  const add = (mod) => {
    if (adderRef.current) return adderRef.current(slotType, mod);
    if (remoteAdd) { remoteAdd(slotType, mod); return 1; }
    return 0;
  };
  return (
    <>
      <div style={{ display: "flex", gap: 6, padding: "8px 10px", flex: "none", flexWrap: "wrap" }}>
        {racks.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={slotType === k} onClick={() => setSlotType(k)}
            style={{ height: 22, padding: "0 9px", borderRadius: 11, fontSize: 11, cursor: "pointer",
                     background: slotType === k ? C.accentLight : "transparent", border: `1px solid ${slotType === k ? C.accent : C.borderStrong}`,
                     color: slotType === k ? C.accent : C.textMid }}>{t(label)}</button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ModuleBrowserSheet key={slotType} inline slotType={slotType} isStructure={isStructure} hullRigSize={TYPES[ship?.typeID]?.a?.rigSize ?? null}
          onSelect={add} onClose={() => {}} resourceHeadroom={headroom} ship={ship} slots={s.slots} skills={s.fitSkills}
          implants={s.implants} boosters={s.boosters} drones={s.drones} factorInReload={s.factorInReload} />
      </div>
    </>
  );
}

/**
 * One browser, two modes, as in pyfa: Market (modules) and Ships (the phone's ship library and fit
 * list). The fit list's "active" view is the fit itself, which on the desktop lives in the Fitting
 * window, so opening a fit leaves this window where it was rather than turning it into a second copy.
 */
export function BrowserWindow({ s, ship, adderRef, remoteAdd }) {
  const [mode, setMode] = useState("ships");
  const [view, setView] = useState("browse");
  const [newFitIntent, setNewFitIntent] = useState(false);
  const setBrowseView = (v) => { if (v !== "active") setView(v); };
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Segmented value={mode} onChange={setMode} options={[["market", t("Market")], ["ships", t("Ships")]]} />
      {mode === "market" ? <MarketBrowser s={s} ship={ship} adderRef={adderRef} remoteAdd={remoteAdd} /> : <></>}
      <div style={{ flex: 1, minHeight: 0, display: mode === "ships" ? "flex" : "none", flexDirection: "column" }}>
      <FittingsScreen recents={s.recentFits} undo={s.undo} undoDepth={s.undoDepth} redo={s.redo} redoDepth={s.redoDepth}
        activeFit={s.activeFit} setActiveFit={s.setActiveFit} loadFit={s.loadFit} deleteFit={s.deleteFit} view={view} setView={setBrowseView}
        fitsDB={s.fitsDB} setFitsDB={s.setFitsDB} slots={s.slots} setSlots={s.setSlots} setDrones={s.setDrones} setFighters={s.setFighters}
        fighters={s.fighters} cargoItems={s.cargoItems} setCargoItems={s.setCargoItems} setImplants={s.setImplants} setBoosters={s.setBoosters}
        setProjFits={s.setProjFits} setCmdFits={s.setCmdFits} skills={s.fitSkills} sourceSkills={s.sourceSkills} openFitTabs={s.openFitTabs}
        implants={s.implants} boosters={s.boosters} drones={s.drones} factorInReload={s.factorInReload} setFactorInReload={s.setFactorInReload}
        externalBursts={s.externalBursts} projectedReps={s.projectedReps} projectedEffects={s.projectedEffects}
        dmgProfile={s.dmgProfile} setDmgProfile={s.setDmgProfile} tgtProfile={s.tgtProfile} setTgtProfile={s.setTgtProfile}
        priceHub={s.priceHub} setPriceHub={s.setPriceHub} priceSource={s.priceSource} newFitIntent={newFitIntent} setNewFitIntent={setNewFitIntent}
        newTabIntent={s.newTabIntent} autoFillHardpoints={s.autoFillHardpoints} closeBrowserOnAdd={s.closeBrowserOnAdd}
        onOpenFit={s.openFitInNewTab} fitSubTab="Fit" setFitSubTab={s.setFitSubTab} />
      </div>
    </div>
  );
}

export function CargoWindow({ s, stats }) {
  if (!s.activeFit?.ship) return <NoFit />;
  const tid = tidByName(s.activeFit.ship);
  const cap = stats.snapshot?.cargoCapacity ?? (tid && TYPES[tid] ? (TYPES[tid].attrs?.capacity ?? 1150) : 1150);
  return <div style={{ height: "100%", display: "flex", flexDirection: "column" }}><CargoScreen items={s.cargoItems} setItems={s.setCargoItems} slots={s.slots} shipCapacity={cap} /></div>;
}

export function DronesWindow({ s, stats }) {
  if (!s.activeFit?.ship) return <NoFit />;
  const tid = tidByName(s.activeFit.ship);
  const a = tid && TYPES[tid] ? TYPES[tid].attrs : null;
  const shipFighter = a ? { cap: a.fighterCapacity ?? 0, tubes: a.fighterTubes ?? 0, light: a.fighterLightSlots ?? 0, heavy: a.fighterHeavySlots ?? 0, support: a.fighterSupportSlots ?? 0 }
                        : { cap: 0, tubes: 0, light: 0, heavy: 0, support: 0 };
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <DronesScreen drones={s.drones} setDrones={s.setDrones} droneInfo={stats.droneInfo} fittedDrones={stats.fittedDrones} fighters={s.fighters}
        setFighters={s.setFighters} fighterInfo={stats.fighterInfo} maxActiveDrones={stats.snapshot?.maxActiveDrones ?? 5}
        shipDroneBay={stats.snapshot?.droneBay ?? 0} shipDroneBandwidth={stats.snapshot?.droneBandwidth ?? 0} shipFighter={shipFighter} />
    </div>
  );
}

export function ImplantsWindow({ s }) {
  if (!s.activeFit?.ship) return <NoFit />;
  return <div style={{ height: "100%", display: "flex", flexDirection: "column" }}><ImplantsScreen implants={s.implants} setImplants={s.setImplants} loadouts={s.implantLoadouts} setLoadouts={s.setImplantLoadouts} /></div>;
}

export function EffectsWindow({ s, stats }) {
  if (!s.activeFit?.ship) return <NoFit />;
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <EffectsScreen fitsDB={s.fitsDB} boosters={s.boosters} setBoosters={s.setBoosters} projFits={s.projFits} setProjFits={s.setProjFits}
        cmdFits={s.cmdFits} setCmdFits={s.setCmdFits} sourceSkills={s.sourceSkills} openFitTabs={s.openFitTabs}
        environment={s.slots?.environment ?? null} setEnvironment={(n) => s.setSlots(prev => ({ ...prev, environment: n || undefined }))}
        jamTarget={{ strength: stats.snapshot?.sensorStrength ?? 0, type: stats.snapshot?.sensorType ?? "", resist: s.projectedEffects?.ecmResist ?? 1 }}
        assistTarget={s.projectedEffects?.assist} onOpenFit={s.openFitInNewTab} />
    </div>
  );
}

/**
 * Free text on the fit. Desktop-only for now: the phone has no notes screen. Stored as `notes` on the
 * fit record itself, so it travels with the fit through backups; the session's autosave spreads the
 * existing record, so editing the fit never drops it.
 */
export function NotesWindow({ s }) {
  const ship = s.activeFit?.ship, name = s.activeFit?.fitName;
  if (!ship || !name) return <NoFit />;
  const fit = s.fitsDB?.[ship]?.find(f => f.name === name);
  const setNotes = (notes) => s.setFitsDB(db => {
    const list = db[ship]; if (!list) return db;
    const i = list.findIndex(f => f.name === name); if (i < 0) return db;
    const next = [...list]; next[i] = { ...next[i], notes };
    return { ...db, [ship]: next };
  });
  return (
    <textarea value={fit?.notes ?? ""} onChange={(e) => setNotes(e.target.value)} placeholder={t("Notes for this fit")} aria-label={t("Notes for this fit")}
      style={{ width: "100%", height: "100%", boxSizing: "border-box", resize: "none", border: "none", outline: "none", padding: 12,
               background: "transparent", color: C.text, fontSize: 13, lineHeight: 1.45 }} />
  );
}
