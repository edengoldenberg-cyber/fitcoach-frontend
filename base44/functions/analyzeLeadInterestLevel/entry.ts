import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ── AI-Based Interest Level Analysis ──────────────────────────────────────────
// Automatically tags leads based on WhatsApp conversation sentiment/intent
// Adds 'interestLevel' field: HOT, WARM, COLD, SKEPTICAL, UNRESPONSIVE

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leadId } = await req.json();
    
    if (!leadId) {
      return Response.json({ error: 'Missing leadId' }, { status: 400 });
    }

    // Get lead
    const lead = await base44.entities.Lead.get(leadId);
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Get conversation history
    const messages = await base44.entities.LeadMessageThread.filter({ leadId });
    
    if (messages.length === 0) {
      return Response.json({ 
        ok: true, 
        interestLevel: 'COLD',
        reason: 'אין שיחות',
        details: 'לא התקבלה אף הודעה מהליד'
      });
    }

    // Get only inbound messages (from lead)
    const inboundMessages = messages
      .filter(m => m.direction === 'INBOUND')
      .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

    if (inboundMessages.length === 0) {
      return Response.json({ 
        ok: true, 
        interestLevel: 'UNRESPONSIVE',
        reason: 'לא הגיב',
        details: 'הליד לא הגיב לאף הודעה'
      });
    }

    // Prepare conversation for AI analysis
    const conversationText = inboundMessages
      .map(m => m.messageText)
      .join('\n');

    // Call AI to analyze interest level
    const analysis = await base44.integrations.Core.InvokeLLM({
      prompt: `אתה מנתח עניין של לידים בתחום הכושר והאימונים.

קרא את ההודעות הבאות מליד וקבע את רמת העניין שלו:

הודעות הליד:
${conversationText}

קבע את רמת העניין לפי קטגוריות:
- HOT: מעוניין מאוד, שואל על מחירים, רוצה להתחיל, מזמין שיחה
- WARM: מעוניין, שואל שאלות, רוצה לשמוע עוד פרטים
- SKEPTICAL: מהסס, מעלה התנגדויות, לא בטוח
- COLD: לא מעוניין במיוחד, מנומס אבל רחוק
- UNRESPONSIVE: לא מגיב או מגיב בהתחמקות

החזר JSON עם:
{
  "interestLevel": "HOT/WARM/SKEPTICAL/COLD/UNRESPONSIVE",
  "confidence": 0-100,
  "reasoning": "הסבר קצר למה הגעת למסקנה הזו",
  "keyIndicators": ["מחרוזות או ביטויים מרכזיים שהובילו להחלטה"]
}`,
      response_json_schema: {
        type: "object",
        properties: {
          interestLevel: { 
            type: "string",
            enum: ["HOT", "WARM", "SKEPTICAL", "COLD", "UNRESPONSIVE"]
          },
          confidence: { type: "number" },
          reasoning: { type: "string" },
          keyIndicators: { 
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["interestLevel", "confidence", "reasoning"]
      }
    });

    // Update lead with AI analysis
    const updated = await base44.entities.Lead.update(leadId, {
      leadTemperature: analysis.interestLevel,
      intelligence: {
        ...lead.intelligence,
        aiInterestAnalysis: {
          level: analysis.interestLevel,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          keyIndicators: analysis.keyIndicators || [],
          analyzedAt: new Date().toISOString(),
          messageCount: inboundMessages.length
        }
      }
    });

    return Response.json({
      ok: true,
      lead: updated,
      analysis: {
        interestLevel: analysis.interestLevel,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        keyIndicators: analysis.keyIndicators,
        messageCount: inboundMessages.length
      }
    });

  } catch (error) {
    console.error('analyzeLeadInterestLevel error:', error);
    return Response.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 });
  }
});