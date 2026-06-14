import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { leadId } = await req.json();

    if (!leadId) return Response.json({ ok: false, error: 'Missing leadId' }, { status: 400 });

    // Load lead
    const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId }).catch(() => []);
    const lead = leads[0];
    if (!lead) return Response.json({ ok: false, error: 'Lead not found' });

    // Load last 30 messages
    const allMessages = await base44.asServiceRole.entities.LeadMessageThread.filter({ leadId }).catch(() => []);
    const sorted = allMessages.sort((a, b) => new Date(a.messageTimestamp || a.created_date) - new Date(b.messageTimestamp || b.created_date));
    const messages = sorted.slice(-30);

    if (messages.length === 0) {
      return Response.json({ ok: false, reason: 'No messages yet' });
    }

    // Build conversation text for LLM
    const conversationText = messages.map(m => {
      const who = m.direction === 'INBOUND' ? 'ליד' : 'מאמן/מערכת';
      const time = m.messageTimestamp ? new Date(m.messageTimestamp).toLocaleString('he-IL') : '';
      return `[${who}${time ? ' ' + time : ''}]: ${m.messageText}`;
    }).join('\n');

    const leadName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim();

    const prompt = `
אתה מנתח שיחות מכירה לסטודיו כושר. נתח את השיחה הבאה עם ליד בשם "${leadName}".

שיחה:
${conversationText}

סטטוס נוכחי של הליד: ${lead.status || 'לא ידוע'}
טמפרטורה: ${lead.leadTemperature || 'לא ידוע'}

החזר JSON עם השדות:
- summary: סיכום קצר של השיחה בעברית (2-3 משפטים)
- intent: הכוונה העיקרית של הליד (לדוגמה: "מתעניין", "מהסס", "רוצה מחיר", "מבקש שיחה", "לא רלוונטי")
- objectionType: ההתנגדות העיקרית אם קיימת (מחיר, זמן, ספק, אין התנגדות)
- sentiment: אחד מ: POSITIVE, NEUTRAL, NEGATIVE, MIXED
- closingLikelihood: מספר בין 1 ל-100 המייצג סיכוי לסגירה
- nextBestAction: הפעולה הבאה המומלצת (בעברית, קצר)
- coachRecommendation: המלצה למאמן (בעברית, 1-2 משפטים)
`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          intent: { type: 'string' },
          objectionType: { type: 'string' },
          sentiment: { type: 'string' },
          closingLikelihood: { type: 'number' },
          nextBestAction: { type: 'string' },
          coachRecommendation: { type: 'string' }
        }
      }
    });

    // Upsert ConversationAnalysis
    const existing = await base44.asServiceRole.entities.ConversationAnalysis.filter({ leadId }).catch(() => []);
    const analysisData = {
      leadId,
      coach_email: lead.coach_email,
      ...result,
      analyzedAt: new Date().toISOString()
    };

    if (existing.length > 0) {
      await base44.asServiceRole.entities.ConversationAnalysis.update(existing[0].id, analysisData);
    } else {
      await base44.asServiceRole.entities.ConversationAnalysis.create(analysisData);
    }

    console.log(`[analyzeConversation] Done for lead ${leadId}, likelihood=${result.closingLikelihood}`);
    return Response.json({ ok: true, leadId, analysis: result });
  } catch (error) {
    console.error('[analyzeConversation] Error:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});