import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function generateTraceId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `COPY-${timestamp}-${random}`;
}

Deno.serve(async (req) => {
  const traceId = generateTraceId();
  const startTime = Date.now();
  
  const report = {
    ok: false,
    traceId,
    steps: [],
    error: null
  };

  try {
    const base44 = createClientFromRequest(req);
    
    // S1: Auth
    report.steps.push({ name: 'auth', label: 'בדיקת משתמש', ok: null });
    
    const user = await base44.auth.me();
    if (!user?.email) {
      report.steps[0].ok = false;
      report.steps[0].error = 'משתמש לא מחובר';
      report.error = {
        step: 'auth',
        code: 'NO_USER',
        message: 'משתמש לא מחובר (user.email חסר)'
      };
      
      await base44.asServiceRole.entities.CopyLog.create({
        action_type: 'copy_exercise',
        trainee_email: '',
        success: false,
        error_text: 'No user',
        payload_json: {},
        duration_ms: Date.now() - startTime
      });
      
      return Response.json(report, { status: 401 });
    }

    report.steps[0].ok = true;
    report.steps[0].details = user.email;

    // Parse payload
    const payload = await req.json();
    const { dailyWorkoutId, dailyWorkoutLineId, exercise, targetDate } = payload;

    // S2: Date validation
    report.steps.push({ name: 'date', label: 'בדיקת תאריך', ok: null });
    
    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      report.steps[1].ok = false;
      report.steps[1].error = 'תאריך חסר או לא תקין';
      report.error = {
        step: 'date',
        code: 'INVALID_DATE',
        message: 'לא נבחר תאריך תקין ביומן'
      };
      
      await base44.asServiceRole.entities.CopyLog.create({
        action_type: 'copy_exercise',
        trainee_email: user.email,
        target_date: targetDate || null,
        success: false,
        error_text: 'Invalid date',
        payload_json: payload,
        duration_ms: Date.now() - startTime
      });
      
      return Response.json(report, { status: 400 });
    }

    report.steps[1].ok = true;
    report.steps[1].details = targetDate;

    // S3: Daily workout line validation
    report.steps.push({ name: 'loadLine', label: 'טעינת תרגיל מאימון יומי', ok: null });
    
    if (!dailyWorkoutId) {
      report.steps[2].ok = false;
      report.steps[2].error = 'אין מזהה אימון יומי';
      report.error = {
        step: 'loadLine',
        code: 'NO_DAILY_WORKOUT_ID',
        message: 'אין אימון יומי לתאריך זה'
      };
      
      await base44.asServiceRole.entities.CopyLog.create({
        action_type: 'copy_exercise',
        trainee_email: user.email,
        target_date: targetDate,
        daily_workout_id: null,
        success: false,
        error_text: 'No daily workout ID',
        payload_json: payload,
        duration_ms: Date.now() - startTime
      });
      
      return Response.json(report, { status: 400 });
    }

    if (!exercise?.exercise_name) {
      report.steps[2].ok = false;
      report.steps[2].error = 'אין שם תרגיל';
      report.error = {
        step: 'loadLine',
        code: 'NO_EXERCISE_NAME',
        message: 'אין מזהה שורת תרגיל באימון היומי'
      };
      
      await base44.asServiceRole.entities.CopyLog.create({
        action_type: 'copy_exercise',
        trainee_email: user.email,
        target_date: targetDate,
        daily_workout_id: dailyWorkoutId,
        success: false,
        error_text: 'No exercise name',
        payload_json: payload,
        duration_ms: Date.now() - startTime
      });
      
      return Response.json(report, { status: 400 });
    }

    report.steps[2].ok = true;
    report.steps[2].details = {
      exercise_name: exercise.exercise_name,
      sets: exercise.sets || 4,
      reps: `${exercise.reps_min || ''}-${exercise.reps_max || ''}`
    };

    // S4: Get or create trainee workout
    report.steps.push({ name: 'getOrCreateWorkout', label: 'יצירת/מציאת אימון למתאמן', ok: null });
    
    let traineeWorkouts = await base44.asServiceRole.entities.TraineeWorkout.filter({
      trainee_email: user.email,
      date: targetDate
    });

    let traineeWorkout;
    if (traineeWorkouts.length === 0) {
      // Create new workout
      traineeWorkout = await base44.asServiceRole.entities.TraineeWorkout.create({
        trainee_email: user.email,
        date: targetDate,
        title: 'אימון יומי',
        source_daily_workout_id: dailyWorkoutId
      });
    } else {
      traineeWorkout = traineeWorkouts[0];
    }

    if (!traineeWorkout?.id) {
      report.steps[3].ok = false;
      report.steps[3].error = 'נכשל ביצירת אימון';
      report.error = {
        step: 'getOrCreateWorkout',
        code: 'WORKOUT_CREATE_FAILED',
        message: 'נכשל ביצירת אימון למתאמן'
      };
      
      await base44.asServiceRole.entities.CopyLog.create({
        action_type: 'copy_exercise',
        trainee_email: user.email,
        target_date: targetDate,
        daily_workout_id: dailyWorkoutId,
        success: false,
        error_text: 'Failed to create trainee workout',
        payload_json: payload,
        duration_ms: Date.now() - startTime
      });
      
      return Response.json(report, { status: 500 });
    }

    report.steps[3].ok = true;
    report.steps[3].details = `ID: ${traineeWorkout.id}`;

    // S5: Check for duplicate
    const existingExercises = await base44.asServiceRole.entities.TraineeWorkoutExercise.filter({
      trainee_workout_id: traineeWorkout.id
    });

    const beforeCount = existingExercises.length;

    const isDuplicate = existingExercises.some(ex => 
      ex.exercise_name === exercise.exercise_name
    );

    if (isDuplicate) {
      report.steps.push({ 
        name: 'insertExercise', 
        label: 'הוספת תרגיל', 
        ok: true,
        details: 'כבר קיים - דילוג'
      });
      
      report.ok = true;
      
      await base44.asServiceRole.entities.CopyLog.create({
        action_type: 'copy_exercise',
        trainee_email: user.email,
        target_date: targetDate,
        daily_workout_id: dailyWorkoutId,
        exercise_name: exercise.exercise_name,
        trainee_workout_id: traineeWorkout.id,
        success: true,
        error_text: 'Duplicate - skipped',
        payload_json: payload,
        duration_ms: Date.now() - startTime
      });
      
      return Response.json({
        ...report,
        skipped: true,
        message: 'התרגיל כבר קיים באימון'
      });
    }

    // Insert exercise
    report.steps.push({ name: 'insertExercise', label: 'הוספת תרגיל', ok: null });
    
    const newExercise = await base44.asServiceRole.entities.TraineeWorkoutExercise.create({
      trainee_workout_id: traineeWorkout.id,
      exercise_name: exercise.exercise_name,
      notes: exercise.notes || '',
      order_index: beforeCount
    });

    if (!newExercise?.id) {
      report.steps[4].ok = false;
      report.steps[4].error = 'נכשל ביצירת תרגיל';
      report.error = {
        step: 'insertExercise',
        code: 'EXERCISE_CREATE_FAILED',
        message: 'נכשל ביצירת תרגיל במאגר'
      };
      
      await base44.asServiceRole.entities.CopyLog.create({
        action_type: 'copy_exercise',
        trainee_email: user.email,
        target_date: targetDate,
        daily_workout_id: dailyWorkoutId,
        exercise_name: exercise.exercise_name,
        trainee_workout_id: traineeWorkout.id,
        success: false,
        error_text: 'Failed to create exercise',
        payload_json: payload,
        duration_ms: Date.now() - startTime
      });
      
      return Response.json(report, { status: 500 });
    }

    report.steps[4].ok = true;
    report.steps[4].details = `ID: ${newExercise.id}`;

    // Fetch last workout data for this exercise (history)
    const previousWorkouts = await base44.asServiceRole.entities.TraineeWorkout.filter({
      trainee_email: user.email
    });
    
    // Sort by date descending
    previousWorkouts.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    let previousSets = [];
    for (const prevWorkout of previousWorkouts) {
      if (prevWorkout.date === targetDate) continue; // Skip today's workout
      
      const prevExercises = await base44.asServiceRole.entities.TraineeWorkoutExercise.filter({
        trainee_workout_id: prevWorkout.id,
        exercise_name: exercise.exercise_name
      });
      
      if (prevExercises.length > 0) {
        const prevExercise = prevExercises[0];
        previousSets = await base44.asServiceRole.entities.TraineeWorkoutSet.filter({
          trainee_workout_exercise_id: prevExercise.id
        });
        previousSets.sort((a, b) => a.set_index - b.set_index);
        break; // Found the last workout with this exercise
      }
    }

    // Create sets with history data
    const setsCount = exercise.sets || 4;
    for (let i = 1; i <= setsCount; i++) {
      const previousSet = previousSets.find(s => s.set_index === i);
      
      await base44.asServiceRole.entities.TraineeWorkoutSet.create({
        trainee_workout_exercise_id: newExercise.id,
        set_index: i,
        reps_min: exercise.reps_min || null,
        reps_max: exercise.reps_max || null,
        target_reps: exercise.reps_max || exercise.reps_min || null,
        weight: previousSet?.weight || null,
        reps: previousSet?.reps || null,
        completed: false
      });
    }

    // S6: Verify
    report.steps.push({ name: 'verify', label: 'אימות', ok: null });
    
    const afterExercises = await base44.asServiceRole.entities.TraineeWorkoutExercise.filter({
      trainee_workout_id: traineeWorkout.id
    });

    const afterCount = afterExercises.length;

    if (afterCount === beforeCount) {
      report.steps[5].ok = false;
      report.steps[5].error = 'התרגיל לא נוסף בפועל';
      report.error = {
        step: 'verify',
        code: 'VERIFY_FAILED',
        message: 'התרגיל לא נוסף בפועל (verify failed)'
      };
      
      await base44.asServiceRole.entities.CopyLog.create({
        action_type: 'copy_exercise',
        trainee_email: user.email,
        target_date: targetDate,
        daily_workout_id: dailyWorkoutId,
        exercise_name: exercise.exercise_name,
        trainee_workout_id: traineeWorkout.id,
        success: false,
        error_text: 'Verify failed',
        payload_json: payload,
        duration_ms: Date.now() - startTime
      });
      
      return Response.json(report, { status: 500 });
    }

    report.steps[5].ok = true;
    report.steps[5].details = `לפני: ${beforeCount}, אחרי: ${afterCount}`;

    report.ok = true;

    // Log success
    await base44.asServiceRole.entities.CopyLog.create({
      action_type: 'copy_exercise',
      trainee_email: user.email,
      target_date: targetDate,
      daily_workout_id: dailyWorkoutId,
      exercise_name: exercise.exercise_name,
      trainee_workout_id: traineeWorkout.id,
      success: true,
      response_text: `Added ${exercise.exercise_name}`,
      payload_json: payload,
      duration_ms: Date.now() - startTime
    });

    return Response.json({
      ...report,
      trainee_workout_id: traineeWorkout.id,
      exercise_id: newExercise.id
    });

  } catch (error) {
    console.error('[copyExerciseToTrainee] Error:', error);
    
    report.error = {
      step: report.steps.find(s => s.ok === null)?.name || 'unknown',
      code: 'EXCEPTION',
      message: error.message,
      stack: error.stack
    };

    // Mark last pending step as failed
    const pendingStep = report.steps.find(s => s.ok === null);
    if (pendingStep) {
      pendingStep.ok = false;
      pendingStep.error = error.message;
    }

    try {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.CopyLog.create({
        action_type: 'copy_exercise',
        trainee_email: '',
        success: false,
        error_text: error.message,
        response_text: error.stack,
        duration_ms: Date.now() - startTime
      });
    } catch (logErr) {
      console.error('Failed to log error:', logErr);
    }
    
    return Response.json(report, { status: 500 });
  }
});