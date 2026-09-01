// Act V static content contract tests — Night Stair: The Last Name.
// Pure data assertions: no DOM, clocks, RNG, reducer, or browser state.
import { describe, it, expect } from 'vitest'
import { MONSTER_TYPES } from '../src/game/index.js'
import {
  ACT5_REGION_ID,
  ACT5_MAIN_QUEST_ID,
  ACT5_SIDE_QUEST_ID,
  ACT5_PRECONDITIONS,
  ACT5_POCKETS,
  ACT5_CONNECTIONS,
  ACT5_OPTIONAL_LOOPS,
  ACT5_WITNESSED_DEEDS,
  ACT5_MAIN_OBJECTIVES,
  ACT5_MAIN_QUEST,
  ACT5_SIDE_QUEST,
  ACT5_ENCOUNTERS,
  ACT5_ENCOUNTER_OWNER_QUEST,
  ACT5_LIGHT_POLARITY_STATES,
  ACT5_LIGHT_POLARITY_RULES,
  ACT5_TIME_FRACTURE_STATES,
  ACT5_TIME_FRACTURE_RULES,
  ACT5_DEITY_ROLES,
  ACT5_WITNESS_RULES,
  ACT5_CONVERSATIONS,
  ACT5_ENDING_VARIANTS,
  ACT5_SAVE_POINTS,
  ACT5_PERMANENT_FLAGS,
  ACT5_SHARED_FLAG_IDS,
  ACT5_OPTIONAL_FLAG_IDS,
  ACT5_POINT_OF_NO_RETURN,
  ACT5_REGION,
  act5PocketById,
  act5SpawnById,
  act5ConnectionById,
  act5OptionalLoopById,
  act5EncounterById,
  act5QuestById,
  act5ObjectiveById,
  act5ConversationById,
  act5EndingById,
  act5SavePointById,
  act5LightPolarityById,
  act5TimeFractureById,
  act5CompletionFlagForEncounter,
} from '../src/rpg/act5Content.js'
import { act5RuntimeEntityById } from '../src/rpg/act5Runtime.js'

const pocketIds = Object.keys(ACT5_POCKETS)

describe('Act V entry and authored pockets', () => {
  it('uses the actual Act IV emitted completion flag plus mortal-draft flag', () => {
    expect(ACT5_PRECONDITIONS).toEqual([
      { kind: 'flag', flagId: 'mq-act4-false-constellation-completed', value: true },
      { kind: 'flag', flagId: 'act4-mortal-draft-ratified', value: true },
    ])
    expect(JSON.stringify(ACT5_PRECONDITIONS)).not.toContain('mq-act4-false-constellation === completed')
    expect(ACT5_REGION.entry).toEqual({ mapId: 'nyx-foothold', spawnId: 'keeper-camp', prerequisites: ACT5_PRECONDITIONS })
  })

  it('defines the six final-region pockets with their exact functions', () => {
    expect(pocketIds.sort()).toEqual([
      'accord-overlook', 'false-sky', 'night-stair', 'nyx-foothold', 'silent-loom', 'silent-loom-approach',
    ].sort())
    expect(ACT5_POCKETS['nyx-foothold'].role).toBe('hub')
    expect(ACT5_POCKETS['night-stair'].role).toBe('traversal-combat')
    expect(ACT5_POCKETS['false-sky'].role).toBe('dungeon')
    expect(ACT5_POCKETS['silent-loom-approach'].role).toBe('combat')
    expect(ACT5_POCKETS['silent-loom'].role).toBe('boss')
    expect(ACT5_POCKETS['accord-overlook'].role).toBe('epilogue')
    for (const pocket of Object.values(ACT5_POCKETS)) {
      expect(pocket.region).toBe(ACT5_REGION_ID)
      expect(pocket.act).toBe(5)
      expect(pocket.spawns[pocket.spawnId], `${pocket.id} default spawn missing`).toBeTruthy()
    }
  })
})

