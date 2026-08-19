import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Search, Pencil, RefreshCw, Camera, Upload, X, Copy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { saveAIFoodCorrection, normalizeFoodName, applyCanonicalLock } from './nutritionLearning';
import { toast } from 'sonner';
import {
  buildFoodClarifications,
  buildFoodAwareClarification,
  textHasQuantityForFood,
  textHasCountForFood,
  textHasSizeForFood,
  extractCountFromText,
  extractSizeFromText,
  computeProteinGrams,
  inferMeasureClass,
  inferFoodKeyFromQuestionText,
  formatAnswerForAI,
} from '@/components/shared/foodMeasurementConfig';

const MEAL_TYPES = [
  { value: 'breakfast', label: '🌅 ארוחת בוקר' },
  { value: 'lunch', label: '☀️ ארוחת צהריים' },
  { value: 'dinner', label: '🌙 ארוחת ערב' },
  { value: 'snack', label: '🍎 חטיף' },
];

const CONFIDENCE_LABELS = {
  high: { label: 'ביטחון גבוה', color: 'text-green-600 bg-green-50', emoji: '✅' },
  medium: { label: 'ביטחון בינוני', color: 'text-amber-600 bg-amber-50', emoji: '⚠️' },
  low: { label: 'ביטחון נמוך', color: 'text-red-600 bg-red-50', emoji: '❗' },
};

// Recalculate ingredient macros based on new grams using per100 as stable anchor
function recalcIngredient(ing, newGrams) {
  const origGrams = ing.quantity_grams || 100;
  const p100kcal    = ing.per100_kcal    || (origGrams > 0 ? (ing.calories || 0) / origGrams * 100 : 0);
  const p100protein = ing.per100_protein || (origGrams > 0 ? (ing.protein  || 0) / origGrams * 100 : 0);
  const p100carbs   = ing.per100_carbs   || (origGrams > 0 ? (ing.carbs    || 0) / origGrams * 100 : 0);
  const p100fat     = ing.per100_fat     || (origGrams > 0 ? (ing.fat      || 0) / origGrams * 100 : 0);
  return {
    ...ing,
    quantity_grams: newGrams,
    quantity_display: `${newGrams} גרם`,
    per100_kcal:    p100kcal,
    per100_protein: p100protein,
    per100_carbs:   p100carbs,
    per100_fat:     p100fat,
    calories: Math.round((p100kcal    / 100) * newGrams),
    protein:  Math.round(((p100protein / 100) * newGrams) * 10) / 10,
    carbs:    Math.round(((p100carbs   / 100) * newGrams) * 10) / 10,
    fat:      Math.round(((p100fat     / 100) * newGrams) * 10) / 10,
  };
}


function sumIngredients(ingredients) {
  const safeIngredients = Array.isArray(ingredients) ? ingredients : [];
  return {
    calories: Math.round(safeIngredients.reduce((s, i) => s + (i?.calories || 0), 0)),
    protein: Math.round(safeIngredients.reduce((s, i) => s + (i?.protein || 0), 0) * 10) / 10,
    carbs: Math.round(safeIngredients.reduce((s, i) => s + (i?.carbs || 0), 0) * 10) / 10,
    fat: Math.round(safeIngredients.reduce((s, i) => s + (i?.fat || 0), 0) * 10) / 10,
  };
}

function safeStringify(value) {
  const seen = new WeakSet();
  return JSON.stringify(value, (key, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }
    if (typeof val === 'function') return '[Function]';
    return val;
  }, 2);
}

function isNutritionAIDebugMode() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('debug_ai') === '1' || localStorage.getItem('nutrition_ai_debug') === 'true';
}

function normalizeEnrichedMealResult(data) {
  if (!data || !Array.isArray(data.items)) return data;
  const ingredients = data.items.map(item => ({
    name: item.name || item.name_he || item.food_name || 'מרכיב לא מזוהה',
    food_name: item.name || item.name_he || item.food_name || 'מרכיב לא מזוהה',
    quantity_grams: Number(item.grams || item.quantity_grams || item.amount || 100),
    quantity_display: item.quantity_display || `${Number(item.grams || item.quantity_grams || item.amount || 100)} גרם`,
    calories: Number(item.calories || 0),
    protein: Number(item.protein || 0),
    carbs: Number(item.carbs || 0),
    fat: Number(item.fat || 0),
    per100_kcal:    Number(item.per100_kcal    || 0),
    per100_protein: Number(item.per100_protein || 0),
    per100_carbs:   Number(item.per100_carbs   || 0),
    per100_fat:     Number(item.per100_fat     || 0),
    confidence: item.confidence || data.confidence || 'medium',
    source_text_segment: item.ai_confidence_note || item.assumption_note || '',
    nutrition_source: item.nutrition_source,
  }));
  const totals = sumIngredients(ingredients);
  return {
    success: true,
    can_analyze: true,
    analysis_pending: false,
    estimated: data.confidence !== 'high',
    needsClarification: !!data.needs_clarification,
    confidence: data.confidence || 'medium',
    uncertainty_note: data.notes || null,
    meal_name: data.meal_name,
    total_calories: totals.calories,
    total_protein: totals.protein,
    total_carbs: totals.carbs,
    total_fat: totals.fat,
    ingredients,
    foods: ingredients,
    // Only keep AI questions that have both a non-empty question text AND at least one option.
    // The AI frequently returns questions with empty text or no options; those are unusable.
    // Normalize options: AI returns strings like ["50 גרם","100 גרם"] but the UI expects
    // objects with {label, value}. Convert strings → {label: opt, value: opt}.
    // Also map grams_equivalent → grams so both sources use the same field name.
    clarifying_questions: (data.clarifying_questions || []).filter(
      q => q?.question && String(q.question).trim() && Array.isArray(q.options) && q.options.length > 0
    ).map(q => ({
      ...q,
      options: q.options.map(opt => {
        if (typeof opt === 'string') return { label: opt, value: opt };
        return { ...opt, grams: opt.grams || opt.grams_equivalent || null };
      }),
    })),
    questions: (data.clarifying_questions || []).filter(
      q => q?.question && String(q.question).trim() && Array.isArray(q.options) && q.options.length > 0
    ).map(q => ({
      ...q,
      options: q.options.map(opt => {
        if (typeof opt === 'string') return { label: opt, value: opt };
        return { ...opt, grams: opt.grams || opt.grams_equivalent || null };
      }),
    })),
    debugLogId: data.debugLogId,
    wrapper_used: !!data.wrapper_used || !!data.safe_wrapper,
    fallback_used: !!data.fallback_used,
    text_pipeline: data.text_pipeline || data.pipeline || null,
    items_count: data.items_count ?? ingredients.length,
    questions_count: data.questions_count ?? (data.clarifying_questions || []).length,
    error_stage: data.error_stage || null,
    debug_pipeline: data.debug_pipeline || null,
  };
}

function normalizeAnalysisResult(data, input) {
  const enrichedResult = normalizeEnrichedMealResult(data);
  if (enrichedResult?.ingredients?.length) {
    // ALWAYS merge client-side food-aware questions with AI questions when not high confidence.
    // Previously only merged when AI returned ZERO questions — this was the root cause of the
    // production failure where AI returned one size question but rice/potato got nothing.
    // Now: client questions always come first; AI questions used as additional fallback.
    if (enrichedResult.confidence !== 'high') {
      const merged = getSmartQuestions(data, input, enrichedResult.clarifying_questions);
      enrichedResult.clarifying_questions = merged;
      enrichedResult.questions = merged;
    }
    return enrichedResult;
  }
  const fallback = buildClientFallbackMeal(input);
  const fallbackHasNutrition = Number(fallback?.total_calories || 0) > 0 && Array.isArray(fallback?.ingredients) && fallback.ingredients.length > 0;
  if (!data || typeof data !== 'object') return fallback;
  const hasNutritionValues = Number(data?.total_calories || 0) > 0 && Array.isArray(data?.ingredients) && data.ingredients.length > 0;
  if ((data?.analysis_pending === true || data?.confidence === 'low' || !hasNutritionValues) && fallbackHasNutrition) {
    return fallback;
  }
  const isPending = !hasNutritionValues && (data?.analysis_pending === true || data?.confidence === 'low');
  const ingredients = isPending ? [] : (Array.isArray(data?.ingredients) && data.ingredients.length > 0 ? data.ingredients : fallback.ingredients);
  const questions = getSmartQuestions(data, input, fallback.clarifying_questions);
  return {
    success: true,
    can_analyze: true,
    analysis_pending: isPending,
    estimated: !isPending && (data?.estimated === true || data?.confidence !== 'high'),
    needsClarification: !isPending && (data?.needsClarification === true || data?.confidence !== 'high'),
    confidence: ['high', 'medium', 'low'].includes(data?.confidence) ? data.confidence : 'low',
    uncertainty_note: data?.uncertainty_note || fallback.uncertainty_note,
    meal_name: data?.meal_name || fallback.meal_name,
    total_calories: isPending ? 0 : Number(data?.total_calories || fallback.total_calories || 0),
    total_protein: isPending ? 0 : Number(data?.total_protein || fallback.total_protein || 0),
    total_carbs: isPending ? 0 : Number(data?.total_carbs || fallback.total_carbs || 0),
    total_fat: isPending ? 0 : Number(data?.total_fat || fallback.total_fat || 0),
    ingredients,
    foods: ingredients,
    clarifying_questions: questions,
    questions
  };
}

function getSmartQuestions(data, input, fallbackQuestions = []) {
  const confidence = ['high', 'medium', 'low'].includes(data?.confidence) ? data.confidence : 'low';
  if (confidence === 'high') return [];
  if (isGoodEnoughClientEstimate(input, data)) return [];

  const normalizeOpts = q => ({
    ...q,
    options: (q.options || []).map(opt => typeof opt === 'string' ? { label: opt, value: opt } : opt),
  });
  // AI questions from either data.clarifying_questions or the passed fallbackQuestions
  const rawQuestions = (Array.isArray(data?.clarifying_questions) && data.clarifying_questions.length > 0
    ? data.clarifying_questions
    : fallbackQuestions
  ).map(normalizeOpts);

  const highImpactQuestions = buildClientHighImpactQuestions(input);
  const hasExplicitQuantity = /\d+|חצי|כף|כפית|כוס|פרוס|משולש|גרם|מנה/.test(String(input || '').toLowerCase());

  const seen = new Set();
  const unique = [...highImpactQuestions, ...rawQuestions]
    .filter(q => q?.question)
    .filter(q => !isClientVagueQuestion(q))
    .filter(q => {
      // For dedup, resolve food_key: use explicit field first, then infer from question text
      // (AI questions lack food_key; inferring lets them compete with client questions correctly)
      const resolvedFoodKey = q.food_key || inferFoodKeyFromQuestionText(q);
      const mc = q.measure_class || inferMeasureClass(q);
      // Dedup key: food_key + measure_class — different measure_classes (count vs size) for
      // the same food are allowed; same food + same class → keep first (client wins)
      const dedupKey = resolvedFoodKey
        ? `${resolvedFoodKey}_${mc}`
        : String(q.id || q.question).toLowerCase().replace(/\s+/g, '_');
      if (seen.has(dedupKey)) return false;
      seen.add(dedupKey);
      return true;
    })
    .filter(q => questionPriority(q) < 90)
    .sort((a, b) => questionPriority(a) - questionPriority(b));

  // No slice cap — all necessary questions must be queued for multi-food meals.
  // One-at-a-time UI ensures the user isn't overwhelmed.
  return unique;
}

