// Meal Suggestion Engine - Generates meal combinations from favorite foods
import { logEvent, logError } from './diagnostics/logger';
import { MEAL_STYLES, getStylesForMeal, scoreStyleForAvailableFoods } from './mealStyles';
import { buildMealByStyle, generateMealsByStyles } from './buildMealByStyle';
import { buildCombinationWithWatchdog, generateEmergencyMeals, watchdogConfig } from './mealEngineWatchdog';

/**
 * Generates 5 meal combinations based on favorite foods using templates
 * @param {Array} favoriteFoods - Foods marked with is_suggest_favorite=true
 * @param {string} mealTag - "בוקר", "צהריים", "ערב", "ביניים"
 * @param {number} targetCalories - Target calories for the meal
 * @param {string} focus - "יותר חלבון", "מאוזן", "יותר פחמימות", "יותר שומן"
 * @param {Function} getUnitsForFood - Function to get available units for a food
 * @param {Array} templates - MealTemplate entities (optional, falls back to legacy if empty)
 * @returns {Array} 5 meal combinations or fewer if not enough foods
 */
/**
 * MODE B: Culinary-based meal suggestion
 * Builds meals by style (SWEET_BOWL, SAVORY_PLATE, etc.) instead of templates
 */
export function suggestMealCulinary(favoriteFoods, mealTag, targetCalories, getUnitsForFood, lastSuggestedBases = []) {
  try {
    logEvent('MEAL_SUGGEST_CULINARY_START', { 
      mealType: mealTag,
      mode: 'MODE_B_CULINARY'
    });

    if (!favoriteFoods || favoriteFoods.length === 0) {
      return {
        error: 'אין מועדפים. הוסף מועדפים קודם ⭐',
        suggestions: [],
        mode: 'culinary'
      };
    }

    // Categorize foods
    const categorizedFoods = favoriteFoods.map(food => {
      const category = getCategoryMapping(food.category);
      const role = food.suggest_role || determineFoodRole(food);
      return { ...food, resolvedCategory: category, resolvedRole: role };
    });

    // Get applicable styles for meal type
    const applicableStyles = Object.values(getStylesForMeal(mealTag));
    
    // Score styles based on available foods
    const scoredStyles = applicableStyles.map(style => ({
      style,
      score: scoreStyleForAvailableFoods(style, categorizedFoods)
    }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

    if (scoredStyles.length === 0) {
      return {
        error: 'אין סטילים מתאימים לסטוק שלך',
        suggestions: [],
        mode: 'culinary'
      };
    }

    logEvent('STYLE_CHOSEN', {
      mealType: mealTag,
      topStyles: scoredStyles.slice(0, 3).map(s => ({ id: s.style.id, score: s.score }))
    });

    // Generate meals by style
    const styleList = scoredStyles.slice(0, 3).map(s => s.style);
    const mealsByStyle = generateMealsByStyles(
      styleList,
      targetCalories,
      categorizedFoods,
      getUnitsForFood,
      mealTag
    );

    if (mealsByStyle.length === 0) {
      return {
        error: 'לא הצלחתי לבנות ארוחות בסטילים הזמינים',
        suggestions: [],
        mode: 'culinary'
      };
    }

    // Score meals using "Human Scoring"
    const scoredMeals = mealsByStyle.map(meal => {
      const finalScore = scoreHumanMeal(
        meal,
        targetCalories,
        lastSuggestedBases,
        mealTag
      );
      return { ...meal, finalScore };
    });

    // Sort and return top 5
    scoredMeals.sort((a, b) => b.finalScore - a.finalScore);
    const topMeals = scoredMeals.slice(0, 5);

    const suggestions = topMeals.map((meal, idx) => ({
      id: `${meal.styleName}-${idx}`,
      items: meal.items,
      totals: meal.totals,
      style: meal.styleName,
      base: meal.base.name_he,
      toppings: meal.toppings.map(t => t.name_he),
      explanation: `${meal.styleName} - ${meal.items.length} פריטים, ${meal.totals.calories}kcal`,
      finalScore: Math.round(meal.finalScore),
      scoreBreakdown: meal.scoreBreakdown
    }));

    logEvent('CULINARY_SUGGESTIONS_READY', {
      count: suggestions.length,
      topScore: suggestions[0]?.finalScore
    });

    return {
      error: null,
      suggestions,
      mode: 'culinary',
      appliedStyles: styleList.map(s => s.name)
    };

  } catch (err) {
    console.error('🔴 Culinary suggestion failed:', err);
    logEvent('CULINARY_SUGGESTION_ERROR', { error: err.message });
    return {
      error: err.message,
      suggestions: [],
      mode: 'culinary'
    };
  }
}

export function generateMealSuggestions(favoriteFoods, mealTag, targetCalories, focus, getUnitsForFood, templates = []) {
  const start = Date.now();
  try {
    const useTemplates = templates && templates.length > 0;
    
    logEvent('MEAL_SUGGEST_START', {
      mealType: mealTag,
      targetCalories,
      focus,
      inputFoodsCount: favoriteFoods.length,
      templatesAvailable: templates?.length || 0,
      useTemplates
    });

    console.log('🎯 generateMealSuggestions called:', {
      inputFoodsCount: favoriteFoods.length,
      mealTag,
      targetCalories,
      focus,
      templatesCount: templates?.length || 0,
      useTemplates
    });
    
    // If templates available, use template-based engine
    if (useTemplates) {
      const result = generateWithTemplates(favoriteFoods, mealTag, targetCalories, focus, getUnitsForFood, templates);
      const suggestions = result?.suggestions || [];
      return {
        exitReason: suggestions.length > 0 ? 'SUCCESS' : 'ERROR',
        data: suggestions,
        elapsedMs: Date.now() - start
      };
    }
    
    // Otherwise, fall back to legacy engine
    console.log('⚠️ No templates available, using legacy engine');
  
  logEvent('MEAL_SUGGEST_PRE_FILTER', {
    candidatesCount: favoriteFoods.length
  });

  // Filter foods by meal tag - if food doesn't have suggest_meal_tags, include it for all meals
  const taggedFoods = favoriteFoods.filter(f => 
    !f.suggest_meal_tags || f.suggest_meal_tags.length === 0 || f.suggest_meal_tags.includes(mealTag)
  );
  
  logEvent('MEAL_SUGGEST_POST_FILTER', {
    candidatesCount: taggedFoods.length,
    filtersApplied: ['meal_tag=' + mealTag]
  });

  console.log('🔍 afterFilters count=', taggedFoods.length, 'filters={ mealTag:', mealTag, '}');

  if (taggedFoods.length === 0) {
    console.log('❌ ERROR: No foods after filtering by meal tag');
    logEvent('MEAL_SUGGEST_RESULT', {
      resultCount: 0,
      topItemsSample: []
    });
    return { 
      exitReason: 'ERROR',
      data: [],
      elapsedMs: Date.now() - start
    };
  }

  // Group by role - improved categorization with category mapping
  const categorizeFood = (food) => {
    // Priority 1: Explicit suggest_role
    if (food.suggest_role) return food.suggest_role;
    
    // Priority 2: Category-based mapping (Hebrew categories)
    const categoryMap = {
      'חלבון': 'חלבון',
      'חלב ומוצריו': 'חלבון',
      'דגנים': 'פחמימה',
      'פחמימה': 'פחמימה',
      'קטניות': 'פחמימה',
      'שומן': 'שומן',
      'ירקות': 'ירק/חופשי',
      'פירות': 'ירק/חופשי',
      'מתוקים': 'מתוק/פינוק',
      'ממרח': 'שומן'
    };
    
    const category = food.category?.trim() || '';
    if (categoryMap[category]) {
      return categoryMap[category];
    }
    
    // Priority 3: Macro-based auto-categorization
    const kcal = food.per100_kcal || 1;
    const protein = food.per100_protein || 0;
    const carbs = food.per100_carbs || 0;
    const fat = food.per100_fat || 0;
    
    const proteinRatio = (protein * 4 / kcal) * 100;
    const carbsRatio = (carbs * 4 / kcal) * 100;
    const fatRatio = (fat * 9 / kcal) * 100;
    
    if (proteinRatio > 35) return 'חלבון';
    if (carbsRatio > 50) return 'פחמימה';
    if (fatRatio > 50) return 'שומן';
    if (kcal < 50) return 'ירק/חופשי'; // Low calorie = veggie
    
    return 'ירק/חופשי'; // Default fallback
  };
  
  const byRole = {
    'חלבון': taggedFoods.filter(f => categorizeFood(f) === 'חלבון').sort((a, b) => (b.suggest_priority || 3) - (a.suggest_priority || 3)),
    'פחמימה': taggedFoods.filter(f => categorizeFood(f) === 'פחמימה').sort((a, b) => (b.suggest_priority || 3) - (a.suggest_priority || 3)),
    'שומן': taggedFoods.filter(f => categorizeFood(f) === 'שומן').sort((a, b) => (b.suggest_priority || 3) - (a.suggest_priority || 3)),
    'ירק/חופשי': taggedFoods.filter(f => categorizeFood(f) === 'ירק/חופשי').sort((a, b) => (b.suggest_priority || 3) - (a.suggest_priority || 3)),
    'מתוק/פינוק': taggedFoods.filter(f => categorizeFood(f) === 'מתוק/פינוק').sort((a, b) => (b.suggest_priority || 3) - (a.suggest_priority || 3))
  };
  
  console.log('📊 Category breakdown:', {
    חלבון: byRole['חלבון'].length,
    פחמימה: byRole['פחמימה'].length,
    שומן: byRole['שומן'].length,
    'ירק/חופשי': byRole['ירק/חופשי'].length,
    'מתוק/פינוק': byRole['מתוק/פינוק'].length
  });
  
  // Log role analysis with samples
  const roleSample = taggedFoods.slice(0, 5).map(f => ({
    name: f.name_he,
    category: f.category,
    suggest_role: f.suggest_role || null,
    resolvedRole: categorizeFood(f),
    kcal: f.per100_kcal,
    protein: f.per100_protein,
    carbs: f.per100_carbs,
    fat: f.per100_fat
  }));
  
  logEvent('MEAL_SUGGEST_ROLE_ANALYSIS', {
    roleCounts: {
      חלבון: byRole['חלבון'].length,
      פחמימה: byRole['פחמימה'].length,
      שומן: byRole['שומן'].length,
      'ירק/חופשי': byRole['ירק/חופשי'].length,
      'מתוק/פינוק': byRole['מתוק/פינוק'].length
    },
    sample: roleSample
  });

  // Check required roles per meal type
  const requirements = getMealRequirements(mealTag, focus);
  const missing = [];
  requirements.required.forEach(role => {
    if (!byRole[role] || byRole[role].length === 0) {
      missing.push(role);
    }
  });

  if (missing.length > 0) {
    console.log('⚠️ Missing required roles:', missing, '- trying fallback...');
    
    // FALLBACK: Try with relaxed meal_tag filter
    const fallbackFoods = favoriteFoods.filter(f => 
      !f.suggest_meal_tags || 
      f.suggest_meal_tags.length === 0 || 
      f.suggest_meal_tags.includes(mealTag) ||
      f.suggest_meal_tags.includes('כללי')
    );
    
    if (fallbackFoods.length > taggedFoods.length) {
      console.log('🔄 Fallback found more foods:', fallbackFoods.length, 'vs', taggedFoods.length);
      
      logEvent('MEAL_SUGGEST_FALLBACK', {
        reason: 'missingRoles',
        originalCount: taggedFoods.length,
        fallbackCount: fallbackFoods.length,
        missingRoles: missing
      });
      
      // Retry with fallback foods
      const fallbackByRole = {
        'חלבון': fallbackFoods.filter(f => categorizeFood(f) === 'חלבון').sort((a, b) => (b.suggest_priority || 3) - (a.suggest_priority || 3)),
        'פחמימה': fallbackFoods.filter(f => categorizeFood(f) === 'פחמימה').sort((a, b) => (b.suggest_priority || 3) - (a.suggest_priority || 3)),
        'שומן': fallbackFoods.filter(f => categorizeFood(f) === 'שומן').sort((a, b) => (b.suggest_priority || 3) - (a.suggest_priority || 3)),
        'ירק/חופשי': fallbackFoods.filter(f => categorizeFood(f) === 'ירק/חופשי').sort((a, b) => (b.suggest_priority || 3) - (a.suggest_priority || 3)),
        'מתוק/פינוק': fallbackFoods.filter(f => categorizeFood(f) === 'מתוק/פינוק').sort((a, b) => (b.suggest_priority || 3) - (a.suggest_priority || 3))
      };
      
      const stillMissing = [];
      requirements.required.forEach(role => {
        if (!fallbackByRole[role] || fallbackByRole[role].length === 0) {
          stillMissing.push(role);
        }
      });
      
      if (stillMissing.length === 0) {
        console.log('✅ Fallback resolved missing roles! Continuing with fallback data...');
        Object.assign(byRole, fallbackByRole);
      } else {
        console.log('❌ ERROR: Still missing roles after fallback:', stillMissing);
        logEvent('MEAL_SUGGEST_RESULT', {
          resultCount: 0,
          topItemsSample: [],
          missingRoles: stillMissing,
          fallbackUsed: true
        });
        return { 
          exitReason: 'FALLBACK',
          data: [],
          elapsedMs: Date.now() - start
        };
      }
    } else {
      console.log('❌ ERROR: Fallback did not help. Missing roles:', missing);
      logEvent('MEAL_SUGGEST_RESULT', {
        resultCount: 0,
        topItemsSample: [],
        missingRoles: missing
      });
      return { 
        exitReason: 'ERROR',
        data: [],
        elapsedMs: Date.now() - start
      };
    }
  }
  
  console.log('✅ All required roles available, generating combinations...');

  // Generate combinations
  const combinations = [];
  const maxAttempts = 20;
  const targetRange = { min: targetCalories * 0.93, max: targetCalories * 1.07 };

  for (let attempt = 0; attempt < maxAttempts && combinations.length < 5; attempt++) {
    const combo = buildCombination(requirements, byRole, targetCalories, targetRange, focus, getUnitsForFood, combinations);
    if (combo) {
      combinations.push(combo);
    }
  }

  if (combinations.length === 0) {
    console.log('❌ ERROR: Failed to generate any valid combinations');
    logEvent('MEAL_SUGGEST_RESULT', {
      resultCount: 0,
      topItemsSample: []
    });
    return { 
      exitReason: 'ERROR',
      data: [],
      elapsedMs: Date.now() - start
    };
  }

  console.log('✅ finalCandidates count=', combinations.length, 'source=generated');
  
  logEvent('MEAL_SUGGEST_RESULT', {
    resultCount: combinations.length,
    topItemsSample: combinations.slice(0, 5).map(c => 
      c.items.map(item => item.food.name_he).join(' + ')
    )
  });

  return { 
    exitReason: 'SUCCESS',
    data: combinations || [],
    elapsedMs: Date.now() - start
  };
  } catch (err) {
    logError('MEAL_SUGGEST_ERROR', err, {
      mealType: mealTag,
      targetCalories,
      focus
    });
    console.error('❌ FATAL ERROR in generateMealSuggestions:', err);
    return {
      exitReason: 'ERROR',
      data: [],
      elapsedMs: Date.now() - start
    };
  }
}

function getMealRequirements(mealTag, focus) {
  const base = {
    'בוקר': { required: ['חלבון', 'פחמימה'], optional: ['שומן'] },
    'צהריים': { required: ['חלבון', 'פחמימה', 'ירק/חופשי'], optional: ['שומן'] },
    'ערב': { required: ['חלבון', 'ירק/חופשי'], optional: ['שומן'] },
    'ביניים': { required: ['חלבון'], optional: ['פחמימה', 'מתוק/פינוק'] }
  }[mealTag] || { required: ['חלבון'], optional: [] };

  // Adjust based on focus
  if (mealTag === 'ערב' && focus === 'יותר פחמימות' && !base.required.includes('פחמימה')) {
    base.required.push('פחמימה');
  }

  return base;
}

function buildCombination(requirements, byRole, targetCalories, targetRange, focus, getUnitsForFood, existingCombos) {
  const items = [];
  const usedIndices = new Set();

  // Select foods for required roles
  for (const role of requirements.required) {
    const availableFoods = byRole[role].filter((_, idx) => !usedIndices.has(`${role}_${idx}`));
    if (availableFoods.length === 0) return null;

    const randomIdx = Math.floor(Math.random() * Math.min(3, availableFoods.length));
    const food = availableFoods[randomIdx];
    const originalIdx = byRole[role].indexOf(food);
    usedIndices.add(`${role}_${originalIdx}`);

    const units = getUnitsForFood(food);
    const item = selectQuantityForFood(food, units, targetCalories / requirements.required.length);
    if (item) items.push(item);
  }

  // Calculate current totals
  const current = calculateTotals(items);

  // Add optional items if under target
  if (current.calories < targetRange.min) {
    for (const role of requirements.optional) {
      if (current.calories >= targetRange.min) break;
      const availableFoods = byRole[role].filter((_, idx) => !usedIndices.has(`${role}_${idx}`));
      if (availableFoods.length === 0) continue;

      const food = availableFoods[0];
      const originalIdx = byRole[role].indexOf(food);
      usedIndices.add(`${role}_${originalIdx}`);

      const units = getUnitsForFood(food);
      const remaining = targetRange.max - current.calories;
      const item = selectQuantityForFood(food, units, remaining);
      if (item) {
        items.push(item);
        Object.assign(current, calculateTotals(items));
      }
    }
  }

  // Check if within range
  if (current.calories < targetRange.min || current.calories > targetRange.max) {
    return null;
  }

  // Check if duplicate
  const signature = items.map(i => i.food.id).sort().join('_');
  if (existingCombos.some(c => c.signature === signature)) {
    return null;
  }

  // Score by focus
  const score = scoreCombination(current, focus);

  return {
    items,
    totals: current,
    score,
    signature,
    name: generateComboName(items, focus)
  };
}

/**
 * Template-based meal generation
 */
/**
 * Compatibility Rules per meal type
 */
const COMPATIBILITY_RULES = {
  'בוקר': {
    maxItems: 4,
    penalizedCategories: ['בשר', 'עוף', 'דגים'],
    penaltyWeight: 100,
    rules: [
      {
        condition: (items) => items.some(i => ['דגנים', 'מתוקים'].includes(i.food.resolvedCategory)),
        then: (items) => {
          // אם יש דגן מתוק, רק חלבון חלבי/סקופ מותר
          const hasNonDairy = items.some(i => 
            i.food.resolvedRole === 'חלבון' && 
            !['חלב ומוצריו', 'יוגורט', 'גבינה'].some(kw => i.food.name_he.includes(kw))
          );
          return hasNonDairy ? 50 : 0;
        }
      },
      {
        condition: (items) => {
          const heavyProteins = items.filter(i => 
            ['בשר', 'עוף', 'דגים', 'ביצים'].includes(i.food.resolvedCategory)
          );
          return heavyProteins.length > 1;
        },
        then: () => 80 // שני חלבונים כבדים
      }
    ]
  },
  'צהריים': {
    maxItems: 5,
    penalizedCategories: ['מתוקים'],
    penaltyWeight: 50
  },
  'ערב': {
    maxItems: 5,
    penalizedCategories: ['מתוקים', 'דגנים מתוקים'],
    penaltyWeight: 60
  },
  'ביניים': {
    maxItems: 3,
    penalizedCategories: [],
    penaltyWeight: 0
  }
};

/**
 * Food Synergy Pairs
 */
const SYNERGY_PAIRS = {
  positive: [
    ['יוגורט', 'גרנולה'],
    ['יוגורט', 'פירות'],
    ['ביצים', 'לחם'],
    ['טונה', 'לחם'],
    ['סלט', 'עוף'],
    ['סלט', 'טונה'],
    ['חומוס', 'לחם'],
    ['גבינה', 'לחם'],
    ['בננה', 'חמאת בוטנים'],
    ['תפוח', 'חמאת בוטנים']
  ],
  negative: [
    ['עוף', 'קורנפלקס'],
    ['עוף', 'גרנולה'],
    ['טונה', 'שוקולד'],
    ['טונה', 'מתוק'],
    ['בשר', 'פרי מתוק'],
    ['בשר', 'דבש'],
    ['דגים', 'חלב']
  ]
};

/**
 * Check food compatibility and calculate penalties
 */
function checkCompatibility(items, mealType) {
  const rules = COMPATIBILITY_RULES[mealType] || COMPATIBILITY_RULES['ביניים'];
  let penalty = 0;
  const issues = [];
  
  // Check penalized categories
  if (rules.penalizedCategories) {
    items.forEach(item => {
      if (rules.penalizedCategories.includes(item.food.resolvedCategory)) {
        penalty += rules.penaltyWeight;
        issues.push(`${item.food.name_he} לא מתאים ל${mealType}`);
      }
    });
  }
  
  // Check max items
  if (rules.maxItems && items.length > rules.maxItems) {
    penalty += (items.length - rules.maxItems) * 30;
    issues.push(`יותר מדי פריטים (${items.length})`);
  }
  
  // Check custom rules
  if (rules.rules) {
    rules.rules.forEach(rule => {
      if (rule.condition(items)) {
        const rulePenalty = rule.then(items);
        penalty += rulePenalty;
        if (rulePenalty > 0) {
          issues.push('חוק תאימות');
        }
      }
    });
  }
  
  return { penalty, issues };
}

/**
 * Calculate synergy score between food items
 */
function calculateSynergy(items) {
  let synergyScore = 0;
  const synergies = [];
  
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const food1 = items[i].food.name_he.toLowerCase();
      const food2 = items[j].food.name_he.toLowerCase();
      
      // Check positive pairs
      SYNERGY_PAIRS.positive.forEach(([term1, term2]) => {
        if ((food1.includes(term1) && food2.includes(term2)) ||
            (food1.includes(term2) && food2.includes(term1))) {
          synergyScore += 40;
          synergies.push(`✓ ${term1}+${term2}`);
        }
      });
      
      // Check negative pairs
      SYNERGY_PAIRS.negative.forEach(([term1, term2]) => {
        if ((food1.includes(term1) && food2.includes(term2)) ||
            (food1.includes(term2) && food2.includes(term1))) {
          synergyScore -= 60;
          synergies.push(`✗ ${term1}+${term2}`);
        }
      });
    }
  }
  
  return { synergyScore, synergies };
}

