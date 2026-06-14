import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS = { breakfast: 'ארוחת בוקר', lunch: 'ארוחת צהריים', dinner: 'ארוחת ערב', snack: 'נשנוש' };

function israelDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(date);
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sumMeals(meals) {
  return meals.reduce((acc, meal) => ({
    calories: acc.calories + (Number(meal.calories) || 0),
    protein: acc.protein + (Number(meal.protein) || 0),
    carbs: acc.carbs + (Number(meal.carbs) || 0),
    fat: acc.fat + (Number(meal.fat) || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function round(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function repeatedFoods(meals) {
  const counts = {};
  meals.forEach((meal) => {
    const name = (meal.food_name || '').trim();
    if (name) counts[name] = (counts[name] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
}

function getTargets(targetRows, trainee) {
  const latest = targetRows?.[0] || null;
  return {
    calories: Number(latest?.daily_calories || trainee?.target_calories || 2000),
    protein: Number(latest?.daily_protein_g || trainee?.target_protein || 150),
    carbs: Number(latest?.daily_carbs_g || trainee?.target_carbs || 200),
    fat: Number(latest?.daily_fat_g || trainee?.target_fat || 70),
    water_ml: Number(latest?.daily_water_ml || trainee?.target_water_ml || 3000),
    hasNutritionTargets: !!latest
  };
}

function buildHydrationPlan(current, target) {
  const remaining = Math.max(0, target - current);
  const now = new Date();
  const israelHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(now));
  const hoursLeft = Math.max(1, 22 - israelHour);
  const split = Math.min(500, Math.max(250, Math.ceil(remaining / Math.max(1, Math.ceil(hoursLeft / 2)) / 50) * 50));
  return remaining > 0
    ? `נשארו לך ${remaining} מ״ל. שתה ${Math.min(500, remaining)} מ״ל עכשיו, ועוד ${split} מ״ל כל כשעתיים.`
    : 'עמדת ביעד המים להיום. שמור על שתייה קלה עד הערב.';
}

function card(id, type, title, insight, why, action, actions) {
  return { id, type, title, insight, why, action, actions };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { trainee_email } = await req.json();
    if (!trainee_email) return Response.json({ error: 'Missing trainee_email' }, { status: 400 });

    const today = israelDateString();
    const windowStart = addDays(today, -6);
    const trainees = await base44.entities.Trainee.filter({ user_email: trainee_email });
    const trainee = trainees[0];
    if (!trainee) return Response.json({ error: 'Trainee not found' }, { status: 404 });

    const [allMeals, allWater, targetRows, recentFoods, savedMeals, profileRows] = await Promise.all([
      base44.entities.MealEntry.filter({ trainee_email }),
      base44.entities.WaterEntry.filter({ trainee_email }),
      base44.entities.NutritionTargets.filter({ trainee_email }, '-updated_at', 1).catch(() => []),
      base44.entities.UserRecentFoods.filter({ trainee_email }).catch(() => []),
      base44.entities.UserSavedMeals.filter({ trainee_email }).catch(() => []),
      base44.entities.TraineeNutritionProfile.filter({ trainee_email }).catch(() => [])
    ]);

    const dates = Array.from({ length: 7 }, (_, index) => addDays(windowStart, index));
    const meals = allMeals.filter((meal) => meal.date >= windowStart && meal.date <= today);
    const waterLogs = allWater.filter((entry) => entry.date >= windowStart && entry.date <= today);
    const todayMeals = meals.filter((meal) => meal.date === today);
    const todayWater = waterLogs.filter((entry) => entry.date === today).reduce((sum, entry) => sum + (Number(entry.amount_ml) || 0), 0);
    const targets = getTargets(targetRows, trainee);

    const mealsByDate = Object.fromEntries(dates.map((date) => [date, meals.filter((meal) => meal.date === date)]));
    const daysWithMeals = dates.filter((date) => mealsByDate[date].length > 0);
    const total = sumMeals(meals);
    const todayTotal = sumMeals(todayMeals);
    const analyzedDays = daysWithMeals.length;
    const divisor = Math.max(1, analyzedDays);
    const averages = {
      calories: Math.round(total.calories / divisor),
      protein: Math.round(total.protein / divisor),
      carbs: Math.round(total.carbs / divisor),
      fat: Math.round(total.fat / divisor)
    };

    const skipped = {};
    MEAL_TYPES.forEach((type) => skipped[type] = dates.filter((date) => !mealsByDate[date].some((meal) => meal.meal_type === type)).length);
    const proteinLowDays = dates.filter((date) => sumMeals(mealsByDate[date]).protein < targets.protein * 0.85).length;
    const mealCalories = MEAL_TYPES.map((type) => ({ type, calories: meals.filter((meal) => meal.meal_type === type).reduce((sum, meal) => sum + (Number(meal.calories) || 0), 0) }));
    const dominantMeal = mealCalories.sort((a, b) => b.calories - a.calories)[0];
    const repeatList = repeatedFoods(meals);
    const missing = [];
    if (meals.length < 5 || analyzedDays < 3) missing.push('אין מספיק רישומי אוכל ב־7 הימים האחרונים');
    if (!targets.hasNutritionTargets) missing.push('לא נמצאו NutritionTargets עדכניים');
    if (waterLogs.length === 0) missing.push('אין רישומי מים ב־7 הימים האחרונים');

    const cards = [];
    if (missing.length && meals.length < 5) {
      cards.push(card('not-enough-data', 'info', 'אין מספיק נתונים עדיין', 'נלמד אותך בימים הקרובים לפי הארוחות והמים שתזין.', `חסר: ${missing.join(', ')}.`, 'רשום היום 2–3 ארוחות ומים כדי לקבל המלצות אישיות.', ['ignore']));
    } else {
      if (proteinLowDays >= 3) {
        const gap = Math.max(0, targets.protein - averages.protein);
        cards.push(card('protein-gap', 'protein', 'חסר חלבון השבוע', `ב־${proteinLowDays} מתוך 7 ימים היית מתחת ליעד החלבון. חסרים לך בממוצע ${gap}g חלבון ביום.`, 'חלבון עוזר לשובע, התאוששות ושמירה על מסת שריר.', 'בחר השלמת חלבון לארוחה הקרובה.', ['build_meal', 'protein_boost', 'ignore']));
      }

      if (todayWater < targets.water_ml * 0.6) {
        cards.push(card('water-low', 'water', 'שתייה נמוכה היום', `היום הכנסת ${todayWater} מ״ל מים מתוך ${targets.water_ml} מ״ל.`, 'פיזור שתייה לאורך היום קל יותר משתייה מרוכזת בערב.', buildHydrationPlan(todayWater, targets.water_ml), ['water_plan', 'ignore']));
      }

      if (dominantMeal?.calories > total.calories * 0.45 && total.calories > 0) {
        cards.push(card('meal-distribution', 'meal_balance', 'פיזור קלוריות לא מאוזן', `רוב הקלוריות שלך מגיעות מ${MEAL_LABELS[dominantMeal.type]}.`, 'פיזור טוב יותר עוזר לאנרגיה ושובע לאורך היום.', 'נסה להעביר חלק מהקלוריות לצהריים או לערב.', ['build_meal', 'snack', 'ignore']));
      }

      const skippedLunch = skipped.lunch || 0;
      if (skippedLunch >= 3) {
        cards.push(card('skipped-lunch', 'skipped_meal', 'אתה מדלג על צהריים', `דילגת על ארוחת צהריים ${skippedLunch} פעמים השבוע.`, 'דילוג קבוע עלול לגרום לרעב ופיצוי בערב.', 'בנה ארוחת צהריים פשוטה לפי המאקרו שנשאר לך.', ['build_meal', 'snack', 'ignore']));
      }

      if (cards.length === 0) {
        const repeats = repeatList.slice(0, 2).map((item) => item.name).join(' ו־') || 'המאכלים הקבועים שלך';
        cards.push(card('steady-week', 'general', 'השבוע נראה יציב', `היום הכנסת ${Math.round(todayTotal.calories)} קלוריות מתוך ${targets.calories}. ${repeats} חוזרים אצלך הרבה.`, 'אפשר להשתמש בהרגלים הקבועים כדי לדייק כמויות בלי לשנות הכול.', 'בנה ארוחה שתסגור את מה שנשאר להיום.', ['build_meal', 'snack', 'ignore']));
      }
    }

    const debug = {
      last_updated_at: new Date().toISOString(),
      data_window_used: `${windowStart} עד ${today}`,
      meals_analyzed: meals.length,
      days_analyzed: analyzedDays,
      water_entries_analyzed: waterLogs.length,
      today_totals: todayTotal,
      today_water_ml: todayWater,
      targets_used: targets,
      skipped_meals: skipped,
      repeated_foods: repeatList,
      recent_foods_count: recentFoods.length,
      saved_meals_count: savedMeals.length,
      repeated_corrections: profileRows[0]?.ai_mistakes_corrected || [],
      missing_data: missing
    };

    return Response.json({
      generatedAt: debug.last_updated_at,
      traineeEmail: trainee_email,
      traineeName: trainee.full_name,
      data_window_used: debug.data_window_used,
      meals_analyzed: debug.meals_analyzed,
      days_analyzed: debug.days_analyzed,
      todayTotals: { calories: Math.round(todayTotal.calories), protein: round(todayTotal.protein), carbs: round(todayTotal.carbs), fat: round(todayTotal.fat) },
      remaining: {
        calories: Math.max(0, Math.round(targets.calories - todayTotal.calories)),
        protein: Math.max(0, round(targets.protein - todayTotal.protein)),
        carbs: Math.max(0, round(targets.carbs - todayTotal.carbs)),
        fat: Math.max(0, round(targets.fat - todayTotal.fat)),
        water_ml: Math.max(0, Math.round(targets.water_ml - todayWater))
      },
      targets,
      recommendation_cards: cards.slice(0, 3),
      hydration_plan: buildHydrationPlan(todayWater, targets.water_ml),
      personalization: {
        frequent_foods: repeatList,
        recent_foods: recentFoods.slice(0, 10),
        saved_meals: savedMeals.slice(0, 5),
        usual_meal_times: profileRows[0]?.meal_timing_habits || {},
        repeated_corrections: profileRows[0]?.ai_mistakes_corrected || []
      },
      missing_data: missing,
      debug
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});