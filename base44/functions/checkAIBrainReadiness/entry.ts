import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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

    const report = [];
    let finalDecision = 'UNKNOWN_BLOCKER';
    let failureReason = null;

    const fail = (step, name, details, decision) => {
      const reason = details.reason || details.error || 'Unknown failure';
      if (!failureReason) failureReason = `Step ${step} [${name}]: ${reason}`;
      if (decision && finalDecision === 'UNKNOWN_BLOCKER') finalDecision = decision;
      report.push({ step, name, status: 'fail', details: { ...details, reason } });
    };
    const pass = (step, name, details) => report.push({ step, name, status: 'success', details });
    const info = (step, name, details) => report.push({ step, name, status: 'info', details });

    // ── Step 1: Lead snapshot ─────────────────────────────────────────────────
    const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId }).catch(() => []);
    const lead = leads[0] || null;

    if (!lead) {
      fail(1, 'Lead exists', { reason: `No lead found with id=${leadId}` }, 'LEAD_NOT_FOUND');
      return Response.json({ ok: true, leadId, finalDecision, failureReason, report });
    }

    // Validate phone fields
    const phoneIssues = [];
    if (!lead.phone) phoneIssues.push('phone is missing');
    if (!lead.phoneE164) phoneIssues.push('phoneE164 is missing — AI cannot match inbound sender');
    else if (!/^\+?\d{10,15}$/.test(lead.phoneE164)) phoneIssues.push(`phoneE164 format invalid: "${lead.phoneE164}"`);

    if (phoneIssues.length > 0) {
      fail(1, 'Lead phone data', {
        leadId: lead.id,
        coach_email: lead.coach_email,
        phone: lead.phone || '(missing)',
        phoneRaw: lead.phoneRaw || '(missing)',
        phoneE164: lead.phoneE164 || '(missing)',
        leadStatus: lead.status,
        isSimulatorLead: lead.isSimulatorLead,
        reason: phoneIssues.join('; '),
      }, 'INVALID_PHONE');
    } else {
      pass(1, 'Lead phone data', {
        leadId: lead.id,
        coach_email: lead.coach_email,
        phone: lead.phone,
        phoneRaw: lead.phoneRaw || '(not set)',
        phoneE164: lead.phoneE164,
        leadStatus: lead.status,
        isSimulatorLead: lead.isSimulatorLead,
        waOptOut: lead.waOptOut || false,
        lastMessageAt: lead.lastMessageAt || null,
        lastInboundAt: lead.lastInboundAt || null,
      });
    }

    // ── Step 2: waOptOut check ────────────────────────────────────────────────
    if (lead.waOptOut === true) {
      fail(2, 'WA opt-out check', {
        waOptOut: true,
        reason: 'Lead has opted out of WhatsApp — AI will not message them',
      }, 'LEAD_OPT_OUT');
    } else {
      pass(2, 'WA opt-out check', { waOptOut: false, note: 'Lead has not opted out' });
    }

    // ── Step 3: WhatsApp provider config ──────────────────────────────────────
    const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({
      coach_email: lead.coach_email,
    }).catch(() => []);

    const allConfigSnapshot = configs.map(c => ({
      id: c.id,
      provider_type: c.provider_type,
      is_enabled: c.is_enabled,
      instance_id: c.instance_id ? `${c.instance_id.slice(0, 6)}...` : '(missing)',
      api_token_present: !!c.api_token,
      api_url: c.api_url || '(missing)',
      status: c.status,
    }));

    const config = configs.find(c =>
      c.provider_type === 'greenapi' &&
      c.is_enabled &&
      c.instance_id &&
      c.instance_id !== 'YOUR_INSTANCE_ID' &&
      c.api_token &&
      c.api_url
    ) || null;

    if (!config) {
      const issues = [];
      if (configs.length === 0) issues.push('No WhatsAppProviderConfig records found for coach');
      else {
        const gc = configs.find(c => c.provider_type === 'greenapi');
        if (!gc) issues.push('No greenapi config exists');
        else {
          if (!gc.is_enabled) issues.push('is_enabled = false');
          if (!gc.instance_id || gc.instance_id === 'YOUR_INSTANCE_ID') issues.push('instance_id missing or placeholder');
          if (!gc.api_token) issues.push('api_token missing');
          if (!gc.api_url) issues.push('api_url missing');
        }
      }
      fail(3, 'WhatsApp provider config', {
        coach_email: lead.coach_email,
        totalConfigs: configs.length,
        allConfigSnapshot,
        reason: issues.join('; ') || 'No valid enabled greenapi config',
      }, 'INVALID_PROVIDER_CONFIG');
    } else {
      pass(3, 'WhatsApp provider config', {
        configId: config.id,
        provider_type: config.provider_type,
        is_enabled: config.is_enabled,
        instance_id: `${config.instance_id.slice(0, 6)}...`,
        api_token_present: true,
        api_url: config.api_url,
        status: config.status || '(not set)',
      });
    }

    // ── Step 4: AIBrainConfig ────────────────────────────────────────────────
    const brainConfigs = await base44.asServiceRole.entities.AIBrainConfig.filter({
      coach_email: lead.coach_email,
    }).catch(() => []);
    const activeBrain = brainConfigs.find(b => b.isActive) || null;

    if (!activeBrain) {
      fail(4, 'AIBrainConfig active', {
        coach_email: lead.coach_email,
        totalBrainConfigs: brainConfigs.length,
        reason: brainConfigs.length === 0
          ? 'No AIBrainConfig records found for coach'
          : 'AIBrainConfig exists but isActive = false on all records',
      }, 'NO_ACTIVE_BRAIN_CONFIG');
    } else {
      pass(4, 'AIBrainConfig active', {
        brainConfigId: activeBrain.id,
        businessName: activeBrain.businessName || '(missing)',
        isActive: activeBrain.isActive,
        hasConversationGoal: !!activeBrain.conversationGoal,
        hasSalesRules: !!activeBrain.salesRules,
        hasToneOfVoice: !!activeBrain.toneOfVoice,
      });
    }

    // ── Step 5: LeadMessageThread — all threads snapshot ─────────────────────
    const allThreads = await base44.asServiceRole.entities.LeadMessageThread.filter({
      leadId: lead.id,
    }).catch(() => []);

    const inboundThreads = allThreads.filter(t => t.direction === 'INBOUND');
    const outboundThreads = allThreads.filter(t => t.direction === 'OUTBOUND');
    const latestInbound = inboundThreads.length > 0
      ? inboundThreads.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0]
      : null;

    info(5, 'LeadMessageThread snapshot', {
      totalThreadRecords: allThreads.length,
      totalInbound: inboundThreads.length,
      totalOutbound: outboundThreads.length,
      latestInboundId: latestInbound?.id || null,
      latestInboundText: latestInbound ? (latestInbound.messageText || '').slice(0, 100) : null,
      latestInboundCreatedAt: latestInbound?.created_date || null,
      latestInboundChannel: latestInbound?.channel || '(not set)',
      latestInboundProviderMessageId: latestInbound?.providerMessageId || '(not set)',
    });

    if (!latestInbound) {
      fail(6, 'Inbound message exists', {
        reason: 'No INBOUND message found in LeadMessageThread — AI has nothing to respond to',
        fix: 'Run "Manual WhatsApp Sync" or "Simulate Inbound Message" first',
      }, 'NO_INBOUND_MESSAGE');
    } else {
      pass(6, 'Inbound message exists', {
        threadId: latestInbound.id,
        messageText: (latestInbound.messageText || '').slice(0, 100),
        channel: latestInbound.channel || '(not set)',
        direction: latestInbound.direction,
        senderType: latestInbound.senderType || '(not set)',
        providerMessageId: latestInbound.providerMessageId || '(not set)',
        created_date: latestInbound.created_date,
      });
    }

    // ── Step 6 (was 4): Channel field validation ──────────────────────────────
    if (latestInbound) {
      const channelOk = latestInbound.channel === 'WHATSAPP';
      if (!channelOk) {
        // warn but don't block — we fixed this logic in manualTriggerAI
        info(7, 'Channel field validation', {
          channel: latestInbound.channel || '(missing)',
          isWhatsapp: false,
          note: 'channel != WHATSAPP — if using old manualTriggerAI this would have caused a miss. Should be auto-fixed now.',
        });
      } else {
        pass(7, 'Channel field validation', { channel: 'WHATSAPP', isWhatsapp: true });
      }
    } else {
      info(7, 'Channel field validation', { note: 'Skipped — no inbound record' });
    }

    // ── Step 7: AI eligibility (idempotency state) ────────────────────────────
    if (latestInbound) {
      const aiProcessed = latestInbound.aiProcessed === true;
      const replyLocked = !!(latestInbound.replyGenerationStartedAt);
      const replyLinked = !!(latestInbound.replyMessageId || latestInbound.replyQueueId);
      const eligible = !aiProcessed && !replyLocked;

      if (!eligible) {
        const reason = aiProcessed
          ? 'aiProcessed = true — AI marks messages as processed after handling, AI will skip this'
          : `replyGenerationStartedAt = "${latestInbound.replyGenerationStartedAt}" — idempotency lock is held`;
        fail(8, 'AI eligibility (idempotency)', {
          aiProcessed,
          replyGenerationStartedAt: latestInbound.replyGenerationStartedAt || null,
          replyGeneratedAt: latestInbound.replyGeneratedAt || null,
          replySentAt: latestInbound.replySentAt || null,
          replyProducer: latestInbound.replyProducer || null,
          replyMessageId: latestInbound.replyMessageId || null,
          replyQueueId: latestInbound.replyQueueId || null,
          replyStatus: latestInbound.replyStatus || null,
          reason,
        }, 'INBOUND_ALREADY_PROCESSED');
      } else {
        pass(8, 'AI eligibility (idempotency)', {
          aiProcessed,
          replyGenerationStartedAt: null,
          replyLinked,
          replyStatus: latestInbound.replyStatus || null,
          eligible: true,
          note: 'Message is unprocessed and unlocked — AI can run',
        });
        if (finalDecision === 'UNKNOWN_BLOCKER') finalDecision = 'READY_TO_RUN_AI';
      }
    } else {
      info(8, 'AI eligibility (idempotency)', { note: 'Skipped — no inbound record' });
    }

    // ── Step 9: Script / conversation session state ───────────────────────────
    const flowStates = await base44.asServiceRole.entities.LeadConversationState.filter({
      leadId: lead.id,
    }).catch(() => []);
    const activeFlow = flowStates.find(f => f.isActive) || flowStates[0] || null;

    info(9, 'Script / conversation session state', {
      scriptSessionId: lead.scriptSessionId || null,
      currentScriptStage: lead.currentScriptStage ?? null,
      activeScriptId: lead.activeScriptId || null,
      activeScriptType: lead.activeScriptType || null,
      conversationFlowFound: !!activeFlow,
      flowStatus: activeFlow?.flowStatus || null,
      currentStepOrder: activeFlow?.currentStepOrder ?? null,
      currentStepMessage: activeFlow?.currentStepMessage
        ? activeFlow.currentStepMessage.slice(0, 80)
        : null,
      isActive: activeFlow?.isActive ?? null,
    });

    // ── Final decision resolution ─────────────────────────────────────────────
    if (finalDecision === 'UNKNOWN_BLOCKER') {
      const anyFail = report.some(r => r.status === 'fail');
      finalDecision = anyFail ? 'UNKNOWN_BLOCKER' : 'READY_TO_RUN_AI';
    }
    if (!failureReason && finalDecision === 'READY_TO_RUN_AI') {
      failureReason = null;
    }

    return Response.json({
      ok: true,
      leadId: lead.id,
      coach_email: lead.coach_email,
      finalDecision,
      failureReason,
      report,
    });

  } catch (error) {
    console.error('[CHECK_AI_READINESS] Fatal error:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});