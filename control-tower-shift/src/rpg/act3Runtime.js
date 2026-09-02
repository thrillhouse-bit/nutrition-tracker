// Act III render-ready world geometry.
//
// act3Content.js owns stable story IDs and graph semantics. This module owns
// finite coordinates, collision-safe traversal lanes, world interaction hooks,
// and explicit combat activators. Merging always allocates new objects and
// never mutates either authored source.

import {
  ACT3_CONNECTIONS,
  ACT3_ENCOUNTERS,
  ACT3_POCKETS,
  ACT3_SEASONAL_STATES,
  act3PocketById,
} from './act3Content.js'

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

const PALETTES = deepFreeze({
  village: {
    name: 'wheat-village', sky: '#7190a0', skyLow: '#dfc98e', sea: '#627d86', hill: '#747b58',
    sun: '#fff0b8', haze: 'rgba(238,221,166,0.28)', marble: '#dfd5b8', marbleMid: '#bdae88',
    marbleShadow: '#81755c', grout: '#393b31', stone: '#8b8269', stoneDark: '#48483d',
    terracotta: '#a95b36', terracottaDark: '#673728', bronze: '#9b7138', gold: '#e2b95d',
    glow: '#f5d27a', ink: '#26302e', outline: '#192320', accent: '#8d873f', danger: '#a34436',
    void: '#101817', grass: '#7f8249', path: '#c8b77f', interior: false,
  },
  orchard: {
    name: 'winter-orchard', sky: '#7892a5', skyLow: '#c9d1c9', sea: '#657985', hill: '#657261',
    sun: '#eef4da', haze: 'rgba(220,237,231,0.28)', marble: '#d4d5c6', marbleMid: '#a8aea2',
    marbleShadow: '#737d77', grout: '#364348', stone: '#7b8580', stoneDark: '#3e4c4d',
    terracotta: '#9b5a3f', terracottaDark: '#61392f', bronze: '#927341', gold: '#d8bd69',
    glow: '#c9f0e0', ink: '#203137', outline: '#14252b', accent: '#769b87', danger: '#9d4540',
    void: '#0d181c', grass: '#768064', path: '#b8b39a', interior: false,
  },
  sanctuary: {
    name: 'kore-sanctuary', sky: '#5d6f7f', skyLow: '#a6a98f', sea: '#465d68', hill: '#596255',
    sun: '#eadfae', haze: 'rgba(194,205,184,0.24)', marble: '#c9c0aa', marbleMid: '#9f9684',
    marbleShadow: '#68665c', grout: '#30363a', stone: '#747268', stoneDark: '#383c3c',
    terracotta: '#8e4934', terracottaDark: '#592f29', bronze: '#947244', gold: '#d5ae5d',
    glow: '#d9c882', ink: '#242a2b', outline: '#171d20', accent: '#8a7852', danger: '#9f3d38',
    void: '#0c1215', grass: '#656c58', path: '#aaa188', interior: true,
  },
  asphodel: {
    name: 'asphodel-gate', sky: '#353c48', skyLow: '#746e68', sea: '#394852', hill: '#4d4d4d',
    sun: '#d9d0b9', haze: 'rgba(177,173,166,0.2)', marble: '#aaa69d', marbleMid: '#7f7d78',
    marbleShadow: '#55565a', grout: '#272b31', stone: '#65666a', stoneDark: '#30333a',
    terracotta: '#7b4038', terracottaDark: '#4b2a2a', bronze: '#83704f', gold: '#c1a866',
    glow: '#b6c8d1', ink: '#1b2026', outline: '#11161d', accent: '#6f7d85', danger: '#963e43',
    void: '#080c12', grass: '#555b55', path: '#89867e', interior: true,
  },
  threshing: {
    name: 'threshing-circle', sky: '#625f70', skyLow: '#b0a682', sea: '#505d66', hill: '#6d684f',
    sun: '#f0d58b', haze: 'rgba(216,201,161,0.22)', marble: '#c8bfa5', marbleMid: '#9c927a',
    marbleShadow: '#665f55', grout: '#333337', stone: '#747069', stoneDark: '#39383b',
    terracotta: '#9e4c35', terracottaDark: '#62302b', bronze: '#9d7642', gold: '#deb65a',
    glow: '#f0d57c', ink: '#24252a', outline: '#17181e', accent: '#9c864c', danger: '#ae3f38',
    void: '#0d0e13', grass: '#74744e', path: '#b2a783', interior: false,
  },
})

