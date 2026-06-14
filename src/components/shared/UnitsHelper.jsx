// Helper functions for units system

export const YOGURT_KEYWORDS = ['יוגורט', 'סקייר', 'דנונה', 'יופלה', 'PRO', 'pro', 'יוגורט חלבון', 'SKYR', 'skyr', 'גביע'];

export const isYogurtProduct = (productName) => {
  if (!productName) return false;
  const nameLower = productName.toLowerCase();
  return YOGURT_KEYWORDS.some(keyword => nameLower.includes(keyword.toLowerCase()));
};

export const extractGramsFromName = (productName) => {
  if (!productName) return null;
  
  // Patterns to match: "200g", "200 g", "200 גרם", "200גרם", "200ml", "200 ml", "200 מ״ל", "200מל"
  const patterns = [
    /(\d{2,4})\s*g\b/i,
    /(\d{2,4})\s*גרם/,
    /(\d{2,4})\s*ml\b/i,
    /(\d{2,4})\s*מ[״"]ל/,
    /(\d{2,4})\s*מל/,
  ];
  
  for (const pattern of patterns) {
    const match = productName.match(pattern);
    if (match) {
      const grams = parseInt(match[1], 10);
      // Sanity check: reasonable range for yogurt (50-1000g)
      if (grams >= 50 && grams <= 1000) {
        return grams;
      }
    }
  }
  
  return null;
};

export const YOGURT_BASE_UNITS = [
  { name: 'גביע (סטנדרטי)', grams: 200, order: 10 },
  { name: 'גביע קטן', grams: 150, order: 11 },
  { name: 'גביע 250', grams: 250, order: 12 },
  { name: 'גביע משפחתי', grams: 500, order: 13 },
];

export const FRACTION_UNITS = [
  { name: '1/2 גביע', fraction: 0.5, order: 20 },
  { name: '1/4 גביע', fraction: 0.25, order: 21 },
];

export const getYogurtUnitsForProduct = (product, foodUnits = []) => {
  if (!isYogurtProduct(product?.name_he)) return [];
  
  const units = [];
  
  // 1. Check for product-specific unit from coach
  const coachUnit = foodUnits.find(u => 
    u.scope_type === 'food' && 
    u.scope_value === product.id &&
    u.unit_name_he?.includes('גביע')
  );
  
  if (coachUnit) {
    units.push({
      name: coachUnit.unit_name_he,
      grams: coachUnit.grams_per_unit,
      order: 1,
      source: 'coach'
    });
  }
  
  // 2. Auto-detect from name
  const detectedGrams = extractGramsFromName(product.name_he);
  if (detectedGrams) {
    units.push({
      name: 'גביע (לפי האריזה)',
      grams: detectedGrams,
      order: 2,
      source: 'auto'
    });
  }
  
  // 3. Add base yogurt units
  YOGURT_BASE_UNITS.forEach(u => {
    units.push({ ...u, source: 'base' });
  });
  
  // 4. Add fraction units (they'll be calculated dynamically)
  FRACTION_UNITS.forEach(u => {
    units.push({ ...u, source: 'fraction' });
  });
  
  return units;
};

export const calculateGramsForYogurt = (quantity, unitName, yogurtUnits, baseGrams = 200) => {
  // Handle fractions
  if (unitName.includes('1/2')) {
    return quantity * baseGrams * 0.5;
  }
  if (unitName.includes('1/4')) {
    return quantity * baseGrams * 0.25;
  }
  
  // Find exact unit
  const unit = yogurtUnits.find(u => u.name === unitName);
  if (unit && unit.grams) {
    return quantity * unit.grams;
  }
  
  return quantity * baseGrams;
};