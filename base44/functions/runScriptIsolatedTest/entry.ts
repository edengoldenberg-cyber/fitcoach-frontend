import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * runScriptIsolatedTest
 * ─────────────────────────────────────────────────────────────────────────────
 * Activates ONE Main Sales Script on ONE specific test lead in complete isolation.
 *
 * Steps:
 *  1. Validate lead exists and has a phone
 *  2. Find the active Main Sales Script for the coach
 *  3. Set activeResponderOwner = SCRIPT  (blocks AI + Flow from responding)
 *  4. Initialize script session on the lead (idempotent via initializeLeadWithMainScript)
 *  5. Return full diagnostic snapshot
 *
 * SAFE — NO webhook / flow / AI / nudge / timeout / queue / session logic changed.
 * ISOLATED — only touches the ONE lead specified.
 * NO GLOBAL CHANGES — other leads, AI, Flow remain completely unaffected.
 */

Deno.serve(async (req) => {
  const log = [];
  const ts = () => new Date().toISOString();

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ ok: false, error: 'Forbidden: admin only' }, { status: 403 });
    }

    const body = await req.json();
    const { leadId } = body;

    if (!leadId) {
      return Response.json({ ok: false, error: 'leadId is required' }, { status: 400 });
    }

    log.push({ step: 'START', t: ts(), leadId });

    // ── Step 1: Fetch the lead ──────────────────────────────────────────────
    let lead = null;
    try {
      const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId });
      lead = leads[0] || null;
    } catch (_) { /* invalid id format */ }
    if (!lead) {
      return Response.json({ ok: false, error: 'Lead not found', leadId, log });
    }

    log.push({
      step: '1_LEAD_FOUND',
      t: ts(),
      name: `${lead.firstName} ${lead.lastName || ''}`.trim(),
      phone: lead.phoneE164 || lead.phone || 'MISSING',
      isSimulator: lead.isSimulatorLead,
      currentOwner: lead.activeResponderOwner || '(none — default routing)',
      existingScriptId: lead.activeScriptId || null,
      existingStage: lead.currentScriptStage || null,
    });

    // ── Step 2: Find active Main Script for this coach ──────────────────────
    const coachEmail = lead.coach_email;
    const scripts = await base44.asServiceRole.entities.SalesScript.filter({
      coach_email: coachEmail,
      script_type: 'main',
      is_active: true,
      script_enabled: true,
    });
    const mainScript = scripts[0] || null;

    if (!mainScript) {
      log.push({ step: '2_NO_MAIN_SCRIPT', t: ts(), coachEmail });
      return Response.json({
        ok: false,
        error: 'NO_ACTIVE_MAIN_SCRIPT — SalesScript(type=main, is_active=true, script_enabled=true) not found for coach',
        leadId, coachEmail, log,
        verdict: 'SESSION_LINKAGE_FAILED',
      });
    }

    log.push({ step: '2_SCRIPT_FOUND', t: ts(), scriptId: mainScript.id, scriptName: mainScript.name });

    // ── Step 3: Count stages ────────────────────────────────────────────────
    const stages = await base44.asServiceRole.entities.SalesScriptStage.filter({ script_id: mainScript.id });
    const sortedStages = stages.sort((a, b) => a.stage_order - b.stage_order);

    log.push({ step: '3_STAGES', t: ts(), totalStages: sortedStages.length, stageNames: sortedStages.map(s => `${s.stage_order}:${s.stage_name || s.purpose}`) });

    if (sortedStages.length === 0) {
      return Response.json({
        ok: false,
        error: 'Script has no stages defined',
        leadId, scriptId: mainScript.id, log,
        verdict: 'SESSION_LINKAGE_FAILED',
      });
    }

    // ── Step 4: Set explicit owner = SCRIPT ────────────────────────────────
    // This blocks AI and Flow from auto-responding to this lead.
    // ONLY this lead is affected.
    const ownerBefore = lead.activeResponderOwner;
    await base44.asServiceRole.entities.Lead.update(leadId, {
      activeResponderOwner: 'SCRIPT',
    });

    log.push({ step: '4_OWNER_SET', t: ts(), ownerBefore: ownerBefore || '(default)', ownerAfter: 'SCRIPT' });

    // ── Step 5: Initialize script session (inlined — avoids cross-function auth issues) ─────
    // If already initialized (idempotent), skip; otherwise attach script + send opening.
    let initResult = null;
    const alreadyInitialized = lead.activeScriptId && lead.scriptStartedAt;

    if (alreadyInitialized) {
      log.push({ step: '5_SCRIPT_INIT', t: ts(), action: 'IDEMPOTENT_SKIP', scriptId: lead.activeScriptId });
      initResult = { ok: true, message: 'ALREADY_INITIALIZED_IDEMPOTENT_RETURN' };
    } else {
      // Attach script to lead
      await base44.asServiceRole.entities.Lead.update(leadId, {
        activeScriptId: mainScript.id,
        activeScriptType: 'main',
        currentScriptStage: 1,
        scriptStartedAt: new Date().toISOString(),
      });

      // Get opening stage
      const openingStages = await base44.asServiceRole.entities.SalesScriptStage.filter({
        script_id: mainScript.id,
        stage_order: 1,
      });
      const openingStage = openingStages[0] || null;

      if (!openingStage) {
        log.push({ step: '5_NO_OPENING_STAGE', t: ts() });
        return Response.json({
          ok: false, error: 'Script has no stage 1 (opening stage)',
          leadId, scriptId: mainScript.id, log,
          verdict: 'SESSION_LINKAGE_FAILED',
        });
      }

      const openingMessage = (openingStage.question_text || '')
        .replace(/\{\{name\}\}/g, lead.firstName)
        .replace(/\{\{firstName\}\}/g, lead.firstName);

      // Store as OUTBOUND thread entry (simulator mode = always internal)
      await base44.asServiceRole.entities.LeadMessageThread.create({
        leadId,
        coach_email: coachEmail,
        channel: 'WHATSAPP',
        direction: 'OUTBOUND',
        senderType: 'SYSTEM',
        messageText: openingMessage,
        messageTimestamp: new Date().toISOString(),
      }).catch(() => {});

      log.push({ step: '5_SCRIPT_INIT', t: ts(), action: 'INITIALIZED', openingPreview: openingMessage.slice(0, 60) });
      initResult = { ok: true, message: 'OPENING_MESSAGE_STORED' };
    }

    // ── Step 6: Re-fetch lead to confirm session is written ─────────────────
    const refreshed = (await base44.asServiceRole.entities.Lead.filter({ id: leadId }))[0];
    const sessionCreated = !!refreshed?.scriptSessionId || !!refreshed?.activeScriptId;

    log.push({
      step: '6_SESSION_VERIFY',
      t: ts(),
      activeScriptId: refreshed?.activeScriptId || null,
      scriptSessionId: refreshed?.scriptSessionId || null,
      currentScriptStage: refreshed?.currentScriptStage || null,
      activeResponderOwner: refreshed?.activeResponderOwner,
      sessionCreated,
    });

    // ── Step 7: Check for AI / Flow interference potential ──────────────────
    // We already set owner=SCRIPT. Verify the guard conditions.
    const [aiConfigs, flowStates] = await Promise.all([
      base44.asServiceRole.entities.AIBrainConfig.filter({ coach_email: coachEmail, isActive: true }),
      base44.asServiceRole.entities.LeadConversationState.filter({ leadId }),
    ]);

    const aiGlobalOn = aiConfigs.length > 0;
    const flowActive = flowStates.some(f => f.flowStatus === 'ACTIVE');

    // With activeResponderOwner=SCRIPT, the routing logic in the webhook/AI/Flow
    // will refuse to claim this lead. Document the state clearly.
    const interferenceRisk = refreshed?.activeResponderOwner !== 'SCRIPT'
      ? 'HIGH — owner not set correctly'
      : 'NONE — activeResponderOwner=SCRIPT blocks AI and Flow';

    log.push({
      step: '7_INTERFERENCE_CHECK',
      t: ts(),
      aiGlobalOn,
      flowActive,
      ownerNow: refreshed?.activeResponderOwner,
      interferenceRisk,
    });

    // ── Step 8: Opening message verification ────────────────────────────────
    const threads = await base44.asServiceRole.entities.LeadMessageThread.filter({ leadId });
    const outbound = threads.filter(m => m.direction === 'OUTBOUND')
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    const openingMessage = outbound[0];

    log.push({
      step: '8_OPENING_MESSAGE',
      t: ts(),
      openingFound: !!openingMessage,
      preview: openingMessage?.messageText?.slice(0, 80) || null,
      replyProducer: openingMessage?.replyProducer || 'not set',
    });

    // ── Step 9: Duplicate guard check ───────────────────────────────────────
    const outboundCount = outbound.length;
    const duplicateRisk = outboundCount > 1 ? `WARNING: ${outboundCount} outbounds found — check for duplicates` : 'CLEAR';

    log.push({ step: '9_DUPLICATE_CHECK', t: ts(), outboundCount, duplicateRisk });

    // ── Final verdict ────────────────────────────────────────────────────────
    let verdict = 'SCRIPT_WORKING_CORRECTLY';
    if (!sessionCreated) verdict = 'SESSION_LINKAGE_FAILED';
    else if (!openingMessage) verdict = 'SCRIPT_NOT_ADVANCING';
    else if (outboundCount > 1) verdict = 'DUPLICATE_SEND';
    else if (refreshed?.activeResponderOwner !== 'SCRIPT') verdict = 'FLOW_OR_AI_INTERFERED';

    return Response.json({
      ok: true,
      verdict,
      leadId,
      leadName: `${lead.firstName} ${lead.lastName || ''}`.trim(),
      scriptId: mainScript.id,
      scriptName: mainScript.name,
      scriptType: 'main',
      explicitOwner: refreshed?.activeResponderOwner,
      sessionCreated,
      totalStages: sortedStages.length,
      currentStage: refreshed?.currentScriptStage || 1,
      aiGlobalOn,
      flowActive,
      interferenceRisk,
      openingMessagePreview: openingMessage?.messageText?.slice(0, 100) || null,
      outboundCount,
      duplicateRisk,
      log,
    });

  } catch (error) {
    console.error('[runScriptIsolatedTest] Error:', error.message);
    return Response.json({ ok: false, error: error.message, log }, { status: 500 });
  }
});