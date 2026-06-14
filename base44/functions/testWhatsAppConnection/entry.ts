import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const { coachEmail } = await req.json();
    if (!coachEmail) return Response.json({ ok: false, error: 'coachEmail required' }, { status: 400 });

    const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail });
    const config = configs[0];
    const now = new Date().toISOString();
    const providerType = config?.provider_type || 'mock';

    const diagnostics = {
      timestamp: now,
      providerType,
      configFound: !!config,
      configId: config?.id || null,
      is_enabled: config?.is_enabled,
      phone_number_e164: config?.phone_number_e164 || null,
    };

    let testResult;

    if (providerType === 'mock') {
      testResult = { ok: true, status: 'connected', message: 'Mock provider always connected ✅' };

    } else if (providerType === 'greenapi') {
      const { api_url, instance_id, api_token } = config || {};

      diagnostics.api_url = api_url || null;
      diagnostics.instance_id = instance_id || null;
      diagnostics.api_token_present = !!api_token;
      diagnostics.api_token_length = api_token ? api_token.length : 0;

      // Detect placeholder/invalid token — never attempt real API call with these
      const PLACEHOLDER_TOKENS = ['YOUR_API_TOKEN', 'YOUR_TOKEN', ''];
      const isPlaceholder = !api_token || PLACEHOLDER_TOKENS.includes(api_token.trim());

      if (!api_url || !instance_id || isPlaceholder) {
        const missing = [];
        if (!api_url) missing.push('api_url');
        if (!instance_id) missing.push('instance_id');
        if (isPlaceholder) missing.push('api_token (placeholder or empty)');
        testResult = { ok: false, status: 'error', message: `חסרים שדות: ${missing.join(', ')}`, diagnostics };
      } else {
        // SAFE: getStateInstance ONLY — never sends a message
        const baseUrl = api_url.trim().replace(/\/+$/, '');
        const token = api_token.trim();
        const stateUrl = `${baseUrl}/waInstance${instance_id}/getStateInstance/${token}`;
        diagnostics.stateUrl = stateUrl.replace(token, '[TOKEN_HIDDEN]');

        let stateInstance = 'unknown';
        let httpStatus = null;
        try {
          const stateRes = await fetch(stateUrl);
          httpStatus = stateRes.status;
          diagnostics.stateHttpStatus = httpStatus;
          if (httpStatus === 200) {
            const stateData = await stateRes.json();
            stateInstance = stateData.stateInstance || 'unknown';
          } else {
            const raw = await stateRes.text();
            diagnostics.stateRawResponse = raw.slice(0, 200);
          }
          diagnostics.stateInstance = stateInstance;
        } catch (e) {
          diagnostics.stateError = e.message;
        }

        if (httpStatus === 401) {
          testResult = { ok: false, status: 'error', message: `401 Unauthorized — הטוקן שגוי או לא תקף לinstance זה`, diagnostics };
        } else if (stateInstance === 'authorized') {
          testResult = { ok: true, status: 'connected', message: 'Green API מחובר ✅ (stateInstance: authorized)', diagnostics };
        } else if (stateInstance !== 'unknown') {
          testResult = { ok: false, status: 'error', message: `State: ${stateInstance} — לא מחובר`, diagnostics };
        } else {
          testResult = { ok: false, status: 'error', message: `לא ניתן לקרוא state. HTTP: ${httpStatus}`, diagnostics };
        }
      }
    } else {
      testResult = { ok: false, status: 'error', message: `Provider ${providerType} not implemented`, diagnostics };
    }

    // Update config status
    if (config) {
      await base44.asServiceRole.entities.WhatsAppProviderConfig.update(config.id, {
        status: testResult.ok ? 'connected' : 'error',
        last_test_at: now,
        last_error: testResult.ok ? '' : testResult.message.slice(0, 300)
      });
    }

    await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
      coach_email: coachEmail,
      event: 'UI_ACTION',
      payload: { action: 'test_connection', providerType, result: testResult, diagnostics }
    });

    return Response.json(testResult);
  } catch (error) {
    return Response.json({
      ok: false,
      status: 'error',
      message: 'שגיאה בבדיקת החיבור: ' + error.message
    });
  }
});