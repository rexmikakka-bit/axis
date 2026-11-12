import { useEffect, useState } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { TAG_PALETTE, MAX_TAG_LEN, normalizeTag, tagKey, tagsOf, hasTag, colorForTag } from "../lib/fit-tags.js";
import { TagChip } from "../components/FittingsScreen.jsx";
import { Dialog } from "./kit.jsx";

// The phone's fit tags (lib/fit-tags.js, FittingsScreen's TagSheet and tag view), as desktop dialogs.
// Tags live on the fits; their colours in the "pyfa-tagcolors" registry, the phone's own key, so a
// colour picked in either app is the one both show.

const COLORS_KEY = "pyfa-tagcolors";
const readColors = () => { try { return JSON.parse(localStorage.getItem(COLORS_KEY) || "{}") || {}; } catch { return {}; } };

export function useTagColors() {
  const [colors, setColors] = useState(readColors);
  useEffect(() => { try { localStorage.setItem(COLORS_KEY, JSON.stringify(colors)); } catch { /* private mode */ } }, [colors]);
  return [colors, setColors];
}

const field = { width: "100%", boxSizing: "border-box", height: 30, padding: "0 10px", borderRadius: 6, fontSize: 13.5,
                background: C.bg, border: `1px solid ${C.borderStrong}`, color: C.text, outline: "none" };
const label = { fontSize: 11.5, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid, margin: "14px 0 7px" };

/** One fit's tags: remove one, add an existing one, or type a new one (the phone's TagSheet). */
export function FitTagsDialog({ fit, allNames, colors, onToggle, onClose }) {
  const [draft, setDraft] = useState("");
  const mine = tagsOf(fit);
  const n = normalizeTag(draft);
  const others = allNames.filter(tag => !hasTag(fit, tag) && (!n || tag.toLowerCase().includes(n.toLowerCase())));
  // Only offered when the typed name isn't a tag already, so one name never shows twice.
  const canCreate = !!n && !allNames.some(tag => tagKey(tag) === tagKey(n));
  const commit = () => { if (canCreate) { onToggle(n); setDraft(""); } else if (others.length === 1) { onToggle(others[0]); setDraft(""); } };
  return (
    <Dialog title={`${t("Tags")} · ${fit.name}`} onClose={onClose} width={440}>
      <div style={{ padding: "12px 14px 16px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {mine.length === 0 && <span style={{ fontSize: 12.5, color: C.textMute }}>{t("No tags yet")}</span>}
          {/* A tag NAME is the pilot's own text and is never translated. */}
          {mine.map(tag => <TagChip key={tag} name={tag} color={colorForTag(tag, colors)} onRemove={() => onToggle(tag)} />)}
        </div>
        <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} maxLength={MAX_TAG_LEN} spellCheck={false}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape" && draft) { e.stopPropagation(); setDraft(""); } }}
          placeholder={t("Find or create a tag...")} aria-label={t("Find or create a tag...")} style={field} />
        {canCreate && <button type="button" onClick={commit}
          style={{ marginTop: 8, width: "100%", height: 30, borderRadius: 6, border: "none", background: C.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {t('Create "{name}"', { name: n })}</button>}
        {others.length > 0 && <>
          <div style={label}>{t("Add existing")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {others.map(tag => <TagChip key={tag} name={tag} color={colorForTag(tag, colors)} onClick={() => onToggle(tag)} dim />)}
          </div>
        </>}
      </div>
    </Dialog>
  );
}

/** One tag across every fit: rename it (onto another tag merges them), recolour it, or delete it (the phone's tag view). */
export function TagEditDialog({ tag, count, allNames, colors, onRename, onColor, onDelete, onClose }) {
  const [name, setName] = useState(tag);
  const color = colorForTag(tag, colors);
  const next = normalizeTag(name);
  const merging = !!next && tagKey(next) !== tagKey(tag) && allNames.some(x => tagKey(x) === tagKey(next));
  const save = () => { if (next && tagKey(next) !== tagKey(tag)) onRename(next); onClose(); };
  return (
    <Dialog title={t("Tags")} onClose={onClose} width={400}>
      <div style={{ padding: "12px 14px 16px" }}>
        <div style={{ fontSize: 12.5, color: C.textMid, marginBottom: 8 }}>{t({ one: "{n} fit", other: "{n} fits" }, { n: count })}</div>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={MAX_TAG_LEN} spellCheck={false} aria-label={t("Name")}
          onKeyDown={e => { if (e.key === "Enter") save(); }} style={{ ...field, fontWeight: 600 }} />
        {merging && <div style={{ fontSize: 12, color: C.warning, marginTop: 6 }}>{t("Merges into the existing tag \"{tag}\"", { tag: allNames.find(x => tagKey(x) === tagKey(next)) })}</div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0 4px" }}>
          {TAG_PALETTE.map(p => (
            <button key={p} type="button" onClick={() => onColor(p)} aria-label={t("Colour {hex}", { hex: p })} title={t("Colour {hex}", { hex: p })}
              style={{ width: 24, height: 24, borderRadius: 99, background: p, cursor: "pointer",
                       border: p.toLowerCase() === color.toLowerCase() ? `2px solid ${C.text}` : "2px solid transparent" }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={onDelete}
            style={{ height: 30, padding: "0 12px", borderRadius: 6, fontSize: 13, cursor: "pointer", background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", color: C.danger }}>{t("Delete tag")}</button>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={save}
            style={{ height: 30, padding: "0 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", background: C.accent, border: "none", color: "#fff" }}>{t("Save")}</button>
        </div>
      </div>
    </Dialog>
  );
}
