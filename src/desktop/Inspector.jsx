import { useMemo, useRef } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { TYPES, computeFitCostRatios } from "../calc.js";
import { eveIcon } from "../lib/icons.js";
import { metaOf, META_COLORS } from "../lib/meta.js";
import { MUTA_BY_TYPE, moduleTakesCharges, computeDisplayRows, moduleByName } from "../lib/core.js";
import { fittedAbyssalIds, variationRoll } from "../lib/variation-items.js";
import { applyModUpdate, applyRemove, applySubsystemSwap, variantSwapPatch } from "../lib/fit-ops.js";
import { peekViewMemory } from "../lib/use-view-memory.js";
import { ModuleMenu, ModuleInfoTab, MutaplasmidEditor, ItemInfoPanel, TraitsPanel, hasTraits } from "../components/ui.jsx";
import { buildBoosterFromName } from "../components/effects.jsx";
import { resolveTarget, inspectorTabs, typeTarget, targetKey } from "./inspect.js";
import { useInspect } from "./inspect-context.jsx";
import DeskVariations from "./Variations.jsx";
import { Empty, TYPE } from "./kit.jsx";

// One item, in a desktop window. The same component backs the three full-time windows (Info,
// Variations, Mutaplasmid — `only` set, showing the current selection) and every floating inspector
// (pinned to one target, with a tab bar). Edits go straight to the fit session through
// lib/fit-ops.js, the rules the phone's Fitting tab uses, so a window works with the Fitting window
// closed, popped out, or showing a different fit.
//
// The State, Charge and Info tabs host the phone's own ModuleMenu tab bodies (`bare`, controlled
// `tab`): the RAH pattern, the charge drill-down and the abyssal info all come with them unchanged.
// Variations is the desktop table (Variations.jsx).

export const TAB_LABELS = { state: "State", charge: "Charge", info: "Info", variations: "Variations", mutate: "Mutaplasmid" };
const SEC_LABELS = { high: "High slot", mid: "Mid slot", low: "Low slot", rigs: "Rig slot", services: "Service slot", subsystems: "Subsystem" };
const Bare = ({ children }) => <>{children}</>;
const noop = () => {};

/** Fitting headroom for the Variations table, as FitTab builds it, with the probe pass on demand. */
function useHeadroom(s, ship, cs) {
  const cache = useRef(null);
  return useMemo(() => cs && ship ? {
    pg: { used: cs.pgUsed ?? 0, total: cs.pgTotal ?? 0 }, cpu: { used: cs.cpuUsed ?? 0, total: cs.cpuTotal ?? 0 },
    cal: { used: cs.calUsed ?? 0, total: cs.calTotal ?? 400 },
    get ratios() {
      const key = [ship, s.slots, s.fitSkills, s.implants, s.boosters];
      if (cache.current && cache.current.key.every((v, i) => v === key[i])) return cache.current.val;
      const val = computeFitCostRatios(ship, s.slots, s.fitSkills, { implants: s.implants, boosters: s.boosters, pilotSec: s.slots?.pilotSec, systemSecurity: s.slots?.systemSecurity });
      cache.current = { key, val };
      return val;
    },
  } : null, [cs, ship, s.slots, s.fitSkills, s.implants, s.boosters]);
}

