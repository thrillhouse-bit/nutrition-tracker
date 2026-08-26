// Master item list for the keystroke-efficiency audit (docs/keystroke-efficiency-audit.md).
//
// NOT built from real point-of-sale data — no such data was available. Each
// list is constructed from general knowledge of each chain's known
// best-sellers, house brands, and typical cart composition, per the audit
// spec. Ordered Whole Foods-profile-first is not required here (that was a
// truncation-safety instruction for a combined list); the two stores are
// kept as separate arrays and concatenated with Whole Foods first below so
// that if this file or a downstream run is ever cut short, what survives is
// the healthy end first.
//
// Every entry: { store, kind: 'generic'|'branded', label, query, match, matchAny }
//   label   — the display name for the report/master list (e.g. "Organic
//             Banana" — preserves that this is Whole Foods' organic-produce
//             profile even where that word isn't literally typed, see below).
//   query   — the natural search phrase a shopper would actually TYPE into
//             the app's search box, lowercase (prefixes are taken
//             left-to-right from this string). For generic produce this
//             deliberately drops a leading "organic": a person logging food
//             types "banana", not "organic banana" — nobody types a quality
//             adjective into a food-diary search box to find a raw
//             ingredient, and neither USDA's generic/Foundation tier nor
//             Open Food Facts' generic-produce entries carry "organic" in
//             their canonical names, so prepending it here would have
//             measured MY query construction, not the search pipeline
//             (caught in a dry run against real data before the full audit
//             ran — see docs/keystroke-efficiency-audit.md Methodology).
//             Whole Foods' branded items keep "organic"/brand words in
//             `query` where they are literally part of the product's own
//             printed name (e.g. "365 organic whole milk") — a shopper
//             recognizes and types that as the product's name, not as a
//             detached quality claim.
//   match   — array of lowercase substrings that must ALL appear in
//             `${candidate.name} ${candidate.brand||''}`.toLowerCase() for a
//             result to count as "the item".
//   matchAny — optional array of alternative match groups (arrays of
//             substrings); satisfied if ANY group's substrings are ALL
//             present. Used where a brand/product is reasonably identified
//             more than one way (e.g. "Rao's" vs "Raos").

// ---------------------------------------------------------------------------
// WHOLE FOODS — 150 items: 45 generic/organic-produce (30%) + 105 branded
// (70%), reflecting 365 private label + the natural/organic brands Whole
// Foods is known for + organic produce. Seasonal/holiday items and outliers
// (stone fruit, pumpkin, cranberries, watermelon, etc.) excluded on purpose —
// this is meant to be the steady, year-round staple set an ordinary weekly
// shopper buys.
// ---------------------------------------------------------------------------

const wfGeneric = [
  ['banana', ['banana']],
  ['avocado', ['avocado']],
  ['baby spinach', ['spinach']],
  ['kale', ['kale']],
  ['gala apple', ['apple']],
  ['lemon', ['lemon']],
  ['garlic', ['garlic']],
  ['yellow onion', ['onion']],
  ['red onion', ['onion']],
  ['roma tomato', ['tomato']],
  ['broccoli', ['broccoli']],
  ['carrots', ['carrot']],
  ['red bell pepper', ['pepper']],
  ['cucumber', ['cucumber']],
  ['zucchini', ['zucchini']],
  ['blueberries', ['blueberr']],
  ['strawberries', ['strawberr']],
  ['celery', ['celery']],
  ['sweet potato', ['sweet potato']],
  ['russet potato', ['potato']],
  ['green grapes', ['grape']],
  ['cauliflower', ['cauliflower']],
  ['asparagus', ['asparagus']],
  ['ginger', ['ginger']],
  ['cilantro', ['cilantro']],
  ['brussels sprouts', ['brussels']],
  ['english cucumber', ['cucumber']],
  ['cremini mushrooms', ['mushroom']],
  ['lime', ['lime']],
  ['green beans', ['green bean']],
  ['baby arugula', ['arugula']],
  ['romaine lettuce', ['romaine']],
  ['cherry tomatoes', ['tomato']],
  ['navel orange', ['orange']],
  ['yellow squash', ['squash']],
  ['scallions', ['scallion']],
  ['red potatoes', ['potato']],
  ['granny smith apple', ['apple']],
  ['honeycrisp apple', ['apple']],
  ['raspberries', ['raspberr']],
  ['blackberries', ['blackberr']],
  ['butternut squash', ['squash']],
  ['parsley', ['parsley']],
  ['basil', ['basil']],
  ['shallot', ['shallot']],
].map(([query, match]) => ({ store: 'wholefoods', kind: 'generic', label: `organic ${query}`, query, match }))

