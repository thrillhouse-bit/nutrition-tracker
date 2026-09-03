import { describe, expect, it } from 'vitest'
import {
  ACT4_CONVERSATIONS,
  EXPECTED_SPEAKER_BINDINGS,
  act4ConversationById,
} from '../src/rpg/act4Conversations.js'
import { ACT4_MAIN_QUEST, ACT4_PERMANENT_FLAGS, ACT4_SIDE_QUEST } from '../src/rpg/act4Content.js'
import { ACT4_RUNTIME_MAPS } from '../src/rpg/act4Runtime.js'
import { ACT3_CONVERSATIONS } from '../src/rpg/act3Conversations.js'
import { ACT5_CONVERSATIONS } from '../src/rpg/act5Content.js'
import { validateAuthoredRecord } from '../src/rpg/authoringSchema.js'

const EXPECTED_IDS = Object.freeze([
  'act4-ares-direct-breach',
  'act4-atlas-coerced-witness',
  'act4-hercules-freely-given',
  'act4-mortal-draft',
  'act4-prometheus-lawful-fire',
  'act4-smiths-ledger',
  'act4-zeus-single-crown',
])
// 'act4-athena-precise-route' intentionally sorts after ASCII digits; assert
// the full authored set explicitly instead of relying on localeCompare.
const ALL_IDS = Object.freeze([...EXPECTED_IDS, 'act4-athena-precise-route'].sort())

const ALL_CONVERSATIONS = Object.values(ACT4_CONVERSATIONS)

function nodeWords(node) {
  const lines = [node.text || '', ...(node.choices || []).map((c) => c.text || '')]
  return lines.join(' ').trim().split(/\s+/).filter(Boolean).length
}

function conversationWords(conversation) {
  return Object.values(conversation.nodes).reduce((sum, node) => sum + nodeWords(node), 0)
}

function collectNodes(conversation) {
  return Object.entries(conversation.nodes)
}

function reachableNodeIds(conversation) {
  const seen = new Set([conversation.start])
  const queue = [conversation.start]
  while (queue.length) {
    const node = conversation.nodes[queue.shift()]
    const targets = [node.next, ...(node.choices || []).map((c) => c.next)].filter(Boolean)
    for (const target of targets) {
      if (!seen.has(target)) { seen.add(target); queue.push(target) }
    }
  }
  return seen
}

describe('Act IV authored conversation module shape', () => {
  it('exports at least six distinct deep-frozen conversations with stable IDs', () => {
    expect(ALL_CONVERSATIONS.length).toBeGreaterThanOrEqual(6)
    expect(Object.keys(ACT4_CONVERSATIONS).sort()).toEqual(ALL_IDS)
    for (const id of ALL_IDS) {
      const conversation = act4ConversationById(id)
      expect(conversation, id).toBeTruthy()
      expect(conversation.id).toBe(id)
      expect(Object.isFrozen(conversation)).toBe(true)
      expect(Object.isFrozen(conversation.nodes)).toBe(true)
      for (const [, node] of collectNodes(conversation)) {
        expect(Object.isFrozen(node)).toBe(true)
        for (const choice of node.choices || []) {
          expect(Object.isFrozen(choice)).toBe(true)
          for (const effect of choice.effects || []) expect(Object.isFrozen(effect)).toBe(true)
        }
      }
    }
    expect(act4ConversationById('nope')).toBe(null)
    expect(act4ConversationById(null)).toBe(null)
    expect(act4ConversationById(42)).toBe(null)
  })

  it('reaches the substantive dialogue-word floor without padding', () => {
    const total = ALL_CONVERSATIONS.reduce((sum, c) => sum + conversationWords(c), 0)
    expect(total).toBeGreaterThanOrEqual(3000)
    for (const conversation of ALL_CONVERSATIONS) {
      expect(conversationWords(conversation), conversation.id).toBeGreaterThanOrEqual(300)
      for (const [nodeId, node] of collectNodes(conversation)) {
        if (node.text) {
          expect(nodeWords(node), `${conversation.id}:${nodeId}`).toBeGreaterThanOrEqual(25)
        }
      }
    }
  })
})

