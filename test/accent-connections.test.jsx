// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

let resolveAppearance
vi.mock('../src/api/client.js', () => ({
  api: {
    connections: vi.fn(() => Promise.resolve({ providers: [], influence: {} })),
    ouraAccounts: vi.fn(() => Promise.resolve({ accounts: [] })),
    garminAccounts: vi.fn(() => Promise.resolve({ accounts: [] })),
    setAppearance: vi.fn(() => new Promise((resolve) => { resolveAppearance = resolve })),
  },
}))

const { default: Connections } = await import('../src/components/Connections.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let container
let root

afterEach(() => {
  root?.unmount()
  if (container) document.body.removeChild(container)
  root = null
  container = null
  vi.clearAllMocks()
})

it('does not reapply a completed accent save after its account session unmounts', async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const onAccentChange = vi.fn()
  await act(async () => {
    root.render(<Connections refreshKey={0} user={{ email: 'a@example.test' }} sessionKey="account-a" onChanged={() => {}} onLogout={() => {}} accent="cobalt" onAccentChange={onAccentChange} />)
    await Promise.resolve()
    await Promise.resolve()
  })
  const emerald = [...container.querySelectorAll('input[type="radio"]')].find((input) => input.parentElement.textContent.includes('Emerald'))
  await act(async () => emerald.click())
  expect(onAccentChange).toHaveBeenCalledWith('emerald')

  await act(async () => root.unmount())
  root = null
  await act(async () => resolveAppearance({ accent: 'ruby' }))
  expect(onAccentChange).not.toHaveBeenCalledWith('ruby')
})
