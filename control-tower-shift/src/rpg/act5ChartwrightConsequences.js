// Act V Chartwright consequence draft — the delayed-witness seam for the
// Act II publication-model flag.
//
// This module is the recoverable downstream surface that
// act2ChartwrightConversations.js promises in its authoring metadata: once
// the Accord is written at the overlook, the harbor's published route tells
// on the model chosen two acts earlier. Each branch contributes visibly
// different epilogue witness material — original lines for Kallias, Thessa,
// Ianthe, and Dorieus, plus a short per-ending coda keyed to the three
// authored Accord variants — and NOTHING ELSE. It is display data only:
// no effects, no quest completion, no objective movement, no rewards, no
// new endings, no mutation of ACT5_ENDING_VARIANTS. The reducer owns every
// flag; this module only reads one it has already seen.
//
// Determinism contract: deep-frozen, serializable, no DOM, no time reads,
// no RNG, no network. Selecting a branch from flag state is a pure function
// with a total domain — the neutral fallback always matches, so this seam
// can never gate, block, or dead-end the main Act V path for a save that
// never met the Chartwright hall.
//
// NOT YET INTEGRATED: nothing imports this module into registry.js,
// act5Runtime.js, the epilogue conversation, or any test. The integration
// seam is documented at the bottom of this file and in the handoff notes.
//
// Continuity: Kallias, Thessa, and Ianthe keep their established voices
// (Kallias the carried name and the single-road map; Thessa's blank coasts
// and warm pen; Ianthe's arithmetic-not-authority, witness-date-tide rule
// from act2-ianthe-chartwright-briefing). Dorieus continues the register of
// routes from act2-dorieus-published-route: ink, posting, objection window.
// All practice is public-domain Aegean navigation and civic record-keeping;
// no franchise or translated-source borrowing.

import { ACT5_ENDING_VARIANTS, ACT5_REGION_ID } from './act5Content.js'
import {
  AUTHORING_SCHEMA_VERSION,
  REQUIRED_AUTHORING_METADATA_FIELDS,
} from './authoringSchema.js'

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value)) deepFreeze(nested)
  return value
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, clone(nested)]))
  }
  return value
}

// The exact gates. `sourceFlag` is the Act II publication-model flag as
// recorded by the briefing choice in act2ChartwrightConversations.js. The
// neutral branch carries no positive gate: it is the declared fallback that
// selects only when neither model value is present, so an absent or
// unposted harbor state never blocks the epilogue.
export const ACT5_CHARTWRIGHT_SOURCE_FLAGS = deepFreeze({
  model: { flagId: 'act2-chartwright-publication-model', values: ['public-ledge', 'stewarded-berth'] },
  firstCopy: { flagId: 'act2-published-route-first-copy', values: ['ledge', 'berth', 'unposted'] },
  accord: { flagId: 'act5-accord-choice', values: ACT5_ENDING_VARIANTS.map((ending) => ending.id) },
})

export const ACT5_CHARTWRIGHT_CONSEQUENCE_IDS = deepFreeze([
  'act5-chartwright-witness-public-ledge',
  'act5-chartwright-witness-stewarded-berth',
  'act5-chartwright-witness-open-register',
])

function branchAuthoring({ dramaticQuestion, durableReward, downstreamConsequence, recoveryBehavior, originalityNotes }) {
  return {
    schemaVersion: AUTHORING_SCHEMA_VERSION,
    category: 'conversation',
    dramaticQuestion,
    systemsUsed: ['dialogue', 'wayfinding'],
    durableReward,
    downstreamConsequence,
    recoveryBehavior,
    expectedMinutes: 1,
    originalityNotes,
    levelBand: { min: 30, max: 50 },
    regionBand: { regionIds: [ACT5_REGION_ID], acts: { min: 5, max: 5 } },
  }
}

