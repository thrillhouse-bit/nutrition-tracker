import { describe, expect, it } from 'vitest'
import { RECIPES } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import {
  REGISTERED_CONVERSATIONS,
  REGISTERED_ENCOUNTERS,
  REGISTERED_MAPS,
  REGISTERED_QUESTS,
} from '../src/rpg/registry.js'

function issueReferences(report, code) {
  return report.issues
    .filter((entry) => entry.code === code)
    .map((entry) => entry.reference)
}

describe('complete Oathbearer content integrity report', () => {
  it('inventories every canonical registry and world-system placement', () => {
    const report = validateRPGContent()
    expect(report.inventory.counts).toMatchObject({
      maps: Object.keys(REGISTERED_MAPS).length,
      quests: Object.keys(REGISTERED_QUESTS).length,
      conversations: Object.keys(REGISTERED_CONVERSATIONS).length,
      encounters: Object.keys(REGISTERED_ENCOUNTERS).length,
      recipes: RECIPES.length,
      resources: 10,
      shops: 5,
      shopPlacements: 5,
      stations: 9,
      stationPlacements: 9,
      banks: 1,
    })
    expect(report.inventory.resources.map((entry) => entry.id)).toEqual([
      'beacon-overlook:copper-seam',
      'beacon-overlook:olive-tree',
      'beacon-overlook:wild-thyme',
      'bronze-foundry:foundry-charred-ember',
      'nereid-caves:nereid-tin-vein',
      'nyx-foothold:nyx-laurel',
      'olive-road:shore-fishing',
      'slag-road:slag-road-cedar',
      'storm-anchorage:anchorage-tuna-run',
      'winter-orchard:orchard-cypress',
    ])
  })

  it('is byte-for-byte deterministic and sorts every issue canonically', () => {
    const first = validateRPGContent()
    const second = validateRPGContent()
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(first.issues).toEqual([...first.issues].sort((left, right) => (
      ({ error: 0, warning: 1 }[left.severity] - ({ error: 0, warning: 1 }[right.severity]))
      || left.code.localeCompare(right.code)
      || left.path.localeCompare(right.path)
      || String(left.reference ?? '').localeCompare(String(right.reference ?? ''))
      || left.message.localeCompare(right.message)
    )))
    expect(Object.keys(first.summary.byCode)).toEqual(Object.keys(first.summary.byCode).sort())
  })

  it('resolves every authored conversation registration', () => {
    const report = validateRPGContent()
    const missing = issueReferences(report, 'MISSING_CONVERSATION')
    expect(missing).toEqual([])
  })

  it('closes every recipe ingredient through a legitimate source or reachable recipe', () => {
    const report = validateRPGContent()
    const blockedPaths = report.issues
      .filter((entry) => entry.code === 'UNOBTAINABLE_RECIPE_INGREDIENT')
      .map((entry) => `${entry.path}:${entry.reference}`)
    expect(blockedPaths).toEqual([])
    expect(report.obtainableItemIds).toContain('olive-plank')
    expect(report.obtainableItemIds).toContain('cypress-helm')
  })

  it('resolves crafted outputs, stations, merchants, and banks into the physical economy', () => {
    const report = validateRPGContent()
    const inert = issueReferences(report, 'INERT_CRAFTED_OUTPUT')
    expect(inert).toEqual([])

    expect(issueReferences(report, 'UNPLACED_STATION')).toEqual([])
    expect(issueReferences(report, 'UNPLACED_SHOP')).toEqual([])
    expect(issueReferences(report, 'UNPLACED_BANK')).toEqual([])
  })

  it('finds no broken map, spawn, encounter, quest-owner, item, or skill references in accepted content', () => {
    const report = validateRPGContent()
    for (const code of [
      'UNRESOLVED_MAP',
      'UNRESOLVED_SPAWN',
      'UNRESOLVED_ENCOUNTER',
      'UNRESOLVED_QUEST',
      'UNRESOLVED_ITEM',
      'UNRESOLVED_SKILL',
      'UNRESOLVED_SHOP',
      'UNRESOLVED_COMBAT_LEVEL',
      'UNRESOLVED_CONVERSATION_NODE',
    ]) expect(issueReferences(report, code), code).toEqual([])
    expect(report.summary.total).toBe(report.summary.errors + report.summary.warnings)
  })
})
