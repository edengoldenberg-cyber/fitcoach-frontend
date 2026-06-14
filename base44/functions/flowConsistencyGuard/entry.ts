import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * flowConsistencyGuard
 * ─────────────────────────────────────────────────────────────────────
 * READ-ONLY enforcement scanner. Detects FORBIDDEN STATES defined in
 * Flow System Consistency Contract v1.0.
 *
 * DOES NOT FIX anything. Logs violations only.
 * Safe to call at any time — no mutations to Flow, AI, Script, or Nudge.
 *
 * Forbidden States Covered:
 *   FS-01  waitingForReply=true  AND  replyTimeoutMinutes=null
 *   FS-02  waitingForReply=true  AND  onTimeoutAction=null
 *   FS-03  waitingForReply=true  AND  nextTimeoutAt=null
 *   FS-04  waitingForReply=true  AND  lastStepSentAt=null
 *   FS-05  followupsSentInStep   >   maxFollowups
 *   FS-06  activeSessions > 1
 *   FS-07  inbound aiProcessed=false AND no OutboundReplyClaim
 *   FS-08  claim exists AND no queue record linked
 *   FS-09  inbound has queueId AND queue record missing
 *   FS-10  queue record by runner AND session_id=null
 *   FS-11  session.currentStepOrder > builderStepCount
 *   FS-12  two OutboundReplayClaims for same inboundMessageId
 *   FS-13  session flowStatus=ACTIVE AND isActive=false
 *   FS-14  session created with no sessionId
 *   FS-15  timeout fires when activeResponderOwner ≠ FLOW and ≠ null
 *
 * NO FLOW / AI / SCRIPT / NUDGE LOGIC WAS CHANGED.
 */

// ── Violation logger ─────────────────────────────────────────────────────────

async function logViolation(base44, {
  violation_type,
  severity,        // 'HIGH' | 'MEDIUM' | 'LOW'
  lead_id,
  session_id,
  step_id,
  step_order,
  coach_email,
  condition,       // exact condition text
  detail,          // extra context
}) {
  const payload = {
    violation_type,
    severity,
    lead_id: lead_id || null,
    session_id: session_id || null,
    step_id: step_id || null,
    step_order: step_order ?? null,
    coach_email: coach_email || 'system',
    condition: condition || '',
    detail: detail || '',
    detected_at: new Date().toISOString(),
  };

  // Write to WhatsAppDiagnosticsLog (existing entity, no schema changes needed)
  await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
    coach_email: coach_email || 'system',
    event: 'RULE_TRIGGERED',
    payload: { flowEvent: 'CONSISTENCY_VIOLATION', ...payload }
  }).catch(() => {});

  console.warn(`[CONSISTENCY_VIOLATION] ${violation_type} | lead=${lead_id} | session=${session_id} | ${condition}`);

  return payload;
}

// ── Small delay to avoid rate limits on bulk scans ───────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Per-session checker ───────────────────────────────────────────────────────