export const ACT5_CHARTWRIGHT_CONSEQUENCES = deepFreeze({
  'act5-chartwright-witness-public-ledge': {
    id: 'act5-chartwright-witness-public-ledge',
    gate: [
      { kind: 'flag', flagId: 'act2-chartwright-publication-model', value: 'public-ledge' },
      { kind: 'flag', flagId: 'act2-published-route-first-copy', value: 'ledge' },
    ],
    priority: 1,
    fallback: false,
    presentation: { mapId: 'accord-overlook', anchorConversationId: 'act5-epilogue', slot: 'pre-epilogue witness' },
    publicConsequence: 'The ledge line traveled: corrections now arrive from harbors that never met Ianthe, argued in the open where anyone can watch them be wrong.',
    recoveryBehavior: 'The objection window is the recovery path — any hand may post a witnessed counter-sounding on the ledge, and the register entries date-stamp each correction without closing the road.',
    lines: [
      { speakerId: 'dorieus-route-clerk', cameraCue: 'speaker', text: 'Word came over the summit road: three anchorages south copied our ledge posting and hung their own copies under it, uncorrected. That is what travel does to a public chart. The register answers with its only tool — the objection window stays open, so their errors are still correctable here, in our rain, by any hand that can prove them wrong.' },
      { speakerId: 'ianthe-chartwright', cameraCue: 'reveal', text: 'Two of their copies got the crossing lane backwards, publicly and in the wrong direction — and a stranger with wet boots fixed one by adding his own sounding, dated, tide-marked, in a hand I never met. That is not my chart anymore. It is the thing I said I wanted, sooner than I expected.' },
      { speakerId: 'thessa', cameraCue: 'restore', text: 'An open road argues back. You published the ledge knowing the arguments would outrun the arguers, and the harbor kept its temper. Write the name with the arguments still visible under it.' },
      { speakerId: 'kallias', cameraCue: 'speaker', text: 'I chose the ledge because I was a crew that found the hall late, and the next crew should not have to. If the name goes down, it goes down with the wrong copies pinned beside it, where anyone can read what was fixed and by whom.' },
    ],
    endingCodas: {
      'bounded-patrons': { speakerId: 'dorieus-route-clerk', cameraCue: 'wide', text: 'Published limits and a public ledge are the same instrument at different sizes: power files nothing a witnessed hand cannot dispute. The register accepts the audit clause gladly, and warns you it will be audited loudly.' },
      'mortal-witness': { speakerId: 'ianthe-chartwright', cameraCue: 'restore', text: 'Local consent means the southern copies answer to their own harbors now. Eleven years of copying taught me that is how a road grows. I only ask each region to date its soundings.' },
      'renewed-compact': { speakerId: 'thessa', cameraCue: 'reveal', text: 'A compact that signs in public, a chart corrected in public — you kept the argument inside the agreement instead of underneath it. The dissent stays on the ledge. That is the whole trick.' },
    },
    authoring: branchAuthoring({
      dramaticQuestion: 'Once the Accord is written, does the open ledge prove that a road made of public argument can travel farther than proof, and can the harbor say so honestly in front of the new covenant?',
      durableReward: 'None granted by this module. The branch adds witnessed epilogue display lines reflecting a choice the player already made in Act II; all durable state remains reducer-side.',
      downstreamConsequence: 'After integration, the epilogue reads visibly differently for ledge saves: the register, Ianthe, and the blank-coast motif all acknowledge uncontrolled public correction as the chosen cost.',
      recoveryBehavior: 'Selection is pure over flag state already persisted; if the model flag is absent or unexpected the branch simply does not match and the neutral fallback renders, so no save is ever blocked.',
      originalityNotes: 'Continues established Oathbearer voices and original register-of-routes practice grounded in public-domain Aegean chart-copying and civic inscription. No franchise or translated-source borrowing.',
    }),
  },

  'act5-chartwright-witness-stewarded-berth': {
    id: 'act5-chartwright-witness-stewarded-berth',
    gate: [
      { kind: 'flag', flagId: 'act2-chartwright-publication-model', value: 'stewarded-berth' },
      { kind: 'flag', flagId: 'act2-published-route-first-copy', value: 'berth' },
    ],
    priority: 2,
    fallback: false,
    presentation: { mapId: 'accord-overlook', anchorConversationId: 'act5-epilogue', slot: 'pre-epilogue witness' },
    publicConsequence: 'The berth line held: corrections queue behind named witnesses, the chart stays slow, and the queue itself is now the argument other harbors make against this one.',
    recoveryBehavior: 'The witness list is the recovery path — each queued correction clears when two named hands sign it, and Dorieus’s register keeps the waiting visible so the delay is honestly priced, not hidden.',
    lines: [
      { speakerId: 'dorieus-route-clerk', cameraCue: 'speaker', text: 'The berth queue reached forty-one corrections before the Accord was written, and I will not pretend all forty-one were wisdom; some were only names standing between a rumor and a wall. A southern harbor called our chart timid to my face. I showed him the ledger of the waiting, the honest document. Slow is a price, and we post the price openly.' },
      { speakerId: 'ianthe-chartwright', cameraCue: 'reveal', text: 'Two witnesses died outside the queue last season — I said we would carry that, and here is the arithmetic of carrying it: no wrong bearing ever entered their berth either. I stand behind that sentence harder than I want to. The names are stitched behind the copy, and so are the dates.' },
      { speakerId: 'thessa', cameraCue: 'restore', text: 'You made the blank coast wait for signatures. That is respect, or fear, and this harbor will argue which for eleven years. Either way the chart in the record says what it owed and who it waited for.' },
      { speakerId: 'kallias', cameraCue: 'speaker', text: 'I chose the berth because a copy carrying a stranger’s guess has killed people I never met. If the price was a queue, the queue gets written down too. The name goes with the waiting list attached, for the next council to count.' },
    ],
    endingCodas: {
      'bounded-patrons': { speakerId: 'dorieus-route-clerk', cameraCue: 'wide', text: 'Bounded patrons and a stewarded berth want the same thing: named hands, filed terms, and an auditor who counts the queue as part of the record. We will be legible to the Keepers.' },
      'mortal-witness': { speakerId: 'ianthe-chartwright', cameraCue: 'restore', text: 'Local consent will pressure the berth — every region wants our witness standard and none wants our waiting. Tell them the queue is the covenant. Take the chart without the delay and you have bought a rumor with an arrow on it.' },
      'renewed-compact': { speakerId: 'thessa', cameraCue: 'reveal', text: 'A multi-signatory accord is a witness list with the whole world added. You trained for this at the berth, where nobody could sign alone. The contradictions stay public and the line still forms.' },
    },
    authoring: branchAuthoring({
      dramaticQuestion: 'Does the stewarded berth survive contact with the Accord, with the queue’s dead honestly named instead of smoothed over, and can stewardship defend itself out loud against the harbors calling it timid?',
      durableReward: 'None granted by this module. The branch adds witnessed epilogue display lines reflecting a choice the player already made in Act II; all durable state remains reducer-side.',
      downstreamConsequence: 'After integration, the epilogue reads visibly differently for berth saves: the ledger of the waiting, the stitched witness names, and the priced delay become the harbor’s testimony before the new covenant.',
      recoveryBehavior: 'Selection is pure over flag state already persisted; a missing or unexpected model value falls through to the neutral branch, so an interrupted or replayed Act II scene can never suppress the epilogue.',
      originalityNotes: 'Continues established Oathbearer voices; witness-signed civic correction queues are original Oathbearer expression built on public-domain Aegean record-keeping. No franchise or translated-source borrowing.',
    }),
  },

  'act5-chartwright-witness-open-register': {
    id: 'act5-chartwright-witness-open-register',
    gate: [],
    priority: 3,
    fallback: true,
    presentation: { mapId: 'accord-overlook', anchorConversationId: 'act5-epilogue', slot: 'pre-epilogue witness' },
    publicConsequence: 'No publication model was ever settled — the register stands as consultation only, the route stays unposted in the harbor’s memory, and the Accord is written beside a decision still open.',
    recoveryBehavior: 'The unposted wall is itself the recovery path: the Act II counter remains where it was, the choice is never consumed, and any later council or any returning crew can still settle the model without undoing this Accord.',
    lines: [
      { speakerId: 'dorieus-route-clerk', cameraCue: 'speaker', text: 'For the record: this harbor’s route stands entered as consultation, not completion. When the Accord is read south, someone will ask which chart Pelagos sailed under, and the honest answer is that we kept the question open. I file that answer in the same hand I file everything, because a blank wall with a clerk behind it beats a false posting signed by nobody.' },
      { speakerId: 'ianthe-chartwright', cameraCue: 'reveal', text: 'No model chosen is still a model — the road stays in the hall, argued over the chart table, wet until somebody decides. Eleven years is not up yet. Whatever name enters that Accord, mine stays on an open chart and an unfinished sentence, and I have made my peace with that arithmetic.' },
      { speakerId: 'thessa', cameraCue: 'restore', text: 'Then leave the page roomier. An unfinished decision is still a witness, and every accord ever written was drafted beside somebody’s open question. The blank coast does not embarrass the map. It is the part the map admits.' },
      { speakerId: 'kallias', cameraCue: 'speaker', text: 'I will not pretend I left the harbor no choice. I left it a choice not taken, and today nothing gets to demand I have finished being a sailor. The name goes down with the question mark under it, for whoever answers next.' },
    ],
    endingCodas: {
      'bounded-patrons': { speakerId: 'dorieus-route-clerk', cameraCue: 'wide', text: 'Published limits suit an unsettled register: we keep no authority over the route the audit cannot see we declined to use. When this harbor finally chooses a model, the clause is already waiting.' },
      'mortal-witness': { speakerId: 'ianthe-chartwright', cameraCue: 'restore', text: 'Local consent leaves the question where it belongs for now: with the people who stand in this rain. When the harbors that copied us want our chart, they can come argue for it at this table.' },
      'renewed-compact': { speakerId: 'thessa', cameraCue: 'reveal', text: 'An accord of many signatures, signed beside a decision unwritten. Keep both facts on the same page — the contradiction is not a flaw in the record. It is evidence the record is still alive.' },
    },
    authoring: branchAuthoring({
      dramaticQuestion: 'Can a harbor that never settled its publication model testify honestly at the Accord instead of silently pretending the question was answered, and can an open decision stand as a witness?',
      durableReward: 'None granted by this module. The branch is the neutral fallback: display lines only, no rewards, no completion, no gate on any other Act V content.',
      downstreamConsequence: 'After integration, saves that never resolved the Act II model still receive full epilogue coverage with distinct copy, so the Chartwright seam degrades to visible honesty rather than silence or blocking.',
      recoveryBehavior: 'This branch matches exactly when neither model value is present, is total over all other inputs, and is the sole declared fallback; the Act II counter and posting choice remain unrecoverably untouched by anything here.',
      originalityNotes: 'Continues Dorieus’s consultation-not-completion language and Ianthe’s wet-until-spring table from the Act II slice; the unposted state is original Oathbearer expression. No franchise or translated-source borrowing.',
    }),
  },
})

