import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const timeout = 5000; // 5 seconds max
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // Admin only
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Race against timeout
    const result = await Promise.race([
      runDiagnostics(base44),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Diagnostics timeout after 5s')), timeout)
      )
    ]);

    return Response.json({
      ok: true,
      ...result,
      duration_ms: Date.now() - startTime
    });

  } catch (error) {
    return Response.json({
      ok: false,
      error: error.message,
      duration_ms: Date.now() - startTime
    }, { status: 500 });
  }
});

async function runDiagnostics(base44) {
  // Count notifications by status
  const allNotifications = await base44.entities.Notification.list('-created_date', 1000);
  
  const unreadCount = allNotifications.filter(n => n.status === 'unread').length;
  const readCount = allNotifications.filter(n => n.status === 'read').length;
  const archivedCount = allNotifications.filter(n => n.status === 'archived').length;

  // Find duplicates
  const fingerprints = {};
  let duplicatesCount = 0;
  
  for (const notif of allNotifications) {
    if (!notif.fingerprint) continue;
    
    if (!fingerprints[notif.fingerprint]) {
      fingerprints[notif.fingerprint] = 0;
    }
    fingerprints[notif.fingerprint]++;
  }

  for (const count of Object.values(fingerprints)) {
    if (count > 1) {
      duplicatesCount += (count - 1);
    }
  }

  // Get last 10 notifications
  const last10 = allNotifications.slice(0, 10).map(n => ({
    id: n.id,
    type: n.type,
    title: n.title_he,
    status: n.status,
    created: n.created_date,
    fingerprint: n.fingerprint
  }));

  // Check for errors (notifications with status issues)
  const orphanedReceipts = await base44.entities.NotificationReceipt.list('-created_date', 100);
  let orphanedCount = 0;
  
  for (const receipt of orphanedReceipts) {
    const notif = await base44.entities.Notification.filter({ id: receipt.notification_id });
    if (notif.length === 0) {
      orphanedCount++;
    }
  }

  // Latency stats (avg time between created_date and sent_at)
  const withSentAt = allNotifications.filter(n => n.sent_at && n.created_date);
  let avgLatencyMs = 0;
  
  if (withSentAt.length > 0) {
    const latencies = withSentAt.map(n => 
      new Date(n.sent_at) - new Date(n.created_date)
    );
    avgLatencyMs = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
  }

  return {
    totalNotifications: allNotifications.length,
    unreadCount,
    readCount,
    archivedCount,
    duplicatesFound: duplicatesCount,
    orphanedReceipts: orphanedCount,
    avgLatencyMs: Math.round(avgLatencyMs),
    last10Notifications: last10,
    lastError: null // TODO: Implement error tracking
  };
}