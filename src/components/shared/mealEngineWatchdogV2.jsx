// Watchdog V2 - Complete safety system for meal engine
import { MealSuggestDiagnostics } from './mealSuggestDebugger';

export const watchdogConfig = {
  MAX_ATTEMPTS: 200,
  MAX_TIME_MS: 4000,
  MAX_CANDIDATES_PER_ROLE: 10,
  RELAXATION_ATTEMPT_L1: 80,
  RELAXATION_ATTEMPT_L2: 150
};

/**
 * Build combination with watchdog protection
 * Limits candidates per role to prevent combinatorial explosion
 */
export function buildCombinationWithWatchdog(
  requirements,
  byRole,
  targetCalories,
  targetRange,
  focus,
  getUnitsForFood,
  existingCombos = [],
  relaxationLevel = 0
) {
  // Limit candidates per role
  const limitedByRole = {};
  Object.keys(byRole).forEach(role => {
    const candidates = byRole[role] || [];
    const limited = candidates.slice(0, watchdogConfig.MAX_CANDIDATES_PER_ROLE);
    limitedByRole[role] = limited;
  });

  // Try to pick items from each role
  const items = [];
  let totalCals = 0;

  for (const [role, candidates] of Object.entries(limitedByRole)) {
    if (!candidates || candidates.length === 0) {
      // Role not satisfied
      if ((requirements[role] || false) === true) {
        // Required role is missing
        return null;
      }
      continue;
    }

    // Pick random candidate from role
    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    if (!selected) continue;

    // Get default unit
    const units = getUnitsForFood?.(selected.id) || [];
    const unit = units[0] || { grams_per_unit: 100, unit_name: '100 גרם' };

    const calories = selected.per100_kcal * (unit.grams_per_unit / 100);
    items.push({ food: selected, unit, calories, quantity: 1 });
    totalCals += calories;
  }

  if (items.length === 0) return null;

  // Check if within range
  const inRange = totalCals >= targetRange.min && totalCals <= targetRange.max;
  if (!inRange) {
    return null;
  }

  // Avoid duplicates
  const itemIds = items.map(i => i.food.id).sort().join('|');
  const isDuplicate = existingCombos.some(c => {
    const existingIds = c.items.map(i => i.food.id).sort().join('|');
    return existingIds === itemIds;
  });

  if (isDuplicate) return null;

  return {
    items,
    totalCalories: totalCals,
    score: scoreCombo(items, focus, targetRange)
  };
}

/**
 * Score a meal combination
 */
function scoreCombo(items, focus, targetRange) {
  if (!items || items.length === 0) return 0;

  let score = 50;

  // Calorie closeness
  const totalCals = items.reduce((sum, i) => sum + i.calories, 0);
  const midpoint = (targetRange.min + targetRange.max) / 2;
  const deviation = Math.abs(totalCals - midpoint);
  const maxDeviation = (targetRange.max - targetRange.min) / 2;
  const calorieScore = Math.max(0, 50 * (1 - deviation / maxDeviation));
  score += calorieScore;

  // Macro balance based on focus
  if (focus === 'יותר חלבון') {
    const protein = items.reduce((sum, i) => sum + (i.food.per100_protein * i.food.quantity * 10), 0);
    score += Math.min(protein / 10, 20);
  } else if (focus === 'יותר פחמימות') {
    const carbs = items.reduce((sum, i) => sum + (i.food.per100_carbs * i.food.quantity * 10), 0);
    score += Math.min(carbs / 10, 20);
  } else if (focus === 'יותר שומן') {
    const fat = items.reduce((sum, i) => sum + (i.food.per100_fat * i.food.quantity * 10), 0);
    score += Math.min(fat / 10, 20);
  }

  // Variety bonus
  const uniqueRoles = new Set(items.map(i => i.food.suggest_role)).size;
  score += uniqueRoles * 5;

  return Math.round(score);
}

/**
 * Emergency fallback - generates simple meals from top candidates per role
 */
export function generateEmergencyMeals(
  byRole,
  targetCalories,
  targetRange,
  mealTag,
  getUnitsForFood
) {
  const meals = [];
  const maxAttempts = 30;

  for (let attempt = 0; attempt < maxAttempts && meals.length < 3; attempt++) {
    const items = [];
    let totalCals = 0;

    // Pick one item from each available role
    for (const [role, candidates] of Object.entries(byRole)) {
      if (!candidates || candidates.length === 0) continue;

      const selected = candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
      if (!selected) continue;

      const units = getUnitsForFood?.(selected.id) || [];
      const unit = units[0] || { grams_per_unit: 100, unit_name: '100 גרם' };

      const calories = selected.per100_kcal * (unit.grams_per_unit / 100);
      items.push({ food: selected, unit, calories, quantity: 1 });
      totalCals += calories;
    }

    if (items.length === 0) continue;

    // Check range (relaxed)
    if (totalCals >= targetRange.min * 0.7 && totalCals <= targetRange.max * 1.3) {
      const isDuplicate = meals.some(m => {
        const existingIds = m.items.map(i => i.food.id).sort().join('|');
        const newIds = items.map(i => i.food.id).sort().join('|');
        return existingIds === newIds;
      });

      if (!isDuplicate) {
        meals.push({
          items,
          totalCalories: totalCals,
          score: Math.round(40 + Math.random() * 20),
          isEmergencyFallback: true
        });
      }
    }
  }

  return meals;
}