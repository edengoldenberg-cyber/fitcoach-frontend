/**
 * Food-aware measurement configuration for AI clarification questions.
 *
 * Architecture:
 *   - Single-dimension foods (eggs, bread, rice, tahini…) → one question
 *   - Two-dimension foods (chicken, fish…) → two questions: COUNT then SIZE
 *   - A dimension is resolved ONLY when reliably extracted from input text
 *     or explicitly answered by the user in the UI.
 *   - No hidden defaults. No silent medium/large/1-piece fallbacks.
 *   - final grams = resolvedCount × unitGramsForSize (for proteins)
 *   - All canonical gram values are unchanged from prior implementation.
 *
 * NOTE: JavaScript \b word boundaries do not work for Hebrew text.
 * Use simple substring/start-of-word patterns instead.
 */

// ─── Gram constants ───────────────────────────────────────────────────────────
const G = {
  EGG:          55,
  BREAD_SLICE:  30,
  PITA:         80,
  ROLL:         70,
  TABLESPOON:   15,   // generic water-volume tablespoon (~15ml)
  TEASPOON:      5,
  RICE_TBSP:    15,
  RICE_CUP:    200,
  PROTEIN_SMALL:  100,
  PROTEIN_MEDIUM: 150,
  PROTEIN_LARGE:  200,
  FISH_SMALL:  100,
  FISH_MEDIUM: 150,
  FISH_LARGE:  200,
  PIZZA_SLICE:    100,
  SUSHI_PIECE:     25,
};

// ─── Household Measure Registry ───────────────────────────────────────────────
// One tablespoon (כף אוכל, ~15ml) weight in grams for each food in cooked/as-eaten state.
// Cup (כוס) weight in grams for each food in cooked/as-eaten state.
// These are authoritative values for deterministic conversions.
// The AI cannot override amounts derived from these once the user confirms a unit.
//
// All weights are for the COOKED / PREPARED / AS-EATEN state unless otherwise noted.
// Never use dry/raw values for meal diary entries.
export const HOUSEHOLD_MEASURE_REGISTRY = {
  // ── Cooked grains ────────────────────────────────────────────────────────
  'אורז':     { tablespoon_g: 15, cup_g: 200,  preparation: 'cooked', category: 'grain' },
  'פתיתים':   { tablespoon_g: 14, cup_g: 180,  preparation: 'cooked', category: 'grain' },
  'בורגול':   { tablespoon_g: 14, cup_g: 185,  preparation: 'cooked', category: 'grain' },
  'קוסקוס':   { tablespoon_g: 13, cup_g: 175,  preparation: 'cooked', category: 'grain' },
  'קינואה':   { tablespoon_g: 14, cup_g: 185,  preparation: 'cooked', category: 'grain' },
  'פסטה':     { tablespoon_g: 12, cup_g: 160,  preparation: 'cooked', category: 'grain' },
  'ספגטי':    { tablespoon_g: 12, cup_g: 160,  preparation: 'cooked', category: 'grain' },
  'מקרוני':   { tablespoon_g: 13, cup_g: 165,  preparation: 'cooked', category: 'grain' },
  'גריסים':   { tablespoon_g: 15, cup_g: 200,  preparation: 'cooked', category: 'grain' },
  'כוסמת':    { tablespoon_g: 13, cup_g: 185,  preparation: 'cooked', category: 'grain' },
  "ורמיצ'לי": { tablespoon_g: 12, cup_g: 155,  preparation: 'cooked', category: 'grain' },
  'פירה':     { tablespoon_g: 18, cup_g: 240,  preparation: 'cooked', category: 'grain' },
  'שיבולת שועל': { tablespoon_g: 14, cup_g: 175, preparation: 'cooked', category: 'grain' },
  // ── Spreads & condiments ─────────────────────────────────────────────────
  'טחינה':    { tablespoon_g: 15, teaspoon_g: 5,  category: 'spread' },
  'חומוס':    { tablespoon_g: 15, teaspoon_g: 5,  category: 'spread' },
  'מיונז':    { tablespoon_g: 14, teaspoon_g: 5,  category: 'spread' },
  'חמאת בוטנים': { tablespoon_g: 16, teaspoon_g: 5, category: 'spread' },
  'ריבה':     { tablespoon_g: 20, teaspoon_g: 7,  category: 'spread' },
  // ── Oils & fats ──────────────────────────────────────────────────────────
  'שמן':      { tablespoon_g: 13, teaspoon_g: 4,  category: 'oil' },
  'חמאה':     { tablespoon_g: 14, teaspoon_g: 5,  category: 'oil' },
  // ── Dairy ────────────────────────────────────────────────────────────────
  'גבינה לבנה': { tablespoon_g: 20, cup_g: 240,  category: 'dairy' },
  "קוטג'":    { tablespoon_g: 20, cup_g: 230,  category: 'dairy' },
  // ── Legumes (cooked) ─────────────────────────────────────────────────────
  'עדשים':    { tablespoon_g: 15, cup_g: 200,  preparation: 'cooked', category: 'legume' },
  'שעועית':   { tablespoon_g: 15, cup_g: 180,  preparation: 'cooked', category: 'legume' },
  'חומוס גרגרים': { tablespoon_g: 14, cup_g: 165, preparation: 'cooked', category: 'legume' },
  'תירס':     { tablespoon_g: 14, cup_g: 160,  preparation: 'cooked', category: 'legume' },
  'אפונה':    { tablespoon_g: 10, cup_g: 145,  preparation: 'cooked', category: 'legume' },
};

/**
 * Look up tablespoon weight for a food by matching the registry keys against the food name.
 * Returns the per-tablespoon gram weight or the default (15g) if not found.
 */
export function getTablespoonGrams(foodName) {
  const lower = (foodName || '').toLowerCase();
  for (const [key, profile] of Object.entries(HOUSEHOLD_MEASURE_REGISTRY)) {
    if (lower.includes(key)) return profile.tablespoon_g;
  }
  return 15; // generic default
}

