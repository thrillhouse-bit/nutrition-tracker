// Act V render-ready world geometry.
//
// Static story IDs and progression remain in act5Content.js. This module only
// supplies deterministic 960x540 placement, traversal, activators, and visual
// metadata. It does not implement boss phases, ending eligibility, or story
// effects; those contracts remain explicit data for the shared runtime.

import {
  ACT5_CONNECTIONS,
  ACT5_ENDING_VARIANTS,
  ACT5_LIGHT_POLARITY_RULES,
  ACT5_LIGHT_POLARITY_STATES,
  ACT5_POCKETS,
  ACT5_WITNESSED_DEEDS,
  act5PocketById,
} from './act5Content.js'

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

const palette = (name, values) => ({
  name,
  sky: '#17172b', skyLow: '#34304d', sea: '#101326', hill: '#29283b',
  sun: '#f2dda4', haze: 'rgba(149,153,194,0.20)', marble: '#c9c0b3',
  marbleMid: '#8e8790', marbleShadow: '#504b5c', grout: '#232132',
  stone: '#676272', stoneDark: '#302d3d', terracotta: '#8f4438',
  terracottaDark: '#512c31', bronze: '#967241', gold: '#d4b260',
  glow: '#a7b9ff', ink: '#11101d', outline: '#090914', accent: '#746ed0',
  danger: '#b8404a', void: '#070710', grass: '#4f5260', path: '#958b82',
  interior: false,
  ...values,
})

const PALETTES = deepFreeze({
  foothold: palette('nyx-foothold', {
    sky: '#15152b', skyLow: '#38334f', glow: '#a9a5ff', accent: '#7067bd',
    marble: '#c8c0b5', gold: '#d3af66', path: '#8e8582',
  }),
  stair: palette('night-stair', {
    sky: '#080b1a', skyLow: '#222844', stone: '#54566e', stoneDark: '#25273b',
    marble: '#9ea1b4', glow: '#b8c8ff', accent: '#687bd1', path: '#74788e',
  }),
  falseSky: palette('false-sky', {
    sky: '#4a251f', skyLow: '#d08345', sun: '#fff1a8', haze: 'rgba(255,201,115,0.25)',
    stone: '#77605a', stoneDark: '#3d3033', marble: '#d2b99c', glow: '#ffd376',
    accent: '#c46d3b', danger: '#9f3040', void: '#190d16', path: '#b69573',
  }),
  approach: palette('silent-loom-approach', {
    sky: '#0b0d16', skyLow: '#252331', marble: '#aaa39a', stone: '#55515b',
    stoneDark: '#25232c', glow: '#d9c080', accent: '#806f95', path: '#777078',
  }),
  loom: palette('silent-loom', {
    sky: '#07070d', skyLow: '#191820', marble: '#bbb3a5', stone: '#46434d',
    stoneDark: '#1d1b23', glow: '#e7c46d', accent: '#7c5e88', danger: '#c23c42',
    void: '#020205', path: '#746b68', interior: true,
  }),
  overlook: palette('accord-overlook', {
    sky: '#384f70', skyLow: '#d49a63', sea: '#233a58', sun: '#fff0bd',
    haze: 'rgba(237,205,164,0.28)', marble: '#ded1bb', stone: '#777a82',
    stoneDark: '#3d4655', glow: '#f2d283', accent: '#6d86ad', path: '#b8a98d',
  }),
})

const point = (x, y) => ({ x, y })
const spawn = (id, x, y, facing, lightStateId) => ({
  id, x, y, facing,
  arrivalState: { lightStateId },
})
const solid = (id, x, y, w, h) => ({ id, kind: 'solid', x, y, w, h })
const lane = (id, width, stateIds, points, accessibleLabel) => ({
  id, width, stateIds, points, accessibleLabel,
})
const allLightStates = [...ACT5_LIGHT_POLARITY_RULES.stateIds]

const endingOptions = ACT5_ENDING_VARIANTS.map((ending) => ({
  id: ending.id,
  name: ending.name,
  promise: ending.promise,
  cost: ending.cost,
  fallback: ending.fallback,
}))

