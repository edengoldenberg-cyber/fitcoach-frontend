import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const FUNCTION_NAME = 'whatsAppInboundWebhook';
const PROCESSING_TIMEOUT_MS = 25000; // 25s max processing time
const DEDUP_WINDOW_MS = 300000; // 5 minutes for idempotency window

// ─── Phone Normalization ────────────────────────────────────────────────────
// ISSUE-016 fix: unified canonical version — identical to pollGreenApiInbound.
// Handles: 00-prefix, reversed +, non-digit stripping, +972/972/05x/5x formats.
function normalizePhoneToE164NP(phoneRaw) {
  if (!phoneRaw) return null;
  let s = String(phoneRaw).trim().replace(/[\s\-().,]/g, '').replace(/[^\d+]/g, '');
  if (s.endsWith('+') && !s.startsWith('+')) s = '+' + s.slice(0, -1);
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('+')) s = s.slice(1);
  if (/^972\d{9}$/.test(s)) return s;
  if (/^0\d{9}$/.test(s)) return '972' + s.slice(1);
  if (/^5\d{8}$/.test(s)) return '972' + s;
  return null;
}

// ─── Idempotency Key Generation ────────────────────────────────────────────
function generateIdempotencyKey(msgId, chatId, phone, text, timestamp) {
  if (msgId && msgId.length > 5) return `msg:${msgId}`;
  const ts = timestamp ? new Date(timestamp).getTime() : Date.now();
  const tsWindow = Math.floor(ts / 60000);
  const textHash = text ? text.slice(0, 50).replace(/\s+/g, '') : '';
  const phoneNorm = normalizePhoneToE164NP(phone) || phone;
  return `comp:${phoneNorm}:${tsWindow}:${textHash.length}`;
}

// ─── Structured Logging ─────────────────────────────────────────────────────
function log(stage, level, message, context = {}) {
  const timestamp = new Date().toISOString();
  const prefix = `[${FUNCTION_NAME}] [${level}] [${stage}]`;
  const contextStr = Object.keys(context).length > 0
    ? ' | ' + Object.entries(context).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')
    : '';
  console.log(`${prefix} ${message}${contextStr}`);
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function extractFromGreenAPI(body) {
  try {
    if (body?.senderData?.sender) {
      const raw = body.senderData.sender.replace('@c.us', '').replace('@s.whatsapp.net', '');
      const from = raw.startsWith('+') ? raw : '+' + raw;
      const text = body?.messageData?.textMessageData?.textMessage
        || body?.messageData?.extendedTextMessageData?.text
        || body?.messageData?.pollMessageData?.name
        || '';
      const ts = body?.timestamp ? new Date(body.timestamp * 1000).toISOString() : new Date().toISOString();
      const msgId = body?.idMessage || body?.messageData?.idMessage || '';
      const chatId = body?.senderData?.chatId || '';
      const messageType = body?.messageData?.typeMessage || 'text';
      return { from, text, ts, msgId, chatId, messageType };
    }
    const from = body?.from || body?.senderNumber || body?.phone || '';
    const text = body?.text || body?.message || body?.body || '';
    const ts = body?.timestamp
      ? (typeof body.timestamp === 'number' ? new Date(body.timestamp * 1000).toISOString() : body.timestamp)
      : new Date().toISOString();
    const msgId = body?.messageId || body?.idMessage || '';
    const chatId = body?.chatId || '';
    const messageType = body?.messageType || body?.type || 'text';
    return { from, text, ts, msgId, chatId, messageType };
  } catch (e) {
    log('extract', 'ERROR', 'Failed to extract message data', { error: e.message });
    return { from: '', text: '', ts: new Date().toISOString(), msgId: '', chatId: '', messageType: 'unknown' };
  }
}

async function updatePipelineStatus(base44, coachEmail, data) {
  try {
    const existing = await base44.asServiceRole.entities.SystemHealth.filter({ coach_email: coachEmail }).catch(() => []);
    const record = { coach_email: coachEmail, ...data };
    if (existing[0]?.id) {
      await base44.asServiceRole.entities.SystemHealth.update(existing[0].id, record).catch(() => {});
    } else {
      await base44.asServiceRole.entities.SystemHealth.create(record).catch(() => {});
    }
  } catch (_) {}
}

async function logDiag(base44, coachEmail, event, payload) {
  try {
    await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
      coach_email: coachEmail || 'system',
      event: event || 'RULE_TRIGGERED',
      payload: { ...payload, timestamp: new Date().toISOString() }
    }).catch(() => {});
  } catch (_) {}
}

// ─── Free-text question detector ─────────────────────────────────────────────
// Returns true when the inbound looks like an open question rather than a
// structured step reply (e.g. "כמה עולה?", "איך זה עובד?", "מה יש?").
// When true and AI Brain is active, the inbound is routed to AI even if
// a Flow session is currently active (free-text fallback policy).
function isFreeTextQuestion(text) {
  if (!text) return false;
  const t = text.trim();
  if (t.includes('?') || t.includes('\u055E')) return true;
  const lower = t.toLowerCase();
  const questionPrefixes = [
    'איך', 'מה ', 'כמה', 'מתי', 'איפה', 'האם', 'מי ', 'למה', 'לאן',
    'how ', 'what ', 'when ', 'where ', 'why ', 'who '
  ];
  return questionPrefixes.some(p => lower.startsWith(p));
}

// ─── WA-Only Signal Detector ──────────────────────────────────────────────────
// Returns true when the inbound message contains an explicit signal that the
// lead prefers WhatsApp only. SAFE: detection only — persisted to Lead.waOnly.
function isWaOnlySignal(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const WA_ONLY_KEYWORDS = [
    'לא רוצה שיחה', 'לא רוצה שתתקשר', 'בלי שיחה',
    'עדיף בכתב', 'רק בוואצאפ', 'רק בוואטסאפ',
    'מעדיף פה', 'מעדיפה פה', 'שלח לי כאן', 'שלחי לי כאן',
    'לא נוח לי לדבר', 'אני בעבודה', 'בלי טלפון', 'רק הודעות',
    'no call', 'no phone', 'just text', 'text only', 'whatsapp only',
    'prefer here', 'prefer text', 'no phone call',
  ];
  return WA_ONLY_KEYWORDS.some(kw => lower.includes(kw));
}

// ─── Concurrency Lock Management
// ISSUE-001: processingLocks is in-memory and provides NO cross-request protection in
// serverless. It is cosmetic only. The true dedup guard is the DB claim in claimAndQueueOutbound.
// acquireLock/releaseLock are kept as no-ops so all callers compile, but no runtime decision
// depends on them — every path continues regardless of lock state.
const processingLocks = new Map(); // COSMETIC ONLY — not a real guard
const LOCK_TIMEOUT_MS = 30000;     // COSMETIC ONLY — not used for routing decisions

function acquireLock(leadId) {
  // COSMETIC ONLY: always returns true — DB claim is the real guard
  processingLocks.set(leadId, Date.now());
  return true;
}

function releaseLock(leadId) {
  processingLocks.delete(leadId);
}

setInterval(() => {
  const now = Date.now();
  for (const [leadId, timestamp] of processingLocks.entries()) {
    if (now - timestamp > LOCK_TIMEOUT_MS) {
      processingLocks.delete(leadId);
    }
  }
}, 60000);

