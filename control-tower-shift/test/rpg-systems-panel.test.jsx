// @vitest-environment jsdom
//
// Render-layer tests for RPGSystemsPanel — the Wilderness/Crafting field
// journal. Mirrors the repo's jsdom + raw react-dom idiom (see rpg.test.jsx,
// game-view.test.jsx): createRoot + act, query by data-testid/role/text.
import { describe, it, expect, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const { default: RPGSystemsPanel } = await import('../src/rpg/RPGSystemsPanel.jsx')
const { createInitialState } = await import('../src/rpg/state.js')
const { REGIONS, ENEMY_DEFS_BY_ID } = await import('../src/rpg/wilderness.js')
const { RECIPES } = await import('../src/rpg/crafting.js')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const mount = async (el) => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(el))
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  if (container) document.body.removeChild(container)
  container = root = null
  vi.restoreAllMocks()
})

const buttons = () => [...container.querySelectorAll('button')]
const findButton = (text) => buttons().find((b) => b.textContent.includes(text))
const findExactButton = (text) => buttons().find((b) => b.textContent === text)
const click = async (el) => act(async () => el.click())
const atMap = (state, mapId) => ({ ...state, world: { ...state.world, mapId } })

describe('RPGSystemsPanel — Wilderness tab', () => {
  it('renders every authored region when outside the wilderness, and Enter dispatches WILDERNESS_ENTER with the stable region id', async () => {
    const state = atMap(createInitialState(), 'olive-road')
    const dispatch = vi.fn()
    await mount(<RPGSystemsPanel state={state} dispatch={dispatch} />)

    for (const region of REGIONS) {
      expect(container.textContent).toContain(region.name)
      expect(container.textContent).toContain(String(region.recommendedCombatLevel))
    }

    const firstRegion = REGIONS[0]
    const enterBtn = findButton(firstRegion.name)
    expect(enterBtn).toBeTruthy()
    expect(enterBtn.disabled).toBe(false)
    await click(enterBtn)
    expect(dispatch).toHaveBeenCalledWith({ type: 'WILDERNESS_ENTER', regionId: firstRegion.id })
  })

  it('keeps remote Olive Road and Asphodel entries readable but disabled with travel reasons', async () => {
    const dispatch = vi.fn()
    await mount(<RPGSystemsPanel state={createInitialState()} dispatch={dispatch} />)

    for (const name of ['Olive Road', 'Asphodel Fringe']) {
      const button = findButton(`Enter ${name}`)
      expect(button).toBeTruthy()
      expect(button.disabled).toBe(true)
      const reason = document.getElementById(button.getAttribute('aria-describedby'))
      expect(reason).toBeTruthy()
      expect(reason.textContent).toContain('Travel to')
      await click(button)
    }
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('enables Asphodel entry only at its authored gate', async () => {
    const state = atMap(createInitialState(), 'asphodel-gate')
    const dispatch = vi.fn()
    await mount(<RPGSystemsPanel state={state} dispatch={dispatch} />)

    const button = findButton('Enter Asphodel Fringe')
    expect(button.disabled).toBe(false)
    await click(button)
    expect(dispatch).toHaveBeenCalledWith({ type: 'WILDERNESS_ENTER', regionId: 'asphodel-fringe' })
  })

  it('shows risk, step count, protected items, and warning while inside; Scout onward and Return to sanctuary dispatch the right events', async () => {
    const base = createInitialState()
    const state = {
      ...base,
      wilderness: { ...base.wilderness, regionId: 'olive-road', riskBand: 'low', step: 2, pendingEnemyId: null },
    }
    const dispatch = vi.fn()
    await mount(<RPGSystemsPanel state={state} dispatch={dispatch} />)

    expect(container.textContent).toContain('low')
    expect(container.textContent).toContain('2')
    expect(container.textContent).toContain('expedition active')
    expect(container.textContent).toContain('retained after reload')

    const scoutBtn = findButton('Scout onward')
    expect(scoutBtn).toBeTruthy()
    await click(scoutBtn)
    expect(dispatch).toHaveBeenCalledWith({ type: 'WILDERNESS_STEP' })

    const returnBtn = findButton('Return to sanctuary')
    await click(returnBtn)
    expect(dispatch).toHaveBeenCalledWith({ type: 'WILDERNESS_EXIT' })
  })

  it('does not offer Scout onward while an enemy is pending', async () => {
    const base = createInitialState()
    const state = {
      ...base,
      wilderness: { ...base.wilderness, regionId: 'olive-road', riskBand: 'low', step: 1, pendingEnemyId: 'wild-boar' },
    }
    await mount(<RPGSystemsPanel state={state} dispatch={vi.fn()} />)
    expect(findButton('Scout onward')).toBeFalsy()
  })

  it('shows the pending enemy name and reward preview, and Engage calls onEngageEnemy with the enemy and encounter key', async () => {
    const base = createInitialState()
    const state = {
      ...base,
      wilderness: { ...base.wilderness, regionId: 'olive-road', riskBand: 'low', step: 3, pendingEnemyId: 'wild-boar' },
    }
    const onEngageEnemy = vi.fn()
    await mount(<RPGSystemsPanel state={state} dispatch={vi.fn()} onEngageEnemy={onEngageEnemy} />)

    const enemy = ENEMY_DEFS_BY_ID['wild-boar']
    expect(container.textContent).toContain(enemy.name)
    expect(container.textContent).toContain(String(enemy.currency))

    const engageBtn = findButton('Engage')
    expect(engageBtn.disabled).toBe(false)
    await click(engageBtn)
    expect(onEngageEnemy).toHaveBeenCalledWith({ enemyId: 'wild-boar', encounterKey: 'olive-road:3:wild-boar' })
  })

  it('disables Engage accessibly and explains why when no combat callback exists', async () => {
    const base = createInitialState()
    const state = {
      ...base,
      wilderness: { ...base.wilderness, regionId: 'olive-road', riskBand: 'low', step: 1, pendingEnemyId: 'wild-boar' },
    }
    await mount(<RPGSystemsPanel state={state} dispatch={vi.fn()} />)
    const engageBtn = findButton('Engage')
    expect(engageBtn.disabled).toBe(true)
    expect(container.textContent.toLowerCase()).toContain('combat integration is unavailable')
  })

  it('surfaces lastDeathDrop clearly when present', async () => {
    const base = createInitialState()
    const state = {
      ...base,
      wilderness: {
        ...base.wilderness,
        lastDeathDrop: { dropped: [{ itemId: 'copper-ore', quantity: 1 }], lostCurrency: 12, cause: 'shade' },
      },
    }
    await mount(<RPGSystemsPanel state={state} dispatch={vi.fn()} />)
    expect(container.textContent).toContain('shade')
    expect(container.textContent).toContain('12')
    expect(container.textContent).toContain('Copper Ore')
  })
})

describe('RPGSystemsPanel — Crafting tab', () => {
  const gotoCraftingTab = async () => {
    const tab = findButton('Crafting')
    await click(tab)
  }

  it('offers a stable station chooser derived from recipe station ids; opening dispatches OPEN_CRAFTING', async () => {
    const state = atMap(createInitialState(), 'bronze-foundry')
    const dispatch = vi.fn()
    await mount(<RPGSystemsPanel state={state} dispatch={dispatch} />)
    await gotoCraftingTab()

    const stationIds = [...new Set(RECIPES.map((r) => r.stationId))]
    const firstStationId = stationIds[0]
    const stationRecipe = RECIPES.find((r) => r.stationId === firstStationId)
    const stationBtn = buttons().find((b) => b.dataset.stationId === firstStationId)
    expect(stationBtn).toBeTruthy()
    expect(stationBtn.disabled).toBe(false)
    await click(stationBtn)
    expect(dispatch).toHaveBeenCalledWith({ type: 'OPEN_CRAFTING', stationId: firstStationId })
    expect(stationRecipe).toBeTruthy()
  })

  it('keeps remote forge and loom stations readable but blocks their dispatch', async () => {
    const dispatch = vi.fn()
    await mount(<RPGSystemsPanel state={createInitialState()} dispatch={dispatch} />)
    await gotoCraftingTab()

    for (const stationId of ['bronze-forge', 'loom']) {
      const button = buttons().find((candidate) => candidate.dataset.stationId === stationId)
      expect(button).toBeTruthy()
      expect(button.disabled).toBe(true)
      const reason = document.getElementById(button.getAttribute('aria-describedby'))
      expect(reason).toBeTruthy()
      expect(reason.textContent).toContain('Travel to')
      await click(button)
    }
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('opens the loom only while physically present in the Silent Loom', async () => {
    const state = atMap(createInitialState(), 'silent-loom')
    const dispatch = vi.fn()
    await mount(<RPGSystemsPanel state={state} dispatch={dispatch} />)
    await gotoCraftingTab()

    const loom = buttons().find((candidate) => candidate.dataset.stationId === 'loom')
    expect(loom.disabled).toBe(false)
    await click(loom)
    expect(dispatch).toHaveBeenCalledWith({ type: 'OPEN_CRAFTING', stationId: 'loom' })
  })

  it('shows an available recipe as craftable and dispatches CRAFT for quantity 1', async () => {
    const base = createInitialState()
    const state = atMap({
      ...base,
      inventory: {
        ...base.inventory,
        slots: [
          { itemId: 'copper-ore', quantity: 1 },
          { itemId: 'copper-ore', quantity: 1 },
        ],
      },
      crafting: { stationId: 'bronze-forge', lastResult: null },
    }, 'bronze-foundry')
    const dispatch = vi.fn()
    await mount(<RPGSystemsPanel state={state} dispatch={dispatch} />)
    await gotoCraftingTab()

    const craftBtn = findExactButton('Craft')
    expect(craftBtn).toBeTruthy()
    expect(craftBtn.disabled).toBe(false)
    await click(craftBtn)
    expect(dispatch).toHaveBeenCalledWith({ type: 'CRAFT', recipeId: 'copper-bar', quantity: 1 })
  })

  it('disables an unavailable recipe with a readable reason', async () => {
    const base = createInitialState()
    const state = atMap({
      ...base,
      crafting: { stationId: 'bronze-forge', lastResult: null },
    }, 'bronze-foundry')
    await mount(<RPGSystemsPanel state={state} dispatch={vi.fn()} />)
    await gotoCraftingTab()

    const craftBtn = findExactButton('Craft')
    expect(craftBtn.disabled).toBe(true)
    expect(container.textContent.toLowerCase()).toContain('ingredient')
  })

  it('Leave station dispatches CLOSE_CRAFTING', async () => {
    const base = createInitialState()
    const state = atMap({ ...base, crafting: { stationId: 'bronze-forge', lastResult: null } }, 'bronze-foundry')
    const dispatch = vi.fn()
    await mount(<RPGSystemsPanel state={state} dispatch={dispatch} />)
    await gotoCraftingTab()

    const leaveBtn = findButton('Leave station')
    await click(leaveBtn)
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLOSE_CRAFTING' })
  })

  it('surfaces state.crafting.lastResult through an aria-live status message', async () => {
    const base = createInitialState()
    const state = atMap({
      ...base,
      crafting: { stationId: 'bronze-forge', lastResult: { ok: true, quantity: 1, xpAwarded: 12 } },
    }, 'bronze-foundry')
    await mount(<RPGSystemsPanel state={state} dispatch={vi.fn()} />)
    await gotoCraftingTab()

    const status = container.querySelector('[aria-live]')
    expect(status).toBeTruthy()
    expect(status.textContent).toContain('12')
  })

  it('disables crafting from a stale remote station while preserving Leave station', async () => {
    const base = createInitialState()
    const state = { ...base, crafting: { stationId: 'bronze-forge', lastResult: null } }
    const dispatch = vi.fn()
    await mount(<RPGSystemsPanel state={state} dispatch={dispatch} />)
    await gotoCraftingTab()

    const craft = findExactButton('Craft')
    expect(craft.disabled).toBe(true)
    expect(craft.getAttribute('aria-describedby')).toBe('rsp-active-station-access')
    expect(document.getElementById('rsp-active-station-access').textContent).toContain('Travel to Bronze Foundry')
    await click(craft)
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'CRAFT' }))

    await click(findButton('Leave station'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLOSE_CRAFTING' })
  })
})

describe('RPGSystemsPanel — accessibility semantics', () => {
  it('exposes a tab/tabpanel structure with correct aria-selected toggling', async () => {
    const state = createInitialState()
    await mount(<RPGSystemsPanel state={state} dispatch={vi.fn()} />)

    const tabs = container.querySelectorAll('[role="tab"]')
    expect(tabs.length).toBe(2)
    const wildernessTab = [...tabs].find((t) => t.textContent === 'Wilderness')
    const craftingTab = [...tabs].find((t) => t.textContent === 'Crafting')
    expect(wildernessTab.getAttribute('aria-selected')).toBe('true')
    expect(craftingTab.getAttribute('aria-selected')).toBe('false')

    await click(craftingTab)
    expect(craftingTab.getAttribute('aria-selected')).toBe('true')
    expect(wildernessTab.getAttribute('aria-selected')).toBe('false')

    const panel = container.querySelector('[role="tabpanel"]')
    expect(panel).toBeTruthy()
  })
})