const SEASONS = Object.keys(ACT3_SEASONAL_STATES)
const point = (x, y) => ({ x, y })
const spawn = (id, x, y, facing) => ({ id, x, y, facing })
const solid = (id, x, y, w, h) => ({ id, kind: 'solid', x, y, w, h })
const lane = (id, width, stateIds, points) => ({ id, width, stateIds, points })
const exit = (id, x, y, toMapId, spawnId, returnSpawnId, gate = []) => ({
  id, x, y, toMapId, spawnId, returnSpawnId, kind: 'foot', gate,
  label: `Travel to ${ACT3_POCKETS[toMapId].name}`,
})
const combat = (id, encounterId, x, y, label) => ({ id, encounterId, x, y, kind: 'combat', label, gate: [] })

export const ACT3_RUNTIME_MAPS = deepFreeze({
  'wheat-village': {
    id: 'wheat-village', bounds: { w: 960, h: 540 }, palette: PALETTES.village,
    themeId: 'withered-year-village', decorSetId: 'frosted-granaries',
    spawns: {
      granary: spawn('granary', 150, 382, -0.1),
      'from-orchard': spawn('from-orchard', 884, 286, Math.PI),
      'from-threshing': spawn('from-threshing', 478, 86, Math.PI / 2),
      'first-thaw': spawn('first-thaw', 474, 282, 0),
    },
    entities: [
      { id: 'demeter', kind: 'npc', x: 280, y: 308, name: 'Demeter', label: 'Hear Demeter', conversationId: 'act3-demeter-stilled-year' },
      { id: 'persephone', kind: 'npc', x: 388, y: 334, name: 'Persephone', label: 'Hear Persephone', conversationId: 'act3-persephone-stilled-year' },
      { id: 'villager-1', kind: 'npc', x: 562, y: 328, name: 'Myrto', label: 'Hear Myrto', conversationId: 'act3-myrto-stilled-year' },
      { id: 'villager-2', kind: 'npc', x: 674, y: 302, name: 'Phaon', label: 'Hear Phaon', conversationId: 'act3-phaon-stilled-year' },
      { id: 'keeper-granary', kind: 'interact', x: 180, y: 420, name: 'Keeper Granary', label: 'Inspect the silent granary' },
      { id: 'demeter-shrine', kind: 'shrine', x: 300, y: 174, name: 'Demeter Shrine', label: 'Honor the keeper of grain', deityId: 'demeter', savePointId: 'shrine-wheat-village-demeter' },
      { id: 'frozen-villagers', kind: 'marker', x: 612, y: 382, name: 'Frozen Villagers', label: 'Witness the stilled year' },
      { id: 'return-covenant-table', kind: 'choice', x: 474, y: 246, name: 'Return Covenant', label: 'Join the Return covenant', choiceIds: ['continuity-kept', 'departure-protected', 'witnessed-cycle'] },
      { id: 'first-thaw', kind: 'marker', x: 474, y: 282, name: 'First Thaw', label: 'Witness the first thaw' },
      { id: 'wheat-village-hearth', kind: 'station', stationId: 'hearth', x: 340, y: 400, name: 'Wheat Village Hearth', label: 'Cook at the village hearth' },
      { id: 'wheat-village-kiln', kind: 'station', stationId: 'kiln', x: 780, y: 360, name: 'Wheat Village Kiln', label: 'Fire clay in the village kiln' },
      { id: 'eirene-household-steward', kind: 'shop', shopId: 'wheat-village-exchange', x: 670, y: 410, name: 'Eirene', label: 'Trade household goods with Eirene' },
      { id: 'wheat-village-sage', kind: 'resource', x: 520, y: 120, name: 'Wheat Village Sage Row', label: 'Gather mountain sage', skillId: 'foraging', itemId: 'sage', level: 10, xp: 22 },
      { id: 'wheat-village-granary-bank', kind: 'bank', x: 250, y: 410, name: 'Wheat Village Granary Store', label: 'Open the granary store' },
    ],
    exits: [
      exit('village-to-orchard', 922, 286, 'winter-orchard', 'from-village', 'from-orchard'),
      exit('village-to-threshing', 478, 40, 'threshing-circle', 'from-village', 'from-threshing', [{ kind: 'flag', flagId: 'act3-covenant-joined', value: true }]),
    ],
    collisions: [
      solid('village-granary-west', 54, 54, 170, 84), solid('village-granary-east', 650, 54, 242, 84),
      solid('village-south-house-west', 54, 452, 230, 48), solid('village-south-house-east', 690, 450, 204, 50),
    ],
    traversalLanes: [
      lane('village-main', 76, SEASONS, [point(74, 390), point(260, 354), point(474, 330), point(690, 320), point(922, 286)]),
      lane('village-threshing-road', 58, SEASONS, [point(474, 330), point(510, 220), point(478, 86), point(478, 40)]),
      lane('village-shrine-path', 46, SEASONS, [point(260, 354), point(284, 252), point(300, 174)]),
    ],
    decor: [
      { id: 'village-sheaf-1', kind: 'wheat-sheaf', x: 360, y: 420 }, { id: 'village-sheaf-2', kind: 'wheat-sheaf', x: 786, y: 370 },
      { id: 'village-brazier', kind: 'brazier', x: 474, y: 178 },
    ],
  },

  'winter-orchard': {
    id: 'winter-orchard', bounds: { w: 960, h: 540 }, palette: PALETTES.orchard,
    themeId: 'withered-year-orchard', decorSetId: 'split-season-orchard',
    spawns: {
      'from-village': spawn('from-village', 74, 286, 0),
      'from-sanctuary': spawn('from-sanctuary', 886, 286, Math.PI),
      'orchard-spring': spawn('orchard-spring', 480, 326, 0),
    },
    entities: [
      { id: 'harvest-altar', kind: 'season-altar', x: 314, y: 362, name: 'Harvest Altar', label: 'Call the harvest state', seasonId: 'harvest' },
      { id: 'winter-altar', kind: 'season-altar', x: 646, y: 354, name: 'Winter Altar', label: 'Call the winter state', seasonId: 'winter' },
      { id: 'frozen-spring', kind: 'marker', x: 480, y: 326, name: 'Frozen Spring', label: 'Inspect the frozen spring' },
      { id: 'vineyard-between', kind: 'marker', x: 470, y: 436, name: 'Vineyard Between Seasons', label: 'Enter the between-season vineyard' },
      { id: 'cup-between-seasons-invitation', kind: 'interact', x: 408, y: 418, name: 'Vine-Wrapped Invitation', label: 'Follow Dionysus into the vineyard', sideQuest: 'sq-act3-cup-between-seasons' },
      { id: 'ceremonial-cup', kind: 'interact', x: 536, y: 430, name: 'Ceremonial Cup', label: 'Recover the ceremonial cup' },
      { id: 'seasonal-rite-table', kind: 'choice', x: 610, y: 420, name: 'Household Rite', label: 'Resolve the ritual dispute', choiceIds: ['rite-renewed', 'rite-released'] },
      { id: 'orchard-cypress', kind: 'resource', x: 800, y: 300, name: 'Mourning Cypress', label: 'Cut the mourning cypress', skillId: 'woodcutting', itemId: 'cypress-log', level: 15, xp: 28 },
    ],
    exits: [
      exit('orchard-to-village', 38, 286, 'wheat-village', 'from-orchard', 'from-village'),
      exit('orchard-to-sanctuary', 922, 286, 'kore-sanctuary', 'from-orchard', 'from-sanctuary'),
      combat('combat-act3-orchard-tracks', 'enc-act3-orchard-tracks', 550, 300, 'Face the orchard guardian'),
    ],
    collisions: [
      solid('orchard-north-grove-west', 70, 54, 250, 92), solid('orchard-north-grove-east', 650, 54, 238, 92),
      solid('orchard-south-grove-west', 70, 462, 230, 38), solid('orchard-south-grove-east', 704, 462, 184, 38),
    ],
    traversalLanes: [
      lane('orchard-main', 76, SEASONS, [point(38, 286), point(238, 286), point(480, 326), point(714, 286), point(922, 286)]),
      lane('orchard-harvest-loop', 54, ['harvest'], [point(238, 286), point(314, 362), point(470, 436), point(610, 420), point(714, 286)]),
      lane('orchard-winter-cut', 64, ['winter'], [point(314, 362), point(480, 248), point(646, 354)]),
    ],
    decor: [
      { id: 'orchard-tree-1', kind: 'winter-tree', x: 186, y: 188 }, { id: 'orchard-tree-2', kind: 'winter-tree', x: 780, y: 190 },
      { id: 'orchard-vines', kind: 'vineyard', x: 510, y: 454 },
    ],
    season: { initialStateId: 'winter', altarIds: ['harvest-altar', 'winter-altar'], laneIds: ['orchard-main', 'orchard-harvest-loop', 'orchard-winter-cut'] },
  },

  'kore-sanctuary': {
    id: 'kore-sanctuary', bounds: { w: 960, h: 540 }, palette: PALETTES.sanctuary,
    themeId: 'withered-year-sanctuary', decorSetId: 'pomegranate-seal-temple',
    spawns: {
      'from-orchard': spawn('from-orchard', 74, 286, 0),
      'from-asphodel': spawn('from-asphodel', 886, 286, Math.PI),
      'seal-chamber': spawn('seal-chamber', 480, 338, 0),
    },
    entities: [
      { id: 'pomegranate-seal-1', kind: 'interact', x: 292, y: 344, name: 'First Pomegranate Seal', label: 'Turn the first seal', sequence: 1 },
      { id: 'pomegranate-seal-2', kind: 'interact', x: 410, y: 248, name: 'Second Pomegranate Seal', label: 'Turn the second seal', sequence: 2 },
      { id: 'pomegranate-seal-3', kind: 'interact', x: 552, y: 248, name: 'Third Pomegranate Seal', label: 'Turn the third seal', sequence: 3 },
      { id: 'pomegranate-seal-4', kind: 'interact', x: 670, y: 344, name: 'Fourth Pomegranate Seal', label: 'Turn the fourth seal', sequence: 4 },
      { id: 'descent-gate', kind: 'marker', x: 820, y: 286, name: 'Descent Gate', label: 'Descend toward Asphodel' },
      { id: 'kore-alchemy-lab', kind: 'station', stationId: 'alchemy-lab', x: 360, y: 380, name: 'Kore Alchemy Laboratory', label: 'Brew among Kore\'s preserved herbs' },
      { id: 'kore-sanctuary-moly', kind: 'resource', x: 480, y: 420, name: 'Kore Sanctuary Moly Patch', label: 'Gather the warded moly', skillId: 'foraging', itemId: 'moly', level: 55, xp: 78, capacity: 1, respawnTicks: 900 },
    ],
    exits: [
      exit('sanctuary-to-orchard', 38, 286, 'winter-orchard', 'from-sanctuary', 'from-orchard'),
      exit('sanctuary-to-asphodel', 922, 286, 'asphodel-gate', 'from-sanctuary', 'from-asphodel'),
      combat('combat-act3-kore-sanctuary', 'enc-act3-kore-sanctuary', 480, 338, 'Break the sanctuary wardens'),
    ],
    collisions: [
      solid('sanctuary-north-cell-west', 58, 56, 252, 94), solid('sanctuary-north-cell-east', 650, 56, 252, 94),
      solid('sanctuary-south-crypt-west', 58, 454, 220, 46), solid('sanctuary-south-crypt-east', 682, 454, 220, 46),
    ],
    traversalLanes: [
      lane('sanctuary-main', 76, SEASONS, [point(38, 286), point(240, 300), point(480, 338), point(720, 300), point(922, 286)]),
      lane('sanctuary-seals', 50, SEASONS, [point(240, 300), point(292, 344), point(410, 248), point(552, 248), point(670, 344), point(720, 300)]),
    ],
    decor: [
      { id: 'sanctuary-column-1', kind: 'column', x: 350, y: 170 }, { id: 'sanctuary-column-2', kind: 'column', x: 612, y: 170 },
      { id: 'sanctuary-pomegranate-tree', kind: 'pomegranate-tree', x: 480, y: 186 },
    ],
  },

  'asphodel-gate': {
    id: 'asphodel-gate', bounds: { w: 960, h: 540 }, palette: PALETTES.asphodel,
    themeId: 'withered-year-asphodel', decorSetId: 'witness-shade-threshold',
    spawns: {
      'from-sanctuary': spawn('from-sanctuary', 74, 286, 0),
      'kleio-threshold': spawn('kleio-threshold', 430, 320, 0),
    },
    entities: [
      { id: 'kleio', kind: 'npc', x: 430, y: 286, name: 'Kleio', label: 'Hear Kleio\'s testimony', conversationId: 'act3-kleio-testimony' },
      { id: 'witness-shades', kind: 'marker', x: 306, y: 354, name: 'Witness Shades', label: 'Name the mortal witnesses' },
      { id: 'hades-threshold', kind: 'marker', x: 784, y: 286, name: 'Hades Threshold', label: 'Approach the threshold' },
      { id: 'return-covenant-table', kind: 'choice', x: 610, y: 354, name: 'Return Covenant', label: 'Join the Return covenant', choiceIds: ['continuity-kept', 'departure-protected', 'witnessed-cycle'] },
      { id: 'asphodel-gate-bloom', kind: 'resource', x: 480, y: 180, name: 'Asphodel Meadow', label: 'Gather asphodel blooms', skillId: 'foraging', itemId: 'asphodel', level: 30, xp: 42 },
    ],
    exits: [
      exit('asphodel-to-sanctuary', 38, 286, 'kore-sanctuary', 'from-asphodel', 'from-sanctuary'),
      combat('combat-act3-asphodel', 'enc-act3-asphodel', 666, 286, 'Clear the Asphodel threshold'),
    ],
    collisions: [
      solid('asphodel-north-wall-west', 58, 54, 260, 94), solid('asphodel-north-wall-east', 654, 54, 248, 94),
      solid('asphodel-south-wall-west', 58, 454, 236, 46), solid('asphodel-south-wall-east', 694, 454, 208, 46),
    ],
    traversalLanes: [
      lane('asphodel-main', 76, SEASONS, [point(38, 286), point(230, 300), point(430, 320), point(666, 286), point(850, 286)]),
      lane('asphodel-testimony', 50, SEASONS, [point(230, 300), point(306, 354), point(430, 320), point(610, 354), point(784, 286)]),
    ],
    decor: [
      { id: 'asphodel-flame-1', kind: 'brazier', x: 260, y: 194 }, { id: 'asphodel-flame-2', kind: 'brazier', x: 730, y: 194 },
      { id: 'asphodel-stele', kind: 'boundary-stone', x: 530, y: 210 },
    ],
  },

  'threshing-circle': {
    id: 'threshing-circle', bounds: { w: 960, h: 540 }, palette: PALETTES.threshing,
    themeId: 'withered-year-threshing-circle', decorSetId: 'split-season-boss-field',
    spawns: {
      'from-village': spawn('from-village', 74, 286, 0),
      'post-boss': spawn('post-boss', 480, 286, Math.PI),
    },
    entities: [
      { id: 'winter-half', kind: 'marker', x: 332, y: 286, name: 'Winter Half', label: 'Hold against winter' },
      { id: 'harvest-half', kind: 'marker', x: 628, y: 286, name: 'Harvest Half', label: 'Hold through harvest' },
      { id: 'threshing-circle-ambrosia', kind: 'resource', x: 480, y: 180, name: 'Threshing Circle Ambrosia Bloom', label: 'Gather the ambrosia bloom', skillId: 'foraging', itemId: 'ambrosia-bloom', level: 80, xp: 130 },
    ],
    exits: [
      exit('threshing-to-village', 38, 286, 'wheat-village', 'from-threshing', 'from-village'),
      combat('combat-act3-winter-mother', 'boss-act3-winter-mother-echo', 596, 286, 'Face the Winter Mother Echo'),
    ],
    collisions: [
      solid('threshing-north-stands-west', 58, 54, 250, 82), solid('threshing-north-stands-east', 652, 54, 250, 82),
      solid('threshing-south-stands-west', 58, 454, 250, 46), solid('threshing-south-stands-east', 652, 454, 250, 46),
    ],
    traversalLanes: [
      lane('threshing-center', 92, SEASONS, [point(38, 286), point(250, 286), point(480, 286), point(700, 286), point(900, 286)]),
      lane('threshing-winter-half', 60, ['winter'], [point(250, 286), point(332, 206), point(480, 286)]),
      lane('threshing-harvest-half', 60, ['harvest'], [point(480, 286), point(628, 366), point(700, 286)]),
      lane('threshing-ambrosia-spur', 50, SEASONS, [point(480, 286), point(480, 180)]),
    ],
    decor: [
      { id: 'threshing-sheaf', kind: 'wheat-sheaf', x: 710, y: 376 }, { id: 'threshing-frost-stele', kind: 'boundary-stone', x: 250, y: 202 },
    ],
    season: { initialStateId: 'winter', altarIds: [], laneIds: ['threshing-center', 'threshing-winter-half', 'threshing-harvest-half'] },
  },
})

