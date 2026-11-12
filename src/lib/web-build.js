// The hosted browser builds (`--mode web`, Netlify: netlify.toml): the desktop app at "/" and the
// phone app at "/m/". Neither has character login — CCP sends a login back only to callbacks
// registered on the EVE developer application, which the site is not — so login is pointed at the
// installed apps instead. Everything else works as in the apps.

export const IS_WEB_BUILD = import.meta.env?.MODE === 'web';

const APP_STORE = 'https://apps.apple.com/us/app/axis-mobile-fitting-tool/id6798416488';
const ANDROID_RELEASE = 'https://github.com/rexmikakka-bit/axis/releases/latest';   // "latest" is always the Android build

/** Where a phone gets the installed app: the App Store on an iPhone/iPad, the GitHub APK otherwise. */
export function phoneAppUrl() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
  return ios ? APP_STORE : ANDROID_RELEASE;
}

// The layout a phone-sized visitor is sent to, and the switch back. Remembered per browser, so
// "Desktop layout" on a phone (or "Phone layout" on a desktop) sticks across visits.
export const WEB_VIEW_KEY = 'axis_web_view';   // "desktop" | "phone" | absent (decide by screen)
export function switchWebView(view) {
  try { localStorage.setItem(WEB_VIEW_KEY, view); } catch { /* not remembered: this visit only */ }
  window.location.assign(view === 'phone' ? '/m/' : '/');
}
