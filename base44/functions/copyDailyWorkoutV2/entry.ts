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
  const debugId = generateDebugId('CPY2');
  
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

    console.log('=== COPY_V2_START ===');
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

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(target_date)) {
      return Response.json({
        ok: false,
        error_code: 'COPY_DATE_INVALID',
        message_he: 'תאריך לא תקין',
        debug_id: debugId
      }, { status: 400 });
    }

    // Step 1: Get daily workout
    const dailyWorkout = await base44.asServiceRole.entities.DailyWorkout.get(daily_workout_id);
    if (!dailyWorkout) {
      await logAudit(base44, {
        debug_id: debugId,
        action_type: 'COPY_DAILY_TO_TRAINEE',
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

    // Step 2: Fetch ALL items (exercise references)
    const dailyItems = await base44.asServiceRole.entities.DailyWorkoutItem.filter({
      daily_workout_id: daily_workout_id
    });

    console.log(`Found ${dailyItems.length} items`);

    if (dailyItems.length === 0) {
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
        message_he: 'האימון היומי לא מכיל תרגילים. המאמן צריך להוסיף תרגילים ולפרסם מחדש.',
        debug_id: debugId
      }, { status: 400 });
    }

    // Step 3: Fetch exercise details from library (for name_snapshot)
    const exerciseIds = dailyItems.map(item => item.exercise_id).filter(Boolean);
    if (exerciseIds.length === 0) {
      return Response.json({
        ok: false,
        error_code: 'COPY_EXERCISES_INVALID',
        message_he: 'תרגילים לא תקינים באימון',
        debug_id: debugId
      }, { status: 400 });
    }

    const exercises = await base44.asServiceRole.entities.ExerciseLibrary.filter({
      id: exerciseIds
    });

    const exerciseMap = new Map(exercises.map(ex => [ex.id, ex]));

    console.log(`Found ${exercises.length} exercises in library`);

    // Step 4: Delete existing trainee workout for this date (if exists)
    const existingWorkouts = await base44.asServiceRole.entities.TraineeWorkout.filter({
      trainee_email: trainee_email,
      date: target_date
    });

    if (existingWorkouts.length > 0) {
      console.log(`Deleting ${existingWorkouts.length} existing workouts`);
      
      for (const workout of existingWorkouts) {
        const existingItems = await base44.asServiceRole.entities.TraineeWorkoutItem.filter({
          trainee_workout_id: workout.id
        });
        
        for (const item of existingItems) {
          await base44.asServiceRole.entities.TraineeWorkoutItemSet.filter({
            trainee_workout_item_id: item.id
          }).then(sets => Promise.all(sets.map(s => 
            base44.asServiceRole.entities.TraineeWorkoutItemSet.delete(s.id)
          )));
        }
        
        await Promise.all(existingItems.map(item => 
          base44.asServiceRole.entities.TraineeWorkoutItem.delete(item.id)
        ));
        
        await base44.asServiceRole.entities.TraineeWorkout.delete(workout.id);
      }
    }

    // Step 5: Create trainee workout
    const traineeWorkout = await base44.asServiceRole.entities.TraineeWorkout.create({
      trainee_email: trainee_email,
      date: target_date,
      title: dailyWorkout.title_he || 'אימון יומי',
      notes: dailyWorkout.description_he || null,
      source_daily_workout_id: daily_workout_id,
      status: 'in_progress'
    });

    console.log('Created trainee workout:', traineeWorkout.id);

    // Step 6: Bulk prepare trainee items (with name_snapshot)
    const traineeItemsData = dailyItems
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      .map(item => {
        const exercise = exerciseMap.get(item.exercise_id);
        return {
          trainee_workout_id: traineeWorkout.id,
          exercise_id: item.exercise_id,
          name_snapshot: item.name_snapshot || exercise?.name_he || 'תרגיל',
          order_index: item.order_index || 0,
          sets: item.sets || 4,
          reps_min: item.reps_min || null,
          reps_max: item.reps_max || null,
          notes: item.notes_override || null
        };
      });

    console.log('Preparing to create', traineeItemsData.length, 'items');

    // Step 7: Bulk create trainee items
    const createdItems = await base44.asServiceRole.entities.TraineeWorkoutItem.bulkCreate(
      traineeItemsData
    );

    console.log('Created', createdItems.length, 'trainee items');

    // Step 8: Bulk prepare sets
    const setsData = [];
    
    for (const item of createdItems) {
      const sourceSets = item.sets || 4;
      for (let i = 0; i < sourceSets; i++) {
        setsData.push({
          trainee_workout_item_id: item.id,
          set_index: i + 1,
          reps: null,
          weight: null,
          completed: false
        });
      }
    }

    console.log('Preparing to create', setsData.length, 'sets');

    // Step 9: Bulk create sets
    if (setsData.length > 0) {
      const createdSets = await base44.asServiceRole.entities.TraineeWorkoutItemSet.bulkCreate(
        setsData
      );
      console.log('Created', createdSets.length, 'sets');
    }

    const finalExerciseCount = createdItems.length;
    const finalSetCount = setsData.length;

    if (finalExerciseCount === 0) {
      // ROLLBACK
      await base44.asServiceRole.entities.TraineeWorkout.delete(traineeWorkout.id);
      
      await logAudit(base44, {
        debug_id: debugId,
        action_type: 'COPY_DAILY_TO_TRAINEE',
        status: 'fail',
        error_code: 'COPY_EXERCISES_EMPTY',
        error_message_he: 'לא הועתקו תרגילים'
      });
      
      return Response.json({
        ok: false,
        error_code: 'COPY_EXERCISES_EMPTY',
        message_he: 'לא ניתן להעתיק אימון ללא תרגילים',
        debug_id: debugId
      }, { status: 400 });
    }

    // Success
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
        exercises_count: finalExerciseCount, 
        sets_count: finalSetCount 
      },
      details: {
        workout_title: dailyWorkout.title_he,
        target_date: target_date
      }
    });

    console.log('=== COPY_V2_SUCCESS ===');
    console.log('Exercises:', finalExerciseCount);
    console.log('Sets:', finalSetCount);

    return Response.json({
      ok: true,
      success: true,
      trainee_workout_id: traineeWorkout.id,
      exercises_copied: finalExerciseCount,
      sets_created: finalSetCount,
      debug_id: debugId
    });

  } catch (error) {
    console.error('[copyDailyWorkoutV2] Error:', error);
    
    try {
      const base44 = createClientFromRequest(req);
      await logAudit(base44, {
        debug_id: debugId,
        action_type: 'COPY_DAILY_TO_TRAINEE',
        status: 'fail',
        error_code: 'COPY_DB_WRITE_FAILED',
        error_message_he: error.message
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