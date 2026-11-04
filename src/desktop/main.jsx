import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import ErrorBoundary from '../ErrorBoundary.jsx'
import DesktopApp from './DesktopApp.jsx'
import { migrateLocalStorage } from '../lib/storage-migrate.js'
import { FITS_KEY, initFitsStore, replaceFitsDB } from '../lib/fits-store.js'
import { initLocale } from '../lib/i18n.js'

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
  await initLocale()
  mount()
})()
