import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ── Behavior Rules Block Builder ─────────────────────────────────────────────
function buildBehaviorRulesBlock(config) {
  const r = config || {};
  console.log('[BEHAVIOR_RULES_SOURCE]', {
    hard: r.behaviorRules_hardRules,
    response: r.behaviorRules_responseStructure
  });
  const parts = [
    r.behaviorRules_hardRules        && `HARD RULES:\n${r.behaviorRules_hardRules}`,
    r.behaviorRules_responseStructure && `RESPONSE STRUCTURE:\n${r.behaviorRules_responseStructure}`,
    r.behaviorRules_salesStrategy    && `SALES STRATEGY:\n${r.behaviorRules_salesStrategy}`,
    r.behaviorRules_phoneStrategy    && `PHONE STRATEGY:\n${r.behaviorRules_phoneStrategy}`,
    r.behaviorRules_pricingRules     && `PRICING RULES:\n${r.behaviorRules_pricingRules}`,
    r.behaviorRules_toneGuardrails   && `TONE GUARDRAILS:\n${r.behaviorRules_toneGuardrails}`,
    r.behaviorRules_contextRules     && `CONTEXT RULES:\n${r.behaviorRules_contextRules}`,
    r.behaviorRules_channelRules     && `CHANNEL RULES:\n${r.behaviorRules_channelRules}`,
  ].filter(Boolean);
  if (!parts.length) return '';
  return `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🛡️ AI BEHAVIOR RULES (GLOBAL — MANDATORY)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${parts.join('\n\n')}`;
}

// ── Prompt Builder ────────────────────────────────────────────────────────────
function buildAIBrainPrompt(config) {
  const section = (title, content) =>
    content && content.trim() ? `\n\n## ${title}\n${content.trim()}` : '';

  const agentName = config.agentName || 'עדן';
  const trialOffer = config.trialOffer || 'שבוע ניסיון ב-100₪';
  const membershipPlans = config.membershipPlans || '5 כניסות: 200₪\n9 כניסות: 350₪\n20 כניסות: 399₪';
  const mode1Goal = config.mode1Goal || 'להוביל לשיחה קצרה של 2-3 דקות עם מאמן';
  const mode2CTA = config.mode2CTAMessage || 'רוצה שאמליץ לך בדיוק מה מתאים לך?';
  const waTriggers = config.whatsappSaleTriggers || 'מעדיף פה, שלח לי פה, לא רוצה שיחה, אני בעבודה, אני עסוק, בלי שיחה, עדיף בכתב';

  // Inject behavior rules block FIRST (before all other business context)
  const behaviorBlock = buildBehaviorRulesBlock(config);

  let prompt = behaviorBlock + `\n\n🏋️ זהות\n\nאתה ${agentName} מ-${config.businessName || 'Shape Studio'}.\nאתה מאמן כושר אמיתי — לא בוט, לא נציג שירות לקוחות.\nאתה מדבר עם אנשים שהתעניינו בסטודיו, ותפקידך להבין אותם ולהוביל אותם לפעולה.\n\nלעולם אל תחשוף שאתה AI. אם שואלים — אתה ${agentName}, מאמן בסטודיו.\n\n\n🎯 מטרה\n\nמטרה ראשונה: להוביל לשיחה קצרה בטלפון או לאימון ניסיון.\nמטרה שנייה: אם הליד מתנגד לשיחה — לסגור אותו בתוך הוואטסאפ.\n\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔀 שני מצבי פעולה\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n📞 מצב 1 — ברירת מחדל: הובלה לשיחה\nמטרה: ${mode1Goal}\n• שאל 1–2 שאלות קלות כדי להבין את הליד\n• הצע שיחה בטבעיות ומוקדם יחסית\n• "רוצה שנדבר 2 דקות? אסביר לך מה הכי מתאים לך"\n\n💬 מצב 2 — מכירה בוואטסאפ (WHATSAPP_SALES_MODE)\nמופעל אם הליד מתנגד לשיחה או מעדיף הודעות.\n\n🔔 טריגרים להפעלת מצב 2:\n${waTriggers}\nוכל ניסוח דומה. גם אם הליד מתחמק מהצעת שיחה יותר מפעם — עבור למצב 2.\n\n⚙️ התנהגות במצב 2:\n• הפסק לחלוטין להציע שיחה טלפונית\n• שאל שאלות קצרות וממוקדות\n• תן פרטים ספציפיים (מחיר, סוגי אימונים, מבצע)\n• הובל להחלטה תוך 2–3 הודעות\n\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📋 מידע על הסטודיו\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nהצעת ניסיון: ${trialOffer}\nמסלולי מנוי:\n${membershipPlans}\n\n${trialOffer} הוא נקודת הכניסה — מציג אותו לאחר שהבנת את היעד של הליד.\n\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✍️ כללי כתיבה — קריטיים\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n• הודעה אחת בלבד בכל תשובה — לא שתי אפשרויות, לא וריאנטים\n• 1–2 שורות בלבד. לא פסקאות ארוכות\n• רעיון אחד בכל הודעה\n• תמיד מסתיים בשאלה אחת קצרה — כשאפשר\n• עברית מדוברת — לא ספרותית, לא רשמית\n• אמוג'י — מינימום, רק כשמתאים\n• לא להשתמש ב: "כמובן", "בהחלט", "ודאי", "שמח לעזור"\n• לא לחזור על מידע שכבר ניתן באותה שיחה\n\n✅ דוגמה טובה:\n"כמה פעמים בשבוע אתה מתכנן להגיע?"\n\n✅ דוגמה טובה:\n"יש ${trialOffer} — כדי שתרגיש את המקום לפני שמחליטים.\nמה המטרה שלך באימונים?"\n\n❌ דוגמה גרועה:\n"יש לנו מגוון שעות לאורך היום ואפשרויות שונות לפי הצורך שלך, נשמח לעזור."\n\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n💰 טיפול במחיר\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n• אם שאל על מחיר — שאל שאלה אחת לפני (כדי להתאים)\n• אם מתעקש — תן מחיר ישר, בלי עיכוב\n• תמיד הצג ערך לפני מחיר\n• סיים עם CTA: "רוצה שנתאם ניסיון?"\n\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🚧 טיפול בהתנגדויות\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"אין לי זמן" → "שיחה של 2 דקות מספיקה — מתי נוח לך?"\n"יקר לי" → "יש ${trialOffer}, בלי התחייבות. שווה לנסות?"\n"אני רק בודק" → "מה גרם לך להתעניין דווקא עכשיו?"\n"לא בטוח" → "מה ההתלבטות הכי גדולה שלך?"\n\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎯 אסטרטגיית שיחה\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n1. הבן מה הוא רוצה — שאל שאלה אחת\n2. הצג פתרון שמתאים לו\n3. הצע שיחה קצרה או ${trialOffer}\n4. הובל להחלטה\n\nלא לזרוק מידע בבת אחת.\nלא לדחוף מוקדם מדי.\nכל הודעה מקדמת שלב אחד קדימה.`;

  if (config.businessType) prompt += `\n\n## Business Type\n${config.businessType}`;
  if (config.businessDescription) prompt += section('About the Business', config.businessDescription);
  
  const logistics = [
    config.businessLocation && `Location: ${config.businessLocation}`,
    config.openingHours && `Hours: ${config.openingHours}`,
    config.parkingInfo && `Parking: ${config.parkingInfo}`,
    config.howToReach && `How to reach: ${config.howToReach}`,
  ].filter(Boolean).join('\n');
  if (logistics) prompt += section('Location & Logistics', logistics);

  prompt += section('Services', config.servicesOffered);
  prompt += section('Pricing', config.pricingInfo);
  prompt += section('Offers & Promotions', config.offersAndPromotions);
  prompt += section('FAQ', config.faq);
  prompt += section('Sales Rules', config.salesRules);
  prompt += section('Handling Objections', config.objectionHandling);
  prompt += section('Important Links', config.importantLinks);
  prompt += section('Additional Knowledge', config.extraBusinessKnowledge);

  if (config.escalationRules) {
    prompt += section('Escalation Rules', config.escalationRules);
  }

  if (config.conversationGoal) {
    prompt += `\n\n## Your Conversation Goal\n${config.conversationGoal}\nGuide the conversation naturally toward this goal.`;
  }

  return prompt;
}

