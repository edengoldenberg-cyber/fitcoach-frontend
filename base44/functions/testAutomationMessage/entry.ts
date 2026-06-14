import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Normalize Israeli phone to E.164
function normalizePhone(phoneRaw) {
  if (!phoneRaw) return null;
  let s = String(phoneRaw).trim().replace(/[\s\-().,]/g, '').replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^972\d{9}$/.test(s)) s = '+' + s;
  if (/^0\d{9}$/.test(s)) s = '+972' + s.slice(1);
  if (/^\+972\d{9}$/.test(s)) return s;
  return null;
}

// Sample messages per automation type
const SAMPLE_TEXTS = {
  reminderMealLog: '🍽️ היי! שמנו לב שעוד לא רשמת ארוחות היום. כדאי לתעד כדי לעמוד ביעדים שלך 💪',
  reminderWaterLog: '💧 תזכורת! שתה מים — תכוון ל-2.5 ליטר היום. כבר שתית?',
  workoutMotivationCheck: '🏋️ יאללה! זמן לאימון. השבוע עוד יש לך זמן לסגור אימון איכותי 💥',
  weighInReminderScheduler: '⚖️ הגיע הזמן לשקילה שבועית! כדאי לשקול בבוקר על קיבה ריקה.',
  encouragementNotificationScheduler: '⭐ כל הכבוד על ההתמדה! אתה עושה עבודה מדהימה — המשך כך!',
  feedbackRequestScheduler: '📝 עברו 30 יום! ספר לנו — איך הולך התהליך? משוב קצר יעזור לנו להתאים לך עוד יותר.',
  weeklyMotivationSummary: '📊 סיכום שבועי: השבוע השלמת אימונים, הגעת ליעדי תזונה ושמרת על שתייה. עבודה מצוינת! 🎉',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { automationId, testPhone } = body;

    if (!automationId) {
      return Response.json({ success: false, error: 'automationId is required' }, { status: 400 });
    }

    // ── 1. Kill Switch check ─────────────────────────────────────────────────
    let killSwitchActive = true; // default safe
    try {
      const configs = await base44.asServiceRole.entities.SystemConfig.filter({ key: 'GLOBAL_WHATSAPP_ENABLED' });
      killSwitchActive = !(configs[0]?.value === true);
    } catch (_) {}

    if (killSwitchActive) {
      return Response.json({
        success: false,
        blocked: true,
        reason: 'KILL_SWITCH_ACTIVE',
        message: 'Global WhatsApp outbound is disabled. Enable it first.',
      });
    }

    // ── 2. Phone normalization ───────────────────────────────────────────────
    const rawPhone = testPhone || '0547598919';
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return Response.json({
        success: false,
        error: `Invalid phone number: ${rawPhone}`,
      });
    }

    // ── 3. Get coach provider ────────────────────────────────────────────────
    const providers = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: user.email });
    const provider = providers.find(p => p.is_enabled) || providers[0];

    if (!provider) {
      return Response.json({
        success: false,
        error: 'No WhatsApp provider configured for coach: ' + user.email,
      });
    }

    // ── 4. Build test message ────────────────────────────────────────────────
    const messageText = SAMPLE_TEXTS[automationId] || `🔔 הודעת טסט עבור אוטומציה: ${automationId}`;
    const preview = `[TEST] ${messageText}`;

    // ── 5. Direct send via sendWhatsAppMessage (bypasses queue/scheduler) ────
    const sendResult = await base44.functions.invoke('sendWhatsAppMessage', {
      coachEmail: user.email,
      toPhoneE164: phone,
      toName: 'טסט',
      text: preview,
      templateKey: `test_${automationId}`,
      contextType: 'system',
    });

    const data = sendResult?.data || sendResult || {};

    console.log(`[testAutomationMessage] automationId=${automationId} phone=${phone} ok=${data.ok} provider=${provider.provider_type}`);

    if (data.blocked) {
      return Response.json({
        success: false,
        blocked: true,
        reason: data.reason || 'KILL_SWITCH',
        phone,
      });
    }

    return Response.json({
      success: data.ok === true,
      testMode: provider.provider_type === 'mock',
      phone,
      preview: messageText,
      providerType: provider.provider_type,
      messageId: data.messageId || null,
      error: data.ok ? null : (data.message || data.error || 'Send failed'),
    });

  } catch (error) {
    console.error('[testAutomationMessage] error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});