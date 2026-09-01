// Code-native Canvas renderer for the RPG story world — Phase E production
// presentation pass.
//
// Beacon Overlook and Olive Road are authored as layered Aegean scenes with
// strong plane separation:
//   FOREGROUND  — parapet/rock occlusion band at the bottom edge;
//   MIDGROUND   — the playable terrace floor: authored stone, traversal lanes,
//                 cast shadows, route markers, broken-letter seams;
//   BACKGROUND  — parapet wall, then sea/islands/distant city or hills and an
//                 aqueduct/terrace chasm with distant structures.
//
// Kallias renders as a readable ~86px-tall authored silhouette: lighter
// medium-brown hair, pale husky-blue eyes, spear in the lead hand, hooked
// xiphos holstered at the hip (never held), compact white-blue storm energy
// in the free hand, blue-gray fractured mantle, bronze/ivory kit. Named NPCs
// (Thessa, Amonides) have distinct authored silhouettes — no shared robe
// token. Everything here is deterministic: no RNG, no DOM, no network. Only
// the caller-supplied frame counter `fx.t` drives restrained motion.
//
// Pure drawing: mutates the canvas only. Collision and interaction contracts
// (bounds, column AABBs, entity/exit positions) are untouched.

export const WORLD_VIEW_W = 960
export const WORLD_VIEW_H = 540

const PLAYER_RADIUS = 16

// Plane anchors (world pixels). The playable floor sits between the back
// structure band and the foreground occlusion band.
const HORIZON = 66
const WALL_TOP = 60
const WALL_BOTTOM = 102
const FLOOR_TOP = WALL_BOTTOM
const FLOOR_BOTTOM = 506
const FG_TOP = 500

// Authored vegetation/material colors (deterministic constants, not palette
// lookups — the map palettes in content.js remain the runtime-canonical
// daylight tokens and are still used for sky/sea/floor/stone).
const OLIVE_LEAF = '#6d7a4a'
const OLIVE_LEAF_HI = '#96a26b'
const OLIVE_LEAF_LO = '#4f5c37'
const OLIVE_TRUNK = '#6b4f33'
const CYPRESS_DARK = '#33452e'
const CYPRESS_MID = '#465c3c'
const SKIN = '#c98a5e'
const SKIN_SHADE = '#a86e48'
const KALLIAS_HAIR = '#7d5b3a'
const KALLIAS_HAIR_HI = '#a57e52'
const KALLIAS_MANTLE = '#46586e'
const KALLIAS_MANTLE_LO = '#33414f'
const IVORY = '#efe6cd'
const BRONZE = '#a8762f'
const BRONZE_DARK = '#7c5620'
const STORM_CORE = '#eaf6ff'
const STORM_ARC = '#9fd8ff'
const THESSA_INDIGO = '#2a3a63'
const THESSA_INDIGO_HI = '#3c5184'
const THESSA_SILVER = '#cfd2d6'
const KEEPER_CLOAK = '#191714'
const KEEPER_CLOAK_HI = '#2b2721'
const KEEPER_GRAY = '#b4ae9f'
const WAX = '#3a2f22'
const WAX_BOARD = '#c9a86a'

// Production environment paintings are presentation-only backplates. Live
// exits, interactables, objectives, NPCs, and Kallias remain code-native and
// are drawn above them, so collision and deterministic progression stay in
// the authored map data. The vector scene remains a complete fallback for
// tests, non-DOM renderers, or the first frames before an image is decoded.
const PAINTED_ENVIRONMENT_IDS = new Set(['beacon-overlook', 'olive-road'])

// ─── Small helpers ─────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function poly(ctx, pts, fill) {
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.closePath()
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
}

// A hard cast shadow falling down-left (sun sits up-right).
function castShadow(ctx, x, y, w, len, alpha = 0.24) {
  poly(ctx, [
    [x - w / 2, y],
    [x + w / 2, y],
    [x + w / 2 - len * 0.55, y + len],
    [x - w / 2 - len * 0.55, y + len],
  ], `rgba(26,20,10,${alpha})`)
}

// ─── Background: sky, sea, distant scenery ─────────────────────
function drawSky(ctx, map, W) {
  const p = map.palette
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON)
  sky.addColorStop(0, p.sky)
  sky.addColorStop(1, p.skyLow)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, HORIZON + 2)
  // Sun disc + halo (up-right; drives the shadow direction).
  ctx.fillStyle = 'rgba(255,243,207,0.32)'
  ctx.beginPath(); ctx.arc(W * 0.78, 26, 30, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = p.sun
  ctx.beginPath(); ctx.arc(W * 0.78, 26, 17, 0, Math.PI * 2); ctx.fill()
}

function drawIsland(ctx, x, y, w, h, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(x + w * 0.3, y - h, x + w * 0.55, y - h * 0.55)
  ctx.quadraticCurveTo(x + w * 0.75, y - h * 0.8, x + w, y)
  ctx.closePath()
  ctx.fill()
}

function drawFarScenery(ctx, map, W) {
  const p = map.palette
  // Sea band with a couple of authored islands and sail glints.
  ctx.fillStyle = p.sea
  ctx.fillRect(0, HORIZON - 24, W, 24)
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = 1
  for (let i = 0; i < 7; i++) {
    const x = 60 + i * 138
    const y = HORIZON - 18 + (i % 3) * 5
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 26, y); ctx.stroke()
  }
  if (map.id === 'beacon-overlook') {
    drawIsland(ctx, 120, HORIZON - 20, 130, 16, 'rgba(84,113,124,0.9)')
    drawIsland(ctx, 560, HORIZON - 22, 90, 11, 'rgba(84,113,124,0.75)')
    // Distant harbor city on the left headland: wall + small temples.
    poly(ctx, [[0, HORIZON - 20], [0, HORIZON - 34], [46, HORIZON - 40], [96, HORIZON - 30], [96, HORIZON - 20]], 'rgba(122,128,120,0.85)')
    ctx.fillStyle = 'rgba(214,208,188,0.9)'
    ctx.fillRect(30, HORIZON - 46, 12, 8)
    ctx.fillRect(58, HORIZON - 42, 10, 6)
    poly(ctx, [[28, HORIZON - 46], [36, HORIZON - 52], [44, HORIZON - 46]], 'rgba(226,220,200,0.9)')
    // Static birds.
    ctx.strokeStyle = 'rgba(20,28,38,0.55)'
    ctx.lineWidth = 1.4
    for (const [bx, by] of [[340, 30], [372, 22], [398, 34]]) {
      ctx.beginPath()
      ctx.moveTo(bx - 5, by); ctx.quadraticCurveTo(bx, by - 4, bx + 5, by)
      ctx.stroke()
    }
  } else {
    // Olive Road: layered hills with terrace lines behind the aqueduct.
    drawIsland(ctx, 690, HORIZON - 20, 150, 14, 'rgba(96,108,116,0.8)')
    poly(ctx, [[0, HORIZON - 20], [0, HORIZON - 46], [130, HORIZON - 62], [300, HORIZON - 34], [300, HORIZON - 20]], 'rgba(122,122,94,0.85)')
    poly(ctx, [[260, HORIZON - 20], [420, HORIZON - 54], [640, HORIZON - 26], [640, HORIZON - 20]], 'rgba(108,110,84,0.8)')
    ctx.strokeStyle = 'rgba(255,244,214,0.22)'
    ctx.lineWidth = 1
    for (let i = 0; i < 4; i++) {
      const y = HORIZON - 30 - i * 7
      ctx.beginPath(); ctx.moveTo(40 + i * 26, y); ctx.lineTo(180 + i * 22, y - 6); ctx.stroke()
    }
    // Distant round tholos on the right hill.
    ctx.fillStyle = 'rgba(214,206,184,0.85)'
    ctx.fillRect(560, HORIZON - 40, 22, 12)
    ctx.beginPath(); ctx.arc(571, HORIZON - 40, 11, Math.PI, 0); ctx.fill()
  }
  // Atmospheric haze over the distance.
  ctx.fillStyle = p.haze
  ctx.fillRect(0, 0, W, HORIZON + 2)
}

