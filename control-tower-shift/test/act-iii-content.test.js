// Act III static content scaffold tests — Fields of Kore: The Withered Year.
// Pure data assertions: no DOM, no time, no RNG.
import { describe, it, expect } from 'vitest'
import { MONSTER_TYPES } from '../src/game/index.js'
import {
  ACT3_REGION_ID,
  ACT3_MAIN_QUEST_ID,
  ACT3_SIDE_QUEST_ID,
  ACT3_PRECONDITIONS,
  ACT3_POCKETS,
  ACT3_CONNECTIONS,
  ACT3_MAIN_OBJECTIVES,
  ACT3_MAIN_QUEST,
  ACT3_SIDE_QUEST,
  ACT3_ENCOUNTERS,
  ACT3_ENCOUNTER_OWNER_QUEST,
  ACT3_SEASONAL_STATES,
  ACT3_SEASONAL_RULES,
  ACT3_SAVE_POINTS,
  ACT3_PERMANENT_FLAGS,
  ACT3_SHARED_FLAG_IDS,
  ACT3_OPTIONAL_FLAG_IDS,
  ACT3_RESTORATION_FORMULATIONS,
  ACT3_REGION,
  act3PocketById,
  act3SpawnById,
  act3ConnectionById,
  act3EncounterById,
  act3QuestById,
  act3ObjectiveById,
  act3SeasonalStateById,
  act3FormulationById,
  act3SavePointById,
  act3CompletionFlagForEncounter,
} from '../src/rpg/act3Content.js'

const pocketIds = Object.keys(ACT3_POCKETS)

describe('Act III region and pockets', () => {
  it('defines exactly the five authored pockets with distinct roles', () => {
    expect(pocketIds.sort()).toEqual(
      ['asphodel-gate', 'kore-sanctuary', 'threshing-circle', 'wheat-village', 'winter-orchard'].sort()
    )
    expect(ACT3_POCKETS['wheat-village'].role).toBe('hub')
    expect(ACT3_POCKETS['winter-orchard'].role).toBe('traversal')
    expect(ACT3_POCKETS['kore-sanctuary'].role).toBe('dungeon')
    expect(ACT3_POCKETS['asphodel-gate'].role).toBe('dungeon')
    expect(ACT3_POCKETS['threshing-circle'].role).toBe('boss')
    for (const id of pocketIds) {
      expect(ACT3_POCKETS[id].region).toBe(ACT3_REGION_ID)
      expect(ACT3_POCKETS[id].act).toBe(3)
    }
  })

  it('every pocket has a default spawn in its own spawn table', () => {
    for (const id of pocketIds) {
      const pocket = ACT3_POCKETS[id]
      expect(pocket.spawns[pocket.spawnId], `${id} default spawn missing`).toBeTruthy()
    }
  })

  it('entry requires Act II completion + ratified Salt Covenant', () => {
    expect(ACT3_PRECONDITIONS).toHaveLength(2)
    expect(ACT3_PRECONDITIONS[0]).toEqual({ kind: 'quest-complete', questId: 'mq-act2-salt-covenant' })
    expect(ACT3_PRECONDITIONS[1].flagId).toBe('act2-salt-covenant-ratified')
    expect(ACT3_REGION.entry.mapId).toBe('wheat-village')
    expect(ACT3_REGION.entry.spawnId).toBe('granary')
  })
})

