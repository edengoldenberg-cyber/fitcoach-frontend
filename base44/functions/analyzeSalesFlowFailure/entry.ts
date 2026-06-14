import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const { leadId } = await req.json();
    if (!leadId) return Response.json({ ok: false, error: 'leadId required' }, { status: 400 });

    // ── Gather all data ─────────────────────────────────────────────────
    const [lead, allStates, queueItems, threadMessages, diagLogs] = await Promise.all([
      base44.asServiceRole.entities.Lead.list().then(l => l.find(x => x.id === leadId)).catch(() => null),
      base44.asServiceRole.entities.LeadConversationState.filter({ leadId }).catch(() => []),
      base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ context_id: leadId }).catch(() => []),
      base44.asServiceRole.entities.LeadMessageThread.filter({ leadId }).catch(() => []),
      base44.asServiceRole.entities.WhatsAppDiagnosticsLog.filter({ coach_email: 'system' })
        .then(logs => logs.filter(l => l.payload?.leadId === leadId).sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 80))
        .catch(() => []),
    ]);

    // Also try coach-scoped logs
    const coachEmail = lead?.coach_email;
    const coachLogs = coachEmail
      ? await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.filter({ coach_email: coachEmail })
          .then(logs => logs.filter(l => l.payload?.leadId === leadId).sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 80))
          .catch(() => [])
      : [];

    // Merge and deduplicate logs
    const allLogs = [...diagLogs, ...coachLogs]
      .filter((l, i, arr) => arr.findIndex(x => x.id === l.id) === i)
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

    // Flow steps for active state
    const activeState = allStates.find(s => s.isActive && s.flowStatus === 'ACTIVE')
      || allStates.sort((a, b) => new Date(b.lastFlowActionAt || 0) - new Date(a.lastFlowActionAt || 0))[0];

    const flowSteps = activeState?.flowId
      ? await base44.asServiceRole.entities.SalesConversationStep.filter({ flowId: activeState.flowId }).catch(() => [])
      : [];

    // ── Analysis helpers ────────────────────────────────────────────────
    const activeStates = allStates.filter(s => s.isActive && s.flowStatus === 'ACTIVE');
    const historicalStates = allStates.filter(s => !(s.isActive && s.flowStatus === 'ACTIVE'));
    const inboundMsgs = threadMessages.filter(m => m.direction === 'INBOUND').sort((a, b) => new Date(b.messageTimestamp || b.created_date) - new Date(a.messageTimestamp || a.created_date));
    const outboundMsgs = threadMessages.filter(m => m.direction === 'OUTBOUND').sort((a, b) => new Date(b.messageTimestamp || b.created_date) - new Date(a.messageTimestamp || a.created_date));
    const lastInbound = inboundMsgs[0];
    const lastOutbound = outboundMsgs[0];

    // Queue by sessionId
    const queueBySession = {};
    for (const q of queueItems) {
      const sid = q.rendered_text?.match(/sid:([a-z0-9-]+)/)?.[1] || 'unknown';
      if (!queueBySession[sid]) queueBySession[sid] = [];
      queueBySession[sid].push(q);
    }

    // Queue by step
    const queueByStep = {};
    for (const q of queueItems) {
      const m = (q.template_key || '').match(/flow_step_(\d+)/);
      if (m) {
        const sn = parseInt(m[1]);
        if (!queueByStep[sn]) queueByStep[sn] = [];
        queueByStep[sn].push(q);
      }
    }

    // Duplicate detection
    const duplicateSteps = [];
    for (const [sn, items] of Object.entries(queueByStep)) {
      const active = items.filter(q => ['queued', 'sending', 'sent'].includes(q.status));
      if (active.length > 1) duplicateSteps.push({ step: sn, count: active.length });
    }

    // Log event lookups
    const findLog = (event) => allLogs.find(l => l.payload?.flowEvent === event);
    const lastFailLog = allLogs.find(l =>
      l.payload?.flowEvent === 'INBOUND_ADVANCE_FAILED' ||
      l.payload?.flowEvent === 'DUPLICATE_STEP_BLOCKED' ||
      l.payload?.flowEvent === 'FLOW_ADVANCE_FAILED'
    );
    const lastSuccessLog = findLog('INBOUND_ADVANCE_SUCCESS');
    const lastAdvanceStarted = findLog('INBOUND_ADVANCE_STARTED');
    const lastSessionCreated = findLog('SESSION_CREATED') || findLog('RESTART_NEW_SESSION_CREATED');

    // Timing analysis
    const lastInboundTime = lastInbound?.messageTimestamp ? new Date(lastInbound.messageTimestamp) : null;
    const lastActionTime = activeState?.lastFlowActionAt ? new Date(activeState.lastFlowActionAt) : null;
    const inboundNotAdvanced = lastInboundTime && lastActionTime && lastInboundTime > lastActionTime
      && Math.round((lastInboundTime - lastActionTime) / 60000) > 2;
    const minutesSinceInbound = lastInboundTime ? Math.round((Date.now() - lastInboundTime.getTime()) / 60000) : null;

    // Session mismatch
    const activeSessionId = activeState?.sessionId;
    const lastInboundLogSessionId = lastAdvanceStarted?.payload?.sessionId;
    const sessionMismatch = activeSessionId && lastInboundLogSessionId && activeSessionId !== lastInboundLogSessionId;

    // ── Determine root causes ───────────────────────────────────────────
    const rootCauses = [];
    const missingLogic = [];
    const recommendedFixes = [];
    let confidence = 'LOW';

    // 1. Multiple active states
    if (activeStates.length > 1) {
      rootCauses.push(`נמצאו ${activeStates.length} states פעילים במקביל — המערכת לא מכבה state קיים לפני יצירת חדש`);
      missingLogic.push('חסר ביצוע deactivation של כל ה-states הקיימים לפני יצירת session חדש');
      recommendedFixes.push('enforce one active state per lead: deactivate all before creating new session');
      confidence = 'HIGH';
    }

    // 2. Session mismatch between active state and last inbound handler
    if (sessionMismatch) {
      rootCauses.push(`ה-Inbound handler עבד על session ${lastInboundLogSessionId?.slice(-6)} אך ה-active state הוא ${activeSessionId?.slice(-6)} — sessionId לא מסונכרן`);
      missingLogic.push('inbound advancement מתחיל על sessionId ישן ולא על הפעיל ביותר');
      recommendedFixes.push('salesFlowRunner: always resolve session from DB at runtime, not from cached payload');
      confidence = 'HIGH';
    }

    // 3. Inbound received but step not advanced
    if (inboundNotAdvanced) {
      const mins = Math.round((lastInboundTime - lastActionTime) / 60000);
      rootCauses.push(`הודעה נכנסת התקבלה לפני ${mins} דקות אך השלב לא התקדם`);
      missingLogic.push('continueFromReply לא הצליח לזהות את ה-active state או את waitForReply=true בשלב הנוכחי');
      recommendedFixes.push('verify step.waitForReply=true on current step before attempting advance');
      if (confidence !== 'HIGH') confidence = 'HIGH';
    }

    // 4. Duplicate queue records
    if (duplicateSteps.length > 0) {
      rootCauses.push(`נמצאו כפילויות ב-queue: שלבים ${duplicateSteps.map(d => d.step).join(', ')} — אין uniqueness guard ביצירת queue items`);
      missingLogic.push('חסרה בדיקת uniqueness לפי leadId + stepOrder + sessionId לפני יצירת queue item');
      missingLogic.push('restart יוצר queue חדש ללא ביטול queue items של session קודם');
      recommendedFixes.push('before creating queue item: check existing queued/sending items for same step+session');
      recommendedFixes.push('on restart: cancel all queued items from previous sessions');
      if (confidence !== 'HIGH') confidence = 'HIGH';
    }

    // 5. Last fail reason from logs
    if (lastFailLog && !rootCauses.length) {
      const reason = lastFailLog.payload?.reason || lastFailLog.payload?.detail || lastFailLog.payload?.flowEvent;
      rootCauses.push(`כשל מוכר מהלוגים: ${reason}`);
      missingLogic.push('ראה event: ' + lastFailLog.payload?.flowEvent);
      recommendedFixes.push('טפל בשגיאה: ' + reason);
      confidence = 'MEDIUM';
    }

    // 6. No active state at all
    if (allStates.length === 0) {
      rootCauses.push('אין LeadConversationState בכלל — Flow מעולם לא הופעל עבור ליד זה');
      missingLogic.push('salesFlowRunner לא נקרא או נקרא לפני שיש active flow');
      recommendedFixes.push('trigger salesFlowRunner with action=start for this lead');
      confidence = 'HIGH';
    } else if (activeStates.length === 0) {
      rootCauses.push(`יש ${allStates.length} state/s היסטוריים אך אף אחד לא active — ה-flow הסתיים או נעצר`);
      missingLogic.push('flowStatus הוא ' + (allStates[0]?.flowStatus || 'STOPPED/COMPLETED') + ' ולכן inbound advance לא פועל');
      recommendedFixes.push('restart the flow or check why it was stopped');
      if (confidence === 'LOW') confidence = 'MEDIUM';
    }

    // 7. Flow step wait mismatch
    if (activeState && flowSteps.length > 0) {
      const currentStep = flowSteps.find(s => s.stepOrder === activeState.currentStepOrder);
      if (currentStep && !currentStep.waitForReply && inboundMsgs.length > 0) {
        rootCauses.push(`השלב הנוכחי (${activeState.currentStepOrder}) אינו מוגדר waitForReply=true — הודעה נכנסת לא יכולה לקדם שלב כזה`);
        missingLogic.push('continueFromReply דורש waitForReply=true על השלב הנוכחי לפני שיוצא advance');
        recommendedFixes.push(`set waitForReply=true on step ${activeState.currentStepOrder} in SalesConversationFlow editor`);
        if (confidence === 'LOW') confidence = 'MEDIUM';
      }
    }

    if (rootCauses.length === 0) {
      rootCauses.push('לא זוהה כשל ברור — Flow נראה תקין');
      confidence = 'LOW';
    }

    // ── Build evidence ───────────────────────────────────────────────────
    const evidence = {
      activeStateId: activeState?.id || null,
      activeStateSessionId: activeState?.sessionId || null,
      activeStateStep: activeState ? `${activeState.currentStepOrder}/${activeState.totalSteps}` : null,
      activeStateStatus: activeState?.flowStatus || null,
      historicalStateIds: historicalStates.map(s => s.id),
      totalStatesCount: allStates.length,
      activeStatesCount: activeStates.length,
      duplicateQueueSteps: duplicateSteps,
      totalQueueItems: queueItems.length,
      inboundCount: inboundMsgs.length,
      lastInboundAt: lastInbound?.messageTimestamp || null,
      lastInboundText: (lastInbound?.messageText || '').slice(0, 80),
      lastOutboundAt: lastOutbound?.messageTimestamp || null,
      lastAdvanceSuccessAt: lastSuccessLog?.created_date || null,
      lastFailReason: lastFailLog ? (lastFailLog.payload?.reason || lastFailLog.payload?.detail || lastFailLog.payload?.flowEvent) : null,
      sessionMismatch,
      inboundNotAdvanced,
      minutesSinceInbound,
      lastSessionCreatedAt: lastSessionCreated?.created_date || null,
      flowStepsCount: flowSteps.length,
      currentStepWaitForReply: activeState
        ? (flowSteps.find(s => s.stepOrder === activeState.currentStepOrder)?.waitForReply ?? null)
        : null,
    };

    return Response.json({
      ok: true,
      leadId,
      rootCauses,
      missingLogic,
      recommendedFixes,
      confidence,
      evidence,
    });

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});