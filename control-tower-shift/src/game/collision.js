// Circle-circle collision. Touching counts as colliding (<=, not <): the
// threshold tests pin this so the boundary can't silently flip to exclusive.
export function circlesCollide(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const rr = a.radius + b.radius
  return dx * dx + dy * dy <= rr * rr
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Every pair of distinct entities currently overlapping, as [idA, idB] with
// idA < idB. O(n^2) is fine at this entity count and keeps it dependency-free.
export function detectCollisions(entities) {
  const pairs = []
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      if (circlesCollide(entities[i], entities[j])) {
        const [a, b] = [entities[i].id, entities[j].id].sort()
        pairs.push([a, b])
      }
    }
  }
  return pairs
}

// Threats currently overlapping the tower footprint.
export function threatsHittingTower(state) {
  const tower = {
    x: state.config.towerX,
    y: state.config.towerY,
    radius: state.config.towerRadius,
  }
  return state.threats.filter((t) => circlesCollide(t, tower))
}
