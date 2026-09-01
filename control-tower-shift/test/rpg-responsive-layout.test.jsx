// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import rpgSource from '../src/ControlTowerRPG.jsx?raw'

const presentationCss = readFileSync(resolve(
  process.cwd(),
  process.cwd().endsWith('control-tower-shift')
    ? 'src/rpg/presentation.css'
    : 'control-tower-shift/src/rpg/presentation.css',
), 'utf8')

const PORTRAIT_BASENAMES = [
  'kallias-zeusborn-v1',
  'thessa-cartographer-v1',
  'amonides-keeper-v1',
  'ianthe-namecutter-v1',
  'name-cutter-captain-v1',
]

describe('responsive portrait asset contract', () => {
  it('imports both accepted WebP widths for all five portraits and no portrait PNG', () => {
    for (const basename of PORTRAIT_BASENAMES) {
      expect(rpgSource).toContain(`./assets/portraits/${basename}-128.webp`)
      expect(rpgSource).toContain(`./assets/portraits/${basename}-256.webp`)
    }
    expect(rpgSource).not.toMatch(/assets\/portraits\/[^'"\n]+\.png/)
    expect(rpgSource).toContain("'name-cutter-captain': PORTRAIT_SOURCES['name-cutter-captain']")
    expect(rpgSource).toContain("if (speakerId === 'name-cutter-captain') return 'Name-Cutter Captain'")
  })

  it('uses small defaults for dialogue and large defaults for title/chapter art', () => {
    expect(rpgSource).toContain('src={portrait.small}')
    expect(rpgSource).toContain('srcSet={portrait.srcSet}')
    expect(rpgSource).toContain('sizes="(min-width: 640px) 118px, 64px"')
    expect(rpgSource).toContain('src={PORTRAIT_SOURCES.kallias.large}')
    expect(rpgSource).toContain('sizes="100vw"')
    expect(rpgSource).toContain('src={PORTRAIT_SOURCES.ianthe.large}')
    expect(rpgSource).toContain('sizes="(min-width: 700px) 240px, calc(100vw - 2rem)"')
  })
})

describe('mobile HUD and safe-area structural contract', () => {
  it('keeps identity, labeled actions, and objective in one wrapping HUD flow', () => {
    expect(rpgSource).toContain('className="rpg-hud" data-testid="rpg-hud"')
    expect(rpgSource).toContain('className="rpg-hud-identity"')
    expect(rpgSource).toContain('className="rpg-hud-actions" aria-label="Story controls"')
    expect(rpgSource).toContain('className="rpg-hud-objective"')
    for (const label of ['Skills', 'Pack', 'Journal', 'Systems', 'Pause']) {
      expect(rpgSource).toMatch(new RegExp(`className="rpg-hud-btn"[^>]*>\\s*${label}\\s*<`))
    }
    expect(presentationCss).toMatch(/@media \(max-width: 480px\)/)
    expect(presentationCss).toMatch(/\.rpg-hud-actions\s*\{[\s\S]*?grid-template-columns: repeat\(auto-fit, minmax\(44px, 1fr\)\)/)
    expect(presentationCss).toMatch(/\.rpg-hud-btn\s*\{[\s\S]*?min-height: 44px/)
    expect(presentationCss).toMatch(/\.rpg-side-panel\s*\{[\s\S]*?top: var\(--rpg-side-panel-top\)/)
  })

  it('centralizes safe-area values and applies them to active shell surfaces', () => {
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      expect(presentationCss).toContain(`--rpg-safe-${edge}: env(safe-area-inset-${edge}, 0px)`)
    }
    expect(presentationCss).toMatch(/\.rpg-hud\s*\{[\s\S]*?var\(--rpg-safe-top\)[\s\S]*?var\(--rpg-safe-right\)[\s\S]*?var\(--rpg-safe-left\)/)
    expect(presentationCss).toMatch(/\.rpg-side-panel\s*\{[\s\S]*?var\(--rpg-safe-right\)[\s\S]*?var\(--rpg-safe-bottom\)/)
    expect(presentationCss).toMatch(/\.rpg-touch-controls\s*\{[\s\S]*?var\(--rpg-safe-right\)[\s\S]*?var\(--rpg-safe-bottom\)[\s\S]*?var\(--rpg-safe-left\)/)
    expect(presentationCss).toMatch(/\.rpg-scroll-overlay\s*\{[\s\S]*?var\(--rpg-safe-top\)[\s\S]*?var\(--rpg-safe-bottom\)/)
  })
})

describe('short-landscape overlay reachability contract', () => {
  it('gives shrine and act transitions the shared top-reachable scroll shell', () => {
    expect(rpgSource).toContain('className="rpg-scroll-overlay rpg-shrine-overlay"')
    expect(rpgSource).toContain('className="rpg-act rpg-scroll-overlay"')
    expect(rpgSource).toContain('className="rpg-panel rpg-cut rpg-shrine-panel')
    expect(rpgSource).toContain('className="rpg-shrine-footer')
    expect(presentationCss).toMatch(/\.rpg-scroll-overlay\s*\{[\s\S]*?align-items: flex-start;[\s\S]*?overflow-y: auto;/)
    expect(presentationCss).toMatch(/\.rpg-scroll-overlay > \.rpg-panel\s*\{[\s\S]*?margin-block: auto;/)
  })

  it('uses an explicit <=480px-height landscape mode with constrained portrait/card composition', () => {
    expect(presentationCss).toContain('@media (max-height: 480px) and (orientation: landscape)')
    expect(presentationCss).toMatch(/\.rpg-scroll-overlay > \.rpg-panel\s*\{ margin-block: 0; \}/)
    expect(presentationCss).toMatch(/\.rpg-shrine-grid\s*\{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \}/)
    expect(presentationCss).toMatch(/\.rpg-act-portrait img\s*\{[\s\S]*?max-height: calc\(100dvh - var\(--rpg-safe-top\) - var\(--rpg-safe-bottom\) - 2rem\)/)
    expect(presentationCss).toContain('@media (min-width: 560px) and (max-height: 480px) and (orientation: landscape)')
  })
})
