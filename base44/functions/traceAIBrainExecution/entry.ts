import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ── Helpers ───────────────────────────────────────────────────────────────────
function maskToken(val) {
  if (!val) return null;
  const s = String(val);
  if (s.length <= 8) return '***';
  return s.slice(0, 4) + '***' + s.slice(-4);
}

function buildAIBrainPrompt(config) {
  const section = (title, content) =>
    content && content.trim() ? `\n\n## ${title}\n${content.trim()}` : '';
  let prompt = `אתה סוכן מכירות AI חכם ומקצועי עבור: **${config.businessName}**.`;
  if (config.businessType) prompt += `\nסוג עסק: ${config.businessType}`;
  prompt += section('על העסק', config.businessDescription);
  const logistics = [
    config.businessLocation && `כתובת: ${config.businessLocation}`,
    config.openingHours && `שעות פתיחה: ${config.openingHours}`,
  ].filter(Boolean).join('\n');
  prompt += section('מיקום ולוגיסטיקה', logistics);
  prompt += section('שירותים', config.servicesOffered);
  prompt += section('מחירים', config.pricingInfo);
  prompt += section('שאלות נפוצות', config.faq);
  prompt += section('כללי מכירה', config.salesRules);
  prompt += section('סגנון תקשורת', config.toneOfVoice);
  if (config.conversationGoal) {
    prompt += `\n\n## מטרת השיחה\n${config.conversationGoal}`;
  }
  prompt += `\n\n## פורמט תגובה — JSON בלבד\n{"reply": "תשובה לוואטסאפ", "action": "continue|escalate|booking_intent|callback_request", "escalation_reason": null}`;
  return prompt;
}

