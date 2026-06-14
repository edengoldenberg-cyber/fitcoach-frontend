/**
 * SUBMIT WORKOUT FEEDBACK
 *
 * Save trainee's post-workout feedback:
 * - RPE (1-10)
 * - Completed (yes/no)
 * - Notes
 * - Pain/discomfort
 * - Actual duration
 *
 * Stores in WorkoutCompletionFeedback
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function submitWorkoutFeedback(base44, feedbackData) {
  try {
    // Get trainee
    const user = await base44.auth.me();
    if (!user) {
      return { ok: false, error: 'Unauthorized' };
    }

    const trainees = await base44.asServiceRole.entities.Trainee.filter({
      user_email: user.email
    }).catch(() => []);

    if (trainees.length === 0) {
      return { ok: false, error: 'Trainee not found' };
    }

    const trainee = trainees[0];

    // Calculate actual duration if start/end provided
    let actualDuration = null;
    if (feedbackData.start_time && feedbackData.end_time) {
      const start = new Date(feedbackData.start_time);
      const end = new Date(feedbackData.end_time);
      actualDuration = Math.round((end - start) / (1000 * 60));
    }

    // Save feedback
    const feedback = await base44.entities.WorkoutCompletionFeedback.create({
      trainee_email: user.email,
      trainee_id: trainee.id,
      coach_email: trainee.coach_email,
      date: feedbackData.date,
      daily_workout_group_id: feedbackData.daily_workout_group_id,
      selected_option_id: feedbackData.selected_option_id,
      selected_option_title: feedbackData.selected_option_title,
      planned_effort_score: feedbackData.planned_effort_score,
      actual_rpe: feedbackData.actual_rpe || null,
      completed: feedbackData.completed,
      completion_notes: feedbackData.completion_notes || '',
      pain_discomfort: feedbackData.pain_discomfort || false,
      pain_notes: feedbackData.pain_notes || '',
      submitted_at: new Date().toISOString(),
      start_time: feedbackData.start_time || null,
      end_time: feedbackData.end_time || null,
      actual_duration_minutes: actualDuration
    });

    console.log(`[WORKOUT_FEEDBACK] ${user.email} | option=${feedbackData.selected_option_title} | rpe=${feedbackData.actual_rpe} | completed=${feedbackData.completed}`);

    return {
      ok: true,
      feedback_id: feedback.id
    };
  } catch (err) {
    console.error('[submitWorkoutFeedback] Error:', err.message);
    return { ok: false, error: err.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const feedbackData = await req.json();

    const result = await submitWorkoutFeedback(base44, feedbackData);

    return Response.json(result);
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

export { submitWorkoutFeedback };