// Kallias combat avatar — render-only body for the RPG arena slice.
//
// The selected patron (state.god) stays the mechanical god: powers, passives,
// projectiles, cooldowns, auras, and rules all come from the shared power
// registry (`POWER_DEFS` / `DEITY_LOADOUT`). This module only substitutes
// Kallias's body where the arena renderer would otherwise paint a deity
// silhouette, so RPG combat reads as "Kallias channels the patron" instead of
// "Kallias becomes that deity."
//
// Canonical silhouette (see STORY-BIBLE.md "Kallias" / "Innate storm combat"):
//   - male, lighter medium-brown hair, a pale husky-blue readable eye
//   - long bronze spear as the primary held weapon, in a short thrust pose
//     aligned to aim
//   - hooked xiphos visibly holstered at the rear hip, never held
//   - free hand holds a compact, body-bound white-blue storm current
//   - blue-gray fractured mantle with an ivory seam over ivory/bronze field gear
//   - facing flip, walk stride, grounded cast shadow, full head/torso/limbs
//
// No mechanics live here: no power IDs, cooldowns, damage, input, projectiles,
// saves, or new actions. The only inputs are read-only state + fx, plus the two
// render-only fx hints (`fx.kalliasStrike`, `fx.kalliasCast`) the RPG loop may
// set. The caller draws the cast shadow in view space before invoking this.

const COL = {
  skin: '#e9be8c',
  skinShadow: '#c89962',
  hair: '#8a6a3e', // lighter medium-brown
  hairHilite: '#a8834f',
  eye: '#a9d4e8', // pale husky-blue
  tunic: '#f3e6c8', // ivory (DESIGN token)
  tunicShade: '#d9cba4',
  bronze: '#a5761f', // DESIGN bronze token
  bronzeDark: '#7a5718',
  bronzeLight: '#c9994a',
  mantle: '#576e82', // blue-gray
  mantleDark: '#41556a',
  seam: '#f3e6c8', // ivory seam
  stormCore: '#ffffff',
  stormMid: '#dcefff',
  stormEdge: '#8fb8d9',
  strap: '#5f4a2a',
}

function clamp01(v) {
  const n = typeof v === 'number' ? v : 0
  return n < 0 ? 0 : n > 1 ? 1 : n
}

// Rounded limb with a dark outline pass (matches the shared renderer body).
function limb(ctx, x1, y1, x2, y2, w, color, outline) {
  ctx.lineCap = 'round'
  ctx.strokeStyle = outline || color
  ctx.lineWidth = w + 3
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
}

// Filled polygon with an outline.
function poly(ctx, pts, fill, stroke, lw) {
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = lw
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  ctx.closePath()
  ctx.fill(); ctx.stroke()
}

