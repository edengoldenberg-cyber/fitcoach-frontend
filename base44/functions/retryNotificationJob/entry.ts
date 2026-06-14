import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { jobId } = await req.json();

    if (!jobId) {
      return Response.json({ error: 'Missing jobId' }, { status: 400 });
    }

    // Get the job
    const jobs = await base44.asServiceRole.entities.NotificationJob.filter({ id: jobId });
    if (jobs.length === 0) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    const job = jobs[0];

    // Reset to queued status
    await base44.asServiceRole.entities.NotificationJob.update(jobId, {
      status: 'queued',
      error_code: null,
      error_message: null,
      scheduled_for: new Date().toISOString()
    });

    console.log(`[retryNotificationJob] Job ${jobId} reset to queued`);

    return Response.json({
      success: true,
      message: 'התראה הוחזרה לתור לשליחה מחדש'
    });

  } catch (error) {
    console.error('[retryNotificationJob] Error:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});