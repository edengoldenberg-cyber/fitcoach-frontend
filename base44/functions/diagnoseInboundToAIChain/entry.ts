import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leadId, inboundPayload } = await req.json();

    if (!leadId) {
      return Response.json({ error: 'Missing leadId' }, { status: 400 });
    }

    const audit = {
      leadId,
      timestamp: new Date().toISOString(),
      steps: []
    };

    // ============= STEP 1: Inbound Capture Check =============
    let inboundData = null;
    const step1 = {
      step: 1,
      name: 'Inbound Capture Check',
      status: 'not_found',
      details: {}
    };

    if (inboundPayload) {
      step1.status = 'pass';
      inboundData = {
        providerMessageId: inboundPayload.idMessage || inboundPayload.messageId,
        senderPhone: inboundPayload.senderData?.phoneNumber || inboundPayload.from,
        messageText: inboundPayload.messageData?.textMessageData?.textMessage || inboundPayload.body,
        timestamp: inboundPayload.timestamp || new Date().toISOString(),
        channel: 'WHATSAPP'
      };
      step1.details = {
        providerMessageId: inboundData.providerMessageId,
        senderPhone: inboundData.senderPhone,
        messageTextLength: inboundData.messageText?.length || 0,
        timestamp: inboundData.timestamp,
        channel: inboundData.channel
      };
    } else {
      step1.status = 'fail';
      step1.details = { reason: 'No inbound payload provided for audit' };
    }
    audit.steps.push(step1);

    // ============= STEP 2: Phone Normalization Check =============
    const step2 = {
      step: 2,
      name: 'Phone Normalization (E164)',
      status: 'fail',
      details: {}
    };

    if (inboundData?.senderPhone) {
      try {
        const raw = inboundData.senderPhone;
        let normalized = raw;

        // Remove non-digits
        normalized = normalized.replace(/\D/g, '');

        // Ensure +972 prefix for Israeli numbers
        if (normalized.startsWith('0')) {
          normalized = '972' + normalized.substring(1);
        }
        
        if (!normalized.startsWith('972') && !normalized.startsWith('+972')) {
          if (normalized.length === 10 && normalized.startsWith('0')) {
            normalized = '972' + normalized.substring(1);
          }
        }

        // Add + prefix
        if (!normalized.startsWith('+')) {
          normalized = '+' + normalized;
        }

        step2.status = 'pass';
        step2.details = {
          rawInput: raw,
          normalized: normalized,
          format: 'E164',
          isValid: /^\+\d{1,15}$/.test(normalized)
        };
      } catch (err) {
        step2.status = 'fail';
        step2.details = { error: err.message };
      }
    } else {
      step2.status = 'fail';
      step2.details = { reason: 'No sender phone from step 1' };
    }
    audit.steps.push(step2);

    // ============= STEP 3: Lead Matching Check =============
    const step3 = {
      step: 3,
      name: 'Lead Matching Check',
      status: 'fail',
      details: {}
    };

    try {
      const normalizedPhone = step2.details?.normalized;
      
      // Try exact E164 match first
      let leads = await base44.asServiceRole.entities.Lead.filter({
        phoneE164: normalizedPhone,
        coach_email: user.email
      });

      if (leads.length > 0) {
        step3.status = 'pass';
        step3.details = {
          matchMethod: 'exact_E164',
          foundLeadId: leads[0].id,
          foundLead: {
            id: leads[0].id,
            firstName: leads[0].firstName,
            lastName: leads[0].lastName,
            phoneE164: leads[0].phoneE164,
            phoneRaw: leads[0].phoneRaw
          },
          matchCount: leads.length
        };
      } else {
        // Try defensive digit matching
        const digitOnly = normalizedPhone.replace(/\D/g, '');
        const lastDigits = digitOnly.slice(-9);

        leads = await base44.asServiceRole.entities.Lead.filter({
          coach_email: user.email
        });

        const defensiveMatches = leads.filter(l => {
          const leadDigits = (l.phoneE164 || '').replace(/\D/g, '');
          return leadDigits.endsWith(lastDigits) || leadDigits === digitOnly;
        });

        if (defensiveMatches.length > 0) {
          step3.status = 'pass';
          step3.details = {
            matchMethod: 'defensive_digit_match',
            foundLeadId: defensiveMatches[0].id,
            foundLead: {
              id: defensiveMatches[0].id,
              firstName: defensiveMatches[0].firstName,
              lastName: defensiveMatches[0].lastName,
              phoneE164: defensiveMatches[0].phoneE164
            },
            matchCount: defensiveMatches.length,
            warning: 'Not exact E164 match - using defensive matching'
          };
        } else {
          step3.status = 'fail';
          step3.details = {
            reason: 'No lead found matching phone',
            attemptedE164: normalizedPhone,
            totalLeadsInCoach: leads.length
          };
        }
      }
    } catch (err) {
      step3.status = 'fail';
      step3.details = { error: err.message };
    }
    audit.steps.push(step3);

    // Get the actual leadId for next steps
    const actualLeadId = step3.details?.foundLeadId || leadId;

    // ============= STEP 4: Persistence Lookup Check =============
    const step4 = {
      step: 4,
      name: 'Inbound Message Persistence Lookup',
      status: 'not_found',
      details: {}
    };

    try {
      const providerMessageId = inboundData?.providerMessageId;
      
      // Exact lookup by providerMessageId
      let threads = [];
      if (providerMessageId) {
        threads = await base44.asServiceRole.entities.LeadMessageThread.filter({
          leadId: actualLeadId,
          providerMessageId: providerMessageId,
          direction: 'INBOUND'
        });
      }

      if (threads.length > 0) {
        step4.status = 'pass';
        step4.details = {
          lookupMethod: 'providerMessageId_exact',
          found: true,
          messageId: threads[0].id,
          message: {
            id: threads[0].id,
            messageText: threads[0].messageText?.substring(0, 50) + '...',
            messageTimestamp: threads[0].messageTimestamp,
            senderType: threads[0].senderType,
            aiProcessed: threads[0].aiProcessed,
            replyStatus: threads[0].replyStatus
          }
        };
      } else {
        // Fallback: Get latest inbound message for this lead
        threads = await base44.asServiceRole.entities.LeadMessageThread.filter({
          leadId: actualLeadId,
          direction: 'INBOUND'
        });

        // Sort by timestamp descending
        threads.sort((a, b) => {
          const aTime = new Date(a.messageTimestamp || 0).getTime();
          const bTime = new Date(b.messageTimestamp || 0).getTime();
          return bTime - aTime;
        });

        if (threads.length > 0) {
          const latest = threads[0];
          step4.status = 'warning';
          step4.details = {
            lookupMethod: 'latest_inbound_fallback',
            found: true,
            messageId: latest.id,
            message: {
              id: latest.id,
              messageText: latest.messageText?.substring(0, 50) + '...',
              messageTimestamp: latest.messageTimestamp,
              senderType: latest.senderType,
              aiProcessed: latest.aiProcessed,
              replyStatus: latest.replyStatus,
              providerMessageId: latest.providerMessageId
            },
            warning: 'Found latest inbound but not exact providerMessageId match'
          };
        } else {
          step4.status = 'fail';
          step4.details = {
            reason: 'No inbound messages found',
            leadId: actualLeadId,
            totalMessageCount: threads.length,
            lookupAttempted: 'direction=INBOUND'
          };
        }
      }
    } catch (err) {
      step4.status = 'fail';
      step4.details = { error: err.message };
    }
    audit.steps.push(step4);

    // ============= STEP 5: Schema Compatibility Check =============
    const step5 = {
      step: 5,
      name: 'Schema Compatibility Check',
      status: 'pass',
      details: {}
    };

    try {
      // Get the schema for LeadMessageThread
      const schema = await base44.asServiceRole.entities.LeadMessageThread.schema();
      
      const requiredFields = [
        'leadId',
        'direction',
        'messageText',
        'messageTimestamp',
        'senderType',
        'aiProcessed',
        'replyStatus'
      ];

      const schemaFields = Object.keys(schema.properties || {});
      const missingFields = requiredFields.filter(f => !schemaFields.includes(f));

      step5.details = {
        entityName: 'LeadMessageThread',
        requiredFields: requiredFields,
        availableFields: schemaFields,
        missingFields: missingFields,
        directionEnum: schema.properties?.direction?.enum,
        senderTypeEnum: schema.properties?.senderType?.enum,
        status: missingFields.length === 0 ? 'all_fields_present' : 'missing_fields'
      };

      if (missingFields.length > 0) {
        step5.status = 'fail';
      }
    } catch (err) {
      step5.status = 'fail';
      step5.details = { error: err.message };
    }
    audit.steps.push(step5);

    // ============= STEP 6: AI Readiness Lookup =============
    const step6 = {
      step: 6,
      name: 'AI Readiness Lookup Simulation',
      status: 'fail',
      details: {}
    };

    try {
      // Simulate what AI Brain would do when looking for inbound messages
      const latestInbound = await base44.asServiceRole.entities.LeadMessageThread.filter({
        leadId: actualLeadId,
        direction: 'INBOUND',
        aiProcessed: false
      });

      // Sort by messageTimestamp descending (most recent first)
      latestInbound.sort((a, b) => {
        const aTime = new Date(a.messageTimestamp || 0).getTime();
        const bTime = new Date(b.messageTimestamp || 0).getTime();
        return bTime - aTime;
      });

      if (latestInbound.length > 0) {
        const inboundMsg = latestInbound[0];
        step6.status = 'pass';
        step6.details = {
          filterUsed: {
            leadId: actualLeadId,
            direction: 'INBOUND',
            aiProcessed: false
          },
          found: true,
          messageFound: {
            id: inboundMsg.id,
            text: inboundMsg.messageText?.substring(0, 50) + '...',
            timestamp: inboundMsg.messageTimestamp,
            senderType: inboundMsg.senderType
          },
          readinessConclusion: 'READY - unprocessed inbound message available'
        };
      } else {
        step6.status = 'fail';
        step6.details = {
          filterUsed: {
            leadId: actualLeadId,
            direction: 'INBOUND',
            aiProcessed: false
          },
          found: false,
          readinessConclusion: 'NOT_READY - no unprocessed inbound messages',
          allMessages: {
            total: (await base44.asServiceRole.entities.LeadMessageThread.filter({
              leadId: actualLeadId
            })).length
          }
        };
      }
    } catch (err) {
      step6.status = 'fail';
      step6.details = { error: err.message };
    }
    audit.steps.push(step6);

    // ============= STEP 7: Break-point Diagnosis =============
    const step7 = {
      step: 7,
      name: 'Exact Break-point Diagnosis',
      status: 'analyzed',
      details: {}
    };

    let breakPoint = 'CHAIN_HEALTHY';
    let rootCause = 'No issues detected';
    let recommendedFix = 'None required';
    let safeNextStep = 'Proceed with AI invocation';

    // Analyze each step
    if (step1.status === 'fail') {
      breakPoint = 'INBOUND_NOT_AVAILABLE';
      rootCause = 'No inbound message payload captured or provided';
      recommendedFix = 'Verify Green API webhook or payload source';
      safeNextStep = 'Check Green API provider configuration';
    } else if (step2.status === 'fail') {
      breakPoint = 'NORMALIZATION_MISMATCH';
      rootCause = 'Phone number could not be normalized to E164';
      recommendedFix = 'Check phone number format and normalization logic';
      safeNextStep = 'Manual phone format validation';
    } else if (step3.status === 'fail') {
      breakPoint = 'LEAD_MATCH_FAILED';
      rootCause = 'No lead found matching the normalized phone number';
      recommendedFix = 'Create or repair lead record with correct phone number';
      safeNextStep = 'Use createSimulatorLead or repairLeadPhone function';
    } else if (step4.status === 'fail') {
      breakPoint = 'MESSAGE_NOT_PERSISTED';
      rootCause = 'Inbound message not found in LeadMessageThread entity';
      recommendedFix = 'Check if message was captured by webhook or sync process';
      safeNextStep = 'Run manualSyncWhatsAppInbound to import missing messages';
    } else if (step5.status === 'fail') {
      breakPoint = 'SCHEMA_MISMATCH';
      rootCause = 'LeadMessageThread schema incompatible with AI lookup';
      recommendedFix = 'Verify entity schema definition and field names';
      safeNextStep = 'Check entity JSON definition in /entities directory';
    } else if (step6.status === 'fail') {
      breakPoint = 'AI_LOOKUP_FILTERING_WRONG';
      rootCause = 'AI lookup filter not finding available inbound messages';
      recommendedFix = 'Check AI Brain filter criteria (aiProcessed, direction, etc)';
      safeNextStep = 'Review and adjust AI lookup query in aiConversationAgent';
    } else if (step1.status === 'warning' || step4.status === 'warning') {
      breakPoint = 'POTENTIAL_ISSUE';
      rootCause = 'Defensive matching or fallback methods in use';
      recommendedFix = 'Verify data consistency and exact field values';
      safeNextStep = 'Manual verification of lead/message mapping';
    }

    step7.details = {
      breakPoint,
      rootCause,
      recommendedFix,
      safeNextStep,
      chainSummary: {
        step1: step1.status,
        step2: step2.status,
        step3: step3.status,
        step4: step4.status,
        step5: step5.status,
        step6: step6.status
      }
    };
    audit.steps.push(step7);

    return Response.json({
      ok: true,
      audit,
      finalBreakPoint: breakPoint,
      rootCause,
      recommendedFix,
      safeNextStep
    });

  } catch (error) {
    return Response.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 });
  }
});