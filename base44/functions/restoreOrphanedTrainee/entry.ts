import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * FORENSIC FIX: Restore orphaned trainee records that have no user_id
 * 
 * Orphaned trainee = Trainee exists but user_id is NULL
 * This happens when:
 * 1. User deleted from auth system
 * 2. Trainee created before user linkage
 * 3. Sync failure between Auth and Trainee records
 * 
 * Action:
 * 1. Verify auth User exists by email
 * 2. Link trainee.user_id to auth User.id
 * 3. Restore status from deleted → active
 * 4. Clear whatsapp_notifications (avoid bombarding after restore)
 * 5. Return trainee ready for login
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { traineeEmail } = body;

    if (!traineeEmail) {
      return Response.json({ error: 'traineeEmail required' }, { status: 400 });
    }

    console.log('[RESTORE_ORPHAN] Processing:', traineeEmail);

    // STEP 1: Find Trainee record
    const trainees = await base44.asServiceRole.entities.Trainee.filter({ 
      user_email: traineeEmail 
    });

    if (trainees.length === 0) {
      return Response.json({ 
        error: 'trainee_not_found',
        message: `No trainee found for email: ${traineeEmail}`
      }, { status: 404 });
    }

    const trainee = trainees[0];
    console.log('[RESTORE_ORPHAN] Trainee found:', { 
      id: trainee.id, 
      status: trainee.status,
      user_id: trainee.user_id,
      deleted_at: trainee.deleted_at
    });

    // STEP 2: Find or create Auth User
    const users = await base44.asServiceRole.entities.User.filter({ 
      email: traineeEmail 
    });

    let authUser;
    if (users.length === 0) {
      console.log('[RESTORE_ORPHAN] Auth User missing - cannot restore (would need user creation)');
      return Response.json({
        error: 'user_not_found',
        message: `No auth user exists for email: ${traineeEmail}. User must be invited to the app first.`,
        action: 'INVITE_USER_FIRST'
      }, { status: 404 });
    }

    authUser = users[0];
    console.log('[RESTORE_ORPHAN] Auth user found:', { id: authUser.id, email: authUser.email });

    // STEP 3: Restore trainee
    const updateData = {
      user_id: authUser.id,  // Link to auth user
      status: 'active',      // Restore from deleted/inactive
      whatsapp_notifications_enabled: false,  // Safety: don't bombard after restore
      deleted_at: null
    };

    await base44.asServiceRole.entities.Trainee.update(trainee.id, updateData);
    
    console.log('[RESTORE_ORPHAN] Trainee restored:', { 
      id: trainee.id, 
      user_id: authUser.id,
      status: 'active'
    });

    return Response.json({
      success: true,
      message: 'Trainee successfully restored',
      trainee: {
        id: trainee.id,
        email: traineeEmail,
        fullName: trainee.full_name,
        status: 'active',
        user_id: authUser.id,
        restored_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[RESTORE_ORPHAN] Error:', error.message);
    return Response.json({ 
      error: 'server_error',
      message: error.message 
    }, { status: 500 });
  }
});