// ── Main Handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { leadId } = await req.json();
    if (!leadId) {
      return Response.json({ ok: false, error: 'leadId is required' }, { status: 400 });
    }

    const runtimeReport = [];
    let finalExecutionDecision = 'AI_UNKNOWN_RUNTIME_FAILURE';
    let failureReason = null;

    const pass = (step, name, details) => runtimeReport.push({ step, name, status: 'success', details });
    const fail = (step, name, details, decision) => {
      const reason = details.reason || details.error || 'Unknown';
      if (!failureReason) failureReason = `Step ${step} [${name}]: ${reason}`;
      if (decision) finalExecutionDecision = decision;
      runtimeReport.push({ step, name, status: 'error', details: { ...details, reason } });
    };
    const info = (step, name, details) => runtimeReport.push({ step, name, status: 'info', details });

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 10: AI Brain invoke start
    // ─────────────────────────────────────────────────────────────────────────
    const invokeStartTs = Date.now();
    const invokeStartTime = new Date().toISOString();

    // Load lead
    const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId }).catch(() => []);
    const lead = leads[0] || null;

    if (!lead) {
      fail(10, 'AI Brain invoke start', {
        timestamp: invokeStartTime,
        leadId,
        functionInvoked: false,
        reason: 'Lead not found — cannot start AI invocation',
      }, 'AI_INVOKE_NOT_STARTED');
      return Response.json({ ok: true, leadId, finalExecutionDecision, failureReason, runtimeReport });
    }

    // Load latest inbound message (all inbound — including already processed ones)
    const allThreads = await base44.asServiceRole.entities.LeadMessageThread.filter({ leadId }).catch(() => []);
    const inboundThreads = allThreads.filter(t => t.direction === 'INBOUND');
    const latestInbound = inboundThreads.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0] || null;
    // Also find latest UNPROCESSED inbound (ideal for new AI run)
    const unprocessedInbound = inboundThreads
      .filter(t => !t.aiProcessed && !t.replyGenerationStartedAt)
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0] || null;
    const targetInbound = unprocessedInbound || latestInbound;

    if (!targetInbound) {
      fail(10, 'AI Brain invoke start', {
        timestamp: invokeStartTime,
        leadId,
        functionInvoked: false,
        inboundThreadCount: inboundThreads.length,
        tip: 'Click "Simulate Inbound Message" to create a test inbound record first',
        reason: 'No inbound message found in LeadMessageThread — nothing to invoke AI with',
      }, 'AI_INVOKE_NOT_STARTED');
      return Response.json({ ok: true, leadId, finalExecutionDecision, failureReason, runtimeReport });
    }

    // Check idempotency (would real invocation be skipped?)
    const wouldBeSkippedByIdempotency = targetInbound.aiProcessed === true || !!targetInbound.replyGenerationStartedAt;
    const usingFallbackProcessed = !unprocessedInbound && !!latestInbound;

    pass(10, 'AI Brain invoke start', {
      timestamp: invokeStartTime,
      leadId,
      coach_email: lead.coach_email,
      inboundMessageId: targetInbound.id,
      inboundProviderMessageId: targetInbound.providerMessageId || '(not set)',
      channel: targetInbound.channel || '(not set)',
      functionInvoked: true,
      invocationMode: 'manual_trace',
      totalInboundMessages: inboundThreads.length,
      unprocessedInboundFound: !!unprocessedInbound,
      usingFallbackProcessedMessage: usingFallbackProcessed,
      wouldBeSkippedByIdempotency,
      sanitizedPayloadPreview: {
        leadId,
        messageText: (targetInbound.messageText || '').slice(0, 80),
        coach_email: lead.coach_email,
      },
      note: usingFallbackProcessed
        ? '⚠️ All inbound messages are already processed (aiProcessed=true). Run "Simulate Inbound Message" again to create a fresh unprocessed inbound.'
        : wouldBeSkippedByIdempotency
          ? '⚠️ Real invocation would be SKIPPED by idempotency — aiProcessed=true or replyGenerationStartedAt is set'
          : '✅ Unprocessed inbound found — AI invocation would proceed normally',
    });

    const messageText = targetInbound.messageText || '';
    const coachEmail = lead.coach_email;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 11: Prompt / context build
    // ─────────────────────────────────────────────────────────────────────────
    let brainConfig = null;
    let historyMessages = [];
    let activeFlow = null;
    let activeScript = null;
    let scriptStages = [];
    let promptBuilt = false;
    let fullPrompt = null;

    try {
      // Load AI Brain
      const brains = await base44.asServiceRole.entities.AIBrainConfig.filter({ coach_email: coachEmail }).catch(() => []);
      brainConfig = brains.find(b => b.isActive) || null;

      // Load conversation history
      const allMsgs = await base44.asServiceRole.entities.LeadMessageThread.filter({ leadId }).catch(() => []);
      historyMessages = allMsgs
        .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))
        .slice(-12);

      // Load active flow
      const flowStates = await base44.asServiceRole.entities.LeadConversationState.filter({ leadId }).catch(() => []);
      activeFlow = flowStates.find(f => f.isActive) || flowStates[0] || null;

      // Load sales script
      const allScripts = await base44.asServiceRole.entities.SalesScript.filter({ coach_email: coachEmail }).catch(() => []);
      activeScript = allScripts.find(s => s.is_active && s.script_enabled !== false && s.script_type === 'main') || null;

      if (activeScript) {
        const allStages = await base44.asServiceRole.entities.SalesScriptStage.filter({ script_id: activeScript.id }).catch(() => []);
        scriptStages = allStages.sort((a, b) => a.stage_order - b.stage_order);
      }

      // Check for AIConversationLog escalation block
      const aiLogs = await base44.asServiceRole.entities.AIConversationLog.filter({ leadId }).catch(() => []);
      const currentAILog = aiLogs[0] || null;
      const blockedByEscalation = currentAILog && ['AI_ESCALATED', 'HUMAN_REVIEW'].includes(currentAILog.ai_status);

      if (!brainConfig) {
        fail(11, 'Prompt / context build', {
          contextBuildStarted: true,
          businessName: null,
          hasConversationGoal: false,
          reason: `No active AIBrainConfig for coach_email=${coachEmail}`,
        }, 'AI_CONTEXT_BUILD_FAILED');
      } else {
        // Build prompt (safe copy of real logic)
        const systemPrompt = buildAIBrainPrompt(brainConfig);
        const historyText = historyMessages
          .map(m => `${m.direction === 'INBOUND' ? 'לקוח' : 'סוכן'}: ${m.messageText}`)
          .join('\n');
        const currentAnswers = lead.answers || {};
        const answeredFields = Object.keys(currentAnswers).filter(k => currentAnswers[k]);
        const pendingStages = scriptStages.filter(s => s.crm_field && !answeredFields.includes(s.crm_field));
        const nextStage = pendingStages[0] || null;

        fullPrompt = `${systemPrompt}\n\n## היסטוריית שיחה:\n${historyText || '(שיחה חדשה)'}\n\nהודעה נוכחית מהלקוח: "${messageText}"\n\nענה ב-JSON בלבד.`;
        promptBuilt = true;

        const contextSources = ['AIBrainConfig'];
        if (historyMessages.length > 0) contextSources.push('LeadMessageThread history');
        if (activeFlow) contextSources.push('LeadConversationState');
        if (activeScript) contextSources.push(`SalesScript: ${activeScript.name}`);
        if (scriptStages.length > 0) contextSources.push(`SalesScriptStages: ${scriptStages.length} stages`);

        pass(11, 'Prompt / context build', {
          contextBuildStarted: true,
          businessName: brainConfig.businessName,
          hasConversationGoal: !!brainConfig.conversationGoal,
          hasSalesRules: !!brainConfig.salesRules,
          hasToneOfVoice: !!brainConfig.toneOfVoice,
          historyMessagesFound: historyMessages.length,
          historyMessagesUsedCount: historyMessages.length,
          activeFlowFound: !!activeFlow,
          activeFlowStatus: activeFlow?.flowStatus || null,
          currentStepOrder: activeFlow?.currentStepOrder ?? null,
          activeScriptFound: !!activeScript,
          activeScriptName: activeScript?.name || null,
          scriptStagesCount: scriptStages.length,
          pendingStagesCount: pendingStages.length,
          nextStageName: nextStage?.stage_name || null,
          answeredFieldsCount: answeredFields.length,
          promptBuilt: true,
          promptLength: fullPrompt.length,
          contextSources,
          blockedByEscalation,
          currentAILogStatus: currentAILog?.ai_status || null,
          note: blockedByEscalation
            ? `⚠️ AI would be BLOCKED by AIConversationLog status: ${currentAILog.ai_status}`
            : 'Context built successfully — AI would proceed to generation',
        });
      }
    } catch (err) {
      fail(11, 'Prompt / context build', {
        contextBuildStarted: true,
        promptBuilt: false,
        reason: err.message,
        errorName: err.name,
        stackPreview: (err.stack || '').slice(0, 300),
      }, 'AI_CONTEXT_BUILD_FAILED');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 12: AI generation result — actually invoke LLM
    // ─────────────────────────────────────────────────────────────────────────
    let aiGenResult = null;
    let replyText = null;
    let generationLatencyMs = null;

    if (promptBuilt && fullPrompt && brainConfig) {
      const genStart = Date.now();
      try {
        aiGenResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: fullPrompt,
          response_json_schema: {
            type: 'object',
            properties: {
              reply: { type: 'string' },
              action: { type: 'string' },
              escalation_reason: { type: 'string' },
              extracted_fields: { type: 'object' }
            },
            required: ['reply', 'action']
          }
        });
        generationLatencyMs = Date.now() - genStart;
        replyText = aiGenResult?.reply || null;

        if (!replyText) {
          fail(12, 'AI generation result', {
            generationStarted: true,
            generationCompleted: true,
            latencyMs: generationLatencyMs,
            responseTextExists: false,
            responseTextLength: 0,
            emptyResponse: true,
            rawResponse: JSON.stringify(aiGenResult).slice(0, 200),
            reason: 'AI returned a result but reply field is empty or null',
          }, 'AI_EMPTY_RESPONSE');
        } else {
          pass(12, 'AI generation result', {
            generationStarted: true,
            generationCompleted: true,
            latencyMs: generationLatencyMs,
            responseTextExists: true,
            responseTextLength: replyText.length,
            responsePreview: replyText.slice(0, 120),
            emptyResponse: false,
            action: aiGenResult?.action || null,
            hasEscalationReason: !!aiGenResult?.escalation_reason,
            extractedFieldsCount: Object.keys(aiGenResult?.extracted_fields || {}).length,
            note: 'LLM responded successfully',
          });
        }
      } catch (err) {
        generationLatencyMs = Date.now() - genStart;
        fail(12, 'AI generation result', {
          generationStarted: true,
          generationCompleted: false,
          latencyMs: generationLatencyMs,
          responseTextExists: false,
          emptyResponse: true,
          rawErrorMessage: err.message,
          rawErrorName: err.name,
          stackPreview: (err.stack || '').slice(0, 300),
          reason: `LLM invocation threw: ${err.message}`,
        }, 'AI_GENERATION_FAILED');
      }
    } else {
      info(12, 'AI generation result', {
        generationStarted: false,
        generationCompleted: false,
        note: 'Skipped — context build failed or prompt not built',
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 13: Outbound persistence — check if outbound thread record would be created
    // (READ-ONLY: we inspect whether the last AI run created one, and whether the current run would)
    // ─────────────────────────────────────────────────────────────────────────
    const outboundThreads = allThreads.filter(t => t.direction === 'OUTBOUND' && t.senderType === 'SYSTEM');
    const latestOutbound = outboundThreads.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0] || null;

    // Check if there's a recent outbound record (within last 5 minutes) for this inbound
    const recentOutboundExists = latestOutbound
      ? (Date.now() - new Date(latestOutbound.created_date).getTime()) < 5 * 60 * 1000
      : false;

    if (replyText) {
      // We have a reply — simulate what would be persisted
      pass(13, 'Outbound persistence', {
        persistenceStarted: true,
        persistenceCompleted: true,
        outboundRecordWouldBeCreated: true,
        wouldPersist: {
          leadId,
          coach_email: coachEmail,
          channel: 'WHATSAPP',
          direction: 'OUTBOUND',
          senderType: 'SYSTEM',
          messageText_preview: replyText.slice(0, 80),
        },
        existingRecentOutbound: recentOutboundExists,
        latestOutboundId: latestOutbound?.id || null,
        latestOutboundCreatedAt: latestOutbound?.created_date || null,
        latestOutboundPreview: latestOutbound ? (latestOutbound.messageText || '').slice(0, 80) : null,
        linkedInboundId: targetInbound.id,
        note: 'AI generated a reply — outbound record would be created in LeadMessageThread',
      });
    } else {
      fail(13, 'Outbound persistence', {
        persistenceStarted: false,
        persistenceCompleted: false,
        outboundRecordWouldBeCreated: false,
        reason: 'No reply text generated — outbound record cannot be created',
        existingRecentOutbound: recentOutboundExists,
        latestOutboundId: latestOutbound?.id || null,
        latestOutboundCreatedAt: latestOutbound?.created_date || null,
      }, 'AI_PERSIST_FAILED');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 14: WhatsApp send attempt — inspect queue and provider state
    // ─────────────────────────────────────────────────────────────────────────
    const queueItems = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({
      coach_email: coachEmail,
      context_id: leadId,
    }).catch(() => []);

    const recentQueueItem = queueItems
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0] || null;

    const providerConfigs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({
      coach_email: coachEmail,
      is_enabled: true,
    }).catch(() => []);
    const providerConfig = providerConfigs.find(c => c.provider_type === 'greenapi') || null;

    const sendWouldProceed = !!replyText && !!providerConfig;

    if (!providerConfig) {
      fail(14, 'WhatsApp send attempt', {
        sendAttemptStarted: false,
        sendAttemptCompleted: false,
        providerType: null,
        reason: 'No enabled greenapi provider config found — send would not proceed',
        recentQueueItem: recentQueueItem ? {
          id: recentQueueItem.id,
          status: recentQueueItem.status,
          created_date: recentQueueItem.created_date,
          error_message: recentQueueItem.error_message || null,
          provider_response: recentQueueItem.provider_response
            ? recentQueueItem.provider_response.slice(0, 200) : null,
        } : null,
      }, 'AI_SEND_FAILED');
    } else {
      info(14, 'WhatsApp send attempt', {
        sendAttemptStarted: sendWouldProceed,
        sendAttemptCompleted: null, // can't verify without actually sending
        providerType: providerConfig.provider_type,
        providerStatus: providerConfig.status || '(not set)',
        sanitizedEndpoint: providerConfig.api_url || '(missing)',
        instanceIdMasked: maskToken(providerConfig.instance_id),
        apiTokenMasked: maskToken(providerConfig.api_token),
        providerPhone: maskToken(providerConfig.phone_number_e164),
        targetPhone: maskToken(lead.phoneE164 || lead.phone),
        sendWouldProceed,
        recentQueueItem: recentQueueItem ? {
          id: recentQueueItem.id,
          status: recentQueueItem.status,
          attempts: recentQueueItem.attempts,
          last_attempt_at: recentQueueItem.last_attempt_at || null,
          created_date: recentQueueItem.created_date,
          error_message: recentQueueItem.error_message || null,
          provider_response_preview: recentQueueItem.provider_response
            ? recentQueueItem.provider_response.slice(0, 200) : null,
        } : null,
        note: recentQueueItem
          ? `Most recent queue item status: ${recentQueueItem.status}${recentQueueItem.error_message ? ' | error: ' + recentQueueItem.error_message : ''}`
          : 'No recent queue item found for this lead',
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 15: Post-send updates — inspect current state of inbound record
    // ─────────────────────────────────────────────────────────────────────────
    // Re-fetch latest inbound to see current update state
    const freshThreads = await base44.asServiceRole.entities.LeadMessageThread.filter({
      leadId,
      direction: 'INBOUND',
    }).catch(() => []);
    const freshInbound = freshThreads.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0] || targetInbound;

    const postUpdateState = {
      updateStarted: null,
      aiProcessedUpdated: freshInbound?.aiProcessed === true,
      replyGenerationStartedAtSet: !!freshInbound?.replyGenerationStartedAt,
      replyGeneratedAtSet: !!freshInbound?.replyGeneratedAt,
      replyLinkedUpdated: !!(freshInbound?.replyMessageId || freshInbound?.replyQueueId),
      messageStatusUpdated: freshInbound?.replyStatus !== 'pending',
      updatedStatusValue: freshInbound?.replyStatus || null,
      replyMessageId: freshInbound?.replyMessageId || null,
      replyQueueId: freshInbound?.replyQueueId || null,
      replyProducer: freshInbound?.replyProducer || null,
      replyGenerationStartedAt: freshInbound?.replyGenerationStartedAt || null,
      replyGeneratedAt: freshInbound?.replyGeneratedAt || null,
      replySentAt: freshInbound?.replySentAt || null,
    };

    const allPostUpdatesPresent = postUpdateState.aiProcessedUpdated &&
      postUpdateState.replyGeneratedAtSet &&
      postUpdateState.replyLinkedUpdated &&
      postUpdateState.messageStatusUpdated;

    if (allPostUpdatesPresent) {
      pass(15, 'Post-send updates', {
        ...postUpdateState,
        note: 'All post-send fields are set — previous AI run completed successfully',
      });
    } else {
      const missing = [];
      if (!postUpdateState.aiProcessedUpdated) missing.push('aiProcessed not set to true');
      if (!postUpdateState.replyGeneratedAtSet) missing.push('replyGeneratedAt not set');
      if (!postUpdateState.replyLinkedUpdated) missing.push('replyMessageId/replyQueueId not linked');
      if (!postUpdateState.messageStatusUpdated) missing.push('replyStatus still pending');

      info(15, 'Post-send updates', {
        ...postUpdateState,
        missingUpdates: missing,
        note: missing.length > 0
          ? `Some post-send fields are missing: ${missing.join('; ')}`
          : 'Post-send state looks partially complete',
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 16: Final runtime summary
    // ─────────────────────────────────────────────────────────────────────────
    const eligibleToRun = !wouldBeSkippedByIdempotency;
    const invokeStarted = true;
    const contextBuilt = promptBuilt;
    const aiGenerated = !!replyText;
    const outboundPersisted = aiGenerated; // would be — this is a trace
    const sendAttempted = sendWouldProceed;
    const sentSuccessfully = recentQueueItem?.status === 'sent' || recentQueueItem?.status === 'provider_unconfirmed';
    const postUpdatesCompleted = allPostUpdatesPresent;

    // Determine final execution decision
    if (runtimeReport.every(r => r.status !== 'error')) {
      if (aiGenerated) {
        finalExecutionDecision = 'AI_COMPLETED';
      } else {
        finalExecutionDecision = 'AI_EMPTY_RESPONSE';
      }
    } else {
      // Take from the first failing step
      const firstFail = runtimeReport.find(r => r.status === 'error');
      if (!finalExecutionDecision || finalExecutionDecision === 'AI_UNKNOWN_RUNTIME_FAILURE') {
        finalExecutionDecision = firstFail ? 'AI_UNKNOWN_RUNTIME_FAILURE' : 'AI_COMPLETED';
      }
    }

    // Build recommendedNextFix
    let recommendedNextFix = null;
    if (wouldBeSkippedByIdempotency) {
      recommendedNextFix = 'Clear aiProcessed and replyGenerationStartedAt on the inbound record, then re-trigger AI';
    } else if (!brainConfig) {
      recommendedNextFix = 'Activate an AIBrainConfig for this coach in AI Brain Admin';
    } else if (!replyText) {
      recommendedNextFix = 'Check LLM integration credits and prompt validity';
    } else if (!providerConfig) {
      recommendedNextFix = 'Configure and enable a WhatsApp provider (Green API) for this coach';
    } else if (recentQueueItem?.status === 'failed') {
      recommendedNextFix = `Queue item failed: ${recentQueueItem.error_message} — check provider credentials and phone number format`;
    } else if (!sentSuccessfully && recentQueueItem) {
      recommendedNextFix = `Queue item status is "${recentQueueItem.status}" — queue worker may not have run yet`;
    } else if (!postUpdatesCompleted) {
      recommendedNextFix = 'Post-send DB updates incomplete — check for AI agent crashes mid-execution';
    } else {
      recommendedNextFix = 'System appears healthy — if message not received, check phone number and provider connectivity';
    }

    info(16, 'Final runtime summary', {
      eligibleToRun,
      invokeStarted,
      contextBuilt,
      aiGenerated,
      outboundPersisted,
      sendAttempted,
      sentSuccessfully,
      postUpdatesCompleted,
      finalExecutionDecision,
      failureReason,
      recommendedNextFix,
    });

    return Response.json({
      ok: true,
      leadId,
      coach_email: coachEmail,
      eligibleDecision: eligibleToRun ? 'READY_TO_RUN_AI' : 'INBOUND_ALREADY_PROCESSED',
      finalExecutionDecision,
      failureReason,
      runtimeReport,
    });

  } catch (error) {
    console.error('[traceAIBrainExecution] Fatal error:', error.message, error.stack);
    return Response.json({
      ok: false,
      error: error.message,
      errorName: error.name,
      stackPreview: (error.stack || '').slice(0, 500),
    }, { status: 500 });
  }
});