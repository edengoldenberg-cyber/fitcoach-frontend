import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Normalize Israeli phone numbers to canonical format: 972XXXXXXXXX (without plus)
 * 
 * Rules (applied in order):
 *   1. Remove all whitespace, dashes, parentheses, dots, commas
 *   2. Remove + prefix
 *   3. If starts with 0 (Israeli local): replace with 972
 *   4. If starts with 972: keep as-is
 *   5. If starts with 5 and length === 9: prepend 972
 *   6. Validate: must be 972 followed by exactly 9 digits
 * 
 * Returns 972XXXXXXXXX or null if invalid
 * 
 * Examples:
 *   0535716559       → 972535716559
 *   +972535716559    → 972535716559
 *   972535716559     → 972535716559
 *   535716559        → 972535716559
 */
export function normalizePhoneToE164NP(phoneRaw) {
  if (!phoneRaw) return null;

  // Step 1: Remove whitespace and punctuation
  let s = String(phoneRaw).trim();
  s = s.replace(/[\s\-().,]/g, '');

  // Step 2: Remove + prefix
  s = s.replace(/^\+/, '');

  // Step 3: If starts with 0, replace with 972 (Israeli local, must be 10 digits)
  if (s.startsWith('0') && s.length === 10) {
    s = '972' + s.slice(1);
  }

  // Step 4: If starts with 5 and length === 9, prepend 972 (short form)
  if (s.startsWith('5') && s.length === 9) {
    s = '972' + s;
  }

  // Step 5: Validate format: must be 972 + 9 digits
  if (/^972\d{9}$/.test(s)) {
    return s;
  }

  return null;
}

/**
 * Normalize Israeli phone to E.164 format WITH plus: +972XXXXXXXXX
 */
export function normalizePhoneToE164(phoneRaw) {
  const result = normalizePhoneToE164NP(phoneRaw);
  return result ? '+' + result : null;
}

/**
 * Check if phone is already normalized (972XXXXXXXXX format)
 */
export function isNormalizedPhone(phone) {
  return /^972\d{9}$/.test(phone || '');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { phoneRaw } = await req.json();

    if (!phoneRaw) {
      return Response.json({ normalized: null }, { status: 200 });
    }

    const normalized = normalizePhoneToE164NP(phoneRaw);

    if (!normalized) {
      console.warn('[normalizePhoneToE164NP] Could not normalize:', phoneRaw);
      return Response.json({ 
        normalized: null, 
        error: `Could not normalize phone: ${phoneRaw}` 
      }, { status: 200 });
    }

    return Response.json({ normalized, valid: true }, { status: 200 });

  } catch (error) {
    console.error('normalizePhoneToE164NP error:', error);
    return Response.json({ normalized: null, error: error.message }, { status: 500 });
  }
});