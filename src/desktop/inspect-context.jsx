import { createContext, useContext } from "react";

// The app-wide item selection and the way to open an item in its own window, handed to every list
// in the desktop app (Fitting table, Market, Drones, Implants, Boosters, Cargo, Variations).
//
//   fitRef            the fit being edited, as inspect.js activeFitRef — what a fitted item's target names
//   selection         the last thing selected anywhere; the full-time Info / Variations / Mutaplasmid
//                     windows show it
//   select(target)    make `target` the selection
//   inspect(target, tab, {fresh})   open (or raise) a floating window on `target` at `tab`
//   fitModule(rack, mod)            fit a module into the first free slot (the Browser's path)
//
// Provided by DesktopApp; the default is inert so a component rendered outside it (a test, the
// phone) does nothing rather than crash.
const NOOP = { fitRef: null, selection: null, select: () => {}, inspect: () => {}, fitModule: () => {} };
export const InspectContext = createContext(NOOP);
export const useInspect = () => useContext(InspectContext) ?? NOOP;
