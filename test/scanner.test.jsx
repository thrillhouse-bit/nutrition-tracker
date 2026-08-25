// @vitest-environment jsdom
//
// Regression test for a real bug: App.jsx passes Scanner an inline
// `onDetected` handler, so it gets a brand new function identity on every
// App re-render — including one that lands *after* the camera has already
// started (openAdd() fires a concurrent recentFoods() fetch when the scan
// sheet opens; that resolving mid-startup was enough to trigger this in
// production). When Scanner's camera-start effect depended on `onDetected`,
// that re-render tore the live stream down and asked for a brand new one
// before the teardown had finished, and the two decodeFromConstraints calls
// raced to own the same <video> element — reproduced with a real headless
// browser + fake camera: two getUserMedia calls both succeeded, yet the
// video was left with srcObject=null / readyState=0 / videoWidth=0.
// Permission was granted and the stream was live; the page just never
// showed it. This test mocks @zxing/browser so it can force that exact
// interleaving deterministically instead of racing real timing.
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

// Told explicitly rather than left to react-dom's auto-detection, which
// looks for global test-runner markers vitest doesn't set.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const decodeCalls = []
const pendingResolvers = []

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    decodeFromConstraints(constraints, videoEl, callback) {
      return new Promise((resolve, reject) => {
        decodeCalls.push({ constraints, videoEl, callback })
        pendingResolvers.push({ resolve, reject })
      })
    }
  },
}))
vi.mock('@zxing/library', () => ({
  BarcodeFormat: { EAN_13: 1, EAN_8: 2, UPC_A: 3, UPC_E: 4, CODE_128: 5, ITF: 6 },
  DecodeHintType: { POSSIBLE_FORMATS: 1 },
}))

const { default: Scanner } = await import('../src/components/Scanner.jsx')

afterEach(() => {
  decodeCalls.length = 0
  pendingResolvers.length = 0
  vi.restoreAllMocks()
})

describe('Scanner camera lifecycle', () => {
  it('starts the camera exactly once, even when the caller re-renders with a new onDetected before startup finishes', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    // Mirror App.jsx's own pattern: `onDetected` is a fresh inline function
    // on every render, not a useCallback-memoized one.
    await act(async () => {
      root.render(<Scanner onDetected={() => {}} />)
    })
    expect(decodeCalls.length).toBe(1)

    // Simulate an unrelated App-level re-render landing while the camera is
    // still starting (the real trigger is openAdd()'s concurrent
    // recentFoods() fetch, but any App state change does this — the offline
    // banner listeners, a toast dismiss timer, etc).
    await act(async () => {
      root.render(<Scanner onDetected={() => {}} />)
    })

    // Only now let the in-flight decodeFromConstraints call resolve.
    const stop = vi.fn()
    await act(async () => {
      pendingResolvers[0].resolve({ stop })
      // Let Scanner's `await reader.decodeFromConstraints(...)` continuation
      // (which calls setStarting) actually run before act's boundary closes.
      await Promise.resolve()
      await Promise.resolve()
    })

    // The buggy version restarted the camera here: a second
    // decodeFromConstraints call before the first had resolved. Exactly one
    // call is the fix's whole point — the camera's start/stop lifecycle
    // must be tied to Scanner mounting/unmounting, not to the caller's
    // handler identity.
    expect(decodeCalls.length).toBe(1)
    // The stale run's cleanup must not fire against a controls object it
    // was never given (nothing to stop yet when the second render landed).
    expect(stop).not.toHaveBeenCalled()

    act(() => { root.unmount() })
  })

  it('does still restart the camera across a real mount/unmount (Scanner leaving and re-entering the DOM)', async () => {
    // Sibling to the test above: proves the fix didn't just make the effect
    // inert. A genuine unmount (closing the scan sheet) must still stop the
    // old stream, and a fresh mount (reopening it) must start a new one.
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<Scanner onDetected={() => {}} />)
    })
    expect(decodeCalls.length).toBe(1)
    const stop1 = vi.fn()
    await act(async () => {
      pendingResolvers[0].resolve({ stop: stop1 })
    })

    await act(async () => {
      root.render(null) // closes the sheet
    })
    expect(stop1).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.render(<Scanner onDetected={() => {}} />) // reopens it
    })
    expect(decodeCalls.length).toBe(2)

    act(() => { root.unmount() })
  })
})
