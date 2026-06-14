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

const ACTION_TYPES = [
  { value: 'none', label: 'ללא פעולה' },
  { value: 'open_nutrition', label: 'פתח מילוי אוכל' },
  { value: 'open_water', label: 'פתח מים' },
  { value: 'open_workout', label: 'פתח אימונים' },
  { value: 'open_metrics', label: 'פתח מדדים' },
  { value: 'open_chat_ai', label: 'פתח יועץ AI' },
];

const FILTER_TYPES = [
  { value: 'none', label: 'ללא פילטר' },
  { value: 'no_nutrition_today', label: 'לא מילא אוכל היום' },
  { value: 'no_water_today', label: 'לא מילא מים היום' },
  { value: 'no_workout_week', label: 'לא הזין אימון השבוע' },
  { value: 'inactive_2_days', label: 'לא נכנס 2+ ימים' },
];

export default function CreateRuleDialog({ open, onClose, trainees, coachEmail }) {
  const [name, setName] = useState('');
  const [scheduleType, setScheduleType] = useState('daily');
  const [timeOfDay, setTimeOfDay] = useState('21:00');
  const [audienceType, setAudienceType] = useState('all');
  const [filterType, setFilterType] = useState('none');
  const [titleTemplate, setTitleTemplate] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [actionType, setActionType] = useState('none');
  const [actionLabel, setActionLabel] = useState('');

  const queryClient = useQueryClient();

  const createRuleMutation = useMutation({
    mutationFn: (data) => base44.entities.AutoMessageRule.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoRules'] });
      toast.success('החוק נוצר בהצלחה!');
      handleReset();
      onClose();
    },
    onError: () => {
      toast.error('שגיאה ביצירת החוק');
    },
  });

  const handleCreate = () => {
    if (!name || !titleTemplate || !messageTemplate) {
      toast.error('יש למלא שם, כותרת והודעה');
      return;
    }

    createRuleMutation.mutate({
      coach_email: coachEmail,
      name,
      schedule_type: scheduleType,
      time_of_day: timeOfDay,
      audience_type: audienceType,
      filter_type: audienceType === 'filter' ? filterType : 'none',
      title_template: titleTemplate,
      message_template: messageTemplate,
      action_type: actionType,
      action_label: actionType !== 'none' ? actionLabel : null,
      is_enabled: false,
    });
  };

  const handleReset = () => {
    setName('');
    setTitleTemplate('');
    setMessageTemplate('');
    setActionType('none');
    setActionLabel('');
    setFilterType('none');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>יצירת חוק אוטומטי</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>שם החוק</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="לדוגמה: תזכורת אוכל יומית"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>תדירות</Label>
              <Select value={scheduleType} onValueChange={setScheduleType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">יומי</SelectItem>
                  <SelectItem value="weekly">שבועי</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>שעה</Label>
              <Input
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>קהל יעד</Label>
            <Select value={audienceType} onValueChange={setAudienceType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל המתאמנים</SelectItem>
                <SelectItem value="filter">לפי פילטר</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {audienceType === 'filter' && (
            <div>
              <Label>פילטר</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>כותרת הודעה</Label>
            <Input
              value={titleTemplate}
              onChange={(e) => setTitleTemplate(e.target.value)}
              placeholder="כותרת ההודעה"
            />
          </div>

          <div>
            <Label>תוכן הודעה</Label>
            <Textarea
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              placeholder="תוכן ההודעה... (השתמש ב-{name} לשם המתאמן)"
              rows={4}
            />
          </div>

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
                placeholder="טקסט הכפתור"
                className="mt-2"
              />
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              💡 החוק ייווצר במצב כבוי. לאחר היצירה, תוכל להפעילו מרשימת החוקים.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { handleReset(); onClose(); }}>
            ביטול
          </Button>
          <Button
            onClick={handleCreate}
            disabled={createRuleMutation.isPending}
            style={{ backgroundColor: '#79DBD6', color: 'white' }}
          >
            צור חוק
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}