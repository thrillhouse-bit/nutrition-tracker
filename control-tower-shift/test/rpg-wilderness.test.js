import { describe, expect, it } from 'vitest'
import {
  ENEMY_DEFS, ENEMY_DEFS_BY_ID, MAX_PROTECTED_ITEMS, REGIONS, REGIONS_BY_ID,
  RISK_BANDS, RISK_ORDER, combatLevelForSkills, itemValue, planDeathDrop,
  protectedItemCount, rollWildernessEncounter, wildernessCombatRewards,
} from '../src/rpg/wilderness.js'
import { createInitialInventory, createInitialSkills, normalizeInventory } from '../src/rpg/progression.js'
import { ITEM_EXTENSIONS } from '../src/rpg/crafting.js'

// Build a skills object with the given combat-skill levels (all others at 0 XP).
function skillsWithLevels(levels) {
  const skills = createInitialSkills()
  for (const [skillId, level] of Object.entries(levels)) {
    skills[skillId] = { xp: xpForLevelApprox(level) }
  }
  return skills
}

// xp that lands exactly on the requested level boundary of the canonical curve.
function xpForLevelApprox(level) {
  const target = Math.max(1, Math.min(99, Math.floor(level)))
  let points = 0
  for (let current = 1; current < target; current += 1) {
    points += Math.floor(current + 300 * (2 ** (current / 7)))
  }
  return Math.floor(points / 4)
}

describe('wilderness regions', () => {
  it('defines at least four escalating regions beginning with the Olive Road', () => {
    expect(REGIONS.length).toBeGreaterThanOrEqual(4)
    expect(REGIONS[0].id).toBe('olive-road')
    expect(REGIONS[0].name).toBe('Olive Road')
  })

  it('escalates risk, recommended level, resource tier, and escape cost monotonically', () => {
    for (let i = 1; i < REGIONS.length; i += 1) {
      const prev = REGIONS[i - 1]
      const curr = REGIONS[i]
      expect(RISK_ORDER[curr.riskBand]).toBeGreaterThan(RISK_ORDER[prev.riskBand])
      expect(curr.recommendedCombatLevel).toBeGreaterThan(prev.recommendedCombatLevel)
      expect(curr.resourceTier).toBeGreaterThan(prev.resourceTier)
      expect(curr.escape.cost).toBeGreaterThan(prev.escape.cost)
    }
  })

  it('gives every region a complete authored contract', () => {
    for (const region of REGIONS) {
      expect(region.id).toBeTruthy()
      expect(region.name).toBeTruthy()
      expect(RISK_BANDS).toContain(region.riskBand)
      expect(region.recommendedCombatLevel).toBeGreaterThan(0)
      expect(region.resourceTier).toBeGreaterThan(0)
      expect(Array.isArray(region.enemyPool)).toBe(true)
      expect(region.enemyPool.length).toBeGreaterThan(0)
      expect(region.escape.boundary).toBeTruthy()
      expect(region.escape.cost).toBeGreaterThanOrEqual(0)
      for (const enemyId of region.enemyPool) {
        expect(ENEMY_DEFS_BY_ID[enemyId]).toBeTruthy()
      }
    }
  })

  it('freezes region definitions so they cannot be mutated', () => {
    expect(Object.isFrozen(REGIONS)).toBe(true)
    expect(Object.isFrozen(REGIONS[0])).toBe(true)
    expect(Object.isFrozen(REGIONS[0].enemyPool)).toBe(true)
    expect(Object.isFrozen(REGIONS[0].escape)).toBe(true)
  })
})

describe('combatLevelForSkills', () => {
  it('returns 1 for a fresh character with no combat XP', () => {
    expect(combatLevelForSkills(createInitialSkills())).toBe(1)
  })

  it('rises with defensive and offensive combat levels', () => {
    const low = combatLevelForSkills(skillsWithLevels({ guard: 1, vitality: 1, spearcraft: 1 }))
    const high = combatLevelForSkills(skillsWithLevels({ guard: 40, vitality: 40, spearcraft: 40 }))
    expect(high).toBeGreaterThan(low)
  })

  it('uses the strongest offensive combat skill', () => {
    const melee = combatLevelForSkills(skillsWithLevels({ guard: 10, vitality: 10, spearcraft: 30, marksmanship: 1 }))
    const ranged = combatLevelForSkills(skillsWithLevels({ guard: 10, vitality: 10, spearcraft: 1, marksmanship: 30 }))
    expect(melee).toBe(ranged)
  })

  it('clamps to the 1-99 range and fails safely on malformed input', () => {
    expect(combatLevelForSkills(skillsWithLevels({ guard: 99, vitality: 99, spearcraft: 99 }))).toBeLessThanOrEqual(99)
    expect(combatLevelForSkills(null)).toBe(1)
    expect(combatLevelForSkills({})).toBe(1)
  })

  it('is deterministic for identical input', () => {
    const skills = skillsWithLevels({ guard: 20, vitality: 15, spearcraft: 25 })
    expect(combatLevelForSkills(skills)).toBe(combatLevelForSkills(skills))
  })
})

