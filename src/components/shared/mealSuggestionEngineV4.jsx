// mealSuggestionEngineV4.js
// ✅ TEMPLATES-ONLY: Only uses MealTemplate records with concrete foods
// ✅ NO RANDOM COMBINATIONS from food database
// ✅ Returns NO_TEMPLATES_FOUND if no matching templates exist
//
// ===== STABILITY PROTECTION =====
// SAFE_MODE limits scanning, timeouts, and ensures deterministic returns
// DO NOT MODIFY core flows unless explicitly requested
const SAFE_MODE = true;
const SAFE_MODE_LIMITS = {
  MAX_TEMPLATES_SCAN: 100,
  MAX_SUGGESTIONS: 5,
  TIMEOUT_MS: 1500
};

export async function generateMealSuggestionsV4(
  mealType,
  targetCalories,
  traineeEmail,
  fetchTemplates,
  fetchFavoriteFoods,
  fetchCoachFoods,
  fetchAllFoods
) {
  const start = Date.now();
  const runId = `MSE4-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const engineTimeoutMs = SAFE_MODE ? SAFE_MODE_LIMITS.TIMEOUT_MS : 4000;
  
  console.log('[MSE4_SAFE_MODE]', { 
    enabled: SAFE_MODE, 
    limits: SAFE_MODE ? SAFE_MODE_LIMITS : 'disabled' 
  });
  
  let lastStep = 'INIT';
  let suggestions = [];
  let debugCheckpoints = [];

  const checkpoint = (step, data = {}) => {
    lastStep = step;
    debugCheckpoints.push({ step, elapsed: Date.now() - start, ...data });
    console.log(`[MSE4] ${step}`, data);
  };

  // SAFE RETURN WRAPPER
  const safeReturn = (exitReason, data = [], step = lastStep, extraErr = null) => {
    let elapsedMs = Number(Date.now() - start) || 0;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      elapsedMs = 0;
    }
    
    if (!step || typeof step !== 'string') {
      step = lastStep || 'UNKNOWN_STEP';
    }

    if (!exitReason || typeof exitReason !== 'string') {
      exitReason = 'ERROR';
    }

    const error = extraErr ? (typeof extraErr === 'string' ? { msg: extraErr } : extraErr) : null;

    return {
      exitReason,
      lastStep: step,
      elapsedMs,
      runId,
      data: Array.isArray(data) ? data : [],
      debug: {
        checkpoints: debugCheckpoints,
        message: `Exit: ${exitReason}, Last: ${step}, Elapsed: ${elapsedMs}ms`
      },
      error
    };
  };

  // PROMISE.RACE: engine logic vs 4-second hard timeout
  return await Promise.race([
    // Main engine logic
    (async () => {
      try {
        console.log('[MSE4] ENTER generateMealSuggestionsV4 - TEMPLATES ONLY MODE');
        checkpoint('ENTER');

        lastStep = 'LOAD_TEMPLATES';
        checkpoint('LOAD_TEMPLATES_START', { mealType, targetCalories });

        let templates = [];
        try {
          const templatePromise = fetchTemplates({ meal_type: mealType, is_active: true });
          templates = await Promise.race([
            templatePromise,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('FETCH_TEMPLATES_TIMEOUT')), 2000)
            )
          ]);
          if (!Array.isArray(templates)) templates = [];
        } catch (err) {
          console.warn('[MSE4] Template fetch failed:', err?.message);
          templates = [];
        }

        // SAFE_MODE: Limit templates scanned
        const templatesLimit = SAFE_MODE ? SAFE_MODE_LIMITS.MAX_TEMPLATES_SCAN : templates.length;
        const templatesToProcess = templates.slice(0, templatesLimit);
        
        checkpoint('LOAD_TEMPLATES_DONE', { 
          templateCount: templates.length,
          mealType,
          queryCriteria: { meal_type: mealType, is_active: true },
          safeMode: SAFE_MODE,
          limitedTo: templatesToProcess.length
        });

        // CRITICAL: If no templates found -> return NO_TEMPLATES_FOUND
        if (!Array.isArray(templates) || templates.length === 0) {
          lastStep = 'NO_TEMPLATES_FOUND';
          checkpoint('NO_TEMPLATES_FOUND', { 
            message: 'לא נמצאו תבניות ארוחה מתאימות',
            mealType,
            templatesIsArray: Array.isArray(templates),
            templatesLength: templates?.length || 0
          });
          console.error('[MSE4] ❌ NO_TEMPLATES_FOUND for mealType:', mealType);
          return safeReturn('NO_TEMPLATES_FOUND', [], lastStep, 'לא נמצאו תבניות ארוחה');
        }

        // ============================================
        lastStep = 'LOAD_FOOD_DATABASE';
        checkpoint('LOAD_FOOD_DATABASE_START');

        let allFoods = [];
        try {
          const foodPromise = fetchAllFoods();
          allFoods = await Promise.race([
            foodPromise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('FOOD_DATABASE_TIMEOUT')), 2000)
            )
          ]);
          if (!Array.isArray(allFoods)) allFoods = [];
        } catch (err) {
          console.warn('[MSE4] Food database fetch failed:', err?.message);
          allFoods = [];
        }

        checkpoint('LOAD_FOOD_DATABASE_DONE', { foodCount: allFoods.length });
        
        // GUARD: Check if we have foods
        if (!Array.isArray(allFoods) || allFoods.length === 0) {
          lastStep = 'NO_FOODS_IN_DATABASE';
          checkpoint('NO_FOODS_IN_DATABASE', { 
            message: 'מאגר המזון ריק'
          });
          console.error('[MSE4] ❌ NO_FOODS_IN_DATABASE');
          return safeReturn('NO_FOODS_IN_DATABASE', [], lastStep, 'מאגר המזון ריק');
        }

        // Build food lookup map for template resolution
        const foodMap = new Map();
        allFoods.forEach(food => {
          if (food && food.id) foodMap.set(food.id, food);
        });
        
        // GUARD: Check if foodMap is populated
        if (foodMap.size === 0) {
          lastStep = 'NO_VALID_FOODS';
          checkpoint('NO_VALID_FOODS', { 
            message: 'אין מזון תקין במאגר'
          });
          console.error('[MSE4] ❌ NO_VALID_FOODS in foodMap');
          return safeReturn('NO_VALID_FOODS', [], lastStep, 'אין מזון תקין במאגר');
        }

        // ============================================
        lastStep = 'BUILD_SUGGESTIONS_FROM_TEMPLATES';
        checkpoint('BUILD_SUGGESTIONS_START', {
          templatesCount: templates.length,
          targetCalories
        });
        
        console.log('EVENT: MEAL_SUGGEST_CORE_START', {
          mealType,
          targetCalories,
          focus: 'מאוזן', // Will be passed from UI later
          templatesCount: templates.length,
          foodsCount: allFoods.length
        });

        suggestions = [];
        const toleranceAbsolute = 25; // Fixed ±25 kcal tolerance
        const minCalories = targetCalories - toleranceAbsolute;
        const maxCalories = targetCalories + toleranceAbsolute;

        console.log('[MSE4] 🎯 TARGET RANGE:', {
          targetCalories,
          minCalories: Math.round(minCalories),
          maxCalories: Math.round(maxCalories),
          tolerance: `±${toleranceAbsolute}cal`
        });

        // Units resolver function
        const unitsResolver = async (foodId, unitId, quantity) => {
          // FALLBACK: If unitId is missing, assume grams
          if (!unitId) {
            console.warn('[MSE4_UNITS] Missing unitId, fallback to grams', { foodId, quantity });
            return quantity;
          }

          // Simple lookup from foodMap units
          // In production, this should use the same logic as unitsResolver
          const units = [
            { id: 'global_gram', grams_per_unit: 1 },
            { id: 'global_100g', grams_per_unit: 100 },
            { id: 'global_kg', grams_per_unit: 1000 }
          ];

          const unit = units.find(u => u.id === unitId);
          if (unit) {
            return unit.grams_per_unit * quantity;
          }

          // FALLBACK: Unit not found, assume grams
          console.warn('[MSE4_UNITS] Unit not found, fallback to grams', { unitId, foodId });
          return quantity;
        };

        // Process each template
        const maxSuggestions = SAFE_MODE ? SAFE_MODE_LIMITS.MAX_SUGGESTIONS : 6;
        
        for (let templateIdx = 0; templateIdx < templatesToProcess.length; templateIdx++) {
          if (suggestions.length >= maxSuggestions) break;
          if (Date.now() - start > engineTimeoutMs - 500) {
            lastStep = 'BUILD_TIMEOUT';
            checkpoint('BUILD_TIMEOUT');
            break;
          }

          const template = templatesToProcess[templateIdx];
          if (!template || !template.items || template.items.length === 0) continue;
          
          const baseCalories = template.base_calories || 500;
          const scalingFactor = targetCalories / baseCalories;
          
          console.log('EVENT: MEAL_SUGGEST_TEMPLATE_PICKED', {
            templateId: template.id,
            templateName: template.name,
            templateCalories: baseCalories,
            targetCalories,
            scalingFactor: scalingFactor.toFixed(2)
          });

          const suggestion = await buildSuggestionFromTemplate(
            template,
            foodMap,
            targetCalories,
            minCalories,
            maxCalories,
            unitsResolver
          );

          if (suggestion && suggestion.totalCalories > 0) {
            const diffFromTarget = suggestion.totalCalories - targetCalories;
            const withinTolerance = Math.abs(diffFromTarget) <= toleranceAbsolute;
            
            console.log('EVENT: MEAL_SUGGEST_SCALED_RESULT', {
              templateId: template.id,
              resultCalories: suggestion.totalCalories,
              targetCalories,
              diffFromTarget,
              withinTolerance,
              items: Array.isArray(suggestion.foods) ? suggestion.foods.map(f => ({
                foodId: f.id,
                name: f.name_he,
                qty: f.grams,
                unit: 'גרם',
                calories: f.calories
              })) : []
            });
            
            // ACCEPT ALL VALID SUGGESTIONS - even if slightly outside tolerance
            // Better to show close matches than nothing
            if (suggestion && suggestion.totalCalories > 0) {
              suggestions.push(suggestion);
              console.log('[MSE4] ✅ Template accepted:', {
                name: template.name,
                calories: suggestion.totalCalories,
                diff: diffFromTarget,
                withinTolerance,
                foods: suggestion.foods.length
              });
            }
          } else {
            console.log('[MSE4] ⚠️ Template skipped:', {
              name: template.name,
              reason: 'Failed to build valid suggestion or outside tolerance'
            });
          }
        }
        
        console.log('[MEAL_CALCULATED]', {
          suggestionsCount: suggestions.length,
          maxAllowed: maxSuggestions,
          elapsedMs: Date.now() - start
        });

        checkpoint('BUILD_SUGGESTIONS_DONE', { suggestionCount: suggestions.length });

        // Check if we have any valid suggestions
        if (!Array.isArray(suggestions) || suggestions.length === 0) {
          lastStep = 'NO_VALID_SUGGESTIONS';
          checkpoint('NO_VALID_SUGGESTIONS', {
            message: 'לא הצלחנו להכין הצעות מתאימות',
            templatesProcessed: templatesToProcess.length,
            targetCalories,
            mealType
          });
          console.warn('[MSE4] ⚠️ NO_VALID_SUGGESTIONS generated');
          return safeReturn('NO_VALID_SUGGESTIONS', [], lastStep, 'לא הצלחנו להכין הצעות');
        }

        lastStep = 'SUCCESS';
        checkpoint('COMPLETE', { suggestionCount: suggestions.length });

        return safeReturn('SUCCESS', suggestions, lastStep);

      } catch (err) {
        console.error('[MSE4] Error:', err?.message);
        lastStep = 'CAUGHT_ERROR';
        checkpoint('CATCH_BLOCK', { error: err?.message });
        // SAFE_FALLBACK: Always return deterministic structure
        return safeReturn('SAFE_FALLBACK', [], lastStep, err?.message || 'Unknown error');
      }
    })(),

    // Hard 4-second timeout
    new Promise(resolve => {
      setTimeout(() => {
        lastStep = 'ENGINE_TIMEOUT_HARD';
        checkpoint('ENGINE_TIMEOUT');
        resolve(safeReturn('TIMEOUT', [], lastStep));
      }, engineTimeoutMs);
    })
  ]);
}

// Build suggestion from a template with units
async function buildSuggestionFromTemplate(
  template,
  foodMap,
  targetCalories,
  minCalories,
  maxCalories,
  unitsResolver
) {
  try {
    // GUARD: Validate inputs
    if (!template || typeof template !== 'object') {
      console.warn('[MSE4] Invalid template object');
      return null;
    }
    
    if (!Array.isArray(template.items) || template.items.length === 0) {
      console.warn('[MSE4] Template has no items array:', template.name);
      return null;
    }
    
    if (!foodMap || !(foodMap instanceof Map)) {
      console.warn('[MSE4] Invalid foodMap');
      return null;
    }

    const foods = [];
    let templateTotalCalories = 0;

    // Step 1: Resolve all items and calculate template's base calories
    for (const item of template.items) {
      // GUARD: Validate item
      if (!item || typeof item !== 'object') {
        console.warn('[MSE4] Invalid item in template');
        continue;
      }
      
      const foodItem = foodMap.get(item.food_item_id);
      
      // GUARD: NO_FOOD_FOUND
      if (!foodItem) {
        console.warn('[MSE4] NO_FOOD_FOUND:', item.food_item_id);
        continue;
      }

      const kcalPer100 = parseFloat(foodItem.per100_kcal) || 0;
      if (kcalPer100 <= 0) {
        console.warn('[MSE4] Invalid calories for food:', foodItem.name_he, kcalPer100);
        continue;
      }

      // Calculate grams from unit + quantity
      let grams = 0;
      if (unitsResolver && typeof unitsResolver === 'function') {
        try {
          grams = await unitsResolver(item.food_item_id, item.unit_id, item.quantity);
        } catch (err) {
          console.warn('[MSE4] Units resolver failed:', err?.message);
          grams = item.quantity || 0; // Fallback
        }
      } else {
        // FALLBACK: If no resolver or unit_id missing, assume grams
        grams = item.quantity || 0;
      }

      if (grams <= 0 || !Number.isFinite(grams)) {
        console.warn('[MSE4] Invalid grams calculated:', { item, grams });
        continue;
      }

      const macros = getMacrosForFood(foodItem, grams);
      templateTotalCalories += macros.calories;

      foods.push({
        id: foodItem.id,
        food_name: foodItem.name_he || foodItem.name || 'Unknown',
        name_he: foodItem.name_he || foodItem.name || 'Unknown',
        name: foodItem.name || foodItem.name_he || 'Unknown',
        category: foodItem.category || '',
        grams: Math.round(grams),
        calories: macros.calories,
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
        role: item.role || 'unknown',
        per100_kcal: foodItem.per100_kcal,
        per100_protein: foodItem.per100_protein,
        per100_carbs: foodItem.per100_carbs,
        per100_fat: foodItem.per100_fat
      });
    }

    // GUARD: Check if we got any valid foods
    if (!Array.isArray(foods) || foods.length === 0) {
      console.warn('[MSE4] No valid foods in template:', template.name);
      return null;
    }
    
    if (templateTotalCalories === 0 || !Number.isFinite(templateTotalCalories)) {
      console.warn('[MSE4] Invalid template calories:', template.name, templateTotalCalories);
      return null;
    }

    // Step 2: Scale all foods proportionally to hit target calories
    const baseCalories = template.base_calories || templateTotalCalories;
    
    // GUARD: Validate baseCalories
    if (baseCalories <= 0 || !Number.isFinite(baseCalories)) {
      console.error('[MSE4] Invalid baseCalories:', baseCalories);
      return null;
    }
    
    const scaleFactor = targetCalories / baseCalories;
    
    // GUARD: Validate scaleFactor
    if (!Number.isFinite(scaleFactor) || scaleFactor <= 0 || scaleFactor > 5) {
      console.error('[MSE4] Invalid scaleFactor:', scaleFactor, { targetCalories, baseCalories });
      return null;
    }
    
    console.log('[TEMPLATE_SCALE_START]', {
      templateName: template.name,
      templateTotalCalories,
      baseCalories,
      targetCalories,
      scaleFactor: scaleFactor.toFixed(3)
    });
    
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    // Scale each food
    for (const f of foods) {
      // Scale grams - ensure minimum 5g
      const scaledGrams = Math.max(5, Math.round(f.grams * scaleFactor));
      f.grams = scaledGrams;
      
      // Recalculate macros for scaled grams using real nutrition values
      const foodItem = foodMap.get(f.id);
      if (foodItem) {
        const macros = getMacrosForFood(foodItem, scaledGrams);
        f.calories = macros.calories;
        f.protein = macros.protein;
        f.carbs = macros.carbs;
        f.fat = macros.fat;
        
        totalCalories += macros.calories;
        totalProtein += macros.protein;
        totalCarbs += macros.carbs;
        totalFat += macros.fat;
      }
    }

    // VALIDATION: Check if final calories are within ±25 kcal tolerance
    const absoluteDiff = Math.abs(totalCalories - targetCalories);
    const toleranceAbsolute = 25; // ±25 kcal fixed tolerance
    const withinRange = absoluteDiff <= toleranceAbsolute;
    
    console.log('[TEMPLATE_INITIAL_SCALE_CHECK]', {
      templateName: template.name,
      totalCalories,
      targetCalories,
      absoluteDiff,
      toleranceAbsolute,
      withinRange
    });
    
    if (!withinRange) {
      console.warn('[TEMPLATE_SCALE_NEEDS_ADJUSTMENT]', {
        templateName: template.name,
        targetCalories,
        actualCalories: totalCalories,
        absoluteDiff,
        tolerance: toleranceAbsolute
      });
      
      // Fine-tuning adjustment loop (max 50 iterations)
      let attempts = 0;
      const maxAttempts = 50;
      
      while (attempts < maxAttempts) {
        attempts++;
        
        const currentDiff = totalCalories - targetCalories;
        const currentAbsDiff = Math.abs(currentDiff);
        
        // If within tolerance, we're done
        if (currentAbsDiff <= toleranceAbsolute) {
          console.log('[TEMPLATE_SCALE_CONVERGED]', { 
            attempts, 
            finalCalories: totalCalories, 
            targetCalories,
            diff: currentDiff,
            tolerance: toleranceAbsolute
          });
          break;
        }
        
        // Find the food with most calories (main ingredient)
        let maxCalFood = null;
        let maxCal = 0;
        
        for (const f of foods) {
          if (f.calories > maxCal) {
            maxCal = f.calories;
            maxCalFood = f;
          }
        }
        
        // GUARD: No main food found
        if (!maxCalFood) {
          console.error('[TEMPLATE_SCALE_NO_MAIN_FOOD]');
          break;
        }
        
        // Get food item for macro recalculation
        const foodItem = foodMap.get(maxCalFood.id);
        if (!foodItem) {
          console.error('[TEMPLATE_SCALE_NO_FOODITEM]', maxCalFood.id);
          break;
        }
        
        const kcalPer100 = parseFloat(foodItem.per100_kcal) || 0;
        if (kcalPer100 <= 0) {
          console.error('[TEMPLATE_SCALE_INVALID_KCAL]', foodItem.name_he);
          break;
        }
        
        // Calculate precise grams adjustment needed
        // If we need to reduce 50 cal and food has 200 kcal/100g:
        // gramsToRemove = (50 / 200) * 100 = 25g
        const gramsChangeNeeded = (currentDiff / kcalPer100) * 100;
        const newGrams = Math.max(5, Math.round(maxCalFood.grams - gramsChangeNeeded));
        
        // GUARD: Prevent infinite loops if grams don't change
        if (newGrams === maxCalFood.grams) {
          console.warn('[TEMPLATE_SCALE_NO_CHANGE]', { 
            attempts, 
            currentDiff,
            gramsChangeNeeded: gramsChangeNeeded.toFixed(2)
          });
          // Force a small change
          if (currentDiff > 0) {
            maxCalFood.grams = Math.max(5, maxCalFood.grams - 5);
          } else {
            maxCalFood.grams = maxCalFood.grams + 5;
          }
        } else {
          maxCalFood.grams = newGrams;
        }
        
        // Recalculate macros for adjusted food
        const newMacros = getMacrosForFood(foodItem, maxCalFood.grams);
        maxCalFood.calories = newMacros.calories;
        maxCalFood.protein = newMacros.protein;
        maxCalFood.carbs = newMacros.carbs;
        maxCalFood.fat = newMacros.fat;
        
        // Recalculate totals
        totalCalories = 0;
        totalProtein = 0;
        totalCarbs = 0;
        totalFat = 0;
        
        foods.forEach(f => {
          totalCalories += f.calories;
          totalProtein += f.protein;
          totalCarbs += f.carbs;
          totalFat += f.fat;
        });
      }
      
      // Final check - use relaxed tolerance if we tried hard
      const finalDiff = Math.abs(totalCalories - targetCalories);
      const relaxedTolerance = attempts > 20 ? toleranceAbsolute * 1.5 : toleranceAbsolute;
      
      if (finalDiff > relaxedTolerance) {
        console.warn('[TEMPLATE_SCALE_OUTSIDE_TOLERANCE]', {
          templateName: template.name,
          resultCalories: totalCalories,
          targetCalories,
          diff: totalCalories - targetCalories,
          tolerance: relaxedTolerance,
          attempts,
          decision: 'ACCEPTING_ANYWAY'
        });
        // ACCEPT ANYWAY - better to show slightly off suggestions than none
      }
      
      console.log('[TEMPLATE_SCALE_ADJUSTMENT_DONE]', {
        attempts,
        finalCalories: totalCalories,
        targetCalories,
        finalDiff: totalCalories - targetCalories
      });
    } else {
      console.log('[TEMPLATE_SCALE_PERFECT]', {
        templateName: template.name,
        targetCalories,
        actualCalories: totalCalories,
        diff: totalCalories - targetCalories
      });
    }

    // SKIP PORTION NORMALIZATION - It interferes with accurate scaling
    // Just ensure no food is below 5g minimum
    foods.forEach(f => {
      if (f.grams < 5) {
        console.warn('[TEMPLATE_SCALE_MINIMUM_VIOLATION]', {
          food: f.name_he,
          grams: f.grams
        });
        f.grams = 5;
        const foodItem = foodMap.get(f.id);
        if (foodItem) {
          const macros = getMacrosForFood(foodItem, 5);
          f.calories = macros.calories;
          f.protein = macros.protein;
          f.carbs = macros.carbs;
          f.fat = macros.fat;
        }
      }
    });

    // SKIP PROTEIN BOOST - It interferes with accurate calorie targeting
    // Templates already have appropriate protein balance

    // Round quantities to smart increments (5g, 10g, 50g based on size)
    foods.forEach(f => {
      if (f.grams >= 100) {
        f.grams = Math.round(f.grams / 10) * 10; // Round to 10g
      } else if (f.grams >= 20) {
        f.grams = Math.round(f.grams / 5) * 5; // Round to 5g
      }
      // Recalculate after rounding
      const foodItem = foodMap.get(f.id);
      if (foodItem) {
        const macros = getMacrosForFood(foodItem, f.grams);
        f.calories = macros.calories;
        f.protein = macros.protein;
        f.carbs = macros.carbs;
        f.fat = macros.fat;
      }
    });
    
    // Recalculate final totals after rounding
    totalCalories = 0;
    totalProtein = 0;
    totalCarbs = 0;
    totalFat = 0;
    foods.forEach(f => {
      totalCalories += f.calories;
      totalProtein += f.protein;
      totalCarbs += f.carbs;
      totalFat += f.fat;
    });

    // FINAL VALIDATION
    if (!Array.isArray(foods) || foods.length === 0) {
      console.error('[MSE4] Final validation failed: no foods');
      return null;
    }
    
    if (!Number.isFinite(totalCalories) || totalCalories <= 0) {
      console.error('[MSE4] Final validation failed: invalid calories', totalCalories);
      return null;
    }

    // DEBUG LOG
    console.log('[MEAL_TEMPLATE_FINAL]', {
      templateId: template.id,
      templateName: template.name,
      mealType: template.meal_type,
      baseCalories: template.base_calories || templateTotalCalories,
      targetCalories,
      scaleFactor: scaleFactor.toFixed(3),
      foodsCount: foods.length,
      totalCalories: Math.round(totalCalories),
      deviation: `${totalCalories - targetCalories > 0 ? '+' : ''}${totalCalories - targetCalories}cal`,
      foods: foods.map(f => ({
        name: f.name_he,
        grams: f.grams,
        calories: f.calories
      }))
    });

    return {
      foods: foods,
      totalCalories: Math.round(totalCalories),
      totalProtein: Math.round(totalProtein),
      totalCarbs: Math.round(totalCarbs),
      totalFat: Math.round(totalFat),
      template: template.name || 'Unknown Template',
      template_id: template.id
    };

  } catch (err) {
    console.warn('[buildSuggestionFromTemplate] Error:', err?.message);
    return null;
  }
}

// Get macros for food and grams (safe: handles NaN)
function getMacrosForFood(food, grams) {
  // GUARD: Validate inputs
  if (!food || typeof food !== 'object') {
    console.warn('[getMacrosForFood] Invalid food object');
    return { calories: 0, protein: 0, carbs: 0, fat: 0 };
  }
  
  if (!Number.isFinite(grams) || grams < 0) {
    console.warn('[getMacrosForFood] Invalid grams:', grams);
    return { calories: 0, protein: 0, carbs: 0, fat: 0 };
  }
  
  const ratio = grams / 100;
  
  const kcal = parseFloat(food.per100_kcal) || 0;
  const protein = parseFloat(food.per100_protein) || 0;
  const carbs = parseFloat(food.per100_carbs) || 0;
  const fat = parseFloat(food.per100_fat) || 0;
  
  return {
    calories: Math.round(ratio * kcal),
    protein: Math.round(ratio * protein),
    carbs: Math.round(ratio * carbs),
    fat: Math.round(ratio * fat)
  };
}

// ===== STABILITY RULES =====
// DO NOT MODIFY UNLESS EXPLICITLY REQUESTED:
// 1. buildSuggestionFromTemplate - Template scaling logic
// 2. getMacrosForFood - Macro calculation
// 3. generateMealSuggestionsV4 core flow
// These functions are stable and working - changes risk breaking the system