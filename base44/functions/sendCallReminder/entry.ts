import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// PART 7: Pre-call reminder automation
// Sends reminder 2 hours before scheduled call

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get all leads with scheduled calls in the next 2-3 hours
    const allLeads = await base44.asServiceRole.entities.Lead.list('-created_date', 500);
    const now = Date.now();
    const twoHoursFromNow = now + (2 * 60 * 60 * 1000);
    const threeHoursFromNow = now + (3 * 60 * 60 * 1000);
    
    const leadsNeedingReminder = allLeads.filter(lead => 
      lead.call_scheduled === true &&
      lead.reminder_enabled !== false &&
      lead.reminder_sent !== true &&
      lead.call_time &&
      new Date(lead.call_time).getTime() >= twoHoursFromNow &&
      new Date(lead.call_time).getTime() <= threeHoursFromNow
    );
    
    console.log('[sendCallReminder] Found', leadsNeedingReminder.length, 'leads needing reminder');
    
    let sent = 0;
    for (const lead of leadsNeedingReminder) {
      const callTime = new Date(lead.call_time);
      const timeStr = callTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      
      const message = `היי ${lead.firstName} 🙂
רק תזכורת קטנה לשיחה שלנו היום ב-${timeStr}.
נדבר איתך בעוד כשעתיים.`;
      
      // Get provider config
      const allProviders = await base44.asServiceRole.entities.WhatsAppProviderConfig.list('-created_date', 20);
      const providerConfig = allProviders.find(p => p.coach_email === lead.coach_email && p.is_enabled);
      const providerType = providerConfig?.provider_type || 'mock';
      
      // Queue reminder
      await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
        coach_email: lead.coach_email,
        to_phone_e164: lead.phoneE164,
        to_name: lead.firstName || '',
        context_type: 'lead',
        context_id: lead.id,
        template_key: 'call_reminder',
        rendered_text: message,
        provider_type: providerType,
        status: 'queued'
      });
      
      // Mark reminder as sent
      await base44.asServiceRole.entities.Lead.update(lead.id, { reminder_sent: true });
      
      // Log event
      await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
        coach_email: lead.coach_email,
        event: 'RULE_TRIGGERED',
        payload: { flowEvent: 'AI_CALL_REMINDER_SENT', leadId: lead.id, callTime: lead.call_time }
      });
      
      sent++;
      console.log('[sendCallReminder] Sent reminder to', lead.firstName, '| call at', timeStr);
    }
    
    return Response.json({ ok: true, sent, checked: allLeads.length });
    
  } catch (error) {
    console.error('[sendCallReminder] Error:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});