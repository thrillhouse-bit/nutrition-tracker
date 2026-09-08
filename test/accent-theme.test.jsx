// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ACCENT_PALETTES, applyAccentTheme } from '../src/lib/accentTheme.js'

const root = path.resolve(import.meta.dirname, '..')

describe('account accent theme adapter', () => {
  it('offers the complete named palette and migrates legacy cobalt to sapphire', () => {
    expect(Object.keys(ACCENT_PALETTES)).toEqual(['sapphire', 'emerald', 'ruby', 'silver', 'gold', 'crystal', 'diamond', 'pearl'])
    expect(applyAccentTheme('emerald')).toBe('emerald')
    expect(document.documentElement.dataset.accent).toBe('emerald')
    expect(document.documentElement.style.getPropertyValue('--color-cobalt')).toBe('#087a5a')
    expect(document.documentElement.style.getPropertyValue('--color-progress-end')).toBe('#056247')
    expect(document.documentElement.style.getPropertyValue('--color-alert')).toBe('')
    expect(applyAccentTheme('cobalt')).toBe('sapphire')
    expect(document.documentElement.dataset.accent).toBe('sapphire')
    expect(applyAccentTheme('not-a-palette')).toBe('sapphire')
    expect(document.documentElement.style.getPropertyValue('--color-cobalt')).toBe('#1f35c4')
    expect(document.documentElement.style.getPropertyValue('--color-progress-start')).toBe('#e9ecf9')
    expect(document.documentElement.style.getPropertyValue('--color-cobalt')).not.toContain('var(--accent-')
  })

  it('keeps shared progress and SVG consumers on runtime accent tokens', () => {
    const ui = fs.readFileSync(path.join(root, 'src/components/ui.jsx'), 'utf8')
    const insights = fs.readFileSync(path.join(root, 'src/components/Insights.jsx'), 'utf8')
    expect(ui).toContain('var(--color-progress-start)')
    expect(ui).toContain('stroke="var(--color-cobalt)"')
    expect(insights).toContain('var(--color-cobalt)')
    expect(insights).not.toContain('#1F35C4')
  })
})
