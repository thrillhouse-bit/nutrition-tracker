import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { JsonStore } from '../server/db.js'

const dirs = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function makeStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'body-current-recovery-'))
  dirs.push(dir)
  return new JsonStore(path.join(dir, 'store.json'))
}

describe('JsonStore password recovery', () => {
  it('atomically activates and consumes a recovery challenge only once', async () => {
    const store = await makeStore()
    const user = await store.createUser({ email: 'linked@example.test', password_hash: 'old-hash' })
    const challenge = await store.createPasswordRecoveryChallenge({
      user_id: user.id,
      start_token_digest: 'start-digest',
      oauth_state_digest: 'state-digest',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    })
    expect((await store.getPasswordRecoveryByStartToken('start-digest')).id).toBe(challenge.id)
    expect((await store.getPasswordRecoveryByOauthState('state-digest')).id).toBe(challenge.id)
    expect(await store.activatePasswordRecovery(challenge.id, 'recovery-digest', new Date(Date.now() + 60_000).toISOString())).toBe(true)

    const [first, second] = await Promise.all([
      store.consumePasswordRecovery('recovery-digest', 'new-hash'),
      store.consumePasswordRecovery('recovery-digest', 'other-hash'),
    ])
    expect([first, second].filter(Boolean)).toHaveLength(1)
    expect([first, second].filter((value) => value === null)).toHaveLength(1)
    expect((await store.getUserByEmail('linked@example.test')).password_hash).toMatch(/^(new|other)-hash$/)
  })

  it('does not activate expired, anonymous, or already-consumed challenges', async () => {
    const store = await makeStore()
    const expired = await store.createPasswordRecoveryChallenge({ user_id: 1, start_token_digest: 's1', oauth_state_digest: 'o1', expires_at: new Date(Date.now() - 1).toISOString() })
    const anonymous = await store.createPasswordRecoveryChallenge({ user_id: null, start_token_digest: 's2', oauth_state_digest: 'o2', expires_at: new Date(Date.now() + 60_000).toISOString() })
    expect(await store.activatePasswordRecovery(expired.id, 'r1', new Date(Date.now() + 60_000).toISOString())).toBe(false)
    expect(await store.activatePasswordRecovery(anonymous.id, 'r2', new Date(Date.now() + 60_000).toISOString())).toBe(false)
    expect(await store.consumePasswordRecovery('missing', 'new-hash')).toBeNull()
    expect(await store.pruneExpiredPasswordRecoveries()).toBe(1)
    expect(await store.getPasswordRecoveryByOauthState('o1')).toBeNull()
    expect(await store.getPasswordRecoveryByOauthState('o2')).toBeTruthy()
  })
})
