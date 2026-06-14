import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { trainee_id, trainee_email, action, correlation_id } = await req.json();

    // Log the action start
    await base44.asServiceRole.entities.SystemAuditLog.create({
      debug_id: correlation_id || `FIX-${Date.now().toString(36).toUpperCase()}`,
      action_type: 'SYSTEM_FIX_CLICK',
      actor_role: 'coach',
      actor_email: user.email,
      trainee_email: trainee_email || null,
      status: 'success',
      details: {
        action,
        trainee_id: trainee_id || null,
      }
    });

    let result = { success: false };

    if (action === 'fix_user_id') {
      result = await fixUserId(base44, trainee_id, trainee_email, user.email, correlation_id);
    } else if (action === 'restore_home_modules') {
      result = await restoreHomeModules(base44, trainee_id, trainee_email, user.email, correlation_id);
    } else if (action === 'bulk_fix') {
      result = await bulkFix(base44, user.email, correlation_id);
    } else {
      return Response.json({ error: 'Unknown action' }, { status: 400 });
    }

    return Response.json(result);
  } catch (error) {
    console.error('fixTraineeUserIdAndModules error:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});

async function fixUserId(base44, traineeId, traineeEmail, actorEmail, correlationId) {
  try {
    // Get trainee
    const trainee = await base44.asServiceRole.entities.Trainee.get(traineeId);
    
    if (!trainee) {
      throw new Error('Trainee not found');
    }

    const beforeState = {
      user_id: trainee.user_id,
      user_email: trainee.user_email,
      visible_modules: trainee.visible_modules,
    };

    // Find auth user by email
    const normalizedEmail = (trainee.user_email || traineeEmail).toLowerCase().trim();
    let authUser = null;

    try {
      // Use filter instead of list to find user by email
      const users = await base44.asServiceRole.entities.User.filter({ email: normalizedEmail });
      authUser = users[0] || null;
      
      if (!authUser) {
        // Try case-insensitive search by getting all and filtering
        const allUsers = await base44.asServiceRole.entities.User.list();
        authUser = allUsers.find(u => u.email?.toLowerCase().trim() === normalizedEmail);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }

    if (!authUser) {
      // Cannot auto-create auth user - requires user login
      await base44.asServiceRole.entities.SystemAuditLog.create({
        debug_id: correlationId || `FIX-ERROR-${Date.now().toString(36).toUpperCase()}`,
        action_type: 'SYSTEM_FIX_ERROR',
        actor_role: 'coach',
        actor_email: actorEmail,
        trainee_email: normalizedEmail,
        status: 'fail',
        error_code: 'NO_AUTH_USER',
        error_message_he: 'לא נמצא משתמש Auth - נדרש כניסה ראשונה של המתאמן',
        details: { trainee_id: traineeId }
      });

      return {
        success: false,
        error: 'NO_AUTH_USER',
        message: 'Cannot auto-fix: Auth user does not exist. Trainee must login first.',
        trainee_id: traineeId,
      };
    }

    // Update trainee with user_id
    const updates = {
      user_id: authUser.id,
      user_email: normalizedEmail,
    };

    // If visible_modules is missing, add defaults
    if (!trainee.visible_modules || Object.keys(trainee.visible_modules).length === 0) {
      updates.visible_modules = {
        nutrition: true,
        water: true,
        workouts: true,
        metrics: true,
      };
    }

    await base44.asServiceRole.entities.Trainee.update(traineeId, updates);

    const afterState = {
      user_id: authUser.id,
      user_email: normalizedEmail,
      visible_modules: updates.visible_modules || trainee.visible_modules,
    };

    // Log success
    await base44.asServiceRole.entities.SystemAuditLog.create({
      debug_id: correlationId || `FIX-OK-${Date.now().toString(36).toUpperCase()}`,
      action_type: 'FIX_USER_ID',
      actor_role: 'coach',
      actor_email: actorEmail,
      trainee_email: normalizedEmail,
      status: 'success',
      details: {
        trainee_id: traineeId,
        before_state: beforeState,
        after_state: afterState,
      }
    });

    return {
      success: true,
      trainee_id: traineeId,
      updated_fields: updates,
      before_state: beforeState,
      after_state: afterState,
      issues_fixed: ['missing_user_id', !trainee.visible_modules ? 'missing_visible_modules' : null].filter(Boolean),
    };
  } catch (error) {
    await base44.asServiceRole.entities.SystemAuditLog.create({
      debug_id: correlationId || `FIX-ERROR-${Date.now().toString(36).toUpperCase()}`,
      action_type: 'SYSTEM_FIX_ERROR',
      actor_role: 'coach',
      actor_email: actorEmail,
      trainee_email: traineeEmail,
      status: 'fail',
      error_code: 'FIX_FAILED',
      error_message_he: error.message,
      details: { trainee_id: traineeId, stack: error.stack }
    });

    throw error;
  }
}

async function restoreHomeModules(base44, traineeId, traineeEmail, actorEmail, correlationId) {
  try {
    const trainee = await base44.asServiceRole.entities.Trainee.get(traineeId);
    
    if (!trainee) {
      throw new Error('Trainee not found');
    }

    const beforeState = {
      visible_modules: trainee.visible_modules,
      home_layout_version: trainee.home_layout_version,
      home_layout_config: trainee.home_layout_config,
    };

    const defaultModules = {
      nutrition: true,
      water: true,
      workouts: true,
      metrics: true,
    };

    const defaultLayoutConfig = {
      daily_macros_circles: true,
      today_workout_panel: true,
      water_tracker: true,
      daily_activity_panel: true,
      ai_coach_cta: true,
      smartwatch_connection_panel: false,
      goals_panel: true,
    };

    const updates = {
      visible_modules: defaultModules,
      home_layout_version: trainee.home_layout_version || 'default_v2',
      home_layout_config: trainee.home_layout_config || defaultLayoutConfig,
    };

    await base44.asServiceRole.entities.Trainee.update(traineeId, updates);

    const afterState = {
      visible_modules: defaultModules,
      home_layout_version: updates.home_layout_version,
      home_layout_config: updates.home_layout_config,
    };

    await base44.asServiceRole.entities.SystemAuditLog.create({
      debug_id: correlationId || `FIX-MODULES-${Date.now().toString(36).toUpperCase()}`,
      action_type: 'RESTORE_HOME_MODULES',
      actor_role: 'coach',
      actor_email: actorEmail,
      trainee_email: trainee.user_email,
      status: 'success',
      details: {
        trainee_id: traineeId,
        before_state: beforeState,
        after_state: afterState,
      }
    });

    return {
      success: true,
      trainee_id: traineeId,
      updated_fields: updates,
      before_state: beforeState,
      after_state: afterState,
      issues_fixed: ['missing_visible_modules'],
    };
  } catch (error) {
    await base44.asServiceRole.entities.SystemAuditLog.create({
      debug_id: correlationId || `FIX-ERROR-${Date.now().toString(36).toUpperCase()}`,
      action_type: 'SYSTEM_FIX_ERROR',
      actor_role: 'coach',
      actor_email: actorEmail,
      trainee_email: traineeEmail,
      status: 'fail',
      error_code: 'RESTORE_MODULES_FAILED',
      error_message_he: error.message,
      details: { trainee_id: traineeId, stack: error.stack }
    });

    throw error;
  }
}

async function bulkFix(base44, actorEmail, correlationId) {
  const results = {
    total: 0,
    fixed: 0,
    failed: 0,
    skipped: 0,
    details: [],
  };

  try {
    // Get all problem trainees
    const allTrainees = await base44.asServiceRole.entities.Trainee.filter({ status: 'active' });
    
    for (const trainee of allTrainees) {
      results.total++;

      const issues = [];
      if (!trainee.user_id) issues.push('missing_user_id');
      if (!trainee.visible_modules || Object.keys(trainee.visible_modules).length === 0) issues.push('missing_visible_modules');

      if (issues.length === 0) {
        results.skipped++;
        continue;
      }

      try {
        // Try to fix user_id first
        if (issues.includes('missing_user_id')) {
          const fixResult = await fixUserId(base44, trainee.id, trainee.user_email, actorEmail, correlationId);
          if (fixResult.success) {
            results.fixed++;
            results.details.push({
              trainee_id: trainee.id,
              email: trainee.user_email,
              fixed: fixResult.issues_fixed,
            });
          } else {
            results.failed++;
            results.details.push({
              trainee_id: trainee.id,
              email: trainee.user_email,
              error: fixResult.error,
              message: fixResult.message,
            });
          }
        } else if (issues.includes('missing_visible_modules')) {
          // Only restore modules
          const fixResult = await restoreHomeModules(base44, trainee.id, trainee.user_email, actorEmail, correlationId);
          if (fixResult.success) {
            results.fixed++;
            results.details.push({
              trainee_id: trainee.id,
              email: trainee.user_email,
              fixed: fixResult.issues_fixed,
            });
          }
        }
      } catch (err) {
        results.failed++;
        results.details.push({
          trainee_id: trainee.id,
          email: trainee.user_email,
          error: err.message,
        });
      }
    }

    await base44.asServiceRole.entities.SystemAuditLog.create({
      debug_id: correlationId || `BULK-FIX-${Date.now().toString(36).toUpperCase()}`,
      action_type: 'BULK_FIX',
      actor_role: 'coach',
      actor_email: actorEmail,
      status: 'success',
      details: {
        total: results.total,
        fixed: results.fixed,
        failed: results.failed,
        skipped: results.skipped,
      }
    });

    return {
      success: true,
      ...results,
    };
  } catch (error) {
    await base44.asServiceRole.entities.SystemAuditLog.create({
      debug_id: correlationId || `BULK-ERROR-${Date.now().toString(36).toUpperCase()}`,
      action_type: 'BULK_FIX_ERROR',
      actor_role: 'coach',
      actor_email: actorEmail,
      status: 'fail',
      error_code: 'BULK_FIX_FAILED',
      error_message_he: error.message,
      details: { stack: error.stack }
    });

    throw error;
  }
}