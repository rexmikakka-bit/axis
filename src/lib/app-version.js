/* global __AXIS_DESKTOP_VERSION__ */
// The version of Axis that is RUNNING, for the snapshot card's footer (a screenshot from a user is
// only diagnosable when it says which build drew it).
//
// The desktop build knows its own at build time (vite.desktop.config.js). On a phone the installed
// app is the authority: Capacitor's App.getInfo() reads the native marketing version and build
// number (Android versionName/versionCode, iOS CFBundleShortVersionString/CFBundleVersion), which
// is what the user actually has, rather than anything in the web bundle that could disagree with
// it. In a plain browser (the dev server) there is no native layer, and it says so.

let pending = null;

/** "1.28.7 (124)", "Desktop 0.5.2", or "dev". Resolves once and is cached. */
export function appVersion() {
  pending ??= (async () => {
    if (typeof __AXIS_DESKTOP_VERSION__ === "string") return `Desktop ${__AXIS_DESKTOP_VERSION__}`;
    try {
      const { App } = await import("@capacitor/app");
      const info = await App.getInfo();
      if (info?.version) return info.build ? `${info.version} (${info.build})` : info.version;
    } catch { /* no native layer: the web build */ }
    return "dev";
  })();
  return pending;
}
