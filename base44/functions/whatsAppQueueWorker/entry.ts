import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Kill switch is now read from SystemConfig entity (key: GLOBAL_WHATSAPP_ENABLED)
// Fallback: false (safe — blocked) if record missing
async function isOutboundEnabled(base44) {
  try {
    const configs = await base44.asServiceRole.entities.SystemConfig.filter({ key: 'GLOBAL_WHATSAPP_ENABLED' });
    const record = configs && configs[0];
    return record ? record.value === true : false;
  } catch (_) {
    return false; // fail safe
  }
}

const MAX_ATTEMPTS = 3;
const CONCURRENCY = 5;
const WORKER_LOCK_KEY = 'WHATSAPP_QUEUE_WORKER_LOCK_UNTIL';
const WORKER_LOCK_MS = 2 * 60 * 1000;

async function acquireWorkerLock(base44) {
  const now = Date.now();
  const lockUntil = new Date(now + WORKER_LOCK_MS).toISOString();
  const locks = await base44.asServiceRole.entities.SystemConfig.filter({ key: WORKER_LOCK_KEY }).catch(() => []);
  const lock = locks?.[0];

  if (lock?.value && new Date(lock.value).getTime() > now) {
    return { acquired: false, lockUntil: lock.value };
  }

  if (lock?.id) {
    await base44.asServiceRole.entities.SystemConfig.update(lock.id, { value: lockUntil, value_type: 'string', updated_at: new Date().toISOString() }).catch(() => {});
  } else {
    await base44.asServiceRole.entities.SystemConfig.create({ key: WORKER_LOCK_KEY, value: lockUntil, value_type: 'string', updated_at: new Date().toISOString() }).catch(() => {});
  }

  return { acquired: true, lockUntil };
}

async function releaseWorkerLock(base44) {
  const locks = await base44.asServiceRole.entities.SystemConfig.filter({ key: WORKER_LOCK_KEY }).catch(() => []);
  const lock = locks?.[0];
  if (lock?.id) {
    await base44.asServiceRole.entities.SystemConfig.update(lock.id, { value: '', value_type: 'string', updated_at: new Date().toISOString() }).catch(() => {});
  }
}

function getIsraelDayName() {
  const dayIndex = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'long' }).toLowerCase();
  return dayIndex;
}

async function isTraineeOptedOut(base44, msg) {
  if (msg.context_type !== 'trainee' || !msg.context_id) return false;

  const trainees = await base44.asServiceRole.entities.Trainee.filter({ id: msg.context_id }).catch(() => []);
  const trainee = trainees?.[0] || null;
  if (trainee?.whatsapp_notifications_enabled === false) return true;

  const preferences = await base44.asServiceRole.entities.NotificationPreference.filter({ trainee_email: trainee?.user_email }).catch(() => []);
  const pref = [...(preferences || [])].sort((a, b) => new Date(b.updated_date || b.created_date || 0) - new Date(a.updated_date || a.created_date || 0))[0];
  if (pref?.whatsapp_reminders_enabled === false) return true;
  if ((pref?.disabled_days || []).includes(getIsraelDayName())) return true;

  return false;
}

async function simulateGreenApiResponse(payload, phone, text) {
  console.log('[simulateGreenApi] SIMULATOR_PROVIDER_CALL phone=' + phone);
  console.log('[simulateGreenApi] PAYLOAD chatId=' + payload.chatId + ' messageLength=' + text.length);
  
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) {
    console.log('[simulateGreenApi] VALIDATION_FAILED invalid_phone=' + phone);
    return { ok: false, error: 'SIMULATOR_INVALID_PHONE', simulatorStatus: 'simulator_invalid_phone' };
  }
  
  if (!text || text.trim().length === 0) {
    console.log('[simulateGreenApi] VALIDATION_FAILED empty_message');
    return { ok: false, error: 'SIMULATOR_EMPTY_MESSAGE', simulatorStatus: 'simulator_provider_rejected' };
  }
  
  const delay = 150 + Math.random() * 100;
  await new Promise(r => setTimeout(r, delay));
  
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();
  const simulatedMessageId = `SIM_${timestamp}_${randomSuffix}`;
  
  console.log('[simulateGreenApi] SUCCESS simulatedMessageId=' + simulatedMessageId + ' delay=' + Math.round(delay) + 'ms');
  
  return {
    ok: true,
    providerType: 'simulator',
    status: 'simulator_sent',
    messageId: simulatedMessageId,
    simulatorMetadata: {
      simulatedAt: new Date().toISOString(),
      simulatedDelay: Math.round(delay),
      targetPhone: phone,
      messageLength: text.length,
      chatId: payload.chatId
    }
  };
}