/**
 * Look up cup weight for a food. Returns grams for 1 standard measuring cup (~240ml fill).
 */
export function getCupGrams(foodName) {
  const lower = (foodName || '').toLowerCase();
  for (const [key, profile] of Object.entries(HOUSEHOLD_MEASURE_REGISTRY)) {
    if (lower.includes(key) && profile.cup_g) return profile.cup_g;
  }
  return 185; // generic cooked-grain default
}

/**
 * Build food-specific grain options for the volume question.
 * Returns an array of { label, value, grams } based on the food's registry profile.
 */
export function buildGrainOptions(foodName) {
  const tbsp    = getTablespoonGrams(foodName);
  const cup     = getCupGrams(foodName);
  const halfCup = Math.round(cup * 0.5);
  const cup15   = Math.round(cup * 1.5);
  return [
    { label: `3 כפות (~${3 * tbsp} גרם)`,   value: 'three_tbsp',  grams: 3 * tbsp },
    { label: `חצי כוס (~${halfCup} גרם)`,   value: 'half_cup',    grams: halfCup  },
    { label: `כוס (~${cup} גרם)`,            value: '1_cup',       grams: cup      },
    { label: `כוס וחצי (~${cup15} גרם)`,    value: '1.5_cup',     grams: cup15    },
  ];
}

// ─── Category definitions ─────────────────────────────────────────────────────
// measure_class: 'quantity' | 'size' — used as dedup key alongside food_key.
// measure_type:  more specific descriptor for internal logic.
// depends_on:    only present on 'size' questions; resolved against the count answer.

