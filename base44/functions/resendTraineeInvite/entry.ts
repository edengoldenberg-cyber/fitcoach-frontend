import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { trainee_id, bulk } = await req.json();

    const appUrl = Deno.env.get('BASE44_APP_URL') || 'https://app.base44.com';
    const now = new Date().toISOString();
    const results = { sent: [], failed: [], skipped: [] };

    async function sendInviteToTrainee(trainee) {
      if (!trainee.user_email || !trainee.user_email.includes('@')) {
        results.failed.push({ id: trainee.id, name: trainee.full_name, error: 'invalid email' });
        await base44.asServiceRole.entities.Trainee.update(trainee.id, {
          invite_last_error: 'Invalid email address',
          invite_status: 'no_auth'
        }).catch(() => {});
        return;
      }

      const inviteLink = `${appUrl}/login?next=/`;

      const emailBody = `היי ${trainee.full_name || ''}!

כדי להפעיל את החשבון שלך ב-FitCoach Pro ולהתחיל לקבל תוכניות אימון ותזונה מותאמות אישית,
לחצו על הקישור הבא להשלמת ההרשמה:

${inviteLink}

אם הקישור לא עובד, העתיקו אותו לדפדפן ידנית.

לכל שאלה פנו למאמן שלכם.

בהצלחה! 💪
צוות FitCoach Pro`;

      try {
        // Use inviteUser to send platform invitation (works for users not yet in the app)
        await base44.users.inviteUser(trainee.user_email, 'user');

        await base44.asServiceRole.entities.Trainee.update(trainee.id, {
          invite_status: 'invited',
          invite_sent_at: now,
          invite_last_sent_at: now,
          invite_last_error: null
        });

        // Log
        await base44.asServiceRole.entities.AutomationLog.create({
          coach_email: trainee.coach_email,
          member_id: trainee.id,
          rule_id: 'resend_invite',
          member_name: trainee.full_name,
          rule_name: 'Resend Invite',
          trigger_type: 'invite_send',
          status: 'sent',
          message: `Invite email sent to ${trainee.user_email}`
        }).catch(() => {});

        results.sent.push({ id: trainee.id, name: trainee.full_name, email: trainee.user_email });

      } catch (emailErr) {
        await base44.asServiceRole.entities.Trainee.update(trainee.id, {
          invite_last_error: emailErr.message
        }).catch(() => {});

        await base44.asServiceRole.entities.AutomationLog.create({
          coach_email: trainee.coach_email,
          member_id: trainee.id,
          rule_id: 'resend_invite',
          member_name: trainee.full_name,
          rule_name: 'Resend Invite',
          trigger_type: 'invite_send',
          status: 'failed',
          message: `Failed to send invite to ${trainee.user_email}`,
          error: emailErr.message
        }).catch(() => {});

        results.failed.push({ id: trainee.id, name: trainee.full_name, error: emailErr.message });
      }
    }

    if (bulk) {
      // Send to all trainees with no_auth or missing user_id
      const allTrainees = await base44.asServiceRole.entities.Trainee.list();
      const targets = allTrainees.filter(t =>
        !t.user_id || t.invite_status === 'no_auth' || t.invite_status === 'invited'
      );

      for (const trainee of targets) {
        await sendInviteToTrainee(trainee);
      }
    } else {
      if (!trainee_id) {
        return Response.json({ error: 'trainee_id is required (or bulk=true)' }, { status: 400 });
      }
      const trainee = await base44.asServiceRole.entities.Trainee.get(trainee_id);
      if (!trainee) {
        return Response.json({ error: 'Trainee not found' }, { status: 404 });
      }
      await sendInviteToTrainee(trainee);
    }

    return Response.json({
      success: true,
      summary: {
        sent: results.sent.length,
        failed: results.failed.length,
        skipped: results.skipped.length
      },
      results
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});