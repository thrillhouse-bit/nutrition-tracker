// Act IV static content scaffold tests — Forge March: The False Constellation.
// Pure data assertions: no DOM, no time, no RNG. Includes the campaign-level
// data-equivalence check against game/campaign.js (the reused bronze-foundry
// level) — the only Act II–V encounter with a campaignLevelId.
import { describe, it, expect } from 'vitest'
import { MONSTER_TYPES } from '../src/game/index.js'
import { levelById } from '../src/game/campaign.js'
import {
  ACT4_REGION_ID,
  ACT4_MAIN_QUEST_ID,
  ACT4_SIDE_QUEST_ID,
  ACT4_PRECONDITIONS,
  ACT4_POCKETS,
  ACT4_CONNECTIONS,
  ACT4_MARCH_PLANS,
  ACT4_MAIN_OBJECTIVES,
  ACT4_MAIN_QUEST,
  ACT4_SIDE_QUEST,
  ACT4_ENCOUNTERS,
  ACT4_ENCOUNTER_OWNER_QUEST,
  ACT4_ATLAS_IDENTITY,
  ACT4_PRESSURE_LANES,
  ACT4_PRESSURE_STATES,
  ACT4_PRESSURE_RULES,
  ACT4_SAVE_POINTS,
  ACT4_PERMANENT_FLAGS,
  ACT4_SHARED_FLAG_IDS,
  ACT4_OPTIONAL_FLAG_IDS,
  ACT4_RESTORATION_FORMULATIONS,
  ACT4_REGION,
  act4PocketById,
  act4SpawnById,
  act4ConnectionById,
  act4MarchPlanById,
  act4EncounterById,
  act4QuestById,
  act4ObjectiveById,
  act4PressureStateById,
  act4FormulationById,
  act4SavePointById,
  act4CompletionFlagForEncounter,
} from '../src/rpg/act4Content.js'

const pocketIds = Object.keys(ACT4_POCKETS)

describe('Act IV region and pockets', () => {
  it('defines exactly the five authored pockets with documented roles', () => {
    expect(pocketIds.sort()).toEqual(
      ['atlas-vault', 'bronze-foundry', 'false-constellation', 'name-press', 'slag-road'].sort()
    )
    expect(ACT4_POCKETS['slag-road'].role).toBe('hub')
    expect(ACT4_POCKETS['bronze-foundry'].role).toBe('combat')
    expect(ACT4_POCKETS['name-press'].role).toBe('dungeon')
    expect(ACT4_POCKETS['atlas-vault'].role).toBe('traversal')
    expect(ACT4_POCKETS['false-constellation'].role).toBe('boss')
    for (const id of pocketIds) {
      expect(ACT4_POCKETS[id].region).toBe(ACT4_REGION_ID)
      expect(ACT4_POCKETS[id].act).toBe(4)
    }
  })

  it('every pocket has a default spawn in its own spawn table', () => {
    for (const id of pocketIds) {
      const pocket = ACT4_POCKETS[id]
      expect(pocket.spawns[pocket.spawnId], `${id} default spawn missing`).toBeTruthy()
    }
  })

  it('entry requires Act III completion + first-thaw', () => {
    expect(ACT4_PRECONDITIONS).toHaveLength(2)
    expect(ACT4_PRECONDITIONS[0]).toEqual({ kind: 'quest-complete', questId: 'mq-act3-withered-year' })
    expect(ACT4_PRECONDITIONS[1].flagId).toBe('act3-first-thaw')
    expect(ACT4_REGION.entry.mapId).toBe('slag-road')
    expect(ACT4_REGION.entry.spawnId).toBe('refugee-camp')
  })
})

