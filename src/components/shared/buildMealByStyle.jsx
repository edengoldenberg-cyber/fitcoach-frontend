/**
 * Build meals by culinary style
 * Constructs meals from bases + toppings instead of templates
 */

/**
 * Hard compatibility constraints
 */
const FORBIDDEN_COMBINATIONS = [
  // Pattern: [food1_keyword, food2_keyword]
  ['מתוק', 'בשר'],
  ['מתוק', 'טונה'],
  ['שוקולד', 'טונה'],
  ['עוף', 'קורנפלקס'],
  ['עוף', 'גרנולה'],
  ['בשר אדום', 'מתוק'],
  ['בשר אדום', 'דבש']
];

/**
 * Heavy proteins - only one allowed per meal
 */
const HEAVY_PROTEINS = ['בשר', 'עוף', 'דגים', 'טונה', 'סטייק', 'כבד'];

/**
 * Check hard constraints
 * Returns: { allowed: boolean, reason: string }
 */
function checkHardConstraints(items, mealType, selectedStyle) {
  const issues = [];
  
  // Check forbidden combinations
  const foodNames = items.map(i => i.food.name_he.toLowerCase());
  
  for (const [forbidden1, forbidden2] of FORBIDDEN_COMBINATIONS) {
    const has1 = foodNames.some(name => name.includes(forbidden1.toLowerCase()));
    const has2 = foodNames.some(name => name.includes(forbidden2.toLowerCase()));
    
    if (has1 && has2) {
      issues.push(`אסור: ${forbidden1} + ${forbidden2}`);
    }
  }
  
  // Check heavy protein count
  const heavyProteins = items.filter(item => 
    HEAVY_PROTEINS.some(hp => item.food.name_he.includes(hp))
  );
  
  if (heavyProteins.length > 1) {
    issues.push(`אסור: יותר מ-1 חלבון כבד (${heavyProteins.length} נמצאו)`);
  }
  
  // Check forbidden categories in specific meal types
  if (mealType === 'breakfast' && selectedStyle?.forbiddenToppings) {
    for (const topping of selectedStyle.forbiddenToppings) {
      const hasForbidden = items.some(item => 
        item.food.name_he.includes(topping) || item.food.resolvedCategory === topping
      );
      if (hasForbidden) {
        issues.push(`אסור בבוקר: ${topping}`);
      }
    }
  }
  
  // Check max items
  if (selectedStyle?.maxItems && items.length > selectedStyle.maxItems) {
    issues.push(`יותר מדי פריטים (${items.length}/${selectedStyle.maxItems})`);
  }
  
  return {
    allowed: issues.length === 0,
    issues
  };
}

/**
 * Find a base food item for the style
 */
function selectBase(style, availableFoods, excludeRecent = []) {
  const candidates = availableFoods.filter(food => {
    // Must be marked as suitable base OR category matches
    const nameMatches = style.bases.some(base => 
      food.name_he.toLowerCase().includes(base.toLowerCase())
    );
    
    const categoryMatches = style.bases.some(base =>
      food.resolvedCategory?.includes(base)
    );
    
    const isRecent = excludeRecent.some(recent => recent.id === food.id);
    
    return (nameMatches || categoryMatches) && !isRecent;
  });
  
  if (candidates.length === 0) return null;
  
  // Prefer favorites and coach-recommended
  candidates.sort((a, b) => {
    const scoreA = (a.is_coach_recommended ? 100 : 0) + (a.is_favorite ? 50 : 0) + (a.suggest_priority || 3) * 10;
    const scoreB = (b.is_coach_recommended ? 100 : 0) + (b.is_favorite ? 50 : 0) + (b.suggest_priority || 3) * 10;
    return scoreB - scoreA;
  });
  
  return candidates[0];
}

/**
 * Select toppings to complement the base
 */