// ── Diag Logger ───────────────────────────────────────────────────────────────
async function logAI(base44, coachEmail, flowEvent, payload) {
  await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
    coach_email: coachEmail || 'system',
    event: 'RULE_TRIGGERED',
    payload: { flowEvent, ...payload }
  }).catch(() => {});
}

// ── Skeptical Intent Detection ───────────────────────────────────────────────
function detectSkepticalIntent(text) {
  const lower = (text || '').toLowerCase();
  const skepticalTriggers = [
    'יקר לי', 'יקר', 'אני רק בודק', 'סתם בודק', 'לא בטוח', 'לא בטוחה',
    'אני צריך לחשוב', 'צריכה לחשוב', 'אין לי זמן', 'למה זה טוב לי',
    'למה דווקא אצלכם', 'לא משכנע', 'ספק', 'מתלבט', 'מתלבטת'
  ];
  return skepticalTriggers.some(t => lower.includes(t));
}

// ── PART 1-8: Objection Detection System ─────────────────────────────────────
function detectObjection(text) {
  const lower = (text || '').toLowerCase();
  
  // PART 2: Price question
  if (['כמה עולה', 'מחיר', 'כמה זה עולה', 'מה המחיר', 'עלות'].some(t => lower.includes(t))) {
    return {
      type: 'price_question',
      response: `תלוי בדיוק מה מתאים לך.
יש מסלול לפי כניסות ויש מנוי חופשי — ולפני שאגיד מחיר, כדאי שנבין מה נכון לך.
כמה פעמים בשבוע אתה מתכנן להגיע?`,
      returnToStage: 'goal'
    };
  }
  
  // PART 3: Time objection
  if (['אין לי זמן', 'אין זמן', 'אני עמוס', 'לא נמצא זמן', 'עסוק'].some(t => lower.includes(t))) {
    return {
      type: 'time_objection',
      response: `זה בדיוק הסיבה שרוב האנשים מגיעים אלינו — כדי שיהיה להם שגרה קבועה.
יש לנו שעות בוקר, צהריים וערב.
מתי בדרך כלל יותר נוח לך?`,
      returnToStage: 'goal'
    };
  }
  
  // PART 4: Just checking
  if (['אני רק בודק', 'סתם מתעניין', 'רק בודק מידע', 'רק מסתכל', 'סתם בודק'].some(t => lower.includes(t))) {
    return {
      type: 'just_checking',
      response: `בסדר גמור.
מה גרם לך להתעניין דווקא עכשיו?`,
      returnToStage: 'continue'
    };
  }
  
  // PART 5: Thinking about it
  if (['אני רוצה לחשוב', 'צריך לחשוב', 'צריכה לחשוב', 'לא בטוח', 'לא בטוחה', 'אחשוב על זה'].some(t => lower.includes(t))) {
    return {
      type: 'thinking_about_it',
      response: `מה ההתלבטות הכי גדולה שלך כרגע?`,
      returnToStage: 'continue'
    };
  }
  
  // PART 6: Location question
  if (['איפה אתם נמצאים', 'כתובת', 'מיקום', 'איפה זה', 'היכן'].some(t => lower.includes(t))) {
    return {
      type: 'location_question',
      response: `אנחנו בכתובת דרך השדה 12 — קל לחנות ממש מולנו.
מאיפה אתה מגיע בדרך כלל?`,
      returnToStage: 'goal'
    };
  }
  
  // PART 7: Fitness insecurity
  if (['אני לא בכושר', 'אני מתחיל', 'אין לי כושר', 'אני חלש', 'חלשה', 'מתחילה'].some(t => lower.includes(t))) {
    return {
      type: 'fitness_insecurity',
      response: `רוב האנשים שמגיעים אלינו מתחילים בדיוק מאיפה שאתה.
האימונים מותאמים לרמה שלך — אין צורך להיות בכושר כדי להתחיל.
מה המטרה שלך?`,
      returnToStage: 'continue'
    };
  }
  
  // PART 8: Commitment fear
  if (['לא רוצה להתחייב', 'מפחד להתחייב', 'לא רוצה מסגרת', 'התחייבות'].some(t => lower.includes(t))) {
    return {
      type: 'commitment_fear',
      response: `אין פה שום התחייבות בשלב הזה.
מתחילים עם אימון ניסיון — בא תראה איך זה מרגיש ואז מחליטים.
מה הכי חשוב לך שיהיה לך באימונים?`,
      returnToStage: 'goal'
    };
  }
  
  return null;
}

