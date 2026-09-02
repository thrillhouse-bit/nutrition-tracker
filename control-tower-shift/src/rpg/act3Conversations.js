// Act III conversation graphs — Fields of Kore: The Withered Year.
//
// These scenes replace the original TALK fallback with authored testimony.
// They are data-only, deterministic, and deliberately keep quest progression
// in the shared reducer: dialogue effects record witnessed context, never move
// objective indices or grant repeatable rewards.

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value)) deepFreeze(nested)
  return value
}

export const ACT3_CONVERSATIONS = deepFreeze({
  'act3-demeter-stilled-year': {
    id: 'act3-demeter-stilled-year',
    speakerIds: ['demeter', 'kallias'],
    start: 'granary-silence',
    nodes: {
      'granary-silence': {
        speakerId: 'demeter',
        text: 'The grain has not died. That would be honest. It waits beneath the frost while the village is ordered to call waiting a harvest.',
        next: 'calendar-cut',
      },
      'calendar-cut': {
        speakerId: 'kallias',
        text: 'Someone changed the name of the season, then built every ration and promise around the lie.',
        next: 'grief-with-doors',
      },
      'grief-with-doors': {
        speakerId: 'demeter',
        text: 'The Loom found my grief and made a prison from it. I will not deny the grief. I ask you to give it doors: one for return, and one for a departure freely chosen.',
        effects: [{ kind: 'flag', id: 'act3-testimony-demeter-heard', value: true }],
        next: null,
      },
    },
  },
  'act3-persephone-stilled-year': {
    id: 'act3-persephone-stilled-year',
    speakerIds: ['persephone', 'kallias'],
    start: 'two-thrones',
    nodes: {
      'two-thrones': {
        speakerId: 'persephone',
        text: 'They tell the story as though two realms pulled until I tore. It is a useful story for anyone who prefers possession to consent.',
        next: 'chosen-crossing',
      },
      'chosen-crossing': {
        speakerId: 'kallias',
        text: 'Then the covenant must protect the crossing itself, not decide forever where you belong.',
        next: 'return-is-a-verb',
      },
      'return-is-a-verb': {
        speakerId: 'persephone',
        text: 'Yes. Return is a verb, not a chain. Find the two halves of the promise, but join them only after a mortal witness names what the old songs leave out.',
        effects: [{ kind: 'flag', id: 'act3-testimony-persephone-heard', value: true }],
        next: null,
      },
    },
  },
  'act3-myrto-stilled-year': {
    id: 'act3-myrto-stilled-year',
    speakerIds: ['villager-1', 'kallias'],
    start: 'sealed-granary',
    nodes: {
      'sealed-granary': {
        speakerId: 'villager-1',
        text: 'I am Myrto. The granary seal says our measure is full. Listen to it: no grain shifts when the wind strikes the door.',
        next: 'winter-ledger',
      },
      'winter-ledger': {
        speakerId: 'kallias',
        text: 'The record protects its own number while the people it was meant to protect go hungry.',
        next: 'count-the-empty-bowls',
      },
      'count-the-empty-bowls': {
        speakerId: 'villager-1',
        text: 'When you write the new measure, count the empty bowls as evidence. A promise that records only abundance has already chosen whom to forget.',
        effects: [{ kind: 'flag', id: 'act3-testimony-myrto-heard', value: true }],
        next: null,
      },
    },
  },
  'act3-phaon-stilled-year': {
    id: 'act3-phaon-stilled-year',
    speakerIds: ['villager-2', 'kallias'],
    start: 'frost-line',
    nodes: {
      'frost-line': {
        speakerId: 'villager-2',
        text: 'Phaon, orchard tender. Every dawn the frost stops at the same stone, even when the sun warms both sides. Weather does not respect survey pegs.',
        next: 'authored-boundary',
      },
      'authored-boundary': {
        speakerId: 'kallias',
        text: 'So this winter is being maintained like a border. The altars may show us who is allowed to cross it.',
        next: 'trees-remember',
      },
      'trees-remember': {
        speakerId: 'villager-2',
        text: 'The trees remember both seasons. Wake each altar and watch which paths answer. Do not trust a thaw that asks the roots to forget the cold.',
        effects: [
          { kind: 'flag', id: 'act3-testimony-phaon-heard', value: true },
          { kind: 'marker', mapId: 'winter-orchard', entityId: 'harvest-altar' },
        ],
        next: null,
      },
    },
  },
  'act3-kleio-testimony': {
    id: 'act3-kleio-testimony',
    speakerIds: ['kleio', 'kallias'],
    start: 'midwife-at-the-gate',
    nodes: {
      'midwife-at-the-gate': {
        speakerId: 'kleio',
        text: 'You expected a queen or judge. I was a midwife. My work was to witness a crossing no decree could complete for the person making it.',
        next: 'missing-line',
      },
      'missing-line': {
        speakerId: 'kallias',
        text: 'The covenant names descent and return, but not the mortal who heard whether either journey was freely chosen.',
        next: 'kept-testimony',
      },
      'kept-testimony': {
        speakerId: 'kleio',
        text: 'Persephone asked that departure remain possible and return remain welcome. Hades kept my testimony because love without a lawful door becomes custody.',
        next: 'join-after-witness',
      },
      'join-after-witness': {
        speakerId: 'kallias',
        text: 'Then your account is the hinge between the two halves. We join them in the village only after your words travel with us.',
        effects: [
          { kind: 'flag', id: 'act3-kleio-witness-identified', value: true },
          { kind: 'marker', mapId: 'wheat-village', entityId: 'return-covenant-table' },
        ],
        next: null,
      },
    },
  },
})

export function act3ConversationById(id) {
  return (typeof id === 'string' && ACT3_CONVERSATIONS[id]) || null
}