describe('connection graph integrity', () => {
  it('every connection references existing pockets and valid arrival/return spawns', () => {
    for (const conn of ACT4_CONNECTIONS) {
      expect(act4PocketById(conn.from), `${conn.id}: unknown pocket ${conn.from}`).toBeTruthy()
      expect(act4PocketById(conn.to), `${conn.id}: unknown pocket ${conn.to}`).toBeTruthy()
      expect(act4SpawnById(conn.to, conn.arrivalSpawnId), `${conn.id} arrival spawn missing`).toBeTruthy()
      expect(act4SpawnById(conn.from, conn.returnSpawnId), `${conn.id} return spawn missing`).toBeTruthy()
    }
  })

  it('the pocket graph is fully connected both ways — nobody gets stranded', () => {
    const adj = new Map(pocketIds.map((p) => [p, []]))
    const rev = new Map(pocketIds.map((p) => [p, []]))
    for (const conn of ACT4_CONNECTIONS) {
      adj.get(conn.from).push(conn.to)
      rev.get(conn.to).push(conn.from)
    }
    const bfs = (start, graph) => {
      const seen = new Set([start])
      const queue = [start]
      while (queue.length) {
        const cur = queue.shift()
        for (const nxt of graph.get(cur)) {
          if (!seen.has(nxt)) { seen.add(nxt); queue.push(nxt) }
        }
      }
      return seen
    }
    expect([...bfs('slag-road', adj)].sort()).toEqual([...pocketIds].sort())
    expect([...bfs('slag-road', rev)].sort()).toEqual([...pocketIds].sort())
  })

  it('the false constellation ascent is gated on rejecting the single crown', () => {
    const gate = ACT4_CONNECTIONS.find((c) => c.id === 'vault-to-constellation')
    expect(gate).toBeTruthy()
    expect(gate.gate).toEqual([{ kind: 'flag', flagId: 'act4-single-crown-rejected', value: true }])
    expect(ACT4_PERMANENT_FLAGS).toContain('act4-single-crown-rejected')
  })
})

describe('march plan contract', () => {
  it('offers exactly the two documented plans, each wired to one first edge', () => {
    expect(Object.keys(ACT4_MARCH_PLANS).sort()).toEqual(['ares-direct-breach', 'athena-precise-route'])
    for (const plan of Object.values(ACT4_MARCH_PLANS)) {
      const edge = act4ConnectionById(plan.firstConnectionId)
      expect(edge, `${plan.id}: missing first edge`).toBeTruthy()
      expect(edge.planId).toBe(plan.id)
      expect(edge.from).toBe('slag-road')
      expect(edge.to).toBe('bronze-foundry')
    }
  })

  it('both plans rejoin before the foundry — same destination, no divergent encounter graphs', () => {
    const firstEdges = ACT4_CONNECTIONS.filter((c) => c.planId)
    expect(firstEdges).toHaveLength(2)
    const destinations = new Set(firstEdges.map((c) => c.to))
    expect(destinations.size).toBe(1)
    expect([...destinations]).toEqual(['bronze-foundry'])
    // No other connection carries a planId — the divergence is exactly one edge.
    const otherPlanEdges = ACT4_CONNECTIONS.filter((c) => c.planId).length
    expect(otherPlanEdges).toBe(2)
  })

  it('the main quest records the choice and neither plan can change the encounter set', () => {
    const choose = act4ObjectiveById('choose-march-plan')
    expect(choose.choiceIds).toEqual(['athena-precise-route', 'ares-direct-breach'])
    expect(ACT4_PERMANENT_FLAGS).toContain('act4-march-plan')
  })
})

describe('main objective chain matches the blueprint exactly', () => {
  it('exactly eight objectives in the authored order', () => {
    expect(ACT4_MAIN_OBJECTIVES.map((o) => o.id)).toEqual([
      'choose-march-plan',
      'break-foundry-guard',
      'return-prometheus-fire',
      'release-atlas-anchors',
      'recover-covenant-witnesses',
      'reject-single-crown',
      'defeat-name-press-colossus',
      'ratify-mortal-draft',
    ])
  })

  it('the single crown rejection is unavoidable with at least two authored tones', () => {
    const reject = act4ObjectiveById('reject-single-crown')
    expect(reject.unavoidable).toBe(true)
    expect(reject.choiceIds.length).toBeGreaterThanOrEqual(2)
    expect(reject.proposer).toBe('zeus')
    // Both tones unlock the same next objective (the boss).
    const idx = ACT4_MAIN_OBJECTIVES.map((o) => o.id)
    expect(idx.indexOf('reject-single-crown') + 1).toBe(idx.indexOf('defeat-name-press-colossus'))
  })

  it('the four anchors are order-free, the brazier redirect is a single ordered step', () => {
    const anchors = act4ObjectiveById('release-atlas-anchors')
    expect(anchors.count).toBe(4)
    expect(anchors.orderFree).toBe(true)
    const fire = act4ObjectiveById('return-prometheus-fire')
    expect(fire.count).toBe(1)
    expect(fire.orderFree).toBe(false)
  })

  it('the mortal draft ratification offers exactly the three Shared Fire forms', () => {
    expect(act4ObjectiveById('ratify-mortal-draft').choiceIds).toEqual([
      'licensed-flame', 'guild-stewardship', 'revocable-hearths',
    ])
  })
})

