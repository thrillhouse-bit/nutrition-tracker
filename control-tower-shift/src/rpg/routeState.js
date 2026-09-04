// Canonical dynamic-route state selection shared by rendering and reducer
// physical authorization. Keeping this pure prevents UI affordances from
// evaluating a different tide/season/pressure/light path than the reducer.

import { ACT2_TIDE_ORDER, ACT2_TIDE_STATES } from './act2Content.js'
import { ACT3_SEASONAL_STATES } from './act3Content.js'
import { ACT4_PRESSURE_STATES } from './act4Content.js'
import { ACT5_LIGHT_POLARITY_RULES } from './act5Content.js'

export const ACT2_TIDE_FLAG = 'act2:tide-state'
export const ACT5_LIGHT_FLAG = 'act5:light-state'

export function hasAcceptedAct5LightContract(map) {
  if (map?.act !== 5 || !map.light || !Array.isArray(map.light.laneIds)) return false
  const accepted = ACT5_LIGHT_POLARITY_RULES.stateIds
  if (!accepted.includes(map.light.initialStateId)) return false
  const lanes = new Map((map.traversalLanes || []).map((lane) => [lane.id, lane]))
  return map.light.laneIds.every((laneId) => {
    const lane = lanes.get(laneId)
    return lane && Array.isArray(lane.stateIds) && lane.stateIds.every((id) => accepted.includes(id))
  })
}

export function currentTideRouteStateId(state) {
  const candidate = state?.flags?.[ACT2_TIDE_FLAG]
  return typeof candidate === 'string' && ACT2_TIDE_STATES[candidate]
    ? candidate
    : ACT2_TIDE_ORDER[0]
}

export function routeStateForMap(state, map) {
  if (map?.act === 2) return currentTideRouteStateId(state)
  if (map?.act === 3) {
    const candidate = state?.flags?.['act3:season-state']
    return ACT3_SEASONAL_STATES[candidate] ? candidate : map.season?.initialStateId || 'winter'
  }
  if (map?.act === 4) {
    const candidate = state?.flags?.['act4:pressure-state']
    return ACT4_PRESSURE_STATES[candidate] ? candidate : map.pressure?.initialStateId || 'safe'
  }
  if (hasAcceptedAct5LightContract(map)) {
    const current = state?.flags?.[ACT5_LIGHT_FLAG]
    return ACT5_LIGHT_POLARITY_RULES.stateIds.includes(current) ? current : map.light.initialStateId
  }
  return null
}
