import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, Clock, Flag, MousePointerClick, SkipForward } from 'lucide-react';

function StatCard({ icon: Icon, label, value, tone = 'text-slate-800' }) {
  return (
    <Card className="p-4 bg-white border-0 shadow-sm">
      <Icon className={`h-5 w-5 mb-2 ${tone}`} />
      <p className="text-2xl font-black text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </Card>
  );
}

export default function OnboardingAnalytics() {
  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['onboardingAnalytics'],
    queryFn: () => base44.entities.OnboardingAnalytics.list('-created_date', 500),
    enabled: !!user?.email,
  });

  const completed = events.filter(e => e.event_type === 'completed');
  const startedSessions = new Set(events.filter(e => e.event_type === 'started').map(e => e.session_id));
  const skipped = events.filter(e => e.event_type === 'skipped');
  const actionEvents = events.filter(e => e.event_type === 'action_completed');
  const avgTime = completed.length
    ? Math.round(completed.reduce((sum, e) => sum + (e.duration_seconds || 0), 0) / completed.length)
    : 0;
  const completionRate = startedSessions.size ? Math.round((completed.length / startedSessions.size) * 100) : 0;

  const quitByStep = events
    .filter(e => e.event_type === 'quit' || e.confusion_signal)
    .reduce((acc, e) => ({ ...acc, [e.quit_step || e.step_id || 'unknown']: (acc[e.quit_step || e.step_id || 'unknown'] || 0) + 1 }), {});

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24" dir="rtl">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Onboarding Analytics</h1>
            <p className="text-sm text-slate-500">זיהוי נקודות בלבול ונטישה</p>
          </div>
          <Button onClick={() => window.location.reload()} variant="outline">רענן</Button>
        </div>

        {isLoading ? (
          <Card className="p-8 text-center">טוען נתונים...</Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <StatCard icon={Flag} label="השלמה" value={`${completionRate}%`} tone="text-emerald-600" />
              <StatCard icon={Clock} label="זמן ממוצע" value={`${avgTime}s`} tone="text-blue-600" />
              <StatCard icon={MousePointerClick} label="פעולות מוצלחות" value={actionEvents.length} tone="text-purple-600" />
              <StatCard icon={SkipForward} label="דילוגים" value={skipped.length} tone="text-orange-600" />
              <StatCard icon={BarChart3} label="סשנים" value={startedSessions.size} tone="text-slate-700" />
            </div>

            <Card className="p-4 bg-white border-0 shadow-sm">
              <h2 className="font-bold text-slate-900 mb-3">איפה משתמשים נתקעים?</h2>
              {Object.keys(quitByStep).length === 0 ? (
                <p className="text-sm text-slate-500">אין סימני בלבול כרגע.</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(quitByStep).map(([step, count]) => (
                    <div key={step} className="flex items-center justify-between rounded-xl bg-red-50 px-3 py-2">
                      <span className="text-sm font-semibold text-red-800">{step}</span>
                      <span className="text-sm font-bold text-red-600">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4 bg-white border-0 shadow-sm overflow-x-auto">
              <h2 className="font-bold text-slate-900 mb-3">אירועים אחרונים</h2>
              <div className="min-w-[720px] space-y-2">
                {events.slice(0, 80).map(event => (
                  <div key={event.id} className="grid grid-cols-6 gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                    <span className="font-semibold text-slate-700">{event.event_type}</span>
                    <span>{event.role_type}</span>
                    <span>{event.step_id || '-'}</span>
                    <span>{event.completion_percent || 0}%</span>
                    <span>{event.duration_seconds || 0}s</span>
                    <span className="truncate">{event.user_email}</span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}