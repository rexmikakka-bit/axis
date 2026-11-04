import { C } from "../theme.js";

// The desktop's own small building blocks, sized for a monitor at arm's length rather than a phone
// in the hand: 12 px labels in textMid (never textMute for anything you have to read), 12-13 px
// tabular values, 10.5 px uppercase section labels. docs/desktop-handoff.md section 3/4.

export const TYPE = { label: 12, value: 12.5, small: 11, section: 10.5 };

export function SectionLabel({ children, right, style }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, padding: "8px 12px 4px", ...style }}>
      <span style={{ fontSize: TYPE.section, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMid }}>{children}</span>
      {right}
    </div>
  );
}

/**
 * Two-column label/value grid: 24 px rows, 16 px gutter. `rows` is [[label, value, opts?]], opts =
 * {color, title} — `title` carries the unrounded figure as a tooltip, the desktop's version of the
 * phone's tap-to-unround.
 */
// Columns fill the window: as many 190 px+ columns as fit, so a narrow window stacks to one column
// instead of truncating its labels, and a wide one spreads out.
export function KV({ rows, min = 190 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, columnGap: 20, padding: "2px 12px 8px" }}>
      {rows.filter(Boolean).map(([label, value, o = {}], i) => (
        <div key={i} title={o.title} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 24, minWidth: 0 }}>
          <span style={{ fontSize: TYPE.label, color: C.textMid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
          <span style={{ fontSize: TYPE.value, fontWeight: o.weight ?? 600, color: o.color ?? C.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

/** A labelled usage bar: label left, `used / total unit` right, 4 px bar beneath. Red when over. */
export function UsageBar({ label, labelColor, used, total, unit = "", fmt = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 1 }), color }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const over = total >= 0 && used > total + 1e-6;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: TYPE.label, fontWeight: 600, color: labelColor ?? C.textMid }}>{label}</span>
        <span style={{ fontSize: TYPE.value, fontWeight: 600, color: over ? C.danger : C.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {fmt(used)} <span style={{ color: C.textMid, fontWeight: 500 }}>/ {fmt(total)}{unit ? ` ${unit}` : ""}</span>
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: C.border, marginTop: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: over ? C.danger : (color ?? labelColor ?? C.textMid) }} />
      </div>
    </div>
  );
}

export function Empty({ children }) {
  return <div style={{ padding: 14, fontSize: TYPE.label, color: C.textMid }}>{children}</div>;
}