function isGoodEnoughClientEstimate(input, data) {
  const text = String(input || '').toLowerCase();
  const hasExplicitQuantity = /\d+|חצי|כף|כפית|כוס|פרוס|משולש|גרם|מנה|אישית|קופסא|קופסה/.test(text);
  const simpleKnownMeal = /פיצה|pizza|קפה|coffee|חזה עוף|chicken breast|אורז|rice|לחם|bread|ביצה|egg|חביתה|טונה|חלה|לחמנ/.test(text);
  const hasHighImpactAmbiguity = (/בשמן|מטוגן|מיונז|חמאה|רוטב|מסעדה/.test(text) || /חביתה|אומלט|omelet/.test(text)) && !/ביצה\s*קשה|קשה|מבושל|סוננ|בלי שמן|ללא שמן|כפית|כף|לייט|דל/.test(text);
  // High-impact unknowns: tahini/avocado/sauce quantity — always ask even with explicit quantity
  const hasHighImpactUnknown = /טחינה|אבוקדו|מיונז|שמן|חמאה|רוטב/.test(text) && !/\d+\s*(גרם|מ"ל|כף|כפית)|כפית\s+\w+|כף\s+\w+/.test(text);
  const hasReasonableResult = Number(data?.total_calories || 0) > 0 && Array.isArray(data?.ingredients) && data.ingredients.length > 0;
  return hasExplicitQuantity && simpleKnownMeal && hasReasonableResult && !hasHighImpactAmbiguity && !hasHighImpactUnknown;
}

function buildClientHighImpactQuestions(input) {
  const text = String(input || '').toLowerCase();
  const questions = [];

  // ── Omelette: ask oil amount when NOT explicitly "without oil" ─────────────
  if (/חביתה|אומלט|omelet/i.test(text) &&
      !/ביצה\s*קשה|קשה|מבושל|בלי שמן|ללא שמן|ללא חמאה|בלי חמאה/.test(text)) {
    const hasOilAmount = /כפית\s+שמן|כף\s+שמן|כפית\s+חמאה|כף\s+חמאה/.test(text);
    if (!hasOilAmount) {
      questions.push({
        id: 'egg_oil_fat',
        question: 'כמה שמן/חמאה השתמשת?',
        measure_class: 'preparation',
        options: [
          { label: 'בלי',         value: 'none',     grams: 0  },
          { label: 'כפית',        value: 'tsp_oil',  grams: 4  },
          { label: 'כף',          value: 'tbsp_oil', grams: 14 },
          { label: 'חמאה (כף)',   value: 'butter',   grams: 14 },
        ],
      });
    }
  }

  // ── Tuna in oil ────────────────────────────────────────────────────────────
  if (/טונה/.test(text) && /בשמן/.test(text) && !/סוננ|סיננ/.test(text)) {
    questions.push({
      id: 'tuna_oil_drained',
      question: 'הטונה סוננה מהשמן?',
      measure_class: 'preparation',
      options: [
        { label: 'כן, סוננה', value: 'drained',  grams: null },
        { label: 'חלקית',     value: 'partial',  grams: null },
        { label: 'לא',        value: 'with_oil', grams: null },
      ],
    });
  }

  // ── Coffee additions ───────────────────────────────────────────────────────
  if (/קפה|coffee/i.test(text) && !/סוכר|ללא סוכר|בלי סוכר|חלב|דל|רגיל/.test(text)) {
    questions.push({
      id: 'coffee_additions',
      question: 'הקפה היה עם תוספות?',
      measure_class: 'preparation',
      options: [
        { label: 'בלי',      value: 'plain',  grams: null },
        { label: 'עם חלב',   value: 'milk',   grams: null },
        { label: 'עם סוכר',  value: 'sugar',  grams: null },
        { label: 'חלב + סוכר', value: 'both', grams: null },
      ],
    });
  }

  // ── Pasta sauce type ───────────────────────────────────────────────────────
  if (/פסטה|pasta/i.test(text) && /רוטב/.test(text) &&
      !/שמנת|עגבניות|פסטו|בולונז|קרמי/.test(text)) {
    questions.push({
      id: 'pasta_sauce',
      question: 'מה סוג הרוטב?',
      measure_class: 'type',
      options: [
        { label: 'עגבניות', value: 'tomato',    grams: null },
        { label: 'שמנת',    value: 'cream',     grams: null },
        { label: 'שמן זית', value: 'olive_oil', grams: null },
        { label: 'פסטו',    value: 'pesto',     grams: null },
      ],
    });
  }

  // ── Food-category-aware questions (using new two-step system) ─────────────
  const FOOD_TOKENS = [
    'תפוח', 'בננה', 'אגס', 'מנגו', 'אפרסק', 'שזיף',
    'ביצה', 'ביצים',
    'לחם', 'חלה', 'לחמנייה', 'לחמניה', 'פיתה',
    'אורז', 'פסטה', 'קינואה', 'בורגול', 'כוסמת',
    'טחינה', 'חומוס', 'מיונז', 'אבוקדו',
    'חזה עוף', 'פרגית', 'שניצל', 'קציצה', 'סלמון',
    'פיצה', 'סושי', 'מאקי',
    'יוגורט', 'קוטג', 'גבינה לבנה',
    'אגוזים', 'שקדים', 'קשיו',
  ];

  // Dedup key: food_key + measure_class — allows count and size to coexist for same food
  const seenDedup = new Set(questions.map(q => `${q.food_key || q.id}_${q.measure_class || 'general'}`));

  for (const token of FOOD_TOKENS) {
    if (!text.includes(token)) continue;
    // buildFoodClarifications returns 0, 1, or 2 questions for this food
    const clarifications = buildFoodClarifications(token, input);
    for (const q of clarifications) {
      const dedupKey = `${q.food_key || q.id}_${q.measure_class || 'general'}`;
      if (seenDedup.has(dedupKey)) continue;
      seenDedup.add(dedupKey);
      questions.push(q);
    }
  }

  return questions;
}

function isClientVagueQuestion(question) {
  const text = String(question?.question || '').toLowerCase().trim();
  return /מה גודל המנה|אפשר עוד פרטים|מה בדיוק אכלת|איזה סוג אוכל|ספר לי עוד|גודל המנה\??$/.test(text);
}

function questionPriority(question) {
  // Priority based on measure_type/measure_class — lower = asked first.
  // Count-step questions must precede size-step questions for the same food.
  const mt = question?.measure_type || '';
  const mc = question?.measure_class || '';

  // Step 1: count of pieces (proteins, potato) — always first
  if (mt === 'count_pieces') return 1;
  // Household quantity questions (rice, tahini, eggs, bread, pizza, sushi…)
  if (['count', 'volume', 'spoons', 'portion', 'container', 'handful'].includes(mt)) return 2;
  // Preparation questions (oil in omelette, tuna draining)
  if (mc === 'preparation') return 3;
  // Food type questions (pasta sauce, cheese type)
  if (mc === 'type') return 4;
  // Step 2: piece size (proteins, potato) — always after count for same food
  if (mt === 'size_pieces') return 5;
  // Size questions for whole fruits / single-dimension foods
  if (mt === 'size') return 6;
  // Vague/general AI questions (no typed measure_type) — last
  return 20;
}

function getQuestionKey(question) {
  return String(question?.id || question?.question || '').toLowerCase().replace(/\s+/g, '_');
}

function getVisibleClarificationQuestions(result, answers) {
  const answered = new Set(Object.keys(answers || {}).map(k => String(k).toLowerCase().replace(/\s+/g, '_')));
  const questions = Array.isArray(result?.clarifying_questions) ? result.clarifying_questions : [];
  return questions.filter(q => !answered.has(getQuestionKey(q)));
}

function getClientHebrewQuantityBefore(text, foodPattern, fallback = 0) {
  const match = text.match(new RegExp('(\\d+|אחת|שתיים|שתי|שלוש|ארבע|חצי)\\s*(?:[א-ת\"]+\\s+){0,3}' + foodPattern));
  if (!match) return fallback;
  const value = match[1];
  const words = { אחת: 1, שתיים: 2, שתי: 2, שלוש: 3, ארבע: 4, חצי: 0.5 };
  return words[value] || Number(value) || fallback;
}

function buildClientCommonIsraeliMealEstimate(input) {
  const text = String(input || '').toLowerCase();
  const ingredients = [];

  const avocadoMatch = text.match(/(\d+)\s*(?:גרם|ג׳)\s*אבוקדו/);
  if (avocadoMatch) {
    const grams = Number(avocadoMatch[1]);
    const factor = grams / 100;
    ingredients.push({ name: 'אבוקדו', quantity_grams: grams, quantity_display: `${grams} גרם`, calories: Math.round(160 * factor), protein: Math.round(2 * factor * 10) / 10, carbs: Math.round(8.5 * factor * 10) / 10, fat: Math.round(14.7 * factor * 10) / 10 });
  }

  const eggMatch = text.match(/(\d+|אחת|שתיים|שתי|שלוש|ארבע)\s*(?:ביצי|ביצים|ביצה)\s*עין/);
  if (eggMatch) {
    const words = { אחת: 1, שתיים: 2, שתי: 2, שלוש: 3, ארבע: 4 };
    const eggs = words[eggMatch[1]] || Number(eggMatch[1]) || 1;
    ingredients.push({ name: 'ביצי עין', quantity_grams: eggs * 55, quantity_display: `${eggs} ביצי עין ≈ ${eggs * 55} גרם`, calories: Math.round(90 * eggs), protein: Math.round(6.3 * eggs * 10) / 10, carbs: Math.round(0.6 * eggs * 10) / 10, fat: Math.round(7 * eggs * 10) / 10 });
  }

  const whiteCheeseMatch = text.match(/(\d+)\s*כפיות\s*גבינה\s*לבנה(?:[^\d]|\s)*(?:5\s*%|5\s*אחוז)?/);
  if (whiteCheeseMatch) {
    const teaspoons = Number(whiteCheeseMatch[1]);
    const grams = teaspoons * 5;
    const factor = grams / 100;
    ingredients.push({ name: 'גבינה לבנה 5%', quantity_grams: grams, quantity_display: `${teaspoons} כפיות ≈ ${grams} גרם`, calories: Math.round(97 * factor), protein: Math.round(8 * factor * 10) / 10, carbs: Math.round(6 * factor * 10) / 10, fat: Math.round(3 * factor * 10) / 10 });
  }

  const rollMatch = text.match(/(?:^|\s)(?:ו)?לחמנ(?:יה|ייה)|(?:^|\s)לחמנ(?:יה|ייה)/);
  if (rollMatch) {
    ingredients.push({ name: 'לחמנייה', quantity_grams: 70, quantity_display: '1 לחמנייה רגילה ≈ 70 גרם', calories: 190, protein: 6, carbs: 36, fat: 2.2 });
  }

  if (ingredients.length < 2) return null;
  const totals = sumIngredients(ingredients);
  return { success: true, can_analyze: true, analysis_pending: false, estimated: true, needsClarification: false, confidence: 'medium', uncertainty_note: 'חושב לפי כמויות סטנדרטיות למרכיבים שצוינו', meal_name: input || 'ארוחה משוערת', total_calories: totals.calories, total_protein: totals.protein, total_carbs: totals.carbs, total_fat: totals.fat, ingredients, foods: ingredients, clarifying_questions: [], questions: [] };
}

function buildClientKnownClearTextEstimate(input) {
  const text = String(input || '').toLowerCase();
  const commonEstimate = buildClientCommonIsraeliMealEstimate(input);
  if (commonEstimate) return commonEstimate;
  const saladEggEstimate = buildClientSaladHardBoiledEggEstimate(input);
  if (saladEggEstimate) return saladEggEstimate;
  const hasQuantity = /\d+\s*(פרוס|כפ|גרם|יחיד|מנה|כוס)|אחת|שתיים|שתי|שלוש|ארבע|חצי|פרוסות|כפות|כפיות|יחידה/.test(text);
  const hasKnownFood = /חלה\s*קלה|חלה|גבינה\s*צהובה|קטשופ/.test(text);
  if (!hasQuantity || !hasKnownFood) return null;

  const ingredients = [];
  const challahSlices = getClientHebrewQuantityBefore(text, 'חלה', 0);
  if (challahSlices > 0) {
    ingredients.push({ name: 'חלה קלה', quantity_grams: challahSlices * 25, quantity_display: `${challahSlices} פרוסות ≈ ${challahSlices * 25} גרם`, calories: Math.round(challahSlices * 70), protein: Math.round(challahSlices * 3 * 10) / 10, carbs: Math.round(challahSlices * 14 * 10) / 10, fat: Math.round(challahSlices * 0.8 * 10) / 10 });
  }

  const cheeseSlices = getClientHebrewQuantityBefore(text, 'גבינה', 0);
  if (cheeseSlices > 0) {
    ingredients.push({ name: text.includes('28') ? 'גבינה צהובה 28%' : 'גבינה צהובה', quantity_grams: cheeseSlices * 20, quantity_display: `${cheeseSlices} פרוסות ≈ ${cheeseSlices * 20} גרם`, calories: Math.round(cheeseSlices * 80), protein: Math.round(cheeseSlices * 6 * 10) / 10, carbs: Math.round(cheeseSlices * 0.3 * 10) / 10, fat: Math.round(cheeseSlices * 6 * 10) / 10 });
  }

  const ketchupTbsp = getClientHebrewQuantityBefore(text, 'קטשופ', 0);
  if (ketchupTbsp > 0) {
    ingredients.push({ name: 'קטשופ', quantity_grams: ketchupTbsp * 17, quantity_display: `${ketchupTbsp} כפות ≈ ${ketchupTbsp * 17} גרם`, calories: Math.round(ketchupTbsp * 18), protein: 0, carbs: Math.round(ketchupTbsp * 4.4 * 10) / 10, fat: 0 });
  }

  if (!ingredients.length) return null;
  const totals = sumIngredients(ingredients);
  const questions = [{ id: 'slice_thickness', question: 'הפרוסות היו דקות או רגילות?', options: [{ label: 'דקות', value: 'thin' }, { label: 'רגילות', value: 'regular' }, { label: 'עבות', value: 'thick' }] }];
  return { success: true, can_analyze: true, analysis_pending: false, estimated: true, needsClarification: true, confidence: 'medium', uncertainty_note: 'ביטחון בינוני — מבוסס על פרוסות סטנדרטיות', meal_name: input || 'ארוחה משוערת', total_calories: totals.calories, total_protein: totals.protein, total_carbs: totals.carbs, total_fat: totals.fat, ingredients, foods: ingredients, clarifying_questions: questions, questions };
}

function buildClientSaladHardBoiledEggEstimate(input) {
  const text = String(input || '').toLowerCase();
  if (!/סלט/.test(text) || !/ביצה\s*קשה|ביצה\s*מבושלת/.test(text)) return null;
  const saladGrams = Number(text.match(/(\d+)\s*(?:גרם|ג׳)/)?.[1] || 100);
  const ingredients = [
    { name: 'סלט ירקות', quantity_grams: saladGrams, quantity_display: `${saladGrams} גרם`, calories: Math.round(saladGrams * 0.22), protein: Math.round(saladGrams * 0.01 * 10) / 10, carbs: Math.round(saladGrams * 0.04 * 10) / 10, fat: Math.round(saladGrams * 0.002 * 10) / 10 },
    { name: 'ביצה קשה', quantity_grams: 55, quantity_display: '1 יחידה ≈ 55 גרם', calories: 78, protein: 6.3, carbs: 0.6, fat: 5.3 }
  ];
  const totals = sumIngredients(ingredients);
  return { success: true, can_analyze: true, analysis_pending: false, estimated: true, needsClarification: false, confidence: 'high', uncertainty_note: null, meal_name: 'סלט ירקות וביצה קשה', total_calories: totals.calories, total_protein: totals.protein, total_carbs: totals.carbs, total_fat: totals.fat, ingredients, foods: ingredients, clarifying_questions: [], questions: [] };
}

function buildClientFallbackMeal(input) {
  const text = String(input || '').toLowerCase();
  const clearTextEstimate = buildClientKnownClearTextEstimate(input);
  if (clearTextEstimate) return clearTextEstimate;
  const isPizza = text.includes('pizza') || text.includes('פיצה');
  const quantity = Number(text.match(/(\d+)/)?.[1] || 1);
  const questions = isPizza ? [
    { id: 'pizza_size', question: 'המשולשים היו בגודל רגיל או משפחתי?', options: [{ label: 'רגיל', value: 'regular' }, { label: 'משפחתי', value: 'family' }] },
  ] : buildClientHighImpactQuestions(input);
  if (!isPizza) {
    return {
      success: true,
      can_analyze: true,
      analysis_pending: true,
      estimated: false,
      needsClarification: true,
      confidence: 'low',
      uncertainty_note: 'צריך עוד פרט קצר לפני שאחשב ערכים — כדי לא להמציא קלוריות ומאקרו',
      meal_name: input || 'ארוחה שדורשת הבהרה',
      total_calories: 0,
      total_protein: 0,
      total_carbs: 0,
      total_fat: 0,
      ingredients: [],
      foods: [],
      clarifying_questions: questions,
      questions
    };
  }
  const ingredient = {
    name: 'פיצה',
    quantity_grams: quantity * 100,
    quantity_display: `${quantity} משולשים — הערכה`,
    calories: quantity * 280,
    protein: quantity * 12,
    carbs: quantity * 30,
    fat: quantity * 10,
  };
  return {
    success: true,
    can_analyze: true,
    estimated: true,
    needsClarification: true,
    confidence: 'low',
    uncertainty_note: 'הערכה בטוחה — אפשר לדייק עם תשובות לשאלות',
    meal_name: isPizza ? `${quantity} משולשי פיצה` : (input || 'ארוחה משוערת'),
    total_calories: ingredient.calories,
    total_protein: ingredient.protein,
    total_carbs: ingredient.carbs,
    total_fat: ingredient.fat,
    ingredients: [ingredient],
    foods: [ingredient],
    clarifying_questions: questions,
    questions
  };
}

// ─── ClarificationQueue component ─────────────────────────────────────────────
// Renders ONE question at a time from the clarification queue.
// After each answer the next unanswered question automatically becomes active.
// All answers accumulate; re-analysis runs once at the end.

function ClarificationQueue({ allQuestions, visibleQuestions, answers, onAnswer, onCustomGrams, onTextAnswer, onSubmit, allAnswered, getKey, isComplete, show, isProcessing = false, stableTotalCount = 0 }) {
  if (!show || !allQuestions.length) return null;

  // First unanswered visible question is the active one
  const question = visibleQuestions.find(q => !isComplete(answers[getKey(q)], q));

  // Use stableTotalCount when available — prevents the progress counter from
  // jumping when the server returns a different number of questions.
  const totalInQueue = stableTotalCount > 0 ? Math.max(stableTotalCount, allQuestions.length) : allQuestions.length;
  const answeredInQueue = allQuestions.filter(q => isComplete(answers[getKey(q)], q)).length;
  const remaining = totalInQueue - answeredInQueue;

  const questionKey    = question ? getKey(question) : null;
  const answerState    = questionKey ? (answers[questionKey] || {}) : {};
  const currentAnswer  = answerState.answer || '';
  const isCustomMode   = answerState._custom_grams_mode === true;
  const opts           = question?.options || [];
  const isCountType    = ['count', 'count_pieces'].includes(question?.measure_type);
  const useCompactRow  = isCountType && opts.filter(o => o.value !== 'custom_grams' && o.value !== 'more_custom').length <= 5;

  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
      {/* Progress header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-amber-900">
          {remaining === 1 ? 'עוד פרט אחד לדיוק:' : `נשארו ${remaining} פרטים לדיוק:`}
        </p>
        {totalInQueue > 1 && (
          <p className="text-xs text-amber-500">{answeredInQueue}/{totalInQueue}</p>
        )}
      </div>

      {/* Active question card */}
      {question && (
        <div className="rounded-lg bg-white p-3 border border-amber-100 space-y-2">
          <p className="text-sm font-semibold text-amber-900">{question.question}</p>

          {/* Answer options */}
          <div className={useCompactRow ? 'flex gap-1.5 flex-wrap' : 'grid grid-cols-2 gap-2'}>
            {opts.filter(o => o.value !== 'custom_grams' && o.value !== 'more_custom').map((option, idx) => {
              const selected = String(currentAnswer) === String(option.label || option.value) && !isCustomMode;
              return (
                <button
                  key={`${questionKey}-${idx}`}
                  type="button"
                  onClick={() => onAnswer(question, option)}
                  className={[
                    'rounded-xl border text-sm font-medium transition-colors active:scale-95',
                    useCompactRow ? 'flex-1 min-w-[44px] py-2.5 px-2' : 'py-3 px-2 w-full',
                    selected
                      ? 'bg-amber-300 border-amber-400 text-amber-950'
                      : 'bg-white border-amber-200 text-amber-800 hover:bg-amber-50',
                  ].join(' ')}
                >
                  {option.label || option.value}
                </button>
              );
            })}
          </div>

          {/* Custom grams toggle */}
          {opts.some(o => o.value === 'custom_grams' || o.value === 'more_custom') && (
            <button
              type="button"
              onClick={() => onAnswer(question, { value: 'custom_grams', label: 'אני יודע את המשקל', grams: null })}
              className={[
                'w-full rounded-xl border text-sm py-2.5 px-3 transition-colors',
                isCustomMode
                  ? 'bg-teal-100 border-teal-300 text-teal-900'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              אני יודע את המשקל
            </button>
          )}

          {/* Gram input when custom mode active */}
          {isCustomMode && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number"
                min="1"
                max="9999"
                placeholder="כמה גרם?"
                defaultValue={answerState.grams || ''}
                onChange={e => onCustomGrams(question, e.target.value)}
                className="flex-1 rounded-lg border border-teal-300 bg-white px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-300"
                dir="rtl"
                autoFocus
              />
              <span className="text-sm text-slate-500 flex-shrink-0">גרם</span>
            </div>
          )}

          {/* Free-text fallback */}
          {!isCustomMode && (
            <input
              type="text"
              value={opts.some(o => (o.label || o.value) === currentAnswer) ? '' : currentAnswer}
              onChange={e => onTextAnswer(question, e.target.value)}
              placeholder="או כתוב תשובה אחרת..."
              className="w-full rounded-md border border-amber-200 bg-white/60 px-3 py-1.5 text-xs text-right text-amber-900 placeholder:text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-300"
              dir="rtl"
            />
          )}
        </div>
      )}

      {/* Inline processing state — shown when clarification reanalysis is in-flight.
          The modal does NOT wipe; this spinner appears INSIDE the ClarificationQueue. */}
      {isProcessing && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-amber-700">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>מעבד תשובות ומחשב מחדש...</span>
        </div>
      )}

      {/* Submit — only when all answered */}
      <Button
        onClick={onSubmit}
        disabled={!allAnswered || isProcessing}
        className="w-full text-white font-medium"
        style={{ backgroundColor: (allAnswered && !isProcessing) ? '#79DBD6' : '#cbd5e1' }}
      >
        {isProcessing ? 'מחשב מחדש...' : allAnswered ? 'נתח מחדש לפי התשובות ←' : `ענה על ${remaining} שאלות נוספות`}
      </Button>
    </div>
  );
}

