import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronUp, Activity, Utensils, Droplets, Dumbbell } from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function prevDay(d) {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setDate(dt.getDate() - 1);
  return dt.toISOString().slice(0, 10);
}

function nextDay(d) {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function scoreColor(score) {
  if (score >= 90) return 'text-emerald-600';
  if (score >= 70) return 'text-amber-600';
  return 'text-red-600';
}

function scoreBg(score) {
  if (score >= 90) return 'bg-emerald-50 border-emerald-200';
  if (score >= 70) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

function trafficLight(count) {
  if (count === 0) return <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
  if (count <= 2)  return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
  return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
}

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const EVENT_LABELS = {
  js_error:            { label: 'שגיאות JavaScript',   emoji: '⚡' },
  api_5xx:             { label: 'שגיאות שרת (5xx)',    emoji: '🔥' },
  prisma_error:        { label: 'שגיאות DB (Prisma)',  emoji: '🗄️' },
  login_failed:        { label: 'כניסות שנכשלו',        emoji: '🔑' },
  meal_save_failed:    { label: 'שמירות ארוחה שנכשלו', emoji: '🍽️' },
  water_save_failed:   { label: 'שמירות מים שנכשלו',   emoji: '💧' },
  workout_save_failed: { label: 'שמירות אימון שנכשלו', emoji: '💪' },
};

// ─── sub-components ───────────────────────────────────────────────────────────

function EventRow({ type, data }) {
  const [open, setOpen] = useState(false);
  const { label, emoji } = EVENT_LABELS[type] || { label: type, emoji: '📌' };
  const count = data?.count ?? 0;
  const samples = data?.samples ?? [];

  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        type="button"
        onClick={() => samples.length > 0 && setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-right"
      >
        {trafficLight(count)}
        <span className="text-sm">{emoji}</span>
        <span className="flex-1 text-sm font-medium text-slate-700 text-right">{label}</span>
        <Badge
          variant="outline"
          className={`text-xs font-mono ml-2 ${
            count === 0 ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
            : count <= 2 ? 'border-amber-200 text-amber-700 bg-amber-50'
            : 'border-red-200 text-red-700 bg-red-50'
          }`}
        >
          {count}
        </Badge>
        {samples.length > 0 && (
          open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
               : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        )}
      </button>

      {open && samples.length > 0 && (
        <div className="bg-slate-50 border-t border-slate-100 divide-y divide-slate-100">
          {samples.map((s, i) => (
            <div key={i} className="px-4 py-2.5 text-xs font-mono" dir="ltr">
              <div className="flex gap-3 items-start">
                <span className="text-slate-400 flex-shrink-0">{fmtTime(s.time)}</span>
                <span className="text-slate-500 flex-shrink-0 truncate max-w-[120px]">{s.user}</span>
                <span className="text-slate-700 flex-1 min-w-0 truncate">{s.message}</span>
              </div>
              {s.path && s.path !== '—' && (
                <div className="mt-0.5 text-slate-400 pl-[84px] truncate">{s.path}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ icon: Icon, label, value, color = 'text-slate-700' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-800">{value ?? '—'}</p>
        <p className="text-xs text-slate-500 truncate">{label}</p>
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function BetaMonitoring() {
  const [date, setDate] = useState(todayUTC());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const {
    data: raw,
    isLoading,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['betaMonitoringSummary', date],
    queryFn:  () => base44.functions.invoke('getBetaDailySummary', { date }),
    refetchInterval: autoRefresh ? 30_000 : false,
    staleTime: 20_000,
  });

  const summary = raw?.data;
  const events  = summary?.summary     ?? {};
  const activity = summary?.activity   ?? {};
  const score    = summary?.health_score ?? 100;
  const totalErrors = summary?.total_errors ?? 0;
  const errorUsers  = summary?.unique_users_with_errors ?? [];

  const isToday = date === todayUTC();

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Activity className="w-5 h-5 text-teal-500 flex-shrink-0" />
          <h1 className="font-bold text-slate-800 flex-1">Beta Monitoring</h1>
          <button
            onClick={() => setAutoRefresh(a => !a)}
            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
              autoRefresh
                ? 'bg-teal-50 border-teal-300 text-teal-700'
                : 'bg-slate-100 border-slate-200 text-slate-500'
            }`}
          >
            {autoRefresh ? '🔄 Auto-refresh' : '⏸ ידני'}
          </button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 px-3"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        {/* Date navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate(prevDay(date))}
            className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 flex items-center justify-center text-sm"
          >
            →
          </button>
          <input
            type="date"
            value={date}
            max={todayUTC()}
            onChange={e => setDate(e.target.value)}
            className="flex-1 text-center h-8 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 px-2"
          />
          <button
            onClick={() => setDate(nextDay(date))}
            disabled={isToday}
            className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 flex items-center justify-center text-sm disabled:opacity-40"
          >
            ←
          </button>
          {isToday && (
            <Badge variant="outline" className="border-teal-300 text-teal-700 bg-teal-50 text-xs flex-shrink-0">
              היום
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-slate-400 text-sm">טוען...</div>
        ) : !summary ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            לא ניתן לטעון נתוני ניטור. ייתכן שהטבלה עדיין לא נוצרה.
          </div>
        ) : (
          <>
            {/* Health score */}
            <Card className={`p-5 border ${scoreBg(score)}`}>
              <div className="flex items-center gap-4">
                <div className="text-center flex-shrink-0">
                  <p className={`text-5xl font-black tabular-nums ${scoreColor(score)}`}>{score}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Health Score</p>
                </div>
                <div className="flex-1 space-y-1 text-sm">
                  <p className="font-semibold text-slate-800">
                    {score >= 90 ? '✅ מצב תקין' : score >= 70 ? '⚠️ שים לב' : '🔴 נדרש טיפול'}
                  </p>
                  <p className="text-slate-600 text-xs">
                    {totalErrors} שגיאות סה״כ
                    {errorUsers.length > 0 && ` · ${errorUsers.length} משתמשים מושפעים`}
                  </p>
                  {dataUpdatedAt > 0 && (
                    <p className="text-slate-400 text-xs">
                      עודכן: {new Date(dataUpdatedAt).toLocaleTimeString('he-IL')}
                    </p>
                  )}
                </div>
              </div>
            </Card>

            {/* Activity */}
            <div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">
                פעילות — {date}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <StatTile icon={Utensils} label="שמירות ארוחה"  value={activity.meal_saves}        color="text-orange-500" />
                <StatTile icon={Droplets} label="שמירות מים"    value={activity.water_saves}       color="text-blue-500"   />
                <StatTile icon={Dumbbell} label="אימונים שפורסמו" value={activity.workout_publishes} color="text-violet-500" />
                <StatTile icon={Activity} label="מדידות גוף"    value={activity.measurements}      color="text-teal-500"   />
              </div>
            </div>

            {/* Error breakdown */}
            <div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">
                שגיאות — לחץ להרחבה
              </h2>
              <Card className="overflow-hidden divide-y divide-slate-100 border border-slate-200">
                {Object.entries(EVENT_LABELS).map(([type]) => (
                  <EventRow key={type} type={type} data={events[type]} />
                ))}
              </Card>
            </div>

            {/* Affected users */}
            {errorUsers.length > 0 && (
              <Card className="p-4 border border-amber-200 bg-amber-50">
                <p className="text-xs font-bold text-amber-800 mb-2">
                  👥 משתמשים שנפגעו ({errorUsers.length})
                </p>
                <div className="space-y-1">
                  {errorUsers.map(u => (
                    <p key={u} className="text-xs font-mono text-amber-900 truncate">{u}</p>
                  ))}
                </div>
              </Card>
            )}

            {totalErrors === 0 && (
              <div className="text-center py-6 text-emerald-600 text-sm font-medium">
                ✅ אין שגיאות לתאריך זה
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
