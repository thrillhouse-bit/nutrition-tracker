// Control Tower RPG — the authored mythic action-RPG story slice
// (`/#control-tower-rpg`). Phase E production presentation pass:
// graphic-novel mythic surfaces (angular carved-bronze chrome, authored world
// via rpg/world.js, speaker portraits mapped by stable speaker ID, chapter
// transition at the Act I boundary) over the unchanged, verified flow:
// Entry Court -> Sun Court -> Name-Cutter Captain -> Thessa exit ->
// Far-Sighted -> post-mission -> Act II boundary.
//
// All state contracts, reducer events, save behavior, combat adapter wiring,
// and exact interaction handlers are preserved from the previous phase.

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  rpgMapById,
  rpgEncounterById,
  rpgConversationById,
  rpgQuestDefById,
  rpgRegionByAct,
} from './rpg/registry.js'
import {
  createInitialState as rpgInitial,
  applyEvent,
  currentObjective,
  currentObjectiveLabel,
  currentTideState,
  currentTideStateId,
  choiceIsAvailable,
  conversationRequiredChoicesMet,
  resolveConversationId,
  ACT5_LIGHT_FLAG,
} from './rpg/state.js'
import { ACT5_LIGHT_POLARITY_RULES, ACT5_LIGHT_POLARITY_STATES } from './rpg/act5Content.js'
import { saveRPG, loadRPG, clearSave } from './rpg/save.js'
import { startEncounter, startWildernessEncounter, stepCombat, arenaHealth, arenaProgress, sessionEliteName, sessionPhaseLabel, OUTCOME_WON, OUTCOME_FAILED } from './rpg/combatAdapter.js'
import { drawWorld, WORLD_VIEW_W, WORLD_VIEW_H, worldBounds } from './rpg/world.js'
import { findWorldPath } from './rpg/pathfinding.js'
import {
  createWorldProjection,
  playerSpriteTransform,
  projectedPointIsVisible,
  projectPoint,
  shouldCommitMovement,
  unprojectPoint,
} from './rpg/motion.js'
import {
  DEFAULT_LOCOMOTION_CONFIG,
  createLocomotionPose,
  locomotionPresentation,
  stepLocomotion,
} from './rpg/locomotion.js'
import { EQUIPMENT_SLOTS, SKILL_DEFS, carriedItemQuantity, levelForXp, xpForLevel } from './rpg/progression.js'
import { ALL_ITEM_DEFS } from './rpg/crafting.js'
import { deriveCombatModifiers, equipmentDecision } from './rpg/equipment.js'
import { resourceNodeStatus } from './rpg/resources.js'
import RPGSystemsPanel from './rpg/RPGSystemsPanel.jsx'
import RPGShopPanel from './rpg/RPGShopPanel.jsx'
import {
  levelById,
  powersForGod, powerReady, POWER_DEFS,
  GODS_TIER_1,
} from './game/index.js'
import { draw, observeFx, VIEW_W, VIEW_H } from './renderer.js'
// Responsive portrait derivatives are imported only on this route. Small
// dialogue plates default to 128px; title/chapter art defaults to 256px.
import kalliasPortrait128 from './assets/portraits/kallias-zeusborn-v1-128.webp'
import kalliasPortrait256 from './assets/portraits/kallias-zeusborn-v1-256.webp'
import thessaPortrait128 from './assets/portraits/thessa-cartographer-v1-128.webp'
import thessaPortrait256 from './assets/portraits/thessa-cartographer-v1-256.webp'
import amonidesPortrait128 from './assets/portraits/amonides-keeper-v1-128.webp'
import amonidesPortrait256 from './assets/portraits/amonides-keeper-v1-256.webp'
import ianthePortrait128 from './assets/portraits/ianthe-namecutter-v1-128.webp'
import ianthePortrait256 from './assets/portraits/ianthe-namecutter-v1-256.webp'
import nameCutterCaptainPortrait128 from './assets/portraits/name-cutter-captain-v1-128.webp'
import nameCutterCaptainPortrait256 from './assets/portraits/name-cutter-captain-v1-256.webp'
import beaconOverlookBackplate from './assets/environments/act1-beacon-overlook-v2.webp'
import oliveRoadBackplate from './assets/environments/act1-olive-road-v2.webp'
import kalliasWorldSprite from './assets/characters/kallias-world-cutout-v1-384.webp'
import thessaWorldSprite from './assets/characters/thessa-world-cutout-v1-384.webp'
import amonidesWorldSprite from './assets/characters/amonides-world-cutout-v1-384.webp'
import './rpg/presentation.css'

const TICK_RATE = 30
const DASH_MULT = 3.2
const DASH_MS = 200
const WORLD_INTERACTION_RADIUS = 56
// World coordinates are pixels and the movement loop is time-based. The old
// value (2.4) was inherited from per-tick arena motion and made a 500 px walk
// take several minutes. This is authored-world pixels per second.
// Deliberate traversal pace: fast enough to cross a plaza without waiting,
// slow enough for the distance-driven gait and authored landmarks to read.
const MOVE_SPEED = 120
const WORLD_LOCOMOTION_CONFIG = Object.freeze({
  ...DEFAULT_LOCOMOTION_CONFIG,
  walkSpeed: MOVE_SPEED,
  acceleration: 720,
  deceleration: 960,
})
const EMPTY_DIRECTIONAL_INPUT = Object.freeze({ up: false, down: false, left: false, right: false, dash: false })
const MOVEMENT_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', ' '])
export const MAX_CANVAS_DPR = 2
// A full-screen canvas should not exceed roughly 10 MB per RGBA surface.
// The DPR cap handles high-density phones; this budget also protects large
// desktop/external displays without changing the CSS-sized stage.
export const MAX_CANVAS_BACKING_PIXELS = 2_500_000

export function canvasBackingPolicy({ cssWidth, cssHeight, devicePixelRatio = 1 }) {
  const width = Number.isFinite(cssWidth) && cssWidth > 0 ? cssWidth : 0
  const height = Number.isFinite(cssHeight) && cssHeight > 0 ? cssHeight : 0
  if (!width || !height) return { cssWidth: width, cssHeight: height, scale: 1, width: 1, height: 1 }
  const requestedDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  const pixelBudgetScale = Math.sqrt(MAX_CANVAS_BACKING_PIXELS / (width * height))
  const scale = Math.max(Number.EPSILON, Math.min(requestedDpr, MAX_CANVAS_DPR, pixelBudgetScale))
  return {
    cssWidth: width,
    cssHeight: height,
    scale,
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }
}

export function worldCanvasShouldAnimate({
  started, status, paused, dialogue, shrineOpen, choicePrompt, panelOpen, skillAction, combatEnd,
}) {
  return Boolean(
    started
    && status === 'playing'
    && !paused
    && !dialogue
    && !shrineOpen
    && !choicePrompt
    && !panelOpen
    && !skillAction
    && !combatEnd
  )
}

export function combatCanvasShouldAnimate({ status, session, paused, combatEnd }) {
  return Boolean(status === 'in-combat' && session && !session.settled && !paused && !combatEnd)
}

function canvasFitter(canvas, fallbackAspect) {
  let lastSignature = ''
  return () => {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width) return false
    const cssHeight = rect.height || rect.width * fallbackAspect
    const policy = canvasBackingPolicy({
      cssWidth: rect.width,
      cssHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    })
    const signature = [rect.width, cssHeight, policy.scale, policy.width, policy.height].join(':')
    if (signature === lastSignature) return false
    lastSignature = signature
    if (canvas.width !== policy.width) canvas.width = policy.width
    if (canvas.height !== policy.height) canvas.height = policy.height
    return true
  }
}

function directionalInputFromKeys(keys) {
  return {
    up: keys.has('w') || keys.has('arrowup'),
    down: keys.has('s') || keys.has('arrowdown'),
    left: keys.has('a') || keys.has('arrowleft'),
    right: keys.has('d') || keys.has('arrowright'),
    dash: keys.has('shift') || keys.has(' '),
  }
}

// Precompute Tier-1 loadouts ONCE from the canonical source (never duplicated).
const PATRON_CARDS = GODS_TIER_1.map((god) => ({
  god,
  loadout: powersForGod(god.key).map((id) => POWER_DEFS[id]).filter(Boolean),
}))

// ─── Speaker portraits: keyed by STABLE speaker ID, never display text ──
// Every dialogue line carries node.speakerId; these are the only canonical
// IDs story content uses ('kallias', 'thessa', 'keeper', 'amonides').
function responsivePortrait(small, large) {
  return Object.freeze({ small, large, srcSet: `${small} 128w, ${large} 256w` })
}

const PORTRAIT_SOURCES = Object.freeze({
  kallias: responsivePortrait(kalliasPortrait128, kalliasPortrait256),
  thessa: responsivePortrait(thessaPortrait128, thessaPortrait256),
  amonides: responsivePortrait(amonidesPortrait128, amonidesPortrait256),
  ianthe: responsivePortrait(ianthePortrait128, ianthePortrait256),
  'name-cutter-captain': responsivePortrait(nameCutterCaptainPortrait128, nameCutterCaptainPortrait256),
})

const SPEAKER_PORTRAITS = {
  kallias: PORTRAIT_SOURCES.kallias,
  thessa: PORTRAIT_SOURCES.thessa,
  keeper: PORTRAIT_SOURCES.amonides,
  amonides: PORTRAIT_SOURCES.amonides,
  'name-cutter-captain': PORTRAIT_SOURCES['name-cutter-captain'],
}

// Identity carried by each portrait that a text nameplate alone does not
// announce. Kallias gets an empty alt: the nameplate already names him, so
// the portrait is decorative there (avoid redundant announcement).
const PORTRAIT_ALTS = {
  kallias: '',
  thessa: 'Silver-haired keeper in indigo robes holding a bronze astrolabe and rolled charts',
  keeper: 'Gray-bearded archive elder in a black cloak, holding wax tablets with a blank mask on his belt',
  amonides: 'Gray-bearded archive elder in a black cloak, holding wax tablets with a blank mask on his belt',
  'name-cutter-captain': 'Masked Name-Cutter Captain in fractured bronze armor',
}

const WORLD_BACKPLATES = Object.freeze({
  'beacon-overlook': beaconOverlookBackplate,
  'olive-road': oliveRoadBackplate,
})

const WORLD_ACTOR_SPRITES = Object.freeze({
  thessa: thessaWorldSprite,
  keeper: amonidesWorldSprite,
  amonides: amonidesWorldSprite,
})

const SAVE_ERROR_COPY = {
  corrupt: 'Your last checkpoint is unreadable.',
  future: 'Your last checkpoint was saved by a newer build and cannot be loaded here.',
  unknown: 'Your last checkpoint was saved by a newer build and cannot be loaded here.',
}

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch { return false }
}

// A small seeded RNG for non-deterministic *presentation* flourishes (kept
// strictly out of progression).
function worldFxRef() {
  return {
    t: 0, walkPhase: 0, moving: false, dash: { active: false, until: 0, dirX: 0, dirY: 0 },
    reduceMotion: prefersReducedMotion(), prompts: {},
  }
}

// Collision: keep Kallias within the map bounds and out of column-like decor.
function nearestOnSegment(point, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const denom = dx * dx + dy * dy
  const t = denom ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denom)) : 0
  const x = a.x + dx * t
  const y = a.y + dy * t
  return { x, y, distance: Math.hypot(point.x - x, point.y - y) }
}

