// RPG vertical-slice content — authored, data-only. Nothing here reads time,
// RNG, or the DOM. Stable kebab-case IDs are the only contracts story logic
// reasons about; display text is never used to infer progression.
//
// Reuses the arena contracts: Tier 1 patron roster (characters.js) and power
// definitions (powers.js) are canonical. Patron loadouts come from
// `powersForGod(god)` at runtime — never duplicated here.

import { GODS_TIER_1 } from '../game/characters.js'

export const REGION_ID = 'asterion-reach'

// The first-playable patron roster: every Tier 1 god is a valid first patron.
// The canonical roster object (characters.js) supplies name/domain; loadouts
// come from powersForGod.
export const TIER1_PATRON_IDS = GODS_TIER_1.map((g) => g.key)

export const TIER1_PATRONS = GODS_TIER_1

// ─── Palettes (sun-bleached marble per GAME-DIRECTION.md) ──────
const PALETTE_BEACON = {
  name: 'beacon-overlook',
  sky: '#3f8fc0', skyLow: '#a8d3e2', sea: '#256f9c', hill: '#55808a',
  sun: '#fff3cf', haze: 'rgba(255,240,210,0.35)',
  marble: '#f3e9cf', marbleMid: '#e3d3ab', marbleShadow: '#c4b184', grout: '#243039',
  stone: '#8d8271', stoneDark: '#585047',
  terracotta: '#c05a2e', terracottaDark: '#8f3d1e',
  bronze: '#a8762f', gold: '#e8b64c', glow: '#ffcf6b',
  ink: '#16202b', outline: '#131c26', accent: '#2a44c9', danger: '#b3241c',
  void: '#0b1218', grass: '#7d8a5a', path: '#cbb98a', interior: false,
}

const PALETTE_OLIVE = {
  name: 'olive-road',
  sky: '#7aa0c9', skyLow: '#e6d9a8', sea: '#3c6fa0', hill: '#7a7a5e',
  sun: '#fff0c0', haze: 'rgba(255,225,170,0.30)',
  marble: '#e9dcc0', marbleMid: '#d8c8a4', marbleShadow: '#bda87a', grout: '#33302a',
  stone: '#96805f', stoneDark: '#5f5140',
  terracotta: '#cf5f22', terracottaDark: '#94380f',
  bronze: '#b07d3a', gold: '#f0c25a', glow: '#ffb340',
  ink: '#26200f', outline: '#1c1608', accent: '#2a44c9', danger: '#b3241c',
  void: '#100d06', grass: '#6d7a45', path: '#c0ad80', interior: false,
}

