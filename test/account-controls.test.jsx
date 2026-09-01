// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../src/api/client.js', () => ({
  api: {
    exportAccountData: vi.fn(),
    deleteAccount: vi.fn(),
  },
}))

const { api } = await import('../src/api/client.js')
const { AccountControls } = await import('../src/components/Connections.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  container = null
  root = null
  vi.clearAllMocks()
})

async function renderAccount(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <AccountControls
        user={{ id: 7, email: 'person@example.com' }}
        onLogout={() => {}}
        onAccountDeleted={() => {}}
        {...props}
      />,
    )
  })
  return container
}

function button(label) {
  return [...container.querySelectorAll('button')].find((node) => node.textContent.trim() === label)
}

async function setInput(input, value) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('AccountControls', () => {
  it('keeps permanent deletion gated behind password + typed email and waits for server success', async () => {
    const onAccountDeleted = vi.fn()
    api.deleteAccount.mockResolvedValue(null)
    await renderAccount({ onAccountDeleted })

    await act(async () => button('Delete account').click())
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    const finalButton = button('Delete account forever')
    expect(finalButton.disabled).toBe(true)

    const [password, confirmation] = container.querySelectorAll('input')
    expect(password.type).toBe('password')
    expect(password.autocomplete).toBe('current-password')
    await setInput(password, 'correct-password')
    await setInput(confirmation, 'person@example.com')
    expect(finalButton.disabled).toBe(false)

    await act(async () => finalButton.click())
    expect(api.deleteAccount).toHaveBeenCalledWith('correct-password', 'person@example.com')
    expect(onAccountDeleted).toHaveBeenCalledTimes(1)
  })

  it('keeps the sheet open after a server failure and clears the sensitive password', async () => {
    api.deleteAccount.mockRejectedValue(new Error('Password is incorrect.'))
    await renderAccount()
    await act(async () => button('Delete account').click())
    const [password, confirmation] = container.querySelectorAll('input')
    await setInput(password, 'wrong-password')
    await setInput(confirmation, 'person@example.com')
    await act(async () => button('Delete account forever').click())

    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(container.textContent).toContain('Password is incorrect.')
    expect(password.value).toBe('')
  })

  it('downloads a formatted JSON export and revokes the object URL', async () => {
    api.exportAccountData.mockResolvedValue({ schema_version: 1, account: { email: 'person@example.com' } })
    const createObjectURL = vi.fn(() => 'blob:export')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await renderAccount()

    await act(async () => button('Download my data').click())
    expect(api.exportAccountData).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:export')
    expect(container.textContent).toContain('Your export was downloaded.')
    click.mockRestore()
  })
})