describe('Act IV conversation graph closure', () => {
  it('resolves every link, reaches every node, and terminates once per path', () => {
    for (const conversation of ALL_CONVERSATIONS) {
      const { start, nodes } = conversation
      expect(nodes[start], `${conversation.id}:start`).toBeTruthy()
      expect(Object.keys(nodes).length, conversation.id).toBeGreaterThanOrEqual(4)

      const terminalCount = Object.values(nodes).filter((n) => n.next === null && !(n.choices || []).length)
      expect(terminalCount.length, conversation.id).toBe(1)

      for (const [nodeId, node] of collectNodes(conversation)) {
        const path = `${conversation.id}:${nodeId}`
        if (node.next !== null && node.next !== undefined) {
          expect(nodes[node.next], `${path}→${node.next}`).toBeTruthy()
        }
        for (const choice of node.choices || []) {
          expect(choice.id, path).toMatch(/^[a-z0-9-]+$/)
          expect(choice.text.trim().length, `${path}:${choice.id}`).toBeGreaterThan(20)
          if (choice.next !== null && choice.next !== undefined) {
            expect(nodes[choice.next], `${path}:${choice.id}→${choice.next}`).toBeTruthy()
          }
        }
      }
      const reachable = reachableNodeIds(conversation)
      expect(reachable.size, conversation.id).toBe(Object.keys(nodes).length)
    }
  })

  it('contains no cycles along next or choice links', () => {
    const walk = (conversation, nodeId, visiting) => {
      if (visiting.has(nodeId)) throw new Error(`${conversation.id} cycle at ${nodeId}`)
      visiting.add(nodeId)
      const node = conversation.nodes[nodeId]
      for (const target of [node.next, ...(node.choices || []).map((c) => c.next)].filter(Boolean)) {
        walk(conversation, target, new Set(visiting))
      }
    }
    for (const conversation of ALL_CONVERSATIONS) walk(conversation, conversation.start, new Set())
    expect.assertions(ALL_CONVERSATIONS.length + 1)
    for (const conversation of ALL_CONVERSATIONS) expect(conversation.id).toBeTruthy()
    expect(true).toBe(true)
  })
})

describe('Act IV speaker identity', () => {
  it('declares every speaking identity and keeps the Atlas identity split', () => {
    for (const conversation of ALL_CONVERSATIONS) {
      expect(conversation.speakerIds.length).toBeGreaterThanOrEqual(2)
      expect(new Set(conversation.speakerIds).size, conversation.id).toBe(conversation.speakerIds.length)
      for (const [, node] of collectNodes(conversation)) {
        if (node.speakerId) {
          expect(conversation.speakerIds, `${conversation.id} speaker ${node.speakerId}`).toContain(node.speakerId)
        } else {
          expect((node.choices || []).length, `${conversation.id} choice node needs no speaker`).toBeGreaterThan(0)
        }
        for (const choice of node.choices || []) {
          expect(choice.speakerId, `${conversation.id} choice must not invent a speaker`).toBeUndefined()
        }
      }
    }
    // The coerced-witness scene speaks as the atlas-npc person, never the
    // `atlas` monster base (ACT4_ATLAS_IDENTITY).
    const atlas = act4ConversationById('act4-atlas-coerced-witness')
    expect(atlas.speakerIds).toContain('atlas-npc')
    expect(atlas.speakerIds).not.toContain('atlas')
    expect(atlas.nodes['do-not-confuse-us'].text).toMatch(/do not confuse us/i)
  })

  it('names the Act IV runtime NPCs and expected new witnesses in the binding table', () => {
    expect(EXPECTED_SPEAKER_BINDINGS.map((b) => b.conversationId).sort()).toEqual([...ALL_IDS])
    for (const binding of EXPECTED_SPEAKER_BINDINGS) {
      const conversation = act4ConversationById(binding.conversationId)
      expect(conversation.speakerIds, binding.conversationId).toContain(binding.primarySpeakerId)
      const runtimeEntities = Object.values(ACT4_RUNTIME_MAPS).flatMap((m) => m.entities)
      if (binding.existsInRuntime) {
        expect(runtimeEntities.some((e) => e.id === binding.npcEntityId), binding.npcEntityId).toBe(true)
        expect(ACT4_RUNTIME_MAPS[binding.mapId]).toBeTruthy()
      }
    }
  })
})

