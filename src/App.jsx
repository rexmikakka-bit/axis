import { useState, useEffect, useMemo, useRef } from "react";
import { calcFitStats, TYPES, tidByName, isT3Cruiser, t3cSlotLayout } from "./calc.js";
import { getGlobalCss, lookupShip, haptic, parseEFT, readClipboardText } from "./lib/core.js";
import "./dogma-engine-init.js";
import { C } from "./theme.js";
import { useFitSession } from "./use-fit-session.js";
import { ImportFitSheet, initKeyboardTracking } from "./components/ui.jsx";
import { SnapshotModal } from "./components/snapshot.jsx";
import { ShoppingListSheet } from "./components/shopping-list.jsx";
import { ActiveFitBar, FittingsScreen, ShipInfoSheet } from "./components/FittingsScreen.jsx";
import { CargoScreen } from "./components/cargo.jsx";
import { DronesScreen } from "./components/drones.jsx";
import { ImplantsScreen } from "./components/implants.jsx";
import { EffectsScreen } from "./components/effects.jsx";
import { SettingsOverlay } from "./components/settings.jsx";
import { ExportFitModal, HamburgerMenu, ChooserSheet, AppHeader, BottomNav, PilotSheet } from "./components/layout.jsx";
import { FeedbackModal } from "./components/feedback.jsx";
import { EsiImportModal, EsiExportModal } from "./components/esi-ui.jsx";
import { FitTabs } from "./components/FitTabs.jsx";
import { SkillsProvider } from "./components/skill-mark.jsx";
import { IconClipboard, IconCharacter } from "./components/glyphs.jsx";
import { getLoadedFitsDB } from "./lib/fits-store.js";
import { initBackButton, BACK_APP } from "./lib/back-button.js";
import { useBackHandler } from "./lib/use-back-handler.js";
import { t } from "./lib/i18n.js";
import * as esi from "./lib/esi.js";

// "Nothing is boosting this fit" and "nothing is projecting at it" are each ONE value, not a new one
// per render. Both memos below are keyed on `fitsDB`, which the autosave write-back replaces after
// every edit, and both feed every fit calculation on screen — so handing back a fresh empty object
// makes a single tap recalculate the whole fit twice. NO_PROJECTION is exactly what the memo
// computes with no projected fits: no reps, no penalty, no debuffs, resistance 1. Both now live in
// lib/projection.js, beside the functions that hand them back.
const EMPTY_FIGHTER_INFO = [];

