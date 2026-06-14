/**
 * DEBUG MEAL REMINDER CHAIN TRACE
 *
 * Traces ONE test trainee through entire meal reminder flow:
 * 1. Scheduler status
 * 2. Time conditions (Israel time, meal window)
 * 3. Trainee eligibility
 * 4. Gate logic (getUserStateSnapshot, whatsAppSmartGate, smartReminderEngineV2)
 * 5. Queue/send result
 * 6. Event logs
 *
 * Dry run mode — returns what WOULD happen, no actual sends.
 * Safety: test one trainee only.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function getCurrentIsraelTime() {
  const now = new Date();
  const israelMs = now.getTime() + 3 * 60 * 60 * 1000;
  const israelDate = new Date(israelMs);
  const h = String(israelDate.getUTCHours()).padStart(2, '0');
  const m = String(israelDate.getUTCMinutes()).padStart(2, '0');
  const s = String(israelDate.getUTCSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function getActiveMealWindow(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const minutes = h * 60 + m;

  // Standard windows (in minutes from midnight)
  const breakfast = 10 * 60; // 10:00
  const lunch = 14 * 60; // 14:00
  const dinner = 19 * 60; // 19:00
  const window = 60; // ±60 minutes

  if (Math.abs(minutes - breakfast) <= window) return { type: 'breakfast', time: '10:00' };
  if (Math.abs(minutes - lunch) <= window) return { type: 'lunch', time: '14:00' };
  if (Math.abs(minutes - dinner) <= window) return { type: 'dinner', time: '19:00' };

  return { type: null, time: null };
}

function normalizePhone(phone) {
  if (!phone) return null;
  // Remove non-digits
  const digits = phone.replace(/\D/g, '');
  // If 10 digits (Israel), prepend +972
  if (digits.length === 10) return `+972${digits.substring(1)}`;
  // If 12 digits with 972, format as +972...
  if (digits.length === 12 && digits.startsWith('972')) return `+${digits}`;
  // Already E.164
  if (phone.startsWith('+')) return phone;
  return null;
}

async function debugMealReminderChain(base44, traineeEmail, mealType = null) {
  const trace = {
    timestamp: new Date().toISOString(),
    trainee_email: traineeEmail,
    steps: {}
  };

  try {
    // ─────────────────────────────────────────────────────────────────────
    // STEP 1: TIME CONDITIONS
    // ─────────────────────────────────────────────────────────────────────

    const currentTime = getCurrentIsraelTime();
    const { type: activeMeal, time: mealTime } = getActiveMealWindow(currentTime);

    trace.steps.time_conditions = {
      current_time_israel: currentTime,
      active_meal_window: activeMeal,
      meal_window_time: mealTime,
      manual_override_meal: mealType || null
    };

    const checkMeal = mealType || activeMeal;
    if (!checkMeal) {
      trace.steps.time_conditions.inside_window = false;
      trace.steps.time_conditions.reason = 'no_active_meal_window_right_now';
      return trace;
    }

    trace.steps.time_conditions.inside_window = true;

    // ─────────────────────────────────────────────────────────────────────
    // STEP 2: TRAINEE ELIGIBILITY
    // ─────────────────────────────────────────────────────────────────────

    const trainees = await base44.asServiceRole.entities.Trainee.filter({
      user_email: traineeEmail
    }).catch(() => []);

    if (trainees.length === 0) {
      trace.steps.trainee_eligibility = {
        found: false,
        reason: 'trainee_not_found'
      };
      return trace;
    }

    const trainee = trainees[0];
    const phone = normalizePhone(trainee.phone);

    trace.steps.trainee_eligibility = {
      found: true,
      trainee_id: trainee.id,
      trainee_name: trainee.full_name,
      email: trainee.user_email,
      phone: phone,
      phone_valid: !!phone,
      status: trainee.status,
      whatsapp_enabled: trainee.whatsapp_notifications_enabled !== false,
      reminder_intensity: trainee.reminder_intensity || 'normal',
      coach_email: trainee.coach_email,
      last_login_at: trainee.last_login_at
    };

    if (!phone) {
      trace.steps.trainee_eligibility.eligible = false;
      trace.steps.trainee_eligibility.reason = 'no_valid_phone';
      return trace;
    }

    if (trainee.whatsapp_notifications_enabled === false) {
      trace.steps.trainee_eligibility.eligible = false;
      trace.steps.trainee_eligibility.reason = 'whatsapp_notifications_disabled';
      return trace;
    }

    if (trainee.status !== 'active') {
      trace.steps.trainee_eligibility.eligible = false;
      trace.steps.trainee_eligibility.reason = `status_is_${trainee.status}`;
      return trace;
    }

    // ─────────────────────────────────────────────────────────────────────
    // STEP 3: USER STATE SNAPSHOT
    // ─────────────────────────────────────────────────────────────────────

    let stateSnapshot = null;
    try {
      const stateRes = await base44.asServiceRole.functions.invoke('getUserStateSnapshot', {
        traineeId: trainee.id,
        traineeEmail: traineeEmail
      });
      stateSnapshot = stateRes.snapshot || null;
    } catch (err) {
      trace.steps.user_state = {
        error: err.message,
        reason: 'could_not_load_state'
      };
      return trace;
    }

    if (!stateSnapshot) {
      trace.steps.user_state = {
        error: 'state_is_null',
        reason: 'getUserStateSnapshot_returned_null'
      };
      return trace;
    }

    trace.steps.user_state = {
      loaded: true,
      meals_logged_today: stateSnapshot.meals_logged_today,
      water_logged_today: stateSnapshot.water_logged_today,
      water_target: stateSnapshot.water_target,
      water_progress: stateSnapshot.water_progress,
      messages_sent_today: stateSnapshot.messages_sent_today,
      last_login_hours_ago: stateSnapshot.last_login_hours,
      is_in_recovery: stateSnapshot.is_in_recovery,
      recovery_day: stateSnapshot.recovery_day,
      silent_count: stateSnapshot.silent_count,
      last_message_type: stateSnapshot.last_message_type,
      last_meal_time: stateSnapshot.last_meal_time
    };

    // ─────────────────────────────────────────────────────────────────────
    // STEP 4: SMART REMINDER ENGINE LOGIC
    // ─────────────────────────────────────────────────────────────────────

    let reminderDecision = null;
    try {
      const reminderRes = await base44.asServiceRole.functions.invoke('smartReminderEngineV2', {
        traineeId: trainee.id,
        traineeEmail: traineeEmail,
        checkType: checkMeal
      });
      reminderDecision = reminderRes.result || reminderRes;
    } catch (err) {
      trace.steps.reminder_engine = {
        error: err.message,
        reason: 'smartReminderEngineV2_failed'
      };
      return trace;
    }

    trace.steps.reminder_engine = {
      executed: true,
      decision: reminderDecision.sent === true ? 'SEND' : 'SKIP',
      reason: reminderDecision.reason || reminderDecision.skipped ? 'not_sent' : reminderDecision.error,
      sent: reminderDecision.sent || false,
      skipped: reminderDecision.skipped || false,
      trigger_type: reminderDecision.trigger_type || null
    };

    // ─────────────────────────────────────────────────────────────────────
    // STEP 5: QUEUE STATUS
    // ─────────────────────────────────────────────────────────────────────

    // Check if message was queued
    const queuedMessages = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({
      context_id: trainee.id,
      context_type: 'trainee'
    }).catch(() => []);

    const todayMessages = queuedMessages.filter(m => {
      const msgDate = m.last_attempt_at || m.scheduled_for;
      const today = new Date().toISOString().split('T')[0];
      return msgDate?.startsWith(today);
    });

    trace.steps.queue_status = {
      queued_today: todayMessages.length,
      messages: todayMessages.map(m => ({
        id: m.id,
        template_key: m.template_key,
        status: m.status,
        scheduled_for: m.scheduled_for,
        last_attempt_at: m.last_attempt_at,
        error: m.error_message || null
      }))
    };

    // ─────────────────────────────────────────────────────────────────────
    // STEP 6: EVENT LOGS
    // ─────────────────────────────────────────────────────────────────────

    const eventLogs = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
      trainee_id: trainee.id
    }).catch(() => []);

    const todayEvents = eventLogs.filter(e => e.timestamp?.startsWith(new Date().toISOString().split('T')[0]));
    const mealTypeKey = `${checkMeal}_check`;

    const relevantEvents = todayEvents.filter(e => e.trigger_type === mealTypeKey);

    trace.steps.event_logs = {
      total_today: todayEvents.length,
      relevant_to_meal_type: relevantEvents.length,
      relevant_events: relevantEvents.map(e => ({
        trigger_type: e.trigger_type,
        event_type: e.event_type,
        timestamp: e.timestamp,
        blocked_reason: e.blocked_reason,
        sent: e.event_type === 'message_sent'
      }))
    };

    // ─────────────────────────────────────────────────────────────────────
    // FINAL VERDICT
    // ─────────────────────────────────────────────────────────────────────

    trace.verdict = {
      would_send: reminderDecision.sent === true,
      blocked_reasons: [],
      issues_found: []
    };

    // Collect issues
    if (!phone) trace.verdict.issues_found.push('No valid phone number');
    if (trainee.whatsapp_notifications_enabled === false) {
      trace.verdict.blocked_reasons.push('whatsapp_notifications_disabled');
      trace.verdict.issues_found.push('Trainee has WhatsApp notifications disabled');
    }
    if (trainee.status !== 'active') {
      trace.verdict.blocked_reasons.push(`trainee_status_${trainee.status}`);
      trace.verdict.issues_found.push(`Trainee status is ${trainee.status}, not active`);
    }
    if (stateSnapshot.is_in_recovery) {
      trace.verdict.blocked_reasons.push('in_recovery_mode');
      trace.verdict.issues_found.push('Trainee in recovery mode');
    }
    if (stateSnapshot.silent_count >= 3) {
      trace.verdict.blocked_reasons.push('silent_mode');
      trace.verdict.issues_found.push(`Silent mode active (${stateSnapshot.silent_count} ignored)`);
    }
    if (!activeMeal && !mealType) {
      trace.verdict.blocked_reasons.push('no_active_meal_window');
      trace.verdict.issues_found.push('Not within any meal window right now');
    }

    if (reminderDecision.reason) {
      trace.verdict.blocked_reasons.push(reminderDecision.reason);
    }

    return trace;
  } catch (err) {
    trace.error = err.message;
    trace.error_stack = err.stack;
    return trace;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json(
        { ok: false, error: 'Admin only' },
        { status: 403 }
      );
    }

    const { trainee_email, meal_type } = await req.json();

    if (!trainee_email) {
      return Response.json(
        { ok: false, error: 'Missing: trainee_email' },
        { status: 400 }
      );
    }

    const trace = await debugMealReminderChain(base44, trainee_email, meal_type);

    return Response.json({ ok: true, trace });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

export { debugMealReminderChain };