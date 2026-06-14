import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, Send, Settings as SettingsIcon, History } from 'lucide-react';
import SendMessageDialog from '../components/messaging/SendMessageDialog';
import AutoRulesList from '../components/messaging/AutoRulesList';
import CreateRuleDialog from '../components/messaging/CreateRuleDialog';
import MessageHistory from '../components/messaging/MessageHistory';
import TraineeAlertsTab from '../components/messaging/TraineeAlertsTab';
import { toast } from 'sonner';

export default function MessagingCenter() {
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['allTrainees'],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: rules = [] } = useQuery({
    queryKey: ['autoRules'],
    queryFn: () => base44.entities.AutoMessageRule.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['sentNotifications'],
    queryFn: () => base44.entities.Notification.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
            <Bell className="w-8 h-8" style={{ color: '#79DBD6' }} />
            הודעות והתראות
          </h1>
          <p className="text-slate-600 mt-2">
            שלח הודעות למתאמנים והגדר חוקים אוטומטיים
          </p>
        </div>

        <Tabs defaultValue="alerts" className="space-y-6">
          <TabsList className="bg-white border w-full justify-start overflow-x-auto">
            <TabsTrigger value="alerts" className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              התראות מתאמנים
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Send className="w-4 h-4" />
              שליחה ידנית
            </TabsTrigger>
            <TabsTrigger value="rules" className="flex items-center gap-2">
              <SettingsIcon className="w-4 h-4" />
              חוקים אוטומטיים
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              היסטוריה
            </TabsTrigger>
          </TabsList>

          <TabsContent value="alerts">
            <TraineeAlertsTab trainees={trainees} coachEmail={user?.email} />
          </TabsContent>

          <TabsContent value="manual">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">שליחת הודעה ידנית</h2>
                  <p className="text-sm text-slate-600">שלח הודעה למתאמן בודד או קבוצה</p>
                </div>
                <Button
                  onClick={() => setShowSendDialog(true)}
                  style={{ backgroundColor: '#79DBD6', color: 'white' }}
                >
                  <Send className="w-4 h-4 ml-2" />
                  הודעה חדשה
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-4 bg-blue-50 border-blue-200">
                  <p className="text-2xl font-bold text-blue-700">{trainees.length}</p>
                  <p className="text-sm text-blue-600">מתאמנים במערכת</p>
                </Card>
                <Card className="p-4 bg-green-50 border-green-200">
                  <p className="text-2xl font-bold text-green-700">
                    {notifications.filter(n => n.status === 'sent').length}
                  </p>
                  <p className="text-sm text-green-600">הודעות נשלחו</p>
                </Card>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="rules">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">חוקים אוטומטיים</h2>
                  <p className="text-sm text-slate-600">הגדר שליחה אוטומטית לפי לוח זמנים ותנאים</p>
                </div>
                <Button
                  onClick={() => setShowRuleDialog(true)}
                  style={{ backgroundColor: '#79DBD6', color: 'white' }}
                >
                  <SettingsIcon className="w-4 h-4 ml-2" />
                  חוק חדש
                </Button>
              </div>

              <AutoRulesList rules={rules} trainees={trainees} />
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <MessageHistory notifications={notifications} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <SendMessageDialog
        open={showSendDialog}
        onClose={() => setShowSendDialog(false)}
        trainees={trainees}
        coachEmail={user?.email}
      />

      <CreateRuleDialog
        open={showRuleDialog}
        onClose={() => setShowRuleDialog(false)}
        trainees={trainees}
        coachEmail={user?.email}
      />
    </div>
  );
}