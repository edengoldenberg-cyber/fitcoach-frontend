import { base44 } from '@/api/base44Client';

// Fields that exist in the production UserFoodItem Prisma schema.
// All other fields (normalized_name, usage_count, per100_*, etc.) do not exist.
const _UFI_FIELDS = new Set([
  'trainee_id', 'coach_email', 'name', 'calories', 'protein', 'carbs',
  'fat', 'amount', 'unit', 'visibility', 'active', 'source', 'barcode',
]);
function _pickUFI(data) {
  return Object.fromEntries(Object.entries(data || {}).filter(([k]) => _UFI_FIELDS.has(k)));
}

export const normalizeFoodName = (value = '') => (value == null ? '' : value)
  .toString()
  .trim()
  .toLowerCase()
  .replace(/[\u0591-\u05C7]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const nowIso = () => new Date().toISOString();

// Per-key mutex — serializes concurrent upserts for the same food + trainee.
// Key: "<trainee_id>:<normalized_food_name>"
// Any two async callers with the same key queue behind each other so the
// filter→decide→write block never overlaps, preventing duplicate record creation.
const _foodLocks = new Map();
function _withFoodLock(traineeId, normalizedName, fn) {
  if (!traineeId || !normalizedName) return fn();
  const key = `${traineeId}:${normalizedName}`;
  const prev = _foodLocks.get(key) || Promise.resolve();
  let release;
  const ticket = new Promise(r => { release = r; });
  _foodLocks.set(key, ticket);
  return prev.then(() => fn()).finally(() => {
    release();
    if (_foodLocks.get(key) === ticket) _foodLocks.delete(key);
  });
}

// Per-trainee mutex for TraineeNutritionProfile read-modify-write.
// Prevents same-browser concurrent flushes from reading stale profile state and
// producing a last-write-wins corruption of total_meals_logged / averages.
// NOTE: cross-device race requires server-side atomic increment — not fixable client-side.
const _profileLocks = new Map();
function _withProfileLock(traineeEmail, fn) {
  if (!traineeEmail) return fn();
  const prev = _profileLocks.get(traineeEmail) || Promise.resolve();
  let release;
  const ticket = new Promise(r => { release = r; });
  _profileLocks.set(traineeEmail, ticket);
  return prev.then(() => fn()).finally(() => {
    release();
    if (_profileLocks.get(traineeEmail) === ticket) _profileLocks.delete(traineeEmail);
  });
}

const isUnitMealWithoutGramWeight = (meal = {}) => {
  const unit = String(meal.unit || meal.unit_name || meal.corrected_unit || '').toLowerCase();
  const grams = Number(meal.grams_equivalent || meal.grams_final || meal.corrected_grams || 0);
  return (!grams || grams <= 1) && ['unit', 'יחידה', 'מנה', 'portion', 'serving'].includes(unit);
};

const hasSafePer100Values = (values = {}) => {
  const calories = Number(values.calories_per_100g || values.calories || 0);
  const protein = Number(values.protein_per_100g || values.protein || 0);
  const carbs = Number(values.carbs_per_100g || values.carbs || 0);
  const fat = Number(values.fat_per_100g || values.fat || 0);
  return calories >= 0 && calories <= 950 && protein >= 0 && protein <= 110 && carbs >= 0 && carbs <= 110 && fat >= 0 && fat <= 110;
};

const sanitizePer100 = (values = {}) => ({
  calories_per_100g: Number(values.calories_per_100g || 0),
  protein_per_100g: Number(values.protein_per_100g || 0),
  carbs_per_100g: Number(values.carbs_per_100g || 0),
  fat_per_100g: Number(values.fat_per_100g || 0),
});

export async function upsertPersonalFoodItem({ user, trainee, manualFood, per100 }) {
  const normalized = normalizeFoodName(manualFood.name);
  if (!normalized || !trainee?.id) return null;

  return _withFoodLock(trainee.id, normalized, async () => {
    const existing = await base44.entities.UserFoodItem.filter({
      trainee_id: trainee.id,
      normalized_name: normalized,
      visibility: 'personal'
    });

    const payload = _pickUFI({
      trainee_id: trainee.id,
      name: manualFood.name.trim(),
      calories: Number(per100.calories) || 0,
      protein: Number(per100.protein) || 0,
      carbs: Number(per100.carbs) || 0,
      fat: Number(per100.fat) || 0,
      amount: Number(manualFood.quantity) || 100,
      unit: manualFood.unit || 'gram',
      visibility: 'personal',
      active: true,
      source: 'manual',
    });

    if (existing?.[0]) {
      const item = existing[0];
      await base44.entities.UserFoodItem.update(item.id, payload);
      return { ...item, ...payload };
    }

    return base44.entities.UserFoodItem.create(payload);
  });
}

export async function bumpUserFoodUsage(food) {
  if (!food?.user_food_item_id) return;
  await base44.entities.UserFoodItem.update(food.user_food_item_id, {
    usage_count: (food.usage_count || 0) + 1,
    last_used_at: nowIso()
  });
}

const correctionPer100FromMeal = (meal) => {
  if (isUnitMealWithoutGramWeight(meal)) {
    return sanitizePer100({
      calories_per_100g: Number(meal.calories) || 0,
      protein_per_100g: Number(meal.protein) || 0,
      carbs_per_100g: Number(meal.carbs) || 0,
      fat_per_100g: Number(meal.fat) || 0,
    });
  }

  const grams = Number(meal.grams_equivalent || meal.grams_final || meal.corrected_grams || meal.quantity || 100) || 100;
  const factor = 100 / Math.max(grams, 1);
  return sanitizePer100({
    calories_per_100g: Math.round((Number(meal.calories) || 0) * factor),
    protein_per_100g: Math.round((Number(meal.protein) || 0) * factor * 10) / 10,
    carbs_per_100g: Math.round((Number(meal.carbs) || 0) * factor * 10) / 10,
    fat_per_100g: Math.round((Number(meal.fat) || 0) * factor * 10) / 10,
  });
};

export async function saveAIFoodCorrection({ user, trainee, originalItem = {}, correctedMeal, imageContext = '', notes = '', isManualCorrection = false }) {
  const _fn = correctedMeal?.food_name ?? '(no food_name)';
  console.log(`[SAVE-AFC] enter food="${_fn}" trainee_id=${trainee?.id ?? 'MISSING'}`);
  if (!trainee?.id || !trainee?.user_email || !correctedMeal?.food_name) {
    console.warn(`[SAVE-AFC] GUARD SKIPPED food="${_fn}"`, { trainee_id: trainee?.id, trainee_email: trainee?.user_email, food_name: correctedMeal?.food_name });
    return null;
  }

  const correctedName = correctedMeal.food_name.trim();
  const normalizedCorrected = normalizeFoodName(correctedName);
  console.log(`[SAVE-AFC] normalized="${normalizedCorrected}" calories_per_100g=${correctionPer100FromMeal(correctedMeal).calories_per_100g}`);
  const originalName = originalItem.name || originalItem.food_name || originalItem.name_he || correctedName;
  const now = nowIso();
  const per100 = correctionPer100FromMeal(correctedMeal);
  const quantity = Number(correctedMeal.quantity || correctedMeal.grams_equivalent || correctedMeal.grams_final || 100) || 100;
  const unit = correctedMeal.unit || correctedMeal.unit_name || 'gram';
  const correctedMacros = {
    calories: Number(correctedMeal.calories) || 0,
    protein: Number(correctedMeal.protein) || 0,
    carbs: Number(correctedMeal.carbs) || 0,
    fat: Number(correctedMeal.fat) || 0,
  };
  const originalEstimate = correctedMeal.original_ai_estimate || originalItem.original_ai_estimate || {
    name: originalName,
    calories: originalItem.calories,
    protein: originalItem.protein,
    carbs: originalItem.carbs,
    fat: originalItem.fat,
    grams: originalItem.quantity_grams || originalItem.estimated_grams,
  };
  const correctedGrams = Number(correctedMeal.corrected_grams || correctedMeal.grams_equivalent || correctedMeal.grams_final || correctedMeal.quantity || quantity) || quantity;

  return _withFoodLock(trainee.id, normalizedCorrected, async () => {
  console.log(`[SAVE-AFC] querying UserFoodItem for normalized="${normalizedCorrected}"`);
  const existingByName = await base44.entities.UserFoodItem.filter({
    trainee_id: trainee.id,
    normalized_name: normalizedCorrected,
    visibility: 'personal'
  });
  console.log(`[SAVE-AFC] UserFoodItem.filter result: ${existingByName?.length ?? 0} existing records`);

  // Only send fields that exist in the production UserFoodItem schema.
  const payload = _pickUFI({
    trainee_id: trainee.id,
    name: correctedName,
    calories: correctedMacros.calories,
    protein: correctedMacros.protein,
    carbs: correctedMacros.carbs,
    fat: correctedMacros.fat,
    amount: quantity,
    unit,
    visibility: 'personal',
    active: true,
    source: 'ai_correction',
  });

  let savedFood = null;
  // per100ForUsageTables is what gets written to UserRecentFoods + UserNutritionMemory.
  // When canonical lock fires it is set to the existing canonical values, NOT the AI estimate.
  let per100ForUsageTables = per100;

  if (!isManualCorrection && existingByName?.[0] && Number(existingByName[0].calories_per_100g) > 0) {
    // CANONICAL LOCK — existing nutrition is the source of truth.
    // Only bump usage_count; never overwrite canonical per100 with an AI estimate.
    const item = existingByName[0];
    console.log(
      `[CANONICAL-LOCK] prevented overwrite in saveAIFoodCorrection: "${correctedName}"`,
      `existing=${item.calories_per_100g} kcal/100g  incoming_ai=${per100.calories_per_100g} kcal/100g`
    );
    await base44.entities.UserFoodItem.update(item.id, _pickUFI({ name: correctedName }));
    savedFood = item;
    // Usage tables must reflect the canonical values, not the AI's estimate
    per100ForUsageTables = {
      calories_per_100g: item.calories_per_100g,
      protein_per_100g:  item.protein_per_100g,
      carbs_per_100g:    item.carbs_per_100g,
      fat_per_100g:      item.fat_per_100g,
    };
  } else if (existingByName?.[0]) {
    // isManualCorrection=true OR existing record has no canonical per100 yet — full update allowed
    console.log(`[SAVE-AFC] UserFoodItem.UPDATE id=${existingByName[0].id} food="${correctedName}"`);
    const item = existingByName[0];
    await base44.entities.UserFoodItem.update(item.id, _pickUFI(payload));
    savedFood = { ...item, ...payload };
  } else {
    console.log(`[SAVE-AFC] UserFoodItem.CREATE food="${correctedName}"`);
    savedFood = await base44.entities.UserFoodItem.create(_pickUFI(payload));
    console.log(`[SAVE-AFC] UserFoodItem.CREATE result id=${savedFood?.id ?? 'FAILED (null)'}`);
  }

  console.log(`[SAVE-AFC] writing UserRecentFoods + UserNutritionMemory for "${correctedName}"`);
  // Filter by normalized_name (new deduplication key); fall back to food_name for pre-fix records.
  // Including normalized_name in every update/create migrates legacy records automatically.
  let recentExisting = await base44.entities.UserRecentFoods.filter({ trainee_id: trainee.id, normalized_name: normalizedCorrected });
  if (!recentExisting?.[0]) {
    recentExisting = await base44.entities.UserRecentFoods.filter({ trainee_id: trainee.id, food_name: correctedName });
  }
  const recentPayload = {
    trainee_id: trainee.id,
    trainee_email: trainee.user_email,
    user_food_item_id: savedFood?.id,
    food_name: correctedName,
    normalized_name: normalizedCorrected,
    ...per100ForUsageTables,  // canonical values when lock fired; AI values for new foods
    last_used_at: now,
    usage_count: 1,
    default_quantity: quantity,
    default_unit: unit,
    meal_type: correctedMeal.meal_type || 'snack',
    time_of_day_bucket: bucketNow(),
    source: 'ai_correction',
    original_ai_name: originalName,
    original_ai_text: correctedMeal.original_ai_text || notes || '',
    source_text_segment: correctedMeal.source_text_segment || originalItem.source_text_segment || '',
    original_ai_estimate: originalEstimate,
    corrected_name: correctedName,
    corrected_quantity: quantity,
    corrected_unit: unit,
    corrected_grams: correctedGrams,
    corrected_calories: correctedMacros.calories,
    corrected_protein: correctedMacros.protein,
    corrected_carbs: correctedMacros.carbs,
    corrected_fat: correctedMacros.fat,
    correction_count: 1,
    last_corrected_at: now,
    corrected_macros: correctedMacros,
    image_context: imageContext || '',
    notes: notes || correctedMeal.notes || ''
  };
  if (recentExisting?.[0]) {
    await base44.entities.UserRecentFoods.update(recentExisting[0].id, {
      ...recentPayload,
      usage_count: (recentExisting[0].usage_count || 0) + 1
    });
  } else {
    await base44.entities.UserRecentFoods.create(recentPayload);
  }

  console.log(`[SAVE-AFC] writing UserRecentFoods + UserNutritionMemory for "${correctedName}"`);
  let memoryExisting = await base44.entities.UserNutritionMemory.filter({ trainee_id: trainee.id, normalized_name: normalizedCorrected });
  if (!memoryExisting?.[0]) {
    memoryExisting = await base44.entities.UserNutritionMemory.filter({ trainee_id: trainee.id, food_name: correctedName });
  }
  if (memoryExisting?.[0]) {
    await base44.entities.UserNutritionMemory.update(memoryExisting[0].id, {
      ...recentPayload,
      usage_count: (memoryExisting[0].usage_count || 0) + 1,
      correction_count: (memoryExisting[0].correction_count || 0) + 1,
      last_corrected_at: now
    });
  } else {
    await base44.entities.UserNutritionMemory.create(recentPayload);
  }

  console.log(`[SAVE-AFC] COMPLETE food="${correctedName}" savedFood.id=${savedFood?.id ?? 'null'}`);
  return savedFood;
  }); // end _withFoodLock
}

// Source-of-truth enforcement exported for all nutrition entry dialogs.
// Priority 1: exact normalized-name match. Priority 2: bidirectional substring.
// Works with items that use either `quantity_grams` (AIAnalyzeMealDialog) or `grams` (AddMealFromPhoto).
export function applyCanonicalLock(ingredients = [], personalFoods = []) {
  if (!personalFoods?.length) return ingredients;
  return ingredients.map(ing => {
    const ingName = normalizeFoodName(ing.name || ing.food_name || '');
    if (!ingName) return ing;

    let match = personalFoods.find(f => {
      const s = normalizeFoodName(f.normalized_name || f.food_name || '');
      return s && s === ingName && Number(f.calories_per_100g) > 0;
    });
    let matchType = 'exact';

    if (!match) {
      match = personalFoods
        .filter(f => Number(f.calories_per_100g) > 0)
        .sort((a, b) => {
          const aN = normalizeFoodName(a.normalized_name || a.food_name || '');
          const bN = normalizeFoodName(b.normalized_name || b.food_name || '');
          return bN.length - aN.length;
        })
        .find(f => {
          const s = normalizeFoodName(f.normalized_name || f.food_name || '');
          return s && (ingName.includes(s) || s.includes(ingName));
        });
      matchType = 'partial';
    }

    if (!match) {
      console.log(`[CANONICAL-LOCK] skipped no match for "${ingName}"`);
      return ing;
    }

    // Support both quantity_grams (AIAnalyzeMealDialog) and grams (AddMealFromPhoto)
    const grams = Number(ing.quantity_grams || ing.grams || 100) || 100;
    const factor = grams / 100;
    console.log(`[CANONICAL-LOCK] applied (${matchType}) "${ingName}" → stored ${match.calories_per_100g} kcal/100g`);
    return {
      ...ing,
      per100_kcal:    match.calories_per_100g,
      per100_protein: match.protein_per_100g,
      per100_carbs:   match.carbs_per_100g,
      per100_fat:     match.fat_per_100g,
      calories: Math.round(match.calories_per_100g * factor),
      protein:  Math.round(match.protein_per_100g  * factor * 10) / 10,
      carbs:    Math.round(match.carbs_per_100g    * factor * 10) / 10,
      fat:      Math.round(match.fat_per_100g      * factor * 10) / 10,
      nutrition_source: 'personal_canonical',
      user_food_item_id: match.id || ing.user_food_item_id,
    };
  });
}

export function applyPersonalCorrectionMatch(items = [], personalFoods = []) {
  return items.map((item) => {
    const itemName = normalizeFoodName(item.name || item.name_he || item.food_name);
    const match = personalFoods
      .filter(food => food.source === 'ai_correction' || food.original_ai_name || food.corrected_name)
      .find(food => {
        const original = normalizeFoodName(food.original_ai_name || '');
        const corrected = normalizeFoodName(food.corrected_name || food.food_name || '');
        return (original && (itemName.includes(original) || original.includes(itemName))) ||
          (corrected && (itemName.includes(corrected) || corrected.includes(itemName)));
      });

    if (!match || !hasSafePer100Values(match)) return item;
    const grams = Number(item.grams || item.quantity_grams || match.serving_size || 100) || 100;
    const factor = grams / 100;
    return {
      ...item,
      name: match.corrected_name || match.food_name,
      name_he: match.corrected_name || match.food_name,
      grams,
      calories: Math.round((match.calories_per_100g || 0) * factor),
      protein: Math.round((match.protein_per_100g || 0) * factor * 10) / 10,
      carbs: Math.round((match.carbs_per_100g || 0) * factor * 10) / 10,
      fat: Math.round((match.fat_per_100g || 0) * factor * 10) / 10,
      per100_kcal: match.calories_per_100g || 0,
      per100_protein: match.protein_per_100g || 0,
      per100_carbs: match.carbs_per_100g || 0,
      per100_fat: match.fat_per_100g || 0,
      nutrition_source: 'personal_ai_correction',
      user_food_item_id: match.id
    };
  });
}

export async function updateNutritionMemoryFromMeal({ trainee, meal, previousMeal = null }) {
  if (!trainee?.user_email || !meal?.food_name) return;

  const existing = await base44.entities.TraineeNutritionProfile.filter({ trainee_email: trainee.user_email });
  const profile = existing?.[0] || null;
  const favoriteFoods = [...(profile?.favorite_foods || [])];
  const foodKey = meal.food_name.trim();
  const favoriteIndex = favoriteFoods.findIndex((item) => normalizeFoodName(item.food_name) === normalizeFoodName(foodKey));

  if (favoriteIndex >= 0) {
    favoriteFoods[favoriteIndex] = {
      ...favoriteFoods[favoriteIndex],
      count: (favoriteFoods[favoriteIndex].count || 0) + 1,
      last_used_at: nowIso()
    };
  } else {
    favoriteFoods.push({ food_name: foodKey, count: 1, last_used_at: nowIso() });
  }

  const sortedFavorites = favoriteFoods.sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 25);
  const totalMeals = (profile?.total_meals_logged || 0) + 1;
  const previousAverageCalories = profile?.average_calories_per_meal || 0;
  const averageCalories = Math.round(((previousAverageCalories * (totalMeals - 1)) + (meal.calories || 0)) / totalMeals);

  const preferredPortionSizes = { ...(profile?.preferred_portion_sizes || {}) };
  preferredPortionSizes[normalizeFoodName(foodKey)] = {
    quantity: meal.quantity || meal.amount || meal.grams_equivalent || 1,
    unit: meal.unit || meal.unit_name || 'gram',
    grams: meal.grams_equivalent || meal.grams_final || null,
    last_used_at: nowIso()
  };

  const mealTimingHabits = { ...(profile?.meal_timing_habits || {}) };
  mealTimingHabits[meal.meal_type || 'snack'] = (mealTimingHabits[meal.meal_type || 'snack'] || 0) + 1;

  const patternField = `${meal.meal_type || 'snack'}_patterns`;
  const patternValues = Array.from(new Set([meal.food_name, ...((profile?.[patternField]) || [])])).slice(0, 12);

  const aiMistakes = [...(profile?.ai_mistakes_corrected || [])];
  if (previousMeal?.food_name && normalizeFoodName(previousMeal.food_name) !== normalizeFoodName(meal.food_name)) {
    const mistakeIndex = aiMistakes.findIndex((item) => normalizeFoodName(item.original) === normalizeFoodName(previousMeal.food_name) && normalizeFoodName(item.corrected) === normalizeFoodName(meal.food_name));
    if (mistakeIndex >= 0) {
      aiMistakes[mistakeIndex] = { ...aiMistakes[mistakeIndex], count: (aiMistakes[mistakeIndex].count || 0) + 1, last_seen_at: nowIso() };
    } else {
      aiMistakes.push({ original: previousMeal.food_name, corrected: meal.food_name, count: 1, last_seen_at: nowIso() });
    }
  }

  const payload = {
    trainee_id: trainee.id,
    trainee_email: trainee.user_email,
    favorite_foods: sortedFavorites,
    commonly_repeated_meals: sortedFavorites.filter((item) => (item.count || 0) >= 2).map((item) => item.food_name).slice(0, 15),
    average_calories_per_meal: averageCalories,
    meal_timing_habits: mealTimingHabits,
    preferred_portion_sizes: preferredPortionSizes,
    ai_mistakes_corrected: aiMistakes.slice(-30),
    [patternField]: patternValues,
    total_meals_logged: totalMeals,
    updated_at: nowIso()
  };

  if (profile) {
    await base44.entities.TraineeNutritionProfile.update(profile.id, payload);
  } else {
    await base44.entities.TraineeNutritionProfile.create(payload);
  }
}