describe('protectedItemCount', () => {
  it('gives a higher allowance in safer risk bands', () => {
    expect(protectedItemCount({ riskBand: 'low' })).toBeGreaterThan(protectedItemCount({ riskBand: 'extreme' }))
  })

  it('reduces the allowance when skulled and raises it under Devotion', () => {
    expect(protectedItemCount({ riskBand: 'moderate', skulled: true }))
      .toBe(protectedItemCount({ riskBand: 'moderate' }) - 1)
    expect(protectedItemCount({ riskBand: 'moderate', devotionActive: true }))
      .toBe(protectedItemCount({ riskBand: 'moderate' }) + 1)
  })

  it('clamps the result to [0, MAX_PROTECTED_ITEMS]', () => {
    expect(protectedItemCount({ riskBand: 'low', devotionActive: true })).toBeLessThanOrEqual(MAX_PROTECTED_ITEMS)
    expect(protectedItemCount({ riskBand: 'extreme', skulled: true })).toBe(0)
    expect(protectedItemCount({ riskBand: 'extreme', skulled: true, devotionActive: false })).toBe(0)
  })

  it('fails safely on unknown risk bands and malformed input', () => {
    expect(protectedItemCount({ riskBand: 'not-a-band' })).toBe(0)
    expect(protectedItemCount({})).toBe(0)
    expect(protectedItemCount()).toBe(0)
    expect(protectedItemCount(null)).toBe(0)
  })
})

