import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import ErrorBoundary from '../ErrorBoundary.jsx'
import DesktopApp from './DesktopApp.jsx'
import { migrateLocalStorage } from '../lib/storage-migrate.js'
import { FITS_KEY, initFitsStore, replaceFitsDB } from '../lib/fits-store.js'
import { initLocale } from '../lib/i18n.js'
import { setMutaMarketFetch } from '../lib/mutamarket-client.js'
import { setPriceFetch } from '../prices.js'
import { IS_TAURI } from './os-window.js'
import { initDesktopEsi } from './esi-desktop.js'

// The desktop app's boot. Same order as src/main.jsx and for the same reasons (read there): the fit
// library has to be in memory before the first render, migrations run with it injected, and the
// locale is resolved before React exists so the first frame is already in the right language.
// Both apps share one origin's storage when served from the same place, so they share the same fits.
const mount = () => createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <DesktopApp />
    </ErrorBoundary>
  </StrictMode>,
)

;(async () => {
  try {
    let db
    try { db = await initFitsStore(localStorage.getItem(FITS_KEY)) } catch { db = {} }
    const loaded = JSON.stringify(db ?? {})
    const { external } = migrateLocalStorage(undefined, { external: { [FITS_KEY]: loaded } })
    const migrated = external?.[FITS_KEY]
    if (typeof migrated === 'string' && migrated !== loaded) {
      try { await replaceFitsDB(JSON.parse(migrated)) } catch { /* keep what loaded */ }
    }
  } catch (e) {
    console.error('boot: storage init failed', e)
  }
  // MutaMarket and ceve-market send no CORS headers; in the Tauri shell their requests go through
  // the HTTP plugin (scoped to those two APIs in src-tauri/capabilities/default.json).
  if (IS_TAURI) {
    try { const { fetch } = await import('@tauri-apps/plugin-http'); setMutaMarketFetch(fetch); setPriceFetch(fetch) } catch (e) { console.error('boot: http plugin unavailable', e) }
  }
  // ESI login through the system browser and the eveauth-visviva:// link (esi-desktop.js).
  try { await initDesktopEsi({ satellite: new URLSearchParams(window.location.search).has('satellite') }) } catch (e) { console.error('boot: ESI login setup failed', e) }
  await initLocale()
  mount()
})()
