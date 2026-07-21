/**
 * Meal plan mutation intent detector.
 *
 * Returns a structured intent when free-text clearly requests a plan mutation,
 * or null when the message is informational / ambiguous.
 *
 * The backend (routeMealFeedback) is the single source of truth for all
 * classification once the frontend decides a mutation is intended. This module
 * only decides WHETHER to route to routeMealFeedback at all.
 *
 * Supported intents:
 *   SET_PLAN_CALORIES    — "תשנה ל-1400 קלוריות"
 *   REPLACE_MEAL_ITEM    — "תחליף סלמון בחזה עוף"
 *   UPDATE_MEAL          — "שנה את ארוחת הצהריים של יום שני"
 *   REGENERATE_DAY       — "בנה מחדש את יום שני"
 *   UPDATE_PLAN          — general plan modification with clear action verb
 *
 * Returns: { type, targetCalories? } or null
 */

import { detectCalorieTargetIntent } from '../components/mealplan/calorieIntentDetector';

// Verbs that unambiguously request a change (not a question or status check).
// Note: \b word boundaries do not work with Hebrew — Hebrew chars are not \w.
// We match on the verb appearing anywhere in the string.
const MUTATION_VERBS_HE = /(שנה|תשנה|עדכן|תעדכן|הורד|תוריד|הגדל|תגדיל|תחליף|החלף|הסר|תסיר|הוסף|תוסיף|בנה מחדש|ערוך|תערוך|התאם|תתאים)/i;

// Plan / meal / nutrition context keywords
const PLAN_CONTEXT_HE = /(תפריט|ארוחה|ארוחות|יום|שבוע|קלוריות|חלבון|פחמימות|שומן|מנה|פריט|מאכל|סלמון|עוף|בשר|ירקות)/i;

// Item-replacement pattern: "תחליף X ב-Y" or "replace X with Y"
const REPLACE_PATTERN_HE = /(תחליף|החלף|replace|swap)\s+.{1,30}\s+(ב[־-]?|with|ל[־-]?)\s*.{1,30}/i;

// Day update pattern: "שנה את ארוחת הצהריים של יום שני"
const DAY_UPDATE_PATTERN = /(שנה|עדכן|ערוך).{0,20}(ארוחה|יום|בוקר|צהריים|ערב|חטיף)/i;

// Day regeneration: "בנה מחדש את יום שני"
const DAY_REGEN_PATTERN  = /בנה מחדש.{0,20}יום|regenerate.{0,20}day/i;

// Informational questions — must NOT be classified as mutations
const INFORMATIONAL = /^(כמה|מה|האם|איך|איפה|מתי|למה|מי|תסביר|הסבר|ספר|תגיד|דיווח|הראה)/i;

/**
 * Returns a structured mutation intent, or null if the message is informational
 * or does not clearly request a plan mutation.
 *
 * @param {string} text - Free-text message from the user
 * @returns {{ type: string, targetCalories?: number } | null}
 */
export function detectMutationIntent(text) {
  const t = text?.trim();
  if (!t) return null;

  // Never classify informational questions as mutations
  if (INFORMATIONAL.test(t)) return null;

  // 1. SET_PLAN_CALORIES — explicit numeric calorie target
  const calIntent = detectCalorieTargetIntent(t);
  if (calIntent) {
    return { type: 'SET_PLAN_CALORIES', targetCalories: calIntent.target_calories };
  }

  // 2. REPLACE_MEAL_ITEM — explicit item replacement pattern
  if (REPLACE_PATTERN_HE.test(t)) {
    return { type: 'REPLACE_MEAL_ITEM' };
  }

  // 3. REGENERATE_DAY
  if (DAY_REGEN_PATTERN.test(t)) {
    return { type: 'REGENERATE_DAY' };
  }

  // 4. UPDATE_MEAL — named day/meal with mutation verb
  if (DAY_UPDATE_PATTERN.test(t) && MUTATION_VERBS_HE.test(t)) {
    return { type: 'UPDATE_MEAL' };
  }

  // 5. UPDATE_PLAN — general mutation verb + plan context
  if (MUTATION_VERBS_HE.test(t) && PLAN_CONTEXT_HE.test(t)) {
    return { type: 'UPDATE_PLAN' };
  }

  return null;
}

/**
 * Hebrew failure message per intent type, used when routeMealFeedback
 * returns changed: false.
 */
export function getMutationFailureMessage(intent, aiResponse) {
  if (aiResponse) return aiResponse;
  switch (intent?.type) {
    case 'SET_PLAN_CALORIES':
      return `לא הצלחתי להתאים את התפריט ל-${intent.targetCalories} קלוריות. התפריט הנוכחי נשמר ללא שינוי.`;
    case 'REPLACE_MEAL_ITEM':
      return 'לא הצלחתי להחליף את הפריט. התפריט הנוכחי נשמר ללא שינוי.';
    case 'UPDATE_MEAL':
      return 'לא הצלחתי לשנות את הארוחה. התפריט הנוכחי נשמר ללא שינוי.';
    case 'REGENERATE_DAY':
      return 'לא הצלחתי לבנות מחדש את היום. התפריט הנוכחי נשמר ללא שינוי.';
    default:
      return 'לא הצלחתי לבצע את השינוי. התפריט הנוכחי נשמר ללא שינוי.';
  }
}
