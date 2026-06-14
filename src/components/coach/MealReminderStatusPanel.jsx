import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

export default function MealReminderStatusPanel({ traineeId, traineeEmail }) {
  const [mealStatus, setMealStatus] = useState({
    breakfast: null,
    lunch: null,
    dinner: null
  });

  const { data: userState } = useQuery({
    queryKey: ['traineeState', traineeId],
    queryFn: async () => {
      const res = await base44.functions.invoke('getUserStateSnapshot', {
        traineeId,
        traineeEmail
      });
      return res.snapshot;
    },
    refetchInterval: 30000
  });

  const { data: eventLogs } = useQuery({
    queryKey: ['mealEventLogs', traineeId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      return await base44.entities.WhatsAppEventLog.filter({
        trainee_id: traineeId,
        trigger_type: { $in: ['breakfast_check', 'lunch_check', 'dinner_check'] },
        timestamp: { $gte: `${today}T00:00:00Z` }
      });
    },
    refetchInterval: 30000
  });

  useEffect(() => {
    if (!userState || !eventLogs) return;

    const mealWindows = {
      breakfast: { time: '10:00', index: 0 },
      lunch: { time: '14:00', index: 1 },
      dinner: { time: '19:00', index: 2 }
    };

    const newStatus = {};
    for (const [meal, { time, index }] of Object.entries(mealWindows)) {
      const mealsLogged = userState.meals_logged_today || 0;
      const isMealLogged = mealsLogged > index;
      const reminderSent = eventLogs?.some(e => e.trigger_type === `${meal}_check` && e.event_type === 'message_sent');

      newStatus[meal] = {
        time,
        logged: isMealLogged,
        reminderSent,
        blocked: false,
        blockedReason: null
      };

      // Determine if reminder would be blocked
      if (isMealLogged) {
        newStatus[meal].blocked = true;
        newStatus[meal].blockedReason = 'meal_logged';
      } else if (userState.is_in_recovery) {
        newStatus[meal].blocked = true;
        newStatus[meal].blockedReason = 'recovery_mode';
      } else if (userState.last_login_hours > 72) {
        newStatus[meal].blocked = true;
        newStatus[meal].blockedReason = 'user_inactive';
      } else if (userState.silent_count >= 3) {
        newStatus[meal].blocked = true;
        newStatus[meal].blockedReason = 'silent_mode';
      }
    }

    setMealStatus(newStatus);
  }, [userState, eventLogs]);

  if (!userState) {
    return <div className="p-4 text-slate-500">Loading...</div>;
  }

  const getMealStatusColor = (meal) => {
    if (mealStatus[meal]?.logged) return 'text-green-600';
    if (mealStatus[meal]?.blocked) return 'text-red-600';
    if (mealStatus[meal]?.reminderSent) return 'text-orange-600';
    return 'text-slate-600';
  };

  const getMealStatusIcon = (meal) => {
    if (mealStatus[meal]?.logged) return <CheckCircle2 className="w-4 h-4" />;
    if (mealStatus[meal]?.blocked) return <XCircle className="w-4 h-4" />;
    if (mealStatus[meal]?.reminderSent) return <AlertCircle className="w-4 h-4" />;
    return <Clock className="w-4 h-4" />;
  };

  return (
    <Card className="card-premium">
      <CardHeader>
        <CardTitle className="text-lg">Meal Reminders Status</CardTitle>
        <CardDescription>Today's meal logging and reminder activity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Overview */}
          <div className="grid grid-cols-3 gap-3 text-center p-3 bg-slate-50 rounded-lg">
            <div>
              <p className="text-xs text-slate-500 mb-1">Meals Logged</p>
              <p className="text-2xl font-bold text-slate-800">{userState.meals_logged_today}/3</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Meal Reminders Today</p>
              <p className="text-2xl font-bold text-slate-800">
                {eventLogs?.filter(e => ['breakfast_check', 'lunch_check', 'dinner_check'].includes(e.trigger_type) && e.event_type === 'message_sent').length || 0}/1
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Status</p>
              <p className={`text-sm font-semibold ${userState.is_in_recovery ? 'text-red-600' : 'text-green-600'}`}>
                {userState.is_in_recovery ? 'Recovery' : 'Active'}
              </p>
            </div>
          </div>

          {/* Meal windows */}
          <div className="space-y-2">
            {['breakfast', 'lunch', 'dinner'].map(meal => (
              <div key={meal} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`flex items-center gap-2 ${getMealStatusColor(meal)}`}>
                    {getMealStatusIcon(meal)}
                    <span className="font-semibold capitalize text-sm">{meal}</span>
                    <span className="text-xs text-slate-500">@ {mealStatus[meal]?.time}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {mealStatus[meal]?.logged && (
                    <Badge className="bg-green-100 text-green-700">✓ Logged</Badge>
                  )}
                  {mealStatus[meal]?.reminderSent && !mealStatus[meal]?.logged && (
                    <Badge className="bg-orange-100 text-orange-700">📱 Reminder Sent</Badge>
                  )}
                  {mealStatus[meal]?.blocked && (
                    <Badge className="bg-red-100 text-red-700">❌ Blocked</Badge>
                  )}
                  {!mealStatus[meal]?.logged && !mealStatus[meal]?.reminderSent && !mealStatus[meal]?.blocked && (
                    <Badge className="bg-slate-100 text-slate-700">⏳ Pending</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Issues */}
          {(userState.is_in_recovery || userState.last_login_hours >= 72 || userState.silent_count >= 3) && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <p className="font-semibold mb-1">⚠️ Meal reminders blocked:</p>
              <ul className="space-y-1 text-xs">
                {userState.is_in_recovery && <li>• Recovery mode active</li>}
                {userState.last_login_hours >= 72 && <li>• User inactive 72h+</li>}
                {userState.silent_count >= 3 && <li>• Silent mode (3 ignored messages)</li>}
              </ul>
            </div>
          )}

          {/* Last reminder info */}
          {eventLogs && eventLogs.length > 0 && (
            <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
              <p className="font-semibold mb-1">Recent activity:</p>
              {eventLogs.slice(0, 2).map((log, idx) => (
                <p key={idx}>
                  {log.trigger_type.replace('_check', '').toUpperCase()}: {log.event_type === 'message_sent' ? '✓ sent' : '❌ blocked'} at{' '}
                  {format(new Date(log.timestamp), 'HH:mm', { locale: he })}
                </p>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}