async function sendGreenApi(config, phone, text) {
  if (!config) {
    console.log('[sendGreenApi] CONFIG_IS_NULL');
    return { ok: false, error: 'Provider config is null', errorCode: 'NULL_CONFIG' };
  }

  const { api_url, instance_id, api_token } = config;
  if (!api_url || !instance_id || !api_token) {
    console.log('[sendGreenApi] MISSING_CREDENTIALS api_url=' + !!api_url + ' instance_id=' + !!instance_id + ' api_token=' + !!api_token);
    return { ok: false, error: 'Missing Green API credentials', errorCode: 'MISSING_CREDENTIALS' };
  }

  console.log('[sendGreenApi] RAW_API_URL=' + api_url);
  console.log('[sendGreenApi] RAW_INSTANCE_ID=' + instance_id);

  const chatId = phone.replace(/^\+/, '') + '@c.us';
  const baseUrl = api_url.replace(/\/+$/, '');
  const url = `${baseUrl}/waInstance${instance_id}/sendMessage/${api_token}`;

  const maskedUrl = url.replace(api_token, '***TOKEN_MASKED***');
  console.log('[sendGreenApi] FINAL_URL=' + maskedUrl);

  const payload = { chatId, message: text };
  console.log('[sendGreenApi] PAYLOAD_CHATID=' + chatId);
  console.log('[sendGreenApi] PAYLOAD_MESSAGE_LENGTH=' + text.length);

  let res = null, data = {}, rawBody = '';
  try {
   console.log('[sendGreenApi] SENDING_REQUEST...');
   res = await fetch(url, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(payload)
   });

   if (!res) {
     return { ok: false, error: 'No response from provider', errorCode: 'NULL_RESPONSE' };
   }

   rawBody = await res.text();
   console.log('[sendGreenApi] HTTP_STATUS=' + res.status);
   console.log('[sendGreenApi] RAW_RESPONSE_BODY=' + rawBody);

   try {
     data = JSON.parse(rawBody || '{}');
   } catch (parseErr) {
     console.log('[sendGreenApi] RESPONSE_PARSE_ERROR=' + parseErr.message);
     data = { parseError: parseErr.message };
   }
  } catch (fetchErr) {
   console.log('[sendGreenApi] FETCH_ERROR=' + fetchErr.message);
   return { ok: false, error: 'Network error: ' + fetchErr.message, errorCode: 'NETWORK_ERROR' };
  }

  if (res && res.ok && data && data.idMessage) {
   console.log('[sendGreenApi] SUCCESS messageId=' + data.idMessage);
   return { ok: true, providerType: 'greenapi', status: 'sent', messageId: data.idMessage };
  }

  const httpStatus = res ? res.status : null;
  const isQuotaExceeded = (httpStatus === 466) || (data && data.invokeStatus === 'QUOTE_EXCEEDED');
  const errorDetails = {
   httpStatus: httpStatus || 'no-response',
   rawResponseBody: rawBody,
   invokeStatus: data?.invokeStatus || null,
   isQuotaExceeded
  };

  console.log('[sendGreenApi] FAILED httpStatus=' + (httpStatus || 'no-response'));
  return { ok: false, error: data?.message || `HTTP ${httpStatus || 'network-error'}`, errorCode: 'SEND_FAILED', errorDetails };
}

