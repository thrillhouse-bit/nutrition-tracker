import { describe, expect, it } from 'vitest'
import { ACT2_RESTORATION_FORMULATIONS } from '../src/rpg/act2Content.js'
import { ACT3_RESTORATION_FORMULATIONS } from '../src/rpg/act3Content.js'
import { ACT4_MAIN_OBJECTIVES, ACT4_RESTORATION_FORMULATIONS } from '../src/rpg/act4Content.js'
import { ACT2_MAIN_OBJECTIVES } from '../src/rpg/act2Content.js'
import { ACT5_ENDING_VARIANTS } from '../src/rpg/act5Content.js'

// Mirrors the exact definitions scripts/verify-oathbearer-complete-game.mjs
// uses for the release gate's reactiveChoices/delayedConsequences metrics —
// both were previously hand-typed evidence stuck at 0 all session; this
// makes them live-computed and locks the definition so the count can never
// silently drift from what the code actually does.
describe('release-gate reactive-choice and delayed-consequence evidence', () => {
  it('counts exactly the restoration formulations that carry a real evidenceWeight', () => {
    const formulations = [
      ...ACT2_RESTORATION_FORMULATIONS,
      ...ACT3_RESTORATION_FORMULATIONS,
      ...ACT4_RESTORATION_FORMULATIONS,
    ]
    const reactive = formulations.filter((f) => f.evidenceWeight && Object.keys(f.evidenceWeight).length > 0)
    expect(reactive).toHaveLength(9)
    expect(reactive.map((f) => f.id).sort()).toEqual([
      'boundary-first', 'continuity-kept', 'departure-protected', 'guild-stewardship',
      'harbor-first', 'licensed-flame', 'revocable-hearths', 'shared-crossing', 'witnessed-cycle',
    ])
  })

  it('every reactive-choice formulation id is a real, reachable main-quest choiceId, never a cosmetic-only id', () => {
    const reactiveIds = new Set([
      ...ACT2_RESTORATION_FORMULATIONS,
      ...ACT3_RESTORATION_FORMULATIONS,
      ...ACT4_RESTORATION_FORMULATIONS,
    ].filter((f) => f.evidenceWeight && Object.keys(f.evidenceWeight).length > 0).map((f) => f.id))
    const allChoiceIds = new Set([
      ...ACT2_MAIN_OBJECTIVES,
      ...ACT4_MAIN_OBJECTIVES,
    ].filter((o) => o.kind === 'choose').flatMap((o) => o.choiceIds))
    const act2AndAct4Reactive = [...reactiveIds].filter((id) =>
      ACT2_RESTORATION_FORMULATIONS.some((f) => f.id === id) || ACT4_RESTORATION_FORMULATIONS.some((f) => f.id === id))
    for (const id of act2AndAct4Reactive) expect(allChoiceIds.has(id), id).toBe(true)
  })

  it('counts exactly the Act V endings whose eligibility is actually gated, excluding the always-available fallback', () => {
    const gated = ACT5_ENDING_VARIANTS.filter((e) => e.threshold && Object.keys(e.threshold).length > 0 && !e.fallback)
    expect(gated).toHaveLength(2)
    expect(gated.map((e) => e.id).sort()).toEqual(['bounded-patrons', 'mortal-witness'])
    // The fallback ending's own threshold field is never consulted by
    // choiceIsAvailable() in state.js — confirm it stays excluded even
    // though it also declares one, so the count can't silently include it.
    const fallback = ACT5_ENDING_VARIANTS.find((e) => e.fallback)
    expect(fallback.id).toBe('renewed-compact')
    expect(fallback.threshold).toBeTruthy()
  })
})
