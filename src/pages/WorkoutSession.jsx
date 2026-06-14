import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Plus, Minus, CheckCircle2, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function WorkoutSession() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('id');

  const [sets, setSets] = useState({});

  const { data: session } = useQuery({
    queryKey: ['workoutSession', sessionId],
    queryFn: async () => {
      const sessions = await base44.entities.WorkoutSession.filter({ id: sessionId });
      return sessions[0];
    },
    enabled: !!sessionId,
  });

  const { data: lines = [] } = useQuery({
    queryKey: ['sessionLines', sessionId],
    queryFn: () => base44.entities.WorkoutExerciseLine.filter({ workout_session_id: sessionId }),
    enabled: !!sessionId,
  });

  const { data: allSets = [] } = useQuery({
    queryKey: ['sessionSets', lines.map(l => l.id)],
    queryFn: async () => {
      const setsPromises = lines.map(line =>
        base44.entities.WorkoutSet.filter({ exercise_line_id: line.id })
      );
      const results = await Promise.all(setsPromises);
      const flatSets = results.flat();
      
      // Initialize local state
      const setsObj = {};
      flatSets.forEach(set => {
        if (!setsObj[set.exercise_line_id]) setsObj[set.exercise_line_id] = [];
        setsObj[set.exercise_line_id].push(set);
      });
      setSets(setsObj);
      
      return flatSets;
    },
    enabled: lines.length > 0,
  });

  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => base44.entities.Exercise.list(),
  });

  const updateSet = (lineId, setIndex, field, value) => {
    setSets(prev => {
      const lineSets = [...(prev[lineId] || [])];
      const setIdx = lineSets.findIndex(s => s.set_index === setIndex);
      if (setIdx !== -1) {
        lineSets[setIdx] = { ...lineSets[setIdx], [field]: value };
      }
      return { ...prev, [lineId]: lineSets };
    });
  };

  const addSet = async (lineId) => {
    const lineSets = sets[lineId] || [];
    const newSetIndex = lineSets.length + 1;
    
    const newSet = await base44.entities.WorkoutSet.create({
      exercise_line_id: lineId,
      set_index: newSetIndex,
      weight: 0,
      reps: 0
    });

    setSets(prev => ({
      ...prev,
      [lineId]: [...(prev[lineId] || []), newSet]
    }));
  };

  const removeSet = async (lineId) => {
    const lineSets = sets[lineId] || [];
    if (lineSets.length <= 1) return;
    
    const lastSet = lineSets[lineSets.length - 1];
    await base44.entities.WorkoutSet.delete(lastSet.id);
    
    setSets(prev => ({
      ...prev,
      [lineId]: prev[lineId].slice(0, -1)
    }));
  };

  const saveWorkout = useMutation({
    mutationFn: async () => {
      for (const lineId in sets) {
        for (const set of sets[lineId]) {
          await base44.entities.WorkoutSet.update(set.id, {
            weight: parseFloat(set.weight) || 0,
            reps: parseInt(set.reps) || 0
          });
        }
      }

      // ── PHASE 3: mirror to ExerciseHistory after set saves ───────────
      if (session) {
        for (const line of lines) {
          const lineSets = sets[line.id] || [];
          const validSets = lineSets.filter(s => (parseFloat(s.weight) > 0) || (parseInt(s.reps) > 0));
          if (validSets.length === 0) continue;

          const exerciseName = getExerciseName(line).trim().toLowerCase();
          const maxWeight = Math.max(...validSets.map(s => parseFloat(s.weight) || 0));
          const avgReps = Math.round(validSets.reduce((sum, s) => sum + (parseInt(s.reps) || 0), 0) / validSets.length);
          const setsJson = JSON.stringify(validSets.map(s => ({ weight: parseFloat(s.weight) || 0, reps: parseInt(s.reps) || 0 })));
          const workoutDate = session.date;

          try {
            const existing = await base44.entities.ExerciseHistory.filter({
              trainee_email: session.trainee_email,
              exercise_name: exerciseName,
              date: workoutDate
            });
            if (existing.length > 0) {
              await base44.entities.ExerciseHistory.update(existing[0].id, {
                sets: validSets.length, reps: avgReps, weight: maxWeight, notes: setsJson
              });
            } else {
              await base44.entities.ExerciseHistory.create({
                trainee_email: session.trainee_email,
                exercise_name: exerciseName,
                date: workoutDate,
                sets: validSets.length, reps: avgReps, weight: maxWeight, notes: setsJson
              });
            }
          } catch (histErr) {
            console.error(`⚠️ ExerciseHistory upsert failed for "${exerciseName}":`, histErr.message);
          }
        }
      }
      // ── END PHASE 3 ──────────────────────────────────────────────────
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessionSets'] });
      alert('✅ האימון נשמר בהצלחה');
    }
  });

  const completeWorkout = useMutation({
    mutationFn: async () => {
      await saveWorkout.mutateAsync();
      await base44.entities.WorkoutSession.update(sessionId, {
        status: 'completed'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutSession'] });
      alert('🎉 אימון הושלם!');
      navigate(createPageUrl('WorkoutLog'));
    }
  });

  const getExerciseName = (line) => {
    if (line.custom_name) return line.custom_name;
    const exercise = exercises.find(e => e.id === line.exercise_id);
    return exercise?.name_he || 'תרגיל';
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">טוען...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto p-4">
        <Button
          variant="ghost"
          onClick={() => navigate(createPageUrl('WorkoutLog'))}
          className="mb-4"
        >
          <ChevronLeft className="w-4 h-4 ml-2" />
          חזור
        </Button>

        <div className="bg-white rounded-lg p-4 mb-4 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-800">{session.title}</h1>
          <p className="text-sm text-slate-500">
            {session.status === 'completed' ? '✅ הושלם' : '⏳ בתהליך'}
          </p>
        </div>

        <div className="space-y-4 mb-20">
          {lines
            .sort((a, b) => a.order_index - b.order_index)
            .map((line, idx) => {
              const lineSets = (sets[line.id] || []).sort((a, b) => a.set_index - b.set_index);
              return (
                <Card key={line.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-bold text-slate-800">
                          {idx + 1}. {getExerciseName(line)}
                        </h3>
                        {(line.target_reps_min || line.target_reps_max) && (
                          <p className="text-sm text-blue-600">
                            🎯 יעד: {line.target_reps_min}-{line.target_reps_max} חזרות
                          </p>
                        )}
                        {line.notes && (
                          <p className="text-xs text-slate-600 bg-blue-50 p-2 rounded mt-1">
                            💡 {line.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => addSet(line.id)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => removeSet(line.id)}
                          disabled={lineSets.length <= 1}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {lineSets.map((set, setIdx) => (
                        <div key={set.id} className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-600 w-12">
                            סט {set.set_index}
                          </span>
                          <Input
                            type="number"
                            value={set.weight}
                            onChange={(e) => updateSet(line.id, set.set_index, 'weight', e.target.value)}
                            placeholder="משקל"
                            className="flex-1"
                          />
                          <span className="text-xs text-slate-500">ק"ג</span>
                          <Select
                            value={String(set.reps)}
                            onValueChange={(val) => updateSet(line.id, set.set_index, 'reps', val)}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="חזרות" />
                            </SelectTrigger>
                            <SelectContent>
                              {[...Array(20)].map((_, i) => (
                                <SelectItem key={i + 1} value={String(i + 1)}>
                                  {i + 1}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>

        {/* Fixed Bottom Actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 space-y-2">
          <Button
            onClick={() => saveWorkout.mutate()}
            disabled={saveWorkout.isPending}
            className="w-full"
            variant="outline"
          >
            <Save className="w-4 h-4 ml-2" />
            {saveWorkout.isPending ? 'שומר...' : 'שמור אימון'}
          </Button>
          
          {session.status !== 'completed' && (
            <Button
              onClick={() => completeWorkout.mutate()}
              disabled={completeWorkout.isPending}
              className="w-full"
              style={{ backgroundColor: '#79DBD6' }}
            >
              <CheckCircle2 className="w-4 h-4 ml-2" />
              {completeWorkout.isPending ? 'משלים...' : 'סמן אימון הושלם'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}