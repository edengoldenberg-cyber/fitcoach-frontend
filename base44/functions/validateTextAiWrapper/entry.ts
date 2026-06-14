import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TEXT_TESTS = [
  {
    id: 'TEST_1_BAGUETTE_KEBAB',
    input: 'חצי באגט לבן, 4 קבב רומני קטן',
    minItems: 2,
    requiredTerms: ['באגט', 'קבב'],
    forbiddenQuestionTerms: ['איזה סוג מזון', 'מה בדיוק אכלת']
  },
  {
    id: 'TEST_2_CHALLAH_CHEESE_KETCHUP',
    input: '4 פרוסות חלה קלה, 3 פרוסות גבינה צהובה 28%, 2 כפות קטשופ',
    minItems: 3,
    requiredTerms: ['חלה', 'גבינה', 'קטשופ'],
    forbiddenQuestionTerms: ['איזה סוג מזון', 'מה בדיוק אכלת']
  },
  {
    id: 'TEST_3_SALAD_EGG',
    input: 'סלט ירקות 100 גרם וביצה קשה',
    minItems: 2,
    requiredTerms: ['סלט', 'ביצה'],
    forbiddenQuestionTerms: ['שמן', 'חמאה']
  },
  {
    id: 'TEST_4_100_CAL_SNACK',
    input: 'חטיף 100 קלוריות',
    minItems: 1,
    requiredTerms: ['חטיף'],
    maxCalories: 120,
    allowClarification: true,
    forbiddenQuestionTerms: ['איזה סוג מזון']
  },
  {
    id: 'TEST_5_SCRAMBLED_EGGS_LABANEH_CUCUMBER',
    input: 'שתי ביצים מקושקשות בחמאה, שתי כפות לבנה, חצי מלפפון',
    minItems: 4,
    requiredTerms: ['ביצ', 'חמאה', 'לבנה', 'מלפפון'],
    forbiddenQuestionTerms: ['איזה סוג מזון', 'מה בדיוק אכלת']
  }
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const results = [];
    for (const test of TEXT_TESTS) {
      const response = await base44.asServiceRole.functions.invoke('analyzeTextMealWithEnrichedPipeline', {
        meal_text: test.input,
        debug_validation_run: true
      });
      const data = unwrap(response);
      results.push(validateResult(test, data));
    }

    const passedCount = results.filter((r) => r.status === 'passed').length;
    const failedCount = results.length - passedCount;
    const report = {
      reportName: 'TEXT_AI_WRAPPER_VALIDATION_REPORT',
      generatedAt: new Date().toISOString(),
      safeMode: true,
      changedScope: 'Validation/debug visibility only. No auth, WhatsApp, Shape League, workouts, targets, save logic, MealEntry schema, photo behavior, or analyzeMealAI changes.',
      summary: {
        status: failedCount === 0 ? 'TEXT_AI_MEAL_WRAPPER_VALIDATED_AND_LOCKED' : 'TEXT_AI_MEAL_WRAPPER_VALIDATION_HAS_FAILURES',
        total: results.length,
        passed: passedCount,
        failed: failedCount
      },
      textTests: results,
      photoRegression: {
        status: 'not_automated',
        reason: 'No test image URL is bundled in safe validation. Photo AI function and UI route were not changed by this validation.'
      },
      saveFlow: {
        status: 'not_mutated_by_validation',
        reason: 'Meal saving logic was intentionally not changed. UI still calls the existing onSave path.'
      },
      correctionLearning: {
        status: 'not_mutated_by_validation',
        reason: 'Correction learning still uses the existing saveAIFoodCorrection flow; no schema or learning logic was changed.'
      },
      remainingRisks: [
        'Live photo regression requires a real uploaded image from the UI.',
        'Full save/correction confirmation requires a controlled trainee test record to avoid unintended production diary writes.'
      ],
      filesChanged: [
        'functions/analyzeTextMealWithEnrichedPipeline.js',
        'functions/validateTextAiWrapper.js',
        'components/trainee/AIAnalyzeMealDialog.jsx',
        'components/nutrition-debug/NutritionDebugTestPanel.jsx',
        'TEXT_AI_WRAPPER_VALIDATION_REPORT.md'
      ]
    };

    return Response.json(report);
  } catch (error) {
    return Response.json({ error: error.message || 'Validation failed' }, { status: 500 });
  }
});

function unwrap(response) {
  const data = response?.data?.response || response?.data || response;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch (_) {
      return null;
    }
  }
  return data;
}

function validateResult(test, data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const questions = Array.isArray(data?.clarifying_questions) ? data.clarifying_questions : [];
  const itemText = items.map((item) => `${item.name || ''} ${item.name_he || ''} ${item.food_name || ''}`).join(' ').toLowerCase();
  const questionText = questions.map((q) => q.question || '').join(' ').toLowerCase();
  const calories = items.reduce((sum, item) => sum + Number(item.calories || 0), 0);
  const protein = items.reduce((sum, item) => sum + Number(item.protein || 0), 0);
  const failures = [];

  if (items.length < test.minItems) failures.push(`Expected at least ${test.minItems} items, got ${items.length}`);
  if (calories <= 0) failures.push('Expected calories > 0');
  if (test.id !== 'TEST_4_100_CAL_SNACK' && protein <= 0) failures.push('Expected protein > 0');
  for (const term of test.requiredTerms || []) {
    if (!itemText.includes(term.toLowerCase())) failures.push(`Missing required item term: ${term}`);
  }
  for (const term of test.forbiddenQuestionTerms || []) {
    if (questionText.includes(term.toLowerCase())) failures.push(`Forbidden question term found: ${term}`);
  }
  if (test.maxCalories && calories > test.maxCalories) failures.push(`Expected calories <= ${test.maxCalories}, got ${calories}`);
  if (!data?.safe_wrapper) failures.push('safe_wrapper flag missing');

  return {
    id: test.id,
    input: test.input,
    status: failures.length ? 'failed' : 'passed',
    failures,
    pipeline: data?.text_pipeline || 'unknown',
    wrapper_used: !!data?.safe_wrapper,
    fallback_used: !!data?.fallback_used,
    items_count: items.length,
    questions_count: questions.length,
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    confidence: data?.confidence || null,
    error_stage: data?.error_stage || null
  };
}