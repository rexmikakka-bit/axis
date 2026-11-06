// ESI login in the desktop shell — the phone's flow (App.jsx's appUrlOpen listener) with Tauri's
// pieces: the SSO page opens in the system browser, CCP redirects to the phone's own registered
// callback, eveauth-visviva://auth-callback?code=&state=, Windows launches Axis with that link, the
// single-instance plugin hands it to the window already open (src-tauri/src/lib.rs), and the
// deep-link plugin delivers it here. The token exchange runs through the HTTP plugin.
//
// Lazy imports, so a plain browser (the dev server) never loads Tauri's modules: there, login is the
// web build's redirect, as before.

import { setEsiShell, isEsiCallbackUrl, completeLoginFromCallback, setLastLoginError } from "../lib/esi.js";
import { IS_TAURI, openExternal } from "./os-window.js";

export async function initDesktopEsi({ satellite = false } = {}) {
  if (!IS_TAURI) return;
  const [{ fetch }, deepLink, { getCurrentWindow }] = await Promise.all([
    import("@tauri-apps/plugin-http"), import("@tauri-apps/plugin-deep-link"), import("@tauri-apps/api/window"),
  ]);
  setEsiShell({ openUrl: openExternal, fetch });
  // One window finishes a login, or a popped-out Settings and the main window would both spend the
  // same one-time code. They share storage, so the PKCE verifier a popped-out window saved is here.
  if (satellite) return;
  const handle = async (urls) => {
    for (const url of urls ?? []) {
      if (!isEsiCallbackUrl(url)) continue;
      try { await getCurrentWindow().setFocus(); } catch { /* not fatal */ }
      try { await completeLoginFromCallback(url); }
      catch (e) { console.error("ESI login failed:", e); setLastLoginError(e); }
    }
  };
  await deepLink.onOpenUrl(handle);
  // A link that STARTED the app (no window was open to forward it to).
  try { await handle(await deepLink.getCurrent()); } catch { /* none */ }
}
