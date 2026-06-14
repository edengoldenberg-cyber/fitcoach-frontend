import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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

function generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * WA-Only message transformation.
 * Applied ONLY when lead.waOnly === true, AFTER renderMessage().
 * Replaces phone-call CTAs with WhatsApp-friendly equivalents.
 * Does NOT change message meaning or break {{variables}}.
 */
function transformWaOnlyMessage(text) {
  if (!text) return text;

  const replacements = [
    // PHRASE-LEVEL — תתקשר/י + direction word (before single-word fallback to avoid dangling אלינו/אליי)
    [/תתקשרי אלינו/g, 'תכתבי לי פה'],
    [/תתקשרי אליי/g,  'תכתבי לי פה'],
    [/תתקשר אלינו/g,  'תכתוב לי פה'],
    [/תתקשר אליי/g,   'תכתוב לי פה'],
    // MULTI-WORD patterns — most specific first
    [/2[-–]?3?\s*דקות\s*שיחה/g, 'כמה הודעות כאן'],
    [/שיחה\s*קצרה/g,            'כמה הודעות'],
    [/לדבר\s*בטלפון/g,      'להתקדם בוואטסאפ'],
    [/אפשר\s*לדבר[?]?/g,         'אפשר להתקדם פה'],
    [/נדבר\s*\d?\s*דקות/g,         'נתכתב בכמה הודעות'],
    // SINGLE-WORD fallbacks
    [/נתקשר/g,                              'נתכתב'],
    [/תתקשר/g,                              'תכתוב לי'],
    [/נדבר(?![ויאה])/g,               'נתכתב'],
    [/בשיחה/g,                              'בוואטסאפ'],
    [/שיחה/g,                                'שיחה בוואטסאפ'],
  ];

  let result = text;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

async function log(base44, coachEmail, event, payload) {
  await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
    coach_email: coachEmail || 'system',
    event: 'RULE_TRIGGERED',
    payload: { flowEvent: event, ...payload }
  }).catch(() => {});
}

/**
 * Deactivate all active states for a lead. Returns list of deactivated IDs.
 */
async function deactivateAllStates(base44, leadId, coachEmail) {
  const all = await base44.asServiceRole.entities.LeadConversationState.filter({ leadId }).catch(() => []);
  const active = all.filter(s => s.isActive || s.flowStatus === 'ACTIVE');
  if (active.length > 1) {
    await log(base44, coachEmail, 'MULTIPLE_ACTIVE_FLOW_STATES_FOUND', {
      leadId, count: active.length, ids: active.map(s => s.id)
    });
  }
  for (const s of active) {
    await base44.asServiceRole.entities.LeadConversationState.update(s.id, {
      isActive: false, flowStatus: 'STOPPED'
    }).catch(() => {});
    await log(base44, coachEmail, 'SESSION_DEACTIVATED', { leadId, stateId: s.id, sessionId: s.sessionId });
  }
  return active.map(s => s.id);
}

/**
 * Cancel all queued/sending queue items for a lead that do NOT belong to newSessionId.
 * If newSessionId is null, cancels ALL queued/sending items.
 */
async function cancelPendingQueueItems(base44, leadId, coachEmail, keepSessionId = null) {
  const items = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ context_id: leadId }).catch(() => []);
  let cancelledCount = 0;
  for (const item of items) {
    if (!['queued', 'sending'].includes(item.status)) continue;
    // Always cancel items from OTHER sessions — never cancel the new session's items
    if (keepSessionId && item.session_id === keepSessionId) continue;
    // Also cancel items with no session_id (legacy/orphaned items)
    await base44.asServiceRole.entities.WhatsAppMessageQueue.update(item.id, {
      status: 'cancelled',
      error_message: 'OLD_SESSION_QUEUE_CANCELLED'
    }).catch(() => {});
    cancelledCount++;
  }
  if (cancelledCount > 0 && coachEmail) {
    await log(base44, coachEmail, 'OLD_SESSION_QUEUE_CANCELLED', {
      leadId, cancelledCount, keepSessionId: keepSessionId || 'all'
    });
  }
}

/**
 * Get the single active flow state for a lead.
 * Cleans up duplicates (keeps newest).
 */
async function getActiveState(base44, leadId, coachEmail) {
  const all = await base44.asServiceRole.entities.LeadConversationState.filter({ leadId }).catch(() => []);
  const active = all.filter(s => s.isActive === true && s.flowStatus === 'ACTIVE');

  if (active.length === 0) return null;

  if (active.length > 1) {
    await log(base44, coachEmail, 'MULTIPLE_ACTIVE_FLOW_STATES_FOUND', {
      leadId, count: active.length, ids: active.map(s => s.id)
    });
    const sorted = active.sort((a, b) =>
      new Date(b.lastFlowActionAt || b.updated_date || 0) - new Date(a.lastFlowActionAt || a.updated_date || 0)
    );
    // Deactivate all but the newest
    for (let i = 1; i < sorted.length; i++) {
      await base44.asServiceRole.entities.LeadConversationState.update(sorted[i].id, {
        isActive: false, flowStatus: 'STOPPED'
      }).catch(() => {});
    }
    return sorted[0];
  }

  return active[0];
}

