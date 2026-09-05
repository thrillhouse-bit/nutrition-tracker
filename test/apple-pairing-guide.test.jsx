// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://body.example"}
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import ApplePairingGuide, { appleExportEndpoint } from '../src/components/ApplePairingGuide.jsx'
import { api } from '../src/api/client.js'
vi.mock('../src/api/client.js', () => ({ api: { appleToken: vi.fn() } }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, container
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove(); vi.clearAllMocks() })
async function render(props = {}) {
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => root.render(<ApplePairingGuide onRefetch={vi.fn()} {...props} />))
}
async function click(text) {
  const button = [...container.querySelectorAll('button')].find(b => b.textContent === text)
  await act(async () => button.click())
}
it('only derives a credential-free HTTPS endpoint from the current origin', () => {
  expect(appleExportEndpoint('https://body.example/foo?token=secret')).toBe('https://body.example/api/apple/health-auto-export')
  expect(appleExportEndpoint('http://localhost:5173')).toBeNull()
})
it('opening never rotates a token and instructions distinguish the two export types', async () => {
  await render()
  expect(api.appleToken).not.toHaveBeenCalled()
  expect(container.textContent).toContain('Create two REST API automations')
  expect(container.textContent).toContain('No data received yet')
  expect(container.textContent).toContain('Workouts')
  expect(container.textContent).toContain('Health Metrics')
})
it('refresh reads server status, does not create credentials or claim successful pairing', async () => {
  const onRefetch = vi.fn().mockResolvedValue()
  await render({ onRefetch })
  await click('Check for received data')
  expect(onRefetch).toHaveBeenCalledOnce()
  expect(api.appleToken).not.toHaveBeenCalled()
  expect(container.querySelector('[data-apple-received]').textContent).toContain('No data received yet')
})
it('requires confirmation, masks the new header and never saves it in browser storage', async () => {
  api.appleToken.mockResolvedValue({ token: 'private-pairing-token' })
  await render()
  await click('Generate pairing token')
  expect(api.appleToken).not.toHaveBeenCalled()
  await click('Create token and replace existing')
  expect(api.appleToken).toHaveBeenCalledOnce()
  const field = container.querySelector('input[type="password"]')
  expect(field.value).toBe('Bearer private-pairing-token')
  expect(localStorage.length).toBe(0)
  expect(sessionStorage.length).toBe(0)
  expect(container.querySelector('[data-apple-received]').textContent).toContain('No data received yet')
  await click('Show')
  expect(field.type).toBe('text')
  await click('Hide')
  expect(field.type).toBe('password')
})
it('token creation failure is actionable and retryable', async () => {
  api.appleToken.mockRejectedValue(new Error('offline'))
  await render()
  await click('Generate pairing token')
  await click('Create token and replace existing')
  expect(container.textContent).toContain('Could not create a token')
  expect(container.querySelector('input[type="password"]')).toBeNull()
})
it('handles refresh failure without losing the guide', async () => {
  await render({ onRefetch: vi.fn().mockRejectedValue(new Error('offline')) })
  await click('Check for received data')
  expect(container.textContent).toContain('Could not check for received data')
})
it('shows persisted receipt and disabled-upload state separately', async () => {
  await render({ enabled: false, lastSyncedAt: '2026-09-04T14:00:00Z' })
  expect(container.querySelector('[data-apple-received]').textContent).not.toContain('No data received yet')
  expect(container.textContent).toContain('currently rejects uploads')
})
