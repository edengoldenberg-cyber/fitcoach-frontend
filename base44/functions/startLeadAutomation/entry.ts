import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function isValidE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone || '');
}

const MSG_1 = `היי {{firstName}} 👋
כאן Shape Studio.
ראינו שהתעניינת באימונים שלנו 💪
בא לך שנשלח לך פרטים על שבוע ניסיון ונבדוק איזה שעות מתאימות לך?`;

async function logEvent(base44, coachEmail, event, payload) {
  await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
    coach_email: coachEmail || 'system',
    event,
    payload
  }).catch(() => {});
}

async function queueMessage(base44, coachEmail, phoneE164, toName, renderedText, contextId) {
  const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail }).catch(() => []);
  const providerType = configs[0]?.provider_type || 'mock';

  const record = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
    coach_email: coachEmail,
    to_phone_e164: phoneE164,
    to_name: toName || '',
    context_type: 'lead',
    context_id: contextId || '',
    template_key: 'lead_msg_1',
    rendered_text: renderedText,
    provider_type: providerType,
    status: 'queued',
    attempts: 0,
    scheduled_for: new Date().toISOString()
  });

  return record;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { leadId } = body;

    if (!leadId) {
      return Response.json({ ok: false, error: 'Missing leadId' }, { status: 400 });
    }

    // Load lead — accept pre-loaded lead from caller to avoid lookup failures
    let lead = body.lead || null;
    if (!lead || !lead.id) {
      const allLeads = await base44.asServiceRole.entities.Lead.filter({}, '-created_date', 2000).catch(() => []);
      lead = allLeads.find(l => l.id === leadId) || null;
    }

    if (!lead) {
      return Response.json({ ok: false, error: `Lead not found: ${leadId}` });
    }

    const coachEmail = lead.coach_email || 'system';

    // Only process NEW leads
    if (lead.status !== 'NEW') {
      await logEvent(base44, coachEmail, 'RULE_TRIGGERED', {
        event: 'AUTOMATION_SKIPPED',
        leadId,
        reason: `status is "${lead.status}", not NEW`
      });
      return Response.json({ ok: true, skipped: true, reason: `status is ${lead.status}` });
    }

    // Guard: skip if AI script conversation is already active
    if (lead.scriptSessionId) {
      await logEvent(base44, coachEmail, 'RULE_TRIGGERED', {
        event: 'AUTOMATION_SKIPPED',
        leadId,
        reason: `conversation_already_active: scriptSessionId=${lead.scriptSessionId}`
      });
      return Response.json({ ok: true, skipped: true, reason: 'conversation_already_active' });
    }

    // Guard: no double-send within 24 hours
    if (lead.lastMessageAt) {
      const hoursSinceLast = (Date.now() - new Date(lead.lastMessageAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLast < 24) {
        await logEvent(base44, coachEmail, 'RULE_TRIGGERED', {
          event: 'AUTOMATION_SKIPPED',
          leadId,
          reason: `lastMessageAt was ${hoursSinceLast.toFixed(1)}h ago — skipping double-send`
        });
        return Response.json({ ok: true, skipped: true, reason: 'double-send guard: lastMessageAt < 24h' });
      }
    }

    // Validate phone
    const phoneE164 = lead.phoneE164;
    if (!phoneE164 || !isValidE164(phoneE164)) {
      await base44.asServiceRole.entities.Lead.update(leadId, {
        status: 'INVALID_PHONE',
        errorReason: `Invalid phoneE164: "${phoneE164}"`
      }).catch(() => {});
      await logEvent(base44, coachEmail, 'SEND_FAIL', {
        event: 'INVALID_PHONE',
        leadId,
        phoneE164
      });
      return Response.json({ ok: false, error: 'Invalid phone E164' });
    }

    // ── Delegate to salesFlowRunner if an active flow exists ─────────────
    // salesFlowRunner handles all flow logic including dedup guards.
    const allFlows = await base44.asServiceRole.entities.SalesConversationFlow.filter({}).catch(() => []);
    const hasActiveSalesFlow = allFlows.some(f => (f.coach_email === coachEmail || f.isDefault) && f.is_active);

    if (hasActiveSalesFlow) {
      await logEvent(base44, coachEmail, 'RULE_TRIGGERED', {
        event: 'DELEGATING_TO_SALES_FLOW_RUNNER',
        leadId,
        reason: 'active SalesConversationFlow found'
      });
      try {
        await base44.asServiceRole.functions.invoke('salesFlowRunner', { leadId, lead });
      } catch (_) {}
      return Response.json({ ok: true, leadId, delegatedToSalesFlow: true });
    }

    // No sales flow — send hardcoded legacy message
    const toName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
    const renderedText = MSG_1.replace(/\{\{firstName\}\}/g, lead.firstName || 'שלום');

    // Small delay to ensure lead save is committed
    await new Promise(r => setTimeout(r, 3000));

    // Queue the message
    const queueRecord = await queueMessage(base44, coachEmail, phoneE164, toName, renderedText, leadId);

    // Update lead status
    await base44.asServiceRole.entities.Lead.update(leadId, {
      status: 'CONTACTED',
      lastMessageAt: new Date().toISOString(),
      whatsapp_sent_at: new Date().toISOString()
    }).catch(() => {});

    await logEvent(base44, coachEmail, 'QUEUE_ADD', {
      event: 'WHATSAPP_QUEUED',
      leadId,
      queueId: queueRecord.id,
      toPhone: phoneE164,
      template: 'lead_msg_1'
    });

    // Immediately trigger queue worker
    try {
      await base44.asServiceRole.functions.invoke('whatsAppQueueWorker', {});
    } catch (_) { /* non-fatal */ }

    return Response.json({ ok: true, leadId, queueId: queueRecord.id, status: 'CONTACTED' });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});