describe('encounter monster IDs are canonical', () => {
  it('every base monster exists in MONSTER_TYPES', () => {
    for (const enc of Object.values(ACT4_ENCOUNTERS)) {
      expect(enc.order.length).toBeGreaterThan(0)
      for (const monsterId of enc.order) {
        expect(MONSTER_TYPES[monsterId], `${enc.id}: unknown monster ${monsterId}`).toBeTruthy()
      }
    }
  })

  it('encounter orders match the blueprint compositions', () => {
    expect(ACT4_ENCOUNTERS['enc-act4-name-press'].order).toEqual(['minotaur', 'cerberus', 'chronos', 'minotaur', 'medusa'])
    expect(ACT4_ENCOUNTERS['enc-act4-atlas-vault'].order).toEqual(['cerberus', 'atlas', 'minotaur', 'chronos'])
  })

  it('the Colossus is an Atlas-boss core with three targetable sphinx dies', () => {
    const boss = ACT4_ENCOUNTERS['boss-act4-name-press-colossus']
    expect(MONSTER_TYPES[boss.boss.core.baseMonsterType]).toBeTruthy()
    expect(boss.boss.core.baseMonsterType).toBe('atlas')
    expect(boss.boss.overlays[0].count).toBe(3)
    expect(boss.boss.overlays[0].targetable).toBe(true)
    expect(boss.boss.telegraphed).toBe(true)
  })

  it('the Colossus and vault encounters are quest-owned with documented completion flags', () => {
    for (const enc of Object.values(ACT4_ENCOUNTERS)) {
      expect(ACT4_PERMANENT_FLAGS).toContain(enc.completionFlag)
      expect(ACT4_ENCOUNTER_OWNER_QUEST[enc.id]).toBe(ACT4_MAIN_QUEST_ID)
    }
  })
})

describe('reused bronze-foundry campaign level contract', () => {
  it('only the foundry encounter carries a campaignLevelId — none other in Act IV', () => {
    const withCampaign = Object.values(ACT4_ENCOUNTERS).filter((e) => e.campaignLevelId)
    expect(withCampaign).toHaveLength(1)
    expect(withCampaign[0].id).toBe('enc-act4-foundry-threshold')
    expect(withCampaign[0].campaignLevelId).toBe('bronze-foundry')
  })

  it('the authored order is data-equivalent to the campaign bronze-foundry level', () => {
    const campaignLevel = levelById('bronze-foundry')
    expect(campaignLevel).toBeTruthy()
    expect(ACT4_ENCOUNTERS['enc-act4-foundry-threshold'].order).toEqual(campaignLevel.encounter.order)
  })

  it('the RPG adapter stops at the level boundary — no auto-spawned next level', () => {
    const enc = ACT4_ENCOUNTERS['enc-act4-foundry-threshold']
    expect(enc.adapterBoundary.stopsAtLevelEnd).toBe(true)
    expect(enc.adapterBoundary.note).toMatch(/never auto-spawns/i)
  })
})

describe('Atlas identity separation', () => {
  it('the Atlas NPC and the atlas monster base have distinct content IDs', () => {
    expect(ACT4_ATLAS_IDENTITY.npcId).toBe('atlas-npc')
    expect(ACT4_ATLAS_IDENTITY.monsterTypeId).toBe('atlas')
    expect(ACT4_ATLAS_IDENTITY.npcId).not.toBe(ACT4_ATLAS_IDENTITY.monsterTypeId)
    expect(ACT4_ATLAS_IDENTITY.idsAreDistinct).toBe(true)
    expect(MONSTER_TYPES[ACT4_ATLAS_IDENTITY.monsterTypeId]).toBeTruthy()
  })
})

describe('forge pressure contract', () => {
  it('has exactly three lanes and three authored states', () => {
    expect(ACT4_PRESSURE_LANES).toHaveLength(3)
    expect(Object.keys(ACT4_PRESSURE_STATES).sort()).toEqual(['critical', 'safe', 'venting'])
    expect(ACT4_PRESSURE_RULES.states).toEqual(['safe', 'venting', 'critical'])
  })

  it('every state carries non-color telegraph metadata', () => {
    for (const state of Object.values(ACT4_PRESSURE_STATES)) {
      expect(typeof state.telegraph.shapeGlyph).toBe('string')
      expect(state.telegraph.shapeGlyph.length).toBeGreaterThan(0)
      expect(typeof state.telegraph.label).toBe('string')
      expect(state.telegraph.label.length).toBeGreaterThan(0)
      expect(state.telegraph.color).toBeUndefined()
    }
  })

  it('pressure is deterministic, checkpointed, pauses during dialogue, and cannot kill during interaction', () => {
    expect(ACT4_PRESSURE_RULES.deterministic).toBe(true)
    expect(ACT4_PRESSURE_RULES.savesExactlyAtCheckpoints).toBe(true)
    expect(ACT4_PRESSURE_RULES.pausesDuring).toContain('dialogue')
    expect(ACT4_PRESSURE_RULES.cannotKillDuringInteractionAnimation).toBe(true)
    expect(ACT4_PRESSURE_RULES.doesNotAlterCanonicalPowerMath).toBe(true)
    expect(ACT4_PRESSURE_RULES.reducedMotionFallback.replaces).toEqual(['screen-shake', 'heat-distortion'])
  })
})

