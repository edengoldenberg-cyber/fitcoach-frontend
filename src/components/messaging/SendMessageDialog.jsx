import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Send, Sparkles } from 'lucide-react';

const TEMPLATES = [
  { title: 'תזכורת תזונה', message: 'היי {name} 👋\nלא מילאת היום תזונה - בוא נסגור את זה! 💪', action: 'open_nutrition', actionLabel: 'פתח מילוי אוכל' },
  { title: 'תזכורת מים', message: 'היי {name} 💧\nזמן לשתות מים - בוא נתקדם היום!', action: 'open_water', actionLabel: 'פתח מים' },
  { title: 'עידוד', message: 'אלוף/ה {name}! 👏\nתמשיך/י ככה, את/ה עושה עבודה מדהימה!', action: 'none', actionLabel: '' },
  { title: 'תזכורת אימון', message: 'היי {name} 🏋️\nלא שכחת לעדכן מה עשית היום?', action: 'open_workout', actionLabel: 'פתח אימונים' },
];

const ACTION_TYPES = [
  { value: 'none', label: 'ללא פעולה' },
  { value: 'open_nutrition', label: 'פתח מילוי אוכל' },
  { value: 'open_water', label: 'פתח מים' },
  { value: 'open_workout', label: 'פתח אימונים' },
  { value: 'open_metrics', label: 'פתח מדדים' },
  { value: 'open_chat_ai', label: 'פתח יועץ AI' },
];

