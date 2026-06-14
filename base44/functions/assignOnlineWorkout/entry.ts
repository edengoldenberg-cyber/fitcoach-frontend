import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { trainee_email, date, title, description, exercises } = await req.json();

    if (!trainee_email || !date || !title || !exercises) {
      return Response.json({ 
        success: false,
        message: 'ASSIGN_WORKOUT_ERROR: Missing required fields'
      }, { status: 400 });
    }

    console.log('[assignOnlineWorkout] ASSIGN_WORKOUT_START:', { trainee_email, date, exercises_count: exercises.length });

    // Validate exercises have exercise_id (must use existing Exercise bank)
    const invalidExercises = exercises.filter(ex => !ex.exercise_id);
    if (invalidExercises.length > 0) {
      console.log('[assignOnlineWorkout] ASSIGN_WORKOUT_ERROR: Exercises missing exercise_id');
      return Response.json({
        success: false,
        message: 'ASSIGN_WORKOUT_ERROR: All exercises must have exercise_id from Exercise bank'
      }, { status: 400 });
    }

    // Check if trainee already has a workout for this date
    const existing = await base44.asServiceRole.entities.TraineeWorkout.filter({
      trainee_email,
      date
    });

    // Delete existing if found
    if (existing.length > 0) {
      for (const old of existing) {
        await base44.asServiceRole.entities.TraineeWorkout.delete(old.id);
      }
      console.log('[assignOnlineWorkout] Deleted existing workout');
    }

    // Create workout
    const newWorkout = await base44.asServiceRole.entities.TraineeWorkout.create({
      trainee_email,
      date,
      title,
      notes: description || '',
      status: 'draft',
      exercises: exercises.map(ex => ({
        exercise_id: ex.exercise_id,
        name: ex.exercise_name,
        notes: ex.notes || '',
        video_link: ex.video_link || null,
        sets: Array.from({ length: ex.sets_count || 3 }, (_, i) => ({
          setIndex: i + 1,
          weight: null,
          reps: null,
          reps_min: ex.reps_min || null,
          reps_max: ex.reps_max || null,
          completed: false
        }))
      }))
    });

    console.log('[assignOnlineWorkout] ASSIGN_WORKOUT_SUCCESS:', { workout_id: newWorkout.id });

    // Send notification to trainee
    try {
      await base44.asServiceRole.entities.NotificationJob.create({
        notification_id: crypto.randomUUID(),
        user_email: trainee_email,
        trainee_name: 'מתאמן',
        type: 'coach_message',
        channel: 'in_app',
        status: 'queued',
        scheduled_for: new Date().toISOString(),
        payload: {
          title_he: '💪 אימון חדש ממתין לך!',
          body_he: `המאמן שלח לך אימון חדש: "${title}"`,
          action_url: '/WorkoutLog',
          severity: 'info'
        },
        dedupe_key: `${trainee_email}_workout_assigned_${date}`
      });
    } catch (notifErr) {
      console.error('Failed to send notification:', notifErr);
    }

    return Response.json({
      success: true,
      message: 'ASSIGN_WORKOUT_SUCCESS',
      data: {
        workout_id: newWorkout.id,
        trainee_email,
        date
      }
    });

  } catch (error) {
    console.error('[assignOnlineWorkout] ASSIGN_WORKOUT_ERROR:', error);
    return Response.json({ 
      success: false,
      message: 'ASSIGN_WORKOUT_ERROR',
      error: error.message
    }, { status: 500 });
  }
});