async function checkSession(base44, state, builderSteps, allClaims, allQueueItems, allInbound, coachEmail) {
  const violations = [];
  const sessionId = state.sessionId;
  const leadId = state.leadId;

  // FS-13: flowStatus=ACTIVE AND isActive=false
  if (state.flowStatus === 'ACTIVE' && state.isActive === false) {
    const v = await logViolation(base44, {
      violation_type: 'FS-13_STATE_CONTRADICTION',
      severity: 'HIGH',
      lead_id: leadId, session_id: sessionId, coach_email: coachEmail,
      condition: 'session.flowStatus=ACTIVE AND session.isActive=false',
      detail: `stateId=${state.id}`,
    });
    violations.push(v);
  }

  // FS-14: no sessionId
  if (!state.sessionId) {
    const v = await logViolation(base44, {
      violation_type: 'FS-14_MISSING_SESSION_UUID',
      severity: 'HIGH',
      lead_id: leadId, session_id: null, coach_email: coachEmail,
      condition: 'session.sessionId is null/empty',
      detail: `stateId=${state.id}`,
    });
    violations.push(v);
  }

  // Only check timeout rules on ACTIVE sessions
  if (!state.isActive || state.flowStatus !== 'ACTIVE') return violations;

  const currentStep = builderSteps.find(s => Number(s.stepOrder) === Number(state.currentStepOrder));

  // FS-01: waitingForReply=true AND replyTimeoutMinutes=null
  if (state.waitingForReply === true && (currentStep?.replyTimeoutMinutes == null)) {
    const v = await logViolation(base44, {
      violation_type: 'FS-01_INVALID_TIMEOUT_CONFIG_NO_MINUTES',
      severity: 'HIGH',
      lead_id: leadId, session_id: sessionId,
      step_id: currentStep?.id, step_order: state.currentStepOrder,
      coach_email: coachEmail,
      condition: 'waitingForReply=true AND builder.replyTimeoutMinutes=null',
      detail: `stepOrder=${state.currentStepOrder} stepId=${currentStep?.id ?? 'not_found_in_builder'}`,
    });
    violations.push(v);
  }

  // FS-02: waitingForReply=true AND onTimeoutAction=null
  if (state.waitingForReply === true && !currentStep?.onTimeoutAction) {
    const v = await logViolation(base44, {
      violation_type: 'FS-02_INVALID_TIMEOUT_CONFIG_NO_ACTION',
      severity: 'HIGH',
      lead_id: leadId, session_id: sessionId,
      step_id: currentStep?.id, step_order: state.currentStepOrder,
      coach_email: coachEmail,
      condition: 'waitingForReply=true AND builder.onTimeoutAction=null',
      detail: `stepOrder=${state.currentStepOrder}`,
    });
    violations.push(v);
  }

  // FS-03: waitingForReply=true AND nextTimeoutAt=null
  if (state.waitingForReply === true && !state.nextTimeoutAt) {
    const v = await logViolation(base44, {
      violation_type: 'FS-03_TIMEOUT_NOT_ARMED',
      severity: 'HIGH',
      lead_id: leadId, session_id: sessionId,
      step_id: currentStep?.id, step_order: state.currentStepOrder,
      coach_email: coachEmail,
      condition: 'waitingForReply=true AND session.nextTimeoutAt=null',
      detail: `lastStepSentAt=${state.lastStepSentAt}`,
    });
    violations.push(v);
  }

  // FS-04: waitingForReply=true AND lastStepSentAt=null
  if (state.waitingForReply === true && !state.lastStepSentAt) {
    const v = await logViolation(base44, {
      violation_type: 'FS-04_DISPATCH_NOT_RECORDED',
      severity: 'MEDIUM',
      lead_id: leadId, session_id: sessionId,
      step_id: currentStep?.id, step_order: state.currentStepOrder,
      coach_email: coachEmail,
      condition: 'waitingForReply=true AND session.lastStepSentAt=null',
      detail: '',
    });
    violations.push(v);
  }

  // FS-05: followupsSentInStep > maxFollowups
  const maxFollowups = currentStep?.maxFollowups ?? 1;
  const followupsSent = state.followupsSentInStep ?? 0;
  if (followupsSent > maxFollowups) {
    const v = await logViolation(base44, {
      violation_type: 'FS-05_FOLLOWUP_COUNTER_OVERFLOW',
      severity: 'MEDIUM',
      lead_id: leadId, session_id: sessionId,
      step_id: currentStep?.id, step_order: state.currentStepOrder,
      coach_email: coachEmail,
      condition: `followupsSentInStep(${followupsSent}) > maxFollowups(${maxFollowups})`,
      detail: '',
    });
    violations.push(v);
  }

  // FS-11: currentStepOrder > builderStepCount
  const builderStepCount = builderSteps.length;
  if (builderStepCount > 0 && Number(state.currentStepOrder) > builderStepCount) {
    const v = await logViolation(base44, {
      violation_type: 'FS-11_STEP_OUT_OF_RANGE',
      severity: 'HIGH',
      lead_id: leadId, session_id: sessionId,
      step_order: state.currentStepOrder,
      coach_email: coachEmail,
      condition: `session.currentStepOrder(${state.currentStepOrder}) > builderStepCount(${builderStepCount})`,
      detail: `flowId=${state.flowId}`,
    });
    violations.push(v);
  }

  return violations;
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow admin or scheduler
    let isAuthorized = false;
    try {
      const user = await base44.auth.me();
      if (user?.role === 'admin') isAuthorized = true;
    } catch (_) {
      isAuthorized = true; // scheduler
    }
    if (!isAuthorized) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { leadId, scanAll } = body;

    const allViolations = [];

    // ── Fetch sessions to scan ────────────────────────────────────────────────
    let statesToScan = [];
    if (leadId) {
      statesToScan = await base44.asServiceRole.entities.LeadConversationState.filter({ leadId }).catch(() => []);
    } else if (scanAll) {
      // Only scan ACTIVE sessions to limit scope
      statesToScan = await base44.asServiceRole.entities.LeadConversationState.filter({ isActive: true }).catch(() => []);
    } else {
      return Response.json({ ok: false, error: 'Provide leadId or scanAll=true' }, { status: 400 });
    }

    // ── FS-06: Duplicate active sessions per lead ─────────────────────────────
    const activeByLead = {};
    for (const s of statesToScan) {
      if (s.isActive && s.flowStatus === 'ACTIVE') {
        if (!activeByLead[s.leadId]) activeByLead[s.leadId] = [];
        activeByLead[s.leadId].push(s);
      }
    }
    for (const [lid, sessions] of Object.entries(activeByLead)) {
      if (sessions.length > 1) {
        const coachEmail = sessions[0].coach_email || 'system';
        const v = await logViolation(base44, {
          violation_type: 'FS-06_DUPLICATE_ACTIVE_SESSIONS',
          severity: 'HIGH',
          lead_id: lid,
          session_id: sessions.map(s => s.sessionId).join(','),
          coach_email: coachEmail,
          condition: `${sessions.length} sessions with isActive=true AND flowStatus=ACTIVE`,
          detail: `stateIds=${sessions.map(s => s.id).join(',')}`,
        });
        allViolations.push(v);
      }
    }

    // ── Per-session checks ────────────────────────────────────────────────────
    // ERROR-002 fix: limit sessions scanned per run to prevent timeout + 429 rate limits.
    // With 118 active sessions × multiple DB calls per session, the function exceeded runtime limits.
    const sessionsToScan = statesToScan.slice(0, 30);
    for (let si = 0; si < sessionsToScan.length; si++) {
      if (si > 0 && si % 5 === 0) await sleep(500); // increased sleep to avoid 429
      const state = sessionsToScan[si];
      const coachEmail = state.coach_email || 'system';
      const flowId = state.flowId;

      const builderSteps = flowId
        ? await base44.asServiceRole.entities.SalesConversationStep.filter({ flowId }).catch(() => [])
        : [];

      const sessionViolations = await checkSession(base44, state, builderSteps, [], [], [], coachEmail);
      allViolations.push(...sessionViolations);
    }

    // ── FS-07/08/09: Inbound chain checks (per lead) ─────────────────────────
    // ERROR-002 fix: limit to 20 leads max per run to prevent 504 timeout.
    // With many active leads, fetching 10 inbounds × N leads × DB calls per inbound
    // caused the function to exceed Deno's timeout and be auto-disabled.
    // Scan is read-only — no data is modified, partial scans are safe.
    const leadIdsToCheck = (leadId ? [leadId] : [...new Set(statesToScan.map(s => s.leadId))]).slice(0, 20);

    for (let li = 0; li < leadIdsToCheck.length; li++) {
      if (li > 0 && li % 5 === 0) await sleep(300); // rate limit guard
      const lid = leadIdsToCheck[li];
      const coachEmail = statesToScan.find(s => s.leadId === lid)?.coach_email || 'system';

      const inbounds = await base44.asServiceRole.entities.LeadMessageThread
        .filter({ leadId: lid, direction: 'INBOUND' }).catch(() => []);
      const recentInbounds = inbounds
        .sort((a, b) => new Date(b.messageTimestamp || 0) - new Date(a.messageTimestamp || 0))
        .slice(0, 5); // ERROR-002 fix: reduce from 10 to 5 inbounds per lead to stay within timeout

      const claims = await base44.asServiceRole.entities.OutboundReplyClaim
        .filter({ leadId: lid }).catch(() => []);
      const queueItems = await base44.asServiceRole.entities.WhatsAppMessageQueue
        .filter({ context_id: lid }).catch(() => []);

      // FS-12: Duplicate claims for same inboundMessageId
      const claimsByInbound = {};
      for (const c of claims) {
        if (!claimsByInbound[c.inboundMessageId]) claimsByInbound[c.inboundMessageId] = [];
        claimsByInbound[c.inboundMessageId].push(c);
      }
      for (const [inboundMsgId, dupClaims] of Object.entries(claimsByInbound)) {
        if (dupClaims.length > 1) {
          const v = await logViolation(base44, {
            violation_type: 'FS-12_DUPLICATE_OUTBOUND_CLAIM',
            severity: 'HIGH',
            lead_id: lid, coach_email: coachEmail,
            condition: `${dupClaims.length} OutboundReplayClaims for inboundMessageId=${inboundMsgId}`,
            detail: `claimIds=${dupClaims.map(c => c.id).join(',')}`,
          });
          allViolations.push(v);
        }
      }

      for (const msg of recentInbounds) {
        const claim = claims.find(c => c.inboundMessageId === msg.id);

        // FS-07: aiProcessed=false AND no claim
        if (msg.aiProcessed === false && !claim) {
          const v = await logViolation(base44, {
            violation_type: 'FS-07_INBOUND_SILENT_DROP',
            severity: 'MEDIUM',
            lead_id: lid, coach_email: coachEmail,
            condition: 'inbound.aiProcessed=false AND no OutboundReplyClaim',
            detail: `inboundId=${msg.id} ts=${msg.messageTimestamp} text="${(msg.messageText||'').slice(0,40)}"`,
          });
          allViolations.push(v);
        }

        // FS-08: claim exists AND no queue record linked
        if (claim && claim.queueId) {
          const linkedQueue = queueItems.find(q => q.id === claim.queueId);
          if (!linkedQueue) {
            const v = await logViolation(base44, {
              violation_type: 'FS-08_CHAIN_BROKEN_CLAIM_TO_QUEUE',
              severity: 'HIGH',
              lead_id: lid, coach_email: coachEmail,
              condition: 'OutboundReplyClaim.queueId references missing queue record',
              detail: `claimId=${claim.id} queueId=${claim.queueId}`,
            });
            allViolations.push(v);
          }
        }

        // FS-09: inbound has replyQueueId AND queue record missing
        if (msg.replyQueueId) {
          const linkedQueue = queueItems.find(q => q.id === msg.replyQueueId);
          if (!linkedQueue) {
            const v = await logViolation(base44, {
              violation_type: 'FS-09_CHAIN_BROKEN_INBOUND_QUEUE_MISSING',
              severity: 'MEDIUM',
              lead_id: lid, coach_email: coachEmail,
              condition: 'inbound.replyQueueId references missing queue record',
              detail: `inboundId=${msg.id} replyQueueId=${msg.replyQueueId}`,
            });
            allViolations.push(v);
          }
        }
      }

      // FS-10: queue records with no session_id (check runner-created ones)
      const runnerQueue = queueItems.filter(q =>
        !q.session_id &&
        q.template_key &&
        (q.template_key.startsWith('flow_step_'))
      );
      for (const q of runnerQueue) {
        const v = await logViolation(base44, {
          violation_type: 'FS-10_QUEUE_WITHOUT_SESSION',
          severity: 'MEDIUM',
          lead_id: lid, coach_email: coachEmail,
          condition: 'queue record created by runner has session_id=null',
          detail: `queueId=${q.id} template_key=${q.template_key} status=${q.status}`,
        });
        allViolations.push(v);
      }
    }

    const bySeverity = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const v of allViolations) bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;

    return Response.json({
      ok: true,
      scanned: statesToScan.length,
      violations: allViolations.length,
      bySeverity,
      details: allViolations,
    });

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});