import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function generateDebugId() {
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `EX-${random}`;
}

Deno.serve(async (req) => {
  const debugId = generateDebugId();
  const startTime = Date.now();
  let logData = {
    action_type: 'copy_exercise',
    payload_json: {},
    status_code: 0,
    success: false
  };
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      logData.status_code = 401;
      logData.error_text = 'Unauthorized';
      
      return Response.json({ 
        ok: false,
        error: 'Unauthorized',
        debug_id: debugId
      }, { status: 401 });
    }

    const payload = await req.json();
    const { daily_workout_id, exercise, target_date } = payload;
    
    logData.trainee_email = user.email;
    logData.target_date = target_date;
    logData.daily_workout_id = daily_workout_id;
    logData.exercise_name = exercise?.exercise_name;
    logData.payload_json = payload;

    console.log('=== COPY_EXERCISE_LINE ===');
    console.log('Payload:', JSON.stringify(payload, null, 2));

    // Validation with explicit field checks
    const missingFields = [];
    if (!daily_workout_id) missingFields.push('daily_workout_id');
    if (!exercise) missingFields.push('exercise');
    if (!exercise?.exercise_name) missingFields.push('exercise.exercise_name');
    if (!target_date) missingFields.push('target_date');
    if (!user.email) missingFields.push('user.email');

    if (missingFields.length > 0) {
      const errorMsg = `Missing required fields: ${missingFields.join(', ')}`;
      logData.status_code = 400;
      logData.error_text = errorMsg;
      
      await base44.asServiceRole.entities.CopyLog.create({
        ...logData,
        duration_ms: Date.now() - startTime
      });

      return Response.json({
        ok: false,
        error: errorMsg,
        missing_fields: missingFields,
        expected_schema: {
          daily_workout_id: 'string (required)',
          exercise: {
            exercise_name: 'string (required)',
            sets: 'number (optional)',
            reps_min: 'number (optional)',
            reps_max: 'number (optional)',
            notes: 'string (optional)'
          },
          target_date: 'string YYYY-MM-DD (required)'
        },
        debug_id: debugId
      }, { status: 400 });
    }

    // Get or create trainee workout for target date
    let traineeWorkout;
    const existing = await base44.asServiceRole.entities.TraineeWorkout.filter({
      trainee_email: user.email,
      date: target_date
    });

    if (existing.length > 0) {
      traineeWorkout = existing[0];
    } else {
      // Create new workout
      const dailyWorkout = await base44.asServiceRole.entities.DailyWorkout.get(daily_workout_id);
      traineeWorkout = await base44.asServiceRole.entities.TraineeWorkout.create({
        trainee_email: user.email,
        date: target_date,
        title: dailyWorkout?.title_he || 'אימון יומי',
        notes: dailyWorkout?.description_he || null,
        source_daily_workout_id: daily_workout_id,
        status: 'in_progress'
      });
    }

    // Get existing exercises to check for duplicates
    const existingExercises = await base44.asServiceRole.entities.TraineeWorkoutExercise.filter({
      trainee_workout_id: traineeWorkout.id
    });
    
    // Check for duplicate
    const isDuplicate = existingExercises.some(ex => 
      ex.exercise_name === exercise.exercise_name
    );

    if (isDuplicate) {
      logData.status_code = 200;
      logData.success = true;
      logData.error_text = 'Duplicate - skipped';
      
      await base44.asServiceRole.entities.CopyLog.create({
        ...logData,
        duration_ms: Date.now() - startTime
      });

      return Response.json({
        ok: false,
        error: 'התרגיל כבר קיים באימון',
        skipped: true,
        debug_id: debugId
      });
    }

    // Create TraineeWorkoutExercise record
    const newExercise = await base44.asServiceRole.entities.TraineeWorkoutExercise.create({
      trainee_workout_id: traineeWorkout.id,
      exercise_name: exercise.exercise_name,
      notes: exercise.notes || '',
      order_index: existingExercises.length
    });

    // Create sets for this exercise
    const setsCount = exercise.sets || 4;
    for (let j = 1; j <= setsCount; j++) {
      await base44.asServiceRole.entities.TraineeWorkoutSet.create({
        trainee_workout_exercise_id: newExercise.id,
        set_index: j,
        reps_min: exercise.reps_min || null,
        reps_max: exercise.reps_max || null,
        target_reps: exercise.reps_max || exercise.reps_min || null,
        completed: false
      });
    }

    console.log(`✅ Added ${exercise.exercise_name} to trainee workout`);

    // Log success
    logData.status_code = 200;
    logData.success = true;
    logData.response_text = `Added ${exercise.exercise_name}`;
    
    await base44.asServiceRole.entities.CopyLog.create({
      ...logData,
      duration_ms: Date.now() - startTime
    });

    return Response.json({
      ok: true,
      trainee_workout_id: traineeWorkout.id,
      exercise_added: exercise.exercise_name,
      sets_count: exercise.sets || 4,
      debug_id: debugId
    });

  } catch (error) {
    console.error('[copyExerciseLine] Error:', error);
    
    logData.status_code = 500;
    logData.error_text = error.message;
    logData.response_text = error.stack;
    
    try {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.CopyLog.create({
        ...logData,
        duration_ms: Date.now() - startTime
      });
    } catch (logErr) {
      console.error('Failed to log error:', logErr);
    }
    
    return Response.json({ 
      ok: false,
      error: `שגיאה: ${error.message}`,
      stack: error.stack,
      debug_id: debugId
    }, { status: 500 });
  }
});