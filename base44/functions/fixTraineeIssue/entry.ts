import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const DEFAULT_VISIBLE_MODULES = {
  nutrition: true,
  water: true,
  workouts: true,
  metrics: true
};

const DEFAULT_HOME_LAYOUT = {
  version: 'default_v2',
  config: {
    daily_macros_circles: true,
    today_workout_panel: true,
    water_tracker: true,
    daily_activity_panel: true,
    ai_coach_cta: true,
    smartwatch_connection_panel: false,
    goals_panel: true
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { trainee_email, fix_type, preview_only } = await req.json();

    console.log('━━━ FIX TRAINEE ISSUE ━━━');
    console.log('Email:', trainee_email);
    console.log('Fix Type:', fix_type);
    console.log('Preview Only:', preview_only);

    // Get trainee
    const trainees = await base44.asServiceRole.entities.Trainee.filter({ 
      user_email: trainee_email 
    });

    if (trainees.length === 0) {
      return Response.json({ error: 'Trainee not found' }, { status: 404 });
    }

    const trainee = trainees[0];
    const beforeState = {
      user_id: trainee.user_id,
      visible_modules: trainee.visible_modules,
      home_layout_version: trainee.home_layout_version,
      home_layout_config: trainee.home_layout_config
    };

    let changes = [];
    let updates = {};

    // FIX USER_ID
    if (fix_type === 'fix_user_id') {
      // Find auth user by email
      const authUsers = await base44.asServiceRole.entities.User.filter({ 
        email: trainee_email 
      });

      if (authUsers.length === 0) {
        return Response.json({ 
          error: 'No auth user found for this email',
          can_fix: false
        }, { status: 400 });
      }

      if (authUsers.length > 1) {
        return Response.json({ 
          error: 'Multiple auth users found - manual resolution required',
          can_fix: false,
          auth_users: authUsers.map(u => ({ id: u.id, email: u.email }))
        }, { status: 400 });
      }

      const authUser = authUsers[0];
      updates.user_id = authUser.id;
      changes.push(`Set user_id to ${authUser.id}`);
    }

    // FIX VISIBLE_MODULES
    if (fix_type === 'fix_visible_modules') {
      updates.visible_modules = DEFAULT_VISIBLE_MODULES;
      changes.push(`Set visible_modules to default: ${JSON.stringify(DEFAULT_VISIBLE_MODULES)}`);
    }

    // FIX HOME_LAYOUT
    if (fix_type === 'fix_home_layout') {
      updates.home_layout_version = DEFAULT_HOME_LAYOUT.version;
      updates.home_layout_config = DEFAULT_HOME_LAYOUT.config;
      changes.push(`Set home_layout_version to ${DEFAULT_HOME_LAYOUT.version}`);
      changes.push(`Set home_layout_config with default panels`);
    }

    // PREVIEW
    if (preview_only) {
      return Response.json({
        preview: true,
        trainee_email,
        trainee_id: trainee.id,
        before_state: beforeState,
        after_state: { ...beforeState, ...updates },
        changes_applied: changes
      });
    }

    // APPLY CHANGES
    console.log('Applying updates:', updates);
    await base44.asServiceRole.entities.Trainee.update(trainee.id, updates);
    console.log('✓ Updates applied');

    // LOG REPAIR
    await base44.asServiceRole.entities.RepairsLog.create({
      repair_type: fix_type,
      trainee_email,
      trainee_id: trainee.id,
      performed_by: user.email,
      before_state: beforeState,
      after_state: { ...beforeState, ...updates },
      changes_applied: changes,
      success: true
    });
    console.log('✓ Repair logged');

    return Response.json({
      success: true,
      trainee_email,
      trainee_id: trainee.id,
      changes_applied: changes,
      before_state: beforeState,
      after_state: { ...beforeState, ...updates }
    });

  } catch (error) {
    console.error('Fix error:', error);
    
    // Try to log failed repair
    try {
      const base44 = createClientFromRequest(req);
      const user = await base44.auth.me();
      const { trainee_email, fix_type } = await req.json();
      
      await base44.asServiceRole.entities.RepairsLog.create({
        repair_type: fix_type,
        trainee_email,
        performed_by: user.email,
        success: false,
        error_message: error.message
      });
    } catch (logErr) {
      console.error('Failed to log repair failure:', logErr);
    }

    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});