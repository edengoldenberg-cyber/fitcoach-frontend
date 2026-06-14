import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const normalizeName = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\u0591-\u05C7]/g, '')
  .replace(/[״"׳']/g, '')
  .replace(/מ\.\s*יד/g, 'משקולות יד')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const namesMatch = (left, right) => {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aTokens = new Set(a.split(' ').filter(token => token.length > 1));
  const bTokens = b.split(' ').filter(token => token.length > 1);
  if (!aTokens.size || !bTokens.length) return false;
  const matches = bTokens.filter(token => aTokens.has(token)).length;
  return matches >= Math.min(2, bTokens.length);
};

const normalizeSet = (set, index) => ({
  set_number: Number(set?.set_number || set?.setIndex || index + 1),
  setIndex: Number(set?.setIndex || set?.set_number || index + 1),
  weight: Number.parseFloat(set?.weight) || 0,
  reps: Number.parseInt(set?.reps, 10) || 0,
  completed: Boolean(set?.completed),
  notes: set?.notes || ''
});

const hasSetData = (set) => (Number(set?.weight) || 0) > 0 || (Number(set?.reps) || 0) > 0;

const parseSetsFromHistory = (record) => {
  if (record?.notes) {
    try {
      const parsed = JSON.parse(record.notes);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(normalizeSet).filter(hasSetData);
      }
    } catch (_) {}
  }

  const count = Number(record?.sets) || 1;
  return Array.from({ length: count }, (_, index) => normalizeSet({
    set_number: index + 1,
    setIndex: index + 1,
    weight: record?.weight,
    reps: record?.reps,
    completed: true,
    notes: ''
  }, index)).filter(hasSetData);
};

const findExerciseInWorkout = (workout, exerciseId, exerciseName) => {
  const nameKey = normalizeName(exerciseName);
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
  return exercises.find((exercise) => {
  const currentName = exercise?.name || exercise?.exercise_name;
  if (exerciseId && exercise?.exercise_id && exercise.exercise_id === exerciseId) return true;
  return namesMatch(currentName, nameKey);
  }) || null;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized', success: false }, { status: 401 });
    }

    const { trainee_email, exercise_id, exercise_name, date, current_date } = await req.json();
    const workoutDate = current_date || date || null;

    if (!trainee_email || (!exercise_id && !exercise_name)) {
      return Response.json({
        success: false,
        data: { date: null, sets: [], current_sets: [], summary: 'חסרים פרמטרים' }
      }, { status: 400 });
    }

    const nameKey = normalizeName(exercise_name);
    let currentSets = [];
    let currentWorkoutId = null;

    if (workoutDate) {
      const todayWorkouts = await base44.asServiceRole.entities.TraineeWorkout.filter({
        trainee_email,
        date: workoutDate
      }, '-updated_date', 10);

      for (const workout of todayWorkouts || []) {
        const exercise = findExerciseInWorkout(workout, exercise_id, exercise_name);
        if (exercise?.sets?.length) {
          currentSets = exercise.sets.map(normalizeSet);
          currentWorkoutId = workout.id;
          break;
        }
      }
    }

    const allHistoryRecords = await base44.asServiceRole.entities.ExerciseHistory.filter({
      trainee_email
    }, '-date', 100);

    const historyRecords = (allHistoryRecords || []).filter((record) => {
      if (exercise_id && record.exercise_id && record.exercise_id === exercise_id) return true;
      return namesMatch(record.exercise_name, exercise_name);
    });

    if (!currentSets.length && workoutDate) {
      const currentHistory = historyRecords
        .filter(record => record.date === workoutDate)
        .sort((a, b) => String(b.updated_date || b.created_date || '').localeCompare(String(a.updated_date || a.created_date || '')))[0];
      if (currentHistory) {
        currentSets = parseSetsFromHistory(currentHistory);
      }
    }

    const previousHistory = (historyRecords || [])
      .filter((record) => record.date !== workoutDate)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    let previousDate = null;
    let previousSets = [];

    if (previousHistory.length > 0) {
      previousDate = previousHistory[0].date;
      previousSets = parseSetsFromHistory(previousHistory[0]);
    }

    if (!previousDate) {
      const recentWorkouts = await base44.asServiceRole.entities.TraineeWorkout.filter(
        { trainee_email },
        '-date',
        20
      );

      for (const workout of recentWorkouts || []) {
        if (workoutDate && workout.date === workoutDate) continue;
        const exercise = findExerciseInWorkout(workout, exercise_id, exercise_name);
        const validSets = Array.isArray(exercise?.sets)
          ? exercise.sets.filter((set) => (Number(set.weight) || 0) > 0 || (Number(set.reps) || 0) > 0)
          : [];

        if (validSets.length > 0) {
          previousDate = workout.date;
          previousSets = validSets.map(normalizeSet).filter(hasSetData);
          break;
        }
      }
    }

    return Response.json({
      success: true,
      message: previousSets.length ? 'LOAD_LAST_TIME_SUCCESS' : 'LOAD_LAST_TIME_EMPTY',
      data: {
        date: previousDate,
        sets: previousSets,
        current_sets: currentSets,
        current_workout_id: currentWorkoutId,
        summary: previousSets.length ? `${previousSets.length} סטים • ${previousDate}` : 'אין היסטוריה עדיין',
        history_query_result: {
          matched_records: historyRecords?.length || 0,
          scanned_records: allHistoryRecords?.length || 0,
          current_sets_count: currentSets.length,
          previous_sets_count: previousSets.length
        }
      }
    });
  } catch (error) {
    console.error('[getLastExercisePerformance] ERROR:', error);
    return Response.json({
      success: false,
      error: error.message,
      data: { date: null, sets: [], current_sets: [], summary: 'שגיאה בטעינת נתונים' }
    }, { status: 500 });
  }
});