function mergeSpawnTable(staticPocket, runtimeMap) {
  return Object.fromEntries(Object.entries(staticPocket.spawns).map(([id, definition]) => [
    id, { ...definition, ...runtimeMap.spawns[id], id },
  ]))
}

export function act3RuntimeMapById(id) {
  return (typeof id === 'string' && ACT3_RUNTIME_MAPS[id]) || null
}

export function act3RenderablePocketById(id) {
  const definition = act3PocketById(id)
  const runtime = act3RuntimeMapById(id)
  if (!definition || !runtime) return null
  const spawns = mergeSpawnTable(definition, runtime)
  return {
    ...definition,
    ...runtime,
    spawns,
    spawn: spawns[definition.spawnId],
    entities: runtime.entities.map((entity) => ({ ...entity, ...(entity.choiceIds ? { choiceIds: [...entity.choiceIds] } : {}) })),
    exits: runtime.exits.map((item) => ({ ...item, gate: (item.gate || []).map((condition) => ({ ...condition })) })),
    collisions: runtime.collisions.map((item) => ({ ...item })),
    traversalLanes: runtime.traversalLanes.map((item) => ({ ...item, stateIds: [...item.stateIds], points: item.points.map((p) => ({ ...p })) })),
    decor: runtime.decor.map((item) => ({ ...item })),
    ...(runtime.season ? { season: { ...runtime.season, altarIds: [...runtime.season.altarIds], laneIds: [...runtime.season.laneIds] } } : {}),
  }
}

