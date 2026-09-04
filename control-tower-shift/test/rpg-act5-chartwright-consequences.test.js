import { describe, expect, it } from 'vitest'
import {
  ACT5_CHARTWRIGHT_CONSEQUENCES,
  ACT5_CHARTWRIGHT_SOURCE_FLAGS,
  countAct5ChartwrightConsequenceWords,
  selectAct5ChartwrightConsequence,
  validateAct5ChartwrightConsequences,
} from '../src/rpg/act5ChartwrightConsequences.js'

const flagsFor = (model, firstCopy) => ({
  [ACT5_CHARTWRIGHT_SOURCE_FLAGS.model.flagId]: model,
  [ACT5_CHARTWRIGHT_SOURCE_FLAGS.firstCopy.flagId]: firstCopy,
})

describe('Act V Chartwright consequence gates', () => {
  it('requires each exact Act II publication pair', () => {
    expect(selectAct5ChartwrightConsequence(flagsFor('public-ledge', 'ledge')).id)
      .toBe('act5-chartwright-witness-public-ledge')
    expect(selectAct5ChartwrightConsequence(flagsFor('stewarded-berth', 'berth')).id)
      .toBe('act5-chartwright-witness-stewarded-berth')
  })

  it.each([
    [undefined, undefined],
    ['public-ledge', undefined],
    ['stewarded-berth', undefined],
    ['public-ledge', 'unposted'],
    ['stewarded-berth', 'unposted'],
    ['public-ledge', 'berth'],
    ['stewarded-berth', 'ledge'],
    ['unknown', 'ledge'],
    [undefined, 'ledge'],
  ])('uses the neutral fallback for %s / %s', (model, firstCopy) => {
    const selected = selectAct5ChartwrightConsequence(flagsFor(model, firstCopy))
    expect(selected.id).toBe('act5-chartwright-witness-open-register')
    expect(selected.fallback).toBe(true)
  })

  it('keeps the contract validated, frozen, and inside its display-word budget', () => {
    const report = validateAct5ChartwrightConsequences()
    expect(report).toMatchObject({ valid: true, issues: [] })
    expect(countAct5ChartwrightConsequenceWords()).toBeLessThanOrEqual(900)
    expect(Object.isFrozen(ACT5_CHARTWRIGHT_CONSEQUENCES)).toBe(true)
  })
})
