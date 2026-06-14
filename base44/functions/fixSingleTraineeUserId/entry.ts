import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { trainee_id } = await req.json();

    if (!trainee_id) {
      return Response.json({ error: 'trainee_id is required' }, { status: 400 });
    }

    const trainee = await base44.asServiceRole.entities.Trainee.get(trainee_id);
    if (!trainee) {
      return Response.json({ error: 'Trainee not found' }, { status: 404 });
    }

    // Already linked
    if (trainee.user_id) {
      await base44.asServiceRole.entities.Trainee.update(trainee_id, {
        invite_status: 'joined'
      });
      return Response.json({
        success: true,
        status: 'already_linked',
        user_id: trainee.user_id,
        message: 'כבר מקושר'
      });
    }

    // Find auth user by email
    const allUsers = await base44.asServiceRole.entities.User.list();
    const matchingUser = allUsers.find(
      u => u.email?.toLowerCase().trim() === trainee.user_email?.toLowerCase().trim()
    );

    const now = new Date().toISOString();

    if (!matchingUser) {
      await base44.asServiceRole.entities.Trainee.update(trainee_id, {
        invite_status: 'no_auth',
        invite_last_error: `No Auth user found for email: ${trainee.user_email} at ${now}`
      });

      // Log it
      await base44.asServiceRole.entities.AutomationLog.create({
        coach_email: trainee.coach_email,
        member_id: trainee_id,
        rule_id: 'fix_user_id',
        member_name: trainee.full_name,
        rule_name: 'Fix user_id',
        trigger_type: 'backfill_link',
        status: 'failed',
        message: `No Auth user found for ${trainee.user_email}`,
        error: `no_auth_user`
      }).catch(() => {});

      return Response.json({
        success: false,
        status: 'no_auth',
        message: 'לא נמצא משתמש Auth עם האימייל הזה'
      });
    }

    // Check for conflict
    const allTrainees = await base44.asServiceRole.entities.Trainee.list();
    const conflict = allTrainees.find(t => t.id !== trainee_id && t.user_id === matchingUser.id);
    if (conflict) {
      return Response.json({
        success: false,
        status: 'conflict',
        message: `user_id כבר שייך למתאמן אחר: ${conflict.full_name}`
      });
    }

    // Link!
    await base44.asServiceRole.entities.Trainee.update(trainee_id, {
      user_id: matchingUser.id,
      invite_status: 'joined',
      invite_last_error: null
    });

    // Log it
    await base44.asServiceRole.entities.AutomationLog.create({
      coach_email: trainee.coach_email,
      member_id: trainee_id,
      rule_id: 'fix_user_id',
      member_name: trainee.full_name,
      rule_name: 'Fix user_id',
      trigger_type: 'backfill_link',
      status: 'sent',
      message: `Linked user_id=${matchingUser.id} to trainee ${trainee.user_email}`
    }).catch(() => {});

    return Response.json({
      success: true,
      status: 'linked',
      user_id: matchingUser.id,
      message: 'קושר בהצלחה!'
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});