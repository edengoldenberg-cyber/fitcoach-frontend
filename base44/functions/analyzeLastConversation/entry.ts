import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ── Detectors (read-only, no side effects) ────────────────────────────────────

function detectObjectionType(text) {
  const lower = (text || '').toLowerCase();
  if (['כמה עולה', 'מחיר', 'כמה זה עולה', 'מה המחיר', 'עלות'].some(t => lower.includes(t))) return 'price_question';
  if (['אין לי זמן', 'אין זמן', 'אני עמוס', 'עסוק'].some(t => lower.includes(t))) return 'time_objection';
  if (['אני רק בודק', 'סתם מתעניין', 'רק בודק'].some(t => lower.includes(t))) return 'just_checking';
  if (['צריך לחשוב', 'לא בטוח', 'לא בטוחה', 'אחשוב'].some(t => lower.includes(t))) return 'thinking_about_it';
  if (['יקר', 'לא מעוניין', 'לא מעוניינת', 'רחוק'].some(t => lower.includes(t))) return 'general_resistance';
  return null;
}

function detectIntent(text) {
  const lower = (text || '').toLowerCase();
  if (['שלום', 'היי', 'הי', 'בוקר טוב', 'ערב טוב'].some(t => lower.includes(t))) return 'greeting';
  if (['כמה עולה', 'מחיר', 'עלות', 'כמה זה'].some(t => lower.includes(t))) return 'price_inquiry';
  if (['לרדת במשקל', 'להרזות', 'לחזור לכושר', 'להתחזק', 'כושר'].some(t => lower.includes(t))) return 'fitness_goal';
  if (['מעוניין', 'מעוניינת', 'רוצה לנסות', 'רוצה להצטרף'].some(t => lower.includes(t))) return 'interest_expressed';
  if (['תודה', 'אוקיי', 'בסדר', 'מעולה'].some(t => lower.includes(t))) return 'acknowledgment';
  if (['שיחה', 'לא רוצה שיחה', 'מעדיף פה', 'שלח לי פה'].some(t => lower.includes(t))) return 'channel_preference';
  return 'general_message';
}

// Default WA trigger list (fallback when no brain config loaded)
const DEFAULT_WA_TRIGGERS = [
  'מעדיף פה', 'שלח לי כאן', 'לא רוצה שיחה', 'אני בעבודה',
  'בלי שיחה', 'עדיף בכתב', 'רק הודעות', 'אין לי זמן לשיחה', 'לא יכול לדבר'
];

function buildTriggersEvaluated(text, triggerList) {
  const lower = (text || '').toLowerCase();
  return triggerList.map(trigger => {
    const matched = lower.includes(trigger.toLowerCase());
    return {
      triggerName: trigger,
      evaluated: true,
      result: matched,
      reason: matched
        ? `✅ מילת מפתח "${trigger}" נמצאה בהודעה`
        : `❌ מילת מפתח "${trigger}" לא נמצאה`,
    };
  });
}

function containsCTA(text) {
  return ['רוצה', 'נתאם', 'נדבר', 'שיחה', 'ניסיון', 'תאם', 'בא', 'לתאם'].some(t => (text || '').includes(t));
}

function detectCallPush(text) {
  return ['נדבר', 'שיחה', 'להתקשר', 'לדבר', 'תתקשר', '2 דקות', 'שתי דקות'].some(t => (text || '').toLowerCase().includes(t));
}

// Word-overlap similarity score (0–100)
function similarityScore(a, b) {
  const wa = new Set((a || '').trim().toLowerCase().split(/\s+/).filter(Boolean));
  const wb = new Set((b || '').trim().toLowerCase().split(/\s+/).filter(Boolean));
  if (!wa.size || !wb.size) return 0;
  const intersection = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union > 0 ? Math.round((intersection / union) * 100) : 0;
}

