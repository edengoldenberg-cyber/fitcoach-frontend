/**
 * NUDGE SCHEDULER — SAFE ADDITION ONLY
 * 
 * This function sends follow-up messages to leads who stopped responding.
 * 
 * CRITICAL SAFETY RULES:
 * - Does NOT modify routing logic
 * - Does NOT touch AI / Flow / Script decision logic
 * - Does NOT override activeResponderOwner
 * - Does NOT send directly — only enqueues via WhatsAppMessageQueue
 * - Skips if ANY active system (Flow, Script, AI queue) is controlling the lead
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Kill switch is now read from SystemConfig entity
async function isOutboundEnabled(base44) {
  try {
    const configs = await base44.asServiceRole.entities.SystemConfig.filter({ key: 'GLOBAL_WHATSAPP_ENABLED' });
    const record = configs && configs[0];
    return record ? record.value === true : false;
  } catch (_) { return false; }
}

const NUDGE_STEPS = [
  {
    step: 1,
    delayHours: 6,
    text: `היי {{name}} 😊\nרק רציתי לוודא שלא פספסתי אותך\nעדיין רלוונטי לך להתחיל להתאמן?`,
  },
  {
    step: 2,
    delayHours: 24,
    text: `חשבתי עליך רגע 🤔\nאם אתה כבר רוצה להתחיל — חבל למשוך את זה\nרוצה שאכוון אותך למה שמתאים לך?`,
  },
  {
    step: 3,
    delayHours: 48,
    text: `שומע {{name}} 💪\nנשארו מקומות מוגבלים השבוע\nרוצה שאשמור לך מקום לניסיון?`,
  },
  {
    step: 4,
    delayHours: 72,
    text: `סוגר לך את זה רגע 🫡\nאם זה פחות מתאים עכשיו הכל טוב\nאם כן — אני פה לעזור לך להתחיל כמו שצריך\nמה אומר?`,
  },
];

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function renderText(template, lead) {
  const name = lead.firstName || 'חבר';
  return template.replace(/{{name}}/g, name);
}

function transformWaOnlyMessage(text) {
  if (!text) return text;
  const replacements = [
    [/תתקשרי אלינו/g, 'תכתבי לי פה'],
    [/תתקשרי אליי/g,  'תכתבי לי פה'],
    [/תתקשר אלינו/g,  'תכתוב לי פה'],
    [/תתקשר אליי/g,   'תכתוב לי פה'],
    [/2[-–]?3?\s*דקות\s*שיחה/g, 'כמה הודעות כאן'],
    [/שיחה\s*קצרה/g,            'כמה הודעות'],
    [/לדבר\s*בטלפון/g,          'להתקדם בוואטסאפ'],
    [/אפשר\s*לדבר[?]?/g,       'אפשר להתקדם פה'],
    [/נדבר\s*\d?\s*דקות/g,     'נתכתב בכמה הודעות'],
    [/נתקשר/g,                  'נתכתב'],
    [/תתקשר/g,                  'תכתוב לי'],
    [/נדבר(?![ויאה])/g,         'נתכתב'],
    [/בשיחה/g,                  'בוואטסאפ'],
    [/שיחה/g,                   'שיחה בוואטסאפ'],
  ];
  let result = text;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

Deno.serve(async (req) => {
  // Read kill switch from DB
  const _base44ks = createClientFromRequest(req);
  const GLOBAL_OUTBOUND_WHATSAPP_ENABLED = await isOutboundEnabled(_base44ks);

  // KILL SWITCH — first check, no exceptions
  if (!GLOBAL_OUTBOUND_WHATSAPP_ENABLED) {
    console.log('[KILL_SWITCH] nudgeScheduler BLOCKED — GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE');
    return Response.json({
      ok: false, blocked: true,
      reason: 'GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE',
      message: 'nudgeScheduler is disabled by global kill switch. No nudges sent.'
    }, { status: 200 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    console.log(`[nudgeScheduler] Starting run at ${now.toISOString()}`);

    const allNudgeStates = await base44.asServiceRole.entities.LeadNudgeState.filter({ stopped: false });

    let processed = 0, skipped = 0, sent = 0;

    for (const state of allNudgeStates) {
      processed++;

      let lead;
      try {
        const leads = await base44.asServiceRole.entities.Lead.filter({ id: state.leadId });
        lead = leads[0];
      } catch (_) { continue; }
      if (!lead) continue;

      if (lead.waOptOut) {
        await base44.asServiceRole.entities.LeadNudgeState.update(state.id, { stopped: true, stopReason: 'OPT_OUT' });
        skipped++; continue;
      }

      if (lead.activeResponderOwner === 'MANUAL') {
        skipped++; continue;
      }

      if (state.nudgeBaseline && lead.lastInboundAt) {
        const baseline = new Date(state.nudgeBaseline);
        const lastIn = new Date(lead.lastInboundAt);
        if (lastIn > baseline) {
          await base44.asServiceRole.entities.LeadNudgeState.update(state.id, { stopped: true, stopReason: 'REPLY_RECEIVED' });
          skipped++; continue;
        }
      }

      const flowStates = await base44.asServiceRole.entities.LeadConversationState.filter({ leadId: state.leadId, isActive: true });
      const hasActiveFlowWaiting = flowStates.some(fs => fs.waitingForReply && fs.flowStatus === 'ACTIVE');
      if (hasActiveFlowWaiting) {
        skipped++; continue;
      }

      const queueItems = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ context_id: lead.id });
      const hasActivePending = queueItems.some(q => ['queued', 'sending', 'pending'].includes(q.status));
      if (hasActivePending) {
        skipped++; continue;
      }

      if (lead.activeResponderOwner === 'SCRIPT' || (lead.activeScriptId && lead.scriptSessionId)) {
        skipped++; continue;
      }

      const lastStep = state.lastNudgeStep || 0;
      if (lastStep >= 4) {
        await base44.asServiceRole.entities.LeadNudgeState.update(state.id, { stopped: true, stopReason: 'ALL_STEPS_DONE' });
        skipped++; continue;
      }

      const nextStepDef = NUDGE_STEPS[lastStep];
      if (!nextStepDef) { skipped++; continue; }

      let baseline = state.nudgeBaseline ? new Date(state.nudgeBaseline)
        : (lead.lastMessageAt ? new Date(lead.lastMessageAt) : null);
      if (!baseline) {
        const primeTs = lead.created_date ? new Date(lead.created_date) : new Date();
        await base44.asServiceRole.entities.LeadNudgeState.update(state.id, {
          nudgeBaseline: primeTs.toISOString()
        }).catch(() => {});
        baseline = primeTs;
      }

      const requiredTime = new Date(baseline.getTime() + nextStepDef.delayHours * 60 * 60 * 1000);
      if (now < requiredTime) {
        skipped++; continue;
      }

      const phoneE164 = lead.phoneE164 || lead.phone;
      if (!phoneE164) { skipped++; continue; }

      const rawText = renderText(nextStepDef.text, lead);
      const messageText = lead.waOnly ? transformWaOnlyMessage(rawText) : rawText;

      const providerConfigs = await base44.asServiceRole.entities.WhatsAppProviderConfig
        .filter({ coach_email: lead.coach_email }).catch(() => []);
      const nudgeProviderType = providerConfigs[0]?.provider_type || 'mock';

      await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
        coach_email: lead.coach_email,
        to_phone_e164: phoneE164,
        to_name: lead.firstName || '',
        context_type: 'lead',
        context_id: lead.id,
        template_key: `nudge_step_${nextStepDef.step}`,
        rendered_text: messageText,
        provider_type: nudgeProviderType,
        status: 'queued',
        attempts: 0,
        session_id: `nudge_${state.id}_step${nextStepDef.step}`,
      });

      await base44.asServiceRole.entities.LeadNudgeState.update(state.id, {
        lastNudgeStep: nextStepDef.step,
        lastNudgeAt: now.toISOString(),
      });

      sent++;
      console.log(`[nudgeScheduler] Queued nudge step ${nextStepDef.step} to lead ${lead.id} (${lead.firstName})`);
    }

    console.log(`[nudgeScheduler] Done. processed=${processed} sent=${sent} skipped=${skipped}`);
    return Response.json({ ok: true, processed, sent, skipped });

  } catch (error) {
    console.error('[nudgeScheduler] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});