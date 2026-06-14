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

function isValidE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone || '');
}

function renderTemplate(text, vars) {
  if (!text) return '';
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : '';
  });
}

async function createMessageHash(coachEmail, toPhoneE164, renderedText) {
  const input = `${coachEmail}|${toPhoneE164}|${renderedText}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── IDEMPOTENCY: Check by session_id (idempotency key) ───────────────────────
// session_id format: trainee_id__trigger_type__YYYY-MM-DD
// If same session_id already in queue (any status) → block
async function checkIdempotencyKey(base44, sessionId) {
  if (!sessionId) return false;
  try {
    const existing = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({
      session_id: sessionId
    });
    if (existing && existing.length > 0) {
      console.log(`[IDEMPOTENCY] BLOCKED — session_id already exists: ${sessionId} (${existing.length} records)`);
      return true;
    }
  } catch (err) {
    console.log('[IDEMPOTENCY] Check failed (non-blocking):', err.message);
  }
  return false;
}

// ─── FALLBACK: Check if identical text was sent to same phone in last 10 min ──
function getIsraelDayName() {
  return new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'long' }).toLowerCase();
}

async function isTraineeOptedOut(base44, contextType, contextId) {
  if (contextType !== 'trainee' || !contextId) return false;

  const trainees = await base44.asServiceRole.entities.Trainee.filter({ id: contextId }).catch(() => []);
  const trainee = trainees?.[0] || null;
  if (trainee?.whatsapp_notifications_enabled === false) return true;

  const preferences = await base44.asServiceRole.entities.NotificationPreference.filter({ trainee_email: trainee?.user_email }).catch(() => []);
  const pref = [...(preferences || [])].sort((a, b) => new Date(b.updated_date || b.created_date || 0) - new Date(a.updated_date || a.created_date || 0))[0];
  if (pref?.whatsapp_reminders_enabled === false) return true;
  if ((pref?.disabled_days || []).includes(getIsraelDayName())) return true;

  return false;
}

async function checkDuplicateWithin10Minutes(base44, coachEmail, toPhoneE164, renderedText) {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentMessages = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({
      coach_email: coachEmail,
      to_phone_e164: toPhoneE164
    });
    if (!recentMessages) return false;
    for (const msg of recentMessages) {
      if (msg.rendered_text === renderedText && msg.created_date) {
        const msgTime = new Date(msg.created_date);
        if (msgTime >= tenMinutesAgo) {
          console.log(`[DUPLICATE_PROTECTION] Text-match duplicate blocked: ${coachEmail} → ${toPhoneE164}`);
          return true;
        }
      }
    }
  } catch (err) {
    console.log('[DUPLICATE_PROTECTION] Check failed (non-blocking):', err.message);
  }
  return false;
}

Deno.serve(async (req) => {
  // Read kill switch from DB
  const _base44ks = createClientFromRequest(req);
  const GLOBAL_OUTBOUND_WHATSAPP_ENABLED = await isOutboundEnabled(_base44ks);

  // KILL SWITCH — first check
  if (!GLOBAL_OUTBOUND_WHATSAPP_ENABLED) {
    console.log('[KILL_SWITCH] enqueueWhatsAppMessage BLOCKED — GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE');
    return Response.json({
      ok: false, blocked: true,
      reason: 'GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE',
      message: 'enqueueWhatsAppMessage is disabled by global kill switch. No message queued.'
    }, { status: 200 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, errorCode: 'UNAUTHORIZED', error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try {
      body = await req.json();
    } catch (jsonErr) {
      return Response.json({ ok: false, errorCode: 'INVALID_JSON', message: 'Request body is not valid JSON' }, { status: 400 });
    }

    const {
      coachEmail,
      toPhoneE164,
      toName,
      contextType = 'system',
      contextId,
      templateKey,
      templateVars = {},
      renderedText,
      scheduledFor,
    } = body;

    if (!coachEmail || !toPhoneE164) {
      return Response.json({ ok: false, errorCode: 'MISSING_FIELDS', message: 'Missing coachEmail or toPhoneE164' }, { status: 400 });
    }

    if (coachEmail === 'system@test.com' || coachEmail === 'system') {
      console.log('[enqueueWhatsAppMessage] REJECTED: Placeholder coach_email for real send. coachEmail=' + coachEmail);
      return Response.json({ 
        ok: false, error: 'INVALID_COACH_EMAIL',
        reason: 'Cannot queue messages for placeholder coach account'
      }, { status: 400 });
    }

    if (!isValidE164(toPhoneE164)) {
      return Response.json({ ok: false, error: 'Invalid phone format. Must be E164.' });
    }

    let finalText = renderedText;
    if (!finalText && templateKey) {
      try {
        const templates = await base44.asServiceRole.entities.WhatsAppTemplate.filter({ coach_email: coachEmail, key: templateKey });
        const tmpl = templates && templates[0];
        if (tmpl && tmpl.message_text) {
          finalText = renderTemplate(tmpl.message_text, templateVars);
        }
      } catch (templateErr) {
        console.log('[enqueueWhatsAppMessage] Template fetch failed (non-blocking):', templateErr.message);
      }
    }

    if (!finalText) {
      return Response.json({ ok: false, errorCode: 'NO_TEXT', message: 'No renderedText and no valid templateKey found' }, { status: 400 });
    }

    if (await isTraineeOptedOut(base44, contextType, contextId)) {
      console.log(`[OPT_OUT] Queue blocked for trainee context_id=${contextId}`);
      return Response.json({
        ok: false,
        blocked: true,
        errorCode: 'WHATSAPP_NOTIFICATIONS_DISABLED_FOR_TRAINEE',
        message: 'Trainee disabled WhatsApp notifications'
      }, { status: 200 });
    }

    // ── LAYER 1: Idempotency key check (strongest — blocks same trigger/day) ──
    const sessionId = body.session_id || null;
    if (sessionId) {
      const isDuplicateKey = await checkIdempotencyKey(base44, sessionId);
      if (isDuplicateKey) {
        console.log(`[IDEMPOTENCY] BLOCKED session_id=${sessionId}`);
        return Response.json({
          ok: false, errorCode: 'DUPLICATE_IDEMPOTENCY_KEY',
          message: `Message with session_id "${sessionId}" already queued`,
          duplicate_blocked: true
        }, { status: 200 }); // 200 so callers don't treat as error
      }
    }

    // ── LAYER 2: Text-match fallback (catches callers without session_id) ──
    const isDuplicate = await checkDuplicateWithin10Minutes(base44, coachEmail, toPhoneE164, finalText);
    if (isDuplicate) {
      console.log(`[DUPLICATE_PROTECTION] Text-match BLOCKED: ${toPhoneE164}`);
      return Response.json({
        ok: false, errorCode: 'DUPLICATE_MESSAGE',
        message: 'Identical message already queued within 10 minutes',
        duplicate_blocked: true
      }, { status: 200 });
    }

    let configs = [];
    let config = null;
    try {
      configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail });
      config = configs && configs[0];
    } catch (configErr) {
      console.log('[enqueueWhatsAppMessage] Provider config fetch failed (non-blocking):', configErr.message);
    }

    const providerType = config?.provider_type || 'mock';

    if (providerType === 'greenapi' && config) {
      if (config.instance_id === 'YOUR_INSTANCE_ID' || config.api_token === 'YOUR_API_TOKEN') {
        console.log('[enqueueWhatsAppMessage] REJECTED: Placeholder provider credentials. coachEmail=' + coachEmail);
        return Response.json({
          ok: false, errorCode: 'INVALID_PROVIDER_CONFIG',
          message: 'Provider has placeholder credentials'
        }, { status: 400 });
      }
    }

    let record = null;
    try {
      record = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
        coach_email: coachEmail,
        to_phone_e164: toPhoneE164,
        to_name: toName || '',
        context_type: contextType,
        context_id: contextId || '',
        template_key: templateKey || '',
        rendered_text: finalText,
        provider_type: providerType,
        status: 'queued',
        attempts: 0,
        scheduled_for: scheduledFor || new Date().toISOString(),
        session_id: body.session_id || `auto_${Date.now()}_${Math.random().toString(36).slice(2)}`
      });
    } catch (createErr) {
      console.error('[enqueueWhatsAppMessage] Queue creation failed:', createErr.message);
      return Response.json({
        ok: false, errorCode: 'QUEUE_CREATE_ERROR',
        message: 'Failed to create message queue record'
      }, { status: 500 });
    }

    if (!record || !record.id) {
      return Response.json({
        ok: false, errorCode: 'QUEUE_CREATE_FAILED',
        message: 'Queue creation returned no record ID'
      }, { status: 500 });
    }

    try {
      await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
        coach_email: coachEmail,
        event: 'QUEUE_ADD',
        payload: JSON.stringify({ 
          queueId: record.id, toPhoneE164, toName, templateKey, scheduledFor, coachEmail,
          providerConfigId: config?.id || null, providerType,
          isPlaceholder: !!(config && (config.instance_id === 'YOUR_INSTANCE_ID' || config.api_token === 'YOUR_API_TOKEN')),
          trigger_source: body.trigger_source || 'unknown',
          session_id: record.session_id
        })
      });
    } catch (logErr) {
      console.log('[enqueueWhatsAppMessage] Diagnostics log failed (non-blocking):', logErr.message);
    }

    // Trigger the queue worker fire-and-forget.
    // Kill switch was already validated above — reaching here means outbound is enabled.
    // Worker processes the queue asynchronously; failure here does not affect the enqueue result.
    // Without this trigger, messages queued via CRM/manual paths would sit indefinitely
    // until an external cron fires the worker.
    base44.asServiceRole.functions.invoke('whatsAppQueueWorker', { coachEmail }).catch(err => {
      console.log('[enqueueWhatsAppMessage] Worker trigger failed (non-fatal):', err?.message || err);
    });

    return Response.json({ ok: true, queueId: record.id, status: 'queued' });
  } catch (error) {
    console.error('[enqueueWhatsAppMessage] FATAL ERROR:', error.message, error.stack);
    return Response.json({ 
      ok: false, errorCode: 'SYSTEM_ERROR',
      message: 'An unexpected error occurred while enqueueing WhatsApp message',
      details: error.message 
    }, { status: 200 });
  }
});