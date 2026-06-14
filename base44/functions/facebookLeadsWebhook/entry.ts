import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const VERIFY_TOKEN  = Deno.env.get('FACEBOOK_WEBHOOK_VERIFY_TOKEN');
const FACEBOOK_APP_SECRET = Deno.env.get('FACEBOOK_APP_SECRET');

// Verify Facebook X-Hub-Signature-256 — returns true if signature is valid or
// if FACEBOOK_APP_SECRET is not configured (fail-open during migration).
async function verifyHmac(rawBody, signatureHeader) {
  if (!FACEBOOK_APP_SECRET) {
    console.warn('[facebookLeadsWebhook] FACEBOOK_APP_SECRET not set — HMAC verification skipped');
    return true;
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = signatureHeader.slice(7);
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(FACEBOOK_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return computed === expected;
}

// ── Normalize Israeli phone to E.164 ──────────────────────────────────────────
function normalizePhone(phoneRaw) {
  if (!phoneRaw) return null;
  let s = String(phoneRaw).trim().replace(/[\s\-().,]/g, '').replace(/[^\d+]/g, '');
  if (s.endsWith('+') && !s.startsWith('+')) s = '+' + s.slice(0, -1);
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^972\d{9}$/.test(s)) s = '+' + s;
  if (/^0\d{9}$/.test(s)) s = '+972' + s.slice(1);
  if (/^\+972\d{9}$/.test(s)) return s;
  return null;
}

// Validate Israeli E164: +972 followed by exactly 9 digits
function validatePhoneE164(phone) {
  return /^\+972\d{9}$/.test(phone || '');
}

function extractField(fieldData, ...names) {
  for (const name of names) {
    const f = (fieldData || []).find(f => f.name === name);
    const val = f?.values?.[0];
    if (val) return val;
  }
  return '';
}

function buildAnswers(fieldData) {
  const answers = {};
  for (const field of (fieldData || [])) {
    const key = field.name || '';
    const val = Array.isArray(field.values) ? field.values.join(', ') : (field.values || '');
    if (key) answers[key] = val;
  }
  return answers;
}

async function logEvent(base44, coachEmail, event, payload) {
  await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
    coach_email: coachEmail || 'system',
    event,
    payload
  }).catch(() => {});
}

