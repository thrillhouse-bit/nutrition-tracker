// Arena renderer — 16:9 isometric Greek-mythic action scene.
import apolloSpriteUrl from './assets/characters/apollo-archer-v1.png'
import { drawKalliasBody } from './rpg/kalliasRender.js'
//
// Draws from game state (positions, power windows, threat statuses) plus an
// effects object (particles, floaters, bursts, shake, hit reactions) that lives
// entirely in the render layer. The simulation never depends on anything here,
// so the same state always renders the same frame — the renderer is a pure
// projection of (state, fx).
//
// Visual north star (see GAME-DIRECTION.md, Phase B gate): dramatic value
// structure — dark charcoal/blue-green architectural voids, sunlit limestone
// floors, terracotta lanes, warm gold/bronze, molten-orange combat light.
// Full-body readable silhouettes at ~55-75 CSS px, real architectural depth
// (back colonnade, balustrade terrace, foreground corner pillars, cast
// shadows), and forceful combat feedback (trails, contact flashes, sparks,
// damage numbers, hit reaction, restrained screen shake). All code-native
// Canvas paths — no external assets.

export const VIEW_W = 820 // logical scene width (16:9)
export const VIEW_H = 461 // logical scene height (16:9)
export const VIEW_RADIUS = VIEW_W / 2 // legacy alias (kept for imports)

// Squash the y axis for a three-quarter/isometric view while keeping x true.
export const ISO_Y = 0.62

let apolloSprite = null

function loadedApolloSprite() {
  if (typeof Image === 'undefined') return null
  if (!apolloSprite) {
    apolloSprite = new Image()
    apolloSprite.decoding = 'async'
    apolloSprite.src = apolloSpriteUrl
  }
  return apolloSprite.complete && apolloSprite.naturalWidth > 0 ? apolloSprite : null
}

// Floor geometry in view units.
const FLOOR_TOP = -170 // top edge of the terrace floor (screen y)
const HORIZON = -208 // top of the backdrop band

const FALLBACK_PALETTE = {
  name: 'sunlit marble',
  sky: '#4f9dc4', skyLow: '#a8d3e2', sea: '#2e7fa8', hill: '#5e8c94',
  sun: '#fff3cf', haze: 'rgba(255,240,210,0.35)',
  marble: '#efe5cc', marbleMid: '#e0d2ae', marbleShadow: '#c8b88c',
  grout: '#26313b', stone: '#8d8271', stoneDark: '#5a5347',
  terracotta: '#c05a2e', terracottaDark: '#8f3d1e',
  bronze: '#a8762f', gold: '#e8b64c', glow: '#ffcf6b',
  ink: '#16202b', outline: '#131c26', accent: '#2a44c9', danger: '#b3241c',
  void: '#0b1218', interior: false,
}

export function levelPalette(level) {
  if (level && level.palette) return { ...FALLBACK_PALETTE, ...level.palette }
  return FALLBACK_PALETTE
}

// Visual body scale per monster archetype — collision radii stay untouched in
// the sim; this only controls how big the silhouette paints, so every enemy
// reads at 45-70 CSS px at the default viewport.
const VISUAL_SCALE = { hydra: 1.5, cerberus: 1.15, chronos: 1.9, minotaur: 1.25 }

// ─── Small canvas helpers ──────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashId(s) {
  let h = 2166136261
  for (let i = 0; i < String(s).length; i++) h = Math.imul(h ^ String(s).charCodeAt(i), 16777619)
  return h >>> 0
}

function ellipsePath(ctx, x, y, rx, ry) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
}

function fillStroke(ctx, fill, stroke, lw) {
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw ?? 2; ctx.stroke() }
}

function limb(ctx, x1, y1, x2, y2, w, color, outline) {
  ctx.lineCap = 'round'
  ctx.strokeStyle = outline || color
  ctx.lineWidth = w + 3
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
}

