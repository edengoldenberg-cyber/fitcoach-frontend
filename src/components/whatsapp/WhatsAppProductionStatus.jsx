import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, AlertCircle, Clock, MessageSquare, Send, Bot, RefreshCw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function WhatsAppProductionStatus({ coachEmail }) {
  const { data: systemHealth, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['systemHealth', coachEmail],
    queryFn: async () => {
      const records = await base44.entities.SystemHealth.filter({ coach_email: coachEmail });
      return records[0] || null;
    },
    refetchInterval: 10000, // Poll every 10s
    retry: false
  });

  const { data: recentLogs, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['whatsappDiagLogs', coachEmail],
    queryFn: async () => {
      const logs = await base44.entities.WhatsAppDiagnosticsLog.filter({ coach_email: coachEmail });
      return logs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 20);
    },
    refetchInterval: 10000,
    retry: false
  });

  const { data: recentMessages, isLoading: msgsLoading, refetch: refetchMessages } = useQuery({
    queryKey: ['recentLeadMessages', coachEmail],
    queryFn: async () => {
      const msgs = await base44.entities.LeadMessageThread.list('-created_date', 10);
      return msgs.filter(m => m.coach_email === coachEmail);
    },
    refetchInterval: 10000,
    retry: false
  });

  const { data: queueStatus, isLoading: queueLoading, refetch: refetchQueue } = useQuery({
    queryKey: ['whatsappQueue', coachEmail],
    queryFn: async () => {
      const queued = await base44.entities.WhatsAppMessageQueue.filter({ 
        coach_email: coachEmail, 
        status: 'queued' 
      });
      const sending = await base44.entities.WhatsAppMessageQueue.filter({ 
        coach_email: coachEmail, 
        status: 'sending' 
      });
      const failed = await base44.entities.WhatsAppMessageQueue.filter({ 
        coach_email: coachEmail, 
        status: 'failed' 
      });
      return { queued: queued.length, sending: sending.length, failed: failed.length };
    },
    refetchInterval: 10000,
    retry: false
  });

  const handleRefresh = () => {
    refetchHealth();
    refetchLogs();
    refetchMessages();
    refetchQueue();
  };

  if (healthLoading || logsLoading || msgsLoading || queueLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const pipelineStatus = systemHealth?.inboundPipelineStatus || 'NOT_RECEIVED';
  const lastReceived = systemHealth?.lastInboundWebhookReceivedAt;
  const lastLeadId = systemHealth?.lastInboundWebhookLeadId;
  const lastError = systemHealth?.lastInboundFailureReason;

  const statusConfig = {
    'NOT_RECEIVED': { color: 'bg-slate-100 text-slate-700', icon: Clock, label: 'Waiting' },
    'RECEIVED_NOT_PARSED': { color: 'bg-yellow-100 text-yellow-700', icon: AlertCircle, label: 'Parse Error' },
    'PARSED_NOT_MATCHED': { color: 'bg-orange-100 text-orange-700', icon: AlertCircle, label: 'No Lead Match' },
    'MATCHED_SUCCESSFULLY': { color: 'bg-green-100 text-green-700', icon: CheckCircle2, label: 'Success' }
  };

  const currentStatus = statusConfig[pipelineStatus] || statusConfig['NOT_RECEIVED'];
  const StatusIcon = currentStatus.icon;

  const eventTypeColors = {
    'INBOUND_RAW': 'bg-blue-100 text-blue-800',
    'LEAD_MATCH_SUCCESS': 'bg-green-100 text-green-800',
    'LEAD_NOT_FOUND': 'bg-red-100 text-red-800',
    'INBOUND_DUPLICATE_SKIPPED': 'bg-yellow-100 text-yellow-800',
    'SEND_SUCCESS': 'bg-green-100 text-green-800',
    'SEND_FAIL': 'bg-red-100 text-red-800',
    'SEND_ATTEMPT': 'bg-blue-100 text-blue-800',
    'AI_AUTOMATION_TRIGGERED': 'bg-purple-100 text-purple-800',
    'AI_AUTOMATION_SKIPPED': 'bg-slate-100 text-slate-800'
  };

  return (
    <div className="space-y-4">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Production Status Dashboard</h3>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Pipeline Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Inbound Pipeline Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-lg ${currentStatus.color}`}>
                <StatusIcon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-medium">{currentStatus.label}</div>
                <div className="text-sm text-slate-500">
                  {lastReceived ? `Last: ${new Date(lastReceived).toLocaleString('he-IL')}` : 'No messages received yet'}
                </div>
              </div>
            </div>

            {lastLeadId && (
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-sm font-medium text-slate-700">Last Lead ID</div>
                <div className="text-xs text-slate-500 font-mono">{lastLeadId}</div>
              </div>
            )}

            {lastError && (
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <div className="text-sm font-medium text-red-700 flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  Last Error
                </div>
                <div className="text-xs text-red-600 mt-1">{lastError}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Queue Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            Outbound Queue Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 bg-blue-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-blue-700">{queueStatus?.queued || 0}</div>
              <div className="text-xs text-blue-600">Queued</div>
            </div>
            <div className="p-3 bg-yellow-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-yellow-700">{queueStatus?.sending || 0}</div>
              <div className="text-xs text-yellow-600">Sending</div>
            </div>
            <div className="p-3 bg-red-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-red-700">{queueStatus?.failed || 0}</div>
              <div className="text-xs text-red-600">Failed</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Messages Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Recent Messages
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px]">
            {recentMessages && recentMessages.length > 0 ? (
              <div className="space-y-2">
                {recentMessages.map((msg) => (
                  <div key={msg.id} className="p-2 bg-slate-50 rounded text-xs border">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={msg.direction === 'INBOUND' ? 'default' : 'secondary'}>
                        {msg.direction}
                      </Badge>
                      <span className="text-slate-500">{new Date(msg.created_date).toLocaleTimeString('he-IL')}</span>
                      <span className="text-slate-500 font-mono text-[10px]">{msg.leadId?.slice(-6)}</span>
                    </div>
                    <div className="text-slate-700 truncate">{msg.messageText}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-slate-500 py-8">No recent messages</div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Diagnostic Logs Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            Diagnostic Logs (Last 20)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            {recentLogs && recentLogs.length > 0 ? (
              <div className="space-y-2">
                {recentLogs.map((log) => (
                  <div key={log.id} className="p-2 bg-slate-50 rounded text-xs border">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={eventTypeColors[log.event] || 'bg-slate-100 text-slate-800'}>
                        {log.event}
                      </Badge>
                      <span className="text-slate-500">{new Date(log.created_date).toLocaleTimeString('he-IL')}</span>
                    </div>
                    {log.payload && (
                      <div className="text-slate-600 text-[10px] font-mono mt-1 overflow-x-auto">
                        {JSON.stringify(log.payload, null, 2).slice(0, 200)}
                        {JSON.stringify(log.payload).length > 200 && '...'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-slate-500 py-8">No diagnostic logs yet</div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}