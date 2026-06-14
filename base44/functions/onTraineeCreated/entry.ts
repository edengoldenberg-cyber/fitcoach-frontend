import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Kill switch is now read from SystemConfig entity
async function isOutboundEnabled(base44) {
  try {
    const configs = await base44.asServiceRole.entities.SystemConfig.filter({ key: 'GLOBAL_WHATSAPP_ENABLED' });
    const record = configs && configs[0];
    return record ? record.value === true : false;
  } catch (_) { return false; }
}

function isValidE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone || '');
}

function normalizePhone(raw) {
  let phone = (raw || '').trim();
  if (!phone) return null;
  if (!phone.startsWith('+')) {
    if (phone.startsWith('0')) {
      phone = '+972' + phone.slice(1);
    } else {
      phone = '+' + phone;
    }
  }
  return isValidE164(phone) ? phone : null;
}

function renderTemplate(text, vars) {
  if (!text) return '';
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : '';
  });
}

Deno.serve(async (req) => {
  // ============================================================
  // KILL SWITCH — MUST BE FIRST — before ANY queue/send logic
  // ============================================================
  const _base44ks = createClientFromRequest(req);
  const GLOBAL_OUTBOUND_WHATSAPP_ENABLED = await isOutboundEnabled(_base44ks);
  if (GLOBAL_OUTBOUND_WHATSAPP_ENABLED !== true) {
    console.log('[KILL_SWITCH] onTraineeCreated BLOCKED — GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE — QUEUE_CREATION_BLOCKED_BY_KILL_SWITCH');
    return Response.json({
      ok: false,
      blocked: true,
      reason: 'GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE',
      message: 'onTraineeCreated is disabled by global kill switch. No message queued.'
    }, { status: 200 });
  }
  // ============================================================

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { event, data: trainee, entity_id } = body;

    if (event?.type !== 'create') {
      return Response.json({ ok: true, skipped: 'not a create event' });
    }

    // Auto-invite trainee to the app + auto-link user_id if already registered
    const traineeEmail = trainee?.user_email;
    if (traineeEmail) {
      try {
        await base44.asServiceRole.users.inviteUser(traineeEmail, 'user');
        console.log(`[onTraineeCreated] Invited user: ${traineeEmail}`);
      } catch (inviteErr) {
        // Non-fatal — user might already be invited
        console.log(`[onTraineeCreated] Invite skipped/failed for ${traineeEmail}: ${inviteErr.message}`);
      }

      // Auto-link user_id if this user already has a Base44 account
      try {
        const normalizedEmail = traineeEmail.toLowerCase().trim();
        const existingUsers = await base44.asServiceRole.entities.User.filter({ email: normalizedEmail });
        if (existingUsers.length > 0 && !trainee?.user_id) {
          await base44.asServiceRole.entities.Trainee.update(entity_id, {
            user_id: existingUsers[0].id,
            invite_status: 'joined',
          });
          console.log(`[onTraineeCreated] Auto-linked user_id: ${existingUsers[0].id} for ${normalizedEmail}`);
        }
      } catch (linkErr) {
        console.log(`[onTraineeCreated] Auto-link failed (non-fatal): ${linkErr.message}`);
      }
    }

    const coachEmail = trainee?.coach_email;
    if (!coachEmail) {
      return Response.json({ ok: false, error: 'No coach_email on trainee' });
    }

    await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
      coach_email: coachEmail,
      event: 'RULE_TRIGGERED',
      payload: { trigger: 'trainee_created', traineeId: entity_id, traineePhone: trainee?.phone, traineeName: trainee?.full_name }
    });

    const allRules = await base44.asServiceRole.entities.WhatsAppAutomationRule.filter({ coach_email: coachEmail });
    const rules = allRules.filter(r => r.trigger_type === 'trainee_created' && r.is_active);

    // ─── DIRECT INVITE FALLBACK ───
    // If no automation rules, send a direct AccessLink invite via WhatsApp
    if (rules.length === 0) {
      const phone = normalizePhone(trainee?.phone);
      if (phone) {
        // Generate or get invite token
        let inviteToken = trainee?.invite_token;
        if (!inviteToken) {
          inviteToken = `invite_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
          try {
            await base44.asServiceRole.entities.Trainee.update(entity_id, { invite_token: inviteToken });
          } catch (_) {}
        }
        const appUrl = (Deno.env.get('BASE44_APP_URL') || 'https://successful-fit-coach-pro.base44.app').replace(/\/+$/, '');
        const accessLink = `${appUrl}/AccessLink?token=${inviteToken}`;
        const firstName = (trainee?.full_name || '').split(' ')[0] || '';
        const directMessage = `היי ${firstName} 👋\nברוכים הבאים ל-FIT COACH PRO 🎉\n\nהנה הקישור האישי שלך לכניסה לאפליקציה:\n${accessLink}\n\nאחרי הכניסה הראשונית אפשר לשמור את האפליקציה במסך הבית ולהתחבר דרך Google.`;

        const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail });
        const providerType = configs[0]?.provider_type || 'mock';

        await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
          coach_email: coachEmail,
          to_phone_e164: phone,
          to_name: trainee?.full_name || phone,
          context_type: 'trainee',
          context_id: entity_id || '',
          template_key: 'access_link_invite',
          rendered_text: directMessage,
          provider_type: providerType,
          status: 'queued',
          attempts: 0,
          scheduled_for: new Date().toISOString()
        });

        console.log(`[onTraineeCreated] Direct AccessLink invite queued for ${phone} (no automation rules)`);
        try { await base44.asServiceRole.functions.invoke('whatsAppQueueWorker', {}); } catch (_) {}
        return Response.json({ ok: true, direct_invite_sent: true, phone, accessLink });
      }

      await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
        coach_email: coachEmail,
        event: 'RULE_TRIGGERED',
        payload: { trigger: 'trainee_created', traineeId: entity_id, skipped: 'no active trainee_created rules, no phone' }
      });
      return Response.json({ ok: true, skipped: 'no active trainee_created rules' });
    }

    const phone = normalizePhone(trainee?.phone);
    if (!phone) {
      await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
        coach_email: coachEmail,
        event: 'SEND_FAIL',
        payload: { trigger: 'trainee_created', traineeId: entity_id, error: `Invalid phone: ${trainee?.phone}` }
      });
      return Response.json({ ok: false, error: `Invalid phone: ${trainee?.phone}` });
    }

    const firstName = (trainee?.full_name || '').split(' ')[0] || trainee?.full_name || '';
    const results = [];

    for (const rule of rules) {
      const templateKey = rule.template_key;
      if (!templateKey) continue;

      const templates = await base44.asServiceRole.entities.WhatsAppTemplate.filter({ coach_email: coachEmail, key: templateKey });
      const tmpl = templates[0] || (await base44.asServiceRole.entities.WhatsAppTemplate.filter({ coach_email: 'system_default', key: templateKey }))[0];

      if (!tmpl) {
        await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
          coach_email: coachEmail,
          event: 'SEND_FAIL',
          payload: { trigger: 'trainee_created', traineeId: entity_id, error: `Template not found: ${templateKey}` }
        });
        continue;
      }

      // ─── Token Validation & Generation ───
      let inviteToken = trainee?.invite_token;
      
      // If no token exists, generate a new one
      if (!inviteToken) {
        inviteToken = `invite_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        try {
          await base44.asServiceRole.entities.Trainee.update(entity_id, { invite_token: inviteToken });
          console.log(`[onTraineeCreated] Generated new token for trainee: ${inviteToken}`);
        } catch (tokenErr) {
          console.error(`[onTraineeCreated] Failed to save token: ${tokenErr.message}`);
          // Continue with generated token anyway
        }
      }

      let appUrl = (Deno.env.get('BASE44_APP_URL') || 'https://successful-fit-coach-pro.base44.app').replace(/\/+$/, '');
      
      // SAFETY: Always use token-based AccessLink, NEVER fallback to /Login
      if (!inviteToken) {
        await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
          coach_email: coachEmail,
          event: 'SEND_FAIL',
          payload: { trigger: 'trainee_created', traineeId: entity_id, error: 'No valid token generated for AccessLink' }
        });
        return Response.json({ ok: false, error: 'Failed to generate invite token for trainee' });
      }

      const appLink = `${appUrl}/AccessLink?token=${inviteToken}`;

      const vars = {
        firstName,
        fullName: trainee?.full_name || '',
        phone,
        coachName: coachEmail.split('@')[0],
        todayDate: new Date().toLocaleDateString('he-IL'),
        appLink,
        inviteToken,
      };
      const renderedText = renderTemplate(tmpl.message_text, vars);

      const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail });
      const config = configs[0];
      const providerType = config?.provider_type || 'mock';

      const queueRecord = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
        coach_email: coachEmail,
        to_phone_e164: phone,
        to_name: trainee?.full_name || phone,
        context_type: 'trainee',
        context_id: entity_id || '',
        template_key: templateKey,
        rendered_text: renderedText,
        provider_type: providerType,
        status: 'queued',
        attempts: 0,
        scheduled_for: new Date().toISOString()
      });

      await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
        coach_email: coachEmail,
        event: 'QUEUE_ADD',
        payload: {
          trigger: 'trainee_created',
          traineeId: entity_id,
          ruleId: rule.id,
          ruleName: rule.name,
          templateKey,
          toPhone: phone,
          toName: trainee?.full_name,
          queueId: queueRecord.id
        }
      });

      await base44.asServiceRole.entities.WhatsAppAutomationRule.update(rule.id, {
        last_triggered_at: new Date().toISOString(),
        trigger_count: (rule.trigger_count || 0) + 1
      });

      results.push({ ruleId: rule.id, queueId: queueRecord.id, templateKey, phone });
    }

    // Trigger worker immediately
    try {
      await base44.asServiceRole.functions.invoke('whatsAppQueueWorker', {});
    } catch (_) { /* non-fatal, worker runs on schedule too */ }

    return Response.json({ ok: true, queued: results.length, results });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});