function generateWithTemplates(favoriteFoods, mealTag, targetCalories, focus, getUnitsForFood, templates) {
  const startTime = Date.now();
  try {
    logEvent('MEAL_SUGGEST_TEMPLATE_MODE', { 
      mealType: mealTag, 
      focus,
      templatesCount: templates.length 
    });
    
    // Step 1: Enhanced food categorization with both role and category
    const categorizedFoods = favoriteFoods.map(food => {
      const category = getCategoryMapping(food.category);
      
      // Determine role
      let role = food.suggest_role;
      if (!role) {
        // Enhanced category-to-role mapping
        const categoryRoleMap = {
          'חלבון': 'חלבון',
          'חלב ומוצריו': 'חלבון',
          'דגנים': 'פחמימה',
          'פחמימה': 'פחמימה',
          'קטניות': 'פחמימה',
          'שומן': 'שומן',
          'ממרח': 'שומן',
          'ירקות': 'ירק/חופשי',
          'פירות': 'פרי',
          'מתוקים': 'מתוק/פינוק',
          'ביצים': 'חלבון',
          'לחמים': 'פחמימה',
          'בשר': 'חלבון',
          'עוף': 'חלבון',
          'דגים': 'חלבון',
          'טופו': 'חלבון',
          'אגוזים': 'שומן',
          'גרעינים': 'שומן'
        };
        
        role = categoryRoleMap[category];
        
        if (!role) {
          // Fallback to macro-based
          const kcal = food.per100_kcal || 1;
          const protein = food.per100_protein || 0;
          const carbs = food.per100_carbs || 0;
          const fat = food.per100_fat || 0;
          
          const proteinRatio = (protein * 4 / kcal) * 100;
          const carbsRatio = (carbs * 4 / kcal) * 100;
          const fatRatio = (fat * 9 / kcal) * 100;
          
          if (proteinRatio > 35) role = 'חלבון';
          else if (carbsRatio > 50) role = 'פחמימה';
          else if (fatRatio > 50) role = 'שומן';
          else if (kcal < 50) role = 'ירק/חופשי';
          else role = 'ירק/חופשי';
        }
      }
      
      return {
        ...food,
        resolvedCategory: category,
        resolvedRole: role
      };
    });
    
    // Step 2: Select matching templates
    const matchingTemplates = templates
      .filter(t => t.active !== false)
      .filter(t => t.meal_type === mealTag)
      .filter(t => !focus || t.focus === focus || t.focus === 'חופשי' || focus === 'מאוזן')
      .sort((a, b) => (b.priority || 5) - (a.priority || 5));
    
    if (matchingTemplates.length === 0) {
      logEvent('TEMPLATE_NO_MATCH', { mealType: mealTag, focus });
      console.log('⚠️ No matching templates, trying fallback...');
      
      // Fallback to any template for this meal type
      const fallbackTemplates = templates.filter(t => t.active !== false && t.meal_type === mealTag);
      if (fallbackTemplates.length > 0) {
        matchingTemplates.push(...fallbackTemplates);
      }
    }
    
    if (matchingTemplates.length === 0) {
      throw new Error('No templates available for ' + mealTag);
    }
    
    logEvent('TEMPLATE_PICKED', {
      selectedCount: matchingTemplates.length,
      templates: matchingTemplates.map(t => ({ name: t.name, priority: t.priority }))
    });
    
    // Step 3: Generate combinations from templates with compatibility checks
    const allCombinations = [];
    const maxAttempts = 50;
    
    for (let attempt = 0; attempt < maxAttempts && allCombinations.length < 20; attempt++) {
      const template = matchingTemplates[attempt % matchingTemplates.length];
      const combo = fillTemplate(template, categorizedFoods, targetCalories, getUnitsForFood, allCombinations, mealTag);
      
      if (combo) {
        allCombinations.push(combo);
      }
    }
    
    if (allCombinations.length === 0) {
      logEvent('TEMPLATE_FILL_FAILED', { 
        mealType: mealTag,
        templatesAttempted: matchingTemplates.length,
        foodsAvailable: categorizedFoods.length
      });
      
      return {
        error: 'לא הצלחתי למלא תבניות מתאימות. נסה להוסיף עוד מועדפים ⭐',
        suggestions: []
      };
    }
    
    // Sort by final score
    allCombinations.sort((a, b) => b.finalScore - a.finalScore);
    
    // Filter by minimum score threshold
    const MIN_SCORE = 80;
    const validCombos = allCombinations.filter(c => c.finalScore >= MIN_SCORE);
    
    if (validCombos.length === 0) {
      logEvent('ALL_COMBOS_BELOW_THRESHOLD', {
        totalGenerated: allCombinations.length,
        minScore: MIN_SCORE,
        bestScore: allCombinations[0]?.finalScore
      });
      
      return {
        error: 'לא מצאתי קומבינציות איכותיות מספיק. נסה להוסיף עוד מועדפים ⭐',
        suggestions: []
      };
    }
    
    // Weighted random selection from top 10
    const topCombos = validCombos.slice(0, 10);
    const combinations = [];
    const selectedIndices = new Set();
    
    while (combinations.length < Math.min(5, topCombos.length)) {
      // Weighted random (prefer higher scores)
      const weights = topCombos.map((_, idx) => Math.pow(0.7, idx));
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const rand = Math.random() * totalWeight;
      
      let cumulative = 0;
      for (let i = 0; i < topCombos.length; i++) {
        if (selectedIndices.has(i)) continue;
        cumulative += weights[i];
        if (rand <= cumulative) {
          combinations.push(topCombos[i]);
          selectedIndices.add(i);
          break;
        }
      }
      
      // Safety break
      if (selectedIndices.size >= topCombos.length) break;
    }
    
    logEvent('MEAL_SUGGEST_RESULT', {
      resultCount: combinations.length,
      topItemsSample: combinations.slice(0, 5).map(c => 
        `${c.templateName}: ` + c.items.map(item => item.food.name_he).join(' + ')
      )
    });
    
    return { 
     suggestions: combinations, 
     error: null,
     elapsedMs: Date.now() - startTime
   };
    
  } catch (err) {
    logError('MEAL_SUGGEST_TEMPLATE_ERROR', err, { mealType: mealTag });
    console.error('Template engine error:', err);
    
    // Fallback to legacy
    console.log('⚠️ Template engine failed, falling back to legacy...');
    return null; // Will trigger legacy fallback in parent
  }
}

