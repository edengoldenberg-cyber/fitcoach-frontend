import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const diagnostics = [];
  let finalDecision = 'SCRIPT_STATE_OUT_OF_SYNC';

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
      const leads = await base44.asServiceRole.entities.Lead.list('-created_date', 1000);
      lead = leads.find(l => l.id === leadId) || null;
    } catch (e) {}

    if (!lead) {
      diagnostics.push({
        name: '1. Active lead state',
        status: 'fail',
        data: { error: `Lead not found: ${leadId}` }
      });
      return Response.json({ ok: true, diagnostics, finalDecision: 'SCRIPT_NOT_FOUND' });
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

    // ── Step 2: Active script existence ────────────────────────────────
    const coachEmail = lead.coach_email;
    const scripts = await base44.asServiceRole.entities.SalesScript.filter({ coach_email: coachEmail }).catch(() => []);
    const activeScript = scripts.find(s => s.is_active && s.script_enabled !== false && s.script_type === 'main');

    if (!activeScript) {
      diagnostics.push({
        name: '2. Active script existence',
        status: 'info',
        data: { scriptFound: false }
      });
    } else {
      diagnostics.push({
        name: '2. Active script existence',
        status: 'success',
        data: {
          scriptFound: true,
          scriptId: activeScript.id,
          scriptType: activeScript.script_type,
          scriptName: activeScript.name,
          isActive: activeScript.is_active,
          scriptEnabled: activeScript.script_enabled
        }
      });
    }

    // ── Step 3: Script session state ───────────────────────────────────
    if (activeScript) {
      const stages = await base44.asServiceRole.entities.SalesScriptStage.filter({ script_id: activeScript.id }).catch(() => []);
      const sorted = stages.sort((a, b) => a.stage_order - b.stage_order);

      const currentStage = lead.currentScriptStage || 1;
      const stageExists = sorted.find(s => s.stage_order === currentStage);

      diagnostics.push({
        name: '3. Script session state',
        status: stageExists ? 'success' : 'fail',
        data: {
          scriptSessionId: lead.scriptSessionId || null,
          currentScriptStage: currentStage,
          currentStageIndex: currentStage - 1,
          totalStages: sorted.length,
          startedAt: lead.scriptStartedAt,
          isCompleted: currentStage > sorted.length,
          stageExists: !!stageExists
        }
      });
    } else {
      diagnostics.push({
        name: '3. Script session state',
        status: 'info',
        data: { note: 'No active script configured' }
      });
    }

    // ── Step 4: Script/lead linkage ────────────────────────────────────
    if (activeScript) {
      const leadReferencesScript = lead.activeScriptId === activeScript.id;
      diagnostics.push({
        name: '4. Script/lead linkage',
        status: leadReferencesScript ? 'success' : 'info',
        data: {
          leadReferencesScript,
          leadActiveScriptId: lead.activeScriptId,
          configScriptId: activeScript.id,
          mismatchDetected: !leadReferencesScript
        }
      });
    } else {
      diagnostics.push({
        name: '4. Script/lead linkage',
        status: 'info',
        data: { note: 'No script to check' }
      });
    }

    // ── Step 5: Stage progression state ────────────────────────────────
    if (activeScript) {
      const stages = await base44.asServiceRole.entities.SalesScriptStage.filter({ script_id: activeScript.id }).catch(() => []);
      const sorted = stages.sort((a, b) => a.stage_order - b.stage_order);
      const currentStageNum = lead.currentScriptStage || 1;
      const currentStageObj = sorted.find(s => s.stage_order === currentStageNum);
      const nextStageObj = sorted.find(s => s.stage_order === currentStageNum + 1);

      diagnostics.push({
        name: '5. Stage progression state',
        status: currentStageObj ? 'success' : 'fail',
        data: {
          latestCompletedStage: Math.max(0, currentStageNum - 1),
          nextExpectedStage: currentStageNum + 1,
          currentStageExists: !!currentStageObj,
          nextStageExists: !!nextStageObj,
          progressionBlocked: !nextStageObj && currentStageNum <= sorted.length
        }
      });
    } else {
      diagnostics.push({
        name: '5. Stage progression state',
        status: 'info',
        data: { note: 'No script to evaluate' }
      });
    }

    // ── Step 6: Message-to-script linkage ──────────────────────────────
    const allThreads = await base44.asServiceRole.entities.LeadMessageThread.filter({ leadId }).catch(() => []);
    const inboundThreads = allThreads.filter(t => t.direction === 'INBOUND').sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    const outboundThreads = allThreads.filter(t => t.direction === 'OUTBOUND').sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

    const latestInbound = inboundThreads[0];
    const latestOutbound = outboundThreads[0];

    diagnostics.push({
      name: '6. Message-to-script linkage',
      status: latestInbound ? 'success' : 'info',
      data: {
        latestInboundId: latestInbound?.id,
        latestOutboundId: latestOutbound?.id,
        replyAssociatedWithStage: latestOutbound?.replyProducer === 'aiConversationAgent' || latestOutbound?.replyProducer === 'salesFlowRunner',
        inboundConsumed: !!latestInbound
      }
    });

    // ── Step 7: AI/script integration state ─────────────────────────────
    if (activeScript) {
      const flowStates = await base44.asServiceRole.entities.LeadConversationState.filter({ leadId }).catch(() => []);
      const activeFlowFound = !!flowStates.find(f => f.isActive);

      diagnostics.push({
        name: '7. AI/script integration state',
        status: 'success',
        data: {
          activeScriptType: activeScript.script_type,
          conversationFlowFound: activeFlowFound,
          hasScriptRules: !!activeScript.hot_lead_triggers,
          aiReplayShouldAdvanceScript: true
        }
      });
    } else {
      diagnostics.push({
        name: '7. AI/script integration state',
        status: 'info',
        data: { note: 'No script to evaluate' }
      });
    }

    // ── Step 8: Post-send script updates ───────────────────────────────
    if (latestOutbound) {
      const answersUpdated = lead.collectedAnswers && Object.keys(lead.collectedAnswers).length > 0;
      diagnostics.push({
        name: '8. Post-send script updates',
        status: answersUpdated ? 'success' : 'info',
        data: {
          currentScriptStageUpdated: !!lead.currentScriptStage,
          scriptProgressSaved: !!lead.scriptStartedAt,
          leadScriptFieldsUpdated: answersUpdated,
          collectedAnswersCount: Object.keys(lead.collectedAnswers || {}).length
        }
      });
    } else {
      diagnostics.push({
        name: '8. Post-send script updates',
        status: 'info',
        data: { note: 'No outbound sent yet' }
      });
    }

    // ── Final Decision ──────────────────────────────────────────────────
    if (!activeScript) {
      finalDecision = 'SCRIPT_NOT_FOUND';
    } else if (!lead.currentScriptStage) {
      finalDecision = 'SCRIPT_SESSION_MISSING';
    } else if (!lead.activeScriptId) {
      finalDecision = 'SCRIPT_NOT_LINKED_TO_LEAD';
    } else if (!latestOutbound) {
      finalDecision = 'SCRIPT_MESSAGE_LINK_BROKEN';
    } else {
      finalDecision = 'SCRIPT_HEALTHY';
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