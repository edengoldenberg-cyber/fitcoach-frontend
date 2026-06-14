import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  let debugLogId = null;
  let preservedOriginalText = '';
  let preservedRawInput = null;
  let preservedMealType = 'other';
  let preservedPreviousAnalysis = null;
  let preservedUserAnswers = {};
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    preservedRawInput = body;
    const { mealDescription, userFeedback, photoUrl, userAnswers, previousAnalysis, mealContext, mealType, sourceType, debugContext } = body;
    const hasClarificationAnswers = userAnswers && Object.keys(userAnswers || {}).length > 0;
    const originalMealText = (mealContext?.originalMealText || previousAnalysis?.original_text || previousAnalysis?.raw_input || mealDescription || '').trim();
    const effectiveMealDescription = (hasClarificationAnswers ? originalMealText : mealDescription?.trim()) || 'נתח את הארוחה בתמונה';
    const analysisSourceType = sourceType || (photoUrl ? 'IMAGE' : 'TEXT');
    preservedOriginalText = originalMealText || effectiveMealDescription;
    preservedMealType = mealType || mealContext?.selectedMealType || 'other';
    preservedPreviousAnalysis = previousAnalysis || null;
    preservedUserAnswers = userAnswers || {};
    const traineeRowsForMemory = user?.email ? await base44.entities.Trainee.filter({ user_email: user.email }) : [];
    const currentTraineeForMemory = traineeRowsForMemory?.[0] || null;

    debugLogId = await createDebugLog(base44, {
      traineeId: debugContext?.selectedTraineeId || currentTraineeForMemory?.id || '',
      coachId: currentTraineeForMemory?.coach_email || '',
      sourceType: analysisSourceType,
      mealType: mealType || mealContext?.selectedMealType || 'other',
      originalInputText: effectiveMealDescription,
      imageUrl: photoUrl || '',
      currentStep: 'user_submitted_input',
      status: 'STARTED',
      userAgent: req.headers.get('user-agent') || '',
      appRoute: debugContext?.appRoute || mealContext?.appRoute || '',
      debugNotes: {
        dryRun: !!debugContext?.dryRun,
        testRun: !!debugContext?.testRun,
        submittedAt: new Date().toISOString()
      }
    });

    if ((!mealDescription || !mealDescription.trim()) && !photoUrl) {
      await patchDebugLog(base44, debugLogId, { status: 'ERROR', currentStep: 'input_validation_failed', errorMessage: 'תיאור הארוחה חסר' });
      return Response.json({ error: 'תיאור הארוחה חסר', debugLogId }, { status: 400 });
    }

    const preprocessingDebug = buildPreprocessingDebug(effectiveMealDescription);
    await patchDebugLog(base44, debugLogId, {
      currentStep: 'preprocessing_completed',
      debugNotes: { preprocessing: preprocessingDebug, dryRun: !!debugContext?.dryRun, testRun: !!debugContext?.testRun }
    });

    const personalCorrectionMemory = currentTraineeForMemory?.id ? [
      ...(await base44.entities.UserNutritionMemory.filter({ trainee_id: currentTraineeForMemory.id }) || []),
      ...(await base44.entities.UserFoodItem.filter({ trainee_id: currentTraineeForMemory.id, visibility: 'personal', active: true }) || [])
    ] : [];
    await patchDebugLog(base44, debugLogId, {
      currentStep: 'memory_lookup_completed',
      usedMemoryMatches: findUsedMemoryMatches(effectiveMealDescription, personalCorrectionMemory)
    });

    const deterministicEstimate = !photoUrl && !userFeedback ? buildKnownClearTextEstimate(effectiveMealDescription, personalCorrectionMemory) : null;
    if (deterministicEstimate) {
      const loggedResult = await finalizeDebugSuccess(base44, debugLogId, deterministicEstimate, 'deterministic_estimate_success');
      return Response.json(loggedResult);
    }

    if (isWeakTextMeal(effectiveMealDescription, photoUrl, userAnswers)) {
      const weakResult = buildClarificationOnlyMeal(effectiveMealDescription, 'weak_text_requires_clarification');
      const loggedResult = await finalizeDebugClarification(base44, debugLogId, weakResult, 'weak_text_requires_clarification');
      return Response.json(loggedResult);
    }

    // מצב חכם: טקסט רגיל נשאר קל ומהיר; תמונה/תיקון/תיאור מורכב מקבלים הקשר עמוק
    const isComplexMealAnalysis = !!photoUrl || !!userFeedback || effectiveMealDescription.length > 180;

    // === 1. חיפוש מרכיבים במאגר המזון הקיים ===
    let foodDbContext = '';
    try {
      if (isComplexMealAnalysis) {
        const keywords = effectiveMealDescription.split(/\s+/).filter(w => w.length > 2).slice(0, 6);
        const dbResults = [];
        const items = await base44.asServiceRole.entities.FoodItem.filter({ active: true });
        for (const kw of keywords) {
          const matches = items.filter(item =>
            item.name_he?.includes(kw) || item.normalized_name?.includes(kw)
          ).slice(0, 3);
          dbResults.push(...matches);
        }
        const uniqueItems = [...new Map(dbResults.map(i => [i.id, i])).values()].slice(0, 10);
        if (uniqueItems.length > 0) {
          foodDbContext = `\n=== מידע ממאגר המזון הקיים ===\n` +
            uniqueItems.map(item =>
              `${item.name_he}: ${item.per100_kcal} קל׳ | ${item.per100_protein}ח | ${item.per100_carbs}פ | ${item.per100_fat}ש (ל-100 גרם)`
            ).join('\n');
        }
      }
    } catch (e) {
      console.warn('Food DB lookup failed:', e.message);
    }

    // === 2. זיכרון תזונתי ומאגר אישי של המשתמש ===
    let personalHistoryContext = '';
    try {
      if (isComplexMealAnalysis) {
        const trainees = await base44.entities.Trainee.filter({ user_email: user.email });
        const trainee = trainees?.[0] || null;
        const recentMeals = await base44.entities.MealEntry.filter({ trainee_email: user.email });
        const profileRows = await base44.entities.TraineeNutritionProfile.filter({ trainee_email: user.email });
        const profile = profileRows?.[0] || null;
        const personalFoods = trainee?.id ? await base44.entities.UserFoodItem.filter({ trainee_id: trainee.id, visibility: 'personal', active: true }) : [];
        const coachFoods = trainee?.coach_email ? await base44.entities.UserFoodItem.filter({ coach_email: trainee.coach_email, visibility: 'coach', active: true }) : [];

        const frequentFoods = {};
        for (const meal of recentMeals.slice(-120)) {
          if (meal.food_name) frequentFoods[meal.food_name] = (frequentFoods[meal.food_name] || 0) + 1;
        }
        const topFoods = Object.entries(frequentFoods)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, count]) => {
            const sample = recentMeals.find(m => m.food_name === name);
            return `${name}: ${sample?.calories || '?'} קל׳, ${sample?.quantity || sample?.grams_equivalent || '?'} ${sample?.unit || 'גרם'} (${count}x)`;
          });

        const personalFoodLines = [...personalFoods, ...coachFoods]
          .sort((a, b) => {
            const aCorrection = a.source === 'ai_correction' ? 1 : 0;
            const bCorrection = b.source === 'ai_correction' ? 1 : 0;
            if (aCorrection !== bCorrection) return bCorrection - aCorrection;
            return (b.usage_count || 0) - (a.usage_count || 0);
          })
          .filter(isSafeMemoryNutrition)
          .slice(0, 16)
          .map(item => `${item.food_name}: ${item.calories_per_100g} קל׳ | ${item.protein_per_100g}ח | ${item.carbs_per_100g}פ | ${item.fat_per_100g}ש ל-100ג (${item.visibility}, מקור: ${item.source || 'regular'}, שימושים: ${item.usage_count || 0}${item.original_ai_name ? `, תיקון מ-${item.original_ai_name}` : ''})`);

        const correctionLines = (profile?.ai_mistakes_corrected || [])
          .slice(-8)
          .map(item => `אם נראה כמו "${item.original}" שקול תיקון ל"${item.corrected}" (${item.count || 1} תיקונים)`);

        personalHistoryContext = `\n=== זיכרון תזונתי אישי ארוך טווח ===\n` +
          `מזונות חוזרים: ${topFoods.join('\n') || 'אין עדיין'}\n` +
          `מאגר אישי/מאמן מועדף:\n${personalFoodLines.join('\n') || 'אין עדיין'}\n` +
          `דפוסי בוקר: ${(profile?.breakfast_patterns || []).join(', ')}\n` +
          `דפוסי צהריים: ${(profile?.lunch_patterns || []).join(', ')}\n` +
          `דפוסי ערב: ${(profile?.dinner_patterns || []).join(', ')}\n` +
          `מנות וכמויות מועדפות: ${JSON.stringify(profile?.preferred_portion_sizes || {})}\n` +
          `תיקוני AI קודמים:\n${correctionLines.join('\n') || 'אין עדיין'}`;
      }
    } catch (e) {
      console.warn('Personal nutrition memory lookup failed:', e.message);
    }

    const prompt = `
אתה מומחה תזונה ודיאטנית קלינית ישראלית מנוסה. תפקידך לנתח ארוחות בדיוק מרבי לפי ערכי USDA ומאגר נתוני תזונה ישראלי.

תיאור חופשי של המשתמש:
"${effectiveMealDescription}"

חשוב: המשתמש יכול לדבר בשפה טבעית ולא מסודרת. חלץ מתוך המשפט רק את פרטי האוכל החשובים: מאכלים, כמויות, יחידות, דרך הכנה, רטבים/שמן/תוספות. התעלם ממילים לא תזונתיות כמו "אתמול", "נראה לי", "אכלתי", "בצהריים", "בערך", "תנתח לי" — אלא אם הן עוזרות להבין את הארוחה.

${userFeedback ? `הערת משתמש לתיקון: "${userFeedback}"` : ''}
${userAnswers && Object.keys(userAnswers || {}).length ? `\n=== מצב המשך אחרי שאלת הבהרה ===\nזהו חישוב מחדש של הארוחה המקורית, לא ניתוח של התשובה הקצרה בלבד.\nטקסט הארוחה המקורי: "${mealContext?.originalMealText || effectiveMealDescription}"\nסוג ארוחה: ${mealType || mealContext?.selectedMealType || 'לא צוין'}\nמרכיבים שפוענחו קודם:\n${JSON.stringify(previousAnalysis?.ingredients || [], null, 2)}\nתשובות המשתמש לשאלות הבהרה:\n${JSON.stringify(userAnswers, null, 2)}\nחובה למזג את התשובות לתוך הארוחה המקורית ולהחזיר שוב את כל המרכיבים עם קלוריות ומאקרו.` : ''}
${photoUrl ? `\nצורף גם תמונה של הארוחה — השתמש בה כדי לוודא כמויות ומרכיבים.` : ''}
${foodDbContext}
${personalHistoryContext}

===  טבלת הפניה לכמויות נפוצות בישראל ===
- פרוסת לחם לבן = 25 גרם | לחם מחיטה מלאה = 28 גרם | לחם קל = 20 גרם
- ביצה קטנה = 45 גרם | בינונית = 55 גרם | גדולה = 65 גרם
- כף = 15 גרם (לחמאה, שמן, טחינה, חמאת בוטנים, ממרחים)
- כף = 30 גרם (לדגנים/קטניות מבושלים: אורז, פסטה, קינואה, כוסמת, עדשים וכו׳)
- כפית = 5 גרם
- קוטג' 3% — 100 גרם = 75 קל, 9.5ח, 4.4פ, 1.8ש
- גבינה לבנה 5% — 100 גרם = 97 קל, 8ח, 6פ, 3ש
- גבינה צהובה 28% — פרוסה/שמינית = 20 גרם = 72 קל, 5.4ח, 0.2פ, 5.6ש
- חלה קלה — פרוסה = 25 גרם = 70 קל, 3ח, 14פ, 0.8ש
- קטשופ — כף = 17 גרם = 18 קל, 0ח, 4.4פ, 0ש
- אבוקדו בינוני = 150 גרם חלק האוכל = 240 קל, 3ח, 13פ, 22ש
- בננה בינונית = 120 גרם (ללא קליפה) = 107 קל, 1ח, 27פ, 0.4ש
- תפוח עץ בינוני = 150 גרם = 78 קל, 0.4ח, 21פ, 0.2ש
- אורז מבושל — 100 גרם = 130 קל, 2.7ח, 28פ, 0.3ש
- פסטה מבושלת — 100 גרם = 158 קל, 5.8ח, 31פ, 0.9ש
- עוף חזה (מבושל) — 100 גרם = 165 קל, 31ח, 0פ, 3.6ש
- סלמון (אפוי) — 100 גרם = 206 קל, 20ח, 0פ, 13ש
- שמן זית / כל שמן — כף = 15 גרם = 120 קל, 0ח, 0פ, 14ש
- חלב 3% — 100 מ"ל = 61 קל, 3.2ח, 4.8פ, 3.3ש
- יוגורט 3% — 100 גרם = 61 קל, 3.5ח, 4.9פ, 3.3ש
- גרנולה — 100 גרם = 450 קל, 9ח, 65פ, 18ש (כ-60 גרם = מנה)
- חומוס מוכן — כף = 30 גרם = 55 קל, 2ח, 5פ, 3.2ש
- טחינה גולמית — כף = 15 גרם = 87 קל, 2.6ח, 3.2פ, 7.6ש

=== כללי ניתוח מחמירים ===
1. פרק כל ארוחה למרכיבים בודדים — גם שמן, מלח, תבלינים שמוסיפים קלוריות
2. אם לא צוינה כמות — השתמש בכמות הסבירה הנפוצה ביותר (לא המינימלית ולא המקסימלית)
3. אם יש מידע ממאגר המזון הקיים — תן לו עדיפות על פני ערכים כלליים
4. אם יש זיכרון תזונתי אישי/מאגר אישי — תן לו עדיפות לכמויות, שמות מזון ותיקוני AI קודמים. מקור ai_correction הוא העדיפות הגבוהה ביותר וחייב לגבור על ערכים גנריים/USDA/מאגר כללי.
5. אל תוסיף מרכיבים שלא הוזכרו (אלא אם הם חלק אינטגרלי — כמו שמן בטיגון)
 6. חשב סכום ידני של כל המרכיבים לאימות — הסכום חייב להיות עקבי
 7. confidence = "high" רק אם אתה באמת יודע מה המזון והכמות. "medium" אם חסר פרט אחד אך עדיין יש בסיס אמין. "low" אם זה טקסט חלש/כללי.
 8. אם הקלט הוא טקסט חלש כמו "חטיף", "חטיף 100 קלוריות", "קפה", "פסטה", "כריך", "עוגיה", "סלט", "שייק" בלי סוג/מותג/כמות/תמונה — אל תמציא קלוריות או מאקרו. החזר שאלות הבהרה בלבד עם calories/protein/carbs/fat = 0.
 9. אם הקלט כולל מאכלים מזוהים + כמויות מפורשות (לדוגמה: "4 פרוסות חלה קלה, 3 פרוסות גבינה צהובה 28%, 2 כפות קטשופ") — חובה לפצל לכל פריט ולהחזיר שורת מרכיב לכל פריט. אסור להשמיט פריט שני/שלישי/רביעי. אל תחסום ואל תבקש "לתת מספרים". confidence צריך להיות medium אם משתמשים בפרוסות סטנדרטיות.
 10. אל תחזיר can_analyze=false אם זיהית לפחות מזון אחד, אבל אם הביטחון נמוך באמת אין להציג ערכים סופיים לפני תשובות. החזר can_analyze=false רק אם אין שום מזון בתיאור או בתמונה, או שמדובר בטקסט שאינו קשור לאוכל בכלל.
 10. מנוע שאלות חכם: אל תשאל אם הביטחון גבוה מספיק. שאל רק אם התשובה משנה משמעותית קלוריות/מאקרו. high=0 שאלות, medium=עד שאלה אחת, low=עד 2 שאלות, ורק ארוחה לא ברורה במיוחד=עד 3 שאלות. לעולם לא יותר מ-3.
 11. שאלות חייבות להיות HIGH IMPACT בלבד: שמן/חמאה/טיגון, רטבים ומיונז, כמות חלבון, קלוריות נסתרות, גודל לחם/לחמנייה, תוספת סוכר, אחוזי חלב/גבינה, אי-ודאות במסעדה.
 12. אסור לשאול שאלות כלליות כמו "מה גודל המנה?", "אפשר עוד פרטים?", "מה בדיוק אכלת?" אם כבר יש תיאור ארוחה. שאל שאלה ספציפית בלבד, למשל: "השתמשת בשמן או חמאה?", "הטונה סוננה מהשמן?", "הקפה עם סוכר?".
 13. אם המשתמש כבר ענה על שאלה בתשובות קודמות — אל תשאל אותה שוב. העדף הנחות חכמות ומהירות על פני דיוק מדעי מושלם.

=== דוגמה לניתוח נכון ===
קלט: "שתי פרוסות לחם עם חמאת בוטנים וחצי בננה"
פלט:
- לחם לבן: 2 פרוסות = 50 גרם → 130 קל | 4ח | 26פ | 1.4ש
- חמאת בוטנים: כף = 16 גרם → 96 קל | 4ח | 3.5פ | 8.2ש
- בננה: חצי בינונית = 60 גרם → 53 קל | 0.6ח | 14פ | 0.2ש
- סה"כ: 279 קל | 8.6ח | 43.5פ | 9.8ש

החזר JSON בדיוק בפורמט הבא (ללא טקסט נוסף, ללא markdown):
{
  "can_analyze": true,
  "confidence": "high" | "medium" | "low",
  "uncertainty_note": "הערה על אי-ודאות אם יש, אחרת null",
  "meal_name": "שם קצר ותיאורי לארוחה בעברית",
  "total_calories": <מספר שלם>,
  "total_protein": <מספר עשרוני עם ספרה אחת>,
  "total_carbs": <מספר עשרוני עם ספרה אחת>,
  "total_fat": <מספר עשרוני עם ספרה אחת>,
  "ingredients": [
    {
      "name": "שם המרכיב בעברית",
      "quantity_grams": <מספר>,
      "quantity_display": "תיאור הכמות (לדוגמה: 2 פרוסות = 50 גרם)",
      "calories": <מספר שלם>,
      "protein": <מספר עשרוני>,
      "carbs": <מספר עשרוני>,
      "fat": <מספר עשרוני>
    }
  ],
  "clarifying_questions": [
    {
      "id": "short_id",
      "question": "שאלה קצרה בעברית",
      "options": [
        { "label": "תשובה מוצגת", "value": "ערך לחישוב" }
      ]
    }
  ]
}

אם can_analyze הוא false:
{
  "can_analyze": false,
  "reason": "סיבה ברורה בעברית"
}
`;

    const traceId = `meal-ai-${Date.now()}`;
    console.log('[AI_NUTRITION_TRACE]', traceId, 'raw_input:', effectiveMealDescription);

    await patchDebugLog(base44, debugLogId, {
      status: 'AI_REQUEST_SENT',
      currentStep: 'ai_prompt_created',
      aiPromptSent: prompt,
      clarificationAnswers: userAnswers || {},
      debugNotes: {
        preprocessing: preprocessingDebug,
        modelFunction: 'Core.InvokeLLM',
        requestAt: new Date().toISOString(),
        mergedContext: userAnswers && Object.keys(userAnswers || {}).length ? { originalMealText: mealContext?.originalMealText || effectiveMealDescription, userAnswers, previousIngredientCount: previousAnalysis?.ingredients?.length || 0 } : null
      }
    });

    const invokeParams = {
      prompt,
      response_json_schema: buildSchema()
    };
    if (photoUrl) {
      invokeParams.file_urls = [photoUrl];
    }
    console.log('[AI_NUTRITION_TRACE]', traceId, 'ai_request_payload:', JSON.stringify({ hasPrompt: true, hasPhoto: !!photoUrl, hasFeedback: !!userFeedback, hasAnswers: !!userAnswers }));

    let result;
    try {
      result = await base44.integrations.Core.InvokeLLM(invokeParams);
      console.log('[AI_NUTRITION_TRACE]', traceId, 'ai_response:', safeJsonStringify(result, 4000));
      await patchDebugLog(base44, debugLogId, {
        status: 'AI_RESPONSE_RECEIVED',
        currentStep: 'ai_response_received',
        aiRawResponse: safeJsonStringify(result, 120000),
        aiParsedJson: result
      });
    } catch (aiError) {
      console.warn('[AI_NUTRITION_TRACE]', traceId, 'fallback_activation:', aiError.message);
      const fallback = buildFallbackMeal(effectiveMealDescription, 'ai_invoke_failed');
      await patchDebugLog(base44, debugLogId, {
        status: 'ERROR',
        currentStep: 'ai_request_failed',
        errorMessage: aiError.message,
        errorStack: aiError.stack || '',
        aiRawResponse: '',
        debugNotes: {
          original_text: effectiveMealDescription,
          raw_input: safePlainObject(preservedRawInput),
          meal_type: preservedMealType,
          previous_parsed_segments: previousAnalysis?.ingredients || [],
          user_clarification_answers: userAnswers || {},
          fallback_parser_used: !!fallback.fallback_parser_used,
          parsed_segments: fallback.parsed_segments || []
        }
      });
      const loggedFallback = fallback.ingredients?.length && !fallback.clarifying_questions?.length
        ? await finalizeDebugSuccess(base44, debugLogId, fallback, 'fallback_parser_success')
        : await finalizeDebugClarification(base44, debugLogId, fallback, 'ai_invoke_failed');
      console.log('[AI_NUTRITION_TRACE]', traceId, 'final_rendered_object:', safeJsonStringify(loggedFallback, 4000));
      return Response.json(loggedFallback);
    }

    const safeResult = normalizeMealResult(result, effectiveMealDescription, userAnswers, previousAnalysis);
    console.log('[AI_NUTRITION_TRACE]', traceId, 'validation_stage:', JSON.stringify({ can_analyze: safeResult.can_analyze, estimated: safeResult.estimated, ingredientCount: safeResult.ingredients?.length || 0 }));
    console.log('[AI_NUTRITION_TRACE]', traceId, 'final_rendered_object:', safeJsonStringify(safeResult, 4000));

    const loggedSafeResult = safeResult.analysis_pending || safeResult.clarifying_questions?.length
      ? await finalizeDebugClarification(base44, debugLogId, safeResult, safeResult.fallback_reason || 'clarification_required')
      : await finalizeDebugSuccess(base44, debugLogId, safeResult, userAnswers && Object.keys(userAnswers || {}).length ? 'recalc_success' : 'parse_success');

    return Response.json(loggedSafeResult);
  } catch (error) {
    console.error('analyzeMealAI hard fallback error:', error);
    try {
      const base44 = createClientFromRequest(req);
      await patchDebugLog(base44, debugLogId, {
        status: 'ERROR',
        currentStep: 'outer_error',
        errorMessage: error.message,
        errorStack: error.stack || ''
      });
    } catch (_) {}
    const fallback = buildFallbackMeal(preservedOriginalText || 'ארוחה לא מזוהה', 'outer_error');
    return Response.json({
      ...fallback,
      debugLogId,
      raw_input: safePlainObject(preservedRawInput),
      meal_type: preservedMealType,
      previous_parsed_segments: preservedPreviousAnalysis?.ingredients || [],
      user_clarification_answers: preservedUserAnswers || {}
    });
  }
});

