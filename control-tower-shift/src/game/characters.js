// The pantheon of OmniFuel — domain gods, heroic figures, and titans.
// Players choose a deity from Tier 1 at the start, and unlock higher tiers
// as they prove their mastery. Each god grants a signature ability and
// faces monster waves drawn from the opposing pantheon.
//
// Glyphs are simplified canvas adaptations of the SVG art in
// sitrep/olympus2/src/Art.jsx, extended for the additional deities.
// Token usage tracked in PROGRESS.md.

// ── TIER STRUCTURE ─────────────────────────────────────────────
// Tier 1: Starting roster — the player's first deity choice
// Tier 2: Unlocked after surviving all 10 waves with any Tier 1 god
// Tier 3: Unlocked after completing Tier 2 — the Titans

export const GODS_TIER_1 = [
  {
    key: 'hermes',
    name: 'Hermes',
    domain: 'Speed',
    attribute: 'winged sandal',
    color: '#1f35c9',
    glyph: 'winged-sandal',
  },
  {
    key: 'athena',
    name: 'Athena',
    domain: 'Wisdom',
    attribute: 'owl on aegis',
    color: '#1f35c9',
    glyph: 'owl-aegis',
  },
  {
    key: 'ares',
    name: 'Ares',
    domain: 'War',
    attribute: 'Corinthian helmet',
    color: '#1f35c9',
    glyph: 'helmet',
  },
  {
    key: 'apollo',
    name: 'Apollo',
    domain: 'Light',
    attribute: 'laurel lyre',
    color: '#1f35c9',
    glyph: 'lyre',
  },
  {
    key: 'artemis',
    name: 'Artemis',
    domain: 'Hunt',
    attribute: 'silver bow',
    color: '#1f35c9',
    glyph: 'bow',
  },
  {
    key: 'aphrodite',
    name: 'Aphrodite',
    domain: 'Love',
    attribute: 'dove and rose',
    color: '#1f35c9',
    glyph: 'dove-rose',
  },
  {
    key: 'hercules',
    name: 'Hercules',
    domain: 'Strength',
    attribute: 'club and lion pelt',
    color: '#1f35c9',
    glyph: 'club',
  },
];

export const GODS_TIER_2 = [
  {
    key: 'zeus',
    name: 'Zeus',
    domain: 'Sky',
    attribute: 'lightning bolt',
    color: '#1f35c9',
    glyph: 'lightning',
    unlock: 'Survive all 10 waves with any Tier 1 god',
  },
  {
    key: 'hera',
    name: 'Hera',
    domain: 'Queenship',
    attribute: 'royal scepter',
    color: '#1f35c9',
    glyph: 'scepter',
    unlock: 'Survive all 10 waves with any Tier 1 god',
  },
  {
    key: 'poseidon',
    name: 'Poseidon',
    domain: 'Sea',
    attribute: 'trident',
    color: '#1f35c9',
    glyph: 'trident',
    unlock: 'Survive all 10 waves with any Tier 1 god',
  },
  {
    key: 'hades',
    name: 'Hades',
    domain: 'Underworld',
    attribute: 'chained key',
    color: '#1f35c9',
    glyph: 'chained-key',
    unlock: 'Survive all 10 waves with any Tier 1 god',
  },
  {
    key: 'persephone',
    name: 'Persephone',
    domain: 'Seasons',
    attribute: 'pomegranate crown',
    color: '#1f35c9',
    glyph: 'pomegranate',
    unlock: 'Survive all 10 waves with any Tier 1 god',
  },
  {
    key: 'dionysus',
    name: 'Dionysus',
    domain: 'Wine',
    attribute: 'ivy-wreathed thyrsus',
    color: '#1f35c9',
    glyph: 'thyrsus',
    unlock: 'Survive all 10 waves with any Tier 1 god',
  },
  {
    key: 'demeter',
    name: 'Demeter',
    domain: 'Harvest',
    attribute: 'wheat sheaf',
    color: '#1f35c9',
    glyph: 'wheat',
    unlock: 'Survive all 10 waves with any Tier 1 god',
  },
];