describe('linear main graph and optional loops', () => {
  it('every connection references valid pockets and both named spawns', () => {
    for (const connection of ACT5_CONNECTIONS) {
      expect(act5PocketById(connection.from), `${connection.id}: missing from pocket`).toBeTruthy()
      expect(act5PocketById(connection.to), `${connection.id}: missing to pocket`).toBeTruthy()
      expect(act5SpawnById(connection.to, connection.arrivalSpawnId), `${connection.id}: arrival spawn missing`).toBeTruthy()
      expect(act5SpawnById(connection.from, connection.returnSpawnId), `${connection.id}: return spawn missing`).toBeTruthy()
    }
  })

  it('the authored pocket graph is connected in both directions', () => {
    const forward = new Map(pocketIds.map((id) => [id, []]))
    const reverse = new Map(pocketIds.map((id) => [id, []]))
    for (const edge of ACT5_CONNECTIONS) {
      forward.get(edge.from).push(edge.to)
      reverse.get(edge.to).push(edge.from)
    }
    const visit = (graph) => {
      const seen = new Set(['nyx-foothold'])
      const queue = ['nyx-foothold']
      while (queue.length) {
        const current = queue.shift()
        for (const next of graph.get(current)) {
          if (!seen.has(next)) { seen.add(next); queue.push(next) }
        }
      }
      return [...seen].sort()
    }
    expect(visit(forward)).toEqual([...pocketIds].sort())
    expect(visit(reverse)).toEqual([...pocketIds].sort())
  })

  it('gates the ascent in fixed story order', () => {
    expect(act5ConnectionById('night-stair-to-false-sky').gate[0].flagId).toBe('act5-moon-witnesses-aligned')
    expect(act5ConnectionById('false-sky-to-loom-approach').gate[0].flagId).toBe('act5-time-fractures-crossed')
    expect(act5ConnectionById('loom-approach-to-silent-loom').gate[0].flagId).toBe('act5-epithets-restored')
    expect(act5ConnectionById('silent-loom-to-overlook').gate[0].flagId).toBe('act5-last-name-witnessed')
  })

  it('provides three optional interior loops that always rejoin', () => {
    expect(ACT5_OPTIONAL_LOOPS).toHaveLength(3)
    for (const loop of ACT5_OPTIONAL_LOOPS) {
      expect(act5PocketById(loop.mapId)).toBeTruthy()
      expect(loop.required).toBe(false)
      expect(loop.entryMarkerId).not.toBe(loop.rejoinMarkerId)
    }
    expect(act5OptionalLoopById('loop-selene-overlook').questId).toBe(ACT5_SIDE_QUEST_ID)
  })
})

describe('main quest and witnessed-deed restoration', () => {
  it('contains the exact ten-step linear objective chain', () => {
    expect(ACT5_MAIN_OBJECTIVES.map((objective) => objective.id)).toEqual([
      'muster-the-witnesses',
      'cross-night-stair',
      'align-moon-witnesses',
      'turn-the-false-dawn',
      'survive-time-fractures',
      'restore-the-epithets',
      'defeat-loom-guardian',
      'confront-quiet-regent',
      'write-the-new-accord',
      'witness-the-last-name',
    ])
    expect(ACT5_MAIN_QUEST.prerequisites).toBe(ACT5_PRECONDITIONS)
    expect(ACT5_MAIN_QUEST.rewards).toContainEqual({ kind: 'flag', id: 'mq-act5-last-name-completed', value: true })
  })

  it('restores four original epithets in fixed act order through deeds', () => {
    expect(ACT5_WITNESSED_DEEDS.map((deed) => deed.act)).toEqual([1, 2, 3, 4])
    expect(ACT5_WITNESSED_DEEDS.map((deed) => deed.epithetId)).toEqual([
      'far-sighted', 'salt-covenant', 'she-who-returns', 'shared-fire',
    ])
    for (const deed of ACT5_WITNESSED_DEEDS) {
      expect(deed.witnessedDeed.length).toBeGreaterThan(30)
      expect(deed.requiredFlagId).toBeTruthy()
    }
    const restore = act5ObjectiveById('restore-the-epithets')
    expect(restore.restoration).toBe('witnessed-deeds')
    expect(restore.fixedActOrder).toEqual([1, 2, 3, 4])
    expect(restore.entityIds).toEqual(ACT5_WITNESSED_DEEDS.map((deed) => deed.sealId))
  })

  it('every objective effect flag belongs to the Act V permanent contract', () => {
    for (const objective of ACT5_MAIN_OBJECTIVES) {
      for (const effect of objective.effects || []) {
        if (effect.kind === 'flag') expect(ACT5_PERMANENT_FLAGS).toContain(effect.id)
      }
    }
  })

  it('the final choice cannot reorder or replace the epilogue objective', () => {
    const choiceIndex = ACT5_MAIN_OBJECTIVES.findIndex((objective) => objective.id === 'write-the-new-accord')
    expect(ACT5_MAIN_OBJECTIVES[choiceIndex + 1].id).toBe('witness-the-last-name')
    expect(act5ObjectiveById('write-the-new-accord').choiceIds).toEqual([
      'bounded-patrons', 'mortal-witness', 'renewed-compact',
    ])
  })
})

