/**
 * GET USER STATE SNAPSHOT
 *
 * Central utility for loading complete user state.
 * Used by all reminder/decision functions.
 *
 * Returns:
 * {
 *   meals_logged_today: number,
 *   last_meal_time: ISO string or null,
 *   water_logged: number (ml),
 *   water_target: number (ml),
 *   water_progress: number (0-100),
 *   last_login_hours: number,
 *   streak: number (days),
 *   silent_count: number,
 *   messages_today: number,
 *   last_message_type: string or null,
 *   is_in_recovery: boolean,
 *   recovery_day: number
 * }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function getUserStateSnapshot(base44, traineeId, traineeEmail) {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    // Get trainee
    const trainee = await base44.asServiceRole.entities.Trainee.filter({
      id: traineeId
    }).catch(() => []);
    const traineeRec = trainee[0] || {};

    // Meals today
    const mealsToday = await base44.asServiceRole.entities.MealEntry.filter({
      trainee_email: traineeEmail,
      date: todayStr
    }).catch(() => []);
    const lastMealTime = mealsToday.length > 0
      ? mealsToday[mealsToday.length - 1].date + 'T' + (mealsToday[mealsToday.length - 1].time || '12:00')
      : null;

    // Water today
    const waterToday = await base44.asServiceRole.entities.WaterEntry.filter({
      trainee_email: traineeEmail,
      date: todayStr
    }).catch(() => []);
    const waterLogged = waterToday.reduce((sum, w) => sum + (w.amount_ml || 0), 0);

    // Get nutrition targets
    const targets = await base44.asServiceRole.entities.NutritionTargets.filter({
      trainee_email: traineeEmail
    }, '-updated_at', 1).catch(() => []);
    const waterTarget = targets[0]?.daily_water_ml || 2500;
    const waterProgress = (waterLogged / waterTarget) * 100;

    // Last login
    const lastLoginMs = traineeRec.last_login_at
      ? Date.now() - new Date(traineeRec.last_login_at).getTime()
      : null;
    const lastLoginHours = lastLoginMs ? Math.round(lastLoginMs / (1000 * 60 * 60)) : null;

    // Streak (days with at least 1 meal)
    let streak = 0;
    const allMeals = await base44.asServiceRole.entities.MealEntry.filter({
      trainee_email: traineeEmail
    }, '-date', 100).catch(() => []);
    if (allMeals.length > 0) {
      let lastDate = null;
      for (const meal of allMeals) {
        if (!lastDate) {
          lastDate = meal.date;
          streak = 1;
        } else if (meal.date === lastDate) {
          continue;
        } else {
          const diff = Math.floor(
            (new Date(lastDate) - new Date(meal.date)) / (1000 * 60 * 60 * 24)
          );
          if (diff === 1) {
            streak++;
            lastDate = meal.date;
          } else {
            break;
          }
        }
      }
    }

    // Event log for today
    const todayEvents = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
      trainee_email: traineeEmail,
      event_type: 'message_sent'
    }, '-timestamp', 10).catch(() => []);
    const todayEventsFiltered = todayEvents.filter(e => e.timestamp.startsWith(todayStr));
    const messagestoday = todayEventsFiltered.length;
    const lastMessageType = todayEventsFiltered[0]?.trigger_type || null;

    // Silent count & recovery mode
    let silentCount = 0;
    let isInRecovery = false;
    let recoveryDay = 0;

    const allEvents = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
      trainee_email: traineeEmail
    }, '-timestamp', 5).catch(() => []);

    if (allEvents.length > 0) {
      const lastEvent = allEvents[0];

      // Silent count (consecutive ignored messages)
      if (lastEvent.event_type === 'reminder_skipped' && lastEvent.blocked_reason === 'user_ignored') {
        silentCount = (lastEvent.user_state?.silent_count || 0) + 1;
      } else {
        silentCount = lastEvent.user_state?.silent_count || 0;
      }

      // Recovery check
      if (lastEvent.event_type === 'recovery_sent') {
        const eventDate = new Date(lastEvent.timestamp);
        const daysSinceRecovery = Math.round(
          (Date.now() - eventDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceRecovery < 3) {
          isInRecovery = true;
          recoveryDay = daysSinceRecovery;
        }
      }
    }

    return {
      meals_logged_today: mealsToday.length,
      last_meal_time: lastMealTime,
      water_logged: waterLogged,
      water_target: waterTarget,
      water_progress: Math.round(waterProgress),
      last_login_hours: lastLoginHours,
      streak: streak,
      silent_count: silentCount,
      messages_today: messagestoday,
      last_message_type: lastMessageType,
      is_in_recovery: isInRecovery,
      recovery_day: recoveryDay,
      trainee_name: traineeRec.full_name || 'Friend'
    };
  } catch (err) {
    console.error('[getUserStateSnapshot] Error:', err.message);
    return null;
  }
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

    const snapshot = await getUserStateSnapshot(base44, traineeId, traineeEmail);

    return Response.json({ ok: true, snapshot });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

export { getUserStateSnapshot };