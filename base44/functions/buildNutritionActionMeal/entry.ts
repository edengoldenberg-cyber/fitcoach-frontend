import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function mealTypeByHour() {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(new Date()));
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

function getTargets(targetRows, trainee) {
  const latest = targetRows?.[0] || null;
  return {
    calories: Number(latest?.daily_calories || trainee?.target_calories || 2000),
    protein: Number(latest?.daily_protein_g || trainee?.target_protein || 150),
    carbs: Number(latest?.daily_carbs_g || trainee?.target_carbs || 200),
    fat: Number(latest?.daily_fat_g || trainee?.target_fat || 70)
  };
}

function sumMeals(meals) {
  return meals.reduce((acc, meal) => ({
    calories: acc.calories + (Number(meal.calories) || 0),
    protein: acc.protein + (Number(meal.protein) || 0),
    carbs: acc.carbs + (Number(meal.carbs) || 0),
    fat: acc.fat + (Number(meal.fat) || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { trainee_email, meal_type, intent = 'build_meal', selected_date } = await req.json();
    if (!trainee_email) return Response.json({ error: 'Missing trainee_email' }, { status: 400 });

    const today = selected_date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    const trainees = await base44.entities.Trainee.filter({ user_email: trainee_email });
    const trainee = trainees[0];
    if (!trainee) return Response.json({ error: 'Trainee not found' }, { status: 404 });

    const [todayMeals, targetRows, recentFoods, savedMeals, profileRows, personalFoods] = await Promise.all([
      base44.entities.MealEntry.filter({ trainee_email, date: today }),
      base44.entities.NutritionTargets.filter({ trainee_email }, '-updated_at', 1).catch(() => []),
      base44.entities.UserRecentFoods.filter({ trainee_email }).catch(() => []),
      base44.entities.UserSavedMeals.filter({ trainee_email }).catch(() => []),
      base44.entities.TraineeNutritionProfile.filter({ trainee_email }).catch(() => []),
      trainee?.id ? base44.entities.UserFoodItem.filter({ trainee_id: trainee.id, visibility: 'personal', active: true }).catch(() => []) : []
    ]);

    const targets = getTargets(targetRows, trainee);
    const totals = sumMeals(todayMeals);
    const remaining = {
      calories: Math.max(180, Math.round(targets.calories - totals.calories)),
      protein: Math.max(10, Math.round((targets.protein - totals.protein) * 10) / 10),
      carbs: Math.max(10, Math.round((targets.carbs - totals.carbs) * 10) / 10),
      fat: Math.max(5, Math.round((targets.fat - totals.fat) * 10) / 10)
    };
    const finalMealType = meal_type || mealTypeByHour();
    const profile = profileRows[0] || {};
    const favoriteNames = [
      ...recentFoods.slice(0, 8).map((f) => f.food_name),
      ...savedMeals.slice(0, 3).map((m) => m.meal_name),
      ...personalFoods.slice(0, 8).map((f) => f.food_name)
    ].filter(Boolean);

    if (favoriteNames.length < 2 && todayMeals.length < 2) {
      return Response.json({
        not_enough_data: true,
        message: 'אין מספיק נתונים עדיין — נלמד אותך בימים הקרובים.',
        remaining,
        meal_type: finalMealType
      });
    }

    const targetCalories = intent === 'snack' ? Math.min(300, remaining.calories) : Math.min(650, Math.max(300, remaining.calories));
    const targetProtein = intent === 'protein_boost' ? Math.max(25, Math.min(45, remaining.protein)) : Math.min(40, Math.max(15, remaining.protein));

    const prompt = `
אתה מאמן תזונה אישי. בנה ארוחה אחת בעברית בלבד לפי הנתונים האמיתיים.
סוג ארוחה: ${finalMealType}
כוונה: ${intent}
נותר להיום: ${remaining.calories} קלוריות, ${remaining.protein}g חלבון, ${remaining.carbs}g פחמימות, ${remaining.fat}g שומן.
יעד לארוחה הזו: בערך ${targetCalories} קלוריות ו-${targetProtein}g חלבון.
מאכלים שחוזרים/מועדפים/שמורים: ${favoriteNames.slice(0, 15).join(', ')}.
מאכלים שנמחקו/לא מתאימים: ${(profile.foods_deleted_often || []).join(', ') || 'אין'}.
תיקוני AI קודמים: ${(profile.ai_mistakes_corrected || []).slice(0, 5).map((x) => `${x.original}->${x.corrected}`).join(', ') || 'אין'}.

החזר JSON קצר בלבד. אל תמציא נתונים רפואיים. השתמש במאכלים מוכרים וזמינים בישראל.
    `.trim();

    const response = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          meal_name: { type: 'string' },
          meal_type: { type: 'string' },
          explanation: { type: 'string' },
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                food_name: { type: 'string' },
                quantity: { type: 'number' },
                unit: { type: 'string' },
                grams: { type: 'number' },
                calories: { type: 'number' },
                protein: { type: 'number' },
                carbs: { type: 'number' },
                fat: { type: 'number' }
              },
              required: ['food_name', 'quantity', 'unit', 'grams', 'calories', 'protein', 'carbs', 'fat']
            }
          },
          totals: {
            type: 'object',
            properties: {
              calories: { type: 'number' },
              protein: { type: 'number' },
              carbs: { type: 'number' },
              fat: { type: 'number' }
            },
            required: ['calories', 'protein', 'carbs', 'fat']
          }
        },
        required: ['meal_name', 'meal_type', 'explanation', 'ingredients', 'totals']
      }
    });

    return Response.json({ ...response, meal_type: response.meal_type || finalMealType, remaining_used: remaining, generated_at: new Date().toISOString() });
  } catch (error) {
    console.error('Error in buildNutritionActionMeal:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});