describe('optional light story is useful but never required', () => {
  it('has no prerequisites and restores four original star deeds', () => {
    expect(ACT5_SIDE_QUEST.prerequisites).toEqual([])
    const matching = ACT5_SIDE_QUEST.objectives.find((objective) => objective.id === 'match-star-deeds')
    expect(matching.count).toBe(4)
    expect(matching.source).toBe('witnessed-deeds')
    expect(matching.text).toMatch(/rather than.*borrowed constellation/i)
  })

  it('records independent-light evidence and an epilogue treatment only', () => {
    expect(ACT5_SIDE_QUEST.rewards).toContainEqual({ kind: 'flag', id: 'evidence-independent-light', value: true })
    expect(ACT5_SIDE_QUEST.rewards).toContainEqual({ kind: 'flag', id: 'act5-true-sky-restored', value: true })
    expect(ACT5_SIDE_QUEST.rewards.find((reward) => reward.kind === 'epilogue').treatment).toBe('plural-true-sky')
    expect(ACT5_SIDE_QUEST.skippedFallback.valid).toBe(true)
    expect(ACT5_SIDE_QUEST.skippedFallback.bossModifier).toBeNull()
  })

  it('optional flags and side objectives never gate the main path', () => {
    const main = JSON.stringify({ objectives: ACT5_MAIN_OBJECTIVES, connections: ACT5_CONNECTIONS })
    for (const flag of ACT5_OPTIONAL_FLAG_IDS) expect(main).not.toContain(flag)
    const mainIds = new Set(ACT5_MAIN_OBJECTIVES.map((objective) => objective.id))
    for (const objective of ACT5_SIDE_QUEST.objectives) expect(mainIds.has(objective.id)).toBe(false)
  })
})

