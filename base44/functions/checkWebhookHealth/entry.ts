import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const { coachEmail } = await req.json();
    if (!coachEmail) return Response.json({ ok: false, error: 'coachEmail required' }, { status: 400 });

    // 1. Get provider config
    const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail }).catch(() => []);
    const config = configs[0];

    // 2. Check if webhook URL is configured in Green API
    let webhookConfigured = false;
    let webhookUrl = '';
    if (config?.provider_type === 'greenapi' && config?.api_url && config?.instance_id && config?.api_token) {
      try {
        const baseUrl = (config.api_url || '').replace(/\/+$/, '');
        const settingsUrl = `${baseUrl}/waInstance${config.instance_id}/getSettings/${config.api_token}`;
        const settingsRes = await fetch(settingsUrl);
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          webhookUrl = settings?.webhookUrl || '';
          webhookConfigured = webhookUrl.includes('whatsAppInboundWebhook');
        }
      } catch (_) {}
    } else if (config?.provider_type === 'mock') {
      webhookConfigured = true;
      webhookUrl = 'mock';
    }

    // 3. Get SystemHealth record for this coach
    const healthRecords = await base44.asServiceRole.entities.SystemHealth.filter({ coach_email: coachEmail }).catch(() => []);
    const health = healthRecords[0];

    // 4. Calculate status based on real received events
    let status = 'ERROR';
    let minutesAgo = null;

    if (health?.lastInboundWebhookReceivedAt) {
      const now = Date.now();
      const lastReceived = new Date(health.lastInboundWebhookReceivedAt).getTime();
      minutesAgo = Math.floor((now - lastReceived) / 60000);

      if (minutesAgo <= 15) status = 'ACTIVE';
      else if (minutesAgo <= 60) status = 'WARNING';
      else status = 'ERROR';
    }

    // 5. Build result message
    let resultMessage = '';
    if (webhookConfigured && status === 'ACTIVE') {
      resultMessage = 'Webhook configured and inbound events are being received';
    } else if (webhookConfigured && (status === 'WARNING' || status === 'ERROR')) {
      resultMessage = 'Webhook configured but no inbound events received recently';
    } else {
      resultMessage = 'Webhook not configured correctly';
    }

    // 6. Log health check
    const logEvent = status === 'ACTIVE' ? 'WEBHOOK_HEALTH_ACTIVE'
      : status === 'WARNING' ? 'WEBHOOK_HEALTH_WARNING'
      : 'WEBHOOK_HEALTH_ERROR';

    await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
      coach_email: coachEmail,
      event: 'RULE_TRIGGERED',
      payload: { flowEvent: 'WEBHOOK_HEALTH_CHECK_RUN', status, minutesAgo, webhookConfigured }
    }).catch(() => {});

    await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
      coach_email: coachEmail,
      event: 'RULE_TRIGGERED',
      payload: { flowEvent: logEvent, status, minutesAgo, webhookConfigured, resultMessage }
    }).catch(() => {});

    return Response.json({
      ok: true,
      status,
      webhookConfigured,
      webhookUrl,
      resultMessage,
      lastInboundAt: health?.lastInboundWebhookReceivedAt || null,
      minutesAgo,
      lastMessageText: health?.lastInboundWebhookMessageText || null,
      lastLeadId: health?.lastInboundWebhookLeadId || null,
      provider: health?.lastInboundWebhookProvider || null,
    });

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});