import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { MessageCircle, Utensils, Droplets, Dumbbell, Scale } from 'lucide-react';

// ─── Reminder types controlled by the trainee ────────────────────────────────
// These are the ONLY types the trainee can enable/disable.
// Business automations (inactivity follow-ups, campaigns, etc.) are NOT shown
// here — those are controlled by the coach from Mission Control.
const REMINDER_TYPES = [
  {
    key:   'nutrition',
    field: 'nutrition_reminders_enabled',
    label: 'תזכורות תזונה',
    desc:  'תזכורות לרישום ארוחות (בוקר, צהריים, ערב)',
    Icon:  Utensils,
  },
  {
    key:   'water',
    field: 'water_reminders_enabled',
    label: 'תזכורות מים',
    desc:  'תזכורות לשתייה במהלך היום',
    Icon:  Droplets,
  },
  {
    key:   'workout',
    field: 'workout_reminders_enabled',
    label: 'תזכורות אימון',
    desc:  'עדכון שבועי על מספר האימונים',
    Icon:  Dumbbell,
  },
  {
    key:   'weigh_in',
    field: 'weigh_in_reminders_enabled',
    label: 'תזכורות שקילה',
    desc:  'תזכורת כל 3 שבועות לעדכון מדידות',
    Icon:  Scale,
  },
];

export default function NotificationSettings({ userEmail }) {
  const queryClient = useQueryClient();

  const { data: prefList = [], isLoading } = useQuery({
    queryKey: ['notificationPreferences', userEmail],
    queryFn: () => base44.entities.NotificationPreferences.filter({ trainee_email: userEmail }),
    enabled: !!userEmail,
  });

  const pref = [...prefList].sort(
    (a, b) => new Date(b.updated_date || b.created_date || 0) - new Date(a.updated_date || a.created_date || 0)
  )[0] || null;

  // Master toggle state
  const [master, setMaster] = useState(false);
  // Per-type toggle state
  const [types, setTypes] = useState({
    nutrition_reminders_enabled:  false,
    water_reminders_enabled:      false,
    workout_reminders_enabled:    false,
    weigh_in_reminders_enabled:   false,
  });

  useEffect(() => {
    if (pref) {
      const masterOn = pref.whatsapp_reminders_enabled ?? false;
      setMaster(masterOn);
      setTypes({
        nutrition_reminders_enabled:  pref.nutrition_reminders_enabled  ?? false,
        water_reminders_enabled:      pref.water_reminders_enabled      ?? false,
        workout_reminders_enabled:    pref.workout_reminders_enabled    ?? false,
        weigh_in_reminders_enabled:   pref.weigh_in_reminders_enabled   ?? false,
      });
    }
  }, [pref?.id]);

  // Builds the payload written to the DB on every save.
  // whatsapp_reminders_enabled is the master gate (true = reminders enabled at all).
  // Per-type fields control individual reminder types.
  // inactivity_reminders_enabled is intentionally excluded — it is a business
  // automation controlled by the coach, not a trainee preference.
  const buildPayload = (masterEnabled, perTypes) => ({
    whatsapp_reminders_enabled:  masterEnabled,
    nutrition_reminders_enabled: masterEnabled && (perTypes.nutrition_reminders_enabled ?? false),
    water_reminders_enabled:     masterEnabled && (perTypes.water_reminders_enabled     ?? false),
    workout_reminders_enabled:   masterEnabled && (perTypes.workout_reminders_enabled   ?? false),
    weigh_in_reminders_enabled:  masterEnabled && (perTypes.weigh_in_reminders_enabled  ?? false),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (pref?.id) {
        return base44.entities.NotificationPreferences.update(pref.id, data);
      }
      return base44.entities.NotificationPreferences.create({ trainee_email: userEmail, ...data });
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

  // Master toggle: turns all reminders ON or OFF together
  const handleMasterToggle = (val) => {
    const newTypes = val
      ? { nutrition_reminders_enabled: true, water_reminders_enabled: true, workout_reminders_enabled: true, weigh_in_reminders_enabled: true }
      : { nutrition_reminders_enabled: false, water_reminders_enabled: false, workout_reminders_enabled: false, weigh_in_reminders_enabled: false };
    setMaster(val);
    setTypes(newTypes);
    saveMutation.mutate(buildPayload(val, newTypes));
  };

  // Individual type toggle
  const handleTypeToggle = (field, val) => {
    const newTypes = { ...types, [field]: val };
    // If any type is now ON, master must be ON
    const anyOn = Object.values(newTypes).some(Boolean);
    const newMaster = anyOn;
    setTypes(newTypes);
    setMaster(newMaster);
    saveMutation.mutate(buildPayload(newMaster, newTypes));
  };

  if (isLoading) return <p className="text-center text-slate-400 py-8">טוען הגדרות...</p>;

  return (
    <div className="space-y-3" dir="rtl">
      {/* Master toggle */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#25D36620' }}>
              <MessageCircle className="w-5 h-5" style={{ color: '#25D366' }} />
            </div>
            <div>
              <p className="font-semibold text-slate-800">תזכורות WhatsApp</p>
              <p className="text-sm text-slate-500">הפעל תזכורות אישיות דרך WhatsApp</p>
            </div>
          </div>
          <Switch checked={master} onCheckedChange={handleMasterToggle} disabled={saveMutation.isPending} />
        </div>
      </Card>

      {/* Per-type toggles — only visible when master is ON */}
      {master && (
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">בחר סוגי תזכורות</p>
          <div className="space-y-3">
            {REMINDER_TYPES.map(({ key, field, label, desc, Icon }) => (
              <div key={key} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">{label}</p>
                    <p className="text-xs text-slate-400">{desc}</p>
                  </div>
                </div>
                <Switch
                  checked={types[field] ?? false}
                  onCheckedChange={(val) => handleTypeToggle(field, val)}
                  disabled={saveMutation.isPending}
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Info note */}
      <p className="text-xs text-slate-400 text-center px-2">
        הודעות עסקיות כגון הזמנות, תזכורות חברות ועדכוני אימון מהמאמן ישלחו בכל מקרה.
      </p>
    </div>
  );
}