export const GODS_TIER_3 = [
  {
    key: 'cronus',
    name: 'Cronus',
    domain: 'Time',
    attribute: 'harvesting scythe',
    color: '#8e3044',
    glyph: 'scythe',
    unlock: 'Survive all 10 waves with any Tier 2 god',
  },
  {
    key: 'helios',
    name: 'Helios',
    domain: 'Sun',
    attribute: 'solar chariot',
    color: '#8e3044',
    glyph: 'sun-chariot',
    unlock: 'Survive all 10 waves with any Tier 2 god',
  },
  {
    key: 'selene',
    name: 'Selene',
    domain: 'Moon',
    attribute: 'crescent moon and torch',
    color: '#8e3044',
    glyph: 'crescent',
    unlock: 'Survive all 10 waves with any Tier 2 god',
  },
  {
    key: 'prometheus',
    name: 'Prometheus',
    domain: 'Fire',
    attribute: 'fire-tongs and torch',
    color: '#8e3044',
    glyph: 'flame',
    unlock: 'Survive all 10 waves with any Tier 2 god',
  },
  {
    key: 'nyx',
    name: 'Nyx',
    domain: 'Night',
    attribute: 'starry veil',
    color: '#8e3044',
    glyph: 'star-veil',
    unlock: 'Survive all 10 waves with any Tier 2 god',
  },
  {
    key: 'eros',
    name: 'Eros',
    domain: 'Desire',
    attribute: 'winged arrow',
    color: '#8e3044',
    glyph: 'arrow-heart',
    unlock: 'Survive all 10 waves with any Tier 2 god',
  },
  {
    key: 'atlas',
    name: 'Atlas',
    domain: 'Endurance',
    attribute: 'celestial sphere',
    color: '#8e3044',
    glyph: 'atlas-sphere',
    unlock: 'Survive all 10 waves with any Tier 2 god',
  },
  {
    key: 'oceanus',
    name: 'Oceanus',
    domain: 'Waters',
    attribute: 'river encircling the world',
    color: '#8e3044',
    glyph: 'river-circle',
    unlock: 'Survive all 10 waves with any Tier 2 god',
  },
];

// Complete roster
export const ALL_GODS = [...GODS_TIER_1, ...GODS_TIER_2, ...GODS_TIER_3];
export const GODS_BY_TIER = { 1: GODS_TIER_1, 2: GODS_TIER_2, 3: GODS_TIER_3 };

// Starting deities (Tier 1)
export const GODS = GODS_TIER_1;

// Monster types: threats in the game are manifestations of the opposing
// pantheon and infrastructure entities.
export const MONSTER_TYPES = {
  hydra: {
    name: 'Hydra', glyph: 'hydra', size: 12, behavior: 'swarm', tier: 1,
    description: 'Multiple heads — spawns in clusters.',
  },
  cerberus: {
    name: 'Cerberus', glyph: 'cerberus', size: 16, behavior: 'tank', tier: 1,
    description: 'Three-headed guardian — slow but durable.',
  },
  chronos: {
    name: 'Chronos', glyph: 'chronos', size: 10, behavior: 'fast', tier: 1,
    description: 'Time-wraith — approaches quickly.',
  },
  // Renamed from the old `apollo` monster key: that key collided with the god
  // Apollo. Story content (the RPG) must never treat the monster table's
  // `apollo` as the god Apollo, so the monster now lives under `apolloWeaver`
  // and the deprecated alias below resolves any legacy reference to it.
  apolloWeaver: {
    name: 'Weaver', glyph: 'lyre', size: 11, behavior: 'erratic', tier: 1,
    description: 'Senses-guided — weaves unpredictably.',
  },
  sphinx: {
    name: 'Sphinx', glyph: 'sphinx', size: 13, behavior: 'puzzle', tier: 2,
    description: 'Must be defeated within a time limit.',
  },
  minotaur: {
    name: 'Minotaur', glyph: 'minotaur', size: 15, behavior: 'charge', tier: 2,
    description: 'Charges directly — fast and focused.',
  },
  medusa: {
    name: 'Medusa', glyph: 'medusa', size: 12, behavior: 'petrify', tier: 2,
    description: 'Slows nearby threats.',
  },
  atlas: {
    name: 'Atlas', glyph: 'atlas-sphere', size: 20, behavior: 'boss', tier: 3,
    description: 'The World-Bearer — extremely slow but massive.',
  },
};

