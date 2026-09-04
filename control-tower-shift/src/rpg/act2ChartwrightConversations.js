// Act II Pelagos Chartwright conversation graphs — the three external scenes
// required by the isolated Chartwright slice.
//
// These scenes are the authored dialogue seam for act2ChartwrightRuntime.js:
// Ianthe's open-chart briefing (character quest entry and the publication
// model decision), Naukleros's signal-keeper warning (side-quest acceptance
// and the honest shoal elite telegraph), and Dorieus's register of routes
// (the published-route consequence surface). They follow the immutable
// conventions established by act3Conversations.js and act4Conversations.js:
// data-only, deterministic, deep-frozen, no DOM, no time, no RNG. Effects are
// testimony flags, publication-model flags, and world markers only. They
// never move objective indices and never grant repeatable rewards — quest
// progression stays in the shared reducer, and the character quest's durable
// 'act2-ianthe-open-chart-published' reward remains reducer-side.
//
// Registered dialogue seam. Reducer/UI integration still owns acceptance,
// survey progression, and the later publication settlement.
//
// Ianthe continues her established Act II voice and continuity from
// 'act2-ianthe-first-meeting' (eleven years of copied charts, the "send word
// to this table" promise, Kallias's "mistake in the hands, not the morals"
// test). Naukleros and Dorieus are original characters grounded only in
// public-domain Aegean navigation practice: ledger-of-lights signal keeping,
// lead-line soundings with witness counts, tide-state bearing notation, day-
// marks and unlit buoys, and a civic route register with an open objection
// window. No franchise or translated-source borrowing.

import { act2Authoring } from './act2Content.js'
import { ACT2_CHARTWRIGHT_CHARACTER_QUEST, ACT2_CHARTWRIGHT_CONVERSATION_IDS } from './act2ChartwrightContent.js'
import { validateAuthoredConversation } from './authoringSchema.js'

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value)) deepFreeze(nested)
  return value
}

// The stable NPC bindings the lead integration must apply, same shape as
// act4Conversations.js EXPECTED_SPEAKER_BINDINGS. `primarySpeakerId` equals
// the runtime entity id in act2ChartwrightRuntime.js so nameplate lookup
// resolves without display-text inference; `existsInRuntime` reflects the
// isolated runtime map, not registry integration.
export const EXPECTED_SPEAKER_BINDINGS = deepFreeze([
  { conversationId: 'act2-ianthe-chartwright-briefing', primarySpeakerId: 'ianthe-chartwright', npcEntityId: 'ianthe-chartwright', mapId: 'chartwright-hall', existsInRuntime: true },
  { conversationId: 'act2-naukleros-signal-shoal', primarySpeakerId: 'naukleros-signal-keeper', npcEntityId: 'naukleros-signal-keeper', mapId: 'chartwright-hall', existsInRuntime: true },
  { conversationId: 'act2-dorieus-published-route', primarySpeakerId: 'dorieus-route-clerk', npcEntityId: 'dorieus-route-clerk', mapId: 'chartwright-hall', existsInRuntime: true },
])

// Publication-model flags recorded by the briefing choice. These are the
// recoverable, exact-once seams a later Act V consequence reads:
// 'act2-chartwright-publication-model' is set to the accepted choice id, and
// Dorieus's posting choice records 'act2-published-route-first-copy'.
export const ACT2_CHARTWRIGHT_PUBLICATION_FLAGS = deepFreeze({
  model: 'act2-chartwright-publication-model',
  firstCopy: 'act2-published-route-first-copy',
  values: {
    model: ['public-ledge', 'stewarded-berth'],
    firstCopy: ['ledge', 'berth', 'unposted'],
  },
})