function fillTemplate(template, categorizedFoods, targetCalories, getUnitsForFood, existingCombos, mealType) {
  const items = [];
  const usedFoodIds = new Set();
  const targetRange = { min: targetCalories * 0.9, max: targetCalories * 1.1 };
  
  // Fill each slot
  for (const slot of template.slots || []) {
    const candidates = categorizedFoods.filter(food => {
      if (usedFoodIds.has(food.id)) return false;
      if (slot.role && food.resolvedRole !== slot.role) return false;
      if (slot.allowed_categories && slot.allowed_categories.length > 0) {
        if (!slot.allowed_categories.includes(food.resolvedCategory)) return false;
      }
      return true;
    });
    
    if (candidates.length === 0) {
      if (!slot.optional) {
        // Required slot missing
        logEvent('TEMPLATE_SLOT_MISSING', {
          templateName: template.name,
          slotRole: slot.role,
          allowedCategories: slot.allowed_categories
        });
        return null;
      }
      continue; // Skip optional slot
    }
    
    // Prioritize: coach recommended > favorite > meal-tagged > priority
    candidates.sort((a, b) => {
      const scoreA = (a.is_coach_recommended ? 10000 : 0) + 
                     (a.is_favorite ? 5000 : 0) + 
                     (a.suggest_meal_tags?.length > 0 ? 1000 : 0) +
                     (a.suggest_priority || 3) * 100;
      const scoreB = (b.is_coach_recommended ? 10000 : 0) + 
                     (b.is_favorite ? 5000 : 0) + 
                     (b.suggest_meal_tags?.length > 0 ? 1000 : 0) +
                     (b.suggest_priority || 3) * 100;
      return scoreB - scoreA;
    });
    
    // Select from top 3 with weighted randomness (prefer top)
    const topN = Math.min(3, candidates.length);
    const weights = [0.6, 0.3, 0.1];
    const rand = Math.random();
    let cumulative = 0;
    let selectedIndex = 0;
    for (let i = 0; i < topN; i++) {
      cumulative += weights[i];
      if (rand < cumulative) {
        selectedIndex = i;
        break;
      }
    }
    const food = candidates[selectedIndex];
    usedFoodIds.add(food.id);
    
    const units = getUnitsForFood(food);
    const portionCalories = targetCalories / (template.slots?.length || 3);
    const item = selectQuantityForFood(food, units, portionCalories);
    
    if (item) items.push(item);
  }
  
  if (items.length === 0) return null;
  
  // Calculate totals and check range
  const totals = calculateTotals(items);
  
  if (totals.calories < targetRange.min * 0.7 || totals.calories > targetRange.max * 1.3) {
    return null; // Too far from target
  }
  
  // Check for duplicate signatures
  const signature = items.map(i => i.food.id).sort().join('_');
  if (existingCombos.some(c => c.signature === signature)) {
    return null;
  }
  
  // ============ COMPREHENSIVE SCORING ============
  
  // 1. Template Fit Score (base score from template priority)
  let templateFitScore = (template.priority || 5) * 20;
  
  // 2. Source Priority Score
  let sourcePriorityScore = 0;
  let coachCount = 0;
  let favoriteCount = 0;
  items.forEach(item => {
    if (item.food.is_coach_recommended) {
      sourcePriorityScore += 100;
      coachCount++;
    } else if (item.food.is_favorite) {
      sourcePriorityScore += 50;
      favoriteCount++;
    }
    if (item.food.suggest_priority) sourcePriorityScore += item.food.suggest_priority * 10;
  });
  
  // 3. Role Balance Score
  const roles = items.map(i => i.food.resolvedRole);
  const hasProtein = roles.includes('חלבון');
  const hasCarb = roles.includes('פחמימה');
  let roleBalanceScore = 0;
  if (hasProtein && hasCarb) roleBalanceScore += 40;
  else if (hasProtein || hasCarb) roleBalanceScore += 20;
  
  // 4. Calorie Accuracy Score
  const caloriesDiff = Math.abs(totals.calories - targetCalories);
  const calorieAccuracyScore = Math.max(0, 100 - caloriesDiff / 5);
  
  // 5. Item Count Score (3-4 is ideal)
  const itemCount = items.length;
  let itemCountScore = 0;
  if (itemCount === 3 || itemCount === 4) itemCountScore = 40;
  else if (itemCount === 2) itemCountScore = 20;
  else if (itemCount === 5) itemCountScore = 10;
  else itemCountScore = -20;
  
  // 6. Meal Tag Bonus
  const mealTaggedCount = items.filter(item => 
    item.food.suggest_meal_tags && item.food.suggest_meal_tags.length > 0
  ).length;
  const mealTagBonus = mealTaggedCount * 15;
  
  // 7. Compatibility Check
  const { penalty: compatibilityPenalty, issues: compatibilityIssues } = checkCompatibility(items, mealType);
  
  // 8. Synergy Score
  const { synergyScore, synergies } = calculateSynergy(items);
  
  // ============ FINAL SCORE CALCULATION ============
  const finalScore = 
    templateFitScore +
    sourcePriorityScore +
    roleBalanceScore +
    calorieAccuracyScore +
    itemCountScore +
    mealTagBonus +
    synergyScore -
    compatibilityPenalty;
  
  // Build explanation
  const sources = [];
  if (coachCount > 0) sources.push(`${coachCount} ממומלצי המאמן`);
  if (favoriteCount > 0) sources.push(`${favoriteCount} מהמועדפים`);
  
  const explanation = [
    `${template.name}`,
    `${items.length} פריטים`,
    `${Math.round(totals.calories)} קק"ל`,
    sources.length > 0 ? `(${sources.join(', ')})` : ''
  ].filter(Boolean).join(' • ');
  
  // Detailed score breakdown log
  logEvent('COMBINATION_SCORE_BREAKDOWN', {
    templateName: template.name,
    items: items.map(i => i.food.name_he),
    scores: {
      templateFit: Math.round(templateFitScore),
      sourcePriority: Math.round(sourcePriorityScore),
      roleBalance: Math.round(roleBalanceScore),
      calorieAccuracy: Math.round(calorieAccuracyScore),
      itemCount: Math.round(itemCountScore),
      mealTagBonus: Math.round(mealTagBonus),
      synergy: Math.round(synergyScore),
      compatibilityPenalty: -Math.round(compatibilityPenalty),
      finalScore: Math.round(finalScore)
    },
    synergies,
    compatibilityIssues
  });
  
  return {
    items,
    totals,
    score: finalScore, // legacy compatibility
    finalScore,
    signature,
    name: template.name,
    templateName: template.name,
    templateId: template.id,
    explanation,
    scoreBreakdown: {
      templateFit: Math.round(templateFitScore),
      sourcePriority: Math.round(sourcePriorityScore),
      roleBalance: Math.round(roleBalanceScore),
      calorieAccuracy: Math.round(calorieAccuracyScore),
      itemCount: Math.round(itemCountScore),
      synergy: Math.round(synergyScore),
      penalty: Math.round(compatibilityPenalty),
      final: Math.round(finalScore)
    }
  };
}

