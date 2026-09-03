// Act IV conversation graphs — Forge March: The False Constellation.
//
// These scenes are the authored testimony layer for the march: strategy
// witnesses (Athena, Ares), the stolen-fire exchange (Prometheus at the
// lawful brazier), the coerced witness (Atlas as a person under the chain —
// deliberately NOT the `atlas` monster base, per ACT4_ATLAS_IDENTITY), the
// freed covenant witnesses (Hercules, Thais and Nestor the smiths), the
// single-crown refusal (Zeus), and the mortal draft assembly.
//
// They follow the immutable conventions established by act3Conversations.js
// and ACT5_CONVERSATIONS: data-only, deterministic, deep-frozen, no DOM, no
// time, no RNG. Effects are testimony flags and world markers only. They
// never move objective indices and never grant repeatable rewards — quest
// progression stays in the shared reducer (OBJECTIVE_COMPLETION_FLAGS in
// state.js), and choice nodes record witness tone and order, never power.
//
// Integrated: ACT4_CONVERSATIONS is registered in registry.js
// REGISTERED_CONVERSATIONS, and every Act IV NPC entity in act4Runtime.js
// carries the conversationId described by EXPECTED_SPEAKER_BINDINGS below.

import { AUTHORING_SCHEMA_VERSION } from './authoringSchema.js'

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value)) deepFreeze(nested)
  return value
}

// Release-authoring metadata, same field contract as act2Authoring and the
// Act II entry conversation in registry.js.
function act4Authoring({
  category,
  dramaticQuestion,
  systemsUsed,
  durableReward,
  downstreamConsequence,
  recoveryBehavior,
  expectedMinutes,
  originalityNotes,
  levelMin = 20,
  levelMax = 60,
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
    regionBand: { regionIds: ['forge-march'], acts: { min: 4, max: 4 } },
  }
}

// The stable NPC bindings the lead integration must apply. `primarySpeakerId`
// is the graph's anchored identity; `npcEntityId` is the runtime entity to
// attach `conversationId` to — existing in act4Runtime.js, or a new
// kind:'npc' entity (plus optionalConversationIds) to be placed at integration.
//
// Integrated: registry.js registers ACT4_CONVERSATIONS, and every entity
// below now exists in act4Runtime.js with `conversationId` attached —
// `existsInRuntime` reflects that (see test/rpg-act4-conversations.test.js
// and test/rpg-act4-conversation-integration.test.js).
export const EXPECTED_SPEAKER_BINDINGS = deepFreeze([
  { conversationId: 'act4-athena-precise-route', primarySpeakerId: 'athena-march-captain', npcEntityId: 'athena-march-captain', mapId: 'slag-road', existsInRuntime: true },
  { conversationId: 'act4-ares-direct-breach', primarySpeakerId: 'ares-march-captain', npcEntityId: 'ares-march-captain', mapId: 'slag-road', existsInRuntime: true },
  { conversationId: 'act4-prometheus-lawful-fire', primarySpeakerId: 'prometheus', npcEntityId: 'prometheus', mapId: 'name-press', existsInRuntime: true },
  { conversationId: 'act4-atlas-coerced-witness', primarySpeakerId: 'atlas-npc', npcEntityId: 'atlas-npc', mapId: 'atlas-vault', existsInRuntime: true },
  { conversationId: 'act4-hercules-freely-given', primarySpeakerId: 'hercules', npcEntityId: 'hercules', mapId: 'atlas-vault', existsInRuntime: true },
  { conversationId: 'act4-smiths-ledger', primarySpeakerId: 'smith-thais', npcEntityId: 'smith-thais', mapId: 'atlas-vault', existsInRuntime: true },
  { conversationId: 'act4-zeus-single-crown', primarySpeakerId: 'zeus-crown-herald', npcEntityId: 'zeus-crown-herald', mapId: 'atlas-vault', existsInRuntime: true },
  { conversationId: 'act4-mortal-draft', primarySpeakerId: 'kallias', npcEntityId: 'mortal-draft-table-voice', mapId: 'slag-road', existsInRuntime: true },
])

