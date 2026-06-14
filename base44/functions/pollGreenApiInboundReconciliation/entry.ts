import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * pollGreenApiInboundReconciliation
 *
 * SAFE RECONCILIATION ONLY — reads missed inbound messages from Green API
 * and saves them as LeadMessageThread records if not already present.
 *
 * INTENTIONALLY does NOT:
 *   - directly invoke aiConversationAgent (entity automation handles this)
 *   - reset aiProcessed on existing records
 *   - create duplicate inbound records
 *
 * The entity automation "Inbound Message AI Trigger" fires automatically
 * on every LeadMessageThread.create, so AI triggering is fully delegated there.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    console.log('[INBOUND_POLL] Starting Green API inbound reconciliation');

    const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({
      provider_type: 'greenapi',
      is_enabled: true
    });

    console.log('[INBOUND_POLL] Found', configs.length, 'active Green API configs');

    let totalProcessed = 0;
    let totalSkipped = 0;

    for (const config of configs) {
      try {
        const apiUrl = config.api_url || 'https://api.green-api.com';
        const instanceId = config.instance_id;
        const apiToken = config.api_token;

        // Skip invalid/test configs
        if (
          config.coach_email === 'system@test.com' ||
          !instanceId ||
          instanceId === 'YOUR_INSTANCE_ID' ||
          !apiToken
        ) {
          console.log('[INBOUND_POLL] Skipping invalid/test config', { coach: config.coach_email });
          continue;
        }

        const baseUrl = (apiUrl || 'https://api.green-api.com').replace(/\/$/, '').replace('/waServer', '');
        const endpoint = `${baseUrl}/waInstance${instanceId}/lastIncomingMessages/${apiToken}`;

        console.log('[INBOUND_POLL] Fetching from Green API for coach:', config.coach_email);
        const greenRes = await fetch(endpoint);

        if (!greenRes.ok) {
          console.log('[INBOUND_POLL] Green API error:', greenRes.status);
          continue;
        }

        const messages = await greenRes.json();

        if (!Array.isArray(messages) || messages.length === 0) {
          console.log('[INBOUND_POLL] No messages for', config.coach_email);
          continue;
        }

        console.log('[INBOUND_POLL] Got', messages.length, 'messages for', config.coach_email);

        for (const msg of messages) {
          try {
            // Only text messages, skip groups
            const chatId = msg.chatId || '';
            if (chatId.includes('@g.us')) { totalSkipped++; continue; }

            const msgId = msg.idMessage || '';
            const messageText = msg.textMessage || msg.extendedTextMessage?.text || '';
            if (!msgId || !messageText) { totalSkipped++; continue; }

            // Normalize phone
            const rawSender = chatId.split('@')[0];
            if (!rawSender) { totalSkipped++; continue; }

            // ERROR-011 fix: use canonical phone normalization matching webhook/poller paths
            // Canonical rule: strip non-digits, if starts with 0 → replace with 972, prefix with +
            const senderPhoneE164 = (() => {
              let cleaned = String(rawSender).replace(/\D/g, '').trim();
              if (!cleaned) return '';
              // Remove leading country-code duplicates (e.g. 9720... → 972...)
              if (cleaned.startsWith('1')) cleaned = cleaned.slice(1); // strip US leading 1 if accidental
              if (!cleaned.startsWith('972')) {
                if (cleaned.startsWith('0')) cleaned = '972' + cleaned.slice(1);
                else cleaned = '972' + cleaned;
              }
              return '+' + cleaned;
            })();

            if (!senderPhoneE164) { totalSkipped++; continue; }

            const digitsOnly = (v) => String(v || '').replace(/\D/g, '');
            const senderDigits = digitsOnly(senderPhoneE164);

            // ── STRICT INBOUND DEDUP: check by providerMessageId + direction FIRST ──
            // This is the authoritative dedup — if ANY record with this providerMessageId
            // already exists (inbound or outbound), skip entirely.
            const existingByMsgId = await base44.asServiceRole.entities.LeadMessageThread.filter({
              providerMessageId: msgId,
              direction: 'INBOUND'
            }).catch(() => []);

            if (existingByMsgId.length > 0) {
              console.log('[INBOUND_POLL] DEDUP: inbound already exists for msgId:', msgId, '— skipping');
              totalSkipped++;
              continue;
            }

            // Match lead
            let lead = null;

            let found = await base44.asServiceRole.entities.Lead.filter({
              phoneE164: senderPhoneE164,
              coach_email: config.coach_email
            }).catch(() => []);
            if (found.length) lead = found[0];

            if (!lead) {
              const allCoachLeads = await base44.asServiceRole.entities.Lead.filter({
                coach_email: config.coach_email
              }).catch(() => []);

              lead = allCoachLeads.find(l => {
                return (
                  digitsOnly(l.phoneE164) === senderDigits ||
                  digitsOnly(l.phone) === senderDigits ||
                  digitsOnly(l.phoneRaw) === senderDigits
                );
              }) || null;
            }

            if (!lead) {
              console.log('[INBOUND_POLL] No lead found for phone:', senderPhoneE164);
              totalSkipped++;
              continue;
            }

            // ── SECOND DEDUP GUARD: leadId + providerMessageId + direction ─────────
            const existingForLead = await base44.asServiceRole.entities.LeadMessageThread.filter({
              leadId: lead.id,
              providerMessageId: msgId,
              direction: 'INBOUND'
            }).catch(() => []);

            if (existingForLead.length > 0) {
              console.log('[INBOUND_POLL] DEDUP: inbound already exists for leadId:', lead.id, 'msgId:', msgId, '— skipping');
              totalSkipped++;
              continue;
            }

            // ── FLOW-OWNER CHECK: resolve session BEFORE create ───────────────────
            const ts = msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString();

            const ownerField = lead.activeResponderOwner || null;
            let inboundPayload = {
              leadId: lead.id,
              coach_email: config.coach_email,
              channel: 'WHATSAPP',
              direction: 'INBOUND',
              senderType: 'LEAD',
              messageText: messageText,
              messageTimestamp: ts,
              providerMessageId: msgId,
              aiProcessed: false
              // NOTE: replyStatus intentionally omitted — aiConversationAgent sets it
            };

            if (ownerField === 'FLOW') {
              // ── Resolve active session ──────────────────────────────────────────
              const activeSessions = await base44.asServiceRole.entities.LeadConversationState.filter({
                leadId: lead.id,
                isActive: true
              }).catch(() => []);

              const activeSession = activeSessions
                .filter(s => s.flowStatus === 'ACTIVE')
                .sort((a, b) => new Date(b.updated_date || 0) - new Date(a.updated_date || 0))[0]
                || activeSessions.sort((a, b) => new Date(b.updated_date || 0) - new Date(a.updated_date || 0))[0]
                || null;

              await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
                coach_email: config.coach_email,
                event: 'RULE_TRIGGERED',
                payload: {
                  flowEvent: 'RECON_FLOW_SESSION_RESOLVED',
                  leadId: lead.id,
                  msgId,
                  foundSession: !!activeSession,
                  sessionId: activeSession?.sessionId || null,
                  flowStatus: activeSession?.flowStatus || null,
                  currentStepOrder: activeSession?.currentStepOrder || null
                }
              }).catch(() => {});

              if (!activeSession) {
                // ── No active session — stamp skip fields, block AI ────────────
                inboundPayload.aiProcessed = true;
                inboundPayload.replyStatus = 'skipped';
                inboundPayload.skipReason = 'FLOW_OWNER_BUT_NO_ACTIVE_SESSION_RECONCILIATION';
                inboundPayload.replyProducer = 'salesFlowRunner';

                await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
                  coach_email: config.coach_email,
                  event: 'RULE_TRIGGERED',
                  payload: {
                    flowEvent: 'RECON_FLOW_NO_ACTIVE_SESSION',
                    leadId: lead.id,
                    msgId,
                    action: 'skipped_replyStatus_set'
                  }
                }).catch(() => {});

              } else {
                // ── Active session found — stamp sessionId, block AI ────────────
                inboundPayload.sessionId = activeSession.sessionId;
                inboundPayload.aiProcessed = true;
                inboundPayload.replyProducer = 'salesFlowRunner';
                inboundPayload.replyStatus = 'pending';

                await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
                  coach_email: config.coach_email,
                  event: 'RULE_TRIGGERED',
                  payload: {
                    flowEvent: 'RECON_FLOW_PRE_SAVE',
                    leadId: lead.id,
                    msgId,
                    sessionId: activeSession.sessionId,
                    aiProcessed: true,
                    replyProducer: 'salesFlowRunner'
                  }
                }).catch(() => {});
              }
            }

            // ── SAFE: create inbound record ───────────────────────────────────────
            // For AI/SCRIPT/MANUAL leads: entity automation fires as before.
            // For FLOW leads: aiProcessed=true blocks entity automation; sessionId stamped.
            let savedInbound = null;
            await base44.asServiceRole.entities.LeadMessageThread.create(inboundPayload)
              .then(rec => { savedInbound = rec; })
              .catch(err => {
                console.log('[INBOUND_POLL] Save failed for msgId:', msgId, err.message);
              });

            if (ownerField === 'FLOW' && savedInbound?.id) {
              await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
                coach_email: config.coach_email,
                event: 'RULE_TRIGGERED',
                payload: {
                  flowEvent: 'RECON_FLOW_POST_SAVE',
                  leadId: lead.id,
                  savedId: savedInbound.id,
                  msgId,
                  persistedSessionId: savedInbound.sessionId || null,
                  aiProcessed: savedInbound.aiProcessed,
                  replyStatus: savedInbound.replyStatus || null
                }
              }).catch(() => {});

              if (inboundPayload.sessionId) {
                // Notify salesFlowRunner to continue from this reconciled inbound
                await base44.asServiceRole.functions.invoke('salesFlowRunner', {
                  leadId: lead.id,
                  continueFromReply: true,
                  inboundMessageId: savedInbound.id,
                  sessionId: inboundPayload.sessionId
                }).catch(err => {
                  console.log('[INBOUND_POLL] salesFlowRunner handoff failed for leadId:', lead.id, err.message);
                });

                await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
                  coach_email: config.coach_email,
                  event: 'RULE_TRIGGERED',
                  payload: {
                    flowEvent: 'RECON_FLOW_ROUTING_HANDOFF',
                    leadId: lead.id,
                    savedId: savedInbound.id,
                    sessionId: inboundPayload.sessionId,
                    status: 'salesFlowRunner_invoked'
                  }
                }).catch(() => {});
              }
            }

            console.log('[INBOUND_POLL] Saved inbound record. leadId:', lead.id, 'msgId:', msgId,
              ownerField === 'FLOW' ? '— FLOW owner, salesFlowRunner notified' : '— entity automation will trigger AI.');
            totalProcessed++;

          } catch (msgErr) {
            console.log('[INBOUND_POLL] Message processing error:', msgErr.message);
            totalSkipped++;
          }
        }
      } catch (configErr) {
        console.log('[INBOUND_POLL] Config processing error:', configErr.message);
      }
    }

    console.log('[INBOUND_POLL] Complete. processed:', totalProcessed, 'skipped:', totalSkipped);
    return Response.json({ ok: true, processed: totalProcessed, skipped: totalSkipped });

  } catch (error) {
    console.error('[INBOUND_POLL] Critical error:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});