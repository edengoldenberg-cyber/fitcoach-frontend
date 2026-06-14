import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { leadId, testPhone, message } = body;

    console.log('[testRealWhatsAppDelivery] REQUEST_BODY:', JSON.stringify(body));

    // ── DIRECT TEST MODE: phone + message provided directly ──────────────────
    if (testPhone && message) {
      console.log('[testRealWhatsAppDelivery] DIRECT_TEST_MODE phone:', testPhone);

      // Get coach email from user
      const coachEmail = user.email;

      // Load provider config
      const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail });
      const config = configs[0];

      if (!config || !config.is_enabled) {
        return Response.json({ ok: false, error: 'WhatsApp provider not configured or disabled for coach: ' + coachEmail });
      }

      console.log('[testRealWhatsAppDelivery] provider_type:', config.provider_type, 'coach:', coachEmail);

      // Call sendWhatsAppMessage directly
      const sendResult = await base44.functions.invoke('sendWhatsAppMessage', {
        coachEmail,
        toPhoneE164: testPhone,
        text: message,
        toName: 'Test',
        contextType: 'system',
      });

      console.log('[testRealWhatsAppDelivery] SEND_RESULT:', JSON.stringify(sendResult?.data));

      const data = sendResult?.data || {};
      return Response.json({
        ok: data.ok === true,
        mode: 'direct',
        phone: testPhone,
        provider: config.provider_type,
        result: data,
        error: data.ok ? undefined : (data.message || data.error || 'Send failed'),
        debug: data.debug || null,
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (!leadId) {
      return Response.json({ error: 'Either leadId or (testPhone + message) are required' }, { status: 400 });
    }

    console.log('[testRealWhatsAppDelivery] Starting test for leadId:', leadId);

    // 1. Get lead
    const leads = await base44.entities.Lead.filter({ id: leadId });
    const lead = leads[0];
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    // 2. Get AI Brain
    const brains = await base44.entities.AIBrainConfig.filter({ coach_email: 'edengoldenberg@gmail.com', isActive: true });
    const brain = brains[0];

    // 3. Create inbound message thread
    await base44.entities.LeadMessageThread.create({
      leadId: lead.id,
      coach_email: 'edengoldenberg@gmail.com',
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      senderType: 'LEAD',
      messageText: 'היי, אני רוצה לשמוע פרטים על האימונים',
      messageTimestamp: new Date().toISOString()
    });

    // 4. Call aiConversationAgent
    const aiResult = await base44.functions.invoke('aiConversationAgent', {
      leadId: lead.id,
      inboundMessageText: 'היי, אני רוצה לשמוע פרטים על האימונים'
    });

    // 5. Check queue
    const queue = await base44.entities.WhatsAppMessageQueue.filter({ context_id: lead.id });

    if (queue.length > 0) {
      const msg = queue[queue.length - 1];
      const workerResult = await base44.functions.invoke('whatsAppQueueWorker', {});
      const updatedMsgs = await base44.entities.WhatsAppMessageQueue.filter({ id: msg.id });
      const updatedMsg = updatedMsgs[0];

      let providerData = null;
      try { providerData = JSON.parse(updatedMsg.provider_response || '{}'); } catch {}

      return Response.json({
        ok: true,
        lead: { id: lead.id, firstName: lead.firstName, phoneE164: lead.phoneE164, source: lead.source },
        ai: { brainActive: !!brain, result: aiResult },
        queue: { recordId: msg.id, status: updatedMsg.status, providerType: updatedMsg.provider_type, messagePreview: msg.rendered_text?.slice(0, 100) },
        provider: { response: providerData, messageId: providerData?.providerMessageId || providerData?.messageId },
        worker: workerResult
      });
    } else {
      return Response.json({
        ok: false,
        error: 'No queue records created',
        lead: { id: lead.id, firstName: lead.firstName, phoneE164: lead.phoneE164 },
        ai: { brainActive: !!brain, result: aiResult }
      });
    }

  } catch (error) {
    console.error('[testRealWhatsAppDelivery] Error:', error);
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});