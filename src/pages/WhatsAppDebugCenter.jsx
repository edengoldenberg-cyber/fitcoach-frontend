import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle, Clock, Zap, Activity } from 'lucide-react';
import { toast } from 'sonner';
import WACDSummaryBar from '@/components/wacd/WACDSummaryBar';
import WACDMessageAudit from '@/components/wacd/WACDMessageAudit';
import WACDDuplicates from '@/components/wacd/WACDDuplicates';
import WACDAutomations from '@/components/wacd/WACDAutomations';
import WACDBlocked from '@/components/wacd/WACDBlocked';
import WACDQueue from '@/components/wacd/WACDQueue';

const TODAY = new Date().toISOString().split('T')[0];

export default function WhatsAppDebugCenter() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('audit');

  // ─── Data sources ─────────────────────────────────────────
  const { data: eventLogs = [], isLoading: loadingEvents } = useQuery({
    queryKey: ['wacd_eventlogs'],
    queryFn: () => base44.entities.WhatsAppEventLog.filter({}, '-timestamp', 500),
    refetchInterval: 30000,
  });

  const { data: performance = [], isLoading: loadingPerf } = useQuery({
    queryKey: ['wacd_performance'],
    queryFn: () => base44.entities.WhatsAppPerformance.filter({}, '-message_sent_at', 500),
    refetchInterval: 30000,
  });

  const { data: queue = [], isLoading: loadingQueue } = useQuery({
    queryKey: ['wacd_queue'],
    queryFn: () => base44.entities.WhatsAppMessageQueue.filter({}, '-created_date', 300),
    refetchInterval: 15000,
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['wacd_trainees'],
    queryFn: () => base44.entities.Trainee.filter({ status: 'active' }),
  });

  const { data: sysConfigs = [] } = useQuery({
    queryKey: ['wacd_sysconfig'],
    queryFn: () => base44.entities.SystemConfig.filter({}),
  });

  const { data: providerConfig = [] } = useQuery({
    queryKey: ['wacd_provider'],
    queryFn: () => base44.entities.WhatsAppProviderConfig.filter({}),
  });

  // ─── Derived today data ────────────────────────────────────
  const todayEventLogs = useMemo(() =>
    eventLogs.filter(e => e.timestamp?.startsWith(TODAY)), [eventLogs]);

  const todayPerformance = useMemo(() =>
    performance.filter(p => p.message_sent_at?.startsWith(TODAY)), [performance]);

  const todayQueue = useMemo(() =>
    queue.filter(q => q.created_date?.startsWith(TODAY)), [queue]);

  // Kill switch
  const killSwitch = sysConfigs.find(c => c.key === 'WHATSAPP_REMINDERS_ENABLED');
  const killSwitchOn = killSwitch ? killSwitch.value !== false && killSwitch.value !== 'false' : true;

  // GreenAPI
  const provider = providerConfig[0];
  const greenApiOk = provider?.status === 'connected' && provider?.is_enabled;

  // Trainee map for display
  const traineeMap = useMemo(() => {
    const m = {};
    trainees.forEach(t => { m[t.id] = t; m[t.user_email] = t; });
    return m;
  }, [trainees]);

  const isLoading = loadingEvents || loadingPerf || loadingQueue;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['wacd_eventlogs'] });
    queryClient.invalidateQueries({ queryKey: ['wacd_performance'] });
    queryClient.invalidateQueries({ queryKey: ['wacd_queue'] });
    queryClient.invalidateQueries({ queryKey: ['wacd_sysconfig'] });
    queryClient.invalidateQueries({ queryKey: ['wacd_provider'] });
    toast.success('נתונים רועננו');
  };

  const data = {
    eventLogs, todayEventLogs,
    performance, todayPerformance,
    queue, todayQueue,
    trainees, traineeMap,
    sysConfigs, provider,
    killSwitchOn, greenApiOk,
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Activity className="w-5 h-5 text-teal-500" />
            WhatsApp Debug Center
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {TODAY} · {isLoading ? 'טוען...' : 'עדכני'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          רענן
        </Button>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-4 space-y-4">
        {/* Summary bar */}
        <WACDSummaryBar data={data} />

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="audit">הודעות היום</TabsTrigger>
            <TabsTrigger value="blocked">נחסמו</TabsTrigger>
            <TabsTrigger value="duplicates">כפילויות</TabsTrigger>
            <TabsTrigger value="queue">תור</TabsTrigger>
            <TabsTrigger value="automations">אוטומציות</TabsTrigger>
          </TabsList>

          <TabsContent value="audit" className="mt-4">
            <WACDMessageAudit data={data} />
          </TabsContent>
          <TabsContent value="blocked" className="mt-4">
            <WACDBlocked data={data} />
          </TabsContent>
          <TabsContent value="duplicates" className="mt-4">
            <WACDDuplicates data={data} />
          </TabsContent>
          <TabsContent value="queue" className="mt-4">
            <WACDQueue data={data} />
          </TabsContent>
          <TabsContent value="automations" className="mt-4">
            <WACDAutomations data={data} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}