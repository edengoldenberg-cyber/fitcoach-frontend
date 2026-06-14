import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Play, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ManualNotificationRunner() {
  const [lastRun, setLastRun] = useState(null);

  const runTestNowMutation = useMutation({
    mutationFn: async () => {
      const result = await base44.functions.invoke('checkDailyNotifications', {
        time_of_day: 'morning'
      });
      return result.data;
    },
    onSuccess: (data) => {
      setLastRun({ ...data, time: 'test' });
      if (data.ok) {
        toast.success(
          `✓ Notification Test Complete!\n` +
          `Users checked: ${data.trainees_checked}\n` +
          `Notifications created: ${data.notifications_created}\n` +
          `Push sent: ${data.push_sent}\n` +
          `Failed: ${data.push_failed}`
        );
      } else {
        toast.error(`Error: ${data.error || 'Unknown error'}`);
      }
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    }
  });

  const runMorningMutation = useMutation({
    mutationFn: async () => {
      const result = await base44.functions.invoke('checkDailyNotifications', {
        time_of_day: 'morning'
      });
      return result.data;
    },
    onSuccess: (data) => {
      setLastRun({ ...data, time: 'morning' });
      if (data.ok) {
        toast.success(`✓ בוקר: ${data.notifications_created} התראות נוצרו, ${data.push_sent} push נשלחו`);
      } else {
        toast.error(`שגיאה: ${data.error}`);
      }
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  const runEveningMutation = useMutation({
    mutationFn: async () => {
      const result = await base44.functions.invoke('checkDailyNotifications', {
        time_of_day: 'evening'
      });
      return result.data;
    },
    onSuccess: (data) => {
      setLastRun({ ...data, time: 'evening' });
      if (data.ok) {
        toast.success(`✓ ערב: ${data.notifications_created} התראות נוצרו, ${data.push_sent} push נשלחו`);
      } else {
        toast.error(`שגיאה: ${data.error}`);
      }
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  const isRunning = runTestNowMutation.isPending || runMorningMutation.isPending || runEveningMutation.isPending;

  return (
    <div className="space-y-4">
      {lastRun && (
        <Card className="p-4 bg-slate-50 border-2 border-teal-200">
          <div className="text-sm font-bold mb-3 text-teal-800">
            Notification Test Result:
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Users checked:</span>
              <span className="font-bold">{lastRun.trainees_checked}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Notifications created:</span>
              <span className="font-bold">{lastRun.notifications_created}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Push sent:</span>
              <span className="font-bold text-green-600">{lastRun.push_sent}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Failed:</span>
              <span className={`font-bold ${lastRun.push_failed > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                {lastRun.push_failed}
              </span>
            </div>
          </div>
          {lastRun.errors && lastRun.errors.length > 0 && (
            <div className="mt-3 pt-3 border-t border-red-200">
              <div className="text-xs text-red-600 font-medium">
                Error: {lastRun.errors.length} failures detected
              </div>
            </div>
          )}
        </Card>
      )}

      <Button
        onClick={() => runTestNowMutation.mutate()}
        disabled={isRunning}
        className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium"
        size="lg"
      >
        {runTestNowMutation.isPending ? (
          <>
            <Loader2 className="w-5 h-5 ml-2 animate-spin" />
            Running Test...
          </>
        ) : (
          <>
            <Play className="w-5 h-5 ml-2" />
            Run Notification Test Now
          </>
        )}
      </Button>

      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={() => runMorningMutation.mutate()}
          disabled={isRunning}
          variant="outline"
          className="flex flex-col h-auto py-3"
        >
          {runMorningMutation.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin mb-1" />
          ) : (
            <Play className="w-5 h-5 mb-1" />
          )}
          <span className="text-xs">בוקר</span>
          <span className="text-[10px] text-slate-500">09:00</span>
        </Button>

        <Button
          onClick={() => runEveningMutation.mutate()}
          disabled={isRunning}
          variant="outline"
          className="flex flex-col h-auto py-3"
        >
          {runEveningMutation.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin mb-1" />
          ) : (
            <Play className="w-5 h-5 mb-1" />
          )}
          <span className="text-xs">ערב</span>
          <span className="text-[10px] text-slate-500">20:00</span>
        </Button>
      </div>
    </div>
  );
}