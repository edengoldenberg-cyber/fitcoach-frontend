import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { trainee_email, full_scan } = await req.json();

    console.log('━━━ HOME HEALTHCHECK START ━━━');
    console.log('Mode:', full_scan ? 'FULL SCAN' : 'SINGLE');
    console.log('Trainee Email:', trainee_email);

    // Get trainees to check
    let traineesToCheck = [];
    if (full_scan) {
      traineesToCheck = await base44.asServiceRole.entities.Trainee.filter({ 
        status: 'active' 
      });
      console.log('Full scan - checking', traineesToCheck.length, 'trainees');
    } else if (trainee_email) {
      const trainee = await base44.asServiceRole.entities.Trainee.filter({ 
        user_email: trainee_email 
      });
      traineesToCheck = trainee;
      console.log('Single check - found', trainee.length, 'trainee(s)');
    } else {
      return Response.json({ error: 'Must provide trainee_email or full_scan=true' }, { status: 400 });
    }

    const results = [];

    for (const trainee of traineesToCheck) {
      const report = {
        trainee_email: trainee.user_email,
        trainee_id: trainee.id,
        trainee_user_id: trainee.user_id || null,
        auth_user_id: null,
        status: 'PASS',
        failures: [],
        timestamp: new Date().toISOString()
      };

      console.log('\n--- Checking:', trainee.user_email, '---');

      // 1. Check auth user exists
      try {
        const authUsers = await base44.asServiceRole.entities.User.filter({ 
          email: trainee.user_email 
        });
        if (authUsers.length === 0) {
          report.failures.push({
            code: 'AUTH_USER_NOT_FOUND',
            message: 'משתמש לא קיים במערכת Authentication',
            technical_details: `No auth user found for email: ${trainee.user_email}`
          });
          report.status = 'FAIL';
        } else if (authUsers.length > 1) {
          report.failures.push({
            code: 'DUPLICATE_AUTH_USERS',
            message: 'מספר משתמשים עם אותו מייל במערכת',
            technical_details: `Found ${authUsers.length} auth users`
          });
          report.status = 'FAIL';
        } else {
          report.auth_user_id = authUsers[0].id;
          console.log('✓ Auth user found:', authUsers[0].id);
        }
      } catch (err) {
        report.failures.push({
          code: 'AUTH_QUERY_FAILED',
          message: 'שגיאה בשאילתת משתמש',
          technical_details: err.message
        });
        report.status = 'FAIL';
      }

      // 2. Check trainee record exists (already have it)
      console.log('✓ Trainee record exists');

      // 3. Check user_id match
      if (!trainee.user_id) {
        report.failures.push({
          code: 'MISSING_USER_ID',
          message: 'user_id חסר ברשומת המתאמן',
          technical_details: 'trainee.user_id is null/undefined'
        });
        report.status = 'FAIL';
        console.log('✗ Missing user_id');
      } else if (report.auth_user_id && trainee.user_id !== report.auth_user_id) {
        report.failures.push({
          code: 'USER_ID_MISMATCH',
          message: 'user_id לא תואם למשתמש Authentication',
          technical_details: `trainee.user_id (${trainee.user_id}) != auth.user_id (${report.auth_user_id})`
        });
        report.status = 'FAIL';
        console.log('✗ user_id mismatch');
      } else {
        console.log('✓ user_id valid:', trainee.user_id);
      }

      // 4. Check visible_modules
      if (!trainee.visible_modules || typeof trainee.visible_modules !== 'object') {
        report.failures.push({
          code: 'MISSING_VISIBLE_MODULES',
          message: 'visible_modules חסר או לא תקין',
          technical_details: 'trainee.visible_modules is null/undefined or not an object'
        });
        report.status = 'FAIL';
        console.log('✗ Missing visible_modules');
      } else if (Object.keys(trainee.visible_modules).length === 0) {
        report.failures.push({
          code: 'EMPTY_VISIBLE_MODULES',
          message: 'visible_modules ריק',
          technical_details: 'trainee.visible_modules is empty object'
        });
        report.status = 'FAIL';
        console.log('✗ Empty visible_modules');
      } else {
        console.log('✓ visible_modules valid');
      }

      // 5. Check home_layout
      if (!trainee.home_layout_version && !trainee.home_layout_config) {
        report.failures.push({
          code: 'MISSING_HOME_LAYOUT',
          message: 'home_layout חסר',
          technical_details: 'Both home_layout_version and home_layout_config are null/undefined'
        });
        report.status = 'FAIL';
        console.log('✗ Missing home_layout');
      } else {
        console.log('✓ home_layout exists');
      }

      // 6. Validate required data queries
      const today = new Date().toISOString().split('T')[0];
      
      // Water query
      try {
        await base44.asServiceRole.entities.WaterEntry.filter({
          trainee_email: trainee.user_email,
          date: today
        });
        console.log('✓ Water query OK');
      } catch (err) {
        report.failures.push({
          code: 'WATER_QUERY_FAILED',
          message: 'שגיאה בשאילתת מים',
          technical_details: err.message
        });
        report.status = 'FAIL';
      }

      // Meals query
      try {
        await base44.asServiceRole.entities.MealEntry.filter({
          trainee_email: trainee.user_email,
          date: today
        });
        console.log('✓ Meals query OK');
      } catch (err) {
        report.failures.push({
          code: 'MEALS_QUERY_FAILED',
          message: 'שגיאה בשאילתת ארוחות',
          technical_details: err.message
        });
        report.status = 'FAIL';
      }

      // Workouts query
      try {
        await base44.asServiceRole.entities.WorkoutSession.filter({
          trainee_email: trainee.user_email,
          date: today
        });
        console.log('✓ Workouts query OK');
      } catch (err) {
        report.failures.push({
          code: 'WORKOUTS_QUERY_FAILED',
          message: 'שגיאה בשאילתת אימונים',
          technical_details: err.message
        });
        report.status = 'FAIL';
      }

      // Metrics query
      try {
        await base44.asServiceRole.entities.BodyMeasurement.filter({
          trainee_email: trainee.user_email
        });
        console.log('✓ Metrics query OK');
      } catch (err) {
        report.failures.push({
          code: 'METRICS_QUERY_FAILED',
          message: 'שגיאה בשאילתת מדדים',
          technical_details: err.message
        });
        report.status = 'FAIL';
      }

      console.log('Status:', report.status, '| Failures:', report.failures.length);
      results.push(report);
    }

    console.log('━━━ HEALTHCHECK COMPLETE ━━━');
    console.log('Total checked:', results.length);
    console.log('Passed:', results.filter(r => r.status === 'PASS').length);
    console.log('Failed:', results.filter(r => r.status === 'FAIL').length);

    return Response.json({
      success: true,
      total_checked: results.length,
      passed: results.filter(r => r.status === 'PASS').length,
      failed: results.filter(r => r.status === 'FAIL').length,
      results
    });

  } catch (error) {
    console.error('Healthcheck error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});