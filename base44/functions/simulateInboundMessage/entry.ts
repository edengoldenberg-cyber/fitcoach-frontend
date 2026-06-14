import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const steps = [];

  try {
    const base44 = createClientFromRequest(req);

    // Admin check
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      isAdmin = user?.role === 'admin';
    } catch (_) {}
    if (!isAdmin) return Response.json({ ok: false, error: 'Forbidden: admin only', step: 'AUTH' }, { status: 403 });

    const body = await req.json();
    const { leadId, messageText = 'בדיקת מערכת' } = body;
    if (!leadId) return Response.json({ ok: false, error: 'Missing leadId', step: 'VALIDATION' }, { status: 400 });

    // ── Step 1: Find lead ─────────────────────────────────────────────────
    const leads = await base44.asServiceRole.entities.Lead.list('-created_date', 1000);
    const lead = leads.find(l => l.id === leadId);
    if (!lead) {
      return Response.json({ ok: false, error: `Lead not found: ${leadId}`, step: 'LEAD_LOOKUP', steps });
    }
    steps.push({ step: 'LEAD_FOUND', ok: true, data: { status: lead.status, phoneE164: lead.phoneE164 } });

    const coachEmail = lead.coach_email || 'system';
    const now = new Date().toISOString();

    // ── Step 2: Check existing flow state ────────────────────────────────
    const existingStates = await base44.asServiceRole.entities.LeadConversationState.filter({ leadId }).catch(() => []);
    const activeState = existingStates.find(s => s.isActive && s.flowStatus === 'ACTIVE');
    steps.push({
      step: 'FLOW_STATE_CHECK', ok: true,
      data: { totalStates: existingStates.length, hasActiveState: !!activeState, currentStep: activeState?.currentStepOrder }
    });

    if (!activeState && existingStates.length === 0) {
      steps.push({ step: 'FLOW_STATE_WARNING', ok: false, data: { tip: 'No flow state exists. Click "Start Conversation" before sending a test message.' } });
    }

    // ── Step 3: Store inbound message ─────────────────────────────────────
    // Stamp sessionId + AI-block flags at create time if active Flow session exists
    const hasActiveFlow = !!activeState && activeState.flowStatus === 'ACTIVE';
    let savedId = null;
    const saved = await base44.asServiceRole.entities.LeadMessageThread.create({
      leadId: lead.id,
      coach_email: coachEmail,
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      senderType: 'LEAD',
      messageText: messageText || 'בדיקת מערכת',
      messageTimestamp: now,
      providerMessageId: `sim_${Date.now()}`,
      // ── SESSION LINKAGE + AI RACE PREVENTION ──────────────────────────────
      ...(hasActiveFlow ? {
        sessionId: activeState.sessionId,
        aiProcessed: true,
        replyProducer: 'salesFlowRunner',
        replyStatus: 'pending'
      } : {})
    });
    savedId = saved?.id;
    steps.push({ step: 'MESSAGE_STORED', ok: true, data: { savedId, messageText, sessionIdStamped: hasActiveFlow ? activeState.sessionId : null } });

    // ── Step 4: Update lead status + Initialize script session if needed ────
    const lowerText = (messageText || '').toLowerCase();
    const isOptOut = ['לא מעוניין', 'תפסיקו', 'הסר', 'stop'].some(kw => lowerText.includes(kw));
    
    // Initialize script session on FIRST inbound message
    let scriptInitialized = false;
    if (!lead.scriptSessionId && savedId) {
      try {
        const allScripts = await base44.asServiceRole.entities.SalesScript.list('-created_date', 50).catch(() => []);
        const mainScript = allScripts.find(s => 
          s.coach_email === coachEmail && 
          s.script_type === 'main' && 
          s.is_active === true && 
          s.script_enabled !== false
        );
        
        if (mainScript) {
          const scriptSessionId = `sess_${leadId.slice(-8)}_${Date.now()}`;
          await base44.asServiceRole.entities.Lead.update(leadId, {
            scriptSessionId,
            scriptStartedAt: now,
            currentScriptStage: 1,
            activeScriptId: mainScript.id,
            activeScriptType: 'main'
          }).catch(() => {});
          scriptInitialized = true;
          steps.push({ step: 'SCRIPT_SESSION_INITIALIZED', ok: true, data: { scriptSessionId, scriptName: mainScript.name } });
        }
      } catch (scriptErr) {
        console.warn('[SIMULATOR] Script initialization warning:', scriptErr.message);
        steps.push({ step: 'SCRIPT_INITIALIZATION_WARNING', ok: false, data: { error: scriptErr.message } });
      }
    }
    
    await base44.asServiceRole.entities.Lead.update(leadId, {
      lastInboundAt: now,
      status: isOptOut ? 'CLOSED' : 'INTERESTED',
      waOptOut: isOptOut,
    }).catch(() => {});
    steps.push({ step: 'LEAD_UPDATED', ok: true, data: { newStatus: isOptOut ? 'CLOSED' : 'INTERESTED', scriptInitialized } });

    // ── Step 5: Log event ─────────────────────────────────────────────────
    await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
      coach_email: coachEmail,
      event: 'RULE_TRIGGERED',
      payload: { flowEvent: 'SIMULATED_INBOUND', leadId, messageText, savedId }
    }).catch(() => {});
    steps.push({ step: 'LOG_CREATED', ok: true });

    // ── Step 6: SIMULATOR REPLY PROCESSING — INLINED FLOW ADVANCE LOGIC ──
    // Inline the critical logic from salesFlowRunner to avoid 403 errors
    let flowResult = null;
    let flowError = null;
    let replyProducer = 'salesFlowRunner_inlined';

    try {
      console.log('[SIMULATOR] Processing reply via inlined flow advancement');
      steps.push({ step: 'SIMULATOR_REPLY_PROCESSING', ok: true, data: { mode: 'inlined_flow_advance' } });

      // Get active state
      if (!activeState) {
        flowError = 'NO_ACTIVE_FLOW_STATE';
        steps.push({ step: 'FLOW_ADVANCE_ERROR', ok: false, error: flowError });
      } else {
        const sessionId = activeState.sessionId || 'legacy';
        const stateFlowId = activeState.flowId;

        // Load steps
        const allSteps = await base44.asServiceRole.entities.SalesConversationStep.filter({ flowId: stateFlowId }).catch(() => []);
        const stepsForState = allSteps.sort((a, b) => a.stepOrder - b.stepOrder);

        const currentOrder = Number(activeState.currentStepOrder) || 1;
        const nextStep = stepsForState.find(s => Number(s.stepOrder) === currentOrder + 1);

        if (!nextStep) {
          // Flow completed
          await base44.asServiceRole.entities.LeadConversationState.update(activeState.id, {
            isActive: false,
            flowStatus: 'COMPLETED',
            lastFlowActionAt: new Date().toISOString()
          }).catch(() => {});

          steps.push({ step: 'FLOW_COMPLETED', ok: true, data: { totalSteps: stepsForState.length } });
          flowResult = { ok: true, done: true, reason: 'flow_completed' };
        } else {
          // Advance to next step
          const flowRec = await base44.asServiceRole.entities.SalesConversationFlow.filter({ id: stateFlowId }).catch(() => []);
          const activeFlow = flowRec[0];

          steps.push({ step: 'NEXT_STEP_FOUND', ok: true, data: { nextStepOrder: nextStep.stepOrder, totalSteps: stepsForState.length } });

          // Update state
          await base44.asServiceRole.entities.LeadConversationState.update(activeState.id, {
            currentStepId: nextStep.id,
            currentStepOrder: nextStep.stepOrder,
            currentStepMessage: nextStep.messageText,
            isActive: true,
            flowStatus: 'ACTIVE',
            lastFlowActionAt: new Date().toISOString()
          }).catch(() => {});

          steps.push({ step: 'STATE_ADVANCED', ok: true, data: { toStep: nextStep.stepOrder } });

          // Render message
          const renderedText = (nextStep.messageText || '')
            .replace(/\{\{name\}\}/g, lead.firstName || 'שלום')
            .replace(/\{\{firstName\}\}/g, lead.firstName || 'שלום')
            .replace(/\{\{phone\}\}/g, lead.phoneE164 || lead.phone || '');

          // SIMULATOR MODE: Store in thread + queue with simulator_bypassed status
          await base44.asServiceRole.entities.LeadMessageThread.create({
            leadId,
            coach_email: coachEmail,
            channel: 'WHATSAPP',
            direction: 'OUTBOUND',
            senderType: 'SYSTEM',
            messageText: renderedText,
            messageTimestamp: new Date().toISOString(),
            replyProducer: 'salesFlowRunner',
            replyStatus: 'sent'
          }).catch(() => {});

          const queueRec = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
            coach_email: coachEmail,
            to_phone_e164: lead.phoneE164,
            rendered_text: renderedText,
            template_key: `flow_step_${nextStep.stepOrder}`,
            context_type: 'lead',
            context_id: leadId,
            status: 'sent',
            provider_type: 'mock',
            session_id: sessionId,
            provider_response: JSON.stringify({ simulator_bypassed: true, stepAdvanced: true })
          }).catch(() => {});

          steps.push({ step: 'OUTBOUND_CREATED', ok: true, data: { queueId: queueRec?.id, preview: renderedText.slice(0, 50) } });

          // Log activity
          await base44.asServiceRole.entities.LeadActivityLog.create({
            leadId,
            coach_email: coachEmail,
            activityType: 'STEP_ADVANCED',
            activitySource: 'FLOW',
            message: `[SIMULATOR] ליד ענה – ממשיך לשלב ${nextStep.stepOrder} מתוך ${stepsForState.length}`,
            metadata: {
              simulator: true,
              fromStep: currentOrder,
              toStep: nextStep.stepOrder,
              sessionId,
              queueId: queueRec?.id
            }
          }).catch(() => {});

          flowResult = {
            ok: true,
            advancedToStep: nextStep.stepOrder,
            currentStep: nextStep.stepOrder,
            totalSteps: stepsForState.length,
            queueCreated: true,
            sessionId
          };
        }
      }
    } catch (err) {
      flowError = `Flow advancement failed: ${err.message}`;
      console.error('[SIMULATOR] Flow error:', err.message);
      steps.push({ step: 'FLOW_ADVANCE_ERROR', ok: false, error: flowError });
    }

    // ── Step 7: Read FULL debug state after ──────────────────────────────
    await new Promise(r => setTimeout(r, 1000));
    const statesAfter = await base44.asServiceRole.entities.LeadConversationState.filter({ leadId }).catch(() => []);
    const queueAfter  = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ context_id: leadId }).catch(() => []);
    const threadAfter = await base44.asServiceRole.entities.LeadMessageThread.filter({ leadId }).catch(() => []);
    const activityAfter = await base44.asServiceRole.entities.LeadActivityLog.filter({ leadId }).catch(() => []);
    
    const activeStateAfter = statesAfter.find(s => s.isActive && s.flowStatus === 'ACTIVE');
    
    steps.push({ 
      step: 'DEBUG_STATE_READ', 
      ok: true, 
      data: { 
        statesCount: statesAfter.length,
        queueCount: queueAfter.length,
        threadCount: threadAfter.length,
        activityCount: activityAfter.length,
        currentStep: activeStateAfter?.currentStepOrder,
        totalSteps: activeStateAfter?.totalSteps,
        flowStatus: activeStateAfter?.flowStatus
      } 
    });

    // ── FULL Diagnosis with exact failure reasons ────────────────────────
    const diagnosis = [];
    if (!activeState && existingStates.length === 0) {
      diagnosis.push('NO_FLOW_STATE: No conversation state exists. Flow was never started.');
    }
    if (existingStates.length > 0 && !activeState) {
      diagnosis.push('FLOW_NOT_ACTIVE: Flow state exists but is PAUSED or STOPPED.');
    }
    if (flowError) {
      diagnosis.push(`FLOW_ERROR: ${flowError}`);
    }
    if (!flowError && activeStateAfter) {
      diagnosis.push(`OK: Step advanced to ${activeStateAfter.currentStepOrder}/${activeStateAfter.totalSteps}`);
    }
    if (!flowError && !activeStateAfter && statesAfter.length > 0) {
      diagnosis.push('FLOW_STOPPED: Conversation state exists but is no longer ACTIVE.');
    }

    // Debug data object
    const debugData = {
      flowId: activeStateAfter?.flowId,
      conversationStateId: activeStateAfter?.id,
      sessionId: activeStateAfter?.sessionId,
      currentStep: activeStateAfter?.currentStepOrder,
      totalSteps: activeStateAfter?.totalSteps,
      currentStepMessage: activeStateAfter?.currentStepMessage,
      lastInboundMessage: messageText,
      lastOutboundMessage: queueAfter.length > 0 ? queueAfter[queueAfter.length - 1]?.rendered_text : null,
      queueRecords: queueAfter.map(q => ({
        id: q.id,
        status: q.status,
        template_key: q.template_key,
        created: q.created_date,
        preview: q.rendered_text?.slice(0, 50)
      })),
      recentActivity: activityAfter.slice(-5).map(a => ({
        type: a.activityType,
        message: a.message,
        time: a.created_date
      }))
    };

    // ── Inbound record verification snapshot ────────────────────────────────
    const savedInbound = threadAfter.find(t => t.id === savedId);
    const eligibleForAIBrain = !!(
      savedInbound &&
      savedInbound.direction === 'INBOUND' &&
      savedInbound.senderType === 'LEAD' &&
      savedInbound.leadId === leadId &&
      savedInbound.coach_email &&
      savedInbound.messageText
    );

    const inboundSnapshot = savedInbound ? {
      id: savedInbound.id,
      leadId: savedInbound.leadId,
      coach_email: savedInbound.coach_email,
      channel: savedInbound.channel,
      direction: savedInbound.direction,
      senderType: savedInbound.senderType,
      messageText: savedInbound.messageText,
      providerMessageId: savedInbound.providerMessageId,
      aiProcessed: savedInbound.aiProcessed,
      replyStatus: savedInbound.replyStatus,
      created_date: savedInbound.created_date,
    } : null;

    return Response.json({
      ok: true,
      leadId,
      savedId,
      messageText,
      // ── AI Brain eligibility report ──────────────────────────────────────
      recordCreated: !!savedId,
      recordId: savedId || null,
      savedCollection: 'LeadMessageThread',
      savedFieldsSnapshot: inboundSnapshot,
      eligibleForAIBrain,
      failureReason: eligibleForAIBrain ? null : (!savedInbound ? 'Record not found after creation' : 'Missing required fields for AI Brain'),
      steps,
      diagnosis,
      flowResult,
      flowError: flowError || null,
      replyProducer,
      hadActiveState: !!activeState,
      hasActiveStateNow: !!activeStateAfter,
      statesCount: statesAfter.length,
      queueCount: queueAfter.length,
      threadCount: threadAfter.length,
      debugData
    });

  } catch (error) {
    steps.push({ step: 'UNHANDLED_EXCEPTION', ok: false, error: error.message });
    return Response.json({ ok: false, error: error.message, step: 'UNHANDLED', steps }, { status: 500 });
  }
});