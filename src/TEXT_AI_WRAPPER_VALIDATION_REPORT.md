# TEXT_AI_WRAPPER_VALIDATION_REPORT

## Status
Pending live validation run from `validateTextAiWrapper`.

## Safety Scope
Strict safe mode: no auth, WhatsApp, Shape League, workouts, nutrition targets, photo AI behavior, MealEntry schema, meal saving logic, or `analyzeMealAI` business logic should be changed.

## What was added
- Debug-only text pipeline visibility in `AIAnalyzeMealDialog`.
- Automated text wrapper validation function: `validateTextAiWrapper`.
- Nutrition AI Debug panel button to run the hard validation set.
- Wrapper metadata fields for safe routing confirmation.

## Pipelines tracked
- `enriched_wrapper`
- `rule_parser_fallback`
- `old_analyzeMealAI_fallback`
- `friendly_recovery_ui`

## Required text tests
1. `חצי באגט לבן, 4 קבב רומני קטן`
2. `4 פרוסות חלה קלה, 3 פרוסות גבינה צהובה 28%, 2 כפות קטשופ`
3. `סלט ירקות 100 גרם וביצה קשה`
4. `חטיף 100 קלוריות`
5. `שתי ביצים מקושקשות בחמאה, שתי כפות לבנה, חצי מלפפון`

## Photo regression
Not mutated by this lock. Live confirmation requires a real uploaded image through the existing photo UI.

## Save flow
Not mutated by this lock. The dialog still calls the existing `onSave` path.

## Correction learning
Not mutated by this lock. The dialog still calls the existing `saveAIFoodCorrection` path.

## Files changed
- `functions/analyzeTextMealWithEnrichedPipeline.js`
- `functions/validateTextAiWrapper.js`
- `components/trainee/AIAnalyzeMealDialog.jsx`
- `components/nutrition-debug/NutritionDebugTestPanel.jsx`
- `TEXT_AI_WRAPPER_VALIDATION_REPORT.md