// ─── Aqueduct / terrace chasm (background structure) ───────────
function drawAqueduct(ctx, map, W) {
  const p = map.palette
  const deckY = WALL_TOP - 6
  const archColor = map.id === 'olive-road' ? '#a99a76' : p.marbleShadow
  const dark = map.id === 'olive-road' ? '#7c6f52' : p.stoneDark
  const gap = map.id === 'olive-road' ? [470, 546] : null // broken span
  // Deck.
  ctx.fillStyle = archColor
  ctx.fillRect(0, deckY - 16, W, 10)
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(0, deckY - 16, W, 2)
  // Piers + arches.
  for (let x = 26; x < W - 20; x += 84) {
    if (gap && x + 40 > gap[0] && x < gap[1]) {
      // Fractured pier stubs at the broken span.
      ctx.fillStyle = dark
      ctx.fillRect(x + 8, deckY - 6, 16, 8)
      poly(ctx, [[x + 30, deckY - 6], [x + 44, deckY - 14], [x + 52, deckY - 6]], dark)
      continue
    }
    ctx.fillStyle = archColor
    ctx.fillRect(x, deckY - 6, 14, HORIZON - deckY + 12)
    ctx.beginPath()
    ctx.strokeStyle = archColor
    ctx.lineWidth = 8
    ctx.arc(x + 42, deckY + 2, 26, Math.PI, 0)
    ctx.stroke()
    // Arch shadow.
    ctx.fillStyle = 'rgba(30,26,16,0.28)'
    ctx.beginPath()
    ctx.arc(x + 42, deckY + 2, 22, Math.PI, 0)
    ctx.fill()
  }
  if (gap) {
    // Fallen deck chunks below the break.
    ctx.fillStyle = dark
    poly(ctx, [[gap[0] + 6, HORIZON + 2], [gap[0] + 30, HORIZON - 6], [gap[0] + 44, HORIZON + 2]])
    poly(ctx, [[gap[1] - 30, HORIZON + 2], [gap[1] - 12, HORIZON - 4], [gap[1] - 2, HORIZON + 2]])
  }
}

// ─── Back wall / parapet with authored gate openings ───────────
function drawBackWall(ctx, map, W) {
  const p = map.palette
  const isBeacon = map.id === 'beacon-overlook'
  // Wall body.
  ctx.fillStyle = isBeacon ? p.marbleMid : '#b7a67f'
  ctx.fillRect(0, WALL_TOP, W, WALL_BOTTOM - WALL_TOP)
  // Coping.
  ctx.fillStyle = isBeacon ? p.marble : '#cbbd97'
  ctx.fillRect(0, WALL_TOP, W, 6)
  ctx.fillStyle = 'rgba(30,26,16,0.25)'
  ctx.fillRect(0, WALL_BOTTOM - 4, W, 4)
  // Baluster rhythm (authored, evenly spaced; skips gate openings).
  ctx.fillStyle = 'rgba(40,36,24,0.28)'
  for (let x = 18; x < W; x += 44) {
    if (isGateX(map, x)) continue
    ctx.fillRect(x, WALL_TOP + 10, 8, WALL_BOTTOM - WALL_TOP - 16)
  }
  // The terrace chasm cut on Beacon Overlook's back-right.
  if (isBeacon) {
    poly(ctx, [[700, WALL_TOP], [772, WALL_TOP], [758, WALL_BOTTOM + 4], [716, WALL_BOTTOM + 4]], '#1d232b')
    // Collapsed bridge stub into the chasm.
    ctx.fillStyle = p.marbleShadow
    poly(ctx, [[688, WALL_TOP + 6], [716, WALL_TOP + 2], [722, WALL_TOP + 16], [694, WALL_TOP + 20]])
    poly(ctx, [[752, WALL_TOP + 8], [784, WALL_TOP + 4], [790, WALL_TOP + 18], [758, WALL_TOP + 22]])
  }
}

function isGateX(map, x) {
  for (const e of map.exits || []) {
    if (e.y < 140 && Math.abs(e.x - x) < 44) return true
  }
  return false
}

// ─── Floor ─────────────────────────────────────────────────────
function drawFloor(ctx, map, W, H, routeStateId = null) {
  const p = map.palette
  const isBeacon = map.id === 'beacon-overlook'
  // Base slab.
  const g = ctx.createLinearGradient(0, FLOOR_TOP, 0, H)
  g.addColorStop(0, isBeacon ? p.marbleMid : '#c9b78d')
  g.addColorStop(1, isBeacon ? p.marble : p.marbleMid)
  ctx.fillStyle = g
  ctx.fillRect(0, FLOOR_TOP, W, H - FLOOR_TOP)

  // Perspective grout: horizontals tighten near the wall.
  ctx.strokeStyle = p.grout
  ctx.lineWidth = 1.6
  ctx.globalAlpha = 0.34
  const rows = [0, 0.12, 0.26, 0.42, 0.6, 0.8]
  for (const f of rows) {
    const y = FLOOR_TOP + f * (FLOOR_BOTTOM - FLOOR_TOP)
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }
  // Converging verticals.
  ctx.globalAlpha = 0.2
  for (let i = -4; i <= 12; i++) {
    const xTop = i * 92
    ctx.beginPath()
    ctx.moveTo(xTop, FLOOR_TOP)
    ctx.lineTo(W / 2 + (xTop - W / 2) * 1.9, FLOOR_BOTTOM + 30)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  if (isBeacon) drawBeaconLanes(ctx, map, W)
  else if (map.id === 'olive-road') drawOliveLanes(ctx, map, W)
  else drawRuntimeLanes(ctx, map, routeStateId)

  // Broken-letter seams: stolen-epithet cracks with missing segments.
  drawLetterSeam(ctx, map.id === 'beacon-overlook' ? 250 : 210, FLOOR_TOP + 40, 150, p)
  drawLetterSeam(ctx, map.id === 'beacon-overlook' ? 640 : 690, FLOOR_TOP + 190, -120, p)
  if (!isBeacon) drawLetterSeam(ctx, 430, FLOOR_TOP + 110, 90, p)

  // Warm pooling shadow toward the foreground.
  const shade = ctx.createLinearGradient(0, H * 0.78, 0, H)
  shade.addColorStop(0, 'rgba(0,0,0,0)')
  shade.addColorStop(1, 'rgba(20,15,6,0.3)')
  ctx.fillStyle = shade
  ctx.fillRect(0, H * 0.78, W, H * 0.22)
}

function drawLetterSeam(ctx, x, y, len, p) {
  ctx.strokeStyle = p.gold
  ctx.globalAlpha = 0.34
  ctx.lineWidth = 2
  const segs = 4
  for (let i = 0; i < segs; i++) {
    if (i === 1 || i === 3) continue // the gaps — letters carried off
    const t0 = i / segs
    const t1 = (i + 1) / segs
    ctx.beginPath()
    ctx.moveTo(x + len * t0, y + t0 * 26 + (i % 2) * 5)
    ctx.lineTo(x + len * t1, y + t1 * 26 + ((i + 1) % 2) * 5)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

// Authored traversal lanes: terracotta paving from each spawn to its gates.
function lanePath(ctx, pts, width, color, edge) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = edge
  ctx.lineWidth = width + 6
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.stroke()
}

export function runtimeLanePresentation(map, lane, routeStateId = null) {
  const resolvedStateId = routeStateId || map?.light?.initialStateId || null
  const usesAct5Polarity = map?.act === 5
    && Array.isArray(map.light?.laneIds)
    && map.light.laneIds.includes(lane?.id)
    && Boolean(resolvedStateId)
  if (!usesAct5Polarity) {
    return { active: true, motif: 'legacy-solid', dash: [], widthInset: 0, alpha: 1 }
  }
  const active = Array.isArray(lane.stateIds) && lane.stateIds.includes(resolvedStateId)
  return active
    ? { active: true, motif: 'continuous-raised-solid', dash: [], widthInset: 0, alpha: 1 }
    : { active: false, motif: 'recessed-broken-dashed', dash: [14, 12], widthInset: 12, alpha: 0.58 }
}

export function drawRuntimeLanes(ctx, map, routeStateId = null) {
  const p = map.palette
  for (const lane of map.traversalLanes || []) {
    const points = (lane.points || []).map((item) => [item.x, item.y])
    if (points.length < 2) continue
    const presentation = runtimeLanePresentation(map, lane, routeStateId)
    const width = Math.max(18, Math.max(24, lane.width || 40) - presentation.widthInset)
    ctx.save()
    ctx.globalAlpha = presentation.alpha
    ctx.setLineDash(presentation.dash)
    lanePath(
      ctx,
      points,
      width,
      presentation.active ? `${p.path}e8` : `${p.stone}88`,
      presentation.active ? `${p.stoneDark}aa` : `${p.stoneDark}66`,
    )
    // Raised routes carry a continuous central highlight in addition to the
    // broad solid paving. Recessed routes deliberately omit it and retain the
    // broken dash pattern, so polarity remains legible without color.
    if (presentation.motif === 'continuous-raised-solid') {
      ctx.setLineDash([])
      ctx.strokeStyle = 'rgba(255,255,255,0.24)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(points[0][0], points[0][1] - 2)
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1] - 2)
      ctx.stroke()
    }
    ctx.restore()
  }
}

