// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../src/api/client.js', () => ({
  api: {
    legalStatus: vi.fn(() => Promise.resolve({ ready: true, signupEnabled: true, inviteRequired: true })),
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
  window.history.replaceState({}, '', '/')
  vi.clearAllMocks()
})

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

it('prefills an invite from the URL, immediately removes it from history, and still requires consent and submission', async () => {
  window.history.replaceState({}, '', '/#invite=AlphaInvite01_abcdefghijklmnop')
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<Auth onAuthed={vi.fn()} />)
    await Promise.resolve()
  })

  const invite = [...container.querySelectorAll('input')].find((input) => input.closest('label')?.textContent.includes('Invitation code'))
  const submit = [...container.querySelectorAll('button')].find((node) => node.textContent.includes('Create account'))
  expect(invite.value).toBe('AlphaInvite01_abcdefghijklmnop')
  expect(window.location.search).toBe('')
  expect(window.location.hash).toBe('')
  expect(submit.disabled).toBe(true)
  expect(api.signup).not.toHaveBeenCalled()

  const email = container.querySelector('input[type="email"]')
  const password = [...container.querySelectorAll('input')].find((input) => input.closest('label')?.textContent.includes('Password'))
  const consent = container.querySelector('input[type="checkbox"]')
  await act(async () => {
    setInputValue(email, 'person@example.test')
    setInputValue(password, 'testpassword123')
    consent.click()
  })
  expect(submit.disabled).toBe(false)
  await act(async () => {
    container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await Promise.resolve()
  })
  expect(api.signup).toHaveBeenCalledWith('person@example.test', 'testpassword123', true, 'AlphaInvite01_abcdefghijklmnop')
})

it('does not prefill malformed invite fragments', async () => {
  window.history.replaceState({}, '', '/#invite=not%20a%20code')
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<Auth onAuthed={vi.fn()} />)
    await Promise.resolve()
  })

  expect(container.textContent).toContain('Sign in')
  expect(window.location.hash).toBe('#invite=not%20a%20code')
})

it('allows typing an invitation one character at a time and rejects an incomplete code on submit', async () => {
  window.history.replaceState({}, '', '/#invite=AlphaInvite01_abcdefghijklmnop')
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<Auth onAuthed={vi.fn()} />); await Promise.resolve() })
  const invite = [...container.querySelectorAll('input')].find((input) => input.closest('label')?.textContent.includes('Invitation code'))
  await act(async () => setInputValue(invite, ''))
  const code = 'DifferentInvite_abcdefghijklmnop'
  for (const character of code) {
    await act(async () => setInputValue(invite, invite.value + character))
  }
  expect(invite.value).toBe(code)
  await act(async () => {
    setInputValue(invite, 'short')
    setInputValue(container.querySelector('input[type="email"]'), 'person@example.test')
    setInputValue(container.querySelector('input[type="password"]'), 'testpassword123')
    container.querySelector('input[type="checkbox"]').click()
  })
  await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  expect(api.signup).not.toHaveBeenCalled()
  expect(container.textContent).toContain('Enter a valid invitation code')
})

it('never accepts an invite from a query string', async () => {
  window.history.replaceState({}, '', '/?invite=AlphaInvite01_abcdefghijklmnop')
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<Auth onAuthed={vi.fn()} />); await Promise.resolve() })
  expect(container.textContent).toContain('Sign in')
  expect(container.textContent).not.toContain('Invitation code')
  expect(window.location.search).toBe('?invite=AlphaInvite01_abcdefghijklmnop')
})
