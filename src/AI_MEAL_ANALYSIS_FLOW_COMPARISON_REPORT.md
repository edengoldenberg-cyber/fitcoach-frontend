# AI_MEAL_ANALYSIS_FLOW_COMPARISON_REPORT

## Scope and safety mode
Only the AI meal analysis flows were audited and aligned. No auth, WhatsApp, Shape League, workouts, nutrition targets, or meal saving logic was changed.

## Files / components / functions involved

### Photo AI flow
- `components/trainee/AddMealFromPhoto`
- `functions/analyzeAndEnrichMealPhoto`
- `components/trainee/nutritionLearning`
- `entities/MealEntry.json`
- `entities/UserFoodItem.json`
- `entities/TraineeNutritionProfile.json`
- `entities/Trainee.json`
- Optional database lookup: `FoodItem`

### Text AI flow before alignment
- `components/trainee/AIAnalyzeMealDialog`
- `functions/analyzeMealAI`
- `entities/NutritionAnalysisDebugLog.json`
- `entities/UserNutritionMemory.json`
- `entities/UserFoodItem.json`
- `entities/MealEntry.json`

### Text AI flow after alignment
- `components/trainee/AIAnalyzeMealDialog`
- `functions/analyzeAndEnrichMealPhoto` with `meal_text`
- The existing `onSave` / diary save path remains unchanged.

## Photo AI architecture

### Input structure
Frontend uploads an image with `UploadFile`, then calls:
```json
{
  "image_url": "https://...",
  "user_answers": { "question_id": "answer" },
  "user_notes": "optional correction notes"
}
```

### Prompt used
`identifyFoodWithGPT4o()` uses a strict vision prompt:
- list only visible food items
- never invent brands
- split composite dishes into ingredient rows
- use generic Hebrew food names
- ask contextual clarification questions
- output JSON with `items[]`

### Parsing logic
1. GPT-4o Vision identifies food components into `items[]`.
2. Each item is passed to `getNutritionForItem()`.
3. Nutrition values are enriched per item.
4. If nutrition enrichment fails, `estimateNutritionFallback()` fills values.
5. Personal corrections are applied through `applyPersonalCorrections()`.

### Clarification questions
Photo flow asks contextual questions about food type, preparation, quantity, dairy %, bread type, oil/dressing, etc. The questions are tied to the actual detected food.

### Confidence logic
Photo flow returns `confidence` from the visual identification stage and displays a confidence banner in `AddMealFromPhoto`.

### Fallback logic
Photo flow has layered fallback:
- GPT parse fallback returns empty safe structure
- nutrition fallback per item
- personal correction override
- duplicate detection before review

### Ingredient rows
Photo flow always aims to produce rows shaped like:
```json
{
  "name": "לחם לבן",
  "grams": 40,
  "calories": 100,
  "protein": 3.2,
  "carbs": 19.2,
  "fat": 0.8,
  "per100_kcal": 250
}
```
This is why the UI can render stable editable ingredient rows.

### User correction flow
`AddMealFromPhoto` supports:
- editing ingredient name / grams / macros
- replacing an item from the food database
- recalculating a corrected item via `analyzeAndEnrichMealPhoto` using `meal_text`
- saving corrections through `saveAIFoodCorrection()`

### Save flow
Photo flow saves each ingredient as a separate `MealEntry`. This was not changed.

### Debug logging
Photo flow has mostly console/function logs but does not depend on storing a large nested debug object for every step.

## Text AI architecture before alignment

### Input structure
`AIAnalyzeMealDialog` called:
```json
{
  "mealDescription": "חצי באגט לבן, 4 קבב רומני קטן",
  "userFeedback": "optional",
  "photoUrl": null,
  "userAnswers": {},
  "previousAnalysis": {},
  "mealContext": {}
}
```

### Prompt used
`analyzeMealAI` used a large general nutrition prompt through `Core.InvokeLLM`, asking for final calories and `ingredients[]` in one model response.

### Parsing logic
Text flow depended on one LLM call to both parse the text and calculate nutrition. If `ingredients[]` was empty, it tried several fallback parsers.

### Clarification questions
Text flow could fall back to generic questions from `defaultQuestions()` / `buildWeakTextQuestions()`, including generic patterns like `איזה סוג מזון זה`, when the parser could not map the food text to known segments.

### Confidence logic
Text flow downgraded low-confidence responses and sometimes converted them into clarification-only results, which caused empty ingredients.

