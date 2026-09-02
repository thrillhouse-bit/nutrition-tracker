import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  api: {
    me: vi.fn(),
    logout: vi.fn(),
  },
}))

vi.mock('../../src/api/client.js', () => ({ api: mock.api }))
vi.mock('../src/ControlTowerRPG.jsx', () => ({
  default: ({ accountUser }) => <div data-testid="account-game">Game for {accountUser.id}</div>,
}))
vi.mock('../../src/components/Auth.jsx', () => ({
  default: ({ onAuthed, surface }) => (
    <button type="button" data-testid="account-auth" data-surface={surface} onClick={() => onAuthed({ id: 7, email: 'hero@example.test' })}>
      Authenticate
    </button>
  ),
  LegalReconsent: ({ user, onAccepted, surface }) => (
    <button type="button" data-testid="account-consent" data-surface={surface} onClick={() => onAccepted({ ...user, legalAcceptanceRequired: false })}>
      Accept for {user.id}
    </button>
  ),
}))

import RPGAccountGate from '../src/RPGAccountGate.jsx'

let host
let root

async function renderGate() {
  await act(async () => {
    root.render(<RPGAccountGate />)
    await Promise.resolve()
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  mock.api.me.mockReset()
  mock.api.logout.mockReset().mockResolvedValue({})
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('Oathbearer account boundary', () => {
  it('never mounts the game before the owning account resolves', async () => {
    mock.api.me.mockReturnValue(new Promise(() => {}))
    await renderGate()
    expect(host.textContent).toContain('Opening your chronicle')
    expect(host.querySelector('[data-testid="account-game"]')).toBeNull()
  })

  it('uses Oathbearer auth copy and mounts only for the authenticated user', async () => {
    mock.api.me.mockResolvedValue({ user: null })
    await renderGate()
    const auth = host.querySelector('[data-testid="account-auth"]')
    expect(auth.dataset.surface).toBe('oathbearer')
    await act(async () => auth.click())
    expect(host.querySelector('[data-testid="account-game"]').textContent).toBe('Game for 7')
  })

  it('holds a signed-in account at required legal acknowledgement', async () => {
    mock.api.me.mockResolvedValue({ user: { id: 8, email: 'oath@example.test', legalAcceptanceRequired: true } })
    await renderGate()
    const consent = host.querySelector('[data-testid="account-consent"]')
    expect(consent.dataset.surface).toBe('oathbearer')
    expect(host.querySelector('[data-testid="account-game"]')).toBeNull()
    await act(async () => consent.click())
    expect(host.querySelector('[data-testid="account-game"]').textContent).toBe('Game for 8')
  })

  it('fails closed on a network error and retries without exposing a save', async () => {
    mock.api.me
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { status: 503 }))
      .mockResolvedValueOnce({ user: { id: 9, email: 'return@example.test' } })
    await renderGate()
    expect(host.textContent).toContain('could not verify this account')
    expect(host.querySelector('[data-testid="account-game"]')).toBeNull()
    await act(async () => {
      host.querySelector('button').click()
      await Promise.resolve()
    })
    expect(host.querySelector('[data-testid="account-game"]').textContent).toBe('Game for 9')
  })
})
