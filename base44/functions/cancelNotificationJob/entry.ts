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

    // Update status to cancelled
    await base44.asServiceRole.entities.NotificationJob.update(jobId, {
      status: 'cancelled'
    });

    console.log(`[cancelNotificationJob] Job ${jobId} cancelled`);

    return Response.json({
      success: true,
      message: 'התראה בוטלה'
    });

  } catch (error) {
    console.error('[cancelNotificationJob] Error:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});