export default function AIAnalyzeMealDialog({ open, onClose, onSave, onSaveAsync, selectedDate, defaultMealType }) {
  const [step, setStep] = useState('input'); // input | analyzing | result | edit | manual
  const [description, setDescription] = useState('');
  const [result, setResult] = useState(null);
  const [editIngredients, setEditIngredients] = useState([]); // for ingredient editing
  const [error, setError] = useState(null);
  const [selectedMealType, setSelectedMealType] = useState('lunch');
  const [showIngredients, setShowIngredients] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [clarificationAnswers, setClarificationAnswers] = useState({});
  // Separate clarification processing state — NEVER uses setStep('analyzing').
  // Keeps the result view stable while a clarification reanalysis is in flight.
  const [isClarifying, setIsClarifying] = useState(false);
  // Stable question count: set on first result, only allowed to grow.
  // Prevents the progress counter from jumping when the API returns different questions.
  const [clarificationTotalCount, setClarificationTotalCount] = useState(0);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [learningSaved, setLearningSaved] = useState(false);
  const [debugReport, setDebugReport] = useState(null);
  const [reanalyzingIngredientIndex, setReanalyzingIngredientIndex] = useState(null);
  const [ingredientCorrectionKey, setIngredientCorrectionKey] = useState(null);
  const [ingredientCorrectionText, setIngredientCorrectionText] = useState('');
  const [hadAICorrection, setHadAICorrection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    enabled: open,
  });

  const { data: trainee } = useQuery({
    queryKey: ['aiAnalyzeCorrectionTrainee', user?.email],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      return trainees[0] || null;
    },
    enabled: !!user?.email && open,
  });

  const { data: personalFoods = [] } = useQuery({
    queryKey: ['aiAnalysisPersonalFoods', trainee?.id],
    queryFn: () => base44.entities.UserFoodItem.filter({ trainee_id: trainee.id }),
    enabled: !!trainee?.id && open,
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (open) setSelectedMealType(defaultMealType || 'lunch');
  }, [open, defaultMealType]);

  // Manual edit state (fallback when no AI result)
  const [manualCalories, setManualCalories] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [manualName, setManualName] = useState('');

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const preview = URL.createObjectURL(file);
      setPhotoPreview(preview);
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPhotoUrl(file_url);
    } catch (err) {
      console.error('Photo upload failed:', err);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = () => {
    setPhotoUrl(null);
    setPhotoPreview(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const handleAnalyze = async (answersOverride = clarificationAnswers, structuredAnswers = null) => {
    const mealDescription = description.trim() || (photoUrl ? 'נתח את הארוחה בתמונה' : '');
    if (!mealDescription) return;
    const safeAnswersOverride = answersOverride?.nativeEvent ? clarificationAnswers : answersOverride;
    setStep('analyzing');
    setError(null);
    try {
      const res = await base44.functions.invoke('analyzeAndEnrichMealPhoto', {
        meal_text: mealDescription,
        image_url: photoUrl || undefined,
        user_answers: Object.keys(safeAnswersOverride || {}).length ? safeAnswersOverride : undefined,
        structured_answers: structuredAnswers || undefined,
        user_notes: feedbackText || undefined,
      });
      const rawData = res?.data?.response ?? res?.data;
      const data = normalizeAnalysisResult(rawData, mealDescription);
      data.debugLogId = rawData?.debugLogId;
      // Override AI estimates with canonical learned per100 values for known foods
      if (data.ingredients?.length && personalFoods?.length) {
        data.ingredients = applyCanonicalLock(data.ingredients, personalFoods);
        data.foods = data.ingredients;
        const canonicalTotals = sumIngredients(data.ingredients);
        data.total_calories = canonicalTotals.calories;
        data.total_protein  = canonicalTotals.protein;
        data.total_carbs    = canonicalTotals.carbs;
        data.total_fat      = canonicalTotals.fat;
      }
      setDebugReport({
        debugLogId: rawData?.debugLogId,
        inputText: mealDescription,
        status: rawData?.analysis_pending ? 'CLARIFICATION_REQUIRED' : 'PARSE_SUCCESS',
        currentStep: rawData?.analysis_pending ? 'clarification_required' : 'analysis_result_ready',
        errorMessage: rawData?.errorMessage || rawData?.fallback_reason || '',
        pipeline: rawData?.text_pipeline || rawData?.pipeline || null,
        wrapper_used: !!rawData?.wrapper_used || !!rawData?.safe_wrapper,
        fallback_used: !!rawData?.fallback_used,
        items_count: rawData?.items_count ?? rawData?.items?.length ?? data?.ingredients?.length ?? 0,
        questions_count: rawData?.questions_count ?? rawData?.clarifying_questions?.length ?? data?.clarifying_questions?.length ?? 0,
        error_stage: rawData?.error_stage || null
      });
      setResult(data);
      setEditIngredients(data?.ingredients?.map(i => ({ ...i })) || []);
      setLearningSaved(false);
      setManualName(data?.meal_name || description);
      setManualCalories(String(Math.round(data?.total_calories || 0)));
      setManualProtein(String(Math.round(data?.total_protein || 0)));
      setManualCarbs(String(Math.round(data?.total_carbs || 0)));
      setManualFat(String(Math.round(data?.total_fat || 0)));
      // Reset clarification session tracking for a brand new initial analysis
      const qCount = Array.isArray(data?.clarifying_questions) ? data.clarifying_questions.length : 0;
      setClarificationTotalCount(qCount);
      setClarificationAnswers({});
      setStep('result');
    } catch (err) {
      console.warn('[AI_NUTRITION_UI_TRACE] fallback_activation:', err?.response?.data || err?.message);
      const fallback = buildClientFallbackMeal(mealDescription);
      setResult(fallback);
      setEditIngredients(fallback.ingredients.map(i => ({ ...i })));
      setLearningSaved(false);
      setManualName(fallback.meal_name);
      setManualCalories(String(fallback.total_calories));
      setManualProtein(String(fallback.total_protein));
      setManualCarbs(String(fallback.total_carbs));
      setManualFat(String(fallback.total_fat));
      setDebugReport({ debugLogId: fallback.debugLogId || null, inputText: mealDescription, status: 'ERROR', currentStep: 'ui_fallback_result', errorMessage: typeof err?.message === 'string' ? err.message : 'analysis failed' });
      setError(null);
      setStep('result');
    }
  };

  const handleIngredientGramsChange = (index, newGrams) => {
    const grams = Number(newGrams);
    if (isNaN(grams) || grams < 0) return;
    setEditIngredients(prev => {
      const updated = [...prev];
      updated[index] = recalcIngredient(updated[index], grams);
      return updated;
    });
    setLearningSaved(false);
  };

  const handleIngredientFieldChange = (index, field, value) => {
    setEditIngredients(prev => {
      const updated = [...prev];
      const numericFields = ['calories', 'protein', 'carbs', 'fat', 'quantity_grams', 'estimated_grams'];
      updated[index] = {
        ...updated[index],
        [field]: numericFields.includes(field) ? Number(value || 0) : value,
      };
      if (field === 'name') updated[index].food_name = value;
      if (field === 'quantity_grams') updated[index].estimated_grams = Number(value || 0);
      // When user edits a macro directly, recompute its per100 anchor so future gram changes stay accurate
      const ing = updated[index];
      const grams = ing.quantity_grams || 100;
      if (field === 'calories')  updated[index].per100_kcal    = grams > 0 ? (Number(value || 0) / grams) * 100 : 0;
      if (field === 'protein')   updated[index].per100_protein = grams > 0 ? (Number(value || 0) / grams) * 100 : 0;
      if (field === 'carbs')     updated[index].per100_carbs   = grams > 0 ? (Number(value || 0) / grams) * 100 : 0;
      if (field === 'fat')       updated[index].per100_fat     = grams > 0 ? (Number(value || 0) / grams) * 100 : 0;
      return updated;
    });
    setLearningSaved(false);
  };

  const handleIngredientDelete = (index) => {
    setEditIngredients(prev => prev.filter((_, i) => i !== index));
    setLearningSaved(false);
  };

  const updateResultIngredients = (ingredients) => {
    const safeIngredients = Array.isArray(ingredients) ? ingredients : [];
    const totals = sumIngredients(safeIngredients);
    setResult(prev => prev ? {
      ...prev,
      ingredients: safeIngredients,
      foods: safeIngredients,
      total_calories: totals.calories,
      total_protein: totals.protein,
      total_carbs: totals.carbs,
      total_fat: totals.fat,
      items_count: safeIngredients.length,
    } : prev);
    setEditIngredients(safeIngredients.map(item => ({ ...item })));
    setLearningSaved(false);
  };

  const handleResultIngredientDelete = (index) => {
    updateResultIngredients((result?.ingredients || []).filter((_, i) => i !== index));
  };

  const handleResultIngredientReanalyze = async (index, correctionNote = '') => {
    const ingredient = result?.ingredients?.[index];
    if (!ingredient) return;
    const note = String(correctionNote || '').trim();
    if (!note) {
      setIngredientCorrectionKey(`result-${index}`);
      setIngredientCorrectionText('');
      return;
    }
    setReanalyzingIngredientIndex(index);
    try {
      const res = await base44.functions.invoke('analyzeSingleNutritionItemAI', {
        item: ingredient,
        item_name: ingredient.name || ingredient.food_name,
        grams: Number(ingredient.quantity_grams || ingredient.estimated_grams || 100) || 100,
        correction_note: note
      });
      const updatedRaw = res?.data?.item ?? res?.data?.response ?? res?.data;
      const corrGrams = Number(updatedRaw?.quantity_grams || updatedRaw?.amount || ingredient.quantity_grams || 100) || 100;
      const corrCal   = Number(updatedRaw?.calories || 0);
      const corrProt  = Number(updatedRaw?.protein  || 0);
      const corrCarbs = Number(updatedRaw?.carbs    || 0);
      const corrFat   = Number(updatedRaw?.fat      || 0);
      const updatedIngredient = {
        ...updatedRaw,
        quantity_grams:   corrGrams,
        quantity_display: `${corrGrams} גרם`,
        calories: corrCal,
        protein:  corrProt,
        carbs:    corrCarbs,
        fat:      corrFat,
        per100_kcal:    corrGrams > 0 ? Math.round((corrCal  / corrGrams) * 100)       : 0,
        per100_protein: corrGrams > 0 ? Math.round((corrProt / corrGrams) * 1000) / 10 : 0,
        per100_carbs:   corrGrams > 0 ? Math.round((corrCarbs/ corrGrams) * 1000) / 10 : 0,
        per100_fat:     corrGrams > 0 ? Math.round((corrFat  / corrGrams) * 1000) / 10 : 0,
      };
      updateResultIngredients((result?.ingredients || []).map((item, itemIndex) => itemIndex === index ? { ...item, ...updatedIngredient } : item));
      setIngredientCorrectionKey(null);
      setIngredientCorrectionText('');
      setHadAICorrection(true);
      toast.success('המרכיב תוקן עם AI');
    } finally {
      setReanalyzingIngredientIndex(null);
    }
  };

  const handleIngredientReanalyze = async (index, correctionNote = '') => {
    const ingredient = editIngredients[index];
    if (!ingredient) return;
    const note = String(correctionNote || '').trim();
    if (!note) {
      setIngredientCorrectionKey(`edit-${index}`);
      setIngredientCorrectionText('');
      return;
    }
    setReanalyzingIngredientIndex(index);
    try {
      const res = await base44.functions.invoke('analyzeSingleNutritionItemAI', {
        item: ingredient,
        item_name: ingredient.name || ingredient.food_name,
        grams: Number(ingredient.quantity_grams || ingredient.estimated_grams || 100) || 100,
        correction_note: note
      });
      const updatedRaw = res?.data?.item ?? res?.data?.response ?? res?.data;
      const corrGrams = Number(updatedRaw?.quantity_grams || updatedRaw?.amount || ingredient.quantity_grams || 100) || 100;
      const corrCal   = Number(updatedRaw?.calories || 0);
      const corrProt  = Number(updatedRaw?.protein  || 0);
      const corrCarbs = Number(updatedRaw?.carbs    || 0);
      const corrFat   = Number(updatedRaw?.fat      || 0);
      const updatedIngredient = {
        ...updatedRaw,
        quantity_grams:   corrGrams,
        quantity_display: `${corrGrams} גרם`,
        calories: corrCal,
        protein:  corrProt,
        carbs:    corrCarbs,
        fat:      corrFat,
        per100_kcal:    corrGrams > 0 ? Math.round((corrCal  / corrGrams) * 100)       : 0,
        per100_protein: corrGrams > 0 ? Math.round((corrProt / corrGrams) * 1000) / 10 : 0,
        per100_carbs:   corrGrams > 0 ? Math.round((corrCarbs/ corrGrams) * 1000) / 10 : 0,
        per100_fat:     corrGrams > 0 ? Math.round((corrFat  / corrGrams) * 1000) / 10 : 0,
      };
      setEditIngredients(prev => prev.map((item, itemIndex) => itemIndex === index ? { ...item, ...updatedIngredient } : item));
      setIngredientCorrectionKey(null);
      setIngredientCorrectionText('');
      setHadAICorrection(true);
      setLearningSaved(false);
      toast.success('הפריט נותח מחדש');
    } finally {
      setReanalyzingIngredientIndex(null);
    }
  };

  const saveEditedIngredientsToMemory = async () => {
    console.log('[LEARN-TRACE] saveEditedIngredientsToMemory entered', {
      hastrainee: !!trainee, trainee_id: trainee?.id,
      hasUser: !!user,
      editIngredients_length: editIngredients.length,
      editIngredients_names: editIngredients.map(i => i.name || i.food_name),
      step,
    });
    if (!trainee || !user || !editIngredients.length) {
      console.warn('[LEARN-TRACE] EARLY RETURN — guard failed:', { trainee: !!trainee, user: !!user, count: editIngredients.length });
      return;
    }
    const learningUpdates = [];
    try {
    for (let i = 0; i < editIngredients.length; i += 1) {
      const ing = editIngredients[i];
      console.log(`[LEARN-TRACE] loop i=${i}/${editIngredients.length - 1} → calling saveAIFoodCorrection for "${ing.name || ing.food_name}"`);
      const original = result?.ingredients?.[i] || ing;
      // step==='edit' means the user manually changed values → allowed to update canonical.
      // step==='result' means the user accepted the AI result → canonical must be preserved.
      const isManualCorrection = step === 'edit' || hadAICorrection;
      const savedLearningRecord = await saveAIFoodCorrection({
        user,
        trainee,
        originalItem: {
          ...original,
          name: original.name || original.food_name,
          source_text_segment: original.source_text_segment,
          original_ai_estimate: original,
        },
        correctedMeal: {
          food_name: ing.name || ing.food_name,
          meal_type: selectedMealType,
          quantity: Number(ing.quantity_grams || ing.estimated_grams || 100) || 100,
          unit: 'gram',
          grams_equivalent: Number(ing.quantity_grams || ing.estimated_grams || 100) || 100,
          grams_final: Number(ing.quantity_grams || ing.estimated_grams || 100) || 100,
          corrected_grams: Number(ing.quantity_grams || ing.estimated_grams || 100) || 100,
          calories: Number(ing.calories || 0),
          protein: Number(ing.protein || 0),
          carbs: Number(ing.carbs || 0),
          fat: Number(ing.fat || 0),
          original_ai_text: description,
          source_text_segment: ing.source_text_segment || original.source_text_segment || ing.quantity_display || ing.name,
          original_ai_estimate: original,
        },
        imageContext: photoUrl || '',
        notes: description,
        isManualCorrection,
      });
      console.log(`[LEARN-TRACE] loop i=${i} DONE → recordId=${savedLearningRecord?.id ?? 'null (returned null)'}`);
      learningUpdates.push({ ingredient: ing.name || ing.food_name, recordId: savedLearningRecord?.id, saved: true });
    }
    console.log('[LEARN-TRACE] all iterations completed', learningUpdates);
    setLearningSaved(true);
    toast.success('נשמר ללמידה ✅');
    } catch (err) {
      console.error('[LEARN-TRACE] *** LOOP ABORTED BY EXCEPTION ***', {
        message: err?.message,
        stack: err?.stack?.split('\n').slice(0, 4),
        completed_so_far: learningUpdates,
        remaining_ingredients: editIngredients.slice(learningUpdates.length).map(i => i.name || i.food_name),
      });
      throw err;
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const _d = selectedDate instanceof Date && !isNaN(selectedDate) ? selectedDate : new Date();
      const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(_d);
      const baseFields = {
        meal_type: selectedMealType,
        date: dateStr,
        notes: `ניתוח AI: ${description}`,
        learning_event_type: step === 'edit' || step === 'manual' || feedbackText ? 'correction' : 'ai',
        ai_original_food_name: result?.meal_name || description,
      };

      if (step === 'manual') {
        // No ingredient breakdown — save as one combined entry
        const mealData = {
          ...baseFields,
          debugLogId: result?.debugLogId,
          food_name: manualName || description,
          calories: Number(manualCalories),
          protein: Number(manualProtein),
          carbs: Number(manualCarbs),
          fat: Number(manualFat),
          quantity: 1,
          unit: 'unit',
          grams_equivalent: null,
          grams_final: null,
        };
        if (trainee) {
          const savedFood = await saveAIFoodCorrection({
            user,
            trainee,
            originalItem: { name: result?.meal_name || description },
            correctedMeal: { ...mealData, trainee_email: trainee.user_email },
            imageContext: photoUrl || '',
            notes: feedbackText || description,
          });
          mealData.user_food_item_id = savedFood?.id;
          mealData.food_database_scope = 'personal';
          toast.success('נשמר — אלמד להשתמש בזה בפעם הבאה ✅');
        }
        onSave(mealData);
      } else {
        // result or edit — save each ingredient as a separate MealEntry
        // Learning is non-critical: wrap so a UserFoodItem failure never blocks the diary save.
        if ((step === 'edit' || step === 'result') && trainee) {
          await saveEditedIngredientsToMemory().catch(learningErr => {
            console.warn('[AIAnalyzeMealDialog] learning save failed (non-fatal):', learningErr.message);
          });
        }
        const ingredients = step === 'edit'
          ? editIngredients
          : (result?.ingredients || []);
        console.log(`[SMOKE] saving ${ingredients.length} ingredients, step=${step}`);
        for (let i = 0; i < ingredients.length; i++) {
          const ing = ingredients[i];
          // Safety-net canonical lock: re-apply in case personalFoods loaded after analysis ran.
          // This ensures the MealEntry always receives canonical per100, not a stale AI estimate.
          const lockedIng = personalFoods?.length ? applyCanonicalLock([ing], personalFoods)[0] : ing;
          const grams = Number(lockedIng.quantity_grams || lockedIng.estimated_grams || 100) || 100;
          // Derive per100 from locked ingredient — canonical if known, AI fallback for new foods
          const per100_kcal    = lockedIng.per100_kcal    || (grams > 0 ? (lockedIng.calories || 0) / grams * 100 : 0);
          const per100_protein = lockedIng.per100_protein || (grams > 0 ? (lockedIng.protein  || 0) / grams * 100 : 0);
          const per100_carbs   = lockedIng.per100_carbs   || (grams > 0 ? (lockedIng.carbs    || 0) / grams * 100 : 0);
          const per100_fat     = lockedIng.per100_fat     || (grams > 0 ? (lockedIng.fat      || 0) / grams * 100 : 0);
          // Round only at final storage stage — always computed from per100 anchor
          const calories = Math.round((per100_kcal    / 100) * grams);
          const protein  = Math.round(((per100_protein / 100) * grams) * 10) / 10;
          const carbs    = Math.round(((per100_carbs   / 100) * grams) * 10) / 10;
          const fat      = Math.round(((per100_fat     / 100) * grams) * 10) / 10;
          console.log(`[SMOKE] ingredient ${i + 1}/${ingredients.length}:`, {
            name: lockedIng.name || lockedIng.food_name,
            grams,
            calories, protein, carbs, fat,
            per100_kcal: per100_kcal.toFixed(4),
            per100_protein: per100_protein.toFixed(4),
            per100_carbs: per100_carbs.toFixed(4),
            per100_fat: per100_fat.toFixed(4),
            had_stored_per100: !!(lockedIng.per100_kcal),
            nutrition_source: lockedIng.nutrition_source || 'ai',
          });
          await onSaveAsync({
            ...baseFields,
            debugLogId: i === 0 ? result?.debugLogId : undefined,
            food_name: lockedIng.name || lockedIng.food_name || description,
            calories,
            protein,
            carbs,
            fat,
            quantity: grams,
            unit: 'gram',
            grams_equivalent: grams,
            grams_final: grams,
            per100_kcal,
            per100_protein,
            per100_carbs,
            per100_fat,
            food_database_scope: step === 'edit' ? 'personal' : 'ai',
          });
        }
      }

      handleClose();
    } catch (err) {
      console.error('[AIAnalyzeMealDialog] Save error:', err);
      toast.error('שגיאה בשמירת הארוחה — חלק מהמרכיבים לא נשמרו. נסה שוב.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setStep('input');
    setDescription('');
    setResult(null);
    setEditIngredients([]);
    setError(null);
    setShowIngredients(false);
    setFeedbackText('');
    setShowFeedback(false);
    setClarificationAnswers({});
    setIsClarifying(false);
    setClarificationTotalCount(0);
    setPhotoUrl(null);
    setPhotoPreview(null);
    setLearningSaved(false);
    setDebugReport(null);
    setReanalyzingIngredientIndex(null);
    setIngredientCorrectionKey(null);
    setIngredientCorrectionText('');
    setHadAICorrection(false);
    onClose();
  };

  const handleReanalyze = async () => {
    if (!feedbackText.trim()) return;
    setShowFeedback(false);
    await handleAnalyze();
  };

  const handleClarificationAnswer = (question, option) => {
    const isCustom = option.value === 'custom_grams' || option.value === 'more_custom';

    if (isCustom) {
      setClarificationAnswers(prev => ({
        ...prev,
        [getQuestionKey(question)]: {
          question:      question.question,
          food_key:      question.food_key,
          measure_type:  question.measure_type,
          measure_class: question.measure_class,
          answer:        option.value,
          grams:         null,
          _custom_grams_mode: true,
        },
      }));
      return;
    }

    if (question.measure_type === 'count_pieces') {
      // Step 1 of two-step protein: store resolved_count, grams stays null until size answered
      const resolved_count = option.resolved_count ?? null;
      setClarificationAnswers(prev => ({
        ...prev,
        [getQuestionKey(question)]: {
          question:       question.question,
          food_key:       question.food_key,
          measure_type:   question.measure_type,
          measure_class:  question.measure_class,
          answer:         option.label || option.value,
          grams:          null,          // not computable until size is selected
          resolved_count,                // stored for size-step calculation
          _custom_grams_mode: false,
        },
      }));
      return;
    }

    if (question.measure_type === 'size_pieces') {
      // Step 2 of two-step protein: compute grams = resolvedCount × unit_grams
      // resolvedCount comes from: (a) parent answer in state, or (b) text extraction
      const parentCountAnswer = (() => {
        // Find the count answer for the same food_key
        for (const [, ans] of Object.entries(clarificationAnswers)) {
          if (ans.food_key === question.food_key && ans.measure_type === 'count_pieces') {
            return ans;
          }
        }
        return null;
      })();

      const resolvedCount =
        parentCountAnswer?.resolved_count ??
        extractCountFromText(description);   // fallback: extract from original input text

      const unitGrams = option.unit_grams ?? null;

      // Compute deterministic grams — NO defaults if either value is unknown
      const totalGrams = computeProteinGrams(resolvedCount, unitGrams);

      const answerLabel = resolvedCount != null
        ? `${resolvedCount} × ${option.label} (≈${totalGrams ?? '?'} גרם)`
        : option.label;

      setClarificationAnswers(prev => ({
        ...prev,
        [getQuestionKey(question)]: {
          question:       question.question,
          food_key:       question.food_key,
          measure_type:   question.measure_type,
          measure_class:  question.measure_class,
          answer:         answerLabel,
          grams:          totalGrams,    // null if count was not resolved
          resolved_count: resolvedCount,
          _custom_grams_mode: false,
        },
      }));
      return;
    }

    // Standard single-step answer
    const grams = option.grams ?? option.grams_equivalent ?? null;
    setClarificationAnswers(prev => ({
      ...prev,
      [getQuestionKey(question)]: {
        question:       question.question,
        food_key:       question.food_key,
        measure_type:   question.measure_type,
        measure_class:  question.measure_class,
        answer:         option.label || option.value,
        grams,
        _custom_grams_mode: false,
      },
    }));
  };

  const handleClarificationCustomGrams = (question, gramsValue) => {
    const g = Number(gramsValue);
    setClarificationAnswers(prev => ({
      ...prev,
      [getQuestionKey(question)]: {
        ...prev[getQuestionKey(question)],
        answer:  g > 0 ? `${g} גרם` : 'custom_grams',
        grams:   g > 0 ? g : null,
        _custom_grams_mode: true,
      },
    }));
  };

  const handleClarificationTextAnswer = (question, value) => {
    setClarificationAnswers(prev => ({
      ...prev,
      [getQuestionKey(question)]: {
        question:       question.question,
        food_key:       question.food_key,
        measure_type:   question.measure_type,
        measure_class:  question.measure_class,
        answer:         value,
        grams:          null,
        _custom_grams_mode: false,
      },
    }));
  };

  // Build a structured per-ingredient gram map from resolved answers.
  // Only includes answers where grams are definitively known.
  const buildStructuredAnswers = (answers) => {
    const structured = {};
    for (const ans of Object.values(answers)) {
      const key = ans.food_key;
      if (!key || ans.grams == null) continue;
      // Size answers overwrite count answers for the same food (size answer has the final grams)
      if (!structured[key] || ans.measure_class === 'size') {
        structured[key] = { grams: ans.grams, label: ans.answer };
      }
    }
    return Object.keys(structured).length > 0 ? structured : null;
  };

  // Merges a refined API result with the previous result to prevent ingredient loss.
  // If the refined result is missing ingredients that were in the original, they are
  // carried forward so the user never sees a meal shrink due to an AI omission.
  const mergeRefinedResult = (previousResult, refinedResult) => {
    const prevIngs = Array.isArray(previousResult?.ingredients) ? previousResult.ingredients : [];
    const newIngs  = Array.isArray(refinedResult?.ingredients)  ? refinedResult.ingredients  : [];
    if (!prevIngs.length) return refinedResult;

    const normName = n => (n || '').toLowerCase().trim().replace(/\s+/g, ' ');

    // Find ingredients in the previous result that are absent from the refined result.
    const missingIngs = prevIngs.filter(pi =>
      !newIngs.some(ni =>
        normName(ni.name) === normName(pi.name) ||
        normName(ni.name).includes(normName(pi.name)) ||
        normName(pi.name).includes(normName(ni.name))
      )
    );

    if (!missingIngs.length) return refinedResult; // nothing lost — accept as-is

    // One or more original ingredients were dropped by the AI.
    // Merge them back: refined foods are authoritative, originals fill the gap.
    const merged = [...newIngs, ...missingIngs];
    const totals = sumIngredients(merged);
    return {
      ...refinedResult,
      ingredients: merged,
      foods: merged,
      total_calories: totals.calories,
      total_protein:  totals.protein,
      total_carbs:    totals.carbs,
      total_fat:      totals.fat,
      items_count:    merged.length,
      _merged_missing: missingIngs.map(i => i.name),
    };
  };

  // Dedicated clarification submit — DOES NOT call setStep('analyzing').
  // The modal stays visible and stable; only an inline spinner appears inside
  // the ClarificationQueue. Answers accumulate in state and are submitted once.
  const handleSubmitClarifications = async () => {
    if (isClarifying) return; // prevent double-submit
    const structured = buildStructuredAnswers(clarificationAnswers);
    const mealText = description.trim() || (photoUrl ? 'נתח את הארוחה בתמונה' : '');
    if (!mealText) return;

    setIsClarifying(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('analyzeAndEnrichMealPhoto', {
        meal_text: mealText,
        image_url: photoUrl || undefined,
        user_answers: Object.keys(clarificationAnswers).length ? clarificationAnswers : undefined,
        structured_answers: structured || undefined,
        user_notes: feedbackText || undefined,
      });
      const rawData = res?.data?.response ?? res?.data;
      const data = normalizeAnalysisResult(rawData, mealText);

      // Apply canonical lock for personal foods
      if (data.ingredients?.length && personalFoods?.length) {
        data.ingredients = applyCanonicalLock(data.ingredients, personalFoods);
        data.foods = data.ingredients;
        const t = sumIngredients(data.ingredients);
        data.total_calories = t.calories;
        data.total_protein  = t.protein;
        data.total_carbs    = t.carbs;
        data.total_fat      = t.fat;
      }

      // Structural guard: merge back any ingredients the AI dropped.
      // This prevents the meal from shrinking to 1 food when the AI focused
      // only on the ingredient being clarified and omitted others.
      const safeData = mergeRefinedResult(result, data);

      // Update result without changing step — modal stays visible and stable.
      setResult(safeData);
      setEditIngredients(safeData?.ingredients?.map(i => ({ ...i })) || []);
      setLearningSaved(false);

      // Grow question count only — never let it shrink (prevents progress reset).
      const newQCount = Array.isArray(safeData?.clarifying_questions) ? safeData.clarifying_questions.length : 0;
      setClarificationTotalCount(prev => Math.max(prev, newQCount));

      if (safeData._merged_missing?.length) {
        console.warn('[CLARIFICATION] AI dropped ingredients, merged back:', safeData._merged_missing);
      }
    } catch (err) {
      setError('לא ניתן לחשב מחדש כרגע — ניתן לשמור את הניתוח הקיים.');
    } finally {
      setIsClarifying(false);
    }
  };

  const goManual = () => {
    setManualName(description);
    setStep('manual');
  };

  const copyDebugReport = async () => {
    const report = debugReport || { debugLogId: result?.debugLogId, inputText: description, status: result?.analysis_pending ? 'CLARIFICATION_REQUIRED' : 'PARSE_SUCCESS', currentStep: step, errorMessage: error || '' };
    await navigator.clipboard.writeText(safeStringify(report));
    toast.success('דוח התקלה הועתק');
  };

  const goEdit = () => {
    setEditIngredients(result.ingredients?.map(i => ({ ...i })) || []);
    setStep('edit');
  };

  const editTotals = step === 'edit' ? sumIngredients(editIngredients) : null;
  const resultHasNutrition = result && Number(result.total_calories || 0) > 0 && Array.isArray(result.ingredients) && result.ingredients.length > 0;
  const displayConfidenceKey = resultHasNutrition ? result.confidence : 'low';
  const confidence = result ? CONFIDENCE_LABELS[displayConfidenceKey] || CONFIDENCE_LABELS.medium : null;
  const allClarificationQuestions = Array.isArray(result?.clarifying_questions) ? result.clarifying_questions : [];
  const shouldShowClarificationQuestions = allClarificationQuestions.length > 0 && result?.confidence !== 'high';
  // A question with depends_on is visible only when:
  //   (a) its parent (same food_key, count_pieces) is answered with a non-custom value, OR
  //   (b) the parent question is absent from the current set (count came from input text)
  //       AND the count is reliably resolvable from input text.
  const isDependencySatisfied = (question, answers, allQuestions) => {
    if (!question.depends_on) return true;  // no dependency — always visible
    const { parent_measure_type, exclude_values = [] } = question.depends_on;
    // Find the parent question in the current set
    const parentQ = allQuestions.find(pq =>
      pq.food_key === question.food_key && pq.measure_type === parent_measure_type
    );
    if (!parentQ) {
      // Parent question absent → count came from input text.
      // Dependency satisfied only when text extraction actually succeeded.
      return extractCountFromText(description) !== null;
    }
    // Parent exists — check if it has been answered with a non-excluded value
    const parentAns = answers[getQuestionKey(parentQ)];
    if (!parentAns) return false;
    const parentValue = parentAns.answer || '';
    if (exclude_values.some(v => parentAns.value === v || parentValue === v)) return false;
    // Also check: if parent is in custom_grams mode with no grams yet → not satisfied
    if (parentAns._custom_grams_mode && !parentAns.grams) return false;
    return true;
  };

  const isClarificationAnswerComplete = (answerState, question) => {
    if (!answerState) return false;
    const answer = String(answerState.answer || '').trim();
    if (!answer) return false;
    // custom_grams mode: incomplete until a positive gram value is typed
    if (answerState._custom_grams_mode && (!answerState.grams || answerState.grams <= 0)) return false;
    // Count-step (step 1 of protein): complete as soon as any non-custom answer is selected
    // grams is intentionally null here — that's OK
    if (question?.measure_type === 'count_pieces' && !answerState._custom_grams_mode) return true;
    // Size-step (step 2 of protein): complete only when grams are computed
    if (question?.measure_type === 'size_pieces') {
      return answerState.grams !== null && answerState.grams > 0;
    }
    return true;
  };

  // Visible questions: apply dependency filter so size questions only show after count answered
  const visibleClarificationQuestions = allClarificationQuestions.filter(q =>
    isDependencySatisfied(q, clarificationAnswers, allClarificationQuestions)
  );

  // All-answered: every question in the FULL queue must be complete (including dependent ones
  // that became visible after count was answered). This ensures we never submit partial data.
  const answeredClarificationCount = allClarificationQuestions.filter(q =>
    isClarificationAnswerComplete(clarificationAnswers[getQuestionKey(q)], q)
  ).length;
  const allClarificationsAnswered = shouldShowClarificationQuestions &&
    allClarificationQuestions.length > 0 &&
    allClarificationQuestions.every(q =>
      isClarificationAnswerComplete(clarificationAnswers[getQuestionKey(q)], q) ||
      !isDependencySatisfied(q, clarificationAnswers, allClarificationQuestions)
    );
  const showPipelineDebug = isNutritionAIDebugMode() && !photoUrl && result;
  const pipelineDebug = result?.debug_pipeline || result || {};

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md w-full max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Search className="w-5 h-5 text-teal-500" />
            נתח ארוחה עם AI
          </DialogTitle>
        </DialogHeader>

        {/* STEP: INPUT */}
        {step === 'input' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">אפשר לכתוב או לדבר חופשי — אני אתמקד במאכלים, כמויות, צורת הכנה ותוספות</p>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="לדוגמה: אכלתי עכשיו 3 חתיכות חזה עוף עם אורז וסלט, היה קצת שמן זית"
              className="min-h-[100px] text-right text-base"
              dir="rtl"
            />

            {/* Photo upload */}
            <div>
              {photoPreview ? (
                <div className="relative inline-block">
                  <img src={photoPreview} alt="תמונת הארוחה" className="h-28 w-28 object-cover rounded-lg border border-slate-200" />
                  {uploadingPhoto && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-lg">
                      <Loader2 className="w-5 h-5 text-teal-500 animate-spin" />
                    </div>
                  )}
                  {!uploadingPhoto && (
                    <button
                      onClick={removePhoto}
                      className="absolute -top-2 -left-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  <p className="text-xs text-green-600 mt-1">📸 תמונה תשמש לניתוח מדויק יותר</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 text-sm text-slate-600 hover:text-teal-600 border border-dashed border-slate-300 hover:border-teal-400 rounded-lg px-3 py-2 transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    צלם עכשיו
                  </button>
                  <button
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 text-sm text-slate-600 hover:text-teal-600 border border-dashed border-slate-300 hover:border-teal-400 rounded-lg px-3 py-2 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    העלה מהגלריה
                  </button>
                </div>
              )}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoUpload}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                data-testid="analyze-meal-submit"
                onClick={() => handleAnalyze()}
                disabled={(!description.trim() && !photoUrl) || uploadingPhoto}
                className="flex-1 text-white"
                style={{ backgroundColor: '#79DBD6' }}
              >
                <Search className="w-4 h-4 ml-1" />
                נתח עם AI
              </Button>
              <Button variant="outline" onClick={goManual} className="flex-shrink-0">
                <Pencil className="w-4 h-4 ml-1" />
                ידני
              </Button>
            </div>
          </div>
        )}

        {/* STEP: ANALYZING */}
        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-10 h-10 text-teal-500 animate-spin" />
            <p className="text-slate-700 font-medium">מנתח את הארוחה...</p>
            <p className="text-sm text-slate-400">
              {photoUrl ? 'מנתח תמונה + מרכיבים...' : 'מזהה מרכיבים ומחשב ערכים תזונתיים'}
            </p>
          </div>
        )}

        {/* STEP: RESULT */}
        {step === 'result' && result && (
          <div className="space-y-4">
            {/* Input echo */}
            <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600 flex gap-2 items-start">
              {photoPreview && <img src={photoPreview} alt="" className="h-10 w-10 object-cover rounded flex-shrink-0" />}
              <span><span className="font-medium text-slate-700">הזנת: </span>{description}</span>
            </div>

            {/* Confidence badge */}
            {confidence && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${confidence.color}`}>
                <span>{confidence.emoji}</span>
                <span>{confidence.label}</span>
                {result.uncertainty_note && (
                  <span className="font-normal text-xs mr-auto">{result.uncertainty_note}</span>
                )}
              </div>
            )}

            {showPipelineDebug && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600" dir="ltr">
                <div className="font-semibold text-slate-700">Pipeline: {pipelineDebug.text_pipeline || pipelineDebug.pipeline || 'unknown'}</div>
                <div>wrapper_used: {String(!!pipelineDebug.wrapper_used)} | fallback_used: {String(!!pipelineDebug.fallback_used)}</div>
                <div>items_count: {pipelineDebug.items_count ?? result.ingredients?.length ?? 0} | questions_count: {pipelineDebug.questions_count ?? result.clarifying_questions?.length ?? 0}</div>
                <div>error_stage: {pipelineDebug.error_stage || 'none'}</div>
              </div>
            )}

            <ClarificationQueue
              allQuestions={allClarificationQuestions}
              visibleQuestions={visibleClarificationQuestions}
              answers={clarificationAnswers}
              onAnswer={handleClarificationAnswer}
              onCustomGrams={handleClarificationCustomGrams}
              onTextAnswer={handleClarificationTextAnswer}
              onSubmit={handleSubmitClarifications}
              allAnswered={allClarificationsAnswered}
              getKey={getQuestionKey}
              isComplete={isClarificationAnswerComplete}
              show={shouldShowClarificationQuestions}
              isProcessing={isClarifying}
              stableTotalCount={clarificationTotalCount}
            />

            {/* Meal name */}
            <h3 className="text-lg font-bold text-slate-800">{result.meal_name}</h3>

            {result.analysis_pending && !resultHasNutrition && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
                <p>הניתוח לא הושלם. נוצר דוח תקלה למאמן.</p>
                <Button size="sm" variant="outline" onClick={copyDebugReport} className="bg-white border-amber-300 text-amber-900">
                  <Copy className="w-3.5 h-3.5 ml-1" />
                  העתק דוח תקלה
                </Button>
              </div>
            )}

            {/* Macros grid */}
            {resultHasNutrition && <div className="grid grid-cols-4 gap-2 text-center bg-white rounded-xl border border-slate-200 p-3">
              <div>
                <p className="text-xl font-bold text-emerald-600">{Math.round(result.total_calories)}</p>
                <p className="text-xs text-slate-500">קל׳</p>
              </div>
              <div>
                <p className="text-lg font-bold text-blue-600">{Math.round(result.total_protein)}ג׳</p>
                <p className="text-xs text-slate-500">חלבון</p>
              </div>
              <div>
                <p className="text-lg font-bold text-orange-600">{Math.round(result.total_carbs)}ג׳</p>
                <p className="text-xs text-slate-500">פחמימות</p>
              </div>
              <div>
                <p className="text-lg font-bold text-purple-600">{Math.round(result.total_fat)}ג׳</p>
                <p className="text-xs text-slate-500">שומן</p>
              </div>
            </div>}

            {/* Ingredients accordion */}
            {resultHasNutrition && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors"
                  onClick={() => setShowIngredients(!showIngredients)}
                >
                  <span>פירוט מרכיבים ({result.ingredients.length})</span>
                  {showIngredients ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showIngredients && (
                  <div className="divide-y divide-slate-100">
                    {result.ingredients.map((ing, i) => (
                      <div key={i} className="px-4 py-2.5">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-700">{ing.name}</p>
                            <p className="text-xs text-slate-400">{ing.quantity_display}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              ח: {Math.round(ing.protein)}ג׳ | פ: {Math.round(ing.carbs)}ג׳ | ש: {Math.round(ing.fat)}ג׳
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            <p className="text-sm font-semibold text-emerald-600">{Math.round(ing.calories)} קל׳</p>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleResultIngredientReanalyze(i)}
                                disabled={reanalyzingIngredientIndex === i}
                                className="min-h-0 min-w-0 h-7 px-2 rounded-md border border-teal-100 text-[11px] text-teal-700 bg-white hover:bg-teal-50 disabled:opacity-50"
                              >
                                {reanalyzingIngredientIndex === i ? 'מנתח...' : 'תקן AI'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResultIngredientDelete(i)}
                                className="min-h-0 min-w-0 h-7 px-2 rounded-md border border-red-100 text-[11px] text-red-600 bg-white hover:bg-red-50"
                              >
                                מחק
                              </button>
                            </div>
                          </div>
                        </div>
                        {ingredientCorrectionKey === `result-${i}` && (
                          <div className="mt-3 rounded-lg border border-teal-100 bg-teal-50 p-2 space-y-2">
                            <Textarea
                              value={ingredientCorrectionText}
                              onChange={e => setIngredientCorrectionText(e.target.value)}
                              placeholder={`מה לתקן ב${ing.name || 'הפריט'}? לדוגמה: הכמות היא 80 גרם / זה היה עם שמן / זה לא המרכיב הנכון`}
                              className="min-h-[64px] text-sm text-right bg-white"
                              dir="rtl"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleResultIngredientReanalyze(i, ingredientCorrectionText)}
                                disabled={!ingredientCorrectionText.trim() || reanalyzingIngredientIndex === i}
                                className="flex-1 text-white"
                                style={{ backgroundColor: '#79DBD6' }}
                              >
                                שלח תיקון ל-AI
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setIngredientCorrectionKey(null);
                                  setIngredientCorrectionText('');
                                }}
                              >
                                ביטול
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Meal type selector */}
            <div>
              <p className="text-sm text-slate-600 mb-1 font-medium">איפה להוסיף?</p>
              <Select value={selectedMealType} onValueChange={setSelectedMealType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map(mt => (
                    <SelectItem key={mt.value} value={mt.value}>{mt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Feedback / Re-analyze */}
            {showFeedback ? (
              <div className="space-y-2 border border-amber-200 bg-amber-50 rounded-lg p-3">
                <p className="text-sm font-medium text-amber-800">מה לא מדויק? (לדוגמה: "הכמות של הלחם היא 4 פרוסות, לא 2")</p>
                <Textarea
                  value={feedbackText}
                  onChange={e => setFeedbackText(e.target.value)}
                  placeholder="תאר מה לתקן..."
                  className="min-h-[60px] text-sm text-right bg-white"
                  dir="rtl"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleReanalyze}
                    disabled={!feedbackText.trim()}
                    className="flex-1 text-white text-sm"
                    style={{ backgroundColor: '#79DBD6' }}
                  >
                    <RefreshCw className="w-3.5 h-3.5 ml-1" />
                    נתח מחדש
                  </Button>
                  <Button variant="outline" onClick={() => setShowFeedback(false)} className="text-sm">ביטול</Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowFeedback(true)}
                className="text-xs text-slate-400 hover:text-slate-600 text-center w-full py-1"
              >
                ⚠️ משהו לא מדויק? לחץ לתיקון
              </button>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              {resultHasNutrition && (
                <Button
                  onClick={handleSave}
                  disabled={isSaving || isClarifying || shouldShowClarificationQuestions}
                  className="flex-1 text-white"
                  style={{ backgroundColor: (isSaving || isClarifying || shouldShowClarificationQuestions) ? '#a7f3d0' : '#79DBD6' }}
                  title={shouldShowClarificationQuestions ? 'ענה על שאלות הדיוק לפני השמירה' : ''}
                >
                  {isSaving ? 'שומר...' : isClarifying ? 'מעבד...' : shouldShowClarificationQuestions ? 'ענה על שאלות הדיוק תחילה' : 'הוסף ליומן'}
                </Button>
              )}
              {resultHasNutrition && (
                <Button variant="outline" onClick={goEdit} className="flex-shrink-0" disabled={isClarifying}>
                  <Pencil className="w-4 h-4 ml-1" />
                  ערוך כמויות
                </Button>
              )}
              <Button variant="outline" onClick={() => setStep('input')} className="flex-shrink-0">
                נסה שוב
              </Button>
            </div>
          </div>
        )}

        {/* STEP: EDIT INGREDIENTS */}
        {step === 'edit' && result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">ערוך כמויות מרכיבים</p>
              <p className="text-xs text-slate-400">שנה גרמים → הערכים מחושבים אוטומטית</p>
            </div>

            {/* Live totals */}
            {editTotals && (
              <div className="grid grid-cols-4 gap-2 text-center bg-teal-50 rounded-xl border border-teal-200 p-3">
                <div>
                  <p className="text-lg font-bold text-emerald-600">{editTotals.calories}</p>
                  <p className="text-xs text-slate-500">קל׳</p>
                </div>
                <div>
                  <p className="text-base font-bold text-blue-600">{editTotals.protein}ג׳</p>
                  <p className="text-xs text-slate-500">חלבון</p>
                </div>
                <div>
                  <p className="text-base font-bold text-orange-600">{editTotals.carbs}ג׳</p>
                  <p className="text-xs text-slate-500">פחמימות</p>
                </div>
                <div>
                  <p className="text-base font-bold text-purple-600">{editTotals.fat}ג׳</p>
                  <p className="text-xs text-slate-500">שומן</p>
                </div>
              </div>
            )}

            {/* Ingredient rows */}
            <div className="space-y-3">
              {editIngredients.map((ing, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={ing.name || ''}
                      onChange={e => handleIngredientFieldChange(i, 'name', e.target.value)}
                      className="flex-1 border border-slate-200 rounded-md px-2 py-1.5 text-sm text-right font-medium text-slate-800"
                      dir="rtl"
                    />
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleIngredientReanalyze(i)}
                        disabled={reanalyzingIngredientIndex === i}
                        className="text-xs text-teal-700 border border-teal-100 rounded-md px-2 py-1 hover:bg-teal-50 disabled:opacity-50"
                      >
                        {reanalyzingIngredientIndex === i ? 'מנתח...' : 'נתח מחדש'}
                      </button>
                      <button
                        onClick={() => handleIngredientDelete(i)}
                        className="text-xs text-red-600 border border-red-100 rounded-md px-2 py-1 hover:bg-red-50"
                      >
                        מחק
                      </button>
                    </div>
                  </div>

                  {ingredientCorrectionKey === `edit-${i}` && (
                    <div className="rounded-lg border border-teal-100 bg-teal-50 p-2 space-y-2">
                      <Textarea
                        value={ingredientCorrectionText}
                        onChange={e => setIngredientCorrectionText(e.target.value)}
                        placeholder={`מה לתקן ב${ing.name || 'הפריט'}? לדוגמה: הכמות היא 80 גרם / זה היה עם שמן / זה לא המרכיב הנכון`}
                        className="min-h-[64px] text-sm text-right bg-white"
                        dir="rtl"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleIngredientReanalyze(i, ingredientCorrectionText)}
                          disabled={!ingredientCorrectionText.trim() || reanalyzingIngredientIndex === i}
                          className="flex-1 text-white"
                          style={{ backgroundColor: '#79DBD6' }}
                        >
                          שלח תיקון ל-AI
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setIngredientCorrectionKey(null);
                            setIngredientCorrectionText('');
                          }}
                        >
                          ביטול
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs">
                    <span className={`px-2 py-1 rounded-full ${(ing.confidence || 'medium') === 'high' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      {(ing.confidence || 'medium') === 'high' ? 'ביטחון גבוה' : 'ביטחון בינוני'}
                    </span>
                    {ing.source_text_segment && <span className="text-slate-400 truncate max-w-[220px]">מקור: {ing.source_text_segment}</span>}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-slate-500 space-y-1">
                      <span>כמות / תיאור</span>
                      <input
                        type="text"
                        value={ing.quantity_text || ing.quantity_display || ''}
                        onChange={e => handleIngredientFieldChange(i, 'quantity_text', e.target.value)}
                        className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm text-right"
                        dir="rtl"
                      />
                    </label>
                    <label className="text-xs text-slate-500 space-y-1">
                      <span>גרמים</span>
                      <input
                        type="number"
                        value={ing.quantity_grams || ''}
                        onChange={e => handleIngredientGramsChange(i, e.target.value)}
                        className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm text-center"
                        min="0"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {[
                      ['calories', 'קל׳'],
                      ['protein', 'חלבון'],
                      ['carbs', 'פחמימות'],
                      ['fat', 'שומן'],
                    ].map(([field, label]) => (
                      <label key={field} className="text-xs text-slate-500 space-y-1">
                        <span>{label}</span>
                        <input
                          type="number"
                          value={ing[field] || 0}
                          onChange={e => handleIngredientFieldChange(i, field, e.target.value)}
                          className="w-full border border-slate-200 rounded-md px-1 py-1.5 text-sm text-center"
                          min="0"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {learningSaved && (
              <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium p-3 text-center">
                נשמר ללמידה ✅
              </div>
            )}

            <Button variant="outline" onClick={saveEditedIngredientsToMemory} className="w-full">
              שמור תיקונים ללמידה ✅
            </Button>

            {/* Meal type */}
            <div>
              <p className="text-sm text-slate-600 mb-1 font-medium">איפה להוסיף?</p>
              <Select value={selectedMealType} onValueChange={setSelectedMealType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map(mt => (
                    <SelectItem key={mt.value} value={mt.value}>{mt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={handleSave} disabled={isSaving} className="flex-1 text-white" style={{ backgroundColor: isSaving ? '#a7f3d0' : '#79DBD6' }}>
                {isSaving ? 'שומר...' : 'הוסף ליומן'}
              </Button>
              <Button variant="outline" onClick={() => setStep('result')} disabled={isSaving}>
                חזור
              </Button>
            </div>
          </div>
        )}

        {/* STEP: MANUAL */}
        {step === 'manual' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">הזן את הנתונים ידנית</p>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">שם הארוחה</label>
              <input
                type="text"
                value={manualName}
                onChange={e => setManualName(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right"
                dir="rtl"
                placeholder="שם הארוחה"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'קלוריות', state: manualCalories, setter: setManualCalories, color: 'text-emerald-600' },
                { label: 'חלבון (ג׳)', state: manualProtein, setter: setManualProtein, color: 'text-blue-600' },
                { label: 'פחמימות (ג׳)', state: manualCarbs, setter: setManualCarbs, color: 'text-orange-600' },
                { label: 'שומן (ג׳)', state: manualFat, setter: setManualFat, color: 'text-purple-600' },
              ].map(({ label, state, setter, color }) => (
                <div key={label}>
                  <label className={`text-sm font-medium block mb-1 ${color}`}>{label}</label>
                  <input
                    type="number"
                    value={state}
                    onChange={e => setter(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-center"
                    min="0"
                  />
                </div>
              ))}
            </div>

            <div>
              <p className="text-sm text-slate-600 mb-1 font-medium">איפה להוסיף?</p>
              <Select value={selectedMealType} onValueChange={setSelectedMealType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map(mt => (
                    <SelectItem key={mt.value} value={mt.value}>{mt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={isSaving} className="flex-1 text-white" style={{ backgroundColor: isSaving ? '#a7f3d0' : '#79DBD6' }}>
                {isSaving ? 'שומר...' : 'הוסף ליומן'}
              </Button>
              <Button variant="outline" onClick={() => setStep(result ? 'result' : 'input')} disabled={isSaving}>
                חזור
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}