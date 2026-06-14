/**
 * UPDATE METRICS — Track user actions after message
 *
 * Called when:
 * - User opens message (if trackable)
 * - User clicks link
 * - User logs meal/water/workout
 * - User logs in
 *
 * Updates WhatsAppPerformance with:
 * - action_taken
 * - action_taken_at
 * - conversion (true if action matches trigger goal)
 * - silent_user_count (increment if action is "ignored")
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Map trigger type to desired action
const TRIGGER_CONVERSIONS = {
  'onboarding_msg1': 'login',
  'onboarding_msg2': 'login',
  'onboarding_msg3': 'login',
  'activation_no_login': 'login',
  'activation_no_meals': 'logged_meal',
  'activation_no_water': 'logged_water',
  'recovery_3days': 'login',
  'recovery_7days': 'login',
  'engagement_3day_streak': 'any',
  'engagement_protein_goal': 'logged_meal',
  'engagement_calorie_goal': 'logged_meal',
  'workout_motivation': 'logged_workout',
  'ai_suggestion': 'logged_meal',
  'meal_reminder': 'logged_meal',
  'water_reminder': 'logged_water'
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { traineeEmail, actionTaken, performanceRecordId } = await req.json();

    if (!traineeEmail || !actionTaken || !performanceRecordId) {
      return Response.json({
        ok: false,
        error: 'Missing: traineeEmail, actionTaken, performanceRecordId'
      }, { status: 400 });
    }

    // Get the performance record
    const perfRecs = await base44.asServiceRole.entities.WhatsAppPerformance.filter({
      id: performanceRecordId
    });
    const perfRec = perfRecs[0];

    if (!perfRec) {
      return Response.json({
        ok: false,
        error: 'Performance record not found'
      }, { status: 404 });
    }

    // Determine conversion
    const expectedAction = TRIGGER_CONVERSIONS[perfRec.trigger_type] || 'any';
    const isConversion = expectedAction === 'any' || expectedAction === actionTaken;

    // Update silent count
    let newSilentCount = perfRec.silent_user_count || 0;
    let silencedUntil = null;

    if (actionTaken === 'ignored') {
      newSilentCount += 1;
      if (newSilentCount >= 3) {
        // Silence for 3 days
        silencedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      }
    } else if (isConversion) {
      // User took desired action — reset silent count
      newSilentCount = 0;
      silencedUntil = null;
    }

    // Update record
    await base44.asServiceRole.entities.WhatsAppPerformance.update(performanceRecordId, {
      action_taken: actionTaken,
      action_taken_at: new Date().toISOString(),
      conversion: isConversion,
      silent_user_count: newSilentCount,
      silenced_until: silencedUntil
    });

    console.log(`[METRICS_UPDATED] ${traineeEmail} | action=${actionTaken} | conversion=${isConversion} | silent_count=${newSilentCount}`);

    return Response.json({
      ok: true,
      conversion: isConversion,
      silent_count: newSilentCount,
      silenced_until: silencedUntil
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});