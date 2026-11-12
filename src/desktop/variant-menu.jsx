import { C } from "../theme.js";
import { TYPES } from "../calc.js";
import { eveIcon } from "../lib/icons.js";
import { variantsOf } from "../lib/core.js";
import { metaOf, META_COLORS, compareByMeta } from "../lib/meta.js";

/**
 * The "Variations ▸" submenu, as pyfa's: every variant of `typeID` except the abyssal ones, in pyfa's
 * order (meta tab, then meta level, then name: lib/meta.js compareByMeta, so faction ammo, all meta 0,
 * still follows its T1 round), each with its icon and its meta label in the variant's colour.
 * `isCurrent(v)` ticks the one in place; `onPick(v, name)` swaps to another. Undefined when the item has no variants to offer,
 * so the item shows no arrow. Shared by the Fitting and Cargo windows' right-click menus.
 */
export function variantMenuItems(typeID, { isCurrent, onPick }) {
  const list = variantsOf(typeID).filter(v => v?.typeID != null && metaOf(v.typeID, v.meta) !== "Abyssal")
    .sort((a, b) => compareByMeta(a, b));
  if (list.length < 2) return undefined;
  return list.map(v => {
    const meta = metaOf(v.typeID, v.meta), name = TYPES[v.typeID]?.n ?? v.name;
    const here = isCurrent(v);
    return { label: name, icon: eveIcon(v.typeID, 32), checked: here, hint: <span style={{ color: META_COLORS[meta] ?? C.textMid }}>{meta}</span>,
             onSelect: () => { if (!here) onPick(v, name); } };
  });
}
