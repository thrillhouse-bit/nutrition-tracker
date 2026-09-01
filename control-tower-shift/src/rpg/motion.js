export const MOVEMENT_COMMIT_INTERVAL_MS = 100

export function shouldCommitMovement(lastCommitAt, now, force = false) {
  return force || now - lastCommitAt >= MOVEMENT_COMMIT_INTERVAL_MS
}

// Canonical camera contract shared by canvas rendering, pointer inversion, and
// DOM overlays. Keeping the transform and its inverse together prevents an
// overlay from drifting onto a different camera than the painted world.
export function createWorldProjection({
  focusX = 0,
  focusY = 0,
  viewportWidth,
  viewportHeight,
  worldWidth,
  worldHeight,
}) {
  if (![viewportWidth, viewportHeight, worldWidth, worldHeight].every((value) => Number.isFinite(value) && value > 0)) {
    return {
      valid: false,
      portrait: false,
      scale: 0,
      cameraX: 0,
      cameraY: 0,
      visibleWidth: 0,
      visibleHeight: 0,
      viewportWidth: 0,
      viewportHeight: 0,
    }
  }
  const portrait = viewportHeight > viewportWidth * 1.15
  const scale = portrait
    ? Math.max(viewportWidth / worldWidth, viewportHeight / worldHeight)
    : Math.min(viewportWidth / worldWidth, viewportHeight / worldHeight)
  const visibleWidth = viewportWidth / scale
  const visibleHeight = viewportHeight / scale
  const cameraX = portrait
    ? Math.max(0, Math.min(worldWidth - visibleWidth, focusX - visibleWidth / 2))
    : Math.max(0, (worldWidth - visibleWidth) / 2)
  const cameraY = portrait
    ? Math.max(0, Math.min(worldHeight - visibleHeight, focusY - visibleHeight / 2))
    : Math.max(0, (worldHeight - visibleHeight) / 2)
  return {
    valid: true,
    portrait,
    scale,
    cameraX,
    cameraY,
    visibleWidth,
    visibleHeight,
    viewportWidth,
    viewportHeight,
  }
}

export function projectPoint(projection, point) {
  if (!projection?.valid || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return { x: 0, y: 0 }
  return {
    x: (point.x - projection.cameraX) * projection.scale,
    y: (point.y - projection.cameraY) * projection.scale,
  }
}

export function unprojectPoint(projection, point) {
  if (!projection?.valid || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return { x: 0, y: 0 }
  return {
    x: projection.cameraX + point.x / projection.scale,
    y: projection.cameraY + point.y / projection.scale,
  }
}

export function projectedPointIsVisible(projection, point) {
  return Boolean(
    projection?.valid
    && Number.isFinite(point?.x)
    && Number.isFinite(point?.y)
    && point.x >= 0
    && point.x <= projection.viewportWidth
    && point.y >= 0
    && point.y <= projection.viewportHeight
  )
}

export function projectWorldPoint({ x, y, focusX = x, focusY = y, ...dimensions }) {
  return projectPoint(createWorldProjection({ focusX, focusY, ...dimensions }), { x, y })
}

export function playerSpriteTransform(point, facing = 0) {
  const facingScale = Math.cos(facing || 0) >= 0 ? 1 : -1
  return `translate3d(${point.x.toFixed(2)}px, ${point.y.toFixed(2)}px, 0) translate(-50%, -91%) scaleX(${facingScale})`
}
