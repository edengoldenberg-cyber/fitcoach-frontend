import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import NotificationTimeline from '@/components/notifications/NotificationTimeline';

export default function TraineeNotificationTimeline({ trainee }) {
  const params = new URLSearchParams(window.location.search);
  const debug = params.get('notification_debug') === 'true';

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['traineeNotificationAuditLogs', trainee?.id, trainee?.user_email],
    queryFn: () => base44.entities.NotificationAuditLog.filter({ trainee_email: trainee.user_email }, '-created_at', 100),
    enabled: !!trainee?.user_email,
    initialData: [],
  });

  if (isLoading) {
    return <div className="p-6 text-center text-slate-500">טוען ציר התראות...</div>;
  }

  return <NotificationTimeline logs={logs} debug={debug} />;
}