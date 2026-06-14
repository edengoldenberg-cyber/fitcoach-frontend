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

function getIsraelDateString(date = new Date()) {
  const israelMs = date.getTime() + 3 * 60 * 60 * 1000;
  return new Date(israelMs).toISOString().split('T')[0];
}

async function getWaterEntriesForTraineeDate(base44, trainee, date) {
  const emails = Array.from(new Set([
    trainee.user_email,
    trainee.user_email?.toLowerCase(),
    trainee.user_email?.trim(),
  ].filter(Boolean)));

  const entryLists = await Promise.all(emails.map((email) =>
    base44.asServiceRole.entities.WaterEntry.filter({ trainee_email: email, date }).catch(() => [])
  ));

  const byId = new Map();
  for (const list of entryLists) {
    for (const entry of list) {
      if (entry?.id) byId.set(entry.id, entry);
    }
  }

  return Array.from(byId.values());
}

Deno.serve(async (req) => {
  const _base44ks = createClientFromRequest(req);
  const GLOBAL_OUTBOUND_WHATSAPP_ENABLED = await isOutboundEnabled(_base44ks);

  const body = await req.clone().json().catch(() => ({}));
  const testPhoneRaw = body?.testPhone || null;
  const isTestMode = !!testPhoneRaw;

  // KILL SWITCH — blocks everything including test
  if (!GLOBAL_OUTBOUND_WHATSAPP_ENABLED) {
    console.log('[KILL_SWITCH] reminderWaterLog BLOCKED — GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE');
    return Response.json({
      ok: false, blocked: true,
      reason: 'GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE',
      message: 'reminderWaterLog is disabled by global kill switch. No messages queued.'
    }, { status: 200 });
  }

  try {
    const base44 = createClientFromRequest(req);

    // TEST MODE — requires explicit coachEmail to scope provider correctly
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

      const text = `💧 הודעת טסט — תזכורת מים\n\nשתית 750 מ"ל עד עכשיו - יפה!\nנסה להגיע ל-1,500 מ"ל עד הצהריים 🎯\nנותר 1.5 ליטר להיום`;

      // Provider scoped to the specified coach — never picks first system-wide provider
      const providers = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: testCoachEmail });
      const provider = providers.find(p => p.is_enabled && p.status === 'connected') || providers.find(p => p.is_enabled) || providers[0];
      if (!provider) {
        return Response.json({ success: false, error: 'no_provider', message: `No WhatsApp provider configured for ${testCoachEmail}` }, { status: 400 });
      }
      const providerType = provider.provider_type || 'greenapi';

      const queueRecord = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
        coach_email: testCoachEmail,
        to_phone_e164: phone,
        to_name: 'Test',
        context_type: 'system',
        context_id: 'test',
        template_key: 'water_reminder_test',
        rendered_text: text,
        provider_type: providerType,
        status: 'queued',
        scheduled_for: new Date().toISOString(),
      });
      return Response.json({ success: true, testMode: true, phone, preview: text, queueId: queueRecord.id, workerTrigger: 'handled_by_queue_automation' });
    }

    const nowUtc = new Date();
    const israelMs = nowUtc.getTime() + 3 * 60 * 60 * 1000;
    const israelDate = new Date(israelMs);
    const israelHour = israelDate.getUTCHours();
    const israelMinute = israelDate.getUTCMinutes();
    const israelTime = israelHour + israelMinute / 60;
    const todayStr = getIsraelDateString(nowUtc);

    let slotName = '';
    let expectedPct = 0;

    if (israelTime >= 11.5 && israelTime < 13.5) {
      slotName = 'midday'; expectedPct = 0.25;
    } else if (israelTime >= 15.5 && israelTime < 17.5) {
      slotName = 'afternoon'; expectedPct = 0.50;
    } else if (israelTime >= 19.5 && israelTime < 21.0) {
      slotName = 'evening'; expectedPct = 0.75;
    } else {
      return Response.json({ skipped: true, reason: 'not_in_reminder_window', israelHour });
    }

    const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const todayDayName = DAY_NAMES[israelDate.getUTCDay()];

    const trainees = await base44.asServiceRole.entities.Trainee.filter({ status: 'active' });
    const results = [];

    for (const trainee of trainees) {
      if (!trainee.user_email) continue;
      if (trainee.visible_modules?.water === false) continue;

      // PART 3 — respect per-trainee whatsapp opt-out
      if (trainee.whatsapp_notifications_enabled === false) {
        results.push({ trainee: trainee.user_email, skipped: true, reason: 'whatsapp_notifications_disabled' });
        continue;
      }

      const phone = normalizePhone(trainee.phone);
      if (!phone) {
        results.push({ trainee: trainee.user_email, skipped: true, reason: 'no_valid_phone' });
        continue;
      }

      const prefs = await base44.asServiceRole.entities.NotificationPreference.filter({ trainee_email: trainee.user_email });
      const pref = prefs[0];
      if (pref) {
        if (pref.whatsapp_reminders_enabled === false) {
          results.push({ trainee: trainee.user_email, skipped: true, reason: 'user_disabled_reminders' });
          continue;
        }
        if ((pref.disabled_days || []).includes(todayDayName)) {
          results.push({ trainee: trainee.user_email, skipped: true, reason: 'day_muted', day: todayDayName });
          continue;
        }
      }

      const targetMl = trainee.target_water_ml || 2500;
      const waterEntries = await getWaterEntriesForTraineeDate(base44, trainee, todayStr);
      const totalMl = waterEntries.reduce((sum, e) => sum + (e.amount_ml || 0), 0);
      const actualPct = totalMl / targetMl;

      if (waterEntries.length === 0) {
        const recentWaterEntries = await getWaterEntriesForTraineeDate(base44, trainee, getIsraelDateString(new Date(nowUtc.getTime() - 24 * 60 * 60 * 1000)));
        if (recentWaterEntries.length > 0) {
          results.push({ trainee: trainee.user_email, skipped: true, reason: 'water_data_date_mismatch_guard', checkedDate: todayStr, recentEntries: recentWaterEntries.length });
          continue;
        }
      }

      if (actualPct >= 0.95) {
        results.push({ trainee: trainee.user_email, skipped: true, reason: 'goal_reached', totalMl, targetMl });
        continue;
      }
      if (actualPct >= expectedPct) {
        results.push({ trainee: trainee.user_email, skipped: true, reason: 'on_track', totalMl, targetMl, expectedPct });
        continue;
      }

      const name = trainee.full_name?.split(' ')[0] || '';
      const remaining = targetMl - totalMl;
      const remainingLiters = (remaining / 1000).toFixed(1);
      const donePercent = Math.round(actualPct * 100);

      let text = '';
      if (totalMl === 0) {
        text = `💧 שלום ${name}!\n\nיום עמוס? קורה!\nכוס מים אחת עכשיו תעשה את ההבדל 😊\nהיעד שלך הוא ${targetMl} מ"ל - אפשר להשיג את זה!`;
      } else if (slotName === 'midday') {
        text = `💧 שלום ${name}!\n\nשתית ${totalMl} מ"ל עד עכשיו - יפה!\nנסה להגיע ל-${Math.round(targetMl * 0.5)} מ"ל עד הצהריים 🎯\nנותר ${remainingLiters} ליטר להיום`;
      } else if (slotName === 'afternoon') {
        text = `💦 שלום ${name}!\n\n${donePercent}% מהיעד היומי 👍\nעוד ${remainingLiters} ליטר ואתה ב-100%!\nכוס מים כל שעה = מגיע בקלות 💪`;
      } else {
        text = `🌙 שלום ${name}!\n\nלפני שתלך לישון:\nשתית ${totalMl} מ"ל מתוך ${targetMl} מ"ל (${donePercent}%).\n${remaining <= 500 ? `נותר רק ${remaining} מ"ל - כמעט שם! 🏁` : `עוד כמה כוסות יעשו את ההבדל 💧`}`;
      }

      try {
        // Explicit pre-create dedup check — do not rely on DB unique constraint alone.
        // Without this, concurrent cron executions within the same slot window both
        // pass all earlier checks and create duplicate queue records.
        const sessionId = `${trainee.id}__water_reminder__${slotName}__${todayStr}`;
        const alreadyQueued = await base44.asServiceRole.entities.WhatsAppMessageQueue
          .filter({ session_id: sessionId }).catch(() => []);
        if (alreadyQueued.length > 0) {
          results.push({ trainee: trainee.user_email, skipped: true, reason: 'already_queued', key: sessionId });
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
          template_key: 'water_reminder',
          rendered_text: text,
          provider_type: providerType,
          status: 'queued',
          scheduled_for: new Date().toISOString(),
          session_id: sessionId,
        });

        // Register in shared EventLog so other schedulers see this in the daily cap
        await base44.asServiceRole.entities.WhatsAppEventLog.create({
          trainee_email: trainee.user_email,
          event_type: 'message_sent',
          trigger_type: `water_reminder_${slotName}`,
          timestamp: new Date().toISOString()
        }).catch(() => {});

        results.push({ trainee: trainee.user_email, sent: true, totalMl, targetMl, donePercent, slot: slotName, queueId: queueRecord.id, workerTrigger: 'handled_by_queue_automation' });
      } catch (e) {
        results.push({ trainee: trainee.user_email, sent: false, error: e.message });
      }
    }

    return Response.json({ success: true, slot: slotName, israelHour, todayStr, totalTrainees: trainees.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});