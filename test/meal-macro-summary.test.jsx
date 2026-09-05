import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MealMacroSummary from '../src/components/MealMacroSummary.jsx'

const entry = (food, servings_consumed = 1) => ({ food, servings_consumed })
const render = entries => renderToStaticMarkup(<MealMacroSummary entries={entries} />)

describe('meal macro totals', () => {
  it('sums each macro using consumed servings in protein, carbs, fat order', () => {
    const html = render([
      entry({ protein_g: 10, carbs_g: 20, fat_g: 5 }, 1.5),
      entry({ protein_g: 4, carbs_g: 6, fat_g: 2 }, '2'),
    ])
    expect(html).toContain('23 g')
    expect(html).toContain('42 g')
    expect(html).toContain('11.5 g')
    expect(html.indexOf('Protein')).toBeLessThan(html.indexOf('Carbs'))
    expect(html.indexOf('Carbs')).toBeLessThan(html.indexOf('Fat'))
  })

  it('distinguishes unknown macros from recorded zero', () => {
    const html = render([entry({ protein_g: null, carbs_g: 0 })])
    expect(html).toContain('0 g')
    expect(html.match(/Not recorded/g)).toHaveLength(2)
    expect(html).not.toContain('known')
  })

  it('labels partial sums without hiding known nutrients in calorie-incomplete food', () => {
    const html = render([
      entry({ calories: null, protein_g: 12, carbs_g: null, fat_g: 0 }),
      entry({ protein_g: null, carbs_g: 30, fat_g: 2 }),
    ])
    expect(html).toContain('12 g known')
    expect(html).toContain('30 g known')
    expect(html).toContain('2 g')
    expect(html).not.toContain('>2 g known<')
  })

  it('does not manufacture totals for an empty meal', () => {
    const html = render([])
    expect(html.match(/Not recorded/g)).toHaveLength(3)
    expect(html).not.toContain('0 g')
  })
})
