// Stable evidence registry for AFP v1. Values are independently versioned so
// a saved plan identifies its exact scientific basis.
export const SCIENCE_VERSION = 'afp-science-2026.1'
// Confidence is an editorial applicability assessment, not a formal GRADE
// rating. Source design must always be explicit; a review is not a guideline.
const source = (id, title, url, doi, population, limits, type, confidence = 'moderate') => Object.freeze({ id, title, url, doi, population, limits, type, confidence, confidenceMethod: 'editorial_applicability_not_GRADE', reviewedOn: '2026-09-04', reviewDueOn: '2027-09-04' })

export const AFP_SCIENCE = Object.freeze({
  version: SCIENCE_VERSION,
  // Bibliographic registry: entries not selected by a v1 rule remain visible
  // here as reviewed limitations/future evidence, rather than being implied
  // by an invented calculation.
  sources: Object.freeze([
    source('nasem-2023-eer', 'Dietary Reference Intakes for Energy', 'https://nap.nationalacademies.org/catalog/26818/dietary-reference-intakes-for-energy', 'https://doi.org/10.17226/26818', 'Adults 19+ in sex-stratified source data.', 'Population maintenance estimate; not a clinical or under-19 equation.', 'national_academies_report', 'high'),
    source('mifflin-1990-legacy', 'A new predictive equation for resting energy expenditure', 'https://academic.oup.com/ajcn/article/51/2/241/4695104', 'https://doi.org/10.1093/ajcn/51.2.241', 'Adults in the original RMR study.', 'Legacy fallback only; not used by AFP v1 targets.', 'cross_sectional_validation', 'moderate'),
    source('acsm-and-dc-2016', 'Nutrition and Athletic Performance', 'https://journals.lww.com/acsm-msse/fulltext/2016/03000/nutrition_and_athletic_performance.25.aspx', 'https://doi.org/10.1249/MSS.0000000000000852', 'Healthy exercising adults.', 'Planning ranges, not individualized treatment.', 'position_stand', 'high'),
    source('burke-2011-carbohydrate', 'Carbohydrates for training and competition', 'https://doi.org/10.1080/02640414.2011.585473', 'https://doi.org/10.1080/02640414.2011.585473', 'Athletes.', 'Requires individual gastrointestinal tolerance.', 'review', 'moderate'),
    source('burke-2019-carbohydrate', 'Contemporary Nutrition Strategies to Optimize Performance in Distance Runners and Race Walkers', 'https://doi.org/10.1123/ijsnem.2019-0004', 'https://doi.org/10.1123/ijsnem.2019-0004', 'Distance runners and race walkers.', 'Does not justify automatic wearable-calorie replacement.', 'review', 'moderate'),
    source('craven-2020-glycogen', 'The Effect of Consuming Carbohydrate With and Without Protein on the Rate of Muscle Glycogen Re-synthesis During Short-Term Post-exercise Recovery', 'https://doi.org/10.1186/s40798-020-00297-0', 'https://doi.org/10.1186/s40798-020-00297-0', 'Post-exercise adults in included recovery studies.', 'Glycogen-recovery evidence; it does not establish a protein target or personalized recovery need.', 'systematic_review_meta_analysis', 'moderate'),
    source('morton-2018-protein', 'A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults', 'https://doi.org/10.1136/bjsports-2017-097608', 'https://doi.org/10.1136/bjsports-2017-097608', 'Healthy adults undertaking resistance training in randomized trials.', 'Does not establish a guaranteed gain rate.', 'systematic_review_meta_analysis', 'moderate'),
    source('leidy-2015-protein', 'The role of protein in weight loss and maintenance', 'https://doi.org/10.3945/ajcn.114.084038', 'https://doi.org/10.3945/ajcn.114.084038', 'Adults studied for weight management.', 'Not a clinical nutrition prescription.', 'review', 'moderate'),
    source('helms-2023-energy-surplus', 'Effect of Small and Large Energy Surpluses on Strength, Muscle, and Skinfold Thickness in Resistance-Trained Individuals: A Parallel Groups Design', 'https://doi.org/10.1186/s40798-023-00651-y', 'https://doi.org/10.1186/s40798-023-00651-y', 'Resistance-trained individuals in a parallel-groups study.', 'Energy-surplus study; it is not weight-loss evidence and does not guarantee muscle gain.', 'parallel_groups_trial', 'low'),
    source('ioc-reds-2023', '2023 International Olympic Committee consensus statement on Relative Energy Deficiency in Sport (REDs)', 'https://doi.org/10.1136/bjsports-2023-106994', 'https://doi.org/10.1136/bjsports-2023-106994', 'Athletes.', 'Supports risk awareness; the app eligibility policy is not a validated diagnostic instrument.', 'consensus_statement', 'moderate'),
    source('wearable-validation-2024', 'Keeping Pace with Wearables: A Living Umbrella Review of Systematic Reviews Evaluating the Accuracy of Consumer Wearable Technologies in Health Measurement', 'https://doi.org/10.1007/s40279-024-02077-2', 'https://doi.org/10.1007/s40279-024-02077-2', 'Consumer wearable validation studies across heterogeneous devices and populations.', 'Heterogeneity limits device-specific conclusions; does not validate individual calorie replacement.', 'umbrella_review', 'moderate'),
  ]),
  energy: Object.freeze({
    ...source('nasem-2023-eer', 'Dietary Reference Intakes for Energy', 'https://nap.nationalacademies.org/catalog/26818/dietary-reference-intakes-for-energy', 'https://doi.org/10.17226/26818', 'Adults 19 years and older; sex-stratified equations.', 'Not validated here for age under 19, pregnancy/postpartum, or clinical nutrition; do not infer a sex stratum.', 'national_academies_report', 'high'),
    constants: Object.freeze({ eer: Object.freeze({
      male: Object.freeze({ inactive: Object.freeze({ intercept: 753.07, age: -10.83, heightCm: 6.50, weightKg: 14.10 }), low: Object.freeze({ intercept: 581.47, age: -10.83, heightCm: 8.30, weightKg: 14.94 }), active: Object.freeze({ intercept: 1004.82, age: -10.83, heightCm: 6.52, weightKg: 15.91 }), very_active: Object.freeze({ intercept: -517.88, age: -10.83, heightCm: 15.61, weightKg: 19.11 }) }),
      female: Object.freeze({ inactive: Object.freeze({ intercept: 584.90, age: -7.01, heightCm: 5.72, weightKg: 11.71 }), low: Object.freeze({ intercept: 575.77, age: -7.01, heightCm: 6.60, weightKg: 12.14 }), active: Object.freeze({ intercept: 710.25, age: -7.01, heightCm: 6.54, weightKg: 12.34 }), very_active: Object.freeze({ intercept: 511.83, age: -7.01, heightCm: 9.07, weightKg: 12.56 }) }),
    }) }),
  }),
  // Goal adjustment is a transparent product safety policy, not a claim that
  // one source validates a fixed personal deficit/surplus.
  goal: Object.freeze({
    ...source('product-goal-policy-v1', 'Body Current conservative goal policy', 'https://bodycurrent.app/terms', null, 'Eligible self-selected adults only.', 'Product guardrail: no static weight forecast, no automatic endurance deficit, muscle surplus capped at 5%.', 'product_policy', 'policy'),
  }),
  carbohydrate: Object.freeze({
    ...source('burke-2011-carbohydrate', 'Carbohydrates for training and competition', 'https://doi.org/10.1080/02640414.2011.585473', 'https://doi.org/10.1080/02640414.2011.585473', 'Athletes and exercising adults.', 'Sport-nutrition ranges are planning ranges, not medical prescriptions; gastrointestinal tolerance varies.', 'review', 'moderate'),
    constants: Object.freeze({ dailyBands: Object.freeze([Object.freeze({ id: 'rest_light', maxMinutes: 20, gPerKg: Object.freeze([3, 5]) }), Object.freeze({ id: 'moderate', maxMinutes: 75, gPerKg: Object.freeze([5, 7]) }), Object.freeze({ id: 'endurance_high', maxMinutes: 240, gPerKg: Object.freeze([6, 10]) }), Object.freeze({ id: 'very_high', maxMinutes: Infinity, gPerKg: Object.freeze([8, 12]) })]), pre: Object.freeze({ gPerKg: Object.freeze([1, 4]), timingHours: Object.freeze([1, 4]) }), loading: Object.freeze({ gPerKgPerDay: Object.freeze([10, 12]), durationHours: Object.freeze([36, 48]) }) }),
  }),
  protein: Object.freeze({
    ...source('acsm-and-dc-2016', 'Nutrition and Athletic Performance', 'https://journals.lww.com/acsm-msse/fulltext/2016/03000/nutrition_and_athletic_performance.25.aspx', 'https://doi.org/10.1249/MSS.0000000000000852', 'Healthy exercising adults.', 'Ranges are not individualized treatment for kidney disease, pregnancy, minors, or eating-disorder risk.', 'position_stand', 'high'),
    constants: Object.freeze({ bands: Object.freeze({ maintenance: Object.freeze([1.2, 1.6]), fat_loss: Object.freeze([1.2, 1.6]), muscle_gain: Object.freeze([1.6, 1.6]), endurance_performance: Object.freeze([1.4, 1.8]) }) }),
  }),
  // This is transparent product arithmetic, not an evidence-derived clinical
  // minimum: it keeps an otherwise energy-coherent high-carbohydrate plan
  // from displaying 0 g fat. The engine raises total energy rather than
  // silently reducing selected protein or carbohydrate targets.
  macroReconciliation: Object.freeze({ fatFloorGPerKg: 0.5, citationId: null, policy: 'Product safety arithmetic; not a clinical nutrition prescription.' }),
})