function getCategoryMapping(category) {
  const map = {
    'חלבון': 'חלבון',
    'חלב ומוצריו': 'חלב ומוצריו',
    'דגנים': 'דגנים',
    'פחמימה': 'פחמימה',
    'קטניות': 'קטניות',
    'שומן': 'שומן',
    'ממרח': 'ממרח',
    'ירקות': 'ירקות',
    'פירות': 'פירות',
    'מתוקים': 'מתוקים',
    'רטבים': 'ממרח',
    'תוספים': 'תוספת',
    'ביצים': 'חלבון',
    'לחמים': 'פחמימה',
    'בשר': 'חלבון',
    'עוף': 'חלבון',
    'דגים': 'חלבון',
    'טופו': 'חלבון',
    'אגוזים': 'שומן',
    'גרעינים': 'שומן'
  };
  return map[category?.trim()] || category || 'אחר';
}

function selectQuantityForFood(food, units, targetCalories) {
  // Find best unit (prefer convenient units)
  const convenientUnits = ['יחידה', 'פרוסה', 'כף', 'כוס', 'גביע', 'פחית'];
  let selectedUnit = 'גרם';
  let gramsPerUnit = 1;

  for (const unitName of convenientUnits) {
    if (units[unitName]) {
      selectedUnit = unitName;
      gramsPerUnit = units[unitName];
      break;
    }
  }

  // Calculate target grams
  const targetGrams = (targetCalories / food.per100_kcal) * 100;

  // Calculate quantity
  let quantity = targetGrams / gramsPerUnit;

  // Round to nice number
  if (selectedUnit === 'גרם') {
    quantity = Math.round(quantity / 10) * 10; // Round to 10g
    if (quantity < 10) quantity = Math.round(quantity / 5) * 5; // Round to 5g if small
  } else {
    quantity = Math.round(quantity * 2) / 2; // Round to 0.5 units
    if (quantity < 1) quantity = Math.max(0.5, Math.round(quantity * 4) / 4); // Round to 0.25 if < 1
  }

  if (quantity <= 0) return null;

  const totalGrams = quantity * gramsPerUnit;
  const calories = Math.round((food.per100_kcal * totalGrams) / 100);
  const protein = Math.round((food.per100_protein * totalGrams) / 100 * 10) / 10;
  const carbs = Math.round((food.per100_carbs * totalGrams) / 100 * 10) / 10;
  const fat = Math.round((food.per100_fat * totalGrams) / 100 * 10) / 10;

  return {
    food,
    quantity,
    unit: selectedUnit,
    grams: Math.round(totalGrams),
    calories,
    protein,
    carbs,
    fat
  };
}

