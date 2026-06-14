import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, Clock, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function WhatsAppControlSystemStatus({ coachEmail, autoRefresh }) {
  const { data: config } = useQuery({
    queryKey: ['whatsappConfig', coachEmail],
    queryFn: () => base44.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail }),
    select: (data) => data[0],
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const { data: latestQueue } = useQuery({
    queryKey: ['latestQueueMessages', coachEmail],
    queryFn: async () => {
      const items = await base44.entities.WhatsAppMessageQueue.filter({ coach_email: coachEmail });
      return items.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 100);
    },
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const { data: health } = useQuery({
    queryKey: ['systemHealth', coachEmail],
    queryFn: () => base44.entities.SystemHealth.filter({ coach_email: coachEmail }),
    select: (data) => data[0],
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const lastSuccess = latestQueue?.find(m => m.status === 'sent');
  const lastFailure = latestQueue?.find(m => m.status === 'failed');

  const isGreenApiConnected = config?.is_enabled && config?.provider_type === 'greenapi' && config?.instance_id;
  const webhookStatus = health?.lastInboundWebhookReceivedAt ? 'connected' : 'waiting';
  const workerStatus = latestQueue?.some(m => m.status === 'sending') ? 'active' : 'idle';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Green API Status */}
      <Card className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm font-medium text-slate-600">Green API</p>
            <p className="text-xs text-slate-500 mt-1">WhatsApp Provider</p>
          </div>
          {isGreenApiConnected ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-500" />
          )}
        </div>
        <Badge variant={isGreenApiConnected ? 'default' : 'destructive'} className="text-xs">
          {isGreenApiConnected ? 'Connected' : 'Disconnected'}
        </Badge>
        {isGreenApiConnected && (
          <p className="text-xs text-slate-500 mt-3">
            Instance: {config?.instance_id?.slice(-6) || 'N/A'}
          </p>
        )}
      </Card>

      {/* Webhook Status */}
      <Card className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm font-medium text-slate-600">Webhook</p>
            <p className="text-xs text-slate-500 mt-1">Inbound Messages</p>
          </div>
          {webhookStatus === 'connected' ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : (
            <Clock className="w-5 h-5 text-amber-500" />
          )}
        </div>
        <Badge variant={webhookStatus === 'connected' ? 'default' : 'outline'} className="text-xs">
          {webhookStatus === 'connected' ? 'Active' : 'Waiting'}
        </Badge>
        {health?.lastInboundWebhookReceivedAt && (
          <p className="text-xs text-slate-500 mt-3">
            {formatDistanceToNow(new Date(health.lastInboundWebhookReceivedAt), { addSuffix: true })}
          </p>
        )}
      </Card>

      {/* Worker Status */}
      <Card className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm font-medium text-slate-600">Worker</p>
            <p className="text-xs text-slate-500 mt-1">Queue Processing</p>
          </div>
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        </div>
        <Badge variant="default" className="text-xs">
          {workerStatus === 'active' ? 'Processing' : 'Idle'}
        </Badge>
        <p className="text-xs text-slate-500 mt-3">
          Last run: {lastSuccess?.last_attempt_at ? formatDistanceToNow(new Date(lastSuccess.last_attempt_at), { addSuffix: true }) : 'Never'}
        </p>
      </Card>

      {/* Queue Health */}
      <Card className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm font-medium text-slate-600">Queue</p>
            <p className="text-xs text-slate-500 mt-1">Health Score</p>
          </div>
          {latestQueue?.some(m => m.status === 'failed') ? (
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          )}
        </div>
        <Badge
          variant={latestQueue?.some(m => m.status === 'failed') ? 'outline' : 'default'}
          className="text-xs"
        >
          {latestQueue?.filter(m => m.status === 'failed').length || 0} Failed
        </Badge>
      </Card>
    </div>
  );
}