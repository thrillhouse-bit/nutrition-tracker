import { worldBounds } from './world.js'

export const PATH_GRID_SIZE = 20
export const PATH_CLEARANCE = 16

function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq
    ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq))
    : 0
  const x = a.x + dx * t
  const y = a.y + dy * t
  return Math.hypot(point.x - x, point.y - y)
}

function isInsideActiveLane(point, map, routeStateId, clearance) {
  const lanes = map.traversalLanes || []
  // A route state constrains movement as soon as the map authors at least one
  // lane for it. Only maps with no matching lane keep their unconstrained
  // geometry, preserving static maps and unknown future state IDs.
  if (!routeStateId || !lanes.some((lane) => lane.stateIds.includes(routeStateId))) return true
  return lanes
    .filter((lane) => lane.stateIds.includes(routeStateId))
    .some((lane) => {
      const safeRadius = Math.max(8, lane.width / 2 - clearance)
      for (let i = 1; i < lane.points.length; i += 1) {
        if (pointSegmentDistance(point, lane.points[i - 1], lane.points[i]) <= safeRadius) return true
      }
      return false
    })
}

export function isWorldPointWalkable(map, point, options = {}) {
  if (!map || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return false
  const clearance = options.clearance ?? PATH_CLEARANCE
  const bounds = worldBounds(map)
  if (
    point.x < bounds.x || point.x > bounds.x + bounds.w
    || point.y < bounds.y || point.y > bounds.y + bounds.h
  ) return false

  if (!isInsideActiveLane(point, map, options.routeStateId, clearance)) return false

  for (const solid of map.collisions || []) {
    if (
      point.x > solid.x - clearance && point.x < solid.x + solid.w + clearance
      && point.y > solid.y - clearance && point.y < solid.y + solid.h + clearance
    ) return false
  }

  for (const decor of map.decor || []) {
    if (decor.kind !== 'column') continue
    if (
      point.x > decor.x - 18 && point.x < decor.x + 18
      && point.y > decor.y - 60 && point.y < decor.y + 10
    ) return false
  }
  return true
}

function gridForMap(map, gridSize) {
  const bounds = worldBounds(map)
  return {
    bounds,
    cols: Math.floor(bounds.w / gridSize) + 1,
    rows: Math.floor(bounds.h / gridSize) + 1,
    point(col, row) {
      return {
        x: Math.min(bounds.x + bounds.w, bounds.x + col * gridSize),
        y: Math.min(bounds.y + bounds.h, bounds.y + row * gridSize),
      }
    },
    cell(point) {
      return {
        col: Math.max(0, Math.min(this.cols - 1, Math.round((point.x - bounds.x) / gridSize))),
        row: Math.max(0, Math.min(this.rows - 1, Math.round((point.y - bounds.y) / gridSize))),
      }
    },
  }
}

const cellKey = (cell) => `${cell.col}:${cell.row}`

function nearestWalkableCell(grid, map, point, options) {
  const origin = grid.cell(point)
  const maxRadius = Math.max(grid.cols, grid.rows)
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    let best = null
    for (let row = origin.row - radius; row <= origin.row + radius; row += 1) {
      for (let col = origin.col - radius; col <= origin.col + radius; col += 1) {
        if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) continue
        if (radius && Math.max(Math.abs(col - origin.col), Math.abs(row - origin.row)) !== radius) continue
        const candidate = { col, row }
        const world = grid.point(col, row)
        if (!isWorldPointWalkable(map, world, options)) continue
        const distance = Math.hypot(world.x - point.x, world.y - point.y)
        if (!best || distance < best.distance) best = { ...candidate, distance }
      }
    }
    if (best) return { col: best.col, row: best.row }
  }
  return null
}

function segmentIsWalkable(map, a, b, options, gridSize) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y)
  const samples = Math.max(1, Math.ceil(distance / (gridSize / 2)))
  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples
    if (!isWorldPointWalkable(map, {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    }, options)) return false
  }
  return true
}

// Reducer movement uses the same collision and route-state geometry as world
// pathing.  This deliberately validates the exact segment, rather than merely
// snapping its endpoints to nearby grid cells: an event cannot step through a
// wall or across an inactive state lane between two individually valid points.
export function isWorldPathStepReachable(map, start, end, options = {}) {
  if (!isWorldPointWalkable(map, start, options) || !isWorldPointWalkable(map, end, options)) return false
  return segmentIsWalkable(map, start, end, options, options.gridSize ?? PATH_GRID_SIZE)
}

