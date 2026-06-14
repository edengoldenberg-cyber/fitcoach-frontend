import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CONSISTENCY_THRESHOLD = 5;
const REMINDER_INTERVAL_WEEKS = 3;

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

      const text = `📋 הודעת טסט — תזכורת שקילה\n\nזמן להערכה גופנית! 💪\n\nכל 3 שבועות, חשוב להעריך את ההתקדמות.\nנדרש:\n📊 מדידת משקל\n📏 אחוז שומן גוף\n\nמדדו בבוקר, לפני ארוחה 🎯`;

      const coaches = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({});
      const provider = coaches.find(p => p.is_enabled && p.status === 'connected') || coaches.find(p => p.is_enabled) || coaches[0];
      const providerType = provider?.provider_type || 'greenapi';
      const coachEmail = provider?.coach_email || 'test@test.com';

      const queueRecord = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
        coach_email: coachEmail, to_phone_e164: phone, to_name: 'Test',
        context_type: 'system', context_id: 'test',
        template_key: 'weigh_in_reminder_test', rendered_text: text,
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
    const results = { processed: 0, sent: 0, errors: [], skipped_opt_out: 0, totalTrainees: allTrainees.length };

    for (const trainee of trainees) {
      try {
        // PART 3 — respect per-trainee opt-out
        if (trainee.whatsapp_notifications_enabled === false) {
          results.skipped_opt_out++;
          results.processed++;
          continue;
        }

        const phone = normalizePhone(trainee.phone);
        if (!phone) { results.processed++; results.errors.push(`${trainee.user_email}: No valid phone`); continue; }

        const idempotencyKey = `${trainee.id}__weigh_in_reminder__${todayKey}`;
        const alreadyQueued = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ session_id: idempotencyKey }).catch(() => []);
        if (alreadyQueued.length > 0) { results.processed++; continue; }

        // Global daily frequency cap — same WhatsAppEventLog source as smartMealWaterReminder
        const capLogs = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
          trainee_email: trainee.user_email,
          event_type: 'message_sent'
        }, '-timestamp', 5).catch(() => []);
        if (capLogs.filter(e => e.timestamp?.startsWith(todayKey)).length >= 2) {
          results.processed++; continue;
        }

        const mealEntries = await base44.asServiceRole.entities.MealEntry.filter(
          { trainee_email: trainee.user_email }, 'created_date', 1
        );
        if (!mealEntries || mealEntries.length === 0) { results.processed++; continue; }

        const firstMealDate = new Date(mealEntries[0].created_date);
        const now = new Date();
        const weeksSinceFirstMeal = (now - firstMealDate) / (1000 * 60 * 60 * 24 * 7);

        const isReminderTime = weeksSinceFirstMeal >= REMINDER_INTERVAL_WEEKS &&
          (weeksSinceFirstMeal % REMINDER_INTERVAL_WEEKS) < 0.2;

        if (!isReminderTime) { results.processed++; continue; }

        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const recentMeals = await base44.asServiceRole.entities.MealEntry.filter({ trainee_email: trainee.user_email });
        const recentMealDates = new Set();
        for (const meal of recentMeals) {
          const mealDate = new Date(meal.created_date);
          if (mealDate >= sevenDaysAgo) recentMealDates.add(mealDate.toISOString().split('T')[0]);
        }

        if (recentMealDates.size < CONSISTENCY_THRESHOLD) { results.processed++; continue; }

        const text = `📋 זמן להערכה גופנית!\n\nאנחנו כאן כדי לעזור לך להשיג את היעדים שלך! 💪\n\nכל 3 שבועות, חשוב להעריך את ההתקדמות שלך.\n\nכדי שנוכל לעקוב אחר השינויים, אנחנו צריכים:\n📊 מדידת משקל\n📏 מדידת אחוז שומן גוף (אם אפשר)\n\n💡 טיפים למדידה מדויקת:\n• מדדו תמיד בבוקר, לפני ארוחה\n• בלבוש קל או חופשי\n• אותו קנה מידה, אותו מקום\n\nאנחנו חוזרים בעוד שבוע כדי לדיון בתוצאות! 🎯`;

        const providers = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: trainee.coach_email });
        const provider = providers.find(p => p.is_enabled && p.status === 'connected') || providers.find(p => p.is_enabled) || providers[0];
        const providerType = provider?.provider_type || 'greenapi';

        await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
          coach_email: trainee.coach_email, to_phone_e164: phone, to_name: trainee.full_name,
          context_type: 'trainee', context_id: trainee.id,
          template_key: 'weigh_in_reminder', rendered_text: text,
          provider_type: providerType, status: 'queued',
          scheduled_for: new Date().toISOString(),
          session_id: idempotencyKey,
        });

        // Register in shared EventLog so other schedulers see this in the daily cap
        await base44.asServiceRole.entities.WhatsAppEventLog.create({
          trainee_email: trainee.user_email,
          event_type: 'message_sent',
          trigger_type: 'weigh_in_reminder',
          timestamp: new Date().toISOString()
        }).catch(() => {});

        results.sent++;
        results.processed++;
      } catch (error) {
        results.processed++;
        results.errors.push(`${trainee.user_email}: ${error.message}`);
      }
    }

    return Response.json({ success: true, processedTrainees: trainees.length, ...results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});