// ─── Null-safe lookups (same convention as act5Content.js) ────
export function act5ChartwrightConsequenceById(id) {
  return (typeof id === 'string' && ACT5_CHARTWRIGHT_CONSEQUENCES[id]) || null
}

const CODA_ALIASES = { 'renewed-compact-limited': 'renewed-compact' }

export function act5ChartwrightCodaFor(consequenceId, endingId) {
  const branch = act5ChartwrightConsequenceById(consequenceId)
  if (!branch || typeof endingId !== 'string') return null
  const key = CODA_ALIASES[endingId] || endingId
  return branch.endingCodas[key] || null
}

// Pure, total resolver. Accepts a flag object keyed by flagId or a getter
// function; never throws, never returns null, never mutates. Positive gates
// are matched in ascending priority order; the declared fallback absorbs
// everything else so the main path cannot be blocked by this seam.
export function selectAct5ChartwrightConsequence(flags) {
  const readFlag = (flagId) => {
    if (typeof flags === 'function') return flags(flagId)
    if (flags && typeof flags === 'object') return flags[flagId]
    return undefined
  }
  const branches = Object.values(ACT5_CHARTWRIGHT_CONSEQUENCES)
    .filter((branch) => !branch.fallback)
    .sort((left, right) => left.priority - right.priority)
  for (const branch of branches) {
    if (branch.gate.every((entry) => entry.kind === 'flag' && readFlag(entry.flagId) === entry.value)) return branch
  }
  return ACT5_CHARTWRIGHT_CONSEQUENCES['act5-chartwright-witness-open-register']
}

