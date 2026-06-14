import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const mealText = String(body.meal_text || body.mealDescription || '').trim();
    if (!mealText) {
      return Response.json({ error: 'meal_text required' }, { status: 400 });
    }

    const enrichedPayload = {
      meal_text: mealText,
      user_answers: body.user_answers || body.userAnswers || undefined,
      user_notes: body.user_notes || body.userFeedback || undefined,
    };

    try {
      const enrichedResponse = await base44.functions.invoke('analyzeAndEnrichMealPhoto', enrichedPayload);
      const enrichedData = unwrapFunctionResponse(enrichedResponse);
      if (hasUsableEnrichedResult(enrichedData)) {
        return Response.json(withWrapperMeta(enrichedData, 'enriched_wrapper', false, null));
      }
    } catch (enrichedError) {
      console.warn('[analyzeTextMealWithEnrichedPipeline] enriched pipeline failed:', enrichedError?.message || enrichedError);
      const ruleFallback = toEnrichedCompatibleShape(buildMinimalRuleFallback(mealText), mealText, 'rule_parser_fallback');
      if (hasUsableEnrichedResult(ruleFallback)) {
        return Response.json(withWrapperMeta(ruleFallback, 'rule_parser_fallback', true, 'enriched_wrapper_failed'));
      }
    }

    try {
      const legacyResponse = await base44.functions.invoke('analyzeMealAI', {
        mealDescription: mealText,
        userAnswers: body.user_answers || body.userAnswers || undefined,
        userFeedback: body.user_notes || body.userFeedback || undefined,
        mealType: body.meal_type || body.mealType || undefined,
        sourceType: 'TEXT',
      });
      const legacyData = unwrapFunctionResponse(legacyResponse);
      return Response.json(withWrapperMeta(toEnrichedCompatibleShape(legacyData, mealText, 'old_analyzeMealAI_fallback'), 'old_analyzeMealAI_fallback', true, null));
    } catch (legacyError) {
      console.warn('[analyzeTextMealWithEnrichedPipeline] legacy fallback failed:', legacyError?.message || legacyError);
      return Response.json(withWrapperMeta(toEnrichedCompatibleShape(buildMinimalRuleFallback(mealText), mealText, 'rule_parser_fallback'), 'rule_parser_fallback', true, 'legacy_fallback_failed'));
    }
  } catch (error) {
    console.error('[analyzeTextMealWithEnrichedPipeline] hard failure:', error?.message || error);
    return Response.json({ error: error.message || 'Text meal analysis failed' }, { status: 500 });
  }
});

