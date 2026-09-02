// @vitest-environment jsdom

import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import ControlTowerRPG from '../src/ControlTowerRPG.jsx'
import { accountSaveCacheKey } from '../src/rpg/accountSave.js'
import { RPG_SAVE_KEY } from '../src/rpg/save.js'
import { createInitialState } from '../src/rpg/state.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

function remoteSave(payload, revision = 1) {
  return {
    payload,
    revision,
    gameSchemaVersion: payload.schemaVersion,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:01.000Z',
  }
}

async function renderAccount(api) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<ControlTowerRPG accountUser={{ id: 17, email: 'hero@example.test' }} accountSaveApi={api} accountStorage={window.localStorage} />)
  })
}

beforeEach(() => {
  window.localStorage.clear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

describe('account-owned RPG save surface', () => {
  it('boots remote-first and offers the authenticated chronicle', async () => {
    const state = { ...createInitialState(), playtimeTicks: 44 }
    const api = {
      getRpgSave: vi.fn(async () => ({ save: remoteSave(state, 3) })),
      putRpgSave: vi.fn(),
    }
    await renderAccount(api)
    expect(api.getRpgSave).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Oathbearer')
    const continueButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue')
    expect(continueButton?.disabled).toBe(false)
  })

  it('does not adopt a legacy global save until the player explicitly imports it', async () => {
    const legacy = { ...createInitialState(), playtimeTicks: 91 }
    window.localStorage.setItem(RPG_SAVE_KEY, JSON.stringify(legacy))
    const api = {
      getRpgSave: vi.fn(async () => ({ save: null })),
      putRpgSave: vi.fn(async (body) => ({ save: remoteSave(body.payload), idempotent: false })),
    }
    await renderAccount(api)
    const continueBefore = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue')
    expect(continueBefore?.disabled).toBe(true)
    expect(container.textContent).toContain('will not be attached')

    const importButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Import legacy journey')
    await act(async () => importButton.click())
    expect(api.putRpgSave).toHaveBeenCalledTimes(1)
    expect(api.putRpgSave.mock.calls[0][0]).toMatchObject({ expectedRevision: 0, payload: { playtimeTicks: 91 } })
    const continueAfter = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue')
    expect(continueAfter?.disabled).toBe(false)
  })

  it('requires confirmation before replacing an existing account chronicle', async () => {
    const state = createInitialState()
    const api = {
      getRpgSave: vi.fn(async () => ({ save: remoteSave(state, 2) })),
      putRpgSave: vi.fn(async (body) => ({ save: remoteSave(body.payload, 3), idempotent: false })),
    }
    await renderAccount(api)
    const newStory = [...container.querySelectorAll('button')].find((button) => button.textContent === 'New Story')
    await act(async () => newStory.click())
    expect(container.textContent).toContain('replace the current account chronicle')
    expect(api.putRpgSave).not.toHaveBeenCalled()
    const keep = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Keep current story')
    await act(async () => keep.click())
    expect(container.textContent).not.toContain('replace the current account chronicle')
  })

  it('fails closed on divergent pending progress until an explicit version is chosen', async () => {
    const local = { ...createInitialState(), playtimeTicks: 12 }
    const remote = { ...createInitialState(), playtimeTicks: 20 }
    window.localStorage.setItem(accountSaveCacheKey(17), JSON.stringify({
      cacheVersion: 1,
      accountId: '17',
      payload: local,
      gameSchemaVersion: local.schemaVersion,
      revision: 1,
      pending: true,
      cachedAt: '2026-09-01T00:00:00.000Z',
    }))
    const api = {
      getRpgSave: vi.fn(async () => ({ save: remoteSave(remote, 2) })),
      putRpgSave: vi.fn(),
    }
    await renderAccount(api)
    expect(container.getAttribute('data-testid')).toBeNull()
    expect(container.textContent).toContain('Two chronicles diverged')
    expect(container.textContent).toContain('Nothing will be overwritten until you choose')

    const useCloud = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Use cloud progress')
    await act(async () => useCloud.click())
    expect(container.textContent).toContain('Control Tower — Oathbearer')
    expect(api.putRpgSave).not.toHaveBeenCalled()
  })
})