// ─── Maps ──────────────────────────────────────────────────────
// Each map is a bounded, authored pocket. `spawn` is the fallback checkpoint
// for a fresh entry. Entities are interaction/NPC markers; exits are authored
// transitions (to another map, or into a combat encounter).
export const MAPS = {
  'beacon-overlook': {
    id: 'beacon-overlook',
    name: 'Beacon Overlook',
    region: REGION_ID,
    hub: true,
    bounds: { w: 900, h: 470 },
    palette: PALETTE_BEACON,
    // `spawn` is the default fallback; `spawns` holds every named spawn.
    spawn: { id: 'start', x: 160, y: 400, facing: 0 },
    spawns: {
      'start': { id: 'start', x: 160, y: 400, facing: 0 },
      // Post-mission overlook: where Kallias stands after Act I resolves.
      'post-mission': { id: 'post-mission', x: 430, y: 300, facing: 0 },
    },
    entities: [
      // The broken treaty-stone: witnessing it is a tutorial/flag beat.
      { id: 'treaty-stone', kind: 'interact', x: 430, y: 268, name: 'Broken Treaty-Stone', label: 'Examine the broken stone', firstOnly: true },
      // The first patron shrine (patron selection + checkpoint).
      { id: 'shrine', kind: 'shrine', x: 320, y: 170, name: 'First Patron Shrine', label: 'Approach the shrine', patron: true },
      // Thessa, the pragmatic keeper of the Accord — Act I guide.
      { id: 'thessa', kind: 'npc', x: 662, y: 280, name: 'Thessa', label: 'Talk to Thessa', conversationId: 'act1-thessa-overlook' },
      { id: 'beacon-bank', kind: 'bank', x: 548, y: 424, name: 'Beacon Storehouse', label: 'Open the Beacon Storehouse' },
      { id: 'wild-thyme', kind: 'resource', x: 238, y: 338, name: 'Wild Thyme', label: 'Gather wild thyme', skillId: 'foraging', itemId: 'thyme', level: 1, xp: 12 },
      { id: 'olive-tree', kind: 'resource', x: 188, y: 258, name: 'Olive Tree', label: 'Cut the olive tree', skillId: 'woodcutting', itemId: 'olive-log', level: 1, xp: 14 },
      { id: 'copper-seam', kind: 'resource', x: 780, y: 408, name: 'Copper Seam', label: 'Mine the copper seam', skillId: 'quarrying', itemId: 'copper-ore', level: 1, xp: 16 },
    ],
    exits: [
      { id: 'to-olive-road', x: 884, y: 404, toMapId: 'olive-road', spawnId: 'from-beacon', label: 'The Olive Road' },
      // The Sun Court gate: visible on Beacon Overlook once Entry clears. It
      // launches the authored enc-act1-sun encounter (never an invisible gate).
      { id: 'to-sun-court', x: 640, y: 96, kind: 'combat', encounterId: 'enc-act1-sun', markerId: 'gate', label: 'The Sun Court' },
    ],
    // Decorative architecture for the world renderer.
    decor: [
      { kind: 'column', x: 130, y: 104 }, { kind: 'column', x: 812, y: 104 },
      { kind: 'brazier', x: 470, y: 108 }, { kind: 'ruin', x: 96, y: 470 },
      { kind: 'urn', x: 848, y: 470 },
    ],
  },
  'olive-road': {
    id: 'olive-road',
    name: 'Olive Road',
    region: REGION_ID,
    hub: false,
    bounds: { w: 900, h: 470 },
    palette: PALETTE_OLIVE,
    spawn: { id: 'from-beacon', x: 72, y: 240, facing: 0 },
    entities: [
      // Optional lost-witness detour — never blocks the main gate.
      { id: 'tablet', kind: 'interact', x: 540, y: 372, name: 'Lost Witness Tablet', label: 'Read the tablet', sideQuest: 'sq-lost-witness', firstOnly: true },
      { id: 'keeper', kind: 'npc', x: 760, y: 150, name: 'Amonides', label: 'Return the tablet to Amonides', conversationId: 'sq-lost-witness-return' },
      { id: 'shore-fishing', kind: 'resource', x: 292, y: 404, name: 'Shore Fishing Spot', label: 'Fish the Aegean shallows', skillId: 'fishing', itemId: 'sardine', level: 1, xp: 13 },
    ],
    exits: [
      { id: 'to-beacon', x: 80, y: 96, toMapId: 'beacon-overlook', spawnId: 'start', label: 'Back to the Overlook' },
      // The main-path gate: entering it starts the entry-court encounter.
      { id: 'to-entry-court', x: 900, y: 250, kind: 'combat', encounterId: 'enc-act1-entry', markerId: 'gate', label: 'The Acropolis Entry Court' },
    ],
    decor: [
      { kind: 'column', x: 300, y: 84 }, { kind: 'column', x: 620, y: 84 },
      { kind: 'brazier', x: 760, y: 130 }, { kind: 'urn', x: 380, y: 430 },
      { kind: 'ruin', x: 872, y: 92 },
    ],
  },
}

