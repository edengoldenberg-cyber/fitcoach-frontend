import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// DEBUG ONLY — deep trace of reminderWaterLog logic without sending anything
// Bypasses: time window, water conditions when debugMode=true

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
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const debugMode = body?.debugMode === true;
    const coachEmailFilter = body?.coachEmail || null;

    // System state
    const configs = await base44.asServiceRole.entities.SystemConfig.filter({ key: 'GLOBAL_WHATSAPP_ENABLED' });
    const killSwitchEnabled = configs[0]?.value === true;
    const automationConfigs = await base44.asServiceRole.entities.SystemConfig.filter({ key: 'WHATSAPP_AUTOMATIONS_ENABLED' });
    const automationsEnabled = automationConfigs[0]?.value === true;

    // Time window
    const nowUtc = new Date();
    const israelMs = nowUtc.getTime() + 3 * 60 * 60 * 1000;
    const israelDate = new Date(israelMs);
    const israelHour = israelDate.getUTCHours();
    const israelMinute = israelDate.getUTCMinutes();
    const israelTime = israelHour + israelMinute / 60;
    const todayStr = israelDate.toISOString().split('T')[0];

    let slotName = '';
    let expectedPct = 0;
    let inTimeWindow = false;

    if (israelTime >= 11.5 && israelTime < 13.5) {
      slotName = 'midday'; expectedPct = 0.25; inTimeWindow = true;
    } else if (israelTime >= 15.5 && israelTime < 17.5) {
      slotName = 'afternoon'; expectedPct = 0.50; inTimeWindow = true;
    } else if (israelTime >= 19.5 && israelTime < 21.0) {
      slotName = 'evening'; expectedPct = 0.75; inTimeWindow = true;
    }

    const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const todayDayName = DAY_NAMES[israelDate.getUTCDay()];

    if (!inTimeWindow && !debugMode) {
      return Response.json({
        ok: true,
        debugMode: false,
        diagnosis: 'BLOCKED_BY_TIME_WINDOW',
        explanation: `Current Israel time is ${israelHour}:${String(israelMinute).padStart(2,'0')}. reminderWaterLog only runs in windows: 11:30-13:30, 15:30-17:30, 19:30-21:00`,
        suggestion: 'Pass { debugMode: true } to bypass time window and see full trace',
        killSwitchEnabled,
        automationsEnabled,
        israelHour, israelMinute,
        israelTime: israelTime.toFixed(2),
        todayStr, todayDayName,
      });
    }

    if (!inTimeWindow && debugMode) {
      slotName = 'midday';
      expectedPct = 0.25;
    }

    const query = { status: 'active' };
    if (coachEmailFilter) query.coach_email = coachEmailFilter;
    const trainees = await base44.asServiceRole.entities.Trainee.filter(query);

    const trace = [];

    for (const trainee of trainees) {
      const entry = {
        email: trainee.user_email,
        name: trainee.full_name,
        phone_raw: trainee.phone,
        phone_normalized: null,
        coach_email: trainee.coach_email,
        whatsapp_notifications_enabled: trainee.whatsapp_notifications_enabled !== false,
        passed_phone_check: false,
        passed_pref_check: false,
        passed_water_check: false,
        would_send: false,
        reason: '',
        water_total_ml: 0,
        water_target_ml: trainee.target_water_ml || 2500,
        water_pct: 0,
        expected_pct: expectedPct,
        slot: slotName,
      };

      if (!trainee.user_email) { entry.reason = 'no_user_email'; trace.push(entry); continue; }
      if (trainee.visible_modules?.water === false) { entry.reason = 'water_module_disabled'; trace.push(entry); continue; }

      // PART 3 — whatsapp opt-out check
      if (trainee.whatsapp_notifications_enabled === false) {
        entry.reason = 'whatsapp_notifications_disabled';
        trace.push(entry);
        continue;
      }

      const phone = normalizePhone(trainee.phone);
      entry.phone_normalized = phone;
      if (!phone) { entry.reason = 'no_valid_phone'; trace.push(entry); continue; }
      entry.passed_phone_check = true;

      const prefs = await base44.asServiceRole.entities.NotificationPreference.filter({ trainee_email: trainee.user_email });
      const pref = prefs[0];
      if (pref?.whatsapp_reminders_enabled === false) { entry.reason = 'user_disabled_reminders'; trace.push(entry); continue; }
      if ((pref?.disabled_days || []).includes(todayDayName)) { entry.reason = `day_muted (${todayDayName})`; trace.push(entry); continue; }
      entry.passed_pref_check = true;

      const waterEntries = await base44.asServiceRole.entities.WaterEntry.filter({ trainee_email: trainee.user_email, date: todayStr });
      const totalMl = waterEntries.reduce((sum, e) => sum + (e.amount_ml || 0), 0);
      const targetMl = trainee.target_water_ml || 2500;
      const actualPct = totalMl / targetMl;

      entry.water_total_ml = totalMl;
      entry.water_target_ml = targetMl;
      entry.water_pct = Math.round(actualPct * 100);

      if (!debugMode) {
        if (actualPct >= 0.95) { entry.reason = `goal_reached (${Math.round(actualPct*100)}%>=95%)`; trace.push(entry); continue; }
        if (actualPct >= expectedPct) { entry.reason = `on_track (${Math.round(actualPct*100)}%>=expected ${Math.round(expectedPct*100)}%)`; trace.push(entry); continue; }
      }

      entry.passed_water_check = true;
      entry.would_send = true;
      entry.reason = debugMode && !inTimeWindow ? 'WOULD_SEND (debug bypass: time window)' : 'WOULD_SEND';
      trace.push(entry);
    }

    const wouldSend = trace.filter(t => t.would_send);
    const blocked = trace.filter(t => !t.would_send);
    const reasonCounts = {};
    for (const t of blocked) { reasonCounts[t.reason] = (reasonCounts[t.reason] || 0) + 1; }

    return Response.json({
      ok: true,
      debugMode,
      summary: {
        total_trainees: trainees.length,
        would_send: wouldSend.length,
        blocked: blocked.length,
        reason_breakdown: reasonCounts,
      },
      system_state: {
        killSwitchEnabled,
        automationsEnabled,
        inTimeWindow,
        slot: slotName,
        israelTime: `${israelHour}:${String(israelMinute).padStart(2,'0')}`,
        todayStr,
        todayDayName,
        reminder_windows: '11:30-13:30 | 15:30-17:30 | 19:30-21:00',
      },
      would_send_list: wouldSend,
      blocked_list: blocked,
      diagnosis: wouldSend.length === 0
        ? (inTimeWindow ? 'All trainees filtered — see reason_breakdown' : 'Outside time window — use debugMode:true to bypass')
        : `${wouldSend.length} message(s) would be sent`,
    });

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});