// Act IV render-ready world geometry — Forge March: The False Constellation.
//
// act4Content.js owns story IDs, quest order, and graph semantics. This module
// supplies deterministic coordinates, collision-safe traversal corridors, and
// explicit UI hooks for combat, optional-quest acceptance, and choices. It is
// data-only: no DOM, time, network, or mutable shared state.

import {
  ACT4_CONNECTIONS,
  ACT4_POCKETS,
  ACT4_PRESSURE_LANES,
  ACT4_PRESSURE_RULES,
  act4PocketById,
} from './act4Content.js'

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

const PALETTES = deepFreeze({
  slag: {
    name: 'slag-road', sky: '#6f625d', skyLow: '#d1a36f', sea: '#45535a', hill: '#675b50',
    sun: '#ffe0a0', haze: 'rgba(232,174,105,0.28)', marble: '#d7c2a1', marbleMid: '#aa9275',
    marbleShadow: '#71604f', grout: '#332b29', stone: '#817065', stoneDark: '#443b39',
    terracotta: '#bd542e', terracottaDark: '#75331f', bronze: '#a56c34', gold: '#e1b35c',
    glow: '#ffb25a', ink: '#251c1b', outline: '#1b1515', accent: '#ba633f', danger: '#ba382d',
    void: '#120e10', grass: '#69664f', path: '#b3946e', interior: false,
  },
  foundry: {
    name: 'bronze-foundry', sky: '#4d3a38', skyLow: '#a45f42', sea: '#353f43', hill: '#51423c',
    sun: '#ffd38a', haze: 'rgba(226,115,66,0.25)', marble: '#bda98d', marbleMid: '#8e7660',
    marbleShadow: '#5e4a40', grout: '#2d2525', stone: '#74615a', stoneDark: '#382f30',
    terracotta: '#c84b27', terracottaDark: '#76281f', bronze: '#b77936', gold: '#efb74e',
    glow: '#ff8a36', ink: '#241719', outline: '#180f12', accent: '#d45d32', danger: '#e0382e',
    void: '#10090c', grass: '#5e5947', path: '#a37f5d', interior: true,
  },
  press: {
    name: 'name-press', sky: '#392e37', skyLow: '#744b4a', sea: '#30383c', hill: '#44383e',
    sun: '#efc184', haze: 'rgba(197,91,64,0.22)', marble: '#b4a089', marbleMid: '#826e63',
    marbleShadow: '#55464a', grout: '#282126', stone: '#6b5d61', stoneDark: '#332b32',
    terracotta: '#a84630', terracottaDark: '#632a28', bronze: '#a66d3d', gold: '#ddb05b',
    glow: '#ff8154', ink: '#21171e', outline: '#170f16', accent: '#b55e50', danger: '#cf393b',
    void: '#0d0910', grass: '#575449', path: '#947b68', interior: true,
  },
  vault: {
    name: 'atlas-vault', sky: '#27394d', skyLow: '#6a7580', sea: '#273f4d', hill: '#3a4751',
    sun: '#c9d7d2', haze: 'rgba(135,174,183,0.23)', marble: '#b9c2bc', marbleMid: '#87938f',
    marbleShadow: '#56666a', grout: '#233039', stone: '#66757a', stoneDark: '#33434a',
    terracotta: '#955044', terracottaDark: '#5d3434', bronze: '#8d7753', gold: '#cdbb77',
    glow: '#86d6df', ink: '#14232d', outline: '#0d1922', accent: '#52899d', danger: '#b44145',
    void: '#080f16', grass: '#586865', path: '#929c92', interior: true,
  },
  constellation: {
    name: 'false-constellation', sky: '#17182d', skyLow: '#493548', sea: '#202b3b', hill: '#2f3040',
    sun: '#e7d39b', haze: 'rgba(125,116,163,0.22)', marble: '#ada6aa', marbleMid: '#77717d',
    marbleShadow: '#4c4858', grout: '#20202e', stone: '#626170', stoneDark: '#30313e',
    terracotta: '#93413c', terracottaDark: '#58282d', bronze: '#94704b', gold: '#d7b76b',
    glow: '#9bd8ff', ink: '#121522', outline: '#0a0d18', accent: '#776ca7', danger: '#c13e50',
    void: '#060812', grass: '#515565', path: '#88828d', interior: false,
  },
})

