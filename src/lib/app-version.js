/* global __AXIS_DESKTOP_VERSION__ */
// The version of Axis that is RUNNING, for the snapshot card's footer (a screenshot from a user is
// only diagnosable when it says which build drew it).
//
// The desktop build knows its own at build time (vite.desktop.config.js). On a phone the installed
// app is the authority: Capacitor's App.getInfo() reads the native marketing version (Android
// versionName, iOS CFBundleShortVersionString), which is what the user actually has, rather than
// anything in the web bundle that could disagree with it. The platform follows it, since the two
// platforms' builds are cut separately. In a plain browser (the dev server) there is no native layer,
// and it says so.

let pending = null;

/** "1.28.7 iOS", "1.28.7 Android", "0.5.2 Desktop", or "dev". Resolves once and is cached. */
export function appVersion() {
  pending ??= (async () => {
    if (typeof __AXIS_DESKTOP_VERSION__ === "string") return `${__AXIS_DESKTOP_VERSION__} Desktop`;
    try {
      const [{ App }, { Capacitor }] = await Promise.all([import("@capacitor/app"), import("@capacitor/core")]);
      const info = await App.getInfo();
      const platform = { ios: "iOS", android: "Android" }[Capacitor.getPlatform()];
      if (info?.version) return platform ? `${info.version} ${platform}` : info.version;
    } catch { /* no native layer: the web build */ }
    return "dev";
  })();
  return pending;
}