// ── Lead Intelligence Engine ──────────────────────────────────────────────────
function detectLeadIntelligence(text) {
  const lower = (text || '').toLowerCase();
  const result = {};

  const goalMap = {
    weight_loss:    ['לרדת במשקל', 'להרזות', 'ירידה במשקל', 'לאבד משקל'],
    muscle_gain:    ['להתחזק', 'לבנות שרירים', 'להגדיל שרירים'],
    fitness:        ['להיכנס לכושר', 'לחזור לכושר', 'כושר גופני'],
    toning:         ['להתחטב', 'חיטוב'],
    general_health: ['בריאות', 'להרגיש טוב', 'בריא יותר'],
  };
  for (const [g, ts] of Object.entries(goalMap)) { if (ts.some(t => lower.includes(t))) { result.goal = g; break; } }

  const painMap = {
    poor_fitness: ['לא בכושר', 'אין לי כושר', 'עייפות', 'כבד לי'],
    overweight:   ['עודף משקל', 'לא מרוצה מהגוף', 'כבד מדי'],
    sedentary:    ['לא מתאמן', 'יושב הרבה', 'לא פעיל'],
    stress:       ['לחץ', 'מתח', 'עקה'],
    back_pain:    ['כאבי גב', 'גב כואב'],
  };
  for (const [p, ts] of Object.entries(painMap)) { if (ts.some(t => lower.includes(t))) { result.pain = p; break; } }

  if (['עכשיו', 'מיד', 'חייב להתחיל', 'חייבת להתחיל', 'לא יכול לחכות', 'לא יכולה לחכות'].some(t => lower.includes(t))) result.urgency = 'high';
  else if (['השבוע', 'החודש', 'בקרוב', 'צריך להתחיל', 'צריכה להתחיל'].some(t => lower.includes(t))) result.urgency = 'medium';

  if (['מוכן', 'מוכנה', 'נחוש', 'נחושה', 'אני מחויב', 'אני מחויבת'].some(t => lower.includes(t))) result.motivation = 'high';
  else if (['חתונה', 'אירוע', 'קיץ', 'חופשה'].some(t => lower.includes(t))) result.motivation = 'event_driven';
  else if (['אני רוצה', 'רוצה לנסות', 'מעוניין', 'מעוניינת'].some(t => lower.includes(t))) result.motivation = 'interested';

  if (['כמה עולה', 'מחיר', 'עלות', 'כמה זה', 'מה המחיר', 'תשלום'].some(t => lower.includes(t))) result.budget = 'price_inquiry';

  // Personality detection
  if (['כמה עולה', 'מחיר', 'עלות', 'כמה זה', 'מה המחיר', 'אחוז', 'מספרים'].some(t => lower.includes(t))) result.personalityType = 'analytical';
  else if (['מרגיש', 'מרגישה', 'עצוב', 'שמח', 'רוצה להרגיש', 'מדכא'].some(t => lower.includes(t))) result.personalityType = 'emotional';
  else if (['אבל', 'למה', 'לא בטוח', 'לא בטוחה', 'הוכיח', 'ספק', 'לא מאמין'].some(t => lower.includes(t))) result.personalityType = 'skeptical';
  else if (['עכשיו', 'מיד', 'רוצה להתחיל', 'בא לי להתחיל'].some(t => lower.includes(t))) result.personalityType = 'impulsive';

  return result;
}

