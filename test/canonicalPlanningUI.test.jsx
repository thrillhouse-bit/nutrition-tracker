// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../src/api/client.js', () => ({
  api: {
    getAfpProfile: vi.fn(() => Promise.resolve({ profile: { units_pref: 'imperial' } })),
    setAfpProfile: vi.fn(() => Promise.resolve({ ready: true })),
  },
}))

vi.mock('../src/components/AdaptiveFuelPlan.jsx', async (importOriginal) => {
  const original = await importOriginal()
  return { ...original, default: () => <div>Canonical AFP panel</div> }
})

const { default: CanonicalPlan } = await import('../src/components/CanonicalPlan.jsx')
const { default: Onboarding } = await import('../src/components/Onboarding.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let container

afterEach(() => {
  if (container) document.body.removeChild(container)
  container = null
  vi.clearAllMocks()
})

async function render(node) {
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(node) })
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  return container
}

describe('one credible daily planning loop', () => {
  it('Plan mounts only the canonical AFP panel, with no Quick targets product', async () => {
    const el = await render(<CanonicalPlan date={new Date('2026-08-31T12:00:00Z')} refreshKey={0} onChanged={() => {}} />)
    expect(el.textContent).toContain('Plan')
    expect(el.textContent).toContain('Canonical AFP panel')
    expect(el.textContent).not.toContain('Quick targets')
  })

  it('onboarding goes directly to the canonical profile with no calculator/manual fork', async () => {
    const el = await render(<Onboarding onDone={() => {}} />)
    expect(el.textContent).toContain('Build your daily fuel plan')
    expect(el.textContent).not.toContain('Calculate my targets')
    expect(el.textContent).not.toContain('Enter targets manually')
  })
})
