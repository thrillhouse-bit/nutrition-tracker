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

describe('SegmentBar gradient fill', () => {
  it('shades filled segments from light to dark cobalt by position in the full bar', () => {
    const el = render(<SegmentBar total={5} filled={3} />)
    const segments = el.querySelectorAll(':scope > div > div')
    expect(segments.length).toBe(5)

    // First filled segment (index 0) should be the lightest cobalt.
    expect(segments[0].style.backgroundColor).toBe('rgb(233, 236, 249)') // #e9ecf9
    // Each subsequent filled segment should be strictly darker (lower total
    // luminance) than the one before it — a real gradient, not a repeated color.
    const luminance = (rgb) => {
      const [r, g, b] = rgb.match(/\d+/g).map(Number)
      return r + g + b
    }
    expect(luminance(segments[1].style.backgroundColor)).toBeLessThan(luminance(segments[0].style.backgroundColor))
    expect(luminance(segments[2].style.backgroundColor)).toBeLessThan(luminance(segments[1].style.backgroundColor))
  })

  it('leaves unfilled segments as the plain track color, not part of the gradient', () => {
    const el = render(<SegmentBar total={5} filled={2} />)
    const segments = el.querySelectorAll(':scope > div > div')
    expect(segments[2].className).toContain('bg-track')
    expect(segments[3].className).toContain('bg-track')
    expect(segments[4].className).toContain('bg-track')
    // Track segments carry no inline gradient color.
    expect(segments[2].style.backgroundColor).toBe('')
  })

  it('a fully-filled bar ends at the darkest shade (cobalt-ink)', () => {
    const el = render(<SegmentBar total={4} filled={4} />)
    const segments = el.querySelectorAll(':scope > div > div')
    expect(segments[3].style.backgroundColor).toBe('rgb(22, 40, 155)') // #16289b
  })

  it('a single-segment bar does not divide by zero and still fills with the light end', () => {
    const el = render(<SegmentBar total={1} filled={1} />)
    const segments = el.querySelectorAll(':scope > div > div')
    expect(segments[0].style.backgroundColor).toBe('rgb(233, 236, 249)')
  })
})
