/**
 * traceOneInbound — READ-ONLY deep trace for the latest inbound message of a lead.
 *
 * STRICT READ-ONLY / NO-SIDE-EFFECT MODE:
 * - NO creates, updates, or deletes of any entity
 * - NO invocations of any other function
 * - NO sends, no queue mutations, no session mutations
 * - ONLY reads from DB and returns exact facts
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

function isValidE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone || '');
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { leadId } = body;
  if (!leadId) return Response.json({ error: 'Missing leadId' }, { status: 400 });

  const trace = {
    meta: {
      traceType: 'DEEP_TRACE_ONE_INBOUND',
      readOnly: true,
      leadId,
      tracedAt: new Date().toISOString(),
      warning: 'NO LOGIC, DATA, ROUTING, SESSION, QUEUE, OR SEND BEHAVIOR WAS MODIFIED'
    },
    part1_webhook: null,
    part2_db_persisted: null,
    part3_runner: null,
    part4_queue: null,
    part5_verdict: null
  };

  try {
    // ── Read lead ────────────────────────────────────────────────────────────
    const leadArr = await base44.asServiceRole.entities.Lead.filter({ id: leadId }).catch(() => []);
    const lead = leadArr[0] || null;
    if (!lead) {
      return Response.json({ error: 'Lead not found', leadId });
    }
    const coachEmail = lead.coach_email || 'system';

    // ── Read ALL inbound messages for this lead ─────────────────────────────
    const allThreads = await base44.asServiceRole.entities.LeadMessageThread.filter({ leadId }).catch(() => []);
    const inbounds = allThreads
      .filter(m => m.direction === 'INBOUND')
      .sort((a, b) => new Date(b.created_date || b.messageTimestamp || 0) - new Date(a.created_date || a.messageTimestamp || 0));

    if (inbounds.length === 0) {
      return Response.json({ error: 'No INBOUND messages found for this lead', leadId });
    }

    const latestInbound = inbounds[0];
    const inboundId = latestInbound.id;

    // ── Re-read the same record by id (fresh from DB) ───────────────────────
    const allThreadsFresh = await base44.asServiceRole.entities.LeadMessageThread.filter({ leadId }).catch(() => []);
    const freshInbound = allThreadsFresh.find(m => m.id === inboundId) || latestInbound;

    // ── Read all sessions for this lead ──────────────────────────────────────
    const allSessions = await base44.asServiceRole.entities.LeadConversationState.filter({ leadId }).catch(() => []);
    const activeSessions = allSessions.filter(s => s.isActive === true && s.flowStatus === 'ACTIVE');
    const candidateSessions = activeSessions;

    // Replicate webhook session selection logic (read-only)
    let selectedSession = null;
    if (candidateSessions.length > 0) {
      selectedSession = candidateSessions.sort((a, b) =>
        new Date(b.updated_date || 0) - new Date(a.updated_date || 0)
      )[0];
    }

    // ── Read diagnostic logs for this lead around this inbound ───────────────
    const allDiagLogs = await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.filter({ coach_email: coachEmail }).catch(() => []);
    // Filter to logs created within 5 minutes before or after the inbound's created_date
    const inboundCreatedMs = new Date(latestInbound.created_date || latestInbound.messageTimestamp || 0).getTime();
    const windowMs = 5 * 60 * 1000; // 5 minutes
    const nearbyDiagLogs = allDiagLogs
      .filter(l => {
        const logMs = new Date(l.created_date || 0).getTime();
        return Math.abs(logMs - inboundCreatedMs) < windowMs;
      })
      .sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));

    // Extract webhook trace events from diag logs
    const webhookEvents = nearbyDiagLogs.filter(l =>
      l.payload && (
        l.payload.flowEvent === 'INBOUND_MESSAGE_SAVED' ||
        l.payload.flowEvent === 'LEAD_MATCH_SUCCESS' ||
        l.payload.flowEvent === 'OWNER_OVERRIDE_APPLIED' ||
        l.payload.flowEvent === 'SINGLE_REPLY_AUTHORITY_SALES_FLOW' ||
        l.payload.flowEvent === 'FLOW_HANDLED' ||
        l.payload.flowEvent === 'FLOW_NO_ENGINE_CLAIMED' ||
        l.payload.flowEvent === 'FLOW_OWNER_BUT_NO_ACTIVE_SESSION' ||
        l.payload.flowEvent === 'INBOUND_DUPLICATE_SKIPPED' ||
        l.payload.event === 'INBOUND_MESSAGE_SAVED' ||
        l.payload.savedId === inboundId ||
        l.payload.inbound_id === inboundId ||
        l.payload.leadId === leadId
      )
    );

    // Extract runner events from diag logs
    const runnerEvents = nearbyDiagLogs.filter(l =>
      l.payload && (
        l.payload.flowEvent === 'INBOUND_ADVANCE_STARTED' ||
        l.payload.flowEvent === 'INBOUND_MATCHED_TO_SESSION' ||
        l.payload.flowEvent === 'INBOUND_ADVANCE_FAILED' ||
        l.payload.flowEvent === 'INBOUND_ADVANCE_SUCCESS' ||
        l.payload.flowEvent === 'CURRENT_STEP_LOADED' ||
        l.payload.flowEvent === 'CURRENT_STEP_REPLY_ADVANCE' ||
        l.payload.flowEvent === 'QUEUE_UNIQUENESS_CHECK' ||
        l.payload.flowEvent === 'DUPLICATE_STEP_BLOCKED' ||
        l.payload.flowEvent === 'STEP_SENT' ||
        l.payload.flowEvent === 'FLOW_COMPLETED' ||
        l.payload.flowEvent === 'DUPLICATE_REPLY_SKIPPED'
      )
    );

    // ── Read OutboundReplyClaim for this inbound ──────────────────────────────
    const allClaims = await base44.asServiceRole.entities.OutboundReplyClaim.filter({ inboundMessageId: inboundId }).catch(() => []);
    const claim = allClaims[0] || null;

    // Also try filter by leadId if no direct claim found
    const leadClaims = await base44.asServiceRole.entities.OutboundReplyClaim.filter({ leadId }).catch(() => []);
    const claimByLead = leadClaims
      .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))
      .slice(0, 3);

    // ── Read queue records for this lead ──────────────────────────────────────
    const allQueue = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ context_id: leadId }).catch(() => []);
    const flowQueue = allQueue
      .filter(q => (q.template_key || '').startsWith('flow_step_'))
      .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))
      .slice(0, 3);

    // ── Read active session's queue match ─────────────────────────────────────
    const activeSessionQueueMatch = selectedSession
      ? allQueue.filter(q => q.session_id === selectedSession.sessionId)
      : [];

    // ─────────────────────────────────────────────────────────────────────────
    // PART 1 — WEBHOOK TRACE
    // ─────────────────────────────────────────────────────────────────────────
    const inboundSavedDiag = webhookEvents.find(l =>
      l.payload?.flowEvent === 'INBOUND_MESSAGE_SAVED' ||
      l.payload?.savedId === inboundId
    );
    const ownerDiag = webhookEvents.find(l =>
      l.payload?.flowEvent === 'OWNER_OVERRIDE_APPLIED' ||
      l.payload?.owner === 'FLOW'
    );
    const flowRouteDiag = webhookEvents.find(l =>
      l.payload?.flowEvent === 'SINGLE_REPLY_AUTHORITY_SALES_FLOW' ||
      l.payload?.flowEvent === 'FLOW_HANDLED' ||
      l.payload?.flowEvent === 'FLOW_NO_ENGINE_CLAIMED' ||
      l.payload?.flowEvent === 'FLOW_OWNER_BUT_NO_ACTIVE_SESSION'
    );

    trace.part1_webhook = {
      inbound_id: inboundId,
      received_at: latestInbound.created_date || latestInbound.messageTimestamp,
      owner_at_receive_time: {
        activeResponderOwner_raw: lead.activeResponderOwner,
        lead_status: lead.status,
        lead_waOptOut: lead.waOptOut
      },
      session_resolution: {
        total_candidate_sessions_found: candidateSessions.length,
        all_candidate_sessions: candidateSessions.map(s => ({
          db_id: s.id,
          sessionId: s.sessionId,
          isActive: s.isActive,
          flowStatus: s.flowStatus,
          currentStepOrder: s.currentStepOrder,
          waitingForReply: s.waitingForReply,
          updated_date: s.updated_date
        })),
        selected_session: selectedSession ? {
          db_id: selectedSession.id,
          sessionId: selectedSession.sessionId,
          isActive: selectedSession.isActive,
          flowStatus: selectedSession.flowStatus,
          currentStepOrder: selectedSession.currentStepOrder,
          updated_date: selectedSession.updated_date
        } : null,
        resolved_sessionId: selectedSession?.sessionId || null,
        foundSession: !!selectedSession
      },
      pre_save_analysis: {
        sessionId_would_be_attached: !!selectedSession?.sessionId,
        sessionId_value: selectedSession?.sessionId || null,
        aiProcessed_pre_save: false, // always false at initial save; set to true by FLOW branch immediately after
        replyStatus_initial: 'pending',
        replyProducer_initial: null
      },
      diag_events_found_near_inbound: nearbyDiagLogs.length,
      webhook_diag_events: webhookEvents.map(l => ({
        event_type: l.payload?.flowEvent || l.event,
        created_at: l.created_date,
        payload_summary: l.payload
      })),
      owner_diag_event: ownerDiag?.payload || null,
      flow_route_diag_event: flowRouteDiag?.payload || null
    };

    // ─────────────────────────────────────────────────────────────────────────
    // PART 2 — DB PERSISTED VALUES (fresh read)
    // ─────────────────────────────────────────────────────────────────────────
    trace.part2_db_persisted = {
      id: freshInbound.id,
      direction: freshInbound.direction,
      messageText: freshInbound.messageText,
      sessionId: freshInbound.sessionId,
      aiProcessed: freshInbound.aiProcessed,
      replyStatus: freshInbound.replyStatus,
      skipReason: freshInbound.skipReason,
      replyProducer: freshInbound.replyProducer,
      replyQueueId: freshInbound.replyQueueId,
      replyMessageId: freshInbound.replyMessageId,
      created_date: freshInbound.created_date,
      updated_date: freshInbound.updated_date,
      note: 'These are actual persisted DB values read after processing (not in-memory)'
    };

    // ─────────────────────────────────────────────────────────────────────────
    // PART 3 — RUNNER TRACE
    // ─────────────────────────────────────────────────────────────────────────

    // Was runner invoked? Check diag logs
    const runnerStartedLog = runnerEvents.find(l => l.payload?.flowEvent === 'INBOUND_ADVANCE_STARTED');
    const runnerMatchedLog = runnerEvents.find(l => l.payload?.flowEvent === 'INBOUND_MATCHED_TO_SESSION');
    const runnerAdvancedLog = runnerEvents.find(l => l.payload?.flowEvent === 'INBOUND_ADVANCE_SUCCESS');
    const runnerFailedLog = runnerEvents.find(l => l.payload?.flowEvent === 'INBOUND_ADVANCE_FAILED');
    const currentStepLog = runnerEvents.find(l => l.payload?.flowEvent === 'CURRENT_STEP_LOADED');
    const dedupLog = runnerEvents.find(l => l.payload?.flowEvent === 'QUEUE_UNIQUENESS_CHECK');
    const dupBlockedLog = runnerEvents.find(l => l.payload?.flowEvent === 'DUPLICATE_STEP_BLOCKED');
    const stepSentLog = runnerEvents.find(l => l.payload?.flowEvent === 'STEP_SENT');
    const flowCompletedLog = runnerEvents.find(l => l.payload?.flowEvent === 'FLOW_COMPLETED');
    const dupReplySkippedLog = runnerEvents.find(l => l.payload?.flowEvent === 'DUPLICATE_REPLY_SKIPPED');

    const runnerInvoked = !!runnerStartedLog;
    const runnerUsedSessionId = runnerMatchedLog?.payload?.sessionId || null;
    const runnerFoundSession = !!runnerMatchedLog?.payload?.stateId;
    const runnerCurrentStep = currentStepLog?.payload?.currentOrder || null;
    const runnerWaitForReply = currentStepLog?.payload?.waitForReply;

    // Check if step 1 was sent (potential resend of step 1)
    const step1SentLogs = runnerEvents.filter(l =>
      l.payload?.flowEvent === 'STEP_SENT' && l.payload?.stepOrder === 1
    );
    const runnerResentStep1 = step1SentLogs.length > 0;

    trace.part3_runner = {
      runner_invoked: runnerInvoked,
      invocation_note: runnerInvoked
        ? 'salesFlowRunner was invoked based on INBOUND_ADVANCE_STARTED diag log'
        : 'No INBOUND_ADVANCE_STARTED log found — runner may NOT have been invoked, or diag log is missing',
      payload_reconstructed: {
        leadId,
        inboundMessageId: inboundId,
        sessionId: selectedSession?.sessionId || null,
        continueFromReply: true
      },
      runner_state: {
        accepted_sessionId: runnerUsedSessionId,
        sessionId_match: runnerUsedSessionId === selectedSession?.sessionId,
        found_active_session: runnerFoundSession,
        current_step_at_advance: runnerCurrentStep,
        current_step_waitForReply: runnerWaitForReply,
        resent_step_1: runnerResentStep1,
        advanced_successfully: !!runnerAdvancedLog,
        failed_reason: runnerFailedLog?.payload?.reason || null,
        failed_detail: runnerFailedLog?.payload?.detail || null,
        flow_completed: !!flowCompletedLog,
        duplicate_reply_skipped: !!dupReplySkippedLog,
        duplicate_reply_skip_reason: dupReplySkippedLog?.payload?.reason || null
      },
      dedup: {
        ran: !!dedupLog,
        exact_key_used: dedupLog ? `flow_step_${dedupLog.payload?.stepOrder}` : null,
        step_order: dedupLog?.payload?.stepOrder || null,
        session_id: dedupLog?.payload?.sessionId || null,
        existing_total: dedupLog?.payload?.existingTotal,
        same_session_count: dedupLog?.payload?.sameSessionCount,
        any_pending_count: dedupLog?.payload?.anyPendingCount,
        blocked: dedupLog?.payload?.blocked,
        dedup_verdict: dupBlockedLog
          ? `BLOCKED: ${dupBlockedLog.payload?.reason}`
          : dedupLog
            ? 'PASSED'
            : 'NO_DEDUP_LOG_FOUND'
      },
      step_sent: stepSentLog ? {
        stepOrder: stepSentLog.payload?.stepOrder,
        queueId: stepSentLog.payload?.queueId,
        sessionId: stepSentLog.payload?.sessionId
      } : null,
      all_runner_diag_events: runnerEvents.map(l => ({
        event_type: l.payload?.flowEvent,
        created_at: l.created_date,
        payload_summary: l.payload
      }))
    };

    // ─────────────────────────────────────────────────────────────────────────
    // PART 4 — RELATED QUEUE TRACE
    // ─────────────────────────────────────────────────────────────────────────
    trace.part4_queue = {
      last_3_flow_queue_records: flowQueue.map(q => {
        const isLinkedToActiveSession = selectedSession
          ? q.session_id === selectedSession.sessionId
          : false;
        return {
          queue_id: q.id,
          created_at: q.created_date,
          status: q.status,
          session_id: q.session_id,
          template_key: q.template_key,
          context_id: q.context_id,
          context_type: q.context_type,
          to_phone_e164: q.to_phone_e164,
          rendered_text_preview: (q.rendered_text || '').slice(0, 80),
          scheduled_for: q.scheduled_for,
          error_message: q.error_message,
          provider_response_summary: q.provider_response
            ? (() => { try { return JSON.parse(q.provider_response); } catch { return q.provider_response?.slice(0, 200); } })()
            : null,
          is_linked_to_active_session: isLinkedToActiveSession
        };
      }),
      claim_for_latest_inbound: claim ? {
        claim_id: claim.id,
        inboundMessageId: claim.inboundMessageId,
        leadId: claim.leadId,
        claimedBy: claim.claimedBy,
        claimedAt: claim.claimedAt,
        queueId: claim.queueId,
        created_date: claim.created_date
      } : null,
      recent_lead_claims: claimByLead.map(c => ({
        claim_id: c.id,
        inboundMessageId: c.inboundMessageId,
        claimedBy: c.claimedBy,
        claimedAt: c.claimedAt,
        queueId: c.queueId,
        created_date: c.created_date
      })),
      active_session_queue_items: activeSessionQueueMatch.map(q => ({
        queue_id: q.id,
        template_key: q.template_key,
        status: q.status,
        session_id: q.session_id,
        created_at: q.created_date
      }))
    };

    // ─────────────────────────────────────────────────────────────────────────
    // PART 5 — VERDICT
    // ─────────────────────────────────────────────────────────────────────────
    const p2 = trace.part2_db_persisted;
    const p3 = trace.part3_runner;
    const p1 = trace.part1_webhook;

    let verdict = 'UNKNOWN';
    let explanation = 'Could not classify based on available data.';

    const sessionIdInDB = p2.sessionId;
    const aiProcessedInDB = p2.aiProcessed;
    const replyStatusInDB = p2.replyStatus;
    const skipReasonInDB = p2.skipReason;
    const claimExists = !!claim;
    const runnerRan = p3.runner_invoked;
    const sessionFoundAtWebhook = p1.session_resolution.foundSession;
    const resolvedSessionId = p1.session_resolution.resolved_sessionId;
    const sessionIdMatches = sessionIdInDB === resolvedSessionId;

    if (skipReasonInDB === 'FLOW_OWNER_BUT_NO_ACTIVE_SESSION') {
      verdict = 'SESSION_RESOLVE_FAILED';
      explanation = `Lead has activeResponderOwner=FLOW but no active LeadConversationState was found at webhook time. The inbound was explicitly skipped with skipReason=FLOW_OWNER_BUT_NO_ACTIVE_SESSION. No runner was invoked. This is the break point: the session either was never started or was stopped/completed before this inbound arrived.`;

    } else if (sessionFoundAtWebhook && resolvedSessionId && !sessionIdInDB) {
      verdict = 'SESSION_FOUND_BUT_NOT_SAVED';
      explanation = `A session was resolved at webhook time (sessionId=${resolvedSessionId}) but the DB record shows sessionId=null. The session ID was not persisted to the LeadMessageThread record. This is a save failure or race condition.`;

    } else if (sessionFoundAtWebhook && sessionIdInDB && !sessionIdMatches) {
      verdict = 'SESSION_SAVED_BUT_NOT_PERSISTED';
      explanation = `Webhook resolved sessionId=${resolvedSessionId} but DB shows sessionId=${sessionIdInDB}. These do not match. Possible stale session ID or race.`;

    } else if (!runnerRan && lead.activeResponderOwner === 'FLOW') {
      verdict = 'RUNNER_NOT_INVOKED';
      explanation = `Lead is FLOW-owned and a session was ${sessionFoundAtWebhook ? 'found' : 'NOT found'}, but no INBOUND_ADVANCE_STARTED diag log was found. salesFlowRunner was not invoked, OR the invocation failed before logging.`;

    } else if (runnerRan && p3.runner_state.accepted_sessionId === null) {
      verdict = 'RUNNER_INVOKED_WITHOUT_SESSION';
      explanation = `salesFlowRunner was invoked but the sessionId passed was null. The runner may have used legacy fallback (sessionId='legacy'). Check if the inbound message had sessionId attached.`;

    } else if (runnerRan && p3.runner_state.resent_step_1) {
      verdict = 'RUNNER_RESENT_STEP_1';
      explanation = `salesFlowRunner ran and sent step 1 again. This indicates either a restart, or the runner did not recognize the existing session and sent from the beginning.`;

    } else if (runnerRan && p3.dedup.blocked === true) {
      verdict = 'DEDUP_FAILED';
      explanation = `salesFlowRunner ran but was blocked by duplicate detection. Dedup key: ${p3.dedup.exact_key_used}. Reason: ${p3.dedup.dedup_verdict}. The step was already queued — runner did not produce a new outbound.`;

    } else if (skipReasonInDB === 'FLOW_NO_ENGINE_CLAIMED') {
      verdict = 'RUNNER_NOT_INVOKED';
      explanation = `Post-run guard fired: salesFlowRunner was invoked but created no OutboundReplyClaim. skipReason=FLOW_NO_ENGINE_CLAIMED was set. Check runner diag logs for the exact failure inside the runner.`;

    } else if (!claimExists && runnerRan && replyStatusInDB !== 'skipped') {
      verdict = 'DEDUP_FAILED';
      explanation = `Runner ran (diag logs confirm) but no OutboundReplyClaim was found for this inbound. replyStatus is ${replyStatusInDB} (not skipped). The runner advanced but claim was never written, or dedup blocked silently.`;

    } else if (claimExists && replyStatusInDB === 'pending') {
      verdict = 'UI_STALE_BUT_DB_CORRECT';
      explanation = `Claim exists and runner ran. DB replyStatus is 'pending' — the claim was created but the inbound thread was not updated to reflect final status. Queue may be processing normally.`;

    } else if (claimExists && ['queued', 'sent'].includes(replyStatusInDB)) {
      verdict = 'UI_STALE_BUT_DB_CORRECT';
      explanation = `Claim exists, replyStatus=${replyStatusInDB}. System appears to have handled this correctly. Any issue may be in UI display only, not in actual processing.`;
    }

    trace.part5_verdict = {
      verdict,
      explanation,
      key_facts: {
        inbound_id: inboundId,
        owner: lead.activeResponderOwner,
        session_found_at_webhook: sessionFoundAtWebhook,
        resolved_sessionId_at_webhook: resolvedSessionId,
        sessionId_in_db: sessionIdInDB,
        aiProcessed_in_db: aiProcessedInDB,
        replyStatus_in_db: replyStatusInDB,
        skipReason_in_db: skipReasonInDB,
        claim_exists: claimExists,
        claim_id: claim?.id || null,
        runner_invoked: runnerRan,
        runner_advanced: p3.runner_state.advanced_successfully,
        runner_failed_reason: p3.runner_state.failed_reason,
        dedup_blocked: p3.dedup.blocked,
        dedup_verdict: p3.dedup.dedup_verdict,
        step_sent: p3.step_sent
      }
    };

    return Response.json({
      ...trace,
      confirmation: 'NO LOGIC, DATA, ROUTING, SESSION, QUEUE, OR SEND BEHAVIOR WAS MODIFIED'
    });

  } catch (error) {
    return Response.json({
      error: error.message,
      stack: error.stack,
      confirmation: 'NO LOGIC, DATA, ROUTING, SESSION, QUEUE, OR SEND BEHAVIOR WAS MODIFIED'
    }, { status: 500 });
  }
});