#!/usr/bin/env node
// Deliberately operator-only: this never runs during startup or a deploy.
// It removes pre-account data that cannot be safely attributed to a person.
import { createHash } from 'node:crypto'
import { chmod, link, open, unlink, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

// Keys are explicit because `daily_plans` is keyed by (user_id, date), not id.
// Provider children are collected before deleting their owner accounts so the
// immutable backup is sufficient to understand/recover every cascade.
const TABLES = Object.freeze([
  { name: 'log_entries', select: 'select * from log_entries where user_id is null order by id asc' },
  { name: 'daily_targets', select: 'select * from daily_targets where user_id is null order by id asc' },
  { name: 'oura_accounts', select: 'select * from oura_accounts where user_id is null order by id asc' },
  { name: 'oura_workouts', select: 'select w.* from oura_workouts w join oura_accounts a on a.id = w.account_id where a.user_id is null order by w.id asc' },
  { name: 'garmin_accounts', select: 'select * from garmin_accounts where user_id is null order by id asc' },
  { name: 'garmin_dailies', select: 'select d.* from garmin_dailies d join garmin_accounts a on a.id = d.account_id where a.user_id is null order by d.id asc' },
  { name: 'wearable_signals', select: 'select * from wearable_signals where user_id is null order by id asc' },
  { name: 'daily_plans', select: 'select * from daily_plans where user_id is null order by date asc' },
])
const REQUIRED_CONFIRMATION = '--confirm-ownerless-cleanup'

export function parseArgs(args) {
  const mode = args.includes('--preview') ? 'preview' : args.includes('--execute') ? 'execute' : null
  const valueAfter = (flag) => {
    const index = args.indexOf(flag)
    return index === -1 ? null : args[index + 1] || null
  }
  if (!mode || args.filter((arg) => arg === '--preview' || arg === '--execute').length !== 1) {
    throw new Error('Specify exactly one of --preview or --execute.')
  }
  const receipt = valueAfter('--receipt')
  if (!receipt) throw new Error('A --receipt <path> is required.')
  const backup = valueAfter('--backup')
  if (mode === 'execute' && args.includes(REQUIRED_CONFIRMATION) === false) {
    throw new Error(`--execute requires ${REQUIRED_CONFIRMATION}.`)
  }
  if (mode === 'execute' && !backup) throw new Error('--execute requires --backup <path>.')
  if (mode === 'preview' && backup) throw new Error('--backup is only valid with --execute.')
  return { mode, receipt: path.resolve(receipt), backup: backup && path.resolve(backup) }
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function writeNewPrivateJson(destination, value) {
  const temporary = `${destination}.tmp-${process.pid}`
  const handle = await open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
  } finally {
    await handle.close()
  }
  await chmod(temporary, 0o600)
  // A pre-existing final path is never overwritten; a cleanup receipt or
  // backup must remain an immutable record of that particular operation.
  try {
    // link(2) is atomic and fails if destination already exists, unlike rename.
    await link(temporary, destination)
  } finally {
    await unlink(temporary)
  }
}

async function collect(sql) {
  const rows = {}
  for (const table of TABLES) rows[table.name] = await sql(table.select)
  return rows
}

async function remove(sql) {
  // Account children use ON DELETE CASCADE. Keep this list fixed and audited;
  // never interpolate operator-provided table names into a destructive query.
  await sql.transaction((txn) => [
    txn('delete from log_entries where user_id is null'), txn('delete from daily_targets where user_id is null'),
    txn('delete from wearable_signals where user_id is null'), txn('delete from daily_plans where user_id is null'),
    // These two delete their collected children through FK cascade.
    txn('delete from oura_accounts where user_id is null'), txn('delete from garmin_accounts where user_id is null'),
  ])
}

export async function runCleanup({ args, databaseUrl = process.env.DATABASE_URL, sqlClient }) {
  const options = parseArgs(args)
  if (!databaseUrl) throw new Error('DATABASE_URL is required; refusing to select a local/dev store.')
  // Refuse destination collisions before any destructive query, including a
  // receipt collision which otherwise would be discovered only after commit.
  for (const destination of [options.receipt, options.backup].filter(Boolean)) {
    try { await access(destination) } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    throw new Error('Backup and receipt destinations must not already exist.')
  }
  if (options.receipt === options.backup) throw new Error('Backup and receipt must use different paths.')
  const sql = sqlClient || neon(databaseUrl)
  const before = await collect(sql)
  const countsBefore = Object.fromEntries(TABLES.map((table) => [table.name, before[table.name].length]))
  const receipt = { kind: 'ownerless-legacy-cleanup', mode: options.mode, created_at: new Date().toISOString(), counts_before: countsBefore, total_before: Object.values(countsBefore).reduce((sum, n) => sum + n, 0), data_sha256: digest(before) }
  if (options.mode === 'execute') {
    // Backup intentionally contains the orphaned rows, which may include
    // provider tokens. It is mode 0600, never printed, and must be handled as
    // a production secret until retention expires.
    await writeNewPrivateJson(options.backup, { ...receipt, rows: before })
    await remove(sql)
    const after = await collect(sql)
    receipt.counts_after = Object.fromEntries(TABLES.map((table) => [table.name, after[table.name].length]))
    receipt.total_after = Object.values(receipt.counts_after).reduce((sum, n) => sum + n, 0)
    receipt.backup_path = options.backup
    if (receipt.total_after !== 0) throw new Error('Cleanup did not reach zero; receipt was not written.')
  }
  await writeNewPrivateJson(options.receipt, receipt)
  return receipt
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runCleanup({ args: process.argv.slice(2) })
    .then((receipt) => console.log(`${receipt.mode} complete: ${receipt.total_before} ownerless row(s); receipt ${process.argv[process.argv.indexOf('--receipt') + 1]}`))
    .catch((error) => { console.error(`ownerless cleanup refused: ${error.message}`); process.exitCode = 1 })
}
