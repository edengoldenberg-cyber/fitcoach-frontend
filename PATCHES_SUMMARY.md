# Meal Analysis Patch Summary

**Applied:** 2026-05-26  
**Scope:** AI meal analysis pipeline only — no UI/UX changes, no entity schema changes, no migration required.

---

## Files Changed

| File | Patch |
|------|-------|
| `base44/functions/analyzeAndEnrichMealPhoto/entry.ts` | PATCH 1 |
| `src/components/trainee/nutritionLearning.jsx` | PATCH 2 |
| `src/components/trainee/AddMealWithAI.jsx` | PATCH 2, PATCH 3, PATCH 4 |

---

## Patches Applied

### PATCH 1 — per100 guarantee on every returned item
**File:** `analyzeAndEnrichMealPhoto/entry.ts`  
**Change:** Added `ensurePer100(item)` function (lines 645–690). Applied via `learnedItems.map(ensurePer100)` → `finalItems` before the response is returned.  
**Logic:**
- If `per100 > 0`: use it as source of truth; recompute total from `per100 × grams / 100`.
- If `per100 ≤ 0` and `total > 0`: derive `per100 = total / grams × 100`.
- If both ≤ 0: preserve zero (legitimate for items like water).
- `grams` clamped to minimum 1 to prevent division by zero.

### PATCH 2 — remove duplicate memory update; remove 0-calorie item skip
**Files:** `nutritionLearning.jsx`, `AddMealWithAI.jsx`

**Change A (`nutritionLearning.jsx`):** Removed `await updateNutritionMemoryFromMeal(...)` call from the end of `saveAIFoodCorrection`. The function now ends with `return savedFood;` only.

**Change B (`AddMealWithAI.jsx`):** In `handleSave` loop guard, changed:
```js
// Before
if (!item.name || !item.calories) continue;
// After
if (!item.name) continue;
```

### PATCH 3 — single-item re-analysis uses correct engine
**File:** `AddMealWithAI.jsx` — `handleAnalyzeSingleItem`  
**Change:** Replaced `analyzeMealAI` call with `analyzeAndEnrichMealPhoto`. Updated response unwrap path (`response.data` instead of `response.data?.response ?? response.data`). Updated result shape reading from `result.ingredients[0]` to `result.items[0]`. Totals now computed as `per100 × grams / 100` instead of back-derived from legacy totals.

### PATCH 4 — manual macro edits back-derive per100
**File:** `AddMealWithAI.jsx` — `handleUpdateItem`  
**Change:** Added `else if` branch for `field === 'calories' | 'protein' | 'carbs' | 'fat'`. When the user edits a macro directly, the corresponding `per100_*` value is immediately recomputed as `newValue / currentGrams × 100`. Subsequent gram edits continue using per100 as source of truth and now reflect the user's manual intent.

---

## Bugs Fixed

| # | Bug | Symptom | Fix |
|---|-----|---------|-----|
| 1 | Missing per100 values from AI | Editing grams zeroed all macros | PATCH 1: `ensurePer100` guarantees all 4 per100 fields on every item |
| 2 | Double `updateNutritionMemoryFromMeal` | `total_meals_logged` and `favorite_foods` counts inflated 2× per correction | PATCH 2A: removed call from `saveAIFoodCorrection`; single call remains in `NutritionLog.jsx addMealMutation` |
| 3 | `calories === 0` skip in save loop | 0-calorie items (black coffee, diet drinks) silently dropped from all 4 entities | PATCH 2B: guard now only checks `!item.name` |
| 4 | Wrong AI engine in single-item re-analysis | Re-analysis used Claude legacy path with mismatched response shape and no per100 | PATCH 3: `handleAnalyzeSingleItem` now calls `analyzeAndEnrichMealPhoto` |
| 5 | Manual macro edits lost on gram change | User typing `350` for calories then adjusting grams reverted to AI original value | PATCH 4: per100 back-derived immediately on any macro edit |

---

## Manual Test Checklist

### Core flow
- [ ] Type a meal in free text (e.g. "200 גרם עוף + 100 גרם אורז"), confirm analysis shows items with non-zero macros
- [ ] Change grams on one item — confirm calories/protein/carbs/fat update proportionally
- [ ] Change grams back to original — confirm values return to original (not zero)

### PATCH 1 — per100 guarantee
- [ ] Analyze a meal; open browser DevTools Network tab; inspect `analyzeAndEnrichMealPhoto` response; confirm every item has `per100_kcal`, `per100_protein`, `per100_carbs`, `per100_fat` all > 0

### PATCH 2 — double memory update
- [ ] Log a corrected meal item (edit a name or macro); open `TraineeNutritionProfile` in Base44 entity explorer; confirm `total_meals_logged` incremented by exactly 1 (not 2)
- [ ] Check `favorite_foods` — the corrected item should appear once, not twice

### PATCH 2B — 0-calorie items
- [ ] Type "קפה שחור" (black coffee); confirm it appears in the review list
- [ ] Save the meal; confirm the item is saved to `MealEntry` / `UserFoodItem` entities, not dropped
- [ ] Confirm the meal's total calorie guard at the top of `handleSave` still rejects a meal where ALL items are 0 calories (the guard `if (!totals.calories)` on line 293 is intentional and unchanged)

