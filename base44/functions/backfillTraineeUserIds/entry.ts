import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const coach = await base44.auth.me();

    if (!coach || coach.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const results = {
      fixed: [],
      missingAuthUser: [],
      conflicts: [],
      alreadyLinked: [],
      errors: [],
    };

    // Get all trainees
    const trainees = await base44.asServiceRole.entities.Trainee.list();
    
    // Get all auth users
    const allUsers = await base44.asServiceRole.entities.User.list();
    
    for (const trainee of trainees) {
      try {
        // Skip if already has user_id
        if (trainee.user_id) {
          results.alreadyLinked.push({
            trainee_id: trainee.id,
            name: trainee.full_name,
            email: trainee.user_email,
            user_id: trainee.user_id,
          });
          continue;
        }

        // Find matching auth user by email
        const matchingUser = allUsers.find(u => u.email === trainee.user_email);
        
        if (!matchingUser) {
          // Mark as no_auth
          await base44.asServiceRole.entities.Trainee.update(trainee.id, {
            invite_status: 'no_auth',
          }).catch(() => {});

          results.missingAuthUser.push({
            trainee_id: trainee.id,
            name: trainee.full_name,
            email: trainee.user_email,
            message: 'No Auth user found with this email',
          });
          continue;
        }

        // Check if another trainee already linked to this user_id
        const conflict = trainees.find(t => 
          t.id !== trainee.id && 
          t.user_id === matchingUser.id
        );
        
        if (conflict) {
          results.conflicts.push({
            trainee_id: trainee.id,
            name: trainee.full_name,
            email: trainee.user_email,
            conflict_with: conflict.full_name,
            message: 'Another trainee already linked to this user_id',
          });
          continue;
        }

        // Link the trainee to the auth user
        await base44.asServiceRole.entities.Trainee.update(trainee.id, {
          user_id: matchingUser.id,
          invite_status: 'joined',
          invite_last_error: null,
        });

        // Log
        await base44.asServiceRole.entities.AutomationLog.create({
          coach_email: trainee.coach_email,
          member_id: trainee.id,
          rule_id: 'backfill_user_id',
          member_name: trainee.full_name,
          rule_name: 'Backfill user_id',
          trigger_type: 'backfill_link',
          status: 'sent',
          message: `Linked user_id=${matchingUser.id} to trainee ${trainee.user_email}`
        }).catch(() => {});

        results.fixed.push({
          trainee_id: trainee.id,
          name: trainee.full_name,
          email: trainee.user_email,
          user_id: matchingUser.id,
        });

      } catch (err) {
        results.errors.push({
          trainee_id: trainee.id,
          name: trainee.full_name,
          error: err.message,
        });
      }
    }

    return Response.json({
      success: true,
      summary: {
        total: trainees.length,
        fixed: results.fixed.length,
        missingAuthUser: results.missingAuthUser.length,
        conflicts: results.conflicts.length,
        alreadyLinked: results.alreadyLinked.length,
        errors: results.errors.length,
      },
      results,
    });

  } catch (error) {
    return Response.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
});