function calculateTotals(items) {
  return items.reduce((acc, item) => ({
    calories: acc.calories + item.calories,
    protein: acc.protein + item.protein,
    carbs: acc.carbs + item.carbs,
    fat: acc.fat + item.fat
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

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
      const proteinPct = proteinCals / total;
      const carbsPct = carbsCals / total;
      const fatPct = fatCals / total;
      // Score: closer to 30/40/30 = better
      return 1000 - (Math.abs(proteinPct - 0.30) + Math.abs(carbsPct - 0.40) + Math.abs(fatPct - 0.30)) * 100;
  }
}

function generateComboName(items, focus) {
  const roles = [...new Set(items.map(i => i.food.suggest_role))];
  return `${focus} (${roles.join(' + ')})`;
}

/**
 * Human-like scoring for culinary meals
 */
function scoreHumanMeal(meal, targetCalories, lastSuggestedBases = [], mealType) {
  // 1. Calorie Accuracy (±10-15%)
  const calorieTarget = targetCalories;
  const calorieDiff = Math.abs(meal.totals.calories - calorieTarget);
  const calorieAccuracy = Math.max(0, 100 - (calorieDiff / calorieTarget) * 200);

  // 2. Role Balance
  const roles = meal.items.map(i => i.resolvedRole || i.role);
  const hasProtein = roles.some(r => r === 'חלבון');
  const hasCarb = roles.some(r => r === 'פחמימה');
  const roleBalance = (hasProtein && hasCarb) ? 50 : (hasProtein || hasCarb) ? 25 : 0;

  // 3. Simplicity Bonus (3-4 items is ideal)
  const itemCount = meal.items.length;
  const simplicityBonus = itemCount === 3 || itemCount === 4 ? 40 : itemCount === 2 ? 15 : Math.max(0, 40 - (itemCount - 4) * 8);

  // 4. Variety Bonus (avoid recent bases)
  const baseName = meal.base.name_he.toLowerCase();
  const isRecent = lastSuggestedBases.some(b => 
    b.toLowerCase().includes(baseName.substring(0, 4))
  );
  const varietyBonus = isRecent ? -30 : 30;

  // 5. Synergy (positive pairings)
  const { synergyScore, synergies } = calculateSynergy(meal.items);

  // 6. Penalties (hard constraints already filtered, but minor penalties for warnings)
  const penalties = 0; // Hard constraints prevented this meal from being created

  // Final Score
  const finalScore = calorieAccuracy + roleBalance + simplicityBonus + varietyBonus + synergyScore + penalties;

  const scoreBreakdown = {
    calorieAccuracy: Math.round(calorieAccuracy),
    roleBalance: Math.round(roleBalance),
    simplicity: Math.round(simplicityBonus),
    variety: Math.round(varietyBonus),
    synergy: Math.round(synergyScore),
    final: Math.round(finalScore)
  };

  logEvent('MEAL_HUMAN_SCORE', {
    style: meal.styleName,
    base: meal.base.name_he,
    scoreBreakdown,
    items: meal.items.length
  });

  return finalScore;
}

/**
 * Determine food role by macro analysis
 */
function determineFoodRole(food) {
  if (!food.per100_kcal) return 'ירק/חופשי';
  
  const kcal = food.per100_kcal;
  const protein = food.per100_protein || 0;
  const carbs = food.per100_carbs || 0;
  const fat = food.per100_fat || 0;
  
  const proteinRatio = (protein * 4 / kcal) * 100;
  const carbsRatio = (carbs * 4 / kcal) * 100;
  const fatRatio = (fat * 9 / kcal) * 100;
  
  if (proteinRatio > 35) return 'חלבון';
  if (carbsRatio > 50) return 'פחמימה';
  if (fatRatio > 50) return 'שומן';
  if (kcal < 50) return 'ירק/חופשי';
  
  return 'אחר';
}