// Batch version of updateNutritionMemoryFromMeal for multi-ingredient meal events.
// Reads TraineeNutritionProfile ONCE, applies all ingredient updates in-memory,
// counts the whole set as ONE meal, then writes ONCE — eliminating concurrent corruption.
export async function batchUpdateNutritionMemory({ trainee, meals }) {
  if (!trainee?.user_email || !meals?.length) return;
  return _withProfileLock(trainee.user_email, async () => {
    const existing = await base44.entities.TraineeNutritionProfile.filter({ trainee_email: trainee.user_email });
    const profile = existing?.[0] || null;

    const favoriteFoods        = [...(profile?.favorite_foods        || [])];
    const mealTimingHabits     = { ...(profile?.meal_timing_habits   || {}) };
    const preferredPortionSizes = { ...(profile?.preferred_portion_sizes || {}) };

    const mealType = meals[0]?.meal_type || 'snack';
    // Sum calories of all ingredients = total for this one meal event
    const totalCalories = meals.reduce((sum, m) => sum + (Number(m.calories) || 0), 0);

    // Apply every ingredient's food data to in-memory structures before the single write
    for (const meal of meals) {
      const foodKey = (meal.food_name || '').trim();
      if (!foodKey) continue;

      const idx = favoriteFoods.findIndex(item => normalizeFoodName(item.food_name) === normalizeFoodName(foodKey));
      if (idx >= 0) {
        favoriteFoods[idx] = { ...favoriteFoods[idx], count: (favoriteFoods[idx].count || 0) + 1, last_used_at: nowIso() };
      } else {
        favoriteFoods.push({ food_name: foodKey, count: 1, last_used_at: nowIso() });
      }

      preferredPortionSizes[normalizeFoodName(foodKey)] = {
        quantity: meal.quantity || meal.amount || meal.grams_equivalent || 1,
        unit: meal.unit || meal.unit_name || 'gram',
        grams: meal.grams_equivalent || meal.grams_final || null,
        last_used_at: nowIso()
      };
    }

    // Count the entire batch as exactly ONE meal event
    mealTimingHabits[mealType] = (mealTimingHabits[mealType] || 0) + 1;
    const sortedFavorites = favoriteFoods.sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 25);
    const totalMeals = (profile?.total_meals_logged || 0) + 1;
    const prevAvg    = profile?.average_calories_per_meal || 0;
    const averageCalories = Math.round(((prevAvg * (totalMeals - 1)) + totalCalories) / totalMeals);

    const patternField   = `${mealType}_patterns`;
    const existingPats   = profile?.[patternField] || [];
    const newPatterns    = Array.from(new Set([...meals.map(m => m.food_name).filter(Boolean), ...existingPats])).slice(0, 12);

    const payload = {
      trainee_id:               trainee.id,
      trainee_email:            trainee.user_email,
      favorite_foods:           sortedFavorites,
      commonly_repeated_meals:  sortedFavorites.filter(item => (item.count || 0) >= 2).map(item => item.food_name).slice(0, 15),
      average_calories_per_meal: averageCalories,
      meal_timing_habits:       mealTimingHabits,
      preferred_portion_sizes:  preferredPortionSizes,
      ai_mistakes_corrected:    profile?.ai_mistakes_corrected || [],
      [patternField]:           newPatterns,
      total_meals_logged:       totalMeals,
      updated_at:               nowIso()
    };

    if (profile) {
      await base44.entities.TraineeNutritionProfile.update(profile.id, payload);
    } else {
      await base44.entities.TraineeNutritionProfile.create(payload);
    }
  });
}

