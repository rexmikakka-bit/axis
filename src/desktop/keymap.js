// The desktop's keyboard shortcuts as data: every rebindable action, its default keys, and the user's
// changes on top. DesktopApp's key handler asks `actionFor(event)` what a press means; the F1 sheet and
// Settings > Keyboard draw from `ACTIONS` and `keysFor`, so all three always agree.
//
// A combination is a string, modifiers first in a fixed order: "Ctrl+G", "Ctrl+Shift+T", "Alt+3",
// "F1". Letters and digits come from the PHYSICAL key (KeyboardEvent.code), so Alt+1 and Ctrl+Shift+1
// still read as 1 on layouts where those chords type a symbol. Only what the user changed is stored
// (axis_desk_keys: {actionId: [combos]}), so a default that changes in a later version still reaches
// everyone who never touched that action.
//
// Not here, on purpose: undo/redo (use-fit-session.js owns them, inside text fields too), paste (the
// system's own paste event, which is what lets Ctrl+V read the clipboard at all), and the mouse
// gestures. Settings lists them as fixed.
import { t } from '../lib/i18n.js';
import { IS_WEB } from './os-window.js';

const STORE_KEY = 'axis_desk_keys';

// `when`: "fit" needs an open fit; "anywhere" also works while typing in a text field (Ctrl+F's whole
// point); "noSelection" stands down while page text is selected or a sheet is open (Ctrl+C).
export const ACTIONS = [
  { id: 'newTab',        group: 'fits',    label: () => t('New tab'),                        keys: ['Ctrl+T'] },
  { id: 'closeTab',      group: 'fits',    label: () => t('Close tab'),                      keys: ['Ctrl+W'] },
  { id: 'nextTab',       group: 'fits',    label: () => t('Next tab'),                       keys: ['Ctrl+Tab', 'Ctrl+PageDown'] },
  { id: 'prevTab',       group: 'fits',    label: () => t('Previous tab'),                   keys: ['Ctrl+Shift+Tab', 'Ctrl+PageUp'] },
  { id: 'copyEft',       group: 'fits',    label: () => t('Copy the fit as EFT'),            keys: ['Ctrl+C'], when: 'noSelection' },
  { id: 'importFit',     group: 'fits',    label: () => t('Import a fit'),                   keys: ['Ctrl+O'] },
  { id: 'exportFit',     group: 'fits',    label: () => t('Export the fit'),                 keys: ['Ctrl+S'], when: 'fit' },
  { id: 'snapshot',      group: 'fits',    label: () => t('Export a snapshot'),              keys: ['Ctrl+Shift+S'], when: 'fit' },
  { id: 'esiImport',     group: 'fits',    label: () => t('Import from your EVE character'), keys: ['Ctrl+B'] },
  { id: 'esiExport',     group: 'fits',    label: () => t('Save to your in-game fittings'),  keys: ['Ctrl+E'], when: 'fit' },
  { id: 'optimizePrice', group: 'fits',    label: () => t("Optimize the fit's price"),       keys: ['Ctrl+D'], when: 'fit' },
  { id: 'pickPilot',     group: 'fits',    label: () => t('Pick the pilot'),                 keys: ['Ctrl+K'], when: 'fit' },

  { id: 'win:graphs',    group: 'windows', label: () => t('Graphs'),                         keys: ['Ctrl+G'] },
  { id: 'win:fitting',   group: 'windows', label: () => t('Fitting'),                        keys: ['Ctrl+M'] },
  { id: 'browserSearch', group: 'windows', label: () => t('Search the Browser'),             keys: ['Ctrl+F'], when: 'anywhere' },
  { id: 'browserToggle', group: 'windows', label: () => t('Browser: switch Ships and Market'), keys: ['Ctrl+Space'] },
  { id: 'win:drones',    group: 'windows', label: () => t('Drones'),                         keys: ['Ctrl+1'] },
  { id: 'win:fighters',  group: 'windows', label: () => t('Fighters'),                       keys: ['Ctrl+2'] },
  { id: 'win:cargo',     group: 'windows', label: () => t('Cargo'),                          keys: ['Ctrl+3'] },
  { id: 'win:implants',  group: 'windows', label: () => t('Implants'),                       keys: ['Ctrl+4', 'Ctrl+I'] },
  { id: 'win:boosters',  group: 'windows', label: () => t('Boosters'),                       keys: ['Ctrl+5'] },
  { id: 'win:projected', group: 'windows', label: () => t('Projected'),                      keys: ['Ctrl+6'] },
  { id: 'win:command',   group: 'windows', label: () => t('Command links'),                  keys: ['Ctrl+7'] },
  { id: 'win:notes',     group: 'windows', label: () => t('Notes'),                          keys: ['Ctrl+8'] },
  { id: 'win:settings',  group: 'windows', label: () => t('Settings'),                       keys: ['Ctrl+,'] },

  ...Array.from({ length: 9 }, (_, i) => ({ id: `layout:${i}`, group: 'layouts', label: () => t('Layout {n}', { n: i + 1 }), keys: [`Alt+${i + 1}`] })),
  { id: 'lockLayout',    group: 'layouts', label: () => t('Lock layout'),                    keys: ['Ctrl+Shift+L'] },
  { id: 'reopenWindow',  group: 'layouts', label: () => t('Reopen the last closed window'),  keys: ['Ctrl+Shift+T'] },

  { id: 'shortcuts',     group: 'help',    label: () => t('Keyboard shortcuts'),             keys: ['F1', '?'] },
];
// In a browser (the web build), the browser keeps Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+PageUp/PageDown and
// Ctrl+Shift+T for itself and a page never sees them, so those actions default to Alt instead. Character
// login is not in the web build, so neither are its two actions.
if (IS_WEB) {
  const WEB_KEYS = { newTab: ['Alt+T'], closeTab: ['Alt+W'], nextTab: ['Alt+PageDown'], prevTab: ['Alt+PageUp'], reopenWindow: ['Alt+Shift+T'] };
  for (const a of ACTIONS) if (WEB_KEYS[a.id]) a.keys = WEB_KEYS[a.id];
  for (const id of ['esiImport', 'esiExport']) ACTIONS.splice(ACTIONS.findIndex(a => a.id === id), 1);
}
export const GROUPS = [['fits', () => t('Fits')], ['windows', () => t('Windows')], ['layouts', () => t('Layouts')], ['help', () => t('This list')]];
// The shortcuts the app keeps fixed, for the lists to show alongside the rest.
export const FIXED = () => [
  ['Ctrl+Z', t('Undo')], ['Ctrl+Y · Ctrl+Shift+Z', t('Redo')], ['Ctrl+V', t('Paste an EFT fit')],
];
const BY_ID = new Map(ACTIONS.map(a => [a.id, a]));
export const actionById = (id) => BY_ID.get(id);

