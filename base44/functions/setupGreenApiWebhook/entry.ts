import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Sets the inbound webhook URL on Green API instance so that
 * incoming WhatsApp messages are forwarded to our whatsAppInboundWebhook function.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body = {};
    try { body = await req.json(); } catch (_) {}
    const { coachEmail } = body;
    if (!coachEmail) return Response.json({ ok: false, error: 'coachEmail required' }, { status: 400 });

    console.log('[setupGreenApiWebhook] REQUEST_BODY:', JSON.stringify(body));
    console.log('[setupGreenApiWebhook] coachEmail requested:', coachEmail);
    
    console.log('[setupGreenApiWebhook] Fetching WhatsAppProviderConfig for coach_email:', coachEmail);
    const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail });
    console.log('[setupGreenApiWebhook] Configs found:', configs.length);
    const config = configs[0];
    
    if (config) {
      console.log('[setupGreenApiWebhook] CONFIG_ID:', config.id);
      console.log('[setupGreenApiWebhook] PROVIDER_TYPE:', config.provider_type);
      console.log('[setupGreenApiWebhook] INSTANCE_ID:', config.instance_id);
      console.log('[setupGreenApiWebhook] API_TOKEN length:', config.api_token?.length || 0);
      console.log('[setupGreenApiWebhook] API_URL:', config.api_url);
    }

    if (!config || config.provider_type !== 'greenapi') {
      return Response.json({ ok: false, error: 'Green API config not found' }, { status: 400 });
    }

    const { api_url, instance_id, api_token } = config;
    
    console.log('[setupGreenApiWebhook] Config loaded:', { 
      coach_email: coachEmail, 
      api_url, 
      instance_id: instance_id ? `${instance_id.slice(0, 4)}...` : 'MISSING',
      api_token: api_token ? 'present' : 'MISSING'
    });

    if (!api_url || !instance_id || !api_token) {
      console.error('[setupGreenApiWebhook] Missing required fields:', { api_url: !!api_url, instance_id: !!instance_id, api_token: !!api_token });
      return Response.json({ ok: false, error: 'Missing api_url / instance_id / api_token' }, { status: 400 });
    }

    // Build the inbound webhook URL for our function
    const appId = Deno.env.get('BASE44_APP_ID') || '';
    if (!appId) {
      console.error('[setupGreenApiWebhook] BASE44_APP_ID not found in environment');
      return Response.json({ ok: false, error: 'BASE44_APP_ID not configured' }, { status: 500 });
    }

    const webhookUrl = `https://api.base44.com/api/apps/${appId}/functions/whatsAppInboundWebhook`;
    console.log('[setupGreenApiWebhook] Webhook URL generated:', webhookUrl);

    const baseUrl = api_url.replace(/\/+$/, '');

    // 1. Set webhook URL on Green API
    // Green API setSettings endpoint
    const setWebhookUrl = `${baseUrl}/waInstance${instance_id}/setSettings/${api_token}`;
    const settingsPayload = {
      webhookUrl: webhookUrl,
      webhookUrlToken: '',
      delaySendMessagesMilliseconds: 1000,
      markIncomingMessagesReaded: 'no',
      incomingWebhook: 'yes',
      outgoingWebhook: 'no',
      outgoingAPIMessageWebhook: 'no',
      deviceWebhook: 'no',
      stateWebhook: 'no',
      pollMessageWebhook: 'no'
    };

    console.log('[setupGreenApiWebhook] SEND_REQUEST:');
    console.log('[setupGreenApiWebhook] METHOD:', 'POST');
    console.log('[setupGreenApiWebhook] URL:', setWebhookUrl.replace(api_token, '***TOKEN***'));
    console.log('[setupGreenApiWebhook] PAYLOAD:', JSON.stringify(settingsPayload, null, 2));
    console.log('[setupGreenApiWebhook] HEADERS:', { 'Content-Type': 'application/json' });

    let setRes, setBody, setData = {};
    try {
      setRes = await fetch(setWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsPayload)
      });

      setBody = await setRes.text();
      console.log('[setupGreenApiWebhook] RESPONSE_STATUS:', setRes.status);
      console.log('[setupGreenApiWebhook] RESPONSE_BODY_RAW:', setBody);
      console.log('[setupGreenApiWebhook] RESPONSE_BODY_LENGTH:', setBody.length);

      try { setData = JSON.parse(setBody); } catch (parseErr) {
        console.error('[setupGreenApiWebhook] Failed to parse response:', parseErr.message);
      }

      if (!setRes.ok) {
        console.error('[setupGreenApiWebhook] Green API error:', { status: setRes.status, body: setBody });
        return Response.json({
          ok: false,
          error: `Green API returned ${setRes.status}: ${setBody.slice(0, 200)}`,
          webhookUrl,
          details: setData
        }, { status: 200 });
      }
    } catch (fetchError) {
      console.error('[setupGreenApiWebhook] Fetch error:', fetchError.message, fetchError.stack);
      return Response.json({
        ok: false,
        error: `Failed to connect to Green API: ${fetchError.message}`,
        webhookUrl
      }, { status: 200 });
    }

    // 2. Verify settings were saved
    const getSettingsUrl = `${baseUrl}/waInstance${instance_id}/getSettings/${api_token}`;
    console.log('[setupGreenApiWebhook] Verifying settings...');
    
    let getRes, getBody, getSettings = {};
    try {
      getRes = await fetch(getSettingsUrl);
      getBody = await getRes.text();
      console.log('[setupGreenApiWebhook] GetSettings response:', { status: getRes.status, body: getBody.slice(0, 300) });
      try { getSettings = JSON.parse(getBody); } catch (_) {}
    } catch (err) {
      console.error('[setupGreenApiWebhook] Failed to verify settings:', err.message);
    }

    await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
      coach_email: coachEmail,
      event: 'UI_ACTION',
      payload: {
        action: 'setup_webhook',
        webhookUrl,
        setResponse: setData,
        currentWebhookUrl: getSettings.webhookUrl || 'unknown',
        incomingWebhook: getSettings.incomingWebhook || 'unknown'
      }
    }).catch((logErr) => {
      console.error('[setupGreenApiWebhook] Failed to log diagnostics:', logErr.message);
    });

    console.log('[setupGreenApiWebhook] SUCCESS - Webhook configured');
    return Response.json({
      ok: true,
      webhookUrl,
      setResponse: setData,
      currentSettings: {
        webhookUrl: getSettings.webhookUrl,
        incomingWebhook: getSettings.incomingWebhook
      },
      message: 'Webhook הוגדר בהצלחה ב-Green API ✅'
    });

  } catch (error) {
    console.error('[setupGreenApiWebhook] FATAL ERROR:', error.message, error.stack);
    return Response.json({ 
      ok: false, 
      error: error.message,
      stack: error.stack,
      details: 'Unexpected error during webhook setup'
    }, { status: 200 });
  }
});