function smoothPath(map, points, options, gridSize) {
  if (points.length < 3) return points
  const smoothed = [points[0]]
  let anchor = 0
  while (anchor < points.length - 1) {
    let next = points.length - 1
    while (next > anchor + 1 && !segmentIsWalkable(map, points[anchor], points[next], options, gridSize)) next -= 1
    smoothed.push(points[next])
    anchor = next
  }
  return smoothed
}

export function findWorldPath(map, start, goal, options = {}) {
  const gridSize = options.gridSize ?? PATH_GRID_SIZE
  if (!map || !Number.isFinite(start?.x) || !Number.isFinite(start?.y) || !Number.isFinite(goal?.x) || !Number.isFinite(goal?.y)) return []
  const grid = gridForMap(map, gridSize)
  const startCell = nearestWalkableCell(grid, map, start, options)
  const goalCell = nearestWalkableCell(grid, map, goal, options)
  if (!startCell || !goalCell) return []

  const startKey = cellKey(startCell)
  const goalKey = cellKey(goalCell)
  // An interaction target can deliberately sit just outside the walkable
  // lane while remaining within the semantic interaction radius. When its
  // closest walkable cell is the player's current cell, that is a valid
  // zero-length approach—not a failed route. Returning the concrete cell
  // lets reducer-side proximity authorization distinguish it from no path.
  if (startKey === goalKey) return [grid.point(startCell.col, startCell.row)]
  const open = [{ ...startCell, f: 0 }]
  const cameFrom = new Map()
  const gScore = new Map([[startKey, 0]])
  const closed = new Set()
  const directions = [
    [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
    [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, 1, Math.SQRT2],
  ]
  const heuristic = (cell) => {
    const dx = Math.abs(cell.col - goalCell.col)
    const dy = Math.abs(cell.row - goalCell.row)
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)
  }

  while (open.length) {
    open.sort((a, b) => a.f - b.f)
    const current = open.shift()
    const currentKey = cellKey(current)
    if (closed.has(currentKey)) continue
    if (currentKey === goalKey) {
      const cells = [current]
      let key = currentKey
      while (cameFrom.has(key)) {
        const previous = cameFrom.get(key)
        cells.push(previous)
        key = cellKey(previous)
      }
      cells.reverse()
      let points = cells.map((cell) => grid.point(cell.col, cell.row))
      points[0] = isWorldPointWalkable(map, start, options) ? { x: start.x, y: start.y } : points[0]
      if (isWorldPointWalkable(map, goal, options) && segmentIsWalkable(map, points.at(-1), goal, options, gridSize)) {
        points.push({ x: goal.x, y: goal.y })
      }
      points = smoothPath(map, points, options, gridSize)
      return points.slice(1)
    }

    closed.add(currentKey)
    for (const [dc, dr, cost] of directions) {
      const neighbor = { col: current.col + dc, row: current.row + dr }
      if (neighbor.col < 0 || neighbor.row < 0 || neighbor.col >= grid.cols || neighbor.row >= grid.rows) continue
      const currentPoint = grid.point(current.col, current.row)
      const neighborPoint = grid.point(neighbor.col, neighbor.row)
      if (!isWorldPointWalkable(map, neighborPoint, options)) continue
      // Adjacent grid centers can lie on opposite sides of a thin collision
      // edge. Do not return a route whose individual reducer MOVE step would
      // correctly reject that crossing.
      if (!isWorldPathStepReachable(map, currentPoint, neighborPoint, options)) continue
      if (dc && dr) {
        const horizontal = grid.point(current.col + dc, current.row)
        const vertical = grid.point(current.col, current.row + dr)
        if (!isWorldPointWalkable(map, horizontal, options) || !isWorldPointWalkable(map, vertical, options)) continue
      }
      const neighborKey = cellKey(neighbor)
      const tentative = (gScore.get(currentKey) ?? Infinity) + cost
      if (tentative >= (gScore.get(neighborKey) ?? Infinity)) continue
      cameFrom.set(neighborKey, { col: current.col, row: current.row })
      gScore.set(neighborKey, tentative)
      open.push({ ...neighbor, f: tentative + heuristic(neighbor) })
    }
  }
  return []
}
