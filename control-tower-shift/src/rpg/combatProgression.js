// Action-derived combat progression. The arena remains the authority for
// damage; this module only attributes observed health loss to the last
// offensive action the player actually performed.

export const OFFENSIVE_COMBAT_SKILLS = Object.freeze(['spearcraft', 'marksmanship', 'stormcalling'])

function positiveFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

export function combatStyleForInput(input, fallback = null) {
  if (typeof input?.powerId === 'string' && input.powerId) return 'stormcalling'
  if (input?.firing === true) return 'marksmanship'
  if (input?.attack === true) return 'spearcraft'
  return OFFENSIVE_COMBAT_SKILLS.includes(fallback) ? fallback : null
}

export function observedThreatDamage(beforeArena, afterArena) {
  const afterById = new Map((afterArena?.threats || []).map((threat) => [threat.id, threat]))
  let damage = 0
  for (const before of beforeArena?.threats || []) {
    const beforeHealth = positiveFinite(before?.health)
    if (!beforeHealth || typeof before?.id !== 'string') continue
    const after = afterById.get(before.id)
    const afterHealth = after ? Math.max(0, positiveFinite(after.health)) : 0
    damage += Math.max(0, beforeHealth - afterHealth)
  }
  return Number(damage.toFixed(6))
}

export function recordCombatContributions(session, beforeArena, afterArena, input = {}) {
  const style = combatStyleForInput(input, session?.lastOffenseSkill)
  const damage = observedThreatDamage(beforeArena, afterArena)
  const damageByStyle = { ...(session?.damageByStyle || {}) }
  if (style && damage > 0) damageByStyle[style] = Number(((damageByStyle[style] || 0) + damage).toFixed(6))
  const damageTakenThisTick = Math.max(0,
    positiveFinite(beforeArena?.deity?.health) - Math.max(0, positiveFinite(afterArena?.deity?.health)),
  )
  return {
    damageByStyle,
    lastOffenseSkill: style,
    damageTaken: Number(((session?.damageTaken || 0) + damageTakenThisTick).toFixed(6)),
    guardedDamageTaken: Number(((session?.guardedDamageTaken || 0) + (input?.guard ? damageTakenThisTick : 0)).toFixed(6)),
  }
}

// Story combat pays only for demonstrated offensive contribution. Enemy
// health already scales with encounter difficulty, so progression scales from
// real damage rather than a fixed act-completion bundle. Melee damage trains
// both technique and force; ranged and divine damage train their own styles.
export function combatXpFromDamage(damageByStyle) {
  const spearDamage = positiveFinite(damageByStyle?.spearcraft)
  const rangedDamage = positiveFinite(damageByStyle?.marksmanship)
  const divineDamage = positiveFinite(damageByStyle?.stormcalling)
  const rewards = []
  const add = (skillId, amount) => {
    const floored = Math.floor(amount)
    if (floored > 0) rewards.push({ skillId, amount: floored })
  }
  add('spearcraft', spearDamage * 0.6)
  add('might', spearDamage * 0.35)
  add('marksmanship', rangedDamage * 0.75)
  add('stormcalling', divineDamage * 0.75)
  return rewards
}

export function combatXpFromContributions(contributions) {
  const rewards = combatXpFromDamage(contributions?.damageByStyle)
  const add = (skillId, amount) => {
    const floored = Math.floor(amount)
    if (floored > 0) rewards.push({ skillId, amount: floored })
  }
  add('guard', positiveFinite(contributions?.guardedDamageTaken) * 0.8)
  add('vitality', positiveFinite(contributions?.damageTaken) * 0.4)
  return rewards
}
