/**
 * Units Resolver - לוגיקה טהורה לניהול יחידות מידה
 * עם confidence levels ויחידות נוחות
 */

/**
 * יחידות גלובליות בטוחות (תמיד זמינות)
 * Weight units = exact, convenience = approx
 */
export const GLOBAL_SAFE_UNITS = [
  { id: 'global_gram', name: 'גרם', grams_per_unit: 1, source: 'global_safe', confidence: 'exact' },
  { id: 'global_100g', name: '100 גרם', grams_per_unit: 100, source: 'global_safe', confidence: 'exact' },
  { id: 'global_kg', name: 'ק״ג', grams_per_unit: 1000, source: 'global_safe', confidence: 'exact' },
];

/**
 * יחידות נוחות גלובליות (תמיד מוצגות, אבל approx אלא אם override/category)
 */
export const CONVENIENCE_UNITS = [
  { id: 'conv_spoon', name: 'כף', grams_per_unit: 15, source: 'global_convenience', confidence: 'approx' },
  { id: 'conv_teaspoon', name: 'כפית', grams_per_unit: 5, source: 'global_convenience', confidence: 'approx' },
  { id: 'conv_cup', name: 'כוס', grams_per_unit: 150, source: 'global_convenience', confidence: 'approx' },
  { id: 'conv_slice', name: 'פרוסה', grams_per_unit: 25, source: 'global_convenience', confidence: 'approx' },
  { id: 'conv_unit', name: 'יחידה', grams_per_unit: 50, source: 'global_convenience', confidence: 'approx' },
  { id: 'conv_scoop', name: 'סקופ', grams_per_unit: 30, source: 'global_convenience', confidence: 'approx' },
];

/**
 * נרמול שם יחידה
 */