// Deprecated monster keys → current keys. The old `apollo` monster key
// collided with the god Apollo, so any legacy reference resolves to the renamed
// monster. Never resolve a god key through here; story content treats the
// string `apollo` as the god only.
export const MONSTER_DEPRECATED = { apollo: 'apolloWeaver' };

// Resolve a monster type key, honoring deprecated aliases, with a safe fallback.
export function resolveMonsterType(key) {
  const k = MONSTER_DEPRECATED[key] || key
  return MONSTER_TYPES[k] || MONSTER_TYPES.hydra
}

// Map ability name → glyph label used for the ability button.
// Each ability is associated with the deity whose domain it represents.
export const ABILITY_GLYPHS = {
  shield: 'owl-aegis',
  pulseClear: 'helmet',
  speedBurst: 'winged-sandal',
  scoreMultiplier: 'lyre',
  repair: 'trident',
  precisionStrike: 'bow',
  charm: 'dove-rose',
  godStrength: 'club',
  lightning: 'lightning',
  queenlyGrace: 'scepter',
  earthshaker: 'trident',
  underworldGate: 'chained-key',
  seasonalShift: 'pomegranate',
  intoxication: 'thyrsus',
  harvestMoon: 'wheat',
  temporalRewind: 'scythe',
  sunChariot: 'sun-chariot',
  lunarVeil: 'crescent',
  fireBrand: 'flame',
  primordialDark: 'star-veil',
  loveArrow: 'arrow-heart',
  worldBearer: 'atlas-sphere',
  worldRiver: 'river-circle',
};

// Canvas drawing helpers
function centeredGlyph(ctx, x, y, size, fn) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 64, size / 64);
  fn();
  ctx.restore();
}

// Draw a glyph at a position on the canvas.
export function drawGlyph(ctx, glyph, x, y, size) {
  const fn = GLYPH_DRAWERS[glyph];
  if (fn) fn(ctx, x, y, size);
}

