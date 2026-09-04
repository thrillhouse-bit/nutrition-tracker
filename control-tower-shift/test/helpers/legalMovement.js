import { findWorldPath } from '../../src/rpg/pathfinding.js'
import { rpgMapById } from '../../src/rpg/registry.js'
import { routeStateForMap } from '../../src/rpg/routeState.js'
import { applyEvent, MAX_WORLD_MOVE_STEP } from '../../src/rpg/state.js'

// Test-only equivalent of normal locomotion. It intentionally replays bounded
// reducer MOVE events; tests must not teleport through collision or inactive
// route lanes merely to arrange a semantic interaction.
export function moveAlongWorldPath(state, target, { facing } = {}) {
  const map = rpgMapById(state.world?.mapId)
  const path = findWorldPath(map, state.world?.position, target, {
    routeStateId: routeStateForMap(state, map),
  })
  if (!path.length) throw new Error(`No legal MOVE path on ${state.world?.mapId} to ${target?.x},${target?.y}`)

  let next = state
  for (const point of path) {
    const start = next.world.position
    const distance = Math.hypot(point.x - start.x, point.y - start.y)
    const count = Math.max(1, Math.ceil(distance / (MAX_WORLD_MOVE_STEP / 2)))
    for (let index = 1; index <= count; index += 1) {
      const fraction = index / count
      const moved = applyEvent(next, {
        type: 'MOVE',
        x: start.x + (point.x - start.x) * fraction,
        y: start.y + (point.y - start.y) * fraction,
        ...(Number.isFinite(facing) ? { facing } : {}),
      })
      if (moved === next) throw new Error(`Reducer rejected legal MOVE segment on ${state.world?.mapId}`)
      next = moved
    }
  }
  return next
}