export const FOOD_MEASURE_CATEGORIES = [

  // ── Whole fruits ────────────────────────────────────────────────────────────
  {
    id: 'whole_fruit_size',
    measure_class: 'quantity',
    measure_type: 'size',
    skipIfQuantityKnown: true,
    patterns: [
      /תפוח(?!\s*(?:אדמה|אפוי|מרוסק))/,
      /(?:^|\s)אגס/,
      /(?:^|\s)מנגו/,
      /(?:^|\s)אפרסק/,
      /(?:^|\s)שזיף/,
      /(?:^|\s)נקטרינה/,
      /(?:^|\s)תמר/,
      /(?:^|\s)מלון/,
    ],
    question: 'מה גודל {food}?',
    options: [
      { label: 'קטן',                    value: 'small',       grams: 130 },
      { label: 'בינוני',                  value: 'medium',      grams: 180 },
      { label: 'גדול',                    value: 'large',       grams: 230 },
      { label: 'משקל אחר',               value: 'custom_grams', grams: null },
    ],
  },

  // ── Banana ──────────────────────────────────────────────────────────────────
  {
    id: 'banana_size',
    measure_class: 'quantity',
    measure_type: 'size',
    skipIfQuantityKnown: true,
    patterns: [/בננה/],
    question: 'מה גודל הבננה?',
    options: [
      { label: 'קטנה',  value: 'small',  grams: 80  },
      { label: 'בינונית', value: 'medium', grams: 120 },
      { label: 'גדולה', value: 'large',  grams: 160 },
    ],
  },

  // ── Grapes ──────────────────────────────────────────────────────────────────
  {
    id: 'grapes_handful',
    measure_class: 'quantity',
    measure_type: 'handful',
    patterns: [/ענב/],
    question: 'כמה ענבים?',
    options: [
      { label: 'קומץ קטן ~10', value: 'small_handful', grams: 80  },
      { label: 'קומץ ~15',     value: 'handful',       grams: 120 },
      { label: 'קומץ גדול ~20', value: 'large_handful', grams: 160 },
    ],
  },

  // ── Eggs ────────────────────────────────────────────────────────────────────
  {
    id: 'eggs_count',
    measure_class: 'quantity',
    measure_type: 'count',
    skipIfQuantityKnown: true,
    patterns: [/ביצ/],
    question: 'כמה ביצים?',
    options: [
      { label: '1', value: '1', grams: 1 * G.EGG },
      { label: '2', value: '2', grams: 2 * G.EGG },
      { label: '3', value: '3', grams: 3 * G.EGG },
      { label: '4', value: '4', grams: 4 * G.EGG },
    ],
  },

  // ── Bread ───────────────────────────────────────────────────────────────────
  {
    id: 'bread_slices',
    measure_class: 'quantity',
    measure_type: 'count',
    skipIfQuantityKnown: true,
    patterns: [/(?:^|\s)לחם/, /(?:^|\s)חלה/],
    question: 'כמה פרוסות לחם?',
    options: [
      { label: 'פרוסה',    value: '1_slice', grams: 1 * G.BREAD_SLICE },
      { label: '2 פרוסות', value: '2_slices', grams: 2 * G.BREAD_SLICE },
      { label: '3 פרוסות', value: '3_slices', grams: 3 * G.BREAD_SLICE },
      { label: '4 פרוסות', value: '4_slices', grams: 4 * G.BREAD_SLICE },
    ],
  },

  // ── Pita ────────────────────────────────────────────────────────────────────
  {
    id: 'pita_count',
    measure_class: 'quantity',
    measure_type: 'count',
    skipIfQuantityKnown: true,
    patterns: [/פיתה?(?!\s*חמה)/],
    question: 'כמה פיתות?',
    options: [
      { label: 'חצי פיתה', value: 'half', grams: Math.round(G.PITA * 0.5) },
      { label: 'פיתה',     value: '1',    grams: G.PITA },
      { label: '2 פיתות',  value: '2',    grams: 2 * G.PITA },
    ],
  },

  // ── Roll ────────────────────────────────────────────────────────────────────
  {
    id: 'roll_count',
    measure_class: 'quantity',
    measure_type: 'count',
    skipIfQuantityKnown: true,
    patterns: [/לחמני/],
    question: 'כמה לחמניות?',
    options: [
      { label: 'אחת',   value: '1', grams: G.ROLL },
      { label: 'שתיים', value: '2', grams: 2 * G.ROLL },
    ],
  },

  // ── Cooked rice ─────────────────────────────────────────────────────────────
  {
    id: 'cooked_rice_volume',
    measure_class: 'quantity',
    measure_type: 'volume',
    skipIfQuantityKnown: true,
    patterns: [/אורז/],
    question: 'כמה אורז היה בערך?',
    options: [
      { label: '2 כפות',   value: '2_tbsp',  grams: 2   * G.RICE_TBSP },
      { label: '4 כפות',   value: '4_tbsp',  grams: 4   * G.RICE_TBSP },
      { label: '6 כפות',   value: '6_tbsp',  grams: 6   * G.RICE_TBSP },
      { label: 'חצי כוס',  value: 'half_cup', grams: Math.round(G.RICE_CUP * 0.5) },
      { label: 'כוס',      value: '1_cup',   grams: G.RICE_CUP },
      { label: 'כוס וחצי', value: '1.5_cup', grams: Math.round(G.RICE_CUP * 1.5) },
      { label: 'משקל אחר', value: 'custom_grams', grams: null },
    ],
  },

  // ── Pasta ───────────────────────────────────────────────────────────────────
  {
    id: 'pasta_volume',
    measure_class: 'quantity',
    measure_type: 'volume',
    skipIfQuantityKnown: true,
    patterns: [/פסטה/, /ספגטי/, /מקרוני/, /ריגטוני/, /טליאטלה/],
    question: 'כמה פסטה היה?',
    options: [
      { label: 'מנה קטנה',  value: 'small',       grams: 150 },
      { label: 'מנה רגילה', value: 'regular',      grams: 220 },
      { label: 'מנה גדולה', value: 'large',        grams: 300 },
      { label: 'משקל אחר',  value: 'custom_grams', grams: null },
    ],
  },

  // ── Other grains (food-specific weights via HOUSEHOLD_MEASURE_REGISTRY) ────────
  {
    id: 'cooked_grains_volume',
    measure_class: 'quantity',
    measure_type: 'volume',
    skipIfQuantityKnown: true,
    patterns: [/קינואה/, /כוסמת/, /בורגול/, /קוסקוס/, /פתיתים/, /ורמיצ'לי/, /פירה/, /גריסים/],
    question: 'כמה {food} היה?',
    // Options are dynamically generated per-food via buildGrainOptions().
    // These static values serve as a fallback only; buildFoodClarifications() replaces them.
    options: [
      { label: '3 כפות',  value: 'three_tbsp', grams: 42 },
      { label: 'חצי כוס', value: 'half_cup',   grams: 93 },
      { label: 'כוס',     value: '1_cup',       grams: 185 },
      { label: 'כוס וחצי', value: '1.5_cup',   grams: 278 },
    ],
    _useFoodSpecificOptions: true,
  },

  // ── Loose / ground meat — NEVER piece questions ──────────────────────────────
  {
    id: 'loose_ground_meat',
    measure_class: 'quantity',
    measure_type: 'weight_or_portion',
    skipIfQuantityKnown: true,
    patterns: [/טחון/, /טחונה/, /קצוץ/, /קצוצה/],
    question: 'כמה {food} אכלת?',
    options: [
      { label: 'מנה קטנה (~80 גרם)',     value: 'small',        grams: 80  },
      { label: 'מנה בינונית (~130 גרם)', value: 'medium',       grams: 130 },
      { label: 'מנה גדולה (~200 גרם)',   value: 'large',        grams: 200 },
      { label: 'אני יודע את המשקל',      value: 'custom_grams', grams: null },
    ],
  },

  // ── Potato / sweet potato: COUNT step ───────────────────────────────────────
  {
    id: 'potato_count',
    measure_class: 'quantity',
    measure_type: 'count_pieces',
    skipIfCountKnown: true,
    patterns: [/תפוח\s*אדמה/, /בטטה/],
    question: 'כמה {food} אכלת?',
    options: [
      { label: 'חצי',          value: 'half_piece',  grams: null, resolved_count: 0.5 },
      { label: 'אחת',          value: '1_piece',      grams: null, resolved_count: 1   },
      { label: 'אחת וחצי',    value: '1.5_pieces',  grams: null, resolved_count: 1.5 },
      { label: '2 יחידות',    value: '2_pieces',     grams: null, resolved_count: 2   },
      { label: 'משקל אחר',    value: 'custom_grams', grams: null },
    ],
  },

  // ── Potato / sweet potato: SIZE step ────────────────────────────────────────
  {
    id: 'potato_size',
    measure_class: 'size',
    measure_type: 'size_pieces',
    skipIfSizeKnown: true,
    patterns: [/תפוח\s*אדמה/, /בטטה/],
    question: 'מה היה הגודל של {food}?',
    depends_on: {
      parent_measure_type: 'count_pieces',
      exclude_values: ['custom_grams'],
    },
    options: [
      { label: 'קטנה',    value: 'small',        unit_grams: 100, grams: null },
      { label: 'בינונית', value: 'medium',       unit_grams: 150, grams: null },
      { label: 'גדולה',   value: 'large',        unit_grams: 220, grams: null },
      { label: 'משקל אחר', value: 'custom_grams', unit_grams: null, grams: null },
    ],
  },

  // ── Tahini / hummus / nut butter ────────────────────────────────────────────
  {
    id: 'tahini_spoons',
    measure_class: 'quantity',
    measure_type: 'spoons',
    skipIfQuantityKnown: true,
    patterns: [/טחינה/, /חומוס/, /חמאת\s*בוטנים/],
    question: 'כמה {food}?',
    options: [
      { label: 'כפית',    value: 'tsp',       grams: 1 * G.TEASPOON },
      { label: '2 כפיות', value: '2_tsp',     grams: 2 * G.TEASPOON },
      { label: 'כף',      value: 'tbsp',      grams: 1 * G.TABLESPOON },
      { label: '2 כפות',  value: '2_tbsp',    grams: 2 * G.TABLESPOON },
      { label: '3 כפות',  value: '3_tbsp',    grams: 3 * G.TABLESPOON },
      { label: 'משקל אחר', value: 'custom_grams', grams: null },
    ],
  },

  // ── Oil ─────────────────────────────────────────────────────────────────────
  {
    id: 'oil_spoons',
    measure_class: 'quantity',
    measure_type: 'spoons',
    skipIfQuantityKnown: true,
    patterns: [/שמן\s*זית/, /שמן\s*קוקוס/, /שמן\s*קנולה/, /שמן\s*חמניות/],
    question: 'כמה שמן?',
    options: [
      { label: 'כפית',   value: 'tsp',    grams: G.TEASPOON },
      { label: 'כף',     value: 'tbsp',   grams: G.TABLESPOON },
      { label: '2 כפות', value: '2_tbsp', grams: 2 * G.TABLESPOON },
    ],
  },

  // ── Butter ──────────────────────────────────────────────────────────────────
  {
    id: 'butter_amount',
    measure_class: 'quantity',
    measure_type: 'spoons',
    skipIfQuantityKnown: true,
    patterns: [/חמאה/],
    question: 'כמה חמאה?',
    options: [
      { label: 'כפית',   value: 'tsp',    grams: G.TEASPOON },
      { label: 'כף',     value: 'tbsp',   grams: G.TABLESPOON },
      { label: '2 כפות', value: '2_tbsp', grams: 2 * G.TABLESPOON },
    ],
  },

  // ── Chicken / meat: COUNT question (step 1) ─────────────────────────────────
  // grams is null — not computable until form/size is also known.
  // resolved_count is the piece multiplier stored when user answers this step.
  {
    id: 'meat_piece_count',
    measure_class: 'quantity',
    measure_type: 'count_pieces',
    skipIfCountKnown: true,    // skip when count is extracted from text
    patterns: [/חזה\s*(?:עוף|תרנגול)/, /פרגית/, /שניצל/, /סטייק/, /קציצ/],
    question: 'כמה {food} אכלת?',
    options: [
      { label: 'חצי חתיכה', value: 'half_piece',  grams: null, resolved_count: 0.5 },
      { label: '1 חתיכה',   value: '1_piece',      grams: null, resolved_count: 1   },
      { label: '2 חתיכות',  value: '2_pieces',     grams: null, resolved_count: 2   },
      { label: '3 חתיכות',  value: '3_pieces',     grams: null, resolved_count: 3   },
      { label: '4 חתיכות',  value: '4_pieces',     grams: null, resolved_count: 4   },
      { label: '5 חתיכות',  value: '5_pieces',     grams: null, resolved_count: 5   },
      { label: 'משקל אחר',  value: 'custom_grams', grams: null },
    ],
  },

  // ── Chicken / meat: FORM question (step 1b) ─────────────────────────────────
  // Appears when count is already known from the original input text (skipIfCountKnown
  // suppresses the count question), and the physical form of "חתיכות" is still ambiguous.
  // A count alone ("5 חתיכות") does NOT establish mass — whole thighs vs small cubes
  // differ by 5× per piece. This question resolves the form and provides a gram anchor.
  // unit_grams is per piece; frontend computes: resolvedCount × unit_grams = totalGrams.
  {
    id: 'meat_piece_form',
    measure_class: 'form',
    measure_type: 'piece_form',
    skipIfFormKnown: true,    // skip when form/size adjective is in text (e.g., "נתחים שלמים")
    patterns: [/חזה\s*(?:עוף|תרנגול)/, /פרגית/, /שניצל/, /סטייק/, /קציצ/],
    question: 'איזה סוג חתיכות {food} היו?',
    depends_on: {
      parent_measure_type: 'count_pieces',
      exclude_values: ['custom_grams'],
    },
    options: [
      { label: 'נתחים שלמים (~150 גרם)',         value: 'whole_pieces',  unit_grams: G.PROTEIN_MEDIUM, grams: null },
      { label: 'חתיכות בינוניות (~80 גרם)',       value: 'medium_pieces', unit_grams: 80,               grams: null },
      { label: 'חתיכות קטנות / קוביות (~30 גרם)', value: 'small_cubes',  unit_grams: 30,               grams: null },
      { label: 'אני יודע את המשקל',               value: 'custom_grams', unit_grams: null,             grams: null },
    ],
  },

  // ── Chicken / meat: SIZE question (step 2) ──────────────────────────────────
  // Only appears after count is answered (depends_on).
  // unit_grams: grams per single piece of that size.
  // Final grams = resolvedCount × unit_grams — computed in UI, not here.
  {
    id: 'meat_piece_size',
    measure_class: 'size',
    measure_type: 'size_pieces',
    skipIfSizeKnown: true,     // skip when size adjective is extracted from text
    patterns: [/חזה\s*(?:עוף|תרנגול)/, /פרגית/, /שניצל/, /סטייק/, /קציצ/],
    question: 'בערך איזה גודל הייתה כל חתיכה?',
    depends_on: {
      parent_measure_type: 'count_pieces',
      exclude_values: ['custom_grams'],
    },
    options: [
      { label: 'קטנה',     value: 'small',        unit_grams: G.PROTEIN_SMALL,  grams: null },
      { label: 'בינונית',  value: 'medium',       unit_grams: G.PROTEIN_MEDIUM, grams: null },
      { label: 'גדולה',    value: 'large',        unit_grams: G.PROTEIN_LARGE,  grams: null },
      { label: 'משקל אחר', value: 'custom_grams', unit_grams: null,             grams: null },
    ],
  },

  // ── Fish: COUNT question (step 1) ────────────────────────────────────────────
  {
    id: 'fish_piece_count',
    measure_class: 'quantity',
    measure_type: 'count_pieces',
    skipIfCountKnown: true,
    patterns: [/סלמון/, /ברמונדי/, /טילפיה/, /דניס/, /לברק/, /פילה\s*(?:דג|סלמון|ים)/],
    question: 'כמה {food} אכלת?',
    options: [
      { label: 'חצי נתח',  value: 'half_piece',  grams: null, resolved_count: 0.5 },
      { label: 'נתח אחד',  value: '1_piece',      grams: null, resolved_count: 1   },
      { label: 'נתח וחצי', value: '1.5_pieces',  grams: null, resolved_count: 1.5 },
      { label: '2 נתחים',  value: '2_pieces',     grams: null, resolved_count: 2   },
      { label: 'משקל אחר', value: 'custom_grams', grams: null },
    ],
  },

  // ── Fish: SIZE question (step 2) ─────────────────────────────────────────────
  {
    id: 'fish_piece_size',
    measure_class: 'size',
    measure_type: 'size_pieces',
    skipIfSizeKnown: true,
    patterns: [/סלמון/, /ברמונדי/, /טילפיה/, /דניס/, /לברק/, /פילה\s*(?:דג|סלמון|ים)/],
    question: 'בערך איזה גודל היה כל נתח?',
    depends_on: {
      parent_measure_type: 'count_pieces',
      exclude_values: ['custom_grams'],
    },
    options: [
      { label: 'קטן',    value: 'small',        unit_grams: G.FISH_SMALL,  grams: null },
      { label: 'בינוני', value: 'medium',       unit_grams: G.FISH_MEDIUM, grams: null },
      { label: 'גדול',   value: 'large',        unit_grams: G.FISH_LARGE,  grams: null },
      { label: 'משקל אחר', value: 'custom_grams', unit_grams: null,        grams: null },
    ],
  },

  // ── Pizza slices ─────────────────────────────────────────────────────────────
  {
    id: 'pizza_slices',
    measure_class: 'quantity',
    measure_type: 'count',
    skipIfQuantityKnown: true,
    patterns: [/פיצה/, /pizza/i],
    question: 'כמה משולשי פיצה?',
    options: [
      { label: '1', value: '1', grams: 1 * G.PIZZA_SLICE },
      { label: '2', value: '2', grams: 2 * G.PIZZA_SLICE },
      { label: '3', value: '3', grams: 3 * G.PIZZA_SLICE },
      { label: '4', value: '4', grams: 4 * G.PIZZA_SLICE },
    ],
  },

  // ── Sushi ────────────────────────────────────────────────────────────────────
  {
    id: 'sushi_pieces',
    measure_class: 'quantity',
    measure_type: 'count',
    skipIfQuantityKnown: true,
    patterns: [/סושי/, /sushi/i, /מאקי/, /ניגירי/, /סשימי/],
    question: 'כמה יחידות סושי?',
    options: [
      { label: '4',    value: '4',          grams:  4 * G.SUSHI_PIECE },
      { label: '6',    value: '6',          grams:  6 * G.SUSHI_PIECE },
      { label: '8',    value: '8',          grams:  8 * G.SUSHI_PIECE },
      { label: '10',   value: '10',         grams: 10 * G.SUSHI_PIECE },
      { label: 'יותר', value: 'more_custom', grams: null },
    ],
  },

  // ── Yogurt ───────────────────────────────────────────────────────────────────
  {
    id: 'yogurt_container',
    measure_class: 'quantity',
    measure_type: 'container',
    skipIfQuantityKnown: true,
    patterns: [/יוגורט/],
    question: 'כמה יוגורט?',
    options: [
      { label: 'חצי גביע',  value: 'half_container', grams: 75  },
      { label: 'גביע שלם',  value: 'full_container', grams: 150 },
      { label: '2 גביעים',  value: '2_containers',   grams: 300 },
      { label: 'משקל אחר',  value: 'custom_grams',   grams: null },
    ],
  },

  // ── Cottage / white cheese ───────────────────────────────────────────────────
  {
    id: 'cottage_container',
    measure_class: 'quantity',
    measure_type: 'container',
    patterns: [/קוטג/, /גבינה\s*לבנה/],
    question: 'כמה {food}?',
    options: [
      { label: 'רבע גביע', value: 'quarter', grams: 55  },
      { label: 'חצי גביע', value: 'half',    grams: 110 },
      { label: 'גביע שלם', value: 'full',    grams: 220 },
    ],
  },

  // ── Milk ─────────────────────────────────────────────────────────────────────
  {
    id: 'milk_volume',
    measure_class: 'quantity',
    measure_type: 'volume',
    patterns: [/(?:^|\s)חלב/],
    question: 'כמה חלב?',
    options: [
      { label: 'רבע כוס', value: 'quarter_cup', grams: 60  },
      { label: 'חצי כוס', value: 'half_cup',    grams: 120 },
      { label: 'כוס',     value: '1_cup',       grams: 240 },
    ],
  },

  // ── Nuts ─────────────────────────────────────────────────────────────────────
  {
    id: 'nuts_handful',
    measure_class: 'quantity',
    measure_type: 'handful',
    patterns: [/אגוז/, /שקד/, /קשיו/, /פיסטוק/, /צנוב/],
    question: 'כמה {food}?',
    options: [
      { label: 'קומץ קטן', value: 'small_handful', grams: 15 },
      { label: 'קומץ',     value: 'handful',       grams: 25 },
      { label: 'קומץ גדול', value: 'large_handful', grams: 40 },
      { label: 'משקל אחר', value: 'custom_grams',  grams: null },
    ],
  },

  // ── Avocado ──────────────────────────────────────────────────────────────────
  {
    id: 'avocado_portion',
    measure_class: 'quantity',
    measure_type: 'portion',
    skipIfQuantityKnown: true,
    patterns: [/אבוקדו/],
    question: 'כמה אבוקדו?',
    options: [
      { label: 'רבע פרי',  value: 'quarter', grams: 40  },
      { label: 'חצי פרי',  value: 'half',    grams: 80  },
      { label: 'פרי שלם',  value: 'whole',   grams: 160 },
      { label: 'משקל אחר', value: 'custom_grams', grams: null },
    ],
  },

  // ── Mayonnaise ───────────────────────────────────────────────────────────────
  {
    id: 'mayo_spoons',
    measure_class: 'quantity',
    measure_type: 'spoons',
    skipIfQuantityKnown: true,
    patterns: [/מיונז/],
    question: 'כמה מיונז?',
    options: [
      { label: 'כפית',   value: 'tsp',    grams: G.TEASPOON },
      { label: 'כף',     value: 'tbsp',   grams: G.TABLESPOON },
      { label: '2 כפות', value: '2_tbsp', grams: 2 * G.TABLESPOON },
    ],
  },

  // ── Labaneh / ricotta ────────────────────────────────────────────────────────
  {
    id: 'spread_spoons',
    measure_class: 'quantity',
    measure_type: 'spoons',
    patterns: [/לבנה/, /ריקוטה/],
    question: 'כמה {food}?',
    options: [
      { label: 'כפית',   value: 'tsp',    grams: G.TEASPOON },
      { label: 'כף',     value: 'tbsp',   grams: G.TABLESPOON },
      { label: '2 כפות', value: '2_tbsp', grams: 2 * G.TABLESPOON },
    ],
  },

  // ── Yellow cheese slices ─────────────────────────────────────────────────────
  {
    id: 'cheese_slices',
    measure_class: 'quantity',
    measure_type: 'count',
    skipIfQuantityKnown: true,
    patterns: [/גבינה\s*(?:צהובה|עמוק|קשה)/, /גאודה/, /אמנטל/],
    question: 'כמה פרוסות גבינה?',
    options: [
      { label: 'פרוסה',    value: '1', grams: 20 },
      { label: '2 פרוסות', value: '2', grams: 40 },
      { label: '3 פרוסות', value: '3', grams: 60 },
    ],
  },
];

// ─── Resolution state ──────────────────────────────────────────────────────────
// Tracks what we reliably know about a food's quantity from the original input text.
// A dimension is RESOLVED only when we have a reliable value, not merely when
// a question was skipped.

/**
 * Returns true if the text contains an explicit gram/ml weight.
 * This resolves ALL quantity questions for that food.
 */
export function textHasDirectGrams(text) {
  if (!text) return false;
  return /\d+\s*(?:גרם|ג['׳]|מ"ל|מ'ל)/.test(String(text).toLowerCase());
}

/**
 * Extract the context window for a specific food from the full input text.
 * Splits by commas/semicolons so quantity info for one food is not borrowed by another.
 * Falls back to the full text when the food cannot be isolated.
 */
export function extractFoodContextFromText(fullText, foodName) {
  if (!fullText || !foodName) return String(fullText || '');
  const lower = String(fullText).toLowerCase();
  const foodLower = String(foodName).toLowerCase();

  // Split on comma-like separators (most reliable in Hebrew food descriptions)
  const segments = lower.split(/\s*[,;]\s*/);

  const matching = segments.filter(seg => {
    if (foodLower.includes(' ')) {
      // Multi-word food: require ALL parts to appear in the segment
      return foodLower.split(/\s+/).every(part => seg.includes(part));
    }
    return seg.includes(foodLower);
  });

  // If we found a matching segment use it; otherwise fall back to full text
  return matching.length > 0 ? matching.join(' ') : lower;
}

/**
 * Returns true if the context contains a reliable piece count.
 * Call with food-scoped context (from extractFoodContextFromText) not the full text.
 */
export function textHasCountForFood(context) {
  if (!context) return false;
  const lower = String(context).toLowerCase();
  if (/\b[1-9]\d?\b/.test(lower)) return true;
  if (/(?:^|\s)(?:חצי|אחת|שתיים|שתי|שלוש|ארבע)(?:\s|$)/.test(lower)) return true;
  if (/חתיכ|נתח|נתחים/.test(lower)) return true;
  return false;
}

/**
 * Returns true if the context contains a reliable size descriptor.
 * Includes feminine/plural forms: קטנות, בינוניות, גדולות.
 * Call with food-scoped context (from extractFoodContextFromText) not the full text.
 */
export function textHasSizeForFood(context) {
  if (!context) return false;
  const lower = String(context).toLowerCase();
  return /(?:^|\s)(?:קטן|קטנה|קטנות|בינוני|בינונית|בינוניות|גדול|גדולה|גדולות)(?:\s|$)/.test(lower);
}

/**
 * Extract a numeric piece count from text.
 * Returns a positive number or null if extraction is unreliable.
 * NEVER returns a default — returns null on failure.
 */
export function extractCountFromText(text) {
  if (!text) return null;
  const lower = String(text).toLowerCase();

  // Explicit Hebrew piece fractions
  if (/חצי\s*(?:חתיכה|נתח)/.test(lower)) return 0.5;
  if (/חתיכה\s*וחצי|נתח\s*וחצי/.test(lower)) return 1.5;

  // Hebrew number words
  const hebrewNums = { 'אחת': 1, 'שתיים': 2, 'שתי': 2, 'שלוש': 3, 'ארבע': 4 };
  for (const [word, val] of Object.entries(hebrewNums)) {
    if (new RegExp(`(?:^|\\s)${word}(?:\\s|$)`).test(lower)) return val;
  }

  // Numeric digit — only accept if unambiguous (single digit 1-9 or two digits ≤ 12)
  const numMatch = lower.match(/\b([1-9]|1[0-2])\b/);
  if (numMatch) return Number(numMatch[1]);

  return null;
}

/**
 * Extract a size label from food-scoped context text.
 * Includes feminine/plural forms. Returns 'small' | 'medium' | 'large' or null.
 * NEVER returns a default — returns null on failure.
 */
export function extractSizeFromText(text) {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  if (/(?:^|\s)(?:קטן|קטנה|קטנות)(?:\s|$)/.test(lower)) return 'small';
  if (/(?:^|\s)(?:בינוני|בינונית|בינוניות)(?:\s|$)/.test(lower)) return 'medium';
  if (/(?:^|\s)(?:גדול|גדולה|גדולות)(?:\s|$)/.test(lower)) return 'large';
  return null;
}

/**
 * Returns true when a size adjective appears immediately AFTER the food name in text
 * (within 15 chars, stopping at comma).
 *
 * In Hebrew, adjectives follow their noun: "חזה עוף בינוני" not "בינוני חזה עוף".
 * This directional check ensures "חזה עוף בינוני ובטטה" — where "בינוני" follows
 * "חזה עוף" and precedes "ובטטה" — does NOT attribute "בינוני" to "בטטה".
 */
function sizeIsAdjacentToFood(fullText, foodName) {
  const lower = String(fullText).toLowerCase();
  const foodLower = String(foodName || '').toLowerCase();
  const sizePattern = /(?:קטן|קטנה|קטנות|בינוני|בינונית|בינוניות|גדול|גדולה|גדולות)/;
  let pos = 0;
  while (true) {
    const foodPos = lower.indexOf(foodLower, pos);
    if (foodPos === -1) break;
    // Look at text immediately AFTER the food name (≤15 chars, stopping at separator)
    const afterSlice = lower.slice(foodPos + foodLower.length, foodPos + foodLower.length + 15);
    const afterSegment = afterSlice.split(/[,;.]/)[0];
    if (sizePattern.test(afterSegment)) return true;
    pos = foodPos + 1;
  }
  return false;
}

/**
 * Build the resolution state for a food from the original input text.
 * CRITICAL: Each dimension is evaluated independently and food-scoped.
 * Quantity/size of one food must NEVER be borrowed by another food.
 * Returns null fields when uncertain — never substitutes defaults.
 */
export function buildResolutionState(foodName, inputText) {
  const fullText = String(inputText || '');
  // Comma-based context scoping for count detection
  const context = extractFoodContextFromText(fullText, foodName);
  return {
    food_key:     foodName,
    // Direct grams: from comma-scoped context (avoids cross-food gram bleeding)
    direct_grams: textHasDirectGrams(context) ? extractDirectGrams(context) : null,
    // Count: from comma-scoped context — "2 חתיכות חזה עוף" does not count "בטטה"
    count:        textHasCountForFood(context) ? extractCountFromText(context) : null,
    // Size: directional adjacency — size word must appear directly AFTER this food name,
    // not after a different food name that precedes this one in the text
    size:         sizeIsAdjacentToFood(fullText, foodName) ? extractSizeFromText(
      // Extract just the adjacent text for size word extraction
      (() => {
        const lower = fullText.toLowerCase();
        const fp = lower.indexOf(foodName.toLowerCase());
        if (fp === -1) return '';
        return lower.slice(fp + foodName.length, fp + foodName.length + 15).split(/[,;.]/)[0];
      })()
    ) : null,
  };
}

/** Extract the numeric gram value from text. Returns null if none found. */
function extractDirectGrams(text) {
  const m = String(text).match(/(\d+(?:\.\d+)?)\s*(?:גרם|ג['׳])/);
  return m ? Number(m[1]) : null;
}

/** Map size label to unit_grams for a protein piece size option. */
export function unitGramsForProteinSize(sizeValue, category) {
  const opt = (category?.options || []).find(o => o.value === sizeValue);
  return opt?.unit_grams ?? null;
}

/**
 * Compute final grams for a two-step protein answer.
 * Returns null if either input is missing — NEVER uses a default count or size.
 */
export function computeProteinGrams(resolvedCount, unitGrams) {
  if (resolvedCount == null || unitGrams == null) return null;
  if (resolvedCount <= 0 || unitGrams <= 0) return null;
  return Math.round(resolvedCount * unitGrams);
}

// ─── Category lookup ──────────────────────────────────────────────────────────

/**
 * Find the first category whose patterns match the food name.
 */
export function getFoodMeasureCategory(foodName) {
  if (!foodName) return null;
  const lower = String(foodName).toLowerCase();
  for (const cat of FOOD_MEASURE_CATEGORIES) {
    if (cat.patterns.some(p => p.test(lower))) {
      return cat;
    }
  }
  return null;
}

/**
 * Find ALL categories matching a food name.
 * Proteins return two (count + size). All other foods return one or zero.
 */
function getAllCategoriesForFood(foodName) {
  if (!foodName) return [];
  const lower = String(foodName).toLowerCase();
  return FOOD_MEASURE_CATEGORIES.filter(cat => cat.patterns.some(p => p.test(lower)));
}

// ─── Question building ─────────────────────────────────────────────────────────

/**
 * Build all clarification questions for a food, given the original input text.
 *
 * Returns an array of 0, 1, or 2 question objects.
 *
 * For proteins:
 *   - If direct_grams known → []  (no questions needed)
 *   - If both count and size known → []
 *   - If count known, size unknown → [size question only]
 *   - If size known, count unknown → [count question only]
 *   - If neither known → [count question, size question with depends_on]
 *
 * For all other foods:
 *   - If quantity known → []
 *   - Otherwise → [one question]
 *
 * IMPORTANT: No defaults are used. If a dimension is not reliably known, we ask.
 */
export function buildFoodClarifications(foodName, inputText) {
  const cats = getAllCategoriesForFood(foodName);
  if (cats.length === 0) return [];

  const res = buildResolutionState(foodName, inputText);

  // Direct grams → nothing to ask
  if (res.direct_grams !== null) return [];

  const isProtein = cats.some(c =>
    c.measure_type === 'count_pieces' || c.measure_type === 'size_pieces'
  );

  if (isProtein) {
    return buildProteinClarifications(foodName, cats, res);
  }

  // Single-dimension food
  const cat = cats[0];
  const skipFn = cat.skipIfQuantityKnown ? textHasQuantityForFood : null;
  if (skipFn && skipFn(inputText)) return [];

  // For grains: substitute food-specific household measure options
  if (cat._useFoodSpecificOptions) {
    const q = makeQuestion(cat, foodName);
    q.options = buildGrainOptions(foodName);
    return [q];
  }

  return [makeQuestion(cat, foodName)];
}

/** Build the 0-3 questions for a protein food based on resolution state. */
function buildProteinClarifications(foodName, cats, res) {
  const countCat = cats.find(c => c.measure_type === 'count_pieces');
  const formCat  = cats.find(c => c.measure_type === 'piece_form');
  const sizeCat  = cats.find(c => c.measure_type === 'size_pieces');
  if (!countCat || !sizeCat) return [];

  const countKnown = res.count !== null;
  const sizeKnown  = res.size  !== null;
  // Form is considered known when: (a) text has explicit form indicator like "נתחים",
  // (b) size is explicitly known (implies a whole-piece context), or (c) no form category.
  // When count is from text and neither form nor size is clear, ask form before size.
  const formKnown  = sizeKnown || !formCat;

  if (countKnown && sizeKnown) return [];  // both resolved — nothing to ask

  if (countKnown && !sizeKnown) {
    if (formCat && !formKnown) {
      // Count extracted from text but form is ambiguous ("5 חתיכות" without type context):
      // ask form question (with unit_grams anchors) instead of the generic size question.
      // Form answer provides: resolvedCount × unit_grams → deterministic total grams.
      return [makeQuestion(formCat, foodName, { noDepends: true })];
    }
    // Count extracted from text and form implied → ask size only, no dependency needed
    return [makeQuestion(sizeCat, foodName, { noDepends: true })];
  }

  if (!countKnown && sizeKnown) {
    // Size extracted from text: ask count only
    return [makeQuestion(countCat, foodName)];
  }

  // Neither known: ask count first, form/size appears after count is answered
  if (formCat) {
    return [
      makeQuestion(countCat, foodName),
      makeQuestion(formCat,  foodName),   // has depends_on; appears after count answered
      makeQuestion(sizeCat,  foodName),   // has depends_on; appears after count answered
    ];
  }
  return [
    makeQuestion(countCat, foodName),
    makeQuestion(sizeCat,  foodName),   // has depends_on; UI hides until count answered
  ];
}

/** Build a single question object from a category and food name. */
function makeQuestion(cat, foodName, { noDepends = false } = {}) {
  const question = cat.question.replace('{food}', foodName);
  const q = {
    id: `${cat.id}_${String(foodName).replace(/\s+/g, '_').slice(0, 20)}`,
    question,
    food_key:      foodName,
    measure_type:  cat.measure_type,
    measure_class: cat.measure_class,
    options: cat.options.map(opt => ({ ...opt })),
  };
  if (cat.depends_on && !noDepends) {
    q.depends_on = { ...cat.depends_on };
  }
  return q;
}

// ─── Legacy single-question export ────────────────────────────────────────────
// Kept for backward compat with code that calls buildFoodAwareClarification.
// Returns the first question or null.

export function buildFoodAwareClarification(foodName, fullInputText = '') {
  const qs = buildFoodClarifications(foodName, fullInputText);
  return qs.length > 0 ? qs[0] : null;
}

// ─── General quantity detector (non-protein foods) ────────────────────────────

export function textHasQuantityForFood(text, _foodName) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  if (/\d+\s*(?:גרם|ג['׳]|מ"ל|מ'ל)/.test(lower)) return true;
  if (/\b[1-9]\d?\b/.test(lower)) return true;
  if (/(?:^|\s)(?:אחת|שתיים|שתי|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר)(?:\s|$)/.test(lower)) return true;
  if (/(?:^|\s)(?:קטן|בינוני|גדול|קטנה|בינונית|גדולה)(?:\s|$)/.test(lower)) return true;
  if (/(?:^|\s)(?:כוס|חצי|רבע|כף|כפית|קומץ|מנה|פרוסה|פרוסות|יחידה)(?:\s|$)/.test(lower)) return true;
  return false;
}

// ─── Dedup helpers ────────────────────────────────────────────────────────────

/**
 * Infer the measure_class of an AI-generated question that lacks it.
 * Used for deduplication: same food_key + same measure_class = duplicate.
 */
export function inferMeasureClass(question) {
  const opts = (question.options || []).map(o => String(o.label || o.value || '')).join(' ');
  if (/קטן|בינוני|גדול|קטנה|בינונית|גדולה/.test(opts)) return 'size';
  if (/כף|כוס|כפית/.test(opts)) return 'quantity';
  if (/1|2|3|4|יחיד|פרוס|חתיכ|גביע/.test(opts)) return 'quantity';
  if (/מטוגן|מבושל|צלוי|שמן|בלי/.test(opts)) return 'preparation';
  return 'general';
}

/**
 * Infer the food_key an AI-generated question is about, from its question text + option labels.
 * This lets AI questions compete with the correct client question in the dedup set.
 * Returns null when the food cannot be reliably identified.
 */
export function inferFoodKeyFromQuestionText(question) {
  const text = String(
    (question?.question || '') + ' ' +
    (question?.options || []).map(o => o.label || o.value || '').join(' ')
  ).toLowerCase();
  if (/עוף|פרגית|שניצל|אנטריקוט|סטייק/.test(text)) return 'חזה עוף';
  if (/סלמון|ברמונדי|טילפיה|דניס|לברק/.test(text)) return 'סלמון';
  if (/אורז/.test(text)) return 'אורז';
  if (/בטטה/.test(text)) return 'בטטה';
  if (/תפוח\s*אדמה/.test(text)) return 'תפוח אדמה';
  if (/פסטה|ספגטי|מקרוני/.test(text)) return 'פסטה';
  if (/טחינה/.test(text)) return 'טחינה';
  if (/חביתה|אומלט/.test(text)) return 'חביתה';
  if (/ביצ/.test(text)) return 'ביצים';
  if (/לחם/.test(text)) return 'לחם';
  if (/אבוקדו/.test(text)) return 'אבוקדו';
  if (/פיצה/.test(text)) return 'פיצה';
  if (/סושי/.test(text)) return 'סושי';
  return null;
}

// ─── Answer formatting ─────────────────────────────────────────────────────────

/**
 * Format a clarification answer for sending back to the AI.
 * Embeds grams deterministically when known.
 */
export function formatAnswerForAI(answerObj) {
  if (!answerObj) return '';
  if (typeof answerObj === 'string') return answerObj;
  const text = String(answerObj.answer || answerObj.label || answerObj.value || '');
  const grams = answerObj.grams;
  if (grams && Number(grams) > 0) return `${text} (≈${grams} גרם)`;
  return text;
}
