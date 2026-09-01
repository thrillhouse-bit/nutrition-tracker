// Act II render-ready world geometry.
//
// This module complements act2Content.js: the static module owns story IDs and
// graph semantics; this module owns deterministic coordinates and traversal
// metadata. The merge helpers always allocate new objects and never write to
// either source contract.

import {
  ACT2_CONNECTIONS,
  ACT2_POCKETS,
  ACT2_TIDE_ORDER,
  act2PocketById,
} from './act2Content.js'

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

const PALETTES = deepFreeze({
  harbor: {
    name: 'pelagos-harbor', sky: '#5f9fc0', skyLow: '#d9d4b0', sea: '#276f86', hill: '#66766d',
    sun: '#fff1c4', haze: 'rgba(221,239,226,0.32)', marble: '#e8dfc7', marbleMid: '#c9bea2',
    marbleShadow: '#8f8b78', grout: '#263b40', stone: '#817e70', stoneDark: '#434b49',
    terracotta: '#b95f35', terracottaDark: '#793a2b', bronze: '#9c753f', gold: '#e4bd68',
    glow: '#94e6e2', ink: '#17282e', outline: '#122128', accent: '#2d7e91', danger: '#a73832',
    void: '#08161c', grass: '#71816b', path: '#c9bc98', interior: false,
  },
  breakwater: {
    name: 'breakwater-road', sky: '#527f9d', skyLow: '#c8c9b1', sea: '#195f77', hill: '#556b69',
    sun: '#f8e7b4', haze: 'rgba(202,228,222,0.28)', marble: '#d8d1ba', marbleMid: '#aaa58f',
    marbleShadow: '#74766d', grout: '#26383d', stone: '#73766e', stoneDark: '#3a4547',
    terracotta: '#a75435', terracottaDark: '#6f352c', bronze: '#8c7048', gold: '#d6af61',
    glow: '#7edbd6', ink: '#15262c', outline: '#102027', accent: '#277a8e', danger: '#a13c36',
    void: '#071319', grass: '#637569', path: '#b9ae91', interior: false,
  },
  caves: {
    name: 'nereid-caves', sky: '#163c4a', skyLow: '#285c68', sea: '#0e5267', hill: '#26494d',
    sun: '#b8f0db', haze: 'rgba(112,211,204,0.22)', marble: '#9fbcb1', marbleMid: '#6f938c',
    marbleShadow: '#405f5d', grout: '#102f38', stone: '#4d6865', stoneDark: '#213b3d',
    terracotta: '#8c4b39', terracottaDark: '#542f2c', bronze: '#88704d', gold: '#c8b76c',
    glow: '#7dffdf', ink: '#0b2028', outline: '#081a21', accent: '#35a9af', danger: '#ba4e54',
    void: '#041117', grass: '#426b61', path: '#769890', interior: true,
  },
  anchorage: {
    name: 'storm-anchorage', sky: '#344f63', skyLow: '#71858a', sea: '#164c62', hill: '#424e51',
    sun: '#d9e6d5', haze: 'rgba(183,211,210,0.22)', marble: '#bec1b4', marbleMid: '#919a92',
    marbleShadow: '#606c6c', grout: '#26383f', stone: '#687474', stoneDark: '#344248',
    terracotta: '#994b36', terracottaDark: '#60332d', bronze: '#92754c', gold: '#cfb468',
    glow: '#8ee9e5', ink: '#13252d', outline: '#0d1c23', accent: '#3d91a5', danger: '#b23f3c',
    void: '#07141b', grass: '#586d68', path: '#9fa394', interior: false,
  },
  barge: {
    name: 'archive-barge-deck', sky: '#536f7b', skyLow: '#aaad9d', sea: '#1d5669', hill: '#4b5c5e',
    sun: '#f0d9a0', haze: 'rgba(204,218,206,0.24)', marble: '#c4b99e', marbleMid: '#9e9278',
    marbleShadow: '#695f51', grout: '#26363a', stone: '#716b60', stoneDark: '#393b38',
    terracotta: '#a04d32', terracottaDark: '#653027', bronze: '#a27b45', gold: '#deb75f',
    glow: '#8de0d5', ink: '#17262a', outline: '#101c21', accent: '#367f8e', danger: '#aa3c36',
    void: '#081318', grass: '#647065', path: '#a99b7e', interior: false,
  },
})

