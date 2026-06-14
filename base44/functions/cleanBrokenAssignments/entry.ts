import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // ADMIN ONLY
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Find all broken assignments (trainee_id is null or empty)
    const allAssignments = await base44.asServiceRole.entities.OnlineAssignment.list();
    const brokenAssignments = allAssignments.filter(a => !a.trainee_id);

    const deletedIds = [];
    const errors = [];

    // Delete broken assignments
    for (const assignment of brokenAssignments) {
      try {
        await base44.asServiceRole.entities.OnlineAssignment.delete(assignment.id);
        deletedIds.push(assignment.id);
      } catch (err) {
        errors.push({ id: assignment.id, error: err.message });
      }
    }

    return Response.json({
      success: true,
      message: `נמחקו ${deletedIds.length} שיוכים שבורים`,
      deleted_count: deletedIds.length,
      deleted_ids: deletedIds,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});