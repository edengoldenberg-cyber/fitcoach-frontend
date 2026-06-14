import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Admin-only: Repair malformed phone numbers in Lead records
 * Fixes legacy data where phoneE164 was saved as "972XXXXXXXXX+" instead of "+972XXXXXXXXX"
 */

function normalizePhone(phoneRaw) {
  if (!phoneRaw) return { e164: null, raw: null, steps: ['input is empty'] };
  let s = String(phoneRaw).trim();
  const steps = [`input="${s}"`];
  
  // Remove all non-digit characters except leading +
  s = s.replace(/[\s\-().,]/g, '');
  const hasLeadingPlus = s.startsWith('+');
  s = s.replace(/\+/g, ''); // Remove all +
  s = s.replace(/\D/g, ''); // Remove all non-digits
  if (hasLeadingPlus) s = '+' + s; // Restore leading + if existed
  steps.push(`after_clean="${s}"`);
  
  if (s.startsWith('00')) { s = '+' + s.slice(2); steps.push(`00_prefix → "${s}"`); }
  if (/^972\d{9}$/.test(s)) { s = '+' + s; steps.push(`972_prefix → "${s}"`); }
  if (/^0\d{9}$/.test(s)) { s = '+972' + s.slice(1); steps.push(`0_prefix → "${s}"`); }
  
  const ok = /^\+972\d{9}$/.test(s);
  steps.push(`result="${s}" valid=${ok}`);
  
  // Determine raw format (remove country code if present)
  let raw = phoneRaw.trim();
  if (ok) {
    // Extract local format: +972547598919 → 0547598919
    raw = '0' + s.slice(4);
    steps.push(`raw="${raw}"`);
  }
  
  return { e164: ok ? s : null, raw: ok ? raw : phoneRaw.trim(), steps };
}

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

    // Fetch current lead data
    const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId });
    if (leads.length === 0) {
      return Response.json({ ok: false, error: 'Lead not found' }, { status: 404 });
    }

    const lead = leads[0];
    const currentPhoneRaw = lead.phoneRaw || lead.phone;
    const currentPhoneE164 = lead.phoneE164;

    console.log('[REPAIR_PHONE] Before:', { leadId, phoneRaw: currentPhoneRaw, phoneE164: currentPhoneE164 });

    // Normalize phone
    const normalized = normalizePhone(currentPhoneRaw);
    
    if (!normalized.e164) {
      return Response.json({
        ok: false,
        error: 'Cannot normalize phone to valid E.164 format',
        normalizationSteps: normalized.steps,
        currentPhoneRaw,
        currentPhoneE164
      }, { status: 400 });
    }

    // Update lead with corrected phone values
    const updated = await base44.asServiceRole.entities.Lead.update(leadId, {
      phoneRaw: normalized.raw,
      phoneE164: normalized.e164
    });

    console.log('[REPAIR_PHONE] After:', { leadId, phoneRaw: updated.phoneRaw, phoneE164: updated.phoneE164 });

    return Response.json({
      ok: true,
      leadId,
      before: {
        phoneRaw: currentPhoneRaw,
        phoneE164: currentPhoneE164
      },
      after: {
        phoneRaw: updated.phoneRaw,
        phoneE164: updated.phoneE164
      },
      normalizationSteps: normalized.steps
    });

  } catch (error) {
    console.error('[REPAIR_PHONE] Error:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});