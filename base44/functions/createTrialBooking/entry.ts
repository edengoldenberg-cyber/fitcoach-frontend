import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function logEvent(base44, coachEmail, flowEvent, payload) {
  await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
    coach_email: coachEmail || 'system',
    event: 'RULE_TRIGGERED',
    payload: { flowEvent, ...payload }
  }).catch(() => {});
}

/**
 * Params: { leadId, slotId, notes? }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { leadId, slotId, notes } = await req.json();

    if (!leadId || !slotId) {
      return Response.json({ ok: false, error: 'Missing leadId or slotId' }, { status: 400 });
    }

    // Fetch slot
    const allSlots = await base44.asServiceRole.entities.TrialSlot.filter({});
    const slot = allSlots.find(s => s.id === slotId);
    if (!slot) return Response.json({ ok: false, error: 'Slot not found' });
    if (!slot.isActive) return Response.json({ ok: false, error: 'Slot is not active' });
    if (slot.bookedCount >= slot.capacity) return Response.json({ ok: false, error: 'Slot is full' });

    // Fetch lead
    const allLeads = await base44.asServiceRole.entities.Lead.filter({});
    const lead = allLeads.find(l => l.id === leadId);
    if (!lead) return Response.json({ ok: false, error: 'Lead not found' });

    const coachEmail = lead.coach_email || slot.coach_email || 'system';
    const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');

    // Create booking
    const booking = await base44.asServiceRole.entities.TrialBooking.create({
      coach_email: coachEmail,
      leadId,
      leadName,
      leadPhone: lead.phoneE164 || lead.phone || '',
      slotId,
      slotTitle: slot.title,
      slotDate: slot.date,
      slotStartTime: slot.startTime,
      status: 'BOOKED',
      bookedAt: new Date().toISOString(),
      notes: notes || '',
    });

    // Increment bookedCount
    await base44.asServiceRole.entities.TrialSlot.update(slotId, {
      bookedCount: (slot.bookedCount || 0) + 1
    });

    // Update lead status to BOOKED
    await base44.asServiceRole.entities.Lead.update(leadId, { status: 'BOOKED' });

    await logEvent(base44, coachEmail, 'TRIAL_BOOKING_CREATED', {
      bookingId: booking.id,
      leadId,
      leadName,
      slotId,
      slotTitle: slot.title,
      slotDate: slot.date
    });

    await base44.asServiceRole.functions.invoke('logLeadActivity', {
      leadId,
      coach_email: coachEmail,
      activityType: 'TRIAL_BOOKING_CREATED',
      activitySource: 'SYSTEM',
      message: `נרשם לאימון ניסיון – ${slot.title} ב-${slot.date} ${slot.startTime}`,
      metadata: { bookingId: booking.id, slotId, slotTitle: slot.title, slotDate: slot.date }
    }).catch(() => {});

    return Response.json({ ok: true, bookingId: booking.id });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});