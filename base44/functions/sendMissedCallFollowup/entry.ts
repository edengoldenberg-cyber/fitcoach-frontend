import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// PART 8: Missed call follow-up automation
// Triggered when call_status = no_answer

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const leadId = body?.leadId || body?.event?.entity_id;
    if (!leadId) {
      return Response.json({ ok: false, error: 'missing_leadId' });
    }
    
    // Load lead
    const allLeads = await base44.asServiceRole.entities.Lead.list('-created_date', 1000);
    const lead = allLeads.find(l => l.id === leadId);
    
    if (!lead || lead.call_status !== 'no_answer') {
      return Response.json({ ok: true, skipped: true, reason: 'not_no_answer_status' });
    }
    
    const message = `היי ${lead.firstName} 🙂
ניסינו להשיג אותך לשיחה שקבענו.
נשמח לתאם זמן חדש שמתאים לך.
מתי יהיה לך נוח לדבר?`;
    
    // Get provider config
    const allProviders = await base44.asServiceRole.entities.WhatsAppProviderConfig.list('-created_date', 20);
    const providerConfig = allProviders.find(p => p.coach_email === lead.coach_email && p.is_enabled);
    const providerType = providerConfig?.provider_type || 'mock';
    
    // Queue followup
    await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
      coach_email: lead.coach_email,
      to_phone_e164: lead.phoneE164,
      to_name: lead.firstName || '',
      context_type: 'lead',
      context_id: lead.id,
      template_key: 'missed_call_followup',
      rendered_text: message,
      provider_type: providerType,
      status: 'queued'
    });
    
    // Update followup count
    const newCount = (lead.followup_attempts_count || 0) + 1;
    await base44.asServiceRole.entities.Lead.update(leadId, {
      followup_attempts_count: newCount,
      last_followup_at: new Date().toISOString()
    });
    
    // Log event
    await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
      coach_email: lead.coach_email,
      event: 'RULE_TRIGGERED',
      payload: { flowEvent: 'AI_MISSED_CALL_FOLLOWUP_SENT', leadId, attemptNumber: newCount }
    });
    
    console.log('[sendMissedCallFollowup] Sent to', lead.firstName, '| attempt:', newCount);
    return Response.json({ ok: true, leadId, sent: true, attemptNumber: newCount });
    
  } catch (error) {
    console.error('[sendMissedCallFollowup] Error:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});