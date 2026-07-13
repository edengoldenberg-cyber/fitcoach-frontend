// Detects whether a free-text meal-plan feedback string is requesting a specific
// calorie target. Returns { intent, target_calories } or null.
// Only calorie-target requests trigger the choice UI — all other requests are
// forwarded directly to mealPlanFeedback unchanged.

const PATTERNS = [
  /(\d{3,4})\s*(קלוריות|קל|קקל|kcal|קק"ל|calorie)/i,
  /ל[\-\s]?(\d{3,4})\s*(קלוריות|קל|קקל|kcal|קק"ל)/i,
  /(\d{3,4})\s*קל/i,
  /ל[\-\s]?(\d{3,4})\b/,
];

const MIN_CAL = 800;
const MAX_CAL = 5000;

export function detectCalorieTargetIntent(text) {
  if (!text?.trim()) return null;
  for (const pattern of PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      const cal = parseInt(m[1], 10);
      if (cal >= MIN_CAL && cal <= MAX_CAL) {
        return { intent: 'calorie_target_change', target_calories: cal };
      }
    }
  }
  return null;
}