// Paint the code-native Kallias body in local coordinates (origin at the feet,
// +x facing aim after the caller flips direction). Full silhouette, ~65-90 CSS
// px at the default viewport — never a token circle, sprite, or generic archer.
export function drawKalliasBody(ctx, state, pal, scale, fx, isoY = 0.62) {
  const d = state.deity
  const r = state.config.deityRadius
  const aim = state.input && state.input.aimX !== undefined
    ? Math.atan2(state.input.aimY, state.input.aimX)
    : (d.facing || 0)
  const dir = Math.cos(aim) >= 0 ? 1 : -1
  const stride = Math.sin((fx.walk || 0) * 0.9)
  const strike = clamp01(fx.kalliasStrike)
  const castGlow = clamp01(fx.kalliasCast)
  const reduce = Boolean(fx.reduceMotion)

  const O = pal.outline
  const lw = 2.6 / scale
  const hipY = -r * 1.4
  const shoulderY = -r * 2.78
  const headY = -r * 3.55
  const footY = 0

  ctx.save()
  ctx.translate(d.x, d.y * isoY)
  ctx.scale(dir, 1)

  // ── Blue-gray fractured mantle (behind the body), sways with stride ──
  ctx.fillStyle = COL.mantle
  ctx.strokeStyle = O
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.moveTo(-r * 0.2, shoulderY + r * 0.05)
  ctx.lineTo(-r * 0.95 - stride * r * 0.25, shoulderY + r * 0.55)
  ctx.lineTo(-r * 1.55 - stride * r * 0.45, hipY + r * 0.5)
  ctx.lineTo(-r * 1.3 - stride * r * 0.55, footY - r * 0.1)
  ctx.lineTo(-r * 0.65, hipY + r * 0.45)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  // Fractured ivory seam ticks across the mantle.
  ctx.strokeStyle = COL.seam
  ctx.lineWidth = r * 0.09
  ctx.beginPath()
  ctx.moveTo(-r * 0.85 - stride * r * 0.25, shoulderY + r * 0.5)
  ctx.lineTo(-r * 0.55, shoulderY + r * 0.25)
  ctx.lineTo(-r * 0.65, shoulderY)
  ctx.moveTo(-r * 1.35 - stride * r * 0.45, hipY + r * 0.4)
  ctx.lineTo(-r * 1.0, hipY + r * 0.3)
  ctx.stroke()

  // ── Hooked xiphos holstered at the rear hip (never held) ──
  ctx.save()
  ctx.translate(-r * 0.72, hipY + r * 0.12)
  ctx.rotate(-0.45)
  // Scabbard.
  ctx.fillStyle = COL.mantleDark
  ctx.strokeStyle = O
  ctx.lineWidth = r * 0.12
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 0.16, r * 0.66, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  // Grip (bronze) above the scabbard mouth.
  ctx.fillStyle = COL.bronze
  ctx.strokeStyle = O
  ctx.lineWidth = r * 0.1
  ctx.beginPath()
  ctx.moveTo(-r * 0.15, -r * 0.5); ctx.lineTo(r * 0.15, -r * 0.5)
  ctx.lineTo(r * 0.1, -r * 0.95); ctx.lineTo(-r * 0.1, -r * 0.95)
  ctx.closePath(); ctx.fill(); ctx.stroke()
  // Hooked crossguard curving up over the grip.
  ctx.beginPath()
  ctx.moveTo(r * 0.06, -r * 0.72)
  ctx.quadraticCurveTo(r * 0.36, -r * 0.55, r * 0.18, -r * 0.34)
  ctx.lineTo(r * 0.06, -r * 0.46)
  ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.restore()

  // ── Legs: ivory field trousers with bronze greaves, walking stride ──
  const legSw = stride * r * 0.5
  limb(ctx, -r * 0.2, hipY, -r * 0.32 - legSw * 0.55, footY - r * 0.1, r * 0.42, COL.tunicShade, O)
  limb(ctx, r * 0.2, hipY, r * 0.46 + legSw * 0.55, footY - r * 0.1, r * 0.42, COL.tunic, O)
  // Bronze greaves on each shin.
  ctx.strokeStyle = COL.bronze
  ctx.lineWidth = r * 0.46
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-r * 0.3 - legSw * 0.55, hipY - r * 0.2)
  ctx.lineTo(-r * 0.44 - legSw * 0.55, footY - r * 0.3)
  ctx.moveTo(r * 0.3 + legSw * 0.55, hipY - r * 0.2)
  ctx.lineTo(r * 0.46 + legSw * 0.55, footY - r * 0.3)
  ctx.stroke()
  // Sandal lines at the feet.
  ctx.strokeStyle = O
  ctx.lineWidth = r * 0.2
  ctx.beginPath()
  ctx.moveTo(-r * 0.6 - legSw * 0.55, footY - r * 0.05); ctx.lineTo(r * 0.02 - legSw * 0.55, footY - r * 0.05)
  ctx.moveTo(r * 0.1 + legSw * 0.55, footY - r * 0.05); ctx.lineTo(r * 0.85 + legSw * 0.55, footY - r * 0.05)
  ctx.stroke()

  // ── Torso: ivory tunic beneath a bronze cuirass + pauldron ──
  poly(ctx, [
    [-r * 0.62, hipY - r * 0.5],
    [-r * 0.8, hipY + r * 0.1],
    [-r * 0.5, hipY + r * 0.55],
    [r * 0.5, hipY + r * 0.55],
    [r * 0.8, hipY + r * 0.1],
    [r * 0.62, hipY - r * 0.5],
  ], COL.tunic, O, lw)
  // Bronze cuirass breastplate.
  poly(ctx, [
    [-r * 0.5, hipY - r * 0.4],
    [-r * 0.62, shoulderY + r * 0.3],
    [r * 0.62, shoulderY + r * 0.3],
    [r * 0.5, hipY - r * 0.4],
  ], COL.bronze, O, lw)
  // Ivory seam down the chest (field-gear strap detail).
  ctx.strokeStyle = COL.seam
  ctx.lineWidth = r * 0.1
  ctx.beginPath(); ctx.moveTo(0, shoulderY + r * 0.25); ctx.lineTo(0, hipY - r * 0.45); ctx.stroke()
  // Front-shoulder pauldron.
  ctx.fillStyle = COL.bronzeLight
  ctx.strokeStyle = O
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.ellipse(r * 0.6, shoulderY + r * 0.1, r * 0.3, r * 0.22, 0.2, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  // Belt.
  ctx.fillStyle = COL.strap
  ctx.strokeStyle = O
  ctx.lineWidth = lw
  ctx.beginPath(); ctx.rect(-r * 0.55, hipY - r * 0.62, r * 1.1, r * 0.3); ctx.fill(); ctx.stroke()

  // ── Off arm: free hand holding the body-bound storm current ──
  limb(ctx, -r * 0.35, shoulderY + r * 0.2, -r * 0.02, -r * 1.75, r * 0.34, COL.skin, O)
  limb(ctx, -r * 0.02, -r * 1.55, r * 0.2, -r * 1.5, r * 0.3, COL.skin, O)

  // ── Storm current in the free hand (white-blue, compact) ──
  const hx = r * 0.34
  const hy = -r * 1.55
  const flick = reduce ? 0 : Math.sin(fx.t * 0.5) + 0.6 * Math.sin(fx.t * 1.9)
  const coreR = r * 0.3 * (1 + castGlow * 0.55 + (reduce ? 0 : 0.08 + 0.06 * flick))
  const gall = ctx.createRadialGradient(hx, hy, 0, hx, hy, coreR * 2.6)
  gall.addColorStop(0, `rgba(255,255,255,${0.9 + castGlow * 0.1})`)
  gall.addColorStop(0.5, 'rgba(220,239,255,0.55)')
  gall.addColorStop(1, 'rgba(143,184,217,0)')
  ctx.fillStyle = gall
  ctx.beginPath(); ctx.arc(hx, hy, coreR * 2.6, 0, Math.PI * 2); ctx.fill()
  // Body-bound coil.
  ctx.strokeStyle = COL.stormMid
  ctx.lineWidth = r * 0.16
  ctx.beginPath()
  ctx.arc(hx, hy, coreR * 0.9, -0.6, Math.PI * 1.6)
  ctx.stroke()
  // White core.
  ctx.fillStyle = COL.stormCore
  ctx.beginPath(); ctx.arc(hx, hy, coreR * 0.42, 0, Math.PI * 2); ctx.fill()
  if (reduce) {
    // Reduced motion: a static glow and no animated branching/flicker.
    ctx.strokeStyle = COL.stormEdge
    ctx.lineWidth = r * 0.1
    ctx.beginPath(); ctx.arc(hx, hy, coreR * 1.15, -0.7, Math.PI * 0.7); ctx.stroke()
  } else {
    // Animated branch ticks (more when channeling a cast).
    ctx.strokeStyle = COL.stormEdge
    ctx.lineWidth = r * 0.1
    const nBranch = 3 + Math.round(castGlow * 2)
    for (let i = 0; i < nBranch; i++) {
      const a = -0.8 + (i / (nBranch - 1)) * 1.6 + flick * 0.25
      const r1 = coreR * 1.1
      const r2 = coreR * (1.6 + 0.3 * Math.sin(fx.t * 2 + i))
      ctx.beginPath()
      ctx.moveTo(hx + Math.cos(a) * r1, hy + Math.sin(a) * r1)
      ctx.lineTo(hx + Math.cos(a + 0.2) * r2, hy + Math.sin(a + 0.2) * r2)
      ctx.stroke()
    }
  }

  // ── Spear arm (front) + long bronze spear in a short thrust pose ──
  limb(ctx, r * 0.3, shoulderY + r * 0.15, r * 0.7, -r * 1.9, r * 0.34, COL.skin, O)
  limb(ctx, r * 0.7, -r * 1.9, r * 1.05, -r * 1.6, r * 0.3, COL.skin, O)

  const gripX = r * 1.05
  const gripY = -r * 1.6
  const tipX = r * 2.4 + strike * r * 1.0
  const tipY = -r * 2.15
  const buttX = -r * 0.55
  const buttY = r * 0.35
  // Shaft with outline + bronze highlight.
  ctx.lineCap = 'round'
  ctx.strokeStyle = O
  ctx.lineWidth = r * 0.2
  ctx.beginPath(); ctx.moveTo(buttX, buttY); ctx.lineTo(tipX, tipY); ctx.stroke()
  ctx.strokeStyle = COL.bronzeDark
  ctx.lineWidth = r * 0.12
  ctx.beginPath(); ctx.moveTo(buttX, buttY); ctx.lineTo(tipX, tipY); ctx.stroke()
  ctx.strokeStyle = COL.bronzeLight
  ctx.lineWidth = r * 0.05
  ctx.beginPath(); ctx.moveTo(buttX + r * 0.2, buttY); ctx.lineTo(tipX - r * 0.3, tipY); ctx.stroke()
  // Leaf-blade spearhead.
  poly(ctx, [
    [tipX, tipY],
    [tipX - r * 0.55, tipY - r * 0.16],
    [tipX - r * 0.5, tipY + r * 0.16],
  ], COL.bronzeLight, O, r * 0.08)
  // Butt spike behind the grip.
  poly(ctx, [
    [buttX, buttY],
    [buttX - r * 0.22, buttY - r * 0.1],
    [buttX - r * 0.22, buttY + r * 0.1],
  ], COL.bronze, O, r * 0.06)
  // Restrained Stormhand accent on the spearhead during a strike.
  if (strike > 0.02) {
    ctx.strokeStyle = COL.stormEdge
    ctx.lineWidth = r * 0.09
    ctx.beginPath()
    ctx.moveTo(tipX - r * 0.2, tipY - r * 0.18)
    ctx.lineTo(tipX - r * 0.5, tipY - r * 0.5)
    ctx.moveTo(tipX - r * 0.2, tipY + r * 0.18)
    ctx.lineTo(tipX - r * 0.55, tipY + r * 0.5)
    ctx.stroke()
  }

  // ── Head: skin, lighter medium-brown hair, pale husky-blue eye ──
  ctx.fillStyle = COL.skin
  ctx.strokeStyle = O
  ctx.lineWidth = lw
  ctx.beginPath(); ctx.arc(r * 0.08, headY, r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // Hair swept back.
  ctx.fillStyle = COL.hair
  ctx.beginPath()
  ctx.arc(r * 0.08, headY, r * 0.52, Math.PI * 0.8, Math.PI * 1.98)
  ctx.arc(r * 0.08, headY - r * 0.12, r * 0.42, Math.PI * 1.98, Math.PI * 0.8, true)
  ctx.closePath(); ctx.fill()
  ctx.strokeStyle = COL.hairHilite
  ctx.lineWidth = r * 0.09
  ctx.beginPath(); ctx.arc(r * 0.02, headY - r * 0.1, r * 0.34, Math.PI * 1.05, Math.PI * 1.8); ctx.stroke()
  // Pale husky-blue eye with a dark pupil, toward aim.
  ctx.fillStyle = COL.eye
  ctx.beginPath(); ctx.arc(r * 0.32, headY - r * 0.05, r * 0.09, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = O
  ctx.beginPath(); ctx.arc(r * 0.32, headY - r * 0.05, r * 0.045, 0, Math.PI * 2); ctx.fill()

  ctx.restore()
}
