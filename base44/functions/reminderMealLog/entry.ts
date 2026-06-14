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
    console.log('[KILL_SWITCH] reminderMealLog BLOCKED — GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE');
    return Response.json({
      ok: false, blocked: true,
      reason: 'GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE',
      message: 'reminderMealLog is disabled by global kill switch. No messages queued.'
    }, { status: 200 });
  }

  try {
    const base44 = createClientFromRequest(req);

    // TEST MODE — send sample to one phone only
    if (isTestMode) {
      const phone = normalizePhone(testPhoneRaw);
      if (!phone) return Response.json({ success: false, error: 'invalid_phone', raw: testPhoneRaw });

      const text = `בוקר טוב! 🌅\n\nזוהי הודעת טסט עבור אוטומציית "תזכורת ארוחות".\n\nהתחלה טובה ביום = תוצאות טובות יותר!\nרשום את ארוחת הבוקר שלך ותן לנו לעזור לך להגיע ל-4 ארוחות היום 🎯`;

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
        template_key: 'meal_reminder_test',
        rendered_text: text,
        provider_type: providerType,
        status: 'queued',
        scheduled_for: new Date().toISOString(),
      });
      base44.asServiceRole.functions.invoke('whatsAppQueueWorker', {}).catch(() => {});
      return Response.json({ success: true, testMode: true, phone, preview: text, queueId: queueRecord.id });
    }

    const nowUtc = new Date();
    const israelMs = nowUtc.getTime() + 3 * 60 * 60 * 1000;
    const israelDate = new Date(israelMs);
    const israelHour = israelDate.getUTCHours();
    const todayStr = israelDate.toISOString().split('T')[0];

    let slotName = '';
    let expectedPct = 0;

    if (israelHour >= 9 && israelHour < 11) {
      slotName = 'morning'; expectedPct = 0.20;
    } else if (israelHour >= 13 && israelHour < 15) {
      slotName = 'afternoon'; expectedPct = 0.40;
    } else if (israelHour >= 19 && israelHour < 22) {
      slotName = 'evening'; expectedPct = 0.70;
    } else {
      return Response.json({ skipped: true, reason: 'not_in_reminder_window', israelHour });
    }

    const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const todayDayName = DAY_NAMES[israelDate.getUTCDay()];
    const threeDaysAgo = new Date(israelMs - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const trainees = await base44.asServiceRole.entities.Trainee.filter({ status: 'active' });
    const results = [];

    for (const trainee of trainees) {
      if (!trainee.user_email) continue;
      if (trainee.visible_modules?.nutrition === false) continue;

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

      const mealPrefs = await base44.asServiceRole.entities.MealPlanPreferences.filter({ trainee_email: trainee.user_email });
      const dailyMealsTarget = mealPrefs[0]?.meals_per_day || 4;
      const todayMeals = await base44.asServiceRole.entities.MealEntry.filter({ trainee_email: trainee.user_email, date: todayStr });
      const mealCount = todayMeals.length;
      const actualPct = mealCount / dailyMealsTarget;

      if (actualPct >= 0.9) {
        results.push({ trainee: trainee.user_email, skipped: true, reason: 'goal_reached', mealCount, dailyMealsTarget });
        continue;
      }
      if (actualPct >= expectedPct) {
        results.push({ trainee: trainee.user_email, skipped: true, reason: 'on_track', mealCount, dailyMealsTarget, expectedPct });
        continue;
      }

      const recentMeals = await base44.asServiceRole.entities.MealEntry.filter({ trainee_email: trainee.user_email });
      const hasRecentActivity = recentMeals.some(m => m.date >= threeDaysAgo);
      const name = trainee.full_name?.split(' ')[0] || '';
      let text = '';

      if (!hasRecentActivity) {
        text = `שלום ${name}! 💪\n\nרואים שלא היית איתנו כמה ימים - זה קורה לכולם!\nהצעד הקטן ביותר לחזור למסלול הוא לרשום ארוחה אחת עכשיו.\nאנחנו כאן בשבילך 🙌`;
      } else if (slotName === 'morning') {
        text = `בוקר טוב ${name}! 🌅\n\nהתחלה טובה ביום = תוצאות טובות יותר!\nרשום את ארוחת הבוקר שלך ותן לנו לעזור לך להגיע ל-${dailyMealsTarget} ארוחות היום 🎯`;
      } else if (slotName === 'afternoon') {
        const remaining = dailyMealsTarget - mealCount;
        text = `שלום ${name}! 🥗\n\nנרשמו ${mealCount} ארוחות מתוך יעד ${dailyMealsTarget} להיום.\nנותר ${remaining} ארוחות - עוד לא מאוחר להגיע ליעד! 💪`;
      } else {
        const remaining = dailyMealsTarget - mealCount;
        text = `ערב טוב ${name}! 🌙\n\nסיכום יום: נרשמו ${mealCount} מתוך ${dailyMealsTarget} ארוחות.\n${remaining > 0 ? `עוד ${remaining} ארוחה וסגרת את היום ✅` : 'כמעט שם!'}\nכנס לאפליקציה ועדכן 📱`;
      }

      try {
        const providers = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: trainee.coach_email });
        const provider = providers.find(p => p.is_enabled && p.status === 'connected') || providers.find(p => p.is_enabled) || providers[0];
        const providerType = provider?.provider_type || 'greenapi';

        const queueRecord = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
          coach_email: trainee.coach_email,
          to_phone_e164: phone,
          to_name: trainee.full_name || '',
          context_type: 'trainee',
          context_id: trainee.id,
          template_key: 'meal_reminder',
          rendered_text: text,
          provider_type: providerType,
          status: 'queued',
          scheduled_for: new Date().toISOString(),
        });

        base44.asServiceRole.functions.invoke('whatsAppQueueWorker', {}).catch(() => {});
        results.push({ trainee: trainee.user_email, sent: true, mealCount, dailyMealsTarget, slot: slotName, queueId: queueRecord.id });
      } catch (e) {
        results.push({ trainee: trainee.user_email, sent: false, error: e.message });
      }
    }

    return Response.json({ success: true, slot: slotName, israelHour, todayStr, totalTrainees: trainees.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});