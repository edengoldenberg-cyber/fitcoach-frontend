import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Calculates score delta from message text and updates lead.
 * Params: { leadId, messageText }
 */

function calcScoreDelta(messageText) {
  const text = (messageText || '').toLowerCase();
  let delta = 5; // any reply

  if (['מחיר', 'כמה עולה', 'עלות'].some(kw => text.includes(kw))) delta += 15;
  if (['שעות', 'מתי', 'זמנים'].some(kw => text.includes(kw))) delta += 10;
  if (['תתקשר', 'תחזור', 'דבר איתי'].some(kw => text.includes(kw))) delta += 25;

  return delta;
}

function calcTemperature(score) {
  if (score >= 30) return 'HOT';
  if (score >= 15) return 'WARM';
  return 'COLD';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { leadId, messageText } = await req.json();

    if (!leadId) return Response.json({ ok: false, error: 'Missing leadId' }, { status: 400 });

    const allLeads = await base44.asServiceRole.entities.Lead.filter({});
    const lead = allLeads.find(l => l.id === leadId);
    if (!lead) return Response.json({ ok: false, error: 'Lead not found' });

    const delta = calcScoreDelta(messageText);
    const newScore = (lead.leadScore || 0) + delta;
    const newTemperature = calcTemperature(newScore);

    await base44.asServiceRole.entities.Lead.update(leadId, {
      leadScore: newScore,
      leadTemperature: newTemperature
    });

    return Response.json({ ok: true, leadId, delta, newScore, newTemperature });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});