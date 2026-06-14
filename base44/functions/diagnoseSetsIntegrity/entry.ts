import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    console.log('[diagnoseSetsIntegrity] Starting scan...');

    // Get all trainee workouts
    const allWorkouts = await base44.asServiceRole.entities.TraineeWorkout.list();
    
    let totalExercisesChecked = 0;
    let invalidSetsCount = 0;
    let undefinedSetsCount = 0;
    let objectSetsCount = 0;
    let arraySetsCount = 0;
    const sampleIds = [];

    for (const workout of allWorkouts) {
      if (!workout.exercises) continue;

      // Normalize exercises to array
      let exercises = [];
      if (Array.isArray(workout.exercises)) {
        exercises = workout.exercises;
      } else if (workout.exercises && typeof workout.exercises === 'object') {
        exercises = Object.values(workout.exercises);
      }

      for (const ex of exercises) {
        totalExercisesChecked++;
        
        if (!ex.sets) {
          undefinedSetsCount++;
          if (sampleIds.length < 20) {
            sampleIds.push({
              workoutId: workout.id,
              exerciseName: ex.name || ex.exercise_name,
              issue: 'sets_undefined'
            });
          }
        } else if (!Array.isArray(ex.sets)) {
          if (typeof ex.sets === 'object') {
            objectSetsCount++;
            if (sampleIds.length < 20) {
              sampleIds.push({
                workoutId: workout.id,
                exerciseName: ex.name || ex.exercise_name,
                issue: 'sets_is_object'
              });
            }
          } else {
            invalidSetsCount++;
            if (sampleIds.length < 20) {
              sampleIds.push({
                workoutId: workout.id,
                exerciseName: ex.name || ex.exercise_name,
                issue: 'sets_invalid_type'
              });
            }
          }
        } else {
          arraySetsCount++;
        }
      }
    }

    const fixNeeded = undefinedSetsCount + invalidSetsCount + objectSetsCount;
    const durationMs = Date.now() - startTime;

    console.log('[diagnoseSetsIntegrity] ✅ Scan complete');
    console.log('Total exercises:', totalExercisesChecked);
    console.log('Need fix:', fixNeeded);

    return Response.json({
      success: true,
      totalWorkouts: allWorkouts.length,
      totalExercisesChecked,
      arraySetsCount,
      undefinedSetsCount,
      objectSetsCount,
      invalidSetsCount,
      fixNeeded,
      sampleIds,
      startedAt: new Date(startTime).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs
    });

  } catch (error) {
    console.error('[diagnoseSetsIntegrity] Error:', error);
    return Response.json({ 
      error: error.message,
      success: false,
      durationMs: Date.now() - startTime
    }, { status: 500 });
  }
});