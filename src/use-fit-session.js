import { useState, useEffect, useMemo, useRef } from "react";
import { checkFitSkills, SKILL_DEFAULTS, tidByName } from "./calc.js";
import { SAVED_FITS_SEED, _bundleListeners, _bundleReady, generateEmptySlots, reconcileRacks, lookupShip, optimizeSlotPrice, moduleVariations, haptic } from "./lib/core.js";
import { fetchPrices } from "./prices.js";
import { THEMES, setTheme } from "./theme.js";
import { FIT_SUBTABS } from "./components/FittingsScreen.jsx";
import { buildBoosterFromName } from "./components/effects.jsx";
import { resolveTabs, MAX_OPEN_TABS, sameTab } from "./lib/fit-tabs.js";
import { getLoadedFitsDB, persistFitsDB } from "./lib/fits-store.js";
import { buildFitEntry, emptyImplants } from "./lib/fit-entry.js";
import { resolvePilotSkills, describeSkillSheet } from "./lib/pilot.js";
import { buildExternalBursts, buildProjectedEffects } from "./lib/projection.js";
import { resetScrollMemory } from "./lib/use-scroll-memory.js";
import { LOCALE_KEY, LOCALES, applyLocale, loadLocale, t } from "./lib/i18n.js";
import * as esi from "./lib/esi.js";
import { useSyncSkillLevel } from "./lib/prerelease-skill.js";
import { PRERELEASE_SKILL_KEY } from "./data/prerelease-rigs.js";

// The fit session: everything about the open fit and the app's preferences that is the SAME on the
// phone and on the desktop — the fit library, the fit being edited, its pilot and the links and
// projections on it, open tabs and recent fits, undo, and every persisted setting. Lifted out of
// App.jsx verbatim so the desktop app (src/desktop/) runs on exactly the state and actions the phone
// does; two copies of this would drift, and a feature added to one would quietly be missing from
// the other.
//
// What stays in App.jsx is phone navigation only: the bottom nav, the Fits list's view, the sheets,
// the collapsing header, Android Back, and the native status bar / keyboard / ESI-callback wiring.
// Two places the session used to reach into that navigation directly now go through callbacks:
//   onFitOpened(keepPage)  — loadFit finished; the phone switches to the Fit page unless keepPage
//   notify(kind, msg, ms)  — a transient banner (optimizeFitPrice's progress and result)

const IMPLANT_LOADOUTS_KEY = 'axis_implant_loadouts';
const OPEN_TABS_KEY = 'axis_open_tabs';
const NEW_TAB_PREF_KEY = 'axis_open_in_new_tab';
const RECENT_FITS_KEY = 'axis_recent_fits';
const FIT_SUBTAB_KEY = 'axis_fit_subtab';
const SKILL_PROFILES_KEY = 'pyfa-skill-profiles';
export const THEME_PREF_KEY = 'axis_theme_pref';
const AUTOFILL_HARDPOINTS_KEY = 'axis_autofill_hardpoints';
const CLOSE_BROWSER_ON_ADD_KEY = 'axis_close_browser_on_add';

