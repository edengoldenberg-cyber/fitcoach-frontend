import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TARGETS = [
  { label: 'דויד רנד', email: 'davidnerya.k@gmail.com', trainee_id: '69f301142782b409db953b47' },
  { label: 'Yulia Sherman', email: 'masanaale@gmail.com', trainee_id: '699ca75dfe5ffcb865a7e683' },
];

function unwrap(record) {
  return record?.data ? { id: record.id, created_date: record.created_date, updated_date: record.updated_date, ...record.data } : record;
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

function sum(records, field) {
  return records.reduce((total, record) => total + (Number(record[field]) || 0), 0);
}

function getIsraelWeekRange() {
  const now = new Date();
  const israelOffset = 3 * 60;
  const localMs = now.getTime() + (israelOffset - now.getTimezoneOffset()) * 60000;
  const localNow = new Date(localMs);
  const dayOfWeek = localNow.getDay();
  const weekStart = new Date(localNow);
  weekStart.setDate(localNow.getDate() - dayOfWeek);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return {
    start: weekStart.toISOString().split('T')[0],
    end: weekEnd.toISOString().split('T')[0],
  };
}

function inWeek(date, week) {
  return date >= week.start && date <= week.end;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const week = getIsraelWeekRange();

    const [points, activities, meals, water, workouts] = await Promise.all([
      base44.asServiceRole.entities.UserPointsDaily.list('-date', 3000),
      base44.asServiceRole.entities.ShapeLeagueActivityLog.list('-created_date', 3000),
      base44.asServiceRole.entities.MealEntry.list('-created_date', 3000),
      base44.asServiceRole.entities.WaterEntry.list('-created_date', 3000),
      base44.asServiceRole.entities.TraineeWorkout.list('-created_date', 3000),
    ]);

    const unwrapped = {
      points: points.map(unwrap),
      activities: activities.map(unwrap),
      meals: meals.map(unwrap),
      water: water.map(unwrap),
      workouts: workouts.map(unwrap),
    };

    const report = TARGETS.map((target) => {
      const targetPoints = unwrapped.points.filter((record) =>
        (record.trainee_id === target.trainee_id || record.trainee_email === target.email) && inWeek(record.date, week)
      );

      const days = [...new Set(targetPoints.map((record) => record.date))].sort();

      return {
        target,
        ranking_logic: {
          total_points: sum(targetPoints, 'total_points'),
          days_active_current_logic: targetPoints.filter((record) => (Number(record.total_points) || 0) > 0).length,
          unique_positive_dates: [...new Set(targetPoints.filter((record) => (Number(record.total_points) || 0) > 0).map((record) => record.date))],
          note: 'הדירוג הנוכחי סופר שורה חיובית ב-UserPointsDaily כיום פעיל; אם יש שתי שורות לאותו יום זה עלול לנפח ימים.',
        },
        days: days.map((date) => {
          const dayPoints = targetPoints.filter((record) => record.date === date);
          const dayActivities = unwrapped.activities.filter((record) =>
            (record.trainee_id === target.trainee_id || record.trainee_email === target.email) && dateOnly(record.activity_date || record.logged_at || record.created_date) === date
          );
          const dayMeals = unwrapped.meals.filter((record) => record.trainee_email === target.email && record.date === date);
          const dayWater = unwrapped.water.filter((record) => record.trainee_email === target.email && record.date === date);
          const dayWorkouts = unwrapped.workouts.filter((record) => record.trainee_email === target.email && record.date === date);

          return {
            date,
            points_rows_count: dayPoints.length,
            points_rows: dayPoints.map((record) => ({
              id: record.id,
              total_points: record.total_points,
              workout_points: record.workout_points,
              meal_points: record.meal_points,
              water_points: record.water_points,
              bonus_points: record.bonus_points,
              meals_logged_count: record.meals_logged_count,
              created_date: record.created_date,
              updated_date: record.updated_date,
            })),
            activity_logs_count: dayActivities.length,
            activity_points: sum(dayActivities, 'points_awarded'),
            activities: dayActivities.map((record) => ({
              id: record.id,
              activity_type: record.activity_type,
              duration_minutes: record.duration_minutes,
              points_awarded: record.points_awarded,
              activity_date: record.activity_date,
              logged_at: record.logged_at,
            })),
            meals_count: dayMeals.length,
            water_total_ml: sum(dayWater, 'amount_ml'),
            water_entries_count: dayWater.length,
            workouts_count: dayWorkouts.length,
          };
        }),
      };
    });

    return Response.json({ week, report });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});