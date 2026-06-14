import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { exercise_name, target_date } = await req.json();

    // Get trainee workout
    const workouts = await base44.asServiceRole.entities.TraineeWorkout.filter({
      trainee_email: user.email,
      date: target_date
    });

    if (workouts.length === 0) {
      return Response.json({
        ok: false,
        error: 'לא נמצא אימון'
      }, { status: 404 });
    }

    const traineeWorkout = workouts[0];
    const currentExercises = traineeWorkout.exercises || [];

    // Remove exercise
    const updatedExercises = currentExercises.filter(ex => ex.name !== exercise_name);

    await base44.asServiceRole.entities.TraineeWorkout.update(traineeWorkout.id, {
      exercises: updatedExercises
    });

    console.log(`✅ Removed ${exercise_name}`);

    return Response.json({
      ok: true,
      removed: exercise_name
    });

  } catch (error) {
    console.error('[removeExerciseLine] Error:', error);
    return Response.json({ 
      ok: false,
      error: error.message
    }, { status: 500 });
  }
});