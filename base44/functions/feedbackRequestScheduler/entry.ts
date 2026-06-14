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

    // TEST MODE — requires explicit coachEmail to scope the provider correctly
    if (isTestMode) {
      const phone = normalizePhone(testPhoneRaw);
      if (!phone) return Response.json({ success: false, error: 'invalid_phone', raw: testPhoneRaw });

      const testCoachEmail = body?.coachEmail || null;
      if (!testCoachEmail) {
        return Response.json({
          success: false, error: 'missing_coach_email',
          message: 'testPhone requires coachEmail to scope the provider. Sending without coachEmail risks using another coach\'s WhatsApp instance.',
        }, { status: 400 });
      }

      const text = `🎤 הודעת טסט — בקשת משוב\n\nחלף חודש מאז התחלת את התוכנית. אנחנו רוצים לשמוע את דעתך! 👂\n\nהאם אתה מרוצה מהחוויה? מה אנחנו יכולים לשפר?\n\nנשמח לקבל את המשוב שלך! 💬`;

      // Provider scoped to the specified coach — never picks first system-wide provider
      const providers = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: testCoachEmail });
      const provider = providers.find(p => p.is_enabled && p.status === 'connected') || providers.find(p => p.is_enabled) || providers[0];
      if (!provider) {
        return Response.json({ success: false, error: 'no_provider', message: `No WhatsApp provider configured for ${testCoachEmail}` }, { status: 400 });
      }
      const providerType = provider.provider_type || 'greenapi';

      const queueRecord = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
        coach_email: testCoachEmail, to_phone_e164: phone, to_name: 'Test',
        context_type: 'system', context_id: 'test',
        template_key: 'feedback_request_test', rendered_text: text,
        provider_type: providerType, status: 'queued', scheduled_for: new Date().toISOString(),
      });
      base44.asServiceRole.functions.invoke('whatsAppQueueWorker', {}).catch(() => {});
      return Response.json({ success: true, testMode: true, phone, preview: text, queueId: queueRecord.id });
    }

    const trainees = await base44.asServiceRole.entities.Trainee.filter({ status: 'active' });
    console.log(`[feedback] Found ${trainees.length} active trainees`);

    let sentCount = 0;
    let errorCount = 0;

    for (const trainee of trainees) {
      try {
        // PART 3 — respect per-trainee opt-out
        if (trainee.whatsapp_notifications_enabled === false) continue;

        if (!trainee.first_login_at) continue;

        const firstLoginDate = new Date(trainee.first_login_at);
        const daysSinceFirstLogin = Math.floor((new Date().getTime() - firstLoginDate.getTime()) / (24 * 60 * 60 * 1000));

        if (daysSinceFirstLogin >= 29 && daysSinceFirstLogin <= 31) {
          const phone = normalizePhone(trainee.phone);
          if (!phone) continue;

          // Once-ever idempotency: session_id has no date suffix so it fires exactly once
          // regardless of which day (29, 30, or 31) the scheduler runs. Without this,
          // a daily cron would send 3 identical feedback messages over 3 consecutive days.
          const sessionId = `${trainee.id}__feedback_30days`;
          const alreadyQueued = await base44.asServiceRole.entities.WhatsAppMessageQueue
            .filter({ session_id: sessionId }).catch(() => []);
          if (alreadyQueued.length > 0) continue;

          const providers = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: trainee.coach_email });
          const provider = providers.find(p => p.is_enabled && p.status === 'connected') || providers.find(p => p.is_enabled) || providers[0];
          const providerType = provider?.provider_type || 'greenapi';

          await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
            coach_email: trainee.coach_email,
            to_phone_e164: phone,
            to_name: trainee.full_name,
            context_type: 'trainee',
            context_id: trainee.id,
            template_key: 'feedback_request_30days',
            rendered_text: `🎤 היי ${trainee.full_name}!\n\nחלף חודש מאז התחלת את התוכנית. אנחנו רוצים לשמוע את דעתך! 👂\n\nהאם אתה מרוצה מהחוויה? מה אנחנו יכולים לשפר?\n\nנשמח לקבל את המשוב שלך! 💬`,
            provider_type: providerType,
            status: 'queued',
            session_id: sessionId,
          });
          sentCount++;
        }
      } catch (err) {
        errorCount++;
        console.error(`[feedback] Error for trainee ${trainee.id}:`, err.message);
      }
    }

    return Response.json({ success: true, sentCount, errorCount, totalTrainees: trainees.length });
  } catch (error) {
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});