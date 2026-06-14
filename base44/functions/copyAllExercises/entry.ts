import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function generateDebugId() {
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `ALL-${random}`;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  const debugId = generateDebugId();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { daily_workout_id, target_date } = await req.json();

    console.log('=== COPY_ALL_EXERCISES ===');
    console.log('Debug ID:', debugId);
    console.log('Target date:', target_date);

    // Get daily workout
    const dailyWorkout = await base44.asServiceRole.entities.DailyWorkout.get(daily_workout_id);
    if (!dailyWorkout) {
      return Response.json({
        ok: false,
        error: 'אימון יומי לא נמצא',
        debug_id: debugId
      }, { status: 404 });
    }

    const exercises = dailyWorkout.exercises || [];
    if (exercises.length === 0) {
      return Response.json({
        ok: false,
        error: 'אין תרגילים להעתיק',
        debug_id: debugId
      }, { status: 400 });
    }

    console.log(`Found ${exercises.length} exercises to copy`);

    // Get or create trainee workout
    let traineeWorkout;
    const existing = await base44.asServiceRole.entities.TraineeWorkout.filter({
      trainee_email: user.email,
      date: target_date
    });

    if (existing.length > 0) {
      traineeWorkout = existing[0];
    } else {
      traineeWorkout = await base44.asServiceRole.entities.TraineeWorkout.create({
        trainee_email: user.email,
        date: target_date,
        title: dailyWorkout.title_he || 'אימון יומי',
        notes: dailyWorkout.description_he || null,
        source_daily_workout_id: daily_workout_id,
        status: 'in_progress'
      });
    }

    // Get existing exercises to check for duplicates
    const existingExercises = await base44.asServiceRole.entities.TraineeWorkoutExercise.filter({
      trainee_workout_id: traineeWorkout.id
    });

    let added = 0;
    let skipped = 0;
    let failed = 0;
    const skippedNames = [];
    const failedDetails = [];

    // Fetch history for all exercises once
    const previousWorkouts = await base44.asServiceRole.entities.TraineeWorkout.filter({
      trainee_email: user.email
    });
    previousWorkouts.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Copy each exercise with throttling
    for (let i = 0; i < exercises.length; i++) {
      const exercise = exercises[i];
      
      try {
        // Check duplicate
        const isDuplicate = existingExercises.some(ex => ex.exercise_name === exercise.exercise_name);
        
        if (isDuplicate) {
          console.log(`Skipping duplicate: ${exercise.exercise_name}`);
          skipped++;
          skippedNames.push(exercise.exercise_name);
          continue;
        }

        // Create TraineeWorkoutExercise record
        const newExercise = await base44.asServiceRole.entities.TraineeWorkoutExercise.create({
          trainee_workout_id: traineeWorkout.id,
          exercise_name: exercise.exercise_name,
          notes: exercise.notes || '',
          order_index: existingExercises.length + added
        });

        // Find last workout data for this exercise
        let previousSets = [];
        for (const prevWorkout of previousWorkouts) {
          if (prevWorkout.date === target_date) continue;
          
          const prevExercises = await base44.asServiceRole.entities.TraineeWorkoutExercise.filter({
            trainee_workout_id: prevWorkout.id,
            exercise_name: exercise.exercise_name
          });
          
          if (prevExercises.length > 0) {
            previousSets = await base44.asServiceRole.entities.TraineeWorkoutSet.filter({
              trainee_workout_exercise_id: prevExercises[0].id
            });
            previousSets.sort((a, b) => a.set_index - b.set_index);
            break;
          }
        }

        // Create sets for this exercise with history data
        const setsCount = exercise.sets || 4;
        for (let j = 1; j <= setsCount; j++) {
          const previousSet = previousSets.find(s => s.set_index === j);
          
          await base44.asServiceRole.entities.TraineeWorkoutSet.create({
            trainee_workout_exercise_id: newExercise.id,
            set_index: j,
            reps_min: exercise.reps_min || null,
            reps_max: exercise.reps_max || null,
            target_reps: exercise.reps_max || exercise.reps_min || null,
            weight: previousSet?.weight || null,
            reps: previousSet?.reps || null,
            completed: false
          });
        }

        added++;
        console.log(`✅ Added: ${exercise.exercise_name} with ${setsCount} sets`);

        // Throttle (200ms between inserts)
        if (i < exercises.length - 1) {
          await sleep(200);
        }

      } catch (err) {
        console.error(`❌ Failed to add ${exercise.exercise_name}:`, err);
        failed++;
        failedDetails.push({
          name: exercise.exercise_name,
          error: err.message
        });
      }
    }

    console.log(`=== COPY_ALL_COMPLETE ===`);
    console.log(`Added: ${added}, Skipped: ${skipped}, Failed: ${failed}`);

    return Response.json({
      ok: true,
      trainee_workout_id: traineeWorkout.id,
      summary: {
        added,
        skipped,
        failed,
        skipped_names: skippedNames,
        failed_details: failedDetails
      },
      debug_id: debugId
    });

  } catch (error) {
    console.error('[copyAllExercises] Error:', error);
    
    return Response.json({ 
      ok: false,
      error: `שגיאה: ${error.message}`,
      debug_id: debugId
    }, { status: 500 });
  }
});