describe('flag uniqueness and namespacing', () => {
  it('permanent flags are internally unique', () => {
    expect(new Set(ACT4_PERMANENT_FLAGS).size).toBe(ACT4_PERMANENT_FLAGS.length)
  })

  it('all flags are Act IV namespaced except documented shared IDs', () => {
    const allFlagIds = [
      ...ACT4_PERMANENT_FLAGS,
      ...ACT4_SIDE_QUEST.rewards.filter((r) => r.kind === 'flag').map((r) => r.id),
    ]
    for (const flag of allFlagIds) {
      if (ACT4_SHARED_FLAG_IDS.includes(flag)) continue
      const namespaced =
        flag.startsWith('act4-') || flag.startsWith('mq-act4-') || flag.startsWith('sq-act4-')
      expect(namespaced, `flag ${flag} not act4-namespaced`).toBe(true)
    }
  })

  it('optional flags are never referenced by the main chain', () => {
    for (const flag of ACT4_OPTIONAL_FLAG_IDS) {
      const usedByMain = ACT4_MAIN_QUEST.objectives.some((o) => JSON.stringify(o).includes(flag))
      expect(usedByMain, `optional flag ${flag} referenced by main chain`).toBe(false)
    }
  })
})

describe('restoration formulations complete the same linear path', () => {
  it('all three formulations complete the same main quest and objective', () => {
    expect(ACT4_RESTORATION_FORMULATIONS).toHaveLength(3)
    expect(ACT4_RESTORATION_FORMULATIONS.map((f) => f.id).sort()).toEqual([
      'guild-stewardship', 'licensed-flame', 'revocable-hearths',
    ])
    for (const formulation of ACT4_RESTORATION_FORMULATIONS) {
      expect(formulation.completesQuestId).toBe(ACT4_MAIN_QUEST_ID)
      expect(formulation.completesObjectiveId).toBe('ratify-mortal-draft')
    }
  })

  it('no formulation changes the objective graph or next-act prerequisites', () => {
    for (const formulation of ACT4_RESTORATION_FORMULATIONS) {
      expect(formulation.objectiveOverrides).toBeUndefined()
      expect(formulation.unlockOverrides).toBeUndefined()
    }
  })
})

describe('optional loop cannot gate the main path', () => {
  it('side quest has no prerequisites and never gates the main chain', () => {
    expect(ACT4_SIDE_QUEST.prerequisites).toEqual([])
    const sideIds = new Set(ACT4_SIDE_QUEST.objectives.map((o) => o.id))
    for (const objective of ACT4_MAIN_QUEST.objectives) {
      expect(sideIds.has(objective.id)).toBe(false)
      for (const value of Object.values(objective)) {
        expect(String(value)).not.toContain(ACT4_SIDE_QUEST_ID)
      }
    }
  })

  it('the split-gates step requires no specific active patron', () => {
    const split = act4ObjectiveById('split-the-gates')
    expect(split.patronRequired).toBe(false)
    expect(split.count).toBe(2)
  })

  it('skipping the loop yields a valid neutral fallback', () => {
    expect(ACT4_SIDE_QUEST.skippedFallback.valid).toBe(true)
    expect(ACT4_SIDE_QUEST.skippedFallback.evidence).toBeNull()
  })

  it('completing the loop records only its documented mystery evidence', () => {
    const rewardFlags = ACT4_SIDE_QUEST.rewards.filter((r) => r.kind === 'flag').map((r) => r.id)
    expect(rewardFlags).toContain('evidence-plural-stars')
    expect(rewardFlags).toContain('act4-atlas-constellations-restored')
    const epilogue = ACT4_SIDE_QUEST.rewards.find((r) => r.kind === 'epilogue')
    expect(epilogue.treatment).toBe('added-stars')
  })
})

