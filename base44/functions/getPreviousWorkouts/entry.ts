import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { trainee_email, exercise_ids } = await req.json();

    if (!trainee_email || !exercise_ids || !Array.isArray(exercise_ids)) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log('[getPreviousWorkouts] Fetching for:', trainee_email, 'exercises:', exercise_ids.length);

    // Get all trainee workouts ordered by date DESC
    const allWorkouts = await base44.asServiceRole.entities.TraineeWorkout.filter({
      trainee_email: trainee_email
    });

    // Sort by date descending
    allWorkouts.sort((a, b) => new Date(b.date) - new Date(a.date));

    const previousData = {};

    // For each requested exercise, find last 3 workouts that contain it
    for (const exerciseId of exercise_ids) {
      const exerciseHistory = [];
      
      for (const workout of allWorkouts) {
        if (exerciseHistory.length >= 3) break; // Limit to 3 most recent
        if (!workout.exercises || !Array.isArray(workout.exercises)) continue;

        const exerciseEntry = workout.exercises.find(ex => {
          // Match by exercise_id if available, otherwise by name
          return ex.exercise_id === exerciseId || ex.name === exerciseId;
        });

        if (exerciseEntry) {
          // Normalize sets - handle array/object/undefined
          let normalizedSets = [];
          if (Array.isArray(exerciseEntry.sets)) {
            normalizedSets = exerciseEntry.sets;
          } else if (exerciseEntry.sets && typeof exerciseEntry.sets === 'object') {
            normalizedSets = Object.values(exerciseEntry.sets);
          }
          
          // Filter only completed sets with actual data (not 0x0)
          const completedSets = normalizedSets.filter(s => 
            s?.completed && (s?.weight > 0 || s?.reps > 0)
          );
          
          if (completedSets.length > 0) {
            exerciseHistory.push({
              date: workout.date,
              sets: completedSets.map(s => ({
                weight: s.weight || 0,
                reps: s.reps || 0
              }))
            });
          }
        }
      }

      previousData[exerciseId] = exerciseHistory.length > 0 ? exerciseHistory : null;
    }

    return Response.json({
      success: true,
      data: previousData
    });

  } catch (error) {
    console.error('[getPreviousWorkouts] Error:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});