// Campaign data — authored maps for the arena campaign.
//
// Pure data + pure helpers. Nothing here reads time, RNG, or the DOM: the same
// level index always yields the same level, so campaign progression is fully
// testable and deterministic. Spawn *pacing* inside an encounter is the
// spawner's concern (an internal mechanism) — it never drives progression.
//
// Phase B (story RPG) reuses these IDs as stable location/map contracts.

// Level palette tokens feed the canvas renderer. They are data, so a future
// story map can restyle an arena without touching drawing code.
// Dramatic value structure (Phase B visual gate): dark architectural voids
// under a sunlit court — high contrast, never beige-on-beige.
const PALETTE = {
  acropolis: {
    name: 'sun-bleached marble',
    sky: '#3f8fc0',
    skyLow: '#a8d3e2',
    sea: '#256f9c',
    hill: '#55808a',
    sun: '#fff3cf',
    haze: 'rgba(255,240,210,0.35)',
    marble: '#f3e9cf',
    marbleMid: '#e3d3ab',
    marbleShadow: '#c4b184',
    grout: '#243039',
    stone: '#8d8271',
    stoneDark: '#585047',
    terracotta: '#c05a2e',
    terracottaDark: '#8f3d1e',
    bronze: '#a8762f',
    gold: '#e8b64c',
    glow: '#ffcf6b',
    ink: '#16202b',
    outline: '#131c26',
    accent: '#2a44c9',
    danger: '#b3241c',
    void: '#0b1218',
    interior: false,
  },
  sunCourt: {
    name: 'marble and terracotta',
    sky: '#5d87c9',
    skyLow: '#e8c98f',
    sea: '#3c6fa0',
    hill: '#7a7a5e',
    sun: '#fff0c0',
    haze: 'rgba(255,225,170,0.42)',
    marble: '#f5e8c8',
    marbleMid: '#e6d0a2',
    marbleShadow: '#c9ad76',
    grout: '#2a2721',
    stone: '#96805f',
    stoneDark: '#5f5140',
    terracotta: '#cf5f22',
    terracottaDark: '#94380f',
    bronze: '#b07d3a',
    gold: '#f0c25a',
    glow: '#ffb340',
    ink: '#26200f',
    outline: '#1c1608',
    accent: '#2a44c9',
    danger: '#b3241c',
    void: '#100d06',
    interior: false,
  },
  foundry: {
    name: 'bronze and ember',
    sky: '#0a0e12',
    skyLow: '#1b232a',
    sea: '#101820',
    hill: '#181818',
    sun: '#3a2a18',
    haze: 'rgba(255,120,30,0.12)',
    wallLow: '#1b232a',
    marble: '#b9a582',
    marbleMid: '#94815f',
    marbleShadow: '#6e5d43',
    grout: '#0c1218',
    stone: '#4c4438',
    stoneDark: '#2c2820',
    terracotta: '#8a4b2a',
    terracottaDark: '#5f2f14',
    bronze: '#b07d3a',
    gold: '#d99a3c',
    glow: '#ff7a1f',
    ink: '#12100c',
    outline: '#05080b',
    accent: '#ff7a1f',
    danger: '#e03820',
    void: '#05080b',
    interior: true,
  },
}

// Obstacle kinds understood by the renderer + (light) collision push-out.
// Columns block the player; braziers are decorative light sources; statues,
// ruins, and urns read as architecture, not glyphs. All sit near the terrace
// edges so they frame the fight instead of cluttering the middle.
const ARCH = {
  // Entry court: flanking colonnade, guardian statue, braziers, ruins.
  acropolis: [
    { kind: 'column', x: -190, y: -120, r: 15 },
    { kind: 'column', x: 190, y: -120, r: 15 },
    { kind: 'statue', x: -238, y: 66, r: 11 },
    { kind: 'ruin', x: 232, y: 76, r: 12 },
    { kind: 'brazier', x: -95, y: -165, r: 9 },
    { kind: 'brazier', x: 95, y: -165, r: 9 },
    { kind: 'urn', x: -250, y: -30, r: 8 },
    { kind: 'urn', x: 252, y: -34, r: 8 },
  ],
  // Sun court: open colonnade, paired braziers, scattered drums.
  sunCourt: [
    { kind: 'column', x: -205, y: -60, r: 14 },
    { kind: 'column', x: 205, y: -70, r: 14 },
    { kind: 'column', x: -215, y: 95, r: 12 },
    { kind: 'ruin', x: 225, y: 105, r: 13 },
    { kind: 'brazier', x: -130, y: -150, r: 9 },
    { kind: 'brazier', x: 130, y: -150, r: 9 },
    { kind: 'brazier', x: 0, y: 185, r: 9 },
    { kind: 'urn', x: 172, y: 150, r: 8 },
  ],
  // Foundry: heavy pillars, anvil-corner ruins, furnace-side braziers.
  foundry: [
    { kind: 'column', x: -165, y: -110, r: 17 },
    { kind: 'column', x: 165, y: -115, r: 17 },
    { kind: 'column', x: -185, y: 95, r: 14 },
    { kind: 'column', x: 185, y: 100, r: 14 },
    { kind: 'brazier', x: -232, y: -10, r: 10 },
    { kind: 'brazier', x: 232, y: -14, r: 10 },
    { kind: 'ruin', x: -70, y: -185, r: 12 },
    { kind: 'ruin', x: 80, y: 182, r: 12 },
  ],
}