const point = (x, y) => ({ x, y })
const spawn = (id, x, y, facing) => ({ id, x, y, facing })
const solid = (id, x, y, w, h) => ({ id, kind: 'solid', x, y, w, h })
const lane = (id, width, stateIds, points) => ({ id, width, stateIds, points })
const ALL_PRESSURE_STATES = ACT4_PRESSURE_RULES.states

export const ACT4_RUNTIME_MAPS = deepFreeze({
  'slag-road': {
    id: 'slag-road', bounds: { w: 960, h: 540 }, palette: PALETTES.slag,
    themeId: 'forge-march-refugee-road', decorSetId: 'slag-camp-and-lifts',
    spawns: {
      'refugee-camp': spawn('refugee-camp', 150, 382, -0.1),
      'from-foundry': spawn('from-foundry', 884, 270, Math.PI),
      'from-vault': spawn('from-vault', 160, 160, 0),
      'dawn-muster': spawn('dawn-muster', 460, 392, -Math.PI / 2),
    },
    entities: [
      { id: 'lift-controls', kind: 'interact', x: 244, y: 296, name: 'March Lift Controls', label: 'Inspect the relief lifts' },
      { id: 'strategy-board', kind: 'choice', x: 346, y: 350, name: 'Forge March Strategy Board', label: 'Choose the march plan', objectiveId: 'choose-march-plan', choiceIds: ['athena-precise-route', 'ares-direct-breach'] },
      { id: 'prometheus-shrine', kind: 'shrine', x: 318, y: 172, name: 'Prometheus Shrine', label: 'Tend the lawful flame', deityId: 'prometheus', savePointId: 'shrine-slag-road-prometheus' },
      { id: 'athena-march-captain', kind: 'npc', x: 410, y: 330, name: 'Athena', label: 'Hear the precise route' },
      { id: 'ares-march-captain', kind: 'npc', x: 456, y: 340, name: 'Ares', label: 'Hear the direct breach' },
      { id: 'mortal-draft-table', kind: 'choice', x: 540, y: 382, name: 'Mortal-Authored Draft', label: 'Ratify the mortal draft', objectiveId: 'ratify-mortal-draft', choiceIds: ['licensed-flame', 'guild-stewardship', 'revocable-hearths'] },
      { id: 'slag-road-cedar', kind: 'resource', x: 700, y: 340, name: 'March Cedar', label: 'Cut the fire-scarred march cedar', skillId: 'woodcutting', itemId: 'cedar-log', level: 30, xp: 45 },
      { id: 'doros-march-quartermaster', kind: 'shop', shopId: 'forge-march-quartermaster', x: 620, y: 400, name: 'Doros', label: 'Trade campaign goods with Doros' },
    ],
    exits: [
      { id: 'plan-athena-first-edge', x: 920, y: 238, toMapId: 'bronze-foundry', spawnId: 'from-slag-road', returnSpawnId: 'from-foundry', kind: 'foot', planId: 'athena-precise-route', label: 'Take Athena\'s relief route', gate: [] },
      { id: 'plan-ares-first-edge', x: 920, y: 302, toMapId: 'bronze-foundry', spawnId: 'from-slag-road', returnSpawnId: 'from-foundry', kind: 'foot', planId: 'ares-direct-breach', label: 'Take Ares\'s slag breach', gate: [] },
    ],
    collisions: [
      solid('slag-north-refinery', 54, 42, 286, 76), solid('slag-north-crane', 642, 48, 220, 82),
      solid('slag-west-cliff', 24, 194, 42, 242), solid('slag-south-stockpile', 650, 418, 230, 58),
      solid('slag-broken-lift', 570, 188, 84, 72),
    ],
    traversalLanes: [
      lane('slag-main-road', 74, ALL_PRESSURE_STATES, [point(130, 382), point(310, 366), point(500, 330), point(710, 300), point(920, 270)]),
      lane('slag-shrine-path', 50, ALL_PRESSURE_STATES, [point(244, 296), point(282, 232), point(318, 172)]),
      lane('slag-dawn-muster', 54, ALL_PRESSURE_STATES, [point(310, 366), point(460, 392), point(540, 382)]),
    ],
    decor: [
      { id: 'slag-column', kind: 'column', x: 520, y: 126 }, { id: 'slag-brazier-1', kind: 'brazier', x: 212, y: 190 },
      { id: 'slag-brazier-2', kind: 'brazier', x: 748, y: 214 }, { id: 'slag-refugee-urns', kind: 'urn', x: 112, y: 454 },
    ],
    pressure: { initialStateId: 'safe', laneIds: [], valveIds: [] },
  },

  'bronze-foundry': {
    id: 'bronze-foundry', bounds: { w: 960, h: 540 }, palette: PALETTES.foundry,
    themeId: 'forge-march-bronze-foundry', decorSetId: 'campaign-foundry-production-floor',
    spawns: {
      'from-slag-road': spawn('from-slag-road', 72, 270, 0),
      'from-name-press': spawn('from-name-press', 886, 270, Math.PI),
      'foundry-cleared': spawn('foundry-cleared', 480, 402, -Math.PI / 2),
    },
    entities: [
      { id: 'production-lane-1', kind: 'marker', x: 298, y: 216, name: 'Production Lane I', label: 'Shut the first production lane' },
      { id: 'production-lane-2', kind: 'marker', x: 480, y: 216, name: 'Production Lane II', label: 'Shut the second production lane' },
      { id: 'production-lane-3', kind: 'marker', x: 662, y: 216, name: 'Production Lane III', label: 'Shut the third production lane' },
      { id: 'pressure-valve-1', kind: 'pressure-valve', x: 298, y: 350, name: 'Lane I Pressure Valve', label: 'Cycle lane-one pressure' },
      { id: 'pressure-valve-2', kind: 'pressure-valve', x: 480, y: 350, name: 'Lane II Pressure Valve', label: 'Cycle lane-two pressure' },
      { id: 'pressure-valve-3', kind: 'pressure-valve', x: 662, y: 350, name: 'Lane III Pressure Valve', label: 'Cycle lane-three pressure' },
      { id: 'foundry-charred-ember', kind: 'resource', x: 240, y: 380, name: 'Lawful Furnace Embers', label: 'Gather a charred ember from the cooled furnace', skillId: 'foraging', itemId: 'charred-ember', level: 20, xp: 36 },
      { id: 'bronze-foundry-forge', kind: 'station', stationId: 'bronze-forge', x: 720, y: 380, name: 'Bronze Foundry Forge', label: 'Work metal at the foundry forge' },
    ],
    exits: [
      { id: 'foundry-to-slag-road', x: 38, y: 270, toMapId: 'slag-road', spawnId: 'from-foundry', returnSpawnId: 'from-slag-road', kind: 'foot', label: 'Return to the Slag Road', gate: [] },
      { id: 'foundry-to-name-press', x: 922, y: 270, toMapId: 'name-press', spawnId: 'from-foundry', returnSpawnId: 'from-name-press', kind: 'foot', label: 'Enter the Name-Press', gate: [] },
      { id: 'combat-act4-foundry-threshold', x: 480, y: 274, kind: 'combat', encounterId: 'enc-act4-foundry-threshold', label: 'Break the foundry guard', gate: [] },
    ],
    collisions: [
      solid('foundry-north-wall-left', 34, 38, 300, 66), solid('foundry-north-wall-right', 626, 38, 300, 66),
      solid('foundry-south-casting-bed-left', 40, 444, 270, 54), solid('foundry-south-casting-bed-right', 650, 444, 270, 54),
      solid('foundry-smelter-west', 118, 150, 86, 72), solid('foundry-smelter-east', 756, 150, 86, 72),
    ],
    traversalLanes: [
      lane('pressure-lane-1', 52, ALL_PRESSURE_STATES, [point(38, 270), point(230, 274), point(390, 274), point(480, 274)]),
      lane('pressure-lane-2', 52, ALL_PRESSURE_STATES, [point(480, 274), point(570, 274), point(730, 274), point(922, 270)]),
      lane('pressure-lane-3', 52, ALL_PRESSURE_STATES, [point(298, 350), point(480, 402), point(662, 350)]),
    ],
    decor: [
      { id: 'foundry-furnace-1', kind: 'brazier', x: 250, y: 148 }, { id: 'foundry-furnace-2', kind: 'brazier', x: 710, y: 148 },
      { id: 'foundry-column-1', kind: 'column', x: 388, y: 142 }, { id: 'foundry-column-2', kind: 'column', x: 572, y: 142 },
    ],
    pressure: { initialStateId: 'safe', laneIds: ACT4_PRESSURE_LANES, valveIds: ['pressure-valve-1', 'pressure-valve-2', 'pressure-valve-3'] },
  },

  'name-press': {
    id: 'name-press', bounds: { w: 960, h: 540 }, palette: PALETTES.press,
    themeId: 'forge-march-name-press', decorSetId: 'epithet-die-relief-floor',
    spawns: {
      'from-foundry': spawn('from-foundry', 72, 270, 0),
      'from-vault': spawn('from-vault', 886, 270, Math.PI),
      'name-press-relief': spawn('name-press-relief', 480, 402, -Math.PI / 2),
    },
    entities: [
      { id: 'heat-routing-floor', kind: 'marker', x: 480, y: 318, name: 'Heat-Routing Floor', label: 'Read the heat-routing floor' },
      { id: 'epithet-dies', kind: 'marker', x: 480, y: 164, name: 'Epithet Dies', label: 'Inspect the stolen epithet dies' },
      { id: 'pressure-relief-1', kind: 'pressure-valve', x: 326, y: 342, name: 'West Pressure Relief', label: 'Open the west pressure relief' },
      { id: 'pressure-relief-2', kind: 'pressure-valve', x: 634, y: 342, name: 'East Pressure Relief', label: 'Open the east pressure relief' },
      { id: 'prometheus-brazier', kind: 'interact', x: 480, y: 376, name: 'Prometheus\'s Lawful Brazier', label: 'Return the stolen fire' },
    ],
    exits: [
      { id: 'name-press-to-foundry', x: 38, y: 270, toMapId: 'bronze-foundry', spawnId: 'from-name-press', returnSpawnId: 'from-foundry', kind: 'foot', label: 'Return to the Bronze Foundry', gate: [] },
      { id: 'name-press-to-vault', x: 922, y: 270, toMapId: 'atlas-vault', spawnId: 'from-name-press', returnSpawnId: 'from-vault', kind: 'foot', label: 'Enter the Atlas Vault', gate: [] },
      { id: 'combat-act4-name-press', x: 480, y: 242, kind: 'combat', encounterId: 'enc-act4-name-press', label: 'Face the Name-Press wardens', gate: [] },
    ],
    collisions: [
      solid('press-north-dies-left', 42, 38, 292, 72), solid('press-north-dies-right', 626, 38, 292, 72),
      solid('press-south-machinery-left', 52, 448, 276, 50), solid('press-south-machinery-right', 632, 448, 276, 50),
      solid('press-west-piston', 156, 160, 80, 66), solid('press-east-piston', 724, 160, 80, 66),
    ],
    traversalLanes: [
      lane('press-main-floor', 72, ALL_PRESSURE_STATES, [point(38, 270), point(240, 274), point(480, 242), point(720, 274), point(922, 270)]),
      lane('press-relief-floor', 56, ALL_PRESSURE_STATES, [point(326, 342), point(480, 376), point(634, 342)]),
      lane('press-die-aisle', 48, ALL_PRESSURE_STATES, [point(480, 242), point(480, 164)]),
    ],
    decor: [
      { id: 'press-brazier-1', kind: 'brazier', x: 286, y: 188 }, { id: 'press-brazier-2', kind: 'brazier', x: 674, y: 188 },
      { id: 'press-column-1', kind: 'column', x: 390, y: 132 }, { id: 'press-column-2', kind: 'column', x: 570, y: 132 },
    ],
    pressure: { initialStateId: 'safe', laneIds: ['press-main-floor', 'press-relief-floor', 'press-die-aisle'], valveIds: ['pressure-relief-1', 'pressure-relief-2'] },
  },

  'atlas-vault': {
    id: 'atlas-vault', bounds: { w: 960, h: 540 }, palette: PALETTES.vault,
    themeId: 'forge-march-atlas-vault', decorSetId: 'chain-anchor-load-platforms',
    spawns: {
      'from-name-press': spawn('from-name-press', 72, 272, 0),
      'from-false-constellation': spawn('from-false-constellation', 886, 272, Math.PI),
      'atlas-checkpoint': spawn('atlas-checkpoint', 480, 408, -Math.PI / 2),
    },
    entities: [
      { id: 'chain-anchor-1', kind: 'interact', x: 270, y: 184, name: 'Western Chain Anchor', label: 'Release the western anchor' },
      { id: 'chain-anchor-2', kind: 'interact', x: 402, y: 164, name: 'High Chain Anchor', label: 'Release the high anchor' },
      { id: 'chain-anchor-3', kind: 'interact', x: 558, y: 164, name: 'Low Chain Anchor', label: 'Release the low anchor' },
      { id: 'chain-anchor-4', kind: 'interact', x: 690, y: 184, name: 'Eastern Chain Anchor', label: 'Release the eastern anchor' },
      { id: 'load-platforms', kind: 'marker', x: 480, y: 270, name: 'Atlas Load Platforms', label: 'Cross the load platforms' },
      { id: 'collapsed-side-vault', kind: 'marker', x: 296, y: 402, name: 'Collapsed Side Vault', label: 'Enter the collapsed side vault' },
      { id: 'one-more-sky-invitation', kind: 'interact', x: 250, y: 382, name: 'Hercules\'s Split Gate', label: 'Help Hercules lift one more sky', sideQuest: 'sq-act4-one-more-sky' },
      { id: 'gate-hercules-lift', kind: 'interact', x: 214, y: 344, name: 'Hercules Gate', label: 'Signal Hercules to lift' },
      { id: 'gate-counterweight', kind: 'interact', x: 348, y: 420, name: 'Vault Counterweight', label: 'Reroute the counterweight' },
      { id: 'constellation-tablets', kind: 'interact', x: 414, y: 422, name: 'Hand-Carved Constellation Tablets', label: 'Recover the constellation tablets' },
      { id: 'cell-hercules', kind: 'interact', x: 646, y: 388, name: 'Hercules\'s Cell', label: 'Release Hercules' },
      { id: 'cell-smith-1', kind: 'interact', x: 712, y: 358, name: 'Western Smith Cell', label: 'Release the first smith' },
      { id: 'cell-smith-2', kind: 'interact', x: 770, y: 326, name: 'Eastern Smith Cell', label: 'Release the second smith' },
      { id: 'atlas-npc', kind: 'npc', x: 566, y: 342, name: 'Atlas', label: 'Speak with Atlas', identityRole: 'coerced-witness' },
      { id: 'single-crown-parley', kind: 'choice', x: 812, y: 246, name: 'Zeus\'s Single Crown', label: 'Reject the single crown', objectiveId: 'reject-single-crown', choiceIds: ['rejection-firm', 'rejection-mournful'] },
    ],
    exits: [
      { id: 'vault-to-name-press', x: 38, y: 272, toMapId: 'name-press', spawnId: 'from-vault', returnSpawnId: 'from-name-press', kind: 'foot', label: 'Return to the Name-Press', gate: [] },
      { id: 'vault-to-constellation', x: 922, y: 272, toMapId: 'false-constellation', spawnId: 'from-vault', returnSpawnId: 'from-false-constellation', kind: 'foot', label: 'Ascend to the False Constellation', gate: [{ kind: 'flag', flagId: 'act4-single-crown-rejected', value: true }] },
      { id: 'combat-act4-atlas-vault', x: 540, y: 250, kind: 'combat', encounterId: 'enc-act4-atlas-vault', label: 'Break the anchor guards', gate: [] },
    ],
    collisions: [
      solid('vault-north-wall-left', 34, 38, 218, 74), solid('vault-north-wall-right', 708, 38, 218, 74),
      solid('vault-south-chasm-left', 34, 470, 190, 34), solid('vault-south-chasm-right', 736, 470, 190, 34),
      solid('vault-west-pier', 116, 144, 76, 72), solid('vault-east-pier', 768, 128, 76, 68),
      solid('vault-central-load', 438, 292, 84, 58),
    ],
    traversalLanes: [
      lane('vault-main-platforms', 70, ALL_PRESSURE_STATES, [point(38, 272), point(230, 272), point(380, 250), point(580, 250), point(730, 272), point(922, 272)]),
      lane('vault-anchor-gallery', 50, ALL_PRESSURE_STATES, [point(270, 184), point(402, 164), point(558, 164), point(690, 184)]),
      lane('vault-side-loop', 48, ALL_PRESSURE_STATES, [point(296, 402), point(348, 420), point(414, 422)]),
      lane('vault-witness-cells', 52, ALL_PRESSURE_STATES, [point(566, 342), point(646, 388), point(712, 358), point(770, 326)]),
    ],
    decor: [
      { id: 'vault-chain-1', kind: 'ruin', x: 312, y: 128 }, { id: 'vault-chain-2', kind: 'ruin', x: 648, y: 128 },
      { id: 'vault-brazier-1', kind: 'brazier', x: 358, y: 216 }, { id: 'vault-brazier-2', kind: 'brazier', x: 602, y: 216 },
    ],
    pressure: { initialStateId: 'safe', laneIds: ['vault-main-platforms', 'vault-anchor-gallery', 'vault-side-loop', 'vault-witness-cells'], valveIds: [] },
  },

  'false-constellation': {
    id: 'false-constellation', bounds: { w: 960, h: 540 }, palette: PALETTES.constellation,
    themeId: 'forge-march-false-constellation', decorSetId: 'collapsing-bronze-firmament',
    spawns: {
      'from-vault': spawn('from-vault', 72, 270, 0),
      'post-boss': spawn('post-boss', 480, 402, -Math.PI / 2),
    },
    entities: [
      { id: 'bronze-firmament', kind: 'marker', x: 480, y: 150, name: 'Bronze Firmament', label: 'Witness the false sky' },
      { id: 'colossus-arena', kind: 'marker', x: 574, y: 270, name: 'Colossus Arena', label: 'Enter the Colossus arena' },
    ],
    exits: [
      { id: 'constellation-to-vault', x: 38, y: 270, toMapId: 'atlas-vault', spawnId: 'from-false-constellation', returnSpawnId: 'from-vault', kind: 'foot', label: 'Descend to the Atlas Vault', gate: [] },
      { id: 'combat-act4-name-press-colossus', x: 630, y: 270, kind: 'combat', encounterId: 'boss-act4-name-press-colossus', label: 'Face the Name-Press Colossus', gate: [] },
    ],
    collisions: [
      solid('constellation-north-firmament-left', 40, 40, 286, 72), solid('constellation-north-firmament-right', 634, 40, 286, 72),
      solid('constellation-south-collapse-left', 40, 454, 250, 44), solid('constellation-south-collapse-right', 670, 454, 250, 44),
      solid('constellation-broken-orbit-1', 250, 160, 72, 56), solid('constellation-broken-orbit-2', 724, 306, 74, 58),
    ],
    traversalLanes: [
      lane('constellation-main', 78, ALL_PRESSURE_STATES, [point(38, 270), point(240, 272), point(420, 270), point(574, 270), point(760, 270)]),
      lane('constellation-post-boss', 56, ALL_PRESSURE_STATES, [point(480, 402), point(520, 340), point(574, 270)]),
      lane('constellation-firmament-view', 48, ALL_PRESSURE_STATES, [point(420, 270), point(450, 208), point(480, 150)]),
    ],
    decor: [
      { id: 'constellation-brazier-1', kind: 'brazier', x: 360, y: 170 }, { id: 'constellation-brazier-2', kind: 'brazier', x: 660, y: 210 },
      { id: 'constellation-ruin', kind: 'ruin', x: 840, y: 392 },
    ],
    pressure: { initialStateId: 'safe', laneIds: ['constellation-main', 'constellation-post-boss', 'constellation-firmament-view'], valveIds: [] },
  },
})