describe('planDeathDrop', () => {
  function inventoryWith(items, currency = 0) {
    const base = createInitialInventory()
    return normalizeInventory({
      ...base,
      currency,
      slots: items.map((itemId) => ({ itemId, quantity: 1 })),
    })
  }

  it('never mutates the input inventory', () => {
    const inventory = inventoryWith(['orichalcum', 'thyme'], 50)
    const snapshot = JSON.parse(JSON.stringify(inventory))
    planDeathDrop({ inventory, riskBand: 'high' })
    expect(inventory).toEqual(snapshot)
  })

  it('protects the most valuable carried items and drops the rest', () => {
    const inventory = inventoryWith(['thyme', 'orichalcum', 'barley-flatbread', 'moly'], 0)
    const result = planDeathDrop({ inventory, riskBand: 'low' }) // low protects 4
    expect(result.kept).toHaveLength(4)
    expect(result.dropped).toHaveLength(0)
    expect(result.kept[0].itemId).toBe('orichalcum')
  })

  it('orders kept items by stable value descending', () => {
    const inventory = inventoryWith(['thyme', 'orichalcum', 'moly', 'barley-flatbread'], 0)
    const result = planDeathDrop({ inventory, riskBand: 'moderate' }) // protects 3
    // orichalcum(400) > moly(120) > barley-flatbread(5) == thyme(5); equal
    // values tie-break by itemId ascending, so barley-flatbread sorts first.
    expect(result.kept.map((entry) => entry.itemId)).toEqual(['orichalcum', 'moly', 'barley-flatbread'])
    expect(result.dropped.map((entry) => entry.itemId)).toEqual(['thyme'])
  })

  it('uses itemId as a stable tie-break for equal values', () => {
    // copper-ore and tin-ore both value 8; 'copper-ore' < 'tin-ore' sorts first.
    const inventory = inventoryWith(['tin-ore', 'copper-ore'], 0)
    const result = planDeathDrop({ inventory, riskBand: 'moderate' })
    expect(result.kept[0].itemId).toBe('copper-ore')
    expect(result.kept[1].itemId).toBe('tin-ore')
  })

  it('handles stackable items as whole slots', () => {
    const inventory = normalizeInventory({
      ...createInitialInventory(),
      currency: 0,
      slots: [{ itemId: 'drachma', quantity: 100 }, { itemId: 'orichalcum', quantity: 1 }],
    })
    const result = planDeathDrop({ inventory, riskBand: 'low' }) // protects 4, keeps both
    expect(result.kept).toHaveLength(2)
    const drachma = result.kept.find((entry) => entry.itemId === 'drachma')
    expect(drachma.quantity).toBe(100)
  })

  it('computes currency loss by risk band without mutating input', () => {
    const inventory = inventoryWith(['thyme'], 100)
    expect(planDeathDrop({ inventory, riskBand: 'low' }).lostCurrency).toBe(10)
    expect(planDeathDrop({ inventory, riskBand: 'moderate' }).lostCurrency).toBe(25)
    expect(planDeathDrop({ inventory, riskBand: 'high' }).lostCurrency).toBe(50)
    expect(planDeathDrop({ inventory, riskBand: 'severe' }).lostCurrency).toBe(75)
    expect(planDeathDrop({ inventory, riskBand: 'extreme' }).lostCurrency).toBe(100)
    expect(inventory.currency).toBe(100)
  })

  it('fails safely on empty and malformed input', () => {
    const empty = planDeathDrop({ inventory: null, riskBand: 'high' })
    expect(empty.kept).toEqual([])
    expect(empty.dropped).toEqual([])
    expect(empty.lostCurrency).toBe(0)
    const malformed = planDeathDrop({ inventory: { slots: [{ itemId: 'not-an-item', quantity: 1 }] }, riskBand: 'high' })
    expect(malformed.dropped).toEqual([])
    expect(planDeathDrop()).toEqual({ kept: [], dropped: [], lostCurrency: 0 })
  })

  it('never drops quest items or epithet fragments', () => {
    const inventory = normalizeInventory({
      ...createInitialInventory(),
      currency: 0,
      questItems: ['oath-of-the-beacon'],
      epithetFragments: ['fragment-of-zeus'],
      slots: [{ itemId: 'thyme', quantity: 1 }],
    })
    const result = planDeathDrop({ inventory, riskBand: 'extreme' }) // protects 0
    // The carried thyme is dropped, but quest items and epithet fragments are
    // never eligible to drop and remain untouched in the source inventory.
    expect(result.dropped).toEqual([{ itemId: 'thyme', quantity: 1 }])
    expect(result.dropped.some((entry) => entry.itemId === 'oath-of-the-beacon')).toBe(false)
    expect(inventory.questItems).toEqual(['oath-of-the-beacon'])
    expect(inventory.epithetFragments).toEqual(['fragment-of-zeus'])
  })

  it('accounts for every authored crafting extension as a valid owned item', () => {
    for (const itemId of Object.keys(ITEM_EXTENSIONS)) {
      const inventory = {
        ...createInitialInventory(),
        slots: [{ itemId, quantity: 1 }],
      }
      expect(planDeathDrop({ inventory, riskBand: 'low' }).kept, `${itemId} kept`).toEqual([{ itemId, quantity: 1 }])
      expect(planDeathDrop({ inventory, riskBand: 'extreme' }).dropped, `${itemId} dropped`).toEqual([{ itemId, quantity: 1 }])
      expect(itemValue(itemId), `${itemId} value`).toBeGreaterThan(0)
    }
  })
})

describe('itemValue stable table', () => {
  it('orders authored items by their stable value', () => {
    expect(itemValue('orichalcum')).toBeGreaterThan(itemValue('silver-ore'))
    expect(itemValue('silver-ore')).toBeGreaterThan(itemValue('copper-ore'))
    expect(itemValue('ambrosia-bloom')).toBeGreaterThan(itemValue('thyme'))
  })

  it('falls back deterministically for unknown items', () => {
    expect(itemValue('not-an-item')).toBe(0)
    expect(itemValue('iron-ore')).toBe(40)
  })
})