Deno.serve(async (req) => {
  // ── GET: Facebook webhook verification ──────────────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  // ── POST: Incoming lead event ────────────────────────────────────────────────
  if (req.method === 'POST') {
    // Read raw body first (required for HMAC verification before JSON parse)
    const rawBody = await req.clone().text().catch(() => '{}');
    const sigHeader = req.headers.get('x-hub-signature-256') || '';
    const hmacValid = await verifyHmac(rawBody, sigHeader);
    if (!hmacValid) {
      console.warn('[facebookLeadsWebhook] HMAC_REJECTED — invalid X-Hub-Signature-256');
      return new Response('Forbidden: invalid signature', { status: 403 });
    }
    if (FACEBOOK_APP_SECRET) console.log('[facebookLeadsWebhook] HMAC_VERIFIED');

    const base44 = createClientFromRequest(req);
    const body = JSON.parse(rawBody);

    await logEvent(base44, 'system', 'RULE_TRIGGERED', {
      source: 'facebook_webhook',
      event: 'WEBHOOK_RECEIVED',
      raw: JSON.stringify(body).slice(0, 2000)
    });

    // Determine coach email from provider config
    const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({}).catch(() => []);
    const coachEmail = configs[0]?.coach_email || 'system';

    const entries = body?.entry || [];
    const results = [];

    for (const entry of entries) {
      for (const change of (entry.changes || [])) {
        if (change.field !== 'leadgen') continue;

        const leadData = change.value || {};
        const fbLeadId = leadData.leadgen_id || '';
        const formId = leadData.form_id || '';
        const pageId = leadData.page_id || '';
        const adId = leadData.ad_id || '';
        const adsetId = leadData.adset_id || '';
        const campaignId = leadData.campaign_id || '';
        const fieldData = leadData.field_data || [];
        const answers = buildAnswers(fieldData);

        // Extract contact fields
        let firstName = extractField(fieldData, 'first_name');
        let lastName = extractField(fieldData, 'last_name');
        const phoneRaw = extractField(fieldData, 'phone_number', 'phone');
        const email = extractField(fieldData, 'email');
        const formName = extractField(fieldData, 'form_name') || formId;

        // Handle full_name fallback
        if (!firstName) {
          const fullName = extractField(fieldData, 'full_name', 'name');
          if (fullName) {
            const parts = fullName.trim().split(' ');
            firstName = parts[0] || '';
            lastName = parts.slice(1).join(' ') || '';
          }
        }
        if (!firstName) firstName = 'ליד';

        // Normalize and validate phone
        const phoneE164 = normalizePhone(phoneRaw);
        const phoneValid = validatePhoneE164(phoneE164);

        await logEvent(base44, coachEmail, 'RULE_TRIGGERED', {
          event: 'PHONE_NORMALIZED',
          fbLeadId,
          phoneRaw,
          phoneE164,
          valid: phoneValid
        });

        // ── Upsert: check for existing lead by fbLeadId or phone ────────────
        let existingLead = null;
        if (fbLeadId) {
          const byLeadId = await base44.asServiceRole.entities.Lead.filter({ coach_email: coachEmail, leadId: fbLeadId }).catch(() => []);
          if (byLeadId.length > 0) existingLead = byLeadId[0];
        }
        if (!existingLead && phoneRaw) {
          const byPhone = await base44.asServiceRole.entities.Lead.filter({ coach_email: coachEmail, phone: phoneRaw }).catch(() => []);
          if (byPhone.length > 0) existingLead = byPhone[0];
        }

        if (existingLead) {
          // Update existing lead
          await base44.asServiceRole.entities.Lead.update(existingLead.id, {
            firstName,
            lastName,
            email: email || existingLead.email,
            phoneRaw: phoneRaw || existingLead.phoneRaw,
            phoneE164: phoneE164 || existingLead.phoneE164,
            formName,
            adId,
            campaignId,
            fields_raw: answers,
            answers,
            form_id: formId,
            page_id: pageId,
            facebook_lead_id: fbLeadId
          });
          results.push({ leadId: existingLead.id, fbLeadId, firstName, phone: phoneRaw, action: 'updated' });
          continue;
        }

        // ── Create new lead ──────────────────────────────────────────────────
        const leadStatus = phoneValid ? 'NEW' : 'INVALID_PHONE';
        const errorReason = phoneValid ? undefined : `invalid phone: "${phoneRaw}"`;

        const lead = await base44.asServiceRole.entities.Lead.create({
          coach_email: coachEmail,
          firstName,
          lastName,
          phone: phoneRaw,
          phoneRaw,
          phoneE164: phoneE164 || undefined,
          email,
          source: 'facebook',
          status: leadStatus,
          formName,
          leadId: fbLeadId,
          adId,
          campaignId,
          errorReason,
          notes: `Facebook Lead – Form: ${formId}${adId ? ', Ad: ' + adId : ''}`,
          fields_raw: answers,
          answers,
          form_id: formId,
          page_id: pageId,
          facebook_lead_id: fbLeadId
        });

        await logEvent(base44, coachEmail, 'QUEUE_ADD', {
          event: 'LEAD_CREATED',
          leadId: lead.id,
          fbLeadId,
          firstName,
          phoneRaw,
          phoneE164,
          status: leadStatus
        });

        if (!phoneValid) {
          await logEvent(base44, coachEmail, 'SEND_FAIL', {
            event: 'INVALID_PHONE',
            leadId: lead.id,
            fbLeadId,
            phoneRaw,
            reason: errorReason
          });
          results.push({ leadId: lead.id, fbLeadId, firstName, phone: phoneRaw, action: 'created', status: 'INVALID_PHONE' });
          continue;
        }

        // ── Log LEAD_CREATED ────────────────────────────────────────────────
        await base44.asServiceRole.functions.invoke('logLeadActivity', {
          leadId: lead.id,
          coach_email: coachEmail,
          activityType: 'LEAD_CREATED',
          activitySource: 'SYSTEM',
          message: `ליד נוצר מפייסבוק – ${firstName}${phoneRaw ? ' (' + phoneRaw + ')' : ''}`,
          metadata: { fbLeadId, formId, source: 'facebook' }
        }).catch(() => {});

        // Flow initialization is handled exclusively by the onLeadCreated entity automation.
        // Calling startLeadAutomation here previously caused a duplicate first message:
        // the entity automation fires on Lead.create AND this explicit call both ran.
        // Removed — onLeadCreated handles all flow init with full idempotency guards.
        await logEvent(base44, coachEmail, 'QUEUE_ADD', {
          event: 'LEAD_READY_FOR_AUTOMATION',
          leadId: lead.id,
          reason: 'onLeadCreated_entity_automation_handles_flow_init'
        });

        results.push({ leadId: lead.id, fbLeadId, firstName, phone: phoneRaw, action: 'created', status: leadStatus });
      }
    }

    return Response.json({ ok: true, processed: results.length, results });
  }

  return new Response('Method Not Allowed', { status: 405 });
});