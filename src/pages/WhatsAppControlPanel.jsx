import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Activity, AlertCircle, CheckCircle2, Clock, Send, AlertTriangle, RefreshCw, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WhatsAppControlSystemStatus from '../components/whatsapp/WhatsAppControlSystemStatus';
import WhatsAppControlQueueOverview from '../components/whatsapp/WhatsAppControlQueueOverview';
import WhatsAppControlMessageActivity from '../components/whatsapp/WhatsAppControlMessageActivity';
import WhatsAppControlConversationHealth from '../components/whatsapp/WhatsAppControlConversationHealth';
import WhatsAppControlErrorMonitoring from '../components/whatsapp/WhatsAppControlErrorMonitoring';
import WhatsAppControlAdminActions from '../components/whatsapp/WhatsAppControlAdminActions';
import WhatsAppControlMessageTrace from '../components/whatsapp/WhatsAppControlMessageTrace';

export default function WhatsAppControlPanel() {
  const [activeTab, setActiveTab] = useState('system');
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  // Auto-refresh every 10 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      // Will trigger re-fetch via query hooks
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-24" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white border-b shadow-sm px-6 py-5 sticky top-0 z-10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-green-400 to-green-600">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">WhatsApp Control Panel</h1>
                <p className="text-xs text-slate-500">Real-time monitoring & admin actions</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={autoRefresh ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
                {autoRefresh ? 'Auto' : 'Manual'}
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 py-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-7 bg-white border-b mb-6">
              <TabsTrigger value="system" className="gap-1.5">
                <Activity className="w-4 h-4" /> Status
              </TabsTrigger>
              <TabsTrigger value="queue" className="gap-1.5">
                <Send className="w-4 h-4" /> Queue
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-1.5">
                <Clock className="w-4 h-4" /> Activity
              </TabsTrigger>
              <TabsTrigger value="health" className="gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Health
              </TabsTrigger>
              <TabsTrigger value="errors" className="gap-1.5">
                <AlertCircle className="w-4 h-4" /> Errors
              </TabsTrigger>
              <TabsTrigger value="actions" className="gap-1.5">
                <Zap className="w-4 h-4" /> Actions
              </TabsTrigger>
              <TabsTrigger value="trace" className="gap-1.5">
                <RefreshCw className="w-4 h-4" /> Trace
              </TabsTrigger>
            </TabsList>

            {/* System Status Tab */}
            <TabsContent value="system" className="space-y-4">
              <WhatsAppControlSystemStatus coachEmail={user.email} autoRefresh={autoRefresh} />
            </TabsContent>

            {/* Queue Overview Tab */}
            <TabsContent value="queue" className="space-y-4">
              <WhatsAppControlQueueOverview coachEmail={user.email} autoRefresh={autoRefresh} />
            </TabsContent>

            {/* Message Activity Tab */}
            <TabsContent value="activity" className="space-y-4">
              <WhatsAppControlMessageActivity
                coachEmail={user.email}
                autoRefresh={autoRefresh}
                onSelectLead={setSelectedLeadId}
              />
            </TabsContent>

            {/* Conversation Health Tab */}
            <TabsContent value="health" className="space-y-4">
              <WhatsAppControlConversationHealth coachEmail={user.email} autoRefresh={autoRefresh} />
            </TabsContent>

            {/* Error Monitoring Tab */}
            <TabsContent value="errors" className="space-y-4">
              <WhatsAppControlErrorMonitoring coachEmail={user.email} autoRefresh={autoRefresh} />
            </TabsContent>

            {/* Admin Actions Tab */}
            <TabsContent value="actions" className="space-y-4">
              <WhatsAppControlAdminActions coachEmail={user.email} />
            </TabsContent>

            {/* Message Trace Tab */}
            <TabsContent value="trace" className="space-y-4">
              <WhatsAppControlMessageTrace leadId={selectedLeadId} coachEmail={user.email} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}