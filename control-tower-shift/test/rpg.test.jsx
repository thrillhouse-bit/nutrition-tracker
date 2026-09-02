// @vitest-environment jsdom
//
// Focused RPG layer tests for the Oathbearer vertical slice
// (`/#control-tower-rpg`). Covers: exact hash routing, schema-v1 spawn, quest
// ordering/once-only, optional-vs-main independence, canonical patron loadouts,
// shrine/combat patron gating, save round-trip + corrupt/future/unknown
// recovery, and exactly-once combat victory / checkpoint-restore with a fixed
// seed.
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../../src/api/client.js', () => ({
  api: {
    me: vi.fn(async () => ({ user: { id: 91, email: 'rpg-route@example.test', legalAcceptanceRequired: false } })),
    getRpgSave: vi.fn(async () => ({ save: null })),
    putRpgSave: vi.fn(async ({ payload, gameSchemaVersion }) => ({
      save: { payload, gameSchemaVersion, revision: 1 },
      idempotent: false,
    })),
    logout: vi.fn(async () => ({})),
  },
}))

const {
  default: GameGate, GAME_HASH, RPG_HASH, routeFor,
} = await import('../src/GameGate.jsx')
// Preload the lazy chunks so GameGate's Suspense resolves from module cache.
await import('../src/ControlTowerShift.jsx')
await import('../src/RPGAccountGate.jsx')
const { default: ControlTowerRPG } = await import('../src/ControlTowerRPG.jsx')
const {
  createInitialState, applyEvent, SCHEMA_VERSION,
  START_MAP, START_SPAWN, seedForEncounter,
  questProgress, currentObjective, isEncounterCleared,
} = await import('../src/rpg/state.js')
const {
  migrateSave, normalizeState, saveRPG, loadRPG, hasSave, clearSave,
  RPG_SAVE_KEY,
} = await import('../src/rpg/save.js')
const {
  TIER1_PATRON_IDS, mapById, encounterById, questDefById,
} = await import('../src/rpg/content.js')
const {
  powersForGod, GODS_TIER_1, resolveMonsterType,
} = await import('../src/game/index.js')
const {
  startEncounter, stepCombat,
  OUTCOME_WON, OUTCOME_FAILED, OUTCOME_NONE,
} = await import('../src/rpg/combatAdapter.js')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
const mount = async (el) => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(el))
}
const unmount = async () => {
  if (root) await act(async () => root.unmount())
  if (container) document.body.removeChild(container)
  container = root = null
}