// Build an estimated messageTrace for AI outbound messages when no real debug log exists
function buildEstimatedTrace(inboundMsg, outboundMsg, previousAiMsgs, triggerList) {
  const inboundText = inboundMsg?.text || '';
  const outboundText = outboundMsg?.text || '';

  const triggersEvaluated = buildTriggersEvaluated(inboundText, triggerList);
  const triggersFired = triggersEvaluated.filter(t => t.result).map(t => t.triggerName);

  const channelPrefKeywords = ['מעדיף פה', 'שלח לי כאן', 'לא רוצה שיחה', 'עדיף בכתב', 'רק הודעות', 'בלי שיחה'];
  const channelPreference = channelPrefKeywords.some(k => inboundText.toLowerCase().includes(k));

  const previousMode = 'NORMAL'; // no real state → assume NORMAL
  const newMode = (triggersFired.length > 0 || channelPreference) ? 'WHATSAPP_SALES' : 'NORMAL';
  const modeChanged = newMode !== previousMode;

  // Duplicate check vs last 3 AI messages
  let dupCheck = { identicalText: false, similarityScore: 0, duplicateDetected: false, matchedWith: null };
  for (const prev of (previousAiMsgs || [])) {
    if (prev.text === outboundText && outboundText) {
      dupCheck = { identicalText: true, similarityScore: 100, duplicateDetected: true, matchedWith: prev.msgId };
      break;
    }
    const score = similarityScore(outboundText, prev.text);
    if (score > dupCheck.similarityScore) {
      dupCheck.similarityScore = score;
      if (score >= 65) {
        dupCheck.duplicateDetected = true;
        dupCheck.matchedWith = prev.msgId;
      }
    }
  }

  const lines = outboundText.split('\n').filter(l => l.trim()).length;

  return {
    _estimated: true,
    _estimatedReason: 'אין debug log שמור — ניתוח משוער מהטקסט בלבד',
    input: {
      inboundMessageText: inboundText || 'unknown',
      messageId: inboundMsg?.msgId || 'unknown',
      timestamp: inboundMsg?.timestamp || 'unknown',
    },
    stateBefore: {
      conversationStage: 'unknown (estimated)',
      intent: detectIntent(inboundText) || 'unknown',
      objectionDetected: detectObjectionType(inboundText),
      channelPreference,
      mode: 'unknown (estimated)',
      skeptical: 'unknown',
    },
    triggersEvaluated,
    triggersFired,
    modeTransition: {
      previousMode: 'unknown (estimated)',
      newMode: triggersFired.length > 0 ? 'WHATSAPP_SALES (estimated)' : 'NORMAL (estimated)',
      didChange: modeChanged,
      reason: triggersFired.length > 0
        ? `טריגרים שהופעלו: ${triggersFired.join(', ')} (משוער)`
        : channelPreference
          ? 'channel_preference זוהה אך ייתכן שהמערכת לא ביצעה מעבר (בדוק debug log אמיתי)'
          : 'לא זוהו טריגרים — מצב NORMAL נשמר (משוער)',
    },
    decision: {
      selectedFlow: 'aiConversationAgent (estimated)',
      reason: 'standard_ai_response (estimated)',
    },
    response: {
      finalText: outboundText,
      blocksCount: lines,
      ctaIncluded: containsCTA(outboundText),
      callPushIncluded: detectCallPush(outboundText),
      questionIncluded: outboundText.includes('?') || outboundText.includes('?'),
    },
    output: { finalText: outboundText },
    delivery: {
      queueId: 'unknown (estimated)',
      attempts: 'unknown',
      sent: 'unknown',
      providerMessageId: 'unknown',
    },
    duplicateCheck: dupCheck,
    stateAfter: {
      conversationStage: 'unknown (estimated)',
      intent: detectIntent(inboundText) || 'unknown',
      mode: modeChanged ? 'WHATSAPP_SALES (estimated)' : 'NORMAL (estimated)',
    },
  };
}

// Detect duplicate AI replies across the conversation
function detectDuplicateReplies(aiMessages) {
  const duplicates = [];
  for (let i = 0; i < aiMessages.length; i++) {
    for (let j = i + 1; j < aiMessages.length; j++) {
      const score = similarityScore(aiMessages[i].text, aiMessages[j].text);
      if (score > 65) {
        duplicates.push({ i, j, similarity: score });
      }
    }
  }
  return duplicates;
}