function drawBeaconLanes(ctx, map, W) {
  const p = map.palette
  // Spawn -> treaty-stone plaza -> shrine, with a branch to the Olive Road.
  lanePath(ctx, [[160, 430], [300, 380], [430, 300], [430, 240], [350, 190]], 40, 'rgba(203,185,138,0.8)', 'rgba(120,100,64,0.35)')
  lanePath(ctx, [[430, 300], [620, 320], [860, 400]], 36, 'rgba(203,185,138,0.72)', 'rgba(120,100,64,0.3)')
  // Steps up to the Sun Court propylon.
  lanePath(ctx, [[430, 240], [560, 150], [640, 112]], 30, 'rgba(196,177,132,0.66)', 'rgba(120,100,64,0.28)')
  // Plaza ring around the treaty-stone.
  ctx.strokeStyle = 'rgba(88,80,71,0.4)'
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.ellipse(430, 268, 56, 22, 0, 0, Math.PI * 2); ctx.stroke()
  // Chevron route markers toward the current main way.
  drawChevrons(ctx, [[470, 310], [520, 316], [570, 322]], p)
}

function drawOliveLanes(ctx, map, W) {
  const p = map.palette
  // The main road: west spawn -> Acropolis gate, with a switchback up to the
  // keeper's archive and a detour down to the fallen tablet.
  lanePath(ctx, [[40, 244], [240, 250], [430, 258], [620, 254], [900, 250]], 44, 'rgba(192,173,128,0.85)', 'rgba(110,92,58,0.4)')
  lanePath(ctx, [[620, 254], [700, 200], [760, 158]], 26, 'rgba(192,173,128,0.62)', 'rgba(110,92,58,0.3)')
  lanePath(ctx, [[430, 258], [490, 320], [540, 366]], 24, 'rgba(192,173,128,0.55)', 'rgba(110,92,58,0.26)')
  // Scattered cobbles along the road (authored, fixed).
  ctx.fillStyle = 'rgba(95,81,64,0.4)'
  for (const [cx, cy] of [[150, 236], [320, 264], [505, 244], [700, 262], [820, 240]]) {
    ctx.beginPath(); ctx.ellipse(cx, cy, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill()
  }
  drawChevrons(ctx, [[700, 250], [750, 250], [800, 250]], p)
}

function drawChevrons(ctx, pts, p) {
  ctx.strokeStyle = p.gold
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  for (const [x, y] of pts) {
    ctx.beginPath()
    ctx.moveTo(x - 6, y - 5)
    ctx.lineTo(x + 4, y)
    ctx.lineTo(x - 6, y + 5)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

// ─── Vegetation and map-specific staging ───────────────────────
function drawOliveTree(ctx, x, y, s, lean) {
  castShadow(ctx, x - 6, y + 4, 46 * s, 20 * s, 0.2)
  ctx.strokeStyle = OLIVE_TRUNK
  ctx.lineWidth = 7 * s
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(x + 6 * lean * s, y - 22 * s, x + 10 * lean * s, y - 40 * s)
  ctx.stroke()
  // Canopy: three fixed lobes.
  for (const [ox, oy, r, c] of [
    [-16, -50, 16, OLIVE_LEAF_LO],
    [14, -54, 18, OLIVE_LEAF],
    [-2, -66, 17, OLIVE_LEAF_HI],
  ]) {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.ellipse(x + ox * s, y + oy * s, r * s, r * 0.8 * s, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawCypress(ctx, x, y, s) {
  castShadow(ctx, x - 3, y + 3, 16 * s, 14 * s, 0.2)
  poly(ctx, [
    [x, y - 78 * s],
    [x + 11 * s, y - 20 * s],
    [x + 6 * s, y],
    [x - 6 * s, y],
    [x - 11 * s, y - 20 * s],
  ], CYPRESS_DARK)
  poly(ctx, [
    [x, y - 78 * s],
    [x + 5 * s, y - 30 * s],
    [x - 2 * s, y - 26 * s],
    [x - 6 * s, y - 44 * s],
  ], CYPRESS_MID)
}

function drawCairn(ctx, x, y, s, marked) {
  castShadow(ctx, x, y + 2, 18 * s, 8 * s, 0.22)
  ctx.fillStyle = '#8d8271'
  ctx.beginPath(); ctx.ellipse(x, y - 3 * s, 9 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#a1947e'
  ctx.beginPath(); ctx.ellipse(x, y - 9 * s, 6.5 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#b5a88f'
  ctx.beginPath(); ctx.ellipse(x, y - 14 * s, 4 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill()
  if (marked) {
    ctx.strokeStyle = '#e8b64c'
    ctx.globalAlpha = 0.8
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 4 * s, y - 14 * s)
    ctx.lineTo(x + 3 * s, y - 18 * s)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}

function drawBeaconStaging(ctx, map, p, t) {
  // Olives on the left rise; cypresses framing the Sun Court stair.
  drawOliveTree(ctx, 86, 168, 1.05, -1)
  drawOliveTree(ctx, 208, 138, 0.8, 1)
  drawCypress(ctx, 566, 128, 0.9)
  drawCypress(ctx, 716, 132, 1.05)
  // Beacon signal fire on its tripod (the overlook's namesake).
  drawBeaconFire(ctx, 470, 108, p, t)
  // A fallen column drum mid-plaza.
  ctx.fillStyle = p.marbleShadow
  roundRect(ctx, 520, 356, 46, 16, 7); ctx.fill()
  ctx.fillStyle = p.marble
  ctx.beginPath(); ctx.ellipse(566, 364, 6, 8, 0, 0, Math.PI * 2); ctx.fill()
  // Cairn marking the Olive Road branch.
  drawCairn(ctx, 800, 372, 1, true)
}

function drawOliveStaging(ctx, map, p, t) {
  // Olive grove staggered along the road (fixed authored positions).
  drawOliveTree(ctx, 140, 150, 1.0, -1)
  drawOliveTree(ctx, 330, 128, 0.85, 1)
  drawOliveTree(ctx, 620, 140, 1.1, -1)
  drawOliveTree(ctx, 250, 470, 0.9, 1)
  drawOliveTree(ctx, 850, 458, 1.0, -1)
  drawCypress(ctx, 872, 140, 1.0)
  // Route cairns.
  drawCairn(ctx, 200, 286, 0.9, true)
  drawCairn(ctx, 470, 292, 0.8, false)
  drawCairn(ctx, 736, 286, 0.9, true)
  // The keeper's archive tent near Amonides.
  drawArchiveTent(ctx, 706, 128, p)
}

function drawArchiveTent(ctx, x, y, p) {
  castShadow(ctx, x, y + 6, 66, 16, 0.22)
  ctx.strokeStyle = '#5f5140'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(x - 30, y); ctx.lineTo(x - 30, y - 40)
  ctx.moveTo(x + 30, y); ctx.lineTo(x + 30, y - 40)
  ctx.stroke()
  poly(ctx, [[x - 40, y - 38], [x, y - 52], [x + 40, y - 38], [x + 34, y - 32], [x, y - 44], [x - 34, y - 32]], '#8f3d1e')
  // Tablet crate.
  ctx.fillStyle = '#5f5140'
  ctx.fillRect(x - 14, y - 12, 28, 12)
  ctx.fillStyle = WAX_BOARD
  ctx.fillRect(x - 10, y - 18, 20, 6)
}

// The beacon signal fire (formerly a generic brazier decor slot).
function drawBeaconFire(ctx, x, y, p, t) {
  castShadow(ctx, x, y + 6, 34, 12, 0.24)
  // Tripod legs.
  ctx.strokeStyle = BRONZE_DARK
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x - 14, y); ctx.lineTo(x - 4, y - 26)
  ctx.moveTo(x + 14, y); ctx.lineTo(x + 4, y - 26)
  ctx.moveTo(x, y + 2); ctx.lineTo(x, y - 26)
  ctx.stroke()
  // Bowl.
  ctx.fillStyle = BRONZE
  roundRect(ctx, x - 12, y - 34, 24, 10, 4)
  ctx.fill()
  // Flame — restrained, time-based flicker (no RNG).
  const flick = 0.85 + 0.15 * Math.sin(t * 0.1 + 1.7)
  ctx.fillStyle = 'rgba(255,160,60,0.24)'
  ctx.beginPath(); ctx.arc(x, y - 44, 15 * flick, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = p.glow
  ctx.beginPath(); ctx.arc(x, y - 44, 6.5 * flick, 0, Math.PI * 2); ctx.fill()
  poly(ctx, [[x - 4, y - 40], [x, y - 58 * flick - 4], [x + 4, y - 40]], '#ffdf8f')
}

// ─── Decor primitives (existing authored decor slots) ──────────
function drawColumn(ctx, x, y, p, scale = 1) {
  const cw = 18 * scale
  const ch = 104 * scale
  castShadow(ctx, x - 8, y + 3, cw + 8, 26 * scale, 0.26)
  // Fluted shaft.
  ctx.fillStyle = p.marbleMid
  ctx.fillRect(x - cw / 2, y - ch, cw, ch)
  ctx.fillStyle = 'rgba(40,36,24,0.18)'
  ctx.fillRect(x - cw / 6, y - ch, cw / 8, ch)
  ctx.fillRect(x + cw / 5, y - ch, cw / 8, ch)
  ctx.fillStyle = p.marbleShadow
  ctx.fillRect(x - cw / 2, y - ch, 4 * scale, ch)
  // Capital.
  ctx.fillStyle = p.marble
  poly(ctx, [
    [x - cw / 2 - 5 * scale, y - ch - 12 * scale],
    [x + cw / 2 + 5 * scale, y - ch - 12 * scale],
    [x + cw / 2, y - ch],
    [x - cw / 2, y - ch],
  ])
  ctx.fillRect(x - cw / 2 - 2 * scale, y - ch - 16 * scale, cw + 4 * scale, 4 * scale)
  // Base.
  ctx.fillStyle = p.stoneDark
  ctx.fillRect(x - cw * 0.9, y, cw * 1.8, 6 * scale)
}

function drawBrazier(ctx, x, y, p, t) {
  castShadow(ctx, x, y + 4, 26, 10, 0.22)
  ctx.fillStyle = p.stoneDark
  ctx.fillRect(x - 12, y - 6, 24, 6)
  ctx.fillStyle = BRONZE
  roundRect(ctx, x - 10, y - 20, 20, 15, 3)
  ctx.fill()
  const flick = 0.85 + 0.15 * Math.sin(t * 0.1 + x * 0.05)
  ctx.fillStyle = 'rgba(255,160,60,0.22)'
  ctx.beginPath(); ctx.arc(x, y - 28, 13 * flick, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = p.glow
  ctx.beginPath(); ctx.arc(x, y - 28, 5.5 * flick, 0, Math.PI * 2); ctx.fill()
}

function drawRuin(ctx, x, y, p, scale = 1) {
  castShadow(ctx, x - 4, y + 3, 54 * scale, 12 * scale, 0.2)
  ctx.fillStyle = p.stone
  roundRect(ctx, x - 26 * scale, y - 12 * scale, 52 * scale, 12 * scale, 3)
  ctx.fill()
  ctx.fillStyle = p.stoneDark
  roundRect(ctx, x - 16 * scale, y - 26 * scale, 32 * scale, 16 * scale, 3)
  ctx.fill()
  // Broken column half lying on the block.
  ctx.fillStyle = p.marbleShadow
  roundRect(ctx, x + 6 * scale, y - 32 * scale, 26 * scale, 9 * scale, 4)
  ctx.fill()
}

function drawUrn(ctx, x, y, p) {
  castShadow(ctx, x - 2, y + 2, 18, 7, 0.2)
  ctx.fillStyle = p.terracottaDark
  roundRect(ctx, x - 10, y - 26, 20, 22, 8)
  ctx.fill()
  ctx.fillStyle = p.terracotta
  roundRect(ctx, x - 8, y - 22, 16, 14, 6)
  ctx.fill()
  ctx.fillStyle = p.terracottaDark
  roundRect(ctx, x - 7, y - 28, 14, 5, 2)
  ctx.fill()
}

// ─── Exits as architecture (never floating circles) ────────────
function drawExit(ctx, e, map, p, t) {
  const inWall = e.y < 150
  const atEdge = e.x > WORLD_VIEW_W - 80 || e.x < 100
  if (inWall) {
    // Gate opening through the back wall.
    const gw = 46
    ctx.fillStyle = e.kind === 'combat' ? '#241a14' : '#2c3038'
    ctx.fillRect(e.x - gw / 2, WALL_TOP - 4, gw, WALL_BOTTOM - WALL_TOP + 6)
    // Antae + lintel.
    ctx.fillStyle = p.marble
    ctx.fillRect(e.x - gw / 2 - 8, WALL_TOP - 8, 8, WALL_BOTTOM - WALL_TOP + 10)
    ctx.fillRect(e.x + gw / 2, WALL_TOP - 8, 8, WALL_BOTTOM - WALL_TOP + 10)
    ctx.fillRect(e.x - gw / 2 - 10, WALL_TOP - 14, gw + 20, 7)
    if (e.kind === 'combat') {
      // Half-raised bronze portcullis + warning glint.
      ctx.strokeStyle = BRONZE_DARK
      ctx.lineWidth = 3
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath()
        ctx.moveTo(e.x + i * 12, WALL_TOP - 4)
        ctx.lineTo(e.x + i * 12, WALL_TOP + 18)
        ctx.stroke()
      }
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.1)
      ctx.fillStyle = `rgba(224,80,46,${0.35 + 0.3 * pulse})`
      ctx.beginPath(); ctx.arc(e.x, WALL_TOP + 26, 5 + 2.5 * pulse, 0, Math.PI * 2); ctx.fill()
      // Braziers either side of the war gate.
      drawBrazier(ctx, e.x - gw / 2 - 22, WALL_BOTTOM + 26, p, t)
      drawBrazier(ctx, e.x + gw / 2 + 22, WALL_BOTTOM + 26, p, t)
    } else {
      // Steps down through the gate.
      ctx.fillStyle = 'rgba(243,233,207,0.5)'
      ctx.fillRect(e.x - gw / 2 + 4, WALL_BOTTOM - 8, gw - 8, 4)
      ctx.fillRect(e.x - gw / 2 + 8, WALL_BOTTOM - 2, gw - 16, 4)
    }
  } else if (atEdge) {
    // Side-road opening marked by twin posts and a carved waystone.
    const left = e.x < WORLD_VIEW_W / 2
    const px = left ? e.x + 26 : e.x - 26
    ctx.fillStyle = p.marbleShadow
    ctx.fillRect(e.x - 8, e.y - 34, 16, 40)
    ctx.fillStyle = p.stoneDark
    ctx.fillRect(px - 5, e.y - 30, 10, 34)
    ctx.fillRect(px - 8, e.y - 36, 16, 7)
    // Waystone with direction glyph.
    ctx.fillStyle = p.stone
    roundRect(ctx, px - 12, e.y + 6, 24, 14, 2)
    ctx.fill()
    ctx.strokeStyle = p.gold
    ctx.globalAlpha = 0.7
    ctx.lineWidth = 2
    ctx.beginPath()
    if (left) { ctx.moveTo(px + 5, e.y + 9); ctx.lineTo(px - 5, e.y + 13); ctx.lineTo(px + 5, e.y + 17) }
    else { ctx.moveTo(px - 5, e.y + 9); ctx.lineTo(px + 5, e.y + 13); ctx.lineTo(px - 5, e.y + 17) }
    ctx.stroke()
    ctx.globalAlpha = 1
  } else {
    // Free-standing arched gate (unused by current maps; kept for authoring).
    ctx.strokeStyle = p.stoneDark
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(e.x, e.y - 8, 20, Math.PI, 0)
    ctx.stroke()
  }
}

// ─── Entities ──────────────────────────────────────────────────
function drawShrine(ctx, x, y, p, t) {
  castShadow(ctx, x - 6, y + 6, 64, 18, 0.26)
  // Three steps.
  ctx.fillStyle = p.marbleShadow
  ctx.fillRect(x - 34, y + 2, 68, 8)
  ctx.fillStyle = p.marbleMid
  ctx.fillRect(x - 28, y - 6, 56, 8)
  ctx.fillStyle = p.marble
  ctx.fillRect(x - 22, y - 14, 44, 8)
  // Altar block.
  ctx.fillStyle = p.marbleMid
  ctx.fillRect(x - 16, y - 30, 32, 16)
  ctx.fillStyle = p.marbleShadow
  ctx.fillRect(x - 16, y - 30, 6, 16)
  // Twin votive columns.
  ctx.fillStyle = p.marble
  ctx.fillRect(x - 30, y - 44, 8, 32)
  ctx.fillRect(x + 22, y - 44, 8, 32)
  ctx.fillRect(x - 33, y - 48, 14, 5)
  ctx.fillRect(x + 19, y - 48, 14, 5)
  // Votive flame.
  const flick = 0.9 + 0.1 * Math.sin(t * 0.12)
  ctx.fillStyle = 'rgba(255,170,70,0.22)'
  ctx.beginPath(); ctx.arc(x, y - 40, 12 * flick, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = p.glow
  ctx.beginPath(); ctx.arc(x, y - 40, 5 * flick, 0, Math.PI * 2); ctx.fill()
}

// The broken treaty-stone: a stele split in two with a gold seam.
function drawTreatyStone(ctx, x, y, p, t) {
  castShadow(ctx, x - 4, y + 4, 44, 14, 0.26)
  ctx.fillStyle = p.marbleMid
  poly(ctx, [[x - 20, y], [x - 22, y - 44], [x - 6, y - 50], [x - 3, y - 6], [x - 8, y]])
  ctx.fill()
  ctx.fillStyle = p.marbleShadow
  poly(ctx, [[x + 6, y], [x + 4, y - 8], [x + 8, y - 42], [x + 22, y - 36], [x + 20, y]])
  ctx.fill()
  // Carved lines on the intact half.
  ctx.strokeStyle = 'rgba(40,36,24,0.5)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x - 17, y - 38); ctx.lineTo(x - 8, y - 40)
  ctx.moveTo(x - 16, y - 30); ctx.lineTo(x - 7, y - 32)
  ctx.moveTo(x - 15, y - 22); ctx.lineTo(x - 7, y - 24)
  ctx.stroke()
  // The severed seam glows faintly.
  const pulse = 0.4 + 0.25 * Math.sin(t * 0.06)
  ctx.strokeStyle = p.gold
  ctx.globalAlpha = pulse
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x - 3, y - 6); ctx.lineTo(x - 6, y - 50)
  ctx.stroke()
  ctx.globalAlpha = 1
  // Fallen shards.
  ctx.fillStyle = p.marble
  poly(ctx, [[x + 26, y + 2], [x + 34, y - 4], [x + 38, y + 3]])
  poly(ctx, [[x - 30, y + 4], [x - 24, y - 2], [x - 20, y + 5]])
}

// The Lost Witness tablet: a wax board fallen between the cobbles.
function drawTablet(ctx, x, y, p, t) {
  castShadow(ctx, x, y + 3, 30, 8, 0.2)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-0.12)
  ctx.fillStyle = WAX_BOARD
  roundRect(ctx, -16, -11, 32, 22, 3)
  ctx.fill()
  ctx.fillStyle = WAX
  roundRect(ctx, -12, -7, 24, 14, 2)
  ctx.fill()
  // Half-erased scratch marks.
  ctx.strokeStyle = 'rgba(201,168,106,0.8)'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(-8, -3); ctx.lineTo(2, -3)
  ctx.moveTo(-8, 1); ctx.lineTo(-1, 1)
  ctx.moveTo(3, 3); ctx.lineTo(8, 3)
  ctx.stroke()
  ctx.restore()
  // Stylus beside it.
  ctx.strokeStyle = BRONZE
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(x + 18, y + 6); ctx.lineTo(x + 30, y + 10)
  ctx.stroke()
}

function drawRuntimeEntity(ctx, ent, p, t) {
  if (ent.kind === 'tide-well') {
    castShadow(ctx, ent.x, ent.y + 3, 38, 10, 0.24)
    ctx.fillStyle = p.stoneDark
    ctx.beginPath(); ctx.ellipse(ent.x, ent.y, 20, 10, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = p.glow
    ctx.globalAlpha = 0.6 + Math.sin(t * 0.07) * 0.15
    ctx.beginPath(); ctx.ellipse(ent.x, ent.y - 2, 12, 5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    return
  }
  if (ent.kind === 'marker' || ent.kind === 'travel-node') {
    drawPaintedMarker(ctx, ent.x, ent.y, p, t, ent.kind === 'marker')
    return
  }
  if (ent.kind === 'witness') {
    drawNPC(ctx, ent, p, t)
    return
  }
  drawTablet(ctx, ent.x, ent.y, p, t)
}

// Objective standard: a gold banner planted at the current objective,
// integrated into the ground with a ring — replaces the floating pulse circle.
function drawObjectiveStandard(ctx, map, obj, p, t) {
  if (!obj) return
  let tx = null
  let ty = null
  if (obj.kind === 'reach' && obj.markerId) {
    const exit = map.exits.find((e) => e.markerId === obj.markerId || e.id === obj.markerId)
    if (exit) { tx = exit.x; ty = exit.y }
  } else if (obj.kind === 'interact') {
    const authoredId = obj.entityId || obj.entityIds?.[0]
    if (!authoredId) return
    const entId = authoredId.split(':')[1] || authoredId
    const ent = map.entities.find((e) => e.id === entId)
    if (ent) { tx = ent.x; ty = ent.y }
  } else if (obj.kind === 'talk' && obj.npcId) {
    const ent = map.entities.find((e) => e.id === obj.npcId)
    if (ent) { tx = ent.x; ty = ent.y }
  }
  if (tx == null) return
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.08)
  // Ground ring.
  ctx.strokeStyle = p.gold
  ctx.globalAlpha = 0.3 + 0.2 * pulse
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.ellipse(tx, ty + 2, 24, 9, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1
  // Pole + pennant.
  const sway = Math.sin(t * 0.05) * 2
  ctx.strokeStyle = '#5f5140'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(tx + 20, ty)
  ctx.lineTo(tx + 20, ty - 52)
  ctx.stroke()
  poly(ctx, [
    [tx + 20, ty - 52],
    [tx + 44 + sway, ty - 46],
    [tx + 20, ty - 38],
  ], p.gold)
  ctx.fillStyle = 'rgba(19,28,38,0.85)'
  ctx.beginPath()
  ctx.arc(tx + 26, ty - 45.5, 2.4, 0, Math.PI * 2)
  ctx.fill()
}

// Painted maps already contain their monumental architecture. Runtime targets
// use restrained, ground-anchored sigils instead of stacking flat prototype
// monuments over the production art.
function drawPaintedMarker(ctx, x, y, p, t, emphasis = false) {
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.08)
  ctx.save()
  ctx.strokeStyle = p.gold
  ctx.globalAlpha = (emphasis ? 0.52 : 0.22) + pulse * (emphasis ? 0.2 : 0.08)
  ctx.lineWidth = emphasis ? 2.5 : 1.5
  ctx.beginPath()
  ctx.ellipse(x, y + 3, emphasis ? 25 : 16, emphasis ? 9 : 6, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = emphasis ? 0.9 : 0.52
  ctx.fillStyle = p.gold
  ctx.translate(x, y - (emphasis ? 16 : 10))
  ctx.rotate(Math.PI / 4)
  ctx.fillRect(emphasis ? -5 : -3, emphasis ? -5 : -3, emphasis ? 10 : 6, emphasis ? 10 : 6)
  ctx.restore()
}

function objectivePoint(map, obj) {
  if (!obj) return null
  if (obj.kind === 'reach' && obj.markerId) {
    return map.exits.find((e) => e.markerId === obj.markerId || e.id === obj.markerId)
      || map.entities.find((entity) => entity.id === obj.markerId)
      || null
  }
  if (obj.kind === 'interact') {
    const authoredId = obj.entityId || obj.entityIds?.[0]
    if (!authoredId) return null
    const entId = authoredId.split(':')[1] || authoredId
    return map.entities.find((e) => e.id === entId) || null
  }
  if (obj.kind === 'talk' && obj.npcId) {
    return map.entities.find((e) => e.id === obj.npcId) || null
  }
  return null
}

// ─── Kallias ───────────────────────────────────────────────────
// Authored ~86px mortal silhouette. Feet at (x, y). dir: 1 right, -1 left,
// 0 faces the camera. Spear in the lead hand; hooked xiphos holstered at the
// far hip; compact storm energy in the free hand. Facing flip, walk bob, and
// shadow are presentation-only — collision is unchanged.
function drawKallias(ctx, x, y, facing, walkPhase, p, moving, fx) {
  const reduce = Boolean(fx && fx.reduceMotion)
  const amp = reduce ? 0.35 : 1
  const bob = moving ? Math.abs(Math.sin(walkPhase)) * 3 * amp : 0
  const swing = moving ? Math.sin(walkPhase) * 6 * amp : 0
  const dir = facing >= 0 ? 1 : -1
  const front = facing === 0 // camera-facing pose
  const dashing = Boolean(fx && fx.dash && fx.dash.active) && !reduce

  // Shadow (fixed to the ground regardless of bob).
  ctx.fillStyle = 'rgba(20,14,6,0.35)'
  ctx.beginPath()
  ctx.ellipse(x, y + 3, 19, 6, 0, 0, Math.PI * 2)
  ctx.fill()

  // Dash after-images (restrained, deterministic).
  if (dashing) {
    for (let i = 1; i <= 2; i++) {
      ctx.globalAlpha = 0.14 / i
      drawKalliasBody(ctx, x - dir * i * 14, y, dir, front, swing, p, fx)
    }
    ctx.globalAlpha = 1
  }

  drawKalliasBody(ctx, x, y - bob, dir, front, swing, p, fx)
}

function drawKalliasBody(ctx, x, y, dir, front, swing, p, fx) {
  const t = (fx && fx.t) || 0
  const reduce = Boolean(fx && fx.reduceMotion)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(front ? 1 : dir, 1)
  const lean = swing * 0.012
  ctx.rotate(lean)

  // ── Cloak (blue-gray fractured mantle) behind the body ──
  const cloakSway = Math.sin(t * 0.04 + 1) * 2 * (reduce ? 0.3 : 1)
  poly(ctx, [
    [-6, -62],
    [-14 - cloakSway, -30],
    [-4 - cloakSway * 0.5, -22],
    [8, -34],
    [10, -58],
  ], KALLIAS_MANTLE_LO)
  poly(ctx, [
    [-4, -62],
    [-11 - cloakSway, -32],
    [-3, -26],
    [8, -36],
    [9, -58],
  ], KALLIAS_MANTLE)
  // Fracture seams on the mantle (thin gold cracks).
  ctx.strokeStyle = 'rgba(232,182,76,0.55)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(-8 - cloakSway * 0.6, -44); ctx.lineTo(-5, -38)
  ctx.moveTo(-9 - cloakSway * 0.6, -34); ctx.lineTo(-6, -30)
  ctx.stroke()
  // Cloak brooch.
  ctx.fillStyle = '#e8b64c'
  ctx.beginPath(); ctx.arc(6, -58, 2.4, 0, Math.PI * 2); ctx.fill()

  // ── Far arm (free hand with storm energy) — behind torso in profile ──
  const armSwing = -swing * 0.5
  ctx.strokeStyle = SKIN_SHADE
  ctx.lineWidth = 5.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  if (front) {
    ctx.moveTo(-10, -54); ctx.lineTo(-15, -40 + armSwing * 0.3); ctx.lineTo(-14, -30)
  } else {
    ctx.moveTo(-8, -54); ctx.lineTo(-13, -42 + armSwing * 0.3); ctx.lineTo(-12, -32)
  }
  ctx.stroke()

  // ── Legs ──
  ctx.strokeStyle = SKIN
  ctx.lineWidth = 6.5
  ctx.beginPath()
  ctx.moveTo(-5, -30); ctx.lineTo(-6 + swing * 0.5, -14); ctx.lineTo(-6 + swing * 0.7, 0)
  ctx.moveTo(5, -30); ctx.lineTo(6 - swing * 0.5, -14); ctx.lineTo(6 - swing * 0.7, 0)
  ctx.stroke()
  // Greaves / boots.
  ctx.fillStyle = BRONZE_DARK
  roundRect(ctx, -9.5 + swing * 0.7, -8, 7, 8, 2); ctx.fill()
  roundRect(ctx, 2.5 - swing * 0.7, -8, 7, 8, 2); ctx.fill()

  // ── Skirt / pteruges (fractured mantle hem) ──
  poly(ctx, [[-11, -40], [11, -40], [13, -26], [7, -24], [0, -27], [-7, -24], [-13, -26]], KALLIAS_MANTLE)
  ctx.strokeStyle = 'rgba(232,182,76,0.4)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(-3, -38); ctx.lineTo(-4, -27)
  ctx.stroke()

  // ── Torso: ivory chiton + bronze harness ──
  poly(ctx, [[-10, -62], [10, -62], [12, -40], [-12, -40]], IVORY)
  poly(ctx, [[-10, -62], [10, -62], [11, -52], [-11, -52]], '#e3d6b6')
  ctx.strokeStyle = BRONZE
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(-10, -60); ctx.lineTo(10, -46)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(168,118,47,0.9)'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(-11, -44); ctx.lineTo(11, -44); ctx.stroke()
  // Belt.
  ctx.fillStyle = '#5f452a'
  ctx.fillRect(-11, -42, 22, 4)

  // ── Holstered hooked xiphos at the far hip (never held) ──
  ctx.save()
  ctx.translate(-9, -40)
  ctx.rotate(0.5)
  // Scabbard.
  ctx.fillStyle = '#2e2a22'
  roundRect(ctx, -2.5, 0, 5, 20, 2.5)
  ctx.fill()
  ctx.fillStyle = BRONZE
  ctx.fillRect(-3.5, -2, 7, 3.5)
  // Hooked grip curving forward.
  ctx.strokeStyle = IVORY
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, -2)
  ctx.quadraticCurveTo(1, -8, 6, -9)
  ctx.stroke()
  ctx.restore()

  // ── Head ──
  ctx.fillStyle = SKIN
  ctx.beginPath(); ctx.arc(1, -72, 10.5, 0, Math.PI * 2); ctx.fill()
  // Jaw shading.
  ctx.fillStyle = SKIN_SHADE
  ctx.beginPath(); ctx.arc(1, -69, 9.5, 0.3, Math.PI - 0.5); ctx.fill()
  // ── Hair: lighter medium brown, tousled ──
  ctx.fillStyle = KALLIAS_HAIR
  ctx.beginPath()
  ctx.moveTo(-9.5, -72)
  ctx.quadraticCurveTo(-11, -84, -2, -85)
  ctx.quadraticCurveTo(4, -88, 9, -82)
  ctx.quadraticCurveTo(13, -79, 11, -72)
  ctx.quadraticCurveTo(8, -77, 3, -76)
  ctx.quadraticCurveTo(-2, -78, -6, -74)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = KALLIAS_HAIR_HI
  ctx.beginPath()
  ctx.moveTo(-2, -85)
  ctx.quadraticCurveTo(3, -87, 8, -82)
  ctx.quadraticCurveTo(4, -84, -1, -83)
  ctx.closePath()
  ctx.fill()

  // ── Eyes: pale husky-blue ──
  ctx.fillStyle = '#bcd7e8'
  if (front) {
    ctx.beginPath(); ctx.arc(-3, -72, 1.7, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(6, -72, 1.7, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#28425a'
    ctx.beginPath(); ctx.arc(-3, -72, 0.8, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(6, -72, 0.8, 0, Math.PI * 2); ctx.fill()
  } else {
    ctx.beginPath(); ctx.arc(6.5, -72, 1.9, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#28425a'
    ctx.beginPath(); ctx.arc(7, -72, 0.9, 0, Math.PI * 2); ctx.fill()
  }

  // ── Lead arm + spear (primary weapon) ──
  ctx.strokeStyle = SKIN
  ctx.lineWidth = 6
  ctx.beginPath()
  if (front) {
    ctx.moveTo(10, -54); ctx.lineTo(14, -44); ctx.lineTo(13, -36)
  } else {
    ctx.moveTo(8, -54); ctx.lineTo(13, -46 + swing * 0.2); ctx.lineTo(12, -38)
  }
  ctx.stroke()
  // Bronze bracer.
  ctx.strokeStyle = BRONZE
  ctx.lineWidth = 6.5
  ctx.beginPath()
  if (front) { ctx.moveTo(13.6, -41); ctx.lineTo(13.2, -37) }
  else { ctx.moveTo(12.7, -43 + swing * 0.2); ctx.lineTo(12.3, -39) }
  ctx.stroke()

  // Spear: long shaft, leaf head, planted angle.
  const sx = front ? 13 : 12
  ctx.save()
  ctx.translate(sx, -36)
  ctx.rotate(-0.08)
  ctx.strokeStyle = '#4a3521'
  ctx.lineWidth = 3.2
  ctx.beginPath()
  ctx.moveTo(0, 34)
  ctx.lineTo(0, -52)
  ctx.stroke()
  // Grip wrapping.
  ctx.strokeStyle = '#6d5233'
  ctx.lineWidth = 4
  ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(0, 8); ctx.stroke()
  // Leaf-shaped head.
  ctx.fillStyle = '#d9d4c2'
  poly(ctx, [[0, -52], [-4, -60], [0, -72], [4, -60]])
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  poly(ctx, [[0, -52], [-1, -60], [0, -70]])
  ctx.fillStyle = BRONZE
  ctx.fillRect(-3.4, -53, 6.8, 3)
  ctx.restore()

  // ── Storm energy in the free hand: compact white-blue charge ──
  const hx = front ? -14 : -12
  const hy = front ? -30 : -32
  const flick = reduce ? 1 : 0.85 + 0.15 * Math.sin(t * 0.22 + 2)
  ctx.fillStyle = 'rgba(159,216,255,0.22)'
  ctx.beginPath(); ctx.arc(hx, hy, 9 * flick, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = STORM_CORE
  ctx.beginPath(); ctx.arc(hx, hy, 3.4 * flick, 0, Math.PI * 2); ctx.fill()
  // Two deterministic arcs.
  ctx.strokeStyle = STORM_ARC
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(hx - 6, hy - 2); ctx.lineTo(hx - 2, hy - 5); ctx.lineTo(hx + 1, hy - 8)
  ctx.moveTo(hx + 5, hy + 3); ctx.lineTo(hx + 8, hy - 1)
  ctx.stroke()

  ctx.restore()
}

// ─── Named NPCs — distinct authored silhouettes ────────────────
function drawThessa(ctx, ent, p, t) {
  const x = ent.x
  const y = ent.y
  ctx.fillStyle = 'rgba(20,14,6,0.32)'
  ctx.beginPath(); ctx.ellipse(x, y + 3, 16, 5, 0, 0, Math.PI * 2); ctx.fill()
  ctx.save()
  ctx.translate(x, y)

  // Indigo robe: base + lighter overfold.
  poly(ctx, [[-10, -46], [10, -46], [14, 0], [8, 2], [-8, 2], [-14, 0]], THESSA_INDIGO)
  poly(ctx, [[-4, -46], [10, -46], [14, 0], [4, 1]], THESSA_INDIGO_HI)
  // Gold meander hem (simple notches).
  ctx.fillStyle = 'rgba(232,182,76,0.8)'
  for (let i = -10; i <= 10; i += 5) ctx.fillRect(i, -4, 3, 2)
  // Leather map strap with anchor charm.
  ctx.strokeStyle = '#6d4a2c'
  ctx.lineWidth = 3.5
  ctx.beginPath(); ctx.moveTo(-8, -44); ctx.lineTo(9, -26); ctx.stroke()
  ctx.fillStyle = '#e8b64c'
  ctx.beginPath(); ctx.arc(9, -24, 2.2, 0, Math.PI * 2); ctx.fill()

  // Rolled charts under the far arm.
  ctx.fillStyle = '#d8c8a4'
  ctx.save()
  ctx.translate(11, -30)
  ctx.rotate(0.5)
  ctx.fillRect(-3, -10, 6, 20)
  ctx.fillStyle = '#bda87a'
  ctx.fillRect(-3, -10, 2, 20)
  ctx.restore()

  // Astrolabe held at chest height (bronze ring + pointer).
  ctx.strokeStyle = BRONZE
  ctx.lineWidth = 2.6
  ctx.beginPath(); ctx.arc(-11, -30, 8, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(-11, -30, 4.5, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(-11, -38); ctx.lineTo(-11, -22); ctx.stroke()
  ctx.fillStyle = '#e8b64c'
  ctx.beginPath(); ctx.arc(-11, -30, 1.6, 0, Math.PI * 2); ctx.fill()

  // Arms.
  ctx.strokeStyle = SKIN
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-9, -42); ctx.lineTo(-11, -34)
  ctx.moveTo(9, -42); ctx.lineTo(11, -34)
  ctx.stroke()

  // Head + silver hair pinned up.
  ctx.fillStyle = SKIN
  ctx.beginPath(); ctx.arc(0, -54, 9, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = THESSA_SILVER
  ctx.beginPath()
  ctx.moveTo(-9, -55)
  ctx.quadraticCurveTo(-10, -65, -1, -66)
  ctx.quadraticCurveTo(8, -67, 9, -57)
  ctx.quadraticCurveTo(5, -62, 0, -61)
  ctx.quadraticCurveTo(-5, -62, -9, -55)
  ctx.closePath()
  ctx.fill()
  // Bun + gold pins.
  ctx.beginPath(); ctx.arc(-1, -66, 4.5, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#e8b64c'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(-4, -68); ctx.lineTo(-8, -72)
  ctx.moveTo(1, -69); ctx.lineTo(3, -74)
  ctx.stroke()
  // Eyes.
  ctx.fillStyle = '#2a3a55'
  ctx.beginPath(); ctx.arc(-3, -54, 1.1, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(3.4, -54, 1.1, 0, Math.PI * 2); ctx.fill()

  ctx.restore()
}

function drawKeeper(ctx, ent, p, t) {
  const x = ent.x
  const y = ent.y
  ctx.fillStyle = 'rgba(20,14,6,0.32)'
  ctx.beginPath(); ctx.ellipse(x, y + 3, 17, 5.5, 0, 0, Math.PI * 2); ctx.fill()
  ctx.save()
  ctx.translate(x, y)

  // Black archive cloak: heavy bell silhouette + hood shoulders.
  poly(ctx, [[-11, -48], [11, -48], [17, 0], [10, 2], [-10, 2], [-17, 0]], KEEPER_CLOAK)
  poly(ctx, [[-11, -48], [0, -48], [2, 0], [-10, 2], [-17, 0]], KEEPER_CLOAK_HI)
  // Gold key-pattern trim at the hem.
  ctx.fillStyle = 'rgba(232,182,76,0.75)'
  for (let i = -13; i <= 13; i += 6) ctx.fillRect(i, -5, 4, 2)
  // Diagonal sash.
  ctx.strokeStyle = '#3a332a'
  ctx.lineWidth = 4
  ctx.beginPath(); ctx.moveTo(-9, -46); ctx.lineTo(10, -26); ctx.stroke()
  ctx.fillStyle = 'rgba(232,182,76,0.6)'
  ctx.fillRect(-2, -39, 3, 3)
  ctx.fillRect(4, -33, 3, 3)

  // Blank mask accent on the belt chain (a hanging featureless face).
  ctx.strokeStyle = '#7a6a4a'
  ctx.lineWidth = 1.4
  ctx.beginPath(); ctx.moveTo(10, -22); ctx.lineTo(12, -14); ctx.stroke()
  ctx.fillStyle = '#d9c07a'
  ctx.beginPath(); ctx.ellipse(12, -10, 4, 5.5, 0.2, 0, Math.PI * 2); ctx.fill()

  // Wax tablets cradled at chest height.
  ctx.fillStyle = WAX_BOARD
  ctx.save()
  ctx.translate(-6, -32)
  ctx.rotate(-0.1)
  ctx.fillRect(-10, -6, 20, 12)
  ctx.fillStyle = WAX
  ctx.fillRect(-7, -3.5, 14, 7)
  ctx.restore()
  ctx.fillStyle = WAX_BOARD
  ctx.save()
  ctx.translate(-4, -40)
  ctx.rotate(-0.16)
  ctx.fillRect(-9, -5, 18, 10)
  ctx.fillStyle = WAX
  ctx.fillRect(-6, -3, 12, 6)
  ctx.restore()

  // Arms (dark sleeves) around the tablets.
  ctx.strokeStyle = KEEPER_CLOAK_HI
  ctx.lineWidth = 5.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-10, -44); ctx.lineTo(-13, -33)
  ctx.moveTo(10, -44); ctx.lineTo(2, -28)
  ctx.stroke()

  // Head: gray hair, full beard.
  ctx.fillStyle = SKIN_SHADE
  ctx.beginPath(); ctx.arc(0, -56, 8.6, 0, Math.PI * 2); ctx.fill()
  // Beard.
  ctx.fillStyle = KEEPER_GRAY
  ctx.beginPath()
  ctx.moveTo(-7, -54)
  ctx.quadraticCurveTo(-6, -44, 0, -43)
  ctx.quadraticCurveTo(6, -44, 7, -54)
  ctx.quadraticCurveTo(0, -50, -7, -54)
  ctx.closePath()
  ctx.fill()
  // Hair (receding, swept back).
  ctx.fillStyle = KEEPER_GRAY
  ctx.beginPath()
  ctx.moveTo(-8.5, -57)
  ctx.quadraticCurveTo(-9, -66, 0, -66)
  ctx.quadraticCurveTo(9, -66, 8.5, -57)
  ctx.quadraticCurveTo(4, -62, 0, -61.5)
  ctx.quadraticCurveTo(-4, -62, -8.5, -57)
  ctx.closePath()
  ctx.fill()
  // Eyes (deep-set).
  ctx.fillStyle = '#241f18'
  ctx.beginPath(); ctx.arc(-3, -56.5, 1.1, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(3.2, -56.5, 1.1, 0, Math.PI * 2); ctx.fill()

  ctx.restore()
}

function drawNPC(ctx, ent, p, t) {
  if (ent.id === 'thessa') return drawThessa(ctx, ent, p, t)
  if (ent.id === 'keeper' || ent.id === 'amonides') return drawKeeper(ctx, ent, p, t)
  // Fallback generic keeper-of-the-accord silhouette (not used by Act I).
  ctx.fillStyle = 'rgba(20,14,6,0.3)'
  ctx.beginPath(); ctx.ellipse(ent.x, ent.y + 3, 14, 4.5, 0, 0, Math.PI * 2); ctx.fill()
  poly(ctx, [
    [ent.x - 10, ent.y - 44], [ent.x + 10, ent.y - 44],
    [ent.x + 13, ent.y], [ent.x - 13, ent.y],
  ], '#8b8474')
  ctx.fillStyle = SKIN
  ctx.beginPath(); ctx.arc(ent.x, ent.y - 52, 8, 0, Math.PI * 2); ctx.fill()
}

// ─── Foreground occlusion band ─────────────────────────────────
function drawForeground(ctx, map, W, H) {
  const p = map.palette
  const isBeacon = map.id === 'beacon-overlook'
  // Low parapet lip across the bottom.
  ctx.fillStyle = isBeacon ? p.marbleShadow : '#8c7a58'
  ctx.fillRect(0, FG_TOP + 16, W, H - FG_TOP - 16)
  ctx.fillStyle = isBeacon ? p.marbleMid : '#a8946c'
  ctx.fillRect(0, FG_TOP + 8, W, 10)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(0, FG_TOP + 8, W, 2)
  // Broken baluster stumps.
  ctx.fillStyle = isBeacon ? p.marble : '#9c8a64'
  for (const bx of [70, 240, 430, 610, 800, 930]) {
    const hgt = 12 + ((bx / 70) % 3) * 5
    ctx.fillRect(bx, FG_TOP + 8 - hgt, 14, hgt)
    ctx.fillRect(bx - 3, FG_TOP + 6 - hgt, 20, 4)
  }
  // Corner rock clusters for framing.
  poly(ctx, [[0, H], [0, FG_TOP - 8], [46, FG_TOP + 6], [92, H]], 'rgba(46,40,26,0.85)')
  poly(ctx, [[W, H], [W, FG_TOP - 14], [W - 56, FG_TOP + 2], [W - 110, H]], 'rgba(46,40,26,0.85)')
}

// ─── Main draw ─────────────────────────────────────────────────
export function drawWorld(ctx, view, cssW, cssH) {
  const { map, state, fx, routeStateId = null } = view
  const W = WORLD_VIEW_W
  const H = WORLD_VIEW_H
  if (!map) return
  const p = map.palette
  const t = (fx && fx.t) || 0

  const hasPaintedEnvironment = PAINTED_ENVIRONMENT_IDS.has(map.id)

  if (!hasPaintedEnvironment) {
    // Deterministic code-native fallback while the production backplate loads.
    drawSky(ctx, map, W)
    drawFarScenery(ctx, map, W)
    drawAqueduct(ctx, map, W)
    drawBackWall(ctx, map, W)
    drawFloor(ctx, map, W, H, routeStateId)
  }

  // The code-native fallback authors full gate architecture. Painted maps use
  // only subtle traversal sigils so live navigation stays legible.
  for (const e of map.exits || []) {
    if (hasPaintedEnvironment) drawPaintedMarker(ctx, e.x, e.y, p, t)
    else drawExit(ctx, e, map, p, t)
  }

  // Authored decor architecture (existing content.js slots; collision
  // identity is carried by 'column' entries and is unchanged).
  if (!hasPaintedEnvironment) {
    for (const d of map.decor || []) {
      if (d.kind === 'column') drawColumn(ctx, d.x, d.y, p, d.scale || 1)
      else if (d.kind === 'brazier') {
        if (map.id === 'beacon-overlook') drawBeaconFire(ctx, d.x, d.y, p, t)
        else drawBrazier(ctx, d.x, d.y, p, t)
      } else if (d.kind === 'ruin') drawRuin(ctx, d.x, d.y, p, d.scale || 1)
      else if (d.kind === 'urn') drawUrn(ctx, d.x, d.y, p)
    }

    // Map-specific code-native staging is redundant once the painted
    // environment has loaded, but remains the no-image fallback.
    if (map.id === 'beacon-overlook') drawBeaconStaging(ctx, map, p, t)
    else if (map.id === 'olive-road') drawOliveStaging(ctx, map, p, t)
  }

  // Entities.
  for (const ent of map.entities || []) {
    if (hasPaintedEnvironment && ent.kind !== 'npc') drawPaintedMarker(ctx, ent.x, ent.y, p, t)
    else if (ent.kind === 'shrine') drawShrine(ctx, ent.x, ent.y, p, t)
    else if (ent.kind === 'npc' && !state?.hideWorldActors) drawNPC(ctx, ent, p, t)
    else if (ent.id === 'treaty-stone') drawTreatyStone(ctx, ent.x, ent.y, p, t)
    else if (ent.id === 'tablet') drawTablet(ctx, ent.x, ent.y, p, t)
    else drawRuntimeEntity(ctx, ent, p, t)
  }

  // Painted maps receive a restrained objective sigil; the fallback retains
  // the authored standard and ground ring.
  if (hasPaintedEnvironment) {
    const target = objectivePoint(map, state && state.currentObjective)
    if (target) drawPaintedMarker(ctx, target.x, target.y, p, t, true)
  } else {
    drawObjectiveStandard(ctx, map, state && state.currentObjective, p, t)
  }

  // Kallias.
  const pos = state && state.world ? state.world.position : { x: W / 2, y: H * 0.75 }
  const moving = Boolean(fx && fx.moving)
  const walkPhase = (fx && fx.walkPhase) || 0
  const facing = (state && state.world && state.world.facing) || 0
  if (!state?.hideWorldActors) drawKallias(ctx, pos.x, pos.y, facing, walkPhase, p, moving, fx)

  // The painted environments already provide foreground framing. Keep the
  // code-native parapet only for the fallback so it never hides live actors.
  if (!hasPaintedEnvironment) drawForeground(ctx, map, W, H)
}

export function worldBounds(map) {
  if (!map) return { x: 40, y: 40, w: WORLD_VIEW_W - 80, h: WORLD_VIEW_H - 80 }
  const m = map.bounds
  return {
    x: 40,
    y: 40,
    w: m.w >= WORLD_VIEW_W ? WORLD_VIEW_W - 80 : (m.w || WORLD_VIEW_W - 80),
    h: m.h >= WORLD_VIEW_H ? WORLD_VIEW_H - 80 : (m.h || WORLD_VIEW_H - 80),
  }
}

export { PLAYER_RADIUS }
