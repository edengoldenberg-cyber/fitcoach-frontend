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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { leadId, lead } = body;

    if (!leadId || !lead) {
      return Response.json({ error: 'leadId and lead are required' }, { status: 400 });
    }

    const coachEmail = lead.coach_email;
    const firstName = lead.firstName;
    const phoneE164 = lead.phoneE164;

    console.log(`[initializeLeadWithMainScript] leadId=${leadId}, coach=${coachEmail}`);

    // ── IDEMPOTENCY: Has this lead already been initialized? ────
    // If activeScriptId is set AND scriptStartedAt exists → already done, return cached result
    if (lead.activeScriptId && lead.scriptStartedAt) {
      console.log(`[initializeLeadWithMainScript] IDEMPOTENT_SKIP: Lead already has activeScriptId=${lead.activeScriptId}`);
      return Response.json({
        ok: true,
        leadId,
        scriptId: lead.activeScriptId,
        isSimulator: lead.isSimulatorLead,
        message: 'ALREADY_INITIALIZED_IDEMPOTENT_RETURN'
      });
    }

    // 1. Determine simulator mode (inline)
    const isSimulator = lead.source === 'manual_test';
    console.log(`[initializeLeadWithMainScript] isSimulatorLead=${isSimulator}`);

    // 2. Select Main Script (inline to avoid cross-function permission issues)
    const scripts = await base44.asServiceRole.entities.SalesScript.filter({
      coach_email: coachEmail,
      script_type: 'main',
      is_active: true,
      script_enabled: true
    });
    const mainScript = scripts.length > 0 ? scripts[0] : null;

    if (!mainScript) {
      console.log(`[initializeLeadWithMainScript] NO_ACTIVE_MAIN_SCRIPT for coach=${coachEmail}`);
      await base44.asServiceRole.entities.LeadActivityLog.create({
        leadId,
        coach_email: coachEmail,
        activityType: 'FLOW_PAUSED',
        activitySource: 'SYSTEM',
        message: 'SCRIPT_INITIALIZATION_FAILED: NO_ACTIVE_MAIN_SCRIPT',
        metadata: { reason: 'no_main_script_found' }
      }).catch(() => {});

      return Response.json({
        ok: false,
        error: 'NO_ACTIVE_MAIN_SCRIPT',
        leadId
      });
    }

    console.log(`[initializeLeadWithMainScript] Main Script selected: ${mainScript.id}`);

    // 3. Update lead with script attachment
    await base44.asServiceRole.entities.Lead.update(leadId, {
      activeScriptId: mainScript.id,
      activeScriptType: 'main',
      currentScriptStage: 1,
      scriptStartedAt: new Date().toISOString(),
      isSimulatorLead: isSimulator
    });
    console.log(`[initializeLeadWithMainScript] Lead updated with Main Script`);

    // 4. Get opening message from stage 1
    const openingRes = await base44.asServiceRole.functions.invoke('getScriptOpeningMessage', {
      script_id: mainScript.id
    });
    const openingStage = openingRes?.data?.stage;

    if (!openingStage) {
      console.log(`[initializeLeadWithMainScript] NO_OPENING_STAGE`);
      return Response.json({
        ok: false,
        error: 'NO_OPENING_STAGE',
        leadId,
        scriptId: mainScript.id
      });
    }

    console.log(`[initializeLeadWithMainScript] Opening stage found: ${openingStage.question_text}`);

    // 5. Format opening message with lead name
    let openingMessage = openingStage.question_text
      .replace(/\{\{name\}\}/g, firstName)
      .replace(/\{\{firstName\}\}/g, firstName);

    // WA-Only: suppress phone CTAs if lead prefers WhatsApp only
    if (lead.waOnly) openingMessage = transformWaOnlyMessage(openingMessage);

    // 6. If real lead, enqueue opening message
    if (!isSimulator) {
      console.log(`[initializeLeadWithMainScript] Enqueueing opening message for real lead`);
      
      const queueRes = await base44.asServiceRole.functions.invoke('enqueueWhatsAppMessage', {
        to_phone_e164: phoneE164,
        rendered_text: openingMessage,
        template_key: 'script_opening_stage_1',
        coach_email: coachEmail,
        context_type: 'lead',
        context_id: leadId
      });

      const queueId = queueRes?.data?.queueId;
      console.log(`[initializeLeadWithMainScript] Opening message enqueued: ${queueId}`);

      await base44.asServiceRole.entities.LeadActivityLog.create({
        leadId,
        coach_email: coachEmail,
        activityType: 'STEP_SENT',
        activitySource: 'SYSTEM',
        message: `SCRIPT_OPENING_ENQUEUED: stage 1 from Main Script`,
        metadata: {
          scriptId: mainScript.id,
          stageId: openingStage.id,
          queueId,
          messagePreview: openingMessage.slice(0, 50)
        }
      }).catch(() => {});

      return Response.json({
        ok: true,
        leadId,
        scriptId: mainScript.id,
        isSimulator: false,
        queueId,
        message: 'OPENING_MESSAGE_ENQUEUED'
      });
    } else {
      console.log(`[initializeLeadWithMainScript] Simulator mode - no real WhatsApp send`);

      // Log simulator mode
      await base44.asServiceRole.entities.LeadMessageThread.create({
        leadId,
        coach_email: coachEmail,
        channel: 'WHATSAPP',
        direction: 'OUTBOUND',
        senderType: 'SYSTEM',
        messageText: openingMessage,
        messageTimestamp: new Date().toISOString()
      }).catch(() => {});

      await base44.asServiceRole.entities.LeadActivityLog.create({
        leadId,
        coach_email: coachEmail,
        activityType: 'STEP_SENT',
        activitySource: 'SYSTEM',
        message: `SIMULATOR_MODE: Script opening stored internally`,
        metadata: {
          scriptId: mainScript.id,
          stageId: openingStage.id,
          messagePreview: openingMessage.slice(0, 50)
        }
      }).catch(() => {});

      return Response.json({
        ok: true,
        leadId,
        scriptId: mainScript.id,
        isSimulator: true,
        message: 'OPENING_MESSAGE_STORED_IN_SIMULATOR_MODE'
      });
    }

  } catch (error) {
    console.error('[initializeLeadWithMainScript] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});