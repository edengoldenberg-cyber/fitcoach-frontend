/**
 * SMART MEAL & WATER REMINDER SYSTEM
 *
 * Called by scheduler at specific times:
 * - 10:00 → breakfast check
 * - 14:00 → lunch check
 * - 19:00 → dinner check
 * - 18:00 → water check
 *
 * Logic:
 * 1. Load user state (meals today, water today, last login)
 * 2. Check if reminder is relevant (meal not logged? water below target?)
 * 3. Enforce anti-spam (max 2/day, no duplicates)
 * 4. If multiple triggers fire: pick highest priority only
 * 5. Gate through whatsAppSmartGate
 * 6. Log decision in WhatsAppEventLog
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Check times (Israel time)
const CHECK_TIMES = {
  breakfast: 10,
  lunch: 14,
  dinner: 19,
  water: 18
};

// ─────────────────────────────────────────────────────────────────────
// DETERMINE CURRENT CHECK TIME
// ─────────────────────────────────────────────────────────────────────

function getCurrentCheckTime() {
  const now = new Date();
  const israelMs = now.getTime() + 3 * 60 * 60 * 1000;
  const israelDate = new Date(israelMs);
  const hour = israelDate.getUTCHours();

  if (hour === 10) return 'breakfast';
  if (hour === 14) return 'lunch';
  if (hour === 19) return 'dinner';
  if (hour === 18) return 'water';
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// LOAD USER STATE
// ─────────────────────────────────────────────────────────────────────

async function loadUserState(base44, traineeId, traineeEmail) {
  try {
    const trainee = await base44.asServiceRole.entities.Trainee.filter({
      id: traineeId
    }).catch(() => []);
    const traineeRec = trainee[0] || {};

    const israelMs = new Date().getTime() + 3 * 60 * 60 * 1000;
    const todayStr = new Date(israelMs).toISOString().split('T')[0];

    // Meals today
    const mealsToday = await base44.asServiceRole.entities.MealEntry.filter({
      trainee_email: traineeEmail,
      date: todayStr
    }).catch(() => []);

    // Water today (ml)
    const waterToday = await base44.asServiceRole.entities.WaterEntry.filter({
      trainee_email: traineeEmail,
      date: todayStr
    }).catch(() => []);
    const totalWaterMl = waterToday.reduce((sum, w) => sum + (w.amount_ml || 0), 0);

    // Get nutrition targets
    const targets = await base44.asServiceRole.entities.NutritionTargets.filter({
      trainee_email: traineeEmail
    }, '-updated_at', 1).catch(() => []);
    const dailyWaterTarget = targets[0]?.daily_water_ml || 2500;

    // Last login
    const lastLoginMs = traineeRec.last_login_at
      ? Date.now() - new Date(traineeRec.last_login_at).getTime()
      : null;
    const lastLoginHours = lastLoginMs ? Math.round(lastLoginMs / (1000 * 60 * 60)) : null;

    // Last message sent today
    const todayEvents = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
      trainee_email: traineeEmail,
      event_type: 'message_sent'
    }, '-timestamp', 10).catch(() => []);
    const todayEventsFiltered = todayEvents.filter(e => e.timestamp.startsWith(todayStr));
    const lastMessageType = todayEventsFiltered[0]?.trigger_type || null;
    const messagestoday = todayEventsFiltered.length;

    // Check recovery mode
    const allEvents = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
      trainee_email: traineeEmail
    }, '-timestamp', 1).catch(() => []);
    const lastEvent = allEvents[0];
    let isInRecoveryMode = false;
    let recoveryDay = 0;

    if (lastEvent && lastEvent.event_type === 'recovery_sent') {
      const eventDate = new Date(lastEvent.timestamp);
      const daysSinceRecovery = Math.round((Date.now() - eventDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceRecovery < 3) {
        isInRecoveryMode = true;
        recoveryDay = daysSinceRecovery;
      }
    }

    return {
      meals_logged_today: mealsToday.length,
      water_logged_today: totalWaterMl,
      daily_water_target: dailyWaterTarget,
      last_login_hours_ago: lastLoginHours,
      last_message_type: lastMessageType,
      messages_sent_today: messagestoday,
      is_in_recovery_mode: isInRecoveryMode,
      recovery_day: recoveryDay
    };
  } catch (err) {
    console.error('[loadUserState] Error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// EVALUATE REMINDER RELEVANCE
// ─────────────────────────────────────────────────────────────────────

function shouldSendMealReminder(checkTime, userState) {
  // Recovery mode: no meal reminders
  if (userState.is_in_recovery_mode) return false;

  // User inactive >3 days: no reminders
  if (typeof userState.last_login_hours_ago === 'number' && userState.last_login_hours_ago > 72) return false;

  // Already sent 2 messages today
  if (userState.messages_sent_today >= 2) return false;

  // Already sent meal reminder today
  if (userState.last_message_type && userState.last_message_type.startsWith('breakfast_check')) return false;
  if (userState.last_message_type && userState.last_message_type.startsWith('lunch_check')) return false;
  if (userState.last_message_type && userState.last_message_type.startsWith('dinner_check')) return false;

  // Check meals logged by meal type (rough estimate)
  // breakfast: 0 meals → 10:00, lunch: ≤1 meal → 14:00, dinner: ≤2 meals → 19:00
  const mealCount = userState.meals_logged_today;

  switch (checkTime) {
    case 'breakfast':
      return mealCount === 0;
    case 'lunch':
      return mealCount < 2;
    case 'dinner':
      return mealCount < 3;
    default:
      return false;
  }
}

function shouldSendWaterReminder(userState) {
  // Recovery mode: no reminders
  if (userState.is_in_recovery_mode) return false;

  // User inactive >3 days: no reminders
  if (typeof userState.last_login_hours_ago === 'number' && userState.last_login_hours_ago > 72) return false;

  // Already sent 2 messages today
  if (userState.messages_sent_today >= 2) return false;

  // Already sent water reminder today
  if (userState.last_message_type && userState.last_message_type === 'water_check') return false;

  // Water below 50% of target
  const waterPercent = userState.water_logged_today / userState.daily_water_target;
  return waterPercent < 0.5;
}

// ─────────────────────────────────────────────────────────────────────
// MESSAGE GENERATION
// ─────────────────────────────────────────────────────────────────────

function generateMealReminder(mealType, traineeFirstName) {
  const messages = {
    breakfast: `בוקר טוב ${traineeFirstName}! 🌅\n\nעדיין לא רשמת ארוחת בוקר?\nהתחלה טובה ביום = תוצאות טובות יותר 💪\n\nרשום עכשיו`,
    lunch: `שלום ${traineeFirstName}! 🥗\n\nזמן ארוחת צהריים!\nעדיין לא רשמת? בואו נעדכן 📝`,
    dinner: `ערב טוב ${traineeFirstName}! 🍽️\n\nסיום יום טוב עם ארוחת ערב!\nרשום בקלות בואו 👇`
  };
  return messages[mealType] || messages.breakfast;
}

function generateWaterReminder(traineeFirstName, waterPercent) {
  const remaining = Math.round((1 - waterPercent) * 100);
  return `💧 שלום ${traineeFirstName}!\n\nעוד ${remaining}% מיעד המים שלך!\nכוס מים עכשיו = בדרך לקיים 🎯`;
}

function generateRecoveryMessage(traineeFirstName, day) {
  if (day === 3) {
    return `${traineeFirstName}, רואים שלא היית איתנו כמה ימים 🤔\n\nחזור בואו — אנחנו כאן בשבילך 💙\n\nתחיל עם ארוחה אחת קטנה 💪`;
  } else if (day === 7) {
    return `${traineeFirstName}, סוגר לך את זה 🫡\n\nאם זה פחות מתאים עכשיו הכל טוב.\nאם רוצה לחזור — אני פה בשביל לעזור 💪`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// MAIN ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────

async function smartMealWaterReminder(base44, traineeId, traineeEmail) {
  const checkTime = getCurrentCheckTime();
  if (!checkTime) {
    return { ok: false, reason: 'not_a_check_time' };
  }

  const userState = await loadUserState(base44, traineeId, traineeEmail);
  if (!userState) {
    return { ok: false, reason: 'could_not_load_user_state' };
  }

  const trainee = await base44.asServiceRole.entities.Trainee.filter({
    id: traineeId
  }).catch(() => []);
  const traineeFirstName = (trainee[0]?.full_name || '').split(' ')[0] || 'Friend';

  // Determine competing triggers
  const triggers = [];

  if (checkTime === 'breakfast' && shouldSendMealReminder('breakfast', userState)) {
    triggers.push({
      type: 'breakfast_check',
      mealType: 'breakfast',
      text: generateMealReminder('breakfast', traineeFirstName),
      priority: 'MEDIUM'
    });
  }

  if (checkTime === 'lunch' && shouldSendMealReminder('lunch', userState)) {
    triggers.push({
      type: 'lunch_check',
      mealType: 'lunch',
      text: generateMealReminder('lunch', traineeFirstName),
      priority: 'MEDIUM'
    });
  }

  if (checkTime === 'dinner' && shouldSendMealReminder('dinner', userState)) {
    triggers.push({
      type: 'dinner_check',
      mealType: 'dinner',
      text: generateMealReminder('dinner', traineeFirstName),
      priority: 'MEDIUM'
    });
  }

  if (checkTime === 'water' && shouldSendWaterReminder(userState)) {
    const waterPercent = userState.water_logged_today / userState.daily_water_target;
    triggers.push({
      type: 'water_check',
      text: generateWaterReminder(traineeFirstName, waterPercent),
      priority: 'MEDIUM'
    });
  }

  // No relevant triggers
  if (triggers.length === 0) {
    await base44.asServiceRole.entities.WhatsAppEventLog.create({
      trainee_id: traineeId,
      trainee_email: traineeEmail,
      trigger_type: `${checkTime}_check`,
      event_type: 'reminder_skipped',
      timestamp: new Date().toISOString(),
      blocked_reason: 'not_relevant_to_user_state',
      user_state: userState,
      decision_metadata: { check_time: checkTime }
    }).catch(() => {});

    return { ok: true, skipped: true, reason: 'no_relevant_triggers' };
  }

  // Select single trigger (if multiple)
  const selectedTrigger = triggers[0];

  // Gate through smart gate
  const gateResult = await base44.asServiceRole.functions.invoke('whatsAppSmartGate', {
    traineeId,
    traineeEmail,
    triggerType: selectedTrigger.type,
    messageText: selectedTrigger.text
  });

  if (!gateResult.approved) {
    await base44.asServiceRole.entities.WhatsAppEventLog.create({
      trainee_id: traineeId,
      trainee_email: traineeEmail,
      trigger_type: selectedTrigger.type,
      event_type: 'reminder_skipped',
      timestamp: new Date().toISOString(),
      blocked_reason: gateResult.decision?.reason || 'gate_rejected',
      user_state: userState,
      decision_metadata: { check_time: checkTime }
    }).catch(() => {});

    return { ok: true, skipped: true, reason: gateResult.decision?.reason };
  }

  // IDEMPOTENCY KEY — prevents duplicate sends on concurrent scheduler runs
  const todayStr = new Date().toISOString().split('T')[0];
  const idempotencyKey = `${traineeId}__${selectedTrigger.type}__${todayStr}`;

  // Check if already queued/sent today with same key
  const alreadyQueued = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({
    session_id: idempotencyKey
  }).catch(() => []);

  if (alreadyQueued && alreadyQueued.length > 0) {
    console.log(`[SMART_REMINDER] DUPLICATE BLOCKED for ${traineeEmail} key=${idempotencyKey}`);
    return { ok: true, skipped: true, reason: 'duplicate_idempotency_key', key: idempotencyKey };
  }

  // Queue message
  const providers = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({
    coach_email: trainee[0]?.coach_email
  }).catch(() => []);
  const providerType = providers[0]?.provider_type || 'greenapi';

  await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
    coach_email: trainee[0]?.coach_email,
    to_phone_e164: trainee[0]?.phone,
    to_name: trainee[0]?.full_name || '',
    context_type: 'trainee',
    context_id: traineeId,
    template_key: `reminder_${selectedTrigger.type}`,
    rendered_text: selectedTrigger.text,
    provider_type: providerType,
    status: 'queued',
    scheduled_for: new Date().toISOString(),
    session_id: idempotencyKey,  // IDEMPOTENCY LOCK
  }).catch(() => {});

  // Log event
  await base44.asServiceRole.entities.WhatsAppEventLog.create({
    trainee_id: traineeId,
    trainee_email: traineeEmail,
    trigger_type: selectedTrigger.type,
    event_type: 'message_sent',
    timestamp: new Date().toISOString(),
    message_sent: selectedTrigger.text,
    reason: `${checkTime}_not_logged`,
    user_state: userState,
    decision_metadata: {
      check_time: checkTime,
      competing_triggers: triggers.map(t => t.type),
      selected_reason: triggers.length > 1 ? 'only_option' : 'single_trigger'
    }
  }).catch(() => {});

  console.log(`[SMART_REMINDER] Sent ${selectedTrigger.type} to ${traineeEmail}`);

  return {
    ok: true,
    sent: true,
    trigger_type: selectedTrigger.type,
    competing_triggers: triggers.map(t => t.type)
  };
}

// ─────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { traineeId, traineeEmail } = await req.json();

    if (!traineeId || !traineeEmail) {
      return Response.json({
        ok: false,
        error: 'Missing: traineeId, traineeEmail'
      }, { status: 400 });
    }

    const result = await smartMealWaterReminder(base44, traineeId, traineeEmail);

    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

export { smartMealWaterReminder };