const point = (x, y) => ({ x, y })
const spawn = (id, x, y, facing) => ({ id, x, y, facing })
const solid = (id, x, y, w, h) => ({ id, kind: 'solid', x, y, w, h })
const lane = (id, width, stateIds, points) => ({ id, width, stateIds, points })

export const ACT2_RUNTIME_MAPS = deepFreeze({
  'pelagos-harbor': {
    id: 'pelagos-harbor', bounds: { w: 960, h: 540 }, palette: PALETTES.harbor,
    themeId: 'salt-covenant-harbor', decorSetId: 'pelagos-quays',
    spawns: {
      'keeper-jetty': spawn('keeper-jetty', 150, 382, -0.12),
      'from-breakwater': spawn('from-breakwater', 884, 278, Math.PI),
      'from-barge': spawn('from-barge', 474, 470, -Math.PI / 2),
      'post-covenant': spawn('post-covenant', 442, 246, Math.PI / 2),
    },
    entities: [
      { id: 'melite', kind: 'npc', x: 232, y: 352, name: 'Melite', label: 'Speak with Melite', conversationId: 'act2-melite-oath-post' },
      { id: 'oath-post', kind: 'interact', x: 280, y: 330, name: 'Harbor Oath-Post', label: 'Inspect the oath-post' },
      { id: 'poseidon-shrine', kind: 'shrine', x: 328, y: 174, name: 'Poseidon Shrine', label: 'Honor the keeper of harbors', deityId: 'poseidon', savePointId: 'shrine-pelagos-poseidon' },
      { id: 'salt-covenant-table', kind: 'choice', x: 442, y: 246, name: 'Salt Covenant Table', label: 'Ratify the Salt Covenant', choiceIds: ['harbor-first', 'boundary-first', 'shared-crossing'] },
    ],
    exits: [
      { id: 'harbor-to-breakwater', x: 920, y: 278, toMapId: 'breakwater-road', spawnId: 'from-harbor', returnSpawnId: 'from-breakwater', kind: 'foot', gate: [] },
    ],
    collisions: [
      solid('harbor-north-storehouse', 56, 38, 310, 86), solid('harbor-fish-market', 602, 62, 250, 92),
      solid('harbor-west-seawall', 24, 130, 44, 304), solid('harbor-dock-crates', 566, 380, 122, 56),
      solid('harbor-shrine-plinth', 294, 132, 70, 38),
    ],
    traversalLanes: [
      lane('harbor-promenade', 76, ACT2_TIDE_ORDER, [point(130, 390), point(300, 350), point(520, 312), point(720, 292), point(920, 278)]),
      lane('harbor-jetty', 58, ACT2_TIDE_ORDER, [point(442, 246), point(460, 348), point(474, 474)]),
      lane('harbor-shrine-steps', 44, ACT2_TIDE_ORDER, [point(300, 350), point(312, 250), point(328, 174)]),
    ],
    decor: [
      { id: 'harbor-column-1', kind: 'column', x: 390, y: 126 }, { id: 'harbor-column-2', kind: 'column', x: 520, y: 126 },
      { id: 'harbor-brazier', kind: 'brazier', x: 448, y: 168 }, { id: 'harbor-nets', kind: 'fishing-nets', x: 724, y: 388 },
      { id: 'skiff-docks', kind: 'skiff-dock', x: 474, y: 474 },
      { id: 'harbor-amphorae', kind: 'urn', x: 202, y: 450 },
    ],
    tide: { initialStateId: 'ebb', laneIds: ['harbor-promenade', 'harbor-jetty', 'harbor-shrine-steps'], wellIds: [], skiffNodeIds: [], ropeLiftIds: [] },
  },

  'breakwater-road': {
    id: 'breakwater-road', bounds: { w: 960, h: 540 }, palette: PALETTES.breakwater,
    themeId: 'salt-covenant-breakwater', decorSetId: 'storm-cut-causeway',
    spawns: {
      'from-harbor': spawn('from-harbor', 72, 274, 0),
      'from-caves': spawn('from-caves', 886, 250, Math.PI),
      'surge-witness': spawn('surge-witness', 478, 258, 0),
    },
    entities: [
      // The wells sit on stone refuges between the dry causeway and the
      // waist-deep channel. Either active tide route can therefore approach a
      // controller without placing Kallias outside its collision envelope.
      { id: 'tide-well-harbor', kind: 'tide-well', x: 286, y: 292, name: 'Harbor Tide-Well', label: 'Turn the tide toward the harbor' },
      { id: 'tide-well-caves', kind: 'tide-well', x: 692, y: 290, name: 'Cavern Tide-Well', label: 'Turn the tide toward the caves' },
      { id: 'surge-witness', kind: 'marker', x: 478, y: 258, name: 'First Surge', label: 'Witness the tide change' },
    ],
    exits: [
      { id: 'breakwater-to-harbor', x: 38, y: 274, toMapId: 'pelagos-harbor', spawnId: 'from-breakwater', returnSpawnId: 'from-harbor', kind: 'foot', gate: [] },
      { id: 'breakwater-to-caves', x: 922, y: 250, toMapId: 'nereid-caves', spawnId: 'from-breakwater', returnSpawnId: 'from-caves', kind: 'foot', gate: [] },
      // Keep the reef ambush downstream of the First Surge marker so their
      // independent 48px semantic controls never occupy the same hit target.
      { id: 'combat-act2-breakwater', x: 560, y: 314, kind: 'combat', encounterId: 'enc-act2-breakwater', label: 'Defend the crossing', gate: [] },
    ],
    collisions: [
      solid('breakwater-north-reef-1', 88, 82, 230, 92), solid('breakwater-north-reef-2', 620, 58, 220, 70),
      solid('breakwater-south-reef-1', 130, 404, 246, 68), solid('breakwater-south-reef-2', 660, 402, 220, 76),
      solid('breakwater-fallen-column', 520, 178, 74, 52),
    ],
    traversalLanes: [
      lane('dry-causeway', 72, ['ebb', 'crossing'], [point(38, 274), point(250, 238), point(478, 286), point(640, 286), point(700, 250), point(922, 250)]),
      lane('waist-deep-channel', 76, ['crossing', 'surge'], [point(38, 310), point(260, 342), point(478, 354), point(710, 326), point(922, 286)]),
    ],
    decor: [
      { id: 'breakwater-beacon-1', kind: 'brazier', x: 206, y: 194 }, { id: 'breakwater-beacon-2', kind: 'brazier', x: 754, y: 194 },
      { id: 'breakwater-ruin', kind: 'ruin', x: 520, y: 146 }, { id: 'breakwater-marker-stone', kind: 'boundary-stone', x: 478, y: 188 },
    ],
    tide: { initialStateId: 'ebb', laneIds: ['dry-causeway', 'waist-deep-channel'], wellIds: ['tide-well-harbor', 'tide-well-caves'], skiffNodeIds: [], ropeLiftIds: [] },
  },

  'nereid-caves': {
    id: 'nereid-caves', bounds: { w: 960, h: 540 }, palette: PALETTES.caves,
    themeId: 'salt-covenant-nereid-caves', decorSetId: 'bioluminescent-boundary-cavern',
    spawns: {
      'from-breakwater': spawn('from-breakwater', 76, 284, 0),
      'from-anchorage': spawn('from-anchorage', 880, 276, Math.PI),
      'threshold': spawn('threshold', 216, 284, 0),
    },
    entities: [
      { id: 'nereid-witness-1', kind: 'witness', x: 360, y: 176, name: 'Witness of Arrival', label: 'Release the first witness' },
      { id: 'nereid-witness-2', kind: 'witness', x: 520, y: 340, name: 'Witness of Passage', label: 'Release the second witness' },
      { id: 'nereid-witness-3', kind: 'witness', x: 690, y: 166, name: 'Witness of Return', label: 'Release the third witness' },
      { id: 'pressure-shell-1', kind: 'pressure-shell', x: 320, y: 352, name: 'Harbor Shell', label: 'Turn the harbor shell' },
      { id: 'pressure-shell-2', kind: 'pressure-shell', x: 522, y: 154, name: 'Boundary Shell', label: 'Turn the boundary shell' },
      { id: 'pressure-shell-3', kind: 'pressure-shell', x: 724, y: 352, name: 'Crossing Shell', label: 'Turn the crossing shell' },
      { id: 'oceanus-boundary-well', kind: 'interact', x: 616, y: 276, name: 'Oceanus Boundary-Well', label: 'Read the old boundary' },
      { id: 'nereid-enclave', kind: 'marker', x: 778, y: 210, name: 'Nereid Enclave', label: 'Enter the enclave' },
      { id: 'echo-cavern', kind: 'marker', x: 452, y: 444, name: 'Echo Cavern', label: 'Follow the remembered song' },
      { id: 'unmoored-heart-invitation', kind: 'interact', x: 414, y: 414, name: 'Unmoored Heart Echo', label: 'Listen to the unmoored heart', sideQuest: 'sq-act2-unmoored-heart' },
    ],
    exits: [
      { id: 'caves-to-breakwater', x: 38, y: 284, toMapId: 'breakwater-road', spawnId: 'from-caves', returnSpawnId: 'from-breakwater', kind: 'foot', gate: [] },
      { id: 'caves-to-anchorage', x: 922, y: 276, toMapId: 'storm-anchorage', spawnId: 'from-caves', returnSpawnId: 'from-anchorage', kind: 'foot', gate: [] },
      { id: 'combat-act2-nereid-caves', x: 216, y: 284, kind: 'combat', encounterId: 'enc-act2-nereid-caves', label: 'Free the stranded witnesses', gate: [] },
      { id: 'combat-act2-unmoored-charmed', x: 452, y: 444, kind: 'combat', encounterId: 'enc-act2-unmoored-charmed', label: 'Confront the charmed medusa', gate: [] },
    ],
    collisions: [
      solid('caves-north-wall-1', 28, 34, 300, 92), solid('caves-north-wall-2', 620, 36, 306, 84),
      solid('caves-south-wall-1', 24, 458, 330, 50), solid('caves-south-wall-2', 596, 458, 332, 50),
      solid('caves-central-pillar', 438, 228, 76, 68), solid('caves-east-pillar', 770, 300, 62, 86),
    ],
    traversalLanes: [
      lane('cavern-main', 68, ACT2_TIDE_ORDER, [point(38, 284), point(216, 284), point(360, 350), point(540, 360), point(690, 250), point(922, 276)]),
      lane('cavern-echo-branch', 48, ['crossing', 'surge'], [point(360, 250), point(410, 350), point(452, 444)]),
      lane('cavern-enclave-branch', 48, ['ebb', 'crossing'], [point(690, 250), point(778, 210)]),
    ],
    decor: [
      { id: 'caves-crystal-1', kind: 'sea-crystal', x: 182, y: 162 }, { id: 'caves-crystal-2', kind: 'sea-crystal', x: 836, y: 408 },
      { id: 'caves-column', kind: 'column', x: 570, y: 92 }, { id: 'caves-tide-pool', kind: 'tide-pool', x: 472, y: 392 },
    ],
    tide: { initialStateId: 'ebb', laneIds: ['cavern-main', 'cavern-echo-branch', 'cavern-enclave-branch'], wellIds: [], skiffNodeIds: [], ropeLiftIds: [] },
  },

  'storm-anchorage': {
    id: 'storm-anchorage', bounds: { w: 960, h: 540 }, palette: PALETTES.anchorage,
    themeId: 'salt-covenant-storm-anchorage', decorSetId: 'reef-fortifications',
    spawns: {
      'from-caves': spawn('from-caves', 74, 286, 0),
      'from-barge': spawn('from-barge', 836, 386, Math.PI),
      'rope-lift': spawn('rope-lift', 720, 174, -Math.PI / 2),
    },
    entities: [
      { id: 'rope-lift', kind: 'rope-lift', x: 720, y: 174, name: 'Archive Rope Lift', label: 'Raise the archive pennant' },
    ],
    exits: [
      { id: 'anchorage-to-caves', x: 38, y: 286, toMapId: 'nereid-caves', spawnId: 'from-anchorage', returnSpawnId: 'from-caves', kind: 'foot', gate: [] },
      { id: 'anchorage-to-barge', x: 866, y: 402, toMapId: 'archive-barge-deck', spawnId: 'from-anchorage', returnSpawnId: 'from-barge', kind: 'skiff', label: 'Take the skiff to the barge', gate: [{ kind: 'flag', flagId: 'act2-anchorage-cleared', value: true }] },
      { id: 'combat-act2-anchorage', x: 430, y: 244, kind: 'combat', encounterId: 'enc-act2-anchorage', label: 'Break the anchorage ambush', gate: [] },
    ],
    collisions: [
      solid('anchorage-north-fort', 80, 54, 246, 90), solid('anchorage-crane-base', 676, 80, 102, 70),
      solid('anchorage-south-reef', 116, 426, 262, 58), solid('anchorage-east-reef', 856, 64, 62, 238),
      solid('anchorage-broken-ballista', 430, 296, 96, 56),
    ],
    traversalLanes: [
      lane('anchorage-platform', 76, ACT2_TIDE_ORDER, [point(38, 286), point(240, 274), point(430, 244), point(620, 260), point(836, 386)]),
      lane('anchorage-lift-path', 52, ACT2_TIDE_ORDER, [point(430, 244), point(600, 200), point(720, 174)]),
    ],
    decor: [
      { id: 'anchorage-mast', kind: 'broken-mast', x: 562, y: 124 }, { id: 'anchorage-brazier-1', kind: 'brazier', x: 236, y: 182 },
      { id: 'anchorage-brazier-2', kind: 'brazier', x: 774, y: 286 }, { id: 'anchorage-ruin', kind: 'ruin', x: 404, y: 112 },
      { id: 'archive-skiff-dock', kind: 'skiff-dock', x: 836, y: 386 },
    ],
    tide: { initialStateId: 'ebb', laneIds: ['anchorage-platform', 'anchorage-lift-path'], wellIds: [], skiffNodeIds: [], ropeLiftIds: ['rope-lift'] },
  },

  'archive-barge-deck': {
    id: 'archive-barge-deck', bounds: { w: 960, h: 540 }, palette: PALETTES.barge,
    themeId: 'salt-covenant-archive-barge', decorSetId: 'bronze-bound-archive-deck',
    spawns: {
      'from-anchorage': spawn('from-anchorage', 82, 392, 0),
      'from-harbor': spawn('from-harbor', 84, 188, 0),
      'post-boss': spawn('post-boss', 470, 270, Math.PI),
    },
    entities: [
      { id: 'cipher-folio-1', kind: 'interact', x: 296, y: 174, name: 'Cipher Folio: Arrival', label: 'Recover the arrival folio' },
      { id: 'cipher-folio-2', kind: 'interact', x: 690, y: 382, name: 'Cipher Folio: Return', label: 'Recover the return folio' },
      { id: 'archive-crates', kind: 'marker', x: 262, y: 350, name: 'Archive Crates', label: 'Search the archive crates' },
      { id: 'mast-hazard', kind: 'marker', x: 492, y: 176, name: 'Leviathan Mast', label: 'Avoid the falling mast' },
      { id: 'leviathan-arena', kind: 'marker', x: 596, y: 270, name: 'Leviathan Arena', label: 'Enter the archive hold' },
    ],
    exits: [
      { id: 'barge-to-harbor', x: 38, y: 188, toMapId: 'pelagos-harbor', spawnId: 'from-barge', returnSpawnId: 'from-harbor', kind: 'skiff', gate: [] },
      { id: 'combat-act2-archive-leviathan', x: 596, y: 270, kind: 'combat', encounterId: 'boss-act2-archive-leviathan', label: 'Face the Archive Leviathan', gate: [] },
    ],
    collisions: [
      solid('barge-north-rail', 34, 46, 892, 42), solid('barge-south-rail', 34, 458, 892, 42),
      solid('barge-mast-base', 454, 138, 76, 82), solid('barge-crate-stack-west', 198, 284, 118, 70),
      solid('barge-crate-stack-east', 728, 138, 116, 70),
    ],
    traversalLanes: [
      lane('barge-main-deck', 78, ACT2_TIDE_ORDER, [point(38, 188), point(250, 226), point(470, 270), point(690, 300), point(880, 270)]),
      lane('barge-lower-deck', 54, ACT2_TIDE_ORDER, [point(82, 392), point(300, 374), point(470, 332), point(690, 382)]),
    ],
    decor: [
      { id: 'barge-mast', kind: 'mast', x: 492, y: 176 }, { id: 'barge-crates-1', kind: 'archive-crate', x: 244, y: 310 },
      { id: 'barge-crates-2', kind: 'archive-crate', x: 760, y: 180 }, { id: 'barge-lantern-1', kind: 'brazier', x: 364, y: 106 },
      { id: 'barge-lantern-2', kind: 'brazier', x: 636, y: 106 },
    ],
    tide: { initialStateId: 'ebb', laneIds: ['barge-main-deck', 'barge-lower-deck'], wellIds: [], skiffNodeIds: [], ropeLiftIds: [] },
  },
})