### PATCH 3 — single-item re-analysis engine
- [ ] In the review step, click the "re-analyze" button on a single item
- [ ] Confirm the loading spinner appears (reanalyzingItemIndex state)
- [ ] Confirm the item updates with new macros after re-analysis
- [ ] Change grams after re-analysis — confirm macros scale correctly (not zero)

### PATCH 4 — manual macro edits survive gram changes
- [ ] Analyze any meal; manually type a new calorie value for one item (e.g. change 200 to 350)
- [ ] Change the grams value for that same item
- [ ] Confirm the new calories scale from 350, not from the original AI value

### Regression checks
- [ ] Full meal save completes without error (all items written to entities)
- [ ] Clarification questions flow still works (answer a question, confirm items update)
- [ ] Photo analysis flow unaffected (upload a food photo, confirm analysis returns)
- [ ] `NutritionLog.jsx` save flow unaffected — `addMealMutation` still fires correctly

---

## Rollback Instructions

Each patch is independently reversible. No database migrations were made.

### Rollback PATCH 1 (`analyzeAndEnrichMealPhoto/entry.ts`)
Remove the `ensurePer100` function block (lines ~645–690, marked with `// ── PATCH 1 ──` comments).  
Change `const finalItems = learnedItems.map(ensurePer100);` back to using `learnedItems` directly in the response: `items: learnedItems`.

### Rollback PATCH 2A (`nutritionLearning.jsx`)
Re-add the removed call at the end of `saveAIFoodCorrection`, just before `return savedFood;`:
```js
await updateNutritionMemoryFromMeal({
  trainee,
  meal: { ...correctedMeal, food_name: correctedName },
  previousMeal: { food_name: originalName }
});
```

### Rollback PATCH 2B (`AddMealWithAI.jsx`)
In `handleSave`, change line 300:
```js
// Revert to:
if (!item.name || !item.calories) continue;
```

### Rollback PATCH 3 (`AddMealWithAI.jsx`)
Replace the body of `handleAnalyzeSingleItem` (lines ~185–228) with:
```js
const response = await base44.functions.invoke('analyzeMealAI', {
  mealDescription: `${item.name} ${grams} גרם`,
  userFeedback: `נתח רק את המוצר הזה בנפרד והחזר ערכים עבור ${grams} גרם בדיוק.`
});
const result = response.data?.response ?? response.data;
if (!result?.can_analyze) {
  setError(result?.reason || 'לא הצלחתי לנתח את המוצר הזה');
  return;
}
const ingredient = result.ingredients?.[0];
const calories = Math.round(ingredient?.calories ?? result.total_calories ?? 0);
const protein = Math.round(Number(ingredient?.protein ?? result.total_protein ?? 0) * 10) / 10;
const carbs = Math.round(Number(ingredient?.carbs ?? result.total_carbs ?? 0) * 10) / 10;
const fat = Math.round(Number(ingredient?.fat ?? result.total_fat ?? 0) * 10) / 10;
setAnalyzedItems(prev => prev.map((current, currentIndex) => currentIndex === index ? {
  ...current,
  name: ingredient?.name || current.name,
  grams,
  calories, protein, carbs, fat,
  per100_kcal: grams ? (calories / grams) * 100 : current.per100_kcal,
  per100_protein: grams ? (protein / grams) * 100 : current.per100_protein,
  per100_carbs: grams ? (carbs / grams) * 100 : current.per100_carbs,
  per100_fat: grams ? (fat / grams) * 100 : current.per100_fat,
  nutrition_source: 'single_item_ai',
  _corrected: true,
} : current));
```

### Rollback PATCH 4 (`AddMealWithAI.jsx`)
In `handleUpdateItem`, remove the `else if` block (lines ~174–181):
```js
// Remove:
} else if (field === 'calories' || field === 'protein' || field === 'carbs' || field === 'fat') {
  const currentGrams = parseFloat(updated[index].grams) || 100;
  const numValue = Number(value) || 0;
  if (field === 'calories') updated[index].per100_kcal = (numValue / currentGrams) * 100;
  if (field === 'protein') updated[index].per100_protein = (numValue / currentGrams) * 100;
  if (field === 'carbs') updated[index].per100_carbs = (numValue / currentGrams) * 100;
  if (field === 'fat') updated[index].per100_fat = (numValue / currentGrams) * 100;
}
```

---

## Known Remaining Tech Debt (not addressed in these patches)

- **Bug #6:** `analyzeTextMealWithEnrichedPipeline` fallback path (`toEnrichedCompatibleShape`) never populates per100 fields — legacy text wrapper still has the pre-PATCH-1 problem if reached via that path.
- **Bug #7:** Race condition — rapid save clicks can trigger parallel `saveAIFoodCorrection` calls; no debounce or in-flight guard on `handleSave`.
- **Bug #8:** Partial save failure — if one item in the `handleSave` loop throws, earlier items are already written; no rollback. Items after the failed one are silently dropped.
- `handleAnalyzeSingleItem` sends `${grams} גרם` as a hint but the AI may return different gram amounts; the current code pins grams to the user's value. Consider whether the AI's gram estimate should be used instead in a future patch.
