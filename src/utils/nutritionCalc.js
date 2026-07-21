/**
 * CANONICAL NUTRITION TARGET FORMULA — FitCoach Pro
 *
 * Single source of truth for all calorie + macro calculations.
 * The backend (nutrition.fn.js) uses the identical algorithm.
 * Any change here MUST be mirrored in the backend.
 *
 * Formula:
 *   BMR  — Mifflin-St Jeor
 *   TDEE — BMR × activity multiplier
 *   Cal  — TDEE + goal adjustment
 *   Pro  — 2.0 g / kg body weight   (fitness-standard)
 *   Fat  — 25 % of calories / 9
 *   Carb — remainder / 4  (min 50 g)
 */

export const ACTIVITY_MULTIPLIERS = {
  sedentary:   1.2,
  light:       1.375,
  moderate:    1.55,
  active:      1.725,
  very_active: 1.9,
};

// Maps every goal label used anywhere in the app → kcal adjustment
const GOAL_ADJUSTMENTS = {
  // loss variants
  lose:            -500,
  weight_loss:     -500,
  fat_loss:        -500,
  cut:             -500,
  aggressive_loss: -700,
  // maintenance
  maintain:        0,
  maintenance:     0,
  // gain variants
  gain:           +300,
  muscle_gain:    +300,
  bulk:           +300,
  // recomp
  body_recomp:    -200,
  recomposition:  -200,
};

/**
 * Calculate nutrition targets.
 *
 * @param {object} p
 * @param {number} p.weight_kg
 * @param {number} p.height_cm
 * @param {number} p.age                   — integer years
 * @param {'male'|'female'} p.gender
 * @param {string} p.activity_level        — key of ACTIVITY_MULTIPLIERS
 * @param {string} p.goal                  — any key of GOAL_ADJUSTMENTS
 * @param {number} [p.goal_weight_change_kg] — explicit kg to lose/gain
 * @param {number} [p.goal_timeline_weeks]   — weeks to achieve the goal
 * @param {number} [p.override_calories]   — if set, skips goal adjustment
 * @returns {{ calories, protein, carbs, fat, bmr, tdee }} — all integers
 */
export function calcNutritionTargets({ weight_kg, height_cm, age, gender, activity_level, goal,
                                       goal_weight_change_kg, goal_timeline_weeks,
                                       override_calories } = {}) {
  const w = parseFloat(weight_kg) || 75;
  const h = parseFloat(height_cm) || 170;
  const a = parseInt(age)         || 30;
  const g = gender                || 'male';

  // BMR — Mifflin-St Jeor
  const bmr = g === 'female'
    ? 10 * w + 6.25 * h - 5 * a - 161
    : 10 * w + 6.25 * h - 5 * a + 5;

  const tdee = Math.round(bmr * (ACTIVITY_MULTIPLIERS[activity_level] || 1.55));

  // Calories
  let calories;
  if (override_calories && parseInt(override_calories) > 0) {
    calories = Math.max(1200, parseInt(override_calories));
  } else if (parseFloat(goal_weight_change_kg) > 0 && parseFloat(goal_timeline_weeks) > 0) {
    // Derive the daily calorie delta from the explicit goal the user set.
    // 1 kg body fat ≈ 7700 kcal. Cap at 1000 kcal/day to preserve the 1200 kcal floor.
    const kgPerWeek  = parseFloat(goal_weight_change_kg) / parseFloat(goal_timeline_weeks);
    const dailyDelta = Math.round((kgPerWeek * 7700) / 7);
    const capped     = Math.min(1000, dailyDelta);
    const isLoss     = (GOAL_ADJUSTMENTS[goal] ?? 0) <= 0;
    calories = Math.max(1200, isLoss ? tdee - capped : tdee + capped);
  } else {
    const adj = GOAL_ADJUSTMENTS[goal] ?? 0;
    calories = Math.max(1200, tdee + adj);
  }

  // Macros
  const protein = Math.round(w * 2.0);
  const fat     = Math.round((calories * 0.25) / 9);
  const carbs   = Math.max(50, Math.round((calories - protein * 4 - fat * 9) / 4));

  return {
    calories,
    protein,
    carbs,
    fat,
    bmr:  Math.round(bmr),
    tdee,
  };
}

/**
 * Derive age in whole years from a birth_date ISO string (e.g. "1993-04-15").
 */
export function ageFromBirthDate(birth_date) {
  if (!birth_date) return null;
  try {
    const ms = Date.now() - new Date(birth_date).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24 * 365.25));
  } catch {
    return null;
  }
}
