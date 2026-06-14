/**
 * Entity Automation: Triggered when a new Lead is created (production path).
 * 
 * ARCHITECTURE NOTE - FLOW INITIALIZATION LOGIC:
 * ==============================================
 * This function contains flow initialization logic that is DUPLICATED in createSimulatorLead.
 * This is INTENTIONAL and REQUIRED due to Base44 platform constraints.
 * 
 * PRODUCTION: This automation fires automatically for UI/webhook-created leads
 * SIMULATOR: createSimulatorLead duplicates this logic inline (automations don't fire for backend creates)
 * 
 * CRITICAL: When modifying flow initialization logic (lines 189-339), update createSimulatorLead too.
 * Both must maintain identical logic for: flow selection, state creation, queue creation, logging.
 * 
 * See SIMULATOR_AUTH_ARCHITECTURE documentation for full architecture rationale.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function writeLog(base44, leadId, coachEmail, activityType, message, metadata) {
  await base44.asServiceRole.entities.LeadActivityLog.create({
    leadId,
    coach_email: coachEmail || 'system',
    activityType,
    activitySource: 'SYSTEM',
    message,
    metadata: metadata || {}
  }).catch(() => {});
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── GLOBAL KILL SWITCH — checked before any body parse or DB work ─────────
    const killCfg = await base44.asServiceRole.entities.SystemConfig
      .filter({ key: 'GLOBAL_WHATSAPP_ENABLED' }).catch(() => []);
    if (killCfg[0]?.value !== true) {
      console.log('[ON_LEAD_CREATED] KILL_SWITCH: GLOBAL_WHATSAPP_ENABLED=false — automation skipped');
      return Response.json({ ok: false, blocked: true, reason: 'GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE' });
    }

    const body = await req.json();

    const eventType = body?.event?.type || 'create';
    if (eventType !== 'create') {
      return Response.json({ ok: true, skipped: true, reason: 'not a create event' });
    }

    const entityId = body?.event?.entity_id || body?.leadId;
    let lead = body?.data || null;

    if (!lead || !lead.id) {
      const allLeads = await base44.asServiceRole.entities.Lead.list('-created_date', 500);
      lead = allLeads.find(l => l.id === entityId) || null;
    }

    if (!lead) {
      console.log('[ON_LEAD_CREATED] Lead not found:', entityId);
      return Response.json({ ok: false, error: `Lead not found: ${entityId}` });
    }

    const leadId     = lead.id;
    let coachEmail = lead.coach_email;

    // SAFEGUARD: Validate coach_email exists on lead record
    // For simulator leads created via service-role, coach_email is already set correctly
    // For real leads from webhooks, coach_email should also be set
    // Only fallback to auth.me() if truly missing
    if (!coachEmail || coachEmail === 'system@test.com') {
      console.log('[ON_LEAD_CREATED] MISSING_COACH_EMAIL: Attempting fallback. source=' + lead.source);
      const authenticatedUser = await base44.auth.me().catch(() => null);
      if (authenticatedUser?.email && authenticatedUser.email !== 'system@test.com') {
        coachEmail = authenticatedUser.email;
        console.log('[ON_LEAD_CREATED] SAFEGUARD_FIX: Assigned coach_email from auth user: ' + coachEmail);
        await base44.asServiceRole.entities.Lead.update(leadId, { coach_email: coachEmail }).catch(() => {});
      } else {
        // If no auth context (e.g. called via service-role invoke), this is a critical error
        console.log('[ON_LEAD_CREATED] CRITICAL: No valid coach_email and no auth context');
        return Response.json({
          ok: false,
          error: 'INVALID_COACH_EMAIL',
          reason: 'Lead has no valid coach assignment and no auth context available',
          leadId
        });
      }
    }

    console.log('[ON_LEAD_CREATED_INVOKED]', JSON.stringify({ leadId, status: lead.status, phone: lead.phoneE164 }));

    // ── Log invocation ────────────────────────────────────────────────────
    await writeLog(base44, leadId, coachEmail, 'LEAD_CREATED',
      `ON_LEAD_CREATED_INVOKED: ${lead.firstName || ''} | source: ${lead.source || 'unknown'} | status: ${lead.status}`,
      { source: lead.source, status: lead.status, phone: lead.phoneE164 }
    );

    // ── OPT-OUT GUARD — respect lead-level WhatsApp opt-out ───────────────────
    if (lead.waOptOut === true) {
      console.log('[ON_LEAD_CREATED] OPT_OUT_SKIP: lead.waOptOut=true — no automation for leadId=' + leadId);
      await writeLog(base44, leadId, coachEmail, 'LEAD_CREATED',
        'ON_LEAD_CREATED_SKIPPED: lead.waOptOut=true — no messages will be sent',
        { reason: 'lead_opted_out' }
      );
      return Response.json({ ok: true, skipped: true, reason: 'lead_opted_out', leadId });
    }

    // ── ELIGIBILITY CHECK — check all conditions, log exact reason ────────
    // Accept NEW or CONTACTED (flow may have already started and moved status)
    // Also accept lowercase variants for backward compatibility
    const statusOk = ['NEW', 'CONTACTED', 'new', 'contacted'].includes(lead.status);
    const phoneOk  = !!lead.phoneE164 && /^\+[1-9]\d{7,14}$/.test(lead.phoneE164);

    // ── IDEMPOTENCY CHECK: Has this lead already been successfully initialized? ────
    // If activeScriptId is already set AND a sent/provider-confirmed message exists → fully initialized, skip
    const alreadyInitialized = !!lead.activeScriptId && !!lead.scriptStartedAt;
    if (alreadyInitialized) {
      console.log('[ON_LEAD_CREATED] IDEMPOTENT_SKIP: Lead already initialized (activeScriptId=' + lead.activeScriptId + ')');
      await writeLog(base44, leadId, coachEmail, 'LEAD_CREATED',
        `ON_LEAD_CREATED_INVOKED_AGAIN_AFTER_INITIALIZATION: Skipping duplicate execution (idempotent)`,
        { reason: 'lead_already_initialized', activeScriptId: lead.activeScriptId }
      );
      return Response.json({
        ok: true,
        skipped: true,
        reason: 'lead_already_initialized_idempotent_skip',
        leadId
      });
    }

    // Query DB for existing queue and states
    const queueCheck = await base44.asServiceRole.entities.WhatsAppMessageQueue
      .filter({ context_id: leadId }).catch(() => []);
    const stateCheck = await base44.asServiceRole.entities.LeadConversationState
      .filter({ leadId }).catch(() => []);

    // Distinguish between:
    // - "sent"/"provider_unconfirmed": Real message was sent (success) → skip second invocation
    // - "queued"/"sending": Message pending delivery → skip to avoid dups
    // - "failed"/"cancelled": Old attempt failed → allow retry
    const sentOrPending = queueCheck.filter(q => ['sent', 'provider_unconfirmed', 'queued', 'sending'].includes(q.status));
    const staleOrFailed = queueCheck.filter(q => ['failed', 'cancelled'].includes(q.status));

    // If there are sent/pending messages, lead was already initialized → idempotent skip
    if (sentOrPending.length > 0) {
      console.log('[ON_LEAD_CREATED] IDEMPOTENT_SKIP: Lead has existing sent/pending queue items (count=' + sentOrPending.length + ')');
      await writeLog(base44, leadId, coachEmail, 'LEAD_CREATED',
        `ON_LEAD_CREATED_INVOKED_AGAIN_WITH_EXISTING_QUEUE: Skipping (idempotent, queue already exists)`,
        { reason: 'queue_already_sent_or_pending', queueCount: sentOrPending.length }
      );
      return Response.json({
        ok: true,
        skipped: true,
        reason: 'queue_already_sent_pending_idempotent_skip',
        leadId
      });
    }

    // Clean up stale failed/cancelled queue items so they don't block retry
    if (staleOrFailed.length > 0) {
      console.log('[ON_LEAD_CREATED] Cleaning up stale queue items (count=' + staleOrFailed.length + ')');
      for (const q of staleOrFailed) {
        await base44.asServiceRole.entities.WhatsAppMessageQueue.delete(q.id).catch(() => {});
      }
    }

    // Similar check for conversation state: if already active, skip
    const activeState = stateCheck.filter(s => s.isActive && s.flowStatus === 'ACTIVE');
    if (activeState.length > 0) {
      console.log('[ON_LEAD_CREATED] IDEMPOTENT_SKIP: Lead has active conversation state (count=' + activeState.length + ')');
      return Response.json({
        ok: true,
        skipped: true,
        reason: 'active_flow_state_idempotent_skip',
        leadId
      });
    }

    // Now check standard eligibility (status + phone) only
    const eligible   = statusOk && phoneOk;
    const blockReason = !statusOk    ? `status_not_new — current: "${lead.status}"`
      : !phoneOk      ? `invalid_phone — value: "${lead.phoneE164}"`
      : null;

    // Log the eligibility result
    await writeLog(base44, leadId, coachEmail, 'LEAD_CREATED',
     `AUTO_START_ELIGIBILITY_CHECK: eligible=${eligible}${blockReason ? ` | BLOCKED: ${blockReason}` : ''}`,
     {
       eligible, blockReason,
       statusOk, phoneOk,
       currentStatus: lead.status,
       phoneE164: lead.phoneE164,
       cleanedStaleQueue: staleOrFailed.length
     }
    );

    if (!eligible) {
      console.log('[ON_LEAD_CREATED] AUTO_START_NOT_ELIGIBLE:', blockReason);
      await writeLog(base44, leadId, coachEmail, 'FLOW_PAUSED',
        `AUTO_START_NOT_ELIGIBLE: ${blockReason}`,
        { reason: blockReason }
      );
      return Response.json({ ok: true, skipped: true, reason: blockReason });
    }

    // ── DETERMINE SIMULATOR MODE ───────────────────────────────────────
    // source = manual_test → isSimulatorLead = true
    // all others → isSimulatorLead = false
    console.log('[ON_LEAD_CREATED] Determining simulator mode based on source:', lead.source);
    const isSimulatorMode = lead.source === 'manual_test';
    console.log('[ON_LEAD_CREATED] isSimulatorLead:', isSimulatorMode);

    // Update lead with simulator flag immediately
    await base44.asServiceRole.entities.Lead.update(leadId, {
      isSimulatorLead: isSimulatorMode
    }).catch(() => {});

    await writeLog(base44, leadId, coachEmail, 'LEAD_CREATED',
      `SIMULATOR_MODE_SET: isSimulatorLead=${isSimulatorMode}`,
      { source: lead.source, isSimulatorLead: isSimulatorMode }
    );

    // ── INITIALIZE CONVERSATION FLOW (INLINED) ─────────────────────────
    console.log('[ON_LEAD_CREATED] Starting conversation flow initialization...');
    let scriptInitResult = null;
    let scriptInitError = null;

    try {
      // Query for active conversation flow
      let allFlows = await base44.asServiceRole.entities.SalesConversationFlow.filter({}).catch(() => []);
      let coachFlows = allFlows.filter(f => f.coach_email === coachEmail && f.is_active !== false);
      let defaultFlows = allFlows.filter(f => f.isDefault && f.is_active !== false);
      let conversationFlow = coachFlows[0] || defaultFlows[0];

      if (!conversationFlow) {
        scriptInitError = 'NO_ACTIVE_CONVERSATION_FLOW';
        console.log('[ON_LEAD_CREATED] ' + scriptInitError);
      } else {
        console.log(`[ON_LEAD_CREATED] Flow found: ${conversationFlow.id}`);

        // Get flow steps
        const allSteps = await base44.asServiceRole.entities.SalesConversationStep.filter({
          flowId: conversationFlow.id
        }).catch(() => []);
        const steps = allSteps.sort((a, b) => a.stepOrder - b.stepOrder);

        if (steps.length === 0) {
          scriptInitError = 'NO_STEPS_IN_FLOW';
          console.log('[ON_LEAD_CREATED] ' + scriptInitError);
        } else {
          const step1 = steps[0];
          console.log(`[ON_LEAD_CREATED] First step: order=${step1.stepOrder}`);

          // Create session state
          const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const stateRec = await base44.asServiceRole.entities.LeadConversationState.create({
            leadId,
            flowId: conversationFlow.id,
            flowName: conversationFlow.name,
            sessionId,
            currentStepId: step1.id,
            currentStepOrder: step1.stepOrder,
            currentStepMessage: '',
            totalSteps: steps.length,
            isActive: true,
            flowStatus: 'ACTIVE',
            lastFlowActionAt: new Date().toISOString(),
            coach_email: coachEmail
          }).catch(e => {
            console.log(`[ON_LEAD_CREATED] State creation failed: ${e.message}`);
            return null;
          });

          if (!stateRec?.id) {
            scriptInitError = 'FAILED_TO_CREATE_FLOW_STATE';
          } else {
            console.log(`[ON_LEAD_CREATED] State created: ${stateRec.id}`);

            // Render first message
            const renderedText = (step1.messageText || '')
              .replace(/\{\{name\}\}/g, lead.firstName || 'שלום')
              .replace(/\{\{firstName\}\}/g, lead.firstName || 'שלום')
              .replace(/\{\{phone\}\}/g, lead.phoneE164 || lead.phone || '');

            // CRITICAL: Both simulator and real leads follow IDENTICAL path through queue
            console.log(`[ON_LEAD_CREATED] Creating queue item for step 1 (simulator=${isSimulatorMode})`);
            
            // HOTFIX: Stamp activeResponderOwner=FLOW on the lead atomically at flow-start time.
            // This ensures the inbound webhook's owner-override path routes to FLOW even if
            // session_resolve() returns null (timing race or query miss).
            await base44.asServiceRole.entities.Lead.update(leadId, {
              activeResponderOwner: 'FLOW'
            }).catch(e => {
              console.log(`[ON_LEAD_CREATED] WARN: Could not set activeResponderOwner: ${e.message}`);
            });
            console.log(`[ON_LEAD_CREATED] activeResponderOwner=FLOW stamped on lead`);

            const queueRecord = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
              coach_email: coachEmail,
              to_phone_e164: lead.phoneE164,
              rendered_text: renderedText,
              template_key: `flow_step_${step1.stepOrder}`,
              context_type: 'lead',
              context_id: leadId,
              status: 'queued',
              provider_type: isSimulatorMode ? 'mock' : 'greenapi',
              session_id: sessionId
            }).catch(e => {
              console.log(`[ON_LEAD_CREATED] QUEUE_CREATION_FAILED: ${e.message}`);
              throw new Error('QUEUE_ITEM_NOT_CREATED: ' + e.message);
            });

            if (!queueRecord?.id) {
              throw new Error('QUEUE_ITEM_NOT_CREATED: No queue record returned');
            }

            const queueId = queueRecord.id;
            console.log(`[ON_LEAD_CREATED] Queue item created: ${queueId} mode=${isSimulatorMode ? 'SIMULATOR' : 'REAL'} status=queued`);
            console.log(`[ON_LEAD_CREATED] Queue item will be processed by whatsAppQueueWorker`);

            await writeLog(base44, leadId, coachEmail, 'STEP_SENT',
              `FLOW_STEP_1_QUEUED: ${conversationFlow.name} | mode=${isSimulatorMode ? 'SIMULATOR' : 'REAL'} | queueId=${queueId}`,
              {
                flowId: conversationFlow.id,
                stepId: step1.id,
                queueId,
                sessionId,
                isSimulator: isSimulatorMode,
                providerType: isSimulatorMode ? 'simulator' : 'greenapi',
                queueStatus: 'queued',
                preview: renderedText.slice(0, 50)
              }
            );

            scriptInitResult = {
              ok: true,
              leadId,
              flowId: conversationFlow.id,
              stepOrder: step1.stepOrder,
              queueId,
              sessionId,
              message: 'FLOW_STARTED_QUEUE_CREATED_WORKER_PENDING'
            };
          }
        }
      }

      if (scriptInitError) {
        console.log('[ON_LEAD_CREATED] Init failed:', scriptInitError);
        await writeLog(base44, leadId, coachEmail, 'FLOW_PAUSED',
          `FLOW_INIT_FAILED: ${scriptInitError}`,
          { reason: scriptInitError }
        );
        // ERROR-010 fix: stamp error state on lead so CRM reflects failure visibly
        await base44.asServiceRole.entities.Lead.update(leadId, {
          errorReason: `FLOW_INIT_FAILED: ${scriptInitError}`,
          status: 'ERROR'
        }).catch(() => {});
        return Response.json({
          ok: false,
          error: 'FLOW_INITIALIZATION_FAILED',
          reason: scriptInitError,
          leadId
        });
      }

      if (!scriptInitResult?.ok) {
        // ERROR-010 fix: stamp error state on lead for unknown init failure
        await base44.asServiceRole.entities.Lead.update(leadId, {
          errorReason: 'FLOW_INIT_ERROR: unknown',
          status: 'ERROR'
        }).catch(() => {});
        return Response.json({
          ok: false,
          error: 'FLOW_INIT_ERROR',
          leadId
        });
      }

      console.log('[ON_LEAD_CREATED] Flow initialization successful');
      await writeLog(base44, leadId, coachEmail, 'FLOW_STARTED',
        `CONVERSATION_FLOW_INITIALIZED: ${scriptInitResult.message}`,
        {
          flowId: scriptInitResult.flowId,
          sessionId: scriptInitResult.sessionId,
          queueId: scriptInitResult.queueId
        }
      );

      // ISSUE-006 fix: create a shell LeadNudgeState if one does not exist yet.
      // NO nudgeBaseline is set here — this is existence-only. The scheduler will skip
      // this record (line 160: `if (!baseline) { skipped++; continue; }`) until a real
      // outbound primes the baseline via initLeadNudge or the existing activation path.
      try {
        const existingNudge = await base44.asServiceRole.entities.LeadNudgeState.filter({ leadId }).catch(() => []);
        if (existingNudge.length === 0) {
          const nudgeBaselineNow = new Date().toISOString();
          await base44.asServiceRole.entities.LeadNudgeState.create({
            leadId,
            coach_email: coachEmail,
            lastNudgeStep: 0,
            stopped: false,
            nudgeBaseline: nudgeBaselineNow,
          }).catch(() => {});
          console.log('[ON_LEAD_CREATED] LeadNudgeState nudgeBaseline primed:', nudgeBaselineNow);
          console.log('[ON_LEAD_CREATED] LeadNudgeState shell created for leadId:', leadId);
        }
      } catch (_nudgeErr) {
        // Non-fatal — shell creation failure never blocks lead initialization
      }

      return Response.json({
        ok: true,
        leadId,
        flowInitialized: true,
        flowId: scriptInitResult.flowId,
        sessionId: scriptInitResult.sessionId,
        queueId: scriptInitResult.queueId,
        message: scriptInitResult.message
      });

    } catch (err) {
      console.log('[ON_LEAD_CREATED] Exception:', err.message);
      await writeLog(base44, leadId, coachEmail, 'FLOW_PAUSED',
        `FLOW_INIT_EXCEPTION: ${err.message}`,
        { error: err.message }
      );
      // ERROR-010 fix: stamp exception on lead so CRM shows it is not silently stuck in NEW
      await base44.asServiceRole.entities.Lead.update(leadId, {
        errorReason: `FLOW_INIT_EXCEPTION: ${err.message}`,
        status: 'ERROR'
      }).catch(() => {});
      return Response.json({
        ok: false,
        error: 'FLOW_INITIALIZATION_EXCEPTION',
        reason: err.message,
        leadId
      });
    }

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});