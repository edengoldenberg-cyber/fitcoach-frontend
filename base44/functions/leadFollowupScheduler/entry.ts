import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function isValidE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone || '');
}

const MSG_FOLLOWUP_1 = `רק מקפיץ רגע 😊 איזה שעות נוח לך השבוע? בוקר / ערב?`;
const MSG_FOLLOWUP_2 = `אני שומר לך מקום לשבוע ניסיון.
רוצה שאשלח קישור לקביעת אימון היכרות?`;

const FOLLOWUP_1_DELAY_MS = 10 * 60 * 1000;       // 10 minutes
const FOLLOWUP_2_DELAY_MS = 24 * 60 * 60 * 1000;  // 24 hours
const NO_RESPONSE_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours after followup_2

async function logEvent(base44, coachEmail, event, payload) {
  await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
    coach_email: coachEmail || 'system',
    event,
    payload
  }).catch(() => {});
}

async function queueFollowup(base44, lead, renderedText, templateKey) {
  const coachEmail = lead.coach_email || 'system';
  const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail }).catch(() => []);
  const providerType = configs[0]?.provider_type || 'mock';

  const record = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
    coach_email: coachEmail,
    to_phone_e164: lead.phoneE164,
    to_name: [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.phoneE164,
    context_type: 'lead',
    context_id: lead.id,
    template_key: templateKey,
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

    // ── GLOBAL KILL SWITCH ─────────────────────────────────────────────────────
    const killCfg = await base44.asServiceRole.entities.SystemConfig
      .filter({ key: 'GLOBAL_WHATSAPP_ENABLED' }).catch(() => []);
    if (killCfg[0]?.value !== true) {
      console.log('[leadFollowupScheduler] KILL_SWITCH: GLOBAL_WHATSAPP_ENABLED=false — scheduler blocked');
      return Response.json({ ok: false, blocked: true, reason: 'GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE',
        followup1: 0, followup2: 0, noResponse: 0, errors: 0, checkedLeads: 0 });
    }

    const now = Date.now();

    await logEvent(base44, 'system', 'WORKER_START', {
      event: 'FOLLOWUP_SCHEDULER_RUN',
      startedAt: new Date().toISOString()
    });

    // Load all leads that may need follow-up
    const allLeads = await base44.asServiceRole.entities.Lead.filter({});
    const actionableLeads = allLeads.filter(l =>
      ['CONTACTED', 'FOLLOWUP_1', 'FOLLOWUP_2'].includes(l.status) &&
      !l.lastInboundAt &&
      !l.waOptOut &&
      l.status !== 'BOOKED' &&
      l.status !== 'CLOSED'
    );

    const stats = { followup1: 0, followup2: 0, noResponse: 0, errors: 0 };

    for (const lead of actionableLeads) {
      const coachEmail = lead.coach_email || 'system';
      const lastMsgMs = lead.lastMessageAt ? new Date(lead.lastMessageAt).getTime() : 0;
      const elapsed = now - lastMsgMs;

      if (!lead.phoneE164 || !isValidE164(lead.phoneE164)) continue;

      // Skip if salesFlowRunner already owns this lead's conversation
      const activeSessions = await base44.asServiceRole.entities.LeadConversationState
        .filter({ leadId: lead.id, isActive: true }).catch(() => []);
      if (activeSessions.some(s => s.flowStatus === 'ACTIVE')) {
        await logEvent(base44, coachEmail, 'RULE_TRIGGERED', {
          event: 'FOLLOWUP_SKIPPED_ACTIVE_FLOW', leadId: lead.id
        });
        continue;
      }

      try {
        if (lead.status === 'CONTACTED' && elapsed >= FOLLOWUP_1_DELAY_MS) {
          // Send followup 1
          const renderedText = MSG_FOLLOWUP_1;
          const qr = await queueFollowup(base44, lead, renderedText, 'lead_followup_1');
          await base44.asServiceRole.entities.Lead.update(lead.id, {
            status: 'FOLLOWUP_1',
            lastMessageAt: new Date().toISOString()
          }).catch(() => {});
          await logEvent(base44, coachEmail, 'QUEUE_ADD', {
            event: 'FOLLOWUP_SENT',
            followupNum: 1,
            leadId: lead.id,
            queueId: qr.id
          });
          stats.followup1++;

        } else if (lead.status === 'FOLLOWUP_1' && elapsed >= FOLLOWUP_2_DELAY_MS) {
          // Send followup 2
          const renderedText = MSG_FOLLOWUP_2;
          const qr = await queueFollowup(base44, lead, renderedText, 'lead_followup_2');
          await base44.asServiceRole.entities.Lead.update(lead.id, {
            status: 'FOLLOWUP_2',
            lastMessageAt: new Date().toISOString()
          }).catch(() => {});
          await logEvent(base44, coachEmail, 'QUEUE_ADD', {
            event: 'FOLLOWUP_SENT',
            followupNum: 2,
            leadId: lead.id,
            queueId: qr.id
          });
          stats.followup2++;

        } else if (lead.status === 'FOLLOWUP_2' && elapsed >= NO_RESPONSE_DELAY_MS) {
          // Mark no response
          await base44.asServiceRole.entities.Lead.update(lead.id, {
            status: 'NO_RESPONSE'
          }).catch(() => {});
          await logEvent(base44, coachEmail, 'RULE_TRIGGERED', {
            event: 'NO_RESPONSE',
            leadId: lead.id
          });
          stats.noResponse++;
        }
      } catch (e) {
        stats.errors++;
        await logEvent(base44, coachEmail, 'SEND_FAIL', {
          event: 'FOLLOWUP_ERROR',
          leadId: lead.id,
          error: e.message
        });
      }
    }

    // Trigger queue worker if anything was queued
    if (stats.followup1 + stats.followup2 > 0) {
      await base44.asServiceRole.functions.invoke('whatsAppQueueWorker', {}).catch(() => {});
    }

    return Response.json({ ok: true, ...stats, checkedLeads: actionableLeads.length, ranAt: new Date().toISOString() }, { status: 200 });
  } catch (error) {
    console.error('[leadFollowupScheduler] FATAL ERROR:', error.message, error.stack);
    return Response.json({ ok: false, error: error.message, ranAt: new Date().toISOString() }, { status: 200 });
  }
});