describe('canonical deterministic encounters', () => {
  it('defines the three fixed encounters and two final bosses', () => {
    expect(Object.keys(ACT5_ENCOUNTERS).sort()).toEqual([
      'boss-act5-loom-guardian',
      'boss-act5-quiet-regent',
      'enc-act5-false-sky',
      'enc-act5-loom-approach',
      'enc-act5-night-stair',
    ].sort())
  })

  it('uses only canonical base monsters and no arena campaign level', () => {
    for (const encounter of Object.values(ACT5_ENCOUNTERS)) {
      expect(encounter.campaignLevelId).toBeNull()
      expect(encounter.order.length).toBeGreaterThan(0)
      for (const monsterId of encounter.order) {
        expect(MONSTER_TYPES[monsterId], `${encounter.id}: unknown ${monsterId}`).toBeTruthy()
      }
    }
  })

  it('matches the authored fixed encounter compositions', () => {
    expect(ACT5_ENCOUNTERS['enc-act5-night-stair'].order).toEqual(['chronos', 'medusa', 'sphinx', 'chronos', 'cerberus'])
    expect(ACT5_ENCOUNTERS['enc-act5-false-sky'].order).toEqual(['chronos', 'minotaur', 'sphinx', 'atlas'])
    expect(ACT5_ENCOUNTERS['enc-act5-loom-approach'].order).toEqual(['hydra', 'cerberus', 'medusa', 'minotaur', 'sphinx'])
  })

  it('gives every encounter a stable unique seed, flag, owner, and checkpoint', () => {
    const seeds = []
    for (const encounter of Object.values(ACT5_ENCOUNTERS)) {
      expect(Number.isInteger(encounter.seed)).toBe(true)
      seeds.push(encounter.seed)
      expect(ACT5_PERMANENT_FLAGS).toContain(encounter.completionFlag)
      expect(ACT5_ENCOUNTER_OWNER_QUEST[encounter.id]).toBe(ACT5_MAIN_QUEST_ID)
      expect(act5SavePointById(encounter.checkpointId)).toBeTruthy()
      expect(encounter.repeatable).toBe(false)
    }
    expect(new Set(seeds).size).toBe(seeds.length)
  })

  it('models the Guardian and Regent as distinct fixed boss contracts', () => {
    const guardian = ACT5_ENCOUNTERS['boss-act5-loom-guardian']
    expect(guardian.boss.core.baseMonsterType).toBe('atlas')
    expect(guardian.boss.phases).toHaveLength(3)
    expect(guardian.boss.overlays[0]).toMatchObject({ kind: 'suppressible-seals', count: 4, targetable: true })
    const regent = ACT5_ENCOUNTERS['boss-act5-quiet-regent']
    expect(regent.boss.identity).toBe('damas-quiet-regent')
    expect(regent.boss.humanScale).toBe(true)
    expect(regent.boss.testimonyInterruptRequired).toBe(true)
    expect(regent.resolution.executionPrompt).toBe(false)
  })
})

describe('Nyx shadows, Helios mirrors, and authored time', () => {
  it('defines three finite light-polarity states with non-color semantics', () => {
    expect(Object.keys(ACT5_LIGHT_POLARITY_STATES).sort()).toEqual(['moon', 'shadow', 'sun'])
    expect(ACT5_LIGHT_POLARITY_RULES.stateIds).toEqual(['shadow', 'moon', 'sun'])
    expect(ACT5_LIGHT_POLARITY_RULES.shapeCoded).toBe(true)
    expect(ACT5_LIGHT_POLARITY_RULES.colorOnly).toBe(false)
    for (const state of Object.values(ACT5_LIGHT_POLARITY_STATES)) {
      expect(ACT5_LIGHT_POLARITY_RULES.switchSources).toContain(state.controller)
      expect(state.shapeGlyph.length).toBeGreaterThan(0)
      expect(state.label.length).toBeGreaterThan(0)
    }
    expect(ACT5_LIGHT_POLARITY_RULES.switchSources).toEqual(['nyx-seal', 'selene-witness', 'sun-mirror'])
  })

  it('authors a valid immutable light state for every arrival, return, and checkpoint spawn', () => {
    for (const pocket of Object.values(ACT5_POCKETS)) {
      for (const spawn of Object.values(pocket.spawns)) {
        expect(ACT5_LIGHT_POLARITY_STATES[spawn.arrivalState.lightStateId], `${pocket.id}:${spawn.id}`).toBeTruthy()
        expect(Object.isFrozen(spawn.arrivalState), `${pocket.id}:${spawn.id}`).toBe(true)
      }
    }
    for (const savePoint of Object.values(ACT5_SAVE_POINTS)) {
      const spawn = ACT5_POCKETS[savePoint.mapId].spawns[savePoint.spawnId]
      expect(ACT5_LIGHT_POLARITY_STATES[spawn.arrivalState.lightStateId], savePoint.id).toBeTruthy()
    }
  })

  it('never hides navigation or accessibility semantics during erasure', () => {
    expect(ACT5_LIGHT_POLARITY_RULES.cannotHide).toEqual([
      'objective-direction', 'interaction-label', 'subtitle', 'accessibility-name', 'save-point-identity',
    ])
    expect(ACT5_LIGHT_POLARITY_RULES.patronPowersMayBypassTraversal).toBe(false)
  })

  it('limits fractures to two authored snapshots without rewinding state', () => {
    expect(Object.keys(ACT5_TIME_FRACTURE_STATES).sort()).toEqual(['fracture-a', 'fracture-b'])
    expect(ACT5_TIME_FRACTURE_RULES.order).toEqual(['fracture-a', 'fracture-b'])
    expect(ACT5_TIME_FRACTURE_RULES.deterministic).toBe(true)
    for (const key of ['recordsPlayerInput', 'rewindsDamage', 'rewindsCooldowns', 'rewindsInventory', 'rewindsQuestEvents', 'rewindsSaves']) {
      expect(ACT5_TIME_FRACTURE_RULES[key], key).toBe(false)
    }
  })

  it('keeps Nyx and Helios mythology-specific but non-required', () => {
    expect(ACT5_DEITY_ROLES.nyx).toMatchObject({ deityId: 'nyx', powerId: 'primordialDark', requiredPowerUse: false })
    expect(ACT5_DEITY_ROLES.helios).toMatchObject({ deityId: 'helios', powerId: 'sunChariot', requiredPowerUse: false })
    expect(ACT5_DEITY_ROLES.helios.role).toMatch(/mirror interaction always remains sufficient/i)
  })
})

