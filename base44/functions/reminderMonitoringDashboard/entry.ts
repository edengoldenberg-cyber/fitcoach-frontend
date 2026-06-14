/**
 * REMINDER MONITORING DASHBOARD
 *
 * Real-time stats for coaches:
 * - Messages sent today
 * - Messages blocked
 * - Active users, silent users, recovery users
 * - Per-trigger stats
 * - Conversion rates
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function getReminderDashboard(base44, coachEmail) {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Get coach's trainees
    const trainees = await base44.asServiceRole.entities.Trainee.filter({
      coach_email: coachEmail,
      status: { $ne: 'deleted' }
    }).catch(() => []);

    const traineeEmails = trainees.map(t => t.user_email);

    // Events today
    const todayEvents = await base44.asServiceRole.entities.WhatsAppPerformance.filter({
      trainee_email: { $in: traineeEmails }
    }).catch(() => []);

    const todayEventsFiltered = todayEvents.filter(e => e.message_sent_at?.startsWith(today));

    // Stats
    const stats = {
      total_messages_sent_today: todayEventsFiltered.filter(e => e.message_sent).length,
      messages_blocked_by_gate: todayEventsFiltered.filter(
        e => e.decision_log?.gate_passed === false
      ).length,
      messages_blocked_by_silent_mode: todayEventsFiltered.filter(
        e => e.user_state_snapshot?.silent_count >= 3
      ).length,
      active_users_today: new Set(todayEventsFiltered.map(e => e.trainee_id)).size,
      total_trainees: trainees.length,
      silent_users: 0,
      recovery_mode_users: 0,
      average_messages_per_user: 0
    };

    // Count silent & recovery users
    let silentCount = 0;
    let recoveryCount = 0;

    for (const trainee of trainees) {
      const traineePerf = todayEventsFiltered.filter(e => e.trainee_id === trainee.id);
      if (traineePerf.length > 0) {
        const lastEvent = traineePerf[traineePerf.length - 1];
        if (lastEvent.user_state_snapshot?.silent_count >= 3) silentCount++;
        if (lastEvent.user_state_snapshot?.is_in_recovery) recoveryCount++;
      }
    }

    stats.silent_users = silentCount;
    stats.recovery_mode_users = recoveryCount;

    if (stats.active_users_today > 0) {
      stats.average_messages_per_user = (stats.total_messages_sent_today / stats.active_users_today).toFixed(2);
    }

    // Per-trigger stats
    const triggerStats = {};

    const triggerTypes = [
      'breakfast_check', 'lunch_check', 'dinner_check', 'water_check',
      'reinforcement_meal', 'reinforcement_water'
    ];

    for (const trigger of triggerTypes) {
      const sent = todayEventsFiltered.filter(
        e => e.trigger_type === trigger && e.message_sent
      );
      const converted = sent.filter(e => e.is_converted);

      triggerStats[trigger] = {
        sent: sent.length,
        conversions: converted.length,
        conversion_rate: sent.length > 0 ? ((converted.length / sent.length) * 100).toFixed(1) : 0
      };
    }

    // Effectiveness analysis
    const effectiveness = {};
    for (const [trigger, data] of Object.entries(triggerStats)) {
      if (data.conversion_rate >= 60) {
        effectiveness[trigger] = 'HIGH';
      } else if (data.conversion_rate >= 30) {
        effectiveness[trigger] = 'MEDIUM';
      } else {
        effectiveness[trigger] = 'LOW';
      }
    }

    return {
      summary: stats,
      by_trigger: triggerStats,
      effectiveness,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('[getReminderDashboard] Error:', err.message);
    return { ok: false, error: err.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const dashboard = await getReminderDashboard(base44, user.email);

    return Response.json({ ok: true, dashboard });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

export { getReminderDashboard };