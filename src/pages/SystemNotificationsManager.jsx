import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Bell, Trash2, Activity, TestTube, Zap, Wrench, ListOrdered } from 'lucide-react';
import { toast } from 'sonner';
import SystemTestRunner from '@/components/notifications/SystemTestRunner';
import ManualNotificationRunner from '@/components/notifications/ManualNotificationRunner';
import NotificationQueueTab from '@/components/notifications/NotificationQueueTab';
import CreateNotificationForm from '@/components/notifications/CreateNotificationForm';
import PushDiagnosticsPanel from '@/components/notifications/PushDiagnosticsPanel';

export default function SystemNotificationsManager() {
  const queryClient = useQueryClient();
  const [cleanupProgress, setCleanupProgress] = useState(null);
  const [diagnosticsResult, setDiagnosticsResult] = useState(null);
  const [pushTestResult, setPushTestResult] = useState(null);
  const [setsIntegrityResult, setSetsIntegrityResult] = useState(null);
  const [fixProgress, setFixProgress] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const cleanDuplicatesMutation = useMutation({
    mutationFn: async () => {
      setCleanupProgress({ stage: 'scanning', percent: 10 });
      
      const result = await base44.functions.invoke('cleanDuplicateNotifications', {});
      
      setCleanupProgress({ stage: 'complete', percent: 100 });
      
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['allNotifications'] });
      
      toast.success(`✓ ניקוי הושלם בהצלחה!
        נסרקו: ${data.scanned}
        כפילויות: ${data.duplicates_found}
        נמחקו: ${data.deleted}
        נשארו: ${data.kept}
        זמן: ${data.duration_ms}ms
      `);
      
      setTimeout(() => setCleanupProgress(null), 3000);
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
      setCleanupProgress(null);
    }
  });

  const runDiagnosticsMutation = useMutation({
    mutationFn: async () => {
      const result = await base44.functions.invoke('diagnosticsInAppNotifications', {});
      return result.data;
    },
    onSuccess: (data) => {
      setDiagnosticsResult(data);
      toast.success(`✓ בדיקת מערכת הושלמה ב-${data.duration_ms}ms`);
    },
    onError: (error) => {
      toast.error(`שגיאה בבדיקה: ${error.message}`);
    }
  });

  const testPushMutation = useMutation({
    mutationFn: async () => {
      const result = await base44.functions.invoke('testPushNotifications', {
        trainee_email: user?.email
      });
      return result.data;
    },
    onSuccess: (data) => {
      setPushTestResult(data);
      
      if (data.ok) {
        toast.success(`✓ בדיקת Push הושלמה ב-${data.duration_ms}ms`);
      } else {
        toast.error(`שגיאה בבדיקת Push: ${data.error}`);
      }
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  const sendTestPushToMeMutation = useMutation({
    mutationFn: async () => {
      const result = await base44.functions.invoke('sendPushToTrainee', {
        trainee_email: user?.email,
        title: '🔔 בדיקת Push',
        message: 'זוהי הודעת בדיקה ממערכת FIT COACH PRO',
        action_type: 'test'
      });
      return result.data;
    },
    onSuccess: (data) => {
      if (data.ok) {
        toast.success(`✓ Push נשלח בהצלחה!`);
      } else {
        toast.error(`Push נכשל - ${data.error || 'בדוק subscription'}`);
      }
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  const diagnoseSetsIntegrityMutation = useMutation({
    mutationFn: async () => {
      const result = await base44.functions.invoke('diagnoseSetsIntegrity', {});
      return result.data;
    },
    onSuccess: (data) => {
      setSetsIntegrityResult(data);
      
      if (data.fixNeeded > 0) {
        toast.warning(`⚠️ נמצאו ${data.fixNeeded} תרגילים עם sets לא תקין`, {
          description: `${data.objectSetsCount} objects, ${data.undefinedSetsCount} undefined`
        });
      } else {
        toast.success(`✓ כל ה-sets תקינים! (${data.totalExercisesChecked} תרגילים נסרקו)`);
      }
    },
    onError: (error) => {
      toast.error(`שגיאה בסריקה: ${error.message}`);
    }
  });

  const fixSetsIntegrityMutation = useMutation({
    mutationFn: async () => {
      setFixProgress({ stage: 'fixing', percent: 50 });
      const result = await base44.functions.invoke('fixSetsIntegrity', {});
      setFixProgress({ stage: 'complete', percent: 100 });
      return result.data;
    },
    onSuccess: (data) => {
      toast.success(`✅ תיקון הושלם בהצלחה!`, {
        description: `תוקנו: ${data.fixedCount}, דולגו: ${data.skippedCount}, שגיאות: ${data.errorsCount}`
      });
      
      // Re-run diagnostics after fix
      setTimeout(() => {
        diagnoseSetsIntegrityMutation.mutate();
        setFixProgress(null);
      }, 1000);
    },
    onError: (error) => {
      toast.error(`שגיאה בתיקון: ${error.message}`);
      setFixProgress(null);
    }
  });

  if (user && user.role !== 'admin') {
    return (
      <div className="max-w-4xl mx-auto p-4 pb-20" dir="rtl">
        <Card className="p-8 text-center">
          <p className="text-slate-600">גישה למנהלים בלבד</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 pb-20" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <Bell className="w-7 h-7 text-teal-600" />
        <h1 className="text-2xl font-bold">ניהול מערכת התראות</h1>
      </div>

      <Tabs defaultValue="tools" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="tools" className="flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            כלים ובדיקות
          </TabsTrigger>
          <TabsTrigger value="queue" className="flex items-center gap-2">
            <ListOrdered className="w-4 h-4" />
            תור התראות
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tools">
          {/* Create Notification Form - NEW */}
          <CreateNotificationForm />

          <div className="grid gap-4 md:grid-cols-2">
        {/* Clean Duplicates Card */}
        <Card className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <Trash2 className="w-6 h-6 text-orange-600" />
            <div>
              <h3 className="font-bold text-lg mb-1">ניקוי כפילויות</h3>
              <p className="text-sm text-slate-600">
                מוחק התראות כפולות על בסיס fingerprint, משאיר את המוקדמת ביותר
              </p>
            </div>
          </div>

          {cleanupProgress && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-600">{cleanupProgress.stage}</span>
                <span className="text-sm font-medium">{cleanupProgress.percent}%</span>
              </div>
              <Progress value={cleanupProgress.percent} className="h-2" />
            </div>
          )}

          <Button
            onClick={() => cleanDuplicatesMutation.mutate()}
            disabled={cleanDuplicatesMutation.isPending}
            className="w-full"
            variant="outline"
          >
            {cleanDuplicatesMutation.isPending ? 'מנקה...' : 'הפעל סריקה וניקוי'}
          </Button>
        </Card>

        {/* Diagnostics Card */}
        <Card className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <Activity className="w-6 h-6 text-blue-600" />
            <div>
              <h3 className="font-bold text-lg mb-1">בדיקת מערכת פנימית</h3>
              <p className="text-sm text-slate-600">
                בודק התראות, כפילויות, ביצועים ושגיאות
              </p>
            </div>
          </div>

          {diagnosticsResult && (
            <div className="mb-4 space-y-2 p-3 bg-slate-50 rounded-lg text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">סה"כ התראות:</span>
                <span className="font-medium">{diagnosticsResult.totalNotifications}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">לא נקרא:</span>
                <Badge variant="outline">{diagnosticsResult.unreadCount}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">כפילויות:</span>
                <Badge variant="destructive">{diagnosticsResult.duplicatesFound}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">זמן תגובה ממוצע:</span>
                <span className="font-medium">{diagnosticsResult.avgLatencyMs}ms</span>
              </div>
            </div>
          )}

          <Button
            onClick={() => runDiagnosticsMutation.mutate()}
            disabled={runDiagnosticsMutation.isPending}
            className="w-full"
            variant="outline"
          >
            {runDiagnosticsMutation.isPending ? 'בודק...' : 'הפעל בדיקה'}
          </Button>
        </Card>

        {/* Push Test Card */}
        <Card className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <Zap className="w-6 h-6 text-purple-600" />
            <div>
              <h3 className="font-bold text-lg mb-1">בדיקת Push</h3>
              <p className="text-sm text-slate-600">
                בודק תקינות Push Notifications ושולח הודעת בדיקה
              </p>
            </div>
          </div>

          {pushTestResult && (
            <div className="mb-4 space-y-2 p-3 bg-slate-50 rounded-lg text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">VAPID מוגדר:</span>
                <Badge variant={pushTestResult.vapidConfigured ? 'default' : 'destructive'}>
                  {pushTestResult.vapidConfigured ? 'כן' : 'לא'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">מינויים פעילים:</span>
                <span className="font-medium">{pushTestResult.activeSubscriptionsCount}</span>
              </div>
              {pushTestResult.testPushResult && (
                <div className="flex justify-between">
                  <span className="text-slate-600">תוצאת בדיקה:</span>
                  <Badge variant={pushTestResult.testPushResult.success ? 'default' : 'destructive'}>
                    {pushTestResult.testPushResult.success ? '✓ הצליח' : '✗ נכשל'}
                  </Badge>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Button
              onClick={() => testPushMutation.mutate()}
              disabled={testPushMutation.isPending}
              className="w-full"
              variant="outline"
            >
              {testPushMutation.isPending ? 'בודק...' : 'בדיקת Push + שליחה'}
            </Button>
            
            <Button
              onClick={() => sendTestPushToMeMutation.mutate()}
              disabled={sendTestPushToMeMutation.isPending}
              className="w-full"
              style={{ backgroundColor: '#79DBD6', color: 'white' }}
            >
              {sendTestPushToMeMutation.isPending ? 'שולח...' : '🔔 שלח Push לי עכשיו'}
            </Button>
          </div>
        </Card>

        {/* Manual Run Card */}
        <Card className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <Zap className="w-6 h-6 text-blue-600" />
            <div>
              <h3 className="font-bold text-lg mb-1">הרצה ידנית</h3>
              <p className="text-sm text-slate-600">
                הרץ בדיקת התראות יומית עבור כל המתאמנים
              </p>
            </div>
          </div>

          <ManualNotificationRunner />
        </Card>

        {/* System Test Card */}
        <Card className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <TestTube className="w-6 h-6 text-green-600" />
            <div>
              <h3 className="font-bold text-lg mb-1">בדיקת מערכת מלאה</h3>
              <p className="text-sm text-slate-600">
                מריץ בדיקות יציבות, dedupe, push וביצועים
              </p>
            </div>
          </div>

          <SystemTestRunner />
        </Card>

        {/* Push Diagnostics Panel - NEW */}
        <Card className="p-6">
          <PushDiagnosticsPanel />
        </Card>

        {/* Sets Integrity Card */}
        <Card className="p-6 md:col-span-2">
          <div className="flex items-start gap-3 mb-4">
            <Wrench className="w-6 h-6 text-red-600" />
            <div>
              <h3 className="font-bold text-lg mb-1">בדיקת תקינות אימונים (Sets)</h3>
              <p className="text-sm text-slate-600">
                סורק ומתקן רשומות אימונים עם sets לא תקין (object במקום array)
              </p>
            </div>
          </div>

          {setsIntegrityResult && (
            <div className="mb-4 grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-slate-50 rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-800">{setsIntegrityResult.totalExercisesChecked}</div>
                <div className="text-xs text-slate-600">תרגילים נסרקו</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{setsIntegrityResult.arraySetsCount}</div>
                <div className="text-xs text-slate-600">תקינים (Array)</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{setsIntegrityResult.objectSetsCount}</div>
                <div className="text-xs text-slate-600">Object</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{setsIntegrityResult.undefinedSetsCount}</div>
                <div className="text-xs text-slate-600">Undefined</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{setsIntegrityResult.fixNeeded}</div>
                <div className="text-xs text-slate-600">צריכים תיקון</div>
              </div>
            </div>
          )}

          {setsIntegrityResult?.sampleIds?.length > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="text-sm font-bold text-yellow-800 mb-2">דוגמאות לבעיות:</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {setsIntegrityResult.sampleIds.slice(0, 5).map((sample, idx) => (
                  <div key={idx} className="text-xs text-yellow-700 font-mono">
                    {sample.exerciseName} - {sample.issue}
                  </div>
                ))}
              </div>
            </div>
          )}

          {fixProgress && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-600">{fixProgress.stage}</span>
                <span className="text-sm font-medium">{fixProgress.percent}%</span>
              </div>
              <Progress value={fixProgress.percent} className="h-2" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => diagnoseSetsIntegrityMutation.mutate()}
              disabled={diagnoseSetsIntegrityMutation.isPending}
              variant="outline"
              className="w-full"
            >
              {diagnoseSetsIntegrityMutation.isPending ? 'סורק...' : '🔍 סריקה בלבד'}
            </Button>
            
            <Button
              onClick={() => fixSetsIntegrityMutation.mutate()}
              disabled={fixSetsIntegrityMutation.isPending || !setsIntegrityResult?.fixNeeded}
              className="w-full bg-red-500 hover:bg-red-600"
            >
              {fixSetsIntegrityMutation.isPending ? 'מתקן...' : '🔧 סריקה + תיקון'}
            </Button>
          </div>

          {setsIntegrityResult && (
            <div className="mt-3 text-xs text-slate-500 text-center">
              סרוק ב-{new Date(setsIntegrityResult.finishedAt).toLocaleTimeString('he-IL')} | 
              זמן: {setsIntegrityResult.durationMs}ms
            </div>
          )}
        </Card>
      </div>

      {/* Last 10 Notifications */}
      {diagnosticsResult && diagnosticsResult.last10Notifications && (
        <Card className="p-6 mt-6">
          <h3 className="font-bold text-lg mb-4">10 התראות אחרונות</h3>
          <div className="space-y-2">
            {diagnosticsResult.last10Notifications.map((notif, idx) => (
              <div key={notif.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                <div className="flex-1">
                  <span className="font-medium">{notif.title}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">{notif.type}</Badge>
                    <Badge variant="outline" className="text-xs">{notif.status}</Badge>
                  </div>
                </div>
                <span className="text-xs text-slate-500">{notif.created}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="queue">
          <NotificationQueueTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}