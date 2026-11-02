/**
 * WorkoutSession — view and edit a completed or in-progress workout session.
 * Uses WorkoutSession + embedded WorkoutSet records (no WorkoutExerciseLine dependency).
 * Access: /WorkoutSession?id=<session_id>
 */
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, Save, Dumbbell, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function WorkoutSession() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('id');

  // Local editable state: exerciseName → array of {weight, reps, set_number}
  const [editableSets, setEditableSets] = useState({});
  const [isDirty, setIsDirty] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  // WorkoutSession with embedded sets (buildInclude returns sets: true)
  const { data: session, isLoading } = useQuery({
    queryKey: ['workoutSession', sessionId],
    queryFn: () => base44.entities.WorkoutSession.get(sessionId),
    enabled: !!sessionId,
  });

  // Group sets by exercise_name for display
  useEffect(() => {
    if (!session?.sets) return;
    const grouped = {};
    for (const s of session.sets) {
      const key = s.exercise_name || 'Unknown';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({ ...s });
    }
    // Sort each exercise's sets by set_number
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => (a.set_number || 0) - (b.set_number || 0));
    }
    setEditableSets(grouped);
    setIsDirty(false);
  }, [session?.id]);

  const updateSet = (exerciseName, idx, field, value) => {
    setEditableSets(prev => {
      const updated = { ...prev };
      updated[exerciseName] = [...(updated[exerciseName] || [])];
      updated[exerciseName][idx] = { ...updated[exerciseName][idx], [field]: value };
      return updated;
    });
    setIsDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const traineeEmail = session?.trainee_email || user?.email;
      const date = session?.date || new Date().toISOString().slice(0, 10);

      // Pass the session's own template_id so saveExerciseProgress finds THIS session,
      // not a different session created for a different workout execution on the same day.
      const templateId = session?.template_id || null;
      const source     = session?.source      || 'manual';

      for (const [exerciseName, sets] of Object.entries(editableSets)) {
        const validSets = sets.filter(s => (parseFloat(s.weight) > 0) || (parseInt(s.reps) > 0));
        if (validSets.length === 0) continue;
        await base44.functions.invoke('saveExerciseProgress', {
          trainee_email: traineeEmail,
          date,
          source,
          template_id: templateId,
          exercise_name: exerciseName,
          exercise_id: sets[0]?.exercise_id || null,
          sets: validSets.map(s => ({
            weight: parseFloat(s.weight) || 0,
            reps: parseInt(s.reps) || 0,
          })),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutSession', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['workoutSessions'] });
      setIsDirty(false);
      toast.success('האימון נשמר');
    },
    onError: (err) => toast.error(`שגיאה בשמירה: ${err.message}`),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 p-6 text-center" dir="rtl">
        <Dumbbell className="w-12 h-12 text-slate-300" />
        <p className="text-slate-500 font-medium">אימון לא נמצא</p>
        <Button variant="outline" onClick={() => navigate(createPageUrl('WorkoutLog'))}>
          <ChevronLeft className="w-4 h-4 ml-2" />
          חזור ליומן
        </Button>
      </div>
    );
  }

  const exerciseNames = Object.keys(editableSets);

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      <div className="max-w-2xl mx-auto p-4">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('WorkoutLog'))}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{session.title || 'אימון'}</h1>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
              <Calendar className="w-3 h-3" />
              {session.date ? format(new Date(session.date), 'dd/MM/yyyy') : ''}
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                session.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {session.status === 'completed' ? '✅ הושלם' : '⏳ בתהליך'}
              </span>
            </div>
          </div>
        </div>

        {/* Exercises */}
        {exerciseNames.length === 0 ? (
          <Card className="p-8 text-center">
            <Dumbbell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">לא נרשמו תרגילים באימון זה</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {exerciseNames.map((exName) => {
              const sets = editableSets[exName];
              return (
                <Card key={exName} className="overflow-hidden">
                  <div className="bg-slate-50 border-b px-4 py-3">
                    <h3 className="font-bold text-slate-800">{exName}</h3>
                    <p className="text-xs text-slate-500">{sets.length} סטים</p>
                  </div>
                  <CardContent className="p-4 space-y-2">
                    {/* Column headers */}
                    <div className="grid grid-cols-3 gap-2 text-xs text-slate-400 font-medium mb-1">
                      <span className="text-center">סט</span>
                      <span className="text-center">משקל (ק״ג)</span>
                      <span className="text-center">חזרות</span>
                    </div>
                    {sets.map((s, idx) => (
                      <div key={idx} className="grid grid-cols-3 gap-2 items-center">
                        <div className="flex items-center justify-center">
                          <span className="w-7 h-7 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center">
                            {s.set_number || idx + 1}
                          </span>
                        </div>
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          value={s.weight ?? ''}
                          onChange={(e) => updateSet(exName, idx, 'weight', e.target.value)}
                          className="text-center h-9"
                          placeholder="0"
                        />
                        <Input
                          type="number"
                          min="0"
                          value={s.reps ?? ''}
                          onChange={(e) => updateSet(exName, idx, 'reps', e.target.value)}
                          className="text-center h-9"
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Save button */}
        {isDirty && (
          <div className="fixed bottom-4 right-4 left-4 max-w-2xl mx-auto">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white h-14 text-base shadow-lg"
            >
              {saveMutation.isPending ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin ml-2" />
              ) : (
                <Save className="w-5 h-5 ml-2" />
              )}
              שמור שינויים
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
