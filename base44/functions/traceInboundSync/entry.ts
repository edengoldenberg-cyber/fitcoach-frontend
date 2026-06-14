import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Admin-only: Diagnostic trace tool for inbound WhatsApp sync
 * Returns step-by-step execution trace without modifying production behavior
 */

Deno.serve(async (req) => {
  const trace = [];
  
  function logStep(step, status, details) {
    trace.push({ step, status, details, timestamp: new Date().toISOString() });
    console.log(`[TRACE] ${step}: ${status}`, details);
  }

  try {
    const base44 = createClientFromRequest(req);
    
    // Verify admin access
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { leadId } = await req.json();
    
    if (!leadId) {
      return Response.json({ ok: false, error: 'leadId is required', trace }, { status: 400 });
    }

    // Get lead info
    const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId });
    if (leads.length === 0) {
      logStep('Load Lead', 'fail', { error: 'Lead not found' });
      return Response.json({ ok: false, trace }, { status: 404 });
    }
    const lead = leads[0];
    logStep('Load Lead', 'success', { leadId, coach_email: lead.coach_email, phone: lead.phone, phoneE164: lead.phoneE164 });

    // STEP 1: Load provider config
    const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({
      coach_email: lead.coach_email,
      provider_type: 'greenapi',
      is_enabled: true
    });

    if (configs.length === 0) {
      logStep('1. Load Provider Config', 'fail', { error: 'No active Green API config found' });
      return Response.json({ ok: false, trace }, { status: 400 });
    }

    const config = configs[0];
    logStep('1. Load Provider Config', 'success', {
      configId: config.id,
      coach_email: config.coach_email,
      instance_id: config.instance_id,
      api_url: config.api_url,
      has_token: !!config.api_token
    });

    // STEP 2: Build Green API endpoint
    const apiUrl = config.api_url || 'https://api.green-api.com';
    const instanceId = config.instance_id;
    const apiToken = config.api_token;

    if (!instanceId || !apiToken) {
      logStep('2. Build Green API Endpoint', 'fail', { error: 'Missing credentials' });
      return Response.json({ ok: false, trace }, { status: 400 });
    }

    const baseUrl = apiUrl.replace('/waServer', '');
    const endpoint = `${baseUrl}/waInstance${instanceId}/lastIncomingMessages/${apiToken}`;
    const maskedEndpoint = endpoint.replace(apiToken, '***TOKEN***');
    
    logStep('2. Build Green API Endpoint', 'success', {
      final_url: maskedEndpoint,
      method: 'GET'
    });

    // STEP 3: Fetch Green messages
    let greenRes;
    try {
      greenRes = await fetch(endpoint);
      logStep('3. Fetch Green Messages', greenRes.ok ? 'success' : 'fail', {
        http_status: greenRes.status,
        content_type: greenRes.headers.get('content-type'),
        ok: greenRes.ok
      });
    } catch (fetchErr) {
      logStep('3. Fetch Green Messages', 'fail', { error: fetchErr.message });
      return Response.json({ ok: false, trace }, { status: 500 });
    }

    if (!greenRes.ok) {
      const errorText = await greenRes.text();
      logStep('3. Fetch Green Messages - Response', 'fail', {
        status: greenRes.status,
        body_preview: errorText.slice(0, 200)
      });
      return Response.json({ ok: false, trace }, { status: 500 });
    }

    // STEP 4: Parse Green response
    let messages;
    const responseText = await greenRes.text();
    try {
      messages = JSON.parse(responseText);
      logStep('4. Parse Green Response', 'success', {
        messages_count: Array.isArray(messages) ? messages.length : 0,
        is_array: Array.isArray(messages),
        first_message_id: messages[0]?.idMessage,
        first_sender: messages[0]?.senderData?.senderPhone,
        raw_body_preview: responseText.slice(0, 200)
      });
    } catch (parseErr) {
      logStep('4. Parse Green Response', 'fail', {
        error: parseErr.message,
        raw_body_preview: responseText.slice(0, 200)
      });
      return Response.json({ ok: false, trace }, { status: 500 });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      logStep('4. Parse Green Response - No Messages', 'success', { messages_count: 0 });
      return Response.json({ ok: true, trace, result: 'No new messages' });
    }

    // Process first message for diagnostic
    const msg = messages[0];

    // STEP 5: Normalize sender phone to true E164
    // Green API format: sender can be in senderData.senderPhone OR chatId
    const rawSender = (msg.senderData?.senderPhone || msg.chatId || '').replace('@c.us', '').replace('@s.whatsapp.net', '');
    
    // Normalize to true E164 format
    const phoneE164 = (() => {
      const cleaned = String(rawSender || '')
        .replace(/[^\d+]/g, '')
        .trim();
      
      if (!cleaned) return '';
      if (cleaned.startsWith('+')) return cleaned;
      return '+' + cleaned;
    })();

    logStep('5. Normalize Sender Phone', 'success', {
      raw_sender: msg.senderData?.senderPhone,
      cleaned_sender: rawSender,
      normalized_e164: phoneE164
    });

    // Helper: extract digits only
    const digitsOnly = (value) => String(value || '').replace(/\D/g, '');
    const senderDigits = digitsOnly(phoneE164);

    // STEP 6: Match lead (exact E164)
    let matchedLeads = await base44.asServiceRole.entities.Lead.filter({
      phoneE164: phoneE164,
      coach_email: config.coach_email
    });

    let matchMethod = 'exact_e164';

    // Defensive matching if exact fails (digits only)
    if (matchedLeads.length === 0) {
      logStep('6a. Match Lead (Exact E164)', 'fail', {
        lookup_by_phoneE164: phoneE164,
        matched_count: 0
      });

      const allCoachLeads = await base44.asServiceRole.entities.Lead.filter({
        coach_email: config.coach_email
      });
      
      matchedLeads = allCoachLeads.filter(l => {
        const e164Digits = digitsOnly(l.phoneE164);
        const phoneDigits = digitsOnly(l.phone);
        const rawDigits = digitsOnly(l.phoneRaw);
        
        return (
          e164Digits === senderDigits ||
          phoneDigits === senderDigits ||
          rawDigits === senderDigits
        );
      });

      matchMethod = 'defensive_digits';
      
      logStep('6b. Match Lead (Defensive)', matchedLeads.length > 0 ? 'success' : 'fail', {
        sender_digits: senderDigits,
        total_coach_leads: allCoachLeads.length,
        matched_count: matchedLeads.length,
        matched_lead_id: matchedLeads[0]?.id,
        stored_phoneE164: matchedLeads[0]?.phoneE164,
        stored_phone: matchedLeads[0]?.phone,
        stored_phoneRaw: matchedLeads[0]?.phoneRaw,
        e164_digits: matchedLeads[0] ? digitsOnly(matchedLeads[0].phoneE164) : null,
        phone_digits: matchedLeads[0] ? digitsOnly(matchedLeads[0].phone) : null,
        raw_digits: matchedLeads[0] ? digitsOnly(matchedLeads[0].phoneRaw) : null
      });
    } else {
      logStep('6. Match Lead (Exact E164)', 'success', {
        lookup_by_phoneE164: phoneE164,
        matched_count: matchedLeads.length,
        matched_lead_id: matchedLeads[0]?.id
      });
    }

    if (matchedLeads.length === 0) {
      return Response.json({ ok: false, trace, result: 'No lead matched' });
    }

    const matchedLead = matchedLeads[0];

    // STEP 7: Check duplicate
    const existing = await base44.asServiceRole.entities.LeadMessageThread.filter({
      leadId: matchedLead.id,
      providerMessageId: msg.idMessage
    });

    logStep('7. Check Duplicate', existing.length > 0 ? 'success' : 'success', {
      providerMessageId: msg.idMessage,
      already_exists: existing.length > 0,
      existing_count: existing.length
    });

    if (existing.length > 0) {
      return Response.json({ ok: true, trace, result: 'Message already exists (duplicate skipped)' });
    }

    // STEP 8: Create LeadMessageThread (dry-run for diagnostic)
    logStep('8. Create LeadMessageThread', 'simulated', {
      would_create: {
        leadId: matchedLead.id,
        coach_email: config.coach_email,
        channel: 'WHATSAPP',
        direction: 'INBOUND',
        senderType: 'LEAD',
        messageText: msg.textMessage || '',
        providerMessageId: msg.idMessage
      },
      note: 'Not actually created in trace mode'
    });

    // STEP 9: Trigger AI (dry-run)
    logStep('9. Trigger AI', 'simulated', {
      would_invoke: 'aiConversationAgent',
      with_params: {
        leadId: matchedLead.id,
        coach_email: config.coach_email,
        messageText: msg.textMessage || ''
      },
      note: 'Not actually invoked in trace mode'
    });

    // STEP 10: Queue outbound reply (dry-run)
    logStep('10. Queue Outbound Reply', 'simulated', {
      note: 'Would be queued by AI agent in real flow'
    });

    // STEP 11: Send outbound reply (dry-run)
    logStep('11. Send Outbound Reply', 'simulated', {
      note: 'Would be sent by queue worker in real flow'
    });

    return Response.json({
      ok: true,
      trace,
      summary: {
        lead_matched: true,
        match_method: matchMethod,
        message_is_new: existing.length === 0,
        would_trigger_ai: true
      }
    });

  } catch (error) {
    logStep('FATAL_ERROR', 'fail', { error: error.message, stack: error.stack });
    return Response.json({ ok: false, error: error.message, trace }, { status: 500 });
  }
});