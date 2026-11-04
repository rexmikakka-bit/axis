import { useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { fitToEFT } from "../lib/eft-export.js";
import { Dialog, TYPE } from "./kit.jsx";

// Ctrl+C: copy the fit as EFT, choosing what goes in. The phone's Export EFT sheet's options, same
// generator (fitToEFT) and same saved preferences key, so the two apps remember the same choices.
const PREFS_KEY = "pyfa_export_prefs";   // layout.jsx EXPORT_PREFS_KEY — keep in step
const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"); } catch { return {}; } };

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); document.body.removeChild(ta); return ok;
  } catch { return false; }
}

export default function ExportDialog({ s, onClose, onCopied }) {
  const p = readPrefs();
  const [opt, setOpt] = useState({ charges: p.charges ?? true, implants: p.implants ?? true, boosters: p.boosters ?? true,
                                   cargo: p.cargo ?? false, mutations: p.mutations ?? true, codeBlock: p.codeBlock ?? false });
  const flip = (k) => setOpt(o => ({ ...o, [k]: !o[k] }));
  const eft = fitToEFT({ ship: s.activeFit?.ship ?? "Unknown", name: s.activeFit?.fitName ?? "Unnamed", slots: s.slots, implants: s.implants,
                         boosters: s.boosters, drones: s.drones, fighters: s.fighters, cargo: s.cargoItems },
                       { charges: opt.charges, implants: opt.implants, boosters: opt.boosters, cargo: opt.cargo, mutations: opt.mutations });
  const text = opt.codeBlock ? "```\n" + eft + "\n```" : eft;
  const copy = async () => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(opt)); } catch { /* not persisted */ }
    const ok = await copyText(text);
    onCopied?.(ok);
    onClose();
  };
  const rows = [["charges", t("Charges")], ["implants", t("Implants")], ["boosters", t("Boosters")], ["cargo", t("Cargo")],
                ["mutations", t("Abyssal module rolls")], ["codeBlock", t("Wrap in a code block (for Discord)")]];
  return (
    <Dialog title={t("Copy fit to clipboard")} onClose={onClose} width={640}>
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: 300 }}>
        <div style={{ padding: "10px 14px", borderRight: `1px solid ${C.border}` }}>
          <div style={{ fontSize: TYPE.section, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid, margin: "2px 0 8px" }}>{t("Include")}</div>
          {rows.map(([k, label]) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 0", cursor: "pointer", fontSize: TYPE.label, color: C.text }}>
              <input type="checkbox" checked={opt[k]} onChange={() => flip(k)} style={{ width: 16, height: 16, accentColor: C.accent }} />{label}
            </label>
          ))}
          <button type="button" onClick={copy} autoFocus
            style={{ marginTop: 14, width: "100%", height: 32, borderRadius: 6, border: "none", background: C.accent, color: C.bg, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
            {t("Copy")}
          </button>
          <div style={{ fontSize: TYPE.small, color: C.textMid, marginTop: 8 }}>{t("Enter copies · Esc cancels")}</div>
        </div>
        <pre style={{ margin: 0, padding: "10px 14px", fontSize: 12.5, lineHeight: 1.45, color: C.text, whiteSpace: "pre-wrap",
                                          overflow: "auto", maxHeight: "60vh", fontFamily: "inherit" }}>{text}</pre>
      </div>
    </Dialog>
  );
}
