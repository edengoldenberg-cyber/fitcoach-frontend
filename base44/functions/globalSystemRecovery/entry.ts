import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const fixes = [];
    let fixedCount = 0;

    // 1) Backfill missing user_id
    const allTrainees = await base44.asServiceRole.entities.Trainee.list();
    
    for (const trainee of allTrainees) {
      if (!trainee.user_id && trainee.user_email) {
        // Try to find matching User entity by email
        try {
          const users = await base44.asServiceRole.entities.User.filter({ 
            email: trainee.user_email.toLowerCase().trim() 
          });
          
          if (users.length > 0) {
            await base44.asServiceRole.entities.Trainee.update(trainee.id, {
              user_id: users[0].id
            });
            fixes.push(`Fixed user_id for ${trainee.user_email}`);
            fixedCount++;
          }
        } catch (err) {
          fixes.push(`Failed to fix ${trainee.user_email}: ${err.message}`);
        }
      }

      // 2) Create default goals if missing
      if (!trainee.target_calories || trainee.target_calories === 0) {
        await base44.asServiceRole.entities.Trainee.update(trainee.id, {
          target_calories: 2000,
          target_protein: 150,
          target_carbs: 200,
          target_fat: 70,
          target_water_ml: 3000
        });
        fixes.push(`Set default goals for ${trainee.user_email}`);
        fixedCount++;
      }

      // 3) Ensure visible_modules exists + assign default home layout
      if (!trainee.visible_modules || typeof trainee.visible_modules !== 'object') {
        await base44.asServiceRole.entities.Trainee.update(trainee.id, {
          visible_modules: {
            nutrition: true,
            water: true,
            workouts: true,
            metrics: true
          },
          home_layout_version: 'default_v2',
          home_layout_config: {
            daily_macros_circles: true,
            today_workout_panel: true,
            water_tracker: true,
            daily_activity_panel: true,
            ai_coach_cta: true,
            smartwatch_connection_panel: true,
            goals_panel: true
          }
        });
        fixes.push(`Set visible_modules + default home layout for ${trainee.user_email}`);
        fixedCount++;
      }
    }

    // 4) Ensure default FoodUnits exist
    const units = await base44.asServiceRole.entities.FoodUnit.list();
    if (units.length === 0) {
      const defaultUnits = [
        { name_he: 'גרם', default_grams: 1 },
        { name_he: 'יחידה', default_grams: 100 },
        { name_he: 'כף', default_grams: 15 },
        { name_he: 'כפית', default_grams: 5 },
        { name_he: 'כוס', default_grams: 240 },
      ];
      
      for (const unit of defaultUnits) {
        await base44.asServiceRole.entities.FoodUnit.create(unit);
      }
      fixes.push('Created default food units');
      fixedCount++;
    }

    // Log the recovery action
    try {
      await base44.asServiceRole.entities.SystemAuditLog.create({
        action_type: 'GLOBAL_RECOVERY',
        actor_role: 'coach',
        actor_email: user.email,
        status: 'success',
        payload_summary: {
          fixes_count: fixedCount,
          fixes_list: fixes
        }
      });
    } catch {
      // Ignore logging errors
    }

    return Response.json({
      success: true,
      fixed: fixedCount,
      details: fixes
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});