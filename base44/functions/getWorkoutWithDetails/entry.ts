import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      return Response.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    // Get session
    const sessions = await base44.asServiceRole.entities.WorkoutSession.filter({ id: sessionId });
    if (sessions.length === 0) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }
    const session = sessions[0];

    // Get exercise lines
    const lines = await base44.asServiceRole.entities.WorkoutExerciseLine.filter({
      workout_session_id: sessionId,
    });

    // Sort by order_index
    lines.sort((a, b) => a.order_index - b.order_index);

    // Get all exercises for name lookup
    const exercises = await base44.asServiceRole.entities.Exercise.list();
    const exerciseMap = {};
    exercises.forEach(ex => {
      exerciseMap[ex.id] = ex;
    });

    // Get sets for each line
    const linesWithSets = await Promise.all(
      lines.map(async (line) => {
        const sets = await base44.asServiceRole.entities.WorkoutSet.filter({
          exercise_line_id: line.id,
        });
        
        // Sort sets by set_index
        sets.sort((a, b) => a.set_index - b.set_index);

        // Get exercise name
        let exerciseName = line.custom_name;
        if (line.exercise_id && exerciseMap[line.exercise_id]) {
          exerciseName = exerciseMap[line.exercise_id].name_he;
        }

        return {
          id: line.id,
          exercise_id: line.exercise_id,
          exercise_name: exerciseName,
          custom_name: line.custom_name,
          equipment_type: line.equipment_type,
          angle_type: line.angle_type,
          grip_type: line.grip_type,
          order_index: line.order_index,
          notes: line.notes,
          sets: sets.map(s => ({
            id: s.id,
            set_index: s.set_index,
            weight: s.weight,
            reps: s.reps,
            completed: s.completed,
          })),
        };
      })
    );

    return Response.json({
      session: {
        id: session.id,
        trainee_email: session.trainee_email,
        date: session.date,
        title: session.title,
        notes: session.notes,
        status: session.status,
      },
      exercises: linesWithSets,
    });

  } catch (error) {
    console.error('[getWorkoutWithDetails] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});