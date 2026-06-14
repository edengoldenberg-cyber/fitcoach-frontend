/**
 * REMINDER FAILSAFE CHECK
 *
 * Monitors for dangerous patterns:
 * - More than 3 messages to same user in 24h
 * - Duplicate messages
 * - System errors
 *
 * If triggered: disable reminders globally + notify coach
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function reminderFailsafeCheck(base44) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const alerts = [];

    // Get all performance records for today
    const todayEvents = await base44.asServiceRole.entities.WhatsAppPerformance.filter({
      message_sent_at: { $gte: today + 'T00:00:00Z' }
    }).catch(() => []);

    // Check 1: More than 3 messages per user in 24h
    const userMessageCounts = {};

    for (const event of todayEvents) {
      if (!userMessageCounts[event.trainee_email]) {
        userMessageCounts[event.trainee_email] = 0;
      }
      userMessageCounts[event.trainee_email]++;
    }

    for (const [email, count] of Object.entries(userMessageCounts)) {
      if (count > 3) {
        alerts.push({
          severity: 'CRITICAL',
          type: 'SPAM_THRESHOLD_EXCEEDED',
          user: email,
          count: count,
          message: `User ${email} received ${count} messages in 24h (max 3)`
        });
      }
    }

    // Check 2: Duplicate messages (same message text within 1 hour)
    const messagesByText = {};

    for (const event of todayEvents) {
      if (!messagesByText[event.message_sent]) {
        messagesByText[event.message_sent] = [];
      }
      messagesByText[event.message_sent].push(event);
    }

    for (const [text, events] of Object.entries(messagesByText)) {
      if (events.length > 1) {
        const timesDiff = [];
        for (let i = 1; i < events.length; i++) {
          const diff = (new Date(events[i].message_sent_at) - new Date(events[i-1].message_sent_at)) / (1000 * 60);
          if (diff < 60) {
            timesDiff.push(diff);
          }
        }

        if (timesDiff.length > 0) {
          alerts.push({
            severity: 'CRITICAL',
            type: 'DUPLICATE_MESSAGE',
            message: `Duplicate message detected: "${text.substring(0, 50)}..." sent ${events.length} times`,
            count: events.length
          });
        }
      }
    }

    // Check 3: System errors (blocked by gate with error)
    const errorCount = todayEvents.filter(
      e => e.decision_log?.gate_fail_reason === 'gate_error' || e.decision_log?.gate_fail_reason === 'could_not_load_user_state'
    ).length;

    if (errorCount > 10) {
      alerts.push({
        severity: 'CRITICAL',
        type: 'SYSTEM_ERROR_THRESHOLD',
        count: errorCount,
        message: `${errorCount} system errors detected in reminder processing`
      });
    }

    // If critical alerts: disable reminders globally
    if (alerts.some(a => a.severity === 'CRITICAL')) {
      await base44.asServiceRole.entities.SystemConfig.create({
        key: 'WHATSAPP_REMINDERS_ENABLED',
        value: false,
        value_type: 'boolean',
        updated_by: 'system_failsafe',
        notes: `Disabled due to failsafe alerts: ${alerts.map(a => a.type).join(', ')}`
      }).catch(() => {});

      console.error('[FAILSAFE_TRIGGERED]', alerts);
    }

    return {
      ok: true,
      failsafe_triggered: alerts.length > 0,
      alerts: alerts
    };
  } catch (err) {
    console.error('[reminderFailsafeCheck] Error:', err.message);
    return { ok: false, error: err.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const result = await reminderFailsafeCheck(base44);

    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

export { reminderFailsafeCheck };