/**
 * TraineeAnalytics — coach-facing exercise performance monitoring.
 * Shows workout history, top exercises, PRs, and progression charts per trainee.
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search, Users, Dumbbell, Trophy, TrendingUp, ChevronLeft, BarChart2,
} from 'lucide-react';
import { format } from 'date-fns';

// ── Inline progress bar (no chart library dependency) ─────────────────────────

function ProgressBar({ value, max, label }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-12 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-2">
        <div className="bg-teal-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-700 w-10 text-left">{value}kg</span>
    </div>
  );
}

function ExerciseHistoryChart({ traineeEmail, exerciseName }) {
  const { data, isLoading } = useQuery({
    queryKey: ['exerciseHistory', traineeEmail, exerciseName],
    queryFn: () => base44.functions.invoke('getExerciseHistoryByEmail', {
      trainee_email: traineeEmail,
      exercise_name: exerciseName,
      limit: 10,
    }),
    enabled: !!traineeEmail && !!exerciseName,
  });

  const history = data?.data?.history || [];
  if (isLoading) return <div className="h-20 animate-pulse bg-slate-100 rounded-lg mt-2" />;
  if (!history.length) return <p className="text-xs text-slate-400 text-center py-3">אין היסטוריה</p>;

  const maxWeight = Math.max(...history.map(h => h.max_weight || 0), 1);
  return (
    <div className="space-y-1.5 mt-2 p-3 bg-white rounded-xl border border-slate-100">
      <p className="text-xs font-semibold text-slate-600 mb-2">התקדמות משקל (kg)</p>
      {[...history].reverse().map((h, i) => (
        <ProgressBar
          key={i}
          value={h.max_weight || 0}
          max={maxWeight}
          label={h.date ? format(new Date(h.date), 'd/M') : '?'}
        />
      ))}
    </div>
  );
}

export default function TraineeAnalytics() {
  const [searchTerm, setSearchTerm]           = useState('');
  const [selectedTrainee, setSelectedTrainee] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [period, setPeriod]                   = useState('90');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['coachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const filtered = trainees.filter(t =>
    !searchTerm.trim() ||
    (t.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.user_email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sinceDate = new Date(Date.now() - parseInt(period) * 86400000).toISOString().slice(0, 10);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['traineeProgress', selectedTrainee?.user_email, period],
    queryFn: () => base44.functions.invoke('getTraineeProgressSummary', {
      trainee_email: selectedTrainee.user_email,
      since_date: sinceDate,
    }),
    enabled: !!selectedTrainee?.user_email,
  });

  const progressData = summary?.data?.summary;

  // ── Trainee detail view ─────────────────────────────────────────────────────
  if (selectedTrainee) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
        <div className="max-w-2xl mx-auto p-4">

          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <Button variant="ghost" size="icon" onClick={() => { setSelectedTrainee(null); setSelectedExercise(null); }}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">{selectedTrainee.full_name || selectedTrainee.user_email}</h1>
              <p className="text-xs text-slate-500">ניתוח ביצועים</p>
            </div>
          </div>

          {/* Period selector */}
          <div className="flex gap-2 mb-4">
            {[{ k: '30', l: '30 יום' }, { k: '90', l: '90 יום' }, { k: '180', l: '6 חודשים' }].map(p => (
              <button
                key={p.k}
                onClick={() => { setPeriod(p.k); setSelectedExercise(null); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === p.k ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
              >
                {p.l}
              </button>
            ))}
          </div>

          {summaryLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-16 animate-pulse bg-slate-100 rounded-xl" />)}
            </div>
          ) : !progressData || progressData.total_sessions === 0 ? (
            <Card className="p-8 text-center">
              <Dumbbell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">אין אימונים בתקופה הנבחרת</p>
            </Card>
          ) : (
            <div className="space-y-4">

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-4 text-center">
                  <p className="text-3xl font-bold text-teal-700">{progressData.total_sessions}</p>
                  <p className="text-xs text-slate-500 mt-0.5">אימונים</p>
                </Card>
                <Card className="p-4 text-center">
                  <p className="text-base font-bold text-slate-700">
                    {progressData.last_workout_date
                      ? format(new Date(progressData.last_workout_date), 'dd/MM/yyyy')
                      : '—'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">אימון אחרון</p>
                </Card>
              </div>

              {/* Top exercises with expandable charts */}
              {progressData.top_exercises?.length > 0 && (
                <Card className="p-4">
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-teal-600" />
                    תרגילים מובילים
                  </h3>
                  <div className="space-y-2">
                    {progressData.top_exercises.map((ex, i) => (
                      <div key={i}>
                        <button
                          onClick={() => setSelectedExercise(selectedExercise === ex.name ? null : ex.name)}
                          className={`w-full text-right flex items-center justify-between p-3 rounded-xl border-2 transition-colors ${
                            selectedExercise === ex.name
                              ? 'border-teal-400 bg-teal-50'
                              : 'border-slate-100 bg-slate-50 hover:border-teal-200'
                          }`}
                        >
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{ex.name}</p>
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                              <span>{ex.count} סטים</span>
                              {ex.pr && (
                                <span className="flex items-center gap-1 text-amber-700">
                                  <Trophy className="w-3 h-3" />
                                  PR: {ex.pr.weight}kg × {ex.pr.reps}
                                </span>
                              )}
                            </div>
                          </div>
                          <TrendingUp className={`w-4 h-4 ${selectedExercise === ex.name ? 'text-teal-600' : 'text-slate-300'}`} />
                        </button>
                        {selectedExercise === ex.name && (
                          <ExerciseHistoryChart
                            traineeEmail={selectedTrainee.user_email}
                            exerciseName={ex.name}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Trainee list view ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto p-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">ניתוח ביצועים</h1>
          <p className="text-sm text-slate-500 mt-0.5">בחר מתאמן לצפייה בנתוני אימון</p>
        </div>

        <div className="relative mb-4">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="חפש מתאמן..." className="pr-10" />
        </div>

        {filtered.length === 0 ? (
          <Card className="p-10 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">אין מתאמנים</p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map(t => (
              <Card key={t.id} className="p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedTrainee(t)}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                    <Dumbbell className="w-5 h-5 text-teal-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-800">{t.full_name || t.user_email}</p>
                    <p className="text-xs text-slate-500">{t.user_email}</p>
                  </div>
                  <TrendingUp className="w-5 h-5 text-slate-300" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
