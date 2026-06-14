import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const normalizeEmail = (value = '') => String(value || '').toLowerCase().trim();
const dayMs = 24 * 60 * 60 * 1000;

function israelDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00+03:00`);
  const end = new Date(`${endDate}T00:00:00+03:00`);
  const days = [];
  for (let t = start.getTime(); t <= end.getTime(); t += dayMs) {
    days.push(israelDateString(new Date(t)));
  }
  return days;
}

function matches(record, trainee) {
  const email = normalizeEmail(record.trainee_email || record.user_email || record.created_by);
  const traineeEmail = normalizeEmail(trainee.user_email);
  return Boolean(
    (record.trainee_id && record.trainee_id === trainee.id) ||
    (record.user_id && trainee.user_id && record.user_id === trainee.user_id) ||
    (email && traineeEmail && email === traineeEmail)
  );
}

function compactRecord(record, entityName) {
  return {
    entity: entityName,
    id: record.id,
    trainee_id: record.trainee_id || null,
    user_id: record.user_id || null,
    trainee_email: record.trainee_email || record.user_email || null,
    date: record.date || record.activity_date || record.created_at || null,
    meal_type: record.meal_type || null,
    food_name: record.food_name || record.meal_name || null,
    calories: record.calories || record.macros_snapshot?.calories || 0,
    protein: record.protein || record.macros_snapshot?.protein || 0,
    carbs: record.carbs || record.macros_snapshot?.carbs || 0,
    fat: record.fat || record.macros_snapshot?.fat || 0,
    amount_ml: record.amount_ml || 0,
    created_at: record.created_date || record.created_at || null,
    source: record.learning_event_type || record.source || entityName,
    raw: record
  };
}

function totals(records) {
  return records.reduce((acc, record) => ({
    calories: acc.calories + (Number(record.calories) || 0),
    protein: acc.protein + (Number(record.protein) || 0),
    carbs: acc.carbs + (Number(record.carbs) || 0),
    fat: acc.fat + (Number(record.fat) || 0),
    water_ml: acc.water_ml + (Number(record.amount_ml) || 0),
    count: acc.count + 1
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, water_ml: 0, count: 0 });
}

function detectWarnings({ trainee, duplicates, meals, water, startDate, endDate }) {
  const warnings = [];
  if (duplicates.length > 1) warnings.push(`נמצאו ${duplicates.length} פרופילי מתאמן עם אותו אימייל/טלפון`);
  if (!trainee.user_id) warnings.push('למתאמן אין user_id מקושר — התאמה לפי אימייל בלבד');

  [...meals, ...water].forEach(record => {
    if (!record.trainee_id) warnings.push(`${record.entity} ${record.id}: חסר trainee_id`);
    if (!record.user_id && trainee.user_id) warnings.push(`${record.entity} ${record.id}: חסר user_id`);
    if (record.date && !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) warnings.push(`${record.entity} ${record.id}: פורמט תאריך לא תקין (${record.date})`);
  });

  const range = new Set(daysBetween(startDate, endDate));
  [...meals, ...water].forEach(record => {
    if (record.date && !range.has(record.date)) warnings.push(`${record.entity} ${record.id}: מחוץ לטווח התאריכים המבוקש`);
  });

  return Array.from(new Set(warnings));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { trainee_id, start_date, end_date, backfill = false } = body;
    if (!trainee_id) return Response.json({ error: 'trainee_id is required' }, { status: 400 });

    const endDate = end_date || israelDateString();
    const startDate = start_date || israelDateString(new Date(Date.now() - 13 * dayMs));
    const dateSet = new Set(daysBetween(startDate, endDate));

    const traineeRows = await base44.entities.Trainee.filter({ id: trainee_id });
    const trainee = traineeRows?.[0];
    if (!trainee) return Response.json({ error: 'Trainee not found' }, { status: 404 });

    const byEmail = trainee.user_email ? await base44.entities.Trainee.filter({ user_email: trainee.user_email }) : [];
    const byPhone = trainee.phone ? await base44.entities.Trainee.filter({ phone: trainee.phone }) : [];
    const duplicateMap = new Map([...byEmail, ...byPhone].map(row => [row.id, row]));
    const duplicates = Array.from(duplicateMap.values());

    const allMeals = await base44.entities.MealEntry.list('-created_date', 1000);
    const allWater = await base44.entities.WaterEntry.list('-created_date', 1000);
    const userFoods = await base44.entities.UserFoodItem.list('-updated_date', 500);
    const savedMeals = await base44.entities.UserSavedMeals.list('-updated_date', 500);
    const targets = await base44.entities.NutritionTargets.filter({ trainee_email: trainee.user_email }).catch(() => []);

    let mealMatches = allMeals.filter(record => matches(record, trainee));
    let waterMatches = allWater.filter(record => matches(record, trainee));

    const orphanMeals = mealMatches.filter(record => !record.trainee_id || (!record.user_id && trainee.user_id));
    const orphanWater = waterMatches.filter(record => !record.trainee_id || (!record.user_id && trainee.user_id));

    if (backfill) {
      for (const meal of orphanMeals) {
        await base44.entities.MealEntry.update(meal.id, {
          trainee_id: trainee.id,
          user_id: trainee.user_id || meal.user_id || null,
          trainee_email: trainee.user_email || meal.trainee_email
        });
      }
      for (const entry of orphanWater) {
        await base44.entities.WaterEntry.update(entry.id, {
          trainee_id: trainee.id,
          user_id: trainee.user_id || entry.user_id || null,
          trainee_email: trainee.user_email || entry.trainee_email
        });
      }
      const refreshedMeals = await base44.entities.MealEntry.list('-created_date', 1000);
      const refreshedWater = await base44.entities.WaterEntry.list('-created_date', 1000);
      mealMatches = refreshedMeals.filter(record => matches(record, trainee));
      waterMatches = refreshedWater.filter(record => matches(record, trainee));
    }

    const mealRecords = mealMatches.filter(record => dateSet.has(record.date)).map(record => compactRecord(record, 'MealEntry'));
    const waterRecords = waterMatches.filter(record => dateSet.has(record.date)).map(record => compactRecord(record, 'WaterEntry'));
    const personalFoods = userFoods.filter(record => matches(record, trainee)).map(record => compactRecord(record, 'UserFoodItem'));
    const savedMealRecords = savedMeals.filter(record => matches(record, trainee)).map(record => compactRecord(record, 'UserSavedMeals'));

    const records = [...mealRecords, ...waterRecords];
    const dailyTotals = Object.fromEntries(daysBetween(startDate, endDate).map(date => [
      date,
      totals(records.filter(record => record.date === date))
    ]));

    const debug = {
      trainee: {
        id: trainee.id,
        trainee_id: trainee.id,
        user_id: trainee.user_id || null,
        email: trainee.user_email || null,
        phone: trainee.phone || null,
        full_name: trainee.full_name || null,
        coach_email: trainee.coach_email || null,
        linked_auth_user: trainee.user_id ? { user_id: trainee.user_id, email: trainee.user_email } : null
      },
      possible_duplicates: duplicates.map(row => ({ id: row.id, user_id: row.user_id || null, email: row.user_email || null, phone: row.phone || null, status: row.status || null, full_name: row.full_name || null })),
      range: { start_date: startDate, end_date: endDate, timezone: 'Asia/Jerusalem' },
      source_of_truth: 'MealEntry + WaterEntry matched by trainee_id OR user_id OR normalized trainee_email',
      records: {
        MealEntry: mealRecords,
        WaterEntry: waterRecords,
        UserFoodItem: personalFoods,
        UserSavedMeals: savedMealRecords,
        NutritionTargets: targets.map(record => compactRecord(record, 'NutritionTargets'))
      },
      totals: {
        nutrition: totals(mealRecords),
        water_ml: totals(waterRecords).water_ml,
        by_day: dailyTotals
      },
      comparison: {
        trainee_app_saves: 'NutritionLog creates MealEntry with trainee_email; after fix it also saves trainee_id and user_id',
        coach_dashboard_queries: 'Coach views now match by trainee_id/user_id/email instead of email only',
        weekly_report_reads: 'Coach reports now use same matcher and Israel date strings'
      },
      mismatches: detectWarnings({ trainee, duplicates, meals: mealRecords, water: waterRecords, startDate, endDate }),
      backfill: {
        requested: !!backfill,
        meal_records_fixed: backfill ? orphanMeals.length : 0,
        water_records_fixed: backfill ? orphanWater.length : 0,
        pending_meal_records: backfill ? 0 : orphanMeals.length,
        pending_water_records: backfill ? 0 : orphanWater.length
      }
    };

    return Response.json(debug);
  } catch (error) {
    console.error('nutritionSyncAudit error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});