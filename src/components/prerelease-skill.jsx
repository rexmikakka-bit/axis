import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { useSyncSkillLevel, setSyncSkillLevel } from "../lib/prerelease-skill.js";
import { PRERELEASE_SKILL_NAME } from "../data/prerelease-rigs.js";
import { SourceBadge } from "./source-badge.jsx";

// The one control for the pre-release Synchronization Rigging skill (lib/prerelease-skill.js). Shown at
// the top of Settings > Skills and on every Synchronizer rig's info sheet. The level buttons work
// like SkillsPanel's rows: tap a level to set it, tap the current level again to untrain.
export function PrereleaseSkillControl(){
  const lv=useSyncSkillLevel();
  const color=C.warning;
  return(
    <div style={{padding:"10px 12px",background:C.surfaceAlt,border:`1px solid ${color}55`,borderRadius:8,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
        <div style={{flex:1,minWidth:0,display:"flex",alignItems:"center",flexWrap:"wrap",gap:"4px 6px"}}>
          <span style={{fontSize:12,fontWeight:700,color:C.text}}>{PRERELEASE_SKILL_NAME}</span>
          <span style={{flexShrink:0}}><SourceBadge label={t("Pre-release")} color={color}/></span>
        </div>
        <div style={{display:"flex",gap:3,flexShrink:0}}>
          {[1,2,3,4,5].map(n=>(
            <button key={n} onClick={()=>setSyncSkillLevel(lv===n?0:n)}
              title={lv===n?t("Click again to untrain"):t("Set to level {n}",{n})}
              style={{width:24,height:24,borderRadius:5,border:"none",cursor:"pointer",fontWeight:700,fontSize:11,
                background:lv>=n?color:C.border,color:lv>=n?"#fff":C.textMute}}>{n}</button>
          ))}
        </div>
      </div>
      <div style={{fontSize:11,color:C.textMute,lineHeight:1.45,marginTop:6}}>
        {t("Synchronization Rigging: {pct}% less Synchronizer rig CPU penalty at this level (10% per level). Applies to every pilot, since no character has it yet.",{pct:lv*10})}
      </div>
    </div>
  );
}