// ─── Background processor (runs AFTER 200 is returned) ──────────────────────
async function processInbound(rawBody, requestClone) {
  let base44;
  let coachEmail = 'system';
  let leadId = null;
  let phoneNormalized = null;
  const startTime = Date.now();

  const result = {
    ok: false,
    stage: 'init',
    message: '',
    error: null,
    data: {},
    retryable: false
  };

  try {
    base44 = createClientFromRequest(requestClone);
  } catch (e) {
    result.stage = 'sdk_init';
    result.error = `SDK init failed: ${e.message}`;
    result.retryable = false;
    log('sdk_init', 'ERROR', result.error);
    return result;
  }

  const receivedAt = new Date().toISOString();
  log('init', 'INFO', 'Processing started', { receivedAt });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Processing timeout exceeded')), PROCESSING_TIMEOUT_MS);
  });

  try {
    await Promise.race([
      (async () => {

        // ── Step 1: Parse body ──────────────────────────────────────────────
        result.stage = 'parse';
        let body = {};
        try {
          body = JSON.parse(rawBody);
          log('parse', 'INFO', 'Parse successful', { keys: Object.keys(body).join(',') });
        } catch (e) {
          result.error = `JSON parse error: ${e.message}`;
          result.retryable = false;
          log('parse', 'ERROR', result.error, { rawPreview: rawBody.slice(0, 300) });
          await updatePipelineStatus(base44, 'system', {
            lastInboundWebhookReceivedAt: receivedAt,
            lastInboundRawPayload: rawBody.slice(0, 2000),
            inboundPipelineStatus: 'RECEIVED_NOT_PARSED',
            lastInboundParseSuccess: false,
            lastInboundLeadMatched: false,
            lastInboundFailureReason: result.error
          });
          return result;
        }

        const rawPayloadStr = rawBody.slice(0, 2000);

        // ── Step 2: Mark received ────────────────────────────────────────────
        result.stage = 'received';
        await updatePipelineStatus(base44, 'system', {
          lastInboundWebhookReceivedAt: receivedAt,
          lastInboundRawPayload: rawPayloadStr,
          inboundPipelineStatus: 'RECEIVED_NOT_PARSED',
          lastInboundParseSuccess: true,
          lastInboundLeadMatched: false,
          lastInboundFailureReason: null
        });

        await logDiag(base44, 'system', 'INBOUND_RAW', {
          typeWebhook: body?.typeWebhook,
          hasSenderData: !!body?.senderData,
          hasMessageData: !!body?.messageData,
          keys: Object.keys(body || {}).join(',')
        });

        // ── Step 3: Filter webhook type ──────────────────────────────────────
        result.stage = 'filter_type';
        const webhookType = body?.typeWebhook || '';
        const ALLOWED_TYPES = ['incomingMessageReceived', 'incomingMessage'];
        if (webhookType && !ALLOWED_TYPES.includes(webhookType)) {
          result.message = `Webhook type ${webhookType} not handled - skipped`;
          result.ok = true;
          log('filter_type', 'INFO', result.message);
          await updatePipelineStatus(base44, 'system', {
            inboundPipelineStatus: 'RECEIVED_NOT_PARSED',
            lastInboundFailureReason: result.message
          });
          return result;
        }

        // ── Step 4: Extract fields ───────────────────────────────────────────
        result.stage = 'extract';
        const { from: rawFrom, text: messageText, ts: inboundAt, msgId, chatId, messageType } = extractFromGreenAPI(body);
        log('extract', 'INFO', 'Fields extracted', {
          rawFrom, messageType, textLength: messageText?.length || 0,
          msgId: msgId || 'none', chatId: chatId || 'none'
        });

        // ── Step 5: Validate message type ────────────────────────────────────
        result.stage = 'validate_type';
        if (messageType && !['text', 'extendedText', 'textMessage'].includes(messageType)) {
          result.message = `Unsupported message type: ${messageType}`;
          result.ok = true;
          log('validate_type', 'INFO', result.message);
          await logDiag(base44, 'system', 'UNSUPPORTED_MESSAGE_TYPE', { messageType, rawFrom });
          return result;
        }

        // ── Step 6: Validate phone ───────────────────────────────────────────
        result.stage = 'validate_phone';
        if (!rawFrom || typeof rawFrom !== 'string') {
          result.error = 'Missing or invalid from phone';
          result.retryable = false;
          log('validate_phone', 'ERROR', result.error, { rawFrom });
          await updatePipelineStatus(base44, 'system', {
            inboundPipelineStatus: 'RECEIVED_NOT_PARSED',
            lastInboundFailureReason: result.error
          });
          return result;
        }

        const fromPhoneNormalized = normalizePhoneToE164NP(rawFrom);
        phoneNormalized = fromPhoneNormalized;
        if (!fromPhoneNormalized) {
          result.error = `Phone normalization failed: ${rawFrom}`;
          result.retryable = false;
          log('validate_phone', 'ERROR', result.error);
          await updatePipelineStatus(base44, 'system', {
            inboundPipelineStatus: 'RECEIVED_NOT_PARSED',
            lastInboundFailureReason: result.error
          });
          return result;
        }
        log('validate_phone', 'INFO', 'Phone normalized', { rawFrom, normalized: fromPhoneNormalized });

        // ── Step 7: Validate message text ────────────────────────────────────
        result.stage = 'validate_text';
        if (!messageText || messageText.trim().length === 0) {
          result.message = 'Empty message text - skipped';
          result.ok = true;
          log('validate_text', 'INFO', result.message);
          return result;
        }

        await updatePipelineStatus(base44, 'system', {
          inboundPipelineStatus: 'PARSED_NOT_MATCHED',
          lastInboundParseSuccess: true
        });

        // ── Step 8: Deduplication ────────────────────────────────────────────
        result.stage = 'dedup';
        const idempotencyKey = generateIdempotencyKey(msgId, chatId, rawFrom, messageText, inboundAt);
        log('dedup', 'INFO', 'Checking for duplicates', { idempotencyKey, msgId: msgId || 'none' });

        if (msgId && msgId.length > 5) {
          const existingById = await base44.asServiceRole.entities.LeadMessageThread.filter({
            providerMessageId: msgId, direction: 'INBOUND'
          }).catch(() => []);

          if (existingById.length > 0) {
            result.message = `Duplicate INBOUND detected by providerMessageId: ${msgId} — stopping all processing`;
            result.ok = true;
            log('dedup', 'INFO', result.message, { existingCount: existingById.length, existingId: existingById[0]?.id });
            await logDiag(base44, 'system', 'INBOUND_DUPLICATE_SKIPPED', {
              msgId, idempotencyKey, existingId: existingById[0]?.id, reason: 'provider_message_id_match_inbound_only'
            });
            return result;
          }
        }
        log('dedup', 'INFO', 'No duplicate found - proceeding');

        // ── Step 9: Lead matching ────────────────────────────────────────────
        result.stage = 'lead_match';
        log('lead_match', 'INFO', 'Searching for lead', { phone: fromPhoneNormalized });
        await logDiag(base44, 'system', 'LEAD_SEARCH_START', { rawFrom, fromPhoneNormalized });

        let leads = [];
        let matchedOn = null;

        let found = await base44.asServiceRole.entities.Lead.filter({ phoneE164: fromPhoneNormalized }).catch(() => []);
        if (found.length) { leads = found; matchedOn = `phoneE164:${fromPhoneNormalized}`; }

        if (!leads.length) {
          found = await base44.asServiceRole.entities.Lead.filter({ phone: fromPhoneNormalized }).catch(() => []);
          if (found.length) { leads = found; matchedOn = `phone:${fromPhoneNormalized}`; }
        }

        if (!leads.length) {
          found = await base44.asServiceRole.entities.Lead.filter({ phoneRaw: fromPhoneNormalized }).catch(() => []);
          if (found.length) { leads = found; matchedOn = `phoneRaw:${fromPhoneNormalized}`; }
        }

        if (!leads.length) {
          log('lead_match', 'INFO', 'Direct match failed, trying in-memory normalization');
          const allLeads = await base44.asServiceRole.entities.Lead.list('-created_date', 500).catch(() => []);
          for (const l of allLeads) {
            const normPhone = normalizePhoneToE164NP(l.phone);
            const normPhoneRaw = normalizePhoneToE164NP(l.phoneRaw);
            const normPhoneE164 = normalizePhoneToE164NP(l.phoneE164);
            if (normPhone === fromPhoneNormalized || normPhoneRaw === fromPhoneNormalized || normPhoneE164 === fromPhoneNormalized) {
              leads = [l];
              const sourceField = normPhone === fromPhoneNormalized ? 'phone' : normPhoneRaw === fromPhoneNormalized ? 'phoneRaw' : 'phoneE164';
              matchedOn = `in_memory[${sourceField}]:${l[sourceField]}→${fromPhoneNormalized}`;
              break;
            }
          }
        }

        if (!leads.length) {
          result.error = `No lead found for phone: ${fromPhoneNormalized}`;
          result.retryable = false;
          log('lead_match', 'WARN', result.error);
          await logDiag(base44, 'system', 'LEAD_NOT_FOUND', { rawFrom, fromPhoneNormalized });
          await updatePipelineStatus(base44, 'system', {
            inboundPipelineStatus: 'PARSED_NOT_MATCHED',
            lastInboundLeadMatched: false,
            lastInboundFailureReason: result.error
          });
          return result;
        }

        // Multiple leads share this phone — pick the most recently active
        if (leads.length > 1) {
          leads.sort((a, b) => new Date(b.lastInboundAt || b.updated_date || 0) - new Date(a.lastInboundAt || a.updated_date || 0));
          log('lead_match', 'WARN', 'MULTI_LEAD_PHONE_COLLISION', { phone: fromPhoneNormalized, count: leads.length, pickedId: leads[0].id });
          await logDiag(base44, 'system', 'MULTI_LEAD_PHONE_COLLISION', { phone: fromPhoneNormalized, leadIds: leads.map(l => l.id), pickedId: leads[0].id });
        }
        const lead = leads[0];
        if (!lead?.id) {
          result.error = 'Matched lead has no ID';
          result.retryable = false;
          log('lead_match', 'ERROR', result.error);
          return result;
        }

        leadId = lead.id;
        coachEmail = lead.coach_email || 'system';

        // Active Trainee always wins — skip all Lead routing if an active Trainee owns this phone
        const traineeMatches = await base44.asServiceRole.entities.Trainee.filter({ phone: fromPhoneNormalized }).catch(() => []);
        const activeTrainee = (traineeMatches || []).find(t => t.status === 'active');
        if (activeTrainee) {
          log('lead_match', 'INFO', 'LEAD_TRAINEE_COLLISION_TRAINEE_WINS', { leadId, traineeId: activeTrainee.id, phone: fromPhoneNormalized });
          await logDiag(base44, coachEmail, 'LEAD_TRAINEE_COLLISION_TRAINEE_WINS', {
            leadId, traineeId: activeTrainee.id, phone: fromPhoneNormalized,
            routing: 'trainee_wins_lead_skipped'
          });
          await updatePipelineStatus(base44, coachEmail, {
            inboundPipelineStatus: 'MATCHED_TRAINEE_WINS',
            lastInboundLeadMatched: true,
            lastInboundFailureReason: 'trainee_wins_collision'
          });
          // ── Trainee inbound handler ───────────────────────────────────────────
          // Save in trainee context: aiProcessed=true blocks lead AI entity automation,
          // senderType=TRAINEE distinguishes from lead messages in coach view.
          // Never invokes salesFlowRunner, interpretLeadReplyWithScript, or lead AI.
          const traineeCoachEmail = activeTrainee.coach_email || coachEmail;
          try {
            await base44.asServiceRole.entities.LeadMessageThread.create({
              leadId,
              coach_email: traineeCoachEmail,
              channel: 'WHATSAPP',
              direction: 'INBOUND',
              senderType: 'TRAINEE',
              messageText: messageText || '(empty)',
              messageTimestamp: new Date(inboundAt).toISOString(),
              providerMessageId: msgId || `trainee_inbound_${Date.now()}`,
              aiProcessed: true,
              replyProducer: 'trainee_handler',
              replyStatus: 'pending_trainee_handler',
              skipReason: 'TRAINEE_INBOUND_ROUTED'
            }).catch(() => {});

            await base44.asServiceRole.entities.WhatsAppEventLog.create({
              trainee_email: activeTrainee.user_email || '',
              event_type: 'trainee_inbound_received',
              trigger_type: 'trainee_whatsapp_inbound',
              timestamp: new Date().toISOString(),
              message_sent: (messageText || '').slice(0, 200),
              user_state: { traineeId: activeTrainee.id, leadId, phone: fromPhoneNormalized }
            }).catch(() => {});

            await logDiag(base44, traineeCoachEmail, 'TRAINEE_INBOUND_HANDLER_INVOKED', {
              traineeId: activeTrainee.id,
              traineeEmail: activeTrainee.user_email,
              messagePreview: (messageText || '').slice(0, 60),
              phone: fromPhoneNormalized
            });
          } catch (_) {}

          result.ok = true;
          result.stage = 'trainee_inbound_handled';
          result.message = `Trainee inbound recorded for trainee ${activeTrainee.id} — Lead routing skipped`;
          result.data = { leadId, traineeId: activeTrainee.id, routingDecision: 'TRAINEE_WINS', traineeEmail: activeTrainee.user_email };
          return result;
        }

        log('lead_match', 'INFO', 'Lead matched successfully', {
          leadId,
          leadName: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
          matchedOn,
          coach: coachEmail
        });

        await logDiag(base44, coachEmail, 'LEAD_MATCH_SUCCESS', {
          leadId,
          leadName: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
          matchedOn,
          phone: fromPhoneNormalized
        });

        // ── Step 10: Concurrency protection ─────────────────────────────────
        result.stage = 'concurrency_check';
        if (!acquireLock(leadId)) {
          result.message = `Message processing already in progress for lead: ${leadId}`;
          result.ok = true;
          result.retryable = true;
          log('concurrency_check', 'INFO', result.message);
          await logDiag(base44, coachEmail, 'CONCURRENT_PROCESSING_SKIPPED', { leadId });
          return result;
        }

        try {
          // ── Step 11: Update pipeline status ──────────────────────────────
          result.stage = 'pipeline_update';
          await updatePipelineStatus(base44, coachEmail, {
            lastInboundWebhookReceivedAt: receivedAt,
            lastInboundRawPayload: rawPayloadStr,
            lastInboundWebhookMessageText: (messageText || '').slice(0, 100),
            lastInboundWebhookLeadId: leadId,
            lastInboundWebhookSuccess: true,
            lastInboundWebhookProvider: 'GREEN_API',
            inboundPipelineStatus: 'MATCHED_SUCCESSFULLY',
            lastInboundParseSuccess: true,
            lastInboundLeadMatched: true,
            lastInboundFailureReason: null
          });

          // ── Step 12: Resolve active Flow session for this lead ────────────
          // This MUST happen before saving inbound so the record is stamped
          // with the correct sessionId from the start.
          result.stage = 'session_resolve';
          let activeSession = null;
          try {
            // Query only by leadId + isActive — do NOT filter by flowStatus here
            // because a session may be ACTIVE but waitingForReply=false briefly
            const activeSessions = await base44.asServiceRole.entities.LeadConversationState.filter({
              leadId,
              isActive: true
            }).catch(() => []);
            // Pick most recently updated if multiple exist (handles FS-06 duplicate state)
            if (activeSessions.length > 0) {
              activeSession = activeSessions
                .filter(s => s.flowStatus === 'ACTIVE')
                .sort((a, b) => new Date(b.updated_date || 0) - new Date(a.updated_date || 0))[0]
                || activeSessions.sort((a, b) => new Date(b.updated_date || 0) - new Date(a.updated_date || 0))[0];
            }
          } catch (_) {}

          log('session_resolve', 'INFO', 'Session lookup complete', {
            leadId,
            foundSession: !!activeSession,
            sessionId: activeSession?.sessionId || null,
            flowId: activeSession?.flowId || null,
            currentStep: activeSession?.currentStepOrder || null,
            flowStatus: activeSession?.flowStatus || null,
            waitingForReply: activeSession?.waitingForReply || false
          });

          await logDiag(base44, coachEmail, 'FLOW_INBOUND_SESSION_RESOLVED', {
            leadId,
            foundSession: !!activeSession,
            sessionId: activeSession?.sessionId || null,
            flowId: activeSession?.flowId || null,
            currentStepOrder: activeSession?.currentStepOrder || null,
            flowStatus: activeSession?.flowStatus || null,
            waitingForReply: activeSession?.waitingForReply || false,
            isActive: activeSession?.isActive || false
          });

          // ── Step 13: Save inbound message (with session linkage) ──────────
          // CRITICAL: Determine session linkage AND AI-block flags BEFORE create.
          // The entity automation (aiConversationAgent) fires on LeadMessageThread.create.
          // If aiProcessed=false is written at create time, AI may race before we can update.
          // Solution: if an ACTIVE flow session exists, stamp sessionId + aiProcessed=true
          // + replyProducer=salesFlowRunner at create time — atomic, no race window.
          result.stage = 'save_message';
          let savedInbound = null;

          const sessionIdToStamp = activeSession?.sessionId || null;
          const ownerIsExplicitlyAI = lead.activeResponderOwner === 'AI';
          // ISSUE-010 fix: detect free-text BEFORE building the payload.
          // If a free-text question will be routed to AI, do NOT stamp aiProcessed=true at create time
          // — that eliminates the post-create reversal race window entirely.
          // aiBrainActive is needed here; resolve it early (reused below at routing stage).
          const allBrainsEarly = await base44.asServiceRole.entities.AIBrainConfig.list('-created_date', 20).catch(() => []);
          const aiBrainActiveEarly = allBrainsEarly.some(b => b.coach_email === coachEmail && b.isActive === true);
          const willRouteFreeTextToAI =
            isFreeTextQuestion(messageText) &&
            aiBrainActiveEarly &&
            !!activeSession &&
            activeSession.flowStatus === 'ACTIVE';

          const hasActiveFlowSessionForCreate =
            !!activeSession &&
            activeSession.flowStatus === 'ACTIVE' &&
            !ownerIsExplicitlyAI && // FIX: AI owner override wins — do not stamp aiProcessed=true if owner=AI
            !willRouteFreeTextToAI;  // ISSUE-010 fix: free-text going to AI must not be pre-blocked

          // Build create payload — stamp session + AI-block flags atomically if Flow owns this lead
          const inboundCreatePayload = {
            leadId,
            coach_email: coachEmail,
            channel: 'WHATSAPP',
            direction: 'INBOUND',
            senderType: 'LEAD',
            messageText: messageText || '(empty)',
            messageTimestamp: new Date(inboundAt).toISOString(),
            providerMessageId: msgId || idempotencyKey,
            // ── SESSION LINKAGE (always stamp if session exists) ─────────
            ...(sessionIdToStamp ? { sessionId: sessionIdToStamp } : {}),
            // ── AI RACE PREVENTION (stamp at create if Flow will own) ────
            // activeResponderOwner=FLOW (explicit) OR routing_brain detects active session
            // In both cases AI must be blocked BEFORE the entity automation fires.
            ...(hasActiveFlowSessionForCreate ? {
              aiProcessed: true,
              replyProducer: 'salesFlowRunner',
              replyStatus: 'pending',
              replyGenerationStartedAt: new Date().toISOString()
            } : {
              aiProcessed: false
            })
          };

          await logDiag(base44, coachEmail, 'FLOW_INBOUND_PRE_SAVE', {
            leadId,
            sessionIdToStamp,
            foundSession: !!activeSession,
            hasActiveFlowSessionForCreate,
            aiProcessedAtCreate: hasActiveFlowSessionForCreate,
            messagePreview: (messageText || '').slice(0, 60)
          });

          try {
            savedInbound = await base44.asServiceRole.entities.LeadMessageThread.create(inboundCreatePayload);

            log('save_message', 'INFO', 'Message saved', {
              messageId: savedInbound?.id,
              attachedToSession: !!sessionIdToStamp,
              sessionId: sessionIdToStamp
            });
          } catch (err) {
            result.error = `Failed to save message: ${err.message}`;
            result.retryable = true;
            log('save_message', 'ERROR', result.error);
            // Continue processing even if message save fails
          }

          await logDiag(base44, coachEmail, 'FLOW_INBOUND_POST_SAVE', {
            leadId,
            savedId: savedInbound?.id,
            messagePreview: (messageText || '').slice(0, 60),
            foundSession: !!activeSession,
            sessionIdToStamp,
            persistedSessionId: savedInbound?.sessionId || null,
            attachedToSession: !!(savedInbound?.sessionId)
          });

          await logDiag(base44, coachEmail, 'INBOUND_MESSAGE_SAVED', {
            leadId,
            savedId: savedInbound?.id,
            messagePreview: (messageText || '').slice(0, 60),
            foundSession: !!activeSession,
            attachedToSession: !!sessionIdToStamp,
            sessionId: sessionIdToStamp
          });

          // ── Step 14: Intent detection + lead update ───────────────────────
          result.stage = 'lead_update';
          const lowerText = (messageText || '').toLowerCase();
          const isOptOut = ['לא מעוניין', 'תפסיקו', 'הסר', 'stop'].some(kw => lowerText.includes(kw));
          const isCallRequest = !isOptOut && ['תתקשר', 'תחזור', 'דבר איתי'].some(kw => lowerText.includes(kw));
          // ISSUE-018 fix: do not overwrite terminal/booked statuses with a generic keyword-based status.
          // Only update status if current lead.status is not already a protected terminal state.
          const PROTECTED_STATUSES = ['BOOKED', 'CLOSED', 'CALL_REQUESTED'];
          const rawNewStatus = isOptOut ? 'CLOSED' : isCallRequest ? 'CALL_REQUESTED' : 'INTERESTED';
          let newStatus = PROTECTED_STATUSES.includes(lead.status) ? lead.status : rawNewStatus;

          const noteSnippet = messageText ? `תגובה: "${messageText.slice(0, 60)}${messageText.length > 60 ? '…' : ''}"` : 'תגובה נכנסת';
          const updatedNotes = lead.notes ? `${lead.notes}\n${noteSnippet}` : noteSnippet;

          // ── WA-ONLY DETECTION ────────────────────────────────────────────────
          // Detect once per inbound. Once true it is never reset to false automatically.
          // Does not affect routing — persists preference only.
          const detectedWaOnly = !isOptOut && isWaOnlySignal(messageText);
          const leadAlreadyWaOnly = lead.waOnly === true;
          const shouldSetWaOnly = detectedWaOnly && !leadAlreadyWaOnly;
          if (detectedWaOnly) {
            log('lead_update', 'INFO', 'WA_ONLY_SIGNAL_DETECTED', { leadId, messagePreview: (messageText || '').slice(0, 60), alreadySet: leadAlreadyWaOnly });
            await logDiag(base44, coachEmail, 'WA_ONLY_SIGNAL_DETECTED', {
              leadId, messagePreview: (messageText || '').slice(0, 60),
              alreadySet: leadAlreadyWaOnly, willPersist: shouldSetWaOnly
            });
          }

          try {
            await base44.asServiceRole.entities.Lead.update(leadId, {
              lastInboundAt: new Date(inboundAt).toISOString(),
              status: newStatus,
              waOptOut: isOptOut,
              notes: updatedNotes,
              ...(shouldSetWaOnly ? { waOnly: true } : {})
            });
            log('lead_update', 'INFO', 'Lead updated', { newStatus, isOptOut, isCallRequest, detectedWaOnly, shouldSetWaOnly });
          } catch (err) {
            log('lead_update', 'ERROR', `Lead update failed: ${err.message}`);
          }

          // ── Step 15: Activity log (fire-and-forget) ───────────────────────
          result.stage = 'activity_log';
          base44.asServiceRole.functions.invoke('logLeadActivity', {
            leadId,
            coach_email: coachEmail,
            activityType: 'WHATSAPP_INBOUND',
            activitySource: 'WHATSAPP',
            message: `הודעה נכנסת: "${(messageText || '').slice(0, 80)}"`,
            metadata: { prevStatus: lead.status, newStatus, isOptOut, isCallRequest }
          }).catch(() => {});

          // ── Step 16: Routing + downstream ────────────────────────────────
          result.stage = 'downstream';

          // Track whether ANY engine claimed this inbound
          let engineClaimed = false;
          let routingDecision = 'NONE';

          if (!isOptOut) {
            // Non-blocking analytics
            base44.asServiceRole.functions.invoke('updateLeadScore', { leadId, messageText }).catch(() => {});
            if (isCallRequest) {
              base44.asServiceRole.functions.invoke('createCallTask', {
                leadId, reason: (messageText || '').slice(0, 80), priority: 'HIGH'
              }).catch(() => {});
            }
            base44.asServiceRole.functions.invoke('analyzeConversationThread', { leadId }).catch(() => {});

            // ── ROUTING AUTHORITY ──────────────────────────────────────────
            // ISSUE-010: aiBrainActive already resolved early (aiBrainActiveEarly) for payload build.
            // Reuse to avoid a redundant DB list call at routing stage.
            const allBrains = allBrainsEarly;
            const aiBrainActive = aiBrainActiveEarly;

            const VALID_OWNERS = ['AI', 'FLOW', 'SCRIPT', 'MANUAL'];
            let ownerOverrideApplied = false;

            try {
              const ownerField = lead.activeResponderOwner;
              const isValidOwner = typeof ownerField === 'string' && VALID_OWNERS.includes(ownerField);

              if (isValidOwner) {
                log('downstream', 'INFO', `OWNER_OVERRIDE: activeResponderOwner=${ownerField}`, { leadId });
                await logDiag(base44, coachEmail, 'OWNER_OVERRIDE_APPLIED', { leadId, owner: ownerField, savedMessageId: savedInbound?.id });
                ownerOverrideApplied = true;

                if (ownerField === 'AI') {
                  routingDecision = 'AI';
                  engineClaimed = true; // entity automation handles it
                  log('downstream', 'INFO', 'OWNER_OVERRIDE: AI — aiConversationAgent handles reply');
                  await logDiag(base44, coachEmail, 'SINGLE_REPLY_AUTHORITY_AI', { leadId, savedMessageId: savedInbound?.id, reason: 'owner_override=AI' });

                } else if (ownerField === 'FLOW') {
                  routingDecision = 'FLOW';
                  log('downstream', 'INFO', 'OWNER_OVERRIDE: FLOW — salesFlowRunner handles reply', { leadId, sessionId: activeSession?.sessionId || null });

                  // ── HARD ASSERT: if session was found, verify sessionId was persisted on inbound ──
                  if (activeSession && savedInbound?.id) {
                    // Re-read the saved record to confirm sessionId was written
                    const savedCheck = await base44.asServiceRole.entities.LeadMessageThread.filter({
                      id: savedInbound.id
                    }).catch(() => []);
                    const persistedSid = savedCheck[0]?.sessionId || null;

                    if (!persistedSid) {
                      // sessionId was NOT persisted — patch it now before continuing
                      log('downstream', 'WARN', 'FLOW_INBOUND_SESSION_ASSERT_FAILED: sessionId missing on saved inbound — patching now', {
                        leadId, inboundId: savedInbound.id, expectedSessionId: activeSession.sessionId
                      });
                      await logDiag(base44, coachEmail, 'FLOW_INBOUND_SESSION_ASSERT_FAILED', {
                        leadId,
                        inboundId: savedInbound.id,
                        expectedSessionId: activeSession.sessionId,
                        persistedSessionId: null,
                        action: 'patching_now'
                      });
                      await base44.asServiceRole.entities.LeadMessageThread.update(savedInbound.id, {
                        sessionId: activeSession.sessionId
                      }).catch(() => {});
                    } else {
                      log('downstream', 'INFO', 'FLOW_INBOUND_SESSION_ASSERT_OK: sessionId confirmed on saved inbound', {
                        leadId, inboundId: savedInbound.id, sessionId: persistedSid
                      });
                      await logDiag(base44, coachEmail, 'FLOW_INBOUND_SESSION_ASSERT_OK', {
                        leadId,
                        inboundId: savedInbound.id,
                        sessionId: persistedSid
                      });
                    }
                  }

                  // ── AI-block already stamped at create time (inboundCreatePayload) ──
                  // aiProcessed=true, replyProducer=salesFlowRunner, replyStatus=pending
                  // and sessionId were all written atomically at LeadMessageThread.create.
                  // No post-create update needed here.

                  // ── No active session → explicit skip, not silent drop ──────────
                  if (!activeSession) {
                    log('downstream', 'WARN', 'FLOW owner but no active session — skipping with reason', { leadId });
                    if (savedInbound?.id) {
                      await base44.asServiceRole.entities.LeadMessageThread.update(savedInbound.id, {
                        replyStatus: 'skipped',
                        skipReason: 'FLOW_OWNER_BUT_NO_ACTIVE_SESSION'
                      }).catch(() => {});
                    }
                    await logDiag(base44, coachEmail, 'RULE_TRIGGERED', {
                      rule: 'FLOW_OWNER_BUT_NO_ACTIVE_SESSION',
                      leadId, inbound_id: savedInbound?.id,
                      owner: ownerField,
                      foundSession: false,
                      attachedToSession: false,
                      sessionId: null,
                      AI_bypassed: true,
                      routedToFlow: false,
                      claimCreated: false,
                      claimId: null,
                      queueCreated: false,
                      queueId: null,
                      replyStatus: 'skipped',
                      skipReason: 'FLOW_OWNER_BUT_NO_ACTIVE_SESSION',
                      finalVerdict: 'FLOW_NO_ACTIVE_SESSION'
                    });
                    engineClaimed = true; // prevent fallthrough to generic NO_ENGINE_CLAIMED guard
                  } else {
                    // ── Active session exists — route to salesFlowRunner ──────────
                    await logDiag(base44, coachEmail, 'SINGLE_REPLY_AUTHORITY_SALES_FLOW', {
                      leadId, reason: 'owner_override=FLOW',
                      sessionId: activeSession.sessionId,
                      AI_bypassed: true
                    });

                    await logDiag(base44, coachEmail, 'FLOW_INBOUND_ROUTING_START', {
                      leadId,
                      inboundId: savedInbound?.id,
                      sessionId: activeSession.sessionId,
                      currentStepOrder: activeSession.currentStepOrder
                    });

                    let routingError = null;
                    // ── FREE-TEXT POLICY: questions during active Flow → AI only ────────
                    if (isFreeTextQuestion(messageText) && aiBrainActive) {
                      log('downstream', 'INFO', 'FREETEXT_ROUTED_TO_AI (owner=FLOW): question detected — handing to AI', { leadId });
                      if (savedInbound?.id) {
                        await base44.asServiceRole.entities.LeadMessageThread.update(savedInbound.id, {
                          aiProcessed: false,
                          replyProducer: null,
                          replyGenerationStartedAt: null,
                          replyStatus: 'pending'
                        }).catch(() => {});
                      }
                      await base44.asServiceRole.functions.invoke('aiConversationAgent', {
                        leadId, inboundMessageId: savedInbound?.id
                      }).catch(err => { log('downstream', 'WARN', `freetext AI fallback (owner override): ${err.message}`); });
                      await logDiag(base44, coachEmail, 'FREETEXT_ROUTED_TO_AI', {
                        leadId, reason: 'freetext_question_owner_override_flow',
                        messagePreview: (messageText || '').slice(0, 60)
                      });
                      routingDecision = 'AI';
                    } else {
                      try {
                        await base44.asServiceRole.functions.invoke('salesFlowRunner', {
                          leadId,
                          continueFromReply: true,
                          inboundMessageId: savedInbound?.id,
                          sessionId: activeSession.sessionId
                        });
                      } catch (err) {
                        routingError = err.message;
                        log('downstream', 'ERROR', `OWNER_OVERRIDE salesFlowRunner failed: ${err.message}`);
                        await logDiag(base44, coachEmail, 'FLOW_INBOUND_ROUTING_ERROR', {
                          leadId,
                          inboundId: savedInbound?.id,
                          sessionId: activeSession.sessionId,
                          error: err.message
                        });
                      }
                    }

                    if (!routingError) {
                      await logDiag(base44, coachEmail, 'FLOW_INBOUND_ROUTING_END', {
                        leadId,
                        inboundId: savedInbound?.id,
                        sessionId: activeSession.sessionId,
                        status: 'salesFlowRunner_invoked'
                      });
                    }

                    // ── Post-run claim verification ───────────────────────────────
                    // salesFlowRunner is synchronous — by the time we get here it has
                    // either created a claim or not. Verify and guard against silent drop.
                    let claimRecord = null;
                    let queueRecord = null;
                    if (savedInbound?.id) {
                      const claims = await base44.asServiceRole.entities.OutboundReplyClaim.filter({
                        inboundMessageId: savedInbound.id
                      }).catch(() => []);
                      claimRecord = claims[0] || null;

                      if (claimRecord?.queueId) {
                        const queues = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({
                          id: claimRecord.queueId
                        }).catch(() => []);
                        queueRecord = queues[0] || null;
                      }
                    }

                    const claimCreatedOk = !!claimRecord;
                    const queueCreatedOk = !!queueRecord;

                    if (!claimCreatedOk) {
                      // salesFlowRunner ran but produced no claim — explicit skip guard
                      log('downstream', 'WARN', 'FLOW_NO_ENGINE_CLAIMED: salesFlowRunner ran but created no claim', {
                        leadId, savedMessageId: savedInbound?.id
                      });
                      if (savedInbound?.id) {
                        await base44.asServiceRole.entities.LeadMessageThread.update(savedInbound.id, {
                          replyStatus: 'skipped',
                          skipReason: 'FLOW_NO_ENGINE_CLAIMED'
                        }).catch(() => {});
                      }
                      await logDiag(base44, coachEmail, 'RULE_TRIGGERED', {
                        rule: 'FLOW_NO_ENGINE_CLAIMED',
                        inbound_id: savedInbound?.id,
                        lead_id: leadId,
                        owner: ownerField,
                        foundSession: true,
                        attachedToSession: !!activeSession?.sessionId,
                        sessionId: activeSession?.sessionId,
                        AI_bypassed: true,
                        routedToFlow: true,
                        claimCreated: false,
                        claimId: null,
                        queueCreated: false,
                        queueId: null,
                        replyStatus: 'skipped',
                        skipReason: 'FLOW_NO_ENGINE_CLAIMED',
                        finalVerdict: 'FLOW_NO_ENGINE_CLAIMED'
                      });
                    } else {
                      // Claim exists — log success
                      await logDiag(base44, coachEmail, 'RULE_TRIGGERED', {
                        rule: 'FLOW_HANDLED',
                        inbound_id: savedInbound?.id,
                        lead_id: leadId,
                        owner: ownerField,
                        foundSession: true,
                        attachedToSession: !!activeSession?.sessionId,
                        sessionId: activeSession?.sessionId,
                        AI_bypassed: true,
                        routedToFlow: true,
                        claimCreated: true,
                        claimId: claimRecord?.id,
                        queueCreated: queueCreatedOk,
                        queueId: queueRecord?.id || claimRecord?.queueId,
                        replyStatus: queueRecord?.status || 'unknown',
                        skipReason: null,
                        finalVerdict: 'FLOW_HANDLED'
                      });
                    }

                    engineClaimed = true;
                  }

                } else if (ownerField === 'SCRIPT') {
                  routingDecision = 'SCRIPT';

                  // ── Block AI entity automation from racing ──────────────────
                  if (savedInbound?.id) {
                    await base44.asServiceRole.entities.LeadMessageThread.update(savedInbound.id, {
                      aiProcessed: true,
                      replyGenerationStartedAt: new Date().toISOString(),
                      replyProducer: 'salesFlowRunner', // closest existing enum — script uses same pipeline
                      replyStatus: 'pending'
                    }).catch(() => {});
                  }

                  // ── No active script session → explicit skip ──────────────
                  const freshLead = (await base44.asServiceRole.entities.Lead.filter({ id: leadId }).catch(() => []))[0];
                  if (!freshLead?.activeScriptId || !freshLead?.scriptSessionId) {
                    log('downstream', 'WARN', 'SCRIPT owner but no active script session — skipping', { leadId });
                    if (savedInbound?.id) {
                      await base44.asServiceRole.entities.LeadMessageThread.update(savedInbound.id, {
                        replyStatus: 'skipped',
                        skipReason: 'SCRIPT_OWNER_BUT_NO_ACTIVE_SESSION'
                      }).catch(() => {});
                    }
                    await logDiag(base44, coachEmail, 'RULE_TRIGGERED', {
                      rule: 'SCRIPT_OWNER_BUT_NO_ACTIVE_SESSION', leadId,
                      inbound_id: savedInbound?.id, finalVerdict: 'SCRIPT_NO_ACTIVE_SESSION'
                    });
                  } else {
                    // ── Route to interpretLeadReplyWithScript ─────────────────
                    log('downstream', 'INFO', 'OWNER_OVERRIDE: SCRIPT — interpretLeadReplyWithScript handles reply', { leadId, scriptSessionId: freshLead.scriptSessionId });
                    await logDiag(base44, coachEmail, 'SINGLE_REPLY_AUTHORITY_SCRIPT', {
                      leadId, savedMessageId: savedInbound?.id,
                      scriptSessionId: freshLead.scriptSessionId,
                      activeScriptId: freshLead.activeScriptId,
                      reason: 'owner_override=SCRIPT'
                    });

                    try {
                      await base44.asServiceRole.functions.invoke('interpretLeadReplyWithScript', {
                        leadId,
                        inboundMessageId: savedInbound?.id,
                        messageText,
                        scriptSessionId: freshLead.scriptSessionId
                      });
                    } catch (scriptErr) {
                      log('downstream', 'ERROR', `interpretLeadReplyWithScript failed: ${scriptErr.message}`, { leadId });
                      await logDiag(base44, coachEmail, 'SCRIPT_ROUTING_ERROR', {
                        leadId, error: scriptErr.message, inbound_id: savedInbound?.id
                      });
                      if (savedInbound?.id) {
                        await base44.asServiceRole.entities.LeadMessageThread.update(savedInbound.id, {
                          replyStatus: 'skipped',
                          skipReason: 'SCRIPT_INVOCATION_FAILED'
                        }).catch(() => {});
                      }
                    }
                  }

                  engineClaimed = true;

                } else if (ownerField === 'MANUAL') {
                  routingDecision = 'MANUAL';
                  engineClaimed = true; // explicit manual = no auto-responder, intentional
                  log('downstream', 'INFO', 'OWNER_OVERRIDE: MANUAL — no auto-responder, intentional');
                  await logDiag(base44, coachEmail, 'OWNER_OVERRIDE_MANUAL_SKIP', { leadId, reason: 'owner_override=MANUAL' });
                }

              } else if (ownerField !== undefined && ownerField !== null && ownerField !== '') {
                log('downstream', 'WARN', `OWNER_OVERRIDE: invalid value "${ownerField}" — falling through to default routing`, { leadId });
                await logDiag(base44, coachEmail, 'OWNER_OVERRIDE_INVALID_FALLBACK', { leadId, ownerField });
              }
            } catch (overrideErr) {
              log('downstream', 'WARN', `OWNER_OVERRIDE error — falling through: ${overrideErr.message}`, { leadId });
              ownerOverrideApplied = false;
            }

            // ── DEFAULT ROUTING — only if no valid owner override applied ──
            // ─────────────────────────────────────────────────────────────────
            // ROUTING PRIORITY BRAIN (deterministic, no silent AI default):
            //
            // PRIORITY 1 — Active Flow session exists → FLOW owns reply
            //   An active Flow session means Flow was already initialized for this lead.
            //   Flow MUST respond first. AI is blocked until Flow completes/stops.
            //
            // PRIORITY 2 — No active session + AI Brain active → AI owns reply
            //   Only allowed when Flow is not running for this lead.
            //
            // PRIORITY 3 — No session + No AI Brain → salesFlowRunner (legacy)
            //
            // This prevents BUG A: AI overriding when Flow session exists.
            // ─────────────────────────────────────────────────────────────────
            if (!ownerOverrideApplied) {
              const hasActiveFlowSession = !!activeSession && activeSession.flowStatus === 'ACTIVE';

              if (hasActiveFlowSession) {
                // ── PRIORITY 1: Flow session is active — Flow owns this reply ──
                routingDecision = 'FLOW';
                log('downstream', 'INFO', 'ROUTING_BRAIN: Active Flow session detected — Flow owns reply (AI blocked)', {
                  leadId, sessionId: activeSession.sessionId, currentStep: activeSession.currentStepOrder
                });
                await logDiag(base44, coachEmail, 'ROUTING_BRAIN_FLOW_PRIORITY', {
                  leadId, sessionId: activeSession.sessionId,
                  reason: 'active_flow_session_exists — AI blocked',
                  aiBrainActive, savedMessageId: savedInbound?.id
                });

                // AI-block + sessionId already stamped at create time (inboundCreatePayload).
                // No post-create update needed — entity automation cannot race.
                await logDiag(base44, coachEmail, 'SINGLE_REPLY_AUTHORITY_SALES_FLOW', {
                  leadId, reason: 'routing_brain_flow_first — active session',
                  sessionId: activeSession.sessionId
                });

                // ── FREE-TEXT POLICY: questions during active Flow → AI only ────────
                if (isFreeTextQuestion(messageText) && aiBrainActive) {
                  routingDecision = 'AI';
                  log('downstream', 'INFO', 'FREETEXT_ROUTED_TO_AI: question detected during active flow — handing to AI', { leadId });
                  if (savedInbound?.id) {
                    await base44.asServiceRole.entities.LeadMessageThread.update(savedInbound.id, {
                      aiProcessed: false,
                      replyProducer: null,
                      replyGenerationStartedAt: null,
                      replyStatus: 'pending'
                    }).catch(() => {});
                  }
                  await base44.asServiceRole.functions.invoke('aiConversationAgent', {
                    leadId, inboundMessageId: savedInbound?.id
                  }).catch(err => { log('downstream', 'WARN', `freetext AI fallback failed: ${err.message}`); });
                  await logDiag(base44, coachEmail, 'FREETEXT_ROUTED_TO_AI', {
                    leadId, reason: 'freetext_question_during_active_flow',
                    sessionId: activeSession.sessionId,
                    messagePreview: (messageText || '').slice(0, 60)
                  });
                } else {
                  await base44.asServiceRole.functions.invoke('salesFlowRunner', {
                    leadId,
                    continueFromReply: true,
                    inboundMessageId: savedInbound?.id,
                    sessionId: activeSession.sessionId
                  }).catch(err => {
                    log('downstream', 'ERROR', `salesFlowRunner (routing_brain) failed: ${err.message}`);
                  });

                  // Verify claim was created
                  if (savedInbound?.id) {
                    const claims = await base44.asServiceRole.entities.OutboundReplyClaim.filter({
                      inboundMessageId: savedInbound.id
                    }).catch(() => []);
                    if (!claims[0]) {
                      await base44.asServiceRole.entities.LeadMessageThread.update(savedInbound.id, {
                        replyStatus: 'skipped',
                        skipReason: 'FLOW_NO_ENGINE_CLAIMED_ROUTING_BRAIN'
                      }).catch(() => {});
                      await logDiag(base44, coachEmail, 'RULE_TRIGGERED', {
                        rule: 'FLOW_NO_ENGINE_CLAIMED_ROUTING_BRAIN',
                        leadId, inbound_id: savedInbound?.id,
                        finalVerdict: 'FLOW_NO_ENGINE_CLAIMED'
                      });
                    } else {
                      await logDiag(base44, coachEmail, 'RULE_TRIGGERED', {
                        rule: 'FLOW_HANDLED_ROUTING_BRAIN',
                        leadId, inbound_id: savedInbound?.id,
                        claimId: claims[0].id,
                        finalVerdict: 'FLOW_HANDLED'
                      });
                    }
                  }
                }

                engineClaimed = true;

              } else if (aiBrainActive) {
                // ── PRIORITY 2: No active Flow session + AI Brain active → AI owns reply ──
                routingDecision = 'AI';
                engineClaimed = true; // entity automation handles it
                log('downstream', 'INFO', 'ROUTING_BRAIN: No active Flow session — AI Brain owns reply', { leadId });
                await logDiag(base44, coachEmail, 'ROUTING_BRAIN_AI_PRIORITY', {
                  leadId, savedMessageId: savedInbound?.id,
                  reason: 'no_active_flow_session — AI Brain allowed',
                  hasActiveFlowSession: false
                });
                await logDiag(base44, coachEmail, 'SINGLE_REPLY_AUTHORITY_AI', {
                  leadId, savedMessageId: savedInbound?.id,
                  reason: 'routing_brain: no_active_flow_session, ai_brain_active'
                });
              } else {
                // ── PRIORITY 3: No session + No AI Brain → salesFlowRunner (legacy fallback) ──
                routingDecision = 'FLOW';
                log('downstream', 'INFO', 'ROUTING_BRAIN: No AI Brain, no active session — salesFlowRunner legacy fallback', { leadId });
                await logDiag(base44, coachEmail, 'ROUTING_BRAIN_FLOW_LEGACY', {
                  leadId, reason: 'no_ai_brain_no_active_session — legacy salesFlowRunner',
                  sessionId: activeSession?.sessionId || null
                });
                if (savedInbound?.id) {
                  await base44.asServiceRole.entities.LeadMessageThread.update(savedInbound.id, {
                    replyGenerationStartedAt: new Date().toISOString(),
                    replyProducer: 'salesFlowRunner',
                    replyStatus: 'pending'
                  }).catch(() => {});
                }
                await base44.asServiceRole.functions.invoke('salesFlowRunner', {
                  leadId,
                  continueFromReply: true,
                  inboundMessageId: savedInbound?.id,
                  sessionId: activeSession?.sessionId || null
                }).catch(err => {
                  log('downstream', 'ERROR', `salesFlowRunner legacy failed: ${err.message}`);
                });
                engineClaimed = true;
              }
            }

            // ── FS-07 GUARD: No engine claimed — explicitly mark as skipped ─
            if (!engineClaimed && savedInbound?.id) {
              log('downstream', 'WARN', 'NO_ENGINE_CLAIMED: marking inbound as skipped', {
                leadId, savedMessageId: savedInbound.id, routingDecision
              });
              await base44.asServiceRole.entities.LeadMessageThread.update(savedInbound.id, {
                replyStatus: 'skipped',
                skipReason: 'NO_ENGINE_CLAIMED',
                aiProcessed: true
              }).catch(() => {});
              await logDiag(base44, coachEmail, 'RULE_TRIGGERED', {
                rule: 'FS-07_NO_ENGINE_CLAIMED',
                leadId, savedMessageId: savedInbound?.id, routingDecision
              });
            }

          } else {
            // Opt-out: mark inbound as explicitly handled (not a silent drop)
            routingDecision = 'OPT_OUT';
            engineClaimed = true;
            if (savedInbound?.id) {
              await base44.asServiceRole.entities.LeadMessageThread.update(savedInbound.id, {
                replyStatus: 'skipped',
                skipReason: 'OPT_OUT',
                aiProcessed: true
              }).catch(() => {});
            }
            log('downstream', 'INFO', 'Opt-out detected - downstream skipped, inbound marked');
          }

          // ── Debug output per inbound ────────────────────────────────────
          log('routing_summary', 'INFO', 'Inbound routing complete', {
            leadId,
            foundSession: !!activeSession,
            attachedToSession: !!activeSession?.sessionId,
            sessionId: activeSession?.sessionId || null,
            routingDecision,
            claimCreated: engineClaimed,
            savedMessageId: savedInbound?.id
          });

          // ── Success ─────────────────────────────────────────────────────
          result.ok = true;
          result.stage = 'complete';
          result.message = 'Message processed successfully';
          result.data = {
            leadId,
            messageId: savedInbound?.id,
            status: newStatus,
            foundSession: !!activeSession,
            sessionId: activeSession?.sessionId || null,
            routingDecision,
            claimCreated: engineClaimed,
            processingTime: Date.now() - startTime
          };
          log('complete', 'INFO', result.message, result.data);

        } finally {
          releaseLock(leadId);
          log('concurrency_cleanup', 'INFO', 'Lock released', { leadId });
        }

        return result;
      })(),
      timeoutPromise
    ]);
  } catch (err) {
    const isTimeout = err.message.includes('timeout') || err.message.includes('Timeout');
    result.stage = result.stage || (isTimeout ? 'timeout' : 'error');
    result.error = err.message;
    result.retryable = true;
    log(result.stage, 'ERROR', result.error, {
      leadId, phone: phoneNormalized,
      elapsed: Date.now() - startTime,
      stack: err.stack
    });
    if (leadId) releaseLock(leadId);
    return result;
  }
}

