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
        next: 'demeter-ext-1',
      },
      'demeter-ext-1': {
        speakerId: 'kallias',
        text: 'Then the doors get built out of what this village already has. Your testimony stands in one. The grain waiting honestly in the ground stands in the other. No one calls waiting a harvest again while I hold the pen.',
        next: 'demeter-ext-2',
      },
      'demeter-ext-2': {
        speakerId: 'demeter',
        text: 'Nobody asked my grief what it wanted before it was made into a wall. That is the whole of it. A wall answers no one, least of all the woman it was built from. Ask now, in front of the village, and I will answer as a witness, not as a season.',
        next: 'demeter-ext-3',
      },
      'demeter-ext-3': {
        speakerId: 'kallias',
        text: 'I am asking. Not for permission to end the winter, and not for permission to keep it. For the terms under which this village may plant, hold, and let go, without any of it counted as punishment.',
        next: 'demeter-ext-4',
      },
      'demeter-ext-4': {
        speakerId: 'demeter',
        text: 'Here are terms from a mother, offered and not imposed. Let the grain wait honest in the ground. Let the ration be weighed where it is eaten. And let grief leave the room when the work is done, and come back when a true thing needs guarding. Doors that open both ways are not a compromise. They are the least a person can be given.',
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
        next: 'persephone-ext-1',
      },
      'persephone-ext-1': {
        speakerId: 'kallias',
        text: 'I carry four accounts with me. Kleio’s, yours, and two from the village: a bowl count and a frost line. Four witnesses, none of them a god, none of them agreeing. I did not choose the ones who said the same thing.',
        next: 'persephone-ext-2',
      },
      'persephone-ext-2': {
        speakerId: 'persephone',
        text: 'That is how to carry them. A chorus built to agree is the old story wearing a new voice. Let them contradict each other in front of me. I crossed because a choice can be made in pieces, badly, by a person who is not finished yet.',
        next: 'persephone-ext-3',
      },
      'persephone-ext-3': {
        speakerId: 'kallias',
        text: 'Then the halves stay apart until the village says out loud what the songs left out. No joining by decree, and no joining to close a discussion. If they come together, it will be because the room agreed on what was missing, not because the season needed an ending.',
        next: 'persephone-ext-4',
      },
      'persephone-ext-4': {
        speakerId: 'persephone',
        text: 'That is all I asked of the retelling: to be finished in public, not completed in secret. Do not hurry the room for my sake. I waited a long time in a name that was not mine. I can wait longer in my own.',
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
        next: 'myrto-ext-1',
      },
      'myrto-ext-1': {
        speakerId: 'kallias',
        text: 'Then the measure gets written the way the granary door should be written on: full, scant, or sealed. The village reads which one it is before it commits to anything. A seal that cannot be opened in daylight is not a record. It is an alibi.',
        next: 'myrto-ext-2',
      },
      'myrto-ext-2': {
        speakerId: 'villager-1',
        text: 'Scant is not a shame. We ate scant last year and were told we were full. The shame was the telling, not the eating. When the new ledger comes, send it to the houses first and the store second. The difference will show itself by supper.',
        next: 'myrto-ext-3',
      },
      'myrto-ext-3': {
        speakerId: 'kallias',
        text: 'Houses first, store second. That is already in my hand before anyone decides how to read it. No number enters the record unless a household has read it back to me out loud, in its own kitchen, with its own bowls on the table.',
        next: 'myrto-ext-4',
      },
      'myrto-ext-4': {
        speakerId: 'villager-1',
        text: 'Then count one more thing, since you are writing. The nights we heated stones to sleep through. Fuel was drawn as if the frost were normal. Nothing about it was normal, and the ledger called it weather. Weather is not a word for a decision.',
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
        next: 'phaon-ext-1',
      },
      'phaon-ext-1': {
        speakerId: 'kallias',
        text: 'Then I wake the altars in the order the paths reveal themselves, not the order the survey draws them. If this thaw was made on purpose, it will have to answer why the same line stops at your stone every dawn.',
        next: 'phaon-ext-2',
      },
      'phaon-ext-2': {
        speakerId: 'villager-2',
        text: 'The trees are patient. Their rings hold both colds: the one that ended and the one that was kept. Read an altar slow. A winter that passed and a winter that was held leave different marks in the same wood.',
        next: 'phaon-ext-3',
      },
      'phaon-ext-3': {
        speakerId: 'kallias',
        text: 'I read them the way an orchard is read. Cut where the bark is honest, note the color under it. If someone drew this winter like a fence, the wood will show the year the fence was drawn.',
        next: 'phaon-ext-4',
      },
      'phaon-ext-4': {
        speakerId: 'villager-2',
        text: 'That year will not match anyone’s calendar, and it never does. Come out before dawn and bring the measure you trust. I will show you where the frost starts and where it is started.',
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
        next: 'kleio-ext-1',
      },
      'kleio-ext-1': {
        speakerId: 'kleio',
        text: 'Carry them with us, then, and carry this. A witness is kept because someone decided to be kept with. I gave twenty years of nights to doorways: births, deaths, and the rare kind where a person leaves willingly and is not believed. The village thanked me by forgetting where I lived.',
        next: 'kleio-ext-2',
      },
      'kleio-ext-2': {
        speakerId: 'kallias',
        text: 'Name what the forgetting cost you. Not for the record. Because a record that keeps testimony and discards the witness is the same trick the granary played on Myrto, and I have learned to read it.',
        next: 'kleio-ext-3',
      },
      'kleio-ext-3': {
        speakerId: 'kleio',
        text: 'It cost me the right to be partial. I sat with Demeter in her refusal and stood with Hades when he kept what I gave him, in the same hard season, and I said the same thing to both: ask the person who is crossing. Nobody asked me anything for the rest of that winter.',
        next: 'kleio-ext-4',
      },
      'kleio-ext-4': {
        speakerId: 'kallias',
        text: 'Then the village will ask you things, starting with whether you will speak at all. I will not hang a ceremony on you that you did not choose. You named the hinge. Let it be a door for you too, and let it have a latch on your side.',
        next: null,
      },
    },
  },
})

export function act3ConversationById(id) {
  return (typeof id === 'string' && ACT3_CONVERSATIONS[id]) || null
}