// ── Rule-based field extractor (catches what LLM misses) ─────────────────────
function ruleBasedExtract(text, crmField) {
  const lower = (text || '').toLowerCase().trim();
  if (!lower || lower.length < 2) return null;

  if (crmField === 'lead_reason') {
    const checks = [
      { keywords: ['אינסטגרם', 'instagram', 'insta'], label: 'אינסטגרם' },
      { keywords: ['פייסבוק', 'facebook', 'fb'], label: 'פייסבוק' },
      { keywords: ['מבצע'], label: 'מבצע' },
      { keywords: ['מודעה', 'מודעות', 'פרסום', 'פרסומת'], label: 'פרסום' },
      { keywords: ['המלצה', 'המליצ', 'שמעתי עליכם', 'שמעתי מחבר'], label: 'המלצה' },
      { keywords: ['חבר', 'חברה', 'מכר', 'מכרה'], label: 'המלצה מחבר/ה' },
      { keywords: ['גוגל', 'google', 'חיפוש'], label: 'גוגל' },
      { keywords: ['אתר', 'website'], label: 'אתר אינטרנט' },
    ];
    for (const { keywords, label } of checks) {
      if (keywords.some(k => lower.includes(k))) return label;
    }
    if (lower.length >= 3) return text.trim().slice(0, 80);
  }

  return null;
}

function detectRetention(text) {
  const lower = (text || '').toLowerCase();
  return ['אחשוב על זה', 'לא בטוח', 'לא בטוחה', 'נראה לי', 'אולי', 'צריך לחשוב', 'צריכה לחשוב', 'לא יודע', 'לא יודעת'].some(t => lower.includes(t));
}

// ── SINGLE MESSAGE ENFORCER ──────────────────────────────────────────────────────
// Ensures the AI reply is ONE cohesive message. Strips only clearly separate
// alternative-message blocks (e.g. "Option 1 / Option 2") — NOT paragraph breaks
// inside a single reply.
function normalizeSingleMessage(replyText) {
  if (!replyText || typeof replyText !== 'string') return replyText;
  const text = replyText.trim();
  if (!text) return text;

  // Split into paragraphs by double newline
  const paragraphs = text.split(/\n{2,}/);
  
  // If only one paragraph — return as-is
  if (paragraphs.length <= 1) return text;

  // If multiple paragraphs, check if later ones look like alternatives/options
  // (start with a numbered prefix or "Option" — these are LLM multi-option outputs)
  const firstPara = paragraphs[0].trim();
  const secondPara = (paragraphs[1] || '').trim();
  
  const isAlternative = /^(\d+[\.\)]|Option\s*\d|גרסה\s*\d|אפשרות\s*\d)/i.test(secondPara);
  
  if (isAlternative) {
    // Multiple alternatives generated — keep only the first
    return firstPara;
  }
  
  // Otherwise keep all paragraphs as one WhatsApp message (natural paragraph breaks are fine)
  return text;
}