export const ACT4_CONVERSATIONS = deepFreeze({
  'act4-athena-precise-route': {
    id: 'act4-athena-precise-route',
    speakerIds: ['athena-march-captain', 'kallias'],
    start: 'survey-before-sorrow',
    nodes: {
      'survey-before-sorrow': {
        speakerId: 'athena-march-captain',
        text: 'Walk the lift controls with me before you blame the forge. Every route beneath this hill is already counted: so many steps, so much water, so many bodies the machinery can spend in an hour. I do not love the arithmetic. I trust it, because a chain that was tested never lies about where it will break.',
        next: 'ledgers-not-miracles',
      },
      'ledgers-not-miracles': {
        speakerId: 'kallias',
        text: 'The camp behind us does not need an honest ledger. They need bread, and a road that does not kill them on the way to the bread.',
        next: 'counting-is-mercy',
      },
      'counting-is-mercy': {
        speakerId: 'athena-march-captain',
        text: 'Then give them both, which is what counting is for. My precise route surveys the controls first, cuts through the relief chambers, and vents every lane before the march stands in it. We arrive an hour later than the zealots want. We arrive with every life still attached to its name.',
        next: 'what-the-plan-spends',
      },
      'what-the-plan-spends': {
        choices: [
          {
            id: 'ask-what-it-costs',
            text: 'Every plan spends something. Tell me what yours spends, and what it refuses to spend.',
            effects: [{ kind: 'flag', id: 'act4-athena-cost-questioned', value: true }],
            next: 'the-west-piston',
          },
          {
            id: 'commit-to-the-hour',
            text: 'Take your hour. I would rather lose the dawn than lose one person your arithmetic already named.',
            effects: [{ kind: 'flag', id: 'act4-athena-route-accepted', value: true }],
            next: 'heard-as-commander',
          },
        ],
      },
      'the-west-piston': {
        speakerId: 'athena-march-captain',
        text: 'It spends time, and it spends my reputation with people who call delay cowardice. What it refuses to spend is the smiths. A plan that will not say its price is not a plan; it is a wish wearing a general\u2019s cloak. You asked the question most officers are trained to fear. Keep asking it at the draft table.',
        next: 'heard-as-commander',
      },
      'heard-as-commander': {
        speakerId: 'athena-march-captain',
        text: 'Then you have heard me as a commander and not as a statue on a column. Go around the north of the smelter — the heat is honest there, and the floor will tell you where it is weak. I say the same thing at every war council, and every time someone calls it caution instead of mathematics.',
        next: 'the-second-opinion',
      },
      'the-second-opinion': {
        speakerId: 'kallias',
        text: 'The other captain will offer the breach, and I will hear it before I file this. A choice that never weighed the alternative is not a choice, even if the route I walk turns out to be yours.',
        next: 'consent-not-obedience',
      },
      'consent-not-obedience': {
        speakerId: 'athena-march-captain',
        text: 'Hear him. Consent that never weighed an alternative is only obedience standing up straighter, and this march has had enough of that posture. My plan is on the board with its hour written plainly beside it. Let his carry its price too. Whatever you choose, choose it awake.',
        effects: [
          { kind: 'flag', id: 'act4-testimony-athena-heard', value: true },
          { kind: 'marker', mapId: 'slag-road', entityId: 'lift-controls' },
        ],
        next: null,
      },
    },
    authoring: act4Authoring({
      category: 'conversation',
      dramaticQuestion: 'Can Athena make a counted hour sound like mercy to people who are already hungry, without asking Kallias to stop questioning what her arithmetic spends?',
      systemsUsed: ['dialogue', 'questing'],
      durableReward: 'The scene records Athena\u2019s route as heard and marks the Slag Road lift controls; the tone flags record whether the player probed her cost accounting or committed immediately.',
      downstreamConsequence: 'Her refusal to spend the smiths frames the witness-rescue objective, and her demand that the player also hear Ares guards the march-plan choice from becoming a single-authority decree.',
      recoveryBehavior: 'The deterministic graph resumes after interruption; testimony flags apply exactly once through the shared conversation-effect union, and neither choice grants power or moves the objective.',
      expectedMinutes: 3,
      originalityNotes: 'Uses the public-domain figures of Athena as strategist and the Greek topos of counted labor; the audit-minded \u2018arithmetic as mercy\u2019 voice and the spendable-price test are original Oathbearer writing.',
    }),
  },

  'act4-ares-direct-breach': {
    id: 'act4-ares-direct-breach',
    speakerIds: ['ares-march-captain', 'kallias'],
    start: 'no-euphemisms',
    nodes: {
      'no-euphemisms': {
        speakerId: 'ares-march-captain',
        text: 'I will not insult you with maps. There is a gate. Behind it are furnaces that have been eating children\u2019s futures and calling the smoke revenue. My route walks through the gate before the guards finish their morning formation, and I say plainly that some of ours will not walk out.',
        next: 'honest-blood',
      },
      'honest-blood': {
        speakerId: 'kallias',
        text: 'You name the dead before they are ordered to die, and you name them as ours rather than as acceptable. I did not expect that honesty from the god of this particular trade, and I will not pretend it makes your route easy to carry.',
        next: 'naming-is-the-trade',
      },
      'naming-is-the-trade': {
        speakerId: 'ares-march-captain',
        text: 'Everyone loves the battle god until he itemizes. I am the only one on that board who has stood where your relief chambers are and felt the floor give. Precision routes are clean on paper because paper never had to hold a line while it burned.',
        next: 'what-precision-hides',
      },
      'what-precision-hides': {
        choices: [
          {
            id: 'ask-about-the-guards',
            text: 'The guards are fed from those furnaces too. What does your breach cost them?',
            effects: [{ kind: 'flag', id: 'act4-ares-guards-questioned', value: true }],
            next: 'guards-are-spent-too',
          },
          {
            id: 'ask-about-the-hour',
            text: 'Athena\u2019s route is an hour slower. If speed saves lives, show me the math you distrust hers for.',
            effects: [{ kind: 'flag', id: 'act4-ares-clock-questioned', value: true }],
            next: 'the-clock-bleeds',
          },
        ],
      },
      'guards-are-spent-too': {
        speakerId: 'ares-march-captain',
        text: 'It costs them. Conscripts from the same camps, pressed into the Loom\u2019s livery, and my orders from above say treat them as scenery. I do not. A breach plan that forgets the men inside the gate is not bold, it is lazy, and laziness in command is just murder with better paperwork.',
        next: 'the-clock-bleeds',
      },
      'the-clock-bleeds': {
        speakerId: 'ares-march-captain',
        text: 'Here is my math, since she has hers. The foundry shuts a production lane for every hour the alarm circulates unspent. Her route arrives to three silent lanes if she is lucky and to a cleaned house if she is not. Speed buys nothing but the moment the blow still lands.',
        next: 'strike-together',
      },
      'strike-together': {
        speakerId: 'kallias',
        text: 'Then whatever the board ratifies, the breach opens where you say it opens, and the people behind the gate get the warning you refuse to call wasted motion.',
        next: 'the-shield-oath',
      },
      'the-shield-oath': {
        speakerId: 'ares-march-captain',
        text: 'Agreed. And when the lane fires back, stand where I stand, not where the plan says I should have stood. I have buried enough people who were right on paper. File my price beside hers and let the march choose with its eyes open — that is the only order I take from strategists.',
        effects: [
          { kind: 'flag', id: 'act4-testimony-ares-heard', value: true },
          { kind: 'marker', mapId: 'bronze-foundry', entityId: 'production-lane-1' },
        ],
        next: null,
      },
    },
    authoring: act4Authoring({
      category: 'conversation',
      dramaticQuestion: 'Can Ares make the honest case for blood without laundering it, and will the march hear speed and care as the same question asked twice?',
      systemsUsed: ['dialogue', 'questing'],
      durableReward: 'The scene records Ares\u2019s breach as heard and marks the first foundry production lane; the tone flags record whether the player pressed him on conscript guards or on the time math.',
      downstreamConsequence: 'His itemized cost of speed gives the march-plan choice real weight: whichever route the player takes, both prices are now on the record the draft must answer to.',
      recoveryBehavior: 'The deterministic graph resumes after interruption; testimony flags apply once through the shared union; neither choice grants reward or touches objective indices.',
      expectedMinutes: 3,
      originalityNotes: 'Draws on the public-domain figure of Ares as the unflattering truth of war; the conscript-guards conscience and the anti-paperwork register are original Oathbearer expression.',
    }),
  },

  'act4-prometheus-lawful-fire': {
    id: 'act4-prometheus-lawful-fire',
    speakerIds: ['prometheus', 'kallias'],
    start: 'the-die-remembers',
    nodes: {
      'the-die-remembers': {
        speakerId: 'prometheus',
        text: 'Put your hand near the press and do not touch. Feel how it reaches back? That is my fire, and it is obedient in a way that should frighten you more than any rebellion. I gave flame to warm, to light, to make a room where a mortal could say no. The Loom taught it to answer only one master, and called the lesson civilization.',
        next: 'stolen-not-lost',
      },
      'stolen-not-lost': {
        speakerId: 'kallias',
        text: 'The shrine on the road still burns lawful, and the march has never once asked it who owns the flame. So the fire was never lost — it was rented out under a forged lease, and the lease is what we are breaking tonight.',
        next: 'a-lease-written-in-chains',
      },
      'a-lease-written-in-chains': {
        speakerId: 'prometheus',
        text: 'A lease written in chains, countersigned by my own suffering. They made an example of me so thoroughly that even the gift learned to fear the giver\u2019s workshop. When you turn the routing floor and send the heat back to my brazier, do not perform it like a rescue. It is a repossession, and it should be boring.',
        next: 'boring-justice',
      },
      'boring-justice': {
        speakerId: 'kallias',
        text: 'Boring justice is the kind that survives the ceremony, and ceremonies are just dies struck once instead of a thousand times. Say what you need from me plainly, old thief, and leave the gratitude at the shrine.',
        next: 'the-choice-node-1',
      },
      'the-choice-node-1': {
        choices: [
          {
            id: 'promise-return',
            text: 'The fire goes back to your brazier and the record says so — nothing more claimed, nothing forgiven.',
            effects: [{ kind: 'flag', id: 'act4-fire-return-framed-as-debt', value: true }],
            next: 'not-forgiveness-accuracy',
          },
          {
            id: 'promise-share',
            text: 'It goes back to your brazier, and we write the terms so every forge down the march can draw from it lawfully.',
            effects: [{ kind: 'flag', id: 'act4-fire-return-framed-as-sharing', value: true }],
            next: 'sharing-is-harder',
          },
        ],
      },
      'not-forgiveness-accuracy': {
        speakerId: 'prometheus',
        text: 'Accuracy. Good. I have had enough of gratitude; it is the coin minted by people who intend to keep what they received. Call it debt paid to the wrong creditor, and the sentence finally stops lying about who owns the verb.',
        next: 'sharing-is-harder',
      },
      'sharing-is-harder': {
        speakerId: 'prometheus',
        text: 'Sharing is the harder promise, and I will not soften it to make you feel generous. One hearth that everyone may relight is a power with a thousand small keys. One hearth with a priest at it is the same press wearing a gentler die. At your draft table, choose which one you are actually ratifying.',
        next: 'the-die-and-the-name',
      },
      'the-die-and-the-name': {
        speakerId: 'kallias',
        text: 'The dies up top carry names pressed from stolen patterns. If your fire comes home lawful, the dies lose their heat to strike anything at all.',
        next: 'names-are-not-furniture',
      },
      'names-are-not-furniture': {
        speakerId: 'prometheus',
        text: 'Then let the firmament starve on borrowed warmth. A name is not furniture for a sky; it is the promise that someone heard you. Every die in that press is a mouth the Loom borrowed without asking. Give me back my brazier and I will show you how quietly a stolen constellation stops singing.',
        effects: [
          { kind: 'flag', id: 'act4-testimony-prometheus-heard', value: true },
          { kind: 'marker', mapId: 'name-press', entityId: 'prometheus-brazier' },
        ],
        next: null,
      },
    },
    authoring: act4Authoring({
      category: 'conversation',
      dramaticQuestion: 'Can Prometheus hand the march back its fire without the return becoming a new ceremony of debt, and can sharing be promised at terms harsher than rescue?',
      systemsUsed: ['dialogue', 'questing'],
      durableReward: 'The scene records Prometheus\u2019s testimony and marks the Name-Press brazier where the stolen heat must be lawfully redirected; the framing flags are tone only.',
      downstreamConsequence: 'His one-hearth-versus-thousand-keys distinction is the question the final ratification choices must actually answer, and his repossession framing forbids treating the fire return as a reward.',
      recoveryBehavior: 'The deterministic graph resumes after interruption; effects apply once through the shared union; neither choice grants currency, items, or objective movement.',
      expectedMinutes: 4,
      originalityNotes: 'Reuses the public-domain Prometheus fire-gift and punishment motifs; the forged-lease, repossession, and borrowed-die language is original Oathbearer writing, not any extant retelling.',
    }),
  },

  'act4-atlas-coerced-witness': {
    id: 'act4-atlas-coerced-witness',
    speakerIds: ['atlas-npc', 'kallias'],
    start: 'do-not-confuse-us',
    nodes: {
      'do-not-confuse-us': {
        speakerId: 'atlas-npc',
        text: 'You came here to speak to a god and found a man with a harness on. Do not confuse us. The thing in the arena wearing my name hits back; I have not been able to for a very long time, and I want that fact written down before anyone gives my shoulders a speech.',
        next: 'the-anchor-hymn',
      },
      'the-anchor-hymn': {
        speakerId: 'kallias',
        text: 'Four anchors run this vault. They hum like a hymn when the pressure cycles, and every guard answers the sound before he answers his orders.',
        next: 'load-became-weather',
      },
      'load-became-weather': {
        speakerId: 'atlas-npc',
        text: 'That is the trick the Loom perfected on me. Make the load so constant that the captives call it weather. The sky was my sentence; they turned the sentence into scenery, and scenery cannot be petitioned. That is what a coerced witness is: a warning that was renamed a wall.',
        next: 'carved-constellations',
      },
      'carved-constellations': {
        speakerId: 'atlas-npc',
        text: 'So I kept a smaller record. In the collapsed vault where no inspection route runs, I carved the true constellations by hand — the ones that need two or three viewpoints to be seen at all. The firmament above cannot hold them. A single eye cannot read a plural sky.',
        next: 'the-anchor-choice',
      },
      'the-anchor-choice': {
        choices: [
          {
            id: 'ask-about-tablets',
            text: 'The tablets matter more than my comfort. Where exactly, and how do I carry proof without letting the Loom strike a die from it?',
            effects: [{ kind: 'flag', id: 'act4-atlas-tablets-discussed', value: true }],
            next: 'the-tablet-warning',
          },
          {
            id: 'promise-anchors-first',
            text: 'No sky-map tonight. Tonight we release the anchors, and you choose which ones, in which order, out loud, in front of the march.',
            effects: [{ kind: 'flag', id: 'act4-atlas-asked-to-choose', value: true }],
            next: 'choosing-again',
          },
        ],
      },
      'the-tablet-warning': {
        speakerId: 'atlas-npc',
        text: 'Behind the counterweight gate, low shelf, wrapped in a smith\u2019s leather. And your fear is correct: a carving can be copied into a die as easily as a chain can be copied into a policy. Publish them as evidence, plural and contradictory, never as an official map. What is singular can be stolen whole.',
        next: 'choosing-again',
      },
      'choosing-again': {
        speakerId: 'atlas-npc',
        text: 'You asked me to choose something. Do you know how long it has been since the vault heard that verb aimed at me instead of about me? The anchors have fixed routes behind them. I will tell you what each opens, and you will release them, and we will both of us mean by it that a prisoner\u2019s directions are not a prisoner\u2019s consent.',
        next: 'revocable-sky',
      },
      'revocable-sky': {
        speakerId: 'kallias',
        text: 'Then when the draft is written, your testimony goes in under your own name — and the clause says the sky you carry may be set down by consent, and picked up again only by the same kind of consent.',
        next: 'the-harness-remembered',
      },
      'the-harness-remembered': {
        speakerId: 'atlas-npc',
        text: 'Write it so a stranger can enforce it after I am too tired to. Revocable is the only honest shape for a power that touches a body, and I have spent an eternity being the counterexample. If you free one anchor tonight, free the eastern one first. The guards there were conscripted from the slag camp, and they have families listening.',
        effects: [
          { kind: 'flag', id: 'act4-testimony-atlas-heard', value: true },
          { kind: 'flag', id: 'act4-atlas-anchor-order-given', value: 'east-first' },
          { kind: 'marker', mapId: 'atlas-vault', entityId: 'chain-anchor-4' },
        ],
        next: null,
      },
    },
    authoring: act4Authoring({
      category: 'conversation',
      dramaticQuestion: 'Can Atlas testify as a person under coercion rather than as a monster wearing his name, and can a prisoner be asked to choose without the asking becoming another harness?',
      systemsUsed: ['dialogue', 'questing'],
      durableReward: 'The scene records Atlas\u2019s coerced-witness testimony, his plural-sky tablet warning, and marks the eastern chain anchor he asks to be freed first.',
      downstreamConsequence: 'His east-first request and the publish-as-plural instruction give the anchor-release and side-quest loops authored content; his revocability line becomes the clause the mortal draft must carry into Act V.',
      recoveryBehavior: 'The deterministic graph resumes after interruption; the value-bearing anchor-order flag is deduplicated by the shared effect union, so repeat viewings cannot re-rank or reward.',
      expectedMinutes: 4,
      originalityNotes: 'Public-domain Atlas endurance motif only; the coerced-witness/monster-base identity split, load-as-weather, and plural-sky epistemology are original Oathbearer writing.',
    }),
  },

  'act4-hercules-freely-given': {
    id: 'act4-hercules-freely-given',
    speakerIds: ['hercules', 'atlas-npc', 'kallias'],
    start: 'not-another-labor',
    nodes: {
      'not-another-labor': {
        speakerId: 'hercules',
        text: 'Before you ask: I have done the math on strong men, and the math is a crime. Every labor I was sold was called a service, every service was called a favor, and every favor came with a receipt long enough to hang a temple from. I will help your march. I will not be leased.',
        next: 'the-gate-and-the-price',
      },
      'the-gate-and-the-price': {
        speakerId: 'kallias',
        text: 'The collapsed vault has two gates jammed out of true. One needs a shoulder the size of a legend. The other needs a counterweight rerouted by hands small enough to fit the channel.',
        next: 'split-the-joke',
      },
      'split-the-joke': {
        speakerId: 'hercules',
        text: 'So the architect built a job where one person is indispensable and the other is invisible. I have lived in that building my whole life. Split it: I take the gate you cannot move, you take the channel I cannot reach, and we sign nothing that says either lift was owed.',
        next: 'the-signal-choice',
      },
      'the-signal-choice': {
        choices: [
          {
            id: 'agree-to-split',
            text: 'Agreed. I will signal when the counterweight is rerouted, and you lift on my word and no one else\u2019s.',
            effects: [{ kind: 'flag', id: 'act4-hercules-split-agreed', value: true }],
            next: 'witness-not-tool',
          },
          {
            id: 'ask-what-he-wants',
            text: 'The split works. But you did not agree to it for nothing. Say the price before I call you generous.',
            effects: [{ kind: 'flag', id: 'act4-hercules-price-asked', value: true }],
            next: 'the-named-price',
          },
        ],
      },
      'the-named-price': {
        speakerId: 'hercules',
        text: 'The price is a sentence in your draft: no strength goes to the march on command, only on invitation, and invitations can be declined without the decliner being renamed a traitor. That is all. I watched what they did to the smiths who wanted to work quietly. I would like my shoulders to be my own before they are useful.',
        next: 'witness-not-tool',
      },
      'witness-not-tool': {
        speakerId: 'atlas-npc',
        text: 'He will lift, then. I have listened to him bargain from three cells away, and I want the record to carry that it was a bargain and not a miracle. Miracle is what the Loom calls unpaid labor when the unpaid party is famous.',
        next: 'three-shoulders',
      },
      'three-shoulders': {
        speakerId: 'kallias',
        text: 'Atlas still speaks like a man testing whether his own sentences are allowed. Note it for the draft: when we cut the last cell open tonight, nobody has to perform gratitude for the record.',
        next: 'the-open-hand',
      },
      'the-open-hand': {
        speakerId: 'hercules',
        text: 'Good. Gratitude clauses are how they make the freed police their own rescue. Signal me at the gate and I will lift like a man doing a friend a favor he may cancel tomorrow — which is precisely the only kind of favor worth signing. Now go be smaller than I am in that channel.',
        effects: [
          { kind: 'flag', id: 'act4-testimony-hercules-heard', value: true },
          { kind: 'marker', mapId: 'atlas-vault', entityId: 'gate-hercules-lift' },
        ],
        next: null,
      },
    },
    authoring: act4Authoring({
      category: 'conversation',
      dramaticQuestion: 'Can Hercules lend the march his strength without the loan becoming another lease, and can the side-quest gate split prove that indispensable and invisible are a design choice rather than a law of physics?',
      systemsUsed: ['dialogue', 'questing'],
      durableReward: 'The scene records Hercules\u2019s invitation-not-command price and marks the lift gate where the split-gates loop is played; the choice flags record whether the player named his price unprompted.',
      downstreamConsequence: 'His no-gratitude-clause rule disciplines the ratification scene, and the two-person gate design is the playable proof of the draft\u2019s consent-under-refusal principle.',
      recoveryBehavior: 'The deterministic graph resumes after interruption; effects apply once through the shared union; the loop grants no currency or items from dialogue.',
      expectedMinutes: 4,
      originalityNotes: 'Public-domain Hercules labors motif only; the receipts, miracle-as-unpaid-labor, and invitation-not-command lines are original Oathbearer expression.',
    }),
  },

  'act4-smiths-ledger': {
    id: 'act4-smiths-ledger',
    speakerIds: ['smith-thais', 'smith-nestor', 'kallias'],
    start: 'call-it-what-it-was',
    nodes: {
      'call-it-what-it-was': {
        speakerId: 'smith-thais',
        text: 'Do not call it a workshop. A workshop is where you are asked what you can make. This was a room where the asked part had been carefully removed, and the metal came in hot and left stamped with someone else\u2019s word for courage, and my hands — my hands had gotten very good at not minding.',
        next: 'two-kinds-of-quiet',
      },
      'two-kinds-of-quiet': {
        speakerId: 'kallias',
        text: 'Nestor kept the tally while you kept the pace. I saw the marks on your bench before the cell door came open. That is not not minding.',
        next: 'the-tally',
      },
      'the-tally': {
        speakerId: 'smith-nestor',
        text: 'It is worse than not minding; it is bookkeeping. Forty-one dies struck for the false firmament. Nine hundred and six hours the vents ran locked. I wrote every figure because a man who cannot count his theft cannot file his claim, and I intended — I intend — to file.',
        next: 'what-the-guild-said',
      },
      'what-the-guild-said': {
        speakerId: 'smith-thais',
        text: 'And the guild said nothing for eleven years, which is the part your draft has to answer. We were not pressed out of a free market, friend. We were pressed out of a guild hall that decided the safest politics was silence, and silence is just a die that has not struck yet.',
        next: 'the-steward-choice',
      },
      'the-steward-choice': {
        choices: [
          {
            id: 'smiths-write-terms',
            text: 'Then the smith council writes the stewardship terms itself. Your tally becomes the audit baseline, numbers and all.',
            effects: [
              { kind: 'flag', id: 'act4-smith-council-terms-requested', value: true },
              { kind: 'marker', mapId: 'atlas-vault', entityId: 'cell-smith-1' },
            ],
            next: 'audit-baseline',
          },
          {
            id: 'tally-goes-public',
            text: 'Keep the tally itself out of your hands. Publish the full record now, before anyone learns to love it quietly.',
            effects: [{ kind: 'flag', id: 'act4-smith-tally-published', value: true }],
            next: 'publish-first',
          },
        ],
      },
      'audit-baseline': {
        speakerId: 'smith-nestor',
        text: 'We would hold that pen, yes. But listen to what you are asking two freed prisoners to steward on day one: the furnaces, the vents, the very gates that held us. If you give us the keys, give the march the right to watch us fumble them. A guild that cannot be audited is just a Loom with friendlier stamps.',
        next: 'publish-first',
      },
      'publish-first': {
        speakerId: 'smith-thais',
        text: 'Publication first. That is the older woman\u2019s answer and I have paid for the maturity. Every clause written after the tally went public will have known readers. Every clause written before becomes a favor, and favors are how they re-hire us without hiring us.',
        next: 'the-new-stamp',
      },
      'the-new-stamp': {
        speakerId: 'kallias',
        text: 'Then bring both benches to the dawn table. Thais keeps the pace of the new work; Nestor keeps its count; and nothing gets stamped until a stranger can read the record and say what it cost.',
        next: 'the-open-shop',
      },
      'the-open-shop': {
        speakerId: 'smith-nestor',
        text: 'Hear the smith\u2019s amendment, though, because I will say it once and ledger it forever: any hearth we tend may be closed by the people it feeds, at any hour, without proving they proved anything. A workshop you cannot leave is what this cell was. We are in no mood to become the next one.',
        effects: [{ kind: 'flag', id: 'act4-testimony-smiths-heard', value: true }],
        next: null,
      },
    },
    authoring: act4Authoring({
      category: 'conversation',
      dramaticQuestion: 'Can the rescued smiths hand the march their expertise without handing over their silence, and can a guild that survived by not minding be trusted to write the rules about minding?',
      systemsUsed: ['dialogue', 'questing'],
      durableReward: 'The scene records the joint smith testimony and marks the western smith cell; the tally and audit flags record which remedy the player asked for.',
      downstreamConsequence: 'Nestor\u2019s auditable-guild warning and the leave-without-proving clause are the smiths\u2019 authored positions at the ratification table, distinguishing the guild-stewardship formulation from the press they escaped.',
      recoveryBehavior: 'The deterministic graph resumes after interruption; effects apply exactly once through the shared union; choice flags carry no material reward.',
      expectedMinutes: 4,
      originalityNotes: 'Original characters; no named smith survives in the public-domain Act IV mythic record beyond the general topos of divine craft, so Thais and Nestor are wholly Oathbearer creations.',
    }),
  },

  'act4-zeus-single-crown': {
    id: 'act4-zeus-single-crown',
    speakerIds: ['zeus-crown-herald', 'kallias'],
    start: 'the-beneath',
    nodes: {
      'the-beneath': {
        speakerId: 'zeus-crown-herald',
        text: 'You have broken a press, redirected a fire, and released a prisoner, and the march calls that a beginning. From where I sit — and I do sit, mortal, that is the whole point — it looks like four doors removed from one house, and a house with no doors is only a weather problem waiting for its season.',
        next: 'the-offering',
      },
      'the-offering': {
        speakerId: 'zeus-crown-herald',
        text: 'So I offer a roof. One crown, one hand to wear it, one court to hear every forge dispute and every sky complaint, and your little witnessed hearths may keep their small flames under a single large weather. I am not threatening you. I am describing convenience, which is how the finest chains arrive at a workbench.',
        next: 'convenience-named',
      },
      'convenience-named': {
        speakerId: 'kallias',
        text: 'You said \u2018one court to hear every complaint.\u2019 That sentence does not contain the word \u2018refuse.\u2019 Say it again with the refusal in it, and I will pretend the offer was alive.',
        next: 'the-refusal-test',
      },
      'the-refusal-test': {
        speakerId: 'zeus-crown-herald',
        text: 'Bold for a man standing in the shadow of my furniture. Very well: refuse, and the march keeps its four doors and loses its roof. Refuse, and I will forget your name in a way that is entirely legal and entirely permanent. There. The word is in it now. Did the offer improve, or did you simply enjoy making me spell things out?',
        next: 'answer-the-crown',
      },
      'answer-the-crown': {
        choices: [
          {
            id: 'rejection-firm',
            text: 'Refused, and with the record open: no power wears this march as a hat, least of all one that admits forgetting is legal.',
            effects: [{ kind: 'flag', id: 'act4-crown-rejected-firm', value: true }],
            next: 'firm-answer',
          },
          {
            id: 'rejection-mournful',
            text: 'Refused — and I am not glad. A sky that has to be said no to is a sky that has been behaving badly for a very long time.',
            effects: [{ kind: 'flag', id: 'act4-crown-rejected-mournful', value: true }],
            next: 'mournful-answer',
          },
        ],
      },
      'firm-answer': {
        speakerId: 'kallias',
        text: 'Take the tone down, Herald, and put it in the minutes. We are not declining your roof out of manners. A single crown over witnessed hearths turns every witness into a subject with better acoustics, and we crossed the whole Forge March to say that consent you cannot revoke was never consent.',
        next: 'the-heavens-withdraw',
      },
      'mournful-answer': {
        speakerId: 'kallias',
        text: 'This should have been simpler, and I am sorry to the old fear in you that we just answered. We grieve the roof and refuse the hat, because every forge we opened tonight was closed by one hand, and we will not ratify the same architecture and call it gratitude this time.',
        next: 'the-heavens-withdraw',
      },
      'the-heavens-withdraw': {
        speakerId: 'zeus-crown-herald',
        text: 'Then the heavens withdraw, and the weather becomes yours entirely. Keep the crown out of the draft table, mortal, because we both know that if it sits there unasked-for, someone frightened will eventually ask. The firmament above you is already counting how long your door-keeping lasts.',
        effects: [
          { kind: 'flag', id: 'act4-testimony-zeus-witnessed', value: true },
          { kind: 'marker', mapId: 'atlas-vault', entityId: 'single-crown-parley' },
        ],
        next: null,
      },
    },
    authoring: act4Authoring({
      category: 'conversation',
      dramaticQuestion: 'Can the march refuse a benevolent monopoly without turning the refusal into performance, and can it refuse it twice — once hard, once grieving — while the outcome stays identical?',
      systemsUsed: ['dialogue', 'questing'],
      durableReward: 'The scene records the crown offer and refusal as witnessed testimony and marks the parley platform; only the tone flag varies, never the consequence.',
      downstreamConsequence: 'The unavoidable rejection gates the ascent to the False Constellation; Zeus\u2019s \u2018someone frightened will eventually ask\u2019 warning is the argument Act V must govern, and firm-versus-mournful changes only the march\u2019s remembered posture.',
      recoveryBehavior: 'The deterministic graph resumes after interruption; exactly one tone flag can be recorded per completion and the effect union cannot re-rank or double-apply it.',
      expectedMinutes: 4,
      originalityNotes: 'Public-domain Zeus-as-sovereign motif only; the roof-versus-doors argument, the legal-forgetting threat, and the herald voice are original Oathbearer writing.',
    }),
  },

  'act4-mortal-draft': {
    id: 'act4-mortal-draft',
    speakerIds: ['kallias', 'athena-march-captain', 'ares-march-captain', 'prometheus', 'atlas-npc', 'smith-thais', 'zeus-crown-herald'],
    start: 'dawn-muster',
    nodes: {
      'dawn-muster': {
        speakerId: 'kallias',
        text: 'Everyone who was spoken about is now in the room, and everyone in the room may be spoken back to. That is the whole innovation. The draft is mortal-authored — we held the pen even where we held it badly — and we are not pretending otherwise to make the ceremony comfortable.',
        next: 'athena-reading',
      },
      'athena-reading': {
        speakerId: 'athena-march-captain',
        text: 'Article one, read as I drafted it: licensed flame. Every forge draws lawfully, every license publishes its queue and its price. I will not hide that it is slow, and I will not hide that slowness is the point — a gate that opens instantly is a gate owned by whoever installed it.',
        next: 'ares-rebuttal',
      },
      'ares-rebuttal': {
        speakerId: 'ares-march-captain',
        text: 'Article two, from the man who itemized: guild stewardship. The benches keep their own keys, the crews publish their own costs, and when the emergency comes the smiths are inside the wall, not petitioning it. Audits are your roof, Athena. Mine is a door with a hinge anyone strong enough can oil.',
        next: 'prometheus-warning',
      },
      'prometheus-warning': {
        speakerId: 'prometheus',
        text: 'Article three, from the one who started this with a single gift: revocable hearths. Many small braziers, each renewed by witnesses who may stop renewing it. You will call it untidy. It is untidy. A fire you cannot put out is a hostage, and a fire no one can relight is a corpse — choose the untidy one.',
        next: 'atlas-clause',
      },
      'atlas-clause': {
        speakerId: 'atlas-npc',
        text: 'And the clause every article must wear, or it is just a taller chain: revocability. Whatever the march grants of flame, forge, sky, or strength, the grantor keeps a lawful door back out of it. I have been the warning. Let me at least be cited correctly. Upheld unevenly, yes — an upkeep clause for every hearth the draft lights, written before anyone calls the arrangement permanent.',
        next: 'smith-addendum',
      },
      'smith-addendum': {
        speakerId: 'smith-thais',
        text: 'The smiths\u2019 addendum, and we are reading it aloud so it cannot become fine print: no bench, guild, or licensed flame may hold a worker past the hour they ask to leave. Forty-one dies, nine hundred and six locked vent hours — the tally is on the table. Ratify a form that can survive its own audit or do not look at us.',
        next: 'choose-first-voice',
      },
      'choose-first-voice': {
        choices: [
          {
            id: 'witness-flame-first',
            text: 'Call the flame to speak to the draft first. Everything else in this valley burns on its terms or no terms.',
            effects: [{ kind: 'flag', id: 'act4-draft-first-voice-flame', value: true }],
            next: 'the-gods-sign-last',
          },
          {
            id: 'witness-anvil-first',
            text: 'Call the anvil first. The hands that carried the tally get the first word on what replaces the press.',
            effects: [{ kind: 'flag', id: 'act4-draft-first-voice-anvil', value: true }],
            next: 'the-gods-sign-last',
          },
          {
            id: 'witness-heaven-first',
            text: 'Call the heavens first. If the powers will not answer before freed people, the draft is already a fence.',
            effects: [{ kind: 'flag', id: 'act4-draft-first-voice-heaven', value: true }],
            next: 'the-gods-sign-last',
          },
        ],
      },
      'the-gods-sign-last': {
        speakerId: 'zeus-crown-herald',
        text: 'We heard your little arrangement from the rim, and the crown was not on the table, so know this: heaven will sign the mortal draft last, small, and under protest, and every god present will be bound by the clause the prisoner wrote. If the sky is to be governed, let it be governed by those who can read the tally. That, I will not pretend was gracious.',
        next: 'one-question',
      },
      'one-question': {
        speakerId: 'kallias',
        text: 'One question for the record before the signatures dry. Which of us is being protected by this draft tonight, and does the answer change after the first year, and who is authorized to notice out loud?',
        next: 'ratified-awake',
      },
      'ratified-awake': {
        speakerId: 'prometheus',
        text: 'That, and not the articles, is what you are ratifying: the right to notice out loud. All three forms survive the question or none of them deserve to. Sign awake, march — the fire is only fire again, which is the most anyone down here ever asked it to be.',
        effects: [{ kind: 'flag', id: 'act4-testimony-draft-witnessed', value: true }],
        next: null,
      },
    },
    authoring: act4Authoring({
      category: 'conversation',
      dramaticQuestion: 'Can three incompatible remedies be signed in one sitting by people who escaped the same press, without the assembly ratifying ceremony instead of consent?',
      systemsUsed: ['dialogue', 'questing'],
      durableReward: 'The scene gives every Act IV witness a final on-record voice, and the three first-voice flags fix only the order of testimony, never which formulation the objective choice later ratifies.',
      downstreamConsequence: 'Atlas\u2019s revocability clause and the smiths\u2019 leave-hour addendum become the standard the draft and its evidence weights answer to in Act V; the question who is protected is deliberately left unanswered in-scene.',
      recoveryBehavior: 'The deterministic graph resumes after interruption; exactly one first-voice flag is recorded per completion through the shared union; the scene grants no material reward.',
      expectedMinutes: 5,
      originalityNotes: 'All speaker positions are original argumentation; the only public-domain inheritance is the assembly-of-powers topos, restructured as a mortal-authored ratification with no divine quorum.',
    }),
  },
})

export function act4ConversationById(id) {
  return (typeof id === 'string' && ACT4_CONVERSATIONS[id]) || null
}
