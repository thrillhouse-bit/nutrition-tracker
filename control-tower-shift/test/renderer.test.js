// Render-layer smoke tests. jsdom has no canvas backend, so we drive the
// renderer with a recording stub context: every path op, arc, and fill is
// logged. This proves the frame is fully code-native, deterministic for a
// given (state, fx), and — the Phase B gate — that nothing in the scene is
// painted as a plain circle/dot stand-in for a character body.
import { describe, it, expect } from 'vitest'
import {
  createInitialState,
  spawnThreat,
  levelForIndex,
  castPowerOn,
  POWER_DEFS,
  DEITY_LOADOUT,
} from '../src/game/index.js'
import { CAMPAIGN } from '../src/game/campaign.js'
import { draw, observeFx, castFx, levelPalette, VIEW_W, VIEW_H } from '../src/renderer.js'
import { drawKalliasBody } from '../src/rpg/kalliasRender.js'

function makeRecorder() {
  const log = { arcs: [], ellipses: [], paths: 0, fills: 0, strokes: 0, text: [], drawImages: 0 }
  let depth = 0
  const noop = () => {}
  const grad = { addColorStop: noop }
  const ctx = {
    canvas: { width: 1280, height: 720 },
    save() { depth++ },
    restore() { depth-- },
    beginPath() { log.paths++ },
    moveTo: noop, lineTo: noop, quadraticCurveTo: noop, closePath: noop,
    rect: noop,
    fill() { log.fills++ },
    stroke() { log.strokes++ },
    fillRect: noop, strokeRect: noop, clearRect: noop, clip: noop,
    setTransform: noop, translate: noop, rotate: noop, scale: noop,
    arc(x, y, r) { log.arcs.push({ x, y, r, depth }) },
    ellipse(x, y, rx, ry) { log.ellipses.push({ x, y, rx, ry }) },
    fillText(t) { log.text.push(String(t)) },
    strokeText: noop,
    drawImage() { log.drawImages++ },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    setLineDash: noop,
  }
  return { ctx, log }
}

const freshFx = () => ({
  t: 0, shake: 0, damageFlash: 0, pose: 0, reduceMotion: false,
  particles: [], floaters: [], bursts: [], hurt: {}, prevThreat: {}, prevProj: {},
  walk: 0, banner: { title: 'X', subtitle: 'Y', age: 0 },
})

