/**
 * mealTarget.js
 *
 * Canonical meal target constants and safe validation/normalization.
 * Used by NutritionLog, BarcodeScan, and BarcodeScanner to preserve
 * the originating meal section through a barcode scan round-trip.
 */

export const MEAL_TARGETS = Object.freeze(['breakfast', 'lunch', 'dinner', 'snack']);

/** Returns true iff v is one of the four canonical meal targets. */
export function isValidMealTarget(v) {
  return typeof v === 'string' && MEAL_TARGETS.includes(v);
}

/**
 * normalizeMealTarget(v, fallback?)
 * Returns v unchanged if valid; otherwise returns fallback (default 'snack').
 */
export function normalizeMealTarget(v, fallback = 'snack') {
  return isValidMealTarget(v) ? v : fallback;
}
