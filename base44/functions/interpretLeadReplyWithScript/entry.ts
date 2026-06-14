import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function transformWaOnlyMessage(text) {
  if (!text) return text;
  const replacements = [
    [/תתקשרי אלינו/g, 'תכתבי לי פה'],
    [/תתקשרי אליי/g,  'תכתבי לי פה'],
    [/תתקשר אלינו/g,  'תכתוב לי פה'],
    [/תתקשר אליי/g,   'תכתוב לי פה'],
    [/2[-–]?3?\s*דקות\s*שיחה/g, 'כמה הודעות כאן'],
    [/שיחה\s*קצרה/g,            'כמה הודעות'],
    [/לדבר\s*בטלפון/g,          'להתקדם בוואטסאפ'],
    [/אפשר\s*לדבר[?]?/g,       'אפשר להתקדם פה'],
    [/נדבר\s*\d?\s*דקות/g,     'נתכתב בכמה הודעות'],
    [/נתקשר/g,                  'נתכתב'],
    [/תתקשר/g,                  'תכתוב לי'],
    [/נדבר(?![ויאה])/g,         'נתכתב'],
    [/בשיחה/g,                  'בוואטסאפ'],
    [/שיחה/g,                   'שיחה בוואטסאפ'],
  ];
  let result = text;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

async function normalizePhoneToE164(phone) {
  if (!phone) return null;
  phone = String(phone).replace(/\D/g, '');
  if (phone.startsWith('1')) phone = phone.slice(1);
  if (!phone.startsWith('972')) {
    if (phone.startsWith('0')) phone = '972' + phone.slice(1);
    else phone = '972' + phone;
  }
  return '+' + phone;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { leadId } = body;
    // ERROR-003 fix: callers (whatsAppInboundWebhook, pollGreenApiInbound) pass messageText.
    // Support both field names so old and new callers work without any caller changes.
    const inboundMessage = body.messageText || body.inboundMessage;

    if (!leadId || !inboundMessage) {
      return Response.json({ error: 'leadId and inboundMessage (or messageText) required' }, { status: 400 });
    }

    console.log(`[interpretLeadReplyWithScript] leadId=${leadId}, message="${inboundMessage.slice(0, 50)}..."`);

    // 1. Fetch lead
    const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId });
    const lead = leads[0];
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    const scriptId = lead.activeScriptId;
    const currentStage = lead.currentScriptStage || 1;
    const coachEmail = lead.coach_email;

    console.log(`[interpretLeadReplyWithScript] Script=${scriptId}, Stage=${currentStage}`);

    // 2. Validate script exists
    if (!scriptId) {
      return Response.json({
        ok: false,
        error: 'SCRIPT_SESSION_MISSING',
        leadId,
        detail: 'Lead does not have an active script session set'
      });
    }

    // 3. Get current script stage
    const stages = await base44.asServiceRole.entities.SalesScriptStage.filter({
      script_id: scriptId,
      stage_order: currentStage
    });

    if (stages.length === 0) {
      return Response.json({
        ok: false,
        error: 'CURRENT_STAGE_NOT_FOUND',
        leadId,
        detail: `No stage found for scriptId=${scriptId}, stageOrder=${currentStage}`
      });
    }

    const stage = stages[0];
    console.log(`[interpretLeadReplyWithScript] Current stage: "${stage.stage_name}" (order=${stage.stage_order})`);

    // 3. Simple answer extraction based on stage purpose
    const extractedAnswer = interpretAnswerByStage(stage.purpose, inboundMessage);
    console.log(`[interpretLeadReplyWithScript] Extracted answer: ${extractedAnswer}`);

    // 4. Update collected answers
    const updatedAnswers = {
      ...(lead.collectedAnswers || {}),
      [stage.crm_field || stage.purpose]: extractedAnswer
    };

    await base44.asServiceRole.entities.Lead.update(leadId, {
      collectedAnswers: updatedAnswers
    });

    console.log(`[interpretLeadReplyWithScript] Collected answers updated`);

    // 5. Determine next stage
    const nextStageOrder = currentStage + 1;
    const nextStages = await base44.asServiceRole.entities.SalesScriptStage.filter({
      script_id: scriptId,
      stage_order: nextStageOrder
    });

    let nextMessage = null;
    let reachedEnd = false;

    if (nextStages.length > 0) {
      const nextStage = nextStages[0];
      nextMessage = nextStage.question_text
        .replace(/\{\{name\}\}/g, lead.firstName)
        .replace(/\{\{firstName\}\}/g, lead.firstName);

      // WA-Only: suppress phone CTAs if lead prefers WhatsApp only
      if (lead.waOnly) nextMessage = transformWaOnlyMessage(nextMessage);

      console.log(`[interpretLeadReplyWithScript] Moving to stage ${nextStageOrder}: "${nextStage.stage_name}"`);

      // Update lead to next stage
      await base44.asServiceRole.entities.Lead.update(leadId, {
        currentScriptStage: nextStageOrder
      });

      // Enqueue next message
      // ERROR-004 fix: enqueueWhatsAppMessage requires user auth (base44.auth.me()) which fails
      // from service-role invocation. Use the same direct WhatsAppMessageQueue.create pattern
      // used by salesFlowRunner, flowTimeoutChecker, and nudgeScheduler — no auth required.
      if (!lead.isSimulatorLead) {
        const providerConfigs = await base44.asServiceRole.entities.WhatsAppProviderConfig
          .filter({ coach_email: coachEmail }).catch(() => []);
        const providerType = providerConfigs[0]?.provider_type || 'mock';

        const queueRecord = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
          coach_email: coachEmail,
          to_phone_e164: lead.phoneE164,
          to_name: lead.firstName || '',
          context_type: 'lead',
          context_id: leadId,
          template_key: `script_stage_${nextStageOrder}`,
          rendered_text: nextMessage,
          provider_type: providerType,
          status: 'queued',
          attempts: 0,
          scheduled_for: new Date().toISOString(),
        }).catch(err => {
          console.error('[interpretLeadReplyWithScript] Queue create failed:', err.message);
          return null;
        });

        const queueId = queueRecord?.id || null;
        console.log(`[interpretLeadReplyWithScript] Next stage message enqueued: ${queueId}`);

        // Stamp inbound record if provided (bookkeeping — same pattern as salesFlowRunner)
        const inboundMessageId = body.inboundMessageId || null;
        if (inboundMessageId && queueId) {
          await base44.asServiceRole.entities.LeadMessageThread.update(inboundMessageId, {
            replyQueueId: queueId,
            replyStatus: 'queued',
            replyProducer: 'salesFlowRunner',
            replyGeneratedAt: new Date().toISOString()
          }).catch(() => {});
        }

        // Trigger worker immediately (fire-and-forget — same pattern as other outbound paths)
        base44.asServiceRole.functions.invoke('whatsAppQueueWorker', {}).catch(() => {});

        await base44.asServiceRole.entities.LeadActivityLog.create({
              leadId,
              coach_email: coachEmail || 'system',
              activityType: 'STEP_ADVANCED',
              activitySource: 'SYSTEM',
              message: `Script stage advanced: ${currentStage} → ${nextStageOrder}`,
              metadata: {
                fromStage: stage?.id,
                toStage: nextStage?.id,
                extractedAnswer,
                queueId
              }
            }).catch(err => {
              console.log('[interpretLeadReplyWithScript] Activity log failed (non-fatal):', err?.message);
            });
      } else {
        // Simulator mode - store internally
        await base44.asServiceRole.entities.LeadMessageThread.create({
          leadId,
          coach_email: coachEmail,
          channel: 'WHATSAPP',
          direction: 'OUTBOUND',
          senderType: 'SYSTEM',
          messageText: nextMessage,
          messageTimestamp: new Date().toISOString()
        }).catch(() => {});
      }
    } else {
      reachedEnd = true;
      console.log(`[interpretLeadReplyWithScript] Script completed - no more stages`);

      await base44.asServiceRole.entities.LeadActivityLog.create({
        leadId,
        coach_email: coachEmail || 'system',
        activityType: 'FLOW_COMPLETED',
        activitySource: 'SYSTEM',
        message: 'Script conversation completed',
        metadata: {
          finalStage: stage?.id,
          lastAnswer: extractedAnswer,
          allCollectedAnswers: updatedAnswers
        }
      }).catch(err => {
        console.log('[interpretLeadReplyWithScript] Activity log failed (non-fatal):', err?.message);
      });
    }

    return Response.json({
      ok: true,
      leadId,
      currentStage,
      extractedAnswer,
      nextStageOrder: reachedEnd ? null : nextStageOrder,
      nextMessage,
      reachedEnd,
      collectedAnswers: updatedAnswers
    });

  } catch (error) {
    console.error('[interpretLeadReplyWithScript] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function interpretAnswerByStage(stagePurpose, userMessage) {
  const msg = userMessage.toLowerCase();

  switch (stagePurpose) {
    case 'goal':
      if (msg.includes('לירידה') || msg.includes('משקל') || msg.includes('שומן')) return 'fat_loss';
      if (msg.includes('שריר') || msg.includes('התחזק') || msg.includes('חוזק')) return 'muscle_gain';
      if (msg.includes('בריאות') || msg.includes('כללי')) return 'general_health';
      if (msg.includes('כושר') || msg.includes('סטמינה')) return 'fitness';
      return userMessage;

    case 'experience':
      if (msg.includes('מתחיל') || msg.includes('ראשון')) return 'beginner';
      if (msg.includes('ביניים') || msg.includes('חצי')) return 'intermediate';
      if (msg.includes('מומחה') || msg.includes('מתקדם')) return 'advanced';
      return userMessage;

    case 'readiness':
      if (msg.includes('מיד') || msg.includes('עכשיו') || msg.includes('מחר')) return 'immediately';
      if (msg.includes('שבוע') || msg.includes('שבועות')) return 'next_week';
      if (msg.includes('חודש')) return 'next_month';
      return userMessage;

    case 'motivation':
    case 'main_concern':
    case 'interest_level':
    case 'custom':
    default:
      return userMessage;
  }
}