const wfBranded = [
  // --- 365 Everyday Value (Whole Foods' own private label) ---
  ['365 organic whole milk', ['365'], [['organic'], ['whole milk']]],
  ['365 large brown eggs', ['365'], [['egg']]],
  ['365 organic unsalted butter', ['365'], [['butter']]],
  ['365 organic chicken broth', ['365'], [['chicken broth']]],
  ['365 organic marinara sauce', ['365'], [['marinara']]],
  ['365 organic creamy peanut butter', ['365'], [['peanut butter']]],
  ['365 organic rolled oats', ['365'], [['oats']]],
  ['365 organic quinoa', ['365'], [['quinoa']]],
  ['365 organic black beans', ['365'], [['black bean']]],
  ['365 organic extra virgin olive oil', ['365'], [['olive oil']]],
  ['365 organic salsa', ['365'], [['salsa']]],
  ['365 organic blue corn tortilla chips', ['365'], [['tortilla chip']]],
  ['365 organic whole milk greek yogurt', ['365'], [['greek yogurt'], ['yogurt']]],
  ['365 sparkling water', ['365'], [['sparkling water']]],
  ['365 organic maple syrup', ['365'], [['maple syrup']]],

  // --- Dairy / eggs / butter (non-365 natural brands) ---
  ['vital farms pasture raised eggs', ['vital farms'], [['egg']]],
  ['kerrygold pure irish butter', ['kerrygold'], [['butter']]],
  ['organic valley whole milk', ['organic valley'], [['milk']]],
  ['straus family creamery whole milk', ['straus'], [['milk']]],
  ["siggi's vanilla yogurt", ['siggi'], [['yogurt']]],
  ['wallaby organic whole milk yogurt', ['wallaby'], [['yogurt']]],
  ['chobani plain greek yogurt', ['chobani'], [['yogurt']]],
  ['maple hill grass fed whole milk', ['maple hill'], [['milk']]],
  ['cabot sharp cheddar cheese', ['cabot'], [['cheddar']]],
  ['vital farms salted butter', ['vital farms'], [['butter']]],

  // --- Meat / protein / deli ---
  ['applegate uncured turkey bacon', ['applegate'], [['turkey bacon']]],
  ['applegate naturals deli ham', ['applegate'], [['ham']]],
  ['applegate hot dogs', ['applegate'], [['hot dog'], ['frank']]],
  ['diestel family ranch ground turkey', ['diestel'], [['turkey']]],
  ["mary's free range whole chicken", ["mary's"], [['chicken']]],
  ['beyond meat plant based burger', ['beyond meat'], [['burger']]],
  ['just egg liquid egg', ['just egg'], [['egg']]],
  ['niman ranch uncured bacon', ['niman ranch'], [['bacon']]],
  ['wellshire farms deli turkey', ['wellshire'], [['turkey']]],
  ['applegate chicken sausage', ['applegate'], [['sausage']]],

  // --- Pantry / sauces / condiments / oils ---
  ["rao's homemade marinara sauce", ['rao'], [['marinara'], ['sauce']]],
  ['siete grain free tortillas', ['siete'], [['tortilla']]],
  ['siete tortilla chips', ['siete'], [['tortilla chip']]],
  ['primal kitchen avocado oil mayo', ['primal kitchen'], [['mayo']]],
  ['primal kitchen ranch dressing', ['primal kitchen'], [['ranch']]],
  ["sir kensington's ketchup", ['kensington'], [['ketchup']]],
  ["justin's classic peanut butter", ['justin'], [['peanut butter']]],
  ["justin's almond butter", ['justin'], [['almond butter']]],
  ["bob's red mill old fashioned rolled oats", ['bob'], [['oats']]],
  ["bob's red mill almond flour", ['bob'], [['almond flour']]],
  ['lundberg organic brown rice', ['lundberg'], [['rice']]],
  ['eden foods organic black beans', ['eden'], [['black bean']]],
  ['pacific foods organic chicken broth', ['pacific foods'], [['chicken broth']]],
  ['bragg organic apple cider vinegar', ['bragg'], [['vinegar']]],
  ['thrive market extra virgin olive oil', ['thrive market'], [['olive oil']]],

  // --- Bread / bakery ---
  ["dave's killer bread 21 whole grains", ['dave'], [['bread']]],
  ['ezekiel 4 9 sprouted bread', ['ezekiel'], [['bread']]],
  ['angelic bakehouse 7 grain bread', ['angelic'], [['bread']]],
  ["rudi's organic multigrain bread", ['rudi'], [['bread']]],
  ['simple mills almond flour crackers', ['simple mills'], [['cracker']]],
  ['simple mills pancake baking mix', ['simple mills'], [['pancake'], ['baking mix']]],
  ["alvarado street bakery sprouted bread", ['alvarado'], [['bread']]],
  ['silver hills sprouted bread', ['silver hills'], [['bread']]],

  // --- Snacks / bars ---
  ['rxbar chocolate sea salt', ['rxbar'], [['chocolate']]],
  ['kind dark chocolate nuts sea salt bar', ['kind'], [['bar'], ['chocolate']]],
  ['larabar cashew cookie', ['larabar'], [['cashew']]],
  ['late july sea salt tortilla chips', ['late july'], [['tortilla chip']]],
  ['hippeas chickpea puffs', ['hippeas'], [['puff'], ['chickpea']]],
  ['madegood granola bars', ['madegood'], [['granola bar'], ['bar']]],
  ["annie's cheddar bunnies", ['annie'], [['bunnies'], ['cheddar']]],
  ["annie's shells white cheddar mac and cheese", ['annie'], [['mac'], ['cheddar']]],
  ['amy s organic lentil soup', ['amy'], [['lentil'], ['soup']]],
  ['gomacro protein bar', ['gomacro'], [['bar']]],
  ['barnana chewy banana bites', ['barnana'], [['banana']]],
  ['siete grain free chips', ['siete'], [['chip']]],
  ['bare baked apple chips', ['bare'], [['apple']]],
  ["justin's dark chocolate peanut butter cups", ['justin'], [['peanut butter cup'], ['cup']]],

  // --- Beverages ---
  ['health ade kombucha', ['health-ade', 'health ade'], [['kombucha']]],
  ["gt's kombucha", ['gt'], [['kombucha']]],
  ['califia farms oat milk', ['califia'], [['oat milk']]],
  ['califia farms almond milk', ['califia'], [['almond milk']]],
  ['oatly oat milk', ['oatly'], [['oat milk']]],
  ['suja organic cold pressed juice', ['suja'], [['juice']]],
  ['vital proteins collagen peptides', ['vital proteins'], [['collagen']]],
  ['numi organic tea', ['numi'], [['tea']]],

  // --- Frozen ---
  ['amy s frozen margherita pizza', ['amy'], [['pizza']]],
  ['sweet earth frozen burrito', ['sweet earth'], [['burrito']]],
  ['applegate frozen chicken nuggets', ['applegate'], [['nugget']]],
  ['alexia frozen sweet potato fries', ['alexia'], [['sweet potato'], ['fries']]],
  ['daily harvest smoothie cups', ['daily harvest'], [['smoothie']]],
  ['native forest organic coconut milk', ['native forest'], [['coconut milk']]],
  ['so delicious coconut milk yogurt', ['so delicious'], [['yogurt']]],
  ['sweet earth veggie burger', ['sweet earth'], [['burger']]],

  // --- Grains / legumes / canned ---
  ['banza chickpea pasta', ['banza'], [['pasta']]],
  ['jovial organic pasta', ['jovial'], [['pasta']]],
  ['eden foods organic chickpeas', ['eden'], [['chickpea']]],
  ['muir glen organic diced tomatoes', ['muir glen'], [['tomato']]],
  ['pacific foods organic vegetable broth', ['pacific foods'], [['vegetable broth']]],
  ['explore cuisine edamame spaghetti', ['explore cuisine'], [['edamame']]],
  ['tinkyada brown rice pasta', ['tinkyada'], [['pasta']]],
  ["annie's organic microwave mac and cheese", ['annie'], [['mac']]],

  // --- Chocolate / sweets ---
  ['alter eco dark chocolate', ['alter eco'], [['chocolate']]],
  ["lily's dark chocolate", ['lily'], [['chocolate']]],
  ['endangered species dark chocolate', ['endangered species'], [['chocolate']]],
  ['hu chocolate bar', ['hu '], [['chocolate']]],

  // --- Nut butters / spreads (extra) ---
  ['once again almond butter', ['once again'], [['almond butter']]],
  ['wild friends peanut butter', ['wild friends'], [['peanut butter']]],

  // --- Coffee / tea ---
  ['allegro coffee organic breakfast blend', ['allegro'], [['coffee']]],
  ['four sigmatic mushroom coffee', ['four sigmatic'], [['coffee'], ['mushroom']]],

  // --- Household staple filled out to reach the 70%-of-150 branded target ---
  ["nature's path organic granola", ["nature's path", 'natures path'], [['granola']]],
]

