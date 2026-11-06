// Loads the dogma data bundle and initialises the engine.
//
// The `with { type: 'json' }` import attributes are REQUIRED. Without them this module works under
// Vite but throws in plain Node ("needs an import attribute of type: json"), which means calc.js
// cannot be imported outside the browser — and therefore the regression suite can't run in CI.
// Import attributes are standard ES2025 and are understood by both Node 18.20+/20.10+/22+ and
// Vite/esbuild/Rollup, so this one file now works in both runtimes. Don't remove them.
import TYPES_DATA   from './data/dogma-types.json'   with { type: 'json' };
import EFFECTS_DATA from './data/dogma-effects.json' with { type: 'json' };
import ATTRS_DATA   from './data/dogma-attrs.json'   with { type: 'json' };
import SYSFX_DATA   from './data/system-effects.json' with { type: 'json' };

import { initEngine } from './dogma-engine.js';
import { applyNewShips } from './data/new-ships.js';
import { applyPrereleaseRigs } from './data/prerelease-rigs.js';
import { applyPrereleaseShips } from './data/prerelease-ships.js';
import { applyPrereleaseModules } from './data/prerelease-modules.js';
import { applyPrereleaseBalance } from './data/prerelease-balance.js';

// Hulls CCP has shipped that our eve.db predates. Raw bundles, so it has to come first.
applyNewShips(TYPES_DATA, EFFECTS_DATA, ATTRS_DATA);
// Hulls CCP has announced but not shipped (the navy attack battlecruisers). Same constraint.
applyPrereleaseShips(TYPES_DATA, EFFECTS_DATA);
// Rigs CCP has shown but not shipped (the Synchronizers). Same constraint.
applyPrereleaseRigs(TYPES_DATA, EFFECTS_DATA, ATTRS_DATA);
// The Aberrant modules and the 24.02 balance changes, from the expansion notes. Same constraint; the
// balance changes run last so they also reach anything added above.
applyPrereleaseModules(TYPES_DATA, EFFECTS_DATA, ATTRS_DATA);
applyPrereleaseBalance(TYPES_DATA, EFFECTS_DATA, ATTRS_DATA);
initEngine(TYPES_DATA, EFFECTS_DATA, ATTRS_DATA, SYSFX_DATA.effects);

export * from './dogma-engine.js';
// DRONE_TYPES is now loaded lazily via data-bundle.js in App.jsx
export const DRONE_TYPES = {};