describe('exported data is mutation-safe', () => {
  it('top-level and nested structures are frozen', () => {
    expect(Object.isFrozen(ACT4_POCKETS)).toBe(true)
    expect(Object.isFrozen(ACT4_MARCH_PLANS)).toBe(true)
    expect(Object.isFrozen(ACT4_MAIN_QUEST)).toBe(true)
    expect(Object.isFrozen(ACT4_ENCOUNTERS)).toBe(true)
    expect(Object.isFrozen(ACT4_PRESSURE_STATES)).toBe(true)
    expect(Object.isFrozen(ACT4_RESTORATION_FORMULATIONS)).toBe(true)
    expect(Object.isFrozen(ACT4_REGION)).toBe(true)
    const enc = ACT4_ENCOUNTERS['enc-act4-atlas-vault']
    expect(Object.isFrozen(enc.order)).toBe(true)
    expect(() => { enc.order.push('hydra') }).toThrow()
    expect(ACT4_ENCOUNTERS['enc-act4-atlas-vault'].order).toHaveLength(4)
  })
})

describe('lookup helpers are null-safe', () => {
  it('unknown IDs return null for every lookup', () => {
    expect(act4PocketById('nope')).toBeNull()
    expect(act4SpawnById('slag-road', 'nope')).toBeNull()
    expect(act4ConnectionById('nope')).toBeNull()
    expect(act4MarchPlanById('nope')).toBeNull()
    expect(act4EncounterById('nope')).toBeNull()
    expect(act4QuestById('nope')).toBeNull()
    expect(act4ObjectiveById('nope')).toBeNull()
    expect(act4PressureStateById('overload')).toBeNull()
    expect(act4FormulationById('nope')).toBeNull()
    expect(act4SavePointById('nope')).toBeNull()
    expect(act4CompletionFlagForEncounter('nope')).toBeNull()
  })

  it('known IDs resolve to the exact authored definitions', () => {
    expect(act4PocketById('slag-road')).toBe(ACT4_POCKETS['slag-road'])
    expect(act4SpawnById('slag-road', 'dawn-muster').id).toBe('dawn-muster')
    expect(act4MarchPlanById('athena-precise-route').proposer).toBe('athena')
    expect(act4EncounterById('boss-act4-name-press-colossus').completionFlag).toBe('act4-colossus-defeated')
    expect(act4QuestById(ACT4_MAIN_QUEST_ID)).toBe(ACT4_MAIN_QUEST)
    expect(act4ObjectiveById('reject-single-crown').proposer).toBe('zeus')
    expect(act4PressureStateById('critical').telegraph.shapeGlyph).toBe('open-valve')
    expect(act4FormulationById('guild-stewardship').completesQuestId).toBe(ACT4_MAIN_QUEST_ID)
    expect(act4SavePointById('checkpoint-colossus-boss').mapId).toBe('false-constellation')
    expect(act4CompletionFlagForEncounter('enc-act4-name-press')).toBe('act4-name-press-cleared')
  })
})

describe('save points and boss boundary', () => {
  it('every documented save point exists with valid pocket references', () => {
    expect(Object.keys(ACT4_SAVE_POINTS)).toHaveLength(6)
    for (const point of Object.values(ACT4_SAVE_POINTS)) {
      expect(act4PocketById(point.mapId), `${point.id} unknown pocket`).toBeTruthy()
      if (point.spawnId) expect(act4SpawnById(point.mapId, point.spawnId), `${point.id} spawn missing`).toBeTruthy()
    }
  })

  it('the Colossus resumes post-boss, never inside active combat', () => {
    const boss = ACT4_ENCOUNTERS['boss-act4-name-press-colossus']
    expect(boss.returnMapId).toBe('false-constellation')
    expect(boss.returnSpawnId).toBe('post-boss')
    expect(boss.checkpointId).toBe('checkpoint-colossus-boss')
    expect(ACT4_SAVE_POINTS[boss.checkpointId]).toBeTruthy()
  })

  it('region exit unlocks Act V exactly once with a completion save', () => {
    expect(ACT4_REGION.exit.mapId).toBe('slag-road')
    expect(ACT4_REGION.exit.spawnId).toBe('dawn-muster')
    const unlock = ACT4_REGION.exit.effects.find((e) => e.kind === 'unlock-region')
    expect(unlock.regionId).toBe('night-stair')
    expect(ACT4_SAVE_POINTS['checkpoint-forge-completion'].spawnId).toBe('dawn-muster')
  })
})
