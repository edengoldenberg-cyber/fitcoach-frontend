import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const appId = Deno.env.get('BASE44_APP_ID') || '';
  const webhookUrl = `https://api.base44.com/api/apps/${appId}/functions/whatsAppInboundWebhook`;

  // Green API config
  const instanceId = '7103533626';
  const apiToken = '0f6463eed993499192247c00f1cdd69d778cf0069d8c46aa95';
  const baseUrl = 'https://7103.api.greenapi.com';

  // 1. Get current settings
  const getRes = await fetch(`${baseUrl}/waInstance${instanceId}/getSettings/${apiToken}`);
  const currentSettings = await getRes.json().catch(() => ({}));

  // 2. Set webhook
  const setRes = await fetch(`${baseUrl}/waInstance${instanceId}/setSettings/${apiToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      webhookUrl: webhookUrl,
      webhookUrlToken: '',
      delaySendMessagesMilliseconds: 1000,
      markIncomingMessagesReaded: 'no',
      incomingWebhook: 'yes',
      outgoingWebhook: 'no',
      outgoingAPIMessageWebhook: 'no',
      deviceWebhook: 'no',
      stateWebhook: 'no',
    })
  });
  const setData = await setRes.json().catch(() => ({}));

  // 3. Verify
  const verifyRes = await fetch(`${baseUrl}/waInstance${instanceId}/getSettings/${apiToken}`);
  const newSettings = await verifyRes.json().catch(() => ({}));

  await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
    coach_email: 'edengoldenberg@gmail.com',
    event: 'UI_ACTION',
    payload: {
      action: 'fix_webhook',
      targetWebhookUrl: webhookUrl,
      prevWebhookUrl: currentSettings.webhookUrl,
      setResponse: setData,
      newWebhookUrl: newSettings.webhookUrl,
      incomingWebhook: newSettings.incomingWebhook
    }
  }).catch(() => {});

  return Response.json({
    ok: setRes.ok,
    targetWebhookUrl: webhookUrl,
    prevWebhookUrl: currentSettings.webhookUrl,
    newWebhookUrl: newSettings.webhookUrl,
    incomingWebhook: newSettings.incomingWebhook,
    setResponse: setData
  });
});