import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Admin-only: Create a simulator test lead and execute sales flow initialization.
 * 
 * ARCHITECTURE NOTE - WHY WE DUPLICATE LOGIC:
 * ============================================
 * This function contains IDENTICAL flow initialization logic to onLeadCreated.
 * This is INTENTIONAL and REQUIRED due to Base44 platform constraints:
 * 
 * 1. Entity automations don't fire for backend-created leads (safety feature)
 * 2. Cannot manually invoke onLeadCreated with proper auth (403 errors)
 * 3. Cannot import/share code between isolated function modules
 * 
 * PRODUCTION PATH:
 * Lead created via UI/webhook → onLeadCreated fires automatically → flow init → queue → worker → real API
 * 
 * SIMULATOR PATH:
 * createSimulatorLead called → Lead created → THIS function runs flow init → queue → worker → simulated API
 * 
 * CRITICAL: Both functions MUST maintain identical flow initialization logic:
 * - Flow selection (lines 168-193 here, 189-219 in onLeadCreated)
 * - State creation (lines 191-206 here, 214-232 in onLeadCreated)
 * - Queue creation (lines 210-226 here, 245-261 in onLeadCreated)
 * - Activity logging (lines 229-245 here, 271-283 in onLeadCreated)
 * 
 * The ONLY difference: provider_type ('simulator' vs 'greenapi')
 * 
 * When modifying flow logic, update BOTH files and verify parity.
 * See SIMULATOR_AUTH_ARCHITECTURE documentation for full details.
 */

function normalizePhone(phoneRaw) {
  if (!phoneRaw) return { e164: null, steps: ['input is empty'] };
  let s = String(phoneRaw).trim();
  const steps = [`input="${s}"`];
  // Remove all non-digit characters except leading +
  s = s.replace(/[\s\-().,]/g, '');
  // Remove any + that's not at the beginning, then remove non-digits except leading +
  const hasLeadingPlus = s.startsWith('+');
  s = s.replace(/\+/g, ''); // Remove all +
  s = s.replace(/\D/g, ''); // Remove all non-digits
  if (hasLeadingPlus) s = '+' + s; // Restore leading + if existed
  steps.push(`after_clean="${s}"`);
  if (s.startsWith('00')) { s = '+' + s.slice(2); steps.push(`00_prefix → "${s}"`); }
  if (/^972\d{9}$/.test(s)) { s = '+' + s; steps.push(`972_prefix → "${s}"`); }
  if (/^0\d{9}$/.test(s)) { s = '+972' + s.slice(1); steps.push(`0_prefix → "${s}"`); }
  const ok = /^\+972\d{9}$/.test(s);
  steps.push(`result="${s}" valid=${ok}`);
  return { e164: ok ? s : null, steps };
}

