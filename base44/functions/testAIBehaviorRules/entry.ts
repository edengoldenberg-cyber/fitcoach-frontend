import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const BEHAVIOR_KEYS = [
  'behaviorRules_hardRules',
  'behaviorRules_responseStructure',
  'behaviorRules_salesStrategy',
  'behaviorRules_phoneStrategy',
  'behaviorRules_pricingRules',
  'behaviorRules_toneGuardrails',
  'behaviorRules_contextRules',
  'behaviorRules_channelRules',
];

function buildBehaviorRulesBlock(config) {
  const r = config || {};
  const parts = [
    r.behaviorRules_hardRules         && `HARD RULES:\n${r.behaviorRules_hardRules}`,
    r.behaviorRules_responseStructure  && `RESPONSE STRUCTURE:\n${r.behaviorRules_responseStructure}`,
    r.behaviorRules_salesStrategy      && `SALES STRATEGY:\n${r.behaviorRules_salesStrategy}`,
    r.behaviorRules_phoneStrategy      && `PHONE STRATEGY:\n${r.behaviorRules_phoneStrategy}`,
    r.behaviorRules_pricingRules       && `PRICING RULES:\n${r.behaviorRules_pricingRules}`,
    r.behaviorRules_toneGuardrails     && `TONE GUARDRAILS:\n${r.behaviorRules_toneGuardrails}`,
    r.behaviorRules_contextRules       && `CONTEXT RULES:\n${r.behaviorRules_contextRules}`,
    r.behaviorRules_channelRules       && `CHANNEL RULES:\n${r.behaviorRules_channelRules}`,
  ].filter(Boolean);
  if (!parts.length) return '';
  return `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🛡️ AI BEHAVIOR RULES (GLOBAL — MANDATORY)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${parts.join('\n\n')}`;
}

