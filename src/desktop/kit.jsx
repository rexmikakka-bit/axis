import { useEffect } from "react";
import { C } from "../theme.js";
import { t } from "../lib/i18n.js";
import { fmtMarginPct } from "../lib/fmt.js";

// The desktop's own small building blocks, sized for a monitor at arm's length rather than a phone
// in the hand. Owen's readability rules (2026-11-04): nothing you have to read under 12 px, textMid
// rather than textMute for it, and NO BOLD AT SMALL SIZES — Saira's heavy weights smear below ~14 px,
// so small text is 500 at most and emphasis comes from size and colour instead of weight.

export const TYPE = { label: 13, value: 13.5, small: 12, section: 11.5 };
export const WEIGHT = { text: 400, value: 500, strong: 600 };

export function SectionLabel({ children, right, style }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 12px 4px", ...style }}>
      <span style={{ fontSize: TYPE.section, fontWeight: WEIGHT.value, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid }}>{children}</span>
      {right}
    </div>
  );
}

/**
 * Label/value grid: 26 px rows, 20 px gutter. `rows` is [[label, value, opts?]], opts = {color,
 * title, weight} — `title` carries the unrounded figure as a tooltip, the desktop's version of the
 * phone's tap-to-unround. Without `cols`, as many `min`-wide columns as the window has room for, so a
 * stat window reflows from one column to three as it is resized (Owen, 2026-11-05). `cols` fixes it.
 */
export function KV({ rows, min = 190, cols }) {
  const template = cols ? `repeat(${cols}, minmax(0, 1fr))` : `repeat(auto-fill, minmax(${min}px, 1fr))`;
  return (
    <div style={{ display: "grid", gridTemplateColumns: template, columnGap: 20, padding: "2px 12px 8px" }}>
      {rows.filter(Boolean).map(([label, value, o = {}], i) => (
        <div key={i} title={o.title ?? (typeof label === "string" ? label : undefined)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 26, minWidth: 0 }}>
          <span style={{ fontSize: TYPE.label, color: C.textMid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
          <span style={{ fontSize: TYPE.value, fontWeight: o.weight ?? WEIGHT.value, color: o.color ?? C.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * A labelled usage bar: label left, `used / total unit` right, 4 px bar beneath. Red when over.
 * `showPct` adds the share of the maximum in use beside the label (CPU, powergrid). `remaining`
 * swaps the readout for the phone's other one, "x left" / "x over" with the signed margin, and
 * `onToggle` makes the bar the switch between them, as tapping the phone's strip is.
 */
export function UsageBar({ label, labelColor, used, total, unit = "", fmt = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 1 }), color,
                           showPct = false, remaining = false, margin = false, onToggle }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const over = total >= 0 && used > total + 1e-6;
  const rem = (total ?? 0) - (used ?? 0);
  return (
    <div style={{ minWidth: 0, cursor: onToggle ? "pointer" : undefined }} onClick={onToggle}
      title={onToggle ? `${label}: ${fmt(used)} / ${fmt(total)}${unit ? ` ${unit}` : ""} — ${remaining ? t("click for used / total") : t("click for what is left")}` : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: TYPE.label, fontWeight: WEIGHT.value, color: labelColor ?? C.textMid, whiteSpace: "nowrap" }}>
          {label}
          {showPct && total > 0 && <span style={{ marginLeft: 6, fontWeight: WEIGHT.text, color: over ? C.danger : C.textMid, fontVariantNumeric: "tabular-nums" }}>
            {(used / total * 100).toFixed(2)}%</span>}
        </span>
        {remaining
          ? <span style={{ fontSize: TYPE.value, fontWeight: WEIGHT.value, color: over ? C.danger : C.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {fmt(Math.abs(rem))}{unit ? ` ${unit}` : ""} <span style={{ color: over ? C.danger : C.textMid, fontWeight: WEIGHT.text }}>{over ? t("over") : t("left")}
                {margin && total > 0 ? ` · ${fmtMarginPct(rem, total)}` : ""}</span>
            </span>
          : <span style={{ fontSize: TYPE.value, fontWeight: WEIGHT.value, color: over ? C.danger : C.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {fmt(used)} <span style={{ color: C.textMid, fontWeight: WEIGHT.text }}>/ {fmt(total)}{unit ? ` ${unit}` : ""}</span>
            </span>}
      </div>
      <div style={{ height: 4, borderRadius: 2, background: C.border, marginTop: 5, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: over ? C.danger : (color ?? labelColor ?? C.textMid) }} />
      </div>
    </div>
  );
}

export function Empty({ children }) {
  return <div style={{ padding: 14, fontSize: TYPE.label, color: C.textMid }}>{children}</div>;
}

/**
 * A desktop dialog: a centred panel over a dimmed workspace. Escape or a click outside closes it.
 * For a choice too big for the window it starts from (the ammo picker).
 */
export function Dialog({ title, onClose, width = 560, children }) {
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div role="presentation" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center" }}>
      <div role="dialog" aria-modal="true" aria-label={title}
        style={{ width: `min(${width}px, calc(100vw - 48px))`, maxHeight: "calc(100vh - 96px)", display: "flex", flexDirection: "column",
                 background: C.surface, border: `1px solid ${C.borderStrong}`, borderRadius: 8, boxShadow: "0 12px 40px rgba(0,0,0,.55)", lineHeight: 1.3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 6px 0 14px", borderBottom: `1px solid ${C.border}`, flex: "none" }}>
          <span style={{ fontSize: 13.5, fontWeight: WEIGHT.strong, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
          <button type="button" aria-label="Close" onClick={onClose}
            style={{ width: 28, height: 28, border: "none", background: "transparent", color: C.textMid, fontSize: 18, cursor: "pointer", borderRadius: 5 }}>×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Desktop-only page CSS, laid over the phone's getGlobalCss(). Scrollbars: the platform's grey bar
 * with arrows sat in every window like a second border. Here they are 8 px, no track, the thumb a
 * theme border colour that only firms up while you are over the pane it scrolls. The -webkit-
 * pseudo-elements rather than the standard scrollbar-color/width: in Chromium (and so WebView2, the
 * Tauri shell on Windows) setting the standard pair switches these off, and they are the only way to
 * get the rounded, inset thumb.
 */
export const deskCss = () => `
  *::-webkit-scrollbar { width: 8px; height: 8px; }
  *::-webkit-scrollbar-track, *::-webkit-scrollbar-corner { background: transparent; }
  *::-webkit-scrollbar-thumb { background-color: ${C.border}; border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; min-height: 28px; }
  *:hover::-webkit-scrollbar-thumb { background-color: ${C.borderStrong}; }
  *::-webkit-scrollbar-thumb:hover { background-color: ${C.textMute}; }
  *::-webkit-scrollbar-button { display: none; height: 0; width: 0; }
`;
