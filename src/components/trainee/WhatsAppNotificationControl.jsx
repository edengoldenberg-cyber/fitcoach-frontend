import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { MessageCircle, AlertCircle } from 'lucide-react';

export default function WhatsAppNotificationControl({ traineeId }) {
  const queryClient = useQueryClient();

  const { data: notifPrefRows = [], isLoading } = useQuery({
    queryKey: ['notif-prefs-wa', traineeId],
    queryFn: () => base44.entities.NotificationPreferences.filter({ trainee_id: traineeId }),
    enabled: !!traineeId,
  });

  const updateNotificationMutation = useMutation({
    mutationFn: async (enabled) => {
      const existing = await base44.entities.NotificationPreferences.filter({ trainee_id: traineeId });
      if (existing.length > 0) {
        await base44.entities.NotificationPreferences.update(existing[0].id, { whatsapp_reminders_enabled: enabled });
      } else {
        await base44.entities.NotificationPreferences.create({ trainee_id: traineeId, whatsapp_reminders_enabled: enabled });
      }
      return enabled;
    },
    onSuccess: (enabled) => {
      queryClient.invalidateQueries({ queryKey: ['notif-prefs-wa', traineeId] });
      toast.success(
        enabled
          ? 'התראות WhatsApp הופעלו ✅'
          : 'התראות WhatsApp הוכבו ❌'
      );
    },
    onError: (err) => {
      toast.error('שגיאה בעדכון ההגדרות');
      console.error('Update failed:', err);
    }
  });

  if (isLoading) return <div className="animate-pulse h-40 bg-slate-100 rounded-lg" />;

  const isEnabled = notifPrefRows[0] ? notifPrefRows[0].whatsapp_reminders_enabled !== false : true;

  return (
    <Card className="card-premium" dir="rtl">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <MessageCircle className="w-5 h-5 text-teal-600" />
          <div className="flex-1">
            <CardTitle className="text-lg">התראות WhatsApp</CardTitle>
            <CardDescription className="text-sm mt-1">
              {isEnabled ? '✅ מופעל' : '❌ מכובה'}
            </CardDescription>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => updateNotificationMutation.mutate(checked)}
            disabled={updateNotificationMutation.isPending}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600 leading-relaxed">
          כאשר מופעל: תקבל/י תזכורות WhatsApp לארוחות, מים ואימונים.
        </p>
        <p className="text-sm text-slate-600 leading-relaxed">
          כאשר מכובה: לא תקבל/י שום תזכורות דרך WhatsApp.
        </p>

        {!isEnabled && (
          <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              התראות מכובות כרגע. אתה/את לא יקבל/תקבלי תזכורות עד להפעלה מחדש.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}