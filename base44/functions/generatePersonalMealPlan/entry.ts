import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { preferences_id, trainee_id } = await req.json();

  // Load trainee + preferences by ID
  const [traineeList, prefsList] = await Promise.all([
    base44.asServiceRole.entities.Trainee.filter({ id: trainee_id }),
    base44.asServiceRole.entities.MealPlanPreferences.filter({ id: preferences_id })
  ]);

  const trainee = traineeList[0];
  const prefs = prefsList[0];

  if (!trainee || !prefs) {
    return Response.json({ error: 'Trainee or preferences not found' }, { status: 404 });
  }

  const dietaryMap = {
    protein_rich: 'עשירה בחלבון (40% חלבון, 30% פחמימות, 30% שומן)',
    low_carb: 'דלת פחמימות (35% חלבון, 20% פחמימות, 45% שומן)',
    balanced: 'מאוזנת (30% חלבון, 40% פחמימות, 30% שומן)',
    vegetarian: 'צמחונית מאוזנת (25% חלבון, 50% פחמימות, 25% שומן)',
    vegan: 'טבעונית מאוזנת (20% חלבון, 55% פחמימות, 25% שומן)'
  };

  const cookingMap = {
    short: 'הכנה מהירה עד 10 דקות לכל ארוחה',
    medium: 'הכנה בינונית עד 30 דקות לארוחה',
    long: 'הכנה מפורטת עד שעה לארוחה'
  };

  const goalDirection = prefs.weight_goal_kg > 0 ? `ירידה של ${prefs.weight_goal_kg} ק"ג` : `עלייה של ${Math.abs(prefs.weight_goal_kg)} ק"ג`;

  const alcoholMap = {
    never: 'לא שותה אלכוהול כלל',
    rarely: 'שותה לעיתים נדירות',
    '1-2_week': 'שותה 1-2 פעמים בשבוע',
    '3-4_week': 'שותה 3-4 פעמים בשבוע',
    daily: 'שותה כמעט כל יום'
  };

  const prompt = `
אתה דיאטן קליני מומחה המתמחה בתפריטים ישראליים.
בנה תפריט יומי מפורט ומדויק תזונתית בשפה העברית.

**נתוני המתאמן:**
- שם: ${trainee.full_name}
- גיל: ${trainee.birth_date ? Math.floor((new Date() - new Date(trainee.birth_date)) / (1000 * 60 * 60 * 24 * 365)) : 'לא ידוע'} שנים
- מין: ${trainee.gender === 'male' ? 'זכר' : 'נקבה'}
- גובה: ${trainee.height_cm} ס"מ
- משקל נוכחי: ${trainee.weight_kg} ק"ג
- רמת פעילות: ${trainee.activity_level || 'moderate'}
- יעד: ${trainee.goal || 'maintain'}

**העדפות תזונתיות:**
- מספר ארוחות ביום: ${prefs.meals_per_day}
- סגנון תזונה: ${dietaryMap[prefs.dietary_preference] || prefs.dietary_preference}
- מאכלים מועדפים: ${prefs.preferred_foods?.join(', ') || 'אין'}
- מאכלים שלא אוהב: ${prefs.disliked_foods?.join(', ') || 'אין'}
- מאכלים חובה בתפריט: ${prefs.mandatory_foods?.length ? prefs.mandatory_foods.join(', ') : 'אין'}
- מנות פינוק / צ'יט מותרות: ${prefs.cheat_meals?.length ? prefs.cheat_meals.join(', ') : 'אין'}
- אלרגיות: ${prefs.allergies?.join(', ') || 'אין'}
- זמן הכנה: ${cookingMap[prefs.cooking_time_preference] || 'בינוני'}
- אורח חיים/עבודה: ${prefs.activity_details || 'לא צוין'}
- אכילה מחוץ לבית: ${prefs.eating_out_times_per_week || 0} פעמים בשבוע${prefs.eating_out_times_per_week > 0 ? `, מומלץ ${prefs.eating_out_day_preference === 'post_workout' ? 'ביום שאחרי אימון' : 'בכל יום שמתאים'}` : ''}
- אלכוהול: ${alcoholMap[prefs.alcohol_frequency] || 'לא צוין'}

**יעד:**
- מטרה: ${goalDirection} תוך ${prefs.goal_timeline_weeks} שבועות
- יעד קלורי יומי: ${prefs.target_daily_calories} קלוריות
- יעד חלבון: ${prefs.target_protein_g}ג
- יעד פחמימות: ${prefs.target_carbs_g}ג
- יעד שומן: ${prefs.target_fat_g}ג

**הנחיות לבניית התפריט:**
1. כתוב ONLY מזון ישראלי נפוץ ומוכר
2. כל ארוחה חייבת לכלול 2-4 אפשרויות החלפה לכל פריט
3. ציין כמויות בגרמים ובתיאור מעשי (כוסות, יחידות, כפות)
4. חשב ערכים תזונתיים מדויקים לכל פריט
5. חלק את הקלוריות לפי: בוקר 25%, אמצע בוקר 10%, צהריים 35%, אחה"צ 10%, ערב 20%
6. שמות ארוחות בעברית בלבד
7. הוסף הערות מועילות לכל ארוחה
8. אם יש מאכלים חובה — שלב אותם בתפריט היומי
9. אם יש מנות פינוק — שלב אחת מהן כארוחת ביניים או קינוח שבועי, עם חישוב קלורי מדויק
10. אם המתאמן אוכל בחוץ — הכן ארוחת צהריים גמישה עם הנחיות לאכילה במסעדה (העדף גריל/סלטים)
11. אלכוהול: אם המתאמן שותה — הוסף הערה ב-ai_notes על השפעה קלורית ועצות
12. אכילה בחוץ מומלצת ביום שאחרי אימון כאשר הגוף זקוק לפחמימות לשיקום

החזר JSON בלבד, ללא טקסט נוסף.
`;

  const schema = {
    type: "object",
    properties: {
      plan_name: { type: "string" },
      ai_notes: { type: "string" },
      daily_calories: { type: "number" },
      daily_protein: { type: "number" },
      daily_carbs: { type: "number" },
      daily_fat: { type: "number" },
      meals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            meal_name: { type: "string" },
            meal_time: { type: "string" },
            meal_calories: { type: "number" },
            meal_protein: { type: "number" },
            meal_carbs: { type: "number" },
            meal_fat: { type: "number" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  food_item: { type: "string" },
                  quantity_grams: { type: "number" },
                  quantity_description: { type: "string" },
                  calories: { type: "number" },
                  protein: { type: "number" },
                  carbs: { type: "number" },
                  fat: { type: "number" },
                  alternatives: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        food_item: { type: "string" },
                        quantity_grams: { type: "number" },
                        quantity_description: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: schema,
    model: 'gpt_5_5'
  });

  // InvokeLLM wraps the JSON response in a "response" key
  const planData = result?.response || result;

  if (!planData || !planData.meals || planData.meals.length === 0) {
    return Response.json({ error: 'AI did not return a valid meal plan', debug: result }, { status: 500 });
  }

  // Deactivate old plans
  const oldPlans = await base44.asServiceRole.entities.PersonalMealPlan.filter({
    trainee_id,
    is_active: true
  });
  for (const plan of oldPlans) {
    await base44.asServiceRole.entities.PersonalMealPlan.update(plan.id, { is_active: false });
  }

  // Save new plan
  const newPlan = await base44.asServiceRole.entities.PersonalMealPlan.create({
    trainee_id,
    trainee_email: trainee.user_email,
    preferences_id,
    is_active: true,
    ...planData
  });

  // Update preferences with last plan id
  await base44.asServiceRole.entities.MealPlanPreferences.update(preferences_id, {
    last_generated_plan_id: newPlan.id
  });

  return Response.json({ success: true, plan: newPlan });
});