function mergeSpawnTable(staticPocket, runtimeMap) {
  return Object.fromEntries(Object.entries(staticPocket.spawns).map(([id, definition]) => [
    id,
    { ...definition, ...runtimeMap.spawns[id], id },
  ]))
}

export function act2RuntimeMapById(id) {
  return (typeof id === 'string' && ACT2_RUNTIME_MAPS[id]) || null
}

export function act2RenderablePocketById(id) {
  const definition = act2PocketById(id)
  const runtime = act2RuntimeMapById(id)
  if (!definition || !runtime) return null
  const spawns = mergeSpawnTable(definition, runtime)
  return {
    ...definition,
    ...runtime,
    spawns,
    spawn: spawns[definition.spawnId],
    entities: runtime.entities.map((entity) => ({ ...entity })),
    exits: runtime.exits.map((exit) => ({ ...exit, gate: exit.gate.map((condition) => ({ ...condition })) })),
    collisions: runtime.collisions.map((collision) => ({ ...collision })),
    traversalLanes: runtime.traversalLanes.map((item) => ({ ...item, stateIds: [...item.stateIds], points: item.points.map((p) => ({ ...p })) })),
    decor: runtime.decor.map((item) => ({ ...item })),
    tide: { ...runtime.tide, laneIds: [...runtime.tide.laneIds], wellIds: [...runtime.tide.wellIds], skiffNodeIds: [...runtime.tide.skiffNodeIds], ropeLiftIds: [...runtime.tide.ropeLiftIds] },
  }
}

