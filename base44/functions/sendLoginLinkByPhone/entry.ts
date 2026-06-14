import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { phone } = await req.json();
    if (!phone) return Response.json({ error: 'phone required' }, { status: 400 });

    // Normalize phone
    let normalizedPhone = phone.replace(/[\s-]/g, '');
    if (normalizedPhone.startsWith('0')) normalizedPhone = '+972' + normalizedPhone.slice(1);
    else if (!normalizedPhone.startsWith('+')) normalizedPhone = '+972' + normalizedPhone;

    // Find trainee by phone
    const allTrainees = await base44.asServiceRole.entities.Trainee.filter({});
    const trainee = allTrainees.find(t => {
      let p = (t.phone || '').replace(/[\s-]/g, '');
      if (p.startsWith('0')) p = '+972' + p.slice(1);
      else if (!p.startsWith('+')) p = '+972' + p;
      return p === normalizedPhone;
    });

    if (!trainee) return Response.json({ error: `לא נמצא מתאמן עם טלפון ${normalizedPhone}` }, { status: 404 });

    // Find the user account
    let traineeUser = null;
    if (trainee.user_id) {
      const users = await base44.asServiceRole.entities.User.filter({ id: trainee.user_id });
      traineeUser = users[0] || null;
    }
    if (!traineeUser && trainee.user_email) {
      const users = await base44.asServiceRole.entities.User.filter({ email: trainee.user_email.toLowerCase().trim() });
      traineeUser = users[0] || null;
    }

    if (!traineeUser) {
      // Auto-create user account for trainee
      console.log(`[sendLoginLinkByPhone] Creating missing user for ${trainee.user_email}`);
      try {
        traineeUser = await base44.asServiceRole.entities.User.create({
          email: trainee.user_email.toLowerCase().trim(),
          full_name: trainee.full_name,
          role: 'user',
        });
        // Link trainee to user
        await base44.asServiceRole.entities.Trainee.update(trainee.id, { user_id: traineeUser.id });
        console.log(`[sendLoginLinkByPhone] Created user ${traineeUser.id} and linked to trainee`);
      } catch (createErr) {
        return Response.json({ error: `לא ניתן ליצור חשבון: ${createErr.message}` }, { status: 500 });
      }
    }

    // Use trainee's invite_token if it exists, otherwise generate new one
    let accessToken = trainee.invite_token;
    if (!accessToken) {
      accessToken = `invite_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      try {
        await base44.asServiceRole.entities.Trainee.update(trainee.id, { invite_token: accessToken });
        console.log(`[sendLoginLinkByPhone] Generated new token for trainee: ${accessToken}`);
      } catch (tokenErr) {
        console.error(`[sendLoginLinkByPhone] Failed to save token: ${tokenErr.message}`);
        return Response.json({ error: 'Failed to generate invite token' }, { status: 500 });
      }
    }

    const appUrl = (Deno.env.get('BASE44_APP_URL') || 'https://successful-fit-coach-pro.base44.app').replace(/\/+$/, '');
    const accessLink = `${appUrl}/AccessLink?token=${accessToken}`;

    // Verify token is in URL
    if (!accessLink.includes('?token=')) {
      return Response.json({ error: 'Generated AccessLink missing token parameter' }, { status: 500 });
    }

    const firstName = (trainee.full_name || '').split(' ')[0];
    const message = `היי 👋
ברוכים הבאים ל-FIT COACH PRO 🎉

הנה הקישור האישי שלך לכניסה לאפליקציה:
${accessLink}

אחרי הכניסה הראשונית אפשר לשמור את האפליקציה במסך הבית ולהתחבר דרך Google.`;

    // Send via WhatsApp queue
    await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
      coach_email: user.email,
      to_phone_e164: normalizedPhone,
      to_name: trainee.full_name,
      context_type: 'trainee',
      context_id: trainee.id,
      rendered_text: message,
      provider_type: 'greenapi',
      status: 'queued',
      attempts: 0,
      scheduled_for: new Date().toISOString(),
    });

    // Trigger worker
    try {
      await base44.asServiceRole.functions.invoke('whatsAppQueueWorker', {});
    } catch (_) {}

    return Response.json({
      ok: true,
      traineeName: trainee.full_name,
      phone: normalizedPhone,
      loginLink,
      message: 'קישור נוצר ונשלח ב-WhatsApp'
    });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});