export default function SendMessageDialog({ 
  open, 
  onClose, 
  trainees, 
  coachEmail,
  preselectedTrainee = null,
  prefilledTemplate = null
}) {
  const [recipientType, setRecipientType] = useState('single');
  const [selectedTrainees, setSelectedTrainees] = useState(
    preselectedTrainee ? [preselectedTrainee.id] : []
  );
  const [title, setTitle] = useState(prefilledTemplate?.title || '');
  const [message, setMessage] = useState(
    prefilledTemplate?.message?.replace('{name}', preselectedTrainee?.full_name.split(' ')[0] || '{name}') || ''
  );
  const [category, setCategory] = useState('כללי');
  const [actionType, setActionType] = useState(prefilledTemplate?.action || 'none');
  const [actionLabel, setActionLabel] = useState(prefilledTemplate?.actionLabel || '');
  const [sendToWhatsApp, setSendToWhatsApp] = useState(false);

  const queryClient = useQueryClient();

  const sendNotificationMutation = useMutation({
    mutationFn: async (data) => {
      
      const notification = await base44.entities.Notification.create({
        ...data,
        status: 'sent',
        sent_at: new Date().toISOString(),
      });

      console.log('[SendMessage] Notification created:', notification.id);

      // Create notification receipts for all recipients (so they see it in app)
      for (const email of data.recipient_emails) {
        await base44.entities.NotificationReceipt.create({
          notification_id: notification.id,
          trainee_email: email,
          delivered_at: new Date().toISOString()
        });
      }

      console.log('[SendMessage] Receipts created for', data.recipient_emails.length, 'trainees');

      // Send push notifications via backend function
      try {
        const result = await base44.functions.invoke('sendPushNotification', {
          notification_id: notification.id,
          trainee_emails: data.recipient_emails,
          title: data.title,
          message: data.message,
          action_type: data.action_type
        });
        } catch (err) {
        console.error('[SendMessage] Failed to send push notifications:', err);
        // Continue anyway - receipts were created
      }

      return notification;
    },
    onSuccess: () => {
      console.log('[SendMessage] Success!');
      queryClient.invalidateQueries({ queryKey: ['sentNotifications'] });
      toast.success('ההודעה נשלחה בהצלחה!');
      handleReset();
      onClose();
    },
    onError: (error) => {
      console.error('[SendMessage] Error:', error);
      toast.error('שגיאה בשליחת ההודעה: ' + error.message);
    },
  });

  const handleTemplateSelect = (template) => {
    setTitle(template.title);
    setMessage(template.message);
    setActionType(template.action);
    setActionLabel(template.actionLabel);
  };

  const handleSend = () => {
    
    if (!title || !message || selectedTrainees.length === 0) {
      toast.error('יש למלא כותרת, הודעה ולבחור מתאמנים');
      return;
    }

    const recipientEmails = selectedTrainees.map(id => {
      const trainee = trainees.find(t => t.id === id);
      return trainee?.user_email;
    }).filter(Boolean);


    sendNotificationMutation.mutate({
      coach_email: coachEmail,
      recipient_type: recipientType,
      recipient_emails: recipientEmails,
      title,
      message,
      category,
      channel: sendToWhatsApp ? 'both' : 'in_app',
      action_type: actionType,
      action_label: actionType !== 'none' ? actionLabel : null,
    });
  };

  const handleReset = () => {
    setTitle('');
    setMessage('');
    setSelectedTrainees([]);
    setActionType('none');
    setActionLabel('');
    setSendToWhatsApp(false);
  };

  const toggleTrainee = (traineeId) => {
    setSelectedTrainees(prev =>
      prev.includes(traineeId) ? prev.filter(id => id !== traineeId) : [...prev, traineeId]
    );
  };

  const selectAll = () => {
    setSelectedTrainees(trainees.filter(t => t.status === 'active').map(t => t.id));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>שליחת הודעה חדשה</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Templates */}
          <div>
            <Label>תבניות מוכנות</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {TEMPLATES.map((template, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  onClick={() => handleTemplateSelect(template)}
                  className="justify-start text-right"
                >
                  <Sparkles className="w-3 h-3 ml-1" />
                  {template.title}
                </Button>
              ))}
            </div>
          </div>

          {/* Recipients */}
          <div>
            <Label>נמענים</Label>
            <div className="flex gap-2 items-center mt-2 mb-3">
              <Button
                variant={selectedTrainees.length === trainees.filter(t => t.status === 'active').length ? 'default' : 'outline'}
                size="sm"
                onClick={selectAll}
              >
                בחר הכל ({trainees.filter(t => t.status === 'active').length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedTrainees([])}
              >
                נקה בחירה
              </Button>
              <span className="text-sm text-slate-600 mr-auto">
                נבחרו: {selectedTrainees.length}
              </span>
            </div>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
              {trainees.filter(t => t.status === 'active').map(trainee => (
                <div key={trainee.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedTrainees.includes(trainee.id)}
                    onCheckedChange={() => toggleTrainee(trainee.id)}
                  />
                  <span className="text-sm">{trainee.full_name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <Label>כותרת</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="כותרת ההודעה"
            />
          </div>

          {/* Message */}
          <div>
            <Label>הודעה</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="תוכן ההודעה... (השתמש ב-{name} לשם המתאמן)"
              rows={4}
            />
            <p className="text-xs text-slate-500 mt-1">טיפ: השתמש ב-{'{name}'} כדי להזין שם המתאמן</p>
          </div>

          {/* Category */}
          <div>
            <Label>קטגוריה</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="תזכורת">תזכורת</SelectItem>
                <SelectItem value="עידוד">עידוד</SelectItem>
                <SelectItem value="משימה">משימה</SelectItem>
                <SelectItem value="כללי">כללי</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Action Button */}
          <div>
            <Label>כפתור פעולה (CTA)</Label>
            <Select value={actionType} onValueChange={(val) => {
              setActionType(val);
              if (val === 'none') setActionLabel('');
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {actionType !== 'none' && (
              <Input
                value={actionLabel}
                onChange={(e) => setActionLabel(e.target.value)}
                placeholder="טקסט הכפתור (לדוגמה: 'פתח מילוי אוכל')"
                className="mt-2"
              />
            )}
          </div>

          {/* WhatsApp */}
          <div className="flex items-center gap-2">
            <Checkbox
              checked={sendToWhatsApp}
              onCheckedChange={setSendToWhatsApp}
            />
            <Label>שלח גם בוואטסאפ (יפתח קישורים)</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { handleReset(); onClose(); }}>
            ביטול
          </Button>
          <Button
            onClick={handleSend}
            disabled={sendNotificationMutation.isPending}
            style={{ backgroundColor: '#79DBD6', color: 'white' }}
          >
            <Send className="w-4 h-4 ml-2" />
            שלח עכשיו
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}