export async function recordDeletedFoodInMemory({ trainee, meal }) {
  if (!trainee?.user_email || !meal?.food_name) return;
  const existing = await base44.entities.TraineeNutritionProfile.filter({ trainee_email: trainee.user_email });
  const profile = existing?.[0];
  if (!profile) return;
  const foodsDeletedOften = Array.from(new Set([meal.food_name, ...(profile.foods_deleted_often || [])])).slice(0, 25);
  await base44.entities.TraineeNutritionProfile.update(profile.id, {
    foods_deleted_often: foodsDeletedOften,
    updated_at: nowIso()
  });
}

const bucketNow = () => {
  const hour = new Date().getHours();
  if (hour < 11) return 'morning';
  if (hour < 14) return 'noon';
  if (hour < 18) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
};

const per100FromMeal = (meal) => {
  if (isUnitMealWithoutGramWeight(meal)) {
    return sanitizePer100({
      calories_per_100g: Number(meal.calories) || 0,
      protein_per_100g: Number(meal.protein) || 0,
      carbs_per_100g: Number(meal.carbs) || 0,
      fat_per_100g: Number(meal.fat) || 0,
    });
  }

  const grams = meal.grams_equivalent || meal.grams_final || meal.quantity || 100;
  const factor = grams ? 100 / Math.max(Number(grams), 1) : 1;
  return sanitizePer100({
    calories_per_100g: Math.round((meal.calories || 0) * factor),
    protein_per_100g: Math.round((meal.protein || 0) * factor * 10) / 10,
    carbs_per_100g: Math.round((meal.carbs || 0) * factor * 10) / 10,
    fat_per_100g: Math.round((meal.fat || 0) * factor * 10) / 10
  });
};

