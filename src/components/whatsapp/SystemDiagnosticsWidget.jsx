import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatDistance } from 'date-fns';

export default function SystemDiagnosticsWidget({ coachEmail }) {
  const { data: providerConfig } = useQuery({
    queryKey: ['providerConfig', coachEmail],
    queryFn: () => base44.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail }).then(r => r[0]),
  });

  const { data: queueItems } = useQuery({
    queryKey: ['queue', coachEmail],
    queryFn: () => base44.entities.WhatsAppMessageQueue.filter({ coach_email: coachEmail }),
    refetchInterval: 5000,
  });

  const { data: systemHealth } = useQuery({
    queryKey: ['systemHealth', coachEmail],
    queryFn: () => base44.entities.SystemHealth.filter({ coach_email: coachEmail }).then(r => r[0]),
  });

  const queueBacklog = queueItems?.filter(q => q.status === 'queued').length || 0;

  const greenApiStatus = providerConfig?.status === 'connected' ? 'Connected' : providerConfig?.status || 'Not Configured';
  const greenApiHealthy = providerConfig?.status === 'connected';

  return (
    <div className="space-y-3">
      {/* Green API Status */}
      <Card className="p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-600">Green API Status</div>
            <div className="text-sm font-medium">{greenApiStatus}</div>
          </div>
          {greenApiHealthy ? (
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600" />
          )}
        </div>
      </Card>

      {/* Queue Backlog */}
      <Card className="p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-600">Queue Backlog</div>
            <div className="text-sm font-medium">{queueBacklog} messages</div>
          </div>
          {queueBacklog > 5 ? (
            <Badge className="bg-amber-100 text-amber-800">HIGH</Badge>
          ) : (
            <Badge className="bg-green-100 text-green-800">OK</Badge>
          )}
        </div>
      </Card>

      {/* Last Inbound Webhook */}
      <Card className="p-3">
        <div className="text-xs text-slate-600">Last Inbound Webhook</div>
        {systemHealth?.lastInboundWebhookReceivedAt ? (
          <div className="text-sm font-medium">
            {formatDistance(new Date(systemHealth.lastInboundWebhookReceivedAt), new Date(), { addSuffix: true })}
          </div>
        ) : (
          <div className="text-sm text-slate-500">No webhooks received</div>
        )}
      </Card>
    </div>
  );
}