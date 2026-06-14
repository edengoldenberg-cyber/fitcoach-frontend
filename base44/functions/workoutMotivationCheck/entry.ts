import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function isOutboundEnabled(base44) {
  try {
    const configs = await base44.asServiceRole.entities.SystemConfig.filter({ key: 'GLOBAL_WHATSAPP_ENABLED' });
    const record = configs && configs[0];
    return record ? record.value === true : false;
  } catch (_) { return false; }
}

function normalizePhone(phoneRaw) {
  if (!phoneRaw) return null;
  let s = String(phoneRaw).trim().replace(/[\s\-().,]/g, '').replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^972\d{9}$/.test(s)) s = '+' + s;
  if (/^0\d{9}$/.test(s)) s = '+972' + s.slice(1);
  if (/^\+972\d{9}$/.test(s)) return s;
  return null;
}

Deno.serve(async (req) => {
  const _base44ks = createClientFromRequest(req);
  const GLOBAL_OUTBOUND_WHATSAPP_ENABLED = await isOutboundEnabled(_base44ks);

  const body = await req.clone().json().catch(() => ({}));
  const testPhoneRaw = body?.testPhone || null;
  const isTestMode = !!testPhoneRaw;

  // KILL SWITCH — blocks everything including test
  if (!GLOBAL_OUTBOUND_WHATSAPP_ENABLED) {
    console.log('[KILL_SWITCH] workoutMotivationCheck BLOCKED — GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE');
    return Response.json({
      ok: false, blocked: true,
      reason: 'GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE',
      message: 'workoutMotivationCheck is disabled by global kill switch. No messages sent.'
    }, { status: 200 });
  }

  try {
    const base44 = createClientFromRequest(req);

    // TEST MODE — send sample to one phone only
    if (isTestMode) {
      const phone = normalizePhone(testPhoneRaw);
      if (!phone) return Response.json({ success: false, error: 'invalid_phone', raw: testPhoneRaw });

      const text = `💪 הודעת טסט — עידוד אימונים\n\nשני אימונים השבוע - אתה בדרך הנכונה!\nעוד אחד ותסיים את השבוע בגדול 🎯`;

      const coaches = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({});
      const provider = coaches.find(p => p.is_enabled && p.status === 'connected') || coaches.find(p => p.is_enabled) || coaches[0];
      const providerType = provider?.provider_type || 'greenapi';
      const coachEmail = provider?.coach_email || 'test@test.com';

      const queueRecord = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
        coach_email: coachEmail,
        to_phone_e164: phone,
        to_name: 'Test',
        context_type: 'system',
        context_id: 'test',
        template_key: 'workout_motivation_test',
        rendered_text: text,
        provider_type: providerType,
        status: 'queued',
        scheduled_for: new Date().toISOString(),
      });
      return Response.json({ success: true, testMode: true, phone, preview: text, queueId: queueRecord.id });
    }

    const nowUtc = new Date();
    const todayIsrael = new Date(nowUtc.getTime() + 3 * 60 * 60 * 1000);
    const todayStr = todayIsrael.toISOString().split('T')[0];
    const dayOfWeek = todayIsrael.getDay();
    const startOfWeek = new Date(todayIsrael);
    startOfWeek.setDate(todayIsrael.getDate() - dayOfWeek);
    const weekStartStr = startOfWeek.toISOString().split('T')[0];

    const trainees = await base44.asServiceRole.entities.Trainee.filter({ status: 'active' });
    const results = [];

    for (const trainee of trainees) {
      if (!trainee.user_email) continue;
      if (trainee.visible_modules?.workouts === false) continue;

      // PART 3 — respect per-trainee whatsapp opt-out
      if (trainee.whatsapp_notifications_enabled === false) {
        results.push({ trainee: trainee.user_email, skipped: true, reason: 'whatsapp_notifications_disabled' });
        continue;
      }

      const phone = normalizePhone(trainee.phone);
      if (!phone) {
        results.push({ trainee: trainee.user_email, skipped: true, reason: 'no_valid_phone', rawPhone: trainee.phone });
        continue;
      }

      const sessions = await base44.asServiceRole.entities.WorkoutSession.filter({ trainee_email: trainee.user_email, status: 'completed' });
      const weekSessions = sessions.filter((s) => s.date >= weekStartStr && s.date <= todayStr);
      const count = weekSessions.length;
      const name = trainee.full_name?.split(' ')[0] || '';

      let message = '';
      if (count === 0) {
        message = `💪 שלום ${name}!\n\nעדיין לא רשמת אימון השבוע - זה הזמן לשנות את זה!\nאפילו אימון אחד ישנה את הכיוון 🔥\n\nאני מאמין בך! 🏋️`;
      } else if (count === 1) {
        message = `🔥 שלום ${name}!\n\nרשמת אימון 1 השבוע - כל הכבוד על ההתחלה!\nהוסף עוד אחד כדי לשמור על המומנטום 💪`;
      } else if (count === 2) {
        message = `⚡ שלום ${name}!\n\nשני אימונים השבוע - אתה בדרך הנכונה!\nעוד אחד ותסיים את השבוע בגדול 🎯`;
      } else if (count === 3) {
        message = `🏆 שלום ${name}!\n\n3 אימונים השבוע - זה בדיוק מה שצריך!\nהתמדה כזו היא המפתח לתוצאות. המשך כך! 🌟`;
      } else {
        message = `🏅 שלום ${name}!\n\n${count} אימונים השבוע - אתה פשוט מדהים! 🔥\nהגוף שלך יודה לך. זכור לנוח גם כן 😊`;
      }

      try {
        // IDEMPOTENCY KEY: trainee_id + trigger_type + date — prevents duplicate sends
        const idempotencyKey = `${trainee.id}__workout_motivation__${todayStr}`;

        // Check if already queued/sent today
        const alreadyQueued = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({
          session_id: idempotencyKey
        }).catch(() => []);

        if (alreadyQueued && alreadyQueued.length > 0) {
          console.log(`[WORKOUT_MOTIVATION] DUPLICATE BLOCKED for ${trainee.user_email} key=${idempotencyKey}`);
          results.push({ trainee: trainee.user_email, skipped: true, reason: 'duplicate_idempotency_key', key: idempotencyKey });
          continue;
        }

        // Global daily frequency cap — same WhatsAppEventLog source as smartMealWaterReminder
        const capLogs = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
          trainee_email: trainee.user_email,
          event_type: 'message_sent'
        }, '-timestamp', 5).catch(() => []);
        if (capLogs.filter(e => e.timestamp?.startsWith(todayStr)).length >= 2) {
          results.push({ trainee: trainee.user_email, skipped: true, reason: 'daily_cap_reached' });
          continue;
        }

        const providers = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: trainee.coach_email });
        const provider = providers.find(p => p.is_enabled && p.status === 'connected') || providers.find(p => p.is_enabled) || providers[0];
        const providerType = provider?.provider_type || 'greenapi';

        const queueRecord = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
          coach_email: trainee.coach_email,
          to_phone_e164: phone,
          to_name: trainee.full_name || '',
          context_type: 'trainee',
          context_id: trainee.id,
          template_key: 'workout_motivation',
          rendered_text: message,
          provider_type: providerType,
          status: 'queued',
          scheduled_for: new Date().toISOString(),
          session_id: idempotencyKey,  // IDEMPOTENCY LOCK
        });

        // Register in shared EventLog so other schedulers see this in the daily cap
        await base44.asServiceRole.entities.WhatsAppEventLog.create({
          trainee_email: trainee.user_email,
          event_type: 'message_sent',
          trigger_type: 'workout_motivation',
          timestamp: new Date().toISOString()
        }).catch(() => {});

        results.push({ trainee: trainee.user_email, queued: true, weekSessions: count, queueId: queueRecord.id });
      } catch (e) {
        results.push({ trainee: trainee.user_email, sent: false, error: e.message });
      }
    }

    return Response.json({ success: true, todayStr, weekStartStr, totalTrainees: trainees.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});