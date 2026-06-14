/**
 * MEAL & WATER REINFORCEMENT + RECOVERY HANDLER
 *
 * Handles:
 * 1. Positive reinforcement (user logged meal after reminder)
 * 2. Water goal celebrations (user hit daily target)
 * 3. Recovery messages (3-day & 7-day comeback)
 *
 * Called by:
 * - Entity automation (when meal/water logged)
 * - Scheduled job (3-day / 7-day checks)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─────────────────────────────────────────────────────────────────────
// MEAL REINFORCEMENT
// ─────────────────────────────────────────────────────────────────────

async function handleMealLogged(base44, traineeId, traineeEmail) {
  try {
    const israelMs = new Date().getTime() + 3 * 60 * 60 * 1000;
    const todayStr = new Date(israelMs).toISOString().split('T')[0];

    // Check if message was sent today
    const todayEvents = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
      trainee_email: traineeEmail,
      event_type: 'message_sent',
      trigger_type: { $in: ['breakfast_check', 'lunch_check', 'dinner_check'] }
    }).catch(() => []);

    const messageSentToday = todayEvents.some(e => e.timestamp.startsWith(todayStr));

    if (!messageSentToday) {
      return { ok: true, skipped: true, reason: 'no_reminder_sent_today' };
    }

    // Get trainee info
    const trainee = await base44.asServiceRole.entities.Trainee.filter({
      id: traineeId
    }).catch(() => []);
    const traineeFirstName = (trainee[0]?.full_name || '').split(' ')[0] || 'Friend';

    // Send reinforcement
    const reinforcementText = `אלוף/ה! בדיוק ככה ממשיכים 💪\n\nכל רישום זו צעד בכיוון הנכון!`;

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
      template_key: 'reinforcement_meal',
      rendered_text: reinforcementText,
      provider_type: providerType,
      status: 'queued',
      scheduled_for: new Date().toISOString()
    }).catch(() => {});

    // Log event (reinforcement does NOT count toward daily message limit)
    await base44.asServiceRole.entities.WhatsAppEventLog.create({
      trainee_id: traineeId,
      trainee_email: traineeEmail,
      trigger_type: 'reinforcement_meal',
      event_type: 'reinforcement_sent',
      timestamp: new Date().toISOString(),
      message_sent: reinforcementText,
      reason: 'user_logged_after_reminder',
      user_state: { meals_logged_today: 1 }
    }).catch(() => {});

    return { ok: true, sent: true, type: 'meal_reinforcement' };
  } catch (err) {
    console.error('[handleMealLogged] Error:', err.message);
    return { ok: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────
// WATER GOAL CELEBRATION
// ─────────────────────────────────────────────────────────────────────

async function handleWaterGoalReached(base44, traineeId, traineeEmail) {
  try {
    const trainee = await base44.asServiceRole.entities.Trainee.filter({
      id: traineeId
    }).catch(() => []);

    // Get nutrition targets
    const targets = await base44.asServiceRole.entities.NutritionTargets.filter({
      trainee_email: traineeEmail
    }, '-updated_at', 1).catch(() => []);
    const dailyWaterTarget = targets[0]?.daily_water_ml || 2500;

    const israelMs = new Date().getTime() + 3 * 60 * 60 * 1000;
    const todayStr = new Date(israelMs).toISOString().split('T')[0];

    // Get water logged today
    const waterToday = await base44.asServiceRole.entities.WaterEntry.filter({
      trainee_email: traineeEmail,
      date: todayStr
    }).catch(() => []);
    const totalWaterMl = waterToday.reduce((sum, w) => sum + (w.amount_ml || 0), 0);

    if (totalWaterMl < dailyWaterTarget) {
      return { ok: true, skipped: true, reason: 'water_goal_not_reached' };
    }

    // Check if celebration already sent today
    const todayEvents = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
      trainee_email: traineeEmail,
      trigger_type: 'reinforcement_water'
    }).catch(() => []);

    const celebrationSentToday = todayEvents.some(e => e.timestamp.startsWith(todayStr));
    if (celebrationSentToday) {
      return { ok: true, skipped: true, reason: 'celebration_already_sent' };
    }

    // Send celebration
    const traineeFirstName = (trainee[0]?.full_name || '').split(' ')[0] || 'Friend';
    const celebrationText = `סגרת יעד מים להיום! 💧🔥\n\n${traineeFirstName}, זה בדיוק מה שצריך!\nהגוף שלך תודה לך 🙌`;

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
      template_key: 'reinforcement_water',
      rendered_text: celebrationText,
      provider_type: providerType,
      status: 'queued',
      scheduled_for: new Date().toISOString()
    }).catch(() => {});

    // Log event
    await base44.asServiceRole.entities.WhatsAppEventLog.create({
      trainee_id: traineeId,
      trainee_email: traineeEmail,
      trigger_type: 'reinforcement_water',
      event_type: 'reinforcement_sent',
      timestamp: new Date().toISOString(),
      message_sent: celebrationText,
      reason: 'water_goal_reached',
      user_state: { water_logged_today: totalWaterMl, daily_water_target: dailyWaterTarget }
    }).catch(() => {});

    return { ok: true, sent: true, type: 'water_goal_celebration' };
  } catch (err) {
    console.error('[handleWaterGoalReached] Error:', err.message);
    return { ok: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────
// RECOVERY MESSAGES
// ─────────────────────────────────────────────────────────────────────

async function handleRecoveryCheck(base44, traineeId, traineeEmail) {
  try {
    const trainee = await base44.asServiceRole.entities.Trainee.filter({
      id: traineeId
    }).catch(() => []);

    // Get last login
    const lastLoginMs = trainee[0]?.last_login_at
      ? Date.now() - new Date(trainee[0].last_login_at).getTime()
      : null;

    if (!lastLoginMs) {
      return { ok: true, skipped: true, reason: 'no_last_login' };
    }

    const lastLoginDays = Math.round(lastLoginMs / (1000 * 60 * 60 * 24));

    // Check for 3-day or 7-day milestone
    let messageType = null;
    let recoveryText = null;
    const traineeFirstName = (trainee[0]?.full_name || '').split(' ')[0] || 'Friend';

    if (lastLoginDays === 3) {
      messageType = 'recovery_3day';
      recoveryText = `${traineeFirstName}, רואים שלא היית איתנו כמה ימים 🤔\n\nחזור בואו — אנחנו כאן בשבילך 💙\n\nתחיל עם ארוחה אחת קטנה 💪`;
    } else if (lastLoginDays === 7) {
      messageType = 'recovery_7day';
      recoveryText = `${traineeFirstName}, סוגר לך את זה 🫡\n\nאם זה פחות מתאים עכשיו הכל טוב.\nאם רוצה לחזור — אני פה בשביל לעזור 💪`;
    }

    if (!messageType) {
      return { ok: true, skipped: true, reason: 'not_milestone_day' };
    }

    // Check if recovery message already sent for this milestone
    const allEvents = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
      trainee_email: traineeEmail,
      trigger_type: messageType
    }).catch(() => []);

    if (allEvents.length > 0) {
      return { ok: true, skipped: true, reason: 'recovery_message_already_sent' };
    }

    // Send recovery message
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
      template_key: `recovery_${messageType}`,
      rendered_text: recoveryText,
      provider_type: providerType,
      status: 'queued',
      scheduled_for: new Date().toISOString()
    }).catch(() => {});

    // Log event
    await base44.asServiceRole.entities.WhatsAppEventLog.create({
      trainee_id: traineeId,
      trainee_email: traineeEmail,
      trigger_type: messageType,
      event_type: 'recovery_sent',
      timestamp: new Date().toISOString(),
      message_sent: recoveryText,
      reason: `user_inactive_${lastLoginDays}_days`,
      user_state: { last_login_hours_ago: lastLoginDays * 24 }
    }).catch(() => {});

    return { ok: true, sent: true, type: messageType, inactiveDays: lastLoginDays };
  } catch (err) {
    console.error('[handleRecoveryCheck] Error:', err.message);
    return { ok: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { traineeId, traineeEmail, action } = await req.json();

    if (!traineeId || !traineeEmail || !action) {
      return Response.json({
        ok: false,
        error: 'Missing: traineeId, traineeEmail, action (meal_logged | water_goal_reached | recovery_check)'
      }, { status: 400 });
    }

    let result;

    switch (action) {
      case 'meal_logged':
        result = await handleMealLogged(base44, traineeId, traineeEmail);
        break;
      case 'water_goal_reached':
        result = await handleWaterGoalReached(base44, traineeId, traineeEmail);
        break;
      case 'recovery_check':
        result = await handleRecoveryCheck(base44, traineeId, traineeEmail);
        break;
      default:
        return Response.json({
          ok: false,
          error: `Unknown action: ${action}`
        }, { status: 400 });
    }

    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

export { handleMealLogged, handleWaterGoalReached, handleRecoveryCheck };