/**
 * מנוע חישוב תזונתי מרכזי v2
 * NUTRITION_ENGINE_VERSION="v2_foodunit"
 * 
 * חישוב תזונה מבוסס אך ורק על:
 * 1. ProductUnitOverride (product_id + unit_id) - עדיפות ראשונה
 * 2. FoodUnit.default_grams - fallback
 * 
 * אין שימוש ב-Legacy/DEFAULT_PORTIONS בחישוב!
 */

const ERROR_CODES = {
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  UNIT_NOT_FOUND: 'UNIT_NOT_FOUND',
  MISSING_GRAMS_FOR_UNIT: 'MISSING_GRAMS_FOR_UNIT',
  INVALID_QUANTITY: 'INVALID_QUANTITY'
};

const ERROR_MESSAGES = {
  PRODUCT_NOT_FOUND: 'מוצר לא נמצא',
  UNIT_NOT_FOUND: 'יחידה לא נמצאה',
  MISSING_GRAMS_FOR_UNIT: 'חסר משקל ליחידה עבור מוצר זה (יש להגדיר override או default ליחידה)',
  INVALID_QUANTITY: 'כמות לא תקינה'
};

/**
 * חישוב תזונה מרכזי
 * @param {Object} params
 * @param {string} params.productId - מזהה המוצר
 * @param {string} params.unitId - מזהה היחידה (FoodUnit.id)
 * @param {number} params.quantity - כמות
 * @param {Object} params.product - אובייקט המוצר (אופציונלי למהירות)
 * @param {Object} params.unit - אובייקט היחידה (אופציונלי למהירות)
 * @param {Object} params.override - אובייקט ה-override (אופציונלי למהירות)
 * @param {Array} params.allProducts - רשימת כל המוצרים (אם לא נשלח product)
 * @param {Array} params.allUnits - רשימת כל היחידות (אם לא נשלח unit)
 * @param {Array} params.allOverrides - רשימת כל ה-overrides (אם לא נשלח override)
 * @returns {Object} - {grams, total_kcal, total_protein, total_carbs, total_fat, gramsPerUnit, source}
 * @throws {Object} - {code, message}
 */
export function computeNutrition({
  productId,
  unitId = null,
  unitName = null,
  quantity,
  product = null,
  unit = null,
  override = null,
  allProducts = [],
  allUnits = [],
  allOverrides = []
}) {
  console.log('[NutritionEngine] Computing:', { productId, unitId, unitName, quantity });

  // Validation: quantity
  if (!quantity || quantity <= 0 || isNaN(quantity)) {
    throw {
      code: ERROR_CODES.INVALID_QUANTITY,
      message: ERROR_MESSAGES.INVALID_QUANTITY,
      details: { quantity }
    };
  }

  // Find product
  const foundProduct = product || allProducts.find(p => p.id === productId);
  if (!foundProduct) {
    throw {
      code: ERROR_CODES.PRODUCT_NOT_FOUND,
      message: ERROR_MESSAGES.PRODUCT_NOT_FOUND,
      details: { productId }
    };
  }

  // Handle "גרם" special case
  if (unitName === 'גרם' || unitId === 'gram') {
    const totalGrams = quantity;
    const factor = totalGrams / 100;
    return {
      grams: Math.round(totalGrams * 10) / 10,
      total_kcal: Math.round(foundProduct.per100_kcal * factor),
      total_protein: Math.round(foundProduct.per100_protein * factor * 10) / 10,
      total_carbs: Math.round(foundProduct.per100_carbs * factor * 10) / 10,
      total_fat: Math.round(foundProduct.per100_fat * factor * 10) / 10,
      gramsPerUnit: 1,
      source: 'gram_base',
      productName: foundProduct.name_he,
      unitName: 'גרם'
    };
  }

  // Find unit
  const foundUnit = unit || allUnits.find(u => u.id === unitId);
  if (!foundUnit) {
    throw {
      code: ERROR_CODES.UNIT_NOT_FOUND,
      message: ERROR_MESSAGES.UNIT_NOT_FOUND,
      details: { unitId, unitName }
    };
  }

  // Find override by unit_id OR by unit name (ProductUnitOverride uses unit_name not unit_id!)
  const foundOverride = override !== null 
    ? override 
    : allOverrides.find(o => 
        o.product_id === productId && 
        (o.unit_id === unitId || o.unit_name === foundUnit.name_he)
      );

  // Determine grams per unit
  let gramsPerUnit = null;
  let source = 'unit_default';

  if (foundOverride && foundOverride.grams_per_unit > 0) {
    gramsPerUnit = foundOverride.grams_per_unit;
    source = 'product_override';
  } else if (foundUnit.default_grams > 0) {
    gramsPerUnit = foundUnit.default_grams;
    source = 'unit_default';
  }

  if (!gramsPerUnit || gramsPerUnit <= 0) {
    throw {
      code: ERROR_CODES.MISSING_GRAMS_FOR_UNIT,
      message: ERROR_MESSAGES.MISSING_GRAMS_FOR_UNIT,
      details: { productId, unitId, unitName: foundUnit.name_he }
    };
  }

  // Calculate total grams
  const totalGrams = quantity * gramsPerUnit;
  const factor = totalGrams / 100;

  const result = {
    grams: Math.round(totalGrams * 10) / 10,
    total_kcal: Math.round(foundProduct.per100_kcal * factor),
    total_protein: Math.round(foundProduct.per100_protein * factor * 10) / 10,
    total_carbs: Math.round(foundProduct.per100_carbs * factor * 10) / 10,
    total_fat: Math.round(foundProduct.per100_fat * factor * 10) / 10,
    gramsPerUnit,
    source,
    productName: foundProduct.name_he,
    unitName: foundUnit.name_he
  };

  console.log('[NutritionEngine] Result:', result);
  return result;
}

export { ERROR_CODES, ERROR_MESSAGES };