import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Normalize an Israeli phone number to E.164 format.
 *
 * Rules (applied in order):
 *   1. Trim spaces
 *   2. Remove all spaces, dashes, parentheses, dots, commas
 *   3. If + is at the END → move to start  (e.g. 972547598919+ → +972547598919)
 *   4. If starts with "00" → replace with +  (e.g. 00972547598919 → +972547598919)
 *   5. If starts with "972" (no +) → prepend +  (e.g. 972547598919 → +972547598919)
 *   6. If starts with "0" and is 10 digits → +972 + digits[1:]  (e.g. 0547598919 → +972547598919)
 *   7. Validate: must match ^\+972\d{9}$
 *
 * Returns the E.164 string or null if invalid.
 */
export function normalizePhone(phoneRaw) {
  if (!phoneRaw) return null;

  // Step 1+2: remove whitespace, dashes, parens, dots, commas
  let s = String(phoneRaw).trim();
  s = s.replace(/[\s\-().,]/g, '');
  // keep only digits and +
  s = s.replace(/[^\d+]/g, '');

  // Step 3: trailing + → move to front
  if (s.endsWith('+') && !s.startsWith('+')) {
    s = '+' + s.slice(0, -1);
  }

  // Step 4: 00... → +...
  if (s.startsWith('00')) {
    s = '+' + s.slice(2);
  }

  // Step 5: 972XXXXXXXXX (12 digits, no +) → +972XXXXXXXXX
  if (/^972\d{9}$/.test(s)) {
    s = '+' + s;
  }

  // Step 6: 0XXXXXXXXX (10 digits local Israeli) → +972XXXXXXXXX
  if (/^0\d{9}$/.test(s)) {
    s = '+972' + s.slice(1);
  }

  // Step 7: validate Israeli E164
  if (/^\+972\d{9}$/.test(s)) {
    return s;
  }

  return null;
}

/**
 * Validate that a phone is a valid Israeli E.164 number.
 * Regex: ^\+972\d{9}$
 */
export function validatePhoneE164(phone) {
  return /^\+972\d{9}$/.test(phone || '');
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
      return Response.json({ phone_e164: null }, { status: 200 });
    }

    const phone_e164 = normalizePhone(phoneRaw);
    const valid = validatePhoneE164(phone_e164);

    if (!phone_e164 || !valid) {
      console.warn('[normalizePhone] Could not normalize:', phoneRaw, '→', phone_e164);
      return Response.json({ phone_e164: null, valid: false, error: `Could not normalize phone: ${phoneRaw}` }, { status: 200 });
    }

    return Response.json({ phone_e164, valid: true }, { status: 200 });

  } catch (error) {
    console.error('normalizePhoneToE164 error:', error);
    return Response.json({ phone_e164: null, valid: false, error: error.message }, { status: 500 });
  }
});