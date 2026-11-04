import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config.js'

// The desktop app: same source tree, its own entry (desktop.html) and its own output folder, so the
// phone build (vite.config.js -> dist/, which Capacitor ships) never contains a byte of it.
//
//   npm run dev:desktop     http://localhost:5180/
//   npm run build:desktop   -> dist-desktop/
export default mergeConfig(base, defineConfig({
  plugins: [{
    // Serve desktop.html at "/" in dev, so the app opens at the root like the phone one does.
    name: 'axis-desktop-root',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => { if (req.url === '/' || req.url === '/index.html') req.url = '/desktop.html'; next() })
    },
  }],
  build: {
    outDir: 'dist-desktop',
    rollupOptions: { input: 'desktop.html' },
  },
  server: { port: 5180 },
}))
