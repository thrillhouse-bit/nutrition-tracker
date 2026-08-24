// Storage layer with one interface and two backends:
//
//   • PgStore   — Neon Postgres, used whenever DATABASE_URL is set. This is the
//                 cross-device sync path (check your log from phone + laptop).
//   • JsonStore — a local JSON file, used when DATABASE_URL is absent. Dev-only
//                 fallback so the whole app (scan → log → today → history) works
//                 with no account/credentials. NOT for production or multi-device.
//
// Routes only ever call the exported `store`, so swapping backends is invisible
// to them. If you want to force Neon-only, delete JsonStore and throw when
// DATABASE_URL is missing.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const DEFAULT_TARGETS = {
  calories: 2000,
  protein_g: 150,
  carbs_g: 200,
  fat_g: 65,
  fiber_g: 30,
  sugar_g: null,
  sodium_mg: 2300,
}

const FOOD_FIELDS = [
  'barcode', 'name', 'brand', 'serving_size', 'serving_unit',
  'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg',
  'source', 'raw_api_response',
]

function pickFood(f = {}) {
  const out = {}
  for (const k of FOOD_FIELDS) out[k] = f[k] ?? null
  if (!out.source) out.source = 'manual'
  return out
}

// --------------------------------------------------------------------------
// Neon Postgres backend
// --------------------------------------------------------------------------
class PgStore {
  constructor(url) {
    this.url = url
    this.sql = null
  }

  async ready() {
    if (this.sql) return this.sql
    const { neon } = await import('@neondatabase/serverless')
    this.sql = neon(this.url)
    return this.sql
  }

  async getFoodByBarcode(barcode) {
    const sql = await this.ready()
    const rows = await sql`select * from foods where barcode = ${barcode} limit 1`
    return rows[0] || null
  }

  async getFood(id) {
    const sql = await this.ready()
    const rows = await sql`select * from foods where id = ${id} limit 1`
    return rows[0] || null
  }

  async createFood(food) {
    const sql = await this.ready()
    const f = pickFood(food)
    const rows = await sql`
      insert into foods
        (barcode, name, brand, serving_size, serving_unit, calories, protein_g,
         carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, source, raw_api_response)
      values
        (${f.barcode}, ${f.name}, ${f.brand}, ${f.serving_size}, ${f.serving_unit},
         ${f.calories}, ${f.protein_g}, ${f.carbs_g}, ${f.fat_g}, ${f.fiber_g},
         ${f.sugar_g}, ${f.sodium_mg}, ${f.source},
         ${f.raw_api_response ? JSON.stringify(f.raw_api_response) : null})
      returning *`
    return rows[0]
  }

  // Cache a looked-up product so repeat scans skip the API. Barcode is unique;
  // on conflict we return the row already stored.
  async upsertFoodByBarcode(food) {
    if (!food.barcode) return this.createFood(food)
    const existing = await this.getFoodByBarcode(food.barcode)
    if (existing) return existing
    return this.createFood(food)
  }

  async listEntries({ from, to }) {
    const sql = await this.ready()
    return sql`
      select e.id, e.food_id, e.logged_at, e.servings_consumed, e.meal,
             row_to_json(f) as food
      from log_entries e
      join foods f on f.id = e.food_id
      where e.logged_at >= ${from} and e.logged_at < ${to}
      order by e.logged_at asc`
  }

  async addEntry({ food_id, servings_consumed = 1, meal = null, logged_at = null }) {
    const sql = await this.ready()
    const rows = await sql`
      insert into log_entries (food_id, servings_consumed, meal, logged_at)
      values (${food_id}, ${servings_consumed}, ${meal},
              coalesce(${logged_at}::timestamptz, now()))
      returning id`
    return this.getEntry(rows[0].id)
  }

  async getEntry(id) {
    const sql = await this.ready()
    const rows = await sql`
      select e.id, e.food_id, e.logged_at, e.servings_consumed, e.meal,
             row_to_json(f) as food
      from log_entries e join foods f on f.id = e.food_id
      where e.id = ${id} limit 1`
    return rows[0] || null
  }

  async updateEntry(id, patch) {
    const sql = await this.ready()
    // Only servings / meal / logged_at are user-editable on an entry.
    const cur = await this.getEntry(id)
    if (!cur) return null
    const servings = patch.servings_consumed ?? cur.servings_consumed
    const meal = patch.meal !== undefined ? patch.meal : cur.meal
    const loggedAt = patch.logged_at ?? cur.logged_at
    await sql`
      update log_entries
      set servings_consumed = ${servings}, meal = ${meal}, logged_at = ${loggedAt}
      where id = ${id}`
    return this.getEntry(id)
  }