export function useFitSession({ onFitOpened, notify } = {}) {
  const banner = (kind, msg, ms) => notify?.(kind, msg, ms);
  const[_tick,_setTick]=useState(0);
  useEffect(()=>{
    if(_bundleReady){_setTick(1);return;}
    _bundleListeners.push(()=>_setTick(t=>t+1));
  },[]);
  // Theme: defaults to 'dark' with no stored pref, or a manual pin to any palette in theme.js.
  // systemTheme tracks the OS live via a matchMedia listener, so flipping it in iOS Settings
  // while the app is open updates immediately under 'system' without a restart.
  //
  // Validated against THEMES rather than a literal list so a new palette needs no edit here. Only
  // 'system' is special: it is not a palette, it defers to the OS, which can only say light or dark.
  const[themePref,setThemePref]=useState(()=>{try{const v=localStorage.getItem(THEME_PREF_KEY);return(v==="system"||THEMES.includes(v))?v:"dark";}catch{return"dark";}});
  useEffect(()=>{try{localStorage.setItem(THEME_PREF_KEY,themePref);}catch{}},[themePref]);
  const[systemTheme,setSystemTheme]=useState(()=>{try{return window.matchMedia('(prefers-color-scheme: light)').matches?"light":"dark";}catch{return"dark";}});
  useEffect(()=>{
    let mq;try{mq=window.matchMedia('(prefers-color-scheme: light)');}catch{return;}
    const onChange=()=>setSystemTheme(mq.matches?"light":"dark");
    mq.addEventListener?.('change',onChange);
    return()=>mq.removeEventListener?.('change',onChange);
  },[]);
  const resolvedTheme=themePref==="system"?systemTheme:themePref;
  // Language: English unless explicitly chosen. main.jsx has already resolved and loaded the stored
  // pref before this component existed, so the FIRST render is already in the right language; this
  // effect only covers switching it afterwards, where the catalog chunk has to be fetched and the
  // tick is what re-renders the tree once it arrives.
  const[locale,setLocale]=useState(()=>{try{const v=localStorage.getItem(LOCALE_KEY);return LOCALES.some(l=>l.code===v)?v:"en";}catch{return"en";}});
  useEffect(()=>{try{localStorage.setItem(LOCALE_KEY,locale);}catch{}},[locale]);
  useEffect(()=>{let dead=false;loadLocale(locale).then(()=>{if(!dead)_setTick(t=>t+1);});return()=>{dead=true;};},[locale]);
  // Same synchronous-in-render placement as setTheme below, and for the same reason: t() reads this
  // during the render it is called in, so applying it in an effect would paint one frame late.
  applyLocale(locale);
  // Mutating theme.js's module-level palette selector synchronously, in the same render pass that
  // reads it below (via C.xxx in the JSX), same precedent as _tick above: a plain useEffect would
  // apply the switch one render late, showing a frame of the old palette.
  setTheme(resolvedTheme);
  // Fits come from IndexedDB, which main.jsx has already loaded into memory before this renders —
  // getLoadedFitsDB() is a synchronous read of that snapshot, not a fetch. An empty object is a real
  // answer (a user who deleted everything), so only a null/absent store falls back to the seed.
  const[fitsDB,setFitsDB]=useState(()=>getLoadedFitsDB()??SAVED_FITS_SEED);
  const[activeFit,setActiveFit]=useState(()=>{try{const s=localStorage.getItem("pyfa-activefit");if(s)return JSON.parse(s);}catch{}return null;});
  const initialFit=(()=>{try{const db=getLoadedFitsDB();const af=JSON.parse(localStorage.getItem("pyfa-activefit")||"null");if(db&&af)return db[af.ship]?.find(f=>f.name===af.fitName)||null;}catch{}return null;})();
  // reconcileRacks, because a saved fit carries the rack sizes it was made with — see core.js. Both
  // fit-load paths go through it (here for the fit restored on launch, and in loadFit below).
  const[slots,setSlots]=useState(initialFit?.slots
    ?reconcileRacks(initialFit.slots,lookupShip(activeFit?.ship))
    :generateEmptySlots(lookupShip("Hyperion")));
  const[drones,setDrones]=useState(initialFit?.drones??[]);
  const[fighters,setFighters]=useState(initialFit?.fighters??[]);
  const[dmgProfile,setDmgProfile]=useState({name:"Uniform",p:[0.25,0.25,0.25,0.25]});
  // Resists of whatever the fit is shooting. A VIEWING parameter like dmgProfile above (its
  // outgoing-damage counterpart), not part of the fit, so it lives here and is not persisted.
  const[tgtProfile,setTgtProfile]=useState({n:"None (0%)",r:[0,0,0,0]});
  const[cargoItems,setCargoItems]=useState(initialFit?.cargo??[]);
  const[implants,setImplants]=useState(initialFit?.implants??emptyImplants());
  const[boosters,setBoosters]=useState(initialFit?.boosters??[]);
  const[implantLoadouts,setImplantLoadouts]=useState(()=>{try{return JSON.parse(localStorage.getItem(IMPLANT_LOADOUTS_KEY)??'[]');}catch{return [];}});
  useEffect(()=>{try{localStorage.setItem(IMPLANT_LOADOUTS_KEY,JSON.stringify(implantLoadouts));}catch{}},[implantLoadouts]);
  // Open fit tabs: pointers to fits in fitsDB, restored on launch like browser tabs. Stored as
  // {ship,id,name}; resolveTabs() reconciles them against the live fitsDB on every render, so a
  // renamed fit relabels itself and a deleted one drops out without this needing to hook the
  // rename/delete handlers.
  const[openTabs,setOpenTabs]=useState(()=>{try{const s=localStorage.getItem(OPEN_TABS_KEY);if(s)return JSON.parse(s);}catch{}return [];});
  useEffect(()=>{try{localStorage.setItem(OPEN_TABS_KEY,JSON.stringify(openTabs));}catch{}},[openTabs]);
  // Which of Modules/Stats/Graph the fitting screen is on. Persisted because leaving the Fitting
  // tab unmounts that screen, and it lives up here rather than inside it because the screens that
  // open ANOTHER fit — Effects, and the graph's target chip — have to be able to say which page it
  // should land on, and Effects is not even mounted at the same time as the fitting screen.
  const[fitSubTab,setFitSubTab]=useState(()=>{
    try{const s=localStorage.getItem(FIT_SUBTAB_KEY);if(s&&FIT_SUBTABS.includes(s))return s;}catch{}
    return "Fit";
  });
  useEffect(()=>{try{localStorage.setItem(FIT_SUBTAB_KEY,fitSubTab);}catch{}},[fitSubTab]);
  // Most-recently-OPENED fits, newest first. Separate from openTabs: a tab can be closed while the
  // fit stays recent, and the strip is capped at MAX_OPEN_TABS for layout reasons rather than
  // history. Stored as {ship,id,name} like the tabs, so a rename still resolves by id.
  const[recentFits,setRecentFits]=useState(()=>{try{const s=localStorage.getItem(RECENT_FITS_KEY);if(s)return JSON.parse(s);}catch{}return [];});
  useEffect(()=>{try{localStorage.setItem(RECENT_FITS_KEY,JSON.stringify(recentFits));}catch{}},[recentFits]);
  // Off by default: opening every fit in its own tab fills the strip within a session, and most
  // opens are "show me this fit", not "keep the last one to hand". So a plain open REPLACES the
  // current tab, and you ask for a new one explicitly (the + in the strip, or Open in New Tab in
  // the Fits list). Setting flips it to pyfa's always-new-tab behaviour.
  const[openInNewTab,setOpenInNewTab]=useState(()=>{try{return localStorage.getItem(NEW_TAB_PREF_KEY)==="1";}catch{return false;}});
  useEffect(()=>{try{localStorage.setItem(NEW_TAB_PREF_KEY,openInNewTab?"1":"0");}catch{}},[openInNewTab]);
  // On by default: picking one turret/launcher from the browser is almost always "put these on
  // every hardpoint", not "just this one" — see addMod in tabs.jsx. Stored inverted ("0" to opt
  // out) so an absent key, i.e. everyone who upgrades into this, keeps the new default.
  const[autoFillHardpoints,setAutoFillHardpoints]=useState(()=>{try{return localStorage.getItem(AUTOFILL_HARDPOINTS_KEY)!=="0";}catch{return true;}});
  useEffect(()=>{try{localStorage.setItem(AUTOFILL_HARDPOINTS_KEY,autoFillHardpoints?"1":"0");}catch{}},[autoFillHardpoints]);
  // Off by default, which is the CURRENT behaviour: the browser stays open and retargets the next
  // empty slot. On restores the older one-item-then-close, for people filling a rack by hand.
  const[closeBrowserOnAdd,setCloseBrowserOnAdd]=useState(()=>{try{return localStorage.getItem(CLOSE_BROWSER_ON_ADD_KEY)==="1";}catch{return false;}});
  useEffect(()=>{try{localStorage.setItem(CLOSE_BROWSER_ON_ADD_KEY,closeBrowserOnAdd?"1":"0");}catch{}},[closeBrowserOnAdd]);
  // One-shot override for the explicit "open in a new tab" affordances, consumed by the next
  // loadFit. A ref rather than state so setting it cannot race the load it is meant to modify.
  const wantNewTab=useRef(false);
  // A render-visible mirror of the ref above, purely so the Fits list can say what the next tap is
  // going to do. Only the + arms it: the other two setters of the ref (an EFT/ESI import, the
  // Effects screen's "open this fit") never send you to the list, so there is nothing to caption.
  const[newTabIntent,setNewTabIntent]=useState(false);
  // The fit restored at launch comes straight out of localStorage rather than through loadFit, so
  // nothing registered its tab. Seed it once on mount -- but ONLY if the strip already has tabs.
  //
  // An empty strip is a legitimate state, not a gap to be filled: it means the user is not using
  // tabs. Seeding unconditionally meant closing every tab was undone by the next launch, which is
  // the same "don't drag me into the tab system" problem as a plain open creating one.
  useEffect(()=>{
    if(!activeFit?.ship||!activeFit?.fitName)return;
    setOpenTabs(prev=>{
      const list=prev??[];
      if(!list.length)return list;
      if(list.some(tb=>tb.ship===activeFit.ship&&tb.name===activeFit.fitName))return list;
      const fit=fitsDB[activeFit.ship]?.find(f=>f.name===activeFit.fitName);
      if(!fit)return list;
      return [...list,{ship:activeFit.ship,id:fit.id,name:activeFit.fitName}];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const[priceHub,setPriceHub]=useState(()=>{try{return localStorage.getItem('axis_pricehub')??'Jita';}catch{return 'Jita';}});
  useEffect(()=>{try{localStorage.setItem('axis_pricehub',priceHub);}catch{}},[priceHub]);
  const[priceSource,setPriceSource]=useState(()=>{try{return localStorage.getItem('axis_pricesource')??'fuzzwork';}catch{return 'fuzzwork';}});
  useEffect(()=>{try{localStorage.setItem('axis_pricesource',priceSource);}catch{}},[priceSource]);
  const[projFits,setProjFits]=useState(initialFit?.projFits??[]);
  const[cmdFits,setCmdFits]=useState(initialFit?.cmdFits??[]);
  const[skills,setSkills]=useState(()=>{try{const s=localStorage.getItem("pyfa-skills");if(s)return{...SKILL_DEFAULTS,...JSON.parse(s)};}catch{}return SKILL_DEFAULTS;});
  // Named copies of that sheet, saved from Settings → Skills and offered in the per-fit Pilot picker.
  // Keyed `pyfa-*` rather than `axis_*` — unlike the implant loadouts, a fit REFERENCES one of these
  // by id (`profile:<id>`), so a key outside backup-io's `pyfa[-_]` net would restore a fit whose
  // named pilot no longer exists and silently drop it back to the app-wide sheet.
  const[skillProfiles,setSkillProfiles]=useState(()=>{try{const s=JSON.parse(localStorage.getItem(SKILL_PROFILES_KEY)??'[]');return Array.isArray(s)?s:[];}catch{return [];}});
  useEffect(()=>{try{localStorage.setItem(SKILL_PROFILES_KEY,JSON.stringify(skillProfiles));}catch{}},[skillProfiles]);
  // Every linked character's synced sheet, keyed by character id — written by the ESI sync, read
  // here so a fit that names a pilot resolves without a network call. Re-read on the same change
  // event the ESI panels use, so syncing a character updates an open fit immediately.
  const[esiSkills,setEsiSkills]=useState(()=>esi.getAllCharacterSkills());
  useEffect(()=>esi.onCharactersChanged(()=>setEsiSkills(esi.getAllCharacterSkills())),[]);
  // The sheet THIS fit is flown with. A fit can name its pilot (`slots.pilot`); with none named it
  // falls back to the app-wide sheet, which is what every fit did before pilots existed.
  // The pre-release Synchronizer Rigging level (lib/prerelease-skill.js) is laid over every pilot:
  // no character has the skill yet, so this is the only place its level can come from.
  const syncSkill=useSyncSkillLevel();
  const pilotSkills=useMemo(()=>resolvePilotSkills(slots?.pilot,{appSkills:skills,esiSkills,profiles:skillProfiles,fallback:skills}),
                          [slots?.pilot,skills,esiSkills,skillProfiles]);
  const fitSkills=useMemo(()=>({...pilotSkills,[PRERELEASE_SKILL_KEY]:syncSkill}),[pilotSkills,syncSkill]);
  // The sheet a SOURCE fit (projected / command) is flown with. Resolved exactly like `fitSkills`,
  // so a saved fit reads the same whether you are editing it or projecting it — the skills it was
  // last edited under are the skills it keeps. Shared with the Effects tab, which renders a card for
  // each of these: the card and the applied value have to resolve identically or they disagree, and
  // that has happened before (see the burst comment below).
  const sourceSkills=useMemo(()=>(fit)=>({...resolvePilotSkills(fit?.slots?.pilot,{appSkills:skills,esiSkills,profiles:skillProfiles,fallback:skills}),[PRERELEASE_SKILL_KEY]:syncSkill}),
                             [skills,esiSkills,skillProfiles,syncSkill]);
  // What the RESOLVED sheet is, in words, for the snapshot card's footer. Derived from the sheet
  // rather than from `slots.pilot`, so a fit with no pilot named still says whether the app-wide
  // sheet it fell back to is all V or someone's actual character.
  const fitSkillLabel=useMemo(()=>describeSkillSheet(pilotSkills,{esiSkills,characters:esi.listCharacters(),profiles:skillProfiles}),
                              [pilotSkills,esiSkills,skillProfiles]);
  // Can this character actually fly the fit? Checked against every fitted item's own
  // requiredSkillN/requiredSkillNLevel, not just the skills the dogma engine reads.
  const skillCheck=useMemo(()=>activeFit?.ship
    ? checkFitSkills(lookupShip(activeFit.ship)??{name:activeFit.ship,typeID:tidByName(activeFit.ship)},slots,drones,fighters,fitSkills)
    : {ok:true,missing:[]},
  [activeFit,slots,drones,fighters,fitSkills]);
  // Shared by the local fit's own command tab AND by each PROJECTED fit's command tab below — a
  // projected logi (e.g. a Guardian) can carry its own cmdFits (its own Sleipnir/Claymore links),
  // saved on that fit exactly like the active fit's are (see the fitsDB-writeback effect below).
  // Both live in lib/projection.js so the damage graph can apply the same links and projections to
  // its TARGET fit.
  const externalBursts=useMemo(()=>buildExternalBursts(cmdFits,fitsDB,sourceSkills),[cmdFits,fitsDB,sourceSkills]);
  const projectedEffects=useMemo(()=>buildProjectedEffects({projFits,fitsDB,sourceSkills,shipName:activeFit?.ship,slots,skills:fitSkills,externalBursts}),
    [projFits,fitsDB,fitSkills,sourceSkills,activeFit,slots,externalBursts]);
  const projectedReps=projectedEffects.reps;
  const[factorInReload,setFactorInReload]=useState(()=>{try{return localStorage.getItem("pyfa-factor-reload")==="1";}catch{return false;}});
  const optimizeFitPrice=async()=>{
    if(!activeFit?.ship){banner("none",t("Open a fit first"),3000);return;}
    const sections=["high","mid","low","rigs","subsystems"];
    const fitted=sections.flatMap(sec=>slots[sec]??[]).filter(s=>s?.typeID);
    if(!fitted.length){banner("none",t("No modules to optimize"),3000);return;}
    banner("loading",t("Checking market prices…"));
    const idsToPrice=new Set();
    for(const s of fitted){
      if(s.mutaplasmid)continue;   // abyssal: not a market item, and its roll belongs to THIS base type
      idsToPrice.add(s.typeID);
      for(const v of (moduleVariations?.[String(s.typeID)]??[]))if(v?.typeID)idsToPrice.add(v.typeID);
    }
    let priceMap;
    // fetchPrices carries its own timeout, so this always settles — offline, the banner says so
    // rather than sitting on "Checking market prices…" until the app is restarted.
    try{priceMap=await fetchPrices([...idsToPrice],priceHub,priceSource);}
    catch(e){banner("none",e?.offline?t("No connection — market prices need internet"):t("Couldn't fetch market prices — try again"),3500);return;}
    let swapped=0;
    const patchSection=sec=>(slots[sec]??[]).map(s=>{
      const next=optimizeSlotPrice(s,priceMap);   // returns `s` itself when nothing changes
      if(next!==s)swapped++;
      return next;
    });
    const patched={...slots};
    for(const sec of sections)patched[sec]=patchSection(sec);
    if(!swapped){banner("none",t("No cheaper equivalents found"),3000);return;}
    setSlots(patched);
    banner("success",t({one:"Fit price optimized — {n} module swapped",other:"Fit price optimized — {n} modules swapped"},{n:swapped}),3500);
  };
  // `fitOverride` is for a fit that was JUST created and is not in fitsDB yet. setFitsDB is async,
  // so a caller that creates a fit and then loads it by name closes over the previous map and finds
  // nothing -- which silently skipped the tab registration (the fit opened, but never as a tab)
  // while still setting activeFit, so it looked like it half-worked. Passing the object removes the
  // timing question entirely.
  // `keepPage` leaves you on whatever screen you were already on. Switching between OPEN TABS is the
  // case: the tabs are a way to compare the same aspect of two fits, so being thrown back to the Fit
  // page meant re-navigating to Effects (or Drones, or Cargo) after every switch — which is most of
  // the work the strip exists to save. Opening a fit from the library still lands on the Fit page,
  // because there you picked the fit itself rather than a comparison.
  const loadFit=(ship,fitName,fitOverride,keepPage)=>{
    const fit=fitOverride??fitsDB[ship]?.find(f=>f.name===fitName);
    // A different fit is a fresh read, so it starts at the top rather than wherever the last one was
    // scrolled to. Re-opening the fit you are already in keeps your place.
    if(activeFit?.ship!==ship||activeFit?.fitName!==fitName) resetScrollMemory();
    setActiveFit({ship,fitName});
    // Every route into a fit goes through here, so this is the one place that sees an "open".
    if(fit) setRecentFits(prev=>{
      const rest=(prev??[]).filter(r=>!(r.ship===ship&&(r.id!=null&&fit.id!=null?r.id===fit.id:r.name===fitName)));
      return [{ship,id:fit.id,name:fitName},...rest].slice(0,8);
    });
    // Opening a fit raises its tab if it already has one; otherwise it either REPLACES the current
    // tab (the default -- see openInNewTab) or is appended. Soft cap on append: past MAX_OPEN_TABS
    // the oldest tab is dropped, so the strip stays scannable on a phone. Nothing is lost -- the
    // Fits list is still the full library.
    const newTab=wantNewTab.current||openInNewTab; wantNewTab.current=false;
    // `activeFit` here is still the PREVIOUS fit: setActiveFit above only queues the update, which
    // is exactly what "replace the tab I was in" needs.
    const prevFit=activeFit;
    if(fit) setOpenTabs(prev=>{
      const list=prev??[];
      // Match on id only when BOTH sides have a usable one. The old test was `tb.id != null`, which
      // is TRUE for NaN — and NaN === NaN is false, so a fit carrying a NaN id never matched its
      // own tab and every open appended another copy. Falling back to the name is always safe here:
      // a ship's fit names are unique by construction (createNewFit dedupes them).
      const at=list.findIndex(tb=>tb.ship===ship&&sameTab(tb,fit,fitName));
      if(at>=0)return list;
      const entry={ship,id:fit.id,name:fitName};
      // A PLAIN open must never drag someone into the tab system who is not using it. With the
      // strip empty, opening a fit just swaps what is on screen and the strip stays empty.
      //
      // This branch used to fall through to the seeding below, which pushed the fit you were
      // leaving AND the one you opened -- so a plain open with no tabs at all produced TWO tabs
      // out of nothing. That seeding is only correct when a new tab was explicitly asked for.
      if(!newTab){
        if(!list.length)return list;
        const cur=prevFit?list.findIndex(tb=>tb.ship===prevFit.ship&&tb.name===prevFit.fitName):-1;
        // Replace the tab you were in; if the current fit somehow has no tab, append rather than
        // silently dropping the fit being opened.
        if(cur>=0){const next=[...list];next[cur]=entry;return next;}
        const appended=[...list,entry];
        return appended.length>MAX_OPEN_TABS?appended.slice(appended.length-MAX_OPEN_TABS):appended;
      }
      // Explicitly asking for a new tab: keep what you were already working on. The fit you are
      // leaving does not always have a tab yet -- a fit made with "+ New Fit" never went through
      // loadFit, so nothing ever registered one -- and appending alone silently dropped it, leaving
      // the strip showing only the fit you just opened. Seed the outgoing fit as tab 1 first.
      const base=[...list];
      if(prevFit?.ship&&prevFit?.fitName&&!base.some(tb=>tb.ship===prevFit.ship&&tb.name===prevFit.fitName)){
        const pf=fitsDB[prevFit.ship]?.find(f=>f.name===prevFit.fitName);
        if(pf)base.push({ship:prevFit.ship,id:pf.id,name:prevFit.fitName});
      }
      const next=[...base,entry];
      return next.length>MAX_OPEN_TABS?next.slice(next.length-MAX_OPEN_TABS):next;
    });
    setSlots(fit?.slots?reconcileRacks(fit.slots,lookupShip(ship)):generateEmptySlots(lookupShip(ship)));
    setDrones(fit?.drones??[]);
    setFighters(fit?.fighters??[]);
    setCargoItems(fit?.cargo??[]);
    setImplants(fit?.implants??emptyImplants());
    setBoosters(fit?.boosters??[]);
    setProjFits(fit?.projFits??[]);
    setCmdFits(fit?.cmdFits??[]);
    onFitOpened?.(keepPage);
  };
  const importFit=(parsed)=>{
    const{shipName,fitName}=parsed;
    // Built OUTSIDE the updater so it can be handed straight to loadFit — the setFitsDB below is
    // still pending when loadFit runs, so a lookup by name would miss it.
    const existing=fitsDB[shipName]||[];
    const exIdx=existing.findIndex(f=>f.name===fitName);
    const entry=buildFitEntry(parsed,{id:exIdx>=0?existing[exIdx].id:Date.now(),buildBooster:buildBoosterFromName});
    setFitsDB(db=>{
      const ex=db[shipName]||[];
      const idx=ex.findIndex(f=>f.name===fitName);
      if(idx>=0){const u=[...ex];u[idx]=entry;return{...db,[shipName]:u};}
      return{...db,[shipName]:[...ex,entry]};
    });
    // Importing used to set every piece of state by hand, which meant it never went through the
    // tab bookkeeping and an imported fit simply did not appear in the strip. Same bug shape as
    // createNewFit had. Route it through loadFit instead, which owns that logic — and when the
    // user already has more than one tab open, don't clobber one of them.
    if((openTabs?.length??0)>=2) wantNewTab.current=true;
    loadFit(shipName,fitName,entry);
  };
  useEffect(()=>{if(!activeFit?.ship||!activeFit?.fitName)return;setFitsDB(db=>{const sf=db[activeFit.ship];if(!sf)return db;const idx=sf.findIndex(f=>f.name===activeFit.fitName);if(idx<0)return db;const u=[...sf];u[idx]={...u[idx],slots,drones,fighters,cargo:cargoItems,implants,boosters,projFits,cmdFits};return{...db,[activeFit.ship]:u};});},[slots,drones,fighters,cargoItems,implants,boosters,projFits,cmdFits,activeFit]);
  // Writes only the hulls whose array identity changed, in one IndexedDB transaction — the effect
  // above rebuilds exactly one hull's array per edit, so a keystroke costs one small record rather
  // than re-serialising the whole library the way the old localStorage blob did.
  useEffect(()=>{persistFitsDB(fitsDB);},[fitsDB]);
  useEffect(()=>{try{localStorage.setItem("pyfa-activefit",JSON.stringify(activeFit));}catch{}},[activeFit]);
  useEffect(()=>{try{localStorage.setItem("pyfa-skills",JSON.stringify(skills));}catch{}},[skills]);
  useEffect(()=>{try{localStorage.setItem("pyfa-factor-reload",factorInReload?"1":"0");}catch{}},[factorInReload]);
  // ── Undo ────────────────────────────────────────────────────────────────────────────────────
  // History of the fit's editable state — the SAME eight values the persistence effect above writes
  // back to fitsDB, so "one undo step" and "one saved change" mean the same thing by construction.
  // Snapshots are cheap: every mutation path already replaces these arrays immutably, so a snapshot
  // is eight references, not a deep clone.
  const UNDO_LIMIT=50;
  const _undoStack=useRef([]);
  const _redoStack=useRef([]);
  const _undoPrev=useRef(null);       // last committed snapshot
  const _applyingHistory=useRef(false);// true while undo/redo is being applied, so it isn't re-recorded
  const _undoFitKey=useRef(undefined);// which fit the stacks belong to
  const[undoDepth,setUndoDepth]=useState(0);
  const[redoDepth,setRedoDepth]=useState(0);
  const _fitSnapshot=useMemo(()=>({slots,drones,fighters,cargoItems,implants,boosters,projFits,cmdFits}),
    [slots,drones,fighters,cargoItems,implants,boosters,projFits,cmdFits]);
  useEffect(()=>{
    const key=activeFit?`${activeFit.ship}\0${activeFit.fitName}`:null;
    const prev=_undoPrev.current;
    _undoPrev.current=_fitSnapshot;
    // Switching fits (or the first load) replaces all eight values at once. That is not an edit —
    // recording it would let Undo paste the previous fit's modules into this one.
    if(_undoFitKey.current!==key){
      _undoFitKey.current=key;
      _undoStack.current=[];
      _redoStack.current=[];
      _applyingHistory.current=false;
      setUndoDepth(0);
      setRedoDepth(0);
      return;
    }
    if(_applyingHistory.current){_applyingHistory.current=false;return;}
    // `prev === _fitSnapshot` means the effect re-ran without the fit actually changing — which
    // StrictMode's deliberate double-invoke does on every mount. Recording that would seed the
    // stack with a no-op entry, so the first Undo press would appear to do nothing.
    if(prev===null||prev===_fitSnapshot)return;
    _undoStack.current.push(prev);
    if(_undoStack.current.length>UNDO_LIMIT)_undoStack.current.shift();
    setUndoDepth(_undoStack.current.length);
    // Editing after undoing forks the history: what was undone no longer follows on from what is on
    // screen, so keeping it redoable would splice two different fits together.
    if(_redoStack.current.length){_redoStack.current=[];setRedoDepth(0);}
  },[_fitSnapshot,activeFit]);
  // `_undoPrev` is whatever is on screen right now, so each direction hands the other the exact state
  // it is leaving — that symmetry is what makes undo/redo round-trip.
  const _travel=(from,to)=>{
    const snap=from.current.pop();
    if(!snap)return;
    to.current.push(_undoPrev.current);
    _applyingHistory.current=true;  // cleared by the effect this batch triggers
    setSlots(snap.slots);setDrones(snap.drones);setFighters(snap.fighters);
    setCargoItems(snap.cargoItems);setImplants(snap.implants);setBoosters(snap.boosters);
    setProjFits(snap.projFits);setCmdFits(snap.cmdFits);
    setUndoDepth(_undoStack.current.length);
    setRedoDepth(_redoStack.current.length);
    haptic();
  };
  const undo=()=>_travel(_undoStack,_redoStack);
  const redo=()=>_travel(_redoStack,_undoStack);
  // Ctrl/Cmd+Z and its two redo spellings for the desktop and web builds; the buttons cover touch.
  useEffect(()=>{
    const onKey=e=>{
      if(!(e.ctrlKey||e.metaKey))return;
      const z=e.key==='z'||e.key==='Z',y=e.key==='y'||e.key==='Y';
      if(!z&&!y)return;
      const el=e.target;
      if(el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.isContentEditable))return; // let the field undo its own text
      e.preventDefault();
      if(y||e.shiftKey)redo();else undo();
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  });// no dep array: `undo`/`redo` close over the current stacks each render
  const openFitTabs=resolveTabs(openTabs,fitsDB);
  // Jumping to a fit that some OTHER fit points at — one you projected, one supplying command
  // bursts, one standing in as the graph's target. Always a new tab rather than a load in place:
  // the fit you are editing is the reason you are looking at the other one, so replacing it loses
  // the comparison you opened this for. Shared by every screen that names another fit, so they
  // cannot drift into meaning different things by "Open".
  // Always lands on Modules. The sub-tab otherwise persists across fits, which is right when YOU
  // change fits, but every one of these buttons is reached by asking what some other ship is
  // carrying — and answering that with the graph or stats page you happened to leave open is
  // answering a question nobody asked.
  const openFitInNewTab=(ship,fitName)=>{wantNewTab.current=true;setFitSubTab("Fit");loadFit(ship,fitName);};
  // Closing the tab you are looking at moves to its neighbour, the way a browser does; closing any
  // other tab leaves the current fit alone. Closing the last tab just empties the strip -- the fit
  // stays loaded, since the strip is a shortcut rather than the thing holding the fit open.
  const closeFitTab=(tab)=>{
    const idx=openFitTabs.findIndex(tb=>tb.ship===tab.ship&&tb.id===tab.id);
    const wasActive=activeFit?.ship===tab.ship&&activeFit?.fitName===tab.name;
    setOpenTabs(prev=>(prev??[]).filter(tb=>!(tb.ship===tab.ship&&(tb.id!=null?tb.id===tab.id:tb.name===tab.name))));
    if(wasActive){
      const next=openFitTabs[idx+1]??openFitTabs[idx-1];
      if(next) loadFit(next.ship,next.name,undefined,true);
    }
  };
  // Deleting the fit you have open leaves the same hole as closing its tab, so it lands the same
  // way: step to the neighbouring tab. It used to just clear the active fit, which hides the bottom
  // nav (see its render) and the tab strip at once, stranding you on the Fits list until you opened
  // something else by hand.
  //
  // With an empty strip -- a legitimate state, since tabs are opt-in -- there is no neighbour, so it
  // falls back to another fit of the SAME ship: that is the list being looked at, and deleting one
  // of three Rifter fits should leave a Rifter open. Only when the ship has none left does the fit
  // actually clear, and that is the one case where losing the bottom nav is right: nothing to show.
  const deleteFit=(ship,fit)=>{
    const wasActive=activeFit?.ship===ship&&activeFit?.fitName===fit.name;
    const tabIdx=openFitTabs.findIndex(tb=>tb.ship===ship&&sameTab(tb,fit,fit.name));
    const tabNext=tabIdx>=0?(openFitTabs[tabIdx+1]??openFitTabs[tabIdx-1]):null;
    const siblings=fitsDB[ship]??[];
    const sibIdx=siblings.findIndex(f=>f.id===fit.id);
    const sibNext=sibIdx>=0?(siblings[sibIdx+1]??siblings[sibIdx-1]):null;
    setFitsDB(prev=>{
      const next={...prev,[ship]:(prev[ship]||[]).filter(f=>f.id!==fit.id)};
      if(!next[ship].length) delete next[ship];
      return next;
    });
    if(!wasActive)return;
    // The deleted fit's tab is not pruned here: resolveTabs reconciles the strip against fitsDB on
    // every render, so it drops out on its own (see the openTabs comment).
    if(tabNext) loadFit(tabNext.ship,tabNext.name);
    else if(sibNext) loadFit(ship,sibNext.name);
    else setActiveFit(null);
  };
  return {
    _tick, themePref, setThemePref, resolvedTheme, locale, setLocale,
    fitsDB, setFitsDB, activeFit, setActiveFit, slots, setSlots, drones, setDrones, fighters, setFighters,
    dmgProfile, setDmgProfile, tgtProfile, setTgtProfile, cargoItems, setCargoItems, implants, setImplants,
    boosters, setBoosters, implantLoadouts, setImplantLoadouts, openTabs, setOpenTabs, fitSubTab, setFitSubTab,
    recentFits, openInNewTab, setOpenInNewTab, autoFillHardpoints, setAutoFillHardpoints,
    closeBrowserOnAdd, setCloseBrowserOnAdd, wantNewTab, newTabIntent, setNewTabIntent,
    priceHub, setPriceHub, priceSource, setPriceSource, projFits, setProjFits, cmdFits, setCmdFits,
    skills, setSkills, skillProfiles, setSkillProfiles, esiSkills, pilotSkills, fitSkills, sourceSkills,
    fitSkillLabel, skillCheck, externalBursts, projectedEffects, projectedReps, factorInReload, setFactorInReload,
    optimizeFitPrice, loadFit, importFit, undo, redo, undoDepth, redoDepth,
    openFitTabs, openFitInNewTab, closeFitTab, deleteFit,
  };
}