import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * FORENSIC FIX: Provision missing auth User for orphaned trainees
 * 
 * Root cause:
 * - Trainee record exists
 * - No corresponding User in auth system
 * - Cannot log in, cannot send magic link
 * 
 * This function:
 * 1. Checks if Trainee has no auth User
 * 2. Creates User with email from Trainee
 * 3. Links trainee.user_id to new User.id
 * 4. Trainee can now receive magic link
 * 
 * NOTE: User won't have password until SetPassword or first magic link login
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

    console.log('[PROVISION_USER] Processing:', traineeEmail);

    // STEP 1: Verify Trainee exists
    const trainees = await base44.asServiceRole.entities.Trainee.filter({ 
      user_email: traineeEmail 
    });

    if (trainees.length === 0) {
      return Response.json({ 
        error: 'trainee_not_found',
        message: `No trainee found for: ${traineeEmail}`
      }, { status: 404 });
    }

    const trainee = trainees[0];
    console.log('[PROVISION_USER] Trainee found:', { 
      id: trainee.id,
      email: trainee.user_email,
      full_name: trainee.full_name,
      user_id: trainee.user_id
    });

    // STEP 2: Check if User already exists
    const existingUsers = await base44.asServiceRole.entities.User.filter({ 
      email: traineeEmail 
    });

    if (existingUsers.length > 0) {
      console.log('[PROVISION_USER] User already exists');
      return Response.json({
        error: 'user_already_exists',
        message: 'Auth user already provisioned for this email',
        user_id: existingUsers[0].id
      }, { status: 409 });
    }

    console.log('[PROVISION_USER] No auth user found, creating User entity...');

    // STEP 3: Create User directly in User entity
    // NOTE: This bypasses the invite flow — user will be marked as registered
    const newUser = await base44.asServiceRole.entities.User.create({
      email: traineeEmail,
      full_name: trainee.full_name || traineeEmail.split('@')[0],
      role: 'user'
    });

    console.log('[PROVISION_USER] User created:', { id: newUser.id, email: newUser.email });
    console.log('[PROVISION_USER] New user created:', { id: newUser.id, email: newUser.email });

    // STEP 5: Link trainee to user
    await base44.asServiceRole.entities.Trainee.update(trainee.id, {
      user_id: newUser.id,
      status: 'active',
      deleted_at: null
    });

    console.log('[PROVISION_USER] Trainee linked:', { 
      trainee_id: trainee.id,
      user_id: newUser.id
    });

    return Response.json({
      success: true,
      message: 'Auth user provisioned and linked successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name
      },
      trainee: {
        id: trainee.id,
        email: traineeEmail,
        full_name: trainee.full_name,
        status: 'active'
      }
    });

  } catch (error) {
    console.error('[PROVISION_USER] Error:', error.message);
    return Response.json({ 
      error: 'server_error',
      message: error.message 
    }, { status: 500 });
  }
});