/**
 * Create a brand new session state record.
 * Always creates — never upserts.
 */
async function createSessionState(base44, leadId, sessionId, flowId, flowName, step, totalSteps, coachEmail) {
  const now = new Date().toISOString();
  const rec = await base44.asServiceRole.entities.LeadConversationState.create({
    leadId,
    sessionId,
    flowId,
    flowName,
    currentStepId: step.id,
    currentStepOrder: step.stepOrder,
    currentStepMessage: '',
    totalSteps,
    isActive: true,
    flowStatus: 'ACTIVE',
    lastFlowActionAt: now,
    coach_email: coachEmail
  });
  await log(base44, coachEmail, 'SESSION_CREATED', {
    leadId, stateId: rec?.id, sessionId, flowId, flowName, startStep: step.stepOrder
  });
  return rec;
}

/**
 * Duplicate send guard.
 * Blocks if:
 *   1. The SAME session already has a queued/sending/sent item for this step, OR
 *   2. ANY session has a currently pending (queued/sending) item for this step.
 *      This prevents race conditions where concurrent calls both pass the per-session check.
 * Returns { blocked: bool, reason: string }
 */
async function checkDuplicateStep(base44, leadId, stepOrder, sessionId, coachEmail) {
  const templateKey = `flow_step_${stepOrder}`;

  const existing = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({
    context_id: leadId,
    template_key: templateKey,
  }).catch(() => []);

  // 1. Same-session: queued/sending/sent → blocked (use dedicated session_id field)
  const sameSession = existing.filter(q => {
    if (!['queued', 'sending', 'sent'].includes(q.status)) return false;
    return q.session_id === sessionId;
  });

  // 2. Cross-session: any currently pending item → blocked (race condition guard)
  const anyPending = existing.filter(q => ['queued', 'sending'].includes(q.status));

  const blocked = sameSession.length > 0 || anyPending.length > 0;
  const reason = sameSession.length > 0
    ? `same_session_item_exists_step_${stepOrder}`
    : `pending_queue_item_exists_cross_session_step_${stepOrder}`;

  await log(base44, coachEmail, 'QUEUE_UNIQUENESS_CHECK', {
    leadId, stepOrder, sessionId, templateKey,
    existingTotal: existing.length,
    sameSessionCount: sameSession.length,
    anyPendingCount: anyPending.length,
    blocked
  });

  if (blocked) {
    await log(base44, coachEmail, 'DUPLICATE_STEP_BLOCKED', {
      leadId, stepOrder, templateKey, sessionId, reason,
      existingIds: [...new Set([...sameSession, ...anyPending].map(q => q.id))],
      statuses: [...new Set([...sameSession, ...anyPending].map(q => q.status))]
    });
    return { blocked: true, reason };
  }
  return { blocked: false };
}

/**
 * Core: enqueue a step message.
 * stateId: the specific LeadConversationState record to update after enqueue.
 * skipDuplicateCheck: true for first step of a fresh session.
 */
