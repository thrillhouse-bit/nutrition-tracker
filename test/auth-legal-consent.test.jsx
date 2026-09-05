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
    startPasswordRecovery: vi.fn(() => Promise.resolve({ continueUrl: '/api/auth/recovery/oura' })),
    resetPassword: vi.fn(() => Promise.resolve({ user: { id: 7, email: 'person@example.test' } })),
    acceptCurrentLegal: vi.fn(() => Promise.resolve({ user: { id: 7, email: 'person@example.test', legalAcceptanceRequired: false } })),
  },
}))

const { api } = await import('../src/api/client.js')
const { default: Auth, LegalReconsent } = await import('../src/components/Auth.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let container

afterEach(() => {
  if (container) document.body.removeChild(container)
  container = null
  vi.clearAllMocks()
  window.history.replaceState({}, '', '/')
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
    expect(api.signup).toHaveBeenCalledWith('person@example.test', 'testpassword123', true, undefined)
    expect(onAuthed).toHaveBeenCalledWith({ id: 7, email: 'person@example.test' })
  })

  it('shows and requires an accessible invitation field only when the server requires one', async () => {
    api.legalStatus.mockResolvedValueOnce({ ready: true, signupEnabled: true, inviteRequired: true })
    await renderAuth()
    await act(async () => button('Create one').click())

    const invite = [...container.querySelectorAll('input')].find((input) => input.closest('label')?.textContent.includes('Invitation code'))
    expect(invite).toBeTruthy()
    expect(invite.required).toBe(true)
    expect(invite.autocomplete).toBe('one-time-code')

    const email = container.querySelector('input[type="email"]')
    const password = [...container.querySelectorAll('input')].find((input) => input.closest('label')?.textContent.includes('Password'))
    const checkbox = container.querySelector('input[type="checkbox"]')
    await act(async () => {
      setInputValue(email, 'alpha@example.test')
      setInputValue(password, 'testpassword123')
      setInputValue(invite, 'AlphaInvite01_abcdefghijklmnop')
      checkbox.click()
    })
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(api.signup).toHaveBeenCalledWith('alpha@example.test', 'testpassword123', true, 'AlphaInvite01_abcdefghijklmnop')
    expect(invite.type).toBe('password')
    await act(async () => button('Show').click())
    expect(invite.type).toBe('text')
    expect(button('Hide').getAttribute('aria-label')).toBe('Hide invitation code')
  })
})

describe('existing-account legal re-consent', () => {
  it('blocks continuation until affirmative acknowledgement while preserving document links and sign-out', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onAccepted = vi.fn()
    const onLogout = vi.fn()
    await act(async () => {
      root.render(<LegalReconsent user={{ email: 'person@example.test' }} onAccepted={onAccepted} onLogout={onLogout} />)
    })

    expect(container.textContent).toMatch(/person@example\.test/)
    expect([...container.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual(expect.arrayContaining(['/terms', '/privacy']))
    const submit = button('Agree and continue')
    expect(submit.disabled).toBe(true)
    await act(async () => container.querySelector('input[type="checkbox"]').click())
    expect(submit.disabled).toBe(false)

    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(api.acceptCurrentLegal).toHaveBeenCalledOnce()
    expect(onAccepted).toHaveBeenCalledWith({ id: 7, email: 'person@example.test', legalAcceptanceRequired: false })

    await act(async () => button('Sign out').click())
    expect(onLogout).toHaveBeenCalledOnce()
  })
})

describe('password recovery', () => {
  it('offers recovery from sign in and shows the Oura identity explanation', async () => {
    await renderAuth()
    await act(async () => button('Forgot password?').click())
    expect(container.textContent).toContain('Recover your account')
    expect(container.textContent).toContain('Oura account already linked')
    expect(container.querySelector('input[type="password"]')).toBeNull()
    expect(button('Continue with Oura')).toBeTruthy()
  })

  it('renders the one-use reset state from the callback marker, removes it from history, and submits matching passwords', async () => {
    window.history.replaceState({}, '', '/?recovery=ready')
    const onAuthed = vi.fn()
    await renderAuth(onAuthed)
    expect(window.location.search).toBe('')
    expect(container.textContent).toContain('Choose a new password')
    const passwords = container.querySelectorAll('input[autocomplete="new-password"]')
    expect(passwords).toHaveLength(2)
    await act(async () => {
      setInputValue(passwords[0], 'new-password-123')
      setInputValue(passwords[1], 'new-password-123')
    })
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(api.resetPassword).toHaveBeenCalledWith('new-password-123', 'new-password-123')
    expect(onAuthed).toHaveBeenCalledWith({ id: 7, email: 'person@example.test' })
  })

  it('shows a generic callback failure, cleans the URL, and blocks mismatched passwords client-side', async () => {
    window.history.replaceState({}, '', '/?recovery=failed')
    await renderAuth()
    expect(window.location.search).toBe('')
    expect(container.textContent).toContain('could not verify a linked Body Current account')

    await act(async () => button('Back to sign in').click())
    window.history.replaceState({}, '', '/?recovery=ready')
    if (container) document.body.removeChild(container)
    container = null
    await renderAuth()
    const passwords = container.querySelectorAll('input[autocomplete="new-password"]')
    await act(async () => {
      setInputValue(passwords[0], 'new-password-123')
      setInputValue(passwords[1], 'different-pass-123')
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(container.textContent).toContain('Passwords do not match')
    expect(api.resetPassword).not.toHaveBeenCalled()
  })
})
