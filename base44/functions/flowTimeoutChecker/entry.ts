import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * flowTimeoutChecker — PERFORMANCE PATCHED (v2)
 * ──────────────────────────────────────────────────────────────────────────
 * NO FLOW TIMEOUT LOGIC WAS CHANGED — ONLY PERFORMANCE FIX APPLIED.
 */

// Kill switch is now read from SystemConfig entity
async function isOutboundEnabled(base44) {
  try {
    const configs = await base44.asServiceRole.entities.SystemConfig.filter({ key: 'GLOBAL_WHATSAPP_ENABLED' });
    const record = configs && configs[0];
    return record ? record.value === true : false;
  } catch (_) { return false; }
}

const BATCH_LIMIT = 25;
const TIME_GUARD_MS = 7500;

function isValidE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone || '');
}

function renderMessage(text, lead) {
  return (text || '')
    .replace(/\{\{name\}\}/g, lead.firstName || 'שלום')
    .replace(/\{\{firstName\}\}/g, lead.firstName || 'שלום')
    .replace(/\{\{phone\}\}/g, lead.phoneE164 || lead.phone || '')
    .replace(/\{\{studioName\}\}/g, 'Shape Studio')
    .replace(/\{\{bookingLink\}\}/g, '')
    .replace(/\{\{scheduleLink\}\}/g, '');
}

function transformWaOnlyMessage(text) {
  if (!text) return text;
  const replacements = [
    [/תתקשרי אלינו/g, 'תכתבי לי פה'],
    [/תתקשרי אליי/g,  'תכתבי לי פה'],
    [/תתקשר אלינו/g,  'תכתוב לי פה'],
    [/תתקשר אליי/g,   'תכתוב לי פה'],
    [/2[-–]?3?\s*דקות\s*שיחה/g, 'כמה הודעות כאן'],
    [/שיחה\s*קצרה/g,            'כמה הודעות'],
    [/לדבר\s*בטלפון/g,          'להתקדם בוואטסאפ'],
    [/אפשר\s*לדבר[?]?/g,       'אפשר להתקדם פה'],
    [/נדבר\s*\d?\s*דקות/g,     'נתכתב בכמה הודעות'],
    [/נתקשר/g,                  'נתכתב'],
    [/תתקשר/g,                  'תכתוב לי'],
    [/נדבר(?![ויאה])/g,         'נתכתב'],
    [/בשיחה/g,                  'בוואטסאפ'],
    [/שיחה/g,                   'שיחה בוואטסאפ'],
    [/אחזור אליך/g,             'אכתוב לך פה'],
    [/אחזרי אליך/g,             'אכתבי לך פה'],
  ];
  let result = text;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

async function diagLog(base44, coachEmail, event, payload) {
  await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
    coach_email: coachEmail || 'system',
    event: 'RULE_TRIGGERED',
    payload: { flowEvent: event, ...payload }
  }).catch(() => {});
}