// Sanity: keep the 105 count explicit and checkable at build time.
if (wfBranded.length !== 105) {
  throw new Error(`wfBranded expected 105 items, got ${wfBranded.length}`)
}
if (wfGeneric.length !== 45) {
  throw new Error(`wfGeneric expected 45 items, got ${wfGeneric.length}`)
}

const wholeFoodsItems = [
  ...wfGeneric,
  ...wfBranded.map(([query, match, matchAny]) => ({ store: 'wholefoods', kind: 'branded', label: query, query, match, matchAny })),
]

// ---------------------------------------------------------------------------
// WALMART — 50 items: 15 generic/produce + 35 branded, biased toward
// mainstream/conventional brands (including Great Value, Walmart's own
// house label) rather than health-food brands.
// ---------------------------------------------------------------------------

const wmGeneric = [
  ['banana', ['banana']],
  ['yellow onion', ['onion']],
  ['roma tomato', ['tomato']],
  ['russet potato', ['potato']],
  ['red bell pepper', ['pepper']],
  ['iceberg lettuce', ['lettuce']],
  ['carrots', ['carrot']],
  ['broccoli', ['broccoli']],
  ['green grapes', ['grape']],
  ['gala apple', ['apple']],
  ['avocado', ['avocado']],
  ['lemon', ['lemon']],
  ['garlic', ['garlic']],
  ['baby spinach', ['spinach']],
  ['sweet potato', ['sweet potato']],
].map(([query, match]) => ({ store: 'walmart', kind: 'generic', label: query, query, match }))

