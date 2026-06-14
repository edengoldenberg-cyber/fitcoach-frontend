import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const coach = await base44.auth.me();

    if (!coach || coach.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const { traineeId, userId, createNew } = await req.json();

    if (!traineeId) {
      return Response.json({ error: 'traineeId required' }, { status: 400 });
    }

    // Get the trainee
    const trainee = await base44.asServiceRole.entities.Trainee.get(traineeId);
    if (!trainee) {
      return Response.json({ error: 'Trainee not found' }, { status: 404 });
    }

    if (createNew) {
      // Create a new auth user and link
      try {
        // Invite the user (creates auth user)
        await base44.users.inviteUser(trainee.user_email, 'user');
        
        // Wait a bit for user creation
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Find the created user
        const users = await base44.asServiceRole.entities.User.filter({ email: trainee.user_email });
        if (users.length === 0) {
          return Response.json({ 
            error: 'User created but not found - try manual linking', 
          }, { status: 500 });
        }
        
        const newUser = users[0];
        
        // Link trainee to user
        await base44.asServiceRole.entities.Trainee.update(traineeId, {
          user_id: newUser.id,
          invited_at: new Date().toISOString(),
        });

        return Response.json({
          success: true,
          message: 'User created and linked',
          user_id: newUser.id,
        });
      } catch (err) {
        return Response.json({ 
          error: 'Failed to create user: ' + err.message 
        }, { status: 500 });
      }
    } else if (userId) {
      // Link to existing user
      try {
        // Verify user exists
        const user = await base44.asServiceRole.entities.User.get(userId);
        if (!user) {
          return Response.json({ error: 'User not found' }, { status: 404 });
        }

        // Check for conflicts
        const conflictTrainees = await base44.asServiceRole.entities.Trainee.filter({ 
          user_id: userId 
        });
        
        if (conflictTrainees.length > 0 && !conflictTrainees.some(t => t.id === traineeId)) {
          return Response.json({ 
            error: 'This user is already linked to another trainee',
            conflict: conflictTrainees[0].full_name,
          }, { status: 409 });
        }

        // Link
        await base44.asServiceRole.entities.Trainee.update(traineeId, {
          user_id: userId,
        });

        return Response.json({
          success: true,
          message: 'Trainee linked to user',
          user_id: userId,
        });
      } catch (err) {
        return Response.json({ 
          error: 'Failed to link: ' + err.message 
        }, { status: 500 });
      }
    } else {
      return Response.json({ 
        error: 'Either userId or createNew must be provided' 
      }, { status: 400 });
    }

  } catch (error) {
    return Response.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
});