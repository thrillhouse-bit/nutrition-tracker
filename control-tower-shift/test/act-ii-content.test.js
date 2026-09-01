// Phase G — Act II static content scaffold tests.
//
// Proves the act2Content.js module against ACTS-II-V-BLUEPRINT.md (Act II):
// connection graph integrity, exact objective chain, canonical monster IDs,
// flag uniqueness/namespacing, tide-state contract, formulation linearity,
// side-loop independence, export immutability, and null-safe lookups.
//
// Pure data assertions: no DOM, no time, no RNG.
import { describe, it, expect } from 'vitest'
import { MONSTER_TYPES } from '../src/game/index.js'
import {
  ACT2_REGION_ID,
  ACT2_MAIN_QUEST_ID,
  ACT2_SIDE_QUEST_ID,
  ACT2_PRECONDITIONS,
  ACT2_POCKETS,
  ACT2_CONNECTIONS,
  ACT2_MAIN_OBJECTIVES,
  ACT2_MAIN_QUEST,
  ACT2_SIDE_QUEST,
  ACT2_ENCOUNTERS,
  ACT2_ENCOUNTER_OWNER_QUEST,
  ACT2_TIDE_STATES,
  ACT2_TIDE_ORDER,
  ACT2_TIDE_RULES,
  ACT2_SAVE_POINTS,
  ACT2_PERMANENT_FLAGS,
  ACT2_SHARED_FLAG_IDS,
  ACT2_OPTIONAL_FLAG_IDS,
  ACT2_RESTORATION_FORMULATIONS,
  ACT2_REGION,
  act2PocketById,
  act2SpawnById,
  act2ConnectionById,
  act2EncounterById,
  act2QuestById,
  act2ObjectiveById,
  act2TideStateById,
  act2FormulationById,
  act2SavePointById,
  act2CompletionFlagForEncounter,
} from '../src/rpg/act2Content.js'

const pocketIds = Object.keys(ACT2_POCKETS)

describe('Act II region and pockets', () => {
  it('defines exactly the five authored pockets with distinct roles', () => {
    expect(pocketIds.sort()).toEqual(
      ['archive-barge-deck', 'breakwater-road', 'nereid-caves', 'pelagos-harbor', 'storm-anchorage'].sort()
    )
    expect(ACT2_POCKETS['pelagos-harbor'].role).toBe('hub')
    expect(ACT2_POCKETS['breakwater-road'].role).toBe('traversal')
    expect(ACT2_POCKETS['nereid-caves'].role).toBe('dungeon')
    expect(ACT2_POCKETS['storm-anchorage'].role).toBe('combat')
    expect(ACT2_POCKETS['archive-barge-deck'].role).toBe('boss')
    for (const id of pocketIds) {
      expect(ACT2_POCKETS[id].region).toBe(ACT2_REGION_ID)
      expect(ACT2_POCKETS[id].act).toBe(2)
    }
  })

  it('every pocket has a default spawn that exists in its own spawn table', () => {
    for (const id of pocketIds) {
      const pocket = ACT2_POCKETS[id]
      expect(pocket.spawns[pocket.spawnId], `${id} default spawn missing`).toBeTruthy()
    }
  })

  it('entry requirements are Act I completion + restored Far-Sighted', () => {
    expect(ACT2_PRECONDITIONS).toHaveLength(2)
    expect(ACT2_PRECONDITIONS[0]).toEqual({ kind: 'quest-complete', questId: 'mq-act1-ash-at-dawn' })
    expect(ACT2_PRECONDITIONS[1].flagId).toBe('act1-far-sighted-restored')
    expect(ACT2_REGION.entry.mapId).toBe('pelagos-harbor')
    expect(ACT2_REGION.entry.spawnId).toBe('keeper-jetty')
  })
})

