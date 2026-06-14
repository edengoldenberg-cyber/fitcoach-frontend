import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Only admin can run this
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const report = {
      total: 0,
      linked: 0,
      created: 0,
      errors: [],
      skipped: 0
    };

    // Get all trainees
    const trainees = await base44.asServiceRole.entities.Trainee.list();
    report.total = trainees.length;

    // Get all auth users
    const allUsers = await base44.asServiceRole.entities.User.list();
    
    // Create email -> user map
    const usersByEmail = {};
    allUsers.forEach(u => {
      if (u.email) {
        usersByEmail[u.email.toLowerCase().trim()] = u;
      }
    });

    // Process each trainee
    for (const trainee of trainees) {
      try {
        // Skip if already has user_id
        if (trainee.user_id) {
          report.skipped++;
          continue;
        }

        const traineeEmail = trainee.user_email?.toLowerCase().trim();
        if (!traineeEmail) {
          report.errors.push({
            trainee_id: trainee.id,
            name: trainee.full_name,
            error: 'No email'
          });
          continue;
        }

        // Find matching auth user
        const authUser = usersByEmail[traineeEmail];
        
        if (authUser) {
          // Link existing trainee to auth user
          await base44.asServiceRole.entities.Trainee.update(trainee.id, {
            user_id: authUser.id
          });
          report.linked++;
        } else {
          // No auth user found - trainee hasn't logged in yet
          report.errors.push({
            trainee_id: trainee.id,
            name: trainee.full_name,
            email: traineeEmail,
            error: 'No matching auth user'
          });
        }
      } catch (err) {
        report.errors.push({
          trainee_id: trainee.id,
          name: trainee.full_name,
          error: err.message
        });
      }
    }

    return Response.json({
      success: true,
      report
    });
  } catch (error) {
    console.error('Sync error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});