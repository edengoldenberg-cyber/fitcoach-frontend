import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Settings, FileText, Zap, Activity, Send } from 'lucide-react';
import WhatsAppSettingsTab from '../components/whatsapp/WhatsAppSettingsTab';
import WhatsAppTemplatesTab from '../components/whatsapp/WhatsAppTemplatesTab';
import WhatsAppAutomationsTab from '../components/whatsapp/WhatsAppAutomationsTab';
import WhatsAppDiagnosticsTab from '../components/whatsapp/WhatsAppDiagnosticsTab';
import WhatsAppBulkSendTab from '../components/whatsapp/WhatsAppBulkSendTab';

export default function WhatsAppManager() {
  const [activeTab, setActiveTab] = useState('settings');
  const [diagnosticsTemplateFilter, setDiagnosticsTemplateFilter] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: config } = useQuery({
    queryKey: ['whatsappConfig', user?.email],
    queryFn: () => base44.entities.WhatsAppProviderConfig.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
    select: (data) => data[0],
  });

  if (!user) {
    return <div className="p-8 text-center text-slate-500">טוען...</div>;
  }

  const openDiagnosticsForTemplate = (templateKey) => {
    setDiagnosticsTemplateFilter(templateKey);
    setActiveTab('diagnostics');
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-white border-b px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#25D366' }}>
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">WhatsApp Automations</h1>
              <p className="text-sm text-slate-500">ניהול תבניות, כללי אוטומציה ושליחת הודעות</p>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full rounded-none border-b bg-white h-12 justify-start px-4 gap-1">
            <TabsTrigger value="settings" className="gap-1.5 text-sm">
              <Settings className="w-4 h-4" /> הגדרות
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-1.5 text-sm">
              <FileText className="w-4 h-4" /> תבניות
            </TabsTrigger>
            <TabsTrigger value="automations" className="gap-1.5 text-sm">
              <Zap className="w-4 h-4" /> אוטומציות
            </TabsTrigger>
            <TabsTrigger value="bulk" className="gap-1.5 text-sm">
              <Send className="w-4 h-4" /> שידור
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="gap-1.5 text-sm">
              <Activity className="w-4 h-4" /> דיאגנוסטיקה
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="mt-0">
            <WhatsAppSettingsTab coachEmail={user.email} />
          </TabsContent>

          <TabsContent value="templates" className="mt-0">
            <WhatsAppTemplatesTab
              coachEmail={user.email}
              coachPhone={config?.phone_number_e164 || ''}
              onOpenDiagnostics={openDiagnosticsForTemplate}
            />
          </TabsContent>

          <TabsContent value="automations" className="mt-0">
            <WhatsAppAutomationsTab coachEmail={user.email} />
          </TabsContent>

          <TabsContent value="bulk" className="mt-0">
            <WhatsAppBulkSendTab coachEmail={user.email} />
          </TabsContent>

          <TabsContent value="diagnostics" className="mt-0">
            <WhatsAppDiagnosticsTab
              coachEmail={user.email}
              coachPhone={config?.phone_number_e164 || ''}
              initialTemplateFilter={diagnosticsTemplateFilter}
              onClearTemplateFilter={() => setDiagnosticsTemplateFilter(null)}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}