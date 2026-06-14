import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Simulate what WOULD be sent right now — NO messages sent, NO queue writes
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const coachEmail = user.email;

    // Check kill switch
    const configs = await base44.asServiceRole.entities.SystemConfig.filter({ key: 'GLOBAL_WHATSAPP_ENABLED' });
    const killSwitchEnabled = configs[0]?.value === true;

    if (!killSwitchEnabled) {
      return Response.json({
        ok: true,
        killSwitchActive: true,
        totalMessages: 0,
        list: [],
        note: 'Kill switch is OFF — zero messages would be sent'
      });
    }

    // Get provider
    const providerConfigs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail });
    const provider = providerConfigs[0];
    if (!provider?.is_enabled) {
      return Response.json({
        ok: true,
        killSwitchActive: false,
        providerDisabled: true,
        totalMessages: 0,
        list: [],
        note: 'Provider is_enabled=false — zero messages would be sent'
      });
    }

    // Get queued messages
    const queued = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ status: 'queued' });
    const failed = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ status: 'failed' });
    const candidates = [...queued, ...failed];

    // Get trainees for name lookup (also tracks opt-out status)
    const trainees = await base44.asServiceRole.entities.Trainee.filter({ coach_email: coachEmail });
    const traineeMap = {};
    const optOutSet = new Set();
    for (const t of trainees) {
      traineeMap[t.user_email] = t.full_name;
      traineeMap[t.phone] = t.full_name;
      if (t.whatsapp_notifications_enabled === false) optOutSet.add(t.user_email);
    }

    const list = candidates.slice(0, 50).map(msg => ({
      id: msg.id,
      trainee_name: msg.to_name || traineeMap[msg.to_phone_e164] || 'Unknown',
      phone: msg.to_phone_e164 ? msg.to_phone_e164.slice(0, 6) + '****' : '???',
      template_key: msg.template_key || 'custom',
      message_preview: (msg.rendered_text || '').slice(0, 120) + ((msg.rendered_text || '').length > 120 ? '...' : ''),
      status: msg.status,
      scheduled_for: msg.scheduled_for,
      attempts: msg.attempts || 0,
    }));

    return Response.json({
      ok: true,
      killSwitchActive: false,
      providerDisabled: false,
      totalMessages: list.length,
      totalQueued: queued.length,
      totalFailed: failed.length,
      list,
      note: `${list.length} messages would be sent if worker runs now`
    });

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});