describe('connection graph integrity', () => {
  it('every connection references existing pockets and valid arrival/return spawns', () => {
    for (const conn of ACT3_CONNECTIONS) {
      expect(act3PocketById(conn.from), `${conn.id}: unknown pocket ${conn.from}`).toBeTruthy()
      expect(act3PocketById(conn.to), `${conn.id}: unknown pocket ${conn.to}`).toBeTruthy()
      expect(act3SpawnById(conn.to, conn.arrivalSpawnId), `${conn.id} arrival spawn missing`).toBeTruthy()
      expect(act3SpawnById(conn.from, conn.returnSpawnId), `${conn.id} return spawn missing`).toBeTruthy()
    }
  })

  it('the pocket graph is fully connected both ways — nobody gets stranded', () => {
    const adj = new Map(pocketIds.map((p) => [p, []]))
    const rev = new Map(pocketIds.map((p) => [p, []]))
    for (const conn of ACT3_CONNECTIONS) {
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
    expect([...bfs('wheat-village', adj)].sort()).toEqual([...pocketIds].sort())
    expect([...bfs('wheat-village', rev)].sort()).toEqual([...pocketIds].sort())
  })

  it('the threshing circle is gated on the joined covenant', () => {
    const gate = ACT3_CONNECTIONS.find((c) => c.id === 'village-to-threshing')
    expect(gate).toBeTruthy()
    expect(gate.gate).toEqual([{ kind: 'flag', flagId: 'act3-covenant-joined', value: true }])
    expect(ACT3_PERMANENT_FLAGS).toContain('act3-covenant-joined')
  })
})

describe('main objective chain matches the blueprint exactly', () => {
  it('exactly eight objectives in the authored order', () => {
    expect(ACT3_MAIN_OBJECTIVES.map((o) => o.id)).toEqual([
      'hear-the-stilled-year',
      'restore-orchard-paths',
      'recover-seed-half',
      'recover-return-half',
      'petition-hades',
      'join-the-covenant',
      'defeat-winter-mother-echo',
      'witness-first-thaw',
    ])
  })

  it('the quest definition carries the chain, prerequisites, and completion reward', () => {
    expect(ACT3_MAIN_QUEST.id).toBe(ACT3_MAIN_QUEST_ID)
    expect(ACT3_MAIN_QUEST.kind).toBe('main')
    expect(ACT3_MAIN_QUEST.act).toBe(3)
    expect(ACT3_MAIN_QUEST.objectives).toBe(ACT3_MAIN_OBJECTIVES)
    expect(ACT3_MAIN_QUEST.rewards).toEqual([{ kind: 'flag', id: 'mq-act3-withered-year-completed', value: true }])
  })

  it('Kleio\u2019s testimony is mandatory before the covenant can join', () => {
    const petition = act3ObjectiveById('petition-hades')
    expect(petition.kind).toBe('talk')
    expect(petition.npcId).toBe('kleio')
    const join = act3ObjectiveById('join-the-covenant')
    expect(join.requiresOrdering).toBe('petition-hades')
    // petition-hades precedes join-the-covenant in the chain.
    const idx = ACT3_MAIN_OBJECTIVES.map((o) => o.id)
    expect(idx.indexOf('petition-hades')).toBeLessThan(idx.indexOf('join-the-covenant'))
  })

  it('the pomegranate seals are ORDERED, witness talks are order-free', () => {
    expect(act3ObjectiveById('recover-return-half').orderFree).toBe(false)
    expect(act3ObjectiveById('recover-return-half').count).toBe(4)
    expect(act3ObjectiveById('hear-the-stilled-year').orderFree).toBe(true)
    expect(act3ObjectiveById('hear-the-stilled-year').count).toBe(4)
    expect(act3ObjectiveById('restore-orchard-paths').count).toBe(2)
  })

  it('the covenant join offers exactly the three documented formulations', () => {
    expect(act3ObjectiveById('join-the-covenant').choiceIds).toEqual([
      'continuity-kept', 'departure-protected', 'witnessed-cycle',
    ])
  })
})

describe('encounter monster IDs are canonical', () => {
  it('every base monster exists in MONSTER_TYPES', () => {
    for (const enc of Object.values(ACT3_ENCOUNTERS)) {
      expect(enc.order.length).toBeGreaterThan(0)
      for (const monsterId of enc.order) {
        expect(MONSTER_TYPES[monsterId], `${enc.id}: unknown monster ${monsterId}`).toBeTruthy()
      }
    }
  })

  it('encounter orders match the blueprint compositions', () => {
    expect(ACT3_ENCOUNTERS['enc-act3-orchard-tracks'].order).toEqual(['chronos', 'medusa', 'hydra', 'medusa'])
    expect(ACT3_ENCOUNTERS['enc-act3-kore-sanctuary'].order).toEqual(['sphinx', 'hydra', 'sphinx', 'cerberus'])
    expect(ACT3_ENCOUNTERS['enc-act3-asphodel'].order).toEqual(['cerberus', 'chronos', 'chronos', 'cerberus'])
  })

  it('the Winter Mother Echo alternates deterministic phases with non-color telegraphs', () => {
    const boss = ACT3_ENCOUNTERS['boss-act3-winter-mother-echo']
    expect(MONSTER_TYPES[boss.boss.core.baseMonsterType]).toBeTruthy()
    expect(boss.boss.alternating).toBe(true)
    expect(boss.boss.telegraphed).toBe(true)
    expect(boss.boss.nonColorTelegraphs).toBe(true)
    expect(boss.boss.phases).toEqual(['harvest-phase', 'winter-phase'])
  })

  it('every encounter has a completion flag wired to a documented flag and owning quest', () => {
    for (const enc of Object.values(ACT3_ENCOUNTERS)) {
      expect(ACT3_PERMANENT_FLAGS).toContain(enc.completionFlag)
      expect(ACT3_ENCOUNTER_OWNER_QUEST[enc.id]).toBe(ACT3_MAIN_QUEST_ID)
    }
  })
})

describe('flag uniqueness and namespacing', () => {
  it('permanent flags are internally unique', () => {
    expect(new Set(ACT3_PERMANENT_FLAGS).size).toBe(ACT3_PERMANENT_FLAGS.length)
  })

  it('all flags are Act III namespaced except documented shared IDs', () => {
    const allFlagIds = [
      ...ACT3_PERMANENT_FLAGS,
      ...ACT3_SIDE_QUEST.rewards.filter((r) => r.kind === 'flag').map((r) => r.id),
      ...ACT3_SIDE_QUEST.affinityChoices,
    ]
    for (const flag of allFlagIds) {
      if (ACT3_SHARED_FLAG_IDS.includes(flag)) continue
      const namespaced =
        flag.startsWith('act3-') || flag.startsWith('mq-act3-') || flag.startsWith('sq-act3-')
      expect(namespaced, `flag ${flag} not act3-namespaced`).toBe(true)
    }
  })

  it('optional flags are never referenced by the main chain', () => {
    for (const flag of ACT3_OPTIONAL_FLAG_IDS) {
      const usedByMain = ACT3_MAIN_QUEST.objectives.some((o) => JSON.stringify(o).includes(flag))
      expect(usedByMain, `optional flag ${flag} referenced by main chain`).toBe(false)
    }
  })
})

describe('seasonal overlay contract', () => {
  it('has exactly the two authored seasonal states', () => {
    expect(Object.keys(ACT3_SEASONAL_STATES).sort()).toEqual(['harvest', 'winter'])
  })

  it('every state carries non-color telegraph metadata', () => {
    for (const state of Object.values(ACT3_SEASONAL_STATES)) {
      expect(typeof state.telegraph.shapeGlyph).toBe('string')
      expect(state.telegraph.shapeGlyph.length).toBeGreaterThan(0)
      expect(typeof state.telegraph.label).toBe('string')
      expect(state.telegraph.label.length).toBeGreaterThan(0)
      expect(state.telegraph.color).toBeUndefined()
    }
  })

  it('toggles only at paired altars, never during combat, and restore at checkpoints', () => {
    expect(ACT3_SEASONAL_RULES.togglesOnlyAtPairedAltars).toBe(true)
    expect(ACT3_SEASONAL_RULES.altars).toEqual(['harvest-altar', 'winter-altar'])
    expect(ACT3_SEASONAL_RULES.disabledDuring).toEqual(['combat'])
    expect(ACT3_SEASONAL_RULES.restoredAtCheckpoints).toBe(true)
    expect(ACT3_SEASONAL_RULES.telegraphsAreNonColor).toBe(true)
    // Seasonal pockets are exactly the authored two.
    expect([...ACT3_SEASONAL_RULES.appliesToPockets].sort()).toEqual(['threshing-circle', 'winter-orchard'])
  })
})

describe('restoration formulations complete the same linear path', () => {
  it('all three formulations complete the same main quest and objective', () => {
    expect(ACT3_RESTORATION_FORMULATIONS).toHaveLength(3)
    expect(ACT3_RESTORATION_FORMULATIONS.map((f) => f.id).sort()).toEqual([
      'continuity-kept', 'departure-protected', 'witnessed-cycle',
    ])
    for (const formulation of ACT3_RESTORATION_FORMULATIONS) {
      expect(formulation.completesQuestId).toBe(ACT3_MAIN_QUEST_ID)
      expect(formulation.completesObjectiveId).toBe('join-the-covenant')
    }
  })

  it('no formulation changes the objective graph or next-act prerequisites', () => {
    for (const formulation of ACT3_RESTORATION_FORMULATIONS) {
      expect(formulation.objectiveOverrides).toBeUndefined()
      expect(formulation.unlockOverrides).toBeUndefined()
    }
  })
})

describe('optional loop cannot gate the main path', () => {
  it('side quest has no prerequisites and its objectives never gate the main chain', () => {
    expect(ACT3_SIDE_QUEST.prerequisites).toEqual([])
    const sideIds = new Set(ACT3_SIDE_QUEST.objectives.map((o) => o.id))
    for (const objective of ACT3_MAIN_QUEST.objectives) {
      expect(sideIds.has(objective.id)).toBe(false)
      for (const value of Object.values(objective)) {
        expect(String(value)).not.toContain(ACT3_SIDE_QUEST_ID)
      }
    }
  })

  it('skipping the loop yields a valid neutral fallback', () => {
    expect(ACT3_SIDE_QUEST.skippedFallback.valid).toBe(true)
    expect(ACT3_SIDE_QUEST.skippedFallback.evidence).toBeNull()
    expect(ACT3_SIDE_QUEST.skippedFallback.affinity).toBeNull()
  })

  it('completing the loop records only its documented mystery evidence', () => {
    const rewardFlags = ACT3_SIDE_QUEST.rewards.filter((r) => r.kind === 'flag').map((r) => r.id)
    expect(rewardFlags).toEqual(['evidence-backdated-rite'])
    expect(ACT3_SIDE_QUEST.affinityChoices).toEqual(['act3-rite-renewed', 'act3-rite-released'])
  })
})

describe('exported data is mutation-safe', () => {
  it('top-level and nested structures are frozen', () => {
    expect(Object.isFrozen(ACT3_POCKETS)).toBe(true)
    expect(Object.isFrozen(ACT3_MAIN_QUEST)).toBe(true)
    expect(Object.isFrozen(ACT3_ENCOUNTERS)).toBe(true)
    expect(Object.isFrozen(ACT3_SEASONAL_STATES)).toBe(true)
    expect(Object.isFrozen(ACT3_RESTORATION_FORMULATIONS)).toBe(true)
    expect(Object.isFrozen(ACT3_REGION)).toBe(true)
    const enc = ACT3_ENCOUNTERS['enc-act3-asphodel']
    expect(Object.isFrozen(enc.order)).toBe(true)
    expect(() => { enc.order.push('sphinx') }).toThrow()
    expect(ACT3_ENCOUNTERS['enc-act3-asphodel'].order).toHaveLength(4)
  })
})

describe('lookup helpers are null-safe', () => {
  it('unknown IDs return null for every lookup', () => {
    expect(act3PocketById('nope')).toBeNull()
    expect(act3SpawnById('wheat-village', 'nope')).toBeNull()
    expect(act3ConnectionById('nope')).toBeNull()
    expect(act3EncounterById('nope')).toBeNull()
    expect(act3QuestById('nope')).toBeNull()
    expect(act3ObjectiveById('nope')).toBeNull()
    expect(act3SeasonalStateById('autumn')).toBeNull()
    expect(act3FormulationById('nope')).toBeNull()
    expect(act3SavePointById('nope')).toBeNull()
    expect(act3CompletionFlagForEncounter('nope')).toBeNull()
  })

  it('known IDs resolve to the exact authored definitions', () => {
    expect(act3PocketById('wheat-village')).toBe(ACT3_POCKETS['wheat-village'])
    expect(act3SpawnById('wheat-village', 'first-thaw').id).toBe('first-thaw')
    expect(act3EncounterById('boss-act3-winter-mother-echo').completionFlag).toBe('act3-winter-echo-defeated')
    expect(act3QuestById(ACT3_MAIN_QUEST_ID)).toBe(ACT3_MAIN_QUEST)
    expect(act3ObjectiveById('petition-hades').npcId).toBe('kleio')
    expect(act3SeasonalStateById('winter').telegraph.shapeGlyph).toBe('snowflake')
    expect(act3FormulationById('witnessed-cycle').completesQuestId).toBe(ACT3_MAIN_QUEST_ID)
    expect(act3SavePointById('checkpoint-asphodel-return').mapId).toBe('asphodel-gate')
    expect(act3CompletionFlagForEncounter('enc-act3-orchard-tracks')).toBe('act3-orchard-cleared')
  })
})

describe('save points and boss boundary', () => {
  it('every documented save point exists with valid pocket references', () => {
    expect(Object.keys(ACT3_SAVE_POINTS)).toHaveLength(6)
    for (const point of Object.values(ACT3_SAVE_POINTS)) {
      expect(act3PocketById(point.mapId), `${point.id} unknown pocket`).toBeTruthy()
      if (point.spawnId) expect(act3SpawnById(point.mapId, point.spawnId), `${point.id} spawn missing`).toBeTruthy()
    }
  })

  it('the Echo resumes post-boss, never inside active combat', () => {
    const boss = ACT3_ENCOUNTERS['boss-act3-winter-mother-echo']
    expect(boss.returnMapId).toBe('threshing-circle')
    expect(boss.returnSpawnId).toBe('post-boss')
    expect(boss.checkpointId).toBe('checkpoint-threshing-boss')
    expect(ACT3_SAVE_POINTS[boss.checkpointId]).toBeTruthy()
  })

  it('region exit unlocks Act IV exactly once with a completion save', () => {
    expect(ACT3_REGION.exit.mapId).toBe('wheat-village')
    expect(ACT3_REGION.exit.spawnId).toBe('first-thaw')
    const unlock = ACT3_REGION.exit.effects.find((e) => e.kind === 'unlock-region')
    expect(unlock.regionId).toBe('forge-march')
    expect(ACT3_SAVE_POINTS['checkpoint-fields-completion'].spawnId).toBe('first-thaw')
  })
})