function mergeSpawnTable(staticPocket, runtimeMap) {
  return Object.fromEntries(Object.entries(staticPocket.spawns).map(([id, definition]) => [
    id,
    { ...definition, ...runtimeMap.spawns[id], id },
  ]))
}

export function act4RuntimeMapById(id) {
  return (typeof id === 'string' && ACT4_RUNTIME_MAPS[id]) || null
}

export function act4RenderablePocketById(id) {
  const definition = act4PocketById(id)
  const runtime = act4RuntimeMapById(id)
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
    })),
    exits: runtime.exits.map((exit) => ({ ...exit, gate: exit.gate.map((condition) => ({ ...condition })) })),
    collisions: runtime.collisions.map((collision) => ({ ...collision })),
    traversalLanes: runtime.traversalLanes.map((item) => ({ ...item, stateIds: [...item.stateIds], points: item.points.map((p) => ({ ...p })) })),
    decor: runtime.decor.map((item) => ({ ...item })),
    pressure: { ...runtime.pressure, laneIds: [...runtime.pressure.laneIds], valveIds: [...runtime.pressure.valveIds] },
  }
}

export const ACT4_RENDERABLE_MAPS = deepFreeze(Object.fromEntries(
  Object.keys(ACT4_POCKETS).map((id) => [id, act4RenderablePocketById(id)]),
))

