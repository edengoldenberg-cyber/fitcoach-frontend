import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Bell, Send, Clock, Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function CreateNotificationForm() {
  const queryClient = useQueryClient();
  
  const [selectedTrainee, setSelectedTrainee] = useState('');
  const [notificationType, setNotificationType] = useState('custom');
  const [channel, setChannel] = useState('in_app');
  const [sendMode, setSendMode] = useState('now');
  const [scheduledTime, setScheduledTime] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['activeTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ 
      coach_email: user?.email,
      status: 'active'
    }),
    enabled: !!user?.email,
  });

  // Auto-fill title and body based on notification type
  React.useEffect(() => {
    const templates = {
      meal_missing: {
        title: '🍽️ תזכורת - ארוחה חסרה',
        body: 'שכחת לרשום ארוחה היום. תעדכן אותנו מה אכלת?'
      },
      water_missing: {
        title: '💧 תזכורת - מים',
        body: 'זכור לשתות מים! המטרה היומית שלך עוד לא הושלמה.'
      },
      workout_missing: {
        title: '💪 תזכורת - אימון',
        body: 'עוד לא תיעדת אימון היום. בוא נתרגל!'
      },
      custom: {
        title: '',
        body: ''
      },
      coach_message: {
        title: '📨 הודעה מהמאמן',
        body: ''
      }
    };

    const template = templates[notificationType] || templates.custom;
    if (notificationType !== 'custom' && notificationType !== 'coach_message') {
      setTitle(template.title);
      setBody(template.body);
    } else if (notificationType === 'coach_message') {
      setTitle(template.title);
    }
  }, [notificationType]);

  const createNotificationMutation = useMutation({
    mutationFn: async () => {
      const selectedTraineeData = trainees.find(t => t.user_email === selectedTrainee);
      
      if (!selectedTraineeData) {
        throw new Error('מתאמן לא נמצא');
      }

      if (!title || !body) {
        throw new Error('נא למלא כותרת ותוכן');
      }

      // Generate notification_id
      const notification_id = crypto.randomUUID();

      // Calculate scheduled_for time
      let scheduled_for = new Date().toISOString();
      if (sendMode === 'scheduled' && scheduledTime) {
        scheduled_for = new Date(scheduledTime).toISOString();
      }

      // Generate dedupe_key
      const dateStr = new Date(scheduled_for).toISOString().split('T')[0];
      const dedupe_key = `${selectedTrainee}_${notificationType}_${dateStr}_${channel}`;

      // Create notification job
      const job = await base44.entities.NotificationJob.create({
        notification_id,
        user_email: selectedTrainee,
        trainee_name: selectedTraineeData.full_name,
        type: notificationType,
        channel,
        status: 'queued',
        scheduled_for,
        payload: {
          title_he: title,
          body_he: body,
          severity: 'info'
        },
        dedupe_key,
        is_test: false
      });

      return job;
    },
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ['notificationJobs'] });
      
      toast.success('✅ התראה נוצרה בהצלחה!', {
        description: `Job ID: ${job.id}`,
        action: {
          label: 'צפה בתור',
          onClick: () => {
            // Switch to queue tab (handled by parent)
            const queueTab = document.querySelector('[value="queue"]');
            if (queueTab) queueTab.click();
          }
        }
      });

      // Reset form
      setSelectedTrainee('');
      setNotificationType('custom');
      setChannel('in_app');
      setSendMode('now');
      setScheduledTime('');
      setTitle('');
      setBody('');
    },
    onError: (error) => {
      toast.error(`❌ שגיאה: ${error.message}`);
    }
  });

  return (
    <Card className="p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <Plus className="w-6 h-6 text-teal-600" />
        <h2 className="text-xl font-bold">יצירת התראה חדשה</h2>
      </div>

      <div className="space-y-4">
        {/* Trainee Picker */}
        <div>
          <Label>בחר מתאמן *</Label>
          <Select value={selectedTrainee} onValueChange={setSelectedTrainee}>
            <SelectTrigger>
              <SelectValue placeholder="בחר מתאמן..." />
            </SelectTrigger>
            <SelectContent>
              {trainees.map(trainee => (
                <SelectItem key={trainee.id} value={trainee.user_email}>
                  {trainee.full_name} ({trainee.user_email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Notification Type */}
        <div>
          <Label>סוג התראה *</Label>
          <Select value={notificationType} onValueChange={setNotificationType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="meal_missing">ארוחה חסרה</SelectItem>
              <SelectItem value="water_missing">מים חסרים</SelectItem>
              <SelectItem value="workout_missing">אימון חסר</SelectItem>
              <SelectItem value="coach_message">הודעה מהמאמן</SelectItem>
              <SelectItem value="custom">מותאם אישית</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Channel */}
        <div>
          <Label>ערוץ שליחה *</Label>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="in_app">In-App (פנימי)</SelectItem>
              <SelectItem value="push_phone">Push Phone (טלפון)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Send Mode */}
        <div>
          <Label>מתי לשלוח? *</Label>
          <Select value={sendMode} onValueChange={setSendMode}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="now">עכשיו</SelectItem>
              <SelectItem value="scheduled">תזמון מותאם</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Scheduled Time */}
        {sendMode === 'scheduled' && (
          <div>
            <Label>תאריך ושעה *</Label>
            <Input
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
            />
          </div>
        )}

        {/* Title */}
        <div>
          <Label>כותרת *</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="כותרת ההתראה..."
          />
        </div>

        {/* Body */}
        <div>
          <Label>תוכן ההודעה *</Label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="תוכן ההתראה..."
            rows={4}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={() => createNotificationMutation.mutate()}
            disabled={createNotificationMutation.isPending || !selectedTrainee || !title || !body}
            className="flex-1"
            style={{ backgroundColor: '#79DBD6', color: 'white' }}
          >
            {createNotificationMutation.isPending ? (
              'יוצר...'
            ) : sendMode === 'now' ? (
              <>
                <Send className="w-4 h-4 mr-2" />
                שלח עכשיו
              </>
            ) : (
              <>
                <Clock className="w-4 h-4 mr-2" />
                תזמן התראה
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}