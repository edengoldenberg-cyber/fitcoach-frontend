// Meal Engine Watchdog - Safety layer preventing infinite loops & timeouts
import { logEvent } from './diagnostics/logger';

const MAX_ATTEMPTS = 200;
const MAX_TIME_MS = 4000;

/**
 * Safe combination builder with watchdog
 */
export function buildCombinationWithWatchdog(
  requirements,
  byRole,
  targetCalories,
  targetRange,
  focus,
  getUnitsForFood,
  existingCombos,
  relaxationLevel = 0
) {
  // Limit candidate pool
  const maxCandidatesPerRole = 10;
  const candidatePool = {};
  
  for (const role in byRole) {
    candidatePool[role] = byRole[role].slice(0, maxCandidatesPerRole);
  }

  const items = [];
  const usedFoodIds = new Set();

  // Build base items from required roles
  for (const role of requirements.required) {
    if (!candidatePool[role] || candidatePool[role].length === 0) {
      // Relaxation: allow missing one role
      if (relaxationLevel >= 2) {
        continue;
      }
      return null;
    }

    const candidates = candidatePool[role].filter(f => !usedFoodIds.has(f.id));
    if (candidates.length === 0) return null;

    // Weighted random selection
    const selected = weightedSelectFood(candidates);
    if (!selected) return null;

    usedFoodIds.add(selected.id);
    const units = getUnitsForFood(selected);
    const portionCalories = targetCalories / (requirements.required.length || 3);
    const item = selectQuantityForFood(selected, units, portionCalories);

    if (item) items.push(item);
  }

  if (items.length === 0) return null;

  // Check for duplicate
  const signature = items.map(i => i.food.id).sort().join('_');
  if (existingCombos.some(c => c.signature === signature)) {
    return null;
  }

  // Calculate totals
  const totals = calculateTotals(items);

  // Apply constraints
  if (totals.calories < targetRange.min || totals.calories > targetRange.max) {
    return null;
  }

  // Score
  const score = scoreCombination(totals, focus);

  return {
    items,
    totals,
    signature,
    score,
    explanation: `${items.length} פריטים, ${Math.round(totals.calories)}kcal`,
    focus
  };
}

/**
 * Emergency fallback meals for when normal generation fails
 */
export function generateEmergencyMeals(
  byRole,
  targetCalories,
  targetRange,
  mealType,
  getUnitsForFood
) {
  console.log('🆘 EMERGENCY FALLBACK: Creating simple meals...');
  logEvent('FALLBACK_INIT', { mealType, targetCalories });

  const meals = [];
  const maxTries = 3;

  for (let i = 0; i < maxTries && meals.length < 3; i++) {
    // Pick a base protein
    const proteins = (byRole['חלבון'] || []).slice(0, 5);
    if (proteins.length === 0) break;

    const base = proteins[Math.floor(Math.random() * proteins.length)];
    if (!base) continue;

    const items = [];
    const units = getUnitsForFood(base);
    const item = selectQuantityForFood(base, units, targetCalories * 0.6);

    if (item) {
      items.push(item);

      // Add one topping from carbs if available
      const carbs = (byRole['פחמימה'] || []).slice(0, 5);
      if (carbs.length > 0) {
        const topping = carbs[Math.floor(Math.random() * carbs.length)];
        const toppingUnits = getUnitsForFood(topping);
        const toppingItem = selectQuantityForFood(topping, toppingUnits, targetCalories * 0.4);
        if (toppingItem) items.push(toppingItem);
      }

      const totals = calculateTotals(items);
      if (totals.calories >= targetRange.min * 0.8) {
        meals.push({
          items,
          totals,
          signature: items.map(it => it.food.id).join('_'),
          score: 50,
          explanation: `[Fallback] ${items.length} פריטים`,
          focus: 'מאוזן'
        });
      }
    }
  }

  logEvent('FALLBACK_RESULT', { mealsGenerated: meals.length });
  return meals;
}

/**
 * Helper: Weighted random selection
 */
function weightedSelectFood(candidates) {
  if (!candidates || candidates.length === 0) return null;

  const topN = Math.min(3, candidates.length);
  const weights = [0.6, 0.3, 0.1].slice(0, topN);

  let cumulative = 0;
  const rand = Math.random();

  for (let i = 0; i < topN; i++) {
    cumulative += weights[i];
    if (rand < cumulative) {
      return candidates[i];
    }
  }

  return candidates[topN - 1];
}

/**
 * Helper: Select quantity for food
 */
function selectQuantityForFood(food, units, targetCalories) {
  if (!food.per100_kcal) return null;

  // Simple: find unit close to target calories
  const selectedUnit = units && units.length > 0 ? units[0] : null;
  if (!selectedUnit || !selectedUnit.grams_per_unit) {
    // Default to 100g serving
    const grams = 100;
    return {
      food,
      unit: { name: 'ג׳' },
      quantity: grams,
      grams,
      calories: (food.per100_kcal * grams) / 100,
      protein: (food.per100_protein * grams) / 100,
      carbs: (food.per100_carbs * grams) / 100,
      fat: (food.per100_fat * grams) / 100
    };
  }

  // Calculate target grams
  const targetGrams = (targetCalories * 100) / food.per100_kcal;
  const quantity = Math.round(targetGrams / selectedUnit.grams_per_unit);

  const grams = quantity * selectedUnit.grams_per_unit;

  return {
    food,
    unit: selectedUnit,
    quantity,
    grams,
    calories: (food.per100_kcal * grams) / 100,
    protein: (food.per100_protein * grams) / 100,
    carbs: (food.per100_carbs * grams) / 100,
    fat: (food.per100_fat * grams) / 100
  };
}

/**
 * Helper: Calculate totals
 */
function calculateTotals(items) {
  return items.reduce((acc, item) => ({
    calories: acc.calories + (item.calories || 0),
    protein: acc.protein + (item.protein || 0),
    carbs: acc.carbs + (item.carbs || 0),
    fat: acc.fat + (item.fat || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

/**
 * Helper: Score combination
 */
function scoreCombination(totals, focus) {
  switch (focus) {
    case 'יותר חלבון':
      return totals.protein;
    case 'יותר פחמימות':
      return totals.carbs;
    case 'יותר שומן':
      return totals.fat;
    case 'מאוזן':
    default:
      const proteinCals = totals.protein * 4;
      const carbsCals = totals.carbs * 4;
      const fatCals = totals.fat * 9;
      const total = proteinCals + carbsCals + fatCals;
      const proteinPct = total > 0 ? proteinCals / total : 0;
      const carbsPct = total > 0 ? carbsCals / total : 0;
      const fatPct = total > 0 ? fatCals / total : 0;
      // Score: closer to 30/40/30 = better
      return 1000 - (Math.abs(proteinPct - 0.30) + Math.abs(carbsPct - 0.40) + Math.abs(fatPct - 0.30)) * 100;
  }
}

export const watchdogConfig = {
  MAX_ATTEMPTS,
  MAX_TIME_MS
};