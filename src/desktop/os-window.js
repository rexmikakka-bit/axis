// Opening and closing the OS windows that popped-out workspace windows live in.
//
// In the Tauri shell `window.open` returns null (the webview refuses it), so windows are created
// through Tauri's own API instead. In a plain browser (the dev server) it is window.open. The Tauri
// API is imported lazily, so a browser never loads it and the phone app never contains it.

export const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const label = (id) => `satellite-${id}`;

/**
 * Open (or raise, if already open) the OS window for workspace window `id`. Resolves to a handle
 * with close(), or null when the window could not be opened.
 */
export async function openOsWindow(id, { url, width, height, title }) {
  if (IS_TAURI) {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const existing = await WebviewWindow.getByLabel(label(id));
    if (existing) { await existing.setFocus(); return { close: () => existing.close() }; }
    const win = new WebviewWindow(label(id), { url, width, height, title, minWidth: 200, minHeight: 120 });
    const ok = await new Promise((resolve) => {
      win.once("tauri://created", () => resolve(true));
      win.once("tauri://error", (e) => { console.error("pop-out failed", e); resolve(false); });
    });
    return ok ? { close: () => win.close() } : null;
  }
  const w = window.open(url, `axis-${id}`, `popup,width=${width},height=${height}`);
  return w ? { close: () => w.close() } : null;
}

/**
 * Open a web link in the system browser. In the Tauri shell window.open is refused (see above), so it
 * goes through the opener plugin (http/https, its default scope); in a plain browser, a new tab.
 */
export async function openExternal(url) {
  if (!url) return;
  if (IS_TAURI) {
    try { const { openUrl } = await import("@tauri-apps/plugin-opener"); await openUrl(url); return; } catch (e) { console.error("open link failed", e); }
  }
  window.open(url, "_blank", "noopener");
}

/** Close the window this code is running in (a popped-out window's own Dock button). */
export async function closeThisWindow() {
  if (IS_TAURI) {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    await getCurrentWebviewWindow().close();
  } else window.close();
}

/**
 * Run `fn` when this window is about to close, however it closes: the OS close button in Tauri
 * (which does not reliably fire beforeunload), or a browser tab closing. Returns an unsubscribe.
 */
export function onThisWindowClosing(fn) {
  window.addEventListener("beforeunload", fn);
  let unlisten = null, dead = false;
  if (IS_TAURI) {
    import("@tauri-apps/api/webviewWindow").then(({ getCurrentWebviewWindow }) =>
      getCurrentWebviewWindow().onCloseRequested(() => { fn(); })).then(u => { if (dead) u(); else unlisten = u; }).catch(() => {});
  }
  return () => { dead = true; window.removeEventListener("beforeunload", fn); unlisten?.(); };
}
