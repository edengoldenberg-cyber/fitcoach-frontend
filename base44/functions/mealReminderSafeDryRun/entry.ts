import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MEAL_WINDOWS = {
  breakfast: { hour: 10, minute: 0 },
  lunch: { hour: 14, minute: 0 },
  dinner: { hour: 19, minute: 0 }
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

function isMealDue(mealType, currentTime) {
  const window = MEAL_WINDOWS[mealType];
  const windowStart = window.hour * 60 + window.minute;
  const currentMin = currentTime.hour * 60 + currentTime.minute;

  const nextWindowStart = mealType === 'breakfast'
    ? MEAL_WINDOWS.lunch.hour * 60 + MEAL_WINDOWS.lunch.minute
    : mealType === 'lunch'
    ? MEAL_WINDOWS.dinner.hour * 60 + MEAL_WINDOWS.dinner.minute
    : 24 * 60;

  return currentMin >= windowStart && currentMin < nextWindowStart;
}

function getMealIndex(mealType) {
  return { breakfast: 0, lunch: 1, dinner: 2 }[mealType];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentTime = getCurrentIsraelTime();
    const today = currentTime.iso.split('T')[0];
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit || 25), 100);

    const trainees = await base44.asServiceRole.entities.Trainee.filter({ status: 'active' });
    const eligibleTrainees = trainees
      .filter((trainee) => trainee.whatsapp_notifications_enabled !== false)
      .slice(0, limit);

    const results = {
      dry_run: true,
      no_messages_created: true,
      timestamp: currentTime.iso,
      israel_time: `${currentTime.hour}:${String(currentTime.minute).padStart(2, '0')}`,
      trainees_checked: eligibleTrainees.length,
      would_send: 0,
      blocked: 0,
      skipped: 0,
      active_meal_windows: [],
      samples: []
    };

    for (const [mealType] of Object.entries(MEAL_WINDOWS)) {
      if (!isMealDue(mealType, currentTime)) continue;
      results.active_meal_windows.push(mealType);

      for (const trainee of eligibleTrainees) {
        const sample = {
          trainee_email: trainee.user_email,
          trainee_name: trainee.full_name,
          meal_type: mealType,
          decision: null,
          reason: null
        };

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
          silent_count: lastEvent?.user_state?.silent_count || 0
        };

        const mealRemindersToday = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
          trainee_email: trainee.user_email,
          event_type: 'message_sent'
        }, '-timestamp', 20).catch(() => []);

        const alreadySentThisMeal = mealRemindersToday.some((event) =>
          event.timestamp &&
          event.timestamp.startsWith(today) &&
          event.trigger_type === `${mealType}_check`
        );

        if (alreadySentThisMeal) {
          sample.decision = 'blocked';
          sample.reason = `${mealType}_daily_limit_reached`;
          results.blocked++;
          results.samples.push(sample);
          continue;
        }

        const alreadyQueued = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({
          context_id: trainee.id,
          session_id: `${trainee.id}__${mealType}_check__${today}`
        }).catch(() => []);

        if (alreadyQueued.length > 0) {
          sample.decision = 'blocked';
          sample.reason = 'already_queued_today';
          results.blocked++;
          results.samples.push(sample);
          continue;
        }

        const mealsLogged = userState.meals_logged_today || 0;
        const isMealLogged = mealsLogged > getMealIndex(mealType);
        sample.meals_logged_today = mealsLogged;

        if (isMealLogged) {
          sample.decision = 'skipped';
          sample.reason = 'meal_already_logged';
          results.skipped++;
          results.samples.push(sample);
          continue;
        }

        if (userState.is_in_recovery) {
          sample.decision = 'blocked';
          sample.reason = 'in_recovery_mode';
          results.blocked++;
          results.samples.push(sample);
          continue;
        }

        if ((userState.silent_count || 0) >= 3) {
          sample.decision = 'blocked';
          sample.reason = `silent_mode_count_${userState.silent_count}`;
          results.blocked++;
          results.samples.push(sample);
          continue;
        }

        sample.decision = 'would_send';
        sample.reason = `${mealType}_not_logged`;
        results.would_send++;
        results.samples.push(sample);
      }
    }

    return Response.json({ ok: true, results });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});