// ─── Main handler — returns 200 IMMEDIATELY ─────────────────────────────────
Deno.serve(async (req) => {
  const method = req.method;
  const url = req.url;

  console.log(`[WEBHOOK_RECEIVED] ${method} ${url} at ${new Date().toISOString()}`);
  log('handler', 'INFO', 'Request received', { method, url: url.slice(0, 100) });

  if (method === 'GET') {
    log('handler', 'INFO', 'GET verification - returning 200');
    return new Response('OK', { status: 200 });
  }

  if (method !== 'POST') {
    log('handler', 'WARN', 'Method not allowed', { method });
    return new Response('Method Not Allowed', { status: 405 });
  }

  let rawBody = '';
  try {
    rawBody = await req.text();
    log('handler', 'INFO', 'Body read', { length: rawBody.length });
  } catch (e) {
    log('handler', 'ERROR', `Failed to read body: ${e.message}`);
    return new Response('OK', { status: 200 });
  }

  const reqClone = new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: rawBody
  });

  const bgPromise = processInbound(rawBody, reqClone).catch(err => {
    log('background', 'ERROR', `Background processing failed: ${err.message}`, { stack: err.stack });
    console.error('[processInbound.catch]', err);
  }).then(result => {
    console.log('[processInbound.result]', JSON.stringify(result).slice(0, 300));
  });

  log('handler', 'INFO', 'Returning HTTP 200 immediately');
  return new Response('OK', { status: 200 });
});