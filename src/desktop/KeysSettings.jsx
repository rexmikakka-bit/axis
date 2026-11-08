import { useEffect, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { TYPE, WEIGHT } from "./kit.jsx";
import { ACTIONS, GROUPS, FIXED, keysFor, isCustom, comboOf, bindProblem, actionForCombo, actionById, bind, unbind, resetAction, resetAll, onKeymapChange } from "./keymap.js";

// Settings > Keyboard: every rebindable shortcut (keymap.js), its keys as chips. Click a chip, or +,
// and press the new keys; Esc cancels. A combination another action holds moves here, and the row it
// came from says so. Restore defaults puts every binding back.

const chipStyle = (state) => ({
  height: 24, minWidth: 34, padding: "0 9px", borderRadius: 5, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
  display: "inline-flex", alignItems: "center", gap: 6,
  background: state === "recording" ? C.accentLight : C.surfaceAlt,
  border: `1px solid ${state === "recording" ? C.accent : state === "custom" ? `${C.accent}88` : C.borderStrong}`,
  color: state === "recording" ? C.accent : C.text,
});

export default function KeysSettings() {
  const [, tick] = useState(0);
  useEffect(() => onKeymapChange(() => tick(x => x + 1)), []);
  // {id, index}: the chip waiting for keys. index past the end adds a key.
  const [rec, setRec] = useState(null);
  const [note, setNote] = useState(null);   // {id, text, bad?}
  const [confirmReset, setConfirmReset] = useState(false);

  // While recording, this window takes the next press before the app's own handler sees it.
  useEffect(() => {
    if (!rec) return;
    const onKey = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { setRec(null); return; }
      const combo = comboOf(e);
      if (!combo) return;   // a modifier on its own: keep waiting for the rest
      const why = bindProblem(combo);
      if (why) { setNote({ id: rec.id, text: why, bad: true }); return; }
      const holder = actionForCombo(combo);
      if (holder?.id === rec.id) { setRec(null); return; }
      const took = bind(rec.id, rec.index, combo);
      setNote(took ? { id: rec.id, text: t("{key} moved here from {action}", { key: combo, action: actionById(took)?.label() }) } : null);
      setRec(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [rec]);

  const anyCustom = ACTIONS.some(a => isCustom(a.id));
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div style={{ flex: 1, fontSize: TYPE.small, color: C.textMid, lineHeight: 1.45 }}>
          {t("Click a shortcut and press the keys you want. Esc cancels. A key another action already uses moves to this one.")}
        </div>
        {confirmReset
          ? <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: TYPE.small, color: C.textMid }}>
              {t("Reset every shortcut?")}
              <button type="button" onClick={() => { resetAll(); setConfirmReset(false); setNote(null); }} style={btn(true)}>{t("Reset")}</button>
              <button type="button" onClick={() => setConfirmReset(false)} style={btn()}>{t("Cancel")}</button>
            </span>
          : <button type="button" disabled={!anyCustom} onClick={() => setConfirmReset(true)} style={{ ...btn(), opacity: anyCustom ? 1 : 0.45, cursor: anyCustom ? "pointer" : "default" }}
              title={anyCustom ? t("Put every shortcut back to how Axis ships") : t("Every shortcut is already the default")}>{t("Restore defaults")}</button>}
      </div>
      {GROUPS.map(([g, label]) => (
        <div key={g}>
          <Heading>{label()}</Heading>
          {ACTIONS.filter(a => a.group === g).map(a => {
            const keys = keysFor(a.id), custom = isCustom(a.id);
            const recording = (i) => rec?.id === a.id && rec.index === i;
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 34, padding: "3px 0", borderBottom: `1px solid ${C.border}88` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: TYPE.label, color: C.text }}>{a.label()}</div>
                  {note?.id === a.id && <div style={{ fontSize: TYPE.small, color: note.bad ? C.danger : C.warning, marginTop: 2 }}>{note.text}</div>}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "flex-end" }}>
                  {keys.map((k, i) => (
                    <span key={`${k}:${i}`} style={chipStyle(recording(i) ? "recording" : custom ? "custom" : "normal")}>
                      <button type="button" onClick={() => { setNote(null); setRec(recording(i) ? null : { id: a.id, index: i }); }}
                        title={t("Click, then press the new keys")}
                        style={{ border: "none", background: "none", padding: 0, color: "inherit", font: "inherit", cursor: "pointer" }}>
                        {recording(i) ? t("Press keys…") : k}
                      </button>
                      {!recording(i) && <button type="button" onClick={() => { unbind(a.id, i); setNote(null); }} aria-label={t("Remove {key}", { key: k })} title={t("Remove {key}", { key: k })}
                        style={{ border: "none", background: "none", padding: 0, color: C.textMute, cursor: "pointer", fontSize: 12, lineHeight: 1 }}>×</button>}
                    </span>
                  ))}
                  {recording(keys.length)
                    ? <span style={chipStyle("recording")}>{t("Press keys…")}</span>
                    : <button type="button" onClick={() => { setNote(null); setRec({ id: a.id, index: keys.length }); }} title={t("Add another key")} aria-label={t("Add another key")}
                        style={{ ...chipStyle("normal"), minWidth: 24, padding: "0 7px", color: C.textMid }}>{keys.length ? "+" : t("+ Add")}</button>}
                  {custom && <button type="button" onClick={() => { resetAction(a.id); setNote(null); }} title={t("Back to {keys}", { keys: actionById(a.id).keys.join(" · ") })}
                    style={{ border: "none", background: "none", color: C.accent, cursor: "pointer", fontSize: TYPE.small, padding: "0 2px" }}>{t("Default")}</button>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <Heading>{t("Fixed")}</Heading>
      {FIXED().map(([k, label]) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 30, borderBottom: `1px solid ${C.border}88` }}>
          <div style={{ flex: 1, fontSize: TYPE.label, color: C.textMid }}>{label}</div>
          <span style={{ fontSize: 12.5, color: C.textMid, fontVariantNumeric: "tabular-nums" }}>{k}</span>
        </div>
      ))}
    </>
  );
}

function Heading({ children }) {
  return <div style={{ fontSize: TYPE.section, fontWeight: WEIGHT.value, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid, margin: "20px 0 6px" }}>{children}</div>;
}
const btn = (primary) => ({ height: 28, padding: "0 12px", borderRadius: 6, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
  background: primary ? C.accent : C.surfaceAlt, border: `1px solid ${primary ? C.accent : C.borderStrong}`, color: primary ? C.bg : C.text });
