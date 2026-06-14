import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const allTrainees = await base44.asServiceRole.entities.Trainee.list();
    const problemTrainees = [];

    for (const trainee of allTrainees) {
      const issues = [];

      // Check missing user_id
      if (!trainee.user_id) {
        issues.push('missing_user_id');
      }

      // Check no matching auth user by email
      if (trainee.user_email) {
        try {
          // We can't directly query auth users, so we mark this as potential issue
          if (!trainee.user_id) {
            issues.push('no_user_id_link');
          }
        } catch {
          issues.push('auth_check_failed');
        }
      }

      // Check missing required fields
      if (!trainee.full_name) {
        issues.push('missing_full_name');
      }

      if (!trainee.target_calories || trainee.target_calories === 0) {
        issues.push('missing_goals');
      }

      // Check if visible_modules is malformed
      if (!trainee.visible_modules || typeof trainee.visible_modules !== 'object') {
        issues.push('missing_visible_modules');
      }

      if (issues.length > 0) {
        problemTrainees.push({
          id: trainee.id,
          full_name: trainee.full_name || 'ללא שם',
          user_email: trainee.user_email,
          user_id: trainee.user_id,
          issues
        });
      }
    }

    return Response.json({ trainees: problemTrainees, total: problemTrainees.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});