  async deleteEntry(id) {
    const sql = await this.ready()
    const rows = await sql`delete from log_entries where id = ${id} returning id`
    return rows.length > 0
  }

  async getLatestTargets() {
    const sql = await this.ready()
    const rows = await sql`
      select * from daily_targets order by effective_from desc, id desc limit 1`
    return rows[0] || { ...DEFAULT_TARGETS }
  }

  async setTargets(t) {
    const sql = await this.ready()
    const m = { ...DEFAULT_TARGETS, ...t }
    const rows = await sql`
      insert into daily_targets
        (calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg)
      values (${m.calories}, ${m.protein_g}, ${m.carbs_g}, ${m.fat_g},
              ${m.fiber_g}, ${m.sugar_g}, ${m.sodium_mg})
      returning *`
    return rows[0]
  }
}

// --------------------------------------------------------------------------
// Local JSON-file backend (dev fallback)
// --------------------------------------------------------------------------
class JsonStore {
  constructor(file) {
    this.file = file
    this.data = null
    this.writing = Promise.resolve()
  }

  async load() {
    if (this.data) return this.data
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      this.data = JSON.parse(raw)
    } catch {
      this.data = { foods: [], entries: [], targets: [], seq: { food: 0, entry: 0, target: 0 } }
    }
    return this.data
  }

  async persist() {
    // Serialize writes so concurrent mutations don't clobber the file.
    this.writing = this.writing.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true })
      await fs.writeFile(this.file, JSON.stringify(this.data, null, 2))
    })
    return this.writing
  }

  async getFoodByBarcode(barcode) {
    const d = await this.load()
    return d.foods.find((f) => f.barcode && f.barcode === barcode) || null
  }

  async getFood(id) {
    const d = await this.load()
    return d.foods.find((f) => f.id === Number(id)) || null
  }

  async createFood(food) {
    const d = await this.load()
    const f = pickFood(food)
    f.id = ++d.seq.food
    f.created_at = new Date().toISOString()
    d.foods.push(f)
    await this.persist()
    return f
  }

  async upsertFoodByBarcode(food) {
    if (!food.barcode) return this.createFood(food)
    const existing = await this.getFoodByBarcode(food.barcode)
    if (existing) return existing
    return this.createFood(food)
  }

  #withFood(entry) {
    const food = this.data.foods.find((f) => f.id === entry.food_id) || null
    return { ...entry, food }
  }

  async listEntries({ from, to }) {
    const d = await this.load()
    return d.entries
      .filter((e) => e.logged_at >= from && e.logged_at < to)
      .sort((a, b) => (a.logged_at < b.logged_at ? -1 : 1))
      .map((e) => this.#withFood(e))
  }

  async addEntry({ food_id, servings_consumed = 1, meal = null, logged_at = null }) {
    const d = await this.load()
    const entry = {
      id: ++d.seq.entry,
      food_id: Number(food_id),
      servings_consumed: Number(servings_consumed),
      meal: meal || null,
      logged_at: logged_at || new Date().toISOString(),
      created_at: new Date().toISOString(),
    }
    d.entries.push(entry)
    await this.persist()
    return this.#withFood(entry)
  }

  async getEntry(id) {
    const d = await this.load()
    const entry = d.entries.find((e) => e.id === Number(id))
    return entry ? this.#withFood(entry) : null
  }

  async updateEntry(id, patch) {
    const d = await this.load()
    const entry = d.entries.find((e) => e.id === Number(id))
    if (!entry) return null
    if (patch.servings_consumed !== undefined) entry.servings_consumed = Number(patch.servings_consumed)
    if (patch.meal !== undefined) entry.meal = patch.meal || null
    if (patch.logged_at !== undefined) entry.logged_at = patch.logged_at
    await this.persist()
    return this.#withFood(entry)
  }

  async deleteEntry(id) {
    const d = await this.load()
    const i = d.entries.findIndex((e) => e.id === Number(id))
    if (i === -1) return false
    d.entries.splice(i, 1)
    await this.persist()
    return true
  }

  async getLatestTargets() {
    const d = await this.load()
    if (!d.targets.length) return { ...DEFAULT_TARGETS }
    return d.targets[d.targets.length - 1]
  }

  async setTargets(t) {
    const d = await this.load()
    const row = {
      id: ++d.seq.target,
      ...DEFAULT_TARGETS,
      ...t,
      effective_from: new Date().toISOString(),
    }
    d.targets.push(row)
    await this.persist()
    return row
  }
}

function makeStore() {
  const url = process.env.DATABASE_URL
  if (url) {
    return { store: new PgStore(url), backend: 'postgres' }
  }
  const file = path.join(__dirname, '.data', 'store.json')
  return { store: new JsonStore(file), backend: 'json-file' }
}

export const { store, backend } = makeStore()