// Long cast shadow toward the lower-right (consistent sun from upper-left).
function castShadow(ctx, x, y, rx, ry, alpha = 0.32) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#0a1219'
  ctx.beginPath()
  ctx.ellipse(x + rx * 0.55, y + ry * 0.25, rx * 1.25, ry, -0.12, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// ─── Backdrop: sky + sea + back wall (or dark forge interior) ───
function drawBackdrop(ctx, pal, fx) {
  const halfW = VIEW_W / 2
  const halfH = VIEW_H / 2
  if (pal.interior) {
    // Foundry: dark stone wall with furnace glow.
    const g = ctx.createLinearGradient(0, -halfH, 0, FLOOR_TOP + 40)
    g.addColorStop(0, '#05080b')
    g.addColorStop(1, pal.wallLow || '#1b232a')
    ctx.fillStyle = g
    ctx.fillRect(-halfW, -halfH, VIEW_W, FLOOR_TOP + 40 + halfH)
    // Furnace arches with molten cores.
    for (let i = -1; i <= 1; i++) {
      const x = i * 240
      ctx.fillStyle = '#0b0f13'
      ctx.beginPath()
      ctx.moveTo(x - 46, FLOOR_TOP + 34)
      ctx.lineTo(x - 46, -150)
      ctx.quadraticCurveTo(x, -204, x + 46, -150)
      ctx.lineTo(x + 46, FLOOR_TOP + 34)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = pal.outline
      ctx.lineWidth = 4
      ctx.stroke()
      const pulse = 0.72 + 0.28 * Math.sin(fx.t * 0.06 + i * 2)
      const fg = ctx.createLinearGradient(0, -160, 0, FLOOR_TOP + 34)
      fg.addColorStop(0, `rgba(255,120,20,${0.85 * pulse})`)
      fg.addColorStop(1, `rgba(255,40,0,${0.25 * pulse})`)
      ctx.fillStyle = fg
      ctx.beginPath()
      ctx.moveTo(x - 30, FLOOR_TOP + 34)
      ctx.quadraticCurveTo(x, -150, x + 30, FLOOR_TOP + 34)
      ctx.closePath()
      ctx.fill()
    }
    return
  }
  // Open-air Acropolis/Sun Court: sky, sun, sea, distant hills.
  const g = ctx.createLinearGradient(0, -halfH, 0, FLOOR_TOP)
  g.addColorStop(0, pal.sky)
  g.addColorStop(0.82, pal.skyLow)
  g.addColorStop(1, pal.haze)
  ctx.fillStyle = g
  ctx.fillRect(-halfW, -halfH, VIEW_W, FLOOR_TOP + halfH)
  // Sun disc + halo.
  const sx = -190
  const sy = -216
  const halo = ctx.createRadialGradient(sx, sy, 6, sx, sy, 90)
  halo.addColorStop(0, 'rgba(255,250,230,0.95)')
  halo.addColorStop(0.25, 'rgba(255,235,180,0.5)')
  halo.addColorStop(1, 'rgba(255,235,180,0)')
  ctx.fillStyle = halo
  ctx.fillRect(sx - 100, sy - 100, 200, 200)
  ctx.fillStyle = pal.sun
  ctx.beginPath(); ctx.arc(sx, sy, 26, 0, Math.PI * 2); ctx.fill()
  // Sea band + horizon line.
  ctx.fillStyle = pal.sea
  ctx.fillRect(-halfW, -196, VIEW_W, 60)
  ctx.fillStyle = 'rgba(255,255,255,0.30)'
  ctx.fillRect(-halfW, -196, VIEW_W, 3)
  // Distant island hills.
  ctx.fillStyle = pal.hill
  ctx.beginPath()
  ctx.moveTo(-halfW, -196)
  ctx.lineTo(-halfW + 60, -224)
  ctx.lineTo(-halfW + 150, -198)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(240, -196)
  ctx.lineTo(316, -230)
  ctx.lineTo(410, -196)
  ctx.closePath()
  ctx.fill()
}

// ─── Back colonnade / balustrade standing on the terrace ───────
function drawBackWall(ctx, pal, scale, fx) {
  const halfW = VIEW_W / 2
  const baseY = FLOOR_TOP + 26 // plinth line
  // Stylobate steps up to the back wall.
  ctx.fillStyle = pal.stoneDark
  ctx.fillRect(-halfW, baseY, VIEW_W, 14)
  ctx.fillStyle = pal.stone
  ctx.fillRect(-halfW, baseY, VIEW_W, 6)
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = 2 / scale
  ctx.strokeRect(-halfW, baseY, VIEW_W, 14)
  if (pal.interior) {
    // Foundry: iron braziers on the plinth + hanging chains.
    for (const x of [-300, -100, 100, 300]) drawBrazierBody(ctx, x, baseY, 12, pal, fx, 1.15)
    ctx.strokeStyle = '#0c1116'
    ctx.lineWidth = 3 / scale
    for (const x of [-210, 0, 210]) {
      ctx.beginPath(); ctx.moveTo(x, HORIZON); ctx.lineTo(x + Math.sin(fx.t * 0.03 + x) * 2, -120); ctx.stroke()
    }
    return
  }
  // Acropolis: Doric columns receding behind the balustrade, sea between them.
  const cols = [-330, -225, -120, 0, 120, 225, 330]
  cols.forEach((x, i) => {
    drawColumnBody(ctx, x, baseY, 17, pal, scale, {
      height: 3.4, broken: false, capital: true, shade: 0.16,
    })
    // Pediment hint over the middle pair.
    void i
  })
  // Entablature beam across the tops.
  ctx.fillStyle = pal.marbleShadow
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = 2 / scale
  ctx.beginPath()
  ctx.rect(-halfW, baseY - 17 * 3.4 - 16, VIEW_W, 12)
  ctx.fill(); ctx.stroke()
  // Balustrade posts along the plinth edge.
  ctx.fillStyle = pal.marbleMid
  for (let x = -halfW + 26; x < halfW; x += 52) {
    ctx.fillRect(x, baseY - 12, 9, 12)
  }
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = 1.5 / scale
  ctx.strokeRect(-halfW, baseY - 12, VIEW_W, 12)
}

// ─── Column body (also used for background colonnade) ──────────
function drawColumnBody(ctx, x, groundY, r, pal, scale, o = {}) {
  const height = o.height ?? 3.0
  const h = r * height
  ctx.save()
  ctx.translate(x, groundY)
  // Shaft.
  const g = ctx.createLinearGradient(-r, 0, r, 0)
  g.addColorStop(0, pal.marble)
  g.addColorStop(0.55, pal.marbleMid)
  g.addColorStop(1, pal.marbleShadow)
  ctx.fillStyle = g
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = 2.4 / scale
  const top = -h
  const jag = o.broken ? 0.16 : 0
  ctx.beginPath()
  ctx.moveTo(-r, 0)
  ctx.lineTo(-r * (1 - jag), top)
  ctx.lineTo(-r * 0.25, top - r * 0.22)
  ctx.lineTo(r * 0.45, top + r * 0.18)
  ctx.lineTo(r, top - r * 0.05)
  ctx.lineTo(r, 0)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  // Flutes.
  ctx.strokeStyle = 'rgba(19,28,38,0.22)'
  ctx.lineWidth = 1.6 / scale
  for (const fxp of [-0.55, -0.15, 0.25, 0.6]) {
    ctx.beginPath()
    ctx.moveTo(r * fxp * 1.4, -2)
    ctx.lineTo(r * fxp * 1.2, top + r * 0.4)
    ctx.stroke()
  }
  if (o.capital !== false && !o.broken) {
    // Echinus + abacus.
    ctx.fillStyle = pal.marble
    ctx.strokeStyle = pal.outline
    ctx.lineWidth = 2.2 / scale
    ctx.beginPath()
    ctx.moveTo(-r * 1.05, top - r * 0.05)
    ctx.quadraticCurveTo(0, top - r * 0.7, r * 1.05, top - r * 0.05)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = pal.marbleMid
    ctx.beginPath()
    ctx.rect(-r * 1.25, top - r * 1.15, r * 2.5, r * 0.5)
    ctx.fill(); ctx.stroke()
  }
  // Base drum.
  ctx.fillStyle = pal.marbleShadow
  ctx.beginPath()
  ctx.rect(-r * 1.3, -r * 0.35, r * 2.6, r * 0.55)
  ctx.fill()
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = 2 / scale
  ctx.stroke()
  ctx.restore()
}

// ─── Brazier body: tripod, bowl, layered flame, ground light ───
function drawBrazierBody(ctx, x, groundY, r, pal, fx, k = 1) {
  const rr = r * k
  const flick = 0.8 + 0.2 * Math.sin(fx.t * 0.55 + x * 0.03) + 0.08 * Math.sin(fx.t * 1.7 + x)
  // Ground light pool.
  const pool = ctx.createRadialGradient(x, groundY + 4, 2, x, groundY + 4, rr * 6)
  pool.addColorStop(0, `rgba(255,170,70,${0.30 * flick})`)
  pool.addColorStop(1, 'rgba(255,170,70,0)')
  ctx.fillStyle = pool
  ctx.fillRect(x - rr * 6, groundY - rr * 4 + 4, rr * 12, rr * 8)
  // Tripod legs.
  ctx.strokeStyle = pal.bronze === undefined ? '#7a5a26' : '#7a5a26'
  ctx.lineWidth = rr * 0.26
  ctx.beginPath()
  ctx.moveTo(x - rr * 0.7, groundY)
  ctx.lineTo(x - rr * 0.2, groundY - rr * 1.5)
  ctx.moveTo(x + rr * 0.7, groundY)
  ctx.lineTo(x + rr * 0.2, groundY - rr * 1.5)
  ctx.moveTo(x, groundY - rr * 0.1)
  ctx.lineTo(x, groundY - rr * 1.55)
  ctx.stroke()
  // Bowl.
  ctx.fillStyle = '#8f6a2c'
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x - rr * 1.1, groundY - rr * 1.5)
  ctx.quadraticCurveTo(x, groundY - rr * 0.55, x + rr * 1.1, groundY - rr * 1.5)
  ctx.lineTo(x + rr * 1.25, groundY - rr * 1.95)
  ctx.lineTo(x - rr * 1.25, groundY - rr * 1.95)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  // Flame: outer orange, mid gold, white-hot core.
  const fh = rr * (2.7 + flick * 0.5)
  const flame = ctx.createRadialGradient(x, groundY - rr * 2.4, 1, x, groundY - rr * 2.4, rr * 3.4)
  flame.addColorStop(0, `rgba(255,190,80,${0.55 * flick})`)
  flame.addColorStop(1, 'rgba(255,120,20,0)')
  ctx.fillStyle = flame
  ctx.beginPath(); ctx.arc(x, groundY - rr * 2.4, rr * 3.4, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#ff8c1f'
  ctx.beginPath()
  ctx.moveTo(x - rr * 0.75, groundY - rr * 2.0)
  ctx.quadraticCurveTo(x - rr * 0.9, groundY - rr * 3.0, x - rr * 0.15, groundY - 2.0 - fh)
  ctx.quadraticCurveTo(x + rr * 0.8, groundY - rr * 3.0, x + rr * 0.75, groundY - rr * 2.0)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffd257'
  ctx.beginPath()
  ctx.moveTo(x - rr * 0.42, groundY - rr * 2.05)
  ctx.quadraticCurveTo(x - rr * 0.5, groundY - rr * 2.7, x + rr * 0.05, groundY - 2.0 - fh * 0.68)
  ctx.quadraticCurveTo(x + rr * 0.45, groundY - rr * 2.75, x + rr * 0.42, groundY - rr * 2.05)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#fff7d6'
  ellipsePath(ctx, x, groundY - rr * 2.25, rr * 0.2, rr * 0.45)
  ctx.fill()
}

// ─── Statue / ruin / urn props (foreground architecture) ──────
function drawStatue(ctx, x, groundY, r, pal, scale) {
  // Kouros silhouette on a pedestal: dark stone figure with rim light.
  ctx.save()
  ctx.translate(x, groundY)
  ctx.fillStyle = pal.stone
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = 2.2 / scale
  ctx.beginPath(); ctx.rect(-r * 1.2, -r * 1.0, r * 2.4, r * 1.0); ctx.fill(); ctx.stroke()
  ctx.fillStyle = pal.stoneDark
  ctx.beginPath(); ctx.rect(-r * 1.0, -r * 1.25, r * 2.0, r * 0.3); ctx.fill(); ctx.stroke()
  // Body: stylized standing figure.
  ctx.fillStyle = '#3d4a52'
  ctx.strokeStyle = pal.outlight || '#9fb2b8'
  ctx.lineWidth = 1.6 / scale
  ctx.beginPath()
  ctx.moveTo(-r * 0.5, -r * 1.25)
  ctx.lineTo(-r * 0.62, -r * 3.4)
  ctx.quadraticCurveTo(-r * 0.35, -r * 4.5, 0, -r * 4.55)
  ctx.quadraticCurveTo(r * 0.4, -r * 4.5, r * 0.6, -r * 3.3)
  ctx.lineTo(r * 0.5, -r * 1.25)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#3d4a52'
  ctx.beginPath(); ctx.arc(0, -r * 5.1, r * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // Raised arm.
  ctx.strokeStyle = '#3d4a52'
  ctx.lineWidth = r * 0.3
  ctx.beginPath(); ctx.moveTo(r * 0.4, -r * 3.6); ctx.lineTo(r * 1.15, -r * 4.7); ctx.stroke()
  ctx.restore()
}

function drawRuin(ctx, x, groundY, r, pal, scale) {
  ctx.save()
  ctx.translate(x, groundY)
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = 2 / scale
  // Topped drums, slightly askew.
  const rnd = mulberry32(hashId(`ruin:${x}:${groundY}`))
  let yy = 0
  for (let i = 0; i < 3; i++) {
    const w = r * (1.15 - i * 0.12)
    const dh = r * 0.5
    const off = (rnd() - 0.5) * r * 0.5
    ctx.fillStyle = i % 2 ? pal.marbleShadow : pal.marbleMid
    ellipsePath(ctx, off, yy - dh / 2, w, dh * 0.85)
    ctx.fill(); ctx.stroke()
    yy -= dh
  }
  // Fallen chunk nearby.
  ctx.fillStyle = pal.stone
  ctx.beginPath()
  ctx.ellipse(-r * 1.8, -r * 0.28, r * 0.75, r * 0.42, 0.35, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.restore()
}

function drawUrn(ctx, x, groundY, r, pal, scale) {
  ctx.save()
  ctx.translate(x, groundY)
  ctx.fillStyle = pal.terracotta
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = 2 / scale
  ctx.beginPath()
  ctx.moveTo(-r * 0.45, 0)
  ctx.quadraticCurveTo(-r * 1.15, -r * 0.9, -r * 0.45, -r * 1.7)
  ctx.lineTo(-r * 0.55, -r * 1.95)
  ctx.lineTo(r * 0.55, -r * 1.95)
  ctx.lineTo(r * 0.45, -r * 1.7)
  ctx.quadraticCurveTo(r * 1.15, -r * 0.9, r * 0.45, 0)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  ctx.strokeStyle = pal.terracottaDark
  ctx.lineWidth = r * 0.16
  ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 1.05); ctx.lineTo(r * 0.7, -r * 1.05); ctx.stroke()
  ctx.restore()
}

// ─── Level architecture (authored props) ───────────────────────
// Props come from level.architecture with kinds: column, brazier, statue,
// ruin, urn. Returns prop draw jobs so they can depth-sort with entities.
function propJobs(level) {
  return ((level && level.architecture) || []).map((o) => ({
    kind: o.kind, x: o.x, y: o.y, r: o.r, order: o.y, type: 'prop',
  }))
}

export function drawProp(ctx, o, pal, scale, fx) {
  const sy = o.y * ISO_Y
  if (o.kind !== 'brazier') castShadow(ctx, o.x, sy, o.r * 1.3, o.r * 0.5, 0.3)
  if (o.kind === 'column') {
    const broken = (hashId(`${o.x}:${o.y}`) % 4) === 0
    drawColumnBody(ctx, o.x, sy + o.r * 0.5, o.r, pal, scale, { height: 3.1, broken })
  } else if (o.kind === 'brazier') {
    castShadow(ctx, o.x, sy, o.r, o.r * 0.4, 0.22)
    drawBrazierBody(ctx, o.x, sy, o.r, pal, fx)
  } else if (o.kind === 'statue') {
    drawStatue(ctx, o.x, sy + o.r * 0.5, o.r, pal, scale)
  } else if (o.kind === 'ruin') {
    drawRuin(ctx, o.x, sy + o.r * 0.5, o.r, pal, scale)
  } else if (o.kind === 'urn') {
    drawUrn(ctx, o.x, sy + o.r * 0.5, o.r, pal, scale)
  }
}

// ─── Floor: terrace slabs, mosaic medallion, lanes, boundary ───
function drawFloor(ctx, pal, scale) {
  const halfW = VIEW_W / 2
  const halfH = VIEW_H / 2
  // Terrace slab fills from FLOOR_TOP to the bottom edge.
  ctx.fillStyle = pal.marbleMid
  ctx.fillRect(-halfW, FLOOR_TOP, VIEW_W, halfH - FLOOR_TOP)
  // Diamond slabs with dark grout — the value structure lives here: sunlit
  // faces against charcoal joint lines.
  const tile = 58
  ctx.save()
  ctx.beginPath()
  ctx.rect(-halfW, FLOOR_TOP, VIEW_W, halfH - FLOOR_TOP)
  ctx.clip()
  const rng = mulberry32(99)
  for (let gy = -6; gy < 10; gy++) {
    for (let gx = -9; gx < 9; gx++) {
      const cx = (gx - gy) * tile
      const cy = (gx + gy) * tile * ISO_Y * 0.5 + 20
      const v = rng()
      ctx.fillStyle = v > 0.66 ? pal.marble : v > 0.33 ? pal.marbleMid : pal.marbleShadow
      ctx.strokeStyle = pal.grout
      ctx.lineWidth = 1.6 / scale
      ctx.globalAlpha = 0.96
      ctx.beginPath()
      ctx.moveTo(cx, cy - tile * ISO_Y * 0.5)
      ctx.lineTo(cx + tile, cy)
      ctx.lineTo(cx, cy + tile * ISO_Y * 0.5)
      ctx.lineTo(cx - tile, cy)
      ctx.closePath()
      ctx.fill(); ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
  // Terracotta navigation lanes along the diagonals (wider, framed).
  for (const dir of [[1, 0.62], [-1, 0.62]]) {
    ctx.strokeStyle = pal.terracottaDark
    ctx.lineWidth = 16
    ctx.beginPath()
    ctx.moveTo(-halfW * dir[0], FLOOR_TOP - 40 * dir[1])
    ctx.lineTo(halfW * dir[0], halfH)
    ctx.stroke()
    ctx.strokeStyle = pal.terracotta
    ctx.lineWidth = 10
    ctx.stroke()
  }
  // Central mosaic medallion (concentric bands + sunburst core).
  const rings = [[150, pal.terracottaDark], [140, pal.marble], [128, pal.terracotta], [116, pal.grout], [110, pal.bronze]]
  for (const [rr, col] of rings) {
    ctx.strokeStyle = col
    ctx.lineWidth = rr > 120 ? 10 : 4
    ctx.beginPath()
    ctx.ellipse(0, 12, rr, rr * ISO_Y, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  // Meander zigzag ring.
  ctx.strokeStyle = pal.grout
  ctx.lineWidth = 2.4
  ctx.beginPath()
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2
    const wob = i % 2 ? 122 : 134
    const px = Math.cos(a) * wob
    const py = 12 + Math.sin(a) * wob * ISO_Y
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
  }
  ctx.stroke()
  // Sunburst core.
  ctx.fillStyle = pal.gold
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    ctx.save()
    ctx.translate(0, 12)
    ctx.rotate(a)
    ctx.beginPath()
    ctx.moveTo(0, -5 * ISO_Y)
    ctx.lineTo(64, -14 * ISO_Y)
    ctx.lineTo(64, 14 * ISO_Y)
    ctx.lineTo(0, 5 * ISO_Y)
    ctx.closePath()
    ctx.globalAlpha = i % 2 ? 0.5 : 0.9
    ctx.fill()
    ctx.restore()
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = pal.glow
  ellipsePath(ctx, 0, 12, 26, 26 * ISO_Y)
  ctx.fill()
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.restore()

  // Play boundary: inlaid mosaic ring (NOT a floating wall) at arenaRadius.
  const R = 280
  ctx.strokeStyle = pal.grout
  ctx.globalAlpha = 0.85
  ctx.lineWidth = 4
  ctx.beginPath(); ctx.ellipse(0, 0, R + 5, (R + 5) * ISO_Y, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = pal.terracotta
  ctx.lineWidth = 9
  ctx.globalAlpha = 0.7
  ctx.beginPath(); ctx.ellipse(0, 0, R, R * ISO_Y, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = pal.grout
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.8
  ctx.beginPath(); ctx.ellipse(0, 0, R - 8, (R - 8) * ISO_Y, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.globalAlpha = 1
  // Cool shade beyond the boundary toward the edges — keeps the court lit and
  // the surround heavier.
  for (const sgn of [-1, 1]) {
    const side = ctx.createLinearGradient(sgn * halfW, 0, sgn * (halfW - 130), 0)
    side.addColorStop(0, 'rgba(10,18,25,0.42)')
    side.addColorStop(1, 'rgba(10,18,25,0)')
    ctx.fillStyle = side
    ctx.fillRect(Math.min(sgn * (halfW - 130), sgn * halfW), FLOOR_TOP, 130, halfH - FLOOR_TOP)
  }
  const front = ctx.createLinearGradient(0, halfH - 88, 0, halfH)
  front.addColorStop(0, 'rgba(10,18,25,0)')
  front.addColorStop(1, 'rgba(10,18,25,0.5)')
  ctx.fillStyle = front
  ctx.fillRect(-halfW, halfH - 88, VIEW_W, 88)
  // Terrace front step.
  ctx.fillStyle = pal.stoneDark
  ctx.fillRect(-halfW, halfH - 14, VIEW_W, 14)
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = 2 / scale
  ctx.strokeRect(-halfW, halfH - 14, VIEW_W, 14)
}

// ─── Foreground corner pillars (depth frame, always front-most) ─
function drawForeground(ctx, pal, scale) {
  const halfW = VIEW_W / 2
  const halfH = VIEW_H / 2
  ctx.save()
  ctx.globalAlpha = 0.97
  for (const sgn of [-1, 1]) {
    const x = sgn * (halfW - 26)
    ctx.fillStyle = '#101820'
    ctx.strokeStyle = '#05090d'
    ctx.lineWidth = 3 / scale
    ctx.beginPath()
    ctx.rect(x - 34, -halfH + 40, 68, halfH * 2 - 40)
    ctx.fill(); ctx.stroke()
    // Rim light from the court.
    ctx.fillStyle = 'rgba(255,205,130,0.16)'
    ctx.fillRect(x - sgn * 30 - (sgn < 0 ? 0 : 8), -halfH + 40, 8, halfH * 2 - 40)
  }
  ctx.restore()
}

// ─── Deity: full-body Apollo archer (never a circle/dot) ───────
// Height ~46 logical units at deityRadius 15 → ~62-68 CSS px at the default
// viewport. Upright body, directional aim for the bow, walk cycle, recoil
// pose on release.
function drawDeity(ctx, state, pal, scale, fx, opts) {
  const d = state.deity
  const r = state.config.deityRadius
  const sy = d.y * ISO_Y
  const aim = state.input && state.input.aimX !== undefined
    ? Math.atan2(state.input.aimY, state.input.aimX)
    : d.facing
  const dir = Math.cos(aim) >= 0 ? 1 : -1
  const walk = fx.walk || 0
  const stride = Math.sin(walk * 0.9)
  const pose = Math.max(0, Math.min(1, fx.pose || 0))

  // Shadow + sun rim pool under the hero.
  castShadow(ctx, d.x, sy, r * 1.5, r * 0.55, 0.36)

  if (opts && opts.playerVisual === 'kallias') {
    // Kallias combat avatar — the selected patron stays the mechanical god;
    // this only swaps the visible body out for the storm-born courier.
    drawKalliasBody(ctx, state, pal, scale, fx, ISO_Y)
  } else {
  const sprite = state.god === 'apollo' ? loadedApolloSprite() : null
  if (sprite) {
    // Project-local, original painted sprite. Anchor at the feet and flip only
    // horizontally so world collision remains independent of presentation.
    const spriteH = r * 5.05
    const spriteW = spriteH * (sprite.naturalWidth / sprite.naturalHeight)
    const bob = Math.abs(stride) * r * 0.08
    ctx.save()
    ctx.translate(d.x, sy + r * 0.4 - bob)
    ctx.scale(dir, 1)
    ctx.rotate((dir > 0 ? -1 : 1) * pose * 0.025)
    ctx.drawImage(sprite, -spriteW * 0.5, -spriteH, spriteW, spriteH)
    ctx.restore()
  } else {
    ctx.save()
    ctx.translate(d.x, sy)
    ctx.scale(dir, 1) // body always upright, flips to face aim side
  const O = pal.outline
  const lw = 2.6 / scale

  const hipY = -r * 1.28
  const shoulderY = -r * 2.62
  const headY = -r * 3.35
  const footY = 0

  // Cloak behind (deep terracotta, gold hem), sways with stride.
  ctx.fillStyle = '#8f3d1e'
  ctx.strokeStyle = O
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.moveTo(-r * 0.35, shoulderY + r * 0.15)
  ctx.quadraticCurveTo(-r * 1.9 - stride * r * 0.5, hipY + r * 0.4, -r * 1.1 - stride * r * 0.6, footY - r * 0.25)
  ctx.lineTo(-r * 0.1, hipY + r * 0.5)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  ctx.strokeStyle = pal.gold
  ctx.lineWidth = r * 0.14
  ctx.beginPath()
  ctx.moveTo(-r * 1.05 - stride * r * 0.6, footY - r * 0.3)
  ctx.lineTo(-r * 0.2, hipY + r * 0.55)
  ctx.stroke()

  // Legs: dark greaves + sandals, walking stride.
  const legSw = stride * r * 0.5
  limb(ctx, -r * 0.18, hipY, -r * 0.28 - legSw * 0.5, footY, r * 0.4, '#caa06a', O)
  limb(ctx, r * 0.2, hipY, r * 0.42 + legSw * 0.5, footY, r * 0.4, '#e0b57c', O)
  ctx.strokeStyle = O
  ctx.lineWidth = r * 0.2
  ctx.beginPath()
  ctx.moveTo(-r * 0.55 - legSw * 0.5, footY - r * 0.05)
  ctx.lineTo(r * 0.02 - legSw * 0.5, footY - r * 0.05)
  ctx.moveTo(r * 0.12 + legSw * 0.5, footY - r * 0.05)
  ctx.lineTo(r * 0.82 + legSw * 0.5, footY - r * 0.05)
  ctx.stroke()

  // Chiton skirt (ivory with gold hem).
  ctx.fillStyle = '#f4ecd8'
  ctx.strokeStyle = O
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.moveTo(-r * 0.62, hipY - r * 0.55)
  ctx.lineTo(-r * 0.78, hipY + r * 0.62)
  ctx.quadraticCurveTo(0, hipY + r * 0.9, r * 0.78, hipY + r * 0.62)
  ctx.lineTo(r * 0.62, hipY - r * 0.55)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  ctx.strokeStyle = pal.gold
  ctx.lineWidth = r * 0.16
  ctx.beginPath()
  ctx.moveTo(-r * 0.72, hipY + r * 0.52)
  ctx.quadraticCurveTo(0, hipY + r * 0.82, r * 0.72, hipY + r * 0.52)
  ctx.stroke()

  // Torso: golden cuirass over ivory, leaning slightly toward the aim.
  ctx.fillStyle = pal.gold
  ctx.strokeStyle = O
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.moveTo(-r * 0.55, hipY - r * 0.5)
  ctx.quadraticCurveTo(-r * 0.78, shoulderY + r * 0.35, -r * 0.58, shoulderY)
  ctx.lineTo(r * 0.62, shoulderY)
  ctx.quadraticCurveTo(r * 0.8, shoulderY + r * 0.4, r * 0.55, hipY - r * 0.5)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  // Cuirass muscle line + shoulder pauldron.
  ctx.strokeStyle = 'rgba(40,25,10,0.5)'
  ctx.lineWidth = r * 0.1
  ctx.beginPath(); ctx.moveTo(0, shoulderY + r * 0.2); ctx.lineTo(0, hipY - r * 0.55); ctx.stroke()
  ctx.fillStyle = pal.bronze
  ctx.strokeStyle = O
  ctx.lineWidth = lw
  ctx.beginPath(); ctx.ellipse(r * 0.62, shoulderY + r * 0.05, r * 0.34, r * 0.24, 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke()

  // Quiver on the back with fletched shafts.
  ctx.fillStyle = '#6d4a2c'
  ctx.strokeStyle = O
  ctx.lineWidth = lw
  ctx.save()
  ctx.rotate(-0.32)
  ctx.beginPath(); ctx.ellipse(-r * 1.0, shoulderY + r * 1.35, r * 0.3, r * 1.0, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.restore()
  for (let i = -1; i <= 1; i++) {
    ctx.strokeStyle = i === 0 ? '#f4ecd8' : '#e0cfa8'
    ctx.lineWidth = r * 0.1
    ctx.beginPath()
    ctx.moveTo(-r * 0.95 + i * r * 0.14, shoulderY + r * 0.2)
    ctx.lineTo(-r * 1.0 + i * r * 0.2, shoulderY + r * 0.7)
    ctx.stroke()
  }

  // Head: skin, bronze hair, green laurel crown.
  ctx.fillStyle = '#f0c894'
  ctx.strokeStyle = O
  ctx.lineWidth = lw
  ctx.beginPath(); ctx.arc(r * 0.08, headY, r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#7a4f22'
  ctx.beginPath()
  ctx.arc(r * 0.08, headY, r * 0.52, Math.PI * 0.85, Math.PI * 1.95)
  ctx.arc(r * 0.08, headY - r * 0.1, r * 0.42, Math.PI * 1.95, Math.PI * 0.85, true)
  ctx.closePath()
  ctx.fill()
  // Laurel.
  ctx.strokeStyle = '#3e7a45'
  ctx.lineWidth = r * 0.16
  ctx.beginPath(); ctx.arc(r * 0.08, headY - r * 0.05, r * 0.55, Math.PI * 0.95, Math.PI * 2.05); ctx.stroke()
  ctx.fillStyle = '#57996'
  ctx.fillStyle = '#579960'
  for (const a of [1.15, 1.55, 1.95]) {
    ctx.beginPath()
    ctx.ellipse(r * 0.08 + Math.cos(a * Math.PI) * r * 0.6, headY - r * 0.05 + Math.sin(a * Math.PI) * r * 0.6, r * 0.16, r * 0.09, a, 0, Math.PI * 2)
    ctx.fill()
  }
  // Eye toward aim.
  ctx.fillStyle = O
  ctx.beginPath(); ctx.arc(r * 0.3, headY - r * 0.04, r * 0.07, 0, Math.PI * 2); ctx.fill()

  // Bow: aim angle mapped into the squashed view plane, recoil pulls it back.
  const aimLocal = dir > 0 ? aim : Math.PI - aim
  const bx = Math.cos(aimLocal) * r * 1.7
  const by = Math.sin(aimLocal) * r * 1.7 * ISO_Y - r * 2.35
  const gripAngle = aimLocal + Math.PI / 2
  // Front (bow) arm.
  limb(ctx, r * 0.3, shoulderY + r * 0.1, bx, by, r * 0.32, '#f0c894', O)
  ctx.save()
  ctx.translate(bx, by)
  ctx.rotate(gripAngle)
  // Recurve bow, sun-gold with dark tips.
  ctx.strokeStyle = O
  ctx.lineWidth = r * 0.42
  ctx.beginPath(); ctx.arc(0, 0, r * 1.35, -Math.PI * 0.34, Math.PI * 0.34); ctx.stroke()
  ctx.strokeStyle = pal.gold
  ctx.lineWidth = r * 0.24
  ctx.beginPath(); ctx.arc(0, 0, r * 1.35, -Math.PI * 0.34, Math.PI * 0.34); ctx.stroke()
  // String + nock hand; pose snaps the string back on release.
  const pull = (1 - pose) * r * 0.9
  const t1x = Math.cos(-Math.PI * 0.34) * r * 1.35
  const t1y = Math.sin(-Math.PI * 0.34) * r * 1.35
  const t2x = Math.cos(Math.PI * 0.34) * r * 1.35
  const t2y = Math.sin(Math.PI * 0.34) * r * 1.35
  ctx.strokeStyle = 'rgba(240,240,225,0.9)'
  ctx.lineWidth = r * 0.08
  ctx.beginPath()
  ctx.moveTo(t1x, t1y)
  ctx.lineTo(-pull, 0)
  ctx.lineTo(t2x, t2y)
  ctx.stroke()
  if (pose > 0.35) {
    // Nocked shaft visible while drawn.
    ctx.strokeStyle = '#fff2c0'
    ctx.lineWidth = r * 0.12
    ctx.beginPath(); ctx.moveTo(-pull, 0); ctx.lineTo(r * 1.3, 0); ctx.stroke()
  }
  ctx.restore()
  // Drawing hand snaps toward the cheek on release.
  const drawX = bx - Math.cos(aimLocal) * (r * 1.9 - pose * r * 0.9)
  const drawY = by - Math.sin(aimLocal) * (r * 1.9 - pose * r * 0.9) * ISO_Y - r * 0.1
  limb(ctx, -r * 0.15, shoulderY + r * 0.18, drawX * 0.45 - r * 0.1, shoulderY + r * 0.05 + pose * 0, r * 0.3, '#e0b57c', O)
  limb(ctx, r * 0.3, shoulderY + r * 0.4, drawX, drawY, r * 0.28, '#f0c894', O)
    ctx.restore()
  }
  }

  // ── Power auras (state-derived, drawn in view space) ──
  const ps = state.powerState
  if (ps && ps.goldenLyre && state.tick < ps.goldenLyre.activeUntil) {
    // Twin pulsing gold rings + orbiting notes — a tempo field, not a circle.
    const ph = (fx.t * 0.08) % (Math.PI * 2)
    for (const [rr, al] of [[r * 2.1, 0.85], [r * 2.7, 0.45]]) {
      ctx.strokeStyle = pal.gold
      ctx.globalAlpha = al * (0.6 + 0.4 * Math.sin(fx.t * 0.2))
      ctx.lineWidth = 2.6 / scale
      ctx.setLineDash([9 / scale, 5 / scale])
      ctx.lineDashOffset = -fx.t * 0.6
      ctx.beginPath(); ctx.ellipse(d.x, sy, rr, rr * ISO_Y, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = pal.glow
    ctx.font = `${r * 0.9}px Georgia, serif`
    for (let i = 0; i < 3; i++) {
      const a = ph + (i * Math.PI * 2) / 3
      ctx.fillText('♪', d.x + Math.cos(a) * r * 2.35 - r * 0.2, sy + Math.sin(a) * r * 2.35 * ISO_Y)
    }
  }
  if (d && state.tick < (d.invulnUntil || 0)) {
    // Ward: hexagonal shimmer, not a plain ring.
    ctx.strokeStyle = pal.accent
    ctx.globalAlpha = 0.75
    ctx.lineWidth = 3 / scale
    ctx.beginPath()
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2 + fx.t * 0.05
      const px = d.x + Math.cos(a) * r * 2.0
      const py = sy + Math.sin(a) * r * 2.0 * ISO_Y
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  if (ps && ps.worldRiver && state.tick < ps.worldRiver.activeUntil) {
    ctx.strokeStyle = '#4fa8c9'
    ctx.globalAlpha = 0.7
    ctx.lineWidth = 6 / scale
    ctx.beginPath()
    ctx.ellipse(d.x, sy, 135, 135 * ISO_Y, 0, fx.t * 0.1 % 6, (fx.t * 0.1 % 6) + 4.6)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}

// ─── Enemies — full-body mythic silhouettes with faces ─────────
function enemyScale(t) {
  return (t.radius || 12) * (VISUAL_SCALE[t.monsterType] || 1.4)
}

function healthBar(ctx, t, pal, scale) {
  if (t.health >= t.maxHealth) return
  const r = enemyScale(t)
  const w = r * 2.4
  const x = t.x - w / 2
  const y = t.y * ISO_Y - r * 3.4
  ctx.fillStyle = 'rgba(8,12,16,0.85)'
  ctx.fillRect(x - 1, y - 1, w + 2, 6)
  ctx.fillStyle = '#241a12'
  ctx.fillRect(x, y, w, 4)
  const frac = Math.max(0, t.health / t.maxHealth)
  ctx.fillStyle = frac > 0.5 ? '#7ac74f' : frac > 0.25 ? pal.gold : pal.danger
  ctx.fillRect(x, y, w * frac, 4)
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = 1 / scale
  ctx.strokeRect(x - 1, y - 1, w + 2, 6)
}

function hydra(ctx, t, pal, scale, fx) {
  const r = enemyScale(t)
  const sy = t.y * ISO_Y
  castShadow(ctx, t.x, sy, r * 1.4, r * 0.55, 0.32)
  ctx.save()
  ctx.translate(t.x, sy)
  const wob = Math.sin(fx.t * 0.12 + hashId(t.id) % 7) * 0.09
  ctx.rotate(wob)
  ctx.lineCap = 'round'
  // Coiled tail body.
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = r * 1.1
  ctx.beginPath()
  ctx.moveTo(r * 0.8, r * 0.55)
  ctx.quadraticCurveTo(r * 0.1, r * 0.95, -r * 0.7, r * 0.4)
  ctx.stroke()
  ctx.strokeStyle = '#2e6b4f'
  ctx.lineWidth = r * 0.85
  ctx.stroke()
  ctx.strokeStyle = '#57b07c'
  ctx.lineWidth = r * 0.3
  ctx.beginPath()
  ctx.moveTo(-r * 0.5, r * 0.55)
  ctx.quadraticCurveTo(r * 0.1, r * 0.8, r * 0.6, r * 0.4)
  ctx.stroke()
  // Three necks + heads.
  const heads = [
    [-r * 0.72, -r * 1.55, -0.5],
    [0, -r * 2.05, 0],
    [r * 0.78, -r * 1.5, 0.5],
  ]
  for (const [hx, hy, bend] of heads) {
    ctx.strokeStyle = pal.outline
    ctx.lineWidth = r * 0.62
    ctx.beginPath()
    ctx.moveTo(r * 0.2, r * 0.2)
    ctx.quadraticCurveTo(hx * 0.4, hy * 0.5, hx, hy)
    ctx.stroke()
    ctx.strokeStyle = '#2e6b4f'
    ctx.lineWidth = r * 0.4
    ctx.stroke()
    // Head with open jaw.
    ctx.save()
    ctx.translate(hx, hy)
    ctx.rotate(bend * 0.6)
    ctx.fillStyle = '#3e8b68'
    ctx.strokeStyle = pal.outline
    ctx.lineWidth = 2 / scale
    ctx.beginPath()
    ctx.moveTo(-r * 0.42, r * 0.05)
    ctx.lineTo(r * 0.55, -r * 0.28)
    ctx.lineTo(r * 0.5, -r * 0.02)
    ctx.lineTo(r * 0.6, r * 0.28)
    ctx.lineTo(-r * 0.35, r * 0.34)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    // Fangs + eye.
    ctx.fillStyle = '#f4ecd8'
    ctx.beginPath()
    ctx.moveTo(r * 0.42, -r * 0.02); ctx.lineTo(r * 0.32, r * 0.14); ctx.lineTo(r * 0.22, -r * 0.02); ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffd23e'
    ctx.beginPath(); ctx.arc(r * 0.12, -r * 0.14, r * 0.11, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = pal.outline
    ctx.beginPath(); ctx.arc(r * 0.14, -r * 0.14, r * 0.05, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}

function cerberus(ctx, t, pal, scale, fx) {
  const r = enemyScale(t)
  const sy = t.y * ISO_Y
  castShadow(ctx, t.x, sy, r * 1.6, r * 0.6, 0.34)
  ctx.save()
  ctx.translate(t.x, sy)
  const gait = Math.sin(fx.t * 0.2 + hashId(t.id) % 5) * r * 0.12
  // Hind + fore legs.
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = r * 0.42
  ctx.lineCap = 'round'
  for (const [lx, phase] of [[-r * 0.75, 1], [-r * 0.35, -1], [r * 0.45, 1], [r * 0.8, -1]]) {
    ctx.beginPath()
    ctx.moveTo(lx, -r * 0.35)
    ctx.lineTo(lx + phase * gait, r * 0.85)
    ctx.stroke()
  }
  ctx.strokeStyle = '#241f26'
  ctx.lineWidth = r * 0.26
  for (const [lx, phase] of [[-r * 0.75, 1], [-r * 0.35, -1], [r * 0.45, 1], [r * 0.8, -1]]) {
    ctx.beginPath()
    ctx.moveTo(lx, -r * 0.35)
    ctx.lineTo(lx + phase * gait, r * 0.85)
    ctx.stroke()
  }
  // Body — shaggy black hound.
  ctx.fillStyle = '#2b2430'
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = 2.4 / scale
  ctx.beginPath()
  ctx.moveTo(-r * 1.1, -r * 0.3)
  ctx.quadraticCurveTo(-r * 0.8, -r * 1.25, r * 0.1, -r * 1.1)
  ctx.quadraticCurveTo(r * 1.05, -r * 0.95, r * 1.12, -r * 0.3)
  ctx.quadraticCurveTo(r * 0.4, r * 0.35, -r * 0.55, r * 0.3)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  // Rib highlight.
  ctx.strokeStyle = 'rgba(160,150,180,0.25)'
  ctx.lineWidth = r * 0.08
  ctx.beginPath(); ctx.arc(r * 0.2, -r * 0.4, r * 0.55, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke()
  // Tail.
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = r * 0.3
  ctx.beginPath()
  ctx.moveTo(-r * 1.05, -r * 0.6)
  ctx.quadraticCurveTo(-r * 1.7, -r * 0.4, -r * 1.55, -r * 1.15)
  ctx.stroke()
  ctx.strokeStyle = '#2b2430'
  ctx.lineWidth = r * 0.16
  ctx.stroke()
  // Three snarling heads.
  for (const [hx, hy, tilt] of [[-r * 0.62, -r * 1.5, -0.35], [0, -r * 1.85, 0], [r * 0.62, -r * 1.5, 0.35]]) {
    ctx.save()
    ctx.translate(hx, hy)
    ctx.rotate(tilt)
    ctx.fillStyle = '#2b2430'
    ctx.strokeStyle = pal.outline
    ctx.lineWidth = 2.2 / scale
    ctx.beginPath(); ctx.arc(0, 0, r * 0.44, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    // Snout + open jaw.
    ctx.beginPath()
    ctx.moveTo(r * 0.15, -r * 0.18)
    ctx.lineTo(r * 0.78, -r * 0.3)
    ctx.lineTo(r * 0.72, r * 0.02)
    ctx.lineTo(r * 0.28, r * 0.0)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#8e2b22'
    ctx.beginPath()
    ctx.moveTo(r * 0.3, r * 0.02); ctx.lineTo(r * 0.72, r * 0.06); ctx.lineTo(r * 0.4, r * 0.3); ctx.closePath()
    ctx.fill()
    // Ears.
    ctx.fillStyle = '#2b2430'
    ctx.beginPath()
    ctx.moveTo(-r * 0.1, -r * 0.36); ctx.lineTo(-r * 0.42, -r * 0.72); ctx.lineTo(-r * 0.32, -r * 0.28)
    ctx.closePath(); ctx.fill(); ctx.stroke()
    // Glowing red eye.
    ctx.fillStyle = '#ff4a2e'
    ctx.beginPath(); ctx.arc(r * 0.12, -r * 0.12, r * 0.1, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}

function chronos(ctx, t, pal, scale, fx) {
  const r = enemyScale(t)
  const sy = t.y * ISO_Y
  castShadow(ctx, t.x, sy, r * 1.1, r * 0.45, 0.28)
  ctx.save()
  ctx.translate(t.x, sy + Math.sin(fx.t * 0.15 + hashId(t.id) % 4) * r * 0.2)
  // Tattered robe.
  ctx.fillStyle = '#3c2f52'
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = 2.4 / scale
  ctx.beginPath()
  ctx.moveTo(-r * 0.85, r * 1.0)
  ctx.quadraticCurveTo(-r * 1.05, -r * 0.6, -r * 0.42, -r * 1.75)
  ctx.quadraticCurveTo(0, -r * 2.25, r * 0.42, -r * 1.75)
  ctx.quadraticCurveTo(r * 1.05, -r * 0.6, r * 0.85, r * 1.0)
  ctx.lineTo(r * 0.45, r * 0.72)
  ctx.lineTo(r * 0.15, r * 1.05)
  ctx.lineTo(-r * 0.2, r * 0.7)
  ctx.lineTo(-r * 0.55, r * 1.05)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  // Robe shading fold.
  ctx.strokeStyle = 'rgba(14,10,24,0.55)'
  ctx.lineWidth = r * 0.12
  ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 1.3); ctx.quadraticCurveTo(-r * 0.5, -r * 0.2, -r * 0.35, r * 0.6); ctx.stroke()
  // Hood void + twin cyan eyes.
  ctx.fillStyle = '#120d1e'
  ctx.beginPath(); ctx.ellipse(0, -r * 1.35, r * 0.42, r * 0.55, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = pal.outline
  ctx.lineWidth = 1.8 / scale
  ctx.stroke()
  ctx.fillStyle = '#6fe6d2'
  ctx.beginPath(); ctx.arc(-r * 0.16, -r * 1.35, r * 0.09, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(r * 0.16, -r * 1.35, r * 0.09, 0, Math.PI * 2); ctx.fill()
  // Skeletal hands + dangling hourglass.
  ctx.strokeStyle = '#cdc6dd'
  ctx.lineWidth = r * 0.1
  ctx.beginPath()
  ctx.moveTo(-r * 0.6, -r * 0.7); ctx.lineTo(-r * 0.85, -r * 0.1)
  ctx.moveTo(r * 0.6, -r * 0.7); ctx.lineTo(r * 0.85, -r * 0.1)
  ctx.stroke()
  ctx.strokeStyle = pal.glow
  ctx.lineWidth = r * 0.09
  ctx.beginPath()
  ctx.moveTo(-r * 0.18, -r * 0.35)
  ctx.lineTo(r * 0.18, -r * 0.35)
  ctx.lineTo(0, -r * 0.05)
  ctx.lineTo(r * 0.18, r * 0.25)
  ctx.lineTo(-r * 0.18, r * 0.25)
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

function minotaur(ctx, t, pal, scale, fx) {
  const r = enemyScale(t)
  const sy = t.y * ISO_Y
  castShadow(ctx, t.x, sy, r * 1.6, r * 0.65, 0.38)
  ctx.save()
  ctx.translate(t.x, sy)
  const step = Math.sin(fx.t * 0.18 + hashId(t.id) % 6) * r * 0.25
  const O = pal.outline
  // Legs.
  limb(ctx, -r * 0.42, -r * 0.4, -r * 0.55 + step, r * 0.95, r * 0.5, '#57351f', O)
  limb(ctx, r * 0.42, -r * 0.4, r * 0.6 - step, r * 0.95, r * 0.5, '#6b4227', O)
  // Terracotta kilt.
  ctx.fillStyle = '#a4472a'
  ctx.strokeStyle = O
  ctx.lineWidth = 2.4 / scale
  ctx.beginPath()
  ctx.moveTo(-r * 0.75, -r * 0.6)
  ctx.lineTo(-r * 0.85, r * 0.25)
  ctx.lineTo(r * 0.85, r * 0.25)
  ctx.lineTo(r * 0.75, -r * 0.6)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  // Bulk torso.
  ctx.fillStyle = '#6b4227'
  ctx.beginPath()
  ctx.moveTo(-r * 0.95, -r * 0.55)
  ctx.quadraticCurveTo(-r * 1.15, -r * 1.7, -r * 0.5, -r * 2.0)
  ctx.lineTo(r * 0.5, -r * 2.0)
  ctx.quadraticCurveTo(r * 1.2, -r * 1.6, r * 0.95, -r * 0.55)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  // Dark bronze pauldrons.
  ctx.fillStyle = '#3a3128'
  for (const sgn of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(sgn * r * 0.95, -r * 1.7, r * 0.42, r * 0.3, sgn * 0.4, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }
  // Bull head + horns.
  ctx.fillStyle = '#7d4a2f'
  ctx.beginPath(); ctx.arc(0, -r * 2.45, r * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.strokeStyle = '#e6d9b8'
  ctx.lineWidth = r * 0.24
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-r * 0.5, -r * 2.6)
  ctx.quadraticCurveTo(-r * 1.25, -r * 2.7, -r * 1.3, -r * 3.35)
  ctx.moveTo(r * 0.5, -r * 2.6)
  ctx.quadraticCurveTo(r * 1.25, -r * 2.7, r * 1.3, -r * 3.35)
  ctx.stroke()
  // Snout + glowing eyes + nose ring.
  ctx.fillStyle = '#5c3520'
  ctx.beginPath(); ctx.ellipse(0, -r * 2.18, r * 0.38, r * 0.26, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#ff4a2e'
  ctx.beginPath(); ctx.arc(-r * 0.22, -r * 2.55, r * 0.1, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(r * 0.22, -r * 2.55, r * 0.1, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = pal.gold
  ctx.lineWidth = r * 0.1
  ctx.beginPath(); ctx.arc(0, -r * 2.1, r * 0.17, 0.2, Math.PI - 0.2); ctx.stroke()
  // Great axe on the leading shoulder.
  ctx.strokeStyle = '#5a4326'
  ctx.lineWidth = r * 0.26
  ctx.beginPath(); ctx.moveTo(r * 0.8, -r * 0.6); ctx.lineTo(r * 1.7, -r * 2.5); ctx.stroke()
  ctx.fillStyle = '#8c8377'
  ctx.strokeStyle = O
  ctx.lineWidth = 2 / scale
  ctx.beginPath()
  ctx.moveTo(r * 1.55, -r * 2.75)
  ctx.quadraticCurveTo(r * 2.5, -r * 2.9, r * 2.4, -r * 2.0)
  ctx.quadraticCurveTo(r * 1.9, -r * 2.2, r * 1.55, -r * 2.1)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  ctx.restore()
}

export function drawEnemy(ctx, t, pal, scale, fx) {
  if (t.monsterType === 'minotaur') minotaur(ctx, t, pal, scale, fx)
  else if (t.monsterType === 'cerberus') cerberus(ctx, t, pal, scale, fx)
  else if (t.monsterType === 'chronos') chronos(ctx, t, pal, scale, fx)
  else hydra(ctx, t, pal, scale, fx) // hydra + fallback archetypes

  // RPG-local elite overlay (e.g. the Name-Cutter Captain over a Chronos):
  // a bronze mask + aura + elite health treatment, keyed on storyVariantId so
  // the arena route (which never sets it) is completely unaffected.
  if (t.storyVariantId) {
    drawEliteTreatment(ctx, t, pal, scale, fx)
  }

  // Status tints.
  const now = fx.tickNow
  let tint = null
  if (t.charmedUntil && now < t.charmedUntil) tint = 'rgba(230,120,190,0.35)'
  else if (t.confusedUntil && now < t.confusedUntil) tint = 'rgba(160,200,255,0.3)'
  else if (t.blindedUntil && now < t.blindedUntil) tint = 'rgba(255,220,120,0.35)'
  else if (t.burningUntil && now < t.burningUntil) tint = 'rgba(255,120,30,0.35)'
  if (tint) {
    const r = enemyScale(t)
    ctx.fillStyle = tint
    ctx.beginPath(); ctx.arc(t.x, t.y * ISO_Y - r * 0.6, r * 1.6, 0, Math.PI * 2); ctx.fill()
  }
  // Hit reaction: white flash overlay for a few frames (kept under reduced
  // motion — it is short and non-flashing).
  const hurt = fx.hurt && fx.hurt[t.id]
  if (hurt) {
    const r = enemyScale(t)
    ctx.save()
    ctx.globalAlpha = Math.min(0.75, hurt / 8)
    ctx.fillStyle = '#fff2d8'
    ctx.beginPath(); ctx.arc(t.x, t.y * ISO_Y - r * 0.7, r * 1.35, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }
  if (t.storyVariantId) {
    eliteHealthBar(ctx, t, pal, scale)
  } else {
    healthBar(ctx, t, pal, scale)
  }
}

// Bronze mask + breathing aura for the elite story variant.
function drawEliteTreatment(ctx, t, pal, scale, fx) {
  const r = enemyScale(t)
  const sy = t.y * ISO_Y
  const pulse = 0.5 + 0.5 * Math.sin(fx.t * 0.1 + hashId(t.id) % 7)
  // Aura halo behind the threat.
  ctx.save()
  ctx.globalAlpha = 0.28 + pulse * 0.18
  const grad = ctx.createRadialGradient(t.x, sy - r * 0.6, r * 0.4, t.x, sy - r * 0.6, r * 2.1)
  grad.addColorStop(0, 'rgba(232,182,76,0.9)')
  grad.addColorStop(1, 'rgba(232,182,76,0)')
  ctx.fillStyle = grad
  ctx.beginPath(); ctx.arc(t.x, sy - r * 0.6, r * 2.1, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  // Bronze mask over the face.
  ctx.save()
  ctx.translate(t.x, sy - r * 0.9)
  ctx.fillStyle = '#c89a3c'
  ctx.strokeStyle = '#7a5a1e'
  ctx.lineWidth = Math.max(1, r * 0.08)
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 0.62, r * 0.78, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  // Mask slits (eyes).
  ctx.fillStyle = '#241708'
  ctx.beginPath(); ctx.ellipse(-r * 0.22, -r * 0.12, r * 0.12, r * 0.05, -0.3, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(r * 0.22, -r * 0.12, r * 0.12, r * 0.05, 0.3, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  // Readable name above the threat.
  ctx.save()
  ctx.font = `700 ${Math.max(10, r * 0.5)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  const label = t.name || 'Elite'
  ctx.fillStyle = 'rgba(10,12,10,0.6)'
  ctx.fillRect(t.x - r * 1.6, sy - r * 3.1 - 2, r * 3.2, r * 0.85)
  ctx.fillStyle = '#f3dfa0'
  ctx.fillText(label, t.x, sy - r * 2.55)
  ctx.restore()
}

// Elite health bar — wider, bronze-rimmed, always shown (not only when hurt).
function eliteHealthBar(ctx, t, pal, scale) {
  const r = enemyScale(t)
  const w = r * 3.0
  const x = t.x - w / 2
  const y = t.y * ISO_Y - r * 3.9
  ctx.fillStyle = 'rgba(8,12,16,0.85)'
  ctx.fillRect(x - 1, y - 1, w + 2, 7)
  ctx.fillStyle = '#1a1410'
  ctx.fillRect(x, y, w, 5)
  const frac = Math.max(0, t.health / t.maxHealth)
  const grad = ctx.createLinearGradient(x, 0, x + w, 0)
  grad.addColorStop(0, '#b3241c')
  grad.addColorStop(0.5, '#e8b64c')
  grad.addColorStop(1, '#f3dfa0')
  ctx.fillStyle = grad
  ctx.fillRect(x, y, w * frac, 5)
  ctx.strokeStyle = '#c89a3c'
  ctx.lineWidth = 1 / scale
  ctx.strokeRect(x - 1, y - 1, w + 2, 7)
}

// ─── Projectiles: molten trails with white-hot cores ───────────
export function drawProjectiles(ctx, state, scale, fx) {
  for (const p of state.projectiles) {
    const a = Math.atan2(p.vy * ISO_Y, p.vx)
    const silver = p.ability === 'arrowStorm'
    const tail = silver ? 30 : 44
    const tx = p.x - Math.cos(a) * tail
    const ty = p.y * ISO_Y - Math.sin(a) * tail
    const hx = p.x + Math.cos(a) * 8
    const hy = p.y * ISO_Y + Math.sin(a) * 8
    // Trail.
    const grad = ctx.createLinearGradient(tx, ty, hx, hy)
    if (silver) {
      grad.addColorStop(0, 'rgba(190,225,255,0)')
      grad.addColorStop(1, '#e9f4ff')
    } else {
      grad.addColorStop(0, 'rgba(255,110,20,0)')
      grad.addColorStop(0.55, 'rgba(255,150,40,0.85)')
      grad.addColorStop(1, '#ffd76a')
    }
    ctx.strokeStyle = grad
    ctx.lineWidth = 7 / scale
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke()
    ctx.strokeStyle = silver ? 'rgba(230,245,255,0.95)' : 'rgba(255,244,200,0.95)'
    ctx.lineWidth = 2.4 / scale
    ctx.stroke()
    // Head flare.
    const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 14)
    glow.addColorStop(0, silver ? 'rgba(220,240,255,0.8)' : 'rgba(255,220,140,0.85)')
    glow.addColorStop(1, 'rgba(255,170,60,0)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(hx, hy, 14, 0, Math.PI * 2); ctx.fill()
    // Arrow shaft + head.
    ctx.save()
    ctx.translate(hx, hy)
    ctx.rotate(a)
    ctx.fillStyle = silver ? '#dfe9f5' : '#ffdf8a'
    ctx.beginPath()
    ctx.moveTo(9, 0); ctx.lineTo(-4, -4.4); ctx.lineTo(-1, 0); ctx.lineTo(-4, 4.4)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = 'rgba(10,16,22,0.8)'
    ctx.lineWidth = 1.2 / scale
    ctx.stroke()
    ctx.restore()
    void fx
  }
}

// ─── Charge telegraphs: molten ground stripes ──────────────────
export function drawChargeTelegraphs(ctx, state, scale, fx) {
  for (const t of state.threats) {
    if (t.monsterType !== 'minotaur') continue
    const dx = state.deity.x - t.x
    const dy = (state.deity.y - t.y) * ISO_Y
    const dd = Math.hypot(dx, dy) || 1
    const nx = dx / dd
    const ny = dy / dd
    const r = enemyScale(t)
    const pulse = 0.5 + 0.5 * Math.sin(fx.t * 0.3 + t.x)
    ctx.save()
    ctx.strokeStyle = `rgba(255,110,30,${0.3 + pulse * 0.35})`
    ctx.lineWidth = 8 / scale
    ctx.setLineDash([16 / scale, 12 / scale])
    ctx.lineDashOffset = -fx.t * 1.6
    ctx.beginPath()
    ctx.moveTo(t.x + nx * r, t.y * ISO_Y + ny * r)
    ctx.lineTo(state.deity.x - nx * 20, state.deity.y * ISO_Y - ny * 20)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = `rgba(255,90,20,${0.4 + pulse * 0.3})`
    ctx.beginPath()
    ctx.moveTo(t.x + nx * r * 1.1, t.y * ISO_Y + ny * r * 1.1)
    ctx.lineTo(t.x + nx * r * 1.1 - ny * 13, t.y * ISO_Y + ny * r * 1.1 + nx * 13)
    ctx.lineTo(t.x + nx * r * 1.1 + ny * 13, t.y * ISO_Y + ny * r * 1.1 - nx * 13)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}

// ─── Gate of the Dead (state-derived) ──────────────────────────
function drawGate(ctx, state, pal, scale, fx) {
  const g = state.gate
  if (!g || state.tick >= g.until) return
  const sy = g.y * ISO_Y
  const life = (g.until - state.tick) / 90
  const spin = fx.t * 0.2
  const halo = ctx.createRadialGradient(g.x, sy, 4, g.x, sy, 70)
  halo.addColorStop(0, `rgba(120,255,190,${0.5 * life})`)
  halo.addColorStop(0.4, `rgba(40,90,120,${0.45 * life})`)
  halo.addColorStop(1, 'rgba(10,20,25,0)')
  ctx.fillStyle = halo
  ctx.beginPath(); ctx.ellipse(g.x, sy, 70, 70 * ISO_Y, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = `rgba(140,255,200,${0.7 * life})`
  ctx.lineWidth = 3 / scale
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.ellipse(g.x, sy, 22 + i * 14, (22 + i * 14) * ISO_Y, 0, spin + i, spin + i + 4)
    ctx.stroke()
  }
}

// ─── FX observation: derive reactions from state diffs ─────────
// Pure render layer: reads new state against fx's previous snapshot, appends
// sparks, hit reactions, damage numbers, and kill bursts. Same state
// sequence → same fx → same frames.
export function observeFx(fx, state) {
  fx.hurt = fx.hurt || {}
  fx.prevThreat = fx.prevThreat || {}
  fx.prevProj = fx.prevProj || {}
  fx.floaters = fx.floaters || []
  const pal = levelPalette(state.level)
  const seen = new Set()

  for (const t of state.threats) {
    seen.add(t.id)
    const prev = fx.prevThreat[t.id]
    if (prev && t.health < prev.health) {
      const dmg = Math.round(prev.health - t.health)
      fx.hurt[t.id] = 8
      if (!fx.reduceMotion) {
        spawnBurst(fx, t.x, t.y, 'spark', '#ffcf6b', dmg >= 30 ? 7 : 4, { r: 2.4, life: 16, speed: 2.6 })
      }
      fx.floaters.push({
        x: t.x, y: t.y - (t.radius || 12) * 1.6, vy: -0.9,
        text: String(dmg), age: 0, life: 40, big: dmg >= 30,
        color: dmg >= 30 ? '#ffdf8a' : '#fff4dd',
      })
      if (fx.floaters.length > 40) fx.floaters.splice(0, fx.floaters.length - 40)
    }
    fx.prevThreat[t.id] = { x: t.x, y: t.y, health: t.health }
  }
  for (const id of Object.keys(fx.prevThreat)) {
    if (seen.has(id)) continue
    const p = fx.prevThreat[id]
    delete fx.prevThreat[id]
    delete fx.hurt[id]
    // Gone near the center ⇒ killed; gone at the edge ⇒ escaped. Both need
    // no claim the sim didn't make: burst only when it died in view.
    if (Math.hypot(p.x, p.y) < state.config.arenaRadius - 24) {
      spawnBurst(fx, p.x, p.y, 'flash', pal.glow, 10, { r: 5, life: 22, speed: 3.2 })
      if (!fx.reduceMotion) spawnBurst(fx, p.x, p.y, 'debris', pal.terracotta, 6, { r: 3, life: 26, speed: 2.2 })
      fx.bursts = fx.bursts || []
      fx.bursts.push({ kind: 'kill', x: p.x, y: p.y, age: 0 })
    }
  }

  const projSeen = new Set()
  for (const pr of state.projectiles) {
    projSeen.add(pr.id)
    fx.prevProj[pr.id] = { x: pr.x, y: pr.y }
  }
  for (const id of Object.keys(fx.prevProj)) {
    if (projSeen.has(id)) continue
    const p = fx.prevProj[id]
    delete fx.prevProj[id]
    const near = state.threats.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < (t.radius || 12) + 34)
    spawnBurst(fx, p.x, p.y, near ? 'flash' : 'puff', near ? '#ffffff' : 'rgba(120,120,120,0.5)', near ? 5 : 2, { r: 3, life: 12, speed: 1.6 })
  }
  fx.tickNow = state.tick
}

// Push a radial particle burst (bounded — particles cap out).
export function spawnBurst(fx, x, y, kind, color, n, opts = {}) {
  const cap = 220
  fx.particles = Array.isArray(fx.particles) ? fx.particles : []
  const safeX = Number.isFinite(x) ? x : 0
  const safeY = Number.isFinite(y) ? y : 0
  if (fx.particles.length > cap) return
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = (opts.speed || 2.2) * (0.4 + Math.random())
    fx.particles.push({
      kind, x: safeX, y: safeY,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: (opts.r || 3) * (0.6 + Math.random() * 0.8),
      color, age: 0, life: opts.life || 22,
    })
  }
  if (fx.particles.length > cap) fx.particles.splice(0, fx.particles.length - cap)
}

// A power cast lands in the render layer with its aim point (the component
// calls this from its cast handler; it never touches the simulation).
export function castFx(fx, powerId, x, y, state) {
  fx.bursts = fx.bursts || []
  const d = state.deity
  const safeX = Number.isFinite(x) ? x : d.x
  const safeY = Number.isFinite(y) ? y : d.y
  switch (powerId) {
    case 'solarBow':
      spawnBurst(fx, d.x, d.y, 'spark', '#ffe08a', 3, { r: 1.8, life: 10, speed: 2.4 })
      break
    case 'radiantBurst':
      fx.bursts.push({ kind: 'radiantBurst', x: safeX, y: safeY, age: 0 })
      if (!fx.reduceMotion) spawnBurst(fx, safeX, safeY, 'spark', '#fff2c0', 14, { r: 2.6, life: 20, speed: 3.6 })
      break
    case 'goldenLyre':
      fx.bursts.push({ kind: 'goldenLyre', x: d.x, y: d.y, age: 0 })
      break
    default:
      fx.bursts.push({ kind: 'generic', x: d.x, y: d.y, age: 0 })
      break
  }
  if (fx.bursts.length > 24) fx.bursts.splice(0, fx.bursts.length - 24)
}

// ─── Burst + particle animation ────────────────────────────────
function stepFx(fx, steps) {
  fx.particles = Array.isArray(fx.particles) ? fx.particles : []
  fx.floaters = Array.isArray(fx.floaters) ? fx.floaters : []
  fx.bursts = Array.isArray(fx.bursts) ? fx.bursts : []
  for (let s = 0; s < steps; s++) {
    for (const p of fx.particles) {
      p.age += 1
      p.x += p.vx
      p.y += p.vy * 0.92
      if (p.kind === 'spark' || p.kind === 'debris') p.vy += 0.12
      if (p.kind === 'mote') { p.vy += 0.004; p.vx *= 0.99 }
    }
    fx.particles = fx.particles.filter((p) => p.age < p.life)
    for (const f of fx.floaters) { f.age += 1; f.y += f.vy }
    fx.floaters = fx.floaters.filter((f) => f.age < f.life)
    for (const b of fx.bursts) b.age += 1
    fx.bursts = fx.bursts.filter((b) => b.age < (b.kind === 'radiantBurst' ? 26 : 18))
  }
  for (const k of Object.keys(fx.hurt || {})) {
    fx.hurt[k] -= 1
    if (fx.hurt[k] <= 0) delete fx.hurt[k]
  }
  // Ambient sun dust — bounded, render-only.
  if (!fx.reduceMotion && fx.particles.length < 120 && fx.t % 14 === 0) {
    fx.particles.push({
      kind: 'mote',
      x: (Math.random() - 0.5) * VIEW_W * 0.8,
      y: (Math.random() - 0.5) * 240,
      vx: 0.12 + Math.random() * 0.2,
      vy: 0.05,
      r: 1 + Math.random() * 1.6,
      color: 'rgba(255,240,200,0.5)',
      age: 0,
      life: 160,
    })
  }
  if (fx.banner) {
    fx.banner.age += 1
    if (fx.banner.age > (fx.reduceMotion ? 130 : 190)) fx.banner = null
  }
}

function drawBursts(ctx, fx, pal, scale) {
  for (const b of fx.bursts) {
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.age)) continue
    const by = b.y * ISO_Y
    if (b.kind === 'radiantBurst') {
      // Solar detonation: expanding white→gold disc, shockwave ellipse, radial
      // slash streaks. Reads completely differently from a plain ring.
      const k = b.age / 26
      const R = 130 * (0.25 + k * 0.95)
      ctx.save()
      ctx.globalAlpha = (1 - k) * 0.9
      const core = ctx.createRadialGradient(b.x, by, 0, b.x, by, R)
      core.addColorStop(0, 'rgba(255,250,235,0.95)')
      core.addColorStop(0.4, 'rgba(255,210,110,0.75)')
      core.addColorStop(1, 'rgba(255,120,30,0)')
      ctx.fillStyle = core
      ctx.beginPath(); ctx.ellipse(b.x, by, R, R * ISO_Y, 0, 0, Math.PI * 2); ctx.fill()
      // Shockwave ring.
      ctx.strokeStyle = 'rgba(255,246,220,0.9)'
      ctx.lineWidth = 5 * (1 - k) / scale
      ctx.beginPath(); ctx.ellipse(b.x, by, R * 0.92, R * 0.92 * ISO_Y, 0, 0, Math.PI * 2); ctx.stroke()
      // Radial slashes.
      ctx.strokeStyle = pal.gold
      ctx.lineWidth = 3 / scale
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + b.age * 0.05
        ctx.beginPath()
        ctx.moveTo(b.x + Math.cos(a) * R * 0.55, by + Math.sin(a) * R * 0.55 * ISO_Y)
        ctx.lineTo(b.x + Math.cos(a) * R * 1.25, by + Math.sin(a) * R * 1.25 * ISO_Y)
        ctx.stroke()
      }
      ctx.restore()
    } else if (b.kind === 'goldenLyre') {
      const k = b.age / 18
      ctx.save()
      ctx.globalAlpha = (1 - k) * 0.85
      ctx.strokeStyle = pal.gold
      ctx.lineWidth = 4 * (1 - k) / scale
      const R = 40 + k * 110
      ctx.beginPath(); ctx.ellipse(b.x, b.y * ISO_Y, R, R * ISO_Y, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    } else if (b.kind === 'kill') {
      const k = b.age / 18
      ctx.save()
      ctx.globalAlpha = 1 - k
      ctx.strokeStyle = '#ffdf8a'
      ctx.lineWidth = 3 / scale
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4
        const rr = 12 + k * 34
        ctx.beginPath()
        ctx.moveTo(b.x + Math.cos(a) * (rr * 0.4), b.y * ISO_Y + Math.sin(a) * (rr * 0.4) * ISO_Y)
        ctx.lineTo(b.x + Math.cos(a) * rr, b.y * ISO_Y + Math.sin(a) * rr * ISO_Y)
        ctx.stroke()
      }
      ctx.restore()
    } else {
      const k = b.age / 18
      ctx.save()
      ctx.globalAlpha = (1 - k) * 0.7
      ctx.strokeStyle = pal.accent
      ctx.lineWidth = 3 / scale
      const R = 30 + k * 90
      ctx.beginPath(); ctx.ellipse(b.x, b.y * ISO_Y, R, R * ISO_Y, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
  }
}

function drawParticles(ctx, fx, scale) {
  for (const p of fx.particles) {
    const life = p.age / p.life
    const py = p.y * ISO_Y
    ctx.globalAlpha = 1 - life
    if (p.kind === 'spark') {
      ctx.strokeStyle = p.color
      ctx.lineWidth = 2.6 / scale
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(p.x, py)
      ctx.lineTo(p.x - p.vx * 2.6, py - p.vy * 2.6 * ISO_Y)
      ctx.stroke()
    } else if (p.kind === 'debris') {
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.moveTo(p.x, py - p.r * 0.5)
      ctx.lineTo(p.x + p.r, py)
      ctx.lineTo(p.x, py + p.r * 0.5)
      ctx.lineTo(p.x - p.r, py)
      ctx.closePath()
      ctx.fill()
    } else if (p.kind === 'flash') {
      ctx.strokeStyle = p.color
      ctx.lineWidth = (3.5 - life * 3) / scale
      ctx.beginPath()
      ctx.ellipse(p.x, py, p.r * (1 + life * 3.2), p.r * (1 + life * 3.2) * ISO_Y, 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (p.kind === 'puff') {
      ctx.fillStyle = p.color
      ctx.beginPath(); ctx.arc(p.x, py, p.r * (1 - life * 0.6), 0, Math.PI * 2); ctx.fill()
    } else if (p.kind === 'mote') {
      ctx.fillStyle = p.color
      ctx.beginPath(); ctx.arc(p.x, py, p.r, 0, Math.PI * 2); ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

function drawFloaters(ctx, fx, scale) {
  for (const f of fx.floaters) {
    const k = f.age / f.life
    ctx.save()
    ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
    ctx.font = `bold ${f.big ? 15 : 11}px Georgia, "Times New Roman", serif`
    ctx.textAlign = 'center'
    ctx.lineWidth = 3 / scale
    ctx.strokeStyle = 'rgba(10,14,20,0.85)'
    ctx.strokeText(f.text, f.x, f.y * ISO_Y)
    ctx.fillStyle = f.color
    ctx.fillText(f.text, f.x, f.y * ISO_Y)
    ctx.restore()
  }
}

function drawBanner(ctx, fx, pal, scale) {
  if (!fx.banner) return
  const b = fx.banner
  const inMax = fx.reduceMotion ? 40 : 60
  const outStart = fx.reduceMotion ? 90 : 140
  const alpha = b.age < inMax ? b.age / inMax
    : b.age > outStart ? Math.max(0, 1 - (b.age - outStart) / 50)
    : 1
  if (alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = 'rgba(8,12,18,0.72)'
  ctx.fillRect(-VIEW_W / 2, -66, VIEW_W, 118)
  ctx.fillStyle = pal.gold
  ctx.fillRect(-VIEW_W / 2, -66, VIEW_W, 2)
  ctx.fillRect(-VIEW_W / 2, 50, VIEW_W, 2)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#f7ecd0'
  let titleSize = 30
  ctx.font = `bold ${titleSize}px Georgia, "Times New Roman", serif`
  const textWidth = (text, size) => typeof ctx.measureText === 'function'
    ? ctx.measureText(text).width
    : String(text).length * size * 0.58
  while (titleSize > 18 && textWidth(b.title, titleSize) > VIEW_W - 48) {
    titleSize -= 1
    ctx.font = `bold ${titleSize}px Georgia, "Times New Roman", serif`
  }
  ctx.fillText(b.title, 0, -14)
  ctx.fillStyle = pal.glow
  let subtitleSize = 15
  ctx.font = `italic ${subtitleSize}px Georgia, "Times New Roman", serif`
  while (subtitleSize > 11 && textWidth(b.subtitle, subtitleSize) > VIEW_W - 48) {
    subtitleSize -= 1
    ctx.font = `italic ${subtitleSize}px Georgia, "Times New Roman", serif`
  }
  ctx.fillText(b.subtitle, 0, 16)
  ctx.restore()
}

// ─── Frame entry ───────────────────────────────────────────────
// draw(ctx, state, fx, opts): state must carry `level` (the component injects
// it). The optional fourth `opts` object supports render-only overrides (e.g.
// { playerVisual: 'kallias' }) without touching game state. Advances fx by one
// frame and paints everything. Mutates only the canvas + fx (render layer),
// never game state.
export function draw(ctx, state, fx, opts) {
  const c = ctx.canvas
  if (!c || !c.width) return
  const w = c.width
  const h = c.height
  const pal = levelPalette(state.level)
  const scale = w / VIEW_W

  stepFx(fx, 1)

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = pal.void || '#0b1218'
  ctx.fillRect(0, 0, w, h)
  // The canvas CSS box is 16:9, so sx≈sy; the explicit x/y scales keep the
  // scene correct even if the box drifts slightly.
  ctx.setTransform(scale, 0, 0, h / VIEW_H, w / 2, h / 2)

  // Screen shake (bounded; skipped under reduced motion).
  if (!fx.reduceMotion && fx.shake > 0) {
    const s = Math.min(fx.shake, 5)
    ctx.translate(Math.sin(fx.t * 91) * s / scale, Math.cos(fx.t * 73) * s / scale)
  }

  // Track walk cycle from deity motion.
  const d = state.deity
  if (fx.prevDeity) {
    const moved = Math.hypot(d.x - fx.prevDeity.x, d.y - fx.prevDeity.y)
    fx.walk = (fx.walk || 0) + moved * 0.5
    if (!fx.reduceMotion && moved > 0.1 && fx.t % 6 === 0) {
      spawnBurst(fx, d.x, d.y, 'mote', 'rgba(240,225,190,0.5)', 1, { r: 1.4, life: 18, speed: 0.5 })
    }
  }
  fx.prevDeity = { x: d.x, y: d.y }

  // ── Scene layers ──
  ctx.save()
  ctx.beginPath()
  ctx.rect(-VIEW_W / 2, -VIEW_H / 2, VIEW_W, VIEW_H)
  ctx.clip()

  drawBackdrop(ctx, pal, fx)
  drawFloor(ctx, pal, scale)
  drawBackWall(ctx, pal, scale, fx)
  drawChargeTelegraphs(ctx, state, scale, fx)
  drawGate(ctx, state, pal, scale, fx)

  // Depth-sort props + entities by world y for believable layering.
  const jobs = []
  for (const o of propJobs(state.level)) jobs.push({ order: o.y, draw: () => drawProp(ctx, o, pal, scale, fx) })
  for (const t of state.threats) {
    const r = enemyScale(t)
    // Flinch: shove the silhouette back along its approach while hurt.
    const hurt = fx.hurt && fx.hurt[t.id]
    const flinch = hurt ? (hurt / 8) * r * 0.3 : 0
    const vlen = Math.hypot(t.vx, t.vy) || 1
    jobs.push({
      order: t.y,
      draw: () => {
        ctx.save()
        if (hurt) ctx.translate((-t.vx / vlen) * flinch, (-t.vy / vlen) * flinch * ISO_Y)
        drawEnemy(ctx, t, pal, scale, fx)
        ctx.restore()
      },
    })
  }
  jobs.push({ order: d.y, draw: () => drawDeity(ctx, state, pal, scale, fx, opts) })
  jobs.sort((a, b) => a.order - b.order)
  for (const j of jobs) j.draw()

  drawProjectiles(ctx, state, scale, fx)
  drawBursts(ctx, fx, pal, scale)
  drawParticles(ctx, fx, scale)
  drawFloaters(ctx, fx, scale)
  drawForeground(ctx, pal, scale)

  // Sun shaft (open-air levels).
  if (!pal.interior) {
    ctx.save()
    const shaft = ctx.createLinearGradient(-VIEW_W / 2, -VIEW_H / 2, 60, 120)
    shaft.addColorStop(0, 'rgba(255,244,210,0.22)')
    shaft.addColorStop(0.5, 'rgba(255,244,210,0.05)')
    shaft.addColorStop(1, 'rgba(255,244,210,0)')
    ctx.fillStyle = shaft
    ctx.fillRect(-VIEW_W / 2, -VIEW_H / 2, VIEW_W, VIEW_H)
    ctx.restore()
  }

  // Rectangular edge vignette (no circular lens).
  const vg = ctx.createRadialGradient(0, 0, VIEW_H * 0.62, 0, 0, VIEW_W * 0.72)
  vg.addColorStop(0, 'rgba(5,9,13,0)')
  vg.addColorStop(1, 'rgba(5,9,13,0.42)')
  ctx.fillStyle = vg
  ctx.fillRect(-VIEW_W / 2, -VIEW_H / 2, VIEW_W, VIEW_H)

  drawBanner(ctx, fx, pal, scale)
  ctx.restore()

  // Damage flash on the deity (kept in reduced motion — brief, not flashing).
  if (fx.damageFlash > 0) {
    ctx.save()
    ctx.globalAlpha = Math.min(0.45, fx.damageFlash / 6)
    ctx.fillStyle = pal.danger
    ctx.beginPath()
    ctx.arc(d.x, d.y * ISO_Y, state.config.deityRadius * 2.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // Low-health table edge (state-derived, no DOM needed).
  if (d.health <= 35 && state.status === 'running') {
    const pulse = 0.2 + 0.12 * Math.sin(fx.t * 0.15)
    ctx.save()
    ctx.globalAlpha = fx.reduceMotion ? 0.18 : pulse
    const eg = ctx.createRadialGradient(0, 0, VIEW_H * 0.5, 0, 0, VIEW_W * 0.66)
    eg.addColorStop(0, 'rgba(150,20,20,0)')
    eg.addColorStop(1, 'rgba(150,20,20,0.8)')
    ctx.fillStyle = eg
    ctx.fillRect(-VIEW_W / 2, -VIEW_H / 2, VIEW_W, VIEW_H)
    ctx.restore()
  }

  // Letterbox-safe outer frame line.
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.strokeStyle = 'rgba(232,182,76,0.35)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, w - 2, h - 2)
}
