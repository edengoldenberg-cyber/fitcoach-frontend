import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Generate a valid unique token for a trainee and save it to their record.
 * Returns the generated token or existing token.
 * 
 * Token format: invite_<timestamp>_<random6chars>
 * Example: invite_1714829040000_AB5XYZ
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { traineeId } = await req.json();

    if (!traineeId) {
      return Response.json({ error: 'traineeId required' }, { status: 400 });
    }

    // Get trainee
    const trainees = await base44.entities.Trainee.list();
    const trainee = trainees.find(t => t.id === traineeId);

    if (!trainee) {
      return Response.json({ error: 'Trainee not found' }, { status: 404 });
    }

    // If token exists and is valid, return it
    if (trainee.invite_token && typeof trainee.invite_token === 'string' && trainee.invite_token.length > 5) {
      console.log(`[generateTraineeToken] Token already exists: ${trainee.invite_token}`);
      return Response.json({
        ok: true,
        token: trainee.invite_token,
        traineeId,
        isNew: false
      });
    }

    // Generate new token
    const token = `invite_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // Save to trainee record
    await base44.entities.Trainee.update(traineeId, { invite_token: token });

    console.log(`[generateTraineeToken] Generated and saved token: ${token}`);

    return Response.json({
      ok: true,
      token,
      traineeId,
      isNew: true
    });

  } catch (error) {
    console.error('[generateTraineeToken] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});