import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { trainee_workout_id, exercise_id } = await req.json();

    if (!trainee_workout_id || !exercise_id) {
      return Response.json({
        ok: false,
        error: 'חסרים פרטים - ID אימון ותרגיל נדרשים'
      }, { status: 400 });
    }

    // Get the exercise
    const exercise = await base44.asServiceRole.entities.TraineeWorkoutExercise.get(exercise_id);
    
    if (!exercise) {
      return Response.json({
        ok: false,
        error: 'תרגיל לא נמצא'
      }, { status: 404 });
    }

    // Get the sets for this exercise
    const sets = await base44.asServiceRole.entities.TraineeWorkoutSet.filter({
      trainee_workout_exercise_id: exercise_id
    });

    // Check if any sets have data
    const hasData = sets.some(set => set.weight || set.reps);

    if (!hasData) {
      return Response.json({
        ok: false,
        error: 'לא הוזנו נתונים בתרגיל - הכנס משקלות וחזרות לפני השמירה'
      }, { status: 400 });
    }

    // Mark all sets as completed if they have data
    const updatePromises = sets
      .filter(set => set.weight || set.reps)
      .map(set => 
        base44.asServiceRole.entities.TraineeWorkoutSet.update(set.id, {
          completed: true
        })
      );

    await Promise.all(updatePromises);

    return Response.json({
      ok: true,
      message: 'התרגיל נשמר בהצלחה ✅',
      sets_saved: updatePromises.length
    });

  } catch (error) {
    console.error('[saveTraineeExercise] Error:', error);
    
    return Response.json({ 
      ok: false,
      error: `שגיאה: ${error.message}`
    }, { status: 500 });
  }
});