// All glyph drawing functions for canvas (adapted from Art.jsx SVG paths).
const GLYPH_DRAWERS = {
  // --- Domain god glyphs ---

  'winged-sandal': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    // foot
    ctx.beginPath(); ctx.ellipse(0, -6, 14, 12, 0, 0, Math.PI * 2); ctx.stroke();
    // wing (swept back)
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.bezierCurveTo(-14, -10, -22, 2, -16, 18);
    ctx.bezierCurveTo(-8, 14, 4, 10, 8, 6);
    ctx.stroke();
    // speed lines
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-20 - i * 6, -2 - i);
      ctx.lineTo(-40 - i * 6, -2 - i);
      ctx.stroke();
    }
  }),

  'owl-aegis': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2;
    // aegis rim
    ctx.beginPath(); ctx.arc(0, 0, 23, 0, Math.PI * 2); ctx.stroke();
    // owl face
    ctx.beginPath(); ctx.arc(0, -2, 16, 0, Math.PI * 2); ctx.stroke();
    // eyes
    ctx.beginPath();
    ctx.arc(-6, -4, 4, 0, Math.PI * 2);
    ctx.arc(6, -4, 4, 0, Math.PI * 2);
    ctx.stroke();
    // beak
    ctx.beginPath();
    ctx.moveTo(-3, 6); ctx.lineTo(3, 6); ctx.lineTo(0, 10); ctx.closePath();
    ctx.stroke();
    // ear tufts
    ctx.beginPath();
    ctx.moveTo(-16, -16); ctx.lineTo(-22, -28);
    ctx.moveTo(16, -16); ctx.lineTo(22, -28);
    ctx.stroke();
  }),

  'helmet': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2.4;
    // crest
    ctx.beginPath(); ctx.ellipse(0, -12, 10, 4, 0, 0, Math.PI * 2); ctx.stroke();
    // helmet bowl
    ctx.beginPath();
    ctx.moveTo(-18, -2);
    ctx.bezierCurveTo(-20, 10, -18, 22, 0, 28);
    ctx.bezierCurveTo(18, 22, 20, 10, 18, -2);
    ctx.closePath(); ctx.stroke();
    // eye opening
    ctx.beginPath(); ctx.ellipse(0, 6, 5, 4, 0, 0, Math.PI * 2); ctx.stroke();
    // nasal bar
    ctx.fillStyle = 'currentColor';
    ctx.fillRect(-1.5, -2, 3, 14);
  }),

  'lyre': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    // crossbar
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.stroke();
    // strings
    ctx.lineWidth = 1.5;
    for (let i of [-10, -5, 0, 5, 10]) {
      ctx.beginPath(); ctx.moveTo(i, -14); ctx.lineTo(i, 10); ctx.stroke();
    }
    // laurel wreath
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -16, 14, 0, Math.PI, true); ctx.stroke();
  }),

  'bow': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    // bow arc
    ctx.beginPath();
    ctx.arc(0, 0, 14, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 14, Math.PI * 1.2, Math.PI * 1.8, true);
    ctx.stroke();
    // arrow
    ctx.beginPath();
    ctx.moveTo(-4, -8); ctx.lineTo(18, 8);
    ctx.stroke();
    // arrowhead
    ctx.fillStyle = 'currentColor';
    ctx.beginPath();
    ctx.moveTo(18, 8); ctx.lineTo(14, 6); ctx.lineTo(14, 10); ctx.closePath();
    ctx.fill();
  }),

  'dove-rose': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2;
    // dove body
    ctx.beginPath();
    ctx.ellipse(0, 4, 10, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    // wings
    ctx.beginPath();
    ctx.ellipse(-12, 4, 8, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(12, 4, 8, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    // rose stem
    ctx.beginPath();
    ctx.moveTo(0, 14); ctx.lineTo(0, 22);
    ctx.stroke();
    // rose bloom
    ctx.beginPath();
    ctx.arc(0, 24, 4, 0, Math.PI * 2);
    ctx.stroke();
  }),

  'club': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 3;
    ctx.fillStyle = 'currentColor';
    // club head
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.bezierCurveTo(-8, -16, -14, -4, -4, 4);
    ctx.bezierCurveTo(-12, 6, -6, 14, 0, 8);
    ctx.bezierCurveTo(6, 14, 12, 6, 4, 4);
    ctx.bezierCurveTo(14, -4, 7, -16, 0, -20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // handle
    ctx.beginPath();
    ctx.moveTo(0, 8); ctx.lineTo(0, 24);
    ctx.stroke();
  }),

  'lightning': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 3.5;
    ctx.fillStyle = 'currentColor';
    ctx.beginPath();
    ctx.moveTo(-6, -24);
    ctx.lineTo(2, -6);
    ctx.lineTo(-4, -4);
    ctx.lineTo(6, 14);
    ctx.lineTo(-2, 4);
    ctx.lineTo(4, 24);
    ctx.closePath();
    ctx.fill();
  }),

  'scepter': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    // shaft
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, 10); ctx.stroke();
    // orb
    ctx.beginPath(); ctx.arc(0, -22, 5, 0, Math.PI * 2); ctx.stroke();
    // scepter head
    ctx.beginPath();
    ctx.moveTo(-8, 10); ctx.lineTo(0, 6); ctx.lineTo(8, 10);
    ctx.stroke();
  }),

  'chained-key': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2.5;
    ctx.fillStyle = 'currentColor';
    // chain links
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(-8 + i * 8, -16, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // key
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 8); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -14, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.fillRect(-3, 8, 6, 4);
  }),

  'pomegranate': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2;
    ctx.fillStyle = '#8e3044';
    // crown (calyx)
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
    }
    ctx.fill();
    ctx.stroke();
    // fruit body
    ctx.beginPath();
    ctx.arc(0, 8, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // seeds
    ctx.fillStyle = 'currentColor';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 6, 8 + Math.sin(a) * 6, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }),

  'thyrsus': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    // staff
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, -6); ctx.stroke();
    // pine cone
    ctx.fillStyle = 'currentColor';
    ctx.beginPath();
    ctx.arc(0, -8, 5, 0, Math.PI * 2);
    ctx.fill();
    // ivy leaf
    ctx.beginPath();
    ctx.arc(0, -22, 4, 0, Math.PI * 2);
    ctx.stroke();
  }),

  'wheat': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2;
    // stem
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, 10); ctx.stroke();
    // wheat heads
    for (let i = -6; i <= 6; i += 6) {
      ctx.save();
      ctx.translate(i, -16);
      ctx.beginPath();
      ctx.lineTo(-3, -6); ctx.lineTo(0, -10); ctx.lineTo(3, -6);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    // grain at top
    ctx.beginPath();
    ctx.arc(0, -22, 5, 0, Math.PI * 2);
    ctx.stroke();
  }),

  'scythe': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    // handle
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(6, 10); ctx.stroke();
    // blade
    ctx.beginPath();
    ctx.ellipse(2, -2, 10, 6, 0.5, Math.PI, 0, false);
    ctx.stroke();
  }),

  'sun-chariot': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2.5;
    // chariot base
    ctx.beginPath();
    ctx.moveTo(-12, 6); ctx.lineTo(12, 6); ctx.lineTo(8, 16); ctx.lineTo(-8, 16);
    ctx.closePath(); ctx.stroke();
    // sun disc
    ctx.beginPath(); ctx.arc(0, -6, 8, 0, Math.PI * 2); ctx.stroke();
    // rays
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 12, -6 + Math.sin(a) * 12);
      ctx.lineTo(Math.cos(a) * 18, -6 + Math.sin(a) * 18);
      ctx.stroke();
    }
    // horses
    for (let i = -8; i <= 8; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 6); ctx.lineTo(i + 2, 6); ctx.lineTo(i, 14);
      ctx.stroke();
    }
  }),

  'crescent': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 3;
    ctx.fillStyle = 'currentColor';
    // crescent (two arcs)
    ctx.beginPath();
    ctx.arc(0, 0, 14, Math.PI * 1.1, Math.PI * 1.9, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 10, Math.PI * 0.1, Math.PI * 0.9, true);
    ctx.stroke();
    // stars
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 22, Math.sin(a) * 22, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }),

  'flame': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2;
    ctx.fillStyle = 'currentColor';
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.bezierCurveTo(10, -14, 14, -4, 6, 10);
    ctx.bezierCurveTo(12, 8, 8, 14, 0, 10);
    ctx.bezierCurveTo(-8, 14, -12, 8, -6, 10);
    ctx.bezierCurveTo(-14, -4, -10, -14, 0, -20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }),

  'star-veil': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 1.5;
    // star field
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = 16 + (i % 2) * 4;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    // veil folds
    ctx.lineWidth = 2;
    for (let i = -6; i <= 6; i += 6) {
      ctx.beginPath();
      ctx.arc(i, 0, 14, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
    }
  }),

  'arrow-heart': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    // arrow shaft
    ctx.beginPath();
    ctx.moveTo(0, -18); ctx.lineTo(0, 6);
    ctx.stroke();
    // arrowhead
    ctx.beginPath();
    ctx.moveTo(-6, -18); ctx.lineTo(6, -18); ctx.lineTo(0, -26);
    ctx.closePath(); ctx.stroke();
    // heart fletching
    ctx.beginPath();
    ctx.arc(-4, 6, 4, 0, Math.PI * 2);
    ctx.arc(4, 6, 4, 0, Math.PI * 2);
    ctx.stroke();
  }),

  'atlas-sphere': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2.2;
    // sphere
    ctx.beginPath(); ctx.arc(0, -6, 12, 0, Math.PI * 2); ctx.stroke();
    // sphere bands
    ctx.beginPath(); ctx.ellipse(0, -6, 12, 3, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -6, 3, 12, 0, 0, Math.PI * 2); ctx.stroke();
    // bent figure
    ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, 8); ctx.lineTo(0, 14); ctx.lineTo(6, 8);
    ctx.stroke();
    // legs
    ctx.beginPath();
    ctx.moveTo(-8, 14); ctx.lineTo(-12, 24);
    ctx.moveTo(8, 14); ctx.lineTo(12, 24);
    ctx.stroke();
  }),

  'river-circle': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2.5;
    // outer ring
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke();
    // inner flow lines
    ctx.lineWidth = 1.5;
    for (let i = -12; i <= 12; i += 6) {
      ctx.beginPath();
      ctx.arc(i, 0, 8, Math.PI * 0.3, Math.PI * 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(i, 0, 12, Math.PI * 1.3, Math.PI * 1.7);
      ctx.stroke();
    }
  }),

  // --- Monster glyphs ---

  'hydra': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, 2, 12, 7, 0, 0, Math.PI * 2); ctx.stroke();
    // heads
    ctx.beginPath();
    ctx.arc(-12, -2, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.arc(0, -8, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.arc(12, -2, 4, 0, Math.PI * 2); ctx.stroke();
  }),

  'cerberus': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2.4;
    ctx.fillStyle = 'currentColor';
    // threshold arch
    ctx.beginPath();
    ctx.arc(0, 10, 18, Math.PI, 0, false);
    ctx.stroke();
    // three heads
    const xs = [-14, 0, 14];
    for (const hx of xs) {
      ctx.beginPath(); ctx.arc(hx, -6, 6, 0, Math.PI * 2); ctx.stroke();
      // ears
      ctx.beginPath();
      ctx.moveTo(hx - 4, -10); ctx.lineTo(hx - 8, -16);
      ctx.moveTo(hx + 4, -10); ctx.lineTo(hx + 8, -16);
      ctx.stroke();
    }
  }),

  'chronos': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2.4;
    ctx.fillStyle = 'currentColor';
    // hourglass
    ctx.beginPath();
    ctx.moveTo(-10, -14); ctx.lineTo(10, -14);
    ctx.lineTo(6, 0);
    ctx.lineTo(10, 14);
    ctx.lineTo(-10, 14);
    ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.stroke();
    // sand
    ctx.beginPath();
    ctx.moveTo(-6, 0); ctx.lineTo(0, -6); ctx.lineTo(6, 0); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-6, 0); ctx.lineTo(0, 6); ctx.lineTo(6, 0); ctx.closePath();
    ctx.fill();
  }),

  'sphinx': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2;
    // wings
    ctx.beginPath();
    ctx.moveTo(-12, 4); ctx.lineTo(-18, -2); ctx.lineTo(-12, -8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(12, 4); ctx.lineTo(18, -2); ctx.lineTo(12, -8);
    ctx.stroke();
    // body
    ctx.beginPath();
    ctx.ellipse(0, 8, 10, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    // head
    ctx.beginPath();
    ctx.arc(0, -4, 6, 0, Math.PI * 2);
    ctx.stroke();
    // human head
    ctx.fillRect(-2, -14, 4, 6);
  }),

  'minotaur': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2.4;
    ctx.fillStyle = 'currentColor';
    // bull head
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // horns
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-6, -8); ctx.lineTo(-10, -16);
    ctx.moveTo(6, -8); ctx.lineTo(10, -16);
    ctx.stroke();
    // nose ring
    ctx.beginPath();
    ctx.arc(0, 6, 3, 0, Math.PI * 2);
    ctx.fill();
  }),

  'medusa': (ctx, x, y, size) => centeredGlyph(ctx, x, y, size, () => {
    ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2;
    // face
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
    // hair-snakes
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const sx = Math.cos(a) * 10;
      const sy = Math.sin(a) * 10;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }),
};

