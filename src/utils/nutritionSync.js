export const normalizeNutritionEmail = (value = '') => String(value || '').toLowerCase().trim();

export const getIsraelDateString = (date = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
};

export const nutritionRecordMatchesTrainee = (record, trainee) => {
  if (!record || !trainee) return false;
  const recordEmail = normalizeNutritionEmail(record.trainee_email || record.user_email || record.created_by);
  const traineeEmail = normalizeNutritionEmail(trainee.user_email);
  return Boolean(
    (record.trainee_id && trainee.id && record.trainee_id === trainee.id) ||
    (record.user_id && trainee.user_id && record.user_id === trainee.user_id) ||
    (recordEmail && traineeEmail && recordEmail === traineeEmail)
  );
};

export const nutritionTotals = (records = []) => records.reduce((acc, record) => ({
  calories: acc.calories + (Number(record.calories) || 0),
  protein: acc.protein + (Number(record.protein) || 0),
  carbs: acc.carbs + (Number(record.carbs) || 0),
  fat: acc.fat + (Number(record.fat) || 0),
  count: acc.count + 1
}), { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 });

export const waterTotal = (records = []) => records.reduce((sum, record) => sum + (Number(record.amount_ml) || 0), 0);

export const metricRecordMatchesTrainee = nutritionRecordMatchesTrainee;

export const localDateInRange = (date, startDate, endDate) => {
  if (!date) return false;
  const value = String(date).slice(0, 10);
  return (!startDate || value >= startDate) && (!endDate || value <= endDate);
};

export const buildCanonicalTraineeFields = (trainee, user = null) => ({
  trainee_id: trainee?.id,
  user_id: trainee?.user_id || user?.id,
  trainee_email: normalizeNutritionEmail(trainee?.user_email || user?.email),
  coach_email: trainee?.coach_email,
});

export const invalidateCoachTraineeSyncQueries = (queryClient) => {
  [
    'meals', 'water', 'workouts', 'metricsEntries', 'traineeMetrics', 'allMeasurementsWeek',
    'allMeals', 'allWater', 'allWorkouts', 'allMealsEver', 'allMealsWeek', 'allWaterWeek', 'allWorkoutsWeek', 'allMetrics',
    'tm-meals', 'tm-water', 'tm-workouts', 'tm-measurements',
    'traineeMeals', 'traineeWater', 'traineeWorkouts', 'weekMeals', 'weekWater', 'weekWorkouts', 'allMealsHistory',
    'syncDebugMeals', 'syncDebugWater', 'syncDebugMetrics', 'trainees', 'coachTrainees'
  ].forEach(key => {
    queryClient.invalidateQueries({ queryKey: [key] });
  });
};

export const logSyncEvent = (event = {}) => {
  console.log('SYNC_EVENT', {
    entity: event.entity || 'unknown',
    trainee_id: event.trainee_id || null,
    coach_id: event.coach_id || event.coach_email || null,
    source: event.source || 'app',
    write_success: event.write_success ?? null,
    refresh_success: event.refresh_success ?? null,
    visible_to_coach: event.visible_to_coach ?? null,
    visible_to_trainee: event.visible_to_trainee ?? null,
    timestamp: new Date().toISOString(),
  });
};