function detectIgnoredObjections(analyzed) {
  const ignored = [];
  for (let i = 0; i < analyzed.length - 1; i++) {
    const msg = analyzed[i];
    const next = analyzed[i + 1];
    if (msg.direction === 'INBOUND' && msg.analysis?.objectionDetected && next?.direction === 'OUTBOUND') {
      const objKeywords = {
        price_question: ['מחיר', 'עולה', 'עלות'],
        time_objection: ['זמן', 'עמוס', 'מתי'],
        general_resistance: ['ניסיון', 'בלי התחייבות'],
      };
      const keywords = objKeywords[msg.analysis.objectionDetected] || [];
      const aiAddressed = keywords.some(k => (next.text || '').includes(k));
      if (!aiAddressed) {
        ignored.push({ objection: msg.analysis.objectionDetected, aiReply: next.text?.slice(0, 60) });
      }
    }
  }
  return ignored;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { leadId, limit = 20 } = body;
    if (!leadId) return Response.json({ error: 'missing leadId' }, { status: 400 });

    const fetchLimit = limit === 0 ? 500 : Math.min(limit, 500);

    // Fetch messages + debug logs in parallel
    const [messages, debugLogs] = await Promise.all([
      base44.asServiceRole.entities.LeadMessageThread.filter({ leadId }, '-messageTimestamp', fetchLimit).catch(() => []),
      base44.asServiceRole.entities.AIDebugLog.filter({ leadId }, '-created_date', fetchLimit).catch(() => []),
    ]);

    const sorted = [...messages].sort(
      (a, b) => new Date(a.messageTimestamp || a.created_date) - new Date(b.messageTimestamp || b.created_date)
    );

    // Build lookup: inboundMessageId → debug log
    const debugByInboundId = {};
    for (const log of debugLogs) {
      if (log.inboundMessageId) debugByInboundId[log.inboundMessageId] = log;
    }

    // Load brain config to get real trigger list for this coach
    let triggerList = DEFAULT_WA_TRIGGERS;
    try {
      const coachEmails = [...new Set(sorted.map(m => m.coach_email).filter(Boolean))];
      if (coachEmails.length > 0) {
        const brains = await base44.asServiceRole.entities.AIBrainConfig.filter({ coach_email: coachEmails[0], isActive: true }, '-created_date', 1).catch(() => []);
        if (brains[0]?.whatsappSaleTriggers) {
          const fromConfig = brains[0].whatsappSaleTriggers.split(/[\n,]/).map(t => t.trim()).filter(Boolean);
          if (fromConfig.length > 0) triggerList = fromConfig;
        }
      }
    } catch (_) {}

    // Build per-message analyzed array
    // We need sequential index to find preceding inbound for estimated traces
    const analyzed = [];
    for (let idx = 0; idx < sorted.length; idx++) {
      const msg = sorted[idx];
      const isInbound = msg.direction === 'INBOUND';
      const isAI = msg.direction === 'OUTBOUND' && msg.senderType === 'SYSTEM';

      if (isInbound) {
        const text = msg.messageText || '';
        const triggersEvaluated = buildTriggersEvaluated(text, triggerList);
        const triggersFired = triggersEvaluated.filter(t => t.result).map(t => t.triggerName);
        analyzed.push({
          msgId: msg.id,
          direction: 'INBOUND',
          text,
          timestamp: msg.messageTimestamp || msg.created_date,
          replyStatus: msg.replyStatus,
          replyProducer: msg.replyProducer,
          analysis: {
            intent: detectIntent(text),
            objectionDetected: detectObjectionType(text),
            // Full per-trigger breakdown for inbound
            triggersEvaluated,
            triggersFired,
            triggersRejected: triggersEvaluated.filter(t => !t.result).map(t => t.triggerName),
            waSalesModeTriggered: triggersFired.length > 0,
            conversationStage: msg.replyStatus || 'unknown',
          },
          // No savedDebug on inbound — debug log is keyed by inbound message ID
          savedDebug: null,
        });
        continue;
      }

      if (isAI) {
        const text = msg.messageText || '';
        const lines = text.split('\n').filter(l => l.trim()).length;

        // Find the preceding inbound message to associate debug log
        let precedingInbound = null;
        for (let k = idx - 1; k >= 0; k--) {
          if (sorted[k].direction === 'INBOUND') { precedingInbound = sorted[k]; break; }
        }

        // Look up real debug log via preceding inbound ID
        const realDebug = precedingInbound ? debugByInboundId[precedingInbound.id] : null;
        const realTrace = realDebug?.debugData?.messageTrace || null;

        // Previous AI messages for duplicate check
        const prevAiMsgs = analyzed.filter(m => m.direction === 'OUTBOUND' && m.senderType === 'AI').slice(-3);

        // If no real trace → build estimated trace
        const precedingInboundAnalyzed = precedingInbound
          ? analyzed.find(m => m.msgId === precedingInbound.id)
          : null;

        const trace = realTrace || buildEstimatedTrace(
          precedingInboundAnalyzed || { text: precedingInbound?.messageText || '', msgId: precedingInbound?.id, timestamp: precedingInbound?.messageTimestamp },
          { text, msgId: msg.id },
          prevAiMsgs,
          triggerList
        );

        analyzed.push({
          msgId: msg.id,
          direction: 'OUTBOUND',
          senderType: 'AI',
          text,
          timestamp: msg.messageTimestamp || msg.created_date,
          analysis: {
            blocksCount: lines,
            containsCTA: containsCTA(text),
            callPush: detectCallPush(text),
            selectedFlow: 'aiConversationAgent',
            reason: 'AI Brain auto-response',
          },
          // Attach trace (real or estimated) to AI message
          messageTrace: trace,
          hasRealTrace: !!realTrace,
          savedDebug: realDebug?.debugData || null,
        });
        continue;
      }

      analyzed.push({
        msgId: msg.id,
        direction: msg.direction,
        senderType: msg.senderType,
        text: msg.messageText || '',
        timestamp: msg.messageTimestamp || msg.created_date,
      });
    }

    // ── Summary computation ───────────────────────────────────────────────────
    const inboundMsgs = analyzed.filter(m => m.direction === 'INBOUND');
    const aiMsgs = analyzed.filter(m => m.direction === 'OUTBOUND' && m.senderType === 'AI');
    const allObjections = inboundMsgs.map(m => m.analysis?.objectionDetected).filter(Boolean);
    const allIntents = inboundMsgs.map(m => m.analysis?.intent).filter(Boolean);

    // Trigger counts from per-message analysis
    const triggerFreq = {};
    let totalTriggersEvaluated = 0;
    let totalTriggersFired = 0;
    inboundMsgs.forEach(m => {
      totalTriggersEvaluated += (m.analysis?.triggersEvaluated || []).length;
      (m.analysis?.triggersFired || []).forEach(t => {
        triggerFreq[t] = (triggerFreq[t] || 0) + 1;
        totalTriggersFired++;
      });
    });
    const topTriggers = Object.entries(triggerFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([trigger, count]) => ({ trigger, count }));

    const objFreq = {};
    allObjections.forEach(o => { objFreq[o] = (objFreq[o] || 0) + 1; });

    const ctaCount = aiMsgs.filter(m => m.analysis?.containsCTA).length;
    const callPushCount = aiMsgs.filter(m => m.analysis?.callPush).length;

    const waSalesModeCount = inboundMsgs.filter(m => m.analysis?.waSalesModeTriggered).length;

    // Mode transitions from traces
    const modeTransitionsCount = aiMsgs.filter(m => m.messageTrace?.modeTransition?.didChange).length;

    // Duplicate detection
    const duplicateReplies = detectDuplicateReplies(aiMsgs);
    const runtimeDuplicates = aiMsgs.filter(m => m.messageTrace?.duplicateCheck?.duplicateDetected).length;

    // Mismatch: traces say duplicate but summary calc says 0 or vice versa
    const duplicateMismatch = (duplicateReplies.length === 0 && runtimeDuplicates > 0) ||
                               (duplicateReplies.length > 0 && runtimeDuplicates === 0);

    const ctaTexts = aiMsgs.filter(m => m.analysis?.containsCTA).map(m => m.text?.slice(0, 50).trim());
    const ctaRepeatMap = {};
    ctaTexts.forEach(t => { ctaRepeatMap[t] = (ctaRepeatMap[t] || 0) + 1; });
    const repeatedCTAs = Object.values(ctaRepeatMap).filter(v => v > 1).length;

    const ignoredObjections = detectIgnoredObjections(analyzed);

    const producers = [...new Set(sorted.filter(m => m.direction === 'OUTBOUND' && m.senderType === 'SYSTEM').map(m => m.replyProducer).filter(Boolean))];
    const identityConsistent = producers.length <= 1;

    // WA Sales mode explanation
    let waSalesModeExplanation = null;
    if (waSalesModeCount === 0 && inboundMsgs.length > 3) {
      const anyTriggerSeen = totalTriggersFired > 0;
      if (!anyTriggerSeen) {
        waSalesModeExplanation = `אף אחת מ-${triggerList.length} מילות הטריגר לא נמצאה בשיחה. לידים לא השתמשו בביטויים כמו "${triggerList.slice(0, 3).join('", "')}" — מצב NORMAL נשמר.`;
      } else {
        waSalesModeExplanation = `טריגרים זוהו (${totalTriggersFired} פעמים) אך ייתכן שהמעבר נחסם. בדוק Message Trace של הודעות ספציפיות.`;
      }
    }

    const problems = [];
    if (duplicateReplies.length > 0) problems.push(`${duplicateReplies.length} תגובות AI כפולות / דומות`);
    if (runtimeDuplicates > 0 && duplicateReplies.length === 0) problems.push(`⚠️ trace מציין כפילות אך הסיכום הכללי לא זיהה — ייתכן כפילות בין sessions`);
    if (ignoredObjections.length > 0) problems.push(`${ignoredObjections.length} התנגדויות שלא טופלו כראוי`);
    if (repeatedCTAs > 0) problems.push(`CTA חוזר על עצמו ${repeatedCTAs} פעמים`);
    if (callPushCount > 3) problems.push(`ה-AI דחף לשיחה ${callPushCount} פעמים — עלול לייצר חיכוך`);
    if (waSalesModeCount === 0 && inboundMsgs.length > 5) problems.push('לא זוהה מעבר למצב WhatsApp Sales למרות שיחה ארוכה');

    const summary = {
      totalMessages: sorted.length,
      inboundCount: inboundMsgs.length,
      outboundCount: aiMsgs.length,
      duplicateRepliesCount: duplicateReplies.length,
      runtimeDuplicatesCount: runtimeDuplicates,
      duplicateMismatch,
      repeatedIdeasCount: repeatedCTAs,
      topTriggers,
      totalTriggersEvaluated,
      totalTriggersFired,
      modeTransitionsCount,
      objectionsDetected: [...new Set(allObjections)],
      objectionFrequency: objFreq,
      ctaCount,
      callPushCount,
      waSalesModeActivations: waSalesModeCount,
      waSalesModeExplanation,
      identityConsistent,
      repeatedCTADetected: repeatedCTAs > 0,
      ignoredObjectionsCount: ignoredObjections.length,
      ignoredObjections,
      topProblems: problems.slice(0, 5),
      intentsDetected: [...new Set(allIntents)],
      hasSavedDebugLogs: debugLogs.length > 0,
      savedDebugCount: debugLogs.length,
      analyzedRange: fetchLimit,
      triggerListUsed: triggerList,
    };

    return Response.json({ ok: true, leadId, summary, messages: analyzed, rawDebugLogs: debugLogs });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});