import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const normalizeName = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[״"׳'`]/g, '')
  .replace(/[־–—_.,:;()\[\]{}\\/]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const resolveCanonicalExercise = async (base44, user, exerciseName, exerciseId) => {
  const cleanName = String(exerciseName || '').trim();
  const normalizedName = normalizeName(cleanName);

  if (exerciseId) {
    const byId = await base44.asServiceRole.entities.Exercise.filter({ id: exerciseId }, '-updated_date', 1);
    if (byId?.[0]) {
      return {
        id: byId[0].id,
        name: byId[0].name_he || cleanName,
        normalizedName: byId[0].normalized_name || normalizeName(byId[0].name_he || cleanName),
        source: 'id'
      };
    }
  }

  const exactMatches = await base44.asServiceRole.entities.Exercise.filter({ name_he: cleanName, status: 'active' }, '-updated_date', 1);
  if (exactMatches?.[0]) {
    const exact = exactMatches[0];
    if (!exact.normalized_name) {
      await base44.asServiceRole.entities.Exercise.update(exact.id, { normalized_name: normalizedName });
    }
    return { id: exact.id, name: exact.name_he || cleanName, normalizedName, source: 'exact_name' };
  }

  const activeExercises = await base44.asServiceRole.entities.Exercise.filter({ status: 'active' }, '-updated_date', 500);
  const normalizedMatch = activeExercises.find((exercise) => normalizeName(exercise.normalized_name || exercise.name_he) === normalizedName);
  if (normalizedMatch) {
    if (!normalizedMatch.normalized_name) {
      await base44.asServiceRole.entities.Exercise.update(normalizedMatch.id, { normalized_name: normalizedName });
    }
    return { id: normalizedMatch.id, name: normalizedMatch.name_he || cleanName, normalizedName, source: 'normalized_name' };
  }

  const created = await base44.asServiceRole.entities.Exercise.create({
    name_he: cleanName,
    normalized_name: normalizedName,
    muscle_group_primary: 'אחר',
    equipment: [],
    movement_pattern: 'אחר',
    status: 'active',
    is_default: false,
    created_by_coach: user?.email || null
  });

  return { id: created.id, name: created.name_he || cleanName, normalizedName, source: 'created' };
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized', success: false }, { status: 401 });
    }

    const payload = await req.json();
    const { trainee_email, trainee_id, date, workout_id, exercise_name, exercise_id } = payload;
    const rawSets = Array.isArray(payload.sets) ? payload.sets : [];

    if (!trainee_email || !date || !exercise_name) {
      return Response.json({ error: 'Missing required fields', success: false }, { status: 400 });
    }

    const normalizedSets = rawSets.map((set, index) => ({
      set_number: Number(set?.set_number || set?.setIndex || set?.set_index || index + 1),
      setIndex: Number(set?.setIndex || set?.set_number || set?.set_index || index + 1),
      weight: Number.parseFloat(set?.weight) || 0,
      reps: Number.parseInt(set?.reps, 10) || 0,
      completed: Boolean(set?.completed),
      notes: set?.notes || ''
    }));

    const hasAnySetData = normalizedSets.some((set) => set.weight > 0 || set.reps > 0);
    if (!normalizedSets.length || !hasAnySetData) {
      return Response.json({ error: 'יש למלא לפחות סט אחד עם משקל או חזרות', success: false }, { status: 400 });
    }

    const traineeId = trainee_id || (await base44.asServiceRole.entities.Trainee.filter({ user_email: trainee_email }, '-created_date', 1))?.[0]?.id || null;
    const canonicalExercise = await resolveCanonicalExercise(base44, user, exercise_name, exercise_id);
    const canonicalExerciseId = canonicalExercise.id;
    const canonicalExerciseName = canonicalExercise.name || exercise_name;
    const savedAt = new Date().toISOString();

    const workouts = await base44.asServiceRole.entities.TraineeWorkout.filter({
      trainee_email,
      date
    }, '-updated_date', 10);

    let traineeWorkout = workouts[0];

    if (!traineeWorkout) {
      traineeWorkout = await base44.asServiceRole.entities.TraineeWorkout.create({
        trainee_email,
        date,
        title: 'אימון יומי',
        source_daily_workout_id: workout_id || null,
        status: 'completed',
        exercises: []
      });
    }

    const exercises = Array.isArray(traineeWorkout.exercises) ? [...traineeWorkout.exercises] : [];
    const requestedNameKey = canonicalExercise.normalizedName || normalizeName(canonicalExerciseName);

    const existingIndex = exercises.findIndex((exercise) => {
      const existingName = exercise?.name || exercise?.exercise_name;
      if (canonicalExerciseId && exercise?.exercise_id && exercise.exercise_id === canonicalExerciseId) return true;
      return normalizeName(existingName) === requestedNameKey;
    });

    const exerciseData = {
      exercise_id: canonicalExerciseId,
      exercise_name: canonicalExerciseName,
      name: canonicalExerciseName,
      normalized_name: requestedNameKey,
      trainee_id: traineeId,
      workout_id: traineeWorkout.id,
      source_workout_id: workout_id || null,
      date,
      saved_at: savedAt,
      sets: normalizedSets
    };

    if (existingIndex >= 0) {
      exercises[existingIndex] = { ...exercises[existingIndex], ...exerciseData };
    } else {
      exercises.push(exerciseData);
    }

    await base44.asServiceRole.entities.TraineeWorkout.update(traineeWorkout.id, {
      exercises,
      status: 'completed'
    });

    const completedSets = normalizedSets.filter((set) => set.weight > 0 || set.reps > 0);
    const avgWeight = completedSets.reduce((sum, set) => sum + set.weight, 0) / completedSets.length;
    const avgReps = completedSets.reduce((sum, set) => sum + set.reps, 0) / completedSets.length;

    let historySync = null;
    try {
      const historyCandidates = await base44.asServiceRole.entities.ExerciseHistory.filter({
        trainee_email,
        date
      }, '-updated_date', 50);

      const existingHistory = historyCandidates.find((record) => {
        if (canonicalExerciseId && record.exercise_id && record.exercise_id === canonicalExerciseId) return true;
        return normalizeName(record.exercise_name) === requestedNameKey;
      });

      const historyPayload = {
        trainee_id: traineeId,
        trainee_email,
        exercise_id: canonicalExerciseId,
        exercise_name: canonicalExerciseName,
        date,
        sets: completedSets.length,
        reps: Math.round(avgReps),
        weight: Math.round(avgWeight * 10) / 10,
        source: 'STUDIO',
        notes: JSON.stringify(normalizedSets),
        assignment_id: workout_id || null
      };

      if (existingHistory) {
        await base44.asServiceRole.entities.ExerciseHistory.update(existingHistory.id, historyPayload);
        historySync = 'updated';
      } else {
        await base44.asServiceRole.entities.ExerciseHistory.create(historyPayload);
        historySync = 'created';
      }
    } catch (historyError) {
      console.warn('[saveExerciseProgress] History sync skipped:', historyError.message);
      historySync = 'skipped';
    }

    let pointsSync = null;
    try {
      const pointsResponse = await base44.asServiceRole.functions.invoke('pointsEngine', {
        action: 'sync_daily',
        trainee_id: traineeId,
        trainee_email,
        date
      });
      pointsSync = pointsResponse?.data || null;
    } catch (pointsError) {
      console.warn('[saveExerciseProgress] Points sync failed:', pointsError.message);
    }

    return Response.json({
      success: true,
      workout_id: traineeWorkout.id,
      exercise_id: canonicalExerciseId,
      exercise_name: canonicalExerciseName,
      trainee_id: traineeId,
      date,
      sets: normalizedSets,
      points_sync: pointsSync,
      history_sync: historySync,
      saved_at: savedAt,
      canonical_exercise_source: canonicalExercise.source,
      saved_payload: { trainee_id: traineeId, workout_id: traineeWorkout.id, exercise_id: canonicalExerciseId, exercise_name: canonicalExerciseName, date, sets: normalizedSets, saved_at: savedAt }
    });
  } catch (error) {
    console.error('[saveExerciseProgress] Error:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});