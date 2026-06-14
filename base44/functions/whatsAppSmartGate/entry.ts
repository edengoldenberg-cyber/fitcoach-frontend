/**
 * WHATSAPP SMART GATE — RUNTIME ENFORCEMENT
 *
 * Before ANY message is sent:
 * 1. Evaluate priority (HIGH/MEDIUM/LOW)
 * 2. Check execution window (morning/afternoon/evening)
 * 3. Evaluate user state (login, meals, water, streak)
 * 4. Decide: SEND or SKIP
 * 5. Log decision + metrics
 *
 * Usage:
 * const decision = await whatsAppSmartGate(base44, traineeId, triggerType, messageText);
 * if (decision.approved) {
 *   // Queue message
 * } else {
 *   // Log skip reason
 * }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─────────────────────────────────────────────────────────────────────
// PRIORITY DEFINITIONS
// ─────────────────────────────────────────────────────────────────────

const TRIGGER_PRIORITIES = {
  // HIGH
  'onboarding_msg1': 'HIGH',
  'onboarding_msg2': 'HIGH',
  'onboarding_msg3': 'HIGH',
  'activation_no_login': 'HIGH',
  'recovery_7days': 'HIGH',

  // MEDIUM — Meal reminders should have HIGHER priority than water
  'breakfast_check': 'MEDIUM',
  'lunch_check': 'MEDIUM',
  'dinner_check': 'MEDIUM',
  'activation_no_meals': 'MEDIUM',
  'recovery_3days': 'MEDIUM',

  // LOW
  'water_check': 'LOW',
  'activation_no_water': 'LOW',
  'engagement_3day_streak': 'LOW',
  'engagement_protein_goal': 'LOW',
  'engagement_calorie_goal': 'LOW',
  'workout_motivation': 'LOW',
  'encouragement_weekly': 'LOW',
  'ai_suggestion': 'LOW',
};

// ─────────────────────────────────────────────────────────────────────
// EXECUTION WINDOWS (Israel time)
// ─────────────────────────────────────────────────────────────────────

function getCurrentWindow() {
  const now = new Date();
  const israelMs = now.getTime() + 3 * 60 * 60 * 1000;
  const israelDate = new Date(israelMs);
  const hour = israelDate.getUTCHours();

  if (hour >= 8 && hour < 11) return 'morning';
  if (hour >= 12 && hour < 16) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return null; // Outside all windows
}

function canSendInWindow(window) {
  return window !== null;
}

// ─────────────────────────────────────────────────────────────────────
// USER STATE EVALUATION
// ─────────────────────────────────────────────────────────────────────

async function getUserState(base44, traineeId, traineeEmail) {
  try {
    const trainee = await base44.asServiceRole.entities.Trainee.filter({ id: traineeId });
    const traineeRec = trainee[0] || {};

    const todayStr = new Date().toISOString().split('T')[0];

    // Meals today
    const mealsToday = await base44.asServiceRole.entities.MealEntry.filter({
      trainee_email: traineeEmail,
      date: todayStr
    }).catch(() => []);

    // Water today
    const waterToday = await base44.asServiceRole.entities.WaterEntry.filter({
      trainee_email: traineeEmail,
      date: todayStr
    }).catch(() => []);

    // Last performance entry
    const perfLogs = await base44.asServiceRole.entities.WhatsAppPerformance.filter({
      trainee_email: traineeEmail
    }, '-message_sent_at', 1).catch(() => []);

    // Meal streak (simple: days with ≥1 meal)
    let streakDays = 0;
    const allMeals = await base44.asServiceRole.entities.MealEntry.filter({
      trainee_email: traineeEmail
    }, '-date', 100).catch(() => []);
    if (allMeals.length > 0) {
      let lastDate = null;
      for (const meal of allMeals) {
        if (!lastDate) {
          lastDate = meal.date;
          streakDays = 1;
        } else if (meal.date === lastDate) {
          continue;
        } else {
          const diff = Math.floor((new Date(lastDate) - new Date(meal.date)) / (1000 * 60 * 60 * 24));
          if (diff === 1) {
            streakDays++;
            lastDate = meal.date;
          } else {
            break;
          }
        }
      }
    }

    const lastPerfLog = perfLogs[0];
    const hoursSinceLastMsg = lastPerfLog
      ? (Date.now() - new Date(lastPerfLog.message_sent_at).getTime()) / (1000 * 60 * 60)
      : 999;

    return {
      last_login: traineeRec.last_login_at,
      meals_logged_today: mealsToday.length,
      water_logged_today: waterToday.reduce((sum, w) => sum + (w.amount_ml || 0), 0),
      streak_days: streakDays,
      last_message_sent_type: lastPerfLog?.trigger_type || null,
      messages_sent_today: perfLogs.filter(p => p.message_sent_at?.startsWith(todayStr)).length,
      hours_since_last_message: Math.round(hoursSinceLastMsg),
      silent_count: lastPerfLog?.silent_user_count || 0
    };
  } catch (err) {
    console.warn('[getUserState] Error (fail-open with defaults):', err.message);
    // FAIL-OPEN: return safe defaults so gate never blocks on missing data
    return {
      last_login: null,
      meals_logged_today: 0,
      water_logged_today: 0,
      streak_days: 0,
      last_message_sent_type: null,
      messages_sent_today: 0,
      hours_since_last_message: 999,
      silent_count: 0,
      _missing_data: true
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// GATE DECISION LOGIC
// ─────────────────────────────────────────────────────────────────────

const MEAL_TRIGGER_TYPES = ['breakfast_check', 'lunch_check', 'dinner_check'];
const WATER_TRIGGER_TYPES = ['water_check'];

async function getCategoryCountToday(base44, traineeEmail, triggerTypes) {
  const today = new Date().toISOString().split('T')[0];
  try {
    const events = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
      trainee_email: traineeEmail,
      event_type: 'message_sent'
    }, '-timestamp', 20).catch(() => []);
    return events.filter(e =>
      e.timestamp && e.timestamp.startsWith(today) && triggerTypes.includes(e.trigger_type)
    ).length;
  } catch (_) {
    return 0;
  }
}

async function evaluateGate(base44, traineeId, traineeEmail, triggerType, userState) {
  const priority = TRIGGER_PRIORITIES[triggerType] || 'LOW';
  const window = getCurrentWindow();
  const today = new Date().toISOString().split('T')[0];

  // 1. Outside sending window?
  if (!canSendInWindow(window)) {
    return {
      approved: false,
      reason: 'outside_window',
      details: 'Not in morning (8-11), afternoon (12-16), or evening (17-21) window'
    };
  }

  // 2. Per-category daily limit (replaces total 2-message cap):
  //    - max 1 meal reminder/day (breakfast/lunch/dinner combined)
  //    - max 1 water reminder/day
  //    - HIGH priority bypasses category limits
  if (priority !== 'HIGH') {
    if (MEAL_TRIGGER_TYPES.includes(triggerType)) {
      const mealCount = await getCategoryCountToday(base44, traineeEmail, MEAL_TRIGGER_TYPES);
      if (mealCount >= 1) {
        return {
          approved: false,
          reason: 'meal_daily_limit_reached',
          details: `Already sent ${mealCount} meal reminder(s) today`
        };
      }
    } else if (WATER_TRIGGER_TYPES.includes(triggerType)) {
      const waterCount = await getCategoryCountToday(base44, traineeEmail, WATER_TRIGGER_TYPES);
      if (waterCount >= 1) {
        return {
          approved: false,
          reason: 'water_daily_limit_reached',
          details: `Already sent ${waterCount} water reminder(s) today`
        };
      }
    }
  }

  // 3. User silenced (3 ignored messages)? Only block if we CONFIRM silenced_until is set
  if (userState.silent_count >= 3) {
    try {
      const lastPerfLogs = await base44.asServiceRole.entities.WhatsAppPerformance.filter({
        trainee_email: traineeEmail
      }, '-message_sent_at', 1).catch(() => []);
      const lastLog = lastPerfLogs[0];
      if (lastLog?.silenced_until && new Date(lastLog.silenced_until) > new Date()) {
        return {
          approved: false,
          reason: 'user_silenced',
          details: `User ignored 3+ messages. Silenced until ${lastLog.silenced_until}`
        };
      }
    } catch (_) {
      // Fail-open: if we can't check silence status, allow the message
      console.warn('[evaluateGate] Could not check silence status — allowing message');
    }
  }

  // 4. Check competing triggers (if multiple, only approve highest priority)
  // (This is evaluated by caller — just log priority here)

  // 5. Context check: is this message relevant to user state?
  const isRelevant = isMessageRelevantToState(triggerType, userState);
  if (!isRelevant && priority !== 'HIGH') {
    return {
      approved: false,
      reason: 'not_relevant_to_user_state',
      details: `${triggerType} not relevant: user state doesn't match trigger (e.g., meals already logged)`
    };
  }

  return {
    approved: true,
    reason: 'gate_passed',
    priority,
    window,
    relevance: isRelevant ? 'high' : 'moderate'
  };
}

// ─────────────────────────────────────────────────────────────────────
// RELEVANCE CHECK
// ─────────────────────────────────────────────────────────────────────

function isMessageRelevantToState(triggerType, userState) {
  // HIGH priority triggers are always relevant (always send)
  if (TRIGGER_PRIORITIES[triggerType] === 'HIGH') return true;

  // MEDIUM/LOW: check context
  switch (triggerType) {
    case 'activation_no_meals':
      return userState.meals_logged_today === 0;
    case 'activation_no_water':
      return userState.water_logged_today === 0;
    case 'engagement_3day_streak':
      return userState.streak_days >= 3;
    case 'recovery_3days':
      return userState.hours_since_last_message > 72;
    default:
      return true;
  }
}

// ─────────────────────────────────────────────────────────────────────
// MAIN GATE FUNCTION
// ─────────────────────────────────────────────────────────────────────

async function whatsAppSmartGate(base44, traineeId, traineeEmail, triggerType, messageText) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const dedupeKey = `${traineeId}__${triggerType}__${today}`;

    // ── HARD IDEMPOTENCY CHECK (before any other logic) ──────────────
    // Check if this exact trigger was already queued today (race condition guard)
    const alreadyQueued = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({
      context_id: traineeId,
      session_id: dedupeKey
    }).catch(() => []);

    if (alreadyQueued.length > 0) {
      console.log(`[GATE_DEDUPED] ${triggerType} → ${traineeEmail} | key=${dedupeKey} | duplicate blocked`);
      // Log duplicate attempt
      await base44.asServiceRole.entities.WhatsAppEventLog.create({
        trainee_id: traineeId,
        trainee_email: traineeEmail,
        trigger_type: triggerType,
        event_type: 'reminder_skipped',
        timestamp: new Date().toISOString(),
        blocked_reason: 'duplicate_blocked',
        decision_metadata: { duplicate_key: dedupeKey, duplicate_reason: 'already_queued_today' }
      }).catch(() => {});
      return {
        approved: false,
        reason: 'duplicate_blocked',
        details: `Already queued today (key: ${dedupeKey})`,
        dedupeKey
      };
    }

    // Get user state (FAIL-OPEN: never returns null)
    const userState = await getUserState(base44, traineeId, traineeEmail);

    // FAIL-OPEN: if data is missing, approve and log warning only
    if (userState._missing_data) {
      console.warn(`[GATE_FAIL_OPEN] ${triggerType} → ${traineeEmail} | missing user state → approving with defaults`);
      // Ensure a WhatsAppPerformance seed record exists so future runs have history
      await base44.asServiceRole.entities.WhatsAppPerformance.create({
        trainee_email: traineeEmail,
        trainee_id: traineeId,
        trigger_type: triggerType,
        message_sent: messageText,
        message_sent_at: new Date().toISOString(),
        priority: TRIGGER_PRIORITIES[triggerType] || 'LOW',
        window_sent: getCurrentWindow() || 'unknown',
        user_state_snapshot: userState,
        decision_log: {
          reason_selected: 'fail_open_missing_data',
          gate_passed: true,
          gate_fail_reason: null,
          gate_block_reason: 'MISSING_PERFORMANCE_RECORD'
        },
        conversion: false
      }).catch(() => {});
      return {
        approved: true,
        reason: 'fail_open_missing_data',
        priority: TRIGGER_PRIORITIES[triggerType] || 'LOW',
        window: getCurrentWindow() || 'unknown',
        dedupeKey,
        gate_block_reason: 'MISSING_PERFORMANCE_RECORD'
      };
    }

    // Evaluate gate
    const gateResult = await evaluateGate(base44, traineeId, traineeEmail, triggerType, userState);
    gateResult.dedupeKey = dedupeKey; // Pass key to caller for use in queue creation

    // Log decision to WhatsAppPerformance (regardless of approval)
    await base44.asServiceRole.entities.WhatsAppPerformance.create({
      trainee_email: traineeEmail,
      trainee_id: traineeId,
      trigger_type: triggerType,
      message_sent: messageText,
      message_sent_at: new Date().toISOString(),
      priority: TRIGGER_PRIORITIES[triggerType] || 'LOW',
      window_sent: gateResult.window || 'outside_window',
      user_state_snapshot: userState,
      decision_log: {
        reason_selected: gateResult.reason,
        gate_passed: gateResult.approved,
        gate_fail_reason: gateResult.approved ? null : gateResult.reason,
        gate_block_reason: gateResult.approved ? null : (gateResult.reason || 'UNKNOWN')
      },
      conversion: false
    }).catch(e => console.warn('[GATE] Failed to write WhatsAppPerformance:', e.message));

    // Always create WhatsAppEventLog entry
    await base44.asServiceRole.entities.WhatsAppEventLog.create({
      trainee_id: traineeId,
      trainee_email: traineeEmail,
      trigger_type: triggerType,
      event_type: gateResult.approved ? 'message_sent' : 'reminder_skipped',
      timestamp: new Date().toISOString(),
      message_sent: gateResult.approved ? messageText : null,
      reason: gateResult.approved ? gateResult.reason : null,
      blocked_reason: gateResult.approved ? null : gateResult.reason,
      user_state: userState,
      decision_metadata: {
        gate_block_reason: gateResult.approved ? null : (gateResult.reason || 'UNKNOWN'),
        priority: gateResult.priority,
        window: gateResult.window,
        missing_data: userState._missing_data || false
      }
    }).catch(e => console.warn('[GATE] Failed to write WhatsAppEventLog:', e.message));

    if (gateResult.approved) {
      console.log(`[GATE_APPROVED] ${triggerType} → ${traineeEmail} | priority=${gateResult.priority} | window=${gateResult.window}`);
    } else {
      console.log(`[GATE_BLOCKED] ${triggerType} → ${traineeEmail} | reason=${gateResult.reason}`);
    }

    return gateResult;
  } catch (err) {
    // FAIL-OPEN: gate errors must never silently block messages
    console.error('[whatsAppSmartGate] Error (fail-open):', err.message);
    return {
      approved: true,
      reason: 'gate_error_fail_open',
      error: err.message,
      priority: TRIGGER_PRIORITIES[triggerType] || 'LOW',
      window: getCurrentWindow() || 'unknown',
      dedupeKey: `${traineeId}__${triggerType}__${new Date().toISOString().split('T')[0]}`
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// PUBLIC API — via function invoke
// ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { traineeId, traineeEmail, triggerType, messageText } = await req.json();

    if (!traineeId || !traineeEmail || !triggerType) {
      return Response.json({
        ok: false,
        error: 'Missing required: traineeId, traineeEmail, triggerType'
      }, { status: 400 });
    }

    const result = await whatsAppSmartGate(base44, traineeId, traineeEmail, triggerType, messageText);

    return Response.json({
      ok: true,
      approved: result.approved,
      decision: result
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

export { whatsAppSmartGate };