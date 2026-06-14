import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * DEPRECATED: createMagicLoginLink
 * 
 * This function previously generated /MagicLogin?token= links via LoginLink entity.
 * It is NOW REPLACED by the AccessLink system.
 * 
 * It now generates a proper /AccessLink?token= link using Trainee.invite_token.
 * LoginLink entity and /MagicLogin route are DEPRECATED.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { traineeEmail } = body;

    if (!traineeEmail) {
      return Response.json({ error: 'traineeEmail required' }, { status: 400 });
    }

    // Find trainee
    const trainees = await base44.asServiceRole.entities.Trainee.filter({ user_email: traineeEmail });
    if (trainees.length === 0) {
      return Response.json({ error: 'Trainee not found', message: 'המתאמן לא נמצא במערכת' }, { status: 404 });
    }

    const trainee = trainees[0];

    // Get or generate invite_token (source of truth: Trainee.invite_token)
    let token = trainee.invite_token;
    if (!token || typeof token !== 'string' || token.length < 5) {
      token = `invite_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      await base44.asServiceRole.entities.Trainee.update(trainee.id, { invite_token: token });
      console.log(`[createMagicLoginLink] Generated new invite_token for ${traineeEmail}`);
    }

    // Build AccessLink — ONLY valid format
    const appUrl = (Deno.env.get('BASE44_APP_URL') || 'https://successful-fit-coach-pro.base44.app').replace(/\/+$/, '');
    const loginUrl = `${appUrl}/AccessLink?token=${token}`;

    // Validate token is in URL
    if (!loginUrl.includes('?token=')) {
      return Response.json({ error: 'Generated URL missing token parameter' }, { status: 500 });
    }

    console.log(`[createMagicLoginLink] AccessLink generated for ${traineeEmail}: ${loginUrl.substring(0, 60)}...`);

    return Response.json({
      success: true,
      loginUrl,
      trainee_name: trainee.full_name,
      verdict: 'ACCESSLINK_SYSTEM_LOCKED'
    });

  } catch (error) {
    console.error('[createMagicLoginLink] Error:', error.message);
    return Response.json({ error: 'server_error', message: error.message }, { status: 500 });
  }
});