// RPG vertical-slice content — authored, data-only. Nothing here reads time,
// RNG, or the DOM. Stable kebab-case IDs are the only contracts story logic
// reasons about; display text is never used to infer progression.
//
// Reuses the arena contracts: Tier 1 patron roster (characters.js) and power
// definitions (powers.js) are canonical. Patron loadouts come from
// `powersForGod(god)` at runtime — never duplicated here.

import { GODS_TIER_1 } from '../game/characters.js'
import { AUTHORING_SCHEMA_VERSION } from './authoringSchema.js'

export const REGION_ID = 'asterion-reach'

function act1Authoring({
  category,
  dramaticQuestion,
  systemsUsed,
  durableReward,
  downstreamConsequence,
  recoveryBehavior,
  expectedMinutes,
  originalityNotes,
  levelMin = 1,
  levelMax = 5,
}) {
  return {
    schemaVersion: AUTHORING_SCHEMA_VERSION,
    category,
    dramaticQuestion,
    systemsUsed,
    durableReward,
    downstreamConsequence,
    recoveryBehavior,
    expectedMinutes,
    originalityNotes,
    levelBand: { min: levelMin, max: levelMax },
    regionBand: { regionIds: [REGION_ID], acts: { min: 1, max: 1 } },
  }
}

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
    authoring: act1Authoring({
      category: 'region-map',
      dramaticQuestion: 'Can a civic refuge remain useful while its founding oath and divine protection are being erased?',
      systemsUsed: ['banking', 'combat', 'dialogue', 'gathering', 'movement', 'patron-choice', 'trading'],
      durableReward: 'The hub retains the chosen patron, banked inventory, gathered-node state, and post-mission return state.',
      downstreamConsequence: 'Its shrine, Thessa scenes, and Sun Court gate carry the player from onboarding through the Act II handoff.',
      recoveryBehavior: 'The start and post-mission spawns provide stable returns; the shrine is a safe checkpoint and failed encounters return to exploration.',
      expectedMinutes: 15,
      originalityNotes: 'Uses public-domain Greek acropolis, oath-stone, and civic-shrine motifs; the broken epithet crisis and layered service hub are original Oathbearer expression.',
    }),
    // `spawn` is the default fallback; `spawns` holds every named spawn.
    spawn: { id: 'start', x: 160, y: 400, facing: 0 },
    spawns: {
      'start': { id: 'start', x: 160, y: 400, facing: 0 },
      // Post-mission overlook: where Kallias stands after Act I resolves.
      'post-mission': { id: 'post-mission', x: 430, y: 300, facing: 0 },
    },
    entities: [
      // The broken treaty-stone: witnessing it is a tutorial/flag beat.
      {
        id: 'treaty-stone', kind: 'interact', x: 430, y: 268, name: 'Broken Treaty-Stone', label: 'Examine the broken stone', firstOnly: true,
        authoring: act1Authoring({
          category: 'world-entity',
          dramaticQuestion: 'What does a community lose when the public record of its promise is physically broken?',
          systemsUsed: ['interaction', 'questing'],
          durableReward: 'The first inspection is recorded once as witnessed world state.',
          downstreamConsequence: 'It gives concrete context for Thessa’s explanation of the broken Accord without gating later travel.',
          recoveryBehavior: 'The object remains visible after interruption; its first-only effect cannot be duplicated.',
          expectedMinutes: 1,
          originalityNotes: 'Draws on public-domain Greek boundary stones and inscribed civic decrees; the shattered treaty witness is original Oathbearer expression.',
        }),
      },
      // The first patron shrine (patron selection + checkpoint).
      {
        id: 'shrine', kind: 'shrine', x: 320, y: 170, name: 'First Patron Shrine', label: 'Approach the shrine', patron: true,
        authoring: act1Authoring({
          category: 'world-entity',
          dramaticQuestion: 'Which divine relationship will Kallias accept before crossing the Veil?',
          systemsUsed: ['checkpoint', 'interaction', 'patron-choice'],
          durableReward: 'The selected Tier I patron and its canonical power loadout persist in the save.',
          downstreamConsequence: 'The choice determines the power available in both Act I encounters while preserving the classless progression path.',
          recoveryBehavior: 'Selection occurs at a safe shrine boundary; reload restores the persisted patron without granting another choice effect.',
          expectedMinutes: 2,
          originalityNotes: 'Uses public-domain Greek votive-shrine and divine-patron motifs; a mortal carrying one patron beyond the Veil is original Oathbearer expression.',
        }),
      },
      // Thessa, the pragmatic keeper of the Accord — Act I guide.
      {
        id: 'thessa', kind: 'npc', x: 662, y: 280, name: 'Thessa', label: 'Talk to Thessa', conversationId: 'act1-thessa-overlook',
        authoring: act1Authoring({
          category: 'world-entity',
          dramaticQuestion: 'Will Thessa trust an untested Oathbearer with the Reach’s remaining name?',
          systemsUsed: ['dialogue', 'questing'],
          durableReward: 'Her intro records thessa-met and her exit scene awards Far-Sighted and the Pelagos lead.',
          downstreamConsequence: 'She frames the shrine and combat route, then turns the recovered fragment into the Act II objective.',
          recoveryBehavior: 'Dialogue can resume or end through the same deterministic effect boundary; repeated completion cannot duplicate effects.',
          expectedMinutes: 4,
          originalityNotes: 'Uses the public-domain Greek keeper and civic-counselor tradition; Thessa, her pragmatic voice, and the epithet-restoration role are original.',
        }),
      },
      {
        id: 'beacon-bank', kind: 'bank', x: 548, y: 424, name: 'Beacon Storehouse', label: 'Open the Beacon Storehouse',
        authoring: act1Authoring({
          category: 'world-entity',
          dramaticQuestion: 'What must Kallias carry now, and what should be secured for the road ahead?',
          systemsUsed: ['banking', 'inventory'],
          durableReward: 'Deposited items persist in the physical bank and can be withdrawn atomically.',
          downstreamConsequence: 'It establishes the inventory-management loop used by gathering, crafting, death protection, and later travel.',
          recoveryBehavior: 'Full-capacity and invalid-quantity operations are atomic; closing or reloading preserves both pack and bank state.',
          expectedMinutes: 2,
          originalityNotes: 'Uses public-domain Greek storehouse practice; the Beacon’s player-facing exact-once bank role and presentation are original Oathbearer design.',
        }),
      },
      { id: 'myrrine-provisioner', kind: 'shop', shopId: 'beacon-provisioner', x: 650, y: 410, name: 'Myrrine', label: 'Trade with Myrrine' },
      {
        id: 'beacon-alchemy-bench', kind: 'station', stationId: 'alchemy-lab', x: 550, y: 180, name: 'Beacon Alchemy Bench', label: 'Brew remedies at the Beacon bench',
        authoring: act1Authoring({
          category: 'world-entity',
          dramaticQuestion: 'Will Kallias be able to dry a single herb before the whole campaign is behind them, or must alchemy wait entirely for a laboratory two regions away?',
          systemsUsed: ['alchemy', 'crafting', 'inventory'],
          durableReward: 'The bench enables every authorized alchemy recipe reachable at the player’s level, starting with the level-1 Dry Herbs recipe, from the first hub.',
          downstreamConsequence: 'It closes a genuine progression gap where the entire alchemy skill — all three of its recipes — was otherwise physically unreachable until Act III.',
          recoveryBehavior: 'Craft attempts revalidate map access, ingredients, quantity, and capacity before changing inventory; an interrupted craft leaves inventory unchanged.',
          expectedMinutes: 1,
          originalityNotes: 'Uses public-domain Mediterranean herb-drying and remedy practice; placing a working bench at the Beacon hub is original Oathbearer design.',
        }),
      },
      {
        id: 'beacon-field-kitchen', kind: 'station', stationId: 'field-kitchen', x: 460, y: 400, name: 'Beacon Field Kitchen', label: 'Cook at the Beacon field kitchen',
        authoring: act1Authoring({
          category: 'world-entity',
          dramaticQuestion: 'Can a field kitchen turn gathered food into a practical shared meal before the road makes every ration feel solitary?',
          systemsUsed: ['crafting', 'cooking', 'inventory'],
          durableReward: 'The kitchen provides a concrete, reachable station for Act I cooking recipes and preserves their crafted food in the player inventory.',
          downstreamConsequence: 'Its nearby storehouse supports the explicit local bank-material craft flow without making crafting a remote menu.',
          recoveryBehavior: 'Craft attempts revalidate the kitchen, ingredients, capacity, and any nearby bank at the moment of use, so interruption leaves materials unchanged.',
          expectedMinutes: 2,
          originalityNotes: 'Uses public-domain Mediterranean field-kitchen and communal-hearth practice; this overlapping civic service layout is original Oathbearer design.',
        }),
      },
      {
        id: 'beacon-shrine-fire', kind: 'station', stationId: 'shrine-fire', x: 370, y: 110, name: 'Beacon Shrine Fire', label: 'Consecrate an offering at the Beacon shrine fire',
        authoring: act1Authoring({
          category: 'world-entity',
          dramaticQuestion: 'Can a maintained shrine fire make a crafted offering feel like a chosen act of devotion rather than a hidden inventory exchange?',
          systemsUsed: ['crafting', 'devotion', 'inventory'],
          durableReward: 'The fire gives devotion recipes a visible, durable Act I station while preserving each crafted offering in the normal inventory ledger.',
          downstreamConsequence: 'It establishes the physical ritual-workbench grammar reused by later shrines without forcing a patron choice or story branch.',
          recoveryBehavior: 'Craft attempts validate station reach, ingredients, and capacity atomically; closing the panel or walking away cannot consume an offering.',
          expectedMinutes: 2,
          originalityNotes: 'Uses public-domain Greek shrine-fire and votive practice; the player-facing craft-and-devotion station is original Oathbearer design.',
        }),
      },
      {
        id: 'beacon-sacred-hind', kind: 'wild-creature', x: 150, y: 150, name: 'Sacred Hind', label: 'Calm the sacred hind',
        skillId: 'beastbond', level: 1, xp: 18,
        requiresFlag: 'beastbond:calmed:beacon-overlook:beacon-sacred-hind',
        cost: [{ itemId: 'honeyed-figs', quantity: 1 }],
        reward: { currency: 30 },
        authoring: act1Authoring({
          category: 'world-entity',
          dramaticQuestion: 'Will Kallias earn a wild creature’s trust through patient offering, or does Beastbond stay a definition with nothing to actually train it?',
          systemsUsed: ['beastbond', 'inventory'],
          durableReward: 'A successful calming permanently bonds the hind, awards Beastbond XP, and pays out 30 drachmae — Beastbond previously had no obtainable XP source anywhere in the game.',
          downstreamConsequence: 'It gives Beastbond a genuine first loop, reusing the same exact-once, level-gated, atomic-cost contract Guile’s locked chest already proved out.',
          recoveryBehavior: 'A failed or interrupted attempt leaves the offering and currency untouched; an already-calmed hind cannot be calmed again.',
          expectedMinutes: 1,
          originalityNotes: 'Uses the public-domain Greek sacred-hind motif (an Artemis-associated deer, not any protected character); this exact-once Beastbond training contract is original Oathbearer design.',
        }),
      },
      {
        id: 'beacon-votive-stand', kind: 'station', stationId: 'votive-stand', x: 250, y: 80, name: 'Votive Stand', label: 'Leave a votive offering',
        authoring: act1Authoring({
          category: 'world-entity',
          dramaticQuestion: 'Can Kallias build real standing with the divine through small, repeatable devotion, or does favor only ever arrive as a scripted story beat?',
          systemsUsed: ['crafting', 'devotion', 'inventory'],
          durableReward: 'Each votive offering permanently and repeatably trains Devotion — the skill previously had no obtainable XP source anywhere in the game — and yields a Votive Favor blessing consumable.',
          downstreamConsequence: 'It gives Devotion a genuine player-driven progression loop, standing apart from the shrine’s own one-time patron-selection and checkpoint role, which this stand never touches.',
          recoveryBehavior: 'Offering attempts revalidate map access, the votive-oil cost, and quantity before changing inventory; an interrupted offering leaves inventory unchanged.',
          expectedMinutes: 1,
          originalityNotes: 'Uses public-domain Greek votive-offering practice; a dedicated stand for repeatable player-driven devotion training is original Oathbearer design.',
        }),
      },
      {
        id: 'beacon-kiln', kind: 'station', stationId: 'kiln', x: 620, y: 120, name: 'Beacon Kiln', label: 'Fire clay at the Beacon kiln',
        authoring: act1Authoring({
          category: 'world-entity',
          dramaticQuestion: 'Will Kallias be able to mold a single clay brick before the whole campaign is behind them, or must hearthkeeping wait entirely for a kiln two regions away?',
          systemsUsed: ['crafting', 'hearthkeeping', 'inventory'],
          durableReward: 'The kiln enables every authorized hearthkeeping recipe reachable at the player’s level, starting with the level-1 Clay Brick recipe, from the first hub.',
          downstreamConsequence: 'It closes a genuine progression gap where the entire hearthkeeping skill — four of its five recipes, including the level-1 one — was otherwise physically unreachable until Act III.',
          recoveryBehavior: 'Craft attempts revalidate map access, ingredients, quantity, and capacity before changing inventory; an interrupted craft leaves inventory unchanged.',
          expectedMinutes: 1,
          originalityNotes: 'Uses public-domain Aegean domestic kiln practice; placing a working kiln at the Beacon hub is original Oathbearer design.',
        }),
      },
      {
        id: 'beacon-bronze-forge', kind: 'station', stationId: 'bronze-forge', x: 700, y: 180, name: 'Beacon Bronze Forge', label: 'Work metal at the Beacon forge',
        authoring: act1Authoring({
          category: 'world-entity',
          dramaticQuestion: 'Will Kallias be able to forge a single piece of bronze gear before the whole campaign is behind them, or must every recipe wait for a foundry three regions away?',
          systemsUsed: ['bronzework', 'crafting', 'inventory'],
          durableReward: 'The forge enables every authorized bronzework recipe and its deterministic crafting XP from the very first hub, not only at the Act IV Bronze Foundry.',
          downstreamConsequence: 'It closes a genuine progression gap where the entire bronzework skill — including its level-1 recipes — was otherwise physically unreachable until Act IV.',
          recoveryBehavior: 'Craft attempts revalidate map access, ingredients, quantity, and capacity before changing inventory; an interrupted craft leaves inventory unchanged.',
          expectedMinutes: 1,
          originalityNotes: 'Uses public-domain Bronze Age Aegean forge practice; placing a working forge at the Beacon hub is original Oathbearer design.',
        }),
      },
      {
        id: 'wild-thyme', kind: 'resource', x: 238, y: 338, name: 'Wild Thyme', label: 'Gather wild thyme', skillId: 'foraging', itemId: 'thyme', level: 1, xp: 12,
        authoring: act1Authoring({
          category: 'gathering-resource',
          dramaticQuestion: 'Will the player notice that useful materials grow inside the story hub rather than behind a remote menu?',
          systemsUsed: ['foraging', 'inventory', 'resource-respawn'],
          durableReward: 'One thyme and 12 Foraging XP are awarded per available node charge.',
          downstreamConsequence: 'Thyme supports the provisioner, herb-cake, dried-herb, and weaving recipe chains.',
          recoveryBehavior: 'Inventory-full gathering is atomic; depletion survives reload and respawns from playtime ticks.',
          expectedMinutes: 1,
          originalityNotes: 'Uses thyme’s public-domain Mediterranean material culture; its placement and linked Oathbearer economy role are original.',
        }),
      },
      {
        id: 'olive-tree', kind: 'resource', x: 188, y: 258, name: 'Olive Tree', label: 'Cut the olive tree', skillId: 'woodcutting', itemId: 'olive-log', level: 1, xp: 14,
        authoring: act1Authoring({
          category: 'gathering-resource',
          dramaticQuestion: 'Can a familiar sacred tree teach that regional materials have practical, repeatable uses?',
          systemsUsed: ['inventory', 'resource-respawn', 'woodcutting'],
          durableReward: 'One olive log and 14 Woodcutting XP are awarded per available node charge.',
          downstreamConsequence: 'Olive logs feed carpentry and the regional merchant loop rather than existing as decorative loot.',
          recoveryBehavior: 'Inventory-full gathering is atomic; depletion survives reload and respawns from playtime ticks.',
          expectedMinutes: 1,
          originalityNotes: 'Uses the public-domain sacred and domestic role of Greek olive trees; this node’s progression and economy placement are original.',
        }),
      },
      {
        id: 'copper-seam', kind: 'resource', x: 780, y: 408, name: 'Copper Seam', label: 'Mine the copper seam', skillId: 'quarrying', itemId: 'copper-ore', level: 1, xp: 16,
        authoring: act1Authoring({
          category: 'gathering-resource',
          dramaticQuestion: 'Will the player connect raw ore at the edge of the refuge to later civic manufacture?',
          systemsUsed: ['inventory', 'quarrying', 'resource-respawn'],
          durableReward: 'One copper ore and 16 Quarrying XP are awarded per available node charge.',
          downstreamConsequence: 'Copper ore begins the bronzework and hearthkeeping recipe chains used in later regions.',
          recoveryBehavior: 'Inventory-full gathering is atomic; depletion survives reload and respawns from playtime ticks.',
          expectedMinutes: 1,
          originalityNotes: 'Uses public-domain Bronze Age Aegean metallurgy; the overlook seam and its connected crafting graph are original Oathbearer design.',
        }),
      },
      {
        id: 'steward-fallow-field', kind: 'resource', x: 380, y: 420, name: 'Fallow Field', label: 'Tend the fallow field',
        skillId: 'stewardship', itemId: 'barley-sheaf', level: 1, xp: 15,
        requiresFlag: 'steward:restored:beacon-overlook:steward-fallow-field',
        restore: {
          level: 1, xp: 12,
          cost: [{ itemId: 'compost', quantity: 2 }],
          label: 'Restore the fallow field',
        },
        authoring: act1Authoring({
          category: 'gathering-resource',
          dramaticQuestion: 'Will the player choose to restore a neglected plot before it can be tended, rather than finding it already productive?',
          systemsUsed: ['inventory', 'resource-respawn', 'stewardship', 'trading'],
          durableReward: 'A one-time restoration persists permanently; afterward each available charge awards one barley sheaf and 15 Stewardship XP.',
          downstreamConsequence: 'Barley sheaves feed Myrrine’s provision trade, and the restored field introduces Stewardship as a genuine restore-then-tend loop rather than a plain harvest node.',
          recoveryBehavior: 'Restoration is exact-once and its compost cost is atomic; once restored the field behaves like any other resource node, with inventory-full gathering atomic and depletion surviving reload.',
          expectedMinutes: 2,
          originalityNotes: 'Uses public-domain Mediterranean fallow-field and compost-restoration farming practice; the restore-then-tend Stewardship contract is original Oathbearer design.',
        }),
      },
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
    authoring: act1Authoring({
      category: 'region-map',
      dramaticQuestion: 'Will Kallias stay on the urgent road while still making room to preserve one nearly erased mortal witness?',
      systemsUsed: ['combat', 'fishing', 'movement', 'side-quest'],
      durableReward: 'The road preserves its resource depletion, optional tablet progress, and cleared entry-gate state.',
      downstreamConsequence: 'It separates the optional witness recovery from the mandatory Acropolis entry encounter without making either remote.',
      recoveryBehavior: 'Both authored exits return to known spawns; the optional detour never gates the main route and the encounter begins at a ready boundary.',
      expectedMinutes: 10,
      originalityNotes: 'Uses public-domain Greek olive-road, inscribed-tablet, and roadside-keeper motifs; the lost witness detour and spatial route are original.',
    }),
    spawn: { id: 'from-beacon', x: 72, y: 240, facing: 0 },
    spawns: {
      'from-beacon': { id: 'from-beacon', x: 72, y: 240, facing: 0 },
    },
    entities: [
      // Optional lost-witness detour — never blocks the main gate.
      {
        id: 'tablet', kind: 'interact', x: 540, y: 372, name: 'Lost Witness Tablet', label: 'Read the tablet', sideQuest: 'sq-lost-witness', firstOnly: true,
        authoring: act1Authoring({
          category: 'world-entity',
          dramaticQuestion: 'Is a damaged record of one ordinary witness worth preserving during a divine emergency?',
          systemsUsed: ['interaction', 'side-quest'],
          durableReward: 'The first reading activates and advances the Lost Witness quest exactly once.',
          downstreamConsequence: 'It makes Amonides’s return conversation available while leaving the main combat route independent.',
          recoveryBehavior: 'The first-only interaction cannot duplicate progress; abandoning the detour does not block Act I.',
          expectedMinutes: 1,
          originalityNotes: 'Uses public-domain Greek inscribed witness tablets; the Unnamed’s attempted erasure and optional recovery beat are original.',
        }),
      },
      {
        id: 'keeper', kind: 'npc', x: 760, y: 150, name: 'Amonides', label: 'Return the tablet to Amonides', conversationId: 'sq-lost-witness-return',
        authoring: act1Authoring({
          category: 'world-entity',
          dramaticQuestion: 'Can a keeper honor a recovered witness without turning an optional task into another burden?',
          systemsUsed: ['dialogue', 'side-quest'],
          durableReward: 'Amonides resolves the tablet return into the quest completion flag and 25 drachmae.',
          downstreamConsequence: 'His response closes the ledger story while explicitly returning Kallias to the main road.',
          recoveryBehavior: 'Dialogue completion and quest rewards are exact-once; the NPC remains reachable if the conversation is interrupted.',
          expectedMinutes: 2,
          originalityNotes: 'Uses the public-domain role of Greek record keepers; Amonides, his restraint, and the witness-ledger exchange are original.',
        }),
      },
      {
        id: 'philyra-roadside-stall', kind: 'shop', shopId: 'olive-road-trader', x: 450, y: 180, name: 'Philyra', label: 'Trade with Philyra',
        authoring: act1Authoring({
          category: 'world-entity',
          dramaticQuestion: 'Will a road trader stock the one metal the Beacon smiths still lack, or leave bronze-work stalled until Pelagos?',
          systemsUsed: ['trading'],
          durableReward: 'Her stall sells tin ore, the missing ingredient for the level-2 Alloy Bronze Bar recipe, which was otherwise unreachable before Act II.',
          downstreamConsequence: 'It closes a genuine progression gap: bronze-forge players can now actually reach bronze-bar and its dependent gear on schedule.',
          recoveryBehavior: 'Trades revalidate stock and funds before completing; an interrupted purchase leaves currency and inventory unchanged.',
          expectedMinutes: 1,
          originalityNotes: 'Uses public-domain Mediterranean itinerant-trader practice; Philyra and her tin-supply role are original Oathbearer design.',
        }),
      },
      {
        id: 'olive-road-carpenter-bench', kind: 'station', stationId: 'woodwork-bench', x: 340, y: 260, name: 'Roadside Carpenter Bench', label: 'Shape timber at the roadside carpenter bench',
        authoring: act1Authoring({
          category: 'world-entity',
          dramaticQuestion: 'Can roadside timber become useful equipment through a visible local craft rather than waiting for an unexplained later workshop?',
          systemsUsed: ['crafting', 'inventory', 'woodcutting'],
          durableReward: 'The bench provides a collision-reachable woodwork station for timber recipes and retains the resulting tools or supplies in the pack.',
          downstreamConsequence: 'It closes the Act I woodwork route and teaches that named stations, rather than the journal, authorize crafting work.',
          recoveryBehavior: 'Each recipe checks physical bench access, ingredients, and capacity before mutation; interruption and repeat events cannot duplicate outputs.',
          expectedMinutes: 2,
          originalityNotes: 'Uses public-domain Mediterranean roadside carpentry practice; this early physical woodwork closure is original Oathbearer design.',
        }),
      },
      {
        id: 'olive-road-locked-chest', kind: 'locked-chest', x: 650, y: 300, name: 'Locked Chest', label: 'Pick the locked chest',
        skillId: 'guile', level: 1, xp: 20,
        requiresFlag: 'guile:opened:olive-road:olive-road-locked-chest',
        cost: [{ itemId: 'lockpick', quantity: 1 }],
        reward: { currency: 45 },
        authoring: act1Authoring({
          category: 'world-entity',
          dramaticQuestion: 'Will Kallias risk a lockpick on a roadside chest, or does Guile stay a definition with nothing to actually train it?',
          systemsUsed: ['crafting', 'guile', 'inventory'],
          durableReward: 'A successful pick permanently opens the chest, awards Guile XP, and pays out 45 drachmae — Guile previously had no obtainable XP source anywhere in the game.',
          downstreamConsequence: 'It gives Guile a genuine first loop and demonstrates the exact-once, level-gated, atomic-cost lockpicking contract other locked containers can reuse later.',
          recoveryBehavior: 'A failed or interrupted attempt leaves the lockpick and currency untouched; a picked chest cannot be picked again.',
          expectedMinutes: 1,
          originalityNotes: 'Uses public-domain roadside-cache and lockpicking motifs; this exact-once Guile training contract is original Oathbearer design.',
        }),
      },
      {
        id: 'shore-fishing', kind: 'resource', x: 292, y: 404, name: 'Shore Fishing Spot', label: 'Fish the Aegean shallows', skillId: 'fishing', itemId: 'sardine', level: 1, xp: 13,
        authoring: act1Authoring({
          category: 'gathering-resource',
          dramaticQuestion: 'Will the player recognize the coast as a working food source rather than decorative scenery?',
          systemsUsed: ['fishing', 'inventory', 'resource-respawn'],
          durableReward: 'One sardine and 13 Fishing XP are awarded per available node charge.',
          downstreamConsequence: 'The catch introduces Fishing as a repeatable regional skill and a future cooking input family.',
          recoveryBehavior: 'Inventory-full gathering is atomic; depletion survives reload and respawns from playtime ticks.',
          expectedMinutes: 1,
          originalityNotes: 'Uses public-domain Aegean shore-fishing practice; the node’s location, progression reward, and systems role are original.',
        }),
      },
      {
        id: 'olive-road-waycache', kind: 'bank', x: 150, y: 150, name: 'Roadside Way-Cache', label: 'Open the roadside way-cache',
        authoring: act1Authoring({
          category: 'world-entity',
          dramaticQuestion: 'Will Kallias trust a waystation cache far from the Beacon, or carry everything the whole urgent road?',
          systemsUsed: ['banking', 'inventory'],
          durableReward: 'A second physical bank access point onto the same account-wide storehouse the Beacon already established.',
          downstreamConsequence: 'It lets the road itself serve gathering and quest traffic without forcing a detour back to the Beacon just to store or fetch gear.',
          recoveryBehavior: 'Full-capacity and invalid-quantity operations are atomic; closing or reloading preserves both pack and bank state.',
          expectedMinutes: 1,
          originalityNotes: 'Uses public-domain Greek roadside waystation-cache practice; its placement on this exact road is original Oathbearer design.',
        }),
      },
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
    // The first fight is a controls lesson, not a gear or power check. These
    // sentries deliberately close more slowly and hit more softly than the
    // shared campaign defaults; later encounters retain their authored pace.
    combatTuning: {
      threatDamageMultiplier: 0.4,
      threatSpeedMultiplier: 0.5,
      // Apollo and Athena teach ranged/defensive timing; their first normal
      // clear should not demand the same contact tolerance as Ares.
      patronThreatDamageMultipliers: { apollo: 0.6, athena: 0.5 },
    },
    title: 'Acropolis Entry Court',
    subtitle: 'The way is guarded. Show them the sun.',
    completionFlag: 'enc-act1-entry-cleared',
    activation: 'quest',
    repeatable: false,
    authoring: act1Authoring({
      category: 'story-encounter',
      dramaticQuestion: 'Can an untested patron bond carry Kallias through the guarded Acropolis threshold?',
      systemsUsed: ['combat', 'patron-power', 'questing'],
      durableReward: 'The enc-act1-entry-cleared flag advances the main quest and leaves the threshold encounter settled.',
      downstreamConsequence: 'Victory returns Kallias to Beacon Overlook and makes the Sun Court objective current.',
      recoveryBehavior: 'The explicit Begin gate freezes combat until ready; defeat returns to a recoverable exploration boundary without granting victory.',
      expectedMinutes: 4,
      originalityNotes: 'Uses public-domain Greek acropolis-guardian imagery; this patron trial, composition context, and oath-restoration purpose are original.',
    }),
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
    // The first elite remains a real escalation, but normal browser input can
    // include multi-second bridge pauses. Keep all six authored spawns while
    // spacing their arrivals and reducing contact/health enough that a
    // patient tier-one player can recover rather than being deleted by a pile.
    combatTuning: {
      threatDamageMultiplier: 0.09,
      threatSpeedMultiplier: 0.35,
      threatHealthMultiplier: 0.6,
    },
    pacing: 120,
    title: 'Sun Court',
    subtitle: 'The beasts multiply beneath a burning sky.',
    completionFlag: 'enc-act1-sun-cleared',
    activation: 'quest',
    repeatable: false,
    authoring: act1Authoring({
      category: 'boss-encounter',
      dramaticQuestion: 'Can Kallias recover a divine epithet from a captain trained to erase names?',
      systemsUsed: ['boss-combat', 'patron-power', 'questing'],
      durableReward: 'The enc-act1-sun-cleared flag permits Thessa’s exit scene and the Far-Sighted epithet award.',
      downstreamConsequence: 'Defeating the final captain reveals the seaward pull that sends the story toward Pelagos.',
      recoveryBehavior: 'The explicit Begin gate, pause behavior, retry boundary, and exact-once settlement preserve a fair replay after defeat or reload.',
      expectedMinutes: 6,
      originalityNotes: 'Uses public-domain solar-court and Greek heroic-combat motifs; the Name-Cutter Captain and epithet-fragment climax are original Oathbearer expression.',
      levelMin: 2,
      levelMax: 6,
    }),
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
    authoring: act1Authoring({
      category: 'conversation',
      dramaticQuestion: 'Will Kallias accept responsibility for a place whose divine identity is already being erased?',
      systemsUsed: ['dialogue', 'questing', 'world-markers'],
      durableReward: 'The scene records thessa-met and points the player to the physical patron shrine.',
      downstreamConsequence: 'It establishes the Unnamed, the Oathbearer role, and the ordered route through shrine, Olive Road, and Acropolis.',
      recoveryBehavior: 'Skip and normal completion converge on the same exact-once effects; interruption leaves the NPC available to resume.',
      expectedMinutes: 3,
      originalityNotes: 'Uses public-domain Greek oath, epithet, and shrine concepts; Thessa’s warning, the Unnamed’s method, and all dialogue expression are original.',
    }),
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
        next: 'thessa-overlook-ext-1',
      },
      'thessa-overlook-ext-1': {
        speakerId: 'kallias',
        text: 'Then say plainly what carrying means. Who chooses the patron at that shrine, and what does the choosing cost me? The beasts will cross the terraces before noon no matter what I call myself. I will go up the Olive Road. I go with terms, not titles. If the power becomes more than one mortal can hold, where do I send for you, and what will you still be able to hear?',
        next: 'thessa-overlook-ext-2',
      },
      'thessa-overlook-ext-2': {
        speakerId: 'thessa',
        text: 'The shrine chooses. That is why it has stood longer than any name on this rock. It will read what you can bear and offer only that first measure — no more than the Veil permits a man to carry upright. What it costs is the rest of a quiet life; I will not dress that in finer words. I stay here while the terraces hold. Send word down the Olive Road and I will hear, Oathbearer or not.',
        next: 'thessa-overlook-ext-3',
      },
      'thessa-overlook-ext-3': {
        speakerId: 'kallias',
        text: 'Then I will not spend the morning arguing with a name I did not pick. Shrine first, the Olive Road after. Keep the gate watch lit, and if the fragment of this place remembers me at all, it will remember that I asked questions before I marched.',
        next: null,
      },
    },
  },
  'act1-thessa-exit': {
    id: 'act1-thessa-exit',
    speakerIds: ['thessa', 'kallias'],
    start: 'n1',
    authoring: act1Authoring({
      category: 'conversation',
      dramaticQuestion: 'What should Kallias do with one recovered fragment when the larger name remains wounded?',
      systemsUsed: ['dialogue', 'epithet-progression', 'questing'],
      durableReward: 'The scene awards Far-Sighted and records revealed-ianthe exactly once.',
      downstreamConsequence: 'The fragment’s seaward pull and Ianthe lead establish the playable transition into the Salt Covenant of Act II.',
      recoveryBehavior: 'Skip and normal completion converge on the same effects; replay cannot duplicate the epithet or reveal flag.',
      expectedMinutes: 2,
      originalityNotes: 'Uses public-domain divine epithets and prophetic navigation motifs; the fragment-as-compass and Thessa exchange are original.',
    }),
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
        next: 'thessa-exit-ext-1',
      },
      'thessa-exit-ext-1': {
        speakerId: 'kallias',
        text: 'Before I go — I am leaving this half a name and a broken stone. Say what you intend to keep here while I am gone, and say it as terms, not comfort. I can work with terms. The gate watch, the terraces, the shards of the treaty-stone. What stays standing until I come back with the whole?',
        next: 'thessa-exit-ext-2',
      },
      'thessa-exit-ext-2': {
        speakerId: 'thessa',
        text: 'The watch-fire stays lit on the terrace above the gate — you will see it from the low road on your last day here. I keep the terraces, the shrine, and the shards of the treaty-stone swept clean and laid in order. A place that still keeps its own pieces has not finished remembering. That much I hold. No promises past it.',
        next: 'thessa-exit-ext-3',
      },
      'thessa-exit-ext-3': {
        speakerId: 'kallias',
        text: 'It turns in my hand toward the water, steady as a needle finding north. No more arguing with the direction. Keep your fire lit, Thessa. When this name is whole again, I will come up the terraces with it, and the first thing we do is say it out loud where the stone lies broken.',
        next: null,
      },
    },
  },
  'sq-lost-witness-return': {
    id: 'sq-lost-witness-return',
    speakerIds: ['keeper', 'kallias'],
    start: 'n1',
    authoring: act1Authoring({
      category: 'conversation',
      dramaticQuestion: 'How can Amonides honor a recovered witness without claiming the hero’s urgent attention?',
      systemsUsed: ['dialogue', 'economy', 'side-quest'],
      durableReward: 'The scene records the Lost Witness completion and grants the promised 25 drachmae through exact-once quest settlement.',
      downstreamConsequence: 'It preserves one mortal record, closes the optional ledger thread, and redirects Kallias to the main road.',
      recoveryBehavior: 'The return remains available after interruption; dialogue and quest reward settlement reject duplicate completion.',
      expectedMinutes: 2,
      originalityNotes: 'Uses public-domain Greek tablets and civic ledgers; Amonides’s voice, the half-erased witness, and the restrained reward scene are original.',
    }),
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
        next: 'lost-witness-ext-1',
      },
      'lost-witness-ext-1': {
        speakerId: 'keeper',
        text: 'You are already halfway out of hearing of me, and I do not blame you. One small thing, though, before the road takes you. When I was young I watched an army burn a village for a dispute written down wrong. The scribe who made that entry was not wicked. He was simply the last one anyone thought to keep. I keep this ledger because the great forgetting always begins by letting the small records slide — one tablet, one witness, one afternoon\'s carelessness at a time.',
        next: 'lost-witness-ext-2',
      },
      'lost-witness-ext-2': {
        speakerId: 'kallias',
        text: 'The ledger will not stop them at the gate, and you know that better than I do.',
        next: 'lost-witness-ext-3',
      },
      'lost-witness-ext-3': {
        speakerId: 'keeper',
        text: 'No. It will not. But every name I write in the margin is one they must erase twice, and twice is a labor even the Silent Loom resents. Go and fight the larger war, Oathbearer. I will stand my post here, pen in hand, and catch whatever falls past you on the road.',
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
    authoring: act1Authoring({
      category: 'main-quest',
      dramaticQuestion: 'Can Kallias carry a freely chosen divine power through two occupied courts and keep Far-Sighted from erasure?',
      systemsUsed: ['combat', 'dialogue', 'movement', 'patron-choice', 'questing'],
      durableReward: 'Completion records the Act I flag; its exit scene awards Far-Sighted and reveals the Pelagos lead.',
      downstreamConsequence: 'The restored fragment authorizes the main-story transition into Act II and remains visible in epithet progression.',
      recoveryBehavior: 'Every objective is explicit and ordered; dialogue, patron choice, and combat settle exactly once, while defeat returns to safe exploration.',
      expectedMinutes: 25,
      originalityNotes: 'Uses public-domain Greek epithets, patron gods, and acropolis imagery; the Unnamed crisis, Oathbearer role, quest sequence, and prose are original.',
    }),
    objectives: [
      {
        id: 'reach-beacon-start', kind: 'reach', mapId: 'beacon-overlook', markerId: 'start',
        authoring: act1Authoring({
          category: 'quest-objective',
          dramaticQuestion: 'Where has Kallias arrived, and what visibly demands his attention first?',
          systemsUsed: ['movement', 'questing'],
          durableReward: 'Reaching the authored start advances the main quest to Thessa.',
          downstreamConsequence: 'The objective establishes physical movement before dialogue or menus can advance the story.',
          recoveryBehavior: 'A fresh or recovered save uses the same stable start spawn and reach event.',
          expectedMinutes: 1,
          originalityNotes: 'Uses the public-domain overlook-as-arrival motif; its Beacon staging and movement-first onboarding are original.',
        }),
      },
      {
        id: 'talk-thessa', kind: 'talk', npcId: 'thessa', conversationId: 'act1-thessa-overlook',
        authoring: act1Authoring({
          category: 'quest-objective',
          dramaticQuestion: 'Will Kallias hear the cost of the broken treaty before choosing divine power?',
          systemsUsed: ['dialogue', 'questing'],
          durableReward: 'The completed scene records thessa-met and advances the quest to patron choice.',
          downstreamConsequence: 'Thessa’s shrine marker makes the next required world object explicit.',
          recoveryBehavior: 'Only the matching Thessa conversation completes the objective; skip and normal completion share exact effects.',
          expectedMinutes: 3,
          originalityNotes: 'Uses public-domain Greek counselor and oath motifs; the ordered warning and Unnamed exposition are original.',
        }),
      },
      {
        id: 'choose-patron', kind: 'interact', entityId: 'beacon-overlook:shrine',
        authoring: act1Authoring({
          category: 'quest-objective',
          dramaticQuestion: 'Which god’s power will Kallias freely carry into the occupied courts?',
          systemsUsed: ['interaction', 'patron-choice', 'questing'],
          durableReward: 'The chosen patron and canonical power loadout persist, and the objective advances once.',
          downstreamConsequence: 'That loadout is used in both Act I encounters without locking later classless growth.',
          recoveryBehavior: 'The shrine is safe; reload restores the choice and duplicate selection cannot re-award progression.',
          expectedMinutes: 2,
          originalityNotes: 'Uses public-domain Olympian patronage; player-selected Veil-crossing power and its quest placement are original.',
        }),
      },
      {
        id: 'reach-olive-road', kind: 'reach', mapId: 'olive-road', markerId: 'from-beacon',
        authoring: act1Authoring({
          category: 'quest-objective',
          dramaticQuestion: 'Will Kallias leave the refuge and commit to the road toward the occupied Acropolis?',
          systemsUsed: ['movement', 'questing', 'world-travel'],
          durableReward: 'Arrival at the named Olive Road spawn advances the quest to the Entry Court.',
          downstreamConsequence: 'The road exposes gathering and the optional witness detour before the mandatory fight.',
          recoveryBehavior: 'The authored exit and arrival spawn are reversible; returning to Beacon does not lose progress.',
          expectedMinutes: 2,
          originalityNotes: 'Uses public-domain Greek olive-road imagery; its reversible transition and layered optional route are original.',
        }),
      },
      {
        id: 'clear-entry', kind: 'clear-encounter', encounterId: 'enc-act1-entry',
        authoring: act1Authoring({
          category: 'quest-objective',
          dramaticQuestion: 'Can Kallias prove the new patron bond at the first guarded threshold?',
          systemsUsed: ['combat', 'patron-power', 'questing'],
          durableReward: 'The Entry Court completion flag advances the quest exactly once.',
          downstreamConsequence: 'Victory returns to Beacon and makes the Sun Court encounter the next objective.',
          recoveryBehavior: 'Combat waits behind Begin; defeat and reload return to a safe retry without a false clear.',
          expectedMinutes: 4,
          originalityNotes: 'Uses public-domain threshold-guardian motifs; this first patron trial and quest function are original.',
        }),
      },
      {
        id: 'clear-sun', kind: 'clear-encounter', encounterId: 'enc-act1-sun',
        authoring: act1Authoring({
          category: 'quest-objective',
          dramaticQuestion: 'Can Kallias defeat the Name-Cutter Captain before Far-Sighted disappears?',
          systemsUsed: ['boss-combat', 'patron-power', 'questing'],
          durableReward: 'The Sun Court completion flag unlocks Thessa’s epithet-restoration scene.',
          downstreamConsequence: 'The captain’s fragment becomes the evidence that directs Kallias seaward.',
          recoveryBehavior: 'The ready gate, pause, defeat return, and duplicate-clear guard preserve an exact replay boundary.',
          expectedMinutes: 6,
          originalityNotes: 'Uses public-domain solar and heroic-combat motifs; the name-erasing captain and recovered fragment are original.',
          levelMin: 2,
          levelMax: 6,
        }),
      },
      {
        id: 'talk-thessa-exit', kind: 'talk', npcId: 'thessa', conversationId: 'act1-thessa-exit',
        authoring: act1Authoring({
          category: 'quest-objective',
          dramaticQuestion: 'What obligation follows from recovering only one piece of a wounded divine name?',
          systemsUsed: ['dialogue', 'epithet-progression', 'questing'],
          durableReward: 'Far-Sighted, revealed-ianthe, and the Act I completion flag persist.',
          downstreamConsequence: 'The current main quest bridges to Pelagos and the Salt Covenant.',
          recoveryBehavior: 'Only the matching exit conversation settles the objective; effects and quest completion are exact-once.',
          expectedMinutes: 2,
          originalityNotes: 'Uses public-domain epithet and omen motifs; the seaward fragment and Act II handoff are original.',
        }),
      },
    ],
    rewards: [{ kind: 'flag', id: 'mq-act1-ash-at-dawn-complete', value: true }],
  },
  'sq-lost-witness': {
    id: 'sq-lost-witness',
    kind: 'side',
    act: 1,
    prerequisites: [],
    authoring: act1Authoring({
      category: 'regional-side-quest',
      dramaticQuestion: 'Is one half-erased mortal witness worth saving when the divine crisis is more urgent?',
      systemsUsed: ['dialogue', 'economy', 'exploration', 'side-quest'],
      durableReward: 'The recovered record yields 25 drachmae and the sq-lost-witness-complete flag.',
      downstreamConsequence: 'Amonides’s ledger retains one witness while the quest remains deliberately non-blocking to the main road.',
      recoveryBehavior: 'Both steps are first/exact-once, the keeper remains reachable, and ignoring the quest never blocks Act I.',
      expectedMinutes: 5,
      originalityNotes: 'Uses public-domain Greek witness tablets and civic ledgers; the erasure premise, Amonides, and compact detour are original.',
    }),
    objectives: [
      {
        id: 'read-tablet', kind: 'interact', entityId: 'olive-road:tablet',
        authoring: act1Authoring({
          category: 'quest-objective',
          dramaticQuestion: 'Will Kallias stop to read a damaged mortal record beside the urgent road?',
          systemsUsed: ['exploration', 'interaction', 'side-quest'],
          durableReward: 'The tablet interaction records the first objective exactly once.',
          downstreamConsequence: 'It makes the keeper return meaningful without altering the main quest gate.',
          recoveryBehavior: 'The tablet is first-only; leaving the map preserves progress and never blocks travel.',
          expectedMinutes: 1,
          originalityNotes: 'Uses public-domain roadside inscriptions; the optional half-erased witness discovery is original.',
        }),
      },
      {
        id: 'return-tablet', kind: 'talk', npcId: 'keeper', conversationId: 'sq-lost-witness-return',
        authoring: act1Authoring({
          category: 'quest-objective',
          dramaticQuestion: 'Can the recovered witness be returned without making preservation another compulsory burden?',
          systemsUsed: ['dialogue', 'economy', 'side-quest'],
          durableReward: 'The completion flag and 25-drachma reward settle once.',
          downstreamConsequence: 'The ledger thread closes and explicitly releases the player back to the main road.',
          recoveryBehavior: 'The keeper remains reachable after interruption; mismatched or repeated dialogue completion is inert.',
          expectedMinutes: 2,
          originalityNotes: 'Uses public-domain keeper and ledger motifs; the low-pressure return and reward exchange are original.',
        }),
      },
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