### Fallback logic
Text fallback was rule-based and incomplete. It recognized some foods like eggs, salad, challah, cheese, ketchup, and pizza, but it did not consistently cover common Israeli text meals like baguette + kebab. This caused empty rows or generic questions.

### Ingredient rows
Text flow returned `ingredients[]`, but when the LLM or fallback failed, the UI had no stable row model to render.

### User correction flow
`AIAnalyzeMealDialog` had correction/editing, but it used the `analyzeMealAI` schema. Clarification answer payloads did not preserve `food_key` and `grams`, so recalculation could lose context.

### Save flow
Text flow uses the existing `onSave` callback into `NutritionLog` and was not changed.

### Debug logging
`analyzeMealAI` writes to `NutritionAnalysisDebugLog`. Before the recent fix, raw objects could contain circular references and crash with JSON serialization errors.

## Exact differences identified

### Why photo AI returns good ingredient rows
Photo flow separates responsibilities:
1. identify ingredient rows first (`items[]`)
2. enrich nutrition per row
3. fallback nutrition per row
4. render rows only after enrichment

This creates a stable row-based contract for the UI.

### Why text AI returned empty ingredients
Text flow previously asked a single general model call to produce final nutrition and ingredients together. If the response had low confidence, no ingredients, parse failure, or schema mismatch, the code often moved to clarification-only fallback instead of producing preliminary rows.

### Why text AI asked generic questions
When rule fallback failed to identify concrete foods, `buildWeakTextQuestions()` / `defaultQuestions()` produced generic questions. These were not tied to parsed ingredients.

### Why text AI lost original context
On clarification, the old UI sent partial answers to `analyzeMealAI`. The answer object did not preserve enough `food_key` / `grams` detail, and recalculation relied on `previousAnalysis` and `mealContext`. Any missing or malformed context caused the function to analyze the answer instead of the original meal.

### Why text AI triggered `outer_error`
`outer_error` was triggered by unhandled failures in the large `analyzeMealAI` pipeline: LLM response shape issues, fallback parser gaps, debug update issues, or serialization failures.

### Why text AI debug caused cyclic JSON crash
Some debug payloads included full raw objects or SDK/error objects. Plain `JSON.stringify()` cannot serialize circular object references. This has been fixed in `analyzeMealAI` and the UI copy report by using circular-safe serialization.

## Successful architecture to reuse
The successful architecture is `analyzeAndEnrichMealPhoto`:

```text
input text/photo
→ identify structured food items
→ enrich nutrition per item
→ apply fallback per item
→ apply personal corrections
→ return editable ingredient rows
→ ask contextual clarification questions
→ allow per-ingredient correction
→ save corrections to memory
→ save meal
```

## Alignment performed
`AIAnalyzeMealDialog` now calls `analyzeAndEnrichMealPhoto` with:
```json
{
  "meal_text": "חצי באגט לבן, 4 קבב רומני קטן",
  "image_url": null,
  "user_answers": {},
  "user_notes": "optional feedback"
}
```
The returned `items[]` are adapted into the existing `ingredients[]` UI shape, so the text dialog can keep its current UI and save flow while using the proven extraction/enrichment backend.

Clarification answers now preserve:
```json
{
  "question": "...",
  "food_key": "...",
  "answer": "...",
  "grams": 80
}
```
This prevents context loss during recalculation.

## Validation input
Input:
```text
חצי באגט לבן, 4 קבב רומני קטן
```

Expected after alignment:
- ingredient rows appear
- calories/macros are greater than 0
- confidence is shown
- no cyclic JSON crash
- no generic `איזה סוג מזון זה`
- no empty ingredients

Observed backend validation:
`analyzeAndEnrichMealPhoto` returns contextual baguette/kebab questions and ingredient rows through the enriched text pipeline. `analyzeMealAI` also no longer crashes on cyclic JSON after safe serialization.

## Recommendation
Keep one shared backend contract for both photo and text:
- `items[]` for extracted ingredient rows
- per-item nutrition enrichment
- contextual `clarifying_questions[]`
- personal correction application
- optional debug log wrapper

Long term, deprecate direct text use of `analyzeMealAI` for user-facing meal logging and keep it only as a debug/audit function, unless it is refactored to internally call the enriched item pipeline.

## Final status
AI_PHOTO_TEXT_MEAL_ANALYSIS_COMPARISON_COMPLETE