describe('conversations and witness fallback', () => {
  it('every conversation starts at a real node and all next links resolve', () => {
    for (const conversation of Object.values(ACT5_CONVERSATIONS)) {
      expect(conversation.nodes[conversation.start], `${conversation.id}: start missing`).toBeTruthy()
      for (const node of Object.values(conversation.nodes)) {
        if (node.next) expect(conversation.nodes[node.next], `${conversation.id}: next ${node.next} missing`).toBeTruthy()
        for (const choice of node.choices || []) {
          expect(conversation.nodes[choice.next], `${conversation.id}: choice next ${choice.next} missing`).toBeTruthy()
        }
      }
    }
  })

  it('uses Ianthe when available and an unconditional Keeper fallback otherwise', () => {
    const rule = ACT5_WITNESS_RULES['regent-interruption-witness']
    expect(rule.preferred.npcId).toBe('ianthe')
    expect(rule.fallback).toEqual({ npcId: 'melite', alwaysValid: true })
    expect(rule.exactlyOne).toBe(true)
    expect(rule.changesObjectiveGraph).toBe(false)
    expect(act5ObjectiveById('confront-quiet-regent').requiredWitnessRuleId).toBe(rule.id)
  })

  it('states Elia\'s refusal condition as the final reversal', () => {
    const conversation = act5ConversationById('act5-regent-interruption')
    expect(conversation.nodes['elia-condition'].text).toMatch(/refusal remain inside every future agreement/i)
    expect(conversation.nodes['choose-witness'].choices).toHaveLength(2)
  })

  it('answers each Regent witness with testimony-specific language', () => {
    const conversation = act5ConversationById('act5-regent-interruption')
    const choices = Object.fromEntries(conversation.nodes['choose-witness'].choices.map((choice) => [choice.id, choice]))
    expect(choices['ianthe-testimony'].next).toBe('elia-condition')
    expect(choices['keeper-testimony'].next).toBe('keeper-condition')
    expect(conversation.nodes['keeper-condition'].text).toMatch(/Melite kept both terms in the neutral record/i)
    expect(conversation.nodes['keeper-condition'].text).toMatch(/every witness may refuse/i)
  })

  it('authors three-light optional routing without replacing main/default NPC scenes', () => {
    expect(act5RuntimeEntityById('night-stair', 'selene')).toMatchObject({
      conversationId: 'act5-selene-reflection',
      optionalConversationIds: ['act5-three-lights'],
    })
    expect(act5RuntimeEntityById('false-sky', 'helios')).toMatchObject({
      conversationId: 'act5-helios-false-dawn',
      optionalConversationIds: ['act5-three-lights'],
    })
    expect(act5RuntimeEntityById('false-sky', 'apollo')).toMatchObject({
      conversationId: 'act5-three-lights',
      optionalConversationIds: ['act5-three-lights'],
    })
  })

  it('keeps independent-light evidence solely on optional quest completion', () => {
    const conversation = act5ConversationById('act5-three-lights')
    const conversationEffects = Object.values(conversation.nodes).flatMap((node) => node.effects || [])
    expect(conversationEffects).not.toContainEqual({ kind: 'flag', id: 'evidence-independent-light', value: true })
    expect(ACT5_SIDE_QUEST.rewards).toContainEqual({ kind: 'flag', id: 'evidence-independent-light', value: true })
  })
})

