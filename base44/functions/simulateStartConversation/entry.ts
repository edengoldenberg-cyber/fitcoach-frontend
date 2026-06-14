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
    const { leadId, force = false } = body;
    if (!leadId) return Response.json({ ok: false, error: 'Missing leadId', step: 'VALIDATION' }, { status: 400 });

    // ── Step 1: Load lead ────────────────────────────────────────────────
    const leads = await base44.asServiceRole.entities.Lead.list('-created_date', 1000);
    const lead = leads.find(l => l.id === leadId);
    if (!lead) {
      return Response.json({ ok: false, error: `Lead not found: ${leadId}`, step: 'LEAD_LOOKUP', steps });
    }
    steps.push({ step: 'LEAD_FOUND', ok: true, data: { status: lead.status, phoneE164: lead.phoneE164, coach: lead.coach_email } });

    const coachEmail = lead.coach_email || 'system';

    // ── Step 2: Check configured flows ───────────────────────────────────
    const allFlows = await base44.asServiceRole.entities.SalesConversationFlow.filter({}).catch(() => []);
    const activeFlows = allFlows.filter(f =>
      (f.coach_email === coachEmail || !f.coach_email || f.isDefault) && f.is_active !== false
    );
    steps.push({
      step: 'FLOWS_CHECKED', ok: activeFlows.length > 0,
      data: { total: allFlows.length, active: activeFlows.length, flows: activeFlows.map(f => ({ id: f.id, name: f.name, isDefault: f.isDefault })) }
    });

    // ── Step 3: Validate phone ────────────────────────────────────────────
    const phoneOk = /^\+[1-9]\d{7,14}$/.test(lead.phoneE164 || '');
    steps.push({ step: 'PHONE_VALIDATED', ok: phoneOk, data: { phoneE164: lead.phoneE164 } });
    if (!phoneOk) {
      return Response.json({ ok: false, error: `Invalid E164 phone: "${lead.phoneE164}". Cannot start flow.`, step: 'PHONE_VALIDATED', steps });
    }

    // ── Step 4: Reset lead to NEW if forced ───────────────────────────────
    if (force && lead.status !== 'NEW') {
      await base44.asServiceRole.entities.Lead.update(leadId, {
        status: 'NEW', lastMessageAt: null, errorReason: null
      }).catch(() => {});
      steps.push({ step: 'LEAD_RESET_TO_NEW', ok: true, data: { prevStatus: lead.status } });
    } else if (lead.status !== 'NEW') {
      steps.push({
        step: 'STATUS_WARNING', ok: false,
        data: { currentStatus: lead.status, tip: 'Lead is not NEW. Use Force Start to reset it.' }
      });
    }

    // ── Step 5: Invoke flow runner ────────────────────────────────────────
    let flowResult = null;
    let flowError = null;

    if (activeFlows.length > 0) {
      try {
        const res = await base44.asServiceRole.functions.invoke('salesFlowRunner', { leadId, lead });
        flowResult = res?.data || {};
        steps.push({ step: 'SALES_FLOW_RUNNER', ok: true, data: { ok: flowResult.ok, statesCreated: flowResult.statesCreated, queueCreated: flowResult.queueCreated } });
      } catch (err) {
        flowError = `salesFlowRunner failed: ${err.message}`;
        steps.push({ step: 'SALES_FLOW_RUNNER', ok: false, error: flowError });
      }
    } else {
      // No flow — legacy fallback
      try {
        const res = await base44.asServiceRole.functions.invoke('startLeadAutomation', { leadId, lead });
        flowResult = res?.data || {};
        steps.push({ step: 'START_LEAD_AUTOMATION_FALLBACK', ok: true, data: { ok: flowResult.ok, queueId: flowResult.queueId, status: flowResult.status } });
      } catch (err) {
        flowError = `startLeadAutomation failed: ${err.message}`;
        steps.push({ step: 'START_LEAD_AUTOMATION_FALLBACK', ok: false, error: flowError });
      }
    }

    // ── Step 6: Read resulting state ──────────────────────────────────────
    await new Promise(r => setTimeout(r, 1500));
    const statesAfter = await base44.asServiceRole.entities.LeadConversationState.filter({ leadId }).catch(() => []);
    const queueAfter  = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ context_id: leadId }).catch(() => []);
    steps.push({ step: 'RESULT_READ', ok: true, data: { statesCount: statesAfter.length, queueCount: queueAfter.length } });

    // ── Diagnosis ─────────────────────────────────────────────────────────
    const diagnosis = [];
    if (activeFlows.length === 0)  diagnosis.push('NO_ACTIVE_FLOW: No active SalesConversationFlow found. Create one in Sales Flow Builder.');
    if (statesAfter.length === 0)  diagnosis.push('NO_FLOW_STATE: salesFlowRunner ran but created no LeadConversationState. Ensure flow has steps and isDefault=true.');
    if (queueAfter.length === 0)   diagnosis.push('NO_QUEUE: No message queued. Check flow step 1 messageText and WhatsApp provider config.');
    if (flowError)                  diagnosis.push(`FLOW_ERROR: ${flowError}`);
    if (!flowError && statesAfter.length > 0 && queueAfter.length > 0) diagnosis.push('OK: Flow started, state and queue created successfully.');

    return Response.json({
      ok: !flowError,
      leadId,
      steps,
      diagnosis,
      flowResult,
      flowError: flowError || null,
      activeFlowsFound: activeFlows.length,
      statesCreated: statesAfter.length,
      queueCreated: queueAfter.length,
      activeStates: statesAfter.map(s => ({ id: s.id, flowName: s.flowName, currentStep: s.currentStepOrder, total: s.totalSteps, status: s.flowStatus })),
    });

  } catch (error) {
    steps.push({ step: 'UNHANDLED_EXCEPTION', ok: false, error: error.message });
    return Response.json({ ok: false, error: error.message, step: 'UNHANDLED', steps }, { status: 500 });
  }
});