export const ACT5_RUNTIME_MAPS = deepFreeze({
  'nyx-foothold': {
    id: 'nyx-foothold', bounds: { w: 960, h: 540 }, palette: PALETTES.foothold,
    themeId: 'last-name-witness-camp', decorSetId: 'nyx-keeper-foothold',
    spawns: {
      'keeper-camp': spawn('keeper-camp', 154, 382, -0.12, 'shadow'),
      'from-night-stair': spawn('from-night-stair', 872, 276, Math.PI, 'shadow'),
      'witness-board': spawn('witness-board', 438, 330, -Math.PI / 2, 'shadow'),
    },
    entities: [
      { id: 'thessa', kind: 'npc', x: 256, y: 350, name: 'Thessa', label: 'Muster the witnesses with Thessa', accessibleLabel: 'Speak with Thessa to muster the witnesses', conversationId: 'act5-nyx-muster' },
      { id: 'nyx', kind: 'npc', x: 350, y: 238, name: 'Nyx', label: 'Ask Nyx to shelter the witnessed names', accessibleLabel: 'Speak with Nyx, shelter of witnessed names', conversationId: 'act5-nyx-muster' },
      { id: 'shrine-nyx-foothold', kind: 'shrine', x: 176, y: 206, name: 'Shrine of Nyx', label: 'Rest beneath primordial night', accessibleLabel: 'Nyx shrine and safe save point', deityId: 'nyx', savePointId: 'shrine-nyx-foothold' },
      { id: 'ally-witness-board', kind: 'interact', x: 438, y: 330, name: 'Ally Witness Board', label: 'Review present and neutral witnesses', accessibleLabel: 'Review the witness roster' },
      { id: 'archive-tent', kind: 'marker', x: 540, y: 408, name: 'Unwritten Witnesses', label: 'Read the unwritten accounts' },
      { id: 'shadow-seal-first', kind: 'interact', interactionType: 'light-switch', x: 684, y: 280, name: 'First Shadow Seal', label: ACT5_LIGHT_POLARITY_STATES.shadow.label, accessibleLabel: 'Shadow bridge control, filled crescent', lightStateId: 'shadow', controllerSourceId: ACT5_LIGHT_POLARITY_STATES.shadow.controller, shapeGlyph: ACT5_LIGHT_POLARITY_STATES.shadow.shapeGlyph },
      { id: 'nyx-laurel', kind: 'resource', x: 760, y: 340, name: 'Night-Sheltered Laurel', label: 'Cut a branch from the sheltered laurel', skillId: 'woodcutting', itemId: 'laurel-branch', level: 45, xp: 65 },
      { id: 'nyx-field-kitchen', kind: 'station', stationId: 'field-kitchen', x: 460, y: 400, name: 'Witness Camp Field Kitchen', label: 'Cook at the witness camp kitchen' },
      { id: 'nyx-shrine-fire', kind: 'station', stationId: 'shrine-fire', x: 180, y: 290, name: 'Nyx Shrine Fire', label: 'Consecrate an offering beneath primordial night' },
      { id: 'asteria-witness-broker', kind: 'shop', shopId: 'nyx-witness-exchange', x: 640, y: 390, name: 'Asteria', label: 'Trade witnessed crafts with Asteria' },
      { id: 'nyx-foothold-bank', kind: 'bank', x: 420, y: 460, name: 'Witness Camp Cache', label: 'Open the witness camp cache', accessibleLabel: 'Open the witness camp cache, a physical bank' },
      {
        id: 'nyx-foothold-shade-plot', kind: 'resource', x: 250, y: 470, name: 'Shadowed Camp Plot', label: 'Tend the shadowed camp plot',
        skillId: 'stewardship', itemId: 'night-forage', level: 50, xp: 95,
        requiresFlag: 'steward:restored:nyx-foothold:nyx-foothold-shade-plot',
        restore: {
          level: 45, xp: 80,
          cost: [{ itemId: 'shadow-lantern-oil', quantity: 3 }],
          label: 'Light the plot with shadow lantern oil so it can grow beneath primordial night',
        },
      },
    ],
    exits: [
      { id: 'foothold-to-night-stair', x: 922, y: 276, toMapId: 'night-stair', spawnId: 'from-foothold', returnSpawnId: 'from-night-stair', kind: 'shadow-bridge', gate: [], accessibleLabel: 'Cross the shadow bridge to the Night Stair' },
    ],
    collisions: [
      solid('foothold-north-cliff', 30, 34, 326, 72), solid('foothold-north-tents', 594, 46, 306, 82),
      solid('foothold-west-drop', 24, 132, 46, 292), solid('foothold-south-rocks', 560, 444, 318, 58),
      solid('foothold-shrine-plinth', 142, 166, 74, 42),
    ],
    traversalLanes: [
      lane('foothold-ascent', 76, allLightStates, [point(86, 382), point(256, 350), point(438, 330), point(650, 300), point(922, 276)], 'Open witness-camp route to the Night Stair'),
      lane('foothold-shrine-path', 48, allLightStates, [point(256, 350), point(214, 270), point(176, 206)], 'Safe branch to the Nyx shrine'),
    ],
    decor: [
      { id: 'foothold-brazier-1', kind: 'brazier', x: 302, y: 176 }, { id: 'foothold-brazier-2', kind: 'brazier', x: 608, y: 324 },
      { id: 'foothold-witness-flags', kind: 'witness-flags', x: 448, y: 118 }, { id: 'foothold-tent', kind: 'archive-tent', x: 540, y: 408 },
    ],
    light: { initialStateId: 'shadow', controllerIds: ['shadow-seal-first'], laneIds: ['foothold-ascent', 'foothold-shrine-path'] },
  },

  'night-stair': {
    id: 'night-stair', bounds: { w: 960, h: 540 }, palette: PALETTES.stair,
    themeId: 'last-name-night-stair', decorSetId: 'suspended-memory-bridges',
    spawns: {
      'from-foothold': spawn('from-foothold', 76, 390, 0, 'shadow'),
      'from-false-sky': spawn('from-false-sky', 876, 144, Math.PI, 'moon'),
      'anchors-stable': spawn('anchors-stable', 696, 238, -0.4, 'shadow'),
      'selene-overlook': spawn('selene-overlook', 476, 126, Math.PI / 2, 'moon'),
    },
    entities: [
      { id: 'memory-anchor-1', kind: 'interact', x: 214, y: 354, name: 'First Memory Anchor', label: 'Stabilize the first witnessed deed', accessibleLabel: 'Memory anchor one of four' },
      { id: 'memory-anchor-2', kind: 'interact', x: 360, y: 286, name: 'Second Memory Anchor', label: 'Stabilize the second witnessed deed', accessibleLabel: 'Memory anchor two of four' },
      { id: 'memory-anchor-3', kind: 'interact', x: 490, y: 311, name: 'Third Memory Anchor', label: 'Stabilize the third witnessed deed', accessibleLabel: 'Memory anchor three of four' },
      { id: 'memory-anchor-4', kind: 'interact', x: 720, y: 224, name: 'Fourth Memory Anchor', label: 'Stabilize the fourth witnessed deed', accessibleLabel: 'Memory anchor four of four' },
      { id: 'selene', kind: 'npc', x: 476, y: 126, name: 'Selene', label: 'Align the moon witnesses', accessibleLabel: 'Speak with Selene at the reflected-light overlook', conversationId: 'act5-selene-reflection', optionalConversationIds: ['act5-three-lights'] },
      { id: 'selene-overlook', kind: 'marker', x: 560, y: 220, name: 'Selene Overlook', label: 'Enter the reflected-light overlook' },
      { id: 'selene-path-split', kind: 'marker', x: 500, y: 240, name: 'Moonlit Path Split', label: 'Follow the stable witness signs' },
      { id: 'true-sky-invitation', kind: 'interact', x: 446, y: 196, name: 'Unmapped Starlight', label: 'Begin The Light No Map Remembers', sideQuest: 'sq-act5-light-no-map-remembers' },
      { id: 'anchor-3-landing', kind: 'marker', x: 548, y: 322, name: 'Third Anchor Landing', label: 'Rejoin the Night Stair' },
      { id: 'star-deed-mercy', kind: 'interact', interactionType: 'match', x: 370, y: 122, name: 'Star of Mercy', label: 'Match mercy to its witnessed deed' },
      { id: 'star-deed-vigil', kind: 'interact', interactionType: 'match', x: 420, y: 94, name: 'Star of Vigil', label: 'Match vigilance to its witnessed deed' },
      { id: 'star-deed-return', kind: 'interact', interactionType: 'match', x: 528, y: 98, name: 'Star of Return', label: 'Match return to its witnessed deed' },
      { id: 'star-deed-refusal', kind: 'interact', interactionType: 'match', x: 578, y: 128, name: 'Star of Refusal', label: 'Match refusal to its witnessed deed' },
      { id: 'nyx-seal', kind: 'interact', interactionType: 'light-switch', x: 620, y: 300, name: 'Nyx Return Seal', label: ACT5_LIGHT_POLARITY_STATES.shadow.label, accessibleLabel: 'Shadow bridge control, filled crescent; restores the sheltered return path', lightStateId: 'shadow', controllerSourceId: ACT5_LIGHT_POLARITY_STATES.shadow.controller, shapeGlyph: ACT5_LIGHT_POLARITY_STATES.shadow.shapeGlyph },
      { id: 'selene-witness', kind: 'interact', interactionType: 'light-switch', x: 660, y: 250, name: 'Selene Witness', label: ACT5_LIGHT_POLARITY_STATES.moon.label, accessibleLabel: 'Moon bridge control, split disc; opens the reflected forward path', lightStateId: 'moon', controllerSourceId: ACT5_LIGHT_POLARITY_STATES.moon.controller, shapeGlyph: ACT5_LIGHT_POLARITY_STATES.moon.shapeGlyph },
    ],
    exits: [
      { id: 'night-stair-to-foothold', x: 38, y: 390, toMapId: 'nyx-foothold', spawnId: 'from-night-stair', returnSpawnId: 'from-foothold', kind: 'shadow-bridge', gate: [], accessibleLabel: 'Return to Nyx Foothold' },
      { id: 'night-stair-to-false-sky', x: 922, y: 144, toMapId: 'false-sky', spawnId: 'from-night-stair', returnSpawnId: 'from-false-sky', kind: 'moon-bridge', gate: [{ kind: 'flag', flagId: 'act5-moon-witnesses-aligned', value: true }], accessibleLabel: 'Cross the moon bridge to the False Sky' },
      { id: 'combat-act5-night-stair', x: 430, y: 310, kind: 'combat', encounterId: 'enc-act5-night-stair', label: 'Defend the memory anchors', accessibleLabel: 'Begin Erasure on the Stair encounter', gate: [] },
    ],
    collisions: [
      solid('stair-north-void-west', 30, 30, 300, 72), solid('stair-north-void-east', 630, 34, 294, 64),
      solid('stair-south-void-west', 24, 452, 330, 54), solid('stair-south-void-east', 612, 440, 316, 66),
      solid('stair-broken-landing', 430, 352, 82, 58),
    ],
    traversalLanes: [
      lane('night-stair-shadow', 88, ['shadow'], [point(38, 390), point(214, 354), point(360, 286), point(490, 311), point(548, 322), point(620, 280), point(696, 238), point(720, 224)], 'Shadow bridge, filled crescent route through all four witnessed anchors'),
      lane('night-stair-transition', 96, allLightStates, [point(548, 322), point(620, 280), point(660, 250), point(696, 238)], 'Shared transition landing containing both shadow and moon controls'),
      lane('night-stair-moon', 88, ['moon'], [point(620, 280), point(560, 220), point(476, 126), point(560, 150), point(660, 180), point(800, 160), point(922, 144)], 'Moon bridge, split disc route through Selene to the False Sky'),
      lane('night-stair-sun-recovery', 88, ['sun'], [point(876, 144), point(800, 160), point(660, 180), point(660, 250), point(620, 280)], 'Sun-state recovery route back to the shared transition controls'),
    ],
    decor: [
      { id: 'night-stair-pillar-1', kind: 'moon-pillar', x: 286, y: 210 }, { id: 'night-stair-pillar-2', kind: 'moon-pillar', x: 760, y: 310 },
      { id: 'night-stair-witness-ribbons', kind: 'witness-ribbons', x: 506, y: 194 },
    ],
    light: { initialStateId: 'shadow', controllerIds: ['nyx-seal', 'selene-witness'], laneIds: ['night-stair-shadow', 'night-stair-transition', 'night-stair-moon', 'night-stair-sun-recovery'] },
  },

  'false-sky': {
    id: 'false-sky', bounds: { w: 960, h: 540 }, palette: PALETTES.falseSky,
    themeId: 'last-name-counterfeit-dawn', decorSetId: 'helios-fracture-rooms',
    spawns: {
      'from-night-stair': spawn('from-night-stair', 76, 382, 0, 'moon'),
      'from-approach': spawn('from-approach', 878, 150, Math.PI, 'sun'),
      'mirrors-aligned': spawn('mirrors-aligned', 576, 238, 0.4, 'sun'),
    },
    entities: [
      { id: 'helios', kind: 'npc', x: 244, y: 336, name: 'Helios', label: 'Ask Helios to expose the false dawn', accessibleLabel: 'Speak with Helios beside the first sun mirror', conversationId: 'act5-helios-false-dawn', optionalConversationIds: ['act5-three-lights'] },
      { id: 'sun-mirror-1', kind: 'interact', interactionType: 'light-switch', x: 330, y: 350, name: 'Labor Mirror', label: ACT5_LIGHT_POLARITY_STATES.sun.label, accessibleLabel: 'Sun mirror one of three, rayed disc; opens the exposed forward path', lightStateId: 'sun', controllerSourceId: ACT5_LIGHT_POLARITY_STATES.sun.controller, shapeGlyph: ACT5_LIGHT_POLARITY_STATES.sun.shapeGlyph },
      { id: 'selene-return-witness', kind: 'interact', interactionType: 'light-switch', x: 400, y: 300, name: 'Selene Return Witness', label: ACT5_LIGHT_POLARITY_STATES.moon.label, accessibleLabel: 'Moon bridge control, split disc; restores the reflected return path', lightStateId: 'moon', controllerSourceId: ACT5_LIGHT_POLARITY_STATES.moon.controller, shapeGlyph: ACT5_LIGHT_POLARITY_STATES.moon.shapeGlyph },
      { id: 'sun-mirror-2', kind: 'interact', x: 492, y: 260, name: 'Witness Mirror', label: 'Turn the second sun mirror', accessibleLabel: 'Sun mirror two of three, rayed disc', lightStateId: 'sun', controllerSourceId: ACT5_LIGHT_POLARITY_STATES.sun.controller, shapeGlyph: ACT5_LIGHT_POLARITY_STATES.sun.shapeGlyph },
      { id: 'sun-mirror-3', kind: 'interact', x: 650, y: 188, name: 'Cost Mirror', label: 'Turn the third sun mirror', accessibleLabel: 'Sun mirror three of three, rayed disc', lightStateId: 'sun', controllerSourceId: ACT5_LIGHT_POLARITY_STATES.sun.controller, shapeGlyph: ACT5_LIGHT_POLARITY_STATES.sun.shapeGlyph },
      { id: 'fracture-room-a', kind: 'marker', x: 420, y: 404, name: 'First Time Fracture', label: 'Enter fixed fracture state A' },
      { id: 'fracture-room-b', kind: 'marker', x: 704, y: 322, name: 'Second Time Fracture', label: 'Enter fixed fracture state B' },
      { id: 'fracture-room-a-side', kind: 'marker', x: 508, y: 430, name: 'Afterimage Gallery', label: 'Inspect the fixed afterimages' },
      { id: 'fracture-exit', kind: 'marker', x: 820, y: 190, name: 'Fracture Exit', label: 'Leave the fixed time fractures', accessibleLabel: 'Time fracture exit' },
      { id: 'apollo', kind: 'npc', x: 574, y: 416, name: 'Apollo', label: 'Hear the light of revelation', conversationId: 'act5-three-lights', optionalConversationIds: ['act5-three-lights'] },
    ],
    exits: [
      { id: 'false-sky-to-night-stair', x: 38, y: 382, toMapId: 'night-stair', spawnId: 'from-false-sky', returnSpawnId: 'from-night-stair', kind: 'moon-bridge', gate: [], accessibleLabel: 'Return to the Night Stair' },
      { id: 'false-sky-to-loom-approach', x: 922, y: 150, toMapId: 'silent-loom-approach', spawnId: 'from-false-sky', returnSpawnId: 'from-approach', kind: 'sun-mirror-route', gate: [{ kind: 'flag', flagId: 'act5-time-fractures-crossed', value: true }], accessibleLabel: 'Proceed to the Silent Loom approach, point of no return' },
      { id: 'combat-act5-false-sky', x: 760, y: 300, kind: 'combat', encounterId: 'enc-act5-false-sky', label: 'Survive the Counterfeit Dawn', accessibleLabel: 'Begin Counterfeit Dawn encounter', gate: [] },
    ],
    collisions: [
      solid('false-sky-north-ruin', 38, 42, 300, 72), solid('false-sky-sun-dais', 438, 52, 112, 72),
      solid('false-sky-east-ruin', 838, 246, 82, 216), solid('false-sky-south-ruin', 110, 448, 272, 54),
      solid('false-sky-fracture-pillar', 586, 340, 74, 58),
    ],
    traversalLanes: [
      lane('false-sky-moon-arrival', 92, ['moon'], [point(38, 382), point(76, 382), point(244, 336), point(348, 334), point(388, 314)], 'Moonlit arrival route to Helios and the first sun control'),
      lane('false-sky-transition', 96, allLightStates, [point(324, 344), point(348, 334), point(388, 314), point(420, 300)], 'Shared transition landing containing sun and moon controls'),
      lane('false-sky-sun-road', 92, ['sun'], [point(388, 314), point(492, 260), point(576, 238), point(650, 188), point(820, 190), point(922, 150)], 'Sun bridge, rayed disc route through the remaining mirrors to the Loom approach'),
      lane('false-sky-sun-fractures', 76, ['sun'], [point(388, 314), point(420, 404), point(508, 430), point(704, 322), point(820, 190)], 'Sun route through fixed fracture A then B, never a rewind of player input'),
      lane('false-sky-shadow-recovery', 92, ['shadow'], [point(76, 382), point(244, 336), point(348, 334), point(388, 314)], 'Shadow-state recovery route to the shared transition controls'),
    ],
    decor: [
      { id: 'false-dawn-disc', kind: 'false-sun', x: 492, y: 88 }, { id: 'fracture-obelisk-a', kind: 'time-obelisk', x: 420, y: 404 },
      { id: 'fracture-obelisk-b', kind: 'time-obelisk', x: 704, y: 322 },
    ],
    light: { initialStateId: 'moon', controllerIds: ['sun-mirror-1', 'selene-return-witness'], laneIds: ['false-sky-moon-arrival', 'false-sky-transition', 'false-sky-sun-road', 'false-sky-sun-fractures', 'false-sky-shadow-recovery'] },
  },

  'silent-loom-approach': {
    id: 'silent-loom-approach', bounds: { w: 960, h: 540 }, palette: PALETTES.approach,
    themeId: 'last-name-witness-seals', decorSetId: 'suppressed-epithet-causeway',
    spawns: {
      'from-false-sky': spawn('from-false-sky', 76, 282, 0, 'sun'),
      'from-loom': spawn('from-loom', 880, 282, Math.PI, 'sun'),
      'epithets-sealed': spawn('epithets-sealed', 650, 282, 0, 'sun'),
    },
    entities: [
      ...ACT5_WITNESSED_DEEDS.map((deed, index) => ({
        id: deed.sealId,
        kind: 'interact',
        x: 240 + index * 150,
        y: index % 2 === 0 ? 220 : 344,
        name: `Seal of ${deed.epithetId}`,
        label: `Restore Act ${deed.act}: ${deed.epithetId}`,
        accessibleLabel: `Witnessed-deed seal ${deed.act} of four, ${deed.epithetId}`,
        act: deed.act,
        epithetId: deed.epithetId,
        requiredFlagId: deed.requiredFlagId,
        witnessedDeed: deed.witnessedDeed,
      })),
    ],
    exits: [
      { id: 'loom-approach-to-false-sky', x: 38, y: 282, toMapId: 'false-sky', spawnId: 'from-approach', returnSpawnId: 'from-false-sky', kind: 'sun-mirror-route', gate: [], accessibleLabel: 'Return to the False Sky' },
      { id: 'loom-approach-to-silent-loom', x: 922, y: 282, toMapId: 'silent-loom', spawnId: 'from-approach', returnSpawnId: 'from-loom', kind: 'witness-seal', gate: [{ kind: 'flag', flagId: 'act5-epithets-restored', value: true }], accessibleLabel: 'Enter the Silent Loom after restoring all four epithets' },
      { id: 'combat-act5-loom-approach', x: 540, y: 282, kind: 'combat', encounterId: 'enc-act5-loom-approach', label: 'Break the suppressed seal bonds', accessibleLabel: 'Begin Five Suppressed Seals encounter', gate: [] },
    ],
    collisions: [
      solid('approach-north-wall-west', 30, 42, 332, 76), solid('approach-north-wall-east', 606, 42, 324, 76),
      solid('approach-south-wall-west', 26, 426, 320, 72), solid('approach-south-wall-east', 624, 426, 306, 72),
      solid('approach-suppression-pillar', 452, 92, 66, 86),
    ],
    traversalLanes: [
      lane('epithet-processional', 82, allLightStates, [point(38, 282), point(240, 220), point(390, 344), point(540, 220), point(690, 344), point(922, 282)], 'Numbered Act I through Act IV witnessed-deed restoration route'),
      lane('epithet-return', 50, allLightStates, [point(240, 344), point(480, 382), point(690, 344)], 'Safe return lane between restored seals'),
    ],
    decor: [
      { id: 'approach-thread-arch-1', kind: 'loom-arch', x: 170, y: 154 }, { id: 'approach-thread-arch-2', kind: 'loom-arch', x: 790, y: 154 },
      { id: 'approach-witness-brazier', kind: 'brazier', x: 540, y: 374 },
    ],
    light: { initialStateId: 'sun', controllerIds: [], laneIds: ['epithet-processional', 'epithet-return'] },
  },

  'silent-loom': {
    id: 'silent-loom', bounds: { w: 960, h: 540 }, palette: PALETTES.loom,
    themeId: 'last-name-silent-loom', decorSetId: 'loom-guardian-regent-chamber',
    spawns: {
      'from-approach': spawn('from-approach', 76, 400, 0, 'sun'),
      'regent-phase': spawn('regent-phase', 480, 274, 0, 'sun'),
      'accord-chamber': spawn('accord-chamber', 718, 266, 0, 'sun'),
      'from-overlook': spawn('from-overlook', 876, 118, Math.PI, 'sun'),
    },
    entities: [
      { id: 'loom-heart', kind: 'marker', x: 476, y: 118, name: 'Loom Heart', label: 'The Silent Loom heart' },
      { id: 'guardian-ring', kind: 'marker', x: 336, y: 294, name: 'Guardian Ring', label: 'Enter the Loom Guardian ring' },
      { id: 'regent-dais', kind: 'marker', x: 592, y: 240, name: 'Regent Dais', label: 'Confront Damas, the Quiet Regent' },
      {
        id: 'accord-table', kind: 'choice', x: 718, y: 266, name: 'The New Accord',
        label: 'Write the New Accord', accessibleLabel: 'Choose one of three covenant endings; each option announces its promise, cost, and safeguards',
        choiceIds: endingOptions.map((option) => option.id), options: endingOptions,
      },
      { id: 'kallias', kind: 'npc', x: 792, y: 320, name: 'Kallias', label: 'Witness the Last Name', accessibleLabel: 'Speak with Kallias to publish the Accord', conversationId: 'act5-epilogue' },
      { id: 'restored-covenant-loom', kind: 'station', stationId: 'loom', x: 780, y: 400, name: 'Restored Covenant Loom', label: 'Weave at the restored Silent Loom' },
    ],
    exits: [
      { id: 'silent-loom-to-approach', x: 38, y: 400, toMapId: 'silent-loom-approach', spawnId: 'from-loom', returnSpawnId: 'from-approach', kind: 'witness-seal', gate: [], accessibleLabel: 'Return to the Silent Loom approach' },
      { id: 'silent-loom-to-overlook', x: 922, y: 118, toMapId: 'accord-overlook', spawnId: 'epilogue', returnSpawnId: 'from-overlook', kind: 'epilogue-path', gate: [{ kind: 'flag', flagId: 'act5-last-name-witnessed', value: true }], accessibleLabel: 'Walk the epilogue path to Accord Overlook' },
      { id: 'combat-act5-loom-guardian', x: 336, y: 294, kind: 'combat', encounterId: 'boss-act5-loom-guardian', label: 'Face the Loom Guardian', accessibleLabel: 'Begin the Loom Guardian boss encounter', gate: [] },
      { id: 'combat-act5-quiet-regent', x: 592, y: 240, kind: 'combat', encounterId: 'boss-act5-quiet-regent', label: 'Confront the Quiet Regent', accessibleLabel: 'Begin the Quiet Regent boss encounter with testimony interruption', gate: [{ kind: 'flag', flagId: 'act5-loom-guardian-defeated', value: true }] },
    ],
    collisions: [
      solid('loom-north-thread-bank', 26, 30, 314, 68), solid('loom-north-archive', 642, 30, 290, 68),
      solid('loom-south-thread-bank', 24, 454, 330, 52), solid('loom-south-archive', 650, 452, 278, 54),
      solid('loom-heart-base', 438, 80, 76, 66),
    ],
    traversalLanes: [
      lane('loom-boss-processional', 88, allLightStates, [point(38, 400), point(210, 356), point(336, 294), point(480, 274), point(592, 240), point(718, 266), point(922, 118)], 'Ordered Guardian, Regent, Accord, and epilogue route'),
      lane('loom-safe-boundary', 50, allLightStates, [point(336, 382), point(480, 360), point(592, 350), point(718, 330)], 'Safe checkpoint lane between boss encounters'),
    ],
    decor: [
      { id: 'loom-column-1', kind: 'thread-column', x: 210, y: 162 }, { id: 'loom-column-2', kind: 'thread-column', x: 760, y: 170 },
      { id: 'loom-witness-fire', kind: 'brazier', x: 718, y: 190 },
    ],
    light: { initialStateId: 'shadow', controllerIds: [], laneIds: ['loom-boss-processional', 'loom-safe-boundary'] },
  },

  'accord-overlook': {
    id: 'accord-overlook', bounds: { w: 960, h: 540 }, palette: PALETTES.overlook,
    themeId: 'last-name-accord-overlook', decorSetId: 'public-accord-tableau',
    spawns: {
      epilogue: spawn('epilogue', 480, 280, -0.2, 'sun'),
      'from-loom': spawn('from-loom', 80, 358, 0, 'sun'),
    },
    entities: [
      { id: 'public-accord', kind: 'interact', x: 480, y: 240, name: 'The Public Accord', label: 'Read the published covenant', accessibleLabel: 'Read the chosen Accord and its visible safeguards' },
      { id: 'witness-path-stone', kind: 'marker', x: 700, y: 326, name: 'Witness Path Stone', label: 'Review the reopened witness paths' },
      { id: 'epilogue-sky', kind: 'marker', x: 480, y: 112, name: 'Plural Sky', label: 'Look across the restored regions' },
      { id: 'kallias', kind: 'npc', x: 536, y: 304, name: 'Kallias', label: 'Witness the Last Name', conversationId: 'act5-epilogue' },
      { id: 'thessa', kind: 'npc', x: 420, y: 316, name: 'Thessa', label: 'Leave room for the next refusal', conversationId: 'act5-epilogue' },
      { id: 'accord-overlook-ambrosial-ash', kind: 'resource', x: 770, y: 380, name: 'Covenant-Grown Ash', label: 'Cut a bough from the covenant-grown ash', skillId: 'woodcutting', itemId: 'ambrosial-ash', level: 70, xp: 145, capacity: 1, respawnTicks: 1000 },
    ],
    exits: [
      { id: 'overlook-to-silent-loom', x: 38, y: 358, toMapId: 'silent-loom', spawnId: 'from-overlook', returnSpawnId: 'from-loom', kind: 'epilogue-path', gate: [{ kind: 'flag', flagId: 'mq-act5-last-name-completed', value: true }], accessibleLabel: 'Return to the Silent Loom covenant chamber' },
    ],
    collisions: [
      solid('overlook-north-colonnade-west', 36, 40, 286, 66), solid('overlook-north-colonnade-east', 642, 40, 280, 66),
      solid('overlook-south-cliff-west', 26, 448, 330, 58), solid('overlook-south-cliff-east', 612, 448, 316, 58),
      solid('overlook-accord-plinth', 442, 194, 76, 44),
    ],
    traversalLanes: [
      lane('accord-public-path', 82, allLightStates, [point(38, 358), point(240, 330), point(480, 280), point(700, 326), point(890, 284)], 'Open public route through the Accord overlook'),
      lane('accord-sky-path', 48, allLightStates, [point(480, 280), point(480, 180), point(480, 112)], 'Safe overlook path to the plural sky'),
    ],
    decor: [
      { id: 'accord-column-1', kind: 'column', x: 304, y: 154 }, { id: 'accord-column-2', kind: 'column', x: 656, y: 154 },
      { id: 'accord-brazier-1', kind: 'brazier', x: 360, y: 360 }, { id: 'accord-brazier-2', kind: 'brazier', x: 600, y: 360 },
    ],
    light: { initialStateId: 'sun', controllerIds: [], laneIds: ['accord-public-path', 'accord-sky-path'] },
  },
})