describe('ending eligibility changes world and epilogue, never mission order', () => {
  it('defines the three constitutional forms and one always-valid fallback', () => {
    expect(ACT5_ENDING_VARIANTS.map((ending) => ending.id)).toEqual([
      'bounded-patrons', 'mortal-witness', 'renewed-compact',
    ])
    expect(ACT5_ENDING_VARIANTS.filter((ending) => ending.fallback)).toHaveLength(1)
    expect(act5EndingById('renewed-compact').limitedFallback).toMatchObject({
      valid: true, endingId: 'renewed-compact-limited',
    })
  })

  it('every ending completes the same quest objective and exposes a cost', () => {
    for (const ending of ACT5_ENDING_VARIANTS) {
      expect(ending.completesQuestId).toBe(ACT5_MAIN_QUEST_ID)
      expect(ending.completesObjectiveId).toBe('write-the-new-accord')
      expect(ending.promise.length).toBeGreaterThan(20)
      expect(ending.cost.length).toBeGreaterThan(20)
      expect(ending.worldState).toBeTruthy()
      expect(ending.objectiveOverrides).toBeUndefined()
      expect(ending.nextQuestId).toBeUndefined()
    }
  })

  it('independent-light improves only the plural ending safeguards', () => {
    expect(act5EndingById('renewed-compact').safeguardEvidence).toContain('evidence-independent-light')
    expect(act5EndingById('bounded-patrons').safeguardEvidence).not.toContain('evidence-independent-light')
    expect(act5EndingById('mortal-witness').safeguardEvidence).not.toContain('evidence-independent-light')
  })
})

describe('save boundaries and final world state', () => {
  it('all six documented save points target valid pockets and spawns', () => {
    expect(Object.keys(ACT5_SAVE_POINTS)).toHaveLength(6)
    for (const savePoint of Object.values(ACT5_SAVE_POINTS)) {
      expect(act5PocketById(savePoint.mapId), `${savePoint.id}: pocket missing`).toBeTruthy()
      expect(act5SpawnById(savePoint.mapId, savePoint.spawnId), `${savePoint.id}: spawn missing`).toBeTruthy()
    }
  })

  it('checkpoints only between the two bosses, never in active combat', () => {
    const guardian = ACT5_ENCOUNTERS['boss-act5-loom-guardian']
    const regent = ACT5_ENCOUNTERS['boss-act5-quiet-regent']
    expect(guardian.returnSpawnId).toBe('regent-phase')
    expect(regent.checkpointId).toBe('checkpoint-loom-guardian')
    expect(ACT5_SAVE_POINTS['checkpoint-loom-guardian'].note).toMatch(/never active combat/i)
  })

  it('the final save records ending ID and never respawns a boss', () => {
    const finalSave = ACT5_SAVE_POINTS['checkpoint-act5-epilogue']
    expect(finalSave).toMatchObject({ mapId: 'accord-overlook', spawnId: 'epilogue', recordsEndingId: true, bossesRemainDefeated: true })
    expect(ACT5_REGION.exit.effects).toContainEqual({ kind: 'save', savePointId: 'checkpoint-act5-epilogue', recordsEndingId: true })
  })

  it('warns before disabling long-range travel and keeps Nyx Foothold safe', () => {
    expect(ACT5_POINT_OF_NO_RETURN.connectionId).toBe('false-sky-to-loom-approach')
    expect(ACT5_POINT_OF_NO_RETURN.warningRequired).toBe(true)
    expect(ACT5_POINT_OF_NO_RETURN.disablesLongRangeTravel).toBe(true)
    expect(ACT5_POINT_OF_NO_RETURN.safeReturnMapId).toBe('nyx-foothold')
    expect(ACT5_POINT_OF_NO_RETURN.reopensAfterFlagId).toBe('mq-act5-last-name-completed')
  })
})