export async function recordQuickFoodUse({ trainee, meal, sourceFood = {}, timeOfDayBucket = bucketNow() }) {
  if (!trainee?.user_email || !meal?.food_name) return;
  const normalized = normalizeFoodName(meal.food_name);
  return _withFoodLock(trainee.id, normalized, async () => {
    let existing = await base44.entities.UserRecentFoods.filter({ trainee_id: trainee.id, normalized_name: normalized });
    if (!existing?.[0]) {
      existing = await base44.entities.UserRecentFoods.filter({ trainee_id: trainee.id, food_name: meal.food_name });
    }
    const nutrition = per100FromMeal(meal);
    const payload = {
      trainee_id: trainee.id,
      trainee_email: trainee.user_email,
      food_id: meal.food_item_id || sourceFood.food_id,
      user_food_item_id: meal.user_food_item_id || sourceFood.user_food_item_id,
      food_name: meal.food_name,
      normalized_name: normalized,
      ...nutrition,
      last_used_at: nowIso(),
      default_quantity: meal.quantity || meal.amount || meal.grams_equivalent || sourceFood.default_quantity || 100,
      default_unit: meal.unit || meal.unit_name || sourceFood.default_unit || 'gram',
      meal_type: meal.meal_type || sourceFood.meal_type || 'snack',
      time_of_day_bucket: timeOfDayBucket,
      favorite: !!sourceFood.favorite
    };

    if (existing?.[0]) {
      // Preserve the favorite flag — only toggleFavoriteFood owns that field.
      await base44.entities.UserRecentFoods.update(existing[0].id, { ...payload, usage_count: (existing[0].usage_count || 0) + 1, favorite: existing[0].favorite ?? false });
    } else {
      await base44.entities.UserRecentFoods.create({ ...payload, usage_count: 1 });
    }

    let memoryRows = await base44.entities.UserNutritionMemory.filter({ trainee_id: trainee.id, normalized_name: normalized });
    if (!memoryRows?.[0]) {
      memoryRows = await base44.entities.UserNutritionMemory.filter({ trainee_id: trainee.id, food_name: meal.food_name });
    }
    if (memoryRows?.[0]) {
      // Preserve the favorite flag — only toggleFavoriteFood owns that field.
      await base44.entities.UserNutritionMemory.update(memoryRows[0].id, { ...payload, usage_count: (memoryRows[0].usage_count || 0) + 1, favorite: memoryRows[0].favorite ?? false });
    } else {
      await base44.entities.UserNutritionMemory.create({ ...payload, usage_count: 1 });
    }
  });
}

