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
      manifest: {
        name: 'Nutrition Tracker',
        short_name: 'Nutrition',
        description: 'Scan barcodes and labels to track daily macros and micronutrients.',
        theme_color: '#10b981',
        background_color: '#0b1220',
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
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
})