describe('namespacing, immutability, and null-safe lookups', () => {
  it('keeps permanent flags unique and namespaced', () => {
    expect(new Set(ACT5_PERMANENT_FLAGS).size).toBe(ACT5_PERMANENT_FLAGS.length)
    for (const flag of ACT5_PERMANENT_FLAGS) {
      expect(flag.startsWith('act5-') || flag.startsWith('mq-act5-'), flag).toBe(true)
    }
    expect(ACT5_SHARED_FLAG_IDS).toEqual(['evidence-independent-light'])
  })

  it('freezes top-level and nested authored structures', () => {
    for (const value of [ACT5_POCKETS, ACT5_CONNECTIONS, ACT5_MAIN_QUEST, ACT5_ENCOUNTERS, ACT5_CONVERSATIONS, ACT5_ENDING_VARIANTS, ACT5_REGION]) {
      expect(Object.isFrozen(value)).toBe(true)
    }
    const order = ACT5_ENCOUNTERS['enc-act5-night-stair'].order
    expect(Object.isFrozen(order)).toBe(true)
    expect(() => order.push('hydra')).toThrow()
  })

  it('returns null for unknown IDs across every lookup', () => {
    expect(act5PocketById('nope')).toBeNull()
    expect(act5SpawnById('nyx-foothold', 'nope')).toBeNull()
    expect(act5ConnectionById('nope')).toBeNull()
    expect(act5OptionalLoopById('nope')).toBeNull()
    expect(act5EncounterById('nope')).toBeNull()
    expect(act5QuestById('nope')).toBeNull()
    expect(act5ObjectiveById('nope')).toBeNull()
    expect(act5ConversationById('nope')).toBeNull()
    expect(act5EndingById('nope')).toBeNull()
    expect(act5SavePointById('nope')).toBeNull()
    expect(act5LightPolarityById('nope')).toBeNull()
    expect(act5TimeFractureById('nope')).toBeNull()
    expect(act5CompletionFlagForEncounter('nope')).toBeNull()
  })

  it('resolves known IDs to exact authored values', () => {
    expect(act5PocketById('nyx-foothold')).toBe(ACT5_POCKETS['nyx-foothold'])
    expect(act5SpawnById('accord-overlook', 'epilogue').id).toBe('epilogue')
    expect(act5QuestById(ACT5_MAIN_QUEST_ID)).toBe(ACT5_MAIN_QUEST)
    expect(act5QuestById(ACT5_SIDE_QUEST_ID)).toBe(ACT5_SIDE_QUEST)
    expect(act5EncounterById('boss-act5-quiet-regent').boss.identity).toBe('damas-quiet-regent')
    expect(act5ConversationById('act5-nyx-muster').start).toBe('thessa-record')
    expect(act5EndingById('bounded-patrons').threshold.authority).toBe(3)
    expect(act5SavePointById('checkpoint-act5-epilogue').recordsEndingId).toBe(true)
    expect(act5LightPolarityById('shadow').controller).toBe('nyx-seal')
    expect(act5TimeFractureById('fracture-b').roomSnapshot).toBe('b')
    expect(act5CompletionFlagForEncounter('enc-act5-false-sky')).toBe('act5-false-sky-cleared')
  })
})
