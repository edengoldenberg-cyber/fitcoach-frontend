import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { MessageCircle, AlertCircle } from 'lucide-react';

export default function WhatsAppNotificationControl({ traineeId }) {
  const queryClient = useQueryClient();

  const { data: trainee, isLoading } = useQuery({
    queryKey: ['trainee', traineeId],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ id: traineeId });
      return trainees[0] || null;
    }
  });

  const updateNotificationMutation = useMutation({
    mutationFn: async (enabled) => {
      await base44.entities.Trainee.update(traineeId, {
        whatsapp_notifications_enabled: enabled
      });
      return enabled;
    },
    onSuccess: (enabled) => {
      queryClient.invalidateQueries({ queryKey: ['trainee', traineeId] });
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

  const isEnabled = trainee?.whatsapp_notifications_enabled ?? true;

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