Deno.serve(async (req) => {
  // Read kill switch from DB
  const _base44ks = createClientFromRequest(req);
  const GLOBAL_OUTBOUND_WHATSAPP_ENABLED = await isOutboundEnabled(_base44ks);

  // KILL SWITCH — first check, before any send/queue operations
  if (!GLOBAL_OUTBOUND_WHATSAPP_ENABLED) {
    console.log('[KILL_SWITCH] flowTimeoutChecker BLOCKED — GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE');
    return Response.json({
      ok: false, blocked: true,
      reason: 'GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE',
      message: 'flowTimeoutChecker is disabled by global kill switch. No messages queued.',
      sessionsProcessed: 0, sessionsSkipped: 0, elapsed_ms: 0
    }, { status: 200 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const runStart = Date.now();

    let isAuthorized = false;
    let authUser = null;
    try {
      authUser = await base44.auth.me();
    } catch (_) {
      isAuthorized = true;
    }
    if (!isAuthorized) {
      if (authUser?.role === 'admin') {
        isAuthorized = true;
      } else if (authUser) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      } else {
        isAuthorized = true;
      }
    }

    const now = new Date();
    const processed = [];
    const skipped = [];
    const errors = [];
    let timeGuardTriggered = false;

    const candidateSessions = await base44.asServiceRole.entities.LeadConversationState
      .filter({ isActive: true, flowStatus: 'ACTIVE', waitingForReply: true }, '-nextTimeoutAt', 200)
      .catch(() => []);

    const timedOutStates = candidateSessions
      .filter(s => {
        const leadId = String(s?.leadId || '');
        const stateId = String(s?.id || '');
        return leadId && !leadId.startsWith('__') && !stateId.startsWith('__') && s.nextTimeoutAt && new Date(s.nextTimeoutAt) <= now;
      })
      .slice(0, BATCH_LIMIT);

    if (timedOutStates.length === 0) {
      const elapsed = Date.now() - runStart;
      return Response.json({
        ok: true,
        sessionsFetched: candidateSessions.length,
        sessionsTimedOut: 0,
        sessionsProcessed: 0,
        sessionsSkipped: 0,
        elapsed_ms: elapsed,
        timeGuardTriggered: false,
        processed: [], skipped: [], errors: [],
      });
    }

    const uniqueLeadIds = [...new Set(timedOutStates.map(s => s.leadId))]
      .filter(id => id && !String(id).startsWith('__'));
    const leadsMap = {};
    await Promise.all(uniqueLeadIds.map(async (lid) => {
      if (!lid || String(lid).startsWith('__')) return;
      const arr = await base44.asServiceRole.entities.Lead.filter({ id: lid }).catch(() => []);
      if (arr[0]) leadsMap[lid] = arr[0];
    }));

    const uniqueCoachEmails = [...new Set(
      timedOutStates.map(s => leadsMap[s.leadId]?.coach_email).filter(Boolean)
    )];
    const providerConfigMap = {};
    await Promise.all(uniqueCoachEmails.map(async (email) => {
      const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig
        .filter({ coach_email: email }).catch(() => []);
      providerConfigMap[email] = configs[0]?.provider_type || 'mock';
    }));

    const aiBrainActiveMap = {};
    await Promise.all(uniqueCoachEmails.map(async (email) => {
      const brains = await base44.asServiceRole.entities.AIBrainConfig
        .filter({ coach_email: email }).catch(() => []);
      aiBrainActiveMap[email] = brains.some(b => b.isActive);
    }));

    for (const state of timedOutStates) {
      if (Date.now() - runStart > TIME_GUARD_MS) {
        timeGuardTriggered = true;
        skipped.push({ leadId: state.leadId, reason: 'time_guard_triggered', sessionId: state.sessionId });
        break;
      }

      const sessionId = state.sessionId || 'unknown';
      const leadId = state.leadId;

      try {
        const lead = leadsMap[leadId];
        if (!lead) { skipped.push({ leadId, reason: 'lead_not_found', sessionId }); continue; }

        const coachEmail = lead.coach_email || 'system';

        const owner = lead.activeResponderOwner || null;
        if (owner && owner !== 'FLOW') {
          await diagLog(base44, coachEmail, 'FLOW_TIMEOUT_SKIPPED', { leadId, sessionId, reason: `owner_is_${owner}_not_FLOW` });
          skipped.push({ leadId, reason: `owner_is_${owner}`, sessionId });
          continue;
        }

        if (!owner && aiBrainActiveMap[coachEmail]) {
          skipped.push({ leadId, reason: 'ai_brain_active_no_owner_set', sessionId });
          continue;
        }

        if (lead.waOptOut) { skipped.push({ leadId, reason: 'opted_out', sessionId }); continue; }
        if (!isValidE164(lead.phoneE164)) { skipped.push({ leadId, reason: 'invalid_phone', sessionId }); continue; }

        const freshStates = await base44.asServiceRole.entities.LeadConversationState.filter({ leadId }).catch(() => []);
        const freshState = freshStates.find(s => s.id === state.id);

        if (!freshState || !freshState.id || !freshState.isActive || freshState.flowStatus !== 'ACTIVE' || !freshState.waitingForReply) {
          skipped.push({ leadId, reason: 'state_changed_since_fetch', sessionId });
          continue;
        }

        if (!freshState.nextTimeoutAt) {
          await diagLog(base44, coachEmail, 'CONSISTENCY_VIOLATION', {
            violation_type: 'FS-03_TIMEOUT_NOT_ARMED', severity: 'HIGH', leadId, sessionId
          });
          skipped.push({ leadId, reason: 'TIMEOUT_NOT_ARMED_enforcement_blocked', sessionId });
          continue;
        }

        if (new Date(freshState.nextTimeoutAt) > now) {
          skipped.push({ leadId, reason: 'timeout_not_yet_due_on_recheck', sessionId });
          continue;
        }

        const allSteps = await base44.asServiceRole.entities.SalesConversationStep
          .filter({ flowId: state.flowId }).catch(() => []);
        const currentStep = allSteps.find(s => Number(s.stepOrder) === Number(freshState.currentStepOrder));

        if (!currentStep) { skipped.push({ leadId, reason: 'current_step_not_found', sessionId }); continue; }

        if (!currentStep.replyTimeoutMinutes || !currentStep.onTimeoutAction) {
          await diagLog(base44, coachEmail, 'CONSISTENCY_VIOLATION', {
            violation_type: 'FS-01_FS-02_TIMEOUT_CONFIG_MISSING_ON_STEP', severity: 'HIGH', leadId, sessionId
          });
          skipped.push({ leadId, reason: 'TIMEOUT_CONFIG_MISSING_enforcement_blocked', sessionId });
          continue;
        }

        const ownerAtExec = lead.activeResponderOwner || null;
        if (ownerAtExec && ownerAtExec !== 'FLOW') {
          await diagLog(base44, coachEmail, 'CONSISTENCY_VIOLATION', {
            violation_type: 'FS-15_TIMEOUT_BLOCKED_BY_OWNER', severity: 'MEDIUM', leadId, sessionId
          });
          skipped.push({ leadId, reason: `TIMEOUT_BLOCKED_BY_OWNER_${ownerAtExec}`, sessionId });
          continue;
        }

        const onTimeoutAction = currentStep.onTimeoutAction || 'SEND_FOLLOWUP';
        const maxFollowups = currentStep.maxFollowups ?? 1;
        const followupsSent = freshState.followupsSentInStep || 0;
        const timeoutMessage = currentStep.timeoutMessage || currentStep.messageText || '';
        const replyTimeoutMinutes = currentStep.replyTimeoutMinutes || 60;

        await diagLog(base44, coachEmail, 'FLOW_TIMEOUT_TRIGGERED', {
          leadId, sessionId, stepOrder: freshState.currentStepOrder, onTimeoutAction, followupsSent, maxFollowups
        });

        if (onTimeoutAction === 'STOP') {
          if (freshState.id && !freshState.id.startsWith('__')) {
            await base44.asServiceRole.entities.LeadConversationState.update(freshState.id, {
              waitingForReply: false, nextTimeoutAt: null, flowStatus: 'COMPLETED', isActive: false,
            }).catch(() => {});
          }
          await diagLog(base44, coachEmail, 'FLOW_TIMEOUT_STOP', { leadId, sessionId, stepOrder: freshState.currentStepOrder });
          processed.push({ leadId, sessionId, action: 'STOP', step: freshState.currentStepOrder });
          continue;
        }

        if (onTimeoutAction === 'ADVANCE_STEP') {
          const res = await base44.asServiceRole.functions.invoke('salesFlowRunner', {
            leadId, action: 'force_advance',
          }).catch(e => ({ data: { ok: false, error: e.message } }));

          const d = res?.data;
          await diagLog(base44, coachEmail, 'FLOW_TIMEOUT_ADVANCE', { leadId, sessionId, result: d });

          if (d?.ok || d?.done) {
            if (freshState.id && !freshState.id.startsWith('__')) {
              await base44.asServiceRole.entities.LeadConversationState.update(freshState.id, {
                waitingForReply: false, nextTimeoutAt: null, followupsSentInStep: 0,
              }).catch(() => {});
            }
            processed.push({ leadId, sessionId, action: 'ADVANCE_STEP', step: freshState.currentStepOrder });
          } else {
            errors.push({ leadId, sessionId, action: 'ADVANCE_STEP', error: d?.error });
          }
          continue;
        }

        // SEND_FOLLOWUP
        if (followupsSent >= maxFollowups) {
          if (freshState.id && !freshState.id.startsWith('__')) {
            await base44.asServiceRole.entities.LeadConversationState.update(freshState.id, {
              waitingForReply: false, nextTimeoutAt: null, flowStatus: 'COMPLETED', isActive: false,
            }).catch(() => {});
          }
          await diagLog(base44, coachEmail, 'FLOW_TIMEOUT_FOLLOWUP_EXHAUSTED', { leadId, sessionId, followupsSent, maxFollowups });
          skipped.push({ leadId, reason: `followup_exhausted_${followupsSent}/${maxFollowups}`, sessionId });
          continue;
        }

        const providerType = providerConfigMap[coachEmail] || 'mock';
        const toName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
        const rawRenderedText = renderMessage(timeoutMessage, lead);
        const renderedText = lead.waOnly ? transformWaOnlyMessage(rawRenderedText) : rawRenderedText;
        const followupN = followupsSent + 1;
        const templateKey = `flow_step_${freshState.currentStepOrder}_followup_${followupN}`;

        const existingQ = await base44.asServiceRole.entities.WhatsAppMessageQueue
          .filter({ context_id: leadId, template_key: templateKey }).catch(() => []);
        if (existingQ.some(q => ['queued', 'sending', 'sent'].includes(q.status))) {
          skipped.push({ leadId, reason: `followup_already_queued_${templateKey}`, sessionId });
          continue;
        }

        await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
          coach_email: coachEmail,
          to_phone_e164: lead.phoneE164,
          to_name: toName || '',
          context_type: 'lead',
          context_id: leadId,
          template_key: templateKey,
          rendered_text: renderedText,
          provider_type: providerType,
          status: 'queued',
          attempts: 0,
          scheduled_for: new Date().toISOString(),
          session_id: sessionId,
        }).catch(() => {});

        await base44.asServiceRole.entities.LeadMessageThread.create({
          leadId, coach_email: coachEmail, channel: 'WHATSAPP', direction: 'OUTBOUND',
          senderType: 'SYSTEM', messageText: renderedText, messageTimestamp: new Date().toISOString(),
          replyStatus: 'queued', replyProducer: 'salesFlowRunner',
        }).catch(() => {});

        const nextTimeoutMs = Date.now() + (replyTimeoutMinutes * 60 * 1000);
        if (freshState.id && !freshState.id.startsWith('__')) {
          await base44.asServiceRole.entities.LeadConversationState.update(freshState.id, {
            followupsSentInStep: followupN,
            nextTimeoutAt: new Date(nextTimeoutMs).toISOString(),
            lastFlowActionAt: new Date().toISOString(),
          }).catch(() => {});
        }

        await diagLog(base44, coachEmail, 'FLOW_TIMEOUT_FOLLOWUP_SENT', {
          leadId, sessionId, stepOrder: freshState.currentStepOrder, followupN, maxFollowups, templateKey
        });

        await base44.asServiceRole.functions.invoke('whatsAppQueueWorker', {}).catch(() => {});

        processed.push({ leadId, sessionId, action: 'SEND_FOLLOWUP', followupN, step: freshState.currentStepOrder });

      } catch (innerError) {
        errors.push({ leadId, sessionId, error: innerError.message });
        try {
          const ce = state.coach_email || 'system';
          await diagLog(base44, ce, 'FLOW_TIMEOUT_ERROR', { leadId, sessionId, error: innerError.message });
        } catch (_) {}
      }
    }

    const elapsed_ms = Date.now() - runStart;

    await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
      coach_email: 'system',
      event: 'RULE_TRIGGERED',
      payload: {
        flowEvent: 'FLOW_TIMEOUT_CHECKER_RUN_SUMMARY',
        sessionsFetched: timedOutStates.length,
        sessionsProcessed: processed.length,
        sessionsSkipped: skipped.length,
        sessionsErrored: errors.length,
        elapsed_ms, timeGuardTriggered, batchLimit: BATCH_LIMIT,
      }
    }).catch(() => {});

    return Response.json({
      ok: true,
      sessionsFetched: timedOutStates.length,
      sessionsProcessed: processed.length,
      sessionsSkipped: skipped.length,
      elapsed_ms, timeGuardTriggered, processed, skipped, errors,
    });

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});