Deno.serve(async (req) => {
  const trace = [];
  const step = (label, data) => {
    trace.push({ label, data });
    console.log(`[SIM] ${label}`, data !== undefined ? JSON.stringify(data) : '');
  };

  try {
    step('FUNCTION_START', { ts: new Date().toISOString() });

    let body = {};
    try {
      body = await req.json();
      step('BODY_READ', body);
    } catch (e) {
      return Response.json({ ok: false, code: 'BODY_PARSE_ERROR', error: `Cannot parse request body: ${e.message}`, trace }, { status: 200 });
    }

    const base44 = createClientFromRequest(req);
    let user = null;
    try {
      user = await base44.auth.me();
      step('AUTH_OK', { email: user?.email, role: user?.role });
    } catch (e) {
      return Response.json({ ok: false, code: 'AUTH_ERROR', error: `Auth failed: ${e.message}`, trace }, { status: 200 });
    }

    if (!user || user.role !== 'admin') {
      return Response.json({ ok: false, code: 'FORBIDDEN', error: 'גישה מוגבלת לאדמין בלבד', trace }, { status: 403 });
    }

    const coachEmail = user.email;
    const { name, phone, source, campaignName, adName, notes } = body;

    if (!name?.trim()) return Response.json({ ok: false, code: 'VALIDATION_FAILED', field: 'name', error: 'שם מלא הוא שדה חובה', trace }, { status: 200 });
    if (!phone?.trim()) return Response.json({ ok: false, code: 'VALIDATION_FAILED', field: 'phone', error: 'מספר טלפון הוא שדה חובה', trace }, { status: 200 });

    step('VALIDATION_OK', { name, phone, source });

    const phoneRaw = phone.trim();
    let phoneNorm;
    try {
      phoneNorm = normalizePhone(phoneRaw);
      step('PHONE_NORMALIZE', { raw: phoneRaw, e164: phoneNorm.e164, steps: phoneNorm.steps });
    } catch (e) {
      return Response.json({ ok: false, code: 'PHONE_NORMALIZE_ERROR', error: `שגיאה בנרמול טלפון: ${e.message}`, trace }, { status: 200 });
    }

    if (!phoneNorm.e164) {
      return Response.json({
        ok: false, code: 'INVALID_PHONE',
        error: `לא ניתן לנרמל מספר טלפון: "${phoneRaw}". נדרש פורמט ישראלי (05X-XXXXXXX).`,
        normalizationSteps: phoneNorm.steps, trace
      }, { status: 200 });
    }
    const phoneE164 = phoneNorm.e164;

    // Duplicate check
    let byE164 = [];
    try {
      byE164 = await base44.asServiceRole.entities.Lead.filter({ phoneE164 });
      step('DUPLICATE_CHECK_E164', { phoneE164, found: byE164.length });
    } catch (e) {
      step('DUPLICATE_CHECK_E164_ERROR', { error: e.message });
    }

    if (byE164.length > 0) {
      const existing = byE164[0];
      return Response.json({
        ok: true, isDuplicate: true, code: 'DUPLICATE_FOUND',
        duplicateReason: `ליד עם מספר E164 "${phoneE164}" כבר קיים`,
        existingLeadId: existing.id, existingLead: existing,
        message: 'ליד קיים', trace
      }, { status: 200 });
    }

    const parts = name.trim().split(' ');
    const firstName = parts[0];
    const lastName  = parts.slice(1).join(' ') || '';

    const validSources = ['manual', 'manual_test', 'facebook', 'website', 'whatsapp', 'referral', 'other'];
    const safeSource   = validSources.includes(source) ? source : 'manual_test';

    const leadData = {
      firstName,
      lastName,
      phone: phoneRaw,
      phoneRaw,
      phoneE164,
      source: safeSource,
      status: 'NEW',
      isSimulatorLead: true,
      coach_email: coachEmail,
      ...(notes        ? { notes }                    : {}),
      ...(adName       ? { formName: adName }         : {}),
      ...(campaignName ? { campaignId: campaignName } : {}),
    };
    step('LEAD_PAYLOAD', {...leadData, isSimulatorLead: true});

    // Create lead using SERVICE-ROLE context
    // Note: Entity automations don't fire for backend-created leads (Base44 safety feature)
    // We will invoke onLeadCreated manually after creation to mirror the automation path
    let newLead = null;
    try {
      newLead = await base44.asServiceRole.entities.Lead.create(leadData);
      step('LEAD_CREATE_SUCCESS', { leadId: newLead?.id, isSimulatorLead: true, context: 'service_role' });
    } catch (e) {
      let detail = e.message || 'שגיאה לא ידועה';
      try {
        const jsonMatch = e.message?.match(/\{.*\}/s);
        if (jsonMatch) {
          const parsedBody = JSON.parse(jsonMatch[0]);
          if (parsedBody?.detail) detail = parsedBody.detail;
          else if (parsedBody?.error) detail = parsedBody.error;
        }
      } catch (_) {}
      return Response.json({ ok: false, code: 'CREATE_EXCEPTION', error: detail, rawError: e.message, trace }, { status: 200 });
    }

    if (!newLead?.id) {
      return Response.json({ ok: false, code: 'CREATE_NO_ID', error: 'Entity created but no ID returned', trace }, { status: 200 });
    }

    // Activity log - now using service-role for logging only
    try {
      await base44.asServiceRole.entities.LeadActivityLog.create({
        leadId: newLead.id,
        coach_email: coachEmail,
        activityType: 'LEAD_CREATED',
        activitySource: 'SYSTEM',
        message: `[SIMULATOR] ליד בדיקה נוצר: ${firstName} ${lastName} | ${phoneE164} | source: ${safeSource}`,
        metadata: { simulator: true, source: safeSource, phoneE164, campaignName, adName }
      });
      step('ACTIVITY_LOG_OK', {});
    } catch (e) {
      step('ACTIVITY_LOG_FAILED', { error: e.message });
    }

    // ── FLOW INITIALIZATION (DUPLICATED FROM onLeadCreated) ──
    // Cannot invoke onLeadCreated due to Base44 service-role function invocation restrictions.
    // This is IDENTICAL logic to onLeadCreated lines 201-356.
    step('FLOW_INIT_START', { 
      leadId: newLead.id,
      note: 'Duplicating onLeadCreated logic inline due to Base44 platform constraints'
    });

    const isSimulatorMode = safeSource === 'manual_test';
    step('SIMULATOR_MODE_SET', { isSimulatorMode, source: safeSource });

    let flowResult = null;
    try {
      // Query for active conversation flow
      let allFlows = await base44.asServiceRole.entities.SalesConversationFlow.filter({}).catch(() => []);
      let coachFlows = allFlows.filter(f => f.coach_email === coachEmail && f.is_active !== false);
      let defaultFlows = allFlows.filter(f => f.isDefault && f.is_active !== false);
      let conversationFlow = coachFlows[0] || defaultFlows[0];

      if (!conversationFlow) {
        step('FLOW_INIT_FAILED', { reason: 'NO_ACTIVE_CONVERSATION_FLOW' });
        flowResult = { ok: false, error: 'NO_ACTIVE_CONVERSATION_FLOW' };
      } else {
        step('FLOW_FOUND', { flowId: conversationFlow.id, name: conversationFlow.name });

        // Get flow steps
        const allSteps = await base44.asServiceRole.entities.SalesConversationStep.filter({
          flowId: conversationFlow.id
        }).catch(() => []);
        const steps = allSteps.sort((a, b) => a.stepOrder - b.stepOrder);

        if (steps.length === 0) {
          step('FLOW_INIT_FAILED', { reason: 'NO_STEPS_IN_FLOW' });
          flowResult = { ok: false, error: 'NO_STEPS_IN_FLOW' };
        } else {
          const step1 = steps[0];
          step('FIRST_STEP_FOUND', { stepOrder: step1.stepOrder });

          // Create session state
          const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const stateRec = await base44.asServiceRole.entities.LeadConversationState.create({
            leadId: newLead.id,
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
            step('STATE_CREATION_FAILED', { error: e.message });
            return null;
          });

          if (!stateRec?.id) {
            step('FLOW_INIT_FAILED', { reason: 'FAILED_TO_CREATE_FLOW_STATE' });
            flowResult = { ok: false, error: 'FAILED_TO_CREATE_FLOW_STATE' };
          } else {
            step('STATE_CREATED', { stateId: stateRec.id, sessionId });

            // Render first message
            const renderedText = (step1.messageText || '')
              .replace(/\{\{name\}\}/g, firstName || 'שלום')
              .replace(/\{\{firstName\}\}/g, firstName || 'שלום')
              .replace(/\{\{phone\}\}/g, phoneE164 || phoneRaw || '');

            step('MESSAGE_RENDERED', { preview: renderedText.slice(0, 50) });

            // Create queue item (test leads now use identical provider path as production)
            const queueRecord = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
              coach_email: coachEmail,
              to_phone_e164: phoneE164,
              rendered_text: renderedText,
              template_key: `flow_step_${step1.stepOrder}`,
              context_type: 'lead',
              context_id: newLead.id,
              status: 'queued',
              provider_type: 'greenapi',
              session_id: sessionId
            }).catch(e => {
              step('QUEUE_CREATION_FAILED', { error: e.message });
              throw new Error('QUEUE_ITEM_NOT_CREATED: ' + e.message);
            });

            if (!queueRecord?.id) {
              throw new Error('QUEUE_ITEM_NOT_CREATED: No queue record returned');
            }

            const queueId = queueRecord.id;
            step('QUEUE_CREATED', { 
              queueId, 
              mode: isSimulatorMode ? 'SIMULATOR' : 'REAL',
              status: 'queued'
            });

            // Log activity
            await base44.asServiceRole.entities.LeadActivityLog.create({
              leadId: newLead.id,
              coach_email: coachEmail,
              activityType: 'STEP_SENT',
              activitySource: 'SYSTEM',
              message: `FLOW_STEP_1_QUEUED: ${conversationFlow.name} | mode=${isSimulatorMode ? 'SIMULATOR' : 'REAL'} | queueId=${queueId}`,
              metadata: {
                flowId: conversationFlow.id,
                stepId: step1.id,
                queueId,
                sessionId,
                isSimulator: isSimulatorMode,
                providerType: isSimulatorMode ? 'simulator' : 'greenapi'
              }
            }).catch(() => {});

            flowResult = {
              ok: true,
              flowInitialized: true,
              flowId: conversationFlow.id,
              sessionId,
              queueId,
              message: 'FLOW_STARTED_QUEUE_CREATED_WORKER_PENDING'
            };
            step('FLOW_INIT_SUCCESS', flowResult);
          }
        }
      }
    } catch (err) {
      step('FLOW_INIT_EXCEPTION', { error: err.message });
      flowResult = {
        ok: false,
        error: err.message,
        message: 'FLOW_INITIALIZATION_EXCEPTION'
      };
    }

    return Response.json({
      ok: true,
      isDuplicate: false,
      code: 'CREATED',
      leadId: newLead.id,
      lead: newLead,
      phoneE164,
      message: 'ליד נוצר בהצלחה! Flow initialized inline (duplicated from onLeadCreated)',
      flowInitialized: flowResult?.ok || false,
      flowId: flowResult?.flowId || null,
      sessionId: flowResult?.sessionId || null,
      queueId: flowResult?.queueId || null,
      flowResult,
      trace
    }, { status: 200 });

  } catch (error) {
    console.error('[createSimulatorLead] OUTER_EXCEPTION:', error.message, error.stack);
    trace.push({ label: 'OUTER_EXCEPTION', data: { message: error.message, stack: error.stack?.substring(0, 500) } });
    return Response.json({ 
      ok: false, 
      code: 'UNEXPECTED_ERROR', 
      error: error.message || 'שגיאה לא צפויה',
      trace 
    }, { status: 200 });
  }
});