async function sendStep(base44, lead, step, flow, totalSteps, sessionId, stateId, skipDuplicateCheck = false, inboundMessageId = null) {
  const coachEmail = lead.coach_email || 'system';
  const phoneE164 = lead.phoneE164;
  if (!isValidE164(phoneE164)) return { ok: false, error: 'invalid_phone' };

  // Duplicate guard
  if (!skipDuplicateCheck) {
    const dup = await checkDuplicateStep(base44, lead.id, step.stepOrder, sessionId, coachEmail);
    if (dup.blocked) {
      await log(base44, coachEmail, 'DUPLICATE_STEP_BLOCKED', {
        leadId: lead.id, flowId: flow.id, stepOrder: step.stepOrder, sessionId, reason: dup.reason
      });
      return { ok: false, blocked: true, reason: dup.reason };
    }
  }

  const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail }).catch(() => []);
  const providerType = configs[0]?.provider_type || 'mock';
  const toName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
  const renderedText = lead.waOnly
    ? transformWaOnlyMessage(renderMessage(step.messageText, lead))
    : renderMessage(step.messageText, lead);
  const delayMs = (step.delayMinutes || 0) * 60 * 1000;
  const scheduledFor = new Date(Date.now() + delayMs).toISOString();

  // Hard uniqueness guard: one non-cancelled item per session+step (prevents race conditions)
  const existingInSession = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({
    context_id: lead.id,
    session_id: sessionId,
    template_key: `flow_step_${step.stepOrder}`
  }).catch(() => []);
  if (existingInSession.some(q => q.status !== 'cancelled')) {
    await log(base44, coachEmail, 'QUEUE_HARD_GUARD_BLOCKED', {
      leadId: lead.id, stepOrder: step.stepOrder, sessionId,
      existingIds: existingInSession.map(q => q.id)
    });
    return { ok: false, blocked: true, reason: `hard_guard_duplicate_step_${step.stepOrder}` };
  }

  // 🚨 ENFORCEMENT: FS-10 — Queue record must have session_id
  if (!sessionId) {
    await log(base44, coachEmail, 'CONSISTENCY_VIOLATION', {
      violation_type: 'FS-10_QUEUE_WITHOUT_SESSION_BLOCKED',
      severity: 'HIGH',
      leadId: lead.id, stepOrder: step.stepOrder, stepId: step.id,
      condition: 'sessionId is null/empty — queue insert BLOCKED',
      enforcement: 'BLOCKED: WhatsAppMessageQueue record was NOT created.',
    });
    return { ok: false, error: 'QUEUE_WITHOUT_SESSION_BLOCKED' };
  }

  const record = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
    coach_email: coachEmail,
    to_phone_e164: phoneE164,
    to_name: toName || '',
    context_type: 'lead',
    context_id: lead.id,
    template_key: `flow_step_${step.stepOrder}`,
    rendered_text: renderedText,
    provider_type: providerType,
    status: 'queued',
    attempts: 0,
    scheduled_for: scheduledFor,
    session_id: sessionId,
    // Store extra metadata in provider_response for debugging (worker may overwrite this, don't rely on it for dedup)
    provider_response: JSON.stringify({ sessionId, flowId: flow.id, stepOrder: step.stepOrder, producer: 'salesFlowRunner' })
  });

  const now = new Date().toISOString();

  // ── BOOKKEEPING: stamp inbound record + create claim ────────────────────────
  if (inboundMessageId && record?.id) {
    await base44.asServiceRole.entities.LeadMessageThread.update(inboundMessageId, {
      replyQueueId: record.id,
      replyStatus: 'queued',
      replyProducer: 'salesFlowRunner',
      replyGeneratedAt: now
    }).catch(() => {});
    await base44.asServiceRole.entities.OutboundReplyClaim.create({
      inboundMessageId,
      leadId: lead.id,
      coach_email: lead.coach_email || 'system',
      queueId: record.id,
      claimedAt: now,
      claimedBy: 'salesFlowRunner'
    }).catch(() => {});
    console.log('[salesFlowRunner] INBOUND_BOOKKEEPING_STAMPED — inboundId:', inboundMessageId, '→ queueId:', record.id);
  }

  await base44.asServiceRole.entities.Lead.update(lead.id, { lastMessageAt: now }).catch(() => {});

  const outboundMsg = await base44.asServiceRole.entities.LeadMessageThread.create({
    leadId: lead.id,
    coach_email: coachEmail,
    channel: 'WHATSAPP',
    direction: 'OUTBOUND',
    senderType: 'SYSTEM',
    messageText: renderedText,
    messageTimestamp: now,
    providerMessageId: record?.id || '',
    replyStatus: 'queued',
    replyQueueId: record?.id
  }).catch(() => {});

  await base44.asServiceRole.functions.invoke('logLeadActivity', {
    leadId: lead.id,
    coach_email: coachEmail,
    activityType: 'STEP_SENT',
    activitySource: 'FLOW',
    message: `הודעת וואטסאפ נשלחה – שלב ${step.stepOrder}${totalSteps ? ' מתוך ' + totalSteps : ''}`,
    metadata: { stepOrder: step.stepOrder, flowId: flow.id, flowName: flow.name, sessionId }
  }).catch(() => {});

  await log(base44, coachEmail, 'STEP_SENT', {
    leadId: lead.id, stepOrder: step.stepOrder, queueId: record?.id, totalSteps, sessionId
  });

  if (step.actionType === 'SET_STATUS' && step.actionValue) {
    await base44.asServiceRole.entities.Lead.update(lead.id, { status: step.actionValue }).catch(() => {});
  }

  // Update the state record by its specific ID — never search/upsert
  if (stateId) {
    // ── Timeout state: set if step has waitForReply + replyTimeoutMinutes ──
    const timeoutUpdate = {};
    if (step.waitForReply && step.replyTimeoutMinutes) {
      // ✅ ENFORCEMENT: Full timeout config present — arm timeout (legal state)
      const nextTimeoutMs = Date.now() + (step.replyTimeoutMinutes * 60 * 1000);
      timeoutUpdate.waitingForReply = true;
      timeoutUpdate.lastStepSentAt = now;
      timeoutUpdate.nextTimeoutAt = new Date(nextTimeoutMs).toISOString();
      timeoutUpdate.followupsSentInStep = 0;
    } else if (step.waitForReply && !step.replyTimeoutMinutes) {
      // 🚨 ENFORCEMENT: FS-01/FS-02 — waitForReply=true but timeout config missing
      // BLOCK: do NOT set waitingForReply=true. Log violation. Continue without timeout.
      await log(base44, coachEmail, 'CONSISTENCY_VIOLATION', {
        violation_type: 'FS-01_INVALID_TIMEOUT_CONFIG',
        severity: 'HIGH',
        leadId: lead.id, sessionId, stepOrder: step.stepOrder, stepId: step.id,
        condition: 'step.waitForReply=true BUT step.replyTimeoutMinutes is null — timeout BLOCKED, waitingForReply NOT set',
        enforcement: 'BLOCKED: waitingForReply was NOT set to true. Timeout will not fire.',
      });
      // Do NOT set waitingForReply=true — leave it false (safe default)
      timeoutUpdate.waitingForReply = false;
      timeoutUpdate.nextTimeoutAt = null;
      timeoutUpdate.followupsSentInStep = 0;
    } else if (step.waitForReply === false) {
      // Explicit non-waiting step — clear any leftover timeout state
      timeoutUpdate.waitingForReply = false;
      timeoutUpdate.nextTimeoutAt = null;
      timeoutUpdate.followupsSentInStep = 0;
    }
    await base44.asServiceRole.entities.LeadConversationState.update(stateId, {
      currentStepId: step.id,
      currentStepOrder: step.stepOrder,
      currentStepMessage: renderedText,
      isActive: true,
      flowStatus: 'ACTIVE',
      lastFlowActionAt: now,
      ...timeoutUpdate
    }).catch(() => {});
  }

  await base44.asServiceRole.functions.invoke('whatsAppQueueWorker', {}).catch(() => {});

  return { ok: true, queueId: record?.id };
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { leadId, continueFromReply, action } = body;

    if (!leadId) return Response.json({ ok: false, error: 'Missing leadId' }, { status: 400 });

    let lead = body.lead || null;
    if (!lead || !lead.id) {
      // ERROR-007 fix: direct indexed lookup by id — no full-table scan
      const found = await base44.asServiceRole.entities.Lead.filter({ id: leadId }).catch(() => []);
      lead = found[0] || null;
    }
    if (!lead) return Response.json({ ok: false, error: 'Lead not found', leadId });

    const coachEmail = lead.coach_email || 'system';

    // ── Manual controls ──────────────────────────────────────────────────────
    if (action === 'pause') {
      const state = await getActiveState(base44, leadId, coachEmail);
      if (state) {
        await base44.asServiceRole.entities.LeadConversationState.update(state.id, {
          isActive: false, flowStatus: 'PAUSED', lastFlowActionAt: new Date().toISOString()
        }).catch(() => {});
      }
      await log(base44, coachEmail, 'FLOW_PAUSED', { leadId });
      return Response.json({ ok: true, action: 'paused' });
    }

    if (action === 'stop') {
      const state = await getActiveState(base44, leadId, coachEmail);
      if (state) {
        await base44.asServiceRole.entities.LeadConversationState.update(state.id, {
          isActive: false, flowStatus: 'STOPPED', lastFlowActionAt: new Date().toISOString()
        }).catch(() => {});
      }
      await log(base44, coachEmail, 'FLOW_STOPPED', { leadId });
      return Response.json({ ok: true, action: 'stopped' });
    }

    // ── FORCE ADVANCE (manual override — skips waitForReply check) ────────
    if (action === 'force_advance') {
      await log(base44, coachEmail, 'FORCE_ADVANCE_REQUESTED', { leadId });

      const state = await getActiveState(base44, leadId, coachEmail);
      if (!state) {
        return Response.json({ ok: false, error: 'no_active_flow_state' });
      }

      const stateFlowId = state.flowId;
      const allStepsForState = await base44.asServiceRole.entities.SalesConversationStep.filter({ flowId: stateFlowId }).catch(() => []);
      const stepsForState = allStepsForState.sort((a, b) => a.stepOrder - b.stepOrder);
      const flowRec = await base44.asServiceRole.entities.SalesConversationFlow.filter({ id: stateFlowId }).catch(() => []);
      const activeFlow = flowRec[0] || null; // ISSUE-017 fix: removed unsafe `flow` reference (undefined in force_advance scope)

      if (!activeFlow) {
        await log(base44, coachEmail, 'FORCE_ADVANCE_FAILED', { leadId, reason: 'flow_not_found', flowId: stateFlowId });
        return Response.json({ ok: false, error: `Flow ${stateFlowId} not found`, leadId });
      }

      const currentOrder = Number(state.currentStepOrder) || 1;
      const nextStep = stepsForState.find(s => Number(s.stepOrder) === currentOrder + 1);

      if (!nextStep) {
        await base44.asServiceRole.entities.LeadConversationState.update(state.id, {
          isActive: false, flowStatus: 'COMPLETED', lastFlowActionAt: new Date().toISOString()
        }).catch(() => {});
        await log(base44, coachEmail, 'FLOW_COMPLETED', { leadId, reason: 'force_advance_no_next_step' });
        return Response.json({ ok: true, done: true, reason: 'flow_completed' });
      }

      const sessionId = state.sessionId || 'legacy';

      // Cancel any existing queued items for the next step (to avoid dup block)
      const existingQueue = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ context_id: leadId }).catch(() => []);
      for (const q of existingQueue) {
        const stepMatch = (q.template_key || '') === `flow_step_${nextStep.stepOrder}`;
        if (stepMatch && ['queued', 'sending'].includes(q.status)) {
          await base44.asServiceRole.entities.WhatsAppMessageQueue.update(q.id, {
            status: 'cancelled', error_message: 'FORCE_ADVANCE_OVERRIDE'
          }).catch(() => {});
        }
      }

      await base44.asServiceRole.entities.LeadConversationState.update(state.id, {
        currentStepId: nextStep.id,
        currentStepOrder: nextStep.stepOrder,
        currentStepMessage: '',
        isActive: true,
        flowStatus: 'ACTIVE',
        lastFlowActionAt: new Date().toISOString()
      }).catch(() => {});

      const sendResult = await sendStep(base44, lead, nextStep, activeFlow, stepsForState.length, sessionId, state.id, true);

      await log(base44, coachEmail, 'FORCE_ADVANCE_DONE', {
        leadId, fromStep: currentOrder, toStep: nextStep.stepOrder, sendResult
      });

      return Response.json({ ok: true, leadId, advancedToStep: nextStep.stepOrder, sessionId });
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── SEND FOLLOWUP (manual or timeout-triggered) ───────────────────────
    if (action === 'send_followup') {
      const state = await getActiveState(base44, leadId, coachEmail);
      if (!state) return Response.json({ ok: false, error: 'no_active_flow_state' });
      if (!state.waitingForReply) return Response.json({ ok: true, skipped: true, reason: 'not_waiting_for_reply' });

      const stateFlowId = state.flowId;
      const allStepsForFollowup = await base44.asServiceRole.entities.SalesConversationStep.filter({ flowId: stateFlowId }).catch(() => []);
      const currentStep = allStepsForFollowup.find(s => Number(s.stepOrder) === Number(state.currentStepOrder));

      if (!currentStep) return Response.json({ ok: false, error: 'current_step_not_found' });

      const maxFollowups = currentStep.maxFollowups ?? 1;
      const followupsSent = state.followupsSentInStep || 0;
      if (followupsSent >= maxFollowups) {
        return Response.json({ ok: true, skipped: true, reason: `followup_exhausted_${followupsSent}/${maxFollowups}` });
      }

      if (lead.waOptOut || !isValidE164(lead.phoneE164)) {
        return Response.json({ ok: true, skipped: true, reason: 'not_sendable' });
      }

      const timeoutMessage = currentStep.timeoutMessage || currentStep.messageText || '';
      const followupN = followupsSent + 1;
      const templateKey = `flow_step_${state.currentStepOrder}_followup_${followupN}`;
      const replyTimeoutMinutes = currentStep.replyTimeoutMinutes || 60;

      // Hard guard
      const existingQ = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ context_id: leadId, template_key: templateKey }).catch(() => []);
      if (existingQ.some(q => ['queued', 'sending', 'sent'].includes(q.status))) {
        return Response.json({ ok: true, skipped: true, reason: 'followup_already_queued' });
      }

      const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail }).catch(() => []);
      const providerType = configs[0]?.provider_type || 'mock';
      const renderedText = lead.waOnly
        ? transformWaOnlyMessage(renderMessage(timeoutMessage, lead))
        : renderMessage(timeoutMessage, lead);
      const toName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');

      const record = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
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
        session_id: state.sessionId,
      });

      await base44.asServiceRole.entities.LeadMessageThread.create({
        leadId,
        coach_email: coachEmail,
        channel: 'WHATSAPP',
        direction: 'OUTBOUND',
        senderType: 'SYSTEM',
        messageText: renderedText,
        messageTimestamp: new Date().toISOString(),
        replyStatus: 'queued',
        replyQueueId: record?.id,
        replyProducer: 'salesFlowRunner',
      }).catch(() => {});

      const nextTimeoutMs = Date.now() + (replyTimeoutMinutes * 60 * 1000);
      await base44.asServiceRole.entities.LeadConversationState.update(state.id, {
        followupsSentInStep: followupN,
        nextTimeoutAt: new Date(nextTimeoutMs).toISOString(),
        lastFlowActionAt: new Date().toISOString(),
      }).catch(() => {});

      await log(base44, coachEmail, 'FLOW_FOLLOWUP_SENT', { leadId, stepOrder: state.currentStepOrder, followupN, templateKey });
      await base44.asServiceRole.functions.invoke('whatsAppQueueWorker', {}).catch(() => {});

      return Response.json({ ok: true, leadId, followupN, queueId: record?.id, templateKey });
    }
    // ────────────────────────────────────────────────────────────────────────

    if (action === 'resume') {
      const all = await base44.asServiceRole.entities.LeadConversationState.filter({ leadId }).catch(() => []);
      const target = all.find(s => s.flowStatus === 'PAUSED') || all[0];
      if (target) {
        await base44.asServiceRole.entities.LeadConversationState.update(target.id, {
          isActive: true, flowStatus: 'ACTIVE', lastFlowActionAt: new Date().toISOString()
        }).catch(() => {});
        await log(base44, coachEmail, 'FLOW_RESUMED', { leadId, stateId: target.id });
      }
      return Response.json({ ok: true, action: 'resumed' });
    }
    // ────────────────────────────────────────────────────────────────────────

    // Guard
    if (lead.waOptOut || lead.status === 'CLOSED' || lead.status === 'BOOKED') {
      return Response.json({ ok: true, skipped: true, reason: 'lead opted out or closed' });
    }

    // Find flow — first try coach-specific, then default
    const allFlows = await base44.asServiceRole.entities.SalesConversationFlow.filter({}).catch(() => []);
    const coachFlows = allFlows.filter(f => f.coach_email === coachEmail && f.is_active !== false);
    const defaultFlows = allFlows.filter(f => f.isDefault && f.is_active !== false);
    const flow = coachFlows[0] || defaultFlows[0];

    if (!flow) {
      await log(base44, coachEmail, 'FLOW_NOT_FOUND', { leadId });
      return Response.json({ ok: true, skipped: true, reason: 'No active flow configured' });
    }

    const allSteps = await base44.asServiceRole.entities.SalesConversationStep.filter({ flowId: flow.id }).catch(() => []);
    const steps = allSteps.sort((a, b) => a.stepOrder - b.stepOrder);
    if (!steps.length) {
      await log(base44, coachEmail, 'NO_STEPS_IN_FLOW', { leadId, flowId: flow.id, flowName: flow.name });
      return Response.json({ ok: true, skipped: true, reason: 'No steps in flow' });
    }

    // Validate step 1 has required fields
    const step1 = steps[0];
    if (!step1.messageText) {
      await log(base44, coachEmail, 'STEP1_MISSING_MESSAGE', { leadId, flowId: flow.id, stepId: step1.id });
      return Response.json({ ok: false, error: 'Step 1 missing messageText' });
    }

    const totalSteps = steps.length;

    // ── START (initial trigger) ──────────────────────────────────────────────
    if (!action && !continueFromReply) {
      // Double-send guard: skip if already sent within 24h
      if (lead.lastMessageAt) {
        const hoursAgo = (Date.now() - new Date(lead.lastMessageAt).getTime()) / 3600000;
        if (hoursAgo < 24) {
          await log(base44, coachEmail, 'DUPLICATE_STEP_BLOCKED', {
            leadId, reason: 'lastMessageAt < 24h', hoursAgo
          });
          return Response.json({ ok: true, skipped: true, reason: 'double-send guard: lastMessageAt < 24h' });
        }
      }

      // If there is already an active session, don't restart — just skip
      const existingActive = await getActiveState(base44, leadId, coachEmail);
      if (existingActive) {
        await log(base44, coachEmail, 'DUPLICATE_STEP_BLOCKED', {
          leadId, reason: 'active_session_already_exists',
          existingSessionId: existingActive.sessionId, existingStateId: existingActive.id
        });
        return Response.json({ ok: true, skipped: true, reason: 'active_session_already_exists' });
      }

      // 🚨 ENFORCEMENT: FS-06 — verify no duplicate active sessions exist (re-check after getActiveState cleanup)
      const allAfterCleanup = await base44.asServiceRole.entities.LeadConversationState.filter({ leadId }).catch(() => []);
      const stillActive = allAfterCleanup.filter(s => s.isActive && s.flowStatus === 'ACTIVE');
      if (stillActive.length > 1) {
        await log(base44, coachEmail, 'CONSISTENCY_VIOLATION', {
          violation_type: 'FS-06_MULTIPLE_ACTIVE_SESSIONS',
          severity: 'HIGH',
          leadId, condition: `${stillActive.length} sessions still active after cleanup attempt`,
          enforcement: 'LOGGED: deactivateAllStates will run next',
        });
      }

      const sessionId = generateSessionId();
      // Cancel ALL stale pending queue items before starting new session
      await cancelPendingQueueItems(base44, leadId, coachEmail, null); // null = cancel ALL
      await deactivateAllStates(base44, leadId, coachEmail);

      const step1 = steps[0];

      // Create the session state record FIRST
      const stateRec = await createSessionState(base44, leadId, sessionId, flow.id, flow.name, step1, totalSteps, coachEmail);
      const stateId = stateRec?.id;

      await log(base44, coachEmail, 'FLOW_STARTED', { leadId, flowId: flow.id, flowName: flow.name, sessionId, stateId });
      await base44.asServiceRole.functions.invoke('logLeadActivity', {
        leadId, coach_email: coachEmail,
        activityType: 'FLOW_STARTED', activitySource: 'FLOW',
        message: `פלו מכירה הופעל – ${flow.name}`,
        metadata: { flowId: flow.id, flowName: flow.name, sessionId }
      }).catch(() => {});

      await sendStep(base44, lead, step1, flow, totalSteps, sessionId, stateId, false);

      // Auto-advance through consecutive non-waitForReply steps
      if (!step1.waitForReply) {
        for (let i = 1; i < steps.length; i++) {
          const step = steps[i];
          const r = await sendStep(base44, lead, step, flow, totalSteps, sessionId, stateId, false);
          if (r.blocked || !r.ok) break;
          if (step.waitForReply) break;
        }
      }

      await base44.asServiceRole.entities.Lead.update(leadId, { status: 'CONTACTED' }).catch(() => {});
      return Response.json({ ok: true, leadId, flowId: flow.id, startedStep: step1.stepOrder, sessionId, stateId });
    }

    // ── RESTART / NEW CONVERSATION ────────────────────────────────────────────
    if (action === 'restart' || action === 'new_conversation') {
      await log(base44, coachEmail, 'FLOW_RESTART_REQUESTED', { leadId, flowId: flow.id, flowName: flow.name });

      const step1 = steps[0];
      if (!step1) return Response.json({ ok: false, error: 'No steps in flow' });

      // 1. Generate new session ID FIRST
      const sessionId = generateSessionId();
      await log(base44, coachEmail, 'RESTART_SESSION_CREATED', { leadId, sessionId, flowId: flow.id });

      // 2. Deactivate all previous states
      await deactivateAllStates(base44, leadId, coachEmail);

      // 3. Cancel queue items from ALL OTHER sessions (keep new session clear)
      await cancelPendingQueueItems(base44, leadId, coachEmail, sessionId);

      // 4. Create a fresh state record for the new session
      const stateRec = await createSessionState(base44, leadId, sessionId, flow.id, flow.name, step1, totalSteps, coachEmail);
      const stateId = stateRec?.id;

      // 5. Verify step 1 has no queue item for this new session before sending
      const dup = await checkDuplicateStep(base44, leadId, step1.stepOrder, sessionId, coachEmail);
      if (dup.blocked) {
        // This shouldn't happen with a brand-new sessionId, but guard anyway
        await log(base44, coachEmail, 'FLOW_RESTART_FAILED', { leadId, reason: 'step1_already_queued_for_new_session', sessionId });
        return Response.json({ ok: false, error: 'step1 already queued for new session' });
      }

      const sendResult = await sendStep(base44, lead, step1, flow, totalSteps, sessionId, stateId, false);
      if (!sendResult.ok && !sendResult.blocked) {
        await log(base44, coachEmail, 'FLOW_RESTART_FAILED', { leadId, reason: sendResult.error });
        return Response.json({ ok: false, error: sendResult.error });
      }

      await base44.asServiceRole.functions.invoke('logLeadActivity', {
        leadId, coach_email: coachEmail,
        activityType: 'FLOW_STARTED', activitySource: 'FLOW',
        message: `Sales Flow הופעל מחדש – ${flow.name} (שלב 1)`,
        metadata: { flowId: flow.id, flowName: flow.name, manual: true, sessionId }
      }).catch(() => {});

      await base44.asServiceRole.entities.Lead.update(leadId, { status: 'CONTACTED' }).catch(() => {});
      return Response.json({ ok: true, leadId, newConversation: true, flowName: flow.name, startedStep: step1.stepOrder, sessionId, stateId });
    }

    // ── CONTINUE FROM INBOUND REPLY ───────────────────────────────────────────
    if (continueFromReply) {
      await log(base44, coachEmail, 'INBOUND_ADVANCE_STARTED', { leadId });

      // ── CRITICAL: Check if reply already generated by another producer ────────
      const inboundMessageId = body.inboundMessageId;
      if (inboundMessageId) {
        const inboundMsgs = await base44.asServiceRole.entities.LeadMessageThread.filter({ id: inboundMessageId }).catch(() => []);
        const inboundMsg = inboundMsgs[0] || null;
        
        if (inboundMsg?.replyProducer && inboundMsg.replyProducer !== 'salesFlowRunner') {
          const lockAge = Date.now() - new Date(inboundMsg.replyGenerationStartedAt || 0).getTime();
          if (lockAge < 30000) { // 30s lock
            console.log('[salesFlowRunner] DUPLICATE_REPLY_SKIPPED - reply already claimed by:', inboundMsg.replyProducer);
            await log(base44, coachEmail, 'DUPLICATE_REPLY_SKIPPED', {
              leadId,
              existingProducer: inboundMsg.replyProducer,
              lockAge,
              inboundMessageId
            });
            return Response.json({ ok: true, skipped: true, reason: 'DUPLICATE_REPLY_SKIPPED' });
          }
        }
      }

      const state = await getActiveState(base44, leadId, coachEmail);

      if (!state) {
        await log(base44, coachEmail, 'INBOUND_ADVANCE_FAILED', {
          leadId, reason: 'no_active_flow_state',
          detail: 'No active LeadConversationState found for this lead'
        });
        return Response.json({ ok: true, skipped: true, reason: 'no_active_flow_state' });
      }

      await log(base44, coachEmail, 'INBOUND_MATCHED_TO_SESSION', {
        leadId, stateId: state.id, sessionId: state.sessionId,
        currentStepOrder: state.currentStepOrder, flowStatus: state.flowStatus
      });

      // ── TIMEOUT: clear waiting state on inbound reply (safe, additive) ──
      if (state.waitingForReply) {
        await base44.asServiceRole.entities.LeadConversationState.update(state.id, {
          waitingForReply: false,
          nextTimeoutAt: null,
        }).catch(() => {});
        await log(base44, coachEmail, 'FLOW_WAITING_CLEARED_ON_INBOUND', {
          leadId, sessionId: state.sessionId, stepOrder: state.currentStepOrder
        });
      }

      if (!state.isActive || state.flowStatus !== 'ACTIVE') {
        await log(base44, coachEmail, 'INBOUND_ADVANCE_FAILED', {
          leadId, reason: 'flow_not_active',
          detail: `flowStatus=${state.flowStatus} isActive=${state.isActive}`,
          stateId: state.id, sessionId: state.sessionId
        });
        return Response.json({ ok: true, skipped: true, reason: `flow_not_active: ${state.flowStatus}` });
      }

      const sessionId = state.sessionId || 'legacy';

      // Load steps for the flow this state belongs to
      const stateFlowId = state.flowId;
      let stepsForState = steps;
      let activeFlow = flow;
      if (stateFlowId && stateFlowId !== flow.id) {
        const altSteps = await base44.asServiceRole.entities.SalesConversationStep.filter({ flowId: stateFlowId }).catch(() => []);
        stepsForState = altSteps.sort((a, b) => a.stepOrder - b.stepOrder);
        const flowRec = await base44.asServiceRole.entities.SalesConversationFlow.filter({ id: stateFlowId }).catch(() => []);
        activeFlow = flowRec[0] || flow;
      }

      const currentOrder = Number(state.currentStepOrder) || 1;
      const currentStep = stepsForState.find(s => Number(s.stepOrder) === currentOrder);

      await log(base44, coachEmail, 'CURRENT_STEP_LOADED', {
        leadId, currentOrder, found: !!currentStep,
        waitForReply: currentStep?.waitForReply, sessionId
      });

      if (!currentStep) {
        await log(base44, coachEmail, 'INBOUND_ADVANCE_FAILED', {
          leadId, reason: 'current_step_missing',
          detail: `No step with stepOrder=${currentOrder} in flowId=${stateFlowId}`,
          sessionId
        });
        return Response.json({ ok: true, skipped: true, reason: 'current_step_missing' });
      }

      // waitForReply controls the auto-advance loop at flow START only.
      // Any inbound reply from a lead should ALWAYS advance the flow.
      await log(base44, coachEmail, 'CURRENT_STEP_REPLY_ADVANCE', {
        leadId, currentOrder, sessionId, waitForReply: currentStep?.waitForReply
      });

      const nextStep = stepsForState.find(s => Number(s.stepOrder) === currentOrder + 1);

      if (!nextStep) {
        await base44.asServiceRole.entities.LeadConversationState.update(state.id, {
          isActive: false, flowStatus: 'COMPLETED', lastFlowActionAt: new Date().toISOString()
        }).catch(() => {});
        await log(base44, coachEmail, 'FLOW_COMPLETED', { leadId, totalSteps: stepsForState.length, sessionId });
        await base44.asServiceRole.functions.invoke('logLeadActivity', {
          leadId, coach_email: coachEmail,
          activityType: 'FLOW_COMPLETED', activitySource: 'FLOW',
          message: 'Sales Flow הושלם', metadata: { totalSteps: stepsForState.length, sessionId }
        }).catch(() => {});

        // ── FLOW_THEN_AI handoff: if flow mode allows it, switch owner to AI ────
        const flowResponseMode = activeFlow?.flowResponseMode || 'FLOW_ONLY';
        if (flowResponseMode === 'FLOW_THEN_AI') {
          await base44.asServiceRole.entities.Lead.update(leadId, {
            activeResponderOwner: 'AI'
          }).catch(() => {});
          await log(base44, coachEmail, 'FLOW_THEN_AI_HANDOFF', {
            leadId, sessionId,
            flowId: activeFlow.id, flowName: activeFlow.name,
            fromOwner: 'FLOW', toOwner: 'AI',
            reason: 'flow_completed_with_FLOW_THEN_AI_mode'
          });
        }
        // ─────────────────────────────────────────────────────────────────────────

        return Response.json({ ok: true, done: true, reason: 'flow_completed', sessionId, handoff: flowResponseMode === 'FLOW_THEN_AI' ? 'AI' : null });
      }

      // Advance state to next step BEFORE sending (prevents race condition)
      await base44.asServiceRole.entities.LeadConversationState.update(state.id, {
        currentStepId: nextStep.id,
        currentStepOrder: nextStep.stepOrder,
        currentStepMessage: '',
        isActive: true,
        flowStatus: 'ACTIVE',
        lastFlowActionAt: new Date().toISOString()
      }).catch(() => {});

      await base44.asServiceRole.functions.invoke('logLeadActivity', {
        leadId, coach_email: coachEmail,
        activityType: 'STEP_ADVANCED', activitySource: 'FLOW',
        message: `ליד ענה – ממשיך לשלב ${nextStep.stepOrder} מתוך ${stepsForState.length}`,
        metadata: { fromStep: currentOrder, toStep: nextStep.stepOrder, sessionId }
      }).catch(() => {});

      const sendResult = await sendStep(base44, lead, nextStep, activeFlow, stepsForState.length, sessionId, state.id, false, body.inboundMessageId || null);

      if (sendResult.blocked) {
        await log(base44, coachEmail, 'INBOUND_ADVANCE_FAILED', {
          leadId, reason: 'duplicate_step_blocked',
          detail: `Step ${nextStep.stepOrder} already queued for session ${sessionId}`,
          sessionId
        });
        // Step was already sent — this is OK, treat as success
        return Response.json({ ok: true, skipped: true, reason: 'duplicate_step_blocked — step already sent' });
      }

      if (!sendResult.ok) {
        await log(base44, coachEmail, 'INBOUND_ADVANCE_FAILED', {
          leadId, reason: 'send_failed',
          detail: sendResult.error || 'sendStep returned not ok',
          stepOrder: nextStep.stepOrder, sessionId
        });
        return Response.json({ ok: false, error: sendResult.error });
      }

      await log(base44, coachEmail, 'INBOUND_ADVANCE_SUCCESS', {
        leadId, fromStep: currentOrder, toStep: nextStep.stepOrder,
        queueId: sendResult.queueId, sessionId
      });

      return Response.json({ ok: true, leadId, advancedToStep: nextStep.stepOrder, sessionId });
    }

    return Response.json({ ok: false, error: 'Unknown action' }, { status: 400 });

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});