const wmBranded = [
  ['great value 2 percent milk', ['great value'], [['milk']]],
  ['great value large eggs', ['great value'], [['egg']]],
  ['great value unsalted butter', ['great value'], [['butter']]],
  ['great value shredded cheddar cheese', ['great value'], [['cheddar']]],
  ['great value vanilla ice cream', ['great value'], [['ice cream']]],
  ['cheerios', ['cheerios'], null],
  ['honey nut cheerios', ['cheerios'], [['honey nut']]],
  ["kellogg's frosted flakes", ['frosted flakes'], null],
  ['oscar mayer bacon', ['oscar mayer'], [['bacon']]],
  ['oscar mayer deli ham', ['oscar mayer'], [['ham']]],
  ['oscar mayer hot dogs', ['oscar mayer'], [['hot dog'], ['frank'], ['wiener']]],
  ['tyson chicken breast', ['tyson'], [['chicken breast'], ['chicken']]],
  ['jif peanut butter', ['jif'], [['peanut butter']]],
  ['skippy peanut butter', ['skippy'], [['peanut butter']]],
  ["smucker's strawberry jam", ['smucker'], [['strawberry']]],
  ['kraft mac and cheese', ['kraft'], [['mac'], ['macaroni']]],
  ['kraft shredded cheddar cheese', ['kraft'], [['cheddar']]],
  ['philadelphia cream cheese', ['philadelphia'], [['cream cheese']]],
  ['chobani vanilla yogurt', ['chobani'], [['vanilla']]],
  ['yoplait strawberry yogurt', ['yoplait'], [['strawberry']]],
  ['wonder bread', ['wonder'], [['bread']]],
  ["sara lee white bread", ['sara lee'], [['bread']]],
  ['barilla spaghetti', ['barilla'], [['spaghetti']]],
  ['ragu marinara sauce', ['ragu'], [['marinara'], ['sauce']]],
  ["hunt's diced tomatoes", ['hunt'], [['tomato']]],
  ["campbell's chicken noodle soup", ['campbell'], [['chicken noodle']]],
  ['coca cola 12 pack', ['coca-cola', 'coca cola', 'coke'], null],
  ['pepsi 12 pack', ['pepsi'], null],
  ["lay's classic potato chips", ['lay'], [['potato chip']]],
  ['doritos nacho cheese', ['doritos'], [['nacho']]],
  ['oreo cookies', ['oreo'], null],
  ['ritz crackers', ['ritz'], [['cracker']]],
  ['folgers ground coffee', ['folgers'], [['coffee']]],
  ['lipton tea bags', ['lipton'], [['tea']]],
  ['tropicana orange juice', ['tropicana'], [['orange']]],
]

if (wmBranded.length !== 35) {
  throw new Error(`wmBranded expected 35 items, got ${wmBranded.length}`)
}
if (wmGeneric.length !== 15) {
  throw new Error(`wmGeneric expected 15 items, got ${wmGeneric.length}`)
}

const walmartItems = [
  ...wmGeneric,
  ...wmBranded.map(([query, match, matchAny]) => ({
    store: 'walmart', kind: 'branded', label: query, query, match, ...(matchAny ? { matchAny } : {}),
  })),
]

// Whole Foods first (healthiest-shopping-profile-first), so a truncated run
// keeps the healthy end.
export const ITEMS = [...wholeFoodsItems, ...walmartItems]

export function itemId(item) {
  return `${item.store}:${item.query}`
}
