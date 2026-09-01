import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Postgres account lifecycle schema', () => {
  it('cascades every account-owned table from users', async () => {
    const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8')
    const accountTables = [
      'log_entries', 'daily_targets', 'oura_accounts', 'garmin_accounts',
      'integrations', 'wearable_signals', 'profile', 'daily_plans',
      'afp_profile', 'planned_workouts', 'afp_daily_plans',
    ]
    for (const table of accountTables) {
      const block = schema.match(new RegExp(`create table if not exists ${table} \\([\\s\\S]*?\\n\\);`, 'i'))?.[0]
      expect(block, `missing ${table} DDL`).toBeTruthy()
      expect(block, `${table} must cascade with account deletion`).toMatch(/references users \(id\) on delete cascade/i)
    }
  })

  it('creates the Garmin webhook routing identity on fresh and existing databases', async () => {
    const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8')
    expect(schema).toMatch(/garmin_user_id\s+text/i)
    expect(schema).toMatch(/alter table garmin_accounts add column if not exists garmin_user_id text/i)
    expect(schema).toMatch(/unique index if not exists garmin_accounts_garmin_user_id_idx/i)
  })
})
