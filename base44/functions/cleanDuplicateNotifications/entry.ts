import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // Admin only
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { trainee_email } = body;

    // Fetch notifications
    const query = trainee_email 
      ? { trainee_email } 
      : {};
    
    const notifications = await base44.entities.Notification.filter(query);
    
    console.log(`Scanning ${notifications.length} notifications...`);

    // Group by fingerprint
    const groups = {};
    for (const notif of notifications) {
      if (!notif.fingerprint) continue;
      
      if (!groups[notif.fingerprint]) {
        groups[notif.fingerprint] = [];
      }
      groups[notif.fingerprint].push(notif);
    }

    // Find duplicates (keep the earliest)
    let toDelete = [];
    for (const [fingerprint, group] of Object.entries(groups)) {
      if (group.length > 1) {
        // Sort by created_date (oldest first)
        group.sort((a, b) => 
          new Date(a.created_date) - new Date(b.created_date)
        );
        
        // Mark all except first for deletion
        toDelete = toDelete.concat(group.slice(1));
      }
    }

    console.log(`Found ${toDelete.length} duplicates to delete`);

    // Delete duplicates
    let deletedCount = 0;
    for (const notif of toDelete) {
      try {
        // Delete associated receipts
        const receipts = await base44.asServiceRole.entities.NotificationReceipt.filter({
          notification_id: notif.id
        });
        for (const receipt of receipts) {
          await base44.asServiceRole.entities.NotificationReceipt.delete(receipt.id);
        }
        
        // Delete notification
        await base44.asServiceRole.entities.Notification.delete(notif.id);
        deletedCount++;
      } catch (err) {
        console.error(`Failed to delete ${notif.id}:`, err.message);
      }
    }

    const duration = Date.now() - startTime;

    return Response.json({
      ok: true,
      scanned: notifications.length,
      duplicates_found: toDelete.length,
      deleted: deletedCount,
      kept: notifications.length - deletedCount,
      duration_ms: duration
    });

  } catch (error) {
    console.error('cleanDuplicateNotifications error:', error);
    return Response.json({
      ok: false,
      error: error.message,
      duration_ms: Date.now() - startTime
    }, { status: 500 });
  }
});