export default function App(){
  // The fit, its library, undo and every setting live in use-fit-session.js, shared with the desktop
  // app. What follows here is the phone's navigation around it.
  const{themePref,setThemePref,resolvedTheme,locale,setLocale,
    fitsDB,setFitsDB,activeFit,setActiveFit,slots,setSlots,drones,setDrones,fighters,setFighters,
    dmgProfile,setDmgProfile,tgtProfile,setTgtProfile,cargoItems,setCargoItems,implants,setImplants,
    boosters,setBoosters,implantLoadouts,setImplantLoadouts,setOpenTabs,fitSubTab,setFitSubTab,
    recentFits,openInNewTab,setOpenInNewTab,autoFillHardpoints,setAutoFillHardpoints,
    closeBrowserOnAdd,setCloseBrowserOnAdd,wantNewTab,newTabIntent,setNewTabIntent,
    priceHub,setPriceHub,priceSource,setPriceSource,projFits,setProjFits,cmdFits,setCmdFits,
    skills,setSkills,skillProfiles,setSkillProfiles,fitSkills,sourceSkills,
    fitSkillLabel,skillCheck,externalBursts,projectedEffects,projectedReps,factorInReload,setFactorInReload,
    optimizeFitPrice,loadFit,importFit,undo,redo,undoDepth,redoDepth,
    openFitTabs,openFitInNewTab,closeFitTab,deleteFit}=useFitSession({
    // A fit was just opened: land on its Fit page, unless the caller asked to stay put (switching
    // between open tabs). setFittingsView/setBottomTab are declared below; this only runs on a tap.
    onFitOpened:(keepPage)=>{if(!keepPage){setFittingsView("active");setBottomTab("fittings");}},
    notify:(kind,msg,ms)=>{setPriceBanner(kind==null?null:{kind,msg});if(ms)setTimeout(()=>setPriceBanner(null),ms);},
  });
  // Native shell setup (no-op on web). Uses the Capacitor runtime bridge so there is no build-time
  // dependency on the plugins: light status-bar content over the dark theme, the webview running
  // UNDER the status bar, and dismiss the splash once React has mounted.
  //
  // overlay:TRUE is the whole point and was previously false "so the header isn't clipped". With it
  // false the webview begins below the status bar, which (a) leaves a strip of bare colour above
  // the app and (b) makes env(safe-area-inset-top) report ~0, so the header's own safe-area padding
  // silently did nothing. This runtime call also overrides capacitor.config.json, so setting it
  // there alone had no effect. Nothing gets clipped now because AppHeader insets its CONTENT by
  // env(safe-area-inset-top) while its background runs to the physical top of the screen.
  useEffect(()=>{
    const Cap=(typeof window!=="undefined")&&window.Capacitor;
    if(!Cap?.isNativePlatform?.())return;
    try{
      const SB=Cap.Plugins?.StatusBar;
      // Capacitor's style names the CONTENT colour, not the background: "DARK" content reads on a
      // light bar, so it's what our dark theme (light content on the OS bar) needs called "LIGHT",
      // and vice versa for the light theme's dark-on-light bar. Confirmed empirically on-device.
      // Tested against "light" rather than "dark" so every palette that isn't the light one gets
      // light bar content by default — which is what any new dark theme will want.
      if(SB){SB.setStyle?.({style:resolvedTheme==="light"?"LIGHT":"DARK"});SB.setOverlaysWebView?.({overlay:true});}
      Cap.Plugins?.SplashScreen?.hide?.();
    }catch(e){}
  },[resolvedTheme]);
  // The keyboard's own "Hide keyboard" chevron, iPhone-only per Capacitor's Keyboard plugin (a no-op
  // everywhere else, so no platform check needed beyond isNativePlatform). Off by default. With
  // Keyboard.resize:"none" (capacitor.config.json — see BottomSheet's useVisualViewport) the OS never
  // gives the page another way past the keyboard, and every search sheet can land on a results list
  // short enough that BottomSheet's own scroll-to-dismiss (dismissKeyboardOnScroll) has nothing to
  // scroll — the "5mn c" module search was the one that surfaced it, but it's every sheet with a
  // search box, not that one specifically.
  // initKeyboardTracking is load-bearing and must happen HERE, at boot, not from the sheets that
  // consume it: attaching Capacitor's keyboard listeners on a sheet's own mount lost the very first
  // keyboardWillShow, because the sheet's autoFocus triggers it before the bridge finishes attaching.
  // See the note above useVisualViewport in components/ui.jsx.
  useEffect(()=>{
    initKeyboardTracking();
    const Cap=(typeof window!=="undefined")&&window.Capacitor;
    if(!Cap?.isNativePlatform?.())return;
    try{ Cap.Plugins?.Keyboard?.setAccessoryBarVisible?.({isVisible:true}); }catch(e){}
  },[]);
  // ESI login callback (native only — the web build's redirect-based login is completed inline by
  // EsiSettingsPanel via esi.handleWebRedirectOnLoad() on mount instead). SSO opens the system
  // browser via @capacitor/browser; CCP redirects to our eveauth-visviva://auth-callback custom
  // scheme, which Android/iOS hand back as an appUrlOpen event rather than a page navigation.
  // The URL match goes through esi.isEsiCallbackUrl so the scheme is only written down once (in
  // esi-config.js) — a hardcoded copy here silently rejected every callback once the scheme changed.
  useEffect(()=>{
    const Cap=(typeof window!=="undefined")&&window.Capacitor;
    if(!Cap?.isNativePlatform?.())return;
    let sub;
    (async()=>{
      try{
        const [{App:CapApp},{Browser}]=await Promise.all([import('@capacitor/app'),import('@capacitor/browser')]);
        sub=await CapApp.addListener('appUrlOpen',async({url})=>{
          if(!esi.isEsiCallbackUrl(url))return;
          try{await Browser.close();}catch(e){}
          try{await esi.completeLoginFromCallback(url);}catch(e){console.error('ESI login failed:',e);esi.setLastLoginError(e);}
        });
      }catch(e){}
    })();
    return()=>{try{sub?.remove?.();}catch(e){}};
  },[]);
  // The one Android Back listener. Every sheet, drill-down level and screen registers with
  // lib/back-button.js; this just turns the button on. See that file — once a listener exists,
  // Capacitor stops exiting the app for us, so an unhandled press has to be handled below.
  useEffect(()=>initBackButton(),[]);
  const[bottomTab,setBottomTab]=useState("fittings");
  // Declared up here with the other screen-level state, not down among the sheets, because the two
  // whole-fit calculations below are skipped unless something is on screen to read them.
  const[showShipInfo,setShowShipInfo]=useState(false);
  const[showSnapshot,setShowSnapshot]=useState(false);
  const[showHamburger,setShowHamburger]=useState(false);
  const[showSettings,setShowSettings]=useState(false);
  // The bottom nav is hidden with no active fit (see its render), so any other tab would be a
  // screen with no way out. Send it home whenever the fit goes away.
  useEffect(()=>{ if(!activeFit?.ship && bottomTab!=="fittings") setBottomTab("fittings"); },[activeFit,bottomTab]);
  // calcFitStats is ~18 ms on a battleship, and the three calls below are the bulk of what a single
  // tap on the Fittings screen costs. Nothing on that screen reads them — every consumer is listed
  // in these two flags — so they are gated rather than run and thrown away. Each consumer already
  // has a fallback for a null `cs`, because the memo has always returned null before a ship is picked.
  const wantsSnapshotStats=bottomTab==="cargo"||bottomTab==="drones"||bottomTab==="effects"||showShipInfo||showSnapshot;
  const wantsDroneStats=bottomTab==="drones";
  const snapshotStats=useMemo(()=>{
    const shipName=activeFit?.ship;
    if(!shipName||!wantsSnapshotStats) return null;
    try{
      // lookupShip, not the bare {name,typeID} shape other calcFitStats calls below use — jamChance
      // needs ship.sensorType, which only lookupShip's fuller record carries.
      const sh=lookupShip(shipName)??{name:shipName,typeID:tidByName(shipName)};
      return calcFitStats(sh,slots,drones??[],fitSkills,{fighters,implants,boosters,externalBursts,projectedEcm:projectedEffects?.ecm,pilotSec:slots?.pilotSec,systemSecurity:slots?.systemSecurity});
    }catch{ return null; }
  },[activeFit,slots,drones,fighters,fitSkills,implants,boosters,externalBursts,projectedEffects,wantsSnapshotStats]);
  const shipMeta=useMemo(()=>{
    const sh=activeFit?.ship?lookupShip(activeFit.ship):null;
    return {faction:sh?.race??"",cls:sh?.hullClass??sh?.groupName??""};
  },[activeFit]);
  // A T3 cruiser's slots and hardpoints all come from its subsystems — the hull record itself is
  // zeros. Same substitution FittingsScreen makes for the fitting grid, made here because the info
  // sheet's attributes tab reads those counts, and a Tengu opened from a fit was reporting no
  // launcher hardpoints at all.
  const shipInfoHull=useMemo(()=>{
    const sh=activeFit?.ship?(lookupShip(activeFit.ship)??{name:activeFit.ship}):null;
    if(!sh?.name||!isT3Cruiser(sh.name))return sh;
    const layout=t3cSlotLayout((slots?.subsystems??[]).filter(s=>s?.typeID));
    return{...sh,turrets:layout.turrets,launchers:layout.launchers,
           hiSlots:layout.hiSlots,medSlots:layout.medSlots,lowSlots:layout.lowSlots,rigSlots:layout.rigSlots};
  },[activeFit?.ship,slots?.subsystems]);
  // One memo, two consumers: the drone rows read `droneInfo` and the drone INFO SHEET reads the
  // engine items behind those rows (for its current-vs-base attribute columns). Splitting them into
  // two memos would mean running the whole fit twice to answer one screen.
  const _droneCs=useMemo(()=>{
    const shipName=activeFit?.ship;
    if(!shipName||!wantsDroneStats) return null;
    try{
      return calcFitStats({name:shipName,typeID:tidByName(shipName)},slots,drones??[],fitSkills,{implants,boosters,externalBursts,projectedEffects,pilotSec:slots?.pilotSec,systemSecurity:slots?.systemSecurity});
    }catch{ return null; }
  },[activeFit,slots,drones,fitSkills,implants,boosters,externalBursts,projectedEffects,wantsDroneStats]);
  const droneInfo=_droneCs?.droneInfo??[];
  const fittedDrones=_droneCs?.fittedDrones??null;
  const fighterInfo=useMemo(()=>{
    const shipName=activeFit?.ship;
    if(!shipName||!(fighters?.length)||!wantsDroneStats) return EMPTY_FIGHTER_INFO;
    try{
      const cs=calcFitStats({name:shipName,typeID:tidByName(shipName)},slots,drones??[],fitSkills,{implants,boosters,externalBursts,damageProfile:dmgProfile?.p,pilotSec:slots?.pilotSec,systemSecurity:slots?.systemSecurity,fighters:fighters.map(f=>({name:f.name,qty:f.qty??1,active:f.active,abilities:f.abilities}))});
      return cs?.fighterDetails ?? EMPTY_FIGHTER_INFO;
    }catch{ return EMPTY_FIGHTER_INFO; }
  },[activeFit,slots,drones,fitSkills,implants,boosters,externalBursts,fighters,dmgProfile,wantsDroneStats]);
  const[fittingsView,setFittingsView]=useState(()=>{try{const db=getLoadedFitsDB();const af=JSON.parse(localStorage.getItem("pyfa-activefit")||"null");if(db&&af&&db[af.ship]?.find(f=>f.name===af.fitName))return"active";}catch{}return"browse";});
  // Set while the browser was opened by the menu's "New Fit", which tells the ship rows the user
  // has already committed to starting something — so picking a hull builds the fit instead of
  // listing what's already on it. Any other route into the browser leaves it false.
  const[newFitIntent,setNewFitIntent]=useState(false);
  const[showPilot,setShowPilot]=useState(false);
  const[showImportFit,setShowImportFit]=useState(false);
  // Set only when the "From EFT" chooser button's direct clipboard-import couldn't finish on its
  // own (see the onSelect below) — pre-fills the fallback sheet with whatever text/error it got,
  // instead of the sheet opening blank and asking the user to hit "Read from Clipboard" again.
  const[importFitInitial,setImportFitInitial]=useState(null);
  const[showExportFit,setShowExportFit]=useState(false);
  const[showShoppingList,setShowShoppingList]=useState(false);
  const[showFeedback,setShowFeedback]=useState(false);
  const[showEsiImport,setShowEsiImport]=useState(false);
  const[showEsiExport,setShowEsiExport]=useState(false);
  const[showImportChooser,setShowImportChooser]=useState(false);
  const[showExportChooser,setShowExportChooser]=useState(false);
  const[priceBanner,setPriceBanner]=useState(null);
  // Bottom-nav badges, pyfa-style: a count only appears for things currently switched ON, not
  // everything carried in the bay/cargo hold. Implants have no on/off state (they're active the
  // moment they're slotted), so that one is just a fill count.
  const navBadges=useMemo(()=>({
    cargo:(cargoItems??[]).length,
    drones:(drones??[]).filter(d=>d.active).reduce((s,d)=>s+(d.qty??1),0)
      +(fighters??[]).filter(f=>f.active!==false).reduce((s,f)=>s+(f.qty??1),0),
    implants:(implants??[]).filter(i=>i.name!=="[Empty]").length,
    effects:(boosters??[]).filter(b=>b.active).length
      +(projFits??[]).filter(f=>f.active!==false).length
      +(cmdFits??[]).filter(f=>f.active!==false).length
      +(slots?.environment?1:0),
  }),[cargoItems,drones,fighters,implants,boosters,projFits,cmdFits,slots?.environment]);
  // Auto-hide the strip while you scroll a fit, so a phone spends its rows on the fit instead of on
  // navigation; it collapses to a segmented line that still says which tab you are in, and comes
  // back on scroll-up, on reaching the top, or on a tap.
  //
  // Scroll events do not bubble, so this is a CAPTURE-phase listener on window: most screens scroll
  // the DOCUMENT (the app column is `minHeight:100vh` and grows past the viewport) while sheets and
  // panels scroll a div of their own, and capturing at the top catches both without any screen
  // having to know the strip exists. Document scrolls report `document` as the target, which has no
  // scrollTop -- read the scrolling element instead.
  const[tabsOpen,setTabsOpen]=useState(false);
  // The header shrinks to a single line once you are scrolled into a screen, and comes back at
  // the top. Driven off ABSOLUTE position rather than scroll direction: direction-based toggling
  // flickers on the small bounces a finger makes mid-scroll.
  const[headerCollapsed,setHeaderCollapsed]=useState(false);
  const lastScrollTop=useRef(0);
  useEffect(()=>{
    const onScroll=(e)=>{
      const el=e.target;
      const y=(el&&typeof el.scrollTop==='number')?el.scrollTop:(document.scrollingElement?.scrollTop??0);
      const prev=lastScrollTop.current;lastScrollTop.current=y;
      // Scrolling down closes the strip; scrolling back up does NOT reopen it. Re-opening would
      // put the tab list back in front of someone who never asked for it, which is the whole
      // reason the strip is opt-in. The thin rail stays either way.
      if(y-prev>6)setTabsOpen(false);
      if(y>56)setHeaderCollapsed(true);
      else if(y<=8)setHeaderCollapsed(false);
    };
    window.addEventListener('scroll',onScroll,true);
    return()=>window.removeEventListener('scroll',onScroll,true);
  },[]);
  // Changing screen resets the scroll bookkeeping, and closes the strip so it never follows you
  // onto a screen you did not open it from.
  useEffect(()=>{setTabsOpen(false);setHeaderCollapsed(false);lastScrollTop.current=0;},[bottomTab,fittingsView]);
  // The + sends you to the Fits list with "next open goes in a new tab" armed. Backing out without
  // picking anything must disarm it, or a fit opened much later inherits the request -- but the
  // request has to survive DRILLING IN, which is the normal way to reach a fit: the list moves
  // "browse" -> "fits" (a ship's fits) before you ever tap one. Disarm only on actually leaving the
  // list, i.e. back to the active fit or off the Fits tab entirely.
  useEffect(()=>{
    if(bottomTab!=="fittings"||fittingsView==="active"){wantNewTab.current=false;setNewTabIntent(false);}
  },[bottomTab,fittingsView]);
  // Same reasoning for the menu's "New Fit", except it has no reason to survive the drill-in to a
  // ship's own fit list: reaching that means the hull was picked and the fit already exists.
  useEffect(()=>{
    if(bottomTab!=="fittings"||fittingsView!=="browse")setNewFitIntent(false);
  },[bottomTab,fittingsView]);
  const returnToFit=()=>{setBottomTab("fittings");setFittingsView("active");};
  // The floor of the back stack: everything above has declined, so all that's left is the expanded
  // tab strip and the bottom nav. Material's rule for a bottom nav is that Back returns to the start
  // destination rather than exiting from wherever you happen to be, and Fittings is ours.
  //
  // Declining from there is deliberate — the fit screen is the root, and Back at the root exits.
  useBackHandler(()=>{
    if(tabsOpen){setTabsOpen(false);return;}
    if(bottomTab!=="fittings"){setBottomTab("fittings");haptic("light");return;}
    return false;
  },true,BACK_APP);
  // `height`, not `minHeight`: the shell is exactly one viewport tall and clips, so the flex
  // children below finally have a bounded height and each screen's own overflowY:auto region takes
  // over. With minHeight the column just grew and the DOCUMENT scrolled, which is what dragged the
  // bottom nav off the bottom of the screen.
  return(<SkillsProvider value={fitSkills}>
  <div className="app-shell" style={{background:C.bg,display:"flex",justifyContent:"center"}}>
    <style>{getGlobalCss()}</style>
    <div className="app-col" style={{height:"100%",display:"flex",flexDirection:"column",background:C.bg}}>
      {/* onShipInfo only when there IS a ship: the setter used to fire unconditionally while the
          sheet rendered on `showShipInfo && activeFit?.ship`, so tapping the header thumbnail with
          no fit open armed the flag invisibly and the next fit you created opened the sheet. */}
      <AppHeader collapsed={headerCollapsed} onHamburger={()=>setShowHamburger(true)} activeFit={activeFit} onShipInfo={activeFit?.ship?()=>setShowShipInfo(true):undefined} skillCheck={skillCheck} onSkillGaps={()=>setShowPilot(true)} pilot={slots?.pilot??null}/>
      {(bottomTab!=="fittings"||(fittingsView&&fittingsView!=="active"))&&<ActiveFitBar activeFit={activeFit} onReturn={returnToFit}/>}
      {/* Tab strip. Hidden on the Fits LIST, where the list itself is the navigation and a second
          row of fit names would just be noise. */}
      {!(bottomTab==="fittings"&&fittingsView&&fittingsView!=="active")&&
        <FitTabs tabs={openFitTabs} activeFit={activeFit} open={tabsOpen}
                 onSelect={tb=>loadFit(tb.ship,tb.name,undefined,true)} onClose={closeFitTab}
                 onReorder={order=>setOpenTabs(order)}
                 onCloseAll={()=>setOpenTabs([])}
                 onToggle={()=>setTabsOpen(o=>!o)}
                 onOpenLibrary={()=>{wantNewTab.current=true;setNewTabIntent(true);setBottomTab("fittings");setFittingsView("browse");}}/>}
      {/* minHeight:0 is load-bearing — a flex child defaults to min-height:auto, which refuses to
          shrink below its content and would let the screens push the bottom nav off-screen again. */}
      <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {bottomTab==="fittings"&&<FittingsScreen recents={recentFits} undo={undo} undoDepth={undoDepth} redo={redo} redoDepth={redoDepth} activeFit={activeFit} setActiveFit={setActiveFit} loadFit={loadFit} deleteFit={deleteFit} view={fittingsView} setView={setFittingsView} fitsDB={fitsDB} setFitsDB={setFitsDB} slots={slots} setSlots={setSlots} setDrones={setDrones} setFighters={setFighters} fighters={fighters} cargoItems={cargoItems} setCargoItems={setCargoItems} setImplants={setImplants} setBoosters={setBoosters} setProjFits={setProjFits} setCmdFits={setCmdFits} skills={fitSkills} sourceSkills={sourceSkills} openFitTabs={openFitTabs} implants={implants} boosters={boosters} drones={drones} factorInReload={factorInReload} setFactorInReload={setFactorInReload} externalBursts={externalBursts} projectedReps={projectedReps} projectedEffects={projectedEffects} dmgProfile={dmgProfile} setDmgProfile={setDmgProfile} tgtProfile={tgtProfile} setTgtProfile={setTgtProfile} priceHub={priceHub} setPriceHub={setPriceHub} priceSource={priceSource} newFitIntent={newFitIntent} setNewFitIntent={setNewFitIntent} newTabIntent={newTabIntent} autoFillHardpoints={autoFillHardpoints} closeBrowserOnAdd={closeBrowserOnAdd} onOpenFit={openFitInNewTab} fitSubTab={fitSubTab} setFitSubTab={setFitSubTab}/>}
        {/* Engine capacity first, raw hull attribute only as the fallback for a ship we failed to
            calculate. The hull's own `capacity` ignores cargohold expanders and cargo rigs, so a
            Bestower with one Expanded Cargohold II read 4,800 m³ here and 7,650 m³ on the stats
            panel — the same number, two answers, depending which screen you were looking at. */}
        {bottomTab==="cargo"   &&<CargoScreen items={cargoItems} setItems={setCargoItems} slots={slots} shipCapacity={snapshotStats?.cargoCapacity??(()=>{const tid=tidByName(activeFit?.ship);return tid&&TYPES[tid]?(TYPES[tid].attrs?.capacity??1150):1150;})()} />}
        {bottomTab==="drones"  &&<DronesScreen drones={drones} setDrones={setDrones} droneInfo={droneInfo} fittedDrones={fittedDrones} fighters={fighters} setFighters={setFighters} fighterInfo={fighterInfo} maxActiveDrones={snapshotStats?.maxActiveDrones??5} shipDroneBay={snapshotStats?.droneBay??0} shipDroneBandwidth={snapshotStats?.droneBandwidth??0} shipFighter={(()=>{const tid=tidByName(activeFit?.ship);const a=tid&&TYPES[tid]?TYPES[tid].attrs:null;return a?{cap:a.fighterCapacity??0,tubes:a.fighterTubes??0,light:a.fighterLightSlots??0,heavy:a.fighterHeavySlots??0,support:a.fighterSupportSlots??0}:{cap:0,tubes:0,light:0,heavy:0,support:0};})()} />}
        {bottomTab==="implants"&&<ImplantsScreen implants={implants} setImplants={setImplants} loadouts={implantLoadouts} setLoadouts={setImplantLoadouts}/>}
        {bottomTab==="effects" &&<EffectsScreen fitsDB={fitsDB} boosters={boosters} setBoosters={setBoosters} projFits={projFits} setProjFits={setProjFits} cmdFits={cmdFits} setCmdFits={setCmdFits} sourceSkills={sourceSkills} openFitTabs={openFitTabs} environment={slots?.environment??null} setEnvironment={(n)=>setSlots(prev=>({...prev,environment:n||undefined}))} jamTarget={{strength:snapshotStats?.sensorStrength??0,type:snapshotStats?.sensorType??"",resist:projectedEffects?.ecmResist??1}} assistTarget={projectedEffects?.assist} ewarResist={projectedEffects?.ewarResist} onOpenFit={openFitInNewTab}/>}
      </div>
      {/* Every tab except Fittings operates ON a fit — Cargo, Drones, Implants and Effects all have
          nothing to act on with no ship selected, so the bar is five dead buttons taking a row of
          screen on the one page (the ship library) that most wants the space. */}
      {!!activeFit?.ship&&<BottomNav active={bottomTab} onChange={setBottomTab} badges={navBadges}/>}
    </div>
    {priceBanner&&<div style={{position:"fixed",top:"calc(12px + env(safe-area-inset-top, 0px))",left:"50%",transform:"translateX(-50%)",zIndex:300,background:priceBanner.kind==="success"?C.success:C.surfaceAlt,color:priceBanner.kind==="success"?"#0e0e10":C.textMid,border:priceBanner.kind==="success"?"none":`1px solid ${C.border}`,borderRadius:10,padding:"10px 16px",fontSize:13,fontWeight:700,boxShadow:"0 6px 20px rgba(0,0,0,.35)",maxWidth:"90%",textAlign:"center"}}>{priceBanner.kind==="success"?"✓ ":""}{priceBanner.msg}</div>}
    {showHamburger&&<HamburgerMenu onClose={()=>setShowHamburger(false)} onOpenSettings={()=>{setShowSettings(true);setShowHamburger(false);}} onImport={()=>setShowImportChooser(true)} onExport={()=>{setShowExportChooser(true);setShowHamburger(false);}} onSnapshot={()=>{setShowSnapshot(true);setShowHamburger(false);}} onFeedback={()=>{setShowFeedback(true);setShowHamburger(false);}} onOptimizePrice={()=>{optimizeFitPrice();setShowHamburger(false);}} onShoppingList={()=>{setShowShoppingList(true);setShowHamburger(false);}} onNewFit={()=>{setBottomTab("fittings");setFittingsView("browse");setNewFitIntent(true);}}/>}
    {/* "EFT" and "EVE" stay as they are — one is a file format's name, the other the game's. */}
    {showImportChooser&&<ChooserSheet title={t("Import Fit")} onClose={()=>setShowImportChooser(false)} options={[
      {icon:IconClipboard,label:t("From EFT"),sub:t("Paste from clipboard"),onSelect:async()=>{
        // Skip the sheet on the golden path: read the clipboard and import immediately, so a fit
        // copied in-game lands in three fewer taps ("Read from Clipboard" + "Import '<name>'" gone).
        // Anything that isn't a clean success — unreadable/empty clipboard, text that isn't EFT —
        // falls back to the sheet, pre-filled with what was found, rather than failing silently.
        setShowImportChooser(false);
        const{text,why}=await readClipboardText();
        // Two keys rather than one with an optional placeholder: a translator cannot write a natural
        // sentence around a clause that may or may not be there. `why` itself is the platform's own
        // error text and stays in whatever language the OS produced it in.
        if(text==null){setImportFitInitial({text:"",err:why?t("Couldn't read the clipboard — {why}. Paste manually below.",{why}):t("Couldn't read the clipboard. Paste manually below.")});setShowImportFit(true);return;}
        if(!text.trim()){setImportFitInitial({text:"",err:t("The clipboard is empty — copy a fit first, then tap this again.")});setShowImportFit(true);return;}
        const parsed=parseEFT(text);
        if(parsed.error){setImportFitInitial({text,err:parsed.error});setShowImportFit(true);return;}
        haptic();
        importFit(parsed);
        setPriceBanner({kind:"success",msg:t('Imported "{name}"',{name:parsed.fitName})});setTimeout(()=>setPriceBanner(null),3000);
      }},
      {icon:IconCharacter,label:t("From EVE Character"),sub:t("A saved fitting or a ship in your hangar"),onSelect:()=>{setShowImportChooser(false);setShowEsiImport(true);}},
    ]}/>}
    {showExportChooser&&<ChooserSheet title={t("Export Fit")} onClose={()=>setShowExportChooser(false)} options={[
      {icon:IconClipboard,label:t("To EFT"),sub:t("Copy to clipboard"),onSelect:()=>{setShowExportChooser(false);setShowExportFit(true);}},
      {icon:IconCharacter,label:t("To EVE Character"),sub:t("Save into in-game fittings"),onSelect:()=>{setShowExportChooser(false);setShowEsiExport(true);}},
    ]}/>}
    {showShipInfo&&activeFit?.ship&&<ShipInfoSheet ship={shipInfoHull} cs={snapshotStats} onClose={()=>setShowShipInfo(false)}/>}
    {showPilot&&<PilotSheet pilot={slots?.pilot??null} setPilot={p=>setSlots(prev=>({...prev,pilot:p||undefined}))}
                            missing={skillCheck.missing} appSkills={skills} skillProfiles={skillProfiles} onClose={()=>setShowPilot(false)}/>}
    {showExportFit&&<ExportFitModal activeFit={activeFit} slots={slots} implants={implants} boosters={boosters} drones={drones} fighters={fighters} cargo={cargoItems} onClose={()=>setShowExportFit(false)}/>}
    {showSnapshot&&<SnapshotModal onClose={()=>setShowSnapshot(false)} assist={projectedEffects?.assist} cargoItems={cargoItems} fitName={activeFit?.fitName} shipName={activeFit?.ship} shipTypeID={tidByName(activeFit?.ship)} shipFaction={shipMeta.faction} shipClass={shipMeta.cls} slots={slots} cs={snapshotStats} drones={drones} fighters={fighters} implants={implants} boosters={boosters} cmdFits={cmdFits} projFits={projFits} fitsDB={fitsDB} sourceSkills={sourceSkills} skillLabel={fitSkillLabel} dmgProfile={dmgProfile} priceHub={priceHub} priceSource={priceSource}/>}
    {showShoppingList&&<ShoppingListSheet slots={slots} onClose={()=>setShowShoppingList(false)}/>}
    {showSettings &&<SettingsOverlay onClose={()=>setShowSettings(false)} skills={skills} setSkills={setSkills} skillProfiles={skillProfiles} setSkillProfiles={setSkillProfiles} openInNewTab={openInNewTab} setOpenInNewTab={setOpenInNewTab} priceHub={priceHub} setPriceHub={setPriceHub} priceSource={priceSource} setPriceSource={setPriceSource} themePref={themePref} setThemePref={setThemePref} autoFillHardpoints={autoFillHardpoints} setAutoFillHardpoints={setAutoFillHardpoints} closeBrowserOnAdd={closeBrowserOnAdd} setCloseBrowserOnAdd={setCloseBrowserOnAdd} locale={locale} setLocale={setLocale}/>}
    {showImportFit&&<ImportFitSheet onClose={()=>{setShowImportFit(false);setImportFitInitial(null);}} onImport={importFit} initialText={importFitInitial?.text} initialErr={importFitInitial?.err}/>}
    {showFeedback&&<FeedbackModal activeFit={activeFit} slots={slots} implants={implants} boosters={boosters} drones={drones} fighters={fighters} cargo={cargoItems} projFits={projFits} cmdFits={cmdFits} fitsDB={fitsDB} onClose={()=>setShowFeedback(false)}/>}
    {showEsiImport&&<EsiImportModal onClose={()=>setShowEsiImport(false)} onImport={importFit}/>}
    {showEsiExport&&<EsiExportModal activeFit={activeFit} slots={slots} drones={drones} cargoItems={cargoItems} fighters={fighters} implants={implants} boosters={boosters} onClose={()=>setShowEsiExport(false)}/>}
  </div>
  </SkillsProvider>);
}
