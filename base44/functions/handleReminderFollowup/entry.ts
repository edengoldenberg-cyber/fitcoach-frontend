/**
 * HANDLE REMINDER FOLLOWUP
 *
 * Called when:
 * 1. User logs meal after reminder
 * 2. User reaches water target
 * 3. User ignores reminder (track for silent mode)
 *
 * Enforces:
 * - 12-hour reinforcement cooldown
 * - 3-strike silent mode (3 days silence)
 * - Positive reinforcement (celebration messages)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function handleReminderFollowup(base44, traineeId, traineeEmail, action) {
  try {
    const trainee = await base44.asServiceRole.entities.Trainee.filter({
      id: traineeId
    }).catch(() => []);
    const traineeRec = trainee[0] || {};
    const firstName = (traineeRec.full_name || '').split(' ')[0] || 'Friend';

    const todayStr = new Date().toISOString().split('T')[0];

    // ─────────────────────────────────────────────────────────────────
    // ACTION: Meal logged after reminder
    // ─────────────────────────────────────────────────────────────────

    if (action === 'meal_logged_after_reminder') {
      // Check if reminder was sent today
      const todayEvents = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
        trainee_email: traineeEmail,
        event_type: 'message_sent',
        trigger_type: { $in: ['breakfast_check', 'lunch_check', 'dinner_check'] }
      }).catch(() => []);

      const messageSentToday = todayEvents.some(e => e.timestamp.startsWith(todayStr));

      if (!messageSentToday) {
        return { ok: true, skipped: true, reason: 'no_reminder_sent_today' };
      }

      // Check 12-hour reinforcement cooldown
      const lastReinforcements = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
        trainee_email: traineeEmail,
        trigger_type: 'reinforcement_meal'
      }, '-timestamp', 1).catch(() => []);

      if (lastReinforcements.length > 0) {
        const lastReinfTs = new Date(lastReinforcements[0].timestamp).getTime();
        const hoursAgo = (Date.now() - lastReinfTs) / (1000 * 60 * 60);
        if (hoursAgo < 12) {
          return { ok: true, skipped: true, reason: 'reinforcement_cooldown_active' };
        }
      }

      // Send celebration
      const celebrationText = `אלוף/ה! בדיוק ככה ממשיכים 💪\n\nכל רישום זו צעד בכיוון הנכון!`;

      const providers = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({
        coach_email: traineeRec.coach_email
      }).catch(() => []);
      const providerType = providers[0]?.provider_type || 'greenapi';

      await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
        coach_email: traineeRec.coach_email,
        to_phone_e164: traineeRec.phone,
        to_name: traineeRec.full_name || '',
        context_type: 'trainee',
        context_id: traineeId,
        template_key: 'reinforcement_meal',
        rendered_text: celebrationText,
        provider_type: providerType,
        status: 'queued'
      }).catch(() => {});

      await base44.asServiceRole.entities.WhatsAppEventLog.create({
        trainee_id: traineeId,
        trainee_email: traineeEmail,
        trigger_type: 'reinforcement_meal',
        event_type: 'reinforcement_sent',
        timestamp: new Date().toISOString(),
        message_sent: celebrationText,
        reason: 'user_logged_after_reminder',
        user_state: { meals_logged_today: 1 }
      }).catch(() => {});

      return { ok: true, sent: true, type: 'meal_reinforcement' };
    }

    // ─────────────────────────────────────────────────────────────────
    // ACTION: Water goal reached
    // ─────────────────────────────────────────────────────────────────

    if (action === 'water_goal_reached') {
      const targets = await base44.asServiceRole.entities.NutritionTargets.filter({
        trainee_email: traineeEmail
      }, '-updated_at', 1).catch(() => []);
      const dailyWaterTarget = targets[0]?.daily_water_ml || 2500;

      const waterToday = await base44.asServiceRole.entities.WaterEntry.filter({
        trainee_email: traineeEmail,
        date: todayStr
      }).catch(() => []);
      const totalWaterMl = waterToday.reduce((sum, w) => sum + (w.amount_ml || 0), 0);

      if (totalWaterMl < dailyWaterTarget) {
        return { ok: true, skipped: true, reason: 'water_goal_not_reached' };
      }

      // Check if already sent today
      const todayWaterEvents = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
        trainee_email: traineeEmail,
        trigger_type: 'reinforcement_water'
      }).catch(() => []);

      if (todayWaterEvents.some(e => e.timestamp.startsWith(todayStr))) {
        return { ok: true, skipped: true, reason: 'celebration_already_sent' };
      }

      const celebrationText = `סגרת יעד מים להיום! 💧🔥\n\n${firstName}, זה בדיוק מה שצריך!\nהגוף שלך תודה לך 🙌`;

      const providers = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({
        coach_email: traineeRec.coach_email
      }).catch(() => []);
      const providerType = providers[0]?.provider_type || 'greenapi';

      await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
        coach_email: traineeRec.coach_email,
        to_phone_e164: traineeRec.phone,
        to_name: traineeRec.full_name || '',
        context_type: 'trainee',
        context_id: traineeId,
        template_key: 'reinforcement_water',
        rendered_text: celebrationText,
        provider_type: providerType,
        status: 'queued'
      }).catch(() => {});

      await base44.asServiceRole.entities.WhatsAppEventLog.create({
        trainee_id: traineeId,
        trainee_email: traineeEmail,
        trigger_type: 'reinforcement_water',
        event_type: 'reinforcement_sent',
        timestamp: new Date().toISOString(),
        message_sent: celebrationText,
        reason: 'water_goal_reached',
        user_state: { water_logged_today: totalWaterMl }
      }).catch(() => {});

      return { ok: true, sent: true, type: 'water_goal_celebration' };
    }

    // ─────────────────────────────────────────────────────────────────
    // ACTION: User ignored reminder (track for silent mode)
    // ─────────────────────────────────────────────────────────────────

    if (action === 'user_ignored_reminder') {
      const state = await base44.asServiceRole.functions.invoke('getUserStateSnapshot', {
        traineeId,
        traineeEmail
      }).catch(() => ({}));

      const currentSilentCount = state.snapshot?.silent_count || 0;
      const newSilentCount = currentSilentCount + 1;

      // If 3 strikes: activate silent mode (3 days)
      if (newSilentCount >= 3) {
        const silencedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

        await base44.asServiceRole.entities.WhatsAppEventLog.create({
          trainee_id: traineeId,
          trainee_email: traineeEmail,
          trigger_type: 'silent_mode_activated',
          event_type: 'reminder_skipped',
          timestamp: new Date().toISOString(),
          blocked_reason: 'user_ignored_3_times',
          user_state: { silent_count: newSilentCount, silenced_until: silencedUntil }
        }).catch(() => {});

        return {
          ok: true,
          silent_mode_activated: true,
          silent_until: silencedUntil
        };
      }

      return {
        ok: true,
        silent_count: newSilentCount,
        silent_mode_activated: false
      };
    }

    return { ok: false, error: `Unknown action: ${action}` };
  } catch (err) {
    console.error('[handleReminderFollowup] Error:', err.message);
    return { ok: false, error: err.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { traineeId, traineeEmail, action } = await req.json();

    if (!traineeId || !traineeEmail || !action) {
      return Response.json({
        ok: false,
        error: 'Missing: traineeId, traineeEmail, action (meal_logged_after_reminder | water_goal_reached | user_ignored_reminder)'
      }, { status: 400 });
    }

    const result = await handleReminderFollowup(base44, traineeId, traineeEmail, action);

    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

export { handleReminderFollowup };