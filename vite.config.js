import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

// Every data file (dogma types, effects, modules, the market tree: ~10 MB) is emitted as
// JSON.parse('...') instead of as a JavaScript object literal. V8 parses JSON several times faster
// than the same data written as JS, and parsing it is most of what the app does before its first
// frame. Vite's own `json.stringify` would do this, but Vite 8 (Rolldown) ignores it and inlines
// object literals. Every JSON import in src/ is a default import, which is all this emits.
// Production builds only: the dev server keeps Vite's own handling, so editing a data file still
// hot-reloads.
const jsonAsParse = {
  name: 'axis-json-as-parse',
  enforce: 'pre',
  apply: 'build',
  load(id) {
    if (id.includes('?') || !id.endsWith('.json') || id.includes('node_modules')) return null
    const text = JSON.stringify(JSON.parse(readFileSync(id, 'utf8')))
    return { code: `export default JSON.parse(${JSON.stringify(text)});`, moduleType: 'js' }
  },
}

export default defineConfig({
  plugins: [react(), jsonAsParse],
  build: {
    // Do NOT inline images as base64. Vite inlines assets under 4 KB by default, which pulled all
    // ~1,700 bundled icons into the JS bundle (10 MB -> 15.4 MB) — meaning the app parses every icon
    // at cold start and holds them all in memory, whether shown or not. On a phone that is a real
    // startup cost. Emitting them as files keeps the JS small and lets the webview load each icon
    // only when it's actually rendered. They're still packaged locally, so offline is unaffected.
    assetsInlineLimit: 0,
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // mutamarket.com sends no CORS headers, so a browser cannot call it directly and the market
    // side of the compare tab is unreviewable on the dev server without this. The installed app
    // goes straight to `MUTAMARKET_API` (CapacitorHttp has replaced fetch by then) and never uses
    // this prefix — see `apiBase()` in src/lib/mutamarket-client.js. The User-Agent is MutaMarket's
    // asked-for contact string, duplicated from `MUTAMARKET_USER_AGENT` because importing it here
    // would pull the whole game-data bundle into the Vite config.
    proxy: {
      // ceve-market sends no CORS header either (prices.js); same treatment, dev servers only.
      '/ceve-api': {
        target: 'https://www.ceve-market.org',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/ceve-api/, '/api'),
      },
      '/mutamarket-api': {
        target: 'https://mutamarket.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/mutamarket-api/, '/api'),
        headers: { 'User-Agent': 'Axis EVE fitting tool (rexmikakka@gmail.com)' }
      }
    },
    allowedHosts: [
      'ambitious-hermit-lubricate.ngrok-free.app',
      'ambitious-hermit-lubricate.ngrok-free.dev',
      '.ngrok-free.app',
      '.ngrok-free.dev',
      'localhost'
    ]
  }
})