// ─── Encounters ────────────────────────────────────────────────
// Authored fixed compositions. `campaignLevelId` reuses an existing campaign
// level; the combat adapter maps it. Waves never appear in RPG state or UI.
export const ENCOUNTERS = {
  'enc-act1-entry': {
    id: 'enc-act1-entry',
    // The story world map the player RETURNS to after the encounter clears.
    mapId: 'beacon-overlook',
    // The map the player is ON when they activate the encounter (the gate).
    activationMapId: 'olive-road',
    campaignLevelId: 'acropolis-entry',
    title: 'Acropolis Entry Court',
    subtitle: 'The way is guarded. Show them the sun.',
    completionFlag: 'enc-act1-entry-cleared',
    activation: 'quest',
    repeatable: false,
  },
  // The second Sun Court encounter, authored after the entry court. Reuses the
  // existing `sun-court` campaign level and its exact six-spawn composition;
  // only the sixth/final Chronos carries an RPG-local story-variant overlay
  // (the Name-Cutter Captain). The overlay is data over canonical behavior — it
  // never mutates CAMPAIGN or the monster registries.
  'enc-act1-sun': {
    id: 'enc-act1-sun',
    // Return location after the fight clears: the Beacon Overlook, where
    // Thessa waits to resolve the exit conversation.
    mapId: 'beacon-overlook',
    activationMapId: 'beacon-overlook',
    campaignLevelId: 'sun-court',
    title: 'Sun Court',
    subtitle: 'The beasts multiply beneath a burning sky.',
    completionFlag: 'enc-act1-sun-cleared',
    activation: 'quest',
    repeatable: false,
    eliteOverlay: {
      id: 'name-cutter-captain',
      name: 'Name-Cutter Captain',
      // Base behavior/type stays Chronos so arena collision/render contracts
      // remain compatible; the overlay only strengthens structured stats and
      // adds a story-variant marker for the renderer to branch on.
      baseMonsterType: 'chronos',
      healthMult: 2.6,
      speedMult: 1.15,
      damageMult: 1.3,
      radiusMult: 1.35,
    },
  },
}

// ─── Conversations ─────────────────────────────────────────────
// Line-by-line skippable; skipping lands on the same deterministic end-state
// (effects apply once at DIALOGUE_END regardless of path).
export const CONVERSATIONS = {
  'act1-thessa-overlook': {
    id: 'act1-thessa-overlook',
    speakerIds: ['thessa', 'kallias'],
    start: 'n1',
    nodes: {
      n1: {
        speakerId: 'thessa',
        text: 'Kallias. You came up the terraces in time to see it — the treaty-stone is broken. Far-Sighted is already bleeding out of Asterion Reach.',
        effects: [{ kind: 'flag', id: 'thessa-met', value: true }],
        next: 'n2',
      },
      n2: {
        speakerId: 'kallias',
        text: 'I saw the shards fall. Something dark moved among them — it was weaving the name away as it went.',
        next: 'n3',
      },
      n3: {
        speakerId: 'thessa',
        text: 'That is the Unnamed. They cut a god\'s epithet from a place and the place forgets what it was. Without Far-Sighted the beasts cross our defenseless terraces.',
        next: 'n4',
      },
      n4: {
        speakerId: 'thessa',
        text: 'You are the Oathbearer now — the only mortal who can carry a god\'s power past the Veil. Take a first patron at the shrine yonder, then press the Olive Road to the Acropolis gate. Clear the court and I will meet you after.',
        effects: [{ kind: 'marker', mapId: 'beacon-overlook', entityId: 'shrine' }],
        next: null,
      },
    },
  },
  'act1-thessa-exit': {
    id: 'act1-thessa-exit',
    speakerIds: ['thessa', 'kallias'],
    start: 'n1',
    nodes: {
      n1: {
        speakerId: 'thessa',
        text: 'Kallias — the Sun Court is silent, and you still stand. When the last beast fell I saw it catch in the bronze of that masked captain: a sliver of Far-Sighted refusing to be unmade. It is yours now.',
        effects: [{ kind: 'epithet', id: 'far-sighted' }],
        next: 'n2',
      },
      n2: {
        speakerId: 'kallias',
        text: 'One name, held. But the Unnamed cut it at the root — this fragment leans seaward, like a compass dragged toward the strand.',
        next: 'n3',
      },
      n3: {
        speakerId: 'thessa',
        text: 'Then it has shown you the way forward. Ianthe keeps the old tide-charts on the Pelagos strand — if anyone can read what the fragment remembers, it is her. Rebuild the name there, past the Salt Covenant, and Asterion Reach will remember itself again.',
        effects: [{ kind: 'flag', id: 'revealed-ianthe', value: true }],
        next: null,
      },
    },
  },
  'sq-lost-witness-return': {
    id: 'sq-lost-witness-return',
    speakerIds: ['keeper', 'kallias'],
    start: 'n1',
    nodes: {
      n1: {
        speakerId: 'keeper',
        text: 'Amonides, keeper of the old ledger. You found a witness\'s tablet out on the road? The Unnamed tried to grind its name to dust.',
        next: 'n2',
      },
      n2: {
        speakerId: 'kallias',
        text: 'I recovered it before they could. It holds a broken epithet — half-erased.',
        next: 'n3',
      },
      n3: {
        speakerId: 'keeper',
        text: 'Good. That is one name the Silent Loom will not have. Take this as thanks — a courier\'s purse, and a note for your codex. The main road needs you, not the ledger.',
        effects: [
          { kind: 'currency', amount: 25 },
          { kind: 'flag', id: 'sq-lost-witness-complete', value: true },
        ],
        next: null,
      },
    },
  },
}

