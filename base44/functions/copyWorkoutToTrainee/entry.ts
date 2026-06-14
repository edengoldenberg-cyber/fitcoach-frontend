import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { trainee_email, daily_workout_id, target_date } = await req.json();

    if (!trainee_email || !daily_workout_id || !target_date) {
      return Response.json({ 
        success: false,
        message: 'COPY_WORKOUT_ERROR: Missing required fields'
      }, { status: 400 });
    }

    console.log('[copyWorkoutToTrainee] COPY_WORKOUT_START:', { trainee_email, daily_workout_id, target_date });

    // Get source workout
    const sourceWorkout = await base44.asServiceRole.entities.DailyWorkout.get(daily_workout_id);

    if (!sourceWorkout) {
      console.log('[copyWorkoutToTrainee] COPY_WORKOUT_ERROR: Source workout not found');
      return Response.json({
        success: false,
        message: 'COPY_WORKOUT_ERROR: Workout not found'
      }, { status: 404 });
    }

    // Check if trainee already has a workout for this date
    const existing = await base44.asServiceRole.entities.TraineeWorkout.filter({
      trainee_email,
      date: target_date
    });

    // Delete existing if found
    if (existing.length > 0) {
      for (const old of existing) {
        await base44.asServiceRole.entities.TraineeWorkout.delete(old.id);
      }
      console.log('[copyWorkoutToTrainee] Deleted existing workout');
    }

    // Create new TraineeWorkout
    const newWorkout = await base44.asServiceRole.entities.TraineeWorkout.create({
      trainee_email,
      date: target_date,
      title: sourceWorkout.title_he,
      source_daily_workout_id: daily_workout_id,
      notes: sourceWorkout.description_he || '',
      status: 'draft',
      exercises: (sourceWorkout.exercises || []).map(ex => ({
        exercise_id: ex.exercise_id || null,
        name: ex.exercise_name,
        notes: ex.notes || '',
        sets: Array.from({ length: ex.sets || 3 }, (_, i) => ({
          setIndex: i + 1,
          weight: null,
          reps: null,
          reps_min: ex.reps_min || null,
          reps_max: ex.reps_max || null,
          completed: false
        }))
      }))
    });

    console.log('[copyWorkoutToTrainee] COPY_WORKOUT_SUCCESS:', { workout_id: newWorkout.id });

    return Response.json({
      success: true,
      message: 'COPY_WORKOUT_SUCCESS',
      data: {
        workout_id: newWorkout.id,
        trainee_email,
        date: target_date
      }
    });

  } catch (error) {
    console.error('[copyWorkoutToTrainee] COPY_WORKOUT_ERROR:', error);
    return Response.json({ 
      success: false,
      message: 'COPY_WORKOUT_ERROR',
      error: error.message
    }, { status: 500 });
  }
});