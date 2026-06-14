import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function generateDebugId(prefix = 'CPY') {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${date}-${random}`;
}

async function logAudit(base44, data) {
  try {
    await base44.asServiceRole.entities.SystemAuditLog.create(data);
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

Deno.serve(async (req) => {
  const debugId = generateDebugId();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      await logAudit(base44, {
        debug_id: debugId,
        action_type: 'COPY_DAILY_TO_TRAINEE',
        actor_role: 'system',
        status: 'fail',
        error_code: 'UNAUTHORIZED',
        error_message_he: 'משתמש לא מזוהה'
      });
      
      return Response.json({ 
        ok: false,
        error_code: 'UNAUTHORIZED',
        message_he: 'נדרש להתחבר מחדש',
        debug_id: debugId
      }, { status: 401 });
    }

    const { daily_workout_id, trainee_email, target_date } = await req.json();

    console.log('=== COPY_DAILY_WORKOUT_START ===');
    console.log('Debug ID:', debugId);
    console.log('daily_workout_id:', daily_workout_id);
    console.log('trainee_email:', trainee_email);
    console.log('target_date:', target_date);

    // Validation
    if (!daily_workout_id || !trainee_email || !target_date) {
      await logAudit(base44, {
        debug_id: debugId,
        action_type: 'COPY_DAILY_TO_TRAINEE',
        actor_role: 'trainee',
        actor_email: user.email,
        trainee_email: trainee_email,
        source_workout_id: daily_workout_id,
        status: 'fail',
        error_code: 'COPY_PAYLOAD_INVALID',
        error_message_he: 'חסרים שדות חובה'
      });
      
      return Response.json({
        ok: false,
        error_code: 'COPY_PAYLOAD_INVALID',
        message_he: 'חסרים שדות חובה',
        debug_id: debugId
      }, { status: 400 });
    }

    // Get daily workout
    const dailyWorkout = await base44.asServiceRole.entities.DailyWorkout.get(daily_workout_id);
    if (!dailyWorkout) {
      await logAudit(base44, {
        debug_id: debugId,
        action_type: 'COPY_DAILY_TO_TRAINEE',
        actor_role: 'trainee',
        actor_email: user.email,
        trainee_email: trainee_email,
        source_workout_id: daily_workout_id,
        status: 'fail',
        error_code: 'COPY_WORKOUT_NOT_FOUND',
        error_message_he: 'אימון יומי לא נמצא'
      });
      
      return Response.json({
        ok: false,
        error_code: 'COPY_WORKOUT_NOT_FOUND',
        message_he: 'אימון יומי לא נמצא במערכת',
        debug_id: debugId
      }, { status: 404 });
    }

    console.log('Found daily workout:', dailyWorkout.title_he);

    // Check exercises JSON
    if (!dailyWorkout.exercises || !Array.isArray(dailyWorkout.exercises) || dailyWorkout.exercises.length === 0) {
      await logAudit(base44, {
        debug_id: debugId,
        action_type: 'COPY_DAILY_TO_TRAINEE',
        actor_role: 'trainee',
        actor_email: user.email,
        trainee_email: trainee_email,
        source_workout_id: daily_workout_id,
        status: 'fail',
        error_code: 'COPY_EXERCISES_EMPTY',
        error_message_he: 'אין תרגילים באימון',
        payload_summary: { exercises_count: 0, sets_count: 0 }
      });
      
      return Response.json({
        ok: false,
        error_code: 'COPY_EXERCISES_EMPTY',
        message_he: 'האימון היומי לא מכיל תרגילים',
        debug_id: debugId
      }, { status: 400 });
    }

    const exercisesJson = dailyWorkout.exercises;
    console.log(`Found ${exercisesJson.length} exercises in JSON`);

    // Delete existing trainee workout for this date (if any)
    const existingWorkouts = await base44.asServiceRole.entities.TraineeWorkout.filter({
      trainee_email: trainee_email,
      date: target_date
    });

    if (existingWorkouts.length > 0) {
      console.log(`Deleting ${existingWorkouts.length} existing trainee workouts`);
      for (const workout of existingWorkouts) {
        await base44.asServiceRole.entities.TraineeWorkout.delete(workout.id);
      }
    }

    // Create trainee workout with exercises JSON
    // Convert to trainee format with completed status per exercise
    const traineeExercises = exercisesJson.map(ex => ({
      name: ex.exercise_name,
      notes: ex.notes || '',
      sets: Array.from({ length: ex.sets || 4 }, (_, i) => ({
        reps_min: ex.reps_min,
        reps_max: ex.reps_max,
        reps: null,
        weight: null,
        completed: false,
        rest_seconds: null
      }))
    }));

    const traineeWorkout = await base44.asServiceRole.entities.TraineeWorkout.create({
      trainee_email: trainee_email,
      date: target_date,
      title: dailyWorkout.title_he || 'אימון יומי',
      notes: dailyWorkout.description_he || null,
      source_daily_workout_id: daily_workout_id,
      status: 'in_progress',
      exercises: traineeExercises
    });

    console.log('Created trainee workout:', traineeWorkout.id);

    // Calculate totals
    const totalSets = exercisesJson.reduce((sum, ex) => sum + (ex.sets || 0), 0);

    // Success audit
    await logAudit(base44, {
      debug_id: debugId,
      action_type: 'COPY_DAILY_TO_TRAINEE',
      actor_role: 'trainee',
      actor_email: user.email,
      trainee_email: trainee_email,
      source_workout_id: daily_workout_id,
      target_workout_id: traineeWorkout.id,
      status: 'success',
      payload_summary: { 
        exercises_count: exercisesJson.length, 
        sets_count: totalSets 
      },
      details: {
        workout_title: dailyWorkout.title_he,
        target_date: target_date
      }
    });

    console.log('=== COPY_SUCCESS ===');
    console.log('Exercises copied:', exercisesJson.length);
    console.log('Sets copied:', totalSets);

    return Response.json({
      ok: true,
      success: true,
      trainee_workout_id: traineeWorkout.id,
      exercises_copied: exercisesJson.length,
      sets_copied: totalSets,
      debug_id: debugId
    });

  } catch (error) {
    console.error('[copyDailyWorkout] Error:', error);
    
    try {
      const base44 = createClientFromRequest(req);
      await logAudit(base44, {
        debug_id: debugId,
        action_type: 'COPY_DAILY_TO_TRAINEE',
        actor_role: 'system',
        status: 'fail',
        error_code: 'COPY_DB_WRITE_FAILED',
        error_message_he: error.message,
        details: { stack: error.stack }
      });
    } catch (logErr) {
      console.error('Failed to log error:', logErr);
    }
    
    return Response.json({ 
      ok: false,
      error_code: 'COPY_DB_WRITE_FAILED',
      message_he: `שגיאה בהעתקת האימון: ${error.message}`,
      debug_id: debugId
    }, { status: 500 });
  }
});