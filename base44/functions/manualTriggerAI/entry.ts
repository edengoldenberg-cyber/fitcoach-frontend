import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify admin access
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { leadId } = await req.json();
    
    if (!leadId) {
      return Response.json({ ok: false, error: 'leadId is required' }, { status: 400 });
    }

    console.log(`[MANUAL_AI] Triggering AI for lead ${leadId}`);

    // Find latest inbound message for this lead (omit channel filter to avoid missing records where channel is unset)
    const inboundMessages = await base44.asServiceRole.entities.LeadMessageThread.filter({
      leadId,
      direction: 'INBOUND',
    });

    if (inboundMessages.length === 0) {
      console.log(`[MANUAL_AI] No inbound message found for lead ${leadId}`);
      return Response.json({
        ok: false,
        inboundFound: false,
        message: 'No inbound message found for this lead',
      });
    }

    // Sort by created_date descending to get latest
    const latestInbound = inboundMessages.sort((a, b) => 
      new Date(b.created_date) - new Date(a.created_date)
    )[0];

    console.log(`[MANUAL_AI] Found latest inbound message: ${latestInbound.id}`);

    // Invoke aiConversationAgent with DIRECT invocation (bypass automation payload)
    try {
      const aiRes = await base44.asServiceRole.functions.invoke('aiConversationAgent', {
        leadId: latestInbound.leadId,
        messageText: latestInbound.messageText,
        coach_email: latestInbound.coach_email,
        // NOT an automation event - direct invocation mode
      });

      console.log(`[MANUAL_AI] AI response:`, aiRes.data);

      // Check if AI queued an outbound reply
      const outboundQueued = aiRes.data?.ok && aiRes.data?.queueId;

      return Response.json({
        ok: true,
        inboundFound: true,
        inboundMessageId: latestInbound.id,
        inboundText: latestInbound.messageText,
        aiInvoked: true,
        aiResponse: aiRes.data,
        outboundQueued,
        queueId: aiRes.data?.queueId,
      });
    } catch (aiErr) {
      console.error(`[MANUAL_AI] AI invocation failed:`, aiErr.message);
      return Response.json({
        ok: false,
        inboundFound: true,
        inboundMessageId: latestInbound.id,
        aiInvoked: false,
        error: aiErr.message,
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[MANUAL_AI] Fatal error:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});