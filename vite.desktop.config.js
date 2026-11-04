import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config.js'

// The desktop app: same source tree, its own entry (desktop.html) and its own output folder, so the
// phone build (vite.config.js -> dist/, which Capacitor ships) never contains a byte of it.
//
//   npm run dev:desktop     http://localhost:5180/
//   npm run build:desktop   -> dist-desktop/
export default mergeConfig(base, defineConfig({
  plugins: [{
    // Serve desktop.html at "/" in dev, so the app opens at the root like the phone one does, and
    // emit it as index.html, which is the file the Tauri shell (src-tauri/) loads.
    name: 'axis-desktop-root',
    enforce: 'post',   // after Vite's own HTML plugin has put the page into the bundle
    configureServer(server) {
      // Path only: a popped-out window is "/?satellite=<id>", and it has to get the desktop page too.
      server.middlewares.use((req, _res, next) => {
        const [path, query] = req.url.split('?')
        if (path === '/' || path === '/index.html') req.url = '/desktop.html' + (query != null ? `?${query}` : '')
        next()
      })
    },
    generateBundle(_opts, bundle) {
      const page = bundle['desktop.html']
      if (page) page.fileName = 'index.html'
    },
  }],
  build: {
    outDir: 'dist-desktop',
    rollupOptions: { input: 'desktop.html' },
  },
  server: { port: 5180 },
}))