// Encounter composition: an ordered list of enemy spawns for the level.
// `pacing` is the base gap between spawns in ticks (the spawner's internal
// pacing knob — not player-facing progression).
export const CAMPAIGN = [
  {
    id: 'acropolis-entry',
    order: 1,
    name: 'Acropolis Entry Court',
    shortName: 'Entry Court',
    location: 'Acropolis',
    subtitle: 'A sun-bleached marble court before the gates',
    palette: PALETTE.acropolis,
    architecture: ARCH.acropolis,
    objective: {
      kind: 'clear',
      text: 'Repel the serpent sentries',
      target: 4,
    },
    introTitle: 'Acropolis Entry Court',
    introSubtitle: 'The way is guarded. Show them the sun.',
    encounter: { order: ['hydra', 'hydra', 'cerberus', 'hydra'], pacing: 50 },
    completion: 'Court cleared',
  },
  {
    id: 'sun-court',
    order: 2,
    name: 'Marble-and-Terracotta Sun Court',
    shortName: 'Sun Court',
    location: 'Heliopolis',
    subtitle: 'Open ground where the sun stands overhead',
    palette: PALETTE.sunCourt,
    architecture: ARCH.sunCourt,
    objective: {
      kind: 'clear',
      text: 'Scour the court of beasts',
      target: 6,
    },
    introTitle: 'Sun Court',
    introSubtitle: 'The beasts multiply beneath a burning sky.',
    encounter: {
      order: ['hydra', 'cerberus', 'chronos', 'hydra', 'cerberus', 'chronos'],
      pacing: 42,
    },
    completion: 'Sun court scoured',
  },
  {
    id: 'bronze-foundry',
    order: 3,
    name: 'Bronze Foundry Threshold',
    shortName: 'Foundry',
    location: 'The Forge',
    subtitle: 'Bronze, ember, and the roar of the furnace',
    palette: PALETTE.foundry,
    architecture: ARCH.foundry,
    objective: {
      kind: 'clear',
      text: 'Break the foundry guard and its minotaur warden',
      target: 7,
    },
    introTitle: 'Bronze Foundry',
    introSubtitle: 'A minotaur warden bars the threshold.',
    encounter: {
      order: ['hydra', 'minotaur', 'cerberus', 'hydra', 'chronos', 'minotaur', 'cerberus'],
      pacing: 38,
    },
    completion: 'Foundry threshold broken',
  },
]

export const CAMPAIGN_LENGTH = CAMPAIGN.length

// The level at a 0-based index (stable by index + id).
export function levelForIndex(index) {
  const i = Math.max(0, Math.min(CAMPAIGN_LENGTH - 1, Math.floor(index || 0)))
  return CAMPAIGN[i]
}

export function levelById(id) {
  return CAMPAIGN.find((l) => l.id === id) || null
}

// Total number of enemies an encounter must spawn.
export function encounterSize(level) {
  return (level && level.encounter.order.length) || 0
}

// A level is complete when every enemy it spawned is gone (killed or escaped)
// and nothing remains unspawned. Mirrors the old wave-complete contract so the
// simulation check stays unchanged.
export function levelComplete(state) {
  return state.threatsRemainingInLevel <= 0 && state.threats.length === 0
}

// Advance to the next level, or win the campaign when the last level clears.
export function advanceLevel(state) {
  if (!levelComplete(state) || state.status !== 'running') return state
  const nextIndex = state.levelIndex + 1
  if (nextIndex >= CAMPAIGN_LENGTH) {
    return {
      ...state,
      status: 'won',
      levelIndex: nextIndex,
      threatsRemainingInLevel: 0,
    }
  }
  const nextLevel = levelForIndex(nextIndex)
  return {
    ...state,
    levelIndex: nextIndex,
    threatsRemainingInLevel: encounterSize(nextLevel),
    // Internal pacing resets each level; it never leaks to the player.
    wave: 1,
  }
}

// Objective progress label, e.g. "3 / 6 beasts".
export function objectiveProgress(state) {
  const level = levelForIndex(state.levelIndex)
  if (!level || level.objective.kind !== 'clear') return ''
  const done = level.objective.target - Math.max(0, state.threatsRemainingInLevel)
  return `${Math.min(done, level.objective.target)} / ${level.objective.target}`
}