function mergeSpawnTable(staticPocket, runtimeMap) {
  return Object.fromEntries(Object.entries(staticPocket.spawns).map(([id, definition]) => [
    id,
    {
      ...definition,
      ...runtimeMap.spawns[id],
      id,
      ...(runtimeMap.spawns[id]?.arrivalState
        ? { arrivalState: { ...runtimeMap.spawns[id].arrivalState } }
        : {}),
    },
  ]))
}

export function act5RuntimeMapById(id) {
  return (typeof id === 'string' && ACT5_RUNTIME_MAPS[id]) || null
}

export function act5RenderablePocketById(id) {
  const definition = act5PocketById(id)
  const runtime = act5RuntimeMapById(id)
  if (!definition || !runtime) return null
  const spawns = mergeSpawnTable(definition, runtime)
  return {
    ...definition,
    ...runtime,
    spawns,
    spawn: spawns[definition.spawnId],
    entities: runtime.entities.map((entity) => ({
      ...entity,
      ...(entity.choiceIds ? { choiceIds: [...entity.choiceIds] } : {}),
      ...(entity.options ? { options: entity.options.map((option) => ({ ...option })) } : {}),
    })),
    exits: runtime.exits.map((exit) => ({ ...exit, gate: exit.gate.map((condition) => ({ ...condition })) })),
    collisions: runtime.collisions.map((collision) => ({ ...collision })),
    traversalLanes: runtime.traversalLanes.map((item) => ({
      ...item,
      stateIds: [...item.stateIds],
      points: item.points.map((p) => ({ ...p })),
    })),
    decor: runtime.decor.map((item) => ({ ...item })),
    light: {
      ...runtime.light,
      controllerIds: [...runtime.light.controllerIds],
      laneIds: [...runtime.light.laneIds],
    },
  }
}