function clampToWorld(pos, map, routeStateId = null) {
  const b = worldBounds(map)
  let { x, y } = pos
  x = Math.max(b.x, Math.min(b.x + b.w, x))
  y = Math.max(b.y, Math.min(b.y + b.h, y))
  const lanes = map.traversalLanes || []
  const hasTideLock = routeStateId && lanes.some((lane) => !lane.stateIds.includes(routeStateId))
  if (hasTideLock) {
    const candidates = []
    for (const lane of lanes.filter((item) => item.stateIds.includes(routeStateId))) {
      for (let i = 1; i < lane.points.length; i += 1) {
        candidates.push({ ...nearestOnSegment({ x, y }, lane.points[i - 1], lane.points[i]), width: lane.width })
      }
    }
    const nearest = candidates.reduce((best, item) => !best || item.distance < best.distance ? item : best, null)
    const safeRadius = Math.max(8, (nearest?.width || 0) / 2 - 16)
    if (nearest && nearest.distance > safeRadius) {
      const ratio = safeRadius / nearest.distance
      x = nearest.x + (x - nearest.x) * ratio
      y = nearest.y + (y - nearest.y) * ratio
    }
  }
  // Runtime maps author explicit solid AABBs. Expand them by Kallias's
  // collision radius and push to the nearest edge so movement cannot tunnel
  // into storehouses, reefs, rails, or other blocking geometry.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const solid of map.collisions || []) {
      const left = solid.x - 16
      const right = solid.x + solid.w + 16
      const top = solid.y - 16
      const bottom = solid.y + solid.h + 16
      if (x <= left || x >= right || y <= top || y >= bottom) continue
      const distances = [
        { value: Math.abs(x - left), axis: 'x', target: left },
        { value: Math.abs(x - right), axis: 'x', target: right },
        { value: Math.abs(y - top), axis: 'y', target: top },
        { value: Math.abs(y - bottom), axis: 'y', target: bottom },
      ]
      const nearest = distances.reduce((a, candidate) => candidate.value < a.value ? candidate : a)
      if (nearest.axis === 'x') x = nearest.target
      else y = nearest.target
    }
  }
  x = Math.max(b.x, Math.min(b.x + b.w, x))
  y = Math.max(b.y, Math.min(b.y + b.h, y))
  // Push out of solid decor (columns) — simple AABB.
  for (const d of map.decor || []) {
    if (d.kind === 'column') {
      const half = 18
      if (x > d.x - half && x < d.x + half && y > d.y - 60 && y < d.y + 10) {
        const left = Math.abs(x - (d.x - half)); const right = Math.abs(x - (d.x + half))
        const top = Math.abs(y - (d.y - 60)); const bot = Math.abs(y - (d.y + 10))
        const m = Math.min(left, right, top, bot)
        if (m === left) x = d.x - half
        else if (m === right) x = d.x + half
        else if (m === top) y = d.y - 60
        else y = d.y + 10
      }
    }
  }
  return { x, y }
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by)
}

function hasAcceptedAct5LightContract(map) {
  if (map?.act !== 5 || !map.light || !Array.isArray(map.light.laneIds)) return false
  const accepted = ACT5_LIGHT_POLARITY_RULES.stateIds
  if (!accepted.includes(map.light.initialStateId)) return false
  const lanes = new Map((map.traversalLanes || []).map((lane) => [lane.id, lane]))
  return map.light.laneIds.every((laneId) => {
    const lane = lanes.get(laneId)
    return lane && Array.isArray(lane.stateIds) && lane.stateIds.every((id) => accepted.includes(id))
  })
}

export function routeStateForMap(state, map) {
  if (map?.act === 2) return currentTideStateId(state)
  if (map?.act === 3) return state.flags['act3:season-state'] || map.season?.initialStateId || 'winter'
  if (map?.act === 4) return state.flags['act4:pressure-state'] || map.pressure?.initialStateId || 'safe'
  if (hasAcceptedAct5LightContract(map)) {
    const current = state.flags[ACT5_LIGHT_FLAG]
    return ACT5_LIGHT_POLARITY_RULES.stateIds.includes(current) ? current : map.light.initialStateId
  }
  return null
}

const ACT5_LIGHT_GLYPH_MARKS = Object.freeze({
  'filled-crescent': '◕',
  'split-disc': '◐',
  'rayed-disc': '☀',
})

export function act5LightPresentation(state, map) {
  if (!hasAcceptedAct5LightContract(map)) return null
  const id = routeStateForMap(state, map)
  const metadata = ACT5_LIGHT_POLARITY_STATES[id]
  if (!metadata) return null
  return {
    ...metadata,
    glyph: ACT5_LIGHT_GLYPH_MARKS[metadata.shapeGlyph] || metadata.shapeGlyph,
  }
}

function romanNumeral(value) {
  return ['I', 'II', 'III', 'IV', 'V'][Number(value) - 1] || String(value)
}

function tideGlyph(id) {
  if (id === 'surge') return '△'
  if (id === 'crossing') return '◇'
  return '▽'
}