// Keys a binding may not take: they belong to text fields, menus, dialogs and the Fitting window.
const RESERVED = new Set(['Escape', 'Enter', 'Delete', 'Backspace', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+Shift+Z', 'Ctrl+V', 'Ctrl+A', 'Ctrl+X']);
const NAMED = { ' ': 'Space', Spacebar: 'Space', Esc: 'Escape', Del: 'Delete' };
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph']);

/** The combination a keydown is, or null for a bare modifier. */
export function comboOf(e) {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const ctrl = e.ctrlKey || e.metaKey;
  let key, shiftCounts = true;
  const letter = /^Key([A-Z])$/.exec(e.code ?? ''), digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code ?? '');
  if (letter) key = letter[1];
  else if (digit) key = digit[1];
  else if (/^F\d{1,2}$/.test(e.key)) key = e.key;
  else if (NAMED[e.key]) key = NAMED[e.key];
  else if (e.key.length === 1) { key = e.key.toUpperCase(); shiftCounts = false; }   // "?", ",": Shift is part of the character
  else key = e.key;   // Tab, PageUp, ArrowLeft, Home, …
  return [ctrl && 'Ctrl', e.altKey && 'Alt', shiftCounts && e.shiftKey && 'Shift', key].filter(Boolean).join('+');
}
/** Why a combination can't be bound, or null when it can. */
export function bindProblem(combo) {
  if (!combo) return t('Press a key');
  if (RESERVED.has(combo)) return t('{key} is kept for text fields and dialogs', { key: combo });
  // A plain letter or digit would fire while you type a fit name; F-keys and symbols are fine alone.
  if (/^[A-Z0-9]$/.test(combo) || /^Shift\+[A-Z0-9]$/.test(combo)) return t('Add Ctrl or Alt to a letter or number');
  return null;
}

// ── The user's changes ─────────────────────────────────────────────────────────────────────────
let overrides = read();
const listeners = new Set();
function read() { try { const v = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
function write(next) {
  overrides = next;
  try { if (Object.keys(next).length) localStorage.setItem(STORE_KEY, JSON.stringify(next)); else localStorage.removeItem(STORE_KEY); } catch { /* not persisted */ }
  for (const fn of listeners) fn();
}
// Another window (a popped-out Settings) changed them.
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) { overrides = read(); for (const fn of listeners) fn(); } });
export const onKeymapChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const keysFor = (id) => overrides[id] ?? actionById(id)?.keys ?? [];
export const isCustom = (id) => Object.prototype.hasOwnProperty.call(overrides, id);
/** The action a combination is bound to now, or null. */
export function actionForCombo(combo) {
  if (!combo) return null;
  for (const a of ACTIONS) if (keysFor(a.id).includes(combo)) return a;
  return null;
}
export const actionFor = (e) => actionForCombo(comboOf(e));

/**
 * Bind `combo` to `id` in place of the key at `index` (or added, when index is past the end). A
 * combination belongs to one action: any other action holding it loses it. Returns that action's id,
 * so the caller can say so.
 */
export function bind(id, index, combo) {
  const next = { ...overrides };
  let took = null;
  for (const a of ACTIONS) {
    if (a.id === id) continue;
    const ks = keysFor(a.id);
    if (ks.includes(combo)) { next[a.id] = ks.filter(k => k !== combo); took = a.id; }
  }
  const mine = [...keysFor(id)];
  if (index < mine.length) mine[index] = combo; else mine.push(combo);
  next[id] = [...new Set(mine)];
  write(tidy(next));
  return took;
}
/** Remove the key at `index` from `id` (an action may be left with none). */
export function unbind(id, index) {
  const mine = keysFor(id).filter((_, i) => i !== index);
  write(tidy({ ...overrides, [id]: mine }));
}
export const resetAction = (id) => { const next = { ...overrides }; delete next[id]; write(next); };
export const resetAll = () => write({});
// An override that equals the default is no override.
function tidy(o) {
  const out = {};
  for (const [id, ks] of Object.entries(o)) {
    const def = actionById(id)?.keys;
    if (!def) continue;
    if (ks.length === def.length && ks.every((k, i) => k === def[i])) continue;
    out[id] = ks;
  }
  return out;
}
/** "Ctrl+G · Ctrl+M"-style text for the lists. */
export const keysText = (id) => keysFor(id).join(' · ');
