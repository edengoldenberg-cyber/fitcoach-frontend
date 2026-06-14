import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Lead-scoped WhatsApp inbound sync.
// Fetches latest messages from Green API for the given lead's coach,
// filters to the specific lead by phone, persists new LeadMessageThread records,
// and triggers the AI pipeline for each new message.
// Does NOT modify any existing logic — calls the same downstream functions as the scheduled poller.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leadId } = await req.json();
    if (!leadId) {
      return Response.json({ ok: false, error: 'leadId is required' }, { status: 400 });
    }

    // Load the lead
    const lead = await base44.asServiceRole.entities.Lead.filter({ id: leadId }).then(r => r[0]);
    if (!lead) {
      return Response.json({ ok: false, error: 'Lead not found' }, { status: 404 });
    }

    const coachEmail = lead.coach_email;

    // Load the coach's active Green API config
    const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({
      coach_email: coachEmail,
      provider_type: 'greenapi',
      is_enabled: true,
    });

    // Filter out invalid/test configs
    const validConfigs = configs.filter(c =>
      c.coach_email !== 'system@test.com' &&
      c.instance_id &&
      c.instance_id !== 'YOUR_INSTANCE_ID' &&
      c.api_token &&
      c.api_url
    );

    if (validConfigs.length === 0) {
      return Response.json({ ok: false, error: 'No valid WhatsApp provider config found for this coach' });
    }

    const config = validConfigs[0];
    const { api_url, instance_id, api_token } = config;

    // Build the lead's phone digits for matching
    const digitsOnly = (v) => String(v || '').replace(/\D/g, '');
    const leadE164Digits = digitsOnly(lead.phoneE164);
    const leadPhoneDigits = digitsOnly(lead.phone);
    const leadRawDigits = digitsOnly(lead.phoneRaw);

    // Fetch latest inbound messages from Green API
    const baseUrl = api_url.replace(/\/+$/, '');
    const endpoint = `${baseUrl}/waInstance${instance_id}/lastIncomingMessages/${api_token}`;
    const greenRes = await fetch(endpoint);

    if (!greenRes.ok) {
      const errorText = await greenRes.text();
      return Response.json({ ok: false, error: `Green API ${greenRes.status}: ${errorText}` });
    }

    const messages = await greenRes.json();
    const totalFetched = messages.length;

    let matched = 0;
    let created = 0;
    let aiTriggered = false;
    const errors = [];

    for (const msg of messages) {
      const { idMessage, timestamp, chatId, textMessageData, messageData } = msg;
      const textMessage = textMessageData?.textMessage || messageData?.textMessageData?.textMessage;

      if (!textMessage || !idMessage) continue;

      // Normalize sender phone from chatId
      const rawSender = chatId?.split('@')[0];
      if (!rawSender) continue;

      const cleaned = String(rawSender).replace(/[^\d+]/g, '').trim();
      const senderE164 = cleaned.startsWith('+') ? cleaned : '+' + cleaned;
      const senderDigits = digitsOnly(senderE164);

      // Check if this message belongs to our lead
      const belongsToLead = (
        leadE164Digits && senderDigits === leadE164Digits
      ) || (
        leadPhoneDigits && senderDigits === leadPhoneDigits
      ) || (
        leadRawDigits && senderDigits === leadRawDigits
      );

      if (!belongsToLead) continue;
      matched++;

      // Check for duplicate
      const existing = await base44.asServiceRole.entities.LeadMessageThread.filter({
        providerMessageId: idMessage,
      });

      if (existing.length > 0) continue;

      // Persist the inbound message
      const threadRecord = await base44.asServiceRole.entities.LeadMessageThread.create({
        leadId: lead.id,
        coach_email: coachEmail,
        direction: 'INBOUND',
        channel: 'WHATSAPP',
        senderType: 'LEAD',
        messageText: textMessage,
        messageTimestamp: new Date(timestamp * 1000).toISOString(),
        providerMessageId: idMessage,
        aiProcessed: false,
        replyStatus: 'pending',
      });

      created++;

      // Trigger AI pipeline — same call as manualSyncWhatsAppInbound
      try {
        const aiRes = await base44.asServiceRole.functions.invoke('aiConversationAgent', {
          event: {
            type: 'create',
            entity_name: 'LeadMessageThread',
            entity_id: threadRecord.id,
          },
          data: threadRecord,
        });
        if (aiRes.data?.ok) aiTriggered = true;
      } catch (aiErr) {
        errors.push(`AI trigger failed: ${aiErr.message}`);
      }
    }

    return Response.json({
      ok: true,
      totalFetched,
      matched,
      created,
      aiTriggered,
      errors,
    });

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});