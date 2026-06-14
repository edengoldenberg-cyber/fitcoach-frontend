import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify admin access
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('[MANUAL_SYNC] Starting manual WhatsApp inbound sync');

    // Fetch all active Green API configs
    const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({
      provider_type: 'greenapi',
      is_enabled: true,
    });

    console.log(`[MANUAL_SYNC_CONFIG_FETCH] Found ${configs.length} enabled Green API providers`);
    configs.forEach((p, idx) => {
      console.log(`[MANUAL_SYNC_CONFIG_${idx}] record_id=${p.id} coach_email=${p.coach_email} instance_id=${p.instance_id} api_url=${p.api_url}`);
    });

    let totalFetched = 0;
    let totalNew = 0;
    let totalCreated = 0;
    let totalAITriggered = 0;
    const errors = [];

    for (const config of configs) {
      const { coach_email, api_url, instance_id, api_token } = config;

      // Skip invalid/test configs
      if (
        coach_email === 'system@test.com' ||
        !api_url || 
        !instance_id || 
        instance_id === 'YOUR_INSTANCE_ID' ||
        !api_token
      ) {
        console.log(`[MANUAL_SYNC] Skipping invalid/test config for ${coach_email}`);
        continue;
      }

      try {
        console.log(`[MANUAL_SYNC_PROVIDER_PROCESSING] config_record_id=${config.id} coach_email=${coach_email}`);
        console.log(`[MANUAL_SYNC_CREDENTIALS] instance_id=${instance_id} has_token=${!!api_token} api_url=${api_url}`);
        
        // Construct Green API endpoint - correct format for Green API v2
        const baseUrl = api_url.replace(/\/+$/, '');
        const endpoint = `${baseUrl}/waInstance${instance_id}/lastIncomingMessages/${api_token}`;
        const maskedEndpoint = endpoint.replace(api_token, '***TOKEN_MASKED***');

        console.log(`[MANUAL_SYNC_FINAL_URL] config_id=${config.id} url=${maskedEndpoint}`);
        console.log(`[MANUAL_SYNC_FETCH_START] config_id=${config.id} sending GET request...`);
        
        const greenRes = await fetch(endpoint);
        console.log(`[MANUAL_SYNC_FETCH_RESPONSE] config_id=${config.id} http_status=${greenRes.status}`);

        if (!greenRes.ok) {
          const errorText = await greenRes.text();
          console.error(`[MANUAL_SYNC] Green API error for ${coach_email}:`);
          console.error(`  - Status: ${greenRes.status}`);
          console.error(`  - Endpoint: ${maskedEndpoint}`);
          console.error(`  - Response: ${errorText}`);
          console.error(`[MANUAL_SYNC_ERROR_DETAILS] config_id=${config.id} instance_id=${instance_id} http_status=${greenRes.status} response_body=${errorText}`);
          errors.push({ 
            coach: coach_email,
            configId: config.id,
            instanceId: instance_id,
            error: `Green API ${greenRes.status}`,
            endpoint: maskedEndpoint,
            response: errorText
          });
          continue;
        }

        const messages = await greenRes.json();
        console.log(`[MANUAL_SYNC] Fetched ${messages.length} messages for ${coach_email}`);
        totalFetched += messages.length;

        // Process each message
        for (const msg of messages) {
          const { idMessage, timestamp, chatId, textMessageData, messageData } = msg;
          
          // Extract message text (Green API structure: textMessageData.textMessage)
          const textMessage = textMessageData?.textMessage || messageData?.textMessageData?.textMessage;

          // Extract phone number from chatId (format: "972XXXXXXXXX@c.us")
          const rawSender = chatId?.split('@')[0];
          if (!rawSender || !textMessage) {
            console.log('[MANUAL_SYNC] Skipping message - missing phone or text');
            continue;
          }

          // Normalize to true E164 format
          const senderPhoneE164 = (() => {
            const cleaned = String(rawSender || '')
              .replace(/[^\d+]/g, '')
              .trim();
            
            if (!cleaned) return '';
            if (cleaned.startsWith('+')) return cleaned;
            return '+' + cleaned;
          })();

          console.log('[MANUAL_SYNC] Normalized sender phone:', { rawSender, senderPhoneE164 });

          // Check if message already exists
          const existing = await base44.asServiceRole.entities.LeadMessageThread.filter({
            providerMessageId: idMessage,
          });

          if (existing.length > 0) {
            console.log(`[MANUAL_SYNC] Message ${idMessage} already exists - skipping`);
            continue;
          }

          totalNew++;

          // Helper: extract digits only for defensive matching
          const digitsOnly = (value) => String(value || '').replace(/\D/g, '');
          const senderDigits = digitsOnly(senderPhoneE164);

          // Try exact E164 match first
          let leads = await base44.asServiceRole.entities.Lead.filter({
            coach_email,
            phoneE164: senderPhoneE164,
          });

          console.log('[MANUAL_SYNC] Exact E164 match:', { phoneE164: senderPhoneE164, matched: leads.length });

          // If not found, try defensive matching (digits only)
          if (leads.length === 0) {
            console.log('[MANUAL_SYNC] Exact match failed, trying defensive (digits only)...');
            
            const allCoachLeads = await base44.asServiceRole.entities.Lead.filter({
              coach_email,
            });
            
            leads = allCoachLeads.filter(lead => {
              const e164Digits = digitsOnly(lead.phoneE164);
              const phoneDigits = digitsOnly(lead.phone);
              const rawDigits = digitsOnly(lead.phoneRaw);
              
              return (
                e164Digits === senderDigits ||
                phoneDigits === senderDigits ||
                rawDigits === senderDigits
              );
            });
            
            if (leads.length > 0) {
              console.log('[MANUAL_SYNC] Defensive match success:', {
                leadId: leads[0].id,
                storedE164: leads[0].phoneE164,
                storedPhone: leads[0].phone,
                storedRaw: leads[0].phoneRaw,
                incomingE164: senderPhoneE164
              });
            }
          }

          if (leads.length === 0) {
            console.log(`[MANUAL_SYNC] No lead found for ${senderPhoneE164} - skipping`);
            continue;
          }

          const lead = leads[0];

          // Create LeadMessageThread record
          const threadRecord = await base44.asServiceRole.entities.LeadMessageThread.create({
            leadId: lead.id,
            coach_email,
            direction: 'INBOUND',
            channel: 'WHATSAPP',
            senderType: 'LEAD',
            messageText: textMessage,
            messageTimestamp: new Date(timestamp * 1000).toISOString(),
            providerMessageId: idMessage,
            aiProcessed: false,
          });

          console.log(`[MANUAL_SYNC] Created LeadMessageThread ${threadRecord.id} for lead ${lead.id}`);
          totalCreated++;

          // Trigger AI processing manually (entity automation requires user-scoped create, we use service role)
          // So we explicitly invoke aiConversationAgent to simulate the automation trigger
          try {
            // AI agent expects the automation payload structure
            const aiRes = await base44.asServiceRole.functions.invoke('aiConversationAgent', {
              event: {
                type: 'create',
                entity_name: 'LeadMessageThread',
                entity_id: threadRecord.id,
              },
              data: threadRecord,
            });
            console.log(`[MANUAL_SYNC] AI triggered for lead ${lead.id}:`, aiRes.data?.ok ? 'success' : 'failed');
            if (aiRes.data?.ok) totalAITriggered++;
          } catch (aiErr) {
            console.error(`[MANUAL_SYNC] AI trigger failed for lead ${lead.id}:`, aiErr.message);
            errors.push({ coach: coach_email, error: `AI failed for lead ${lead.id}: ${aiErr.message}` });
          }
        }
      } catch (err) {
        console.error(`[MANUAL_SYNC] Error processing config for ${coach_email}:`, err.message);
        errors.push({ coach: coach_email, error: err.message });
      }
    }

    console.log('[MANUAL_SYNC] Sync complete:', {
      totalFetched,
      totalNew,
      totalCreated,
      totalAITriggered,
      errors: errors.length,
    });

    return Response.json({
      ok: true,
      totalFetched,
      totalNew,
      totalCreated,
      totalAITriggered,
      errors,
    });
  } catch (error) {
    console.error('[MANUAL_SYNC] Fatal error:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});