export const ACT2_CHARTWRIGHT_CONVERSATIONS = deepFreeze({
  'act2-ianthe-chartwright-briefing': {
    id: 'act2-ianthe-chartwright-briefing',
    speakerIds: ['ianthe-chartwright', 'kallias'],
    start: 'strand-road',
    nodes: {
      'strand-road': {
        speakerId: 'ianthe-chartwright',
        text: 'You came in the harbor side with salt in two boots, which means you took the strand road instead of the quay stair. Good. Nobody who takes the quay stair ever learns the distance. Sit anywhere that is not wet. The hall keeps its own water until spring.',
        next: 'thessa-word',
      },
      'thessa-word': {
        speakerId: 'kallias',
        text: 'You said to send word to this table when I had the rest of the name in hand. Here is the word, and then a request. The chart you gave me at the first table held. I want the same roads to hold for every crew that crosses after me, without owing their lives to finding you first.',
        next: 'open-chart',
      },
      'open-chart': {
        speakerId: 'ianthe-chartwright',
        text: 'Eleven years of copying, and you are the first to come back and say a copy worked instead of asking for a better one. That is why the charts are no longer kept in a chest. An open chart: the hall publishes what it measures, any hand that tests it adds its soundings, signs them, and is wrong in public if wrong. Old charts only get older. These get checked.',
        next: 'three-conditions',
      },
      'three-conditions': {
        speakerId: 'ianthe-chartwright',
        text: 'Three conditions, then your first work. Measure twice, publish once — a bearing you have not stood at is a rumor with an arrow on it. Every correction carries a witness, a date, and a tide state, or it carries nothing. And you will start at the near pair, under your feet: the soundings station is inlaid in the floor seam beneath my arm, west of the chart table, and the tide-bearing station sits east along the survey floor, past the table legs, before you reach Naukleros under the lamp. Do not touch the east one first. It wants the harbor-sounding chart carried in your own bag, and the reason is arithmetic, not authority — a tide bearing cannot be verified against nothing.',
        next: 'hands-not-morals',
      },
      'hands-not-morals': {
        speakerId: 'kallias',
        text: 'Tell me the mistake in the hands, not the morals. What does a false sounding look like before it is ever copied? I have spliced rope and carried crate, but I never stood a lead.',
        next: 'the-slack-line',
      },
      'the-slack-line': {
        speakerId: 'ianthe-chartwright',
        text: 'A line that never went slack. You drop the weight, and you wait for the bell of the line to go soft — that is bottom. Copy a cast you read while the line is still singing and you have written depth plus the water the line was standing in, and everyone drowns politely off a chart like that. Count fathoms out loud and let a second hand count them back before you ink them. The lanes here turn ebb, crossing, surge: mark the state beside the number or the number means nothing to whoever follows you.',
        next: 'come-back-nameless',
      },
      'come-back-nameless': {
        speakerId: 'ianthe-chartwright',
        text: 'Witness both stations, then come back to this table, because after that the hall has a decision in it with no right answer written anywhere. The ledge line and the berth line both work, and neither is safe to leave nameless. Dorieus will not ink the posting until someone says what kind of chart this harbor intends to keep.',
        next: 'publication-model',
      },
      'publication-model': {
        choices: [
          {
            id: 'briefing-ledge-example',
            text: 'Ask Ianthe to show how an open ledge posting would work before deciding it.',
            next: 'ledge-answer',
          },
          {
            id: 'briefing-berth-example',
            text: 'Ask Ianthe to show how a stewarded berth posting would work before deciding it.',
            next: 'berth-answer',
          },
        ],
      },
      'ledge-answer': {
        speakerId: 'ianthe-chartwright',
        text: 'That is the ledge example: corrected loudly, with every argument where you can see the water. It is not your decision yet. Dorieus holds the counter beyond Naukleros, at the far end of the hall, when both stations have been witnessed.',
        next: 'wet-till-spring',
      },
      'berth-answer': {
        speakerId: 'ianthe-chartwright',
        text: 'That is the berth example: slow corrections and named witnesses between the harbor and a wet rumor. It is not your decision yet. Dorieus holds the counter beyond Naukleros, at the far end of the hall, when both stations have been witnessed.',
        next: 'wet-till-spring',
      },
      'wet-till-spring': {
        speakerId: 'ianthe-chartwright',
        text: 'Go stand on the stations first. Whatever you tell Dorieus after, this table stays where it is, wet until spring. And Kallias — when you have the rest of your god’s name, bring it to an open chart. I would like it checked against every column at once, in public, with the corrections visible.',
        effects: [
          { kind: 'flag', id: 'act2-chartwright-briefing-heard', value: true },
          { kind: 'marker', mapId: 'chartwright-hall', entityId: 'chart-table' },
        ],
        next: null,
      },
    },
    authoring: act2Authoring({
      category: 'conversation',
      dramaticQuestion: 'Will Ianthe commit her life’s tables to a chart that any sailor can prove wrong in public, and will Kallias choose which kind of accountability the harbor keeps?',
      systemsUsed: ['dialogue', 'wayfinding', 'questing'],
      durableReward: 'The scene records the open-chart briefing, marks the physical chart table, and fixes the publication model flag — public ledge or stewarded berth — from the player’s own mouth.',
      downstreamConsequence: 'The publication-model flag is the recoverable seam Act V reads: Dorieus’s register branch, hall travel copy, and the later visibility of who may correct a published route all key off it, while the quest’s durable reward stays reducer-side.',
      recoveryBehavior: 'The deterministic graph resumes after interruption; the required choice cannot be skipped past, each accepted choice applies exactly once through the shared reducer, and the briefing flag and table marker cannot duplicate across replays.',
      expectedMinutes: 4,
      originalityNotes: 'Continues Ianthe’s established Oathbearer voice from act2-ianthe-first-meeting; uses public-domain Mediterranean lead-line sounding, witness-counted depth, and tide-state notation practice. No franchise or translated-source borrowing.',
    }),
  },

  'act2-naukleros-signal-shoal': {
    id: 'act2-naukleros-signal-shoal',
    speakerIds: ['naukleros-signal-keeper', 'kallias'],
    start: 'the-count',
    nodes: {
      'the-count': {
        speakerId: 'naukleros-signal-keeper',
        text: 'I am Naukleros, keeper of the ledger of the lights. Pelagos maintained forty-one signals when I was bound to the count. Thirty-one answer tonight. I recite the number first so you understand that nothing I tell you after it is drama. It is arithmetic, and the arithmetic is bad.',
        next: 'ten-asked',
      },
      'ten-asked': {
        speakerId: 'kallias',
        text: 'What happened to ten?',
        next: 'nine-drowned',
      },
      'nine-drowned': {
        speakerId: 'naukleros-signal-keeper',
        text: 'Nine drowned with their stations and their dates, which the ledger keeps because a light without a date is a rumor again. The tenth stands and is not seen. That is the one I would ask you toward: the signal buoy on the submerged shoal marks the reef that eats the shortcut between this hall and the storm anchorage. Every season some crew runs the fast line and pays for a chart no one maintained.',
        next: 'bell-reef',
      },
      'bell-reef': {
        speakerId: 'naukleros-signal-keeper',
        text: 'The buoy is repairable. The reef is not removable. In between them, the bell keeps a cartographer’s warning after the cartographer is gone, and the reef has learned to answer a false bearing. The hall calls it the Bell-Reef Cartographer. Three heads answer first, and the last will not show itself until at least one head is still. I recite the order plainly, because a keeper who prettifies a warning is worse than the reef, and a keeper who sells you the danger as a story is worse than both.',
        next: 'skiff-instructions',
      },
      'skiff-instructions': {
        speakerId: 'naukleros-signal-keeper',
        text: 'So: the skiff door at the east of the hall, out past Dorieus’s counter. On ebb the main lane carries you; on surge the crossing lane does not, and the shoal will tell you so with its own voice if you are listening. The buoy sits mid-channel at the four-fathom patch — you will feel the bottom change under the oars before you see the iron. Clear the bell first. When it falls quiet the water sets you on the cleared stand below the buoy, whole, and the relighting is after that and not before.',
        next: 'before-the-count',
      },
      'before-the-count': {
        speakerId: 'naukleros-signal-keeper',
        text: 'One more thing, and it is a request, not a term. The ledger of the lights is read at anchorages, and it cannot yet write your name in it. If the light comes back, someone should say what the count was before it did, out loud, where the crews who lost people can hear the number change.',
        next: 'note-choice',
      },
      'note-choice': {
        choices: [
          {
            id: 'naukleros-carry-the-note',
            text: 'Give me the recitation. I will read the count at the anchorage market before I light anything.',
            effects: [{ kind: 'flag', id: 'act2-naukleros-note-borne', value: true }],
            next: 'warning-and-monument',
          },
          {
            id: 'naukleros-light-first',
            text: 'Hold the count until the buoy burns. A recitation over a dark reef is a eulogy; I would rather bring you the number with the light lit under it.',
            effects: [{ kind: 'flag', id: 'act2-naukleros-light-first', value: true }],
            next: 'warning-and-monument',
          },
        ],
      },
      'warning-and-monument': {
        speakerId: 'naukleros-signal-keeper',
        text: 'Then we agree on the difference between the warning and the monument. The buoy is the warning. The count is the monument. Bring me back either one first and the other will still be owed, and the ledger stays open to whoever pays it.',
        next: 'not-an-empty-station',
      },
      'not-an-empty-station': {
        speakerId: 'naukleros-signal-keeper',
        text: 'When you return from the shoal, you will return to the cleared water and not to where you began — that is the whole mercy of it, and do not spend it looking for the way you came. Come back to me with copy and with the count, and do not make me recite your numbers to an empty station.',
        effects: [
          { kind: 'flag', id: 'act2-naukleros-met', value: true },
          { kind: 'marker', mapId: 'submerged-signal-shoal', entityId: 'signal-buoy' },
        ],
        next: null,
      },
    },
    authoring: act2Authoring({
      category: 'conversation',
      dramaticQuestion: 'Can Naukleros hand a stranger a dangerous shortcut by reciting arithmetic instead of selling danger or safety, and can the player choose whether warning or remembrance is repaired first?',
      systemsUsed: ['dialogue', 'wayfinding', 'questing'],
      durableReward: 'The scene records the signal keeper, marks the drowned buoy as the side quest’s acceptance seam, and fixes which of the keeper’s two debts — the recited count or the lit signal — the player swore to pay first.',
      downstreamConsequence: 'His exact elite telegraph and tide-lane instructions govern how the shoal plays, and the note/light-first flags give later anchorage and hall travel copy two honest, recoverable states to reflect.',
      recoveryBehavior: 'The deterministic graph resumes after interruption; the required choice applies exactly once, its flag cannot be duplicated by skip or replay, and neither choice grants power or moves any objective index.',
      expectedMinutes: 3,
      levelMin: 10,
      levelMax: 45,
      originalityNotes: 'Naukleros is an original character grounded in public-domain Aegean practice — lighthouse and day-mark ledgers, unlit buoy hazards, four-fathom sounding calls. No franchise or translated-source borrowing.',
    }),
  },

  'act2-dorieus-published-route': {
    id: 'act2-dorieus-published-route',
    speakerIds: ['dorieus-route-clerk', 'kallias'],
    start: 'state-it-to-ledger',
    nodes: {
      'state-it-to-ledger': {
        speakerId: 'dorieus-route-clerk',
        text: 'State your name, your standing, and the bearing you claim. Not to me — to the register. I am Dorieus, clerk to the register of routes, and my opinion of the sea is that it files nothing, which is why someone in this hall has to.',
        next: 'ink-posting',
      },
      'ink-posting': {
        speakerId: 'kallias',
        text: 'The chart is inked and posted. I came for the part where that becomes real.',
        next: 'three-acts',
      },
      'three-acts': {
        speakerId: 'dorieus-route-clerk',
        text: 'Publication is three acts: ink, posting, objection window. The ink is done. The posting is this counter. The objection window is every harbor hand that can prove the depths wrong, and it never closes — which the last council hated, and this council has so far survived. What you are really deciding today is where the first copy hangs, because the hall will argue the shortcut either way, and I will state the register’s options in the register’s words before you pick with your hands open.',
        next: 'posting-choice',
      },
      'posting-choice': {
        choices: [
          {
            id: 'dorieus-copy-to-ledge',
            when: [{ kind: 'flag', flagId: 'act2-chartwright-publication-model', value: 'public-ledge' }],
            text: 'Hang the first copy on the ledge, over the open corrections, where every hand that disputes a sounding has to stand in the rain to do it.',
            effects: [{ kind: 'flag', id: 'act2-published-route-first-copy', value: 'ledge' }],
            next: 'ledge-trouble',
          },
          {
            id: 'dorieus-copy-to-berth',
            when: [{ kind: 'flag', flagId: 'act2-chartwright-publication-model', value: 'stewarded-berth' }],
            text: 'Hang it at the berth, witnessed and dated, with the witness list stitched behind it where the queue can read its own names back.',
            effects: [{ kind: 'flag', id: 'act2-published-route-first-copy', value: 'berth' }],
            next: 'berth-trouble',
          },
          {
            id: 'dorieus-copy-unposted',
            text: 'Hang it nowhere yet. Let the harbor come ask what it is, instead of being told what it is.',
            effects: [{ kind: 'flag', id: 'act2-published-route-first-copy', value: 'unposted' }],
            next: 'blank-wall',
          },
        ],
      },
      'ledge-trouble': {
        speakerId: 'dorieus-route-clerk',
        text: 'The ledge, then. Its trouble is that a road made of public argument travels farther than proof does. In ten years someone who has never smelled this harbor will read that copy and sail on its credit without knowing the rain or the names behind it, and the register cannot follow them there. Your name stands beside the posting either way. That is what the name is for.',
        next: 'record-of-road',
      },
      'berth-trouble': {
        speakerId: 'dorieus-route-clerk',
        text: 'The berth, then. Its trouble is the queue. A witnessed correction is an honest correction, and honesty keeps a waiting line, and someone will drown the distance outside the line while two witnesses inside it dispute their bearing. The register lists the waiting too. That is what a ledger is for.',
        next: 'record-of-road',
      },
      'blank-wall': {
        speakerId: 'dorieus-route-clerk',
        text: 'Unposted. A rare third answer, and the register enters it as given: a blank wall, and rumor fills blank walls, and rumor keeps no witness, no date, and nobody to correct it. When you are ready to be argued with, come back to this counter. I do not charge for the change of mind. Only for the entry.',
        next: 'record-of-road',
      },
      'record-of-road': {
        speakerId: 'dorieus-route-clerk',
        text: 'For the record of the road, since you asked what is real: the skiff door east of this counter carries to the shoal. The hall’s west door drops you at the harbor gate. The counter is the last dry lamp before either. If you come back off the water in weather and cannot find any of that, come to the counter first — the register does not care which door you used, only which you can say, and when you are lost, say it to a clerk before you say it to the sea.',
        next: 'consultation-entry',
      },
      'consultation-entry': {
        speakerId: 'dorieus-route-clerk',
        text: 'I enter today’s business as consultation, not completion. Completion means someone stopped being able to object. Don’t make me write that word over your name.',
        effects: [{ kind: 'flag', id: 'act2-dorieus-register-seen', value: true }],
        next: null,
      },
    },
    authoring: act2Authoring({
      category: 'conversation',
      dramaticQuestion: 'Can a route clerk make publication mean something other than authority by letting the player choose where a public chart hangs — or whether it hangs at all — and still state each choice’s honest trouble?',
      systemsUsed: ['dialogue', 'wayfinding', 'choice'],
      durableReward: 'The scene records the register of routes, offers a gated reflection of Ianthe’s publication model plus a third refusal, and leaves the player with an explicit door-by-door account of the Chartwright hall.',
      downstreamConsequence: 'The first-copy flag — ledge, berth, or unposted — is the readable seam a later Act V consequence uses to state what the open chart became once it traveled past the harbor that made it.',
      recoveryBehavior: 'The deterministic graph resumes after interruption; the posting choice applies exactly once even if its model-gated siblings were hidden when it was made, and the unposted branch is always selectable so recovery never dead-ends a partially played scene.',
      expectedMinutes: 3,
      originalityNotes: 'Dorieus is an original character grounded in public-domain Aegean harbor record-keeping and civic inscription practice; the objection-window register is original Oathbearer expression. No franchise or translated-source borrowing.',
    }),
  },
})