describe('wildernessCombatRewards', () => {
  it('returns a deterministic XP bundle for a known enemy with kill credit', () => {
    const a = wildernessCombatRewards({ enemyId: 'wild-boar', damageByStyle: { spearcraft: 50 }, killCredit: true })
    const b = wildernessCombatRewards({ enemyId: 'wild-boar', damageByStyle: { spearcraft: 50 }, killCredit: true })
    expect(a).toEqual(b)
    // Spear damage trains both spearcraft and might, each capped at the
    // enemy's authored maximum for this kill.
    expect(a.xp.spearcraft).toBe(20)
    expect(a.xp.might).toBe(15)
    expect(a.xp.guard).toBeUndefined()
    expect(a.xp.vitality).toBeUndefined()
    expect(a.currency).toBe(5)
    expect(a.items).toEqual([{ itemId: 'thyme', quantity: 1 }])
  })

  it('scales XP with actual damage dealt while below the authored cap', () => {
    const result = wildernessCombatRewards({ enemyId: 'wild-boar', damageByStyle: { spearcraft: 10 }, killCredit: true })
    // spearcraft: floor(10 * 0.6) = 6; might: floor(10 * 0.35) = 3
    expect(result.xp.spearcraft).toBe(6)
    expect(result.xp.might).toBe(3)
  })

  it('caps XP at the enemy-authored maximum regardless of overkill damage', () => {
    const result = wildernessCombatRewards({ enemyId: 'wild-boar', damageByStyle: { spearcraft: 1000 }, killCredit: true })
    expect(result.xp.spearcraft).toBe(20)
    expect(result.xp.might).toBe(15)
  })

  it('trains guard from guarded damage taken and vitality from total damage taken', () => {
    const result = wildernessCombatRewards({
      enemyId: 'wild-boar',
      damageByStyle: {},
      damageTaken: 20,
      guardedDamageTaken: 10,
      killCredit: true,
    })
    // guard: floor(10 * 0.8) = 8 (under the cap of 10); vitality: floor(20 * 0.4) = 8, capped at 8
    expect(result.xp.guard).toBe(8)
    expect(result.xp.vitality).toBe(8)
    expect(result.xp.spearcraft).toBeUndefined()
  })

  it('grants zero XP for every skill when no contribution is recorded', () => {
    const result = wildernessCombatRewards({ enemyId: 'wild-boar', damageByStyle: {}, killCredit: true })
    expect(result.xp).toEqual({})
  })

  it('fails safely on unknown enemies and missing kill credit', () => {
    expect(wildernessCombatRewards({ enemyId: 'not-an-enemy', damageByStyle: {}, killCredit: true })).toBeNull()
    expect(wildernessCombatRewards({ enemyId: 'wild-boar', damageByStyle: {}, killCredit: false })).toBeNull()
    expect(wildernessCombatRewards({ enemyId: 'wild-boar', damageByStyle: {} })).toBeNull()
    expect(wildernessCombatRewards()).toBeNull()
  })

  it('only ever grants XP for skills the enemy authors, never above its cap', () => {
    for (const enemy of Object.values(ENEMY_DEFS)) {
      const result = wildernessCombatRewards({
        enemyId: enemy.id,
        damageByStyle: { spearcraft: 500, marksmanship: 500, stormcalling: 500 },
        damageTaken: 500,
        guardedDamageTaken: 500,
        killCredit: true,
      })
      for (const skillId of Object.keys(result.xp)) {
        expect(['spearcraft', 'might', 'guard', 'vitality', 'marksmanship', 'stormcalling']).toContain(skillId)
        expect(enemy.xp[skillId]).toBeGreaterThan(0)
        expect(result.xp[skillId]).toBeLessThanOrEqual(enemy.xp[skillId])
      }
      for (const entry of result.items) {
        expect(entry.itemId).toBeTruthy()
        expect(entry.quantity).toBeGreaterThan(0)
      }
    }
  })
})

describe('rollWildernessEncounter', () => {
  it('is deterministic: identical inputs give identical results', () => {
    const args = { regionId: 'olive-road', seed: 42, step: 3 }
    expect(rollWildernessEncounter(args)).toBe(rollWildernessEncounter(args))
  })

  it('returns only authored enemy ids or null', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      for (const region of REGIONS) {
        const result = rollWildernessEncounter({ regionId: region.id, seed, step: 1 })
        if (result !== null) {
          expect(region.enemyPool).toContain(result)
        }
      }
    }
  })

  it('varies with seed and step', () => {
    const base = rollWildernessEncounter({ regionId: 'asphodel-fringe', seed: 7, step: 0 })
    const differentSeed = rollWildernessEncounter({ regionId: 'asphodel-fringe', seed: 8, step: 0 })
    const differentStep = rollWildernessEncounter({ regionId: 'asphodel-fringe', seed: 7, step: 1 })
    expect(differentSeed !== base || differentStep !== base).toBe(true)
  })

  it('fails safely on unknown regions and empty pools', () => {
    expect(rollWildernessEncounter({ regionId: 'not-a-region', seed: 1, step: 1 })).toBeNull()
    expect(rollWildernessEncounter()).toBeNull()
  })
})