// ── Main Handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── GLOBAL KILL SWITCH ─────────────────────────────────────────────────────
    const killCfg = await base44.asServiceRole.entities.SystemConfig
      .filter({ key: 'GLOBAL_WHATSAPP_ENABLED' }).catch(() => []);
    if (killCfg[0]?.value !== true) {
      console.log('[aiConversationAgent] KILL_SWITCH: GLOBAL_WHATSAPP_ENABLED=false — AI skipped');
      return Response.json({ ok: false, blocked: true, reason: 'GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE' });
    }

    const body = await req.json();

    const isDirectInvocation = body?.leadId && body?.messageText && !body?.event;
    const eventType = body?.event?.type;
    if (!isDirectInvocation && eventType && eventType !== 'create') {
      return Response.json({ ok: true, skipped: true, reason: 'not_create_event' });
    }

    let msg = isDirectInvocation ? null : (body?.data || null);
    const entityId = body?.event?.entity_id || msg?.id;

    // Always re-fetch the LATEST state of the message from DB (not the stale automation payload)
    if (!isDirectInvocation && entityId) {
      const freshMsgs = await base44.asServiceRole.entities.LeadMessageThread.filter({ id: entityId }).catch(() => []);
      msg = freshMsgs[0] || msg || null;
    }

    const leadId = msg?.leadId || body?.leadId;
    let messageText = msg?.messageText || body?.messageText;
    let coachEmail = msg?.coach_email || body?.coach_email;
    const incomingProviderMsgId = body?.providerMessageId || msg?.providerMessageId || null;

    if (!leadId) {
      console.log('[aiConversationAgent] ✗ Stage 1/10: missing leadId');
      return Response.json({ ok: false, stage: 'validation', error: 'missing_leadId' });
    }
    
    if (!messageText || typeof messageText !== 'string') {
      console.log('[aiConversationAgent] ✗ Stage 1/10: missing or invalid messageText');
      return Response.json({ ok: false, stage: 'validation', error: 'missing_messageText' });
    }
    
    console.log('[aiConversationAgent] ✓ Stage 1/10: validation passed - leadId:', leadId);

    if (msg && !isDirectInvocation) {
      if (msg.direction !== 'INBOUND') {
        return Response.json({ ok: true, skipped: true, reason: 'not_inbound' });
      }
      if (msg.senderType !== 'LEAD') {
        return Response.json({ ok: true, skipped: true, reason: 'not_from_lead' });
      }
    }

    // ── EARLY EXIT: already processed or locked ──────────────────────────────────
    if (!isDirectInvocation) {
      if (msg?.aiProcessed === true || msg?.replyQueueId) {
        console.log('[aiConversationAgent] INBOUND_ALREADY_PROCESSED - msgId:', entityId);
        return Response.json({ ok: true, skipped: true, reason: 'INBOUND_ALREADY_PROCESSED' });
      }
      if (msg?.replyGenerationStartedAt) {
        const lockAge = Date.now() - new Date(msg.replyGenerationStartedAt).getTime();
        if (lockAge < 30000) {
          console.log('[aiConversationAgent] DUPLICATE_REPLY_SKIPPED - lock held by:', msg.replyProducer, 'age:', lockAge);
          return Response.json({ ok: true, skipped: true, reason: 'DUPLICATE_REPLY_SKIPPED' });
        }
      }
    }

    console.log('[aiConversationAgent] AI_AUTOMATION_TRIGGERED - leadId:', leadId, '| msgId:', entityId, '| direct:', isDirectInvocation);

    // ── ATOMIC LOCK-CLAIM: stamp BEFORE any async work ───────────────────────────
    // This is the PRIMARY dedup gate. We write the lock immediately and then re-read
    // to verify we won the race (last-write-wins check).
    if (msg?.id && !isDirectInvocation) {
      await base44.asServiceRole.entities.LeadMessageThread.update(msg.id, {
        replyGenerationStartedAt: new Date().toISOString(),
        replyProducer: 'aiConversationAgent',
        replyStatus: 'pending'
      }).catch(() => {});

      // Re-read after a short delay to detect if another concurrent invocation also wrote
      await new Promise(r => setTimeout(r, 300));
      const recheck = await base44.asServiceRole.entities.LeadMessageThread.filter({ id: msg.id }).catch(() => []);
      const recheckMsg = recheck[0];

      if (recheckMsg?.replyQueueId || recheckMsg?.aiProcessed === true) {
        console.log('[aiConversationAgent] RACE_LOST - another invocation already created queue for msgId:', msg.id);
        return Response.json({ ok: true, skipped: true, reason: 'RACE_LOST_QUEUE_ALREADY_EXISTS' });
      }

      console.log('[aiConversationAgent] ATOMIC_LOCK_CLAIMED - msgId:', msg.id);
    }

    // Load lead
    console.log('[aiConversationAgent] ⋯ Stage 2/10: loading lead...');
    const leadRecords = await base44.asServiceRole.entities.Lead.filter({ id: leadId }).catch(() => []);
    const lead = leadRecords[0] || null;
    if (!lead) {
      console.error('[aiConversationAgent] ✗ Stage 2/10: lead_not_found:', leadId);
      await logAI(base44, coachEmail || 'system', 'AI_AGENT_FAILED', { leadId, error: 'lead_not_found' });
      return Response.json({ ok: false, stage: 'load_lead', error: 'lead_not_found' });
    }
    
    coachEmail = coachEmail || lead.coach_email;
    console.log('[aiConversationAgent] ✓ Stage 2/10: lead loaded:', lead.firstName);

    // ── OPT-OUT + TERMINAL STATUS GUARD ───────────────────────────────────────
    if (lead.waOptOut === true) {
      console.log('[aiConversationAgent] OPT_OUT_SKIP: lead.waOptOut=true leadId=' + leadId);
      return Response.json({ ok: true, skipped: true, stage: 'opt_out_check', reason: 'lead_opted_out' });
    }
    if (lead.status === 'CLOSED' || lead.status === 'BOOKED') {
      console.log('[aiConversationAgent] TERMINAL_STATUS_SKIP: status=' + lead.status + ' leadId=' + leadId);
      return Response.json({ ok: true, skipped: true, stage: 'status_check', reason: 'terminal_status', status: lead.status });
    }

    // ── OWNER OVERRIDE CHECK: skip AI if another system is explicitly assigned ──
    // When lead.activeResponderOwner is set to FLOW, SCRIPT, or MANUAL,
    // AI must NOT claim the reply lock — it would block the designated owner.
    // AI only runs when owner = AI or unset (with no active Flow session).
    const OWNER_ALLOWS_AI = [undefined, null, '', 'AI'];
    const ownerField = lead?.activeResponderOwner;
    if (!OWNER_ALLOWS_AI.includes(ownerField)) {
      console.log(`[aiConversationAgent] OWNER_OVERRIDE_SKIP — activeResponderOwner="${ownerField}" — AI will NOT claim reply lock`);
      await logAI(base44, coachEmail, 'AI_AUTOMATION_SKIPPED', { leadId, reason: 'owner_override_not_ai', activeResponderOwner: ownerField });
      return Response.json({ ok: true, stage: 'owner_check', skipped: true, reason: 'owner_override_not_ai', activeResponderOwner: ownerField });
    }

    // ── ROUTING BRAIN GUARD: skip AI if an active Flow session exists ──────────
    // Even if no explicit owner is set, an active Flow session means Flow owns this
    // conversation. AI must not claim until Flow completes or stops.
    // This is the entity-automation counterpart of the webhook routing brain check.
    if (!ownerField) {
      try {
        const activeSessions = await base44.asServiceRole.entities.LeadConversationState.filter({
          leadId, isActive: true
        }).catch(() => []);
        const hasActiveFlowSession = activeSessions.some(s => s.flowStatus === 'ACTIVE');
        if (hasActiveFlowSession) {
          console.log(`[aiConversationAgent] ROUTING_BRAIN_SKIP — active Flow session exists for leadId=${leadId} — AI blocked`);
          await logAI(base44, coachEmail, 'AI_AUTOMATION_SKIPPED', { leadId, reason: 'routing_brain_active_flow_session_blocks_ai' });
          return Response.json({ ok: true, stage: 'routing_brain_check', skipped: true, reason: 'active_flow_session_blocks_ai' });
        }
      } catch (_) {}
    }

    // Load active AI Brain
    console.log('[aiConversationAgent] ⋯ Stage 3/10: loading AI Brain...');
    const allBrains = await base44.asServiceRole.entities.AIBrainConfig.list('-created_date', 50);
    const brainConfig = allBrains.find(b => b.coach_email === coachEmail && b.isActive === true);
    if (!brainConfig) {
      console.log('[aiConversationAgent] ⊗ Stage 3/10: no active brain for coach:', coachEmail);
      await logAI(base44, coachEmail, 'AI_AUTOMATION_SKIPPED', { leadId, reason: 'no_active_brain', coachEmail });
      return Response.json({ ok: true, stage: 'load_brain', skipped: true, reason: 'no_active_brain' });
    }

    console.log('[aiConversationAgent] ✓ Stage 3/10: brain loaded:', brainConfig.businessName);

    // Build prompt and invoke LLM
    let systemPrompt = buildAIBrainPrompt(brainConfig);

    // ── WA-ONLY POLICY INJECTION ─────────────────────────────────────────────
    // If lead has explicitly signaled they prefer WhatsApp only (no phone calls),
    // inject a hard instruction to suppress call CTA for this conversation.
    // This is the ONLY runtime effect of the WA-only policy binding.
    // Routing is unchanged — only the AI's reply content is shaped.
    if (lead.waOnly === true) {
      systemPrompt += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 WA-ONLY LEAD — MANDATORY OVERRIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This lead has explicitly stated they do NOT want a phone call and prefer to stay on WhatsApp.

MANDATORY RULES — no exceptions:
• DO NOT suggest, propose, or hint at a phone call in any form.
• DO NOT say "let's talk", "I'll call you", "schedule a call", "2-minute call", or any variation.
• Stay 100% in WhatsApp — answer questions, share info, and close here.
• If the lead brings up a call themselves, acknowledge and redirect: "בסדר, נסגור הכל כאן בהודעות."
• Your goal is to move toward a decision within WhatsApp: trial booking, membership info, or clear next step — all via text.`;
      console.log('[aiConversationAgent] WA_ONLY_PROMPT_INJECTED — lead.waOnly=true, call CTA suppressed for leadId:', leadId);
    }
    // ── END WA-ONLY INJECTION ─────────────────────────────────────────────────

    const fullPrompt = `${systemPrompt}

## User message: "${messageText}"

Respond in JSON format only: {"reply": "your response", "action": "continue|escalate|callback_request", "escalation_reason": null}`;

    console.log('[aiConversationAgent] ⋯ Stage 4/10: building prompt...');
    console.log('[aiConversationAgent] ⋯ Stage 5/10: invoking LLM...');
    
    let aiResult;
    try {
      aiResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: fullPrompt,
        response_json_schema: {
          type: 'object',
          properties: {
            reply: { type: 'string' },
            action: { type: 'string' },
            escalation_reason: { type: 'string' }
          },
          required: ['reply', 'action']
        }
      });
      console.log('[aiConversationAgent] ✓ Stage 5/10: LLM responded');
    } catch (err) {
      console.error('[aiConversationAgent] ✗ Stage 5/10: LLM failed:', err.message);
      await logAI(base44, coachEmail, 'AI_AGENT_FAILED', { leadId, error: 'llm_invocation_failed', details: err.message });
      return Response.json({ ok: false, stage: 'llm_invoke', error: err.message });
    }

    let replyText = aiResult?.reply;
    const action = aiResult?.action || 'continue';

    if (!replyText || typeof replyText !== 'string') {
      console.error('[aiConversationAgent] ✗ Stage 6/10: empty or invalid AI reply');
      await logAI(base44, coachEmail, 'AI_AGENT_FAILED', { leadId, error: 'empty_ai_reply' });
      return Response.json({ ok: false, stage: 'ai_reply', error: 'empty_ai_reply' });
    }
    
    // ── ENFORCE SINGLE MESSAGE OUTPUT ────────────────────────────────────────────
    // Normalize to ensure ONLY ONE final message is sent per AI execution
    // If model returns multiple message blocks/alternatives, keep only the first one
    replyText = normalizeSingleMessage(replyText);
    
    console.log('[aiConversationAgent] ✓ Stage 6/10: AI reply generated (normalized):', replyText.slice(0, 60));

    // ── STAGE 7: Route through HARD SINGLE-OUTBOUND GATE ────────────────────────
    // claimAndQueueOutbound is the ONE AND ONLY place that creates queue records.
    // It re-reads the inbound record fresh, checks replyQueueId ownership,
    // and rejects any duplicate execution — regardless of how many parallel
    // invocations reached this point.
    console.log('[aiConversationAgent] ⋯ Stage 7/10: routing through single-outbound gate...');

    // Resolve the inbound record ID to pass to the gate
    const inboundIdForGate = msg?.id || (incomingProviderMsgId ? (await base44.asServiceRole.entities.LeadMessageThread.filter({
      leadId,
      providerMessageId: incomingProviderMsgId,
      direction: 'INBOUND'
    }).catch(() => [])).map(r => r.id)[0] : null);

    let gateResult;
    try {
      gateResult = await base44.asServiceRole.functions.invoke('claimAndQueueOutbound', {
        inboundMessageId: inboundIdForGate || null,
        providerMessageId: incomingProviderMsgId || null,
        leadId,
        coachEmail,
        replyText
      });
    } catch (err) {
      console.error('[aiConversationAgent] ✗ Stage 7/10: gate invocation failed:', err.message);
      await logAI(base44, coachEmail, 'AI_AGENT_FAILED', { leadId, error: 'gate_invocation_failed', details: err.message });
      return Response.json({ ok: false, stage: 'queue_reply', error: err.message });
    }

    if (gateResult?.skipped || gateResult?.ok === false) {
      const reason = gateResult?.reason || 'gate_rejected';
      console.log('[aiConversationAgent] ✓ Stage 7/10: GATE REJECTED duplicate — only one outbound allowed. reason:', reason);
      await logAI(base44, coachEmail, 'OUTBOUND_GATE_REJECTED', { leadId, reason });
      return Response.json({ ok: true, skipped: true, stage: 'gate_rejected', reason });
    }

    console.log('[aiConversationAgent] ✓ Stage 7/10: gate approved — queueId:', gateResult?.queueId);
    console.log('[aiConversationAgent] ✓ Stage 10/10: COMPLETE');

    // ── NON-INTRUSIVE DEBUG COLLECTOR ─────────────────────────────────────────
    // Runs AFTER successful response. Never blocks. Fails silently.
    (async () => {
      try {
        const intelligence = detectLeadIntelligence(messageText);
        const objection = detectObjection(messageText);
        const skeptical = detectSkepticalIntent(messageText);
        const lines = (replyText || '').split('\n').filter(l => l.trim()).length;
        const containsCTA = ['רוצה', 'נתאם', 'נדבר', 'שיחה', 'ניסיון', 'תאם'].some(t => (replyText || '').includes(t));
        const callPush = ['נדבר', 'שיחה', 'להתקשר', 'לדבר', 'תתקשר', '2 דקות'].some(t => (replyText || '').toLowerCase().includes(t));
        const questionIncluded = (replyText || '').includes('?') || (replyText || '').includes('?');

        const waTriggerList = (brainConfig?.whatsappSaleTriggers || '').split(/[\n,]/).map(t => t.trim()).filter(Boolean);
        const lowerMsg = (messageText || '').toLowerCase();

        // Per-trigger evaluation with reason
        const triggersEvaluated = waTriggerList.map(trigger => {
          const matched = lowerMsg.includes(trigger.toLowerCase());
          return {
            triggerName: trigger,
            evaluated: true,
            result: matched,
            reason: matched ? `מילת מפתח "${trigger}" נמצאה בהודעה` : `מילת מפתח "${trigger}" לא נמצאה`,
          };
        });
        const triggersFired = triggersEvaluated.filter(t => t.result).map(t => t.triggerName);
        const triggersChecked = waTriggerList;
        const triggersRejected = waTriggerList.filter(t => !lowerMsg.includes(t.toLowerCase()));

        // Channel preference detection
        const channelPrefKeywords = ['מעדיף פה', 'שלח לי כאן', 'לא רוצה שיחה', 'עדיף בכתב', 'רק הודעות', 'בלי שיחה'];
        const channelPreference = channelPrefKeywords.some(k => lowerMsg.includes(k));

        // Mode detection — NORMAL vs WHATSAPP_SALES
        const previousMode = lead?.currentScriptStage >= 10 ? 'WHATSAPP_SALES' : 'NORMAL';
        const newMode = (triggersFired.length > 0 || channelPreference) ? 'WHATSAPP_SALES' : previousMode;
        const modeChanged = previousMode !== newMode;

        // Duplicate detection — compare with last 3 AI replies
        const recentAI = await base44.asServiceRole.entities.LeadMessageThread.filter(
          { leadId, direction: 'OUTBOUND', senderType: 'SYSTEM' },
          '-created_date',
          3
        ).catch(() => []);

        const duplicateCheck = { identicalText: false, similarityScore: 0, duplicateDetected: false, matchedWith: null };
        for (const prev of recentAI) {
          const a = (replyText || '').trim().toLowerCase();
          const b = (prev.messageText || '').trim().toLowerCase();
          if (!b) continue;
          if (a === b) {
            duplicateCheck.identicalText = true;
            duplicateCheck.similarityScore = 100;
            duplicateCheck.duplicateDetected = true;
            duplicateCheck.matchedWith = prev.id;
            break;
          }
          const wordsA = new Set(a.split(/\s+/));
          const wordsB = new Set(b.split(/\s+/));
          const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
          const union = new Set([...wordsA, ...wordsB]).size;
          const score = union > 0 ? Math.round((intersection / union) * 100) : 0;
          if (score > duplicateCheck.similarityScore) {
            duplicateCheck.similarityScore = score;
            if (score >= 65) {
              duplicateCheck.duplicateDetected = true;
              duplicateCheck.matchedWith = prev.id;
            }
          }
        }

        // Build full messageTrace
        const messageTrace = {
          input: {
            inboundMessageText: messageText,
            messageId: msg?.id || null,
            timestamp: new Date().toISOString(),
          },
          stateBefore: {
            conversationStage: lead?.currentScriptStage || 'unknown',
            intent: intelligence?.personalityType || 'unknown',
            objectionDetected: objection?.type || null,
            channelPreference,
            mode: previousMode,
            skeptical,
          },
          triggersEvaluated,
          triggersFired,
          modeTransition: {
            previousMode,
            newMode,
            didChange: modeChanged,
            reason: modeChanged
              ? `טריגרים שהופעלו: ${triggersFired.join(', ') || 'channel_preference'}`
              : triggersFired.length === 0
                ? 'אין טריגרים שהופעלו — המצב נשאר NORMAL'
                : 'כבר במצב WHATSAPP_SALES',
          },
          decision: {
            selectedFlow: 'aiConversationAgent',
            reason: action === 'escalate' ? 'escalation_triggered' : 'standard_ai_response',
          },
          response: {
            finalText: replyText,
            blocksCount: lines,
            ctaIncluded: containsCTA,
            callPushIncluded: callPush,
            questionIncluded,
          },
          output: {
            finalText: replyText,
          },
          delivery: {
            queueId: gateResult?.queueId || null,
            attempts: 1,
            sent: !!gateResult?.queueId,
            providerMessageId: null, // filled later by worker
          },
          duplicateCheck,
          stateAfter: {
            conversationStage: lead?.currentScriptStage || 'unknown',
            intent: intelligence?.personalityType || 'unknown',
            mode: newMode,
          },
        };

        const debugData = {
          input: {
            messageText,
            leadId,
            timestamp: new Date().toISOString(),
          },
          state: {
            conversationStage: lead?.currentScriptStage || 'unknown',
            intent: intelligence?.personalityType || 'unknown',
            objectionDetected: objection?.type || null,
            channelPreference,
            skeptical,
            mode: previousMode,
          },
          triggers: {
            checked: triggersChecked,
            fired: triggersFired,
            rejected: triggersRejected,
          },
          decision: {
            selectedFlow: 'aiConversationAgent',
            reason: action === 'escalate' ? 'escalation_triggered' : 'standard_ai_response',
          },
          response: {
            finalText: replyText,
            blocksCount: lines,
            containsCTA,
            callPush,
            questionIncluded,
          },
          delivery: {
            queueId: gateResult?.queueId || null,
            attemptCount: 1,
            sent: !!gateResult?.queueId,
          },
          meta: {
            executionId: `${leadId}-${Date.now()}`,
            functionVersion: 'aiConversationAgent-v2',
          },
          messageTrace,
        };

        await base44.asServiceRole.entities.AIDebugLog.create({
          leadId,
          coach_email: coachEmail,
          inboundMessageId: msg?.id || null,
          debugData,
          messageText: messageText?.slice(0, 500) || '',
          replyText: replyText?.slice(0, 500) || '',
        });

        // ── ADDITIVE LINKAGE: stamp AIConversationLog so CRM knows AI is handling this lead ──
        // Safe: runs AFTER response, inside silent catch, never blocks or changes routing.
        try {
          const existingLogs = await base44.asServiceRole.entities.AIConversationLog.filter({ leadId }).catch(() => []);
          const existingLog = existingLogs[0];
          const linkagePayload = {
            leadId,
            coach_email: coachEmail,
            ai_status: action === 'escalate' ? 'AI_ESCALATED' : 'AI_ACTIVE',
            last_user_message: messageText?.slice(0, 500) || '',
            last_ai_reply: replyText?.slice(0, 500) || '',
            brain_config_id: brainConfig?.id || '',
            processed_at: new Date().toISOString(),
            send_status: gateResult?.queueId ? 'queued' : 'skipped',
          };
          if (existingLog?.id) {
            await base44.asServiceRole.entities.AIConversationLog.update(existingLog.id, linkagePayload).catch(() => {});
          } else {
            await base44.asServiceRole.entities.AIConversationLog.create(linkagePayload).catch(() => {});
          }
        } catch (_linkErr) {
          // Silent — linkage stamp failures NEVER affect production flow
        }
        // ── END ADDITIVE LINKAGE ──

      } catch (_debugErr) {
        // Silent — debug failures NEVER affect production flow
      }
    })();
    // ── END DEBUG COLLECTOR ───────────────────────────────────────────────────

    return Response.json({ 
      ok: true, 
      stage: 'complete',
      leadId, 
      action,
      queueId: gateResult?.queueId,
      reply_preview: replyText.substring(0, 100)
    });

  } catch (error) {
    console.error('[aiConversationAgent] ✗ FATAL ERROR:', error.message);
    return Response.json({ 
      ok: false, 
      stage: 'fatal_error',
      error: error.message
    }, { status: 200 });
  }
});