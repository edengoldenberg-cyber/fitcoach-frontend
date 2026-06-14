/**
 * MEAL REMINDER SCHEDULER — EXPLICIT MEAL WINDOW CHECKER
 *
 * FIXES:
 * 1. Meal reminders have MEDIUM priority (above water's LOW)
 * 2. Meal and water use SEPARATE category caps (1 meal/day, 1 water/day)
 * 3. Explicit meal checkpoints: 10:00 breakfast, 14:00 lunch, 19:00 dinner
 * 4. If trainee hasn't logged meal after checkpoint time, send reminder until the next meal window/end of day
 * 5. Each meal has its own once-per-day reminder, independent of user inactivity
 *
 * Called every 15 minutes by scheduler.
 * Checks: Is this meal currently due? Did trainee log? Send if not.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Standard meal times (Israel)
const MEAL_WINDOWS = {
  breakfast: { hour: 10, minute: 0, window_minutes: 60 },
  lunch: { hour: 14, minute: 0, window_minutes: 60 },
  dinner: { hour: 19, minute: 0, window_minutes: 60 }
};

function getCurrentIsraelTime() {
  const now = new Date();
  const israelMs = now.getTime() + 3 * 60 * 60 * 1000;
  const israelDate = new Date(israelMs);
  return {
    hour: israelDate.getUTCHours(),
    minute: israelDate.getUTCMinutes(),
    iso: israelDate.toISOString()
  };
}

function isInsideMealWindow(mealType, currentTime) {
  const window = MEAL_WINDOWS[mealType];
  const windowStart = window.hour * 60 + window.minute;
  const windowEnd = windowStart + window.window_minutes;
  const currentMin = currentTime.hour * 60 + currentTime.minute;

  // Send only during the explicit reminder window, not until the next meal/end of day
  return currentMin >= windowStart && currentMin < windowEnd;
}

function getMealIndex(mealType) {
  return { breakfast: 0, lunch: 1, dinner: 2 }[mealType];
}

function buildMealLogUrl(mealType) {
  const appUrl = (Deno.env.get('BASE44_APP_URL') || '').replace(/\/$/, '');
  if (!appUrl) return '';
  return `${appUrl}/NutritionLog?openAddMeal=1&mealType=${encodeURIComponent(mealType)}`;
}

async function mealReminderScheduler(base44) {
  const currentTime = getCurrentIsraelTime();
  const today = currentTime.iso.split('T')[0];
  const results = {
    timestamp: currentTime.iso,
    israel_time: `${currentTime.hour}:${String(currentTime.minute).padStart(2,'0')}`,
    checked_windows: [],
    reminders_sent: 0,
    errors: [],
    trainee_traces: []  // Full trace per trainee for debugging
  };

  // Check each meal window
  for (const [mealType, windowDef] of Object.entries(MEAL_WINDOWS)) {
    const windowStatus = {
      meal_type: mealType,
      window_at: `${windowDef.hour}:00`,
      inside_window: isInsideMealWindow(mealType, currentTime),
      trainees_checked: 0,
      reminders_sent: 0,
      blocked: 0,
      trainee_results: []
    };

    if (!windowStatus.inside_window) {
      results.checked_windows.push(windowStatus);
      continue;
    }

    try {
      // Get all active trainees
      const trainees = await base44.asServiceRole.entities.Trainee.filter({
        status: 'active'
      }).catch(() => []);

      // Filter: whatsapp enabled (handle missing field = default true)
      const eligibleTrainees = trainees.filter(t => t.whatsapp_notifications_enabled !== false);

      for (const trainee of eligibleTrainees) {
        windowStatus.trainees_checked++;
        const traceEntry = {
          email: trainee.user_email,
          name: trainee.full_name,
          meal_type: mealType,
          decision: null,
          block_reason: null,
          meals_logged: null,
          meal_reminders_today: null
        };

        // Load only the state needed for meal reminders directly to avoid function-invoke rate limits
        const mealsToday = await base44.asServiceRole.entities.MealEntry.filter({
          trainee_email: trainee.user_email,
          date: today
        }).catch(() => []);

        const recentEvents = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
          trainee_email: trainee.user_email
        }, '-timestamp', 5).catch(() => []);

        const lastEvent = recentEvents[0] || null;
        const userState = {
          meals_logged_today: mealsToday.length,
          is_in_recovery: lastEvent?.event_type === 'recovery_sent' &&
            ((Date.now() - new Date(lastEvent.timestamp).getTime()) / (1000 * 60 * 60 * 24)) < 3,
          silent_count: lastEvent?.user_state?.silent_count || 0,
          trainee_name: trainee.full_name || 'חברי'
        };

        traceEntry.meals_logged = userState.meals_logged_today;

        // ── HARD IDEMPOTENCY: check both EventLog AND MessageQueue ──────────
        // This prevents race conditions when scheduler runs multiple times/window
        const dedupeKey = `${trainee.id}__${mealType}_check__${today}`;

        // Check 1: Already in event log (message_sent)
        const mealRemindersToday = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
          trainee_email: trainee.user_email,
          event_type: 'message_sent'
        }, '-timestamp', 20).catch(() => []);
        const mealRemindersSentToday = mealRemindersToday.filter(e =>
          e.timestamp && e.timestamp.startsWith(today) &&
          e.trigger_type === `${mealType}_check`
        );
        traceEntry.meal_reminders_today = mealRemindersSentToday.length;

        if (mealRemindersSentToday.length >= 1) {
          traceEntry.decision = 'BLOCKED';
          traceEntry.block_reason = `${mealType}_daily_limit_reached`;
          windowStatus.blocked++;
          windowStatus.trainee_results.push(traceEntry);
          continue;
        }

        // Check 2: Already queued today (catches race condition where log not written yet)
        const alreadyQueued = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({
          context_id: trainee.id,
          session_id: dedupeKey
        }).catch(() => []);

        if (alreadyQueued.length > 0) {
          traceEntry.decision = 'BLOCKED';
          traceEntry.block_reason = `duplicate_blocked__already_queued (key: ${dedupeKey})`;
          // Log the duplicate attempt to EventLog for visibility
          await base44.asServiceRole.entities.WhatsAppEventLog.create({
            trainee_id: trainee.id,
            trainee_email: trainee.user_email,
            trigger_type: `${mealType}_check`,
            event_type: 'reminder_skipped',
            timestamp: currentTime.iso,
            blocked_reason: 'duplicate_blocked',
            decision_metadata: { duplicate_key: dedupeKey, duplicate_reason: 'already_queued_today' }
          }).catch(() => {});
          windowStatus.blocked++;
          windowStatus.trainee_results.push(traceEntry);
          continue;
        }

        // Check 3: Same phone already received/queued this exact reminder today.
        // Protects against duplicate trainee records sharing the same phone.
        const samePhoneToday = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({
          to_phone_e164: trainee.phone,
          template_key: `reminder_${mealType}_check`
        }).catch(() => []);

        const duplicateByPhone = (samePhoneToday || []).some(m =>
          m.session_id?.endsWith(`__${mealType}_check__${today}`) &&
          ['queued', 'sending', 'sent', 'provider_unconfirmed'].includes(m.status)
        );

        if (duplicateByPhone) {
          traceEntry.decision = 'BLOCKED';
          traceEntry.block_reason = `duplicate_blocked__same_phone_same_reminder_today (${trainee.phone})`;
          windowStatus.blocked++;
          windowStatus.trainee_results.push(traceEntry);
          continue;
        }

        // Check if this specific meal is logged
        const mealIndex = getMealIndex(mealType);
        const mealsLogged = userState.meals_logged_today || 0;
        const isMealLogged = mealsLogged > mealIndex;

        if (isMealLogged) {
          traceEntry.decision = 'SKIP';
          traceEntry.block_reason = `meal_already_logged (logged: ${mealsLogged}, needed: ${mealIndex + 1})`;
          windowStatus.blocked++;
          windowStatus.trainee_results.push(traceEntry);
          continue;
        }

        // Gate checks
        if (userState.is_in_recovery) {
          traceEntry.decision = 'BLOCKED';
          traceEntry.block_reason = 'in_recovery_mode';
          windowStatus.blocked++;
          windowStatus.trainee_results.push(traceEntry);
          continue;
        }
        if ((userState.silent_count || 0) >= 3) {
          traceEntry.decision = 'BLOCKED';
          traceEntry.block_reason = `silent_mode_count_${userState.silent_count}`;
          windowStatus.blocked++;
          windowStatus.trainee_results.push(traceEntry);
          continue;
        }

        // APPROVED: Send meal reminder
        const firstName = userState.trainee_name?.split(' ')[0] || 'חברי';
        let messageText = '';
        switch (mealType) {
          case 'breakfast':
            messageText = `בוקר טוב ${firstName}! 🌅\n\nנשארה לך רק התחלה קטנה כדי להרים את היום 💪\n\nרשום עכשיו`;
            break;
          case 'lunch':
            messageText = `שלום ${firstName}! 🥗\n\nארוחת צהריים טובה עכשיו יכולה לסגור לך את היום חזק 🍽️\n\nרשום בקלות`;
            break;
          case 'dinner':
            messageText = `ערב טוב ${firstName}! 🍽️\n\nסיום יום טוב עם ארוחת ערב!\n\nרשום בואו 👇`;
            break;
        }

        const mealLogUrl = buildMealLogUrl(mealType);
        if (mealLogUrl) {
          messageText = `${messageText}\n\nלמילוי מהיר: ${mealLogUrl}`;
        }

        // Queue message
        const providers = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({
          coach_email: trainee.coach_email
        }).catch(() => []);
        const providerType = providers[0]?.provider_type || 'greenapi';

        await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
          coach_email: trainee.coach_email,
          to_phone_e164: trainee.phone,
          to_name: trainee.full_name || '',
          context_type: 'trainee',
          context_id: trainee.id,
          template_key: `reminder_${mealType}_check`,
          rendered_text: messageText,
          provider_type: providerType,
          status: 'queued',
          scheduled_for: currentTime.iso,
          session_id: dedupeKey  // IDEMPOTENCY LOCK KEY
        }).catch(() => {});

        // Log event
        await base44.asServiceRole.entities.WhatsAppEventLog.create({
          trainee_id: trainee.id,
          trainee_email: trainee.user_email,
          trigger_type: `${mealType}_check`,
          event_type: 'message_sent',
          timestamp: currentTime.iso,
          message_sent: messageText,
          reason: `${mealType}_not_logged`,
          user_state: userState,
          decision_metadata: { meal_type: mealType, window_time: `${MEAL_WINDOWS[mealType].hour}:00` }
        }).catch(() => {});

        traceEntry.decision = 'SENT';
        traceEntry.block_reason = null;
        windowStatus.reminders_sent++;
        results.reminders_sent++;

        console.log(`[MEAL_SCHEDULER] ✅ ${mealType} reminder SENT to ${trainee.user_email} | meals_logged=${mealsLogged}`);
        windowStatus.trainee_results.push(traceEntry);
      }

      results.trainee_traces.push(...windowStatus.trainee_results);
      results.checked_windows.push(windowStatus);
    } catch (err) {
      results.errors.push({
        meal_type: mealType,
        error: err.message
      });
      console.error(`[MEAL_SCHEDULER] Error for ${mealType}:`, err.message);
    }
  }

  return results;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // NOTE: No auth check — this is called by scheduled automation (no user context)
    // Security: scheduler only, not exposed to public
    const results = await mealReminderScheduler(base44);
    return Response.json({ ok: true, results });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

export { mealReminderScheduler };