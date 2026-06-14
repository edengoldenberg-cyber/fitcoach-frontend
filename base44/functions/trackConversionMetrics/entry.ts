/**
 * TRACK CONVERSION METRICS
 *
 * Called when user takes action after reminder (meal logged, water logged, etc.)
 *
 * Updates WhatsAppPerformance with:
 * - action_completed = true
 * - time_to_action_minutes
 * - is_converted (action within window)
 * - effectiveness (low/medium/high)
 *
 * Conversion windows:
 * - meal reminder → meal logged within 2 hours = converted
 * - water reminder → water logged within 2 hours = converted
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CONVERSION_WINDOWS_MINUTES = {
  breakfast_check: 120,
  lunch_check: 120,
  dinner_check: 120,
  water_check: 120,
  meal_reminder: 120,
  water_reminder: 120,
  reinforcement_meal: 60,
  reinforcement_water: 60
};

async function trackConversionMetrics(base44, traineeEmail, actionType, performanceRecordId) {
  try {
    // Get performance record
    const perfs = await base44.asServiceRole.entities.WhatsAppPerformance.filter({
      id: performanceRecordId
    }).catch(() => []);

    if (perfs.length === 0) {
      return { ok: false, error: 'Performance record not found' };
    }

    const perf = perfs[0];
    const messageSentTime = new Date(perf.message_sent_at);
    const actionTime = new Date();
    const minutesElapsed = (actionTime.getTime() - messageSentTime.getTime()) / (1000 * 60);

    // Determine if converted
    const conversionWindow = CONVERSION_WINDOWS_MINUTES[perf.trigger_type] || 120;
    const isConverted = minutesElapsed <= conversionWindow;

    // Calculate effectiveness
    let effectiveness = 'LOW';
    if (isConverted) {
      if (minutesElapsed <= 30) effectiveness = 'HIGH';
      else if (minutesElapsed <= 90) effectiveness = 'MEDIUM';
    }

    // Update record
    await base44.asServiceRole.entities.WhatsAppPerformance.update(performanceRecordId, {
      action_completed: true,
      action_completed_at: new Date().toISOString(),
      time_to_action_minutes: Math.round(minutesElapsed),
      is_converted: isConverted,
      effectiveness: effectiveness
    }).catch(() => {});

    console.log(`[CONVERSION_TRACKED] ${traineeEmail} | trigger=${perf.trigger_type} | converted=${isConverted} | time_min=${Math.round(minutesElapsed)}`);

    return {
      ok: true,
      converted: isConverted,
      time_to_action_minutes: Math.round(minutesElapsed),
      effectiveness: effectiveness
    };
  } catch (err) {
    console.error('[trackConversionMetrics] Error:', err.message);
    return { ok: false, error: err.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { traineeEmail, actionType, performanceRecordId } = await req.json();

    if (!traineeEmail || !performanceRecordId) {
      return Response.json({
        ok: false,
        error: 'Missing: traineeEmail, performanceRecordId'
      }, { status: 400 });
    }

    const result = await trackConversionMetrics(base44, traineeEmail, actionType, performanceRecordId);

    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

export { trackConversionMetrics };