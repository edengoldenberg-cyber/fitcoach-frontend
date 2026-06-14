import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function latestByUpdatedDate(records) {
  const byEmail = {};
  for (const record of records || []) {
    const email = String(record.trainee_email || '').toLowerCase().trim();
    if (!email) continue;
    const current = byEmail[email];
    const recordTime = new Date(record.updated_date || record.created_date || 0).getTime();
    const currentTime = current ? new Date(current.updated_date || current.created_date || 0).getTime() : -1;
    if (!current || recordTime > currentTime) byEmail[email] = record;
  }
  return byEmail;
}

function israelDayName() {
  return new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'long' }).toLowerCase();
}

function isDisabledToday(trainee, pref, todayName) {
  if (trainee?.whatsapp_notifications_enabled === false) return true;
  if (pref?.whatsapp_reminders_enabled === false) return true;
  if ((pref?.disabled_days || []).includes(todayName)) return true;
  return false;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const [trainees, prefs, queued, recentSent] = await Promise.all([
      base44.asServiceRole.entities.Trainee.filter({ status: 'active' }),
      base44.asServiceRole.entities.NotificationPreference.list(),
      base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ status: 'queued' }),
      base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ status: 'sent' }, '-created_date', 300),
    ]);

    const prefsByEmail = latestByUpdatedDate(prefs);
    const traineesById = Object.fromEntries((trainees || []).map(t => [t.id, t]));
    const todayName = israelDayName();
    const now = Date.now();
    const last48h = new Date(now - 48 * 60 * 60 * 1000).toISOString();

    const preferenceConflicts = [];
    const disabledToday = [];

    for (const trainee of trainees || []) {
      const email = String(trainee.user_email || '').toLowerCase().trim();
      const pref = prefsByEmail[email];
      const prefDisabled = pref?.whatsapp_reminders_enabled === false;
      const traineeDisabled = trainee.whatsapp_notifications_enabled === false;
      const daysDisabledToday = (pref?.disabled_days || []).includes(todayName);

      if (prefDisabled !== traineeDisabled && pref) {
        preferenceConflicts.push({
          trainee_id: trainee.id,
          name: trainee.full_name,
          email: trainee.user_email,
          trainee_whatsapp_notifications_enabled: trainee.whatsapp_notifications_enabled ?? true,
          preference_whatsapp_reminders_enabled: pref.whatsapp_reminders_enabled ?? true,
          latest_preference_id: pref.id,
        });
      }

      if (isDisabledToday(trainee, pref, todayName)) {
        disabledToday.push({
          trainee_id: trainee.id,
          name: trainee.full_name,
          email: trainee.user_email,
          reason: traineeDisabled ? 'trainee_master_off' : prefDisabled ? 'preference_master_off' : `muted_today_${todayName}`,
        });
      }
    }

    const queuedViolations = (queued || []).filter(msg => {
      const trainee = traineesById[msg.context_id];
      const pref = prefsByEmail[String(trainee?.user_email || '').toLowerCase().trim()];
      return isDisabledToday(trainee, pref, todayName);
    }).map(msg => ({
      queue_id: msg.id,
      trainee_id: msg.context_id,
      to_name: msg.to_name,
      template_key: msg.template_key,
      scheduled_for: msg.scheduled_for,
      session_id: msg.session_id,
    }));

    const recentSentToCurrentlyDisabled = (recentSent || []).filter(msg => {
      if ((msg.created_date || '') < last48h) return false;
      const trainee = traineesById[msg.context_id];
      const pref = prefsByEmail[String(trainee?.user_email || '').toLowerCase().trim()];
      return isDisabledToday(trainee, pref, todayName);
    }).map(msg => ({
      queue_id: msg.id,
      trainee_id: msg.context_id,
      to_name: msg.to_name,
      template_key: msg.template_key,
      sent_at: msg.updated_date || msg.created_date,
      session_id: msg.session_id,
    }));

    return Response.json({
      ok: true,
      checked_at: new Date().toISOString(),
      today_name_israel: todayName,
      totals: {
        active_trainees: (trainees || []).length,
        notification_preferences: (prefs || []).length,
        disabled_today: disabledToday.length,
        preference_conflicts: preferenceConflicts.length,
        queued_violations: queuedViolations.length,
        recent_sent_to_currently_disabled: recentSentToCurrentlyDisabled.length,
      },
      preference_conflicts: preferenceConflicts,
      disabled_today: disabledToday,
      queued_violations: queuedViolations,
      recent_sent_to_currently_disabled: recentSentToCurrentlyDisabled,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});