describe('renderer (stub canvas)', () => {
  it('paints a busy frame: many paths, fills, and strokes for a live level', () => {
    let s = createInitialState({ god: 'apollo' })
    s = { ...s, level: levelForIndex(0) }
    s = spawnThreat(s, { id: 'a', x: 60, y: 40, monsterType: 'hydra', radius: 12, health: 20, speed: 1 })
    s = spawnThreat(s, { id: 'b', x: -80, y: 60, monsterType: 'cerberus', radius: 16, health: 30, speed: 1 })
    s = spawnThreat(s, { id: 'c', x: 100, y: -60, monsterType: 'minotaur', radius: 15, health: 40, speed: 1 })
    s = castPowerOn(s, 'solarBow', 120, 0)
    const fx = freshFx()
    observeFx(fx, s)
    const { ctx, log } = makeRecorder()
    draw(ctx, { ...s, level: levelForIndex(0) }, fx)
    // A real scene, not a couple of debug primitives.
    expect(log.paths).toBeGreaterThan(150)
    expect(log.fills).toBeGreaterThan(120)
    expect(log.strokes).toBeGreaterThan(60)
  })

  it('the deity/enemies are never painted as a plain circle at body scale', () => {
    // Contract: inside the PLAY AREA (where bodies are painted, world |y|<~190
    // after iso-squash) no round arc of token size (8..48 px) may stand in
    // for a body. Flat ellipse-squashed rings/shadows are ellipse() calls and
    // not counted here. The backdrop sun sits far above the floor line and
    // is excluded by region.
    let s = createInitialState({ god: 'apollo' })
    s = spawnThreat(s, { id: 'a', x: 40, y: 20, monsterType: 'chronos', radius: 10, health: 10, speed: 1 })
    const fx = freshFx()
    fx.banner = null
    observeFx(fx, s)
    const { ctx, log } = makeRecorder()
    draw(ctx, s, fx)
    const inPlayArea = (a) => Math.abs(a.x) < 300 && a.y > -170 && a.y < 230
    const tokenBodies = log.arcs.filter((a) => inPlayArea(a) && a.r >= 8 && a.r <= 48)
    // Small circles (eyes, dots, nose rings, medallion core) are allowed;
    // nothing at collision-body radius (10-30 for these entities) may be the
    // ONLY body paint — so no arc circle at exactly an entity radius at an
    // entity's own position.
    for (const t of [...s.threats, { x: s.deity.x, y: s.deity.y, radius: s.config.deityRadius }]) {
      const bad = tokenBodies.filter(
        (a) => Math.abs(a.x - t.x) < 2 && Math.abs(a.y - t.y * 0.62) < 2 && Math.abs(a.r - t.radius) < 2,
      )
      expect(bad, `body token circle painted for entity at ${t.x},${t.y}`).toHaveLength(0)
    }
  })

  it('same state + same fx renders an identical draw log (pure projection)', () => {
    let s = createInitialState({ god: 'apollo' })
    s = spawnThreat(s, { id: 'a', x: 60, y: 40, monsterType: 'hydra', radius: 12, health: 20, speed: 1 })
    const mk = () => {
      const fx = freshFx()
      fx.particles = []
      fx.banner = null
      const { ctx, log } = makeRecorder()
      draw(ctx, s, fx)
      return JSON.stringify([log.paths, log.fills, log.strokes, log.arcs.length, log.ellipses.length, log.text.length])
    }
    expect(mk()).toBe(mk())
  })

  it('reduced motion still paints bodies, bursts, and the intro banner', () => {
    let s = createInitialState({ god: 'apollo' })
    s = spawnThreat(s, { id: 'a', x: 40, y: 20, monsterType: 'minotaur', radius: 15, health: 30, speed: 1 })
    const fx = freshFx()
    fx.reduceMotion = true
    observeFx(fx, s)
    const { ctx, log } = makeRecorder()
    draw(ctx, s, fx)
    expect(log.paths).toBeGreaterThan(100)
    expect(log.text).toContain('X') // banner title still painted
  })

  it('observeFx derives damage numbers and hit reactions purely from state', () => {
    let s = createInitialState({ god: 'apollo' })
    s = spawnThreat(s, { id: 'a', x: 40, y: 20, monsterType: 'hydra', radius: 12, health: 40, speed: 0 })
    const fx = freshFx()
    fx.banner = null
    observeFx(fx, s) // first pass records baseline
    const hurtState = { ...s, threats: [{ ...s.threats[0], health: 18 }] }
    observeFx(fx, hurtState)
    expect(fx.hurt.a).toBeGreaterThan(0)
    expect(fx.floaters.some((f) => f.text === '22')).toBe(true)
  })

  it('every campaign palette carries the dramatic value structure', () => {
    for (const level of CAMPAIGN) {
      const pal = levelPalette(level)
      expect(pal.grout).toMatch(/^#[0-9a-f]{6}$/i)
      expect(pal.gold).toMatch(/^#[0-9a-f]{6}$/i)
      expect(pal.outline).toMatch(/^#[0-9a-f]{6}$/i)
      // Charcoal-dark joints vs sunlit stone: guaranteed value separation.
      const lum = (h) => {
        const n = parseInt(h.slice(1), 16)
        return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
      }
      expect(lum(pal.grout)).toBeLessThan(0.25)
      expect(lum(pal.marble)).toBeGreaterThan(0.55)
    }
  })

  it('frame constants describe a 16:9 scene', () => {
    expect(VIEW_W / VIEW_H).toBeCloseTo(16 / 9, 2)
  })
})

describe('renderer — Kallias render-only mode', () => {
  // A canonical state fingerprint so we can prove drawing never mutates the
  // reducer state (byte-for-byte stable JSON, not a shallow reference check).
  const snapshot = (s) => JSON.stringify({
    god: s.god, loadout: s.loadout, deity: s.deity, powerState: s.powerState,
    threats: s.threats, projectiles: s.projectiles, status: s.status,
    tick: s.tick, score: s.score,
  })

  it('default three-argument rendering is unchanged (no playerVisual)', () => {
    let s = createInitialState({ god: 'apollo' })
    s = spawnThreat(s, { id: 'a', x: 60, y: 40, monsterType: 'hydra', radius: 12, health: 20, speed: 1 })
    const run = (opts) => {
      const fx = freshFx()
      fx.banner = null
      const { ctx, log } = makeRecorder()
      draw(ctx, s, fx, opts)
      return [log.paths, log.fills, log.strokes, log.arcs.length, log.drawImages]
    }
    // Three args and an empty fourth arg must produce the identical busy frame.
    const three = run(undefined)
    const empty = run({})
    expect(three[0]).toBeGreaterThan(150) // still a busy arena frame
    expect(empty).toEqual(three)
    expect(three[4]).toBe(0) // code-native in jsdom (no image backend)
  })

  it('kallias mode renders for Apollo, Hermes, and Athena without changing state/loadout', () => {
    for (const god of ['apollo', 'hermes', 'athena']) {
      let s = createInitialState({ god })
      s = spawnThreat(s, { id: 'a', x: 60, y: 40, monsterType: 'hydra', radius: 12, health: 20, speed: 1 })
      const before = snapshot(s)
      const fx = freshFx()
      fx.banner = null
      const { ctx, log } = makeRecorder()
      draw(ctx, s, fx, { playerVisual: 'kallias' })
      expect(log.paths).toBeGreaterThan(150)
      expect(log.drawImages).toBe(0)
      expect(snapshot(s)).toBe(before) // reducer state byte-for-byte unchanged
      expect(s.god).toBe(god)
      expect(s.loadout).toEqual(DEITY_LOADOUT[god])
    }
  })

  it('kallias body is a code-native full silhouette, never a token circle or sprite', () => {
    let s = createInitialState({ god: 'apollo' })
    const pal = levelPalette(levelForIndex(0))
    const fx = freshFx()
    const { ctx, log } = makeRecorder()
    drawKalliasBody(ctx, s, pal, 1.5, fx)
    // A token body is a couple of primitives; a full silhouette is rich.
    expect(log.paths).toBeGreaterThan(25)
    expect(log.fills).toBeGreaterThan(12)
    expect(log.strokes).toBeGreaterThan(15)
    expect(log.drawImages).toBe(0)
    // No body-scale circle stands in for the figure.
    const d = s.deity
    const token = log.arcs.filter((a) => Math.abs(a.r - s.config.deityRadius) < 2)
    expect(token).toHaveLength(0)
    // The readable pale eye is present as a small circle at head height.
    expect(log.arcs.some((a) => a.r < 2 && a.y < -40)).toBe(true)
  })

  it('reduced-motion kallias still paints a readable static body and current', () => {
    let s = createInitialState({ god: 'athena' })
    const pal = levelPalette(levelForIndex(0))
    const fx = freshFx()
    fx.reduceMotion = true
    const { ctx, log } = makeRecorder()
    drawKalliasBody(ctx, s, pal, 1.5, fx)
    expect(log.paths).toBeGreaterThan(25)
    expect(log.fills).toBeGreaterThan(12)
    expect(log.drawImages).toBe(0)
  })

  it('optional strike/cast values affect render output only, never reducer state', () => {
    let s = createInitialState({ god: 'hermes' })
    const before = snapshot(s)
    const pal = levelPalette(levelForIndex(0))
    const renderWith = (fxPatch) => {
      const fx = { ...freshFx(), ...fxPatch }
      const { ctx, log } = makeRecorder()
      drawKalliasBody(ctx, s, pal, 1.5, fx)
      return { paths: log.paths, strokes: log.strokes, arcs: log.arcs.length }
    }
    const idle = renderWith({})
    const strike = renderWith({ kalliasStrike: 1 })
    const cast = renderWith({ kalliasCast: 1 })
    // Strike adds a restrained Stormhand accent; cast adds channel branches.
    expect(strike.strokes).toBeGreaterThan(idle.strokes)
    expect(cast.strokes).toBeGreaterThan(idle.strokes)
    // The draw must not touch reducer state regardless of the fx hints.
    expect(snapshot(s)).toBe(before)
  })

  it('introduces no stormhand/stormstep power ID', () => {
    expect(POWER_DEFS.stormhand).toBeUndefined()
    expect(POWER_DEFS.stormstep).toBeUndefined()
    expect(DEITY_LOADOUT.zeus).not.toContain('stormhand')
    expect(DEITY_LOADOUT.zeus).not.toContain('stormstep')
    expect(DEITY_LOADOUT.apollo).not.toContain('stormhand')
  })
})
