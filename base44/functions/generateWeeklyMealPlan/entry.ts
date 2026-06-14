import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function callMealPlanLLM(base44, systemPrompt, userPrompt) {
  return await base44.asServiceRole.integrations.Core.InvokeLLM({
    model: 'gpt_5_5',
    prompt: `${systemPrompt}\n\n${userPrompt}`,
    response_json_schema: {
      type: 'object',
      properties: {
        meals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              meal_name: { type: 'string' },
              meal_time: { type: 'string' },
              meal_calories: { type: 'number' },
              meal_protein: { type: 'number' },
              meal_carbs: { type: 'number' },
              meal_fat: { type: 'number' },
              is_restaurant: { type: 'boolean' },
              restaurant_notes: { type: 'string' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    food_item: { type: 'string' },
                    quantity_grams: { type: 'number' },
                    quantity_description: { type: 'string' },
                    calories: { type: 'number' },
                    protein: { type: 'number' },
                    carbs: { type: 'number' },
                    fat: { type: 'number' },
                    alternatives: { type: 'array', items: { type: 'object' } }
                  }
                }
              }
            }
          }
        }
      }
    }
  });
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { preferences_id, trainee_id } = await req.json();

  const [trainee, prefs] = await Promise.all([
    base44.asServiceRole.entities.Trainee.get(trainee_id),
    base44.asServiceRole.entities.MealPlanPreferences.get(preferences_id)
  ]);

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

  const eatOutDays = prefs.eating_out_times_per_week || 0;
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const mealsPerDay = prefs.meals_per_day || 4;
  const targetCal = prefs.target_daily_calories || trainee.target_calories || 2000;
  const targetProtein = prefs.target_protein_g || trainee.target_protein || 150;
  const targetCarbs = prefs.target_carbs_g || trainee.target_carbs || 200;
  const targetFat = prefs.target_fat_g || trainee.target_fat || 65;

  const mealStructure = mealsPerDay === 3
    ? [
        { name: 'ארוחת בוקר', time: '08:00', pct: 30 },
        { name: 'ארוחת צהריים', time: '13:00', pct: 40 },
        { name: 'ארוחת ערב', time: '19:00', pct: 30 }
      ]
    : mealsPerDay === 5
    ? [
        { name: 'ארוחת בוקר', time: '07:30', pct: 20 },
        { name: 'ביניים בוקר', time: '10:30', pct: 10 },
        { name: 'ארוחת צהריים', time: '13:00', pct: 35 },
        { name: 'ביניים אחה"צ', time: '16:00', pct: 10 },
        { name: 'ארוחת ערב', time: '19:30', pct: 25 }
      ]
    : [
        { name: 'ארוחת בוקר', time: '08:00', pct: 25 },
        { name: 'ביניים', time: '11:00', pct: 10 },
        { name: 'ארוחת צהריים', time: '13:30', pct: 40 },
        { name: 'ארוחת ערב', time: '19:00', pct: 25 }
      ];

  const systemPrompt = `אתה דיאטן קליני מוסמך. תמיד מחזיר JSON תקני בלבד בעברית.
מידע על המתאמן:
- שם: ${trainee.full_name} | מין: ${trainee.gender === 'male' ? 'זכר' : 'נקבה'} | משקל: ${trainee.weight_kg}ק"ג
- יעד יומי: ${targetCal} קק"ל | חלבון ${targetProtein}ג | פחמימות ${targetCarbs}ג | שומן ${targetFat}ג
- סגנון תזונה: ${dietaryMap[prefs.dietary_preference] || 'מאוזנת'}
- מזונות מועדפים: ${prefs.preferred_foods?.join(', ') || 'אין'}
- מזונות לא רצויים: ${prefs.disliked_foods?.join(', ') || 'אין'}
- מזונות חובה: ${prefs.mandatory_foods?.join(', ') || 'אין'}
- אלרגיות: ${prefs.allergies?.join(', ') || 'אין'}
- צ'יט מילס: ${prefs.cheat_meals?.join(', ') || 'אין'}

פורמט JSON חובה לכל יום:
{
  "meals": [
    {
      "meal_name": "שם הארוחה",
      "meal_time": "HH:MM",
      "meal_calories": 000,
      "meal_protein": 00,
      "meal_carbs": 00,
      "meal_fat": 00,
      "is_restaurant": false,
      "restaurant_notes": "",
      "items": [
        {
          "food_item": "שם המזון",
          "quantity_grams": 000,
          "quantity_description": "תיאור כמות",
          "calories": 000,
          "protein": 00,
          "carbs": 00,
          "fat": 00,
          "alternatives": []
        }
      ]
    }
  ]
}`;

  const generateDay = async (dayIndex) => {
    const dayName = dayNames[dayIndex];
    const isEatingOut = dayIndex < eatOutDays;

    const mealsList = mealStructure.map((m, i) => {
      const cal = Math.round(targetCal * m.pct / 100);
      const prot = Math.round(targetProtein * m.pct / 100);
      const carb = Math.round(targetCarbs * m.pct / 100);
      const fat = Math.round(targetFat * m.pct / 100);
      const restaurantNote = isEatingOut && m.name === 'ארוחת צהריים'
        ? ` — ארוחה במסעדה: is_restaurant=true, restaurant_notes עם המלצות לבחירה בריאה`
        : '';
      return `ארוחה ${i + 1}: "${m.name}" | שעה: ${m.time} | ${cal} קק"ל, ${prot}ג חלבון, ${carb}ג פח, ${fat}ג שומן${restaurantNote}`;
    }).join('\n');

    const userPrompt = `צור תפריט ליום ${dayName} עם בדיוק ${mealsPerDay} ארוחות:
${mealsList}

כל ארוחה תכיל 2-4 פריטי מזון ריאליים עם ערכים תזונתיים מדויקים.
החזר JSON בלבד עם מפתח "meals" המכיל מערך של ${mealsPerDay} ארוחות.`;

    const result = await callMealPlanLLM(base44, systemPrompt, userPrompt);

    const mealsRaw = Array.isArray(result.meals) ? result.meals : [];

    // Map meals to mealStructure slots
    const fixedMeals = mealStructure.map((mealDef, i) => {
      const existing = mealsRaw.find(m =>
        m.meal_name && (m.meal_name.includes(mealDef.name) || mealDef.name.includes(m.meal_name))
      ) || mealsRaw[i];

      if (existing && Array.isArray(existing.items) && existing.items.length > 0) {
        return { ...existing, meal_name: mealDef.name, meal_time: mealDef.time };
      }

      const cal = Math.round(targetCal * mealDef.pct / 100);
      return {
        meal_name: mealDef.name,
        meal_time: mealDef.time,
        meal_calories: cal,
        meal_protein: Math.round(targetProtein * mealDef.pct / 100),
        meal_carbs: Math.round(targetCarbs * mealDef.pct / 100),
        meal_fat: Math.round(targetFat * mealDef.pct / 100),
        is_restaurant: false,
        restaurant_notes: '',
        items: [{ food_item: 'להשלמה', quantity_grams: 100, quantity_description: 'גרם', calories: cal, protein: 0, carbs: 0, fat: 0, alternatives: [] }]
      };
    });

    return {
      day_name: dayName,
      day_index: dayIndex,
      is_eating_out_day: isEatingOut,
      daily_calories: targetCal,
      daily_protein: targetProtein,
      daily_carbs: targetCarbs,
      daily_fat: targetFat,
      meals: fixedMeals
    };
  };

  // Generate all 7 days in parallel
  let weeklyDays;
  try {
    weeklyDays = await Promise.all(dayNames.map((_, i) => generateDay(i)));
    console.log('[generateWeeklyMealPlan] Done:', weeklyDays.map(d => ({ day: d.day_name, meals: d.meals?.length })));
  } catch (err) {
    console.error('[generateWeeklyMealPlan] Error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }

  // Deactivate old plans
  const oldPlans = await base44.asServiceRole.entities.PersonalMealPlan.filter({ trainee_id, is_active: true });
  await Promise.all(oldPlans.map(plan =>
    base44.asServiceRole.entities.PersonalMealPlan.update(plan.id, { is_active: false })
  ));

  const newPlan = await base44.asServiceRole.entities.PersonalMealPlan.create({
    trainee_id,
    trainee_email: trainee.user_email,
    preferences_id,
    is_active: true,
    is_weekly: true,
    weekly_days: weeklyDays,
    daily_calories: targetCal,
    daily_protein: targetProtein,
    daily_carbs: targetCarbs,
    daily_fat: targetFat,
    meals: weeklyDays[0]?.meals || []
  });

  await base44.asServiceRole.entities.MealPlanPreferences.update(preferences_id, {
    last_generated_plan_id: newPlan.id
  });

  return Response.json({ success: true, plan: newPlan });
});