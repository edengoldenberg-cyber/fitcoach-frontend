import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Plus, 
  Send, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  X,
  RefreshCw,
  ChevronDown,
  Clock
} from "lucide-react";
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { toast } from 'sonner';

export default function CoachManualNotificationUI() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTrainee, setSelectedTrainee] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [notificationType, setNotificationType] = useState('');
  const [channel, setChannel] = useState('');
  const [timing, setTiming] = useState('now');
  const [customMinutes, setCustomMinutes] = useState(15);
  const [customDateTime, setCustomDateTime] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  // Fetch trainees
  const { data: allTrainees = [] } = useQuery({
    queryKey: ['allTrainees'],
    queryFn: () => base44.entities.Trainee.filter({ status: 'active' }),
  });

  // Fetch recent notifications for coach view
  const { data: recentNotifications = [] } = useQuery({
    queryKey: ['recentCoachNotifications'],
    queryFn: async () => {
      const jobs = await base44.entities.NotificationJob.list('-created_date', 20);
      return jobs;
    },
    refetchInterval: 10000
  });

  // Filter trainees
  const filteredTrainees = allTrainees.filter(trainee => {
    if (!searchQuery) return false;
    const query = searchQuery.toLowerCase();
    return (
      trainee.full_name?.toLowerCase().includes(query) ||
      trainee.user_email?.toLowerCase().includes(query) ||
      trainee.phone?.toLowerCase().includes(query)
    );
  }).slice(0, 10);

  const handleSelectTrainee = (trainee) => {
    setSelectedTrainee(trainee);
    setSearchQuery(trainee.full_name);
    setShowDropdown(false);
  };

  const resetForm = () => {
    setSearchQuery('');
    setSelectedTrainee(null);
    setNotificationType('');
    setChannel('');
    setTiming('now');
    setCustomMinutes(15);
    setCustomDateTime('');
    setTitle('');
    setMessage('');
    setShowTechnicalDetails(false);
    setLastResult(null);
  };

  // Send notification mutation
  const sendNotificationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTrainee || !notificationType || !channel) {
        throw new Error('יש למלא את כל השדות החובה');
      }

      let scheduledFor = new Date();
      if (timing === 'minutes') {
        scheduledFor = new Date(Date.now() + customMinutes * 60 * 1000);
      } else if (timing === 'datetime' && customDateTime) {
        scheduledFor = new Date(customDateTime);
      }

      const payload = {
        title_he: title || getDefaultTitle(notificationType),
        body_he: message || getDefaultMessage(notificationType),
      };

      const notificationId = crypto.randomUUID();
      const now = new Date().toISOString();

      // Create notification job
      const job = await base44.entities.NotificationJob.create({
        notification_id: notificationId,
        user_email: selectedTrainee.user_email,
        trainee_name: selectedTrainee.full_name,
        type: notificationType,
        channel: channel,
        status: 'queued',
        scheduled_for: scheduledFor.toISOString(),
        payload: payload,
        is_test: false,
      });

      // If timing is now and channel includes push, try to send immediately
      if (timing === 'now') {
        try {
          const result = await base44.functions.invoke('processNotificationQueue', {});
          return { job, processed: true, result: result.data };
        } catch (err) {
          return { job, processed: false, error: err.message };
        }
      }

      return { job, processed: false };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recentCoachNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['notificationJobs'] });
      
      setLastResult(data);
      
      if (data.processed && data.result?.results?.sent > 0) {
        toast.success('✅ ההתראה נשלחה בהצלחה!');
      } else if (data.processed === false) {
        toast.success('✅ התראה נוצרה ותזומנה לשליחה');
      } else {
        toast.success('✅ התראה נוצרה');
      }
      
      setShowTechnicalDetails(true);
    },
    onError: (error) => {
      toast.error(`❌ שגיאה: ${error.message}`);
    }
  });

  const getDefaultTitle = (type) => {
    const titles = {
      meal_missing: 'תזכורת - חסרה רישום ארוחה',
      workout_missing: 'תזכורת - חסר רישום אימון',
      water_missing: 'תזכורת - שכחת לשתות מים',
      weigh_in_missing: 'תזכורת - הגיע זמן שקילה',
      custom: 'הודעה מהמאמן'
    };
    return titles[type] || 'הודעה';
  };

  const getDefaultMessage = (type) => {
    const messages = {
      meal_missing: 'היי! שמתי לב שעוד לא רשמת את הארוחה שלך היום. זה חשוב למעקב 💪',
      workout_missing: 'היי! עוד לא רשמת את האימון היום. תעדכן אותי איך היה? 🏋️',
      water_missing: 'תזכורת ידידותית לשתות מים! המטרה היומית שלך מחכה 💧',
      weigh_in_missing: 'הגיע הזמן לשקילה שבועית. זה עוזר לנו לעקוב אחרי ההתקדמות 📊',
      custom: 'יש לך הודעה מהמאמן שלך'
    };
    return messages[type] || '';
  };

  const getTypeLabel = (type) => {
    const labels = {
      meal_missing: '🍽️ ארוחות חסרות',
      workout_missing: '💪 אימון חסר',
      water_missing: '💧 מים חסרים',
      weigh_in_missing: '⚖️ שקילה/מדדים חסרים',
      custom: '✉️ הודעה כללית'
    };
    return labels[type] || type;
  };

  const getStatusBadge = (status) => {
    const variants = {
      queued: { color: 'bg-blue-100 text-blue-700', label: 'ממתין' },
      processing: { color: 'bg-yellow-100 text-yellow-700', label: 'מעבד' },
      sent: { color: 'bg-green-100 text-green-700', label: 'נשלח' },
      failed: { color: 'bg-red-100 text-red-700', label: 'נכשל' },
      cancelled: { color: 'bg-slate-100 text-slate-700', label: 'בוטל' }
    };
    const variant = variants[status] || variants.queued;
    return <Badge className={variant.color}>{variant.label}</Badge>;
  };

  // Resend mutation
  const resendMutation = useMutation({
    mutationFn: async (jobId) => {
      const result = await base44.functions.invoke('retryNotificationJob', { jobId });
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recentCoachNotifications'] });
      toast.success('ההתראה הוחזרה לתור');
    }
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async (jobId) => {
      const result = await base44.functions.invoke('cancelNotificationJob', { jobId });
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recentCoachNotifications'] });
      toast.success('ההתראה בוטלה');
    }
  });

  return (
    <div className="space-y-6" dir="rtl">
      {/* Coach Manual Notification Section */}
      <Card className="border-2 border-teal-200">
        <CardHeader className="bg-gradient-to-r from-teal-50 to-blue-50">
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="w-5 h-5" />
            יצירת התראה ידנית (מאמן)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <Button
            onClick={() => setIsDialogOpen(true)}
            className="w-full bg-teal-600 hover:bg-teal-700"
          >
            <Plus className="w-4 h-4 ml-2" />
            + צור התראה
          </Button>
        </CardContent>
      </Card>

      {/* Recent Notifications - Coach View */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">תור התראות (תצוגת מאמן)</CardTitle>
          <p className="text-sm text-slate-500 mt-1">20 ההתראות האחרונות</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentNotifications.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                אין התראות עדיין
              </div>
            ) : (
              recentNotifications.map((job) => (
                <div
                  key={job.id}
                  className="border rounded-lg p-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <span className="font-medium">{format(new Date(job.created_date), 'dd/MM HH:mm', { locale: he })}</span>
                        <span className="text-slate-400">•</span>
                        <span>{job.trainee_name || 'לא ידוע'}</span>
                        <span className="text-slate-400">•</span>
                        {getStatusBadge(job.status)}
                        <Badge variant="outline" className="text-xs">{job.channel}</Badge>
                      </div>
                      <div className="text-sm text-slate-600">{getTypeLabel(job.type)}</div>
                      {job.error_message && (
                        <div className="text-xs text-red-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {job.error_message}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {(job.status === 'failed' || job.status === 'queued') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => resendMutation.mutate(job.id)}
                          disabled={resendMutation.isPending}
                          title="שלח שוב"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </Button>
                      )}
                      {job.status === 'queued' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => cancelMutation.mutate(job.id)}
                          disabled={cancelMutation.isPending}
                          title="בטל"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create Notification Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>צור התראה חדשה</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Success Result */}
            {lastResult && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-green-800 font-medium">
                  <CheckCircle2 className="w-5 h-5" />
                  {lastResult.processed ? 'ההתראה נשלחה!' : 'ההתראה נוצרה בהצלחה'}
                </div>
                
                <button
                  onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                  className="text-sm text-green-700 hover:text-green-900 flex items-center gap-1"
                >
                  פרטים טכניים (לבדיקה)
                  <ChevronDown className={`w-4 h-4 transition-transform ${showTechnicalDetails ? 'rotate-180' : ''}`} />
                </button>

                {showTechnicalDetails && (
                  <div className="text-xs bg-white p-3 rounded border space-y-1 font-mono">
                    <div><span className="text-slate-600">Notification ID:</span> {lastResult.job.notification_id || lastResult.job.id}</div>
                    <div><span className="text-slate-600">Job ID:</span> {lastResult.job.id}</div>
                    <div><span className="text-slate-600">Status:</span> {lastResult.job.status}</div>
                    <div><span className="text-slate-600">Channel:</span> {lastResult.job.channel}</div>
                    <div><span className="text-slate-600">Scheduled:</span> {format(new Date(lastResult.job.scheduled_for), 'dd/MM/yyyy HH:mm')}</div>
                    {lastResult.error && (
                      <div className="text-red-600"><span className="text-slate-600">Error:</span> {lastResult.error}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Trainee Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">בחר מתאמן *</label>
              <div className="relative">
                <Input
                  placeholder="הקלד שם, מייל או טלפון..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowDropdown(true);
                    if (!e.target.value) setSelectedTrainee(null);
                  }}
                  onFocus={() => setShowDropdown(true)}
                />
                {showDropdown && searchQuery && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredTrainees.length > 0 ? (
                      filteredTrainees.map((trainee) => (
                        <button
                          key={trainee.id}
                          onClick={() => handleSelectTrainee(trainee)}
                          className="w-full text-right px-3 py-2 hover:bg-slate-50 border-b last:border-b-0"
                        >
                          <div className="font-medium text-sm">{trainee.full_name}</div>
                          <div className="text-xs text-slate-500">{trainee.user_email}</div>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-center text-slate-500 text-sm">לא נמצאו מתאמנים</div>
                    )}
                  </div>
                )}
              </div>
              {selectedTrainee && (
                <div className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded">
                  ✓ נבחר: {selectedTrainee.full_name}
                </div>
              )}
            </div>

            {/* Notification Type */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">סוג התראה *</label>
              <select
                value={notificationType}
                onChange={(e) => setNotificationType(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="">בחר סוג התראה</option>
                <option value="meal_missing">ארוחות חסרות</option>
                <option value="workout_missing">אימון חסר</option>
                <option value="water_missing">מים חסרים</option>
                <option value="weigh_in_missing">שקילה/מדדים חסרים</option>
                <option value="custom">הודעה כללית</option>
              </select>
            </div>

            {/* Channel */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">ערוץ שליחה *</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="">בחר ערוץ</option>
                <option value="in_app">In-App בלבד</option>
                <option value="push">Push בלבד (אם יש subscription)</option>
                <option value="in_app,push">Both (In-App + Push)</option>
              </select>
            </div>

            {/* Timing */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">מתי לשלוח *</label>
              <select
                value={timing}
                onChange={(e) => setTiming(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="now">עכשיו</option>
                <option value="minutes">עוד X דקות</option>
                <option value="datetime">תאריך ושעה</option>
              </select>

              {timing === 'minutes' && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(Number(e.target.value))}
                    className="w-24"
                    min="1"
                  />
                  <span className="text-sm text-slate-600">דקות מעכשיו</span>
                </div>
              )}

              {timing === 'datetime' && (
                <Input
                  type="datetime-local"
                  value={customDateTime}
                  onChange={(e) => setCustomDateTime(e.target.value)}
                />
              )}
            </div>

            {/* Optional Content */}
            <div className="border-t pt-4 space-y-3">
              <div className="text-sm text-slate-600 mb-2">תוכן הודעה (אופציונלי - אם ריק, יישלח תוכן ברירת מחדל)</div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">כותרת</label>
                <Input
                  placeholder={getDefaultTitle(notificationType)}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">הודעה</label>
                <textarea
                  placeholder={getDefaultMessage(notificationType)}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 min-h-20"
                />
              </div>
            </div>

            {/* Submit */}
            <Button
              onClick={() => sendNotificationMutation.mutate()}
              disabled={sendNotificationMutation.isPending || !selectedTrainee || !notificationType || !channel}
              className="w-full bg-teal-600 hover:bg-teal-700"
            >
              {sendNotificationMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin ml-2" />
              ) : (
                <Send className="w-4 h-4 ml-2" />
              )}
              {timing === 'now' ? 'שלח עכשיו' : 'תזמן שליחה'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}