export const ACT2_RENDERABLE_MAPS = deepFreeze(Object.fromEntries(
  Object.keys(ACT2_POCKETS).map((id) => [id, act2RenderablePocketById(id)]),
))

export function act2RuntimeSpawnById(mapId, spawnId) {
  const map = act2RuntimeMapById(mapId)
  return (map && typeof spawnId === 'string' && map.spawns[spawnId]) || null
}

export function act2RuntimeEntityById(mapId, entityId) {
  const map = act2RuntimeMapById(mapId)
  return map?.entities.find((entity) => entity.id === entityId) || null
}

export function act2RuntimeExitById(connectionId) {
  for (const map of Object.values(ACT2_RUNTIME_MAPS)) {
    const exit = map.exits.find((candidate) => candidate.id === connectionId)
    if (exit) return exit
  }
  return null
}

export function act2RuntimeMarkerById(mapId, markerId) {
  const map = act2RuntimeMapById(mapId)
  if (!map || typeof markerId !== 'string') return null
  return map.spawns[markerId]
    || map.entities.find((entity) => entity.id === markerId)
    || map.exits.find((exit) => exit.id === markerId)
    || map.decor.find((item) => item.id === markerId)
    || null
}

// Validate the authored seam without throwing during module import. Consumers
// can surface these exact messages in build tooling or an editor inspector.
export function validateAct2Runtime() {
  const errors = []
  for (const [id, pocket] of Object.entries(ACT2_POCKETS)) {
    const runtime = act2RuntimeMapById(id)
    if (!runtime) { errors.push(`missing runtime map: ${id}`); continue }
    if (!(runtime.bounds.w > 0 && runtime.bounds.h > 0)) errors.push(`invalid bounds: ${id}`)
    for (const spawnId of Object.keys(pocket.spawns)) {
      if (!act2RuntimeSpawnById(id, spawnId)) errors.push(`missing spawn geometry: ${id}:${spawnId}`)
    }
  }
  for (const connection of ACT2_CONNECTIONS) {
    const exit = act2RuntimeExitById(connection.id)
    if (!exit) { errors.push(`missing exit geometry: ${connection.id}`); continue }
    if (exit.toMapId !== connection.to || exit.spawnId !== connection.arrivalSpawnId) {
      errors.push(`exit destination mismatch: ${connection.id}`)
    }
    if (JSON.stringify(exit.gate) !== JSON.stringify(connection.gate || [])) {
      errors.push(`exit gate mismatch: ${connection.id}`)
    }
  }
  return errors
}
