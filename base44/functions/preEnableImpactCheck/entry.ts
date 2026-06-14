/**
 * PRE-ENABLE IMPACT CHECK — READ ONLY — NO MESSAGES SENT
 * Simulates what would happen if GLOBAL_WHATSAPP_ENABLED is turned on.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    // 1. Queue risk — READ ONLY
    const allQueue = await base44.asServiceRole.entities.WhatsAppMessageQueue.list('-created_date', 500);
    const immediateStatuses = ['queued', 'sending', 'retry', 'failed'];
    const immediateQueue = allQueue.filter(m => immediateStatuses.includes(m.status));
    const pendingQueue = allQueue.filter(m => m.status === 'queued');
    const failedQueue = allQueue.filter(m => m.status === 'failed');
    const sendingQueue = allQueue.filter(m => m.status === 'sending');

    // 2. Active trainees — for automation risk
    const allTrainees = await base44.asServiceRole.entities.Trainee.list('-created_date', 500);
    const activeTrainees = allTrainees.filter(t => t.status === 'active');
    const waEnabled = activeTrainees.filter(t => t.whatsapp_notifications_enabled !== false);
    const waDisabled = activeTrainees.filter(t => t.whatsapp_notifications_enabled === false);
    const nonActiveCount = allTrainees.filter(t => t.status !== 'active').length;

    // 3. Today's meal logs
    const todayMeals = await base44.asServiceRole.entities.MealEntry.filter({ date: today });
    const traineeEmailsWithMeals = new Set(todayMeals.map(m => m.trainee_email));

    // 4. Today's water logs
    const todayWater = await base44.asServiceRole.entities.WaterEntry.filter({ date: today });
    const traineeEmailsWithWater = new Set(todayWater.map(w => w.trainee_email));

    // 5. Today's workouts
    const todayWorkouts = await base44.asServiceRole.entities.WorkoutSession.filter({ date: today });
    const traineeEmailsWithWorkout = new Set(todayWorkouts.map(w => w.trainee_email));

    // 6. Active automation rules (WhatsApp)
    const allRules = await base44.asServiceRole.entities.WhatsAppAutomationRule.list();
    const activeRules = allRules.filter(r => r.is_active);

    // Helper: mask phone
    const maskPhone = (phone) => {
      if (!phone) return '---';
      const s = String(phone);
      return s.length > 6 ? s.slice(0, 4) + '****' + s.slice(-2) : '****';
    };

    // 7. Per-automation risk simulation (READ ONLY — NO DB writes)
    const automationRisks = [];

    // reminderMealLog — trainees with no meal today
    const mealMissingTargets = waEnabled.filter(t => !traineeEmailsWithMeals.has(t.user_email));
    automationRisks.push({
      automation: 'reminderMealLog',
      label: 'תזכורת רישום ארוחה',
      wouldSend: mealMissingTargets.length,
      sample: mealMissingTargets.slice(0, 5).map(t => ({ name: t.full_name, phone: maskPhone(t.phone) })),
      reason: 'מתאמנים ללא ארוחה רשומה היום'
    });

    // reminderWaterLog — trainees with no water today
    const waterMissingTargets = waEnabled.filter(t => !traineeEmailsWithWater.has(t.user_email));
    automationRisks.push({
      automation: 'reminderWaterLog',
      label: 'תזכורת שתיית מים',
      wouldSend: waterMissingTargets.length,
      sample: waterMissingTargets.slice(0, 5).map(t => ({ name: t.full_name, phone: maskPhone(t.phone) })),
      reason: 'מתאמנים ללא רישום מים היום'
    });

    // workoutMotivationCheck — trainees with no workout today
    const workoutMissingTargets = waEnabled.filter(t => !traineeEmailsWithWorkout.has(t.user_email));
    automationRisks.push({
      automation: 'workoutMotivationCheck',
      label: 'מוטיבציית אימון',
      wouldSend: workoutMissingTargets.length,
      sample: workoutMissingTargets.slice(0, 5).map(t => ({ name: t.full_name, phone: maskPhone(t.phone) })),
      reason: 'מתאמנים ללא אימון רשום היום'
    });

    // nudgeScheduler / encouragementNotificationScheduler — all WA-enabled
    automationRisks.push({
      automation: 'nudgeScheduler',
      label: 'Nudge Scheduler',
      wouldSend: waEnabled.length,
      sample: waEnabled.slice(0, 5).map(t => ({ name: t.full_name, phone: maskPhone(t.phone) })),
      reason: 'כל המתאמנים הפעילים עם WhatsApp מופעל'
    });

    automationRisks.push({
      automation: 'encouragementNotificationScheduler',
      label: 'עידוד שבועי',
      wouldSend: waEnabled.length,
      sample: waEnabled.slice(0, 5).map(t => ({ name: t.full_name, phone: maskPhone(t.phone) })),
      reason: 'כל המתאמנים הפעילים עם WhatsApp מופעל'
    });

    // weighInReminderScheduler
    automationRisks.push({
      automation: 'weighInReminderScheduler',
      label: 'תזכורת שקילה',
      wouldSend: waEnabled.length,
      sample: waEnabled.slice(0, 5).map(t => ({ name: t.full_name, phone: maskPhone(t.phone) })),
      reason: 'מתאמנים ללא שקילה עדכנית'
    });

    // feedbackRequestScheduler
    automationRisks.push({
      automation: 'feedbackRequestScheduler',
      label: 'בקשת פידבק',
      wouldSend: waEnabled.length,
      sample: waEnabled.slice(0, 5).map(t => ({ name: t.full_name, phone: maskPhone(t.phone) })),
      reason: 'מתאמנים פעילים'
    });

    // Unique targets across all automations
    const allTargetEmails = new Set([
      ...mealMissingTargets.map(t => t.user_email),
      ...waterMissingTargets.map(t => t.user_email),
      ...workoutMissingTargets.map(t => t.user_email),
      ...waEnabled.map(t => t.user_email),
    ]);

    const summary = {
      immediateQueue: immediateQueue.length,
      pendingQueue: pendingQueue.length,
      failedQueue: failedQueue.length,
      sendingQueue: sendingQueue.length,
      totalAutomationTargets: allTargetEmails.size,
      waDisabledSkipped: waDisabled.length,
      nonActiveSkipped: nonActiveCount,
      estimatedNextHour: immediateQueue.length + mealMissingTargets.length + waterMissingTargets.length,
      estimatedToday: immediateQueue.length + allTargetEmails.size,
      canEnableSafely: immediateQueue.length === 0 && nonActiveCount === 0,
      blockers: [],
    };

    if (immediateQueue.length > 0) {
      summary.blockers.push(`יש ${immediateQueue.length} הודעות בתור מיידי שיישלחו מיד`);
    }
    if (failedQueue.length > 0) {
      summary.blockers.push(`יש ${failedQueue.length} הודעות שנכשלו שיוחזרו לשליחה`);
    }

    return Response.json({
      ok: true,
      readOnly: true,
      noMessagesSent: true,
      summary,
      automationRisks,
      queueSnapshot: {
        immediate: immediateQueue.length,
        statuses: {
          queued: pendingQueue.length,
          sending: sendingQueue.length,
          failed: failedQueue.length,
        },
        sampleQueued: pendingQueue.slice(0, 5).map(m => ({
          to: maskPhone(m.to_phone_e164),
          name: m.to_name,
          template: m.template_key,
          status: m.status
        }))
      },
      traineeStats: {
        total: allTrainees.length,
        active: activeTrainees.length,
        waEnabled: waEnabled.length,
        waDisabled: waDisabled.length,
        nonActive: nonActiveCount,
      }
    });

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});