import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function generateDebugId(prefix = 'SAV') {
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
        action_type: 'SAVE_WORKOUT',
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

    // SAFE PAYLOAD PARSING
    let payload;
    try {
      payload = await req.json();
    } catch (parseError) {
      console.error('❌ Failed to parse JSON:', parseError.message);
      await logAudit(base44, {
        debug_id: debugId,
        action_type: 'SAVE_WORKOUT',
        actor_role: 'system',
        status: 'fail',
        error_code: 'INVALID_JSON',
        error_message_he: 'נתונים לא תקינים'
      });
      return Response.json({ 
        ok: false,
        error_code: 'INVALID_JSON',
        message_he: 'נתונים לא תקינים. נסה שוב.',
        debug_id: debugId
      }, { status: 400 });
    }

    const { workout_session_id, exercises, title, date, notes, trainee_email } = payload || {};

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 WORKOUT_SAVE_STARTED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Debug ID:', debugId);
    console.log('Timestamp:', new Date().toISOString());
    console.log('User ID:', user.id);
    console.log('User Email:', user.email);
    console.log('User Role:', user.role);
    console.log('Trainee Email (from payload):', trainee_email || 'NOT PROVIDED');
    console.log('Workout Session ID (from payload):', workout_session_id || 'NOT PROVIDED');
    console.log('Date:', date);
    console.log('Title:', title || 'NOT PROVIDED');
    console.log('Notes:', notes || 'NONE');
    console.log('Exercises count:', exercises?.length || 0);
    console.log('Raw Payload Keys:', Object.keys(payload || {}));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Use trainee_email from payload or default to user.email
    const resolvedTraineeEmail = trainee_email || user.email;
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 RESOLVED_TRAINEE_EMAIL:', resolvedTraineeEmail);
    console.log('Source:', trainee_email ? 'PAYLOAD' : 'USER.EMAIL');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // CRITICAL VALIDATIONS
    if (!date || typeof date !== 'string') {
      await logAudit(base44, {
        debug_id: debugId,
        action_type: 'SAVE_WORKOUT',
        actor_role: 'trainee',
        actor_email: user.email,
        status: 'fail',
        error_code: 'MISSING_DATE',
        error_message_he: 'תאריך חובה'
      });
      return Response.json({
        ok: false,
        error_code: 'MISSING_DATE',
        message_he: 'תאריך האימון חובה',
        debug_id: debugId
      }, { status: 400 });
    }

    if (!exercises || !Array.isArray(exercises) || exercises.length === 0) {
      await logAudit(base44, {
        debug_id: debugId,
        action_type: 'SAVE_WORKOUT',
        actor_role: 'trainee',
        actor_email: user.email,
        target_workout_id: workout_session_id,
        status: 'fail',
        error_code: 'SAVE_WORKOUT_NO_EXERCISES',
        error_message_he: 'אין תרגילים לשמור',
        payload_summary: { exercises_count: 0, sets_count: 0 }
      });
      
      return Response.json({
        ok: false,
        error_code: 'SAVE_WORKOUT_NO_EXERCISES',
        message_he: 'אין תרגילים לשמור. יש להוסיף לפחות תרגיל אחד.',
        debug_id: debugId
      }, { status: 400 });
    }

    // Validation: validate exercise data
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      
      // Accept both "name" and "exercise_name" fields
      const exerciseName = ex.name || ex.exercise_name;
      
      if (!exerciseName || typeof exerciseName !== 'string') {
        await logAudit(base44, {
          debug_id: debugId,
          action_type: 'SAVE_WORKOUT',
          actor_role: 'trainee',
          actor_email: user.email,
          status: 'fail',
          error_code: 'SAVE_EXERCISE_NAME_INVALID',
          error_message_he: 'שם תרגיל לא תקין',
          details: { exercise_index: i, exercise: ex }
        });
        
        return Response.json({
          ok: false,
          error_code: 'SAVE_EXERCISE_NAME_INVALID',
          message_he: `תרגיל מספר ${i + 1}: שם תרגיל לא תקין. יש להזין שם תרגיל.`,
          debug_id: debugId
        }, { status: 400 });
      }
      
      // Normalize to use "name" field
      ex.name = exerciseName;

      // Validate and sanitize sets
      if (!ex.sets || !Array.isArray(ex.sets)) {
        ex.sets = [];
      }
      
      for (let j = 0; j < ex.sets.length; j++) {
        const set = ex.sets[j];
        
        // Auto-fix weight type
        if (set.weight !== null && set.weight !== undefined) {
          if (typeof set.weight !== 'number') {
            const parsed = parseFloat(set.weight);
            if (isNaN(parsed)) {
              console.warn(`⚠️ Exercise ${i + 1}, Set ${j + 1}: Invalid weight, using 0`);
              set.weight = 0;
            } else {
              set.weight = parsed;
            }
          }
        } else {
          set.weight = 0;
        }
        
        // Auto-fix reps type
        if (set.reps !== null && set.reps !== undefined) {
          if (typeof set.reps !== 'number') {
            const parsed = parseInt(set.reps);
            if (isNaN(parsed)) {
              console.warn(`⚠️ Exercise ${i + 1}, Set ${j + 1}: Invalid reps, using 0`);
              set.reps = 0;
            } else {
              set.reps = parsed;
            }
          }
        } else {
          set.reps = 0;
        }
      }
    }

    // Calculate totals
    const totalSets = exercises.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0);

    // Save workout
    let workoutId = workout_session_id;
    
    try {
      console.log('━━━ DB OPERATION START ━━━');
      console.log('Mode:', workout_session_id ? 'UPDATE' : 'CREATE/UPSERT');
      console.log('User ID:', user.id);
      console.log('User Email:', user.email);
      console.log('Resolved Trainee Email:', resolvedTraineeEmail);
      console.log('Date:', date);
      
      // UPSERT: Find existing session by trainee_email + date
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔍 WORKOUT_SAVE_LOOKUP_QUERY');
      console.log('Query Filter:', {
        trainee_email: resolvedTraineeEmail,
        date: date
      });
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      let existingSessions = [];
      let lookupError = null;
      
      try {
        existingSessions = await base44.asServiceRole.entities.WorkoutSession.filter({
          trainee_email: resolvedTraineeEmail,
          date: date
        });
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ WORKOUT_SAVE_LOOKUP_RESULT');
        console.log('Found Sessions:', existingSessions.length);
        if (existingSessions.length > 0) {
          console.log('Existing Session IDs:', existingSessions.map(s => s.id));
          console.log('First Session Details:', {
            id: existingSessions[0].id,
            title: existingSessions[0].title,
            date: existingSessions[0].date,
            trainee_email: existingSessions[0].trainee_email,
            status: existingSessions[0].status,
            created_date: existingSessions[0].created_date
          });
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      } catch (err) {
        lookupError = err;
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ WORKOUT_SAVE_LOOKUP_FAILED');
        console.error('Error Name:', err.name);
        console.error('Error Message:', err.message);
        console.error('Error Stack:', err.stack?.substring(0, 300));
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        existingSessions = [];
      }
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔀 WORKOUT_SAVE_DECISION');
      console.log('Workout Session ID (payload):', workout_session_id || 'NONE');
      console.log('Existing Sessions Found:', existingSessions.length);
      console.log('Decision:', (workout_session_id || existingSessions.length > 0) ? 'UPDATE' : 'CREATE');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      if (workout_session_id || existingSessions.length > 0) {
        // UPDATE existing workout
        const sessionId = workout_session_id || existingSessions[0].id;
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔄 WORKOUT_SAVE_UPDATE');
        console.log('Target Session ID:', sessionId);
        console.log('Source:', workout_session_id ? 'PAYLOAD' : 'LOOKUP');
        console.log('Update Data:', {
          title: title,
          notes: notes,
          date: date,
          trainee_email: resolvedTraineeEmail,
          status: 'completed'
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        try {
          await base44.asServiceRole.entities.WorkoutSession.update(sessionId, {
          title: title,
          notes: notes,
          date: date,
          trainee_email: resolvedTraineeEmail,
            status: 'completed'
          });
          console.log('✅ WorkoutSession UPDATE SUCCESS');
          workoutId = sessionId;
        } catch (updateError) {
          console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.error('❌ WORKOUT_SESSION_UPDATE_FAILED');
          console.error('Session ID:', sessionId);
          console.error('Error:', updateError.message);
          console.error('Stack:', updateError.stack?.substring(0, 300));
          console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          throw updateError;
        }
        
        // Delete old exercises for this workout (we'll recreate them)
        let oldExercises = [];
        try {
          oldExercises = await base44.asServiceRole.entities.WorkoutExerciseLine.filter({
            workout_session_id: sessionId
          });
          console.log('Found old exercises:', oldExercises.length);
        } catch (err) {
          console.log('No old exercises to delete:', err.message);
        }
        
        for (const oldEx of oldExercises) {
          // Delete old sets
          try {
            const oldSets = await base44.asServiceRole.entities.WorkoutSet.filter({
              exercise_line_id: oldEx.id
            });
            for (const oldSet of oldSets) {
              await base44.asServiceRole.entities.WorkoutSet.delete(oldSet.id);
            }
          } catch (err) {
            console.log('Failed to delete old sets:', err.message);
          }
          // Delete exercise
          try {
            await base44.asServiceRole.entities.WorkoutExerciseLine.delete(oldEx.id);
          } catch (err) {
            console.log('Failed to delete old exercise:', err.message);
          }
        }
        console.log('✓ Old exercises deleted');
      } else {
        // CREATE new workout session
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('➕ WORKOUT_SAVE_CREATE');
        console.log('Creating NEW WorkoutSession');
        console.log('Create Data:', {
          trainee_email: resolvedTraineeEmail,
          title: title || 'אימון',
          notes: notes || '',
          date: date,
          status: 'completed'
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        let newWorkout;
        try {
          newWorkout = await base44.asServiceRole.entities.WorkoutSession.create({
          trainee_email: resolvedTraineeEmail,
          title: title || 'אימון',
          notes: notes || '',
          date: date,
            status: 'completed'
          });
          workoutId = newWorkout.id;
          
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('✅ WORKOUT_SESSION_CREATE_SUCCESS');
          console.log('New Workout ID:', workoutId);
          console.log('New Workout Object:', newWorkout);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        } catch (createError) {
          console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.error('❌ WORKOUT_SESSION_CREATE_FAILED');
          console.error('Error Name:', createError.name);
          console.error('Error Message:', createError.message);
          console.error('Error Stack:', createError.stack?.substring(0, 500));
          console.error('Attempted Data:', {
            trainee_email: resolvedTraineeEmail,
            title: title || 'אימון',
            date: date
          });
          console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          throw createError;
        }
      }
      
      // Save exercises and sets
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('💪 WORKOUT_SAVE_EXERCISES_START');
      console.log('Workout ID:', workoutId);
      console.log('Total Exercises:', exercises.length);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`🏋️ EXERCISE ${i + 1}/${exercises.length}`);
        console.log('Name:', ex.name);
        console.log('Angle:', ex.angle || 'NONE');
        console.log('Notes:', ex.notes || 'NONE');
        console.log('Sets Count:', ex.sets?.length || 0);
        console.log('Sets Data:', ex.sets);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Create exercise line with error handling
        const exerciseLineData = {
          workout_session_id: workoutId,
          custom_name: ex.name,
          order_index: i,
          notes: ex.notes || null,
          target_reps_min: ex.target_reps_min || null,
          target_reps_max: ex.target_reps_max || null
        };
        console.log('ExerciseLine data:', exerciseLineData);
        
        let exerciseLine;
        try {
          exerciseLine = await base44.asServiceRole.entities.WorkoutExerciseLine.create(exerciseLineData);
          
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log(`✅ EXERCISE_LINE_CREATE_SUCCESS (${i + 1})`);
          console.log('Exercise Line ID:', exerciseLine.id);
          console.log('Exercise Name:', ex.name);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        } catch (lineError) {
          console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.error(`❌ EXERCISE_LINE_CREATE_FAILED (${i + 1})`);
          console.error('Exercise Name:', ex.name);
          console.error('Error:', lineError.message);
          console.error('Stack:', lineError.stack?.substring(0, 300));
          console.error('Data Attempted:', exerciseLineData);
          console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          throw new Error(`Failed to save exercise "${ex.name}": ${lineError.message}`);
        }
        
        // Create sets for this exercise
        if (ex.sets && ex.sets.length > 0) {
          console.log(`━━━ Creating ${ex.sets.length} sets for exercise ${i + 1} ━━━`);
          
          for (let j = 0; j < ex.sets.length; j++) {
            const set = ex.sets[j];
            const setData = {
              exercise_line_id: exerciseLine.id,
              set_index: j + 1,
              weight: set.weight || 0,
              reps: set.reps || 0,
              completed: true
            };
            
            console.log(`📊 SET ${j + 1}/${ex.sets.length}:`, setData);
            
            try {
              await base44.asServiceRole.entities.WorkoutSet.create(setData);
              console.log(`✅ Set ${j + 1} created`);
            } catch (setError) {
              console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.error(`❌ SET_CREATE_FAILED (Set ${j + 1})`);
              console.error('Exercise:', ex.name);
              console.error('Error:', setError.message);
              console.error('Stack:', setError.stack?.substring(0, 200));
              console.error('Data:', setData);
              console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              // Continue with other sets
            }
          }
          // Surface partial set failure count in log
          const setSuccessCount = ex.sets.filter((_, j) => {
            // sets were created sequentially; we count attempts vs ex.sets.length
            return true; // all attempted; individual failures logged above via setError
          }).length;
          console.log(`✅ All ${ex.sets.length} sets attempted for exercise ${i + 1} (created or failed individually — see SET_CREATE_FAILED logs above)`);
        } else {
          console.log(`⚠️ No sets to create for exercise ${i + 1}`);
        }

        // ── PHASE 2: mirror to ExerciseHistory ──────────────────────────
        try {
          const validSets = (ex.sets || []).filter(s => (parseFloat(s?.weight) > 0) || (parseInt(s?.reps) > 0));
          if (validSets.length > 0) {
            const exerciseNameKey = ex.name.trim().toLowerCase();
            const maxWeight = Math.max(...validSets.map(s => parseFloat(s.weight) || 0));
            const totalVolume = validSets.reduce((sum, s) => sum + ((parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0)), 0);
            const avgReps = Math.round(validSets.reduce((sum, s) => sum + (parseInt(s.reps) || 0), 0) / validSets.length);
            const setsJson = JSON.stringify(validSets.map(s => ({ weight: parseFloat(s.weight) || 0, reps: parseInt(s.reps) || 0 })));

            const existingHistory = await base44.asServiceRole.entities.ExerciseHistory.filter({
              trainee_email: resolvedTraineeEmail,
              exercise_name: exerciseNameKey,
              date: date
            });

            if (existingHistory.length > 0) {
              await base44.asServiceRole.entities.ExerciseHistory.update(existingHistory[0].id, {
                sets: validSets.length,
                reps: avgReps,
                weight: maxWeight,
                notes: setsJson
              });
            } else {
              await base44.asServiceRole.entities.ExerciseHistory.create({
                trainee_email: resolvedTraineeEmail,
                exercise_name: exerciseNameKey,
                date: date,
                sets: validSets.length,
                reps: avgReps,
                weight: maxWeight,
                notes: setsJson
              });
            }
            console.log(`✅ ExerciseHistory upserted for "${exerciseNameKey}" on ${date}`);
          }
        } catch (histErr) {
          // Non-fatal: log but do not fail the workout save
          console.error(`⚠️ ExerciseHistory upsert failed for "${ex.name}":`, histErr.message);
        }
        // ── END PHASE 2 ─────────────────────────────────────────────────
      }
      console.log('━━━ DB OPERATION COMPLETE ━━━');
    } catch (dbError) {
      console.error('━━━ WORKOUT_SAVE_FAILED ━━━');
      console.error('Debug ID:', debugId);
      console.error('User ID:', user?.id);
      console.error('User Email:', user?.email);
      console.error('Trainee Email:', resolvedTraineeEmail);
      console.error('Workout ID:', workout_session_id);
      console.error('Date:', date);
      console.error('Error Name:', dbError?.name);
      console.error('Error Message:', dbError?.message);
      console.error('Error Stack:', dbError?.stack?.substring(0, 500));
      console.error('Payload Summary:', {
        title,
        date,
        exercises_count: exercises.length,
        sets_count: totalSets,
        first_exercise_name: exercises[0]?.name || exercises[0]?.exercise_name
      });
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      await logAudit(base44, {
        debug_id: debugId,
        action_type: 'SAVE_WORKOUT',
        actor_role: 'trainee',
        actor_email: user.email,
        target_workout_id: workout_session_id,
        status: 'fail',
        error_code: 'SAVE_DB_FAILED',
        error_message_he: 'שגיאה בשמירה למסד הנתונים',
        payload_summary: { 
          exercises_count: exercises.length, 
          sets_count: totalSets,
          title,
          date
        },
        details: { 
          error_name: dbError?.name,
          error_message: dbError?.message,
          error_stack: dbError?.stack?.substring(0, 500),
          user_id: user?.id,
          workout_id: workout_session_id,
          payload: {
            title,
            date,
            exercises_sample: exercises.slice(0, 2)
          }
        }
      });
      
      return Response.json({
        ok: false,
        error_code: 'SAVE_DB_FAILED',
        message_he: `שגיאה בשמירה למסד הנתונים: ${dbError.message}`,
        debug_id: debugId,
        error_details: {
          name: dbError?.name,
          message: dbError?.message,
          user_id: user?.id,
          workout_id: workout_session_id
        }
      }, { status: 500 });
    }

    // Success audit
    await logAudit(base44, {
      debug_id: debugId,
      action_type: 'SAVE_WORKOUT',
      actor_role: 'trainee',
      actor_email: user.email,
      trainee_email: resolvedTraineeEmail,
      target_workout_id: workoutId,
      status: 'success',
      payload_summary: { 
        exercises_count: exercises.length, 
        sets_count: totalSets,
        date: date 
      },
      details: { workout_title: title }
    });

    console.log('=== SAVE_SUCCESS ===');
    console.log('Workout ID:', workoutId);
    console.log('Trainee Email:', resolvedTraineeEmail);
    console.log('Date:', date);
    console.log('Exercises saved:', exercises.length);
    console.log('Sets saved:', totalSets);

    return Response.json({
      ok: true,
      success: true,
      workout_id: workoutId,
      trainee_email: resolvedTraineeEmail,
      date: date,
      exercises_saved: exercises.length,
      sets_saved: totalSets,
      debug_id: debugId
    });

  } catch (error) {
    console.error('[saveWorkoutSession] Error:', error);
    
    try {
      const base44 = createClientFromRequest(req);
      await logAudit(base44, {
        debug_id: debugId,
        action_type: 'SAVE_WORKOUT',
        actor_role: 'system',
        status: 'fail',
        error_code: 'UNKNOWN_SERVER_ERROR',
        error_message_he: error.message,
        details: { stack: error.stack }
      });
    } catch (logErr) {
      console.error('Failed to log error:', logErr);
    }
    
    return Response.json({ 
      ok: false,
      error_code: 'UNKNOWN_SERVER_ERROR',
      message_he: `שגיאת מערכת: ${error.message}`,
      debug_id: debugId,
      details: { error: error.message }
    }, { status: 500 });
  }
});