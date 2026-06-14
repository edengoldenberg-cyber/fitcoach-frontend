import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const traineeEmail = body.traineeEmail;
    const exerciseId = body.exerciseId;

    if (!traineeEmail || !exerciseId) {
      return Response.json({ 
        error: 'Missing required parameters: traineeEmail, exerciseId' 
      }, { status: 400 });
    }

    // PHASE 3: bounded read — scoped strictly to this trainee
    const sessions = await base44.asServiceRole.entities.WorkoutSession.filter({
      trainee_email: traineeEmail,
    });

    if (sessions.length === 0) {
      return Response.json({
        history: [],
        stats: {
          totalSessions: 0,
          topWeight: 0,
          totalVolume: 0,
        },
      });
    }

    // Get all exercise lines for this exercise
    const allLines = await base44.asServiceRole.entities.WorkoutExerciseLine.filter({
      exercise_id: exerciseId,
    });

    // Filter lines that belong to this trainee's sessions
    const sessionIds = new Set(sessions.map(s => s.id));
    const lines = allLines.filter(line => sessionIds.has(line.workout_session_id));

    if (lines.length === 0) {
      return Response.json({
        history: [],
        stats: {
          totalSessions: 0,
          topWeight: 0,
          totalVolume: 0,
        },
      });
    }

    // Get sets for each line
    const history = await Promise.all(
      lines.map(async (line) => {
        const sets = await base44.asServiceRole.entities.WorkoutSet.filter({
          exercise_line_id: line.id,
        });
        sets.sort((a, b) => a.set_index - b.set_index);

        const session = sessions.find(s => s.id === line.workout_session_id);

        return {
          date: session?.date,
          sessionId: session?.id,
          sessionTitle: session?.title,
          sets: sets.map(s => ({
            weight: s.weight,
            reps: s.reps,
          })),
        };
      })
    );

    // Sort by date desc
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculate stats
    let topWeight = 0;
    let totalVolume = 0;

    history.forEach(h => {
      h.sets.forEach(set => {
        if (set.weight > topWeight) topWeight = set.weight;
        totalVolume += set.weight * set.reps;
      });
    });

    return Response.json({
      history: history.slice(0, 20), // Last 20 sessions
      stats: {
        totalSessions: history.length,
        topWeight,
        totalVolume,
      },
    });

  } catch (error) {
    console.error('[getExerciseHistory] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});