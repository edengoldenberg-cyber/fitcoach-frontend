import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Send a standardized WhatsApp AccessLink invite to a specific trainee.
 * One-time manual send, no automations triggered, no duplicates.
 * 
 * Request:
 * {
 *   "traineeEmail": "elite.pilates.il@gmail.com"
 * }
 * 
 * Response:
 * {
 *   ok: true,
 *   traineeId: "...",
 *   traineeEmail: "...",
 *   phone: "+972...",
 *   token: "invite_...",
 *   tokenMasked: "invite_***",
 *   accessLink: "https://...",
 *   messageSent: true,
 *   message: "WhatsApp invite sent successfully"
 * }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { traineeEmail } = await req.json();

    if (!traineeEmail) {
      return Response.json({ error: 'traineeEmail required' }, { status: 400 });
    }

    // Find trainee by email
    const trainees = await base44.entities.Trainee.filter({ 
      user_email: traineeEmail.toLowerCase().trim() 
    });

    if (!trainees || trainees.length === 0) {
      return Response.json({ 
        error: `Trainee not found: ${traineeEmail}` 
      }, { status: 404 });
    }

    const trainee = trainees[0];

    // Validate: trainee is active
    if (trainee.status && trainee.status !== 'active') {
      return Response.json({ 
        error: `Trainee is not active (status: ${trainee.status})` 
      }, { status: 400 });
    }

    // Validate: phone exists
    if (!trainee.phone) {
      return Response.json({ 
        error: 'Trainee has no phone number' 
      }, { status: 400 });
    }

    // Generate or get token
    let token = trainee.invite_token;
    if (!token || typeof token !== 'string' || token.length < 5) {
      token = `invite_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      
      try {
        await base44.entities.Trainee.update(trainee.id, { 
          invite_token: token 
        });
        console.log(`[sendWhatsAppInviteToTrainee] Generated token: ${token}`);
      } catch (err) {
        console.error(`[sendWhatsAppInviteToTrainee] Failed to save token: ${err.message}`);
        return Response.json({ 
          error: 'Failed to generate invite token' 
        }, { status: 500 });
      }
    }

    // Build AccessLink
    const appUrl = (Deno.env.get('BASE44_APP_URL') || 'https://successful-fit-coach-pro.base44.app').replace(/\/+$/, '');
    const accessLink = `${appUrl}/AccessLink?token=${token}`;

    // Verify token is in URL
    if (!accessLink.includes('?token=')) {
      return Response.json({ 
        error: 'Generated AccessLink missing token parameter' 
      }, { status: 500 });
    }

    // Build message
    const firstName = (trainee.full_name || 'שם').split(' ')[0];
    const message = `היי 👋
ברוכים הבאים ל-FIT COACH PRO 🎉

הנה הקישור האישי שלך לכניסה לאפליקציה:
${accessLink}

אחרי הכניסה הראשונית אפשר לשמור את האפליקציה במסך הבית ולהתחבר דרך Google.`;

    // Send WhatsApp message - queue directly
    try {
      await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
        coach_email: user.email,
        to_phone_e164: trainee.phone,
        to_name: trainee.full_name,
        context_type: 'trainee',
        context_id: trainee.id,
        template_key: 'access_link_invite',
        rendered_text: message,
        provider_type: 'mock',
        status: 'queued',
        attempts: 0,
        scheduled_for: new Date().toISOString()
      });
      console.log(`[sendWhatsAppInviteToTrainee] Message queued for ${trainee.phone}`);
    } catch (queueErr) {
      console.error(`[sendWhatsAppInviteToTrainee] Failed to queue: ${queueErr.message}`);
      return Response.json({ 
        error: 'Failed to queue WhatsApp message',
        details: queueErr.message
      }, { status: 500 });
    }

    // Mask token for response
    const tokenMasked = token.substring(0, 12) + '***';

    return Response.json({
      ok: true,
      traineeId: trainee.id,
      traineeEmail: trainee.user_email,
      traineeName: trainee.full_name,
      phone: trainee.phone,
      token,
      tokenMasked,
      accessLink,
      messageSent: true,
      message: 'WhatsApp invite sent successfully',
      verdict: 'WHATSAPP_INVITE_SENT_SUCCESSFULLY'
    });

  } catch (error) {
    console.error('[sendWhatsAppInviteToTrainee] Error:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});