import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Polls Green API for recent incoming messages (last 10 minutes).
 * Runs every 5 minutes as a scheduled automation.
 * Acts as a reliable backup to the push webhook.
 */

/**
 * Normalize Israeli phone to 972XXXXXXXXX format (canonical, no plus)
 */
/**
 * ISSUE-007 fix: WA-only signal detector — mirrors whatsAppInboundWebhook logic exactly.
 */
function isWaOnlySignal(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const WA_ONLY_KEYWORDS = [
    'לא רוצה שיחה', 'לא רוצה שתתקשר', 'בלי שיחה',
    'עדיף בכתב', 'רק בוואצאפ', 'רק בוואטסאפ',
    'מעדיף פה', 'מעדיפה פה', 'שלח לי כאן', 'שלחי לי כאן',
    'לא נוח לי לדבר', 'אני בעבודה', 'בלי טלפון', 'רק הודעות',
    'no call', 'no phone', 'just text', 'text only', 'whatsapp only',
    'prefer here', 'prefer text', 'no phone call',
  ];
  return WA_ONLY_KEYWORDS.some(kw => lower.includes(kw));
}

function normalizePhoneToE164NP(phoneRaw) {
  if (!phoneRaw) return null;
  let s = String(phoneRaw).trim().replace(/[\s\-().,]/g, '').replace(/[^\d+]/g, '');
  if (s.endsWith('+') && !s.startsWith('+')) s = '+' + s.slice(0, -1);
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('+')) s = s.slice(1);
  if (/^972\d{9}$/.test(s)) return s;
  if (/^0\d{9}$/.test(s)) return '972' + s.slice(1);
  if (/^5\d{8}$/.test(s)) return '972' + s;
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

  // Get all greenapi configs
  const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({
    provider_type: 'greenapi',
    is_enabled: true
  }).catch(() => []);

  if (!configs.length) {
    return Response.json({ ok: true, message: 'No greenapi configs found' }, { status: 200 });
  }

  const results = [];

  for (const config of configs) {
    const { instance_id, api_token, api_url, coach_email } = config;
    
    // Skip invalid/test configs
    if (
      coach_email === 'system@test.com' ||
      !instance_id || 
      instance_id === 'YOUR_INSTANCE_ID' ||
      !api_token
    ) continue;

    const base = (api_url || 'https://api.green-api.com').replace(/\/$/, '');

    // Get last 10 minutes of incoming messages
    let messages = [];
    try {
      const res = await fetch(`${base}/waInstance${instance_id}/lastIncomingMessages/${api_token}?minutes=10`);
      const data = await res.json();
      messages = Array.isArray(data) ? data : [];
    } catch (e) {
      results.push({ coach_email, error: e.message });
      continue;
    }

    let processed = 0;
    let skipped = 0;

    for (const msg of messages) {
      // Only text messages from contacts (not groups)
      if (msg.type !== 'incoming') continue;
      const chatId = msg.chatId || '';
      if (chatId.includes('@g.us')) continue; // skip groups

      const rawPhone = chatId.replace('@c.us', '').replace('@s.whatsapp.net', '');
      const fromPhoneNormalized = normalizePhoneToE164NP(rawPhone);
      const messageText = msg.textMessage || msg.extendedTextMessage?.text || '';
      const msgId = msg.idMessage || '';
      const ts = msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString();

      if (!msgId || !messageText) { skipped++; continue; }
      if (!fromPhoneNormalized) { 
        console.warn('[pollGreenApiInbound] Could not normalize phone:', rawPhone);
        skipped++; 
        continue; 
      }

      // Dedup: skip if already processed
      const existing = await base44.asServiceRole.entities.LeadMessageThread.filter({
        providerMessageId: msgId
      }).catch(() => []);
      if (existing.length > 0) { skipped++; continue; }

      // Match lead — try direct DB queries first
      let lead = null;
      let found = await base44.asServiceRole.entities.Lead.filter({ phoneE164: fromPhoneNormalized }).catch(() => []);
      if (found.length) { lead = found[0]; }
      
      if (!lead) {
        found = await base44.asServiceRole.entities.Lead.filter({ phone: fromPhoneNormalized }).catch(() => []);
        if (found.length) { lead = found[0]; }
      }
      
      if (!lead) {
        found = await base44.asServiceRole.entities.Lead.filter({ phoneRaw: fromPhoneNormalized }).catch(() => []);
        if (found.length) { lead = found[0]; }
      }

      // Fallback: in-memory normalization
      if (!lead) {
        const allLeads = await base44.asServiceRole.entities.Lead.list().catch(() => []);
        for (const l of allLeads) {
          const normPhone = normalizePhoneToE164NP(l.phone);
          const normPhoneRaw = normalizePhoneToE164NP(l.phoneRaw);
          const normPhoneE164 = normalizePhoneToE164NP(l.phoneE164);
          if (normPhone === fromPhoneNormalized || normPhoneRaw === fromPhoneNormalized || normPhoneE164 === fromPhoneNormalized) {
            lead = l;
            break;
          }
        }
      }

      if (!lead) { 
        console.warn('[pollGreenApiInbound] No lead found for normalized phone:', fromPhoneNormalized);
        skipped++; 
        continue; 
      }

      const leadCoachEmail = lead.coach_email || coach_email;

      // ── INBOUND DEDUP: skip if this inbound already exists in any state ──────
      // The hard single-outbound guarantee is enforced by claimAndQueueOutbound.
      // Here we only prevent creating a duplicate inbound record.
      const existingInbound = await base44.asServiceRole.entities.LeadMessageThread.filter({
        leadId: lead.id,
        providerMessageId: msgId,
        direction: 'INBOUND'
      }).catch(() => []);

      if (existingInbound.length > 0) {
        // Inbound already exists — claimAndQueueOutbound will handle dedup if AI was not yet invoked
        console.log('[pollGreenApiInbound] INBOUND_EXISTS: already saved, skipping re-save', { leadId: lead.id, msgId });
        skipped++;
        continue;
      }

      // Log found message
      await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
        coach_email: leadCoachEmail,
        event: 'RULE_TRIGGERED',
        payload: {
          flowEvent: 'POLL_INBOUND_FOUND',
          leadId: lead.id,
          rawPhone,
          normalizedPhone: fromPhoneNormalized,
          msgId,
          messageText: messageText.slice(0, 80),
          source: 'pollGreenApiInbound'
        }
      }).catch(() => {});

      // ── FLOW-OWNED PATH: resolve session and stamp inbound before create ──────
      const activeResponderOwner = lead.activeResponderOwner;
      let flowSessionId = null;
      let flowInboundOverrides = {};

      if (activeResponderOwner === 'FLOW') {
        // Resolve active session
        const allStates = await base44.asServiceRole.entities.LeadConversationState.filter({ leadId: lead.id }).catch(() => []);
        const activeStates = allStates.filter(s => s.isActive === true && s.flowStatus === 'ACTIVE');
        const activeSession = activeStates.sort((a, b) =>
          new Date(b.lastFlowActionAt || b.updated_date || 0) - new Date(a.lastFlowActionAt || a.updated_date || 0)
        )[0] || null;

        await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
          coach_email: leadCoachEmail,
          event: 'RULE_TRIGGERED',
          payload: {
            flowEvent: 'POLL_FLOW_SESSION_RESOLVED',
            leadId: lead.id, msgId,
            sessionFound: !!activeSession,
            sessionId: activeSession?.sessionId || null,
            stateId: activeSession?.id || null,
            currentStepOrder: activeSession?.currentStepOrder || null
          }
        }).catch(() => {});

        if (activeSession) {
          flowSessionId = activeSession.sessionId;
          flowInboundOverrides = {
            sessionId: flowSessionId,
            aiProcessed: true,
            replyProducer: 'salesFlowRunner',
            replyStatus: 'pending'
          };
        } else {
          // FLOW owner but no active session — stamp as skipped so AI entity automation does not intercept
          flowInboundOverrides = {
            aiProcessed: true,
            replyProducer: 'salesFlowRunner',
            replyStatus: 'skipped',
            skipReason: 'FLOW_OWNER_BUT_NO_ACTIVE_SESSION_POLL'
          };
          await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
            coach_email: leadCoachEmail,
            event: 'RULE_TRIGGERED',
            payload: { flowEvent: 'POLL_FLOW_NO_ACTIVE_SESSION', leadId: lead.id, msgId }
          }).catch(() => {});
        }

        await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
          coach_email: leadCoachEmail,
          event: 'RULE_TRIGGERED',
          payload: {
            flowEvent: 'POLL_FLOW_PRE_SAVE',
            leadId: lead.id, msgId,
            overrides: flowInboundOverrides
          }
        }).catch(() => {});
      }
      // ─────────────────────────────────────────────────────────────────────────

      // Save inbound to LeadMessageThread
      const savedInbound = await base44.asServiceRole.entities.LeadMessageThread.create({
        leadId: lead.id,
        coach_email: leadCoachEmail,
        channel: 'WHATSAPP',
        direction: 'INBOUND',
        senderType: 'LEAD',
        messageText: messageText || '(הודעה ריקה)',
        messageTimestamp: ts,
        providerMessageId: msgId,
        ...flowInboundOverrides
      }).catch(() => null);

      const savedInboundId = savedInbound?.id || null;

      // ── FLOW-OWNED POST-SAVE ASSERT ───────────────────────────────────────────
      if (activeResponderOwner === 'FLOW' && flowSessionId && savedInboundId) {
        // Read back to verify sessionId was persisted
        const readBack = await base44.asServiceRole.entities.LeadMessageThread.filter({ id: savedInboundId }).catch(() => []);
        const persisted = readBack[0];
        const assertOk = persisted?.sessionId === flowSessionId;

        if (assertOk) {
          await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
            coach_email: leadCoachEmail,
            event: 'RULE_TRIGGERED',
            payload: {
              flowEvent: 'POLL_FLOW_SESSION_ASSERT_OK',
              leadId: lead.id, inboundId: savedInboundId, sessionId: flowSessionId
            }
          }).catch(() => {});
        } else {
          // Assert failed — patch sessionId immediately
          await base44.asServiceRole.entities.LeadMessageThread.update(savedInboundId, {
            sessionId: flowSessionId
          }).catch(() => {});
          await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
            coach_email: leadCoachEmail,
            event: 'RULE_TRIGGERED',
            payload: {
              flowEvent: 'POLL_FLOW_SESSION_ASSERT_FAILED',
              leadId: lead.id, inboundId: savedInboundId,
              expectedSessionId: flowSessionId,
              persistedSessionId: persisted?.sessionId || null,
              action: 'patched_sessionId'
            }
          }).catch(() => {});
        }
      }

      await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
        coach_email: leadCoachEmail,
        event: 'RULE_TRIGGERED',
        payload: {
          flowEvent: 'POLL_FLOW_POST_SAVE',
          leadId: lead.id, msgId,
          savedInboundId,
          sessionId: flowSessionId || null
        }
      }).catch(() => {});
      // ─────────────────────────────────────────────────────────────────────────

      // Update lead
      const lowerText = (messageText || '').toLowerCase();
      const isOptOut = ['לא מעוניין', 'תפסיקו', 'הסר', 'stop'].some(kw => lowerText.includes(kw));
      const isCallRequest = !isOptOut && ['תתקשר', 'תחזור', 'דבר איתי'].some(kw => lowerText.includes(kw));
      // ERROR-006 fix: mirror PROTECTED_STATUSES guard from whatsAppInboundWebhook (ISSUE-018).
      // Prevents BOOKED/CLOSED/CALL_REQUESTED leads from being downgraded by a poller-processed inbound.
      const PROTECTED_STATUSES = ['BOOKED', 'CLOSED', 'CALL_REQUESTED'];
      const rawNewStatus = isOptOut ? 'CLOSED' : isCallRequest ? 'CALL_REQUESTED' : 'INTERESTED';
      const newStatus = PROTECTED_STATUSES.includes(lead.status) ? lead.status : rawNewStatus;

      // ISSUE-007 fix: detect WA-only signal and persist it — mirrors whatsAppInboundWebhook logic
      const detectedWaOnly = !isOptOut && isWaOnlySignal(messageText);
      const shouldSetWaOnly = detectedWaOnly && !lead.waOnly;

      await base44.asServiceRole.entities.Lead.update(lead.id, {
        lastInboundAt: ts,
        status: newStatus,
        waOptOut: isOptOut,
        ...(shouldSetWaOnly ? { waOnly: true } : {})
      }).catch(() => {});

      // Log activity
      await base44.asServiceRole.functions.invoke('logLeadActivity', {
        leadId: lead.id,
        coach_email: leadCoachEmail,
        activityType: 'WHATSAPP_INBOUND',
        activitySource: 'WHATSAPP',
        message: `הודעה נכנסת (polling): "${(messageText || '').slice(0, 80)}"`,
        metadata: { newStatus, isOptOut, isCallRequest, source: 'pollGreenApiInbound' }
      }).catch(() => {});

      // ── ROUTING DECISION ─────────────────────────────────────────────────────
      if (!isOptOut) {
        // ISSUE-008/013 fix: SCRIPT-owned leads — stamp aiProcessed=true and invoke interpretLeadReplyWithScript.
        // Mirrors whatsAppInboundWebhook SCRIPT owner branch exactly.
        if (activeResponderOwner === 'SCRIPT') {
          // Stamp inbound as script-owned so AI entity automation does not race
          if (savedInboundId) {
            await base44.asServiceRole.entities.LeadMessageThread.update(savedInboundId, {
              aiProcessed: true,
              replyGenerationStartedAt: new Date().toISOString(),
              replyProducer: 'salesFlowRunner', // intentional: LeadMessageThread enum has no 'script' value; salesFlowRunner is the correct non-AI automated engine choice
              replyStatus: 'pending'
            }).catch(() => {});
          }
          // Re-fetch fresh lead to get activeScriptId / scriptSessionId
          const freshLeadArr = await base44.asServiceRole.entities.Lead.filter({ id: lead.id }).catch(() => []);
          const freshLead = freshLeadArr[0] || lead;
          if (!freshLead.activeScriptId || !freshLead.scriptSessionId) {
            // No active script session — mark skipped
            if (savedInboundId) {
              await base44.asServiceRole.entities.LeadMessageThread.update(savedInboundId, {
                replyStatus: 'skipped',
                skipReason: 'SCRIPT_OWNER_BUT_NO_ACTIVE_SESSION_POLL'
              }).catch(() => {});
            }
            await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
              coach_email: leadCoachEmail,
              event: 'RULE_TRIGGERED',
              payload: { flowEvent: 'POLL_SCRIPT_NO_ACTIVE_SESSION', leadId: lead.id, msgId }
            }).catch(() => {});
            processed++;
          } else {
            try {
              await base44.asServiceRole.functions.invoke('interpretLeadReplyWithScript', {
                leadId: lead.id,
                inboundMessageId: savedInboundId,
                messageText,
                scriptSessionId: freshLead.scriptSessionId
              });
              processed++;
            } catch (scriptErr) {
              await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
                coach_email: leadCoachEmail,
                event: 'SEND_FAIL',
                payload: { flowEvent: 'POLL_SCRIPT_ROUTING_ERROR', leadId: lead.id, error: scriptErr.message }
              }).catch(() => {});
              if (savedInboundId) {
                await base44.asServiceRole.entities.LeadMessageThread.update(savedInboundId, {
                  replyStatus: 'skipped',
                  skipReason: 'SCRIPT_INVOCATION_FAILED_POLL'
                }).catch(() => {});
              }
              skipped++;
            }
          }
        // FLOW-owned lead: route directly to salesFlowRunner — bypass AI entity automation
        } else if (activeResponderOwner === 'FLOW') {
          await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
            coach_email: leadCoachEmail,
            event: 'RULE_TRIGGERED',
            payload: {
              flowEvent: 'POLL_FLOW_ROUTING_START',
              leadId: lead.id, inboundId: savedInboundId,
              sessionId: flowSessionId, hasActiveSession: !!flowSessionId
            }
          }).catch(() => {});

          if (flowSessionId) {
            try {
              await base44.asServiceRole.functions.invoke('salesFlowRunner', {
                leadId: lead.id,
                inboundMessageId: savedInboundId,
                sessionId: flowSessionId,
                continueFromReply: true
              });
              await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
                coach_email: leadCoachEmail,
                event: 'RULE_TRIGGERED',
                payload: {
                  flowEvent: 'POLL_FLOW_ROUTING_END',
                  leadId: lead.id, inboundId: savedInboundId, sessionId: flowSessionId
                }
              }).catch(() => {});
              processed++;
            } catch (e) {
              await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
                coach_email: leadCoachEmail,
                event: 'SEND_FAIL',
                payload: {
                  flowEvent: 'POLL_FLOW_ROUTING_ERROR',
                  leadId: lead.id, inboundId: savedInboundId,
                  sessionId: flowSessionId, error: e.message
                }
              }).catch(() => {});
              skipped++;
            }
          } else {
            // No active session — inbound already stamped as skipped, nothing more to do
            processed++;
          }
        } else {
          // Non-FLOW, non-SCRIPT lead: existing AI / salesFlowRunner routing unchanged
          const allBrains = await base44.asServiceRole.entities.AIBrainConfig.filter({ coach_email: leadCoachEmail }).catch(() => []);
          const aiBrainActive = allBrains.some(b => b.isActive === true);

          if (aiBrainActive) {
            // AI Brain active: entity automation handles the trigger — poll only saves the inbound record
            console.log('[pollGreenApiInbound] AI Brain active — entity automation will trigger aiConversationAgent. Skipping direct invocation.');
            processed++;
          } else {
            try {
              await base44.asServiceRole.functions.invoke('salesFlowRunner', {
                leadId: lead.id,
                continueFromReply: true
              });
              processed++;
            } catch (e) {
              await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
                coach_email: leadCoachEmail,
                event: 'SEND_FAIL',
                payload: { flowEvent: 'POLL_FLOW_ADVANCE_FAILED', leadId: lead.id, error: e.message }
              }).catch(() => {});
              skipped++;
            }
          }
        }
      } else {
        processed++;
      }
      // ─────────────────────────────────────────────────────────────────────────
    }

    results.push({ coach_email, total: messages.length, processed, skipped });
  }

    return Response.json({ ok: true, results, ranAt: new Date().toISOString() }, { status: 200 });
  } catch (error) {
    console.error('[pollGreenApiInbound] FATAL ERROR:', error.message, error.stack);
    return Response.json({ ok: false, error: error.message, ranAt: new Date().toISOString() }, { status: 200 });
  }
});