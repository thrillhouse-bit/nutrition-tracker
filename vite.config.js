import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// The frontend never talks to Open Food Facts / USDA / Anthropic directly — it
// only ever calls `/api/*`, which Vite proxies to the Express backend in dev
// (and which a reverse proxy handles in prod). That keeps every API key on the
// server, per the project brief.
const API_TARGET = process.env.API_TARGET || 'http://localhost:3001'

export default defineConfig({
  server: {
    // Evaluation runs (scripts/food-search-eval/) append to results.jsonl
    // continuously and the browser-driven probes navigate the dev server at
    // the same time — without this, every append triggered an HMR page reload
    // and Playwright's `networkidle` never settled, so the measurement
    // harness broke the thing it was measuring. Nothing under scripts/ or
    // docs/ is part of the client bundle.
    watch: { ignored: ['**/scripts/**', '**/docs/**'] },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Precache the built app shell so the UI opens offline. Runtime caching
      // (below) makes the most recently loaded API data readable offline too;
      // scanning/lookup still require the network, as intended.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // GET reads (today's log, targets, history). NetworkFirst means the
            // last successful response is served when offline.
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith('/api/') && request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      includeAssets: ['icon.svg', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png', 'apple-touch-icon.png'],
      // Installed identity matches the in-app v2 system: the app titles itself
      // "OmniFuel Tech" (index.html) and paints ivory (#f7f4ec theme-color meta)
      // — the old emerald/navy manifest gave the home-screen install a
      // different product's icon, splash, and name. short_name stays shorter
      // than the full name so it doesn't truncate on a home-screen grid.
      manifest: {
        name: 'OmniFuel Tech',
        short_name: 'OmniFuel',
        description: 'Scan barcodes and labels to track daily macros and micronutrients.',
        theme_color: '#f7f4ec',
        background_color: '#f7f4ec',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        // PNGs (for stores / iOS) plus the scalable SVG. Regenerate the PNGs
        // from icon.svg with `npm i -D sharp && npm run gen:icons`.
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    // host:true binds every interface, not just one loopback. Without it Vite
    // picked a single loopback family on macOS, so `curl http://localhost:5173`
    // succeeded while Chrome's `http://127.0.0.1:5173` got ERR_CONNECTION_REFUSED
    // on the same machine (measured 24 Aug 2026). It also exposes the LAN URL,
    // which is how you preview the PWA from a phone on the same network.
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
})
