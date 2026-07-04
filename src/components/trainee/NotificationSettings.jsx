import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { MessageCircle, Moon } from 'lucide-react';

const DAYS = [
  { key: 'sunday',    label: 'ראשון' },
  { key: 'monday',    label: 'שני' },
  { key: 'tuesday',   label: 'שלישי' },
  { key: 'wednesday', label: 'רביעי' },
  { key: 'thursday',  label: 'חמישי' },
  { key: 'friday',    label: 'שישי' },
  { key: 'saturday',  label: 'שבת' },
];

export default function NotificationSettings({ userEmail }) {
  const queryClient = useQueryClient();

  const { data: prefList = [], isLoading } = useQuery({
    queryKey: ['notificationPreferences', userEmail],
    queryFn: () => base44.entities.NotificationPreferences.filter({ trainee_email: userEmail }),
    enabled: !!userEmail,
  });

  const { data: traineeList = [] } = useQuery({
    queryKey: ['notificationSettingsTrainee', userEmail],
    queryFn: () => base44.entities.Trainee.filter({ user_email: userEmail }),
    enabled: !!userEmail,
  });

  const pref = [...prefList].sort((a, b) => new Date(b.updated_date || b.created_date || 0) - new Date(a.updated_date || a.created_date || 0))[0] || null;
  const trainee = traineeList.find(t => t.status === 'active') || traineeList[0] || null;

  const [enabled, setEnabled] = useState(true);
  const [disabledDays, setDisabledDays] = useState([]);

  useEffect(() => {
    if (pref) {
      setEnabled(pref.whatsapp_reminders_enabled ?? false);
      setDisabledDays(pref.disabled_days || []);
    }
  }, [pref]);

  // Build the full set of fields written on every save.
  // When the master toggle is ON, all reminder types are enabled.
  // When OFF, all are disabled. Coach can refine via the automations panel.
  const buildPrefsPayload = (masterEnabled) => ({
    whatsapp_reminders_enabled:   masterEnabled,
    nutrition_reminders_enabled:  masterEnabled,
    water_reminders_enabled:      masterEnabled,
    workout_reminders_enabled:    masterEnabled,
    weigh_in_reminders_enabled:   masterEnabled,
    inactivity_reminders_enabled: masterEnabled,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (pref?.id) {
        return base44.entities.NotificationPreferences.update(pref.id, data);
      } else {
        return base44.entities.NotificationPreferences.create({ trainee_email: userEmail, ...data });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationPreferences', userEmail] });
      toast.success('ההגדרות נשמרו ✓');
    },
    onError: (err) => {
      console.error('[NotificationSettings] save error:', err);
      toast.error('שגיאה בשמירת ההגדרות');
    },
  });

  const handleToggleEnabled = (val) => {
    setEnabled(val);
    saveMutation.mutate(buildPrefsPayload(val));
  };

  const handleToggleDay = (dayKey) => {
    const updated = disabledDays.includes(dayKey)
      ? disabledDays.filter(d => d !== dayKey)
      : [...disabledDays, dayKey];
    setDisabledDays(updated);
    // disabled_days is UI-only preference — not in NotificationPreferences schema,
    // so we store it only locally (and in a future schema field if added).
  };

  if (isLoading) return <p className="text-center text-slate-400 py-8">טוען הגדרות...</p>;

  return (
    <div className="space-y-4">
      {/* WhatsApp master toggle */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#25D36620' }}>
              <MessageCircle className="w-5 h-5" style={{ color: '#25D366' }} />
            </div>
            <div>
              <p className="font-semibold text-slate-800">תזכורות WhatsApp</p>
              <p className="text-sm text-slate-500">קבל תזכורות יומיות על תזונה, מים ואימונים</p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={handleToggleEnabled} />
        </div>
      </Card>

      {/* Days selector */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Moon className="w-5 h-5 text-slate-500" />
          <div>
            <p className="font-semibold text-slate-800">השתקה לפי ימים</p>
            <p className="text-sm text-slate-500">בחר ימים שלא תרצה לקבל תזכורות</p>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {DAYS.map((day) => {
            const isMuted = disabledDays.includes(day.key);
            return (
              <button
                key={day.key}
                onClick={() => handleToggleDay(day.key)}
                disabled={!enabled}
                className={`flex flex-col items-center justify-center rounded-xl py-3 px-1 transition-all text-xs font-medium border-2 ${
                  isMuted
                    ? 'bg-slate-100 border-slate-300 text-slate-400'
                    : 'border-transparent text-white'
                } ${!enabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                style={!isMuted && enabled ? { backgroundColor: '#79DBD6', borderColor: '#79DBD6' } : {}}
              >
                <span>{day.label}</span>
                {isMuted && <span className="text-[10px] mt-1">🔕</span>}
              </button>
            );
          })}
        </div>

        {disabledDays.length > 0 && (
          <p className="text-xs text-slate-400 mt-3 text-center">
            תזכורות מושתקות ב: {disabledDays.map(d => DAYS.find(x => x.key === d)?.label).join(', ')}
          </p>
        )}
      </Card>
    </div>
  );
}