function unwrapFunctionResponse(response) {
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

function hasUsableEnrichedResult(data) {
  return !!data && Array.isArray(data.items) && data.items.length > 0;
}

function withWrapperMeta(data, pipeline, fallbackUsed, errorStage) {
  const itemsCount = Array.isArray(data?.items) ? data.items.length : 0;
  const questionsCount = Array.isArray(data?.clarifying_questions) ? data.clarifying_questions.length : 0;
  return {
    ...data,
    safe_wrapper: true,
    wrapper_used: true,
    fallback_used: fallbackUsed,
    text_pipeline: pipeline,
    pipeline,
    items_count: itemsCount,
    questions_count: questionsCount,
    error_stage: errorStage,
    debug_pipeline: {
      pipeline,
      wrapper_used: true,
      fallback_used: fallbackUsed,
      items_count: itemsCount,
      questions_count: questionsCount,
      error_stage: errorStage
    }
  };
}

function toEnrichedCompatibleShape(data, mealText, pipelineName) {
  if (data && Array.isArray(data.items)) {
    return {
      ...data,
      safe_wrapper: true,
      text_pipeline: pipelineName,
    };
  }

  const ingredients = Array.isArray(data?.ingredients) ? data.ingredients : [];
  const items = ingredients.map((item) => {
    const grams = Number(item.quantity_grams || item.estimated_grams || item.grams || 100) || 100;
    return {
      name: item.name || item.food_name || 'מרכיב לא מזוהה',
      name_he: item.name || item.food_name || 'מרכיב לא מזוהה',
      grams,
      quantity_grams: grams,
      quantity_display: item.quantity_display || item.quantity_text || `${grams} גרם`,
      calories: Number(item.calories || 0),
      protein: Number(item.protein || 0),
      carbs: Number(item.carbs || 0),
      fat: Number(item.fat || 0),
      confidence: item.confidence || data?.confidence || 'medium',
      nutrition_source: pipelineName,
      ai_confidence_note: item.source_text_segment || data?.uncertainty_note || '',
    };
  });

  return {
    needs_clarification: !!(data?.analysis_pending || data?.needsClarification || data?.needs_clarification),
    clarifying_questions: data?.clarifying_questions || data?.questions || [],
    meal_name: data?.meal_name || mealText,
    confidence: data?.confidence || (items.length ? 'medium' : 'low'),
    uncertainty_score: data?.uncertainty_score || null,
    notes: data?.uncertainty_note || data?.notes || '',
    items,
    debugLogId: data?.debugLogId || null,
    safe_wrapper: true,
    text_pipeline: pipelineName,
  };
}

function buildMinimalRuleFallback(mealText) {
  const text = String(mealText || '').toLowerCase();
  const items = [];

  if (/באגט/.test(text)) {
    const grams = /חצי/.test(text) ? 120 : 240;
    const factor = grams / 100;
    items.push({ name: 'באגט לבן', food_name: 'באגט לבן', quantity_grams: grams, calories: Math.round(270 * factor), protein: Math.round(9 * factor * 10) / 10, carbs: Math.round(56 * factor * 10) / 10, fat: Math.round(1.2 * factor * 10) / 10 });
  }

  if (/חלה/.test(text)) {
    const count = Number(text.match(/(\d+)\s*פרוס(?:ות)?\s*חלה/)?.[1] || 1);
    const grams = count * 25;
    const factor = grams / 100;
    items.push({ name: /קלה/.test(text) ? 'חלה קלה' : 'חלה', food_name: /קלה/.test(text) ? 'חלה קלה' : 'חלה', quantity_grams: grams, calories: Math.round(280 * factor), protein: Math.round(9 * factor * 10) / 10, carbs: Math.round(56 * factor * 10) / 10, fat: Math.round(3 * factor * 10) / 10 });
  }

  if (/גבינה\s*צהובה/.test(text)) {
    const count = Number(text.match(/(\d+)\s*פרוס(?:ות)?\s*גבינה/)?.[1] || 1);
    const grams = count * 20;
    const factor = grams / 100;
    items.push({ name: /28/.test(text) ? 'גבינה צהובה 28%' : 'גבינה צהובה', food_name: /28/.test(text) ? 'גבינה צהובה 28%' : 'גבינה צהובה', quantity_grams: grams, calories: Math.round(350 * factor), protein: Math.round(25 * factor * 10) / 10, carbs: Math.round(1.5 * factor * 10) / 10, fat: Math.round(28 * factor * 10) / 10 });
  }

  if (/קטשופ/.test(text)) {
    const count = Number(text.match(/(\d+)\s*כפ(?:ות)?\s*קטשופ/)?.[1] || 1);
    const grams = count * 17;
    const factor = grams / 100;
    items.push({ name: 'קטשופ', food_name: 'קטשופ', quantity_grams: grams, calories: Math.round(110 * factor), protein: 0, carbs: Math.round(26 * factor * 10) / 10, fat: 0 });
  }

  if (/קבב/.test(text)) {
    const count = Number(text.match(/(\d+)\s*קבב/)?.[1] || text.match(/קבב\s*(\d+)/)?.[1] || 1);
    const gramsPerUnit = /קטן/.test(text) ? 45 : 70;
    const grams = count * gramsPerUnit;
    const factor = grams / 100;
    items.push({ name: 'קבב רומני', food_name: 'קבב רומני', quantity_grams: grams, calories: Math.round(260 * factor), protein: Math.round(16 * factor * 10) / 10, carbs: Math.round(2 * factor * 10) / 10, fat: Math.round(21 * factor * 10) / 10 });
  }

  if (/סלט/.test(text)) {
    const grams = Number(text.match(/סלט[^\d]*(\d+)\s*(?:גרם|ג׳)/)?.[1] || text.match(/(\d+)\s*(?:גרם|ג׳).*סלט/)?.[1] || 100);
    const factor = grams / 100;
    items.push({ name: 'סלט ירקות', food_name: 'סלט ירקות', quantity_grams: grams, calories: Math.round(22 * factor), protein: Math.round(1 * factor * 10) / 10, carbs: Math.round(4 * factor * 10) / 10, fat: Math.round(0.2 * factor * 10) / 10 });
  }

  if (/ביצה|ביצים|מקושקש/.test(text)) {
    const wordCount = /שתי|שתיים/.test(text) ? 2 : /שלוש/.test(text) ? 3 : /ארבע/.test(text) ? 4 : 1;
    const count = Number(text.match(/(\d+)\s*ביצ/)?.[1] || wordCount);
    const name = /קשה/.test(text) ? 'ביצה קשה' : /מקושקש/.test(text) ? 'ביצים מקושקשות' : 'ביצה';
    items.push({ name, food_name: name, quantity_grams: count * 55, calories: count * 78, protein: count * 6.3, carbs: count * 0.6, fat: count * 5.3 });
  }

  if (/חמאה/.test(text)) {
    const grams = /כף/.test(text) ? 10 : 5;
    const factor = grams / 100;
    items.push({ name: 'חמאה', food_name: 'חמאה', quantity_grams: grams, calories: Math.round(717 * factor), protein: Math.round(0.9 * factor * 10) / 10, carbs: Math.round(0.1 * factor * 10) / 10, fat: Math.round(81 * factor * 10) / 10 });
  }

  if (/לבנה/.test(text)) {
    const count = /שתי/.test(text) || /שתיים/.test(text) ? 2 : Number(text.match(/(\d+)\s*כפ(?:ות)?\s*לבנה/)?.[1] || 1);
    const grams = count * 15;
    const factor = grams / 100;
    items.push({ name: 'לבנה', food_name: 'לבנה', quantity_grams: grams, calories: Math.round(150 * factor), protein: Math.round(9 * factor * 10) / 10, carbs: Math.round(4 * factor * 10) / 10, fat: Math.round(10 * factor * 10) / 10 });
  }

  if (/מלפפון/.test(text)) {
    const grams = /חצי/.test(text) ? 50 : 100;
    const factor = grams / 100;
    items.push({ name: 'מלפפון', food_name: 'מלפפון', quantity_grams: grams, calories: Math.round(15 * factor), protein: Math.round(0.7 * factor * 10) / 10, carbs: Math.round(3.6 * factor * 10) / 10, fat: Math.round(0.1 * factor * 10) / 10 });
  }

  if (/חטיף/.test(text) && /100\s*קל/.test(text)) {
    items.push({ name: 'חטיף 100 קלוריות', food_name: 'חטיף 100 קלוריות', quantity_grams: 1, calories: 100, protein: 0, carbs: 0, fat: 0, confidence: 'low' });
  }

  if (/פיצה/.test(text)) {
    const count = Number(text.match(/(\d+)/)?.[1] || 1);
    items.push({ name: 'פיצה', food_name: 'פיצה', quantity_grams: count * 100, calories: count * 280, protein: count * 12, carbs: count * 30, fat: count * 10 });
  }

  return {
    meal_name: mealText,
    confidence: items.length ? 'medium' : 'low',
    uncertainty_note: items.length ? 'הופעל parser גיבוי בטוח לאחר כשל זמני במנוע המועשר' : 'לא זוהו מספיק רכיבים — אפשר לפרט עוד או לערוך ידנית.',
    analysis_pending: !items.length,
    needsClarification: !items.length,
    ingredients: items,
    clarifying_questions: items.length ? [] : [{ id: 'more_details', question: 'אפשר לפרט מה בדיוק אכלת?', options: [{ label: 'אפרט שוב', value: 'retry' }] }],
  };
}