afterEach(async () => {
  await unmount()
  window.location.hash = ''
  if (window.localStorage) window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('exact hash routing — arena, RPG, and main app stay independent', () => {
  it('routeFor distinguishes the two game hashes from the app', () => {
    expect(routeFor(GAME_HASH)).toBe('arena')
    expect(routeFor(RPG_HASH)).toBe('rpg')
    expect(routeFor('')).toBeNull()
    expect(routeFor('#control-tower')).toBe('arena')
    expect(routeFor('#control-tower-rpg')).toBe('rpg')
  })

  it('the RPG hash can never resolve to the arena route', () => {
    expect(routeFor('#control-tower-rpg')).not.toBe('arena')
    // Prefix safety: an extra token after the RPG hash is NOT the RPG route.
    expect(routeFor('#control-tower-rpg/level')).toBeNull()
  })

  it('mounts the arena at GAME_HASH and the RPG at RPG_HASH', async () => {
    window.location.hash = GAME_HASH
    await mount(<GameGate app={<div data-testid="the-app">app</div>} />)
    await act(async () => {})
    expect(container.querySelector('[data-testid="the-app"]')).toBeNull()
    // The arena's own HUD marker is present, the RPG route is not.
    expect(container.textContent).not.toContain('Control Tower — Oathbearer')
    await unmount()

    window.location.hash = RPG_HASH
    await mount(<GameGate app={<div data-testid="the-app">app</div>} />)
    // The route resolves both the account boundary and account-owned save
    // before exposing title actions; neither loading layer may be bypassed.
    for (let i = 0; i < 8 && !container.textContent.includes('Control Tower — Oathbearer'); i++) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    }
    expect(container.querySelector('[data-testid="the-app"]')).toBeNull()
    expect(container.textContent).toContain('Control Tower — Oathbearer')
    const newStory = [...container.querySelectorAll('button')].find((button) => button.textContent === 'New Story')
    const continueStory = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue')
    expect(newStory).toBeDefined()
    expect(continueStory.disabled).toBe(true)
    await act(async () => newStory.click())
    expect(container.textContent).toContain('Talk to Thessa')
    expect(container.querySelector('[aria-label="Move up"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Move down"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Move left"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Move right"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Dash"]')).not.toBeNull()
  })
})

describe('schema v1 + documented spawn', () => {
  it('a fresh save is schema v1 and starts at the Beacon Overlook start', () => {
    const s = createInitialState()
    expect(s.schemaVersion).toBe(SCHEMA_VERSION)
    expect(SCHEMA_VERSION).toBe(3)
    expect(s.world.mapId).toBe(START_MAP)
    expect(s.world.spawnId).toBe(START_SPAWN)
    const spawn = mapById(START_MAP).spawn
    expect(s.world.position.x).toBe(spawn.x)
    expect(s.world.position.y).toBe(spawn.y)
    expect(s.status).toBe('playing')
    expect(s.protagonist.activePatronId).toBeNull()
  })

  it('the main quest begins one step in (spawn reached) and is active', () => {
    const s = createInitialState()
    const q = questProgress(s, s.mainQuestId)
    expect(q.state).toBe('active')
    const def = questDefById(s.mainQuestId)
    expect(def.kind).toBe('main')
    expect(q.objectiveIndex).toBe(1) // objective 0 (reach start) is satisfied by spawn
    expect(currentObjective(s)).toBe(def.objectives[1]) // talk to Thessa
  })

  it('the optional lost-witness quest does NOT start by default', () => {
    const s = createInitialState()
    expect(s.quests['sq-lost-witness']).toBeUndefined()
  })
})

describe('story entry and dialogue controls', () => {
  it('opens the integrated wilderness and crafting systems journal from the live HUD', async () => {
    let prepared = createInitialState()
    prepared = applyEvent(prepared, { type: 'INTERACT', entityId: 'shrine' })
    prepared = applyEvent(prepared, { type: 'CHOOSE_PATRON', godId: 'apollo' })
    expect(saveRPG(window.localStorage, prepared)).toBe(true)
    await mount(<ControlTowerRPG />)
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue').click())

    const systems = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Systems')
    expect(systems).toBeTruthy()
    await act(async () => systems.click())
    expect(container.querySelector('[aria-label="Systems journal"]')).not.toBeNull()
    expect(container.textContent).toContain('Olive Road')

    const crafting = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Crafting')
    await act(async () => crafting.click())
    expect(container.textContent).toContain('Bronze Forge')
  })

  it('continues a valid save and Skip dismisses dialogue while preserving its deterministic effect', async () => {
    let positioned = createInitialState()
    positioned = applyEvent(positioned, { type: 'MOVE', x: 662, y: 280, facing: 1 })
    expect(saveRPG(window.localStorage, positioned)).toBe(true)
    await mount(<ControlTowerRPG />)

    const continueButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue')
    expect(continueButton.disabled).toBe(false)
    await act(async () => continueButton.click())

    const interact = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Interact')
    await act(async () => interact.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(container.textContent).toContain('Far-Sighted is already bleeding out')

    const skip = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Skip')
    await act(async () => skip.click())
    expect(container.textContent).not.toContain('Far-Sighted is already bleeding out')
    expect(container.textContent).toContain('First Patron Shrine')
  })

  it('stages authored combat frozen until an explicit ready action, then pauses and resumes safely', async () => {
    let now = 1_000
    let nextRafId = 1
    const rafCallbacks = new Map()
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextRafId++
      rafCallbacks.set(id, callback)
      return id
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { rafCallbacks.delete(id) })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const advanceFrames = async (count, elapsed = 34) => {
      await act(async () => {
        for (let index = 0; index < count; index += 1) {
          now += elapsed
          const callbacks = [...rafCallbacks.values()]
          rafCallbacks.clear()
          for (const callback of callbacks) callback(now)
        }
      })
    }

    let prepared = createInitialState()
    prepared = applyEvent(prepared, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
    prepared = applyEvent(prepared, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
    prepared = applyEvent(prepared, { type: 'INTERACT', entityId: 'shrine' })
    prepared = applyEvent(prepared, { type: 'CHOOSE_PATRON', godId: 'apollo' })
    prepared = applyEvent(prepared, { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' })
    const gate = mapById('olive-road').exits.find((exit) => exit.kind === 'combat')
    prepared = applyEvent(prepared, { type: 'MOVE', x: gate.x, y: gate.y, facing: 1 })
    expect(saveRPG(window.localStorage, prepared)).toBe(true)
    await mount(<ControlTowerRPG />)
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue').click())
    const interact = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Interact')
    await act(async () => interact.dispatchEvent(new Event('pointerdown', { bubbles: true })))

    expect(container.querySelector('[aria-label="Combat controls"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Melee attack"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Move up"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Move down"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Move left"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Move right"]')).not.toBeNull()
    expect(container.textContent).toContain('Solar Bow')
    expect(container.textContent).toContain('Radiant Burst')
    expect(container.textContent).toContain('Golden Lyre')

    const combatCanvas = container.querySelector('canvas[aria-label="Acropolis Entry Court combat view"]')
    const combatHud = container.querySelector('[data-testid="combat-hud"]')
    const melee = container.querySelector('[aria-label="Melee attack"]')
    const solarBow = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('Solar Bow'))
    const pause = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Pause')
    const begin = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Begin encounter')
    expect(combatCanvas).not.toBeNull()
    expect(combatHud).not.toBeNull()
    expect(begin).toBeTruthy()
    expect(begin.className).toContain('min-h-12')
    expect(combatCanvas.dataset.combatReady).toBe('false')
    expect(combatHud.dataset.arenaTick).toBe('0')
    expect(combatHud.dataset.arenaHealth).toBe('100')
    expect(melee.disabled).toBe(true)
    expect(solarBow.disabled).toBe(true)
    expect(pause.disabled).toBe(false)

    // Pausing the staged scene is allowed, but Resume must return to the same
    // frozen, unarmed boundary rather than implicitly beginning combat.
    await act(async () => pause.click())
    expect(container.textContent).toContain('Paused')
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Resume').click())
    expect(combatCanvas.dataset.combatReady).toBe('false')
    expect(combatHud.dataset.arenaTick).toBe('0')

    // More than the 19.7 seconds required for the unattended deterministic
    // failure may pass while a player/tool reads the mounted UI. The arena must
    // remain exactly at its initial boundary until Begin is activated.
    await advanceFrames(700)
    expect(combatHud.dataset.arenaTick).toBe('0')
    expect(combatHud.dataset.arenaHealth).toBe('100')
    expect(container.textContent).not.toContain('You Fell')

    await act(async () => begin.click())
    expect(combatCanvas.dataset.combatReady).toBe('true')
    expect(melee.disabled).toBe(false)
    expect(solarBow.disabled).toBe(false)
    expect(pause.disabled).toBe(false)

    // Arming creates a fresh timing origin/accumulator. The first 250ms cannot
    // inherit the long staging delay and remains a healthy, unsettled fight.
    await advanceFrames(7)
    expect(Number(combatHud.dataset.arenaTick)).toBeGreaterThan(0)
    expect(Number(combatHud.dataset.arenaTick)).toBeLessThanOrEqual(7)
    expect(combatHud.dataset.arenaHealth).toBe('100')
    expect(container.textContent).not.toContain('You Fell')

    await act(async () => pause.click())
    expect(container.textContent).toContain('Paused')
    expect(container.textContent).toContain('Resume')
    const pausedTick = combatHud.dataset.arenaTick
    await advanceFrames(20)
    expect(combatHud.dataset.arenaTick).toBe(pausedTick)

    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Resume').click())
    await advanceFrames(2)
    expect(Number(combatHud.dataset.arenaTick)).toBeGreaterThan(Number(pausedTick))
  })

  it('stages wilderness combat behind the same explicit ready boundary', async () => {
    let prepared = createInitialState()
    prepared = applyEvent(prepared, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
    prepared = applyEvent(prepared, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
    prepared = applyEvent(prepared, { type: 'INTERACT', entityId: 'shrine' })
    prepared = applyEvent(prepared, { type: 'CHOOSE_PATRON', godId: 'apollo' })
    prepared = applyEvent(prepared, { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' })
    prepared = applyEvent(prepared, { type: 'WILDERNESS_ENTER', regionId: 'olive-road' })
    prepared = {
      ...prepared,
      wilderness: { ...prepared.wilderness, pendingEnemyId: 'wild-boar', step: 3 },
    }
    expect(saveRPG(window.localStorage, prepared)).toBe(true)
    await mount(<ControlTowerRPG />)
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue').click())
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Systems').click())

    const engage = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Engage Wild Boar')
    expect(engage).toBeTruthy()
    await act(async () => engage.click())

    const hud = container.querySelector('[data-testid="combat-hud"]')
    const begin = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Begin encounter')
    expect(hud).not.toBeNull()
    expect(hud.textContent).toContain('Wild Boar')
    expect(hud.dataset.arenaTick).toBe('0')
    expect(hud.dataset.combatReady).toBe('false')
    expect(container.querySelector('[aria-label="Melee attack"]').disabled).toBe(true)
    expect(begin).toBeTruthy()

    await act(async () => begin.click())
    expect(hud.dataset.combatReady).toBe('true')
    expect(container.querySelector('[aria-label="Melee attack"]').disabled).toBe(false)
  })

  it('loads Pelagos with Melite and advances the first Act II objective by Skip', async () => {
    let prepared = createInitialState()
    prepared = {
      ...prepared,
      status: 'ending',
      quests: {
        ...prepared.quests,
        'mq-act1-ash-at-dawn': {
          ...prepared.quests['mq-act1-ash-at-dawn'],
          state: 'completed',
          objectiveIndex: questDefById('mq-act1-ash-at-dawn').objectives.length,
        },
      },
      inventory: { ...prepared.inventory, epithetFragments: ['far-sighted'] },
    }
    prepared = applyEvent(prepared, { type: 'BEGIN_ACT', act: 2 })
    prepared = applyEvent(prepared, { type: 'MOVE', x: 232, y: 352, facing: 1 })
    expect(saveRPG(window.localStorage, prepared)).toBe(true)

    await mount(<ControlTowerRPG />)
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue').click())
    expect(container.textContent).toContain('Act II')
    expect(container.textContent).toContain('Talk to Melite')
    expect(container.textContent).toContain('Ebb — the causeway lies dry')

    const interact = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Interact')
    await act(async () => interact.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(container.textContent).toContain('The tide remembers every crossing')
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Skip').click())
    expect(container.textContent).toContain('Cross the breakwater and learn the tide-state telegraph')

    const { save } = loadRPG(window.localStorage)
    expect(save.world.mapId).toBe('pelagos-harbor')
    expect(save.flags['act2:tide-state']).toBe('ebb')
    expect(save.quests['mq-act2-salt-covenant'].objectiveIndex).toBe(1)
  })
})

describe('quest events advance objectives only in order and only once', () => {
  it('talking to Thessa advances talk-thessa (in order)', () => {
    let s = createInitialState()
    expect(currentObjective(s).id).toBe('talk-thessa')
    s = applyEvent(s, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
    expect(s.status).toBe('in-dialogue')
    s = applyEvent(s, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
    expect(s.status).toBe('playing')
    expect(currentObjective(s).id).toBe('choose-patron')
    // Repeating the conversation later does NOT re-advance (once-only).
    const idxAfter = currentObjective(s).id
    s = applyEvent(s, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
    s = applyEvent(s, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
    expect(currentObjective(s).id).toBe(idxAfter)
  })

  it('a wrong-map or wrong-entity objective does not advance the main quest', () => {
    let s = createInitialState()
    // Reaching Olive Road while the current objective is talk-thessa changes nothing.
    const before = currentObjective(s).id
    s = applyEvent(s, { type: 'REACH', mapId: 'olive-road', markerId: 'from-beacon' })
    expect(currentObjective(s).id).toBe(before)
  })

  it('traversing to Olive Road advances reach-olive-road only when current', () => {
    let s = createInitialState()
    s = applyEvent(s, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
    s = applyEvent(s, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
    // choose a patron at the shrine
    s = applyEvent(s, { type: 'INTERACT', entityId: 'shrine' })
    s = applyEvent(s, { type: 'CHOOSE_PATRON', godId: TIER1_PATRON_IDS[0] })
    expect(currentObjective(s).id).toBe('reach-olive-road')
    s = applyEvent(s, { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' })
    expect(s.world.mapId).toBe('olive-road')
    expect(currentObjective(s).id).toBe('clear-entry')
  })

  it('the clear-encounter objective completes exactly once and does not end Act I early', () => {
    let s = createInitialState()
    s = applyEvent(s, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
    s = applyEvent(s, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
    s = applyEvent(s, { type: 'INTERACT', entityId: 'shrine' })
    s = applyEvent(s, { type: 'CHOOSE_PATRON', godId: TIER1_PATRON_IDS[0] })
    s = applyEvent(s, { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' })
    // enter the encounter
    const enc = encounterById('enc-act1-entry')
    s = applyEvent(s, { type: 'ENTER_ENCOUNTER', encounterId: 'enc-act1-entry' })
    expect(s.status).toBe('in-combat')
    expect(isEncounterCleared(s, 'enc-act1-entry')).toBe(false)
    // victory
    s = applyEvent(s, { type: 'COMBAT_WON', encounterId: 'enc-act1-entry' })
    expect(s.status).toBe('playing')
    expect(isEncounterCleared(s, 'enc-act1-entry')).toBe(true)
    expect(s.flags[enc.completionFlag]).toBe(true)
    // Act I must NOT complete after Entry Court alone: the quest stays active
    // and the next objective is exactly clear-sun.
    const q = questProgress(s, s.mainQuestId)
    expect(q.state).toBe('active')
    expect(currentObjective(s)).toMatchObject({ kind: 'clear-encounter', encounterId: 'enc-act1-sun' })
    expect(s.flags['mq-act1-ash-at-dawn-complete']).not.toBe(true)
    // A repeated victory event must not re-advance or crash.
    const after = { ...s }
    const replay = applyEvent(s, { type: 'COMBAT_WON', encounterId: 'enc-act1-entry' })
    expect(replay.quests[s.mainQuestId]).toEqual(after.quests[s.mainQuestId])
    expect(isEncounterCleared(replay, 'enc-act1-entry')).toBe(true)
  })
})

describe('optional quest does not gate the main quest', () => {
  it('reading the tablet auto-accepts the side quest; ignoring it never blocks the main path', () => {
    let s = createInitialState()
    // On Beacon Overlook first: with no shrine/patron, the main path still
    // flows even when the optional tablet is never touched.
    s = applyEvent(s, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
    s = applyEvent(s, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
    s = applyEvent(s, { type: 'INTERACT', entityId: 'shrine' })
    s = applyEvent(s, { type: 'CHOOSE_PATRON', godId: TIER1_PATRON_IDS[0] })
    s = applyEvent(s, { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' })
    // Even though the side quest is untouched, the main objective is clear-entry.
    expect(currentObjective(s).id).toBe('clear-entry')

    // Now interact with the optional tablet: it starts the side quest.
    const tab = applyEvent(s, { type: 'INTERACT', entityId: 'tablet' })
    expect(tab.quests['sq-lost-witness']).toBeDefined()
    expect(tab.quests['sq-lost-witness'].state).toBe('active')
    // The main quest is unaffected by starting the side quest.
    expect(tab.quests[s.mainQuestId]).toEqual(s.quests[s.mainQuestId])
    expect(isEncounterCleared(tab, 'enc-act1-entry')).toBe(false)
  })
})

describe('every selectable Tier 1 patron resolves via the canonical loadout', () => {
  it('each Tier 1 patron map to a non-empty powersForGod loadout', () => {
    expect(TIER1_PATRON_IDS.length).toBeGreaterThan(0)
    for (const godId of TIER1_PATRON_IDS) {
      const keys = powersForGod(godId)
      expect(keys.length, `${godId} has no loadout`).toBeGreaterThan(0)
      // The god is a real, selectable Tier 1 patron.
      expect(GODS_TIER_1.some((g) => g.key === godId)).toBe(true)
    }
  })

  it('choosing any Tier 1 patron at the shrine binds it', () => {
    for (const godId of TIER1_PATRON_IDS) {
      let s = createInitialState()
      s = applyEvent(s, { type: 'INTERACT', entityId: 'shrine' })
      s = applyEvent(s, { type: 'CHOOSE_PATRON', godId })
      expect(s.protagonist.activePatronId).toBe(godId)
      expect(s.protagonist.unlockedPatronIds).toContain(godId)
    }
  })
})

describe('patron changes: rejected in combat, accepted at the shrine', () => {
  it('rejects a patron choice during combat', () => {
    let s = createInitialState()
    s = applyEvent(s, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
    s = applyEvent(s, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
    s = applyEvent(s, { type: 'INTERACT', entityId: 'shrine' })
    s = applyEvent(s, { type: 'CHOOSE_PATRON', godId: TIER1_PATRON_IDS[0] })
    s = applyEvent(s, { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' })
    s = applyEvent(s, { type: 'ENTER_ENCOUNTER', encounterId: 'enc-act1-entry' })
    expect(s.status).toBe('in-combat')
    const before = s.protagonist.activePatronId
    const rejected = applyEvent(s, { type: 'CHOOSE_PATRON', godId: TIER1_PATRON_IDS[1] })
    expect(rejected.protagonist.activePatronId).toBe(before)
  })

  it('accepts a patron change at the shrine outside combat', () => {
    let s = createInitialState()
    s = applyEvent(s, { type: 'INTERACT', entityId: 'shrine' })
    s = applyEvent(s, { type: 'CHOOSE_PATRON', godId: TIER1_PATRON_IDS[0] })
    expect(s.protagonist.activePatronId).toBe(TIER1_PATRON_IDS[0])
  })

  it('rejects a patron choice without an open shrine', () => {
    const s = createInitialState()
    const rejected = applyEvent(s, { type: 'CHOOSE_PATRON', godId: TIER1_PATRON_IDS[0] })
    expect(rejected.protagonist.activePatronId).toBeNull()
  })
})

describe('save round trip, corrupt JSON, future schema, unknown IDs', () => {
  it('round-trips a real save and reloads equivalent state', () => {
    const store = window.localStorage
    let s = createInitialState()
    s = applyEvent(s, { type: 'INTERACT', entityId: 'shrine' })
    s = applyEvent(s, { type: 'CHOOSE_PATRON', godId: TIER1_PATRON_IDS[2] })
    expect(saveRPG(store, s)).toBe(true)
    expect(hasSave(store)).toBe(true)
    const { save, error } = loadRPG(store)
    expect(error).toBe('none')
    expect(save.schemaVersion).toBe(3)
    expect(save.protagonist.activePatronId).toBe(TIER1_PATRON_IDS[2])
    expect(save.world.mapId).toBe('beacon-overlook')
    clearSave(store)
    expect(hasSave(store)).toBe(false)
  })

  it('corrupt JSON recovers without throwing (no save, error=corrupt)', () => {
    const store = window.localStorage
    store.setItem(RPG_SAVE_KEY, '{not json!!!')
    const { save, error } = loadRPG(store)
    expect(save).toBeNull()
    expect(error).toBe('corrupt')
    clearSave(store)
  })

  it('a future schema version is refused (no down-grade) without throwing', () => {
    const store = window.localStorage
    store.setItem(RPG_SAVE_KEY, JSON.stringify({ schemaVersion: 99, anything: [1, 2, 3] }))
    const { save, error } = loadRPG(store)
    expect(save).toBeNull()
    expect(error).toBe('future')
    clearSave(store)
  })

  it('unknown IDs normalize to safe fallbacks without throwing', () => {
    const store = window.localStorage
    store.setItem(RPG_SAVE_KEY, JSON.stringify({
      // valid v1 schema marker but impossible IDs
      schemaVersion: 1,
      world: { mapId: 'not-a-map', position: { x: 12, y: -4 } },
      protagonist: { activePatronId: 'not-a-god', unlockedPatronIds: ['not-a-god'] },
      mainQuestId: 'not-a-quest',
      quests: { 'not-a-quest': { state: 'active', objectiveIndex: 7 } },
    }))
    const { save, error } = loadRPG(store)
    expect(save).not.toBeNull()
    expect(error).toBe('unknown')
    // Fell back to a known map (spawn), cleaned the patron and quests.
    expect(['beacon-overlook', 'olive-road']).toContain(save.world.mapId)
    expect(save.protagonist.activePatronId).toBeNull()
    expect(save.mainQuestId).toBeTruthy()
    expect(save.quests['not-a-quest']).toBeUndefined()
    // It is still playable.
    expect(save.status).toBe('playing')
    clearSave(store)
  })

  it('migrateSave upgrades v1 and returns null for corrupt/future', () => {
    expect(migrateSave({ schemaVersion: 1 })).toMatchObject({
      schemaVersion: 3,
      economy: { openShopId: null },
      resources: { version: 1, nodes: {} },
    })
    expect(migrateSave(null)).toBeNull()
    expect(migrateSave({ schemaVersion: 99 })).toBeNull()
    expect(migrateSave({})).toBeNull()
  })

  it('normalizeState sanitizes a hostile but parseable save into a valid v1 state', () => {
    const n = normalizeState({ schemaVersion: 1, quests: 'bogus', flags: { x: () => 1 } })
    expect(n).not.toBeNull()
    expect(n.schemaVersion).toBe(3)
    expect(n.status).toBe('playing')
    expect(n.world.mapId).toBe('beacon-overlook')
  })

  it('recovers ephemeral dialogue and combat statuses into a playable world boundary', () => {
    expect(normalizeState({ ...createInitialState(), status: 'in-dialogue' }).status).toBe('playing')
    expect(normalizeState({ ...createInitialState(), status: 'in-combat' }).status).toBe('playing')
    expect(normalizeState({ ...createInitialState(), status: 'paused' }).status).toBe('playing')
  })
})

describe('combat adapter: exactly-once victory, checkpoint restore, fixed seed', () => {
  beforeAll(() => {
    // The combat adapter uses Math/loop only (no DOM) — safe in node, but guard.
  })

  it('a retry yields the identical seed for the same encounter', () => {
    const a = seedForEncounter('enc-act1-entry')
    const b = seedForEncounter('enc-act1-entry')
    expect(a).toBe(b)
    const c = seedForEncounter('enc-act1-sun')
    expect(c).not.toBe(a)
  })

  it('startEncounter anchors to the deterministic acropolis-entry composition', () => {
    let rpg = createInitialState()
    rpg = applyEvent(rpg, { type: 'INTERACT', entityId: 'shrine' })
    rpg = applyEvent(rpg, { type: 'CHOOSE_PATRON', godId: TIER1_PATRON_IDS[0] })
    // ENTER_ENCOUNTER requires being on the activation map (olive-road gate).
    rpg = applyEvent(rpg, { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' })
    const s = startEncounter(rpg, 'enc-act1-entry')
    expect(s).not.toBeNull()
    expect(s.campaignLevelId).toBe('acropolis-entry')
    expect(s.seed).toBe(seedForEncounter('enc-act1-entry'))
    expect(s.settled).toBe(false)
    expect(s.outcome).toBe(OUTCOME_NONE)
    // The arena is a real reducer state with the patron's god + fixed loadout.
    expect(s.arena.god).toBe(TIER1_PATRON_IDS[0])
    expect(s.arena.loadout).toEqual(powersForGod(TIER1_PATRON_IDS[0]))
    // No waves are exposed to the RPG layer.
    expect(s).not.toHaveProperty('waves')
  })

  it('casts a canonical directional patron power through the adapter', () => {
    let rpg = createInitialState()
    rpg = applyEvent(rpg, { type: 'INTERACT', entityId: 'shrine' })
    rpg = applyEvent(rpg, { type: 'CHOOSE_PATRON', godId: 'apollo' })
    let session = startEncounter(rpg, 'enc-act1-entry')
    session = stepCombat(session, {}) // authored first spawn
    const before = session.arena.tokenUsage
    session = stepCombat(session, { powerId: 'solarBow', aimX: 1, aimY: 0 })
    expect(session.arena.tokenUsage).toBe(before + 1)
    expect(session.arena.projectiles.length).toBeGreaterThan(0)
    expect(session.arena.projectiles[0].vx).toBeGreaterThan(0)
  })

  it('failure restores the pre-encounter checkpoint', () => {
    let rpg = createInitialState()
    rpg = applyEvent(rpg, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
    rpg = applyEvent(rpg, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
    rpg = applyEvent(rpg, { type: 'INTERACT', entityId: 'shrine' })
    rpg = applyEvent(rpg, { type: 'CHOOSE_PATRON', godId: TIER1_PATRON_IDS[0] })
    rpg = applyEvent(rpg, { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' })
    const checkpoint = rpg
    const entered = applyEvent(rpg, { type: 'ENTER_ENCOUNTER', encounterId: 'enc-act1-entry' })
    expect(entered.status).toBe('in-combat')
    const restored = applyEvent(entered, { type: 'COMBAT_FAILED', encounterId: 'enc-act1-entry' })
    expect(restored.status).toBe('playing')
    // World state and objective are exactly the pre-encounter story checkpoint.
    expect(restored.world.mapId).toBe(checkpoint.world.mapId)
    expect(restored.quests).toEqual(checkpoint.quests)
    expect(restored.protagonist).toEqual(checkpoint.protagonist)
    // The encounter is still uncleared — a retry is possible.
    expect(isEncounterCleared(restored, 'enc-act1-entry')).toBe(false)
  })

  it('stepCombat settles exactly once and never re-emits', () => {
    let rpg = createInitialState()
    rpg = applyEvent(rpg, { type: 'INTERACT', entityId: 'shrine' })
    rpg = applyEvent(rpg, { type: 'CHOOSE_PATRON', godId: TIER1_PATRON_IDS[0] })
    rpg = applyEvent(rpg, { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' })
    let session = startEncounter(rpg, 'enc-act1-entry')
    // Step many frames (some of them as no-ops with nothing spawned yet). The
    // session must eventually settle WON (the composition clears) or we step
    // without crashing; the key assertion is that AFTER settling, every further
    // step is a no-op that keeps outcome and never changes it.
    let settledOnce = false
    let settledOutcome = OUTCOME_NONE
    for (let i = 0; i < 30000; i++) {
      const out = stepCombat(session, { moveX: 0, moveY: 0, firing: true, attack: true })
      if (out.settled) {
        if (!settledOnce) {
          settledOnce = true
          settledOutcome = out.outcome
          expect([OUTCOME_WON, OUTCOME_FAILED]).toContain(out.outcome)
        } else {
          // Once settled, repeated steps never change the outcome or session id.
          expect(out.settled).toBe(true)
          expect(out.outcome).toBe(settledOutcome)
        }
      }
      session = out
    }
    // With firing+attack it should always settle (win or lose) by the full run.
    expect(settledOnce).toBe(true)
  })
})

// ─── Phase E presentation pass: surfaces stay authored and accessible ───
describe('presentation: title surface, dialogue portraits, act boundary', () => {
  it('the title surface uses Kallias as the dominant art field with angular chrome', async () => {
    await mount(<ControlTowerRPG />)
    // Dominant art field: the Kallias portrait image, decorative to AT.
    const titleImg = container.querySelector('.rpg-title-img')
    expect(titleImg).not.toBeNull()
    expect(String(titleImg.getAttribute('src'))).toContain('kallias')
    expect(String(titleImg.getAttribute('src'))).toContain('256')
    expect(titleImg.getAttribute('srcset')).toMatch(/kallias[^,]*128\.webp 128w, .*kallias[^,]*256\.webp 256w/)
    expect(titleImg.getAttribute('sizes')).toBe('100vw')
    expect(titleImg.getAttribute('aria-hidden')).toBe('true')
    // No horizontal overflow at any width.
    expect(document.body.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1)
  })

  it('speaker portraits map by stable speaker ID (not display text), with useful alt text only when needed', async () => {
    let positioned = createInitialState()
    positioned = applyEvent(positioned, { type: 'MOVE', x: 662, y: 280, facing: 1 })
    expect(saveRPG(window.localStorage, positioned)).toBe(true)
    await mount(<ControlTowerRPG />)
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue').click())
    const interact = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Interact')
    await act(async () => interact.dispatchEvent(new Event('pointerdown', { bubbles: true })))

    // Thessa speaks first: her portrait is shown with identity-carrying alt.
    let portrait = container.querySelector('.rpg-dialogue-portrait img')
    expect(portrait).not.toBeNull()
    expect(String(portrait.getAttribute('src'))).toContain('thessa')
    expect(String(portrait.getAttribute('src'))).toContain('128')
    expect(portrait.getAttribute('srcset')).toMatch(/thessa[^,]*128\.webp 128w, .*thessa[^,]*256\.webp 256w/)
    expect(portrait.getAttribute('sizes')).toBe('(min-width: 640px) 118px, 64px')
    expect(portrait.getAttribute('alt')).toMatch(/indigo/i)

    // Advance to Kallias's line: his portrait shows, alt is decorative-empty
    // because the nameplate already announces identity.
    const advance = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue')
    expect(advance).toBeTruthy()
    await act(async () => advance.click())
    portrait = container.querySelector('.rpg-dialogue-portrait img')
    expect(String(portrait.getAttribute('src'))).toContain('kallias')
    expect(String(portrait.getAttribute('src'))).toContain('128')
    expect(portrait.getAttribute('alt')).toBe('')

    // Deterministic Skip still ends the conversation exactly as before.
    const skip = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Skip')
    await act(async () => skip.click())
    expect(container.querySelector('.rpg-dialogue-portrait')).toBeNull()
    expect(container.textContent).toContain('First Patron Shrine')
  })

  it('the keeper portrait resolves for the Amonides side quest via stable ID', async () => {
    let prepared = createInitialState()
    prepared = applyEvent(prepared, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
    prepared = applyEvent(prepared, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
    prepared = applyEvent(prepared, { type: 'INTERACT', entityId: 'shrine' })
    prepared = applyEvent(prepared, { type: 'CHOOSE_PATRON', godId: TIER1_PATRON_IDS[0] })
    prepared = applyEvent(prepared, { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' })
    prepared = applyEvent(prepared, { type: 'INTERACT', entityId: 'tablet' })
    // Stand next to the keeper on Olive Road.
    prepared = applyEvent(prepared, { type: 'MOVE', x: 760, y: 150, facing: 1 })
    expect(saveRPG(window.localStorage, prepared)).toBe(true)
    await mount(<ControlTowerRPG />)
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue').click())
    const interact = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Interact')
    await act(async () => interact.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    const portrait = container.querySelector('.rpg-dialogue-portrait img')
    expect(portrait).not.toBeNull()
    expect(String(portrait.getAttribute('src'))).toContain('amonides')
    expect(String(portrait.getAttribute('src'))).toContain('128')
    expect(portrait.getAttribute('srcset')).toMatch(/amonides[^,]*128\.webp 128w, .*amonides[^,]*256\.webp 256w/)
    expect(container.textContent).toContain('Amonides')
  })

  it('the Act-I boundary is a chapter transition using the Ianthe reveal with honest copy', async () => {
    let completed = createInitialState()
    completed = applyEvent(completed, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
    completed = applyEvent(completed, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
    completed = applyEvent(completed, { type: 'INTERACT', entityId: 'shrine' })
    completed = applyEvent(completed, { type: 'CHOOSE_PATRON', godId: TIER1_PATRON_IDS[0] })
    completed = applyEvent(completed, { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' })
    completed = applyEvent(completed, { type: 'ENTER_ENCOUNTER', encounterId: 'enc-act1-entry' })
    completed = applyEvent(completed, { type: 'COMBAT_WON', encounterId: 'enc-act1-entry' })
    completed = applyEvent(completed, { type: 'ENTER_ENCOUNTER', encounterId: 'enc-act1-sun' })
    completed = applyEvent(completed, { type: 'COMBAT_WON', encounterId: 'enc-act1-sun' })
    const objective = currentObjective(completed)
    completed = applyEvent(completed, { type: 'TALK', npcId: objective.npcId, conversationId: objective.conversationId })
    completed = applyEvent(completed, { type: 'DIALOGUE_END', conversationId: objective.conversationId })
    expect(completed.status).toBe('ending')
    expect(saveRPG(window.localStorage, completed)).toBe(true)

    await mount(<ControlTowerRPG />)
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue').click())

    // Chapter transition chrome + Ianthe reveal portrait (decorative; copy
    // already names her).
    expect(container.querySelector('.rpg-act-card')).not.toBeNull()
    const reveal = container.querySelector('.rpg-act-portrait img')
    expect(reveal).not.toBeNull()
    expect(String(reveal.getAttribute('src'))).toContain('ianthe')
    expect(String(reveal.getAttribute('src'))).toContain('256')
    expect(reveal.getAttribute('srcset')).toMatch(/ianthe[^,]*128\.webp 128w, .*ianthe[^,]*256\.webp 256w/)
    expect(reveal.getAttribute('sizes')).toBe('(min-width: 700px) 240px, calc(100vw - 2rem)')
    expect(reveal.getAttribute('aria-hidden')).toBe('true')
    // The accepted chapter copy now exposes the real Act II entry.
    expect(container.textContent).toContain('Far-Sighted recovered')
    expect(container.textContent).toContain('Act II — The Salt Covenant')
    expect(container.textContent).toContain('Pelagos')
    const ack = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Enter Pelagos')
    expect(ack).toBeTruthy()
    // Reachable: it is a real semantic button (>=44px tall via its class).
    expect(ack.className).toContain('rpg-btn')
  })

  it('the in-world HUD keeps one objective strip, identity, patron, and pause', async () => {
    await mount(<ControlTowerRPG />)
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'New Story').click())
    // Exactly one objective strip, live-announced.
    const objectives = container.querySelectorAll('.rpg-objective')
    expect(objectives.length).toBe(1)
    expect(objectives[0].querySelector('[aria-live="polite"]')).not.toBeNull()
    const hud = container.querySelector('[data-testid="rpg-hud"]')
    expect(hud).not.toBeNull()
    expect(hud.querySelector('.rpg-hud-identity')).not.toBeNull()
    const actions = hud.querySelector('.rpg-hud-actions')
    expect(actions.getAttribute('aria-label')).toBe('Story controls')
    for (const label of ['Skills', 'Pack', 'Journal', 'Systems', 'Pause']) {
      const control = [...actions.querySelectorAll('button')].find((button) => button.textContent === label)
      expect(control, `${label} remains a labeled HUD control`).toBeTruthy()
      expect(control.className).toContain('rpg-hud-btn')
    }
    // Act/location identity + pause control.
    expect(container.textContent).toContain('Act I')
    expect(container.textContent).toContain('Beacon Overlook')
    const pause = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Pause')
    expect(pause).toBeTruthy()
    expect(pause.className).toContain('rpg-hud-btn')
    // Touch targets stay >=44px (h-12 = 48px).
    const moveUp = container.querySelector('[aria-label="Move up"]')
    expect(moveUp.className).toContain('h-12')
  })

  it('save-error recovery surfaces on the title without losing New Story', async () => {
    window.localStorage.setItem(RPG_SAVE_KEY, '{not json!!!')
    await mount(<ControlTowerRPG />)
    expect(container.textContent).toContain('unreadable')
    const newStory = [...container.querySelectorAll('button')].find((button) => button.textContent === 'New Story')
    expect(newStory.disabled).toBe(false)
    await act(async () => newStory.click())
    expect(container.textContent).toContain('Talk to Thessa')
  })

  it('no native dialogs, no external fonts, no network requests are introduced', async () => {
    await mount(<ControlTowerRPG />)
    // No native alert/confirm/prompt anywhere in the route.
    expect(container.innerHTML).not.toContain('<dialog')
    // presentation.css defines only system font stacks (no @font-face).
    const { default: cssSource } = await import('../src/rpg/presentation.css?raw')
    expect(cssSource).not.toContain('@font-face')
    expect(cssSource).not.toContain('fonts.googleapis')
    expect(cssSource).not.toContain('@import')
  })
})

    describe('React flow: Entry result launches Sun and the Act-II boundary is acknowledged', () => {
      it('after Entry victory the Sun Court gate launches the authored Sun encounter', async () => {
        // Drive the reducer to the exact post-Entry state, then stand Kallias at
        // the visible Sun Court gate on Beacon Overlook.
        let prepared = createInitialState()
        prepared = applyEvent(prepared, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
        prepared = applyEvent(prepared, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
        prepared = applyEvent(prepared, { type: 'INTERACT', entityId: 'shrine' })
        prepared = applyEvent(prepared, { type: 'CHOOSE_PATRON', godId: TIER1_PATRON_IDS[0] })
        prepared = applyEvent(prepared, { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' })
        prepared = applyEvent(prepared, { type: 'ENTER_ENCOUNTER', encounterId: 'enc-act1-entry' })
        prepared = applyEvent(prepared, { type: 'COMBAT_WON', encounterId: 'enc-act1-entry' })
        expect(currentObjective(prepared).encounterId).toBe('enc-act1-sun')

        const sunGate = mapById('beacon-overlook').exits.find((exit) => exit.kind === 'combat' && exit.encounterId === 'enc-act1-sun')
        expect(sunGate).toBeTruthy()
        prepared = applyEvent(prepared, { type: 'MOVE', x: sunGate.x, y: sunGate.y, facing: 1 })
        expect(saveRPG(window.localStorage, prepared)).toBe(true)

        await mount(<ControlTowerRPG />)
        await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue').click())
        const interact = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Interact')
        await act(async () => interact.dispatchEvent(new Event('pointerdown', { bubbles: true })))

        // The Sun Court combat session is live with its authored controls.
        expect(container.querySelector('[aria-label="Combat controls"]')).not.toBeNull()
        expect(container.textContent).toContain('Sun Court')
      })

      it('the Act-II boundary card enters playable Pelagos', async () => {
        // Drive the reducer to the completed Act-I state (status 'ending').
        let completed = createInitialState()
        completed = applyEvent(completed, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
        completed = applyEvent(completed, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
        completed = applyEvent(completed, { type: 'INTERACT', entityId: 'shrine' })
        completed = applyEvent(completed, { type: 'CHOOSE_PATRON', godId: TIER1_PATRON_IDS[0] })
        completed = applyEvent(completed, { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' })
        completed = applyEvent(completed, { type: 'ENTER_ENCOUNTER', encounterId: 'enc-act1-entry' })
        completed = applyEvent(completed, { type: 'COMBAT_WON', encounterId: 'enc-act1-entry' })
        completed = applyEvent(completed, { type: 'ENTER_ENCOUNTER', encounterId: 'enc-act1-sun' })
        completed = applyEvent(completed, { type: 'COMBAT_WON', encounterId: 'enc-act1-sun' })
        const objective = currentObjective(completed)
        completed = applyEvent(completed, { type: 'TALK', npcId: objective.npcId, conversationId: objective.conversationId })
        completed = applyEvent(completed, { type: 'DIALOGUE_END', conversationId: objective.conversationId })
        expect(completed.status).toBe('ending')
        expect(saveRPG(window.localStorage, completed)).toBe(true)

        await mount(<ControlTowerRPG />)
        await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue').click())

        // The boundary card is present with the accepted Act II entry.
        expect(container.textContent).toContain('Act II — The Salt Covenant')

        const ack = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Enter Pelagos')
        expect(ack).toBeTruthy()
        await act(async () => ack.click())
        expect(container.textContent).not.toContain('Act II — The Salt Covenant')
        expect(container.textContent).toContain('Act II')
        expect(container.textContent).toContain('Pelagos Harbor')
        expect(container.textContent).toContain('Talk to Melite')
        expect(container.textContent).toContain('Ebb — the causeway lies dry')
        expect(container.querySelector('[data-testid="kallias-world-sprite"]')).toBeNull()
        expect(container.querySelector('[aria-label="Move up"]')).not.toBeNull()
      })
    })
