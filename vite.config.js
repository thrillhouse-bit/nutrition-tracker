import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// The frontend never talks to Open Food Facts / USDA / Anthropic directly — it
// only ever calls `/api/*`, which Vite proxies to the Express backend in dev
// (and which a reverse proxy handles in prod). That keeps every API key on the
// server, per the project brief.
const API_TARGET = process.env.API_TARGET || 'http://localhost:3001'

// NOTE for anyone running scripts/food-search-eval/ and a browser probe at the
// same time: the eval appends to results.jsonl continuously, the dev server
// treats each append as a change and issues a full page reload, and Playwright's
// `networkidle` then never settles — the app never finishes mounting and every
// probe times out on a blank page. A `server.watch.ignored` entry was tried
// here in two forms (a glob, then a predicate) and NEITHER suppressed the
// reloads when checked against the dev-server log during a live run, so both
// were removed rather than left in place looking like they worked. The verified
// workaround is procedural: do not run a browser probe while an eval run is
// writing. Worth a proper fix if this becomes routine.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Precache only the public app shell so the UI opens offline. Authenticated
      // API responses must never enter a service-worker cache: request URLs are
      // shared by every account on a browser, so a URL-keyed runtime cache can
      // return one person's nutrition or wearable data to the next account.
      workbox: {
        // Story artwork is route-specific and substantially larger than the
        // install shell. Keep generic PNG/WebP files runtime-fetched; the
        // required install icons below remain explicitly included.
        globPatterns: ['**/*.{js,css,html,svg,ico,webmanifest}'],
        // Public legal documents are server-rendered and launch-gated. If the
        // app-shell navigation fallback claims them, an installed PWA shows
        // the sign-in SPA instead of the policy/terms the server approved.
        navigateFallbackDenylist: [/^\/api\//, /^\/privacy\/?$/, /^\/terms\/?$/],
        cleanupOutdatedCaches: true,
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
