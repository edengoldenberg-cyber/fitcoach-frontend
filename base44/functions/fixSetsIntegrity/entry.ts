import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    console.log('[fixSetsIntegrity] Starting fix...');

    const allWorkouts = await base44.asServiceRole.entities.TraineeWorkout.list();
    
    let totalWorkouts = allWorkouts.length;
    let fixedCount = 0;
    let skippedCount = 0;
    let errorsCount = 0;
    const errorsSample = [];
    
    const BATCH_SIZE = 200;
    
    for (let i = 0; i < allWorkouts.length; i += BATCH_SIZE) {
      const batch = allWorkouts.slice(i, i + BATCH_SIZE);
      
      console.log(`[fixSetsIntegrity] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allWorkouts.length / BATCH_SIZE)}`);
      
      for (const workout of batch) {
        try {
          if (!workout.exercises) {
            skippedCount++;
            continue;
          }

          // Normalize exercises to array
          let exercises = [];
          if (Array.isArray(workout.exercises)) {
            exercises = workout.exercises;
          } else if (workout.exercises && typeof workout.exercises === 'object') {
            exercises = Object.values(workout.exercises);
          }

          let needsUpdate = false;
          const fixedExercises = exercises.map(ex => {
            // Normalize sets
            let normalizedSets = [];
            
            if (Array.isArray(ex.sets)) {
              normalizedSets = ex.sets;
            } else if (ex.sets && typeof ex.sets === 'object') {
              normalizedSets = Object.values(ex.sets);
              needsUpdate = true;
            } else if (!ex.sets) {
              normalizedSets = [];
              needsUpdate = true;
            }

            // Ensure each set has proper structure
            const cleanedSets = normalizedSets.map((s, idx) => ({
              setIndex: s?.setIndex || idx + 1,
              weight: s?.weight ?? '',
              reps: s?.reps ?? '',
              completed: s?.completed ?? false
            }));

            return {
              ...ex,
              sets: cleanedSets
            };
          });

          if (needsUpdate) {
            await base44.asServiceRole.entities.TraineeWorkout.update(workout.id, {
              exercises: fixedExercises
            });
            fixedCount++;
          } else {
            skippedCount++;
          }

        } catch (error) {
          console.error(`[fixSetsIntegrity] Error fixing workout ${workout.id}:`, error);
          errorsCount++;
          if (errorsSample.length < 10) {
            errorsSample.push({
              workoutId: workout.id,
              error: error.message
            });
          }
        }
      }

      // Small delay between batches
      if (i + BATCH_SIZE < allWorkouts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const durationMs = Date.now() - startTime;

    console.log('[fixSetsIntegrity] ✅ Fix complete');
    console.log('Fixed:', fixedCount);
    console.log('Skipped:', skippedCount);
    console.log('Errors:', errorsCount);

    return Response.json({
      success: true,
      totalWorkouts,
      fixedCount,
      skippedCount,
      errorsCount,
      errorsSample,
      startedAt: new Date(startTime).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs
    });

  } catch (error) {
    console.error('[fixSetsIntegrity] Error:', error);
    return Response.json({ 
      error: error.message,
      success: false,
      durationMs: Date.now() - startTime
    }, { status: 500 });
  }
});