export function InspectorView({ s, ship, cs, target, tab, onTab, only, pinned = false }) {
  const { inspect, fitModule } = useInspect();
  const headroom = useHeadroom(s, ship, cs);
  if (!target) return <Empty>{only ? t("Select a module, drone, implant or item to see it here.") : t("Nothing to show.")}</Empty>;
  const r = resolveTarget(target, s);
  const typeID = r.typeID;
  const td = TYPES[typeID] ?? TYPES[String(typeID)];
  const item = r.item;
  const name = r.name ?? td?.n ?? t("Item");
  const mutable = (MUTA_BY_TYPE[typeID] ?? MUTA_BY_TYPE[String(typeID)] ?? []).length > 0;
  const takesCharges = target.kind === "module" && !!item && (item.type === "weapon" || item.type === "capbooster" || moduleTakesCharges(item.typeID, item.name));
  const tabs = inspectorTabs(target, r, { mutable, takesCharges });
  const cur = only ?? (tabs.includes(tab) ? tab : tabs.includes("info") ? "info" : tabs[0]);
  const editable = r.status === "ok" && r.live;
  const showInfo = (tid) => inspect(typeTarget(tid), "info");

  // ── Where this item is ───────────────────────────────────────────────────────────────────────
  const fitLabel = target.kind !== "type" ? `${target.ship} · ${target.fitName ?? ""}` : null;
  const where = target.kind === "module" ? t(SEC_LABELS[target.sec]) : target.kind === "drone" ? t("Drone bay") : target.kind === "implant" ? t("Implant slot {n}", { n: target.slot })
              : target.kind === "booster" ? t("Booster") : target.rack ? t("Market") : null;
  const notes = [];
  if (r.status === "nofit") notes.push(t("That fit no longer exists."));
  if (r.status === "empty") notes.push(t("This slot is empty now. Showing what was in it."));
  if (target.kind !== "type" && r.status === "ok" && !r.live) notes.push(t("This fit isn't the one open, so this is read-only."));

  // ── Module edits, through the shared rules ─────────────────────────────────────────────────
  const grouped = peekViewMemory("Fit:grouped", true);
  const row = target.kind === "module" && editable
    ? computeDisplayRows(s.slots?.[target.sec] ?? [], target.sec, grouped).find(rw => (rw.groupIds ?? [rw.id]).includes(target.slot)) : null;
  const updateMod = (u, opts = {}) => s.setSlots(prev => applyModUpdate(prev, target.sec, target.slot, u, { grouped, limits: cs?.groupLimits, groupIds: row?.groupIds, ...opts }));
  const setDrone = (u) => s.setDrones(l => (l ?? []).map(x => x.id === target.id ? { ...x, ...u } : x));

  const body = () => {
    if (!typeID) return <Empty>{t("No information for this item.")}</Empty>;
    if (cur === "state" || cur === "charge" || (cur === "info" && target.kind === "module" && editable && target.sec !== "subsystems")) {
      if (!editable || target.kind !== "module") return <Empty>{t("Open the fit to change this module.")}</Empty>;
      return <ModuleMenu key={`${target.slot}:${cur}`} Frame={Bare} bare tab={cur} mod={item} groupCount={row?.count ?? 1} onClose={noop}
        onUpdateMod={u => updateMod(u)} onUpdateModLive={u => updateMod(u)} onReplaceMod={u => updateMod(u, { replace: true })}
        onRemove={() => s.setSlots(prev => applyRemove(prev, target.sec, target.slot, row?.groupIds))} onDuplicate={null} fillCount={0}
        resourceHeadroom={headroom} engineItem={cs?.fittedItems?.get(target.slot)} chargeStats={cs?.fittedChargeStats?.get(target.slot)}
        usedAbyssalIds={fittedAbyssalIds(s.slots, target.slot)} onShowInfo={showInfo} />;
    }
    if (cur === "info") {
      const engine = editable ? (target.kind === "drone" ? cs?.fittedDrones?.get(target.id) : target.kind === "module" ? cs?.fittedItems?.get(target.slot) : null) : null;
      return (
        <div style={{ padding: 14 }}>
          {hasTraits(typeID) && <div style={{ marginBottom: 12 }}><TraitsPanel typeID={typeID} /></div>}
          {item && (target.kind === "drone" || target.kind === "module")
            ? <ModuleInfoTab typeID={typeID} mod={item} engineItem={engine} bleed={14} />
            : <ItemInfoPanel typeID={typeID} item={engine} bleed={14} />}
        </div>
      );
    }
    if (cur === "variations") {
      let onSwap = null, swapLabel;
      if (editable && target.kind === "module" && target.sec === "subsystems") onSwap = v => s.setSlots(prev => applySubsystemSwap(prev, target.slot, v));
      else if (editable && target.kind === "module") onSwap = v => updateMod(variantSwapPatch(item, v), { replace: true });
      else if (editable && target.kind === "drone") onSwap = v => setDrone({ name: v.name, typeID: v.typeID, ...variationRoll(v) });
      else if (editable && target.kind === "implant") onSwap = v => s.setImplants(prev => prev.map(i => i.slot === target.slot ? { ...i, name: v.name, bonus: null } : i));
      else if (editable && target.kind === "booster") onSwap = v => s.setBoosters(bs => (bs ?? []).map(x => x.id === target.id ? { ...buildBoosterFromName(v.name), id: x.id, active: x.active } : x));
      else if (target.kind === "type" && target.rack && s.activeFit?.ship) { onSwap = v => fitModule(target.rack, moduleByName(v.name) ?? v); swapLabel = t("Fit"); }
      return <DeskVariations typeID={typeID} baseline={item ?? { name, typeID }} fitted={!!item && editable} resourceHeadroom={editable || target.kind === "type" ? headroom : null}
        usedAbyssalIds={target.kind === "module" ? fittedAbyssalIds(s.slots, target.slot) : undefined} onSwap={onSwap} swapLabel={swapLabel} onInspect={showInfo} />;
    }
    if (cur === "mutate") {
      if (!editable || !item) return <Empty>{t("Select a fitted module or drone a mutaplasmid applies to.")}</Empty>;
      if (!mutable && !item.mutaplasmid) return <Empty>{t("No mutaplasmid applies to {name}.", { name })}</Empty>;
      const onUpdateMod = target.kind === "drone" ? (next) => setDrone(next) : (next) => updateMod({ ...next, abyssalItemId: undefined });
      return <div style={{ padding: 14 }}><MutaplasmidEditor key={targetKey(target)} mod={item} onUpdateMod={onUpdateMod} /></div>;
    }
    return null;
  };

  const meta = metaOf(typeID, null);
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, flex: "none" }}>
        {typeID && <img className="eve-icon" src={eveIcon(typeID, 64)} width={34} height={34} alt="" onError={e => { e.target.style.visibility = "hidden"; }} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
          <div style={{ fontSize: TYPE.small, color: C.textMid, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {meta && <span style={{ color: META_COLORS[meta] ?? C.textMid }}>{meta}</span>}
            {where && <span>{where}</span>}
            {fitLabel && <span>{fitLabel}</span>}
            {item?.mutaplasmid && <span style={{ color: C.danger }}>{t("Abyssal")}</span>}
            {row?.count > 1 && <span>{t("{n} in this row", { n: row.count })}</span>}
          </div>
        </div>
        {r.status === "ok" && !r.live && target.kind !== "type" &&
          <button type="button" onClick={() => s.loadFit(target.ship, s.fitsDB?.[target.ship]?.find(f => f.id === target.fitId)?.name ?? target.fitName)}
            style={{ height: 26, padding: "0 10px", borderRadius: 6, fontSize: 12.5, cursor: "pointer", background: C.surfaceAlt, border: `1px solid ${C.borderStrong}`, color: C.text }}>{t("Open fit")}</button>}
        {pinned && <span title={t("This window stays on this item")} style={{ fontSize: 11.5, color: C.textMid }}>{t("Pinned")}</span>}
      </div>
      {notes.length > 0 && <div role="status" style={{ padding: "6px 12px", fontSize: TYPE.small, color: C.warning, borderBottom: `1px solid ${C.border}`, flex: "none" }}>{notes.join(" ")}</div>}
      {!only && tabs.length > 1 && (
        <div role="tablist" style={{ display: "flex", borderBottom: `1px solid ${C.border}`, flex: "none", padding: "0 6px" }}>
          {tabs.map(tb => (
            <button key={tb} type="button" role="tab" aria-selected={cur === tb} onClick={() => onTab?.(tb)}
              style={{ padding: "7px 12px", fontSize: 12.5, background: "none", border: "none", cursor: "pointer", color: cur === tb ? C.accent : C.textMid,
                       borderBottom: `2px solid ${cur === tb ? C.accent : "transparent"}`, marginBottom: -1 }}>{t(TAB_LABELS[tb])}</button>
          ))}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: cur === "variations" ? "hidden" : "auto", lineHeight: 1.3 }}>{body()}</div>
    </div>
  );
}

/** The window title for an inspector: "Info · 720mm Howitzer Artillery II". */
export function inspectorTitle(target, tab, s) {
  if (!target) return t(TAB_LABELS[tab] ?? "Info");
  const r = resolveTarget(target, s);
  const name = r.name ?? TYPES[r.typeID]?.n ?? TYPES[String(r.typeID)]?.n ?? t("Item");
  return `${name} · ${t(TAB_LABELS[tab] ?? "Info")}`;
}
