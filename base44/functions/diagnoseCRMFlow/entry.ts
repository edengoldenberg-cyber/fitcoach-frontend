import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const diagnostics = [];
  let finalDecision = 'FLOW_STATE_OUT_OF_SYNC';

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ ok: false, error: 'Forbidden: admin only' }, { status: 403 });
    }

    const body = await req.json();
    const { leadId } = body;
    if (!leadId) {
      return Response.json({ ok: false, error: 'Missing leadId' }, { status: 400 });
    }

    // ── Step 1: Active lead state ──────────────────────────────────────
    let lead = null;
    try {
      const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId });
      lead = leads[0] || null;
    } catch (e) {}

    if (!lead) {
      diagnostics.push({
        name: '1. Active lead state',
        status: 'fail',
        data: { error: `Lead not found: ${leadId}` }
      });
      return Response.json({ ok: true, diagnostics, finalDecision: 'FLOW_NOT_FOUND' });
    }

    diagnostics.push({
      name: '1. Active lead state',
      status: 'success',
      data: {
        leadId: lead.id,
        coach_email: lead.coach_email,
        status: lead.status,
        phone: lead.phone,
        phoneE164: lead.phoneE164
      }
    });

    // ── Step 2: ConversationFlow existence ──────────────────────────────
    const flowStates = await base44.asServiceRole.entities.LeadConversationState.filter({ leadId }).catch(() => []);
    const activeFlow = flowStates.find(f => f.isActive && f.flowStatus === 'ACTIVE');
    const anyFlow = flowStates[0] || null;

    if (!anyFlow) {
      diagnostics.push({
        name: '2. ConversationFlow existence',
        status: 'info',
        data: { flowFound: false, totalStates: 0 }
      });
    } else {
      const flowRecs = await base44.asServiceRole.entities.SalesConversationFlow.filter({ id: anyFlow.flowId }).catch(() => []);
      const flow = flowRecs[0];

      diagnostics.push({
        name: '2. ConversationFlow existence',
        status: flow ? 'success' : 'fail',
        data: {
          flowFound: !!flow,
          flowId: flow?.id,
          flowStatus: anyFlow.flowStatus,
          created_date: flow?.created_date,
          updated_date: flow?.updated_date,
          flowName: flow?.name
        }
      });
    }

    // ── Step 3: Flow step state ──────────────────────────────────────────
    if (activeFlow) {
      const steps = await base44.asServiceRole.entities.SalesConversationStep.filter({ flowId: activeFlow.flowId }).catch(() => []);
      const sorted = steps.sort((a, b) => a.stepOrder - b.stepOrder);
      const currentStep = sorted.find(s => s.stepOrder === activeFlow.currentStepOrder);
      const nextStep = sorted.find(s => s.stepOrder === activeFlow.currentStepOrder + 1);

      diagnostics.push({
        name: '3. Flow step state',
        status: currentStep ? 'success' : 'fail',
        data: {
          currentStep: activeFlow.currentStepOrder,
          totalSteps: sorted.length,
          activeStepId: currentStep?.id,
          activeStepValid: !!currentStep,
          nextStepExists: !!nextStep,
          nextStepOrder: nextStep?.stepOrder || null
        }
      });
    } else {
      diagnostics.push({
        name: '3. Flow step state',
        status: 'info',
        data: { note: 'No active flow to diagnose' }
      });
    }

    // ── Step 4: Flow/lead linkage ──────────────────────────────────────
    if (anyFlow) {
      const flowMatches = anyFlow.leadId === leadId;
      diagnostics.push({
        name: '4. Flow/lead linkage',
        status: flowMatches ? 'success' : 'fail',
        data: {
          leadPointsToFlow: !!anyFlow,
          flowReferencesLead: flowMatches,
          mismatchDetected: !flowMatches,
          stateLeadId: anyFlow.leadId,
          queryLeadId: leadId
        }
      });
    } else {
      diagnostics.push({
        name: '4. Flow/lead linkage',
        status: 'info',
        data: { note: 'No flow state to check' }
      });
    }

    // ── Step 5: Flow queue linkage ────────────────────────────────────
    const queueRecs = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ context_id: leadId }).catch(() => []);
    const latestQueue = queueRecs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];

    if (latestQueue) {
      diagnostics.push({
        name: '5. Flow queue linkage',
        status: 'success',
        data: {
          queueRecordsCount: queueRecs.length,
          latestQueueId: latestQueue.id,
          latestQueueStatus: latestQueue.status,
          linkedLeadId: latestQueue.context_id,
          sessionId: latestQueue.session_id
        }
      });
    } else {
      diagnostics.push({
        name: '5. Flow queue linkage',
        status: 'info',
        data: { queueRecordsCount: 0 }
      });
    }

    // ── Step 6: Latest inbound/outbound relationship ──────────────────
    const allThreads = await base44.asServiceRole.entities.LeadMessageThread.filter({ leadId }).catch(() => []);
    const inboundThreads = allThreads.filter(t => t.direction === 'INBOUND').sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    const outboundThreads = allThreads.filter(t => t.direction === 'OUTBOUND').sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

    const latestInbound = inboundThreads[0];
    const latestOutbound = outboundThreads[0];

    diagnostics.push({
      name: '6. Latest inbound/outbound relationship',
      status: latestInbound && latestOutbound ? 'success' : 'info',
      data: {
        latestInboundId: latestInbound?.id,
        latestOutboundId: latestOutbound?.id,
        outboundLinkedToInbound: latestOutbound?.replyMessageId === latestInbound?.id,
        inboundToOutboundChronology: latestInbound && latestOutbound
          ? (new Date(latestOutbound.created_date) > new Date(latestInbound.created_date) ? 'outbound after inbound' : 'out of order')
          : null
      }
    });

    // ── Step 7: Post-send flow updates ────────────────────────────────
    if (latestOutbound) {
      const stepUpdated = latestOutbound.replyStatus && latestOutbound.replyStatus !== 'pending';
      diagnostics.push({
        name: '7. Post-send flow updates',
        status: stepUpdated ? 'success' : 'info',
        data: {
          currentStepUpdated: activeFlow?.currentStepOrder !== undefined,
          flowProgressSaved: activeFlow?.lastFlowActionAt !== undefined,
          replyStatusUpdated: stepUpdated,
          currentReplyStatus: latestOutbound.replyStatus
        }
      });
    } else {
      diagnostics.push({
        name: '7. Post-send flow updates',
        status: 'info',
        data: { note: 'No outbound message yet' }
      });
    }

    // ── Step 8: Cleanup / failure signal ──────────────────────────────
    const activityLogs = await base44.asServiceRole.entities.LeadActivityLog.filter({ leadId }).catch(() => []);
    const recentErrors = activityLogs.filter(a => a.message && a.message.includes('error')).slice(-3);

    diagnostics.push({
      name: '8. Cleanup / failure signal',
      status: recentErrors.length === 0 ? 'success' : 'info',
      data: {
        cleanupErrorDetected: recentErrors.length > 0,
        recentErrorCount: recentErrors.length,
        latestError: recentErrors.length > 0 ? recentErrors[0].message : null
      }
    });

    // ── Final Decision ──────────────────────────────────────────────────
    if (!anyFlow) {
      finalDecision = 'FLOW_NOT_FOUND';
    } else if (!activeFlow) {
      finalDecision = 'FLOW_NOT_LINKED_TO_LEAD';
    } else if (anyFlow.leadId !== leadId) {
      finalDecision = 'FLOW_NOT_LINKED_TO_LEAD';
    } else if (!latestQueue) {
      finalDecision = 'FLOW_QUEUE_LINK_BROKEN';
    } else if (anyFlow.flowStatus !== 'ACTIVE') {
      finalDecision = 'FLOW_NOT_FOUND';
    } else {
      finalDecision = 'FLOW_HEALTHY';
    }

    return Response.json({
      ok: true,
      leadId,
      diagnostics,
      finalDecision
    });

  } catch (error) {
    return Response.json({
      ok: false,
      error: error.message,
      diagnostics
    }, { status: 500 });
  }
});