// Express API: proxies nutrition lookups (keeping keys server-side) and gates
// all reads/writes to the storage layer. The frontend only ever calls /api/*.
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import { store, backend } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import { lookupByBarcode, searchByText } from './lookup.js'
import { parseLabel, ocrConfigured } from './ocr.js'

const app = express()
// Label photos are base64 — allow a generous body size.
app.use(express.json({ limit: '15mb' }))
app.use(cors())

const asyncH = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    const status = err.status || 500
    if (status >= 500) console.error(err)
    res.status(status).json({ error: err.message || 'Server error' })
  })

// --- health ---------------------------------------------------------------
app.get('/api/health', asyncH(async (req, res) => {
  res.json({
    ok: true,
    backend, // 'postgres' | 'json-file'
    ocr: ocrConfigured() ? 'configured' : 'not-configured',
    usda: process.env.FDC_API_KEY ? 'configured' : 'not-configured',
    time: new Date().toISOString(),
  })
}))

// --- barcode lookup (cache -> OFF -> USDA) ---------------------------------
app.get('/api/lookup/:barcode', asyncH(async (req, res) => {
  const barcode = String(req.params.barcode).trim()
  if (!/^\d{6,14}$/.test(barcode)) {
    return res.status(400).json({ error: 'Invalid barcode.' })
  }

  // 1. Local cache — repeat scans never hit the network.
  const cached = await store.getFoodByBarcode(barcode)
  if (cached) return res.json({ food: cached, cached: true })

  // 2. Open Food Facts, then USDA.
  const found = await lookupByBarcode(barcode)
  if (!found) {
    return res.status(404).json({ error: 'Product not found in Open Food Facts or USDA.', barcode })
  }

  // 3. Cache the hit so it's instant next time.
  const saved = await store.upsertFoodByBarcode(found)
  res.json({ food: saved, cached: false })
}))

// --- text search (produce / bulk / no barcode) ----------------------------
app.get('/api/search', asyncH(async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 2) return res.json({ results: [] })
  const results = await searchByText(q)
  res.json({ results })
}))

// --- label OCR (Claude vision) --------------------------------------------
app.post('/api/ocr', asyncH(async (req, res) => {
  const { imageBase64, mediaType } = req.body || {}
  const food = await parseLabel({ imageBase64, mediaType })
  res.json({ food })
}))

// --- foods ----------------------------------------------------------------
// Recently-logged foods, for one-tap re-logging.
app.get('/api/foods/recent', asyncH(async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
  res.json({ foods: await store.recentFoods(limit) })
}))

// Persist a food (manual entry, or an OCR/search result the user confirmed)
// so it can be referenced by log entries and re-used later.
app.post('/api/foods', asyncH(async (req, res) => {
  const body = req.body || {}
  if (!body.name || !String(body.name).trim()) {
    return res.status(400).json({ error: 'A food needs a name.' })
  }
  const food = body.barcode
    ? await store.upsertFoodByBarcode(body)
    : await store.createFood(body)
  res.status(201).json({ food })
}))

// --- log entries ----------------------------------------------------------
app.get('/api/entries', asyncH(async (req, res) => {
  const { from, to } = req.query
  if (!from || !to) return res.status(400).json({ error: 'from and to are required.' })
  const entries = await store.listEntries({ from, to })
  res.json({ entries })
}))

// Log a food. Accepts either an existing food_id, or an inline `food` object
// (from a lookup/OCR/manual flow) which is persisted first, then logged.
app.post('/api/entries', asyncH(async (req, res) => {
  const { food_id, food, servings_consumed = 1, meal = null, logged_at = null } = req.body || {}

  let id = food_id
  if (!id) {
    if (!food || !food.name) return res.status(400).json({ error: 'Provide food_id or a food object.' })
    const saved = food.barcode
      ? await store.upsertFoodByBarcode(food)
      : await store.createFood(food)
    id = saved.id
  } else if (!(await store.getFood(id))) {
    return res.status(404).json({ error: 'food_id not found.' })
  }

  const entry = await store.addEntry({ food_id: id, servings_consumed, meal, logged_at })
  res.status(201).json({ entry })
}))

app.patch('/api/entries/:id', asyncH(async (req, res) => {
  const entry = await store.updateEntry(req.params.id, req.body || {})
  if (!entry) return res.status(404).json({ error: 'Entry not found.' })
  res.json({ entry })
}))

app.delete('/api/entries/:id', asyncH(async (req, res) => {
  const ok = await store.deleteEntry(req.params.id)
  if (!ok) return res.status(404).json({ error: 'Entry not found.' })
  res.status(204).end()
}))

// --- daily targets --------------------------------------------------------
app.get('/api/targets', asyncH(async (req, res) => {
  res.json({ targets: await store.getLatestTargets() })
}))

app.put('/api/targets', asyncH(async (req, res) => {
  const targets = await store.setTargets(req.body || {})
  res.json({ targets })
}))

// In production (or any time a build exists) the same process serves the
// built PWA alongside the API, so one container/host handles everything and
// the frontend's relative /api calls are same-origin. In dev, Vite serves the
// app and proxies /api here instead.
const distDir = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  // SPA fallback for any non-/api GET.
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

const PORT = Number(process.env.PORT || 3001)
app.listen(PORT, () => {
  console.log(`[nutrition-tracker] API on http://localhost:${PORT}  (storage: ${backend})`)
  if (backend === 'json-file') {
    console.log('[nutrition-tracker] No DATABASE_URL set — using local JSON store (dev fallback).')
  }
})

export default app
