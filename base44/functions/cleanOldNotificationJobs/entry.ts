import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { daysOld = 7 } = await req.json();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffStr = cutoffDate.toISOString();

    console.log(`[cleanOldNotificationJobs] Deleting jobs older than ${cutoffStr}`);

    // Get old jobs
    const allJobs = await base44.asServiceRole.entities.NotificationJob.filter({});
    const oldJobs = allJobs.filter(job => job.created_date < cutoffStr);

    console.log(`[cleanOldNotificationJobs] Found ${oldJobs.length} old jobs to delete`);

    // Delete old jobs
    for (const job of oldJobs) {
      await base44.asServiceRole.entities.NotificationJob.delete(job.id);
    }

    console.log(`[cleanOldNotificationJobs] ✅ Deleted ${oldJobs.length} old jobs`);

    return Response.json({
      success: true,
      deleted: oldJobs.length,
      message: `נמחקו ${oldJobs.length} התראות ישנות`
    });

  } catch (error) {
    console.error('[cleanOldNotificationJobs] Error:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});