import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { phone } = await req.json();

    if (!phone) {
      return Response.json({ error: 'phone parameter required' }, { status: 400 });
    }

    console.log('[DIAGNOSE] Starting inbound sync diagnosis for phone:', phone);

    const diagnosis = {
      phone,
      stages: {}
    };

    // ===== STAGE 1: Green received the message =====
    diagnosis.stages.stage1_green_received = {
      name: 'Green received the message',
      passed: false,
      evidence: null,
      error: null
    };

    try {
      // Check if there's a WhatsAppDiagnosticsLog with GREEN_API event mentioning this phone
      const diagLogs = await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.filter({
        event: 'SEND_ATTEMPT'
      });

      // Look for inbound-related logs or SystemHealth lastInboundWebhook
      const systemHealth = await base44.asServiceRole.entities.SystemHealth.filter({});
      
      let greenReceived = false;
      let evidence = null;

      for (const sh of systemHealth) {
        if (sh.lastInboundWebhookSuccess && sh.lastInboundWebhookLeadId) {
          // Check if this matches our phone
          const leads = await base44.asServiceRole.entities.Lead.filter({
            id: sh.lastInboundWebhookLeadId
          });
          if (leads[0]?.phoneE164 === phone || leads[0]?.phone === phone) {
            greenReceived = true;
            evidence = {
              systemHealthId: sh.id,
              lastInboundAt: sh.lastInboundWebhookReceivedAt,
              messagePreview: sh.lastInboundWebhookMessageText,
              provider: sh.lastInboundWebhookProvider
            };
            break;
          }
        }
      }

      diagnosis.stages.stage1_green_received.passed = greenReceived;
      diagnosis.stages.stage1_green_received.evidence = evidence;
      if (!greenReceived) {
        diagnosis.stages.stage1_green_received.error = 'No SystemHealth record shows this phone received inbound message';
      }
    } catch (e) {
      diagnosis.stages.stage1_green_received.error = `Query error: ${e.message}`;
    }

    // ===== STAGE 2: Green attempted webhook delivery =====
    diagnosis.stages.stage2_webhook_delivery = {
      name: 'Green attempted webhook delivery',
      passed: false,
      evidence: null,
      error: null
    };

    try {
      const systemHealth = await base44.asServiceRole.entities.SystemHealth.filter({});
      
      let webhookAttempted = false;
      let evidence = null;

      for (const sh of systemHealth) {
        if (sh.lastInboundRawPayload) {
          const payload = sh.lastInboundRawPayload;
          if (payload.includes(phone) || payload.includes(phone.replace('+', ''))) {
            webhookAttempted = true;
            evidence = {
              systemHealthId: sh.id,
              payloadPreview: payload.substring(0, 500),
              pipelineStatus: sh.inboundPipelineStatus
            };
            break;
          }
        }
      }

      diagnosis.stages.stage2_webhook_delivery.passed = webhookAttempted;
      diagnosis.stages.stage2_webhook_delivery.evidence = evidence;
      if (!webhookAttempted) {
        diagnosis.stages.stage2_webhook_delivery.error = 'No raw webhook payload found with this phone';
      }
    } catch (e) {
      diagnosis.stages.stage2_webhook_delivery.error = `Query error: ${e.message}`;
    }

    // ===== STAGE 3: Base44 webhook endpoint was hit =====
    diagnosis.stages.stage3_webhook_hit = {
      name: 'Base44 webhook endpoint was hit',
      passed: false,
      evidence: null,
      error: null
    };

    try {
      const systemHealth = await base44.asServiceRole.entities.SystemHealth.filter({});
      
      let webhookHit = false;
      let evidence = null;

      for (const sh of systemHealth) {
        if (sh.lastInboundWebhookReceivedAt && sh.lastInboundParseSuccess !== undefined) {
          // If we have a received timestamp and parse status, webhook was hit
          webhookHit = true;
          evidence = {
            systemHealthId: sh.id,
            receivedAt: sh.lastInboundWebhookReceivedAt,
            parseSuccess: sh.lastInboundParseSuccess,
            failureReason: sh.lastInboundFailureReason
          };
          break;
        }
      }

      diagnosis.stages.stage3_webhook_hit.passed = webhookHit;
      diagnosis.stages.stage3_webhook_hit.evidence = evidence;
      if (!webhookHit) {
        diagnosis.stages.stage3_webhook_hit.error = 'No webhook reception timestamp found';
      }
    } catch (e) {
      diagnosis.stages.stage3_webhook_hit.error = `Query error: ${e.message}`;
    }

    // ===== STAGE 4: whatsAppInboundWebhook handler executed =====
    diagnosis.stages.stage4_handler_executed = {
      name: 'whatsAppInboundWebhook handler executed',
      passed: false,
      evidence: null,
      error: null
    };

    try {
      const systemHealth = await base44.asServiceRole.entities.SystemHealth.filter({});
      
      let handlerExecuted = false;
      let evidence = null;

      for (const sh of systemHealth) {
        if (sh.inboundPipelineStatus && sh.inboundPipelineStatus !== 'NOT_RECEIVED') {
          handlerExecuted = true;
          evidence = {
            pipelineStatus: sh.inboundPipelineStatus,
            parseSuccess: sh.lastInboundParseSuccess,
            lastReceivedAt: sh.lastInboundWebhookReceivedAt
          };
          break;
        }
      }

      diagnosis.stages.stage4_handler_executed.passed = handlerExecuted;
      diagnosis.stages.stage4_handler_executed.evidence = evidence;
      if (!handlerExecuted) {
        diagnosis.stages.stage4_handler_executed.error = 'Pipeline status is NOT_RECEIVED - handler never ran';
      }
    } catch (e) {
      diagnosis.stages.stage4_handler_executed.error = `Query error: ${e.message}`;
    }

    // ===== STAGE 5: processInbound executed =====
    diagnosis.stages.stage5_processinbound_executed = {
      name: 'processInbound executed',
      passed: false,
      evidence: null,
      error: null
    };

    try {
      const systemHealth = await base44.asServiceRole.entities.SystemHealth.filter({});
      
      let processInboundRan = false;
      let evidence = null;

      for (const sh of systemHealth) {
        if (sh.inboundPipelineStatus && (sh.inboundPipelineStatus === 'RECEIVED_NOT_PARSED' || sh.inboundPipelineStatus === 'PARSED_NOT_MATCHED' || sh.inboundPipelineStatus === 'MATCHED_SUCCESSFULLY')) {
          processInboundRan = true;
          evidence = {
            pipelineStatus: sh.inboundPipelineStatus,
            parseSuccess: sh.lastInboundParseSuccess
          };
          break;
        }
      }

      diagnosis.stages.stage5_processinbound_executed.passed = processInboundRan;
      diagnosis.stages.stage5_processinbound_executed.evidence = evidence;
      if (!processInboundRan) {
        diagnosis.stages.stage5_processinbound_executed.error = 'Pipeline stopped before processInbound - status is NOT_RECEIVED or webhook never hit';
      }
    } catch (e) {
      diagnosis.stages.stage5_processinbound_executed.error = `Query error: ${e.message}`;
    }

    // ===== STAGE 6: Phone normalization succeeded =====
    diagnosis.stages.stage6_phone_normalized = {
      name: 'Phone normalization succeeded',
      passed: false,
      evidence: null,
      error: null
    };

    try {
      // Find any lead with this phone (in any form)
      const leads = await base44.asServiceRole.entities.Lead.filter({});
      
      let normalized = false;
      let evidence = null;

      for (const lead of leads) {
        if (lead.phoneE164 === phone || lead.phone === phone || lead.phoneRaw === phone) {
          normalized = true;
          evidence = {
            leadId: lead.id,
            phone: lead.phone,
            phoneRaw: lead.phoneRaw,
            phoneE164: lead.phoneE164
          };
          break;
        }
      }

      diagnosis.stages.stage6_phone_normalized.passed = normalized;
      diagnosis.stages.stage6_phone_normalized.evidence = evidence;
      if (!normalized) {
        diagnosis.stages.stage6_phone_normalized.error = `No lead found with phone variations: ${phone}`;
      }
    } catch (e) {
      diagnosis.stages.stage6_phone_normalized.error = `Query error: ${e.message}`;
    }

    // ===== STAGE 7: Lead matching succeeded =====
    diagnosis.stages.stage7_lead_matched = {
      name: 'Lead matching succeeded',
      passed: false,
      evidence: null,
      error: null
    };

    try {
      let matched = false;
      let evidence = null;

      // Try to find lead by phoneE164
      let leads = await base44.asServiceRole.entities.Lead.filter({
        phoneE164: phone
      });

      if (leads.length === 0) {
        // Try raw phone
        leads = await base44.asServiceRole.entities.Lead.filter({
          phone: phone
        });
      }

      if (leads.length > 0) {
        matched = true;
        const lead = leads[0];
        evidence = {
          leadId: lead.id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          phone: lead.phone,
          phoneE164: lead.phoneE164,
          coach_email: lead.coach_email,
          status: lead.status
        };
      }

      diagnosis.stages.stage7_lead_matched.passed = matched;
      diagnosis.stages.stage7_lead_matched.evidence = evidence;
      if (!matched) {
        diagnosis.stages.stage7_lead_matched.error = `Lead not found by phoneE164 (${phone}) or phone`;
      }
    } catch (e) {
      diagnosis.stages.stage7_lead_matched.error = `Query error: ${e.message}`;
    }

    // ===== STAGE 8: LeadMessageThread INBOUND record created =====
    diagnosis.stages.stage8_thread_created = {
      name: 'LeadMessageThread INBOUND record created',
      passed: false,
      evidence: null,
      error: null
    };

    try {
      let threadCreated = false;
      let evidence = null;

      // Get lead first
      let leads = await base44.asServiceRole.entities.Lead.filter({ phoneE164: phone });
      if (leads.length === 0) {
        leads = await base44.asServiceRole.entities.Lead.filter({ phone });
      }

      if (leads.length > 0) {
        const leadId = leads[0].id;
        
        // Check for any INBOUND message thread
        const threads = await base44.asServiceRole.entities.LeadMessageThread.filter({
          leadId: leadId,
          direction: 'INBOUND'
        });

        if (threads.length > 0) {
          threadCreated = true;
          const thread = threads[threads.length - 1]; // Most recent
          evidence = {
            threadId: thread.id,
            leadId: thread.leadId,
            direction: thread.direction,
            senderType: thread.senderType,
            messageText: thread.messageText?.substring(0, 100),
            messageTimestamp: thread.messageTimestamp,
            aiProcessed: thread.aiProcessed
          };
        }
      }

      diagnosis.stages.stage8_thread_created.passed = threadCreated;
      diagnosis.stages.stage8_thread_created.evidence = evidence;
      if (!threadCreated) {
        diagnosis.stages.stage8_thread_created.error = 'No INBOUND LeadMessageThread record found for this lead';
      }
    } catch (e) {
      diagnosis.stages.stage8_thread_created.error = `Query error: ${e.message}`;
    }

    // ===== STAGE 9: Downstream AI / flow trigger executed =====
    diagnosis.stages.stage9_downstream_triggered = {
      name: 'Downstream AI / flow trigger executed',
      passed: false,
      evidence: null,
      error: null
    };

    try {
      let triggered = false;
      let evidence = null;

      // Get lead first
      let leads = await base44.asServiceRole.entities.Lead.filter({ phoneE164: phone });
      if (leads.length === 0) {
        leads = await base44.asServiceRole.entities.Lead.filter({ phone });
      }

      if (leads.length > 0) {
        const leadId = leads[0].id;

        // Check for AI conversation log
        const aiLogs = await base44.asServiceRole.entities.AIConversationLog.filter({
          leadId: leadId
        });

        if (aiLogs.length > 0) {
          triggered = true;
          const log = aiLogs[aiLogs.length - 1];
          evidence = {
            logId: log.id,
            ai_status: log.ai_status,
            lastUserMessage: log.lastUserMessage?.substring(0, 100),
            lastAiReply: log.lastAiReply?.substring(0, 100),
            processedAt: log.processed_at
          };
        } else {
          // Check lead activity log for AI triggers
          const activities = await base44.asServiceRole.entities.LeadActivityLog.filter({
            leadId: leadId,
            activityType: 'STEP_ADVANCED'
          });

          if (activities.length > 0) {
            triggered = true;
            evidence = {
              activitiesFound: activities.length,
              lastActivity: activities[activities.length - 1]
            };
          }
        }
      }

      diagnosis.stages.stage9_downstream_triggered.passed = triggered;
      diagnosis.stages.stage9_downstream_triggered.evidence = evidence;
      if (!triggered) {
        diagnosis.stages.stage9_downstream_triggered.error = 'No AI conversation log or activity indicating downstream trigger';
      }
    } catch (e) {
      diagnosis.stages.stage9_downstream_triggered.error = `Query error: ${e.message}`;
    }

    // ===== SUMMARY =====
    const passedCount = Object.values(diagnosis.stages).filter(s => s.passed).length;
    const failedCount = Object.values(diagnosis.stages).filter(s => !s.passed).length;

    diagnosis.summary = {
      totalStages: 9,
      passed: passedCount,
      failed: failedCount,
      failurePoint: failedCount > 0 
        ? Object.entries(diagnosis.stages).find(([_, s]) => !s.passed)?.[0]
        : null
    };

    console.log('[DIAGNOSE] Complete:', diagnosis.summary);
    return Response.json(diagnosis);
  } catch (error) {
    console.error('[DIAGNOSE] Critical error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});