async function createDebugLog(base44, payload) {
  const now = new Date().toISOString();
  const created = await base44.entities.NutritionAnalysisDebugLog.create({
    createdAt: now,
    updatedAt: now,
    ...payload
  });
  return created?.id || null;
}

async function patchDebugLog(base44, id, patch) {
  if (!id) return null;
  return base44.entities.NutritionAnalysisDebugLog.update(id, {
    ...patch,
    updatedAt: new Date().toISOString()
  });
}

async function finalizeDebugSuccess(base44, id, result, stepNote) {
  const finalResult = { ...result, debugLogId: id };
  await patchDebugLog(base44, id, {
    status: stepNote === 'recalc_success' ? 'RECALC_SUCCESS' : 'PARSE_SUCCESS',
    currentStep: stepNote,
    parsedIngredients: result.ingredients || [],
    finalIngredients: result.ingredients || [],
    clarificationQuestions: result.clarifying_questions || [],
    finalCalories: Number(result.total_calories || 0),
    finalProtein: Number(result.total_protein || 0),
    finalCarbs: Number(result.total_carbs || 0),
    finalFat: Number(result.total_fat || 0),
    confidenceScore: result.confidence || 'medium',
    debugNotes: { finalCalculationSource: stepNote }
  });
  return finalResult;
}

