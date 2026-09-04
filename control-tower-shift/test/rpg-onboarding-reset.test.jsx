// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import ControlTowerRPG from '../src/ControlTowerRPG.jsx'
import { createInitialState } from '../src/rpg/state.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const button = (label) => [...container.querySelectorAll('button')]
  .find((candidate) => candidate.textContent === label)

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  }
  expect(predicate()).toBe(true)
}

async function mount(api) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(
    <ControlTowerRPG
      accountUser={{ id: 71, email: 'fresh@example.test' }}
      accountSaveApi={api}
      accountStorage={window.localStorage}
    />,
  ))
  await waitFor(() => Boolean(button('New Story')))
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  container = root = null
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('account new-story onboarding', () => {
  it('keeps the required Thessa world target visible after replacing and reloading an account chronicle', async () => {
    let remote = {
      payload: { ...createInitialState(), playtimeTicks: 99 },
      revision: 4,
      gameSchemaVersion: createInitialState().schemaVersion,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:01.000Z',
    }
    const api = {
      getRpgSave: vi.fn(async () => ({ save: remote })),
      putRpgSave: vi.fn(async ({ payload }) => {
        remote = { ...remote, payload, revision: remote.revision + 1 }
        return { save: remote, idempotent: false }
      }),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    await mount(api)
    await act(async () => button('New Story').click())
    expect(container.textContent).toContain('replace the current account chronicle')
    await act(async () => button('Replace with a new story').click())
    await waitFor(() => container.textContent.includes('Talk to Thessa'))
    expect(container.querySelector('[aria-label="Talk to Thessa"]')).not.toBeNull()
    await waitFor(() => api.putRpgSave.mock.calls.length === 1)

    await act(async () => root.unmount())
    container.remove()
    container = root = null
    await mount(api)
    await act(async () => button('Continue').click())
    await waitFor(() => container.textContent.includes('Talk to Thessa'))
    expect(container.querySelector('[aria-label="Talk to Thessa"]')).not.toBeNull()
  })
})