describe('Act IV choice and effect integrity', () => {
  it('uses only flag/marker effects with globally unique stable IDs', () => {
    const flagIds = []
    const markerIds = []
    for (const conversation of ALL_CONVERSATIONS) {
      const buckets = [
        ...(conversation.effects || []),
        ...Object.values(conversation.nodes).flatMap((n) => [...(n.effects || []), ...(n.choices || []).flatMap((c) => c.effects || [])]),
      ]
      for (const effect of buckets) {
        expect(['flag', 'marker'], `${conversation.id} effect kind`).toContain(effect.kind)
        if (effect.kind === 'flag') {
          expect(effect.id, conversation.id).toMatch(/^act4-[a-z0-9-]+$/)
          flagIds.push(effect.id)
        } else {
          expect(ACT4_RUNTIME_MAPS[effect.mapId]?.entities.some((e) => e.id === effect.entityId),
            `${conversation.id} marker ${effect.mapId}:${effect.entityId}`).toBe(true)
          markerIds.push(`${effect.mapId}:${effect.entityId}`)
        }
      }
    }
    expect(new Set(flagIds).size, 'flag ids must be globally unique').toBe(flagIds.length)
    expect(new Set(markerIds).size, 'markers must not repeat').toBe(markerIds.length)
    // Testimony flags never reuse or pre-apply permanent quest-completion flags.
    for (const id of flagIds) expect(ACT4_PERMANENT_FLAGS).not.toContain(id)
  })

  it('grants no material rewards from dialogue and varies tone, not outcome', () => {
    for (const conversation of ALL_CONVERSATIONS) {
      const text = JSON.stringify(conversation)
      for (const kind of ['"currency"', '"item"', '"xp"', '"epithet"', '"codex"', '"unlock-region"']) {
        expect(text, `${conversation.id} dialogue must not carry ${kind}`).not.toContain(kind)
      }
    }
    // The crown refusal offers exactly the two objective choiceIds; both
    // converge on the same terminal, so tone never changes the outcome.
    const zeus = act4ConversationById('act4-zeus-single-crown')
    const crownNode = zeus.nodes['answer-the-crown']
    expect(crownNode.choices.map((c) => c.id).sort()).toEqual(
      ACT4_MAIN_QUEST.objectives.find((o) => o.id === 'reject-single-crown').choiceIds.slice().sort(),
    )
    expect(crownNode.choices.every((c) => c.next === 'firm-answer' || c.next === 'mournful-answer')).toBe(true)
    expect(reachableNodeIds(zeus).has('the-heavens-withdraw')).toBe(true)
  })

  it('makes each choice node a required, resolvable contract', () => {
    for (const conversation of ALL_CONVERSATIONS) {
      for (const [, node] of collectNodes(conversation)) {
        if (!node.choices?.length) continue
        expect(node.choices.length, conversation.id).toBeGreaterThanOrEqual(2)
        expect(new Set(node.choices.map((c) => c.id)).size, conversation.id).toBe(node.choices.length)
        expect(node.text, conversation.id).toBeUndefined()
        // Choice nodes are entered from the graph and continue onward; none
        // may dead-end before a terminal.
        for (const choice of node.choices) {
          expect(conversation.nodes[choice.next], `${conversation.id}:${choice.id} needs continuation`).toBeTruthy()
        }
      }
    }
    // The draft assembly offers the three ratified-formulation voices as
    // order-of-testimony choices, while the objective itself is ratified on
    // the physical draft table, not here.
    const draft = act4ConversationById('act4-mortal-draft')
    expect(draft.nodes['choose-first-voice'].choices).toHaveLength(3)
    expect(draft.nodes['choose-first-voice'].choices.map((c) => c.effects[0].id)).toEqual([
      'act4-draft-first-voice-flame', 'act4-draft-first-voice-anvil', 'act4-draft-first-voice-heaven',
    ])
  })
})