export function normalizeUnitName(name) {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Resolve unit_id from name
 */
export function resolveUnitIdFromName(unitName, allUnits) {
  if (!unitName || !allUnits) return null;
  
  const normalized = normalizeUnitName(unitName);
  const match = allUnits.find(u => 
    normalizeUnitName(u.name_he || u.name || u.legacy_label_he) === normalized
  );
  
  return match?.id || null;
}

/**
 * בדיקת תקינות יחידה
 */
export function validateUnit(unit) {
  if (!unit) return { valid: false, reason: 'missing_unit' };
  
  const gramsPerUnit = unit.grams_per_unit || unit.grams || unit.grams_override;
  
  if (!gramsPerUnit || gramsPerUnit <= 0 || isNaN(gramsPerUnit)) {
    return { valid: false, reason: 'invalid_grams_per_unit' };
  }
  
  if (!unit.name && !unit.name_he && !unit.unit_name) {
    return { valid: false, reason: 'missing_name' };
  }
  
  return { valid: true };
}

/**
 * מיזוג יחידות עם היררכיה:
 * 1. ProductUnitOverride (הכי גבוה)
 * 2. CategoryUnitDefault (מחליפה global אם קיימת)
 * 3. GlobalSafeUnits
 * 4. ConvenienceUnits
 * 
 * כולל confidence levels
 */
export function mergeUnits(overrides = [], categoryDefaults = [], allUnitsForResolve = [], productName = '') {
  const diagnostics = {
    override_has_unit_id: 0,
    override_missing_unit_id: 0,
    needs_manual_fix: [],
    duplicates_detected: [],
    invalid_units_filtered: [],
    merge_strategy_used: 'hierarchy_only',
    sources_used: [],
    fallback_to_name_used: false,
  };

  const seen = new Map();
  const seenUnitNames = new Set(); // עקיבה אחרי שמות יחידות כדי למנוע כפילויות
  const units = [];

  // שלב 1: ProductUnitOverride (הכי גבוה בעדיפות)
  overrides.forEach(override => {
    const gramsPerUnit = override.grams_override || override.grams_per_unit || override.grams;
    const unitName = override.unit_name || override.name_he || 'לא ידוע';
    let unitId = override.unit_id || override.reference_unit_id;

    // validation
    if (!gramsPerUnit || gramsPerUnit <= 0 || isNaN(gramsPerUnit)) {
      diagnostics.invalid_units_filtered.push({ 
        source: 'override', 
        name: unitName, 
        id: override.id,
        reason: 'invalid_grams_per_unit',
        value: gramsPerUnit
      });
      return;
    }

    // נסה resolve by name אם חסר unit_id
    if (!unitId && unitName && allUnitsForResolve.length > 0) {
      unitId = resolveUnitIdFromName(unitName, allUnitsForResolve);
      
      if (unitId) {
        diagnostics.needs_manual_fix.push({
          source: 'override',
          id: override.id,
          name: unitName,
          action: 'auto_resolved',
          resolved_unit_id: unitId,
          suggestion: 'update_override_with_unit_id'
        });
      }
    }

    // אם עדיין אין unit_id → דלג
    if (!unitId) {
      diagnostics.override_missing_unit_id++;
      diagnostics.needs_manual_fix.push({
        source: 'override',
        id: override.id,
        name: unitName,
        reason: 'missing_unit_id',
        action: 'needs_manual_fix',
        suggestion: 'create_unit_or_attach_existing'
      });
      return;
    }

    diagnostics.override_has_unit_id++;

    if (seen.has(unitId)) {
      diagnostics.duplicates_detected.push({ 
        unit_id: unitId, 
        source: 'override', 
        name: unitName 
      });
      return;
    }

    units.push({
      id: unitId,
      name: unitName,
      grams_per_unit: gramsPerUnit,
      source: 'product_override',
      confidence: override.confidence || 'exact',
      original: override,
    });
    
    seen.set(unitId, true);
    seenUnitNames.add(normalizeUnitName(unitName)); // סמן שם זה כתפוס
    
    if (!diagnostics.sources_used.includes('product_override')) {
      diagnostics.sources_used.push('product_override');
    }
  });

  // שלב 2: CategoryUnitDefault (מחליפה global אם קיימת)
  categoryDefaults.forEach(catDef => {
    const gramsPerUnit = catDef.grams_per_unit;
    const unitId = catDef.unit_id;
    const unitName = catDef.unit_name || 'לא ידוע';

    if (!gramsPerUnit || gramsPerUnit <= 0 || isNaN(gramsPerUnit)) {
      diagnostics.invalid_units_filtered.push({
        source: 'category_default',
        name: unitName,
        id: catDef.id,
        reason: 'invalid_grams_per_unit',
        value: gramsPerUnit
      });
      return;
    }

    if (!unitId) {
      diagnostics.invalid_units_filtered.push({
        source: 'category_default',
        name: unitName,
        id: catDef.id,
        reason: 'missing_unit_id'
      });
      return;
    }

    // אם יש subtype_keywords, בדוק התאמה
    if (catDef.subtype_keywords && catDef.subtype_keywords.length > 0) {
      const productNameLower = (productName || '').toLowerCase();
      const matches = catDef.subtype_keywords.some(kw => 
        productNameLower.includes(kw.toLowerCase())
      );
      
      if (!matches) {
        return; // דלג - לא מתאים לsubtype
      }
    }

    // אם יחידה זו כבר קיימת, דרוס את grams_per_unit (אלא אם היא מ-product_override)
    const existingIndex = units.findIndex(u => u.id === unitId);
    if (existingIndex !== -1) {
      if (units[existingIndex].source !== 'product_override') {
        // דרוס את הערך מה-global
        units[existingIndex].grams_per_unit = gramsPerUnit;
        units[existingIndex].source = 'category_default';
        units[existingIndex].confidence = catDef.confidence || 'exact';
        units[existingIndex].original = catDef;
      } else {
        return; // אם מproduct_override, אל תשנה
      }
    } else {
      // יחידה חדשה - הוסף
      units.push({
        id: unitId,
        name: unitName,
        grams_per_unit: gramsPerUnit,
        source: 'category_default',
        confidence: catDef.confidence || 'exact',
        original: catDef,
      });
    }
    
    seen.set(unitId, true);
    seenUnitNames.add(normalizeUnitName(unitName)); // סמן שם זה כתפוס - מונע כפילוי עם convenience
    
    if (!diagnostics.sources_used.includes('category_default')) {
      diagnostics.sources_used.push('category_default');
    }
  });

  // שלב 3: GlobalSafeUnits
  GLOBAL_SAFE_UNITS.forEach(safeUnit => {
    if (!seen.has(safeUnit.id)) {
      units.push(safeUnit);
      seen.set(safeUnit.id, true);
    }
  });
  
  if (!diagnostics.sources_used.includes('global_safe')) {
    diagnostics.sources_used.push('global_safe');
  }

  // שלב 4: ConvenienceUnits (רק אם שם היחידה לא כבר "תפוס" ממקור גבוה יותר)
  CONVENIENCE_UNITS.forEach(convUnit => {
    // דלג אם unit_id כבר קיים (product_override או category_default)
    if (seen.has(convUnit.id)) {
      return;
    }
    
    const normalizedConvName = normalizeUnitName(convUnit.name);
    
    // דלג אם שם זה כבר בשימוש בcategory_default או override
    if (seenUnitNames.has(normalizedConvName)) {
      return;
    }
    
    units.push(convUnit);
    seen.set(convUnit.id, true);
  });
  
  if (!diagnostics.sources_used.includes('global_convenience')) {
    diagnostics.sources_used.push('global_convenience');
  }

  if (units.length === GLOBAL_SAFE_UNITS.length + CONVENIENCE_UNITS.length) {
    diagnostics.fallback_to_global_only = true;
  }

  return { units, diagnostics };
}