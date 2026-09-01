// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../src/api/client.js', () => ({
  api: {
    legalStatus: vi.fn(() => Promise.resolve({ ready: true, signupEnabled: true })),
    signup: vi.fn(() => Promise.resolve({ user: { id: 7, email: 'person@example.test' } })),
    login: vi.fn(),
  },
}))

const { api } = await import('../src/api/client.js')
const { default: Auth } = await import('../src/components/Auth.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let container

afterEach(() => {
  if (container) document.body.removeChild(container)
  container = null
  vi.clearAllMocks()
})

async function renderAuth(onAuthed = vi.fn()) {
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<Auth onAuthed={onAuthed} />)
    await Promise.resolve()
  })
  return { onAuthed }
}

function button(label) {
  return [...container.querySelectorAll('button')].find((node) => node.textContent.includes(label))
}

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('signup legal consent', () => {
  it('requires an affirmative checkbox and submits that acceptance to the server', async () => {
    const { onAuthed } = await renderAuth()
    await act(async () => button('Create one').click())

    const submit = button('Create account')
    const checkbox = container.querySelector('input[type="checkbox"]')
    expect(checkbox).toBeTruthy()
    expect(submit.disabled).toBe(true)
    expect(container.textContent).toMatch(/agree to the Terms of Service/i)

    const [email, password] = container.querySelectorAll('input:not([type="checkbox"])')
    await act(async () => {
      setInputValue(email, 'person@example.test')
      setInputValue(password, 'testpassword123')
      checkbox.click()
    })
    expect(submit.disabled).toBe(false)

    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(api.signup).toHaveBeenCalledWith('person@example.test', 'testpassword123', true)
    expect(onAuthed).toHaveBeenCalledWith({ id: 7, email: 'person@example.test' })
  })
})