export function act2ChartwrightConversationById(id) {
  return (typeof id === 'string' && ACT2_CHARTWRIGHT_CONVERSATIONS[id]) || null
}

// Canonical dialogue tokenizer: identical to the complete-game reporter
// (scripts/verify-oathbearer-complete-game.mjs, wordsIn) so any number
// produced here reconciles with registry totals after integration.
function wordsIn(text) {
  return String(text || '').trim().match(/[\p{L}\p{N}'’\u2010-]+/gu)?.length || 0
}

// Pure display-text word count over node text and choice text for the given
// conversations (defaults to this slice). Excludes authoring metadata.
export function countAct2ChartwrightDialogueWords(conversations = ACT2_CHARTWRIGHT_CONVERSATIONS) {
  const records = Array.isArray(conversations)
    ? conversations
    : Object.values(conversations || {})
  return records.reduce((total, convo) => total + Object.values(convo?.nodes || {})
    .reduce((nodeSum, node) => nodeSum + wordsIn(node.text)
      + (node.choices || []).reduce((choiceSum, choice) => choiceSum + wordsIn(choice.text), 0), 0), 0)
}

function compareIssues(left, right) {
  return left.code.localeCompare(right.code)
    || left.path.localeCompare(right.path)
    || left.message.localeCompare(right.message)
}

// Pure structural, continuity, and content-contract validator for this slice.
// It never mutates or registers anything; it returns a deterministic frozen
// report the integration lane can assert against before wiring the registry.
export function validateAct2ChartwrightConversations() {
  const issues = []
  const push = (code, path, message) => issues.push({ code, path, message })
  const ids = Object.keys(ACT2_CHARTWRIGHT_CONVERSATIONS).sort()
  const expected = [...ACT2_CHARTWRIGHT_CONVERSATION_IDS].sort()
  if (ids.length !== expected.length || ids.some((id, index) => id !== expected[index])) {
    push('CONVERSATION_ID_SET_MISMATCH', 'ACT2_CHARTWRIGHT_CONVERSATIONS',
      `Exported ids ${ids.join(', ')} do not exactly match the slice contract ${expected.join(', ')}.`)
  }

  const questChoiceIds = ACT2_CHARTWRIGHT_CHARACTER_QUEST.objectives
    .flatMap((objective) => objective.choiceIds || [])
  const seenTexts = new Map()
  for (const conversationId of ids) {
    const convo = ACT2_CHARTWRIGHT_CONVERSATIONS[conversationId]
    const path = `conversations.${conversationId}`
    const schema = validateAuthoredConversation(convo)
    for (const entry of schema.issues) push(`SCHEMA_${entry.code}`, `${path}.${entry.path}`, entry.message)
    if (convo.id !== conversationId) push('CONVERSATION_ID_MISMATCH', path, `Inner id ${String(convo.id)} differs from export key.`)

    const reachable = new Set([convo.start])
    const queue = [convo.nodes[convo.start]]
    let terminalCount = 0
    const conversationChoiceIds = new Set()
    while (queue.length > 0) {
      const node = queue.shift()
      if (!node) continue
      if (node.next == null) terminalCount += 1
      const follow = (nextId) => {
        if (!nextId) return
        if (!convo.nodes[nextId]) { push('UNRESOLVED_CONVERSATION_NODE', path, `Referenced node ${nextId} is missing.`); return }
        if (!reachable.has(nextId)) { reachable.add(nextId); queue.push(convo.nodes[nextId]) }
      }
      follow(node.next)
      for (const choice of node.choices || []) {
        if (!choice.id || conversationChoiceIds.has(choice.id)) push('DUPLICATE_CHOICE_ID', path, `Choice id ${String(choice.id)} repeats within the conversation.`)
        conversationChoiceIds.add(choice.id)
        if (!choice.next || !convo.nodes[choice.next]) push('UNRESOLVED_CONVERSATION_NODE', path, `Choice ${choice.id} must resolve to an authored node.`)
        follow(choice.next)
        if (!choice.text || wordsIn(choice.text) === 0) push('EMPTY_DISPLAY_TEXT', path, `Choice ${choice.id} has no display text.`)
        else if (seenTexts.has(choice.text)) push('DUPLICATE_DISPLAY_TEXT', path, `Choice text duplicates ${seenTexts.get(choice.text)}.`)
        else seenTexts.set(choice.text, `${path}:choice ${choice.id}`)
      }
      // Choice-group nodes carry no speaker line by the established pattern,
      // so text is required only on nodes without authored choices.
      const nodeText = node.text
      if ((node.choices || []).length === 0 && (!nodeText || wordsIn(nodeText) === 0)) {
        push('EMPTY_DISPLAY_TEXT', path, `Node without choices has no display text.`)
      }
      if (nodeText) {
        if (seenTexts.has(nodeText)) push('DUPLICATE_DISPLAY_TEXT', path, `Node text duplicates ${seenTexts.get(nodeText)}.`)
        else seenTexts.set(nodeText, `${path}:node`)
      }
    }
    for (const nodeId of Object.keys(convo.nodes).sort()) {
      if (!reachable.has(nodeId)) push('UNREACHABLE_CONVERSATION_NODE', `${path}.nodes.${nodeId}`, 'Node is not reachable from the start.')
    }
    if (terminalCount === 0) push('NO_TERMINAL_NODE', path, 'Conversation has no next:null terminal.')
    for (const binding of EXPECTED_SPEAKER_BINDINGS.filter((entry) => entry.conversationId === conversationId)) {
      if (!convo.speakerIds?.includes(binding.primarySpeakerId)) push('SPEAKER_BINDING_MISMATCH', path, `Primary speaker ${binding.primarySpeakerId} is absent from speakerIds.`)
    }
  }

  const briefing = ACT2_CHARTWRIGHT_CONVERSATIONS['act2-ianthe-chartwright-briefing']
  const briefingChoiceIds = Object.values(briefing?.nodes || {})
    .flatMap((node) => (node.choices || []).map((choice) => choice.id))
    .sort()
  if (briefingChoiceIds.some((id) => questChoiceIds.includes(id))) {
    push('PUBLICATION_CHOICE_CONTRACT', 'conversations.act2-ianthe-chartwright-briefing',
      'Briefing examples must not settle the later character-quest publication choice.')
  }

  const wordCount = countAct2ChartwrightDialogueWords()
  if (wordCount < 1200 || wordCount > 1800) {
    push('DIALOGUE_WORD_RANGE', 'ACT2_CHARTWRIGHT_CONVERSATIONS', `Total display words ${wordCount} falls outside the 1200–1800 slice budget.`)
  }

  issues.sort(compareIssues)
  return deepFreeze({ valid: issues.length === 0, wordCount, issues })
}