Deno.serve(async (req) => {
  const workerStart = new Date().toISOString();
  console.log('[WORKER_INITIALIZATION] Start time=' + workerStart);
  
  try {
    // Create client first so we can read SystemConfig
    const base44 = createClientFromRequest(req);
    const GLOBAL_OUTBOUND_WHATSAPP_ENABLED = await isOutboundEnabled(base44);

    // ██████████████████████████████████████████████████████████
    // GLOBAL KILL SWITCH CHECK — FIRST THING, BEFORE ANYTHING
    // ██████████████████████████████████████████████████████████
    if (!GLOBAL_OUTBOUND_WHATSAPP_ENABLED) {
      console.log('[KILL_SWITCH] GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE — all outbound sending is BLOCKED');
      console.log('[KILL_SWITCH] Set GLOBAL_OUTBOUND_WHATSAPP_ENABLED=true to re-enable');
      return Response.json({
        ok: false,
        blocked: true,
        reason: 'GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE',
        message: 'All outbound WhatsApp sending is disabled by global kill switch. No messages were sent.',
        processed: 0, sent: 0, failed: 0, skipped: 0,
        processedAt: new Date().toISOString()
      }, { status: 200 });
    }
    // ██████████████████████████████████████████████████████████

    console.log('[WORKER_INIT] SDK client already created for kill switch check...');

    let isAuthorized = false;
    let authUser = null;
    try {
      authUser = await base44.auth.me();
    } catch (_) {
      isAuthorized = true;
    }
    if (!isAuthorized) {
      if (authUser && authUser.role === 'admin') {
        isAuthorized = true;
      } else if (authUser) {
        console.log('[WORKER_AUTH] FAILED: Non-admin user attempted to invoke worker. role=' + authUser.role);
        return Response.json({ ok: false, error: 'Forbidden: admin only' }, { status: 403 });
      } else {
        isAuthorized = true;
      }
    }
    
    console.log('[WORKER_AUTH] PASSED: Worker authorized');

    const workerLock = await acquireWorkerLock(base44);
    if (!workerLock.acquired) {
      console.log('[WORKER_LOCK] Skipped — another worker is already running until ' + workerLock.lockUntil);
      return Response.json({
        ok: true,
        skipped: true,
        reason: 'WORKER_ALREADY_RUNNING',
        processed: 0, sent: 0, failed: 0, skippedCount: 0,
        processedAt: new Date().toISOString()
      }, { status: 200 });
    }

    try {
      await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
        coach_email: 'system',
        event: 'WORKER_START',
        payload: { startedAt: workerStart }
      });
    } catch (logErr) { 
      console.log('[WORKER_DIAGNOSTICS_ERROR] Failed to log WORKER_START: ' + logErr.message);
    }

    const now = new Date().toISOString();
    let allQueued = [];
    try {
      allQueued = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ status: 'queued' });
      if (!allQueued) allQueued = [];
    } catch (fetchErr) {
      console.error('[WORKER_FETCH] Failed to fetch queued messages:', fetchErr.message);
      return Response.json({ ok: false, error: 'Failed to fetch queue', processed: 0, sent: 0, failed: 0, skipped: 0, processedAt: new Date().toISOString() }, { status: 200 });
    }

    let stuckSending = [];
    try {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const allSending = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ status: 'sending' });
      stuckSending = (allSending || []).filter(m => (m.last_attempt_at || m.created_date) < twoMinutesAgo);
    } catch (_) {}

    allQueued = [...allQueued, ...stuckSending];
    console.log('[WORKER_FETCH] Found ' + (allQueued ? allQueued.length : 0) + ' queued messages to process.');

    const providerConfigs = {};
    let processed = 0, sent = 0, failed = 0, skipped = 0;
    const results = [];

    // Tracks all dedup keys seen in this worker run (session_id OR idempotency_key).
    // Prevents same-batch duplicates even when the DB check is unavailable.
    const processedDedupKeys = new Set();

    for (const msg of allQueued.slice(0, CONCURRENCY * 2)) {
      processed++;
      const coachEmail = msg.coach_email;

      // ── DEDUP GATE: session_id (automations) OR idempotency_key (bulk/manual sends) ──
      // session_id is set by enqueueWhatsAppMessage; idempotency_key is set by direct
      // WhatsAppMessageQueue.create() calls from the frontend bulk-send and scheduled-send paths.
      const dedupKey = msg.session_id || msg.idempotency_key || null;

      if (dedupKey) {
        // In-memory check (fast): catches duplicates within the same worker run
        if (processedDedupKeys.has(dedupKey)) {
          console.log(`[WORKER_DEDUP] BLOCKED in-batch duplicate key=${dedupKey} msgId=${msg.id}`);
          skipped++;
          await base44.asServiceRole.entities.WhatsAppMessageQueue.update(msg.id, {
            status: 'cancelled',
            error_message: `DUPLICATE_IDEMPOTENCY_KEY: key ${dedupKey} already processed in this batch`
          }).catch(() => {});
          results.push({ id: msg.id, status: 'cancelled', reason: 'duplicate_dedup_key' });
          continue;
        }

        // DB-level check: allow only one active record per dedup key.
        // Filters by session_id (if that's what we have) or by idempotency_key.
        // If the schema field doesn't exist, the filter throws and we catch → process anyway.
        let sameKeyRecords = [];
        try {
          if (msg.session_id) {
            sameKeyRecords = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ session_id: msg.session_id });
          } else if (msg.idempotency_key) {
            sameKeyRecords = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ idempotency_key: msg.idempotency_key });
          }
        } catch (_) { sameKeyRecords = []; }

        const activeSameKeyRecords = (sameKeyRecords || []).filter(r => ['queued', 'sending', 'sent', 'provider_unconfirmed'].includes(r.status));
        const canonicalRecord = [...activeSameKeyRecords].sort((a, b) => {
          const aTime = new Date(a.created_date || a.scheduled_for || 0).getTime();
          const bTime = new Date(b.created_date || b.scheduled_for || 0).getTime();
          if (aTime !== bTime) return aTime - bTime;
          return String(a.id || '').localeCompare(String(b.id || ''));
        })[0];

        if (canonicalRecord && canonicalRecord.id !== msg.id) {
          console.log(`[WORKER_DEDUP] BLOCKED duplicate key=${dedupKey} msgId=${msg.id} canonical=${canonicalRecord.id}`);
          skipped++;
          await base44.asServiceRole.entities.WhatsAppMessageQueue.update(msg.id, {
            status: 'cancelled',
            error_message: `DUPLICATE_IDEMPOTENCY_KEY: canonical message is ${canonicalRecord.id}`
          }).catch(() => {});
          results.push({ id: msg.id, status: 'cancelled', reason: 'duplicate_dedup_key_cross_record' });
          continue;
        }
        processedDedupKeys.add(dedupKey);
      }

      if (await isTraineeOptedOut(base44, msg)) {
        skipped++;
        await base44.asServiceRole.entities.WhatsAppMessageQueue.update(msg.id, {
          status: 'cancelled',
          error_message: 'WHATSAPP_NOTIFICATIONS_DISABLED_FOR_TRAINEE'
        }).catch(() => {});
        results.push({ id: msg.id, status: 'cancelled', reason: 'trainee_whatsapp_opt_out' });
        continue;
      }

      // Last line of defense: do not send duplicate reminder to the same phone on the same day,
      // even if duplicate trainee records created different session IDs.
      const reminderMatch = msg.session_id?.match(/__(breakfast|lunch|dinner)_check__(\d{4}-\d{2}-\d{2})$/);
      if (reminderMatch && msg.to_phone_e164 && msg.template_key) {
        const [, mealType, dayKey] = reminderMatch;
        const samePhoneMessages = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({
          to_phone_e164: msg.to_phone_e164,
          template_key: msg.template_key
        }).catch(() => []);
        const canonicalSentOrActive = (samePhoneMessages || [])
          .filter(r => r.id !== msg.id)
          .filter(r => r.session_id?.endsWith(`__${mealType}_check__${dayKey}`))
          .filter(r => ['sending', 'sent', 'provider_unconfirmed'].includes(r.status))
          .sort((a, b) => new Date(a.created_date || a.scheduled_for || 0) - new Date(b.created_date || b.scheduled_for || 0))[0];

        if (canonicalSentOrActive) {
          skipped++;
          await base44.asServiceRole.entities.WhatsAppMessageQueue.update(msg.id, {
            status: 'cancelled',
            error_message: `DUPLICATE_PHONE_REMINDER: ${msg.to_phone_e164} already has ${msg.template_key} for ${dayKey}`
          }).catch(() => {});
          results.push({ id: msg.id, status: 'cancelled', reason: 'duplicate_phone_reminder' });
          continue;
        }
      }

      // Get provider config (cache per coach)
      if (!providerConfigs[coachEmail]) {
        try {
          const cfgs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail });
          providerConfigs[coachEmail] = cfgs[0] || null;
        } catch (_) { providerConfigs[coachEmail] = null; }
      }
      const config = providerConfigs[coachEmail];

      // Mark as sending
      try {
        await base44.asServiceRole.entities.WhatsAppMessageQueue.update(msg.id, {
          status: 'sending',
          last_attempt_at: new Date().toISOString(),
          attempts: (msg.attempts || 0) + 1
        });
      } catch (_) {}

      let sendResult = null;
      try {
        if (config && config.provider_type === 'greenapi' && config.is_enabled) {
          sendResult = await sendGreenApi(config, msg.to_phone_e164, msg.rendered_text);
        } else {
          sendResult = await simulateGreenApiResponse({ chatId: (msg.to_phone_e164 || '').replace(/^\+/, '') + '@c.us' }, msg.to_phone_e164, msg.rendered_text);
        }
      } catch (sendErr) {
        sendResult = { ok: false, error: sendErr.message };
      }

      if (sendResult && sendResult.ok) {
        sent++;
        await base44.asServiceRole.entities.WhatsAppMessageQueue.update(msg.id, {
          status: 'sent',
          provider_response: JSON.stringify(sendResult)
        });
        results.push({ id: msg.id, phone: msg.to_phone_e164, status: 'sent' });
      } else {
        const attempts = (msg.attempts || 0) + 1;
        const newStatus = attempts >= MAX_ATTEMPTS ? 'failed' : 'queued';
        failed++;
        await base44.asServiceRole.entities.WhatsAppMessageQueue.update(msg.id, {
          status: newStatus,
          error_message: sendResult?.error || 'Unknown error',
          provider_response: JSON.stringify(sendResult)
        });
        results.push({ id: msg.id, phone: msg.to_phone_e164, status: newStatus, error: sendResult?.error });
      }
    }

    console.log('[WORKER_DONE] processed=' + processed + ' sent=' + sent + ' failed=' + failed);
    await releaseWorkerLock(base44);

    return Response.json({
      ok: true,
      processed, sent, failed, skipped,
      results,
      processedAt: new Date().toISOString()
    }, { status: 200 });

  } catch (error) {
    try {
      const base44ForRelease = createClientFromRequest(req);
      await releaseWorkerLock(base44ForRelease);
    } catch (_) {}
    console.error('[whatsAppQueueWorker] FATAL ERROR:', error?.message || 'unknown', error?.stack || 'no-stack');
    return Response.json({ 
      ok: false, 
      error: error?.message || 'Unknown worker error',
      errorCode: 'WORKER_FATAL',
      processed: 0, sent: 0, failed: 0, skipped: 0,
      processedAt: new Date().toISOString() 
    }, { status: 200 });
  }
});