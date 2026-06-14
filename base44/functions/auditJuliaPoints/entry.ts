import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TARGET_NAMES = ['yulia sherman', 'yulia', 'sherman', 'יוליה', 'שרמן'];
const DATES_TO_CHECK = ['2026-05-09', '2026-05-08', '2026-05-07'];

function unwrap(record) {
  return record?.data ? { id: record.id, created_date: record.created_date, updated_date: record.updated_date, ...record.data } : record;
}

function matchesYulia(trainee) {
  const haystack = `${trainee.full_name || ''} ${trainee.user_email || ''} ${trainee.phone || ''}`.toLowerCase();
  return TARGET_NAMES.some((name) => haystack.includes(name.toLowerCase()));
}

function sameDate(value, date) {
  if (!value) return false;
  return String(value).slice(0, 10) === date;
}

function sum(records, field) {
  return records.reduce((total, record) => total + (Number(record[field]) || 0), 0);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const trainees = (await base44.asServiceRole.entities.Trainee.list('-created_date', 1000)).map(unwrap);
    const matches = trainees.filter((trainee) => trainee.user_email === 'masanaale@gmail.com');

    const allDailyPoints = (await base44.asServiceRole.entities.UserPointsDaily.list('-date', 2000)).map(unwrap);
    const allActivities = (await base44.asServiceRole.entities.ShapeLeagueActivityLog.list('-created_date', 2000)).map(unwrap);
    const allMeals = (await base44.asServiceRole.entities.MealEntry.list('-created_date', 2000)).map(unwrap);
    const allWater = (await base44.asServiceRole.entities.WaterEntry.list('-created_date', 2000)).map(unwrap);
    const allWorkouts = (await base44.asServiceRole.entities.TraineeWorkout.list('-created_date', 2000)).map(unwrap);

    const reports = matches.map((trainee) => {
      const email = trainee.user_email;
      const traineeId = trainee.id;

      return {
        trainee: {
          id: trainee.id,
          full_name: trainee.full_name,
          email: trainee.user_email,
          phone: trainee.phone,
          status: trainee.status,
        },
        dates: DATES_TO_CHECK.map((date) => {
          const dailyPoints = allDailyPoints.filter((p) =>
            (p.trainee_id === traineeId || p.trainee_email === email) && p.date === date
          );
          const activities = allActivities.filter((a) =>
            (a.trainee_id === traineeId || a.trainee_email === email) && sameDate(a.activity_date || a.logged_at || a.created_date, date)
          );
          const meals = allMeals.filter((m) => m.trainee_email === email && m.date === date);
          const water = allWater.filter((w) => w.trainee_email === email && w.date === date);
          const workouts = allWorkouts.filter((w) => w.trainee_email === email && w.date === date);

          return {
            date,
            user_points_daily: dailyPoints,
            displayed_total_from_daily: sum(dailyPoints, 'total_points'),
            activity_logs_count: activities.length,
            activity_points_sum: sum(activities, 'points_awarded'),
            activities: activities.map((a) => ({
              id: a.id,
              activity_type: a.activity_type,
              duration_minutes: a.duration_minutes,
              distance_km: a.distance_km,
              points_awarded: a.points_awarded,
              activity_date: a.activity_date,
              logged_at: a.logged_at,
              created_date: a.created_date,
            })),
            meals_count: meals.length,
            meal_types: [...new Set(meals.map((m) => m.meal_type).filter(Boolean))],
            water_entries_count: water.length,
            water_total_ml: sum(water, 'amount_ml'),
            workouts_count: workouts.length,
            workouts: workouts.map((w) => ({ id: w.id, title: w.title, status: w.status, date: w.date, created_date: w.created_date })),
          };
        }),
      };
    });

    return Response.json({
      searched: 'Yulia Sherman',
      matches_found: matches.length,
      dates_checked: DATES_TO_CHECK,
      summary: reports.map((report) => ({
        trainee: report.trainee,
        dates: report.dates.map((day) => ({
          date: day.date,
          total_points: day.displayed_total_from_daily,
          daily_point_rows: day.user_points_daily.map((row) => ({
            workout_points: row.workout_points,
            meal_points: row.meal_points,
            water_points: row.water_points,
            bonus_points: row.bonus_points,
            total_points: row.total_points,
            meals_logged_count: row.meals_logged_count,
          })),
          activity_points: day.activity_points_sum,
          activity_logs_count: day.activity_logs_count,
          activities: day.activities,
          meals_count: day.meals_count,
          meal_types: day.meal_types,
          water_total_ml: day.water_total_ml,
          water_entries_count: day.water_entries_count,
          workouts_count: day.workouts_count,
          workouts: day.workouts,
        })),
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});