async function finalizeDebugClarification(base44, id, result, reason) {
  const finalResult = { ...result, debugLogId: id };
  await patchDebugLog(base44, id, {
    status: 'CLARIFICATION_REQUIRED',
    currentStep: 'clarification_required',
    parsedIngredients: result.ingredients || [],
    finalIngredients: result.ingredients || [],
    clarificationQuestions: result.clarifying_questions || result.questions || [],
    finalCalories: Number(result.total_calories || 0),
    finalProtein: Number(result.total_protein || 0),
    finalCarbs: Number(result.total_carbs || 0),
    finalFat: Number(result.total_fat || 0),
    confidenceScore: result.confidence || 'low',
    debugNotes: { clarificationReason: reason }
  });
  return finalResult;
}

function buildPreprocessingDebug(input) {
  const normalizedText = normalizeFoodText(input);
  const segmentedFoodItems = splitFoodSegments(input);
  const possibleQuantities = String(input || '').match(/(\d+|אחת|שתיים|שתי|שלוש|ארבע|חצי)\s*(גרם|ג׳|פרוסות?|כפות?|כפיות?|יחידות?|כוס)?/g) || [];
  const detectedLanguage = /[א-ת]/.test(String(input || '')) ? 'he' : 'unknown';
  return { detectedLanguage, normalizedText, segmentedFoodItems, possibleQuantities };
}

