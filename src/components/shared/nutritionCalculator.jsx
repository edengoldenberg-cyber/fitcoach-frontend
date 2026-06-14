/**
 * מקור אמת לחישובי תזונה - יחידה אחת מרכזית
 * כלל זהב: כל חישוב עובר דרך גרמים בפועל
 */

// ייבוא מ-unitsResolver
export { GLOBAL_SAFE_UNITS, mergeUnits, resolveUnitIdFromName, validateUnit } from './unitsResolver';

/**
 * מחשב מאקרו מיחידה ספציפית
 * @param {Object} product - מוצר עם per100_* values
 * @param {Object} unit - יחידה עם grams_per_unit
 * @param {number} quantity - כמות ביחידה
 * @returns {Object} { calories, protein, carbs, fat, grams }
 */
export function calculateMacrosFromUnit(product, unit, quantity) {
  if (!product || !unit || !quantity) {
    return { calories: 0, protein: 0, carbs: 0, fat: 0, grams: 0 };
  }

  // שלב 1: חישוב גרמים בפועל
  const gramsPerUnit = unit.grams_per_unit || unit.grams || 100;
  const totalGrams = quantity * gramsPerUnit;

  // שלב 2: חישוב מאקרו מ-100 גרם
  const per100 = {
    calories: product.per100_kcal || product.per100_calories || 0,
    protein: product.per100_protein || 0,
    carbs: product.per100_carbs || 0,
    fat: product.per100_fat || 0,
  };

  const ratio = totalGrams / 100;

  return {
    calories: Math.round(per100.calories * ratio),
    protein: Math.round(per100.protein * ratio * 10) / 10,
    carbs: Math.round(per100.carbs * ratio * 10) / 10,
    fat: Math.round(per100.fat * ratio * 10) / 10,
    grams: Math.round(totalGrams),
  };
}

/**
 * מנרמל שם יחידה להשוואה
 */
export function normalizeUnitName(name) {
  if (!name) return '';
  return name.trim().toLowerCase();
}