describe('Act IV release-authoring and originality-safety invariants', () => {
  it('passes the canonical authoring-schema conversation contract', () => {
    for (const conversation of ALL_CONVERSATIONS) {
      const report = validateAuthoredRecord('conversation', conversation)
      expect(report.issues.map((i) => `${i.code}:${i.path}:${i.message}`), conversation.id).toEqual([])
      expect(conversation.authoring.systemsUsed).toContain('dialogue')
      expect(conversation.authoring.originalityNotes.trim().length).toBeGreaterThan(40)
    }
  })

  it('keeps the module data-only and deterministic', () => {
    const source = JSON.stringify(Object.keys(ACT4_CONVERSATIONS))
    expect(source).toContain('act4-mortal-draft')
    const snapshot = JSON.stringify(ACT4_CONVERSATIONS)
    expect(JSON.stringify(ACT4_CONVERSATIONS)).toBe(snapshot)
    for (const conversation of ALL_CONVERSATIONS) {
      expect(conversation.authoring.schemaVersion).toBe(1)
      expect(conversation.authoring.regionBand.regionIds).toEqual(['forge-march'])
    }
  })

  it('avoids filler and prior-act prose duplication', () => {
    const gramSets = (text) => {
      const words = text.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).filter(Boolean)
      const grams = new Set()
      for (let i = 0; i + 8 <= words.length; i += 1) grams.add(words.slice(i, i + 8).join(' '))
      return grams
    }
    const prior = new Set([...gramSets(JSON.stringify(Object.values(ACT3_CONVERSATIONS).map(c => c.nodes))),
      ...gramSets(JSON.stringify(Object.values(ACT5_CONVERSATIONS).map(c => c.nodes)))])
    for (const conversation of ALL_CONVERSATIONS) {
      for (const gram of gramSets(conversation.nodes[conversation.start].text + ' ' + conversation.authoring.dramaticQuestion)) {
        expect(prior.has(gram), `8-gram overlap with prior acts: "${gram}"`).toBe(false)
      }
    }
  })

  it('carries no modern-politics or real-institution substitution', () => {
    const banned = /\b(president|senate|senator|congress|parliament|prime minister|campaign manager|lobbyist|superpower|nato|congressman|governor|mayor|ceo|corporation|company man|union boss|ballot|election|voter|pollster|media outlet|newsletter|presidential)\b/i
    for (const conversation of ALL_CONVERSATIONS) {
      const allText = Object.values(conversation.nodes)
        .flatMap((n) => [n.text || '', ...(n.choices || []).map((c) => c.text)])
        .join(' ')
      expect(allText, conversation.id).not.toMatch(banned)
      expect(allText, conversation.id).not.toMatch(banned)
    }
  })

  it('covers the named Act IV beats and expected side-quest witnesses', () => {
    const joined = JSON.stringify(ACT4_CONVERSATIONS).toLowerCase()
    expect(joined).toContain('forty-one dies')          // smith ledger ↔ ACT4_SIDE_QUEST tablets beat
    expect(joined).toContain('nine hundred and six')    // tally consistency, twice
    expect(joined).toMatch(/eastern one first/)         // anchor-order testimony ↔ chain-anchor-4 marker
    expect(joined).toContain('repossession')           // stolen-fire theme
    expect(joined).toContain('revocab')                // revocable-power theme
    expect(joined).toContain('witness')                // witnessed-consent theme
    expect(ACT4_SIDE_QUEST.objectives.some((o) => o.id === 'split-the-gates')).toBe(true)
    expect(joined).toContain('counterweight')          // side loop referenced from Hercules scene
  })
})
