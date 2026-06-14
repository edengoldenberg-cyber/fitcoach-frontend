import React, { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import SafetyGuardsBar from '../components/whatsapp/control-center/SafetyGuardsBar';
import SafetyStatusBar from '../components/whatsapp/control-center/SafetyStatusBar';
import GreenAPISection from '../components/whatsapp/control-center/GreenAPISection';
import KillSwitchSection from '../components/whatsapp/control-center/KillSwitchSection';
import QueueSection from '../components/whatsapp/control-center/QueueSection';
import AutomationsSection from '../components/whatsapp/control-center/AutomationsSection';
import FunctionPathMap from '../components/whatsapp/control-center/FunctionPathMap';
import TestMessageSection from '../components/whatsapp/control-center/TestMessageSection';
import ReportButton from '../components/whatsapp/control-center/ReportButton';
import ProviderSettingsSection from '../components/whatsapp/control-center/ProviderSettingsSection';
import InboundWebhookSection from '../components/whatsapp/control-center/InboundWebhookSection';
import LivePreviewSection from '../components/whatsapp/control-center/LivePreviewSection';
import RealMessageAuditPanel from '../components/whatsapp/control-center/RealMessageAuditPanel';

export default function WhatsAppControlCenter() {
  const queryClient = useQueryClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const [isToggling, setIsToggling] = useState(false);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
    queryClient.invalidateQueries({ queryKey: ['wcc'] });
  }, [queryClient]);

  // Read kill switch from DB (single source of truth)
  const { data: killSwitchConfig } = useQuery({
    queryKey: ['wcc', 'killSwitch', refreshKey],
    queryFn: async () => {
      const records = await base44.entities.SystemConfig.filter({ key: 'GLOBAL_WHATSAPP_ENABLED' });
      return records && records[0] ? records[0] : { value: false };
    },
    refetchInterval: 10000, // auto-refresh every 10s
  });

  const { data: providerConfigs = [] } = useQuery({
    queryKey: ['wcc', 'providerConfigs', refreshKey],
    queryFn: () => base44.entities.WhatsAppProviderConfig.filter({}),
  });

  const { data: queueAll = [] } = useQuery({
    queryKey: ['wcc', 'queue', refreshKey],
    queryFn: () => base44.entities.WhatsAppMessageQueue.filter({}),
  });

  const queueCounts = useMemo(() => {
    const counts = { queued: 0, sending: 0, failed: 0, sent_today: 0, total_unsent: 0 };
    const todayStr = new Date().toISOString().split('T')[0];
    for (const q of queueAll) {
      if (q.status === 'queued') counts.queued++;
      if (q.status === 'sending') counts.sending++;
      if (q.status === 'failed') counts.failed++;
      if (q.status === 'sent' && (q.updated_date || '').startsWith(todayStr)) counts.sent_today++;
    }
    counts.total_unsent = counts.queued + counts.sending + counts.failed;
    return counts;
  }, [queueAll]);

  const providerConfig = providerConfigs[0] || null;
  // Kill switch active = sending is BLOCKED (value=false means blocked)
  const KILL_SWITCH_ACTIVE = killSwitchConfig ? killSwitchConfig.value !== true : true;
  const providerConnected = providerConfig?.status === 'connected';

  const handleToggleKillSwitch = async (enable) => {
    setIsToggling(true);
    try {
      const res = await base44.functions.invoke('systemConfigControl', {
        action: 'set',
        key: 'GLOBAL_WHATSAPP_ENABLED',
        value: enable,
      });
      if (res?.data?.ok) {
        toast.success(enable
          ? '🟢 שליחת WhatsApp הופעלה'
          : '🔴 שליחת WhatsApp נחסמה'
        );
        refresh();
      } else {
        toast.error('שגיאה: ' + (res?.data?.error || 'Unknown error'));
      }
    } catch (e) {
      toast.error('שגיאה: ' + e.message);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🎛️ WhatsApp Control Center</h1>
            <p className="text-sm text-slate-500 mt-1">פאנל בקרה מרכזי — כל מערכות ה-WhatsApp במקום אחד</p>
          </div>
          <button
            onClick={refresh}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg text-sm font-medium text-slate-700 transition-colors"
          >
            🔄 רענן הכל
          </button>
        </div>

        {/* STEP 7 — Live Safety Status Bar */}
        <SafetyStatusBar
          killSwitchActive={KILL_SWITCH_ACTIVE}
          providerConnected={providerConnected}
        />

        {/* Safety Guards */}
        <SafetyGuardsBar
          killSwitchActive={KILL_SWITCH_ACTIVE}
          queueCounts={queueCounts}
          providerConfig={providerConfig}
        />

        {/* Kill Switch — REAL CONTROL */}
        <KillSwitchSection
          killSwitchActive={KILL_SWITCH_ACTIVE}
          onToggle={handleToggleKillSwitch}
          isToggling={isToggling}
        />

        {/* Real Message Audit Panel */}
        <RealMessageAuditPanel refreshKey={refreshKey} />

        {/* Provider Settings + Connection Check + Webhook Setup */}
        <ProviderSettingsSection killSwitchActive={KILL_SWITCH_ACTIVE} onRefresh={refresh} />

        {/* GreenAPI Connection Status (read-only summary) */}
        <GreenAPISection providerConfig={providerConfig} onRefresh={refresh} />

        {/* Test Message — only active when kill switch OFF */}
        <TestMessageSection killSwitchActive={KILL_SWITCH_ACTIVE} />

        {/* Inbound Webhook Debug */}
        <InboundWebhookSection />

        {/* Live Preview — what WOULD send now */}
        <LivePreviewSection killSwitchActive={KILL_SWITCH_ACTIVE} />

        {/* Queue Control */}
        <QueueSection queueCounts={queueCounts} onRefresh={refresh} killSwitchActive={KILL_SWITCH_ACTIVE} />

        {/* Automations */}
        <AutomationsSection killSwitchActive={KILL_SWITCH_ACTIVE} onRefresh={refresh} />

        {/* Function Path Map */}
        <FunctionPathMap killSwitchActive={KILL_SWITCH_ACTIVE} />

        {/* Full Report */}
        <ReportButton
          killSwitchActive={KILL_SWITCH_ACTIVE}
          queueCounts={queueCounts}
          providerConfig={providerConfig}
          queueAll={queueAll}
        />
      </div>
    </div>
  );
}