export const ACT5_RENDERABLE_MAPS = deepFreeze(Object.fromEntries(
  Object.keys(ACT5_POCKETS).map((id) => [id, act5RenderablePocketById(id)]),
))

export function act5RuntimeSpawnById(mapId, spawnId) {
  const map = act5RuntimeMapById(mapId)
  return (map && typeof spawnId === 'string' && map.spawns[spawnId]) || null
}

export function act5RuntimeEntityById(mapId, entityId) {
  const map = act5RuntimeMapById(mapId)
  return map?.entities.find((entity) => entity.id === entityId) || null
}

export function act5RuntimeExitById(exitId) {
  for (const map of Object.values(ACT5_RUNTIME_MAPS)) {
    const exit = map.exits.find((candidate) => candidate.id === exitId)
    if (exit) return exit
  }
  return null
}

export function act5RuntimeMarkerById(mapId, markerId) {
  const map = act5RuntimeMapById(mapId)
  if (!map || typeof markerId !== 'string') return null
  return map.spawns[markerId]
    || map.entities.find((entity) => entity.id === markerId)
    || map.exits.find((exit) => exit.id === markerId)
    || map.decor.find((item) => item.id === markerId)
    || null
}

export function validateAct5Runtime() {
  const errors = []
  for (const [id, pocket] of Object.entries(ACT5_POCKETS)) {
    const runtime = act5RuntimeMapById(id)
    if (!runtime) { errors.push(`missing runtime map: ${id}`); continue }
    if (runtime.bounds.w !== 960 || runtime.bounds.h !== 540) errors.push(`invalid bounds: ${id}`)
    for (const spawnId of Object.keys(pocket.spawns)) {
      const runtimeSpawn = act5RuntimeSpawnById(id, spawnId)
      if (!runtimeSpawn) errors.push(`missing spawn geometry: ${id}:${spawnId}`)
      else if (!ACT5_LIGHT_POLARITY_RULES.stateIds.includes(runtimeSpawn.arrivalState?.lightStateId)) {
        errors.push(`invalid spawn light state: ${id}:${spawnId}`)
      }
    }
    for (const controllerId of runtime.light.controllerIds) {
      const controller = act5RuntimeEntityById(id, controllerId)
      if (!controller) errors.push(`missing light controller: ${id}:${controllerId}`)
      else if (!ACT5_LIGHT_POLARITY_RULES.switchSources.includes(controller.controllerSourceId)) {
        errors.push(`invalid light controller source: ${id}:${controllerId}`)
      }
    }
  }
  for (const connection of ACT5_CONNECTIONS) {
    const exit = act5RuntimeExitById(connection.id)
    if (!exit) { errors.push(`missing exit geometry: ${connection.id}`); continue }
    if (exit.toMapId !== connection.to || exit.spawnId !== connection.arrivalSpawnId) {
      errors.push(`exit destination mismatch: ${connection.id}`)
    }
    if (exit.returnSpawnId !== connection.returnSpawnId) errors.push(`exit return mismatch: ${connection.id}`)
    if (JSON.stringify(exit.gate) !== JSON.stringify(connection.gate || [])) {
      errors.push(`exit gate mismatch: ${connection.id}`)
    }
  }
  return errors
}