// Helper to render a glyph as an SVG string (for React components).
// Returns an SVG data URI that can be used as an image src.
// The canvas drawers above are the primary rendering path; this is
// used only in the deity selection screen and ability buttons.
export function glyphSVG(glyph, color = 'currentColor') {
  // Map glyph names to simple SVG path data
  const data = GLYPH_SVG_DATA[glyph];
  if (!data) return '';
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' fill='none' stroke='${encodeURIComponent(color)}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E${data}%3C%2Fsvg%3E`;
}

// SVG path data for React inline rendering (simplified from Art.jsx)
const GLYPH_SVG_DATA = {
  'winged-sandal': "M32 22 A14 12 0 1 1 32 22 M20 22 L16 4 L24 4 M32 12 L50 4 M20 34 L44 34 M24 40 L40 40",
  'owl-aegis': "M32 32 A22 22 0 1 1 32 32 M32 22 A8 8 0 1 1 32 22 M24 18 A2.5 2.5 0 1 1 24 18 M40 18 A2.5 2.5 0 1 1 40 18 M26 36 Q32 44 38 36 M26 8 L22 0 M38 8 L42 0",
  'helmet': "M20 34 L44 34 L40 58 L24 58 Z M24 18 L40 18 L34 26 L30 26 Z",
  'lyre': "M20 46 L44 46 M22 46 L22 26 M28 46 L28 22 M34 46 L34 22 M40 46 L40 26 M22 26 Q32 18 42 26",
  'bow': "M32 20 C44 10 48 28 32 36 C16 28 20 10 32 20 Z M28 30 L36 30",
  'dove-rose': "M32 36 A10 7 0 1 1 32 36 M20 36 A8 7 0 1 1 20 36 M44 36 A8 7 0 1 1 44 36 M32 22 L32 42 M32 44 A5 5 0 1 1 32 44",
  'club': "M32 16 C24 18 16 28 24 38 C16 38 8 44 16 52 C24 58 36 52 40 40 C48 40 52 46 46 54 C40 54 36 48 32 48 Z M32 16 L36 52",
  'trident': "M32 8 L32 50 M22 12 L22 30 M42 12 L42 30 M20 20 L10 8 M44 20 L54 8",
  'hydra': "M20 34 A12 7 0 1 1 44 34 A12 7 0 1 1 20 34 M20 28 A4 4 0 1 1 20 28 M32 22 A4 4 0 1 1 32 22 M44 28 A4 4 0 1 1 44 28",
  'cerberus': "M12 52 Q20 38 32 36 Q44 38 52 52 M20 20 A5 5 0 1 1 20 20 M32 16 A5 5 0 1 1 32 16 M44 20 A5 5 0 1 1 44 20",
  'chronos': "M28 16 L48 16 L44 32 L28 48 L16 48 L12 32 Z M32 28 L26 34 L32 34 Z M32 34 L26 40 L32 40 Z",
  'sphinx': "M44 12 L56 28 M20 12 L8 28 M32 8 L22 28 L42 28 Z M32 20 L28 26 L36 26 Z",
  'minotaur': "M20 20 A8 8 0 1 1 44 20 A8 8 0 1 1 20 20 M22 24 L18 14 M42 24 L46 14",
  'medusa': "M24 24 A8 8 0 1 1 40 24 A8 8 0 1 1 24 24 M24 24 L16 16 M40 24 L48 16 M32 20 L32 10",
  'atlas-sphere': "M20 20 A12 12 0 1 1 44 20 A12 12 0 1 1 20 20 M20 20 L20 20 M44 20 L44 20 M22 28 L42 28",
};