// ─── Quests ────────────────────────────────────────────────────
// Objectives advance ONLY from explicit events, in order, once. Optional quest
// state never gates the main quest.
export const QUEST_DEFS = {
  'mq-act1-ash-at-dawn': {
    id: 'mq-act1-ash-at-dawn',
    kind: 'main',
    act: 1,
    prerequisites: [],
    objectives: [
      { id: 'reach-beacon-start', kind: 'reach', mapId: 'beacon-overlook', markerId: 'start' },
      { id: 'talk-thessa', kind: 'talk', npcId: 'thessa', conversationId: 'act1-thessa-overlook' },
      { id: 'choose-patron', kind: 'interact', entityId: 'beacon-overlook:shrine' },
      { id: 'reach-olive-road', kind: 'reach', mapId: 'olive-road', markerId: 'from-beacon' },
      { id: 'clear-entry', kind: 'clear-encounter', encounterId: 'enc-act1-entry' },
      { id: 'clear-sun', kind: 'clear-encounter', encounterId: 'enc-act1-sun' },
      { id: 'talk-thessa-exit', kind: 'talk', npcId: 'thessa', conversationId: 'act1-thessa-exit' },
    ],
    rewards: [{ kind: 'flag', id: 'mq-act1-ash-at-dawn-complete', value: true }],
  },
  'sq-lost-witness': {
    id: 'sq-lost-witness',
    kind: 'side',
    act: 1,
    prerequisites: [],
    objectives: [
      { id: 'read-tablet', kind: 'interact', entityId: 'olive-road:tablet' },
      { id: 'return-tablet', kind: 'talk', npcId: 'keeper', conversationId: 'sq-lost-witness-return' },
    ],
    rewards: [
      { kind: 'currency', amount: 25 },
      { kind: 'flag', id: 'sq-lost-witness-complete', value: true },
    ],
  },
}

// Encounter → the quest that owns its clear objective (for exact-once wiring).
export const ENCOUNTER_OWNER_QUEST = {
  'enc-act1-entry': 'mq-act1-ash-at-dawn',
  'enc-act1-sun': 'mq-act1-ash-at-dawn',
}

// ─── Lookup helpers ────────────────────────────────────────────
export function mapById(id) {
  return MAPS[id] || null
}

// Validated named-spawn lookup. Returns the named spawn (or the map's default
// fallback spawn) when known, else null. Callers must NOT silently accept
// arbitrary spawn IDs — an unknown named spawn resolves to the map default or
// is rejected outright.
export function spawnById(mapId, spawnId) {
  const map = MAPS[mapId]
  if (!map) return null
  const id = spawnId || map.spawn?.id || 'start'
  const found = map.spawns && map.spawns[id]
  return found || map.spawn || null
}

export function questDefById(id) {
  return QUEST_DEFS[id] || null
}

export function encounterById(id) {
  return ENCOUNTERS[id] || null
}

export function conversationById(id) {
  return CONVERSATIONS[id] || null
}
