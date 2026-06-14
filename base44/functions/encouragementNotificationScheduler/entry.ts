import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizePhone(phoneRaw) {
  if (!phoneRaw) return null;
  let s = String(phoneRaw).trim().replace(/[\s\-().,]/g, '').replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^972\d{9}$/.test(s)) s = '+' + s;
  if (/^0\d{9}$/.test(s)) s = '+972' + s.slice(1);
  if (/^\+972\d{9}$/.test(s)) return s;
  return null;
}

async function isOutboundEnabled(base44) {
  try {
    const configs = await base44.asServiceRole.entities.SystemConfig.filter({ key: 'GLOBAL_WHATSAPP_ENABLED' });
    return configs[0]?.value === true;
  } catch (_) { return false; }
}

Deno.serve(async (req) => {
  const _base44ks = createClientFromRequest(req);
  const GLOBAL_OUTBOUND_WHATSAPP_ENABLED = await isOutboundEnabled(_base44ks);

  const body = await req.clone().json().catch(() => ({}));
  const testPhoneRaw = body?.testPhone || null;
  const isTestMode = !!testPhoneRaw;

  if (!GLOBAL_OUTBOUND_WHATSAPP_ENABLED) {
    return Response.json({ ok: false, blocked: true, reason: 'GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE' }, { status: 200 });
  }

  try {
    const base44 = createClientFromRequest(req);

    // TEST MODE
    if (isTestMode) {
      const phone = normalizePhone(testPhoneRaw);
      if (!phone) return Response.json({ success: false, error: 'invalid_phone', raw: testPhoneRaw });

      const text = `👏 הודעת טסט — עידוד שבועי\n\nכל הכבוד על ההתמדה עם יומן התזונה ומעקב המים!\nאתה בדרך הנכונה! 💪\n\nהמשך כך! 🎯`;

      const coaches = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({});
      const provider = coaches.find(p => p.is_enabled && p.status === 'connected') || coaches.find(p => p.is_enabled) || coaches[0];
      const providerType = provider?.provider_type || 'greenapi';
      const coachEmail = provider?.coach_email || 'test@test.com';

      const queueRecord = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
        coach_email: coachEmail, to_phone_e164: phone, to_name: 'Test',
        context_type: 'system', context_id: 'test',
        template_key: 'encouragement_test', rendered_text: text,
        provider_type: providerType, status: 'queued', scheduled_for: new Date().toISOString(),
      });
      base44.asServiceRole.functions.invoke('whatsAppQueueWorker', {}).catch(() => {});
      return Response.json({ success: true, testMode: true, phone, preview: text, queueId: queueRecord.id });
    }

    const allTrainees = await base44.asServiceRole.entities.Trainee.filter({ status: 'active' });
    const todayKey = new Date().toISOString().split('T')[0];
    const trainees = allTrainees
      .filter(t => t.whatsapp_notifications_enabled !== false && t.phone && t.user_email)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .slice(0, 25);
    console.log(`[encouragement] Processing ${trainees.length}/${allTrainees.length} eligible trainees`);

    let sentCount = 0;
    let errorCount = 0;

    for (const trainee of trainees) {
      try {
        // PART 3 — respect per-trainee opt-out
        if (trainee.whatsapp_notifications_enabled === false) continue;

        const phone = normalizePhone(trainee.phone);
        if (!phone) continue;

        const today = new Date();
        const sevenDaysAgoStr = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const meals = await base44.asServiceRole.entities.MealEntry.filter({ trainee_email: trainee.user_email });
        const recentMeals = meals.filter(m => m.date >= sevenDaysAgoStr);
        const waters = await base44.asServiceRole.entities.WaterEntry.filter({ trainee_email: trainee.user_email });
        const recentWaters = waters.filter(w => w.date >= sevenDaysAgoStr);

        if (recentMeals.length > 0 || recentWaters.length > 0) {
          const idempotencyKey = `${trainee.id}__encouragement_weekly__${todayKey}`;
          const alreadyQueued = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ session_id: idempotencyKey }).catch(() => []);
          if (alreadyQueued.length > 0) continue;

          // Global daily frequency cap: share the 2/day limit with smartMealWaterReminder
          const todayLogs = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
            trainee_email: trainee.user_email,
            event_type: 'message_sent'
          }, '-timestamp', 5).catch(() => []);
          if (todayLogs.filter(e => e.timestamp?.startsWith(todayKey)).length >= 2) continue;

          const providers = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: trainee.coach_email });
          const provider = providers.find(p => p.is_enabled && p.status === 'connected') || providers.find(p => p.is_enabled) || providers[0];
          const providerType = provider?.provider_type || 'greenapi';

          await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
            coach_email: trainee.coach_email,
            to_phone_e164: phone,
            to_name: trainee.full_name,
            context_type: 'trainee',
            context_id: trainee.id,
            template_key: 'encouragement_weekly',
            rendered_text: `👏 כל הכבוד ${trainee.full_name}!\n\nראינו שאתה ממשיך/ת בהתמדה עם יומן התזונה ומעקב המים. אתה בדרך הנכונה! 💪\n\nהמשך/י כך! 🎯`,
            provider_type: providerType,
            status: 'queued',
            scheduled_for: new Date().toISOString(),
            session_id: idempotencyKey
          });

          // Register in WhatsAppEventLog so other schedulers see this in the daily cap
          await base44.asServiceRole.entities.WhatsAppEventLog.create({
            trainee_email: trainee.user_email,
            event_type: 'message_sent',
            trigger_type: 'encouragement_weekly',
            timestamp: new Date().toISOString()
          }).catch(() => {});

          sentCount++;
        }
      } catch (err) {
        errorCount++;
        console.error(`[encouragement] Error for trainee ${trainee.id}:`, err.message);
      }
    }

    return Response.json({ success: true, sentCount, errorCount, processedTrainees: trainees.length, totalTrainees: allTrainees.length });
  } catch (error) {
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});