export function act4RuntimeSpawnById(mapId, spawnId) {
  const map = act4RuntimeMapById(mapId)
  return (map && typeof spawnId === 'string' && map.spawns[spawnId]) || null
}

export function act4RuntimeEntityById(mapId, entityId) {
  const map = act4RuntimeMapById(mapId)
  return map?.entities.find((entity) => entity.id === entityId) || null
}

export function act4RuntimeExitById(exitId) {
  for (const map of Object.values(ACT4_RUNTIME_MAPS)) {
    const exit = map.exits.find((candidate) => candidate.id === exitId)
    if (exit) return exit
  }
  return null
}

export function act4RuntimeMarkerById(mapId, markerId) {
  const map = act4RuntimeMapById(mapId)
  if (!map || typeof markerId !== 'string') return null
  return map.spawns[markerId]
    || map.entities.find((entity) => entity.id === markerId)
    || map.exits.find((exit) => exit.id === markerId)
    || map.decor.find((item) => item.id === markerId)
    || null
}

export function validateAct4Runtime() {
  const errors = []
  for (const [id, pocket] of Object.entries(ACT4_POCKETS)) {
    const runtime = act4RuntimeMapById(id)
    if (!runtime) { errors.push(`missing runtime map: ${id}`); continue }
    if (!(runtime.bounds.w > 0 && runtime.bounds.h > 0)) errors.push(`invalid bounds: ${id}`)
    for (const spawnId of Object.keys(pocket.spawns)) {
      if (!act4RuntimeSpawnById(id, spawnId)) errors.push(`missing spawn geometry: ${id}:${spawnId}`)
    }
  }
  for (const connection of ACT4_CONNECTIONS) {
    const exit = act4RuntimeExitById(connection.id)
    if (!exit) { errors.push(`missing exit geometry: ${connection.id}`); continue }
    if (exit.toMapId !== connection.to || exit.spawnId !== connection.arrivalSpawnId || exit.returnSpawnId !== connection.returnSpawnId) {
      errors.push(`exit destination mismatch: ${connection.id}`)
    }
    if ((exit.planId || null) !== (connection.planId || null)) errors.push(`exit plan mismatch: ${connection.id}`)
    if (JSON.stringify(exit.gate) !== JSON.stringify(connection.gate || [])) errors.push(`exit gate mismatch: ${connection.id}`)
  }
  return errors
}
