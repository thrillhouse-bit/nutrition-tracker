// @vitest-environment jsdom
//
// SegmentBar's filled segments used to be a flat bg-ink color (a solid dark
// tone). Owner asked (26 Aug 2026) for the "Intake so far" bar specifically
// to read as a gradient — light cobalt at the start, darkening toward
// cobalt-ink as intake progresses through the day. SegmentBar is used in
// exactly one place (Today.jsx's "Intake so far" bar), so the change lives
// in the shared primitive rather than a one-off wrapper.
import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { SegmentBar } from '../src/components/ui.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container = null
afterEach(() => {
  if (container) { document.body.removeChild(container); container = null }
})

function render(el) {
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(el))
  return container
}

describe('SegmentBar runtime accent gradient', () => {
  it('uses the palette progress-token gradient for every filled segment', () => {
    const el = render(<SegmentBar total={5} filled={3} />)
    const segments = el.querySelectorAll(':scope > div > div')
    expect(segments.length).toBe(5)

    for (const segment of [...segments].slice(0, 3)) {
      expect(segment.style.backgroundImage).toContain('var(--color-progress-start)')
      expect(segment.style.backgroundImage).toContain('var(--color-progress-mid)')
      expect(segment.style.backgroundImage).toContain('var(--color-progress-end)')
      expect(segment.style.backgroundSize).toBe('500% 100%')
      expect(segment.style.backgroundColor).toBe('')
    }
    expect(segments[0].style.backgroundPosition).toBe('0% 0px')
    expect(segments[2].style.backgroundPosition).toBe('50% 0px')
  })

  it('leaves unfilled segments as the plain track color, not part of the gradient', () => {
    const el = render(<SegmentBar total={5} filled={2} />)
    const segments = el.querySelectorAll(':scope > div > div')
    expect(segments[2].className).toContain('bg-track')
    expect(segments[3].className).toContain('bg-track')
    expect(segments[4].className).toContain('bg-track')
    // Track segments carry no inline gradient or fallback color.
    expect(segments[2].style.backgroundColor).toBe('')
    expect(segments[2].style.backgroundImage).toBe('')
  })

  it('keeps the last filled segment anchored to the palette end token', () => {
    const el = render(<SegmentBar total={4} filled={4} />)
    const segments = el.querySelectorAll(':scope > div > div')
    expect(segments[3].style.backgroundImage).toContain('var(--color-progress-end)')
    expect(segments[3].style.backgroundPosition).toBe('100% 0px')
  })

  it('a single-segment bar does not divide by zero and retains the token gradient', () => {
    const el = render(<SegmentBar total={1} filled={1} />)
    const segments = el.querySelectorAll(':scope > div > div')
    expect(segments[0].style.backgroundImage).toContain('var(--color-progress-start)')
    expect(segments[0].style.backgroundPosition).toBe('0% 0px')
  })
})
