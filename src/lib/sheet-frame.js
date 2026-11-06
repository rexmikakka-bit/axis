// How a sheet is drawn: rising from the bottom (the phone), or as a centred dialog (the desktop).
//
// The desktop app provides SheetFrame (a dialog component). ui.jsx's BottomSheet hands its whole
// rendering to it. The sheets built bare rather than on BottomSheet (the pilot picker, the
// import/export chooser, the shopping list, ESI, feedback) keep their own markup and only swap the
// two outer styles through `useDeskSheet` — the overlay becomes a centred backdrop and the sheet a
// panel — so their content needs no second copy. The phone provides nothing, and every one of them
// renders exactly as before.
import { createContext, useContext } from 'react';

export const SheetFrame = createContext(null);
export const useDeskSheet = () => useContext(SheetFrame) != null;

export const DESK_OVERLAY = { position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: 'rgba(0,0,0,.45)' };
export const deskPanel = (w = 560) => ({ width: w, maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 120px)', margin: 0,
                                         borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,.6)', overflowY: 'auto', transform: 'none' });