export const ACT3_RENDERABLE_MAPS = deepFreeze(Object.fromEntries(
  Object.keys(ACT3_POCKETS).map((id) => [id, act3RenderablePocketById(id)]),
))

export function act3RuntimeSpawnById(mapId, spawnId) {
  const map = act3RuntimeMapById(mapId)
  return (map && typeof spawnId === 'string' && map.spawns[spawnId]) || null
}

export function act3RuntimeEntityById(mapId, entityId) {
  const map = act3RuntimeMapById(mapId)
  return map?.entities.find((entity) => entity.id === entityId) || null
}

export function act3RuntimeExitById(exitId) {
  for (const map of Object.values(ACT3_RUNTIME_MAPS)) {
    const found = map.exits.find((candidate) => candidate.id === exitId)
    if (found) return found
  }
  return null
}

export function act3RuntimeMarkerById(mapId, markerId) {
  const map = act3RuntimeMapById(mapId)
  if (!map || typeof markerId !== 'string') return null
  return map.spawns[markerId]
    || map.entities.find((entity) => entity.id === markerId)
    || map.exits.find((item) => item.id === markerId)
    || map.decor.find((item) => item.id === markerId)
    || null
}

export function validateAct3Runtime() {
  const errors = []
  for (const [id, pocket] of Object.entries(ACT3_POCKETS)) {
    const runtime = act3RuntimeMapById(id)
    if (!runtime) { errors.push(`missing runtime map: ${id}`); continue }
    if (!(runtime.bounds.w > 0 && runtime.bounds.h > 0)) errors.push(`invalid bounds: ${id}`)
    for (const spawnId of Object.keys(pocket.spawns)) {
      if (!act3RuntimeSpawnById(id, spawnId)) errors.push(`missing spawn geometry: ${id}:${spawnId}`)
    }
  }
  for (const connection of ACT3_CONNECTIONS) {
    const runtimeExit = act3RuntimeExitById(connection.id)
    if (!runtimeExit) { errors.push(`missing exit geometry: ${connection.id}`); continue }
    if (runtimeExit.toMapId !== connection.to || runtimeExit.spawnId !== connection.arrivalSpawnId) {
      errors.push(`exit destination mismatch: ${connection.id}`)
    }
    if (JSON.stringify(runtimeExit.gate || []) !== JSON.stringify(connection.gate || [])) {
      errors.push(`exit gate mismatch: ${connection.id}`)
    }
  }
  const combatIds = new Set(Object.values(ACT3_RUNTIME_MAPS).flatMap((map) => map.exits)
    .filter((item) => item.kind === 'combat').map((item) => item.encounterId))
  for (const encounterId of Object.keys(ACT3_ENCOUNTERS)) {
    if (!combatIds.has(encounterId)) errors.push(`missing combat activator: ${encounterId}`)
  }
  return errors
}