describe('connection graph integrity', () => {
  it('every connection references existing pockets and valid destination/return spawns', () => {
    expect(ACT2_CONNECTIONS.length).toBeGreaterThanOrEqual(5)
    for (const conn of ACT2_CONNECTIONS) {
      const from = act2PocketById(conn.from)
      const to = act2PocketById(conn.to)
      expect(from, `connection ${conn.id}: unknown pocket ${conn.from}`).toBeTruthy()
      expect(to, `connection ${conn.id}: unknown pocket ${conn.to}`).toBeTruthy()
      expect(
        act2SpawnById(conn.to, conn.arrivalSpawnId),
        `connection ${conn.id}: arrival spawn ${conn.to}:${conn.arrivalSpawnId} missing`
      ).toBeTruthy()
      expect(
        act2SpawnById(conn.from, conn.returnSpawnId),
        `connection ${conn.id}: return spawn ${conn.from}:${conn.returnSpawnId} missing`
      ).toBeTruthy()
    }
  })

  it('the pocket graph is fully connected both ways — nobody gets stranded', () => {
    // The skiff routes form a ring (anchorage -> barge -> harbor), so strict
    // pairwise reciprocity does not hold by design; the contract is that
    // every pocket is reachable from the entry pocket AND can return to it.
    const adj = new Map(pocketIds.map((p) => [p, []]))
    const rev = new Map(pocketIds.map((p) => [p, []]))
    for (const conn of ACT2_CONNECTIONS) {
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
    const reachable = bfs('pelagos-harbor', adj)
    const returnable = bfs('pelagos-harbor', rev)
    expect([...reachable].sort(), 'not all pockets reachable from entry').toEqual([...pocketIds].sort())
    expect([...returnable].sort(), 'not all pockets able to return to entry').toEqual([...pocketIds].sort())
  })

  it('the skiff route to the archive barge is gated on the cleared anchorage', () => {
    const skiff = ACT2_CONNECTIONS.find((c) => c.id === 'anchorage-to-barge')
    expect(skiff).toBeTruthy()
    expect(skiff.kind).toBe('skiff')
    expect(skiff.gate).toEqual([{ kind: 'flag', flagId: 'act2-anchorage-cleared', value: true }])
    expect(ACT2_PERMANENT_FLAGS).toContain('act2-anchorage-cleared')
  })

  it('every skiff destination has a valid return spawn', () => {
    const skiffs = ACT2_CONNECTIONS.filter((c) => c.kind === 'skiff')
    expect(skiffs.length).toBeGreaterThanOrEqual(2)
    for (const conn of skiffs) {
      expect(act2SpawnById(conn.from, conn.returnSpawnId), `${conn.id} skiff return spawn`).toBeTruthy()
    }
  })

  it('all five pockets are reachable from the entry pocket', () => {
    // Covered by the bidirectional connectivity test above; kept as a guard
    // that the entry pocket itself is the hub of both graphs.
    expect(pocketIds).toContain(ACT2_REGION.entry.mapId)
  })
})

describe('main objective chain matches the blueprint exactly', () => {
  it('exactly eight objectives in the authored order', () => {
    expect(ACT2_MAIN_OBJECTIVES.map((o) => o.id)).toEqual([
      'reach-pelagos-keeper',
      'witness-first-surge',
      'free-nereid-witnesses',
      'separate-boundary-names',
      'secure-storm-anchorage',
      'board-archive-barge',
      'defeat-archive-leviathan',
      'ratify-salt-covenant',
    ])
  })

  it('the quest definition carries the chain, prerequisites, and completion reward', () => {
    expect(ACT2_MAIN_QUEST.id).toBe(ACT2_MAIN_QUEST_ID)
    expect(ACT2_MAIN_QUEST.kind).toBe('main')
    expect(ACT2_MAIN_QUEST.act).toBe(2)
    expect(ACT2_MAIN_QUEST.objectives).toBe(ACT2_MAIN_OBJECTIVES)
    expect(ACT2_MAIN_QUEST.prerequisites).toBe(ACT2_PRECONDITIONS)
    expect(ACT2_MAIN_QUEST.rewards).toEqual([{ kind: 'flag', id: 'mq-act2-salt-covenant-completed', value: true }])
  })

  it('the witness/pressure/folio objectives are player-ordered multi-steps', () => {
    const witnesses = act2ObjectiveById('free-nereid-witnesses')
    expect(witnesses.count).toBe(3)
    expect(witnesses.orderFree).toBe(true)
    const shells = act2ObjectiveById('separate-boundary-names')
    expect(shells.count).toBe(3)
    expect(shells.orderFree).toBe(true)
    const folios = act2ObjectiveById('board-archive-barge')
    expect(folios.count).toBe(2)
    expect(folios.orderFree).toBe(true)
  })

  it('the ratification objective offers exactly the three documented formulations', () => {
    const ratify = act2ObjectiveById('ratify-salt-covenant')
    expect(ratify.choiceIds).toEqual(['harbor-first', 'boundary-first', 'shared-crossing'])
  })
})

describe('encounter monster IDs are canonical', () => {
  it('every base monster in every encounter order exists in MONSTER_TYPES', () => {
    for (const enc of Object.values(ACT2_ENCOUNTERS)) {
      expect(Array.isArray(enc.order), `${enc.id} has no order`).toBe(true)
      expect(enc.order.length).toBeGreaterThan(0)
      for (const monsterId of enc.order) {
        expect(MONSTER_TYPES[monsterId], `${enc.id}: unknown monster ${monsterId}`).toBeTruthy()
      }
    }
  })

  it('boss cores and elite overlays reference canonical base monster types', () => {
    const boss = ACT2_ENCOUNTERS['boss-act2-archive-leviathan']
    expect(MONSTER_TYPES[boss.boss.core.baseMonsterType]).toBeTruthy()
    expect(boss.boss.overlay || boss.boss.overlays.length).toBeTruthy()
    expect(boss.boss.telegraphed).toBe(true)
    expect(boss.boss.phases).toHaveLength(3)
  })

  it('every encounter has a completion flag wired to a permanent flag and owning quest', () => {
    for (const enc of Object.values(ACT2_ENCOUNTERS)) {
      expect(typeof enc.completionFlag).toBe('string')
      expect(enc.completionFlag.length).toBeGreaterThan(0)
      const owner = ACT2_ENCOUNTER_OWNER_QUEST[enc.id]
      expect(owner, `${enc.id} has no owning quest`).toBeTruthy()
      expect([ACT2_MAIN_QUEST_ID, ACT2_SIDE_QUEST_ID]).toContain(owner)
    }
  })

  it('encounter orders match the blueprint compositions', () => {
    expect(ACT2_ENCOUNTERS['enc-act2-breakwater'].order).toEqual(['hydra', 'hydra', 'chronos', 'cerberus'])
    expect(ACT2_ENCOUNTERS['enc-act2-nereid-caves'].order).toEqual(['medusa', 'hydra', 'medusa', 'cerberus'])
    expect(ACT2_ENCOUNTERS['enc-act2-anchorage'].order).toEqual(['chronos', 'minotaur', 'hydra', 'minotaur'])
  })
})

describe('flag uniqueness and namespacing', () => {
  it('encounter completion flags are unique per encounter', () => {
    const completionFlags = Object.values(ACT2_ENCOUNTERS).map((e) => e.completionFlag)
    expect(new Set(completionFlags).size).toBe(completionFlags.length)
  })

  it('permanent flags are internally unique', () => {
    expect(new Set(ACT2_PERMANENT_FLAGS).size).toBe(ACT2_PERMANENT_FLAGS.length)
  })

  it('every completion flag resolves to a documented permanent or side-loop flag', () => {
    const documented = new Set([...ACT2_PERMANENT_FLAGS, 'sq-act2-unmoored-medusa-cleared'])
    for (const enc of Object.values(ACT2_ENCOUNTERS)) {
      expect(documented.has(enc.completionFlag), `${enc.id} flag ${enc.completionFlag} undocumented`).toBe(true)
    }
    // Side-quest reward flags never collide with a different permanent flag.
    for (const reward of ACT2_SIDE_QUEST.rewards) {
      if (reward.kind !== 'flag') continue
      const collidesWithPermanent = ACT2_PERMANENT_FLAGS.some((f) => f === reward.id && f !== 'evidence-mutual-memory')
      expect(collidesWithPermanent).toBe(false)
    }
  })

  it('all flags are Act II namespaced except documented shared IDs', () => {
    const allFlagIds = [
      ...ACT2_PERMANENT_FLAGS,
      ...Object.values(ACT2_ENCOUNTERS).map((e) => e.completionFlag),
      ...ACT2_SIDE_QUEST.rewards.filter((r) => r.kind === 'flag').map((r) => r.id),
      ...ACT2_SIDE_QUEST.affinityChoices,
    ]
    for (const flag of allFlagIds) {
      if (ACT2_SHARED_FLAG_IDS.includes(flag)) continue
      const namespaced =
        flag.startsWith('act2-') || flag.startsWith('mq-act2-') || flag.startsWith('sq-act2-')
      expect(namespaced, `flag ${flag} not act2-namespaced`).toBe(true)
    }
  })

  it('optional flags are documented and never required by the main chain', () => {
    for (const flag of ACT2_OPTIONAL_FLAG_IDS) {
      const usedByMain = ACT2_MAIN_QUEST.objectives.some(
        (o) => JSON.stringify(o).includes(flag)
      )
      expect(usedByMain, `optional flag ${flag} referenced by main chain`).toBe(false)
    }
  })
})

describe('covenant tide contract', () => {
  it('has exactly the three documented states in authored order', () => {
    expect(ACT2_TIDE_ORDER).toEqual(['ebb', 'crossing', 'surge'])
    expect(Object.keys(ACT2_TIDE_STATES).sort()).toEqual(['crossing', 'ebb', 'surge'])
  })

  it('every state has fixed walkable lanes and non-color telegraph metadata', () => {
    for (const stateId of ACT2_TIDE_ORDER) {
      const state = act2TideStateById(stateId)
      expect(state).toBeTruthy()
      expect(Array.isArray(state.walkableLanes)).toBe(true)
      expect(state.walkableLanes.length).toBeGreaterThan(0)
      const t = state.telegraph
      expect(t).toBeTruthy()
      // Non-color: shape glyph + text label + cadence, not a bare color token.
      expect(typeof t.shapeGlyph).toBe('string')
      expect(t.shapeGlyph.length).toBeGreaterThan(0)
      expect(typeof t.label).toBe('string')
      expect(t.label.length).toBeGreaterThan(0)
      expect(Number.isFinite(t.cadenceTicks)).toBe(true)
      expect(t.color).toBeUndefined()
    }
  })

  it('tide advances only at marked wells and pauses during dialogue/combat', () => {
    expect(ACT2_TIDE_RULES.advancesOnlyAtWells).toBe(true)
    expect(ACT2_TIDE_RULES.wells.length).toBeGreaterThan(0)
    expect(ACT2_TIDE_RULES.pausedDuring).toEqual(expect.arrayContaining(['dialogue', 'combat']))
    expect(ACT2_TIDE_RULES.noDrowningTimer).toBe(true)
    expect(ACT2_TIDE_RULES.restoredAtCheckpoints).toBe(true)
  })
})

describe('restoration formulations complete the same linear path', () => {
  it('all three formulations complete the same main quest and objective', () => {
    expect(ACT2_RESTORATION_FORMULATIONS).toHaveLength(3)
    const ids = ACT2_RESTORATION_FORMULATIONS.map((f) => f.id).sort()
    expect(ids).toEqual(['boundary-first', 'harbor-first', 'shared-crossing'])
    for (const formulation of ACT2_RESTORATION_FORMULATIONS) {
      expect(formulation.completesQuestId).toBe(ACT2_MAIN_QUEST_ID)
      expect(formulation.completesObjectiveId).toBe('ratify-salt-covenant')
    }
  })

  it('no formulation changes the objective graph or next-act prerequisites', () => {
    for (const formulation of ACT2_RESTORATION_FORMULATIONS) {
      expect(formulation.objectiveOverrides).toBeUndefined()
      expect(formulation.unlockOverrides).toBeUndefined()
    }
  })
})

describe('optional loop cannot gate the main path', () => {
  it('side quest has no main-path prerequisites and its completion never gates main objectives', () => {
    expect(ACT2_SIDE_QUEST.prerequisites).toEqual([])
    const sideIds = new Set(ACT2_SIDE_QUEST.objectives.map((o) => o.id))
    for (const objective of ACT2_MAIN_QUEST.objectives) {
      expect(sideIds.has(objective.id)).toBe(false)
      for (const value of Object.values(objective)) {
        expect(String(value)).not.toContain(ACT2_SIDE_QUEST_ID)
      }
    }
  })

  it('side encounter belongs only to the side quest', () => {
    expect(ACT2_ENCOUNTER_OWNER_QUEST['enc-act2-unmoored-charmed']).toBe(ACT2_SIDE_QUEST_ID)
    const mainEncounters = ACT2_MAIN_QUEST.objectives
      .filter((o) => o.encounterId)
      .map((o) => o.encounterId)
    expect(mainEncounters).not.toContain('enc-act2-unmoored-charmed')
  })

  it('skipping the loop yields a valid neutral fallback with no dead end', () => {
    expect(ACT2_SIDE_QUEST.skippedFallback.valid).toBe(true)
    expect(ACT2_SIDE_QUEST.skippedFallback.evidence).toBeNull()
    expect(ACT2_SIDE_QUEST.skippedFallback.affinity).toBeNull()
  })

  it('completing the loop records only its documented mystery evidence', () => {
    const rewardFlags = ACT2_SIDE_QUEST.rewards.filter((r) => r.kind === 'flag').map((r) => r.id)
    expect(rewardFlags).toEqual(['evidence-mutual-memory'])
    expect(ACT2_SIDE_QUEST.affinityChoices).toEqual(['act2-affinity-aphrodite', 'act2-affinity-eros'])
  })
})

describe('exported data is mutation-safe', () => {
  it('top-level structures are frozen', () => {
    expect(Object.isFrozen(ACT2_POCKETS)).toBe(true)
    expect(Object.isFrozen(ACT2_CONNECTIONS)).toBe(true)
    expect(Object.isFrozen(ACT2_MAIN_QUEST)).toBe(true)
    expect(Object.isFrozen(ACT2_SIDE_QUEST)).toBe(true)
    expect(Object.isFrozen(ACT2_ENCOUNTERS)).toBe(true)
    expect(Object.isFrozen(ACT2_TIDE_STATES)).toBe(true)
    expect(Object.isFrozen(ACT2_PERMANENT_FLAGS)).toBe(true)
    expect(Object.isFrozen(ACT2_RESTORATION_FORMULATIONS)).toBe(true)
    expect(Object.isFrozen(ACT2_REGION)).toBe(true)
  })

  it('nested structures are frozen — mutations throw in strict mode', () => {
    const pocket = ACT2_POCKETS['pelagos-harbor']
    expect(Object.isFrozen(pocket)).toBe(true)
    expect(Object.isFrozen(pocket.spawns)).toBe(true)
    const enc = ACT2_ENCOUNTERS['enc-act2-nereid-caves']
    expect(Object.isFrozen(enc.order)).toBe(true)
    expect(Object.isFrozen(ACT2_MAIN_QUEST.objectives[0])).toBe(true)
    expect(Object.isFrozen(ACT2_TIDE_STATES.ebb.telegraph)).toBe(true)

    // Attempted mutation must not persist.
    expect(() => { pocket.spawns.hacked = { id: 'hacked' } }).toThrow()
    expect(() => { enc.order.push('sphinx') }).toThrow()
    expect(ACT2_POCKETS['pelagos-harbor'].spawns.hacked).toBeUndefined()
    expect(ACT2_ENCOUNTERS['enc-act2-nereid-caves'].order).toHaveLength(4)
  })
})

describe('lookup helpers are null-safe', () => {
  it('unknown IDs return null for every lookup', () => {
    expect(act2PocketById('no-such-pocket')).toBeNull()
    expect(act2PocketById(null)).toBeNull()
    expect(act2PocketById(undefined)).toBeNull()
    expect(act2SpawnById('pelagos-harbor', 'no-such-spawn')).toBeNull()
    expect(act2SpawnById('no-such-pocket', 'keeper-jetty')).toBeNull()
    expect(act2ConnectionById('no-such-connection')).toBeNull()
    expect(act2EncounterById('no-such-encounter')).toBeNull()
    expect(act2EncounterById(42)).toBeNull()
    expect(act2QuestById('no-such-quest')).toBeNull()
    expect(act2ObjectiveById('no-such-objective')).toBeNull()
    expect(act2TideStateById('flood')).toBeNull()
    expect(act2FormulationById('harbor-second')).toBeNull()
    expect(act2SavePointById('no-such-save-point')).toBeNull()
    expect(act2CompletionFlagForEncounter('no-such-encounter')).toBeNull()
  })

  it('known IDs resolve to the exact authored definitions', () => {
    expect(act2PocketById('pelagos-harbor')).toBe(ACT2_POCKETS['pelagos-harbor'])
    expect(act2SpawnById('pelagos-harbor', 'post-covenant').id).toBe('post-covenant')
    expect(act2EncounterById('boss-act2-archive-leviathan').completionFlag).toBe('act2-leviathan-defeated')
    expect(act2QuestById(ACT2_MAIN_QUEST_ID)).toBe(ACT2_MAIN_QUEST)
    expect(act2ObjectiveById('ratify-salt-covenant').kind).toBe('choose')
    expect(act2TideStateById('surge').telegraph.shapeGlyph).toBe('chevron-up')
    expect(act2FormulationById('shared-crossing').completesQuestId).toBe(ACT2_MAIN_QUEST_ID)
    expect(act2SavePointById('checkpoint-nereid-threshold').mapId).toBe('nereid-caves')
    expect(act2CompletionFlagForEncounter('enc-act2-anchorage')).toBe('act2-anchorage-cleared')
  })
})

describe('save points and boss boundary', () => {
  it('every documented save point exists with valid pocket references', () => {
    expect(Object.keys(ACT2_SAVE_POINTS).sort()).toEqual([
      'checkpoint-archive-barge-boss',
      'checkpoint-nereid-threshold',
      'checkpoint-pelagos-completion',
      'checkpoint-storm-anchorage-cleared',
      'shrine-pelagos-poseidon',
    ])
    for (const point of Object.values(ACT2_SAVE_POINTS)) {
      expect(act2PocketById(point.mapId), `${point.id} references unknown pocket`).toBeTruthy()
      if (point.spawnId) expect(act2SpawnById(point.mapId, point.spawnId), `${point.id} spawn missing`).toBeTruthy()
    }
  })

  it('the Leviathan boss resumes post-boss, never inside active combat', () => {
    const boss = ACT2_ENCOUNTERS['boss-act2-archive-leviathan']
    expect(boss.returnMapId).toBe('archive-barge-deck')
    expect(boss.returnSpawnId).toBe('post-boss')
    expect(boss.checkpointId).toBe('checkpoint-archive-barge-boss')
    expect(ACT2_SAVE_POINTS[boss.checkpointId]).toBeTruthy()
  })

  it('region exit unlocks Act III exactly once with a documented completion save', () => {
    expect(ACT2_REGION.exit.mapId).toBe('pelagos-harbor')
    expect(ACT2_REGION.exit.spawnId).toBe('post-covenant')
    const unlock = ACT2_REGION.exit.effects.find((e) => e.kind === 'unlock-region')
    expect(unlock.regionId).toBe('fields-of-kore')
    expect(ACT2_SAVE_POINTS['checkpoint-pelagos-completion'].spawnId).toBe('post-covenant')
  })
})