function choiceLabel(id) {
  const labels = {
    'harbor-first': 'Harbor first',
    'boundary-first': 'Boundary first',
    'shared-crossing': 'Shared crossing',
    'affinity-aphrodite': 'Trust Aphrodite',
    'affinity-eros': 'Trust Eros',
  }
  return labels[id] || String(id || '').split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function questName(id) {
  return String(id || '')
    .replace(/^(mq|sq)-act\d+-/, '')
    .replace(/^(mq|sq)-/, '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const ACT_TRANSITIONS = Object.freeze({
  2: {
    title: 'Act II — The Salt Covenant',
    completion: 'Far-Sighted recovered',
    copy: 'The name leans seaward. Ianthe keeps the old tide-charts on the Pelagos strand — the next lead toward the Salt Covenant.',
    action: 'Enter Pelagos',
  },
  3: {
    title: 'Act III — The Withered Year',
    completion: 'The Salt Covenant ratified',
    copy: 'A season has stopped answering its people. Demeter and Persephone wait beyond the thawless fields, where return itself must be witnessed.',
    action: 'Enter the Fields of Kore',
  },
  4: {
    title: 'Act IV — The False Constellation',
    completion: 'The first thaw witnessed',
    copy: 'Names are being stamped into law beneath a counterfeit sky. The Forge March calls for a covenant mortals can revise with their own hands.',
    action: 'Enter the Forge March',
  },
  5: {
    title: 'Act V — The Last Name',
    completion: 'The mortal draft ratified',
    copy: 'The Night Stair opens above every road Kallias has crossed. Nyx keeps the final witnesses while the Silent Loom prepares to erase them.',
    action: 'Climb the Night Stair',
  },
})

// ─── Main component ────────────────────────────────────────────
export default function ControlTowerRPG() {
  // World (story) state + save.
  const [boot] = useState(() => {
    const { save, error } = loadRPG(typeof window !== 'undefined' ? window.localStorage : null)
    return {
      state: save || rpgInitial(),
      hasStoredSave: Boolean(save),
      saveError: save ? 'none' : error === 'none' ? 'none' : error,
    }
  })
  const [state, setState] = useState(boot.state)
  const [started, setStarted] = useState(false)
  const [hasStoredSave, setHasStoredSave] = useState(boot.hasStoredSave)
  const [saveError, setSaveError] = useState(boot.saveError)
  const stateRef = useRef(state)
  stateRef.current = state
  const saveQueuedRef = useRef(false)

  // Combat session (isolated from story state).
  const [session, setSession] = useState(null)
  const sessionRef = useRef(session)
  sessionRef.current = session
  const arenaFxRef = useRef(null)
  if (arenaFxRef.current === null) {
    arenaFxRef.current = {
      t: 0, shake: 0, damageFlash: 0, pose: 0,
      reduceMotion: prefersReducedMotion(),
      particles: [], floaters: [], bursts: [], hurt: {}, prevThreat: {}, prevProj: {},
      walk: 0, banner: null,
    }
  }

  // World canvas + animation.
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const playerSpriteRef = useRef(null)
  const worldAnchorRefs = useRef(new Map())
  const worldRef = useRef(worldFxRef())
  const inputRef = useRef({ ...EMPTY_DIRECTIONAL_INPUT })
  const touchRef = useRef({ ...EMPTY_DIRECTIONAL_INPUT })
  const pathRef = useRef([])
  const visualWorldRef = useRef(createLocomotionPose({ ...state.world.position, facing: state.world.facing }))
  const lastMoveCommitRef = useRef(0)
  const pendingInteractionRef = useRef(null)
  const keysRef = useRef(new Set())
  const pointerDownRef = useRef(false)
  const combatActionRef = useRef({ attack: false, powerId: null })
  // A newly mounted encounter is a visible, frozen staging boundary. The
  // simulation is armed only by an explicit player action, so browser/tool or
  // attention latency between seeing the controls and using them is never
  // replayed into the fight.
  const [combatReady, setCombatReady] = useState(false)
  const combatReadyRef = useRef(false)
  combatReadyRef.current = combatReady
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  pausedRef.current = paused
  const [dialogue, setDialogue] = useState(null) // { id, node, index }
  const dialogueRef = useRef(null)
  dialogueRef.current = dialogue
  const [shrineOpen, setShrineOpen] = useState(false)
  const shrineOpenRef = useRef(false)
  shrineOpenRef.current = shrineOpen
  const [choicePrompt, setChoicePrompt] = useState(null)
  const choicePromptRef = useRef(null)
  choicePromptRef.current = choicePrompt
  const [combatEnd, setCombatEnd] = useState(null) // { outcome, encounterId }
  const combatEndRef = useRef(null)
  combatEndRef.current = combatEnd
  const [showHelp, setShowHelp] = useState(false)
  const [saveNote, setSaveNote] = useState('')
  const [moveTarget, setMoveTarget] = useState(null)
  const [panelOpen, setPanelOpen] = useState(null)
  const panelOpenRef = useRef(null)
  panelOpenRef.current = panelOpen
  const [skillAction, setSkillAction] = useState(null)

  const flushSave = useCallback((s) => {
    const ok = saveRPG(typeof window !== 'undefined' ? window.localStorage : null, s)
    if (ok) {
      setHasStoredSave(true)
      setSaveError('none')
    }
    setSaveNote(ok ? '' : 'Save unavailable')
  }, [])

  const enqueueSave = useCallback((s) => {
    saveQueuedRef.current = s
  }, [])

  // Persist at encounter boundaries and patron changes. We flush immediately
  // at those moments (not debounced) so a refresh never loses a checkpoint.
  useEffect(() => {
    if (saveQueuedRef.current) {
      flushSave(saveQueuedRef.current)
      saveQueuedRef.current = null
    }
  }, [state, flushSave])

  const dispatch = useCallback((event, opts = {}) => {
    const prev = stateRef.current
    const next = applyEvent(prev, event)
    stateRef.current = next
    setState(next)
    // Immediate save on state-changing story events (checkpoints).
    if (opts.persist !== false) enqueueSave(next)
  }, [enqueueSave])

  // Persisted playtime is the deterministic clock for renewable nodes and
  // merchant restocks. Batch it once per second to avoid a 30 Hz React render.
  useEffect(() => {
    if (!started || paused || !['playing', 'in-combat'].includes(state.status)) return undefined
    const timer = window.setInterval(() => {
      dispatch({ type: 'TICK', n: TICK_RATE }, { persist: false })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [started, paused, state.status, dispatch])

  const closePanel = useCallback(() => {
    if (panelOpenRef.current === 'shop') dispatch({ type: 'CLOSE_SHOP' }, { persist: false })
    setPanelOpen(null)
  }, [dispatch])

  const toggleRecordPanel = useCallback((panelId) => {
    if (panelOpenRef.current === 'shop') dispatch({ type: 'CLOSE_SHOP' }, { persist: false })
    setPanelOpen((current) => current === panelId ? null : panelId)
  }, [dispatch])

  const queueCombatAction = useCallback((action) => {
    combatActionRef.current = { ...combatActionRef.current, ...action }
  }, [])

  const syncKeyboardInput = useCallback(() => {
    inputRef.current = directionalInputFromKeys(keysRef.current)
  }, [])

  const clearTransientInput = useCallback(() => {
    keysRef.current.clear()
    inputRef.current = { ...EMPTY_DIRECTIONAL_INPUT }
    touchRef.current = { ...EMPTY_DIRECTIONAL_INPUT }
    pointerDownRef.current = false
    combatActionRef.current = { attack: false, powerId: null }
    worldRef.current.moving = false
    worldRef.current.dash.active = false
    worldRef.current.dash.dirX = 0
    worldRef.current.dash.dirY = 0
  }, [])

  const registerWorldAnchor = useCallback((key, node) => {
    if (node) worldAnchorRefs.current.set(key, node)
    else worldAnchorRefs.current.delete(key)
  }, [])

  const paintWorldProjection = useCallback((visual = visualWorldRef.current) => {
    const sprite = playerSpriteRef.current
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const projection = createWorldProjection({
      focusX: visual.x,
      focusY: visual.y,
      viewportWidth: rect.width,
      viewportHeight: rect.height,
      worldWidth: WORLD_VIEW_W,
      worldHeight: WORLD_VIEW_H,
    })
    if (!projection.valid) return
    if (sprite) {
      const playerPoint = projectPoint(projection, visual)
      sprite.style.transform = playerSpriteTransform(playerPoint, visual.facing)
      const gait = locomotionPresentation(visual)
      const reduced = worldRef.current.reduceMotion
      sprite.dataset.moving = visual.moving && !reduced ? 'true' : 'false'
      sprite.style.setProperty('--rpg-body-bob', `${reduced ? 0 : gait.bodyBob * 4.5}px`)
      sprite.style.setProperty('--rpg-body-lean', `${reduced ? 0 : gait.bodyLean * 9}deg`)
      sprite.style.setProperty('--rpg-stride-sway', `${reduced ? 0 : Math.sin(visual.gaitPhase || 0) * 2.2}deg`)
      sprite.style.setProperty('--rpg-shadow-scale', `${reduced ? 1 : gait.shadowScale}`)
      sprite.style.setProperty('--rpg-footfall-alpha', `${reduced || !visual.moving ? 0 : Math.max(0, 0.28 - gait.footLift * 0.25)}`)
    }
    for (const node of worldAnchorRefs.current.values()) {
      const worldPoint = { x: Number(node.dataset.worldX), y: Number(node.dataset.worldY) }
      const screenPoint = projectPoint(projection, worldPoint)
      node.style.left = `${screenPoint.x.toFixed(2)}px`
      node.style.top = `${screenPoint.y.toFixed(2)}px`
      node.hidden = !projectedPointIsVisible(projection, screenPoint)
    }
  }, [])

  useEffect(() => {
    const current = stateRef.current.world
    visualWorldRef.current = createLocomotionPose({ ...current.position, facing: current.facing })
    lastMoveCommitRef.current = 0
    const frame = requestAnimationFrame(() => paintWorldProjection())
    const stage = stageRef.current
    const observer = stage && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => paintWorldProjection())
      : null
    if (observer) observer.observe(stage)
    return () => {
      cancelAnimationFrame(frame)
      if (observer) observer.disconnect()
    }
  }, [started, state.world.mapId, state.status, paintWorldProjection])

  // Newly mounted semantic targets, NPC cutouts, and path markers receive the
  // current live camera immediately without resetting the visual player pose.
  useEffect(() => {
    const frame = requestAnimationFrame(() => paintWorldProjection())
    return () => cancelAnimationFrame(frame)
  }, [moveTarget, panelOpen, skillAction, state.world.mapId, state.status, paintWorldProjection])

  // ─── World movement loop ─────────────────────────────────────
  useEffect(() => {
    if (state.status !== 'playing' || paused || shrineOpen || dialogue || choicePrompt || panelOpen || skillAction) return
    let raf
    let last = performance.now()
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const fx = worldRef.current
      fx.t += 1
      const inp = inputRef.current
      const tch = touchRef.current
      const stateWorld = stateRef.current.world
      const cur = {
        ...stateWorld,
        position: { x: visualWorldRef.current.x, y: visualWorldRef.current.y },
        facing: visualWorldRef.current.facing,
      }
      const map = rpgMapById(cur.mapId)
      let moveX = ((inp.right || tch.right) ? 1 : 0) - ((inp.left || tch.left) ? 1 : 0)
      let moveY = ((inp.down || tch.down) ? 1 : 0) - ((inp.up || tch.up) ? 1 : 0)
      const manualMoving = moveX !== 0 || moveY !== 0
      let waypointDistance = Infinity
      let desiredX = cur.position.x
      let desiredY = cur.position.y
      if (manualMoving && pathRef.current.length) {
        pathRef.current = []
        pendingInteractionRef.current = null
        setMoveTarget(null)
      } else if (!manualMoving && pathRef.current.length) {
        let waypoint = pathRef.current[0]
        waypointDistance = dist(cur.position.x, cur.position.y, waypoint.x, waypoint.y)
        while (waypointDistance <= 3 && pathRef.current.length) {
          pathRef.current.shift()
          waypoint = pathRef.current[0]
          waypointDistance = waypoint ? dist(cur.position.x, cur.position.y, waypoint.x, waypoint.y) : 0
        }
        if (waypoint) {
          moveX = (waypoint.x - cur.position.x) / waypointDistance
          moveY = (waypoint.y - cur.position.y) / waypointDistance
          desiredX = waypoint.x
          desiredY = waypoint.y
        } else {
          setMoveTarget(null)
        }
      }
      if (manualMoving) {
        const magnitude = Math.hypot(moveX, moveY) || 1
        desiredX = cur.position.x + (moveX / magnitude) * WORLD_VIEW_W
        desiredY = cur.position.y + (moveY / magnitude) * WORLD_VIEW_H
      }
      // Dash.
      if (manualMoving && (inp.dash || tch.dash) && !fx.dash.active && now >= (fx.dash.cooldownUntil || 0)) {
        fx.dash.active = true
        fx.dash.until = performance.now() + DASH_MS
        fx.dash.cooldownUntil = performance.now() + DASH_MS + 260
        fx.dash.dirX = moveX !== 0 ? moveX : (cur.facing > 0 ? 1 : -1)
        fx.dash.dirY = moveY
      }
      if (fx.dash.active && now >= fx.dash.until) fx.dash.active = false
      const locomotionConfig = fx.dash.active
        ? {
            ...WORLD_LOCOMOTION_CONFIG,
            walkSpeed: MOVE_SPEED * DASH_MULT,
            acceleration: MOVE_SPEED * DASH_MULT * 12,
            deceleration: MOVE_SPEED * DASH_MULT * 14,
          }
        : WORLD_LOCOMOTION_CONFIG
      if (fx.dash.active) {
        const dashMagnitude = Math.hypot(fx.dash.dirX, fx.dash.dirY) || 1
        desiredX = cur.position.x + (fx.dash.dirX / dashMagnitude) * WORLD_VIEW_W
        desiredY = cur.position.y + (fx.dash.dirY / dashMagnitude) * WORLD_VIEW_H
      }
      let nextPose = stepLocomotion(visualWorldRef.current, {
        desiredX,
        desiredY,
        dt,
        maxDistance: manualMoving ? Infinity : waypointDistance,
        config: locomotionConfig,
      })
      const routeStateId = routeStateForMap(stateRef.current, map)
      const pos = clampToWorld(nextPose, map, routeStateId)
      const collisionStopped = pos.x !== nextPose.x || pos.y !== nextPose.y
      if (collisionStopped) {
        nextPose = {
          ...nextPose,
          x: pos.x,
          y: pos.y,
          vx: 0,
          vy: 0,
          moving: false,
          stride: 0,
          lean: 0,
        }
      }
      const stoppedMoving = Boolean(fx.moving) && !nextPose.moving
      fx.moving = nextPose.moving
      fx.walkPhase = nextPose.gaitPhase
      if (
        nextPose.x !== cur.position.x
        || nextPose.y !== cur.position.y
        || nextPose.facing !== cur.facing
        || nextPose.moving !== visualWorldRef.current.moving
      ) {
        visualWorldRef.current = nextPose
        paintWorldProjection(visualWorldRef.current)
      }
      const pathFinished = !manualMoving && !pathRef.current.length
      const visual = visualWorldRef.current
      const reducerBehindVisual = stateWorld.position.x !== visual.x
        || stateWorld.position.y !== visual.y
        || stateWorld.facing !== visual.facing
      if (reducerBehindVisual && shouldCommitMovement(lastMoveCommitRef.current, now, stoppedMoving || pathFinished)) {
        lastMoveCommitRef.current = now
        dispatch({ type: 'MOVE', x: visual.x, y: visual.y, facing: visual.facing }, { persist: false })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [state.status, state.world.mapId, paused, shrineOpen, dialogue, choicePrompt, panelOpen, skillAction, dispatch, paintWorldProjection])

  // Keep movement-free during dialogue/shrine (input loop stops above).

  // ─── Keyboard ────────────────────────────────────────────────
  useEffect(() => {
    const down = (e) => {
      const k = e.key.toLowerCase()
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k) || k === 'w' || k === 'a' || k === 's' || k === 'd') {
        // don't prevent default for page scroll on arrows if not needed
      }
      const combatInputReady = stateRef.current.status !== 'in-combat' || combatReadyRef.current
      const movementActive = started
        && !pausedRef.current
        && combatInputReady
        && (stateRef.current.status === 'playing' || stateRef.current.status === 'in-combat')
        && !dialogueRef.current
        && !shrineOpenRef.current
        && !choicePromptRef.current
        && !panelOpenRef.current
        && !skillAction
      if (MOVEMENT_KEYS.has(k)) {
        if (movementActive) keysRef.current.add(k)
        else keysRef.current.delete(k)
        syncKeyboardInput()
      }
      if (stateRef.current.status === 'in-combat') {
        if (e.key === 'Escape') {
          setPaused(true)
          return
        }
        // The ready gate owns the pre-fight state. Escape, held movement, and
        // attack hotkeys cannot arm or queue work behind it. Pause may still
        // cover the staged scene, but Resume returns to the unarmed gate.
        if (!combatReadyRef.current) return
        if (k === 'enter' || k === 'j') {
          queueCombatAction({ attack: true })
          return
        }
        const powerIndex = k === 'k' ? 0 : k === 'l' ? 1 : k === ';' ? 2 : -1
        if (powerIndex >= 0) {
          const loadout = powersForGod(stateRef.current.protagonist.activePatronId)
          if (loadout[powerIndex]) queueCombatAction({ powerId: loadout[powerIndex] })
          return
        }
      }
      if (stateRef.current.status === 'in-dialogue') {
        if (e.key === 'Escape') {
          const current = dialogueRef.current
          if (!current || !conversationRequiredChoicesMet(stateRef.current, current.convo)) return
          setDialogue(null)
          dispatch({ type: 'DIALOGUE_END', conversationId: current?.id, npcId: current?.npcId })
        }
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') advanceDialogue()
        return
      }
      if (panelOpenRef.current) {
        if (e.key === 'Escape') closePanel()
        return
      }
      if (stateRef.current.status === 'playing' && k === 'e') {
        doInteract()
        return
      }
      if (shrineOpenRef.current) {
        if (e.key === 'Escape') setShrineOpen(false)
        return
      }
      if (choicePromptRef.current) {
        if (e.key === 'Escape') setChoicePrompt(null)
        return
      }
      if (e.key === 'Escape') {
        if (stateRef.current.status === 'playing') { setPaused(true) }
        else if (stateRef.current.status === 'paused') { setPaused(false) }
        return
      }
    }
    const up = (e) => {
      keysRef.current.delete(e.key.toLowerCase())
      syncKeyboardInput()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      clearTransientInput()
    }
  }, [dispatch, queueCombatAction, syncKeyboardInput, clearTransientInput, closePanel, started, skillAction])

  // Modal/non-playable states do not need input polling or retained movement.
  // Input is event-driven above, so there is no background 16 ms interval.
  useEffect(() => {
    const active = started && !paused && (
      (state.status === 'in-combat' && combatReady)
      || (state.status === 'playing' && !shrineOpen && !dialogue && !choicePrompt && !panelOpen && !skillAction)
    )
    if (!active) clearTransientInput()
  }, [started, state.status, paused, combatReady, shrineOpen, dialogue, choicePrompt, panelOpen, skillAction, clearTransientInput])

  const advanceDialogue = useCallback(() => {
    const dlg = dialogueRef.current
    if (!dlg) return
    const node = dlg.node
    if (node.choices?.length) return
    if (node.next) {
      const nextNode = dlg.convo.nodes[node.next]
      setDialogue({ ...dlg, node: nextNode, index: dlg.index + 1 })
    } else {
      setDialogue(null)
      dispatch({ type: 'DIALOGUE_END', conversationId: dlg.id, npcId: dlg.npcId })
    }
  }, [dispatch])

  const startConversation = useCallback((npc) => {
    // Stable authored metadata resolves main/default scenes before any active
    // optional multi-speaker contribution. Display text is never consulted.
    const convoId = resolveConversationId(stateRef.current, npc)
    const convo = rpgConversationById(convoId)
    if (!convo) {
      // Acts III–IV intentionally ship objective-authored testimony before a
      // full cinematic line graph. The reducer still validates the exact NPC
      // and objective IDs, so this is a playable witnessed interaction rather
      // than a guessed progression shortcut.
      dispatch({ type: 'TALK', npcId: npc.id, conversationId: convoId })
      setSaveNote(`${npc.name} has added their testimony to the record.`)
      return
    }
    // Dialogue presentation is local UI state and cannot be reconstructed from
    // the v1 boundary save, so persist only after DIALOGUE_END.
    dispatch({ type: 'TALK', npcId: npc.id, conversationId: convoId }, { persist: false })
    setDialogue({ id: convoId, convo, node: convo.nodes[convo.start], index: 0, npcId: npc.id })
  }, [dispatch])

  const beginEncounter = useCallback((encounterId) => {
    const st = stateRef.current
    const enc = rpgEncounterById(encounterId)
    if (!enc || !st.protagonist.activePatronId) {
      setSaveNote('Choose a patron at the shrine first.')
      return
    }
    // Story combat has two consumers of the same transition: the RPG reducer
    // owns progression/checkpoints, while the adapter owns the visual arena.
    // Validate the reducer transition first so a gated, cleared, wrong-map, or
    // otherwise premature encounter can never create an orphan arena session.
    const candidate = applyEvent(st, { type: 'ENTER_ENCOUNTER', encounterId })
    if (
      candidate === st
      || candidate.status !== 'in-combat'
      || candidate.combatSnapshot?.encounterId !== encounterId
    ) {
      setSaveNote('That encounter is not available yet.')
      return
    }
    const s = startEncounter(candidate, encounterId)
    if (!s) {
      setSaveNote('This encounter cannot begin safely.')
      return
    }
    dispatch({ type: 'ENTER_ENCOUNTER', encounterId }, { persist: false })
    setCombatReady(false)
    setPaused(false)
    setSession(s)
    setCombatEnd(null)
  }, [dispatch])

  const beginWildernessCombat = useCallback(({ enemyId, encounterKey }) => {
    const st = stateRef.current
    const nextSession = startWildernessEncounter(st, { enemyId, encounterKey })
    if (!nextSession) {
      setSaveNote(st.protagonist.activePatronId
        ? 'This wilderness encounter cannot begin safely.'
        : 'Choose a patron at a shrine before entering wilderness combat.')
      return
    }
    dispatch({ type: 'WILDERNESS_COMBAT_START', enemyId, encounterKey }, { persist: false })
    setPanelOpen(null)
    setCombatReady(false)
    setPaused(false)
    setCombatEnd(null)
    setSession(nextSession)
  }, [dispatch])

  // ─── Interaction detection (E / tap) ─────────────────────────
  const nearestInteractable = useCallback(() => {
    const map = rpgMapById(stateRef.current.world.mapId)
    if (!map) return null
    const p = stateRef.current.world.position
    const candidates = []
    for (const ent of map.entities || []) {
      const distance = dist(p.x, p.y, ent.x, ent.y)
      if (distance < 60) candidates.push({ kind: 'entity', ent, distance })
    }
    for (const ex of map.exits || []) {
      const distance = dist(p.x, p.y, ex.x, ex.y)
      if (distance < 60) candidates.push({ kind: 'exit', ex, distance })
    }
    return candidates.sort((a, b) => a.distance - b.distance)[0] || null
  }, [])

  const interactWith = useCallback((near) => {
    const st = stateRef.current
    if (st.status !== 'playing' || !near) return
    if (near.kind === 'entity') {
      const ent = near.ent
      if (ent.kind === 'resource') {
        const node = resourceNodeStatus({
          resources: st.resources,
          mapId: st.world.mapId,
          entityId: ent.id,
          capacity: ent.capacity,
          respawnTicks: ent.respawnTicks,
          playtimeTicks: st.playtimeTicks,
        })
        if (!node?.available) {
          const seconds = Math.max(1, Math.ceil((node?.waitTicks || 0) / TICK_RATE))
          setSaveNote(`${ent.name} is depleted. It renews in about ${seconds} seconds of active play.`)
          return
        }
        const xp = st.progression.skills?.[ent.skillId]?.xp || 0
        const level = levelForXp(xp)
        if (level < (ent.level || 1)) {
          setSaveNote(`${ent.name} requires ${SKILL_DEFS.find((skill) => skill.id === ent.skillId)?.name || ent.skillId} level ${ent.level}.`)
          return
        }
        if ((st.inventory.slots?.length || 0) >= (st.inventory.capacity || 28)) {
          setSaveNote('Your backpack is full. Bank or use an item first.')
          return
        }
        setSkillAction({ entityId: ent.id, name: ent.name, itemId: ent.itemId, skillId: ent.skillId, duration: 850 })
      } else if (ent.kind === 'bank') {
        setPanelOpen('bank')
      } else if (ent.kind === 'shop') {
        dispatch({ type: 'OPEN_SHOP', shopId: ent.shopId }, { persist: false })
        if (stateRef.current.economy?.openShopId === ent.shopId) setPanelOpen('shop')
      } else if (ent.kind === 'shrine') {
        setShrineOpen(true)
        dispatch({ type: 'INTERACT', entityId: ent.id }, { persist: false })
      } else if (ent.kind === 'npc') {
        startConversation(ent)
      } else if (ent.kind === 'marker') {
        dispatch({ type: 'REACH', mapId: st.world.mapId, markerId: ent.id })
      } else if (ent.kind === 'choice') {
        const objective = currentObjective(st)
        const allowed = objective?.kind === 'choose'
          ? (ent.choiceIds || []).filter((id) => objective.choiceIds?.includes(id) && choiceIsAvailable(st, id))
          : []
        if (allowed.length) setChoicePrompt({ entityId: ent.id, title: ent.name, choiceIds: allowed, options: ent.options || [] })
      } else if (['interact', 'tide-well', 'season-altar', 'pressure-valve', 'witness', 'pressure-shell', 'rope-lift', 'travel-node'].includes(ent.kind)) {
        dispatch({ type: 'INTERACT', entityId: ent.id })
      }
    } else if (near.kind === 'exit') {
      const ex = near.ex
      if (ex.kind === 'combat') {
        beginEncounter(ex.encounterId)
      } else {
        dispatch({ type: 'TRAVERSE', viaGate: ex.id, toMapId: ex.toMapId, spawnId: ex.spawnId })
      }
    }
  }, [startConversation, dispatch, beginEncounter])

  useEffect(() => {
    if (!skillAction) return undefined
    const timer = window.setTimeout(() => {
      const before = carriedItemQuantity(stateRef.current.inventory, skillAction.itemId, ALL_ITEM_DEFS)
      dispatch({ type: 'GATHER', entityId: skillAction.entityId })
      const after = carriedItemQuantity(stateRef.current.inventory, skillAction.itemId, ALL_ITEM_DEFS)
      setSaveNote(after > before
        ? `${ALL_ITEM_DEFS[skillAction.itemId]?.name || skillAction.name} added to your backpack. The node is now depleted.`
        : `${skillAction.name} could not be harvested.`)
      setSkillAction(null)
    }, skillAction.duration)
    return () => window.clearTimeout(timer)
  }, [skillAction, dispatch])

  const doInteract = useCallback(() => {
    interactWith(nearestInteractable())
  }, [interactWith, nearestInteractable])

  const beginWorldPath = useCallback((map, goal, target = null) => {
    const focus = stateRef.current.world.position
    if (target && dist(focus.x, focus.y, goal.x, goal.y) < WORLD_INTERACTION_RADIUS) {
      pathRef.current = []
      pendingInteractionRef.current = null
      setMoveTarget(null)
      interactWith(target)
      return
    }
    const path = findWorldPath(map, focus, goal, { routeStateId: routeStateForMap(stateRef.current, map) })
    const endpoint = path.at(-1)
    // A* may legitimately snap an obstructed goal to its nearest walkable
    // grid cell. That is useful for ground movement, but a semantic target
    // must end inside the same radius that can actually fire its interaction.
    if (!path.length || (target && dist(endpoint.x, endpoint.y, goal.x, goal.y) >= WORLD_INTERACTION_RADIUS)) {
      pathRef.current = []
      pendingInteractionRef.current = null
      setMoveTarget(null)
      setSaveNote('No clear path to that point.')
      return
    }
    pathRef.current = path
    pendingInteractionRef.current = target
    setMoveTarget(path.at(-1))
    setSaveNote('')
  }, [interactWith])

  const onWorldPointerDown = useCallback((event) => {
    if (event.button !== 0 || stateRef.current.status !== 'playing') return
    const canvas = canvasRef.current
    const map = rpgMapById(stateRef.current.world.mapId)
    if (!canvas || !map) return
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const focus = visualWorldRef.current
    const projection = createWorldProjection({
      focusX: focus.x,
      focusY: focus.y,
      viewportWidth: rect.width,
      viewportHeight: rect.height,
      worldWidth: WORLD_VIEW_W,
      worldHeight: WORLD_VIEW_H,
    })
    if (!projection.valid) return
    const point = unprojectPoint(projection, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
    const candidates = [
      ...(map.entities || []).map((ent) => ({ kind: 'entity', ent, distance: dist(point.x, point.y, ent.x, ent.y) })),
      ...(map.exits || []).map((ex) => ({ kind: 'exit', ex, distance: dist(point.x, point.y, ex.x, ex.y) })),
    ].filter((candidate) => candidate.distance <= (candidate.kind === 'entity' ? 44 : 48))
      .sort((a, b) => a.distance - b.distance)
    const target = candidates[0] || null
    const goal = target?.kind === 'entity'
      ? { x: target.ent.x, y: target.ent.y }
      : target?.kind === 'exit'
        ? { x: target.ex.x, y: target.ex.y }
        : point
    beginWorldPath(map, goal, target)
  }, [beginWorldPath])

  const onWorldTargetClick = useCallback((event, target) => {
    event.stopPropagation()
    const map = rpgMapById(stateRef.current.world.mapId)
    if (!map) return
    const item = target.kind === 'entity' ? target.ent : target.ex
    beginWorldPath(map, { x: item.x, y: item.y }, target)
  }, [beginWorldPath])

  useEffect(() => {
    const pending = pendingInteractionRef.current
    if (!pending || state.status !== 'playing') return
    const map = rpgMapById(state.world.mapId)
    const target = pending.kind === 'entity' ? pending.ent : pending.ex
    if (!map || !target || dist(state.world.position.x, state.world.position.y, target.x, target.y) >= WORLD_INTERACTION_RADIUS) return
    pathRef.current = []
    pendingInteractionRef.current = null
    setMoveTarget(null)
    interactWith(pending)
  }, [state.status, state.world.mapId, state.world.position.x, state.world.position.y, interactWith])

  useEffect(() => {
    pathRef.current = []
    pendingInteractionRef.current = null
    setMoveTarget(null)
  }, [state.world.mapId, state.status, dialogue, shrineOpen, choicePrompt, panelOpen, skillAction])

  // ─── Combat loop ─────────────────────────────────────────────
  useEffect(() => {
    if (!session || session.settled || paused || !combatReady) return
    let raf
    // Timing begins here, after the explicit ready action. No time accumulated
    // while the encounter staged can enter this fresh accumulator.
    let last = performance.now()
    let acc = 0
    const tick = (now) => {
      acc = Math.min(acc + (now - last), 250)
      last = now
      const steps = Math.floor(acc / (1000 / TICK_RATE))
      if (steps > 0) {
        acc -= steps * (1000 / TICK_RATE)
        let cur = sessionRef.current
        for (let i = 0; i < steps; i++) {
          const touch = touchRef.current
          const moveX = ((inputRef.current.right || touch.right) ? 1 : 0) - ((inputRef.current.left || touch.left) ? 1 : 0)
          const moveY = ((inputRef.current.down || touch.down) ? 1 : 0) - ((inputRef.current.up || touch.up) ? 1 : 0)
          const action = combatActionRef.current
          const inp = {
            ...inputRef.current,
            moveX,
            moveY,
            aimX: moveX || Math.cos(cur.arena.deity.facing || 0),
            aimY: moveY || Math.sin(cur.arena.deity.facing || 0),
            firing: pointerDownRef.current,
            attack: action.attack,
            powerId: action.powerId,
          }
          combatActionRef.current = { attack: false, powerId: null }
          const out = stepCombat(cur, inp)
          if (out !== cur) setSession(out)
          cur = out
          if (cur.settled) break
        }
      }
      const fx = arenaFxRef.current
      fx.t += 1
      observeFx(fx, sessionRef.current.arena)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [session && session.encounterId, paused, combatReady])

  // Session boundaries always close the ready gate. beginEncounter and
  // beginWildernessCombat also reset it before installing a new session; this
  // invariant covers settlement and any future external session teardown.
  useEffect(() => {
    if (!session || session.settled || state.status !== 'in-combat') setCombatReady(false)
  }, [state.status, session && session.encounterId, session && session.settled])

  // Exactly-once outcome event → RPG reducer. Persists the post-outcome state
  // (victory or restored checkpoint) so the boundary is saved, not the stale
  // in-combat frame.
  useEffect(() => {
    if (!session || !session.settled) return
    const outcome = session.outcome
    if (combatEndRef.current) return
    const enc = session.encounterId
    if (session.wilderness) {
      if (outcome === OUTCOME_WON) {
        dispatch({
          type: 'WILDERNESS_VICTORY',
          enemyId: session.wilderness.enemyId,
          encounterKey: session.wilderness.encounterKey,
          damageByStyle: { spearcraft: 1 },
        })
      } else if (outcome === OUTCOME_FAILED) {
        dispatch({
          type: 'WILDERNESS_DEFEAT',
          enemyId: session.wilderness.enemyId,
          encounterKey: session.wilderness.encounterKey,
          cause: session.wilderness.enemyName,
        })
      }
      setCombatEnd({ outcome, encounterId: enc, wilderness: session.wilderness, scriptedConversationId: null })
      return
    }
    if (outcome === OUTCOME_WON) {
      dispatch({ type: 'COMBAT_WON', encounterId: enc })
    } else if (outcome === OUTCOME_FAILED) {
      dispatch({ type: 'COMBAT_FAILED', encounterId: enc })
    }
    setCombatEnd({
      outcome,
      encounterId: enc,
      scriptedConversationId: outcome === OUTCOME_WON && session.testimonyInterruptRequired
        ? 'act5-regent-interruption'
        : null,
    })
  }, [session, dispatch])

  // ─── Render world canvas ─────────────────────────────────────
  const worldCanvasAnimating = worldCanvasShouldAnimate({
    started,
    status: state.status,
    paused,
    dialogue,
    shrineOpen,
    choicePrompt,
    panelOpen,
    skillAction,
    combatEnd,
  })
  // Active play reads live refs inside its cadence and must not restart on
  // each 10 Hz reducer commit. Frozen scenes redraw once when their underlying
  // story state changes, then remain still.
  const frozenWorldRevision = worldCanvasAnimating ? null : state
  useEffect(() => {
    if (!started) return
    if (state.status === 'in-combat') return
    const cv = canvasRef.current
    if (!cv) return
    const fit = canvasFitter(cv, WORLD_VIEW_H / WORLD_VIEW_W)
    fit()
    const map = rpgMapById(state.world.mapId)
    const drawFrame = () => {
      const ctx2 = cv.getContext('2d')
      if (!ctx2) return
      const liveState = stateRef.current
      const livePosition = visualWorldRef.current
      ctx2.setTransform(1, 0, 0, 1, 0, 0)
      ctx2.clearRect(0, 0, cv.width, cv.height)
      ctx2.save()
      const focus = livePosition
      const projection = createWorldProjection({
        focusX: focus.x,
        focusY: focus.y,
        viewportWidth: cv.width,
        viewportHeight: cv.height,
        worldWidth: WORLD_VIEW_W,
        worldHeight: WORLD_VIEW_H,
      })
      if (!projection.valid) {
        ctx2.restore()
        return
      }
      ctx2.scale(projection.scale, projection.scale)
      ctx2.translate(-projection.cameraX, -projection.cameraY)
      const routeStateId = routeStateForMap(liveState, map)
      drawWorld(ctx2, {
        map,
        routeStateId,
        // Painted Act I maps use cutout overlays; code-native runtime maps
        // render actors from the visual position ref at a stable 30 Hz.
        state: {
          ...liveState,
          world: {
            ...liveState.world,
            position: { x: livePosition.x, y: livePosition.y },
            facing: livePosition.facing,
          },
          currentObjective: currentObjective(liveState),
          hideWorldActors: Boolean(WORLD_BACKPLATES[map?.id]),
        },
        fx: worldRef.current,
      }, WORLD_VIEW_W, WORLD_VIEW_H)
      ctx2.restore()
    }
    drawFrame()
    paintWorldProjection(visualWorldRef.current)
    let lastDraw = 0
    const animate = (now) => {
      if (now - lastDraw >= 1000 / 30) {
        drawFrame()
        paintWorldProjection(visualWorldRef.current)
        lastDraw = now
      }
      frame = window.requestAnimationFrame(animate)
    }
    let frame = worldCanvasAnimating ? window.requestAnimationFrame(animate) : null
    const onResize = () => {
      if (!fit()) return
      drawFrame()
      paintWorldProjection(visualWorldRef.current)
    }
    let ro = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onResize)
      ro.observe(cv)
    }
    window.addEventListener('resize', onResize)
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      if (ro) ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [
    started,
    state.world.mapId,
    state.status,
    worldCanvasAnimating,
    frozenWorldRevision,
    paintWorldProjection,
  ])

  // ─── Render combat canvas ────────────────────────────────────
  const combatCanvasRef = useRef(null)
  const combatCanvasAnimating = combatCanvasShouldAnimate({
    status: state.status,
    session,
    paused,
    combatEnd,
  })
  useEffect(() => {
    if (state.status !== 'in-combat' || !session) return
    const cv = combatCanvasRef.current
    if (!cv) return
    const fit = canvasFitter(cv, VIEW_H / VIEW_W)
    fit()
    const drawFrame = () => {
      const ctx = cv.getContext('2d')
      if (!ctx) return
      const current = sessionRef.current
      if (current) {
        const level = levelById(current.campaignLevelId)
        draw(ctx, { ...current.arena, level }, arenaFxRef.current, { playerVisual: 'kallias' })
      }
    }
    drawFrame()
    const animate = () => {
      drawFrame()
      rafId = requestAnimationFrame(animate)
    }
    let rafId = combatCanvasAnimating ? requestAnimationFrame(animate) : null
    const onResize = () => {
      if (fit()) drawFrame()
    }
    let ro = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onResize)
      ro.observe(cv)
    }
    window.addEventListener('resize', onResize)
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (ro) ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [state.status, session && session.encounterId, session && session.settled, paused, combatEnd, combatCanvasAnimating])

  // ─── Focus loss → pause ──────────────────────────────────────
  useEffect(() => {
    const suspendForFocusLoss = () => {
      clearTransientInput()
      if (
        stateRef.current.status === 'playing'
        || (stateRef.current.status === 'in-combat' && combatReadyRef.current)
      ) setPaused(true)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' || document.hidden) suspendForFocusLoss()
    }
    window.addEventListener('blur', suspendForFocusLoss)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('blur', suspendForFocusLoss)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      clearTransientInput()
    }
  }, [clearTransientInput])

  // ─── Presentation helpers ────────────────────────────────────
  const obj = currentObjective(state)
  const objLabel = currentObjectiveLabel(state)
  const map = rpgMapById(state.world.mapId)
  const questDef = rpgQuestDefById(state.mainQuestId)
  const actLabel = questDef?.act ? `Act ${romanNumeral(questDef.act)}` : 'Act I'
  const tide = map?.act === 2 ? currentTideState(state) : null
  const worldMechanic = map?.act === 3
    ? { id: state.flags['act3:season-state'] || map.season?.initialStateId || 'winter', label: 'Season' }
    : map?.act === 4
      ? { id: state.flags['act4:pressure-state'] || map.pressure?.initialStateId || 'safe', label: 'Pressure' }
      : null
  const act5Light = act5LightPresentation(state, map)
  const equipmentStats = deriveCombatModifiers(state.inventory.equipment, ALL_ITEM_DEFS)
  const completedAct = questDef?.act || 1
  const nextAct = completedAct < 5 ? completedAct + 1 : null
  const nextRegion = nextAct ? rpgRegionByAct(nextAct) : null
  const transition = nextAct ? ACT_TRANSITIONS[nextAct] : null

  // Honest document title for the RPG route, kept in sync with state.
  useEffect(() => {
    const prev = typeof document !== 'undefined' ? document.title : ''
    if (state.status === 'in-combat' && session) {
      const enc = rpgEncounterById(session.encounterId)
      document.title = enc ? `${enc.title} — Oathbearer` : 'In Combat — Oathbearer'
    } else if (state.status === 'ending') {
      document.title = nextAct
        ? `${transition?.title || nextRegion?.name || `Act ${romanNumeral(nextAct)}`} — Oathbearer`
        : 'The Last Name Witnessed — Oathbearer'
    } else if (map) {
      document.title = `${map.name} — Oathbearer`
    } else {
      document.title = 'Control Tower — Oathbearer'
    }
    return () => { if (prev) document.title = prev }
  }, [state.status, state.world.mapId, session && session.encounterId, map && map.name, nextAct, nextRegion && nextRegion.name, transition && transition.title])

  const prompt = (() => {
    if (state.status === 'in-combat') return ''
    const near = nearestInteractable()
    if (!near) return ''
    if (near.kind === 'entity') return near.ent.label || near.ent.name
    const destination = rpgMapById(near.ex.toMapId)
    return near.ex.label || `Travel to ${destination?.name || near.ex.toMapId}`
  })()

  const activePatron = state.protagonist.activePatronId
    ? PATRON_CARDS.find((c) => c.god.key === state.protagonist.activePatronId) || null
    : null

  // ─── Handlers ────────────────────────────────────────────────
  const doPatron = (godKey) => {
    dispatch({ type: 'CHOOSE_PATRON', godId: godKey })
    setShrineOpen(false)
  }
  const resumeGame = () => { setPaused(false) }
  const equipFromPack = (itemId) => {
    const name = ALL_ITEM_DEFS[itemId]?.name || itemId
    const before = stateRef.current.inventory.equipment
    dispatch({ type: 'EQUIP_ITEM', itemId })
    setSaveNote(stateRef.current.inventory.equipment !== before ? `${name} equipped.` : `${name} could not be equipped.`)
  }
  const unequipToPack = (slot) => {
    const itemId = stateRef.current.inventory.equipment?.[slot]
    const name = ALL_ITEM_DEFS[itemId]?.name || itemId || slot
    const before = stateRef.current.inventory.equipment
    dispatch({ type: 'UNEQUIP_ITEM', slot })
    setSaveNote(stateRef.current.inventory.equipment !== before ? `${name} moved to your backpack.` : `${name} could not be unequipped.`)
  }
  const armCombat = () => {
    const current = sessionRef.current
    if (!current || current.settled || stateRef.current.status !== 'in-combat') return
    // Discard pre-ready key/pointer state, then start from a clean timing frame.
    clearTransientInput()
    setPaused(false)
    setCombatReady(true)
  }

  const canEnterCourt = Boolean(state.protagonist.activePatronId)

  // Objective progress banner (main quest).
  const questProgress = (() => {
    const q = state.quests[state.mainQuestId]
    const def = q && rpgQuestDefById(state.mainQuestId)
    if (!q || !def) return null
    return `${Math.min(q.objectiveIndex, def.objectives.length)} / ${def.objectives.length}`
  })()

  const beginNewStory = () => {
    const store = typeof window !== 'undefined' ? window.localStorage : null
    clearSave(store)
    const fresh = rpgInitial()
    stateRef.current = fresh
    visualWorldRef.current = { ...fresh.world.position, facing: fresh.world.facing }
    setState(fresh)
    setSession(null)
    setCombatReady(false)
    setPaused(false)
    setDialogue(null)
    setShrineOpen(false)
    setCombatEnd(null)
    setSaveError('none')
    flushSave(fresh)
    setStarted(true)
  }

  // ─── Title / continue surface ────────────────────────────────
  if (!started) {
    const errorCopy = SAVE_ERROR_COPY[saveError] || ''
    return (
      <main className="rpg-root rpg-title fixed inset-0 overflow-hidden">
        {/* Kallias as the dominant opening art field (decorative). */}
        <img
          src={PORTRAIT_SOURCES.kallias.large}
          srcSet={PORTRAIT_SOURCES.kallias.srcSet}
          sizes="100vw"
          alt=""
          aria-hidden="true"
          className="rpg-title-img"
        />
        <div className="rpg-title-scrim" aria-hidden="true" />
        <div className="rpg-seam rpg-seam-a" aria-hidden="true" />
        <div className="rpg-seam rpg-seam-b" aria-hidden="true" />
        <div className="rpg-title-content">
          <h1>
            <span className="rpg-title-eyebrow">{'Control Tower — '}</span>
            <span className="rpg-title-name rpg-serif">Oathbearer</span>
          </h1>
          <p className="rpg-title-premise">
            The treaty-stone has broken. Carry a god's power beyond the Veil and restore the name stolen from Asterion Reach.
          </p>
          {errorCopy && (
            <p className="rpg-title-savenote" role="alert">
              {errorCopy} Start a new story to begin again, or continue if the checkpoint loads.
            </p>
          )}
          <div className="rpg-title-actions">
            <button type="button" onClick={beginNewStory} className="rpg-btn rpg-btn-primary rpg-cut">
              New Story
            </button>
            <button
              type="button"
              disabled={!hasStoredSave}
              onClick={() => setStarted(true)}
              className="rpg-btn rpg-btn-secondary rpg-cut"
            >
              Continue
            </button>
          </div>
          {saveError === 'corrupt' && (
            <p className="rpg-title-savenote-soft">
              The corrupted checkpoint will be replaced the next time the story saves.
            </p>
          )}
          <p className="rpg-title-foot">Original mythic action RPG · Saves at shrines and encounters</p>
        </div>
      </main>
    )
  }

  return (
    <div
      className="rpg-root fixed inset-0 flex flex-col overflow-hidden bg-[#0a0f14] text-[#f3e6c8]"
      style={{ colorScheme: 'dark' }}
    >
      {/* ── Top HUD bar: quiet identity — location, act, patron, pause ── */}
      <div className="rpg-hud" data-testid="rpg-hud">
        <div className="rpg-hud-identity">
          <span className="rpg-hud-chip">
            <span className="rpg-hud-act">{actLabel}</span>
            <span className="rpg-hud-dot" aria-hidden="true">·</span>
            <span className="rpg-hud-loc">{map ? map.name : ''}</span>
          </span>
          {activePatron && (
            <span className="rpg-patron-chip" title={activePatron.god.name}>
              {activePatron.god.name}
            </span>
          )}
          {tide && (
            <span className="rpg-tide-chip" data-tide={tide.id} aria-label={`Tide state: ${tide.telegraph.label}`}>
              <span aria-hidden="true">{tideGlyph(tide.id)}</span>
              {tide.telegraph.label}
            </span>
          )}
          {worldMechanic && (
            <span className="rpg-tide-chip" data-state={worldMechanic.id} aria-label={`${worldMechanic.label}: ${worldMechanic.id}`}>
              <span aria-hidden="true">◇</span>
              {worldMechanic.label}: {worldMechanic.id}
            </span>
          )}
          {act5Light && (
            <span
              className="rpg-tide-chip"
              data-light-state={act5Light.id}
              data-shape-glyph={act5Light.shapeGlyph}
              aria-label={`Light polarity: ${act5Light.label}. Shape glyph: ${act5Light.shapeGlyph}.`}
            >
              <span aria-hidden="true">{act5Light.glyph}</span>
              {act5Light.label}
            </span>
          )}
        </div>
        <div className="rpg-hud-actions" aria-label="Story controls">
          {state.status === 'playing' && (
            <>
              <button type="button" aria-pressed={panelOpen === 'skills'} onClick={() => toggleRecordPanel('skills')} className="rpg-hud-btn">Skills</button>
              <button type="button" aria-pressed={panelOpen === 'inventory'} onClick={() => toggleRecordPanel('inventory')} className="rpg-hud-btn">Pack</button>
              <button type="button" aria-pressed={panelOpen === 'quests'} onClick={() => toggleRecordPanel('quests')} className="rpg-hud-btn">Journal</button>
              <button type="button" aria-pressed={panelOpen === 'systems'} onClick={() => toggleRecordPanel('systems')} className="rpg-hud-btn">Systems</button>
            </>
          )}
          <button
            type="button"
            onClick={() => setPaused(true)}
            className="rpg-hud-btn"
          >
            Pause
          </button>
        </div>
        {state.status === 'playing' && objLabel && (
          <div className="rpg-hud-objective">
            <div className="rpg-objective">
              <span className="rpg-objective-tag">Objective</span>
              <span aria-live="polite" className="rpg-objective-text">{objLabel}</span>
            </div>
            <div className="rpg-control-hint">Click ground to walk · WASD to steer · Click a target to approach and act</div>
          </div>
        )}
      </div>

      {/* ── Stage ── */}
      <div ref={stageRef} className="relative h-full w-full">
        {state.status !== 'in-combat' && map && WORLD_BACKPLATES[map.id] && (
          <img
            src={WORLD_BACKPLATES[map.id]}
            alt=""
            aria-hidden="true"
            draggable="false"
            decoding="async"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        )}
        {state.status === 'in-combat' ? (
          <canvas
            ref={combatCanvasRef}
            aria-label={`${session?.wilderness?.enemyName || rpgEncounterById(session?.encounterId)?.title || 'Encounter'} combat view`}
            data-arena-tick={session?.arena?.tick ?? 0}
            data-arena-health={session?.arena?.deity?.health ?? 0}
            data-combat-ready={combatReady ? 'true' : 'false'}
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <canvas
            ref={canvasRef}
            aria-label={`${map ? map.name : 'Story world'} exploration view`}
            aria-description="Click or tap the ground to move. Click or tap a person, object, or gate to approach and interact."
            data-player-x={Math.round(state.world.position.x)}
            data-player-y={Math.round(state.world.position.y)}
            onPointerDown={onWorldPointerDown}
            className="absolute inset-0 z-[1] h-full w-full cursor-crosshair touch-none"
          />
        )}

        {state.status === 'playing' && moveTarget && (
          <span
            ref={(node) => registerWorldAnchor('move-target', node)}
            aria-hidden="true"
            data-world-x={moveTarget.x}
            data-world-y={moveTarget.y}
            className="rpg-move-marker pointer-events-none absolute z-[3]"
            style={{ left: '-9999px', top: '-9999px' }}
          />
        )}

        {state.status === 'playing' && map && !panelOpen && !skillAction && (
          <div className="pointer-events-none absolute inset-0 z-[4]" aria-label="World targets">
            {(map.entities || []).map((ent) => {
              const node = ent.kind === 'resource' ? resourceNodeStatus({
                resources: state.resources,
                mapId: map.id,
                entityId: ent.id,
                capacity: ent.capacity,
                respawnTicks: ent.respawnTicks,
                playtimeTicks: state.playtimeTicks,
              }) : null
              const depleted = node && !node.available
              const baseLabel = ent.accessibleLabel || ent.label || ent.name || `Interact with ${ent.id}`
              const label = depleted
                ? `Depleted: ${baseLabel}. Renews in about ${Math.max(1, Math.ceil(node.waitTicks / TICK_RATE))} seconds of active play.`
                : baseLabel
              return (
                <button
                  key={`entity:${ent.id}`}
                  ref={(element) => registerWorldAnchor(`entity:${ent.id}`, element)}
                  type="button"
                  aria-label={label}
                  data-world-x={ent.x}
                  data-world-y={ent.y}
                  data-resource-state={node ? (depleted ? 'depleted' : 'available') : undefined}
                  className={`rpg-world-target${depleted ? ' is-depleted' : ''}`}
                  style={{ left: '-9999px', top: '-9999px' }}
                  onClick={(event) => onWorldTargetClick(event, { kind: 'entity', ent, distance: 0 })}
                >
                  <span aria-hidden="true" className="rpg-world-target-reticle" />
                </button>
              )
            })}
            {(map.exits || []).map((ex) => (
              <button
                key={`exit:${ex.id}`}
                ref={(node) => registerWorldAnchor(`exit:${ex.id}`, node)}
                type="button"
                aria-label={ex.accessibleLabel || ex.label || `Travel through ${ex.id}`}
                data-world-x={ex.x}
                data-world-y={ex.y}
                className="rpg-world-target"
                style={{ left: '-9999px', top: '-9999px' }}
                onClick={(event) => onWorldTargetClick(event, { kind: 'exit', ex, distance: 0 })}
              >
                <span aria-hidden="true" className="rpg-world-target-reticle" />
              </button>
            ))}
          </div>
        )}

        {state.status !== 'in-combat' && map && WORLD_BACKPLATES[map.id] && (
          <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden" aria-hidden="true">
            {(map.entities || []).filter((entity) => entity.kind === 'npc' && WORLD_ACTOR_SPRITES[entity.id]).map((entity) => (
              <img
                key={entity.id}
                ref={(node) => registerWorldAnchor(`actor:${entity.id}`, node)}
                src={WORLD_ACTOR_SPRITES[entity.id]}
                alt=""
                draggable="false"
                decoding="async"
                data-world-x={entity.x}
                data-world-y={entity.y}
                className="rpg-world-sprite rpg-world-sprite-npc"
                style={{ left: '-9999px', top: '-9999px' }}
              />
            ))}
            <div
              ref={playerSpriteRef}
              aria-hidden="true"
              data-testid="kallias-world-sprite"
              data-moving="false"
              className="rpg-world-sprite rpg-world-player"
              style={{
                left: 0,
                top: 0,
              }}
            >
              <span className="rpg-player-shadow" />
              <span className="rpg-player-footfall rpg-player-footfall-left" />
              <span className="rpg-player-footfall rpg-player-footfall-right" />
              <img
                src={kalliasWorldSprite}
                alt=""
                draggable="false"
                decoding="async"
                className="rpg-world-sprite-player"
              />
            </div>
          </div>
        )}

        {panelOpen && state.status === 'playing' && (
          <section className="rpg-side-panel" aria-label={`${panelOpen === 'inventory' ? 'Backpack' : panelOpen === 'bank' ? 'Storehouse bank' : panelOpen === 'shop' ? 'Merchant trade' : panelOpen.charAt(0).toUpperCase() + panelOpen.slice(1)} panel`}>
            <div className="rpg-side-panel-head">
              <div>
                <div className="rpg-side-kicker">Oathbearer record</div>
                <h2 className="rpg-serif">{panelOpen === 'inventory' ? 'Backpack' : panelOpen === 'quests' ? 'Quest Journal' : panelOpen === 'bank' ? 'Beacon Storehouse' : panelOpen === 'shop' ? 'Myrrine’s Provision Table' : panelOpen === 'systems' ? 'Wilderness & Crafting' : 'Skills'}</h2>
              </div>
              <button type="button" aria-label={`Close ${panelOpen} panel`} onClick={closePanel} className="rpg-panel-close">×</button>
            </div>

            {panelOpen === 'skills' && (() => {
              const totalLevel = SKILL_DEFS.reduce((sum, skill) => sum + levelForXp(state.progression.skills?.[skill.id]?.xp || 0), 0)
              return (
                <>
                  <div className="rpg-skill-total"><span>Total level</span><strong>{totalLevel}</strong><small>{state.progression.totalXp || 0} XP</small></div>
                  <div className="rpg-skill-grid">
                    {SKILL_DEFS.map((skill) => {
                      const xp = state.progression.skills?.[skill.id]?.xp || 0
                      const level = levelForXp(xp)
                      const floor = xpForLevel(level)
                      const ceiling = level >= 99 ? floor : xpForLevel(level + 1)
                      const percent = level >= 99 ? 100 : Math.round((xp - floor) / Math.max(1, ceiling - floor) * 100)
                      return (
                        <div key={skill.id} className="rpg-skill" title={skill.description}>
                          <div><span>{skill.name}</span><strong>{level}</strong></div>
                          <div className="rpg-skill-bar"><span style={{ width: `${percent}%` }} /></div>
                          <small>{xp.toLocaleString()} XP</small>
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            })()}

            {panelOpen === 'inventory' && (
              <>
                <div className="rpg-equipment-ledger" aria-label="Equipped gear">
                  <div className="rpg-equipment-stats">
                    <strong>Combat loadout</strong>
                    <span>Damage ×{equipmentStats.attackDamageMultiplier.toFixed(2)}</span>
                    <span>Incoming ×{equipmentStats.incomingDamageMultiplier.toFixed(2)}</span>
                    <span>Health +{equipmentStats.maxHealthBonus}</span>
                  </div>
                  <div className="rpg-equipment-grid">
                    {EQUIPMENT_SLOTS.map((slot) => {
                      const itemId = state.inventory.equipment?.[slot]
                      const item = ALL_ITEM_DEFS[itemId]
                      return (
                        <div key={slot} className="rpg-equipment-slot" data-equipment-slot={slot}>
                          <span>
                            <b>{slot === 'weapon' ? 'Primary' : slot === 'body' ? 'Body' : slot}</b>{' '}
                            {item?.name || 'Empty'}
                          </span>
                          {item && (
                            <button type="button" onClick={() => unequipToPack(slot)} aria-label={`Unequip ${item.name}`}>
                              Unequip
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="rpg-inventory-summary"><span>{state.inventory.slots?.length || 0} / {state.inventory.capacity || 28} slots</span><span>{state.inventory.currency || 0} drachmae</span></div>
                <div className="rpg-inventory-grid" aria-label="28 slot inventory">
                  {Array.from({ length: state.inventory.capacity || 28 }, (_, index) => {
                    const entry = state.inventory.slots?.[index]
                    const item = entry && ALL_ITEM_DEFS[entry.itemId]
                    const itemLabel = item ? `${item.name}, ${item.category}, quantity ${entry.quantity}` : 'Empty slot'
                    return (
                      <div
                        key={index}
                        className="rpg-inventory-slot"
                        title={itemLabel}
                        aria-label={item ? itemLabel : undefined}
                        data-item-id={item?.id}
                        data-item-category={item?.category}
                        data-item-quantity={entry?.quantity}
                      >
                        {item ? <>
                          <span aria-hidden="true">{item.category === 'food' ? '◒' : item.category === 'ore' ? '◆' : item.category === 'wood' ? '╱' : item.category === 'armor' ? '⬡' : item.category === 'weapon' ? '†' : '◇'}</span>
                          <small>{item.name}</small>
                          {entry.quantity > 1 && <b>{entry.quantity}</b>}
                          {item.equipmentSlot && (() => {
                            const decision = equipmentDecision(state.inventory, item.id, ALL_ITEM_DEFS)
                            return (
                              <button
                                type="button"
                                className="rpg-item-action"
                                disabled={!decision.allowed}
                                onClick={() => equipFromPack(item.id)}
                                aria-label={`Equip ${item.name}`}
                              >
                                Equip
                              </button>
                            )
                          })()}
                        </> : null}
                      </div>
                    )
                  })}
                </div>
                <p className="rpg-panel-note">Materials use physical slots. Stackable currencies and quest records do not consume gathering space.</p>
              </>
            )}

            {panelOpen === 'quests' && (
              <div className="rpg-quest-list">
                {Object.entries(state.quests).map(([id, progress]) => {
                  const def = rpgQuestDefById(id)
                  const current = def?.objectives?.[progress.objectiveIndex]
                  return (
                    <article key={id} className={`rpg-quest-entry ${id === state.mainQuestId ? 'is-main' : ''}`}>
                      <div><span>{id === state.mainQuestId ? 'Main oath' : 'Side oath'}</span><strong>{questName(id)}</strong></div>
                      <p>{progress.state === 'completed' ? 'Completed' : current?.text || currentObjectiveLabel({ ...state, mainQuestId: id }) || 'Available'}</p>
                      <small>{Math.min(progress.objectiveIndex, def?.objectives?.length || 0)} / {def?.objectives?.length || 0} objectives</small>
                    </article>
                  )
                })}
              </div>
            )}

            {panelOpen === 'bank' && (
              <>
                <div className="rpg-inventory-summary"><span>{state.inventory.bank?.slots?.length || 0} / {state.inventory.bank?.capacity || 400} bank slots</span><span>{state.inventory.slots?.length || 0} / {state.inventory.capacity || 28} carried</span></div>
                <button type="button" className="rpg-btn rpg-btn-secondary w-full" onClick={() => dispatch({ type: 'BANK_DEPOSIT_MATERIALS' })}>Deposit all materials</button>
                <div className="rpg-bank-list" aria-label="Carried items available to deposit">
                  {(state.inventory.slots || []).map((entry, index) => {
                    const item = ALL_ITEM_DEFS[entry.itemId]
                    const itemName = item?.name || entry.itemId
                    return (
                      <div key={`${entry.itemId}:${index}`} className="rpg-bank-entry">
                        <div><strong>{itemName}</strong><small>{entry.quantity} carried</small></div>
                        <button
                          type="button"
                          aria-label={`Deposit 1 ${itemName}`}
                          onClick={() => dispatch({ type: 'BANK_DEPOSIT', itemId: entry.itemId, quantity: 1 })}
                        >
                          Deposit 1
                        </button>
                      </div>
                    )
                  })}
                </div>
                <div className="rpg-bank-list" aria-label="Banked materials">
                  {(state.inventory.bank?.slots || []).length === 0 ? (
                    <p className="rpg-panel-note">No materials banked. Gather thyme, olive timber, copper, or fish, then deposit them here.</p>
                  ) : (state.inventory.bank.slots.map((entry) => {
                    const item = ALL_ITEM_DEFS[entry.itemId]
                    const itemName = item?.name || entry.itemId
                    const itemLabel = `${itemName}, ${item?.category || 'item'}, quantity ${entry.quantity} banked`
                    return (
                      <div
                        key={entry.itemId}
                        className="rpg-bank-entry"
                        title={itemLabel}
                        aria-label={itemLabel}
                        data-item-id={entry.itemId}
                        data-item-category={item?.category}
                        data-item-quantity={entry.quantity}
                      >
                        <div><strong>{itemName}</strong><small>{entry.quantity} banked</small></div>
                        <button type="button" onClick={() => dispatch({ type: 'BANK_WITHDRAW', itemId: entry.itemId, quantity: 1 })}>Withdraw 1</button>
                      </div>
                    )
                  }))}
                </div>
              </>
            )}

            {panelOpen === 'systems' && (
              <RPGSystemsPanel
                state={state}
                dispatch={dispatch}
                onEngageEnemy={state.protagonist.activePatronId ? beginWildernessCombat : undefined}
              />
            )}

            {panelOpen === 'shop' && (
              <RPGShopPanel state={state} dispatch={dispatch} />
            )}
          </section>
        )}

        {skillAction && state.status === 'playing' && (
          <div className="rpg-skill-action" role="status" aria-live="polite">
            <span>{SKILL_DEFS.find((skill) => skill.id === skillAction.skillId)?.name}</span>
            <strong>{skillAction.name}</strong>
            <div><i style={{ animationDuration: `${skillAction.duration}ms` }} /></div>
          </div>
        )}

        {/* Patron kit readout (full names stay in the DOM). */}
        {state.status === 'playing' && activePatron && (
          <div className="pointer-events-none absolute bottom-2 left-2 z-10 max-w-[46%]">
            <div className="rpg-hud-chip text-[10px] text-[#b8a888]">
              <span className="font-bold uppercase tracking-wide text-[#e8b64c]">{activePatron.god.name}:</span>{' '}
              {activePatron.loadout.map((p) => p.name).join(' · ')}
            </div>
          </div>
        )}

        {/* Combat HUD */}
        {state.status === 'in-combat' && session && (
          <div
            className="pointer-events-none absolute inset-x-0 top-12 z-10 flex flex-col gap-1 p-2"
            data-testid="combat-hud"
            data-arena-tick={session.arena.tick}
            data-arena-health={session.arena.deity.health}
            data-combat-ready={combatReady ? 'true' : 'false'}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#e8b64c]">
                {session.wilderness?.enemyName || rpgEncounterById(session.encounterId)?.title || 'Encounter'}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[#b8a888]">
                {(() => { const p = arenaProgress(session); return `${p.defeated} defeated / ${p.total}` })()}
              </div>
            </div>
            {sessionPhaseLabel(session) && (
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#d8c7a3]" aria-live="polite">
                {sessionPhaseLabel(session)}
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full border border-[#2a2318] bg-[#0b0a06]/80">
                <div
                  className="h-full bg-gradient-to-r from-[#8f3d1e] to-[#e8b64c] transition-all"
                  style={{ width: `${Math.max(0, Math.round(arenaHealth(session) * 100))}%` }}
                />
              </div>
              {sessionEliteName(session) && (
                <div className="rounded border border-[#7a5a1e] bg-[#0b0a06]/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#e8b64c]">
                  {sessionEliteName(session)}
                </div>
              )}
            </div>
          </div>
        )}

        {state.status === 'in-combat' && session && !combatEnd && (
          <div className="pointer-events-auto absolute inset-x-0 bottom-3 z-10 flex flex-wrap items-end justify-end gap-2 pl-[178px] pr-3 md:justify-center md:px-3" aria-label="Combat controls">
            <button type="button" aria-label="Melee attack" disabled={!combatReady} onPointerDown={() => queueCombatAction({ attack: true })} className="min-h-12 rounded border border-[#e8b64c] bg-[#7d2b1f]/95 px-5 py-2 text-xs font-bold uppercase tracking-widest text-[#fff1d0] disabled:cursor-not-allowed disabled:opacity-40">
              Attack <span className="ml-1 text-[9px] text-[#e8c995]">J</span>
            </button>
            {activePatron?.loadout.map((power, index) => {
              const ready = powerReady(session.arena, power.id)
              const hotkey = ['K', 'L', ';'][index] || ''
              return (
                <button key={power.id} type="button" disabled={!combatReady || !ready} onPointerDown={() => queueCombatAction({ powerId: power.id })} className="min-h-12 max-w-[150px] rounded border border-[#5a4a2a] bg-[#1d2633]/95 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-[#f3e6c8] disabled:cursor-not-allowed disabled:opacity-40">
                  {power.name} {hotkey && <span className="ml-1 text-[9px] text-[#e8b64c]">{hotkey}</span>}
                </button>
              )
            })}
          </div>
        )}

        {state.status === 'in-combat' && session && !session.settled && !combatEnd && !combatReady && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
            <div role="dialog" aria-label="Encounter ready" className="rpg-panel rpg-cut pointer-events-auto w-full max-w-sm p-5 text-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#a5761f]">Encounter ready</div>
              <h2 className="rpg-serif mt-1 text-2xl text-[#f3e6c8]">
                {session.wilderness?.enemyName || rpgEncounterById(session.encounterId)?.title || 'Stand and fight'}
              </h2>
              <p className="my-3 text-sm text-[#b8a888]">The encounter is frozen until you begin.</p>
              <button type="button" autoFocus onClick={armCombat} className="rpg-btn rpg-btn-primary min-h-12 w-full">
                Begin encounter
              </button>
            </div>
          </div>
        )}

        {/* Interaction prompt */}
        {prompt && state.status === 'playing' && !dialogue && !shrineOpen && !choicePrompt && (
          <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded border border-[#e8b64c]/50 bg-[#0b0a06]/85 px-3 py-1.5 text-center text-xs text-[#f3e6c8]">
            <span className="mr-2 inline-block rounded bg-[#e8b64c] px-1.5 text-[10px] font-bold uppercase text-[#131c26]">E</span>
            {prompt}
          </div>
        )}
      </div>

      {/* ── Dialogue: authored composition, portrait keyed by speaker ID ── */}
      {dialogue && (
        <div className="absolute inset-0 z-20 flex flex-col justify-end">
          <div className="rpg-dialogue-scrim" aria-hidden="true" />
          <div className="rpg-dialogue rpg-root mx-auto mb-2 flex items-stretch gap-3 sm:gap-4">
            {(() => {
              const sid = dialogue.node.speakerId
              const portrait = SPEAKER_PORTRAITS[sid]
              if (!portrait) return null
              return (
                <div className="rpg-dialogue-portrait" aria-hidden={!PORTRAIT_ALTS[sid]}>
                  <img
                    src={portrait.small}
                    srcSet={portrait.srcSet}
                    sizes="(min-width: 640px) 118px, 64px"
                    alt={PORTRAIT_ALTS[sid] || ''}
                  />
                </div>
              )
            })()}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="rpg-nameplate">{speakerName(dialogue.node.speakerId, map)}</div>
              <p aria-live="polite" className="rpg-dialogue-text">{dialogue.node.text}</p>
              {dialogue.node.choices?.length > 0 && (
                <div className="mt-3 grid gap-2">
                  {dialogue.node.choices
                    .filter((choice) => (choice.when || []).every((condition) => state.flags[condition.flagId] === (condition.value ?? true)))
                    .map((choice) => (
                      <button
                        key={choice.id}
                        type="button"
                        className="rpg-btn rpg-btn-secondary min-h-11 w-full text-left"
                        onClick={() => {
                          dispatch({ type: 'CHOOSE', choiceId: choice.id })
                          const nextNode = dialogue.convo.nodes[choice.next]
                          if (nextNode) setDialogue({ ...dialogue, node: nextNode, index: dialogue.index + 1 })
                        }}
                      >
                        {choice.text}
                      </button>
                    ))}
                </div>
              )}
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="rpg-kbd-hint">{dialogue.node.choices?.length ? 'Choose a witnessed account' : 'Enter / Space — next'}</span>
                <div className="flex items-center gap-2">
                  {!dialogue.node.choices?.length && (
                    <button
                      type="button"
                      onClick={advanceDialogue}
                      className="rpg-btn rpg-btn-primary min-h-11 px-4 text-[11px]"
                    >
                      Continue
                    </button>
                  )}
                  {conversationRequiredChoicesMet(state, dialogue.convo) && (
                    <button
                      type="button"
                      onClick={() => {
                        const conversationId = dialogue.id
                        setDialogue(null)
                        dispatch({ type: 'DIALOGUE_END', conversationId, npcId: dialogue.npcId })
                      }}
                      className="rpg-btn rpg-btn-quiet min-h-11 px-4 text-[11px]"
                    >
                      Skip
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Shrine (patron selection) ── */}
      {shrineOpen && state.status === 'playing' && (
        <div className="rpg-scroll-overlay rpg-shrine-overlay">
          <div className="rpg-panel rpg-cut rpg-shrine-panel w-full max-w-3xl p-5">
            <div className="mb-1 text-center text-[10px] font-bold uppercase tracking-[0.35em] text-[#a5761f]">First Patron Shrine</div>
            <h2 className="rpg-serif mb-1 text-center text-2xl text-[#f3e6c8]">Swear an Oath</h2>
            <p className="mb-4 text-center text-xs text-[#b8a888]">
              A first patron lends you their power past the Veil. Your choice is bound to your codex at this shrine.
            </p>
            <div className="rpg-shrine-grid grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {PATRON_CARDS.map(({ god, loadout }) => {
                const selected = state.protagonist.activePatronId === god.key
                return (
                  <button
                    key={god.key}
                    type="button"
                    onClick={() => doPatron(god.key)}
                    data-bound={selected}
                    className="rpg-shrine-card"
                  >
                    <div className="mb-1 flex w-full items-center justify-between">
                      <span className="text-sm font-bold uppercase tracking-wide text-[#e8dcc0]">{god.name}</span>
                      {selected && <span className="text-[9px] uppercase text-[#e8b64c]">Bound</span>}
                    </div>
                    <div className="mb-1 text-[9px] uppercase tracking-wider text-[#8f8168]">{god.domain}</div>
                    {loadout.map((p) => (
                      <div key={p.id} className="mb-0.5 text-[10px] leading-snug text-[#b8a888]">
                        <span className="font-bold text-[#f3e6c8]">{p.name}.</span> {p.description}
                      </div>
                    ))}
                    {loadout.length === 0 && (
                      <div className="text-[10px] italic text-[#6f6250]">No power recorded for this patron yet.</div>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="rpg-shrine-footer mt-4 flex items-center justify-between text-[10px] uppercase tracking-wider text-[#8f8168]">
              <span>Patron switching is allowed only here, outside combat.</span>
              <button
                type="button"
                onClick={() => setShrineOpen(false)}
                className="rpg-btn rpg-btn-quiet min-h-11 px-3 text-[10px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Authored objective choice ── */}
      {choicePrompt && state.status === 'playing' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-[#0a0f14]/88 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="rpg-choice-title" className="rpg-panel rpg-cut w-full max-w-lg p-5">
            <div className="mb-1 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-[#a5761f]">Oathbound decision</div>
            <h2 id="rpg-choice-title" className="rpg-serif mb-2 text-center text-2xl text-[#f3e6c8]">{choicePrompt.title}</h2>
            <p className="mb-4 text-center text-sm text-[#b8a888]">Choose the covenant wording Kallias will carry forward.</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {choicePrompt.choiceIds.map((choiceId) => (
                (() => {
                  const option = choicePrompt.options.find((candidate) => candidate.id === choiceId)
                  return (
                    <button
                      key={choiceId}
                      type="button"
                      onClick={() => {
                        dispatch({ type: 'CHOOSE', choiceId })
                        setChoicePrompt(null)
                      }}
                      className="rpg-btn rpg-btn-secondary min-h-12 w-full text-left"
                    >
                      <span className="block">{option?.name || choiceLabel(choiceId)}</span>
                      {option && <span className="mt-1 block text-[9px] font-normal normal-case tracking-normal text-[#b8a888]">Promise: {option.promise}<br />Cost: {option.cost}</span>}
                    </button>
                  )
                })()
              ))}
            </div>
            <button type="button" onClick={() => setChoicePrompt(null)} className="rpg-btn rpg-btn-quiet mt-3 min-h-11 w-full">Return</button>
          </div>
        </div>
      )}

      {/* ── Combat end (victory / failure) ── */}
      {combatEnd && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
          <div className="rpg-panel rpg-cut w-full max-w-sm p-5 text-center">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#a5761f]">
              {combatEnd.outcome === OUTCOME_WON ? (combatEnd.wilderness ? 'Wilderness Victory' : 'Court Cleared') : 'You Fell'}
            </div>
            <h3 className="rpg-serif mb-2 text-2xl text-[#f3e6c8]">
              {combatEnd.outcome === OUTCOME_WON ? (combatEnd.wilderness ? `${combatEnd.wilderness.enemyName} defeated.` : 'The gate holds.') : 'The dark closes in.'}
            </h3>
            <p className="mb-4 text-sm text-[#b8a888]">
              {combatEnd.outcome === OUTCOME_WON
                ? combatEnd.wilderness
                  ? 'Combat XP, loot, and drachmae have been awarded once. Scout onward or return to sanctuary.'
                  : (() => {
                      const enc = rpgEncounterById(combatEnd.encounterId)
                      return enc
                        ? `${enc.title} is yours.${sessionEliteName(session) ? ` The ${sessionEliteName(session)} is unmade.` : ''} Return to the world and press on.`
                        : 'The court is yours. Return to the world and press on.'
                    })()
                : combatEnd.wilderness
                  ? 'You return to sanctuary under the wilderness loss rules. Protected items remain; the rest are recorded above.'
                  : 'You wake at the shrine. Your oath remains; the court waits.'}
            </p>
            <button
              type="button"
              onClick={() => {
                const conversationId = combatEnd.scriptedConversationId
                setCombatEnd(null)
                setSession(null)
                setCombatReady(false)
                if (conversationId) {
                  const convo = rpgConversationById(conversationId)
                  if (convo) {
                    dispatch({ type: 'BEGIN_DIALOGUE', conversationId })
                    setDialogue({ id: conversationId, convo, node: convo.nodes[convo.start], index: 0, npcId: null })
                  }
                }
              }}
              className="rpg-btn rpg-btn-secondary w-full"
            >
              {combatEnd.outcome === OUTCOME_WON ? 'Continue' : 'Return'}
            </button>
          </div>
        </div>
      )}

      {/* ── Chapter boundary — one registered transition for every act ── */}
      {state.status === 'ending' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-live="polite"
          aria-label={nextAct ? `Act ${romanNumeral(completedAct)} complete — ${transition?.title || nextRegion?.name}` : 'Act V complete — The Last Name witnessed'}
          className="rpg-act rpg-scroll-overlay"
        >
          <div className="rpg-seam rpg-seam-a" aria-hidden="true" />
          <div className="rpg-seam rpg-seam-b" aria-hidden="true" />
          <div className="rpg-act-card rpg-panel">
            <div className="min-w-0">
              <div className="rpg-reveal">
                <div className="text-[10px] uppercase tracking-[0.3em] text-[#a5761f]">Act {romanNumeral(completedAct)} complete</div>
                <div className="rpg-serif mt-2 text-xl text-[#e8b64c]">{transition?.completion || 'The Last Name witnessed'}</div>
                {nextAct && <div className="mt-3 text-[10px] uppercase tracking-[0.25em] text-[#8f8168]">Next</div>}
                <h3 className="rpg-serif text-2xl leading-tight text-[#f3e6c8] sm:text-3xl">
                  {nextAct ? (transition?.title || nextRegion?.name) : 'The Accord Endures'}
                </h3>
              </div>
              <p className="rpg-reveal rpg-reveal-2 mt-2 text-sm leading-relaxed text-[#b8a888]">
                {nextAct
                  ? transition?.copy
                  : 'The covenant is published with its benefits, costs, and safeguards intact. The roads reopen, the witnesses remain named, and Kallias may return to the world he helped revise.'}
              </p>
              <button
                type="button"
                onClick={() => dispatch(nextAct ? { type: 'BEGIN_ACT', act: nextAct } : { type: 'ACK_ENDING' })}
                className="rpg-btn rpg-btn-secondary rpg-reveal rpg-reveal-3 mt-4 w-full sm:w-auto"
              >
                {nextAct ? transition?.action : 'Continue exploring'}
              </button>
            </div>
            {nextAct === 2 && (
              <figure className="rpg-act-portrait rpg-reveal rpg-reveal-2">
                <img
                  src={PORTRAIT_SOURCES.ianthe.large}
                  srcSet={PORTRAIT_SOURCES.ianthe.srcSet}
                  sizes="(min-width: 700px) 240px, calc(100vw - 2rem)"
                  alt=""
                  aria-hidden="true"
                />
                <figcaption>Ianthe · The Pelagos Strand</figcaption>
              </figure>
            )}
          </div>
        </div>
      )}

      {/* ── Pause menu ── */}
      {paused && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="rpg-panel rpg-cut w-full max-w-xs p-5">
            <h3 className="rpg-serif mb-4 text-center text-2xl text-[#f3e6c8]">Paused</h3>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={resumeGame} className="rpg-btn rpg-btn-secondary w-full">
                Resume
              </button>
              <button type="button" onClick={() => setShowHelp((v) => !v)} className="rpg-btn rpg-btn-quiet w-full">
                {showHelp ? 'Hide controls' : 'Controls'}
              </button>
              <a
                href="#control-tower"
                className="rpg-btn rpg-btn-quiet w-full"
              >
                Exit to Arena
              </a>
            </div>
            {showHelp && (
              <div className="mt-3 border-t border-[#2a2318] pt-3 text-[10px] leading-relaxed text-[#8f8168]">
                <p><b className="text-[#b8a888]">Move:</b> Click ground / WASD / Arrows</p>
                <p><b className="text-[#b8a888]">Dash:</b> Shift / Space</p>
                <p><b className="text-[#b8a888]">Interact:</b> Click target / E</p>
                <p><b className="text-[#b8a888]">Advance dialogue:</b> Enter / Space</p>
                <p><b className="text-[#b8a888]">Pause:</b> Escape</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Touch controls (pointer) */}
      {(state.status === 'playing' || state.status === 'in-combat') && !dialogue && !shrineOpen && !choicePrompt && !combatEnd && (
        <div className="rpg-touch-controls pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between md:hidden">
          <div className="pointer-events-auto grid grid-cols-3 grid-rows-3 gap-1" aria-label="Movement controls">
            <button aria-label="Move up" type="button" disabled={state.status === 'in-combat' && !combatReady} onPointerDown={() => { touchRef.current.up = true }} onPointerUp={() => { touchRef.current.up = false }} onPointerCancel={() => { touchRef.current.up = false }} onPointerLeave={() => { touchRef.current.up = false }} className="col-start-2 grid h-12 w-12 place-items-center rounded-full border border-[#5a4a2a] bg-[#0b0a06]/85 text-lg text-[#f3e6c8] disabled:opacity-40">▲</button>
            <button aria-label="Move left" type="button" disabled={state.status === 'in-combat' && !combatReady} onPointerDown={() => { touchRef.current.left = true }} onPointerUp={() => { touchRef.current.left = false }} onPointerCancel={() => { touchRef.current.left = false }} onPointerLeave={() => { touchRef.current.left = false }} className="row-start-2 grid h-12 w-12 place-items-center rounded-full border border-[#5a4a2a] bg-[#0b0a06]/85 text-lg text-[#f3e6c8] disabled:opacity-40">◀</button>
            <button aria-label="Move down" type="button" disabled={state.status === 'in-combat' && !combatReady} onPointerDown={() => { touchRef.current.down = true }} onPointerUp={() => { touchRef.current.down = false }} onPointerCancel={() => { touchRef.current.down = false }} onPointerLeave={() => { touchRef.current.down = false }} className="col-start-2 row-start-2 grid h-12 w-12 place-items-center rounded-full border border-[#5a4a2a] bg-[#0b0a06]/85 text-lg text-[#f3e6c8] disabled:opacity-40">▼</button>
            <button aria-label="Move right" type="button" disabled={state.status === 'in-combat' && !combatReady} onPointerDown={() => { touchRef.current.right = true }} onPointerUp={() => { touchRef.current.right = false }} onPointerCancel={() => { touchRef.current.right = false }} onPointerLeave={() => { touchRef.current.right = false }} className="col-start-3 row-start-2 grid h-12 w-12 place-items-center rounded-full border border-[#5a4a2a] bg-[#0b0a06]/85 text-lg text-[#f3e6c8] disabled:opacity-40">▶</button>
          </div>
          {state.status === 'playing' && (
            <div className="pointer-events-auto flex flex-col items-end gap-2">
              <button type="button" aria-label="Dash" onPointerDown={() => { touchRef.current.dash = true }} onPointerUp={() => { touchRef.current.dash = false }} onPointerCancel={() => { touchRef.current.dash = false }} onPointerLeave={() => { touchRef.current.dash = false }} className="min-h-11 rounded-full border border-[#5a4a2a] bg-[#0b0a06]/85 px-4 text-[10px] font-bold uppercase tracking-widest text-[#d6c39c]">Dash</button>
              <button type="button" onPointerDown={doInteract} className="min-h-12 rounded border border-[#e8b64c] bg-[#1d2633]/95 px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#f3e6c8]">Interact</button>
            </div>
          )}
        </div>
      )}

      {/* save note */}
      {saveNote && (
        <div className="absolute bottom-2 right-2 z-50 rounded border border-[#b3241c]/50 bg-[#0b0a06]/90 px-2 py-1 text-[10px] text-[#e8a08a]">{saveNote}</div>
      )}
    </div>
  )
}

function speakerName(speakerId, map) {
  if (speakerId === 'kallias') return 'Kallias'
  if (speakerId === 'keeper' || speakerId === 'amonides') return 'Amonides'
  if (speakerId === 'name-cutter-captain') return 'Name-Cutter Captain'
  if (!map) return speakerId
  const ent = map.entities.find((e) => e.id === speakerId)
  return ent ? ent.name : speakerId
}