// Canonical dialogue tokenizer: identical to act2ChartwrightConversations.js
// and the complete-game reporter (scripts/verify-oathbearer-complete-game.mjs,
// wordsIn) so numbers produced here reconcile with registry totals.
function wordsIn(text) {
  return String(text || '').trim().match(/[\p{L}\p{N}'’\u2010-]+/gu)?.length || 0
}

// Pure display-text word count. Display text is exactly the witness lines and
// ending codas — design metadata (publicConsequence, recoveryBehavior,
// authoring) is excluded, matching the dialogue-word convention.
export function countAct5ChartwrightConsequenceWords(consequences = ACT5_CHARTWRIGHT_CONSEQUENCES) {
  return Object.values(consequences || {})
    .reduce((branchSum, branch) => branchSum
      + (branch?.lines || []).reduce((sum, line) => sum + wordsIn(line.text), 0)
      + Object.values(branch?.endingCodas || {}).reduce((sum, coda) => sum + wordsIn(coda.text), 0), 0)
}

// Serializable projection: a deep structural clone that survives JSON
// round-trip unchanged. Frozen source data is never mutated or exposed
// directly to consumers that may want a mutable working copy.
export function serializeAct5ChartwrightConsequences() {
  return clone(ACT5_CHARTWRIGHT_CONSEQUENCES)
}

function compareIssues(left, right) {
  return left.code.localeCompare(right.code)
    || left.path.localeCompare(right.path)
    || left.message.localeCompare(right.message)
}

// Pure structural, continuity, and content-contract validator for this
// slice. Deterministic, frozen report; registers and mutates nothing.
export function validateAct5ChartwrightConsequences() {
  const issues = []
  const push = (code, path, message) => issues.push({ code, path, message })
  const ids = Object.keys(ACT5_CHARTWRIGHT_CONSEQUENCES).sort()
  const expected = [...ACT5_CHARTWRIGHT_CONSEQUENCE_IDS].sort()
  if (ids.length !== expected.length || ids.some((id, index) => id !== expected[index])) {
    push('CONSEQUENCE_ID_SET_MISMATCH', 'ACT5_CHARTWRIGHT_CONSEQUENCES',
      `Exported ids ${ids.join(', ')} do not exactly match the slice contract ${expected.join(', ')}.`)
  }

  const primaryEndingIds = ACT5_ENDING_VARIANTS.filter((ending) => !ending.limitedFallback || ending.id !== 'renewed-compact-limited')
    .map((ending) => ending.id).sort()
  const seenTexts = new Map()
  let fallbackCount = 0
  const seenPriorities = new Set()
  for (const consequenceId of ids) {
    const branch = ACT5_CHARTWRIGHT_CONSEQUENCES[consequenceId]
    const path = `consequences.${consequenceId}`
    if (branch.id !== consequenceId) push('CONSEQUENCE_ID_MISMATCH', path, `Inner id ${String(branch.id)} differs from export key.`)
    if (!Array.isArray(branch.gate)) push('MISSING_GATE', path, 'Branch requires an explicit gate array.')
    const expectedGates = branch.fallback
      ? []
      : consequenceId.endsWith('public-ledge')
        ? [
            { kind: 'flag', flagId: ACT5_CHARTWRIGHT_SOURCE_FLAGS.model.flagId, value: 'public-ledge' },
            { kind: 'flag', flagId: ACT5_CHARTWRIGHT_SOURCE_FLAGS.firstCopy.flagId, value: 'ledge' },
          ]
        : [
            { kind: 'flag', flagId: ACT5_CHARTWRIGHT_SOURCE_FLAGS.model.flagId, value: 'stewarded-berth' },
            { kind: 'flag', flagId: ACT5_CHARTWRIGHT_SOURCE_FLAGS.firstCopy.flagId, value: 'berth' },
          ]
    if (JSON.stringify(branch.gate) !== JSON.stringify(expectedGates)) {
      push('GATE_OUT_OF_CONTRACT', `${path}.gate`, 'Branch gate must exactly match its authored Act II model and first-copy pair.')
    }
    if (branch.fallback) {
      fallbackCount += 1
      if (branch.gate.length > 0) push('FALLBACK_GATE_CONFLICT', path, 'The declared fallback must carry an empty gate.')
    }
    if (seenPriorities.has(branch.priority)) push('DUPLICATE_PRIORITY', path, `Priority ${branch.priority} repeats across branches.`)
    seenPriorities.add(branch.priority)
    if (branch.presentation?.mapId !== 'accord-overlook' || branch.presentation?.anchorConversationId !== 'act5-epilogue') {
      push('PRESENTATION_SEAM_MISMATCH', `${path}.presentation`, 'Branch must anchor at accord-overlook against the act5-epilogue conversation.')
    }
    if (!branch.publicConsequence || wordsIn(branch.publicConsequence) === 0) push('EMPTY_PUBLIC_CONSEQUENCE', path, 'Every branch must state a public consequence.')
    if (!branch.recoveryBehavior || wordsIn(branch.recoveryBehavior) === 0) push('EMPTY_RECOVERY_BEHAVIOR', path, 'Every branch must state a recovery behavior.')
    if ((branch.lines || []).length < 3) push('THIN_WITNESS_MATERIAL', path, 'Branch needs at least three authored witness lines.')
    const lineSpeakers = (branch.lines || []).map((line) => line.speakerId)
    for (const required of ['kallias', 'thessa', 'dorieus-route-clerk']) {
      if (!lineSpeakers.includes(required)) push('MISSING_WITNESS_VOICE', path, `Branch is missing the established voice ${required}.`)
    }
    const codaIds = Object.keys(branch.endingCodas || {}).sort()
    if (codaIds.join(',') !== primaryEndingIds.join(',')) {
      push('ENDING_CODA_SET_MISMATCH', `${path}.endingCodas`, `Coda keys ${codaIds.join(', ')} do not match the authored Accord endings ${primaryEndingIds.join(', ')}.`)
    }
    const display = [...(branch.lines || []), ...Object.values(branch.endingCodas || {})]
    for (const entry of display) {
      if (!entry.text || wordsIn(entry.text) === 0) push('EMPTY_DISPLAY_TEXT', path, `Display entry for ${String(entry.speakerId)} has no text.`)
      else if (seenTexts.has(entry.text)) push('DUPLICATE_DISPLAY_TEXT', path, `Display text duplicates ${seenTexts.get(entry.text)}.`)
      else seenTexts.set(entry.text, `${path}:${entry.speakerId}`)
      if (!entry.cameraCue) push('MISSING_CAMERA_CUE', path, `Display entry for ${String(entry.speakerId)} needs a camera cue.`)
    }
    for (const field of REQUIRED_AUTHORING_METADATA_FIELDS) {
      if (branch.authoring?.[field] === undefined || branch.authoring?.[field] === null || branch.authoring?.[field] === '') {
        push('MISSING_AUTHORING_FIELD', `${path}.authoring.${field}`, `Required authoring metadata is missing: ${field}.`)
      }
    }
  }
  if (fallbackCount !== 1) push('FALLBACK_NOT_EXACTLY_ONE', 'ACT5_CHARTWRIGHT_CONSEQUENCES', `Exactly one neutral fallback branch is required; found ${fallbackCount}.`)

  // Purity and non-blocking invariants for the resolver.
  for (const probe of [undefined, null, {}, 'not-an-object', () => undefined]) {
    const selected = selectAct5ChartwrightConsequence(probe)
    if (!selected || !ACT5_CHARTWRIGHT_CONSEQUENCE_IDS.includes(selected.id)) {
      push('RESOLVER_NOT_TOTAL', 'selectAct5ChartwrightConsequence', `Resolver must return a contracted branch for input ${JSON.stringify(String(probe))}.`)
      break
    }
  }
  const validPairs = [
    ['public-ledge', 'ledge'],
    ['stewarded-berth', 'berth'],
  ]
  for (const [model, firstCopy] of validPairs) {
    const selected = selectAct5ChartwrightConsequence({
      [ACT5_CHARTWRIGHT_SOURCE_FLAGS.model.flagId]: model,
      [ACT5_CHARTWRIGHT_SOURCE_FLAGS.firstCopy.flagId]: firstCopy,
    })
    if (!selected.id.endsWith(model)) push('RESOLVER_GATE_MISMATCH', 'selectAct5ChartwrightConsequence', `Act II pair ${model}/${firstCopy} must resolve to its own branch.`)
  }
  const neutralPairs = [
    ['public-ledge', undefined], ['stewarded-berth', undefined],
    ['public-ledge', 'unposted'], ['stewarded-berth', 'unposted'],
    ['public-ledge', 'berth'], ['stewarded-berth', 'ledge'],
    ['unknown', 'ledge'], [undefined, 'ledge'],
  ]
  for (const [model, firstCopy] of neutralPairs) {
    const selected = selectAct5ChartwrightConsequence({
      [ACT5_CHARTWRIGHT_SOURCE_FLAGS.model.flagId]: model,
      [ACT5_CHARTWRIGHT_SOURCE_FLAGS.firstCopy.flagId]: firstCopy,
    })
    if (!selected.fallback) push('RESOLVER_NON_EXCLUSIVE_GATE', 'selectAct5ChartwrightConsequence', `Act II pair ${String(model)}/${String(firstCopy)} must resolve to neutral fallback.`)
  }

  // Serialization invariant: the module must be JSON-safe and deep-frozen.
  try {
    const roundTrip = JSON.parse(JSON.stringify(ACT5_CHARTWRIGHT_CONSEQUENCES))
    if (JSON.stringify(roundTrip) !== JSON.stringify(ACT5_CHARTWRIGHT_CONSEQUENCES)) {
      push('SERIALIZATION_NOT_STABLE', 'ACT5_CHARTWRIGHT_CONSEQUENCES', 'JSON round-trip does not reproduce the module data.')
    }
  } catch (error) {
    push('SERIALIZATION_FAILED', 'ACT5_CHARTWRIGHT_CONSEQUENCES', `Module is not JSON-serializable: ${error.message}`)
  }
  if (!Object.isFrozen(ACT5_CHARTWRIGHT_CONSEQUENCES) || !Object.isFrozen(ACT5_CHARTWRIGHT_CONSEQUENCES[ids[0]]?.lines?.[0] || null)) {
    push('DEEP_FREEZE_INCOMPLETE', 'ACT5_CHARTWRIGHT_CONSEQUENCES', 'Exported data must be recursively frozen.')
  }

  const wordCount = countAct5ChartwrightConsequenceWords()
  if (wordCount < 600 || wordCount > 900) {
    push('DISPLAY_WORD_RANGE', 'ACT5_CHARTWRIGHT_CONSEQUENCES', `Total display words ${wordCount} falls outside the 600–900 slice budget.`)
  }

  issues.sort(compareIssues)
  return deepFreeze({ valid: issues.length === 0, wordCount, issues })
}

// ─── Integration seams (for the lead, not exercised here) ─────
// 1. Registry: gate ACT5_CHARTWRIGHT_CONSEQUENCES content behind the Act II
//    Chartwright spawn contract from act2ChartwrightContent.js; this module
//    depends on no Act II runtime entity beyond the persisted flag values.
// 2. Runtime: at accord-overlook (act5Runtime.js 'epilogue' spawn), call
//    selectAct5ChartwrightConsequence(state.flags) once, then render
//    branch.lines before ACT5_CONVERSATIONS['act5-epilogue'] and append
//    act5ChartwrightCodaFor(branch.id, state.flags['act5-accord-choice']
//    || state.flags['act5-ending']) after 'thessa-closes'. The second value is
//    the migration fallback for older saves that retained only set-ending.
// 3. Word budget: countAct5ChartwrightConsequenceWords() uses the canonical
//    wordsIn tokenizer and reconciles with the complete-game reporter after
//    integration.