export async function toggleFavoriteFood({ trainee, food, favorite, timeOfDayBucket = bucketNow() }) {
  if (!trainee?.user_email || !food?.food_name) return;
  const existing = await base44.entities.UserFavoriteFoods.filter({ trainee_id: trainee.id, food_name: food.food_name });
  const payload = {
    trainee_id: trainee.id,
    trainee_email: trainee.user_email,
    food_id: food.food_id,
    user_food_item_id: food.user_food_item_id,
    food_name: food.food_name,
    calories_per_100g: food.calories_per_100g || 0,
    protein_per_100g: food.protein_per_100g || 0,
    carbs_per_100g: food.carbs_per_100g || 0,
    fat_per_100g: food.fat_per_100g || 0,
    last_used_at: nowIso(),
    usage_count: food.usage_count || 0,
    favorite,
    default_quantity: food.default_quantity || food.serving_size || 100,
    default_unit: food.default_unit || food.unit || 'gram',
    meal_type: food.meal_type || 'snack',
    time_of_day_bucket: timeOfDayBucket
  };

  if (existing?.[0]) {
    if (favorite) await base44.entities.UserFavoriteFoods.update(existing[0].id, payload);
    else await base44.entities.UserFavoriteFoods.delete(existing[0].id);
  } else if (favorite) {
    await base44.entities.UserFavoriteFoods.create(payload);
  }
}