function findUsedMemoryMatches(input, memory = []) {
  return splitFoodSegments(input).map(segment => {
    const match = findMemoryMatch(segment, memory);
    return match ? {
      segment,
      food_name: match.food_name,
      corrected_name: match.corrected_name,
      calories_per_100g: match.calories_per_100g,
      source: match.source,
      recordId: match.id
    } : null;
  }).filter(Boolean);
}

function safePlainObject(value) {
  try {
    return JSON.parse(safeJsonStringify(value, 0));
  } catch (_) {
    return null;
  }
}

function safeJsonStringify(value, maxLength = 120000) {
  const seen = new WeakSet();
  const text = JSON.stringify(value, (key, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }
    if (typeof val === 'function') return '[Function]';
    return val;
  });
  return maxLength ? text.slice(0, maxLength) : text;
}

function normalizeMealResult(result, input, userAnswers = {}, previousAnalysis = null) {
  if (!result || typeof result !== 'object') {
    return buildFallbackMeal(input, 'empty_or_invalid_ai_response');
  }

  if (result.confidence === 'low' && Object.keys(userAnswers || {}).length === 0 && !hasClearFoodQuantities(input)) {
    return buildClarificationOnlyMeal(input, 'low_confidence_ai_protection');
  }

  const ingredients = Array.isArray(result.ingredients) ? result.ingredients.filter(Boolean).map((ing) => ({
    name: ing?.name || ing?.food_name || 'מרכיב לא מזוהה',
    food_name: ing?.food_name || ing?.name || 'מרכיב לא מזוהה',
    quantity_text: ing?.quantity_text || ing?.quantity_display || 'כמות משוערת',
    quantity_grams: Number(ing?.quantity_grams || ing?.estimated_grams || 0),
    estimated_grams: Number(ing?.estimated_grams || ing?.quantity_grams || 0),
    quantity_display: ing?.quantity_display || ing?.quantity_text || 'כמות משוערת',
    calories: Number(ing?.calories || 0),
    protein: Number(ing?.protein || 0),
    carbs: Number(ing?.carbs || 0),
    fat: Number(ing?.fat || 0),
    confidence: ing?.confidence || result.confidence || 'medium',
    needs_clarification: ing?.needs_clarification === true,
    source_text_segment: ing?.source_text_segment || ''
  })) : [];

  if (!result.can_analyze || ingredients.length === 0) {
    const clearTextEstimate = buildKnownClearTextEstimate(input);
    if (clearTextEstimate) return clearTextEstimate;
    const previousIngredients = Array.isArray(previousAnalysis?.ingredients) ? previousAnalysis.ingredients : [];
    if (Object.keys(userAnswers || {}).length > 0 && previousIngredients.length > 0) {
      const previousTotals = previousIngredients.reduce((acc, ing) => ({
        calories: acc.calories + Number(ing?.calories || 0),
        protein: acc.protein + Number(ing?.protein || 0),
        carbs: acc.carbs + Number(ing?.carbs || 0),
        fat: acc.fat + Number(ing?.fat || 0)
      }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
      return {
        success: true,
        can_analyze: true,
        analysis_pending: false,
        estimated: true,
        needsClarification: false,
        confidence: 'medium',
        uncertainty_note: 'חושב מחדש לפי התשובה שלך והארוחה המקורית',
        meal_name: previousAnalysis?.meal_name || input || 'ארוחה משוערת',
        total_calories: Math.round(previousTotals.calories),
        total_protein: Math.round(previousTotals.protein * 10) / 10,
        total_carbs: Math.round(previousTotals.carbs * 10) / 10,
        total_fat: Math.round(previousTotals.fat * 10) / 10,
        ingredients: previousIngredients,
        foods: previousIngredients,
        clarifying_questions: [],
        questions: []
      };
    }
    return buildFallbackMeal(input, result?.reason || 'missing_food_details');
  }

  const totals = ingredients.reduce((acc, ing) => ({
    calories: acc.calories + (ing?.calories || 0),
    protein: acc.protein + (ing?.protein || 0),
    carbs: acc.carbs + (ing?.carbs || 0),
    fat: acc.fat + (ing?.fat || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const normalizedConfidence = hasClearFoodQuantities(input) && result.confidence === 'low' ? 'medium' : result.confidence;
  const aiCalories = Number(result.total_calories || 0);
  const useIngredientTotals = totals.calories > 0 && (!aiCalories || Math.abs(aiCalories - totals.calories) > totals.calories * 0.15);

  const finalQuestions = smartClarificationQuestions(result, input, userAnswers);
  const safeResult = {
    success: true,
    can_analyze: true,
    estimated: result.estimated === true || normalizedConfidence !== 'high',
    needsClarification: finalQuestions.length > 0,
    confidence: ['high', 'medium', 'low'].includes(normalizedConfidence) ? normalizedConfidence : 'medium',
    uncertainty_note: result.uncertainty_note || (normalizedConfidence === 'medium' ? 'ביטחון בינוני — לפי פרוסות סטנדרטיות' : 'הערכה בטוחה — ניתן לדייק עם תשובות לשאלות'),
    meal_name: result.meal_name || input || 'ארוחה משוערת',
    total_calories: Math.round(Number(useIngredientTotals ? totals.calories : (result.total_calories || totals.calories || 0))),
    total_protein: Math.round(Number(useIngredientTotals ? totals.protein : (result.total_protein || totals.protein || 0)) * 10) / 10,
    total_carbs: Math.round(Number(useIngredientTotals ? totals.carbs : (result.total_carbs || totals.carbs || 0)) * 10) / 10,
    total_fat: Math.round(Number(useIngredientTotals ? totals.fat : (result.total_fat || totals.fat || 0)) * 10) / 10,
    ingredients,
    foods: ingredients,
    clarifying_questions: finalQuestions,
    questions: finalQuestions
  };

  if (!safeResult.total_calories && totals.calories) {
    safeResult.total_calories = Math.round(totals.calories);
  }

  return safeResult;
}

function smartClarificationQuestions(result, input, userAnswers = {}) {
  const confidence = ['high', 'medium', 'low'].includes(result?.confidence) ? result.confidence : 'medium';
  const answeredKeys = new Set(Object.keys(userAnswers || {}).map(k => normalizeQuestionKey(k)));
  const rawQuestions = Array.isArray(result?.clarifying_questions) ? result.clarifying_questions : [];
  if (isGoodEnoughEstimate(input, result)) return [];

  const highImpactQuestions = buildHighImpactQuestions(input);
  const prioritized = [...highImpactQuestions, ...rawQuestions]
    .filter(q => q?.question && !answeredKeys.has(normalizeQuestionKey(q.id || q.question)))
    .filter(q => !isVagueQuestion(q))
    .filter(q => questionPriority(q, input) < 90)
    .sort((a, b) => questionPriority(a, input) - questionPriority(b, input));

  const unique = [];
  const seen = new Set();
  for (const question of prioritized) {
    const key = normalizeQuestionKey(question.id || question.question);
    const textKey = normalizeQuestionKey(question.question);
    if (seen.has(key) || seen.has(textKey)) continue;
    seen.add(key);
    seen.add(textKey);
    unique.push(question);
  }

  const requiredOmeletQuestion = unique.find(q => q.id === 'egg_oil_fat');
  if (confidence === 'high') return requiredOmeletQuestion ? [requiredOmeletQuestion] : [];
  if (confidence === 'medium') return unique.slice(0, 1);
  if (confidence === 'low') return unique.slice(0, 2);
  return unique.slice(0, 3);
}

function isGoodEnoughEstimate(input, result) {
  const text = String(input || '').toLowerCase();
  const hasExplicitQuantity = /\d+|חצי|כף|כפית|כוס|פרוס|משולש|גרם|מנה|אישית|קופסא|קופסה/.test(text);
  const simpleKnownMeal = /פיצה|pizza|קפה|coffee|חזה עוף|chicken breast|אורז|rice|לחם|bread|ביצה|egg|חביתה|טונה|חלה|לחמנ/.test(text);
  const hasHighImpactAmbiguity = (/בשמן|מטוגן|מיונז|חמאה|רוטב|מסעדה/.test(text) || /חביתה|אומלט|omelet/.test(text)) && !/ביצה\s*קשה|קשה|מבושל|סוננ|בלי שמן|ללא שמן|כפית|כף|לייט|דל/.test(text);
  const hasReasonableResult = Number(result?.total_calories || 0) > 0 && Array.isArray(result?.ingredients) && result.ingredients.length > 0;
  return hasExplicitQuantity && simpleKnownMeal && hasReasonableResult && !hasHighImpactAmbiguity;
}

function buildHighImpactQuestions(input) {
  const text = String(input || '').toLowerCase();
  const questions = [];

  if (/חביתה|אומלט|omelet/.test(text) && !/ביצה\s*קשה|קשה|מבושל|בלי שמן|ללא שמן|כפית|כף|חמאה/.test(text)) {
    questions.push({
      id: 'egg_oil_fat',
      question: 'החביתה הוכנה עם שמן או חמאה?',
      options: [{ label: 'בלי', value: 'none' }, { label: 'כפית', value: 'tsp_oil' }, { label: 'כף', value: 'tbsp_oil' }, { label: 'חמאה', value: 'butter' }]
    });
  }

  if (/טונה/.test(text) && /בשמן/.test(text) && !/סוננ|סיננ/.test(text)) {
    questions.push({
      id: 'tuna_oil_drained',
      question: 'הטונה סוננה מהשמן?',
      options: [{ label: 'כן, סוננה', value: 'drained' }, { label: 'חלקית', value: 'partial' }, { label: 'לא', value: 'with_oil' }]
    });
  }

  if (/מיונז/.test(text) && !/כפית|כף|לייט|דל/.test(text)) {
    questions.push({
      id: 'mayo_amount',
      question: 'כמה מיונז היה בערך?',
      options: [{ label: 'כפית', value: 'tsp' }, { label: 'כף', value: 'tbsp' }, { label: 'יותר', value: 'more' }]
    });
  }

  if (/קפה|coffee/.test(text) && !/סוכר|ללא סוכר|בלי סוכר|חלב|דל|רגיל/.test(text)) {
    questions.push({
      id: 'coffee_additions',
      question: 'הקפה היה עם סוכר או חלב?',
      options: [{ label: 'בלי תוספות', value: 'plain' }, { label: 'עם חלב', value: 'milk' }, { label: 'עם סוכר', value: 'sugar' }, { label: 'שניהם', value: 'both' }]
    });
  }

  if (/לחם|חלה|לחמנ/.test(text) && !/פרוס|אישית|לחמנייה|לחמניה|גרם/.test(text)) {
    questions.push({
      id: 'bread_size',
      question: 'הלחם היה פרוסות או לחמנייה מלאה?',
      options: [{ label: '2 פרוסות', value: '2_slices' }, { label: 'לחמנייה', value: 'roll' }, { label: 'חלה אישית', value: 'personal_challah' }]
    });
  }

  return questions;
}

function isVagueQuestion(question) {
  const text = String(question?.question || '').toLowerCase().trim();
  return /מה גודל המנה|אפשר עוד פרטים|מה בדיוק אכלת|איזה סוג אוכל|ספר לי עוד|גודל המנה\??$/.test(text);
}

function normalizeQuestionKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[?!.]/g, '')
    .replace(/\s+/g, '_')
    .trim();
}

function questionPriority(question, input) {
  const text = `${question?.id || ''} ${question?.question || ''}`.toLowerCase();
  const mealText = String(input || '').toLowerCase();
  const hasExplicitQuantity = /\d+|חצי|כף|כפית|כוס|פרוס|משולש|גרם|מנה/.test(mealText);

  if (/כמות|כמה|גודל|מנה|portion|size|יחיד|פרוס|משולש|גרם/.test(text)) {
    return hasExplicitQuantity ? 35 : 1;
  }
  if (/שמן|רוטב|מטוגן|טיגון|fry|oil|sauce|חמאה|מיונז/.test(text)) return 2;
  if (/אורז|פסטה|לחם|פחמימה|carb|תפוח אדמה|בטטה/.test(text)) return 3;
  if (/חלבון|עוף|בשר|דג|טונה|ביצה|protein/.test(text)) return 4;
  if (/תוספת|גבינה|אגוז|טחינה|אבוקדו/.test(text)) return 5;
  if (/מותג|סוג לחם|ירק|ירקות|קישוט|תבלין|זיתים|עגבניה|מלפפון|brand|garnish/.test(text)) return 99;
  return 20;
}

function hasClearFoodQuantities(input) {
  const text = String(input || '').toLowerCase();
  const hasQuantity = /\d+\s*(פרוס|כפ|גרם|יחיד|מנה|כוס)|אחת|שתיים|שתי|שלוש|ארבע|חצי|פרוסות|כפות|כפיות/.test(text);
  const knownFoods = (text.match(/חלה|לחם|גבינה|קטשופ|ביצה|טונה|יוגורט|קוטג|אורז|פסטה|עוף|סלט|מלפפון|עגבני/g) || []).length;
  return hasQuantity && knownFoods >= 1;
}

function normalizeFoodText(value) {
  return String(value || '').toLowerCase().replace(/[\u0591-\u05C7]/g, '').replace(/[^\p{L}\p{N}%]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function splitFoodSegments(input) {
  const text = String(input || '').replace(/\n+/g, ',').replace(/\s+,\s+/g, ',');
  const explicitSegments = [];
  const lower = text.toLowerCase();
  const saladMatch = lower.match(/סלט[^,;]*(?:\d+\s*(?:גרם|ג׳))?/);
  if (saladMatch) explicitSegments.push(saladMatch[0].trim());
  const eggMatch = lower.match(/(?:\d+\s*)?ביצה\s*(?:קשה|מבושלת)/);
  if (eggMatch) explicitSegments.push(eggMatch[0].trim());
  if (explicitSegments.length >= 2) return explicitSegments;
  const parts = text.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
  const segments = [];
  for (const part of parts.length ? parts : [text]) {
    const subParts = part.split(/\s+(?=(?:\d+|אחת|שתיים|שתי|שלוש|ארבע|חצי)\s+(?:פרוס|כפ|יחיד|גרם|מנה))/).map(s => s.trim()).filter(Boolean);
    segments.push(...subParts);
  }
  return segments;
}

function getHebrewQuantity(segment, fallback = 0) {
  const match = String(segment || '').toLowerCase().match(/(\d+|אחת|שתיים|שתי|שלוש|ארבע|חצי)\s*(פרוסה|פרוסות|כף|כפות|כפית|כפיות|יחידה|יחידות|גרם|ג׳|מנה)?/);
  if (!match) return { amount: fallback, unit: '' };
  const words = { אחת: 1, שתיים: 2, שתי: 2, שלוש: 3, ארבע: 4, חצי: 0.5 };
  return { amount: words[match[1]] || Number(match[1]) || fallback, unit: match[2] || '' };
}

function isSafeMemoryNutrition(item = {}) {
  const calories = Number(item.calories_per_100g || 0);
  const protein = Number(item.protein_per_100g || 0);
  const carbs = Number(item.carbs_per_100g || 0);
  const fat = Number(item.fat_per_100g || 0);
  return calories >= 0 && calories <= 950 && protein >= 0 && protein <= 110 && carbs >= 0 && carbs <= 110 && fat >= 0 && fat <= 110;
}

function findMemoryMatch(segment, memory = []) {
  const normalizedSegment = normalizeFoodText(segment);
  return (memory || [])
    .filter(item => isSafeMemoryNutrition(item) && (item?.source === 'ai_correction' || item?.corrected_name || item?.source_text_segment))
    .find(item => {
      const keys = [item.source_text_segment, item.corrected_name, item.food_name, item.original_ai_name].map(normalizeFoodText).filter(Boolean);
      return keys.some(key => normalizedSegment.includes(key) || key.includes(normalizedSegment));
    });
}

function ingredientFromMemory(segment, memoryItem) {
  const { amount, unit } = getHebrewQuantity(segment, Number(memoryItem?.corrected_quantity || memoryItem?.default_quantity || 1));
  const gramsPerUnit = unit.includes('פרוס') || unit.includes('יחיד') || !unit ? Number(memoryItem?.corrected_grams || memoryItem?.serving_size || memoryItem?.default_quantity || 100) / Math.max(Number(memoryItem?.corrected_quantity || 1), 1) : 1;
  const grams = unit.includes('גרם') || unit.includes('ג׳') ? amount : amount * gramsPerUnit;
  const factor = grams / 100;
  return {
    name: memoryItem.corrected_name || memoryItem.food_name,
    food_name: memoryItem.corrected_name || memoryItem.food_name,
    quantity_text: `${amount} ${unit || memoryItem.corrected_unit || memoryItem.unit || 'יחידה'}`.trim(),
    quantity_grams: Math.round(grams),
    estimated_grams: Math.round(grams),
    quantity_display: `${amount} ${unit || memoryItem.corrected_unit || memoryItem.unit || 'יחידה'} ≈ ${Math.round(grams)} גרם`,
    calories: Math.round((memoryItem.calories_per_100g || 0) * factor),
    protein: Math.round((memoryItem.protein_per_100g || 0) * factor * 10) / 10,
    carbs: Math.round((memoryItem.carbs_per_100g || 0) * factor * 10) / 10,
    fat: Math.round((memoryItem.fat_per_100g || 0) * factor * 10) / 10,
    confidence: 'high',
    needs_clarification: false,
    source_text_segment: segment,
    nutrition_source: 'personal_correction_memory'
  };
}

function knownIngredientFromSegment(segment) {
  const text = String(segment || '').toLowerCase();
  const { amount, unit } = getHebrewQuantity(text, 0);
  if (/סלט/.test(text) && /מלפפון|עגבני|ירקות/.test(text)) {
    const grams = amount && (unit.includes('גרם') || unit.includes('ג׳')) ? amount : 100;
    const factor = grams / 100;
    return { name: 'סלט ירקות', food_name: 'סלט ירקות', quantity_text: `${grams} גרם`, quantity_grams: grams, estimated_grams: grams, quantity_display: `${grams} גרם`, calories: Math.round(22 * factor), protein: Math.round(1 * factor * 10) / 10, carbs: Math.round(4 * factor * 10) / 10, fat: Math.round(0.2 * factor * 10) / 10, confidence: 'high', needs_clarification: false, source_text_segment: segment };
  }
  if (/ביצה\s*קשה|ביצה\s*מבושלת/.test(text)) {
    const eggs = amount || 1;
    return { name: 'ביצה קשה', food_name: 'ביצה קשה', quantity_text: `${eggs} יחידה`, quantity_grams: eggs * 55, estimated_grams: eggs * 55, quantity_display: `${eggs} יחידה ≈ ${eggs * 55} גרם`, calories: Math.round(78 * eggs), protein: Math.round(6.3 * eggs * 10) / 10, carbs: Math.round(0.6 * eggs * 10) / 10, fat: Math.round(5.3 * eggs * 10) / 10, confidence: 'high', needs_clarification: false, source_text_segment: segment };
  }
  if (!amount) return null;
  if (/חלה/.test(text)) {
    const grams = unit.includes('גרם') || unit.includes('ג׳') ? amount : amount * 25;
    const factor = grams / 25;
    return { name: 'חלה קלה', food_name: 'חלה קלה', quantity_text: `${amount} ${unit || 'פרוסות'}`, quantity_grams: grams, estimated_grams: grams, quantity_display: `${amount} ${unit || 'פרוסות'} ≈ ${grams} גרם`, calories: Math.round(70 * factor), protein: Math.round(3 * factor * 10) / 10, carbs: Math.round(14 * factor * 10) / 10, fat: Math.round(0.8 * factor * 10) / 10, confidence: 'medium', needs_clarification: false, source_text_segment: segment };
  }
  if (/גבינה\s*צהובה|גבינה/.test(text)) {
    const grams = unit.includes('גרם') || unit.includes('ג׳') ? amount : amount * 20;
    const factor = grams / 20;
    return { name: text.includes('28') ? 'גבינה צהובה 28%' : 'גבינה צהובה', food_name: text.includes('28') ? 'גבינה צהובה 28%' : 'גבינה צהובה', quantity_text: `${amount} ${unit || 'פרוסות'}`, quantity_grams: grams, estimated_grams: grams, quantity_display: `${amount} ${unit || 'פרוסות'} ≈ ${grams} גרם`, calories: Math.round(72 * factor), protein: Math.round(5.4 * factor * 10) / 10, carbs: Math.round(0.2 * factor * 10) / 10, fat: Math.round(5.6 * factor * 10) / 10, confidence: 'medium', needs_clarification: false, source_text_segment: segment };
  }
  if (/קטשופ/.test(text)) {
    const grams = unit.includes('גרם') || unit.includes('ג׳') ? amount : amount * 17;
    const factor = grams / 17;
    return { name: 'קטשופ', food_name: 'קטשופ', quantity_text: `${amount} ${unit || 'כפות'}`, quantity_grams: grams, estimated_grams: grams, quantity_display: `${amount} ${unit || 'כפות'} ≈ ${grams} גרם`, calories: Math.round(18 * factor), protein: 0, carbs: Math.round(4.4 * factor * 10) / 10, fat: 0, confidence: 'medium', needs_clarification: false, source_text_segment: segment };
  }
  return null;
}

function buildCommonIsraeliMealEstimate(input) {
  const text = String(input || '').toLowerCase();
  const ingredients = [];

  const avocadoMatch = text.match(/(\d+)\s*(?:גרם|ג׳)\s*אבוקדו/);
  if (avocadoMatch) {
    const grams = Number(avocadoMatch[1]);
    const factor = grams / 100;
    ingredients.push({ name: 'אבוקדו', food_name: 'אבוקדו', quantity_text: `${grams} גרם`, quantity_grams: grams, estimated_grams: grams, quantity_display: `${grams} גרם`, calories: Math.round(160 * factor), protein: Math.round(2 * factor * 10) / 10, carbs: Math.round(8.5 * factor * 10) / 10, fat: Math.round(14.7 * factor * 10) / 10, confidence: 'high', needs_clarification: false, source_text_segment: avocadoMatch[0] });
  }

  const eggMatch = text.match(/(\d+|אחת|שתיים|שתי|שלוש|ארבע)\s*(?:ביצי|ביצים|ביצה)\s*עין/);
  if (eggMatch) {
    const words = { אחת: 1, שתיים: 2, שתי: 2, שלוש: 3, ארבע: 4 };
    const eggs = words[eggMatch[1]] || Number(eggMatch[1]) || 1;
    ingredients.push({ name: 'ביצי עין', food_name: 'ביצי עין', quantity_text: `${eggs} יחידות`, quantity_grams: eggs * 55, estimated_grams: eggs * 55, quantity_display: `${eggs} ביצי עין ≈ ${eggs * 55} גרם`, calories: Math.round(90 * eggs), protein: Math.round(6.3 * eggs * 10) / 10, carbs: Math.round(0.6 * eggs * 10) / 10, fat: Math.round(7 * eggs * 10) / 10, confidence: 'medium', needs_clarification: false, source_text_segment: eggMatch[0] });
  }

  const whiteCheeseMatch = text.match(/(\d+)\s*כפיות\s*גבינה\s*לבנה(?:[^\d]|\s)*(?:5\s*%|5\s*אחוז)?/);
  if (whiteCheeseMatch) {
    const teaspoons = Number(whiteCheeseMatch[1]);
    const grams = teaspoons * 5;
    const factor = grams / 100;
    ingredients.push({ name: 'גבינה לבנה 5%', food_name: 'גבינה לבנה 5%', quantity_text: `${teaspoons} כפיות`, quantity_grams: grams, estimated_grams: grams, quantity_display: `${teaspoons} כפיות ≈ ${grams} גרם`, calories: Math.round(97 * factor), protein: Math.round(8 * factor * 10) / 10, carbs: Math.round(6 * factor * 10) / 10, fat: Math.round(3 * factor * 10) / 10, confidence: 'high', needs_clarification: false, source_text_segment: whiteCheeseMatch[0] });
  }

  const rollMatch = text.match(/(?:^|\s)(?:ו)?לחמנ(?:יה|ייה)|(?:^|\s)לחמנ(?:יה|ייה)/);
  if (rollMatch) {
    ingredients.push({ name: 'לחמנייה', food_name: 'לחמנייה', quantity_text: '1 יחידה', quantity_grams: 70, estimated_grams: 70, quantity_display: '1 לחמנייה רגילה ≈ 70 גרם', calories: 190, protein: 6, carbs: 36, fat: 2.2, confidence: 'medium', needs_clarification: false, source_text_segment: rollMatch[0].trim() });
  }

  if (ingredients.length < 2) return null;
  const totals = ingredients.reduce((acc, ing) => ({ calories: acc.calories + ing.calories, protein: acc.protein + ing.protein, carbs: acc.carbs + ing.carbs, fat: acc.fat + ing.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  return { success: true, can_analyze: true, analysis_pending: false, estimated: true, needsClarification: false, confidence: 'medium', uncertainty_note: 'חושב לפי כמויות סטנדרטיות למרכיבים שצוינו', meal_name: input || 'ארוחה משוערת', total_calories: Math.round(totals.calories), total_protein: Math.round(totals.protein * 10) / 10, total_carbs: Math.round(totals.carbs * 10) / 10, total_fat: Math.round(totals.fat * 10) / 10, ingredients, foods: ingredients, clarifying_questions: [], questions: [] };
}

function buildKnownClearTextEstimate(input, memory = []) {
  const commonEstimate = buildCommonIsraeliMealEstimate(input);
  if (commonEstimate) return commonEstimate;
  const segments = splitFoodSegments(input);
  const ingredients = [];
  const clarifyingQuestions = [];

  for (const segment of segments) {
    const memoryMatch = findMemoryMatch(segment, memory);
    const ingredient = memoryMatch ? ingredientFromMemory(segment, memoryMatch) : knownIngredientFromSegment(segment);
    if (ingredient) {
      ingredients.push(ingredient);
    } else if (/\d+|אחת|שתיים|שתי|שלוש|ארבע|חצי/.test(segment)) {
      clarifyingQuestions.push({ id: `clarify_${clarifyingQuestions.length + 1}`, question: `צריך לדייק את הפריט: ${segment}`, options: [{ label: 'מנה קטנה', value: 'small' }, { label: 'מנה רגילה', value: 'regular' }, { label: 'מנה גדולה', value: 'large' }] });
    }
  }

  if (ingredients.length === 0) return null;
  const totals = ingredients.reduce((acc, ing) => ({ calories: acc.calories + ing.calories, protein: acc.protein + ing.protein, carbs: acc.carbs + ing.carbs, fat: acc.fat + ing.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const hasClearSaladEgg = /סלט/.test(String(input || '').toLowerCase()) && /ביצה\s*קשה|ביצה\s*מבושלת/.test(String(input || '').toLowerCase());
  const questions = hasClearSaladEgg ? [] : (clarifyingQuestions.length ? clarifyingQuestions : [{ id: 'slice_thickness', question: 'הפרוסות היו דקות או רגילות?', options: [{ label: 'דקות', value: 'thin' }, { label: 'רגילות', value: 'regular' }, { label: 'עבות', value: 'thick' }] }]);
  return { success: true, can_analyze: true, analysis_pending: false, estimated: true, needsClarification: questions.length > 0, confidence: hasClearSaladEgg ? 'high' : (ingredients.some(i => i.confidence === 'high') ? 'high' : 'medium'), uncertainty_note: hasClearSaladEgg ? null : 'ביטחון בינוני — מבוסס על פרוסות סטנדרטיות', meal_name: hasClearSaladEgg ? 'סלט ירקות וביצה קשה' : (input || 'ארוחה משוערת'), total_calories: Math.round(totals.calories), total_protein: Math.round(totals.protein * 10) / 10, total_carbs: Math.round(totals.carbs * 10) / 10, total_fat: Math.round(totals.fat * 10) / 10, ingredients, foods: ingredients, clarifying_questions: questions, questions };
}

function isWeakTextMeal(input, photoUrl, userAnswers = {}) {
  if (photoUrl || Object.keys(userAnswers || {}).length > 0) return false;
  const text = String(input || '').toLowerCase().trim();
  const weakFood = /(^|\s)(חטיף|קפה|פסטה|כריך|עוגיה|עוגייה|סלט|שייק|snack|coffee|pasta|sandwich|cookie|salad|shake)(\s|$)/.test(text);
  if (!weakFood) return false;
  const hasStrongDetails = /מותג|חלבון|אנרגיה|גרנולה|טונה|עוף|ביצה|גבינה|יוגורט|חלב|סוכר|רוטב|טחינה|כף|כפית|גרם|מיליליטר|פרוס|לחמנ|בלי|ללא|עם/.test(text);
  const onlyCaloriesKnown = /\d+\s*(קל|קלור|cal)/.test(text) && text.length <= 30;
  return onlyCaloriesKnown || !hasStrongDetails;
}

function buildClarificationOnlyMeal(input, reason) {
  const questions = buildWeakTextQuestions(input);
  return {
    success: true,
    can_analyze: true,
    analysis_pending: true,
    estimated: false,
    needsClarification: true,
    fallback_reason: reason,
    original_text: input || '',
    raw_input: input || '',
    parser_stage_failed: reason || null,
    fallback_parser_used: false,
    parsed_segments: splitFoodSegments(input),
    reason_for_each_question: questions.map(q => ({ id: q.id, reason: 'text_truly_unclear_or_missing_food_detail' })),
    confidence: 'low',
    uncertainty_note: 'צריך עוד פרט קצר לפני שאחשב ערכים — כדי לא להמציא קלוריות ומאקרו',
    meal_name: input || 'ארוחה שדורשת הבהרה',
    total_calories: 0,
    total_protein: 0,
    total_carbs: 0,
    total_fat: 0,
    ingredients: [],
    foods: [],
    clarifying_questions: questions,
    questions
  };
}

function buildWeakTextQuestions(input) {
  const text = String(input || '').toLowerCase();
  if (/חטיף|snack/.test(text)) {
    return [
      { id: 'snack_type', question: 'איזה חטיף זה היה?', options: [{ label: 'חלבון', value: 'protein_bar' }, { label: 'אנרגיה', value: 'energy_bar' }, { label: 'גרנולה', value: 'granola_bar' }, { label: 'אחר', value: 'other' }] },
      { id: 'snack_brand', question: 'יש מותג או תמונה?', options: [{ label: 'יש מותג', value: 'has_brand' }, { label: 'אין מותג', value: 'no_brand' }, { label: 'אעלה תמונה', value: 'photo' }] }
    ];
  }
  if (/קפה|coffee/.test(text)) return [{ id: 'coffee_additions', question: 'הקפה היה עם סוכר או חלב?', options: [{ label: 'בלי תוספות', value: 'plain' }, { label: 'עם חלב', value: 'milk' }, { label: 'עם סוכר', value: 'sugar' }, { label: 'שניהם', value: 'both' }] }];
  if (/פסטה|pasta/.test(text)) return [{ id: 'pasta_amount', question: 'כמה פסטה הייתה בערך?', options: [{ label: 'כוס', value: 'cup' }, { label: 'צלחת רגילה', value: 'plate' }, { label: 'צלחת גדולה', value: 'large_plate' }] }, { id: 'pasta_sauce', question: 'איזה רוטב היה?', options: [{ label: 'עגבניות', value: 'tomato' }, { label: 'שמנת', value: 'cream' }, { label: 'שמן/פסטו', value: 'oil_pesto' }, { label: 'בלי', value: 'none' }] }];
  if (/כריך|sandwich/.test(text)) return [{ id: 'sandwich_bread', question: 'איזה לחם היה בכריך?', options: [{ label: '2 פרוסות', value: '2_slices' }, { label: 'לחמנייה', value: 'roll' }, { label: 'באגט', value: 'baguette' }] }, { id: 'sandwich_filling', question: 'מה היה החלבון/המילוי המרכזי?', options: [{ label: 'גבינה', value: 'cheese' }, { label: 'טונה', value: 'tuna' }, { label: 'ביצה', value: 'egg' }, { label: 'בשר/עוף', value: 'meat' }] }];
  if (/עוגיה|עוגייה|cookie/.test(text)) return [{ id: 'cookie_amount', question: 'כמה עוגיות היו?', options: [{ label: '1', value: '1' }, { label: '2', value: '2' }, { label: '3+', value: '3_plus' }] }, { id: 'cookie_type', question: 'איזה סוג?', options: [{ label: 'רגילה', value: 'regular' }, { label: 'שוקולד', value: 'chocolate' }, { label: 'חלבון', value: 'protein' }] }];
  if (/סלט|salad/.test(text)) return [{ id: 'salad_additions', question: 'היו רוטב או תוספות שומניות?', options: [{ label: 'בלי', value: 'none' }, { label: 'שמן', value: 'oil' }, { label: 'טחינה', value: 'tahini' }, { label: 'גבינה/אגוזים', value: 'cheese_nuts' }] }];
  if (/שייק|shake/.test(text)) return [{ id: 'shake_base', question: 'מה היה בסיס השייק?', options: [{ label: 'מים', value: 'water' }, { label: 'חלב', value: 'milk' }, { label: 'יוגורט', value: 'yogurt' }] }, { id: 'shake_protein', question: 'הייתה אבקת חלבון?', options: [{ label: 'לא', value: 'no' }, { label: 'סקופ אחד', value: 'one_scoop' }, { label: 'יותר', value: 'more' }] }];
  return [{ id: 'food_type', question: 'איזה סוג מזון זה היה?', options: [{ label: 'חלבון', value: 'protein' }, { label: 'פחמימה', value: 'carb' }, { label: 'שומן/רטוב', value: 'fatty' }, { label: 'אחר', value: 'other' }] }];
}

function buildRuleBasedFallbackMeal(input, reason) {
  const parsedSegments = splitFoodSegments(input);
  const ingredients = parsedSegments
    .map(segment => knownIngredientFromSegment(segment))
    .filter(Boolean);

  if (ingredients.length === 0) return null;

  const totals = ingredients.reduce((acc, ing) => ({
    calories: acc.calories + Number(ing.calories || 0),
    protein: acc.protein + Number(ing.protein || 0),
    carbs: acc.carbs + Number(ing.carbs || 0),
    fat: acc.fat + Number(ing.fat || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const questions = buildHighImpactQuestions(input).filter(q => !isVagueQuestion(q));

  return {
    success: true,
    can_analyze: true,
    analysis_pending: false,
    estimated: true,
    needsClarification: questions.length > 0,
    fallback_reason: reason,
    original_text: input || '',
    raw_input: input || '',
    parser_stage_failed: reason || null,
    fallback_parser_used: true,
    parsed_segments: parsedSegments,
    reason_for_each_question: questions.map(q => ({ id: q.id, reason: 'fallback_parser_high_impact_uncertainty_only' })),
    confidence: ingredients.length > 1 ? 'medium' : 'low',
    uncertainty_note: 'הופעל parser גיבוי עברי על הטקסט המקורי לאחר שגיאת AI',
    meal_name: /סלט/.test(String(input || '').toLowerCase()) && /ביצה/.test(String(input || '').toLowerCase()) ? 'סלט ירקות וביצה קשה' : (input || 'ארוחה משוערת'),
    total_calories: Math.round(totals.calories),
    total_protein: Math.round(totals.protein * 10) / 10,
    total_carbs: Math.round(totals.carbs * 10) / 10,
    total_fat: Math.round(totals.fat * 10) / 10,
    ingredients,
    foods: ingredients,
    clarifying_questions: questions,
    questions
  };
}

function buildFallbackMeal(input, reason) {
  const ruleFallback = buildRuleBasedFallbackMeal(input, reason);
  if (ruleFallback) return ruleFallback;

  const text = String(input || '').toLowerCase();
  const pizzaMatch = text.includes('pizza') || text.includes('פיצה');
  if (!pizzaMatch) {
    return buildClarificationOnlyMeal(input, reason || 'fallback_requires_clarification');
  }
  const sliceMatch = text.match(/(\d+)/);
  const quantity = sliceMatch ? Number(sliceMatch[1]) : 1;
  const caloriesPerUnit = 280;
  const proteinPerUnit = 12;
  const carbsPerUnit = 30;
  const fatPerUnit = 10;
  const name = `${quantity} משולשי פיצה`;
  const ingredient = {
    name: 'פיצה',
    quantity_grams: quantity * 100,
    quantity_display: `${quantity} משולשים — הערכה`,
    calories: Math.round(quantity * caloriesPerUnit),
    protein: Math.round(quantity * proteinPerUnit * 10) / 10,
    carbs: Math.round(quantity * carbsPerUnit * 10) / 10,
    fat: Math.round(quantity * fatPerUnit * 10) / 10
  };

  const questions = defaultQuestions(input);
  return {
    success: true,
    can_analyze: true,
    estimated: true,
    needsClarification: true,
    fallback_reason: reason,
    original_text: input || '',
    raw_input: input || '',
    parser_stage_failed: reason || null,
    fallback_parser_used: false,
    parsed_segments: splitFoodSegments(input),
    reason_for_each_question: questions.map(q => ({ id: q.id, reason: 'fallback_food_detected_but_high_impact_detail_missing' })),
    confidence: 'low',
    uncertainty_note: 'הופעלה הערכת גיבוי כדי לא לעצור את התהליך',
    meal_name: name,
    total_calories: ingredient.calories,
    total_protein: ingredient.protein,
    total_carbs: ingredient.carbs,
    total_fat: ingredient.fat,
    ingredients: [ingredient],
    foods: [ingredient],
    clarifying_questions: questions,
    questions
  };
}

function defaultQuestions(input) {
  const text = String(input || '').toLowerCase();
  if (text.includes('pizza') || text.includes('פיצה')) {
    return [
      { id: 'pizza_size', question: 'המשולשים היו בגודל רגיל או משפחתי?', options: [{ label: 'רגיל', value: 'regular' }, { label: 'משפחתי', value: 'family' }] }
    ];
  }
  return [
    { id: 'portion_size', question: 'מה היה גודל המנה?', options: [{ label: 'קטנה', value: 'small' }, { label: 'רגילה', value: 'regular' }, { label: 'גדולה', value: 'large' }] },
    { id: 'cooking_method', question: 'איך הוכן האוכל?', options: [{ label: 'אפוי', value: 'baked' }, { label: 'מבושל', value: 'cooked' }, { label: 'מטוגן', value: 'fried' }] }
  ];
}

function buildSchema() {
  return {
    type: 'object',
    properties: {
      can_analyze: { type: 'boolean' },
      confidence: { type: 'string' },
      uncertainty_note: { type: 'string' },
      reason: { type: 'string' },
      meal_name: { type: 'string' },
      total_calories: { type: 'number' },
      total_protein: { type: 'number' },
      total_carbs: { type: 'number' },
      total_fat: { type: 'number' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            quantity_grams: { type: 'number' },
            quantity_display: { type: 'string' },
            calories: { type: 'number' },
            protein: { type: 'number' },
            carbs: { type: 'number' },
            fat: { type: 'number' },
          }
        }
      },
      clarifying_questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            question: { type: 'string' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  value: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  };
}