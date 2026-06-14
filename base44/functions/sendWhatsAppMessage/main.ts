import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Kill switch is now read from SystemConfig entity (key: GLOBAL_WHATSAPP_ENABLED)
async function isOutboundEnabled(base44) {
  try {
    const configs = await base44.asServiceRole.entities.SystemConfig.filter({ key: 'GLOBAL_WHATSAPP_ENABLED' });
    const record = configs && configs[0];
    return record ? record.value === true : false;
  } catch (_) {
    return false;
  }
}

// Normalize Israeli phone to E.164
function normalizePhone(phoneRaw) {
  if (!phoneRaw) return null;
  let s = String(phoneRaw).trim().replace(/[\s\-().,]/g, '').replace(/[^\d+]/g, '');
  if (s.endsWith('+') && !s.startsWith('+')) s = '+' + s.slice(0, -1);
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^972\d{9}$/.test(s)) s = '+' + s;
  if (/^0\d{9}$/.test(s)) s = '+972' + s.slice(1);
  if (/^\+972\d{9}$/.test(s)) return s;
  return null;
}

// Validate Israeli E164: +972 followed by exactly 9 digits
function validatePhoneE164(phone) {
  return /^\+972\d{9}$/.test(phone || '');
}

// Render template variables safely
function renderTemplate(text, vars) {
  if (!text) return '';
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : '';
  });
}

