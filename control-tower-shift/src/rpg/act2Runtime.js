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
  act2Authoring,
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

function authoredMap({ question, systemsUsed, reward, consequence, recovery, minutes, originality }) {
  return act2Authoring({
    category: 'region-map', dramaticQuestion: question, systemsUsed,
    durableReward: reward, downstreamConsequence: consequence, recoveryBehavior: recovery,
    expectedMinutes: minutes, originalityNotes: originality,
  })
}

function authoredEntity({ question, systemsUsed, reward, consequence, recovery, minutes = 1, originality, resource = false, levelMin = 5, levelMax = 35 }) {
  return act2Authoring({
    category: resource ? 'gathering-resource' : 'world-entity', dramaticQuestion: question, systemsUsed,
    durableReward: reward, downstreamConsequence: consequence, recoveryBehavior: recovery,
    expectedMinutes: minutes, originalityNotes: originality, levelMin, levelMax,
  })
}

const ACT2_MAP_AUTHORING = deepFreeze({
  'pelagos-harbor': authoredMap({
    question: 'Can a working harbor remain open while sailors, gods, and nereids renegotiate who has authority to permit a crossing?',
    systemsUsed: ['banking', 'crafting', 'dialogue', 'questing', 'trading'],
    reward: 'The hub preserves covenant progress, physical service access, shrine state, and the post-ratification completion spawn.',
    consequence: 'Melite’s briefing begins Act II and the covenant table resolves it before opening the Fields of Kore.',
    recovery: 'Named harbor, barge-return, and post-covenant spawns provide stable recovery; services remain physically accessible without remote menus.',
    minutes: 9,
    originality: 'Uses public-domain Greek harbor, Poseidon-shrine, and oath-post motifs; Pelagos’ consent-based civic hub is original Oathbearer expression.',
  }),
  'breakwater-road': authoredMap({
    question: 'Can Kallias cross a changing causeway by learning the sea’s terms rather than overpowering them?',
    systemsUsed: ['combat', 'movement', 'tide-traversal'],
    reward: 'The map preserves the learned surge witness, cleared defense, and current covenant-tide state.',
    consequence: 'Its two tide wells teach the regional traversal grammar and connect the harbor to the Nereid Caves.',
    recovery: 'Both reciprocal exits and all canonical spawns remain reachable in valid tide states; the combat ready gate prevents unattended loss.',
    minutes: 7,
    originality: 'Uses public-domain Greek breakwater and tidal-crossing imagery; the shape-coded three-state route is original Oathbearer design.',
  }),
  'nereid-caves': authoredMap({
    question: 'Can a boundary cavern preserve distinct witnesses, distinct names, and an optional remembered desire without trapping the main path?',
    systemsUsed: ['combat', 'environment-puzzle', 'gathering', 'side-quest', 'tide-traversal'],
    reward: 'The cave preserves witness releases, pressure-shell rotations, optional quest progress, and its regional tin source.',
    consequence: 'Completing its witness and boundary work opens the storm anchorage while the echo branch contributes optional evidence.',
    recovery: 'Threshold and reciprocal spawns keep every required target reachable; partial order-free progress and tide state survive reload.',
    minutes: 16,
    originality: 'Uses public-domain nereid cavern, conch, and Oceanus-boundary motifs; the named witness and pressure-shell topology is original.',
  }),
  'storm-anchorage': authoredMap({
    question: 'Can a fortified storm platform become a shared archive route rather than another permanently occupied chokepoint?',
    systemsUsed: ['combat', 'fishing', 'movement', 'travel-unlock'],
    reward: 'The map preserves anchorage victory, rope-lift access, and the high-level tuna gathering node.',
    consequence: 'Clearing the platform activates the only gated skiff route to the archive barge.',
    recovery: 'The cave return, rope-lift checkpoint, and barge return spawn keep travel reversible before and after combat.',
    minutes: 7,
    originality: 'Uses public-domain storm anchorage and maritime fortification motifs; its archive-route purpose and consent framing are original.',
  }),
  'archive-barge-deck': authoredMap({
    question: 'Can the two halves of a stolen covenant be recovered from a moving archive before its guardian fixes one false history forever?',
    systemsUsed: ['boss-combat', 'exploration', 'interaction'],
    reward: 'The deck preserves each recovered folio, boss completion, and a safe post-boss return boundary.',
    consequence: 'Its evidence and Leviathan victory provide the final prerequisites for Salt Covenant ratification.',
    recovery: 'Named arrival and post-boss spawns keep folios through defeat, and the harbor skiff supplies a stable exit.',
    minutes: 10,
    originality: 'Uses public-domain Greek merchant-barge and sea-monster imagery; the stolen-clause archive deck is original Oathbearer expression.',
  }),
})

const ACT2_ENTITY_AUTHORING = deepFreeze({
  'pelagos-harbor:melite': authoredEntity({
    question: 'Will Melite trust Kallias to distinguish a harbor welcome from permission to cross the sea?', systemsUsed: ['dialogue', 'questing'],
    reward: 'Her briefing records the meeting and places the surge witness marker.', consequence: 'She directs Kallias to the breakwater and establishes the tide-reading rule.',
    recovery: 'Her deterministic conversation can resume after interruption without duplicating its flag or marker.', minutes: 2,
    originality: 'Uses the public-domain Greek harbor-keeper role; Melite and her arrival-versus-permission counsel are original.',
  }),
  'pelagos-harbor:ianthe-tidecharts': authoredEntity({
    question: 'Will a stranger’s claim about a god’s fragment earn a working chart-reader’s trust before her patience runs out?', systemsUsed: ['dialogue', 'questing'],
    reward: 'The scene records Ianthe as met and gives Kallias a concrete heading for the road beyond the Salt Covenant.', consequence: 'It closes the promise Thessa made at the end of Act I and grounds the Fields of Kore as a real, chart-read destination.',
    recovery: 'Her deterministic conversation, including one reconverging player choice, can resume after interruption without duplicating its flag effect.', minutes: 3,
    originality: 'Uses public-domain Mediterranean tide-chart and wayfinding practice; Ianthe’s transactional voice and the fragment-reading scene are original.',
  }),
  'pelagos-harbor:oath-post': authoredEntity({
    question: 'What fails when a civic oath-post uses the same name for welcome, arrival, and permission?', systemsUsed: ['interaction', 'questing'],
    reward: 'Inspection gives a stable physical reference for the harbor’s broken covenant.', consequence: 'The post grounds Melite’s explanation and the later three-form ratification.',
    recovery: 'The post remains physically present and repeat inspection cannot create duplicate quest rewards.',
    originality: 'Uses public-domain Greek inscribed decrees and harbor markers; this fused-name oath-post is original.',
  }),
  'pelagos-harbor:poseidon-shrine': authoredEntity({
    question: 'Can Poseidon be honored as keeper of harbors without granting him sole ownership of every crossing?', systemsUsed: ['checkpoint', 'shrine'],
    reward: 'The shrine provides a persistent Pelagos save point tied to Poseidon.', consequence: 'It frames the authority side of the covenant without deciding the final formulation.',
    recovery: 'Using the shrine creates a safe checkpoint; reload restores state without repeating story effects.',
    originality: 'Uses public-domain Poseidon worship and coastal shrines; its limited covenant role is original Oathbearer expression.',
  }),
  'pelagos-harbor:salt-covenant-table': authoredEntity({
    question: 'Which formulation can sailors, nereids, Poseidon, and Oceanus ratify without erasing one another?', systemsUsed: ['choice', 'questing'],
    reward: 'One covenant formulation and the Act II completion state persist permanently.', consequence: 'The choice completes Pelagos and unlocks Act III while preserving regional consequences.',
    recovery: 'The table remains inert until prerequisites are met; invalid or repeated choices cannot overwrite ratification.', minutes: 3,
    originality: 'Uses public-domain Greek council and covenant traditions; the three-form Salt Covenant table is original.',
  }),
  'pelagos-harbor:pelagos-woodwork-bench': authoredEntity({
    question: 'Will gathered harbor timber become useful equipment rather than decorative inventory?', systemsUsed: ['crafting', 'inventory'],
    reward: 'The physical bench enables authorized woodwork recipes and their exact XP awards.', consequence: 'It connects Pelagos materials to the broader regional crafting and merchant loops.',
    recovery: 'Every craft rechecks physical access and inventory capacity; invalid or unaffordable crafts are atomic.',
    originality: 'Uses public-domain shipyard woodworking practice; this exact station placement and recipe role are original.',
  }),
  'pelagos-harbor:pelagos-shipwright': authoredEntity({
    question: 'Can the harbor’s seafaring tools be maintained through visible local labor rather than a remote crafting menu?', systemsUsed: ['crafting', 'inventory'],
    reward: 'The physical shipwright enables authorized maritime recipes and deterministic crafting XP.', consequence: 'Its outputs support the regional economy and reinforce Pelagos as a working port.',
    recovery: 'Craft attempts revalidate map access, ingredients, quantity, and capacity before changing inventory.',
    originality: 'Uses public-domain Greek shipwright traditions; the station’s systemic closure role is original Oathbearer design.',
  }),
  'pelagos-harbor:pelagos-storehouse': authoredEntity({
    question: 'Will Pelagos give sailors and nereids a second physical place to secure gear, or leave the whole region dependent on one distant Beacon vault?', systemsUsed: ['banking', 'inventory'],
    reward: 'Deposited items persist in a second physical bank and can be withdrawn atomically, mirroring the Beacon Storehouse contract.', consequence: 'It extends the inventory-management loop the Beacon Storehouse established into the first region beyond Asterion Reach.', recovery: 'Full-capacity and invalid-quantity operations are atomic; closing or reloading preserves both pack and bank state.', minutes: 2,
    originality: 'Uses public-domain Greek harbor storehouse practice; a second regional bank tied to Pelagos’ working-port identity is original Oathbearer design.',
  }),
  'pelagos-harbor:steward-salt-garden': authoredEntity({
    question: 'Will Pelagos treat a salt-ruined garden as a solvable civic problem, or leave it a permanent scar from the surge?', systemsUsed: ['inventory', 'resource-respawn', 'stewardship', 'trading'],
    reward: 'A one-time leaching with fresh water permanently restores the plot; afterward each available charge awards one sea fig and 35 Stewardship XP.', consequence: 'Sea figs feed Thaleia’s chandlery trade, and the restoration is Stewardship’s first Act II tier, proving the restore-then-tend contract scales regionally.',
    recovery: 'Restoration is exact-once and its water-cask cost is atomic; once restored the garden behaves like any other resource node, with inventory-full gathering atomic and depletion surviving reload.', minutes: 2, resource: true, levelMin: 15, levelMax: 20,
    originality: 'Uses public-domain Mediterranean coastal sea-fig foraging and freshwater soil-leaching practice; the salt-damaged civic garden and its restore contract are original Oathbearer design.',
  }),
  'pelagos-harbor:pelagos-red-mullet-run': authoredEntity({
    question: 'Can a working quay support a mid-level fishing run without pulling attention from the covenant crisis at its center?', systemsUsed: ['fishing', 'inventory', 'resource-respawn'],
    reward: 'Each available charge awards one red mullet and 27 Fishing XP at the authored level gate.', consequence: 'Red mullet supplies the mid-level ingredient bridge between shore sardine and the storm-anchorage tuna run.',
    recovery: 'Failed level or capacity checks are atomic; depletion persists and respawns from deterministic playtime ticks.', minutes: 2, resource: true, levelMin: 15, levelMax: 20,
    originality: 'Uses public-domain Mediterranean red-mullet fishing; the harbor-run placement and progression role are original.',
  }),
  'breakwater-road:tide-well-harbor': authoredEntity({
    question: 'Will Kallias deliberately turn the covenant tide toward the harbor instead of waiting for an invisible timer?', systemsUsed: ['interaction', 'tide-traversal'],
    reward: 'Activation deterministically advances and persists the canonical tide state.', consequence: 'The changed state alters which causeway lanes are traversable without drowning timers.',
    recovery: 'The well is reachable from every relevant spawn and active lane; tide state survives transitions and reload.',
    originality: 'Uses public-domain sacred-well and tidal motifs; explicit player-controlled tide cycling is original.',
  }),
  'breakwater-road:tide-well-caves': authoredEntity({
    question: 'Will Kallias open the cavern route while respecting the same visible tide rules learned at the harbor well?', systemsUsed: ['interaction', 'tide-traversal'],
    reward: 'Activation deterministically advances and persists the canonical tide state.', consequence: 'The changed state opens or closes authored lanes leading toward the Nereid Caves.',
    recovery: 'The well is reachable from every relevant spawn and active lane; malformed interactions cannot change state.',
    originality: 'Uses public-domain sacred-well and tidal motifs; the paired cave-facing controller is original Oathbearer design.',
  }),
  'breakwater-road:surge-witness': authoredEntity({
    question: 'Can the first surge be learned as readable information rather than as surprise punishment?', systemsUsed: ['interaction', 'tide-traversal'],
    reward: 'Witnessing the marker records the regional tide tutorial as quest progress.', consequence: 'It advances the main objective toward the cave rescues without launching the nearby combat.',
    recovery: 'Its semantic target is separately reachable and remains available until the objective is satisfied.',
    originality: 'Uses public-domain sea-surge imagery; the non-color tutorial witness is original Oathbearer design.',
  }),
  'nereid-caves:nereid-witness-1': authoredEntity({
    question: 'Will the Witness of Arrival retain a distinct account instead of being absorbed into a generic rescue total?', systemsUsed: ['interaction', 'questing'],
    reward: 'The first named witness contributes exactly one persistent release.', consequence: 'Her account is one of three required before the boundary names can be separated.',
    recovery: 'Release is order-free, survives reload, and repeated interaction cannot increment the count.',
    originality: 'Uses public-domain nereid mythology; the individual Witness of Arrival and ledger role are original.',
  }),
  'nereid-caves:nereid-witness-2': authoredEntity({
    question: 'Will the Witness of Passage retain a distinct account instead of being absorbed into a generic rescue total?', systemsUsed: ['interaction', 'questing'],
    reward: 'The second named witness contributes exactly one persistent release.', consequence: 'Her account is one of three required before the boundary names can be separated.',
    recovery: 'Release is order-free, survives reload, and repeated interaction cannot increment the count.',
    originality: 'Uses public-domain nereid mythology; the individual Witness of Passage and ledger role are original.',
  }),
  'nereid-caves:nereid-witness-3': authoredEntity({
    question: 'Will the Witness of Return retain a distinct account instead of being absorbed into a generic rescue total?', systemsUsed: ['interaction', 'questing'],
    reward: 'The third named witness contributes exactly one persistent release.', consequence: 'Her account completes the three-witness condition for the boundary-name puzzle.',
    recovery: 'Release is order-free, survives reload, and repeated interaction cannot increment the count.',
    originality: 'Uses public-domain nereid mythology; the individual Witness of Return and ledger role are original.',
  }),
  'nereid-caves:pressure-shell-1': authoredEntity({
    question: 'Can the Harbor Shell preserve a civic oath without claiming the whole sea as harbor property?', systemsUsed: ['environment-puzzle', 'interaction'],
    reward: 'Rotation records one exact persistent boundary-separation step.', consequence: 'It contributes to the three-shell condition that opens the anchorage objective.',
    recovery: 'The order-free rotation survives reload and cannot be credited twice.',
    originality: 'Uses public-domain conch and harbor symbolism; the Harbor Shell naming function is original.',
  }),
  'nereid-caves:pressure-shell-2': authoredEntity({
    question: 'Can the Boundary Shell name Oceanus’ limit without turning every crossing into prohibition?', systemsUsed: ['environment-puzzle', 'interaction'],
    reward: 'Rotation records one exact persistent boundary-separation step.', consequence: 'It contributes to the three-shell condition that opens the anchorage objective.',
    recovery: 'The order-free rotation survives reload and cannot be credited twice.',
    originality: 'Uses public-domain Oceanus and conch symbolism; the Boundary Shell naming function is original.',
  }),
  'nereid-caves:pressure-shell-3': authoredEntity({
    question: 'Can the Crossing Shell name negotiated passage as distinct from both ownership and exclusion?', systemsUsed: ['environment-puzzle', 'interaction'],
    reward: 'Rotation records one exact persistent boundary-separation step.', consequence: 'It completes the three-shell condition when the other two names are also restored.',
    recovery: 'The order-free rotation survives reload and cannot be credited twice.',
    originality: 'Uses public-domain conch and sea-passage motifs; the Crossing Shell naming function is original.',
  }),
  'nereid-caves:oceanus-boundary-well': authoredEntity({
    question: 'What does Oceanus’ older boundary record reveal that the harbor oath forgot?', systemsUsed: ['interaction', 'lore'],
    reward: 'Reading the well provides a stable in-world account of the old boundary distinction.', consequence: 'Its language informs the boundary-first and shared-crossing covenant interpretations.',
    recovery: 'The fixed well remains reachable and carries no repeatable reward that could be duplicated.',
    originality: 'Uses public-domain Oceanus as the world-encircling boundary; the readable boundary-well is original.',
  }),
  'nereid-caves:nereid-enclave': authoredEntity({
    question: 'Will Kallias approach the nereid enclave as a community with testimony rather than a quest destination?', systemsUsed: ['exploration', 'questing'],
    reward: 'The marker provides a stable physical destination for the rescued witnesses.', consequence: 'It spatially separates nereid testimony from the combat threshold and optional echo branch.',
    recovery: 'The marker remains reachable in its authored tide states and has no destructive repeat effect.',
    originality: 'Uses public-domain nereid community imagery; this enclave’s witness-led civic role is original.',
  }),
  'nereid-caves:echo-cavern': authoredEntity({
    question: 'Will Kallias follow a remembered song into an optional dispute about desire and identity?', systemsUsed: ['exploration', 'side-quest'],
    reward: 'Reaching the marker records optional Unmoored Heart route progress.', consequence: 'It leads to the charmed-medusa encounter without gating the main covenant.',
    recovery: 'The branch remains reachable in Crossing or Surge and can be abandoned for the neutral fallback.',
    originality: 'Uses public-domain cave-echo motifs; the remembered-song side path is original Oathbearer expression.',
  }),
  'nereid-caves:unmoored-heart-invitation': authoredEntity({
    question: 'Is the remembered voice worth following when it offers evidence but no obligation?', systemsUsed: ['interaction', 'side-quest'],
    reward: 'Listening activates the optional Unmoored Heart quest without altering main-quest state.', consequence: 'It makes the echo route and optional affinity debate legible to the player.',
    recovery: 'Activation is exact-once, and declining or leaving preserves a fully completable main story.',
    originality: 'Uses public-domain echo and divine-desire motifs; the invitation and neutral refusal path are original.',
  }),
  'nereid-caves:nereid-tin-vein': authoredEntity({
    question: 'Will sea-washed tin become a legitimate regional input to bronze craft rather than unexplained inventory?', systemsUsed: ['inventory', 'quarrying', 'resource-respawn'],
    reward: 'Each available charge awards one tin ore and 20 Quarrying XP.', consequence: 'Tin closes the legitimate source chain for bronze recipes and regional merchant value.',
    recovery: 'Inventory-full gathering is atomic; depletion persists and respawns from deterministic playtime ticks.', minutes: 2, resource: true, levelMin: 5, levelMax: 20,
    originality: 'Uses public-domain Bronze Age tin trade; the sea-washed Nereid vein and its systems placement are original.',
  }),
  'storm-anchorage:rope-lift': authoredEntity({
    question: 'Can the archive route be opened by a visible civic signal rather than an unexplained teleport?', systemsUsed: ['interaction', 'travel-unlock'],
    reward: 'The lift marks the cleared anchorage checkpoint and physical skiff-route activation.', consequence: 'It connects the ambush victory to boarding the archive barge.',
    recovery: 'The lift and return spawn remain reachable after victory; the gated route cannot activate before the clear flag.',
    originality: 'Uses public-domain harbor lifts and signal pennants; this archive-route mechanism is original.',
  }),
  'storm-anchorage:anchorage-tuna-run': authoredEntity({
    question: 'Will a dangerous offshore fishing ground reward developed skill without pretending to be early-game forage?', systemsUsed: ['fishing', 'inventory', 'resource-respawn'],
    reward: 'Each available charge awards one tuna and 45 Fishing XP at the authored level gate.', consequence: 'Tuna supplies the legitimate high-level ingredient source for regional cooking.',
    recovery: 'Failed level or capacity checks are atomic; depletion persists and respawns from deterministic playtime ticks.', minutes: 2, resource: true, levelMin: 30, levelMax: 35,
    originality: 'Uses public-domain Mediterranean tuna fishing; the storm-anchorage run and its progression role are original.',
  }),
  'storm-anchorage:anchorage-sturgeon-run': authoredEntity({
    question: 'Does the cleared anchorage keep rewarding return visits with a catch worth the earlier fight?', systemsUsed: ['fishing', 'inventory', 'resource-respawn'],
    reward: 'Each available charge awards one sturgeon and 72 Fishing XP at the authored level gate.', consequence: 'Sturgeon supplies the advanced ingredient tier feeding regional cooking and later trade demand.',
    recovery: 'Failed level or capacity checks are atomic; depletion persists and respawns from deterministic playtime ticks.', minutes: 2, resource: true, levelMin: 50, levelMax: 55,
    originality: 'Uses public-domain Black Sea sturgeon fishing; the deepwater anchorage run and its late-Act-II role are original.',
  }),
  'storm-anchorage:straton-garrison-quartermaster': authoredEntity({
    question: 'Will the cleared garrison actually stock the iron a level-15 smith needs, or leave every iron-tier recipe stranded until the Forge March?', systemsUsed: ['trading'],
    reward: 'Straton sells iron ore, the missing ingredient for every level-15 iron-tier tool recipe, which was otherwise unreachable before Act IV.', consequence: 'It closes a genuine progression gap: bronzework players who reach level 15 in Act II or III can now actually forge the iron tier on schedule.',
    recovery: 'Trades revalidate stock and funds before completing; an interrupted purchase leaves currency and inventory unchanged.', minutes: 1,
    originality: 'Uses public-domain garrison-quartermaster practice; Straton and his iron-supply role are original Oathbearer design.',
  }),
  'archive-barge-deck:cipher-folio-1': authoredEntity({
    question: 'What did the covenant promise at Arrival before the archive split it from Return?', systemsUsed: ['interaction', 'questing'],
    reward: 'The Arrival folio records one exact persistent half of the recovered covenant evidence.', consequence: 'Together with the Return folio it enables the Leviathan objective and later ratification.',
    recovery: 'It can be collected in either order, survives boss defeat, and cannot count twice.',
    originality: 'Uses public-domain treaty-folio traditions; the Arrival clause and split archive are original.',
  }),
  'archive-barge-deck:cipher-folio-2': authoredEntity({
    question: 'What did the covenant promise at Return before the archive split it from Arrival?', systemsUsed: ['interaction', 'questing'],
    reward: 'The Return folio records one exact persistent half of the recovered covenant evidence.', consequence: 'Together with the Arrival folio it enables the Leviathan objective and later ratification.',
    recovery: 'It can be collected in either order, survives boss defeat, and cannot count twice.',
    originality: 'Uses public-domain treaty-folio traditions; the Return clause and split archive are original.',
  }),
  'archive-barge-deck:archive-crates': authoredEntity({
    question: 'What ordinary records surround the stolen covenant clauses on the archive barge?', systemsUsed: ['exploration', 'lore'],
    reward: 'The marker gives the deck a stable searchable archive landmark.', consequence: 'It locates the folios within a working stolen-record context rather than an abstract pickup room.',
    recovery: 'The fixed landmark remains visible and carries no repeatable state mutation.',
    originality: 'Uses public-domain maritime cargo and archives; these confiscated civic record crates are original.',
  }),
  'archive-barge-deck:mast-hazard': authoredEntity({
    question: 'Can the Leviathan’s falling mast be read as a telegraphed hazard rather than arbitrary damage?', systemsUsed: ['boss-combat', 'telegraph'],
    reward: 'The landmark identifies the authored source of the boss’s phased mast-slam threat.', consequence: 'It ties the deck geometry to all three Leviathan combat phases.',
    recovery: 'The hazard is inactive outside the ready-gated encounter and resets with the boss checkpoint.',
    originality: 'Uses public-domain ship-mast hazards; the three-phase Leviathan telegraph is original Oathbearer design.',
  }),
  'archive-barge-deck:leviathan-arena': authoredEntity({
    question: 'Will Kallias enter the archive hold prepared to preserve evidence through a boss defeat?', systemsUsed: ['boss-combat', 'interaction'],
    reward: 'The arena provides the distinct physical launch point for the Archive Leviathan.', consequence: 'Its encounter is the final combat gate before covenant ratification.',
    recovery: 'The launch respects prerequisites and ready state; defeat returns to the authored pre-boss checkpoint with folios intact.',
    originality: 'Uses public-domain sea-monster holds and shipboard arenas; this evidence-preserving boss threshold is original.',
  }),
  'archive-barge-deck:archive-hippocamp-shoal': authoredEntity({
    question: 'Can the warded shoal reward patient, rare-tier harvest without turning the guarded archive deck into an ordinary fishing spot?', systemsUsed: ['fishing', 'inventory', 'resource-respawn'],
    reward: 'Its single slow-cycling charge awards one hippocamp roe and 135 Fishing XP at the authored level gate.', consequence: 'Hippocamp roe supplies the rare top-tier ingredient reserved for the archive’s warded waters.',
    recovery: 'Failed level or capacity checks are atomic; the long respawn cadence persists across reload from deterministic playtime ticks.', minutes: 2, resource: true, levelMin: 75, levelMax: 80,
    originality: 'Uses the public-domain hippocamp of Greek myth; harvesting its roe as a warded rare-fishing resource is original Oathbearer design.',
  }),
})

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
      { id: 'ianthe-tidecharts', kind: 'npc', x: 860, y: 420, name: 'Ianthe', label: 'Speak with Ianthe', conversationId: 'act2-ianthe-first-meeting' },
      { id: 'oath-post', kind: 'interact', x: 280, y: 330, name: 'Harbor Oath-Post', label: 'Inspect the oath-post' },
      { id: 'poseidon-shrine', kind: 'shrine', x: 328, y: 174, name: 'Poseidon Shrine', label: 'Honor the keeper of harbors', deityId: 'poseidon', savePointId: 'shrine-pelagos-poseidon' },
      { id: 'salt-covenant-table', kind: 'choice', x: 442, y: 246, name: 'Salt Covenant Table', label: 'Ratify the Salt Covenant', choiceIds: ['harbor-first', 'boundary-first', 'shared-crossing'] },
      { id: 'pelagos-woodwork-bench', kind: 'station', stationId: 'woodwork-bench', x: 560, y: 340, name: 'Pelagos Woodwork Bench', label: 'Shape harbor timber' },
      { id: 'pelagos-shipwright', kind: 'station', stationId: 'shipwright', x: 740, y: 340, name: 'Pelagos Shipwright', label: 'Work at the harbor shipwright' },
      { id: 'thaleia-harbor-chandler', kind: 'shop', shopId: 'pelagos-chandler', x: 620, y: 250, name: 'Thaleia', label: 'Trade at the harbor chandlery' },
      { id: 'pelagos-red-mullet-run', kind: 'resource', x: 300, y: 400, name: 'Pelagos Red Mullet Run', label: 'Fish the harbor red mullet run', skillId: 'fishing', itemId: 'red-mullet', level: 15, xp: 27 },
      { id: 'pelagos-storehouse', kind: 'bank', x: 500, y: 300, name: 'Pelagos Storehouse', label: 'Open the Pelagos Storehouse' },
      {
        id: 'steward-salt-garden', kind: 'resource', x: 180, y: 420, name: 'Salt-Damaged Garden', label: 'Tend the salt-damaged garden',
        skillId: 'stewardship', itemId: 'sea-fig', level: 20, xp: 35,
        requiresFlag: 'steward:restored:pelagos-harbor:steward-salt-garden',
        restore: {
          level: 15, xp: 30,
          cost: [{ itemId: 'water-cask', quantity: 3 }],
          label: 'Leach the salt-damaged garden with fresh water',
        },
      },
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
      { id: 'nereid-tin-vein', kind: 'resource', x: 820, y: 260, name: 'Nereid Tin Vein', label: 'Mine the sea-washed tin vein', skillId: 'quarrying', itemId: 'tin-ore', level: 5, xp: 20 },
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
      { id: 'anchorage-tuna-run', kind: 'resource', x: 240, y: 320, name: 'Storm Tuna Run', label: 'Fish the storm tuna run', skillId: 'fishing', itemId: 'tuna', level: 30, xp: 45 },
      { id: 'anchorage-sturgeon-run', kind: 'resource', x: 620, y: 310, name: 'Deepwater Sturgeon Run', label: 'Fish the deepwater sturgeon run', skillId: 'fishing', itemId: 'sturgeon', level: 50, xp: 72 },
      { id: 'straton-garrison-quartermaster', kind: 'shop', shopId: 'anchorage-garrison-quartermaster', x: 780, y: 320, name: 'Straton', label: 'Trade with Straton' },
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
      {
        id: 'archive-hippocamp-shoal', kind: 'resource', x: 300, y: 420, name: 'Archive Hippocamp Shoal',
        label: 'Draw roe from the warded hippocamp shoal', skillId: 'fishing', itemId: 'hippocamp-roe', level: 75, xp: 135,
        capacity: 1, respawnTicks: 1100,
      },
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
    authoring: ACT2_MAP_AUTHORING[id],
    spawns,
    spawn: spawns[definition.spawnId],
    entities: runtime.entities.map((entity) => ({
      ...entity,
      ...(entity.kind === 'shop' ? {} : { authoring: ACT2_ENTITY_AUTHORING[`${id}:${entity.id}`] }),
    })),
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