const TEST_CASES = [
  {
    id: 'repeat_prevention',
    label: 'CASE 1 — Repeat Prevention',
    history: 'AI previously asked: "כמה פעמים בשבוע את/ה יכול/ה להתאמן?"',
    message: 'אני לא יודע, תלוי',
    expectation: 'AI must NOT ask the same question again about training frequency',
    checks: {
      repeated_question: { detect: (r) => /כמה פעמים/i.test(r), failIf: true, label: 'repeated_question_detected' },
      moved_forward:     { detect: (r) => r.length > 20, failIf: false, label: 'moved_conversation_forward' },
      one_question:      { detect: (r) => (r.match(/\?/g) || []).length <= 1, failIf: false, label: 'one_question_only' },
    }
  },
  {
    id: 'early_pricing_guard',
    label: 'CASE 2 — Early Pricing Guard',
    history: '',
    message: 'כמה עולה?',
    expectation: 'AI should not dump full pricing list if pricingRules say not to reveal before stage 3',
    checks: {
      full_pricing_dump: {
        detect: (r) => {
          const priceCount = (r.match(/₪/g) || []).length + (r.match(/שקל/g) || []).length;
          return priceCount >= 3;
        },
        failIf: true,
        label: 'too_early_full_pricing'
      },
      one_question: { detect: (r) => (r.match(/\?/g) || []).length <= 1, failIf: false, label: 'one_question_only' },
    }
  },
  {
    id: 'whatsapp_preference',
    label: 'CASE 3 — WhatsApp Preference',
    history: '',
    message: 'אני לא רוצה שיחת טלפון, רק בוואטסאפ',
    expectation: 'AI must NOT push phone call, must stay in WhatsApp mode',
    checks: {
      pushed_phone: {
        detect: (r) => /נדבר בטלפון|שיחה קצרה|להתקשר|לדבר בטלפון/i.test(r),
        failIf: true,
        label: 'pushed_phone_call'
      },
      respected_wa: {
        detect: (r) => !/נדבר בטלפון|שיחה קצרה|להתקשר/i.test(r),
        failIf: false,
        label: 'respected_whatsapp_preference'
      },
    }
  },
  {
    id: 'sales_direction',
    label: 'CASE 4 — Sales Direction',
    history: '',
    message: 'אני רוצה לרדת במשקל',
    expectation: 'AI responds briefly, moves forward, asks exactly one useful next question',
    checks: {
      too_long:      { detect: (r) => r.length < 400, failIf: false, label: 'response_not_too_long' },
      one_question:  { detect: (r) => (r.match(/\?/g) || []).length === 1, failIf: false, label: 'one_question_only' },
      moved_forward: { detect: (r) => r.length > 30, failIf: false, label: 'moved_conversation_forward' },
    }
  },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, configId } = body;

    // ── ACTION: testSave ────────────────────────────────────────────────────────
    if (action === 'testSave') {
      const { payload } = body;
      if (!configId) return Response.json({ ok: false, error: 'No configId — save the AI Brain first' });

      // Write to DB
      const writeResult = await base44.entities.AIBrainConfig.update(configId, payload);

      // Re-fetch
      const reloaded = await base44.entities.AIBrainConfig.filter({ id: configId });
      const dbRecord = reloaded[0] || null;

      const comparison = {};
      let allMatch = true;
      for (const k of BEHAVIOR_KEYS) {
        const formVal = (payload[k] || '').trim();
        const dbVal   = (dbRecord?.[k] || '').trim();
        const match   = formVal === dbVal;
        if (!match) allMatch = false;
        comparison[k] = {
          payloadLength: formVal.length,
          dbLength:      dbVal.length,
          match,
          payloadFirst50: formVal.slice(0, 50),
          dbFirst50:      dbVal.slice(0, 50),
        };
      }

      return Response.json({
        ok: true,
        action: 'testSave',
        writeResultId: writeResult?.id,
        dbRecordId:    dbRecord?.id,
        comparison,
        allMatch,
        verdict: allMatch ? 'PASS' : 'FAIL',
      });
    }

    // ── ACTION: internalAITest ──────────────────────────────────────────────────
    if (action === 'internalAITest') {
      if (!configId) return Response.json({ ok: false, error: 'No configId — save the AI Brain first' });

      // Load config from DB
      const configs = await base44.entities.AIBrainConfig.filter({ id: configId });
      const config  = configs[0];
      if (!config) return Response.json({ ok: false, error: 'Config not found in DB' });

      // Build behavior rules block
      const behaviorBlock = buildBehaviorRulesBlock(config);
      const dbValues = Object.fromEntries(BEHAVIOR_KEYS.map(k => [k, config[k] || '']));
      const nonEmptyCount = BEHAVIOR_KEYS.filter(k => config[k] && String(config[k]).trim()).length;

      const baseSystemPrompt = `You are a fitness studio sales agent named ${config.agentName || 'עדן'}.
Business: ${config.businessName || 'Shape Studio'}
${behaviorBlock}
You respond ONLY in Hebrew. Keep replies SHORT (1-2 lines). Always end with exactly one question.`;

      const promptStats = {
        totalChars: baseSystemPrompt.length,
        behaviorBlockChars: behaviorBlock.length,
        behaviorBlockInjected: behaviorBlock.length > 0,
        nonEmptyBehaviorFields: nonEmptyCount,
      };

      // Run all 4 test cases
      const caseResults = [];

      for (const tc of TEST_CASES) {
        const fullPrompt = `${baseSystemPrompt}

${tc.history ? `Previous conversation:\n${tc.history}\n` : ''}
Lead message: "${tc.message}"

Respond as the agent. Reply in Hebrew. Short, natural, WhatsApp style.`;

        let aiReply = '';
        let aiError = null;
        try {
          const aiResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: fullPrompt,
            response_json_schema: {
              type: 'object',
              properties: { reply: { type: 'string' } },
              required: ['reply']
            }
          });
          aiReply = aiResult?.reply || '';
        } catch (err) {
          aiError = err.message;
        }

        // Evaluate checks
        const checkResults = {};
        let casePassed = true;
        for (const [checkKey, check] of Object.entries(tc.checks)) {
          const detected = check.detect(aiReply);
          const passed   = check.failIf ? !detected : detected;
          if (!passed) casePassed = false;
          checkResults[check.label] = { detected, passed };
        }

        caseResults.push({
          id:           tc.id,
          label:        tc.label,
          message:      tc.message,
          expectation:  tc.expectation,
          aiReply,
          aiError,
          checks:       checkResults,
          verdict:      aiError ? 'ERROR' : (casePassed ? 'PASS' : 'FAIL'),
        });
      }

      const overallPass = caseResults.every(r => r.verdict === 'PASS');

      return Response.json({
        ok: true,
        action: 'internalAITest',
        testedAt: new Date().toISOString(),
        dbValues,
        promptStats,
        behaviorBlockPreview: behaviorBlock.slice(0, 500),
        caseResults,
        verdict: overallPass ? 'PASS' : (caseResults.some(r => r.verdict === 'PASS') ? 'PARTIAL' : 'FAIL'),
      });
    }

    return Response.json({ ok: false, error: 'Unknown action' });

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});