Deno.serve(async (req) => {
  // Read kill switch from DB first
  const _base44ks = createClientFromRequest(req);
  const GLOBAL_OUTBOUND_WHATSAPP_ENABLED = await isOutboundEnabled(_base44ks);

  // ██████████████████████████████████████████████████████████
  // GLOBAL KILL SWITCH CHECK — FIRST THING, BEFORE ANYTHING
  // ██████████████████████████████████████████████████████████
  if (GLOBAL_OUTBOUND_WHATSAPP_ENABLED !== true) {
    console.log('[KILL_SWITCH] sendWhatsAppMessage BLOCKED — GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE');
    return Response.json({
      success: false,
      blocked: true,
      reason: 'GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE',
      message: 'All outbound WhatsApp sending is disabled by global kill switch. No messages were sent.'
    }, { status: 200 });
  }
  // ██████████████████████████████████████████████████████████

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try {
      body = await req.json();
    } catch (jsonErr) {
      return Response.json({ ok: false, errorCode: 'INVALID_JSON', message: 'Request body is not valid JSON' }, { status: 400 });
    }
    
    const { coachEmail, toPhoneE164: toPhoneRaw, text, toName, contextType, contextId, templateKey, leadId: payloadLeadId } = body;

    if (!coachEmail || !toPhoneRaw || !text) {
      return Response.json({ ok: false, errorCode: 'MISSING_FIELDS', message: 'Missing required fields: coachEmail, toPhoneE164, text' }, { status: 400 });
    }

    // Always normalize + validate Israeli E164
    const toPhoneE164 = normalizePhone(toPhoneRaw);
    const resolvedLeadId = payloadLeadId || (contextType === 'lead' ? contextId : null);

    if (!toPhoneE164 || !validatePhoneE164(toPhoneE164)) {
      const errMsg = 'מספר הטלפון אינו בפורמט תקין לשליחת WhatsApp';
      console.error('[sendWhatsApp] Invalid phone:', toPhoneRaw, '→', toPhoneE164);
      // Safety log
      await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
        coach_email: coachEmail,
        event: 'SEND_FAIL',
        payload: {
          leadId: resolvedLeadId,
          phoneRaw: toPhoneRaw,
          phoneE164: toPhoneE164 || 'null',
          error: errMsg,
          createdAt: new Date().toISOString()
        }
      }).catch((err) => console.error('[sendWhatsApp] Log error:', err.message));
      return Response.json({ ok: false, status: 'FAILED', error: errMsg });
    }

    // Load provider config
    let configs = [];
    try {
      configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail });
    } catch (configErr) {
      console.error('[sendWhatsAppMessage] Provider config fetch failed:', configErr.message);
      return Response.json({ ok: false, errorCode: 'CONFIG_LOAD_ERROR', message: 'Failed to load provider configuration' }, { status: 500 });
    }

    const config = configs[0];
    const providerType = config?.provider_type || 'mock';
    
    console.log(`[SEND_WHATSAPP_CONFIG] config_record_id=${config?.id} coach_email=${coachEmail} provider_type=${providerType}`);

    // SAFEGUARD: Mock provider is always allowed regardless of is_enabled
    if (!config || (!config.is_enabled && providerType !== 'mock')) {
      try {
        await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
          coach_email: coachEmail,
          event: 'SEND_ATTEMPT',
          payload: { reason: 'DISABLED', toPhoneE164, text: text.slice(0, 50) }
        });
      } catch (logErr) {
        console.log('[sendWhatsAppMessage] Diagnostics log failed (non-blocking):', logErr.message);
      }
      return Response.json({ ok: false, errorCode: 'PROVIDER_DISABLED', providerType: providerType, status: 'SKIPPED', reason: 'DISABLED' }, { status: 200 });
    }

    // Log attempt (non-blocking)
    try {
      await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
        coach_email: coachEmail,
        event: 'SEND_ATTEMPT',
        payload: { providerType, toPhoneE164, toName, templateKey, textLength: text.length }
      });
    } catch (logErr) {
      console.log('[sendWhatsAppMessage] Diagnostics attempt log failed (non-blocking):', logErr.message);
    }

    let result;

    if (providerType === 'mock') {
      // Simulate send with delay
      await new Promise(resolve => setTimeout(resolve, 300));
      result = {
        ok: true,
        providerType: 'mock',
        status: 'SENT',
        messageId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        simulatedAt: new Date().toISOString()
      };
    } else if (providerType === 'greenapi') {
      const { api_url, instance_id, api_token } = config || {};
      // SAFEGUARD: Validate Green API config completely before attempting send
      if (!api_url || !instance_id || !api_token) {
        result = { ok: false, errorCode: 'GREENAPI_CONFIG_ERROR', providerType: 'greenapi', status: 'FAILED', message: 'Missing Green API credentials (api_url, instance_id, api_token)' };
      } else {
        try {
          // Convert E164 to chatId: remove leading + and append @c.us
          const chatId = toPhoneE164.replace(/^\+/, '') + '@c.us';
          const baseUrl = api_url.replace(/\/+$/, '');
          const url = `${baseUrl}/waInstance${instance_id}/sendMessage/${api_token}`;
          const maskedUrl = url.replace(api_token, '***TOKEN_MASKED***');
          const payloadSent = { chatId, message: text };

          // ── FULL DEBUG LOG ──────────────────────────────────────────────────
          console.log('[SEND_DEBUG] phone_original:', toPhoneRaw);
          console.log('[SEND_DEBUG] phone_normalized:', toPhoneE164);
          console.log('[SEND_DEBUG] final_chat_id:', chatId);
          console.log('[SEND_DEBUG] payload_sent_to_greenapi:', JSON.stringify(payloadSent));
          console.log('[SEND_DEBUG] greenapi_url:', maskedUrl);
          console.log('[SEND_DEBUG] instance_id:', instance_id);
          // ───────────────────────────────────────────────────────────────────
          
          const greenRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadSent)
          });
          
          const rawBody = await greenRes.text();
          let greenData = {};
          try { greenData = JSON.parse(rawBody); } catch (_) { greenData = { _raw: rawBody }; }

          // ── FULL RESPONSE LOG ───────────────────────────────────────────────
          console.log('[SEND_DEBUG] greenapi_http_status:', greenRes.status);
          console.log('[SEND_DEBUG] greenapi_response_full:', JSON.stringify(greenData));
          // ───────────────────────────────────────────────────────────────────

          if (greenRes.ok && greenData && greenData.idMessage) {
            result = { ok: true, providerType: 'greenapi', status: 'SENT', messageId: greenData.idMessage };
          } else {
            const providerError = greenData?.message || greenData?.error || greenData?._raw || `HTTP ${greenRes.status}`;
            console.error('[SEND_DEBUG] greenapi_send_failed:', providerError);
            result = {
              ok: false,
              errorCode: 'GREENAPI_SEND_ERROR',
              providerType: 'greenapi',
              status: 'FAILED',
              message: providerError,
              provider_error_detail: greenData,
              debug: {
                phone_original: toPhoneRaw,
                phone_normalized: toPhoneE164,
                final_chat_id: chatId,
                payload_sent: payloadSent,
                http_status: greenRes.status,
                greenapi_response: greenData,
              }
            };
          }
        } catch (fetchErr) {
          console.error('[SEND_DEBUG] network_error:', fetchErr.message);
          result = {
            ok: false,
            errorCode: 'GREENAPI_NETWORK_ERROR',
            providerType: 'greenapi',
            status: 'FAILED',
            message: `Network error: ${fetchErr.message}`,
            debug: {
              phone_original: toPhoneRaw,
              phone_normalized: toPhoneE164,
            }
          };
        }
      }
    } else {
      result = { ok: false, providerType, status: 'FAILED', error: `Provider ${providerType} not implemented` };
    }

    // Safety log with full details
    try {
      await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
        coach_email: coachEmail,
        event: result.ok ? 'SEND_SUCCESS' : 'SEND_FAIL',
        payload: {
          leadId: resolvedLeadId,
          phoneRaw: toPhoneRaw,
          phoneE164: toPhoneE164,
          payload: { toName, templateKey, textLength: text.length },
          responseStatus: result.status,
          errorMessage: result.error || null,
          createdAt: new Date().toISOString(),
          messageId: result.messageId || null,
          providerType: result.providerType || null
        }
      });
    } catch (logErr) {
      console.error('[sendWhatsApp] DiagnosticsLog error (non-fatal):', logErr.message);
    }

    // ── Save OUTBOUND to LeadMessageThread ──────────────────────────────────
    if (result.ok && contextType === 'lead' && contextId) {
      await base44.asServiceRole.entities.LeadMessageThread.create({
        leadId: contextId,
        coach_email: coachEmail,
        channel: 'WHATSAPP',
        direction: 'OUTBOUND',
        senderType: 'SYSTEM',
        messageText: text,
        messageTimestamp: new Date().toISOString(),
        providerMessageId: result.messageId || ''
      }).catch((err) => console.error('[sendWhatsApp] Log error:', err.message));
    }
    // ────────────────────────────────────────────────────────────────────────

    return Response.json(result);
  } catch (error) {
    // TOP-LEVEL FAIL-SAFE: Never expose 500 for WhatsApp send failures
    console.error('[sendWhatsAppMessage] FATAL ERROR:', error.message, error.stack);
    return Response.json({ 
      ok: false, 
      errorCode: 'SYSTEM_ERROR', 
      message: 'An unexpected error occurred while processing WhatsApp message',
      details: error.message 
    }, { status: 200 });
  }
});