function selectToppings(style, base, targetCalories, availableFoods, getUnitsForFood) {
  const baseQuant = getUnitsForFood(base.id)?.quantity || {
    quantity: 200,
    unit: 'גרם',
    calories: Math.round((base.per100_kcal * 200) / 100),
    protein: Math.round((base.per100_protein * 200) / 100 * 10) / 10,
    carbs: Math.round((base.per100_carbs * 200) / 100 * 10) / 10,
    fat: Math.round((base.per100_fat * 200) / 100 * 10) / 10
  };
  
  const remainingCalories = targetCalories - (baseQuant.calories || 0);
  const toppings = [];
  let currentCalories = baseQuant.calories || 0;
  
  // Find allowed toppings
  const allowedToppingFoods = availableFoods.filter(food => {
    // Check if food name matches allowed toppings
    return style.allowedToppings.some(topping => 
      food.name_he.toLowerCase().includes(topping.toLowerCase()) ||
      food.resolvedCategory?.includes(topping)
    ) && !style.forbiddenToppings?.some(forbidden =>
      food.name_he.toLowerCase().includes(forbidden.toLowerCase())
    );
  });
  
  // Sort by preference
  allowedToppingFoods.sort((a, b) => {
    const scoreA = (a.is_favorite ? 50 : 0) + (a.suggest_priority || 3) * 10;
    const scoreB = (b.is_favorite ? 50 : 0) + (b.suggest_priority || 3) * 10;
    return scoreB - scoreA;
  });
  
  // Build toppings (aim for 1-3 items)
  let attempts = 0;
  const maxAttempts = allowedToppingFoods.length;
  
  while (
    toppings.length < 3 &&
    currentCalories < targetCalories * 0.85 &&
    attempts < maxAttempts &&
    toppings.length < style.maxItems - 1 // Reserve space for base
  ) {
    const topping = allowedToppingFoods[attempts];
    if (!topping) break;
    
    // Calculate appropriate quantity
    const targetToppingCalories = Math.min(
      remainingCalories * 0.3, // 30% of remaining
      Math.max(remainingCalories - 50, 50) // At least some but not all
    );
    
    const quantity = (targetToppingCalories / topping.per100_kcal) * 100;
    
    if (quantity > 0) {
      const roundedQty = Math.round(quantity / 10) * 10;
      if (roundedQty > 0) {
        const food = {
          ...topping,
          selectedQuantity: roundedQty,
          selectedUnit: 'גרם',
          calories: Math.round((topping.per100_kcal * roundedQty) / 100),
          protein: Math.round((topping.per100_protein * roundedQty) / 100 * 10) / 10,
          carbs: Math.round((topping.per100_carbs * roundedQty) / 100 * 10) / 10,
          fat: Math.round((topping.per100_fat * roundedQty) / 100 * 10) / 10
        };
        
        toppings.push(food);
        currentCalories += food.calories;
        
        if (Math.abs(currentCalories - targetCalories) < targetCalories * 0.15) {
          break; // Close enough
        }
      }
    }
    
    attempts++;
  }
  
  return { base: baseQuant, toppings, totalCalories: currentCalories };
}

/**
 * Build a meal by style
 */
export function buildMealByStyle(style, targetCalories, availableFoods, getUnitsForFood, mealType) {
  if (!style || !availableFoods?.length) {
    return null;
  }
  
  // Select base
  const base = selectBase(style, availableFoods);
  if (!base) return null;
  
  // Select toppings and calculate totals
  const { base: baseQuant, toppings, totalCalories } = selectToppings(
    style,
    base,
    targetCalories,
    availableFoods,
    getUnitsForFood
  );
  
  if (toppings.length === 0) return null; // Need at least base + 1 topping
  
  // Construct full item list
  const baseItem = {
    ...base,
    selectedQuantity: baseQuant.quantity,
    selectedUnit: baseQuant.unit,
    calories: baseQuant.calories,
    protein: baseQuant.protein,
    carbs: baseQuant.carbs,
    fat: baseQuant.fat,
    role: 'base'
  };
  
  const allItems = [baseItem, ...toppings.map((t, i) => ({
    ...t,
    role: 'topping'
  }))];
  
  // Check hard constraints
  const { allowed, issues } = checkHardConstraints(allItems, mealType, style);
  if (!allowed) {
    return null;
  }
  
  // Calculate totals
  const totals = {
    calories: Math.round(totalCalories),
    protein: Math.round(allItems.reduce((s, i) => s + (i.protein || 0), 0) * 10) / 10,
    carbs: Math.round(allItems.reduce((s, i) => s + (i.carbs || 0), 0) * 10) / 10,
    fat: Math.round(allItems.reduce((s, i) => s + (i.fat || 0), 0) * 10) / 10
  };
  
  const calorieAccuracy = Math.abs(totals.calories - targetCalories) / targetCalories;
  
  // Only return if within tolerance
  if (calorieAccuracy > 0.15) { // 15% tolerance
    return null;
  }
  
  return {
    style: style.id,
    styleName: style.name,
    base: baseItem,
    toppings,
    items: allItems,
    totals,
    calorieAccuracy
  };
}

/**
 * Generate multiple meal options by style
 */
export function generateMealsByStyles(styles, targetCalories, availableFoods, getUnitsForFood, mealType) {
  const meals = [];
  
  for (const style of styles) {
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts && meals.length < 10) {
      const meal = buildMealByStyle(style, targetCalories, availableFoods, getUnitsForFood, mealType);
      if (meal) {
        meals.push(meal);
      }
      attempts++;
    }
  }
  
  return meals;
}