import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Bell, BellOff, Utensils, Droplets, CheckCircle2, XCircle, Clock, MessageSquare, Smartphone } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';

const DAY_LABELS = {
  sunday: 'א׳', monday: 'ב׳', tuesday: 'ג׳', wednesday: 'ד׳',
  thursday: 'ה׳', friday: 'ו׳', saturday: 'ש׳',
};
const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export default function TraineeNotificationsTab({ trainee }) {
  const email = trainee.user_email;

  // העדפות התראות
  const { data: prefs = [] } = useQuery({
    queryKey: ['notif-prefs', email],
    queryFn: () => base44.entities.NotificationPreference.filter({ trainee_email: email }),
    enabled: !!email,
  });
  const pref = prefs[0];

  // הודעות WhatsApp שנשלחו למתאמן ב-7 ימים אחרונים
  const { data: waMsgs = [] } = useQuery({
    queryKey: ['wa-msgs-trainee', trainee.id],
    queryFn: () => base44.entities.WhatsAppMessageQueue.filter({ context_id: trainee.id }),
    enabled: !!trainee.id,
  });

  // ארוחות 7 ימים אחרונים לחישוב עקביות
  const { data: meals = [] } = useQuery({
    queryKey: ['tm-meals-7d', email],
    queryFn: () => base44.entities.MealEntry.filter({ trainee_email: email }),
    enabled: !!email,
  });

  // מים 7 ימים אחרונים
  const { data: water = [] } = useQuery({
    queryKey: ['tm-water-7d', email],
    queryFn: () => base44.entities.WaterEntry.filter({ trainee_email: email }),
    enabled: !!email,
  });

  // 7 ימים אחרונים
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), i);
    return format(d, 'yyyy-MM-dd');
  }).reverse();

  // חישוב עקביות יומי
  const dailyStats = last7Days.map(date => {
    const dayMeals = meals.filter(m => m.date === date);
    const dayWater = water.filter(w => w.date === date);
    const totalWater = dayWater.reduce((s, w) => s + (w.amount_ml || 0), 0);
    const totalCal = dayMeals.reduce((s, m) => s + (m.calories || 0), 0);
    const mealOk = dayMeals.length >= 2; // לפחות 2 ארוחות = פעיל
    const waterOk = totalWater >= (trainee.water_target_ml || 2500) * 0.6;
    return { date, dayMeals: dayMeals.length, totalCal, totalWater, mealOk, waterOk };
  });

  const mealConsistency = dailyStats.filter(d => d.mealOk).length;
  const waterConsistency = dailyStats.filter(d => d.waterOk).length;

  // הודעות אחרונות
  const recentWa = [...waMsgs]
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
    .slice(0, 5);

  const queryClient = useQueryClient();
  const remindersEnabled = pref ? pref.whatsapp_reminders_enabled !== false : true;
  const disabledDays = pref?.disabled_days || [];

  // Per-trainee WhatsApp opt-in — read from NotificationPreferences; Trainee has no such field
  const waEnabled = trainee.whatsapp_reminders_enabled !== false;

  const toggleWaMutation = useMutation({
    mutationFn: async (newVal) => {
      const existing = await base44.entities.NotificationPreferences.filter({ trainee_id: trainee.id });
      if (existing.length > 0) {
        await base44.entities.NotificationPreferences.update(existing[0].id, { whatsapp_reminders_enabled: newVal });
      } else {
        await base44.entities.NotificationPreferences.create({ trainee_id: trainee.id, trainee_email: trainee.user_email, whatsapp_reminders_enabled: newVal });
      }
      return newVal;
    },
    onSuccess: (newVal) => {
      toast.success(newVal ? '✅ התראות WhatsApp הופעלו' : '🔕 התראות WhatsApp כובו');
      queryClient.invalidateQueries({ queryKey: ['trainee'] });
      queryClient.invalidateQueries({ queryKey: ['allTraineesForAutomations'] });
    },
    onError: (e) => toast.error('שגיאה: ' + e.message),
  });

  return (
    <div className="space-y-4 mt-3">

      {/* WhatsApp Opt-in/out Toggle */}
      <Card className={`p-4 border-2 ${!waEnabled ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${!waEnabled ? 'bg-red-100' : 'bg-green-100'}`}>
              <Smartphone className={`w-5 h-5 ${!waEnabled ? 'text-red-500' : 'text-green-600'}`} />
            </div>
            <div>
              <p className={`font-bold text-sm ${!waEnabled ? 'text-red-700' : 'text-green-700'}`}>
                {waEnabled ? '📱 התראות WhatsApp פעילות' : '🔕 התראות WhatsApp כבויות'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {waEnabled
                  ? 'המתאמן יקבל תזכורות אוטומטיות (מים, ארוחות, אימונים)'
                  : 'המתאמן לא יקבל שום הודעת WhatsApp אוטומטית'}
              </p>
            </div>
          </div>
          <Switch
            checked={waEnabled}
            disabled={toggleWaMutation.isPending}
            onCheckedChange={(v) => toggleWaMutation.mutate(v)}
          />
        </div>
        {!waEnabled && (
          <div className="mt-2 px-3 py-1.5 bg-red-100 rounded-lg text-xs text-red-700">
            סיבת דילוג בסימולציות: <strong>whatsapp_notifications_disabled</strong>
          </div>
        )}
      </Card>

      {/* סטטוס התראות — סיכור ברור */}
      <Card className={`p-4 border-2 ${!remindersEnabled ? 'border-red-200 bg-red-50' : disabledDays.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${!remindersEnabled ? 'bg-red-100' : disabledDays.length > 0 ? 'bg-amber-100' : 'bg-emerald-100'}`}>
            {!remindersEnabled
              ? <BellOff className="w-6 h-6 text-red-500" />
              : disabledDays.length > 0
              ? <BellOff className="w-6 h-6 text-amber-500" />
              : <Bell className="w-6 h-6 text-emerald-500" />
            }
          </div>
          <div>
            <p className={`font-bold text-base ${!remindersEnabled ? 'text-red-700' : disabledDays.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {!remindersEnabled
                ? '🔕 המתאמן השתיק את כל התזכורות'
                : disabledDays.length > 0
                ? `🔔 פעיל — מושתק ${disabledDays.length} ימים`
                : '🔔 תזכורות פעילות לחלוטין'
              }
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {!remindersEnabled
                ? 'לא ישלחו תזכורות אוטומטיות למתאמן זה'
                : disabledDays.length > 0
                ? `מושתק ב: ${disabledDays.map(d => DAY_LABELS[d]).join(', ')}`
                : !pref
                ? 'ברירת מחדל — לא שינה הגדרות'
                : 'כל ימות השבוע פעילים'
              }
            </p>
          </div>
        </div>

        {/* תצוגת ימים */}
        {(pref || true) && (
          <div className="flex gap-1.5 flex-wrap mt-3">
            {DAY_ORDER.map(day => {
              const muted = !remindersEnabled || disabledDays.includes(day);
              return (
                <div key={day} className="flex flex-col items-center gap-0.5">
                  <span className={`w-9 h-9 flex items-center justify-center rounded-full text-xs font-bold border-2
                    ${muted ? 'bg-white text-slate-400 border-slate-200' : 'bg-white text-teal-700 border-teal-400'}`}>
                    {DAY_LABELS[day]}
                  </span>
                  <span className="text-[9px]">{muted ? '🔕' : '🔔'}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* עקביות 7 ימים */}
      <Card className="p-4 bg-white border-0 shadow-sm">
        <h3 className="font-semibold text-slate-700 text-sm mb-3">📊 עקביות 7 ימים אחרונים</h3>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-emerald-50 rounded-xl p-3 text-center">
            <Utensils className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-emerald-700">{mealConsistency}/7</p>
            <p className="text-xs text-emerald-600">ימים עם ≥2 ארוחות</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <Droplets className="w-5 h-5 text-blue-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-blue-700">{waterConsistency}/7</p>
            <p className="text-xs text-blue-600">ימים עם 60%+ ממים</p>
          </div>
        </div>

        {/* טבלת ימים */}
        <div className="space-y-1.5">
          {dailyStats.map(({ date, dayMeals, totalCal, totalWater, mealOk, waterOk }) => (
            <div key={date} className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
              <span className="text-xs text-slate-500 w-20 flex-shrink-0">{format(new Date(date + 'T12:00:00'), 'd/M')}</span>
              <div className="flex items-center gap-1 flex-1">
                {mealOk
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  : <XCircle className="w-3.5 h-3.5 text-slate-300" />}
                <span className="text-xs text-slate-600">{dayMeals} ארוחות · {totalCal} קל׳</span>
              </div>
              <div className="flex items-center gap-1">
                {waterOk
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                  : <XCircle className="w-3.5 h-3.5 text-slate-300" />}
                <span className="text-xs text-slate-600">{(totalWater / 1000).toFixed(1)}L</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* הודעות WhatsApp אחרונות */}
      <Card className="p-4 bg-white border-0 shadow-sm">
        <h3 className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-green-500" />
          תזכורות WhatsApp אחרונות
        </h3>
        {recentWa.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">אין הודעות WhatsApp</p>
        ) : (
          <div className="space-y-2">
            {recentWa.map(msg => (
              <div key={msg.id} className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={
                      msg.status === 'sent' ? 'bg-emerald-100 text-emerald-700 text-[10px]' :
                      msg.status === 'failed' ? 'bg-red-100 text-red-700 text-[10px]' :
                      msg.status === 'queued' ? 'bg-amber-100 text-amber-700 text-[10px]' :
                      'bg-slate-100 text-slate-600 text-[10px]'
                    }>
                      {msg.status === 'sent' ? '✓ נשלח' :
                       msg.status === 'failed' ? '✗ נכשל' :
                       msg.status === 'queued' ? '⏳ ממתין' : msg.status}
                    </Badge>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {msg.created_date ? format(new Date(msg.created_date), 'd/M HH:mm') : ''}
                    </span>
                    {msg.template_key && (
                      <span className="text-[10px] text-slate-400">
                        {msg.template_key === 'meal_reminder' ? '🍳 ארוחות' :
                         msg.template_key === 'water_reminder' ? '💧 מים' : msg.template_key}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2">{msg.rendered_text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}