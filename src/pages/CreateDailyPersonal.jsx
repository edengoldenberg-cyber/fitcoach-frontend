import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, Plus, Trash2, Video, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import ExerciseAutocomplete from '../components/coach/ExerciseAutocomplete';

export default function CreateDailyPersonal() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTrainee, setSelectedTrainee] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState([]);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['coachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ 
      coach_email: user?.email,
      status: 'active'
    }),
    enabled: !!user?.email,
  });

  const { data: exerciseBank = [] } = useQuery({
    queryKey: ['exerciseBank'],
    queryFn: () => base44.entities.Exercise.filter({ status: 'active' }),
  });

  const { data: lastPerformance } = useQuery({
    queryKey: ['lastPerformance', selectedTrainee],
    queryFn: async () => {
      if (!selectedTrainee) return {};
      const logs = await base44.entities.OnlineWorkoutLog.filter({ 
        trainee_email: selectedTrainee 
      });
      const performance = {};
      logs.forEach(log => {
        if (!performance[log.exercise_name] || 
            new Date(log.workout_date) > new Date(performance[log.exercise_name].date)) {
          const sets = log.sets || [];
          performance[log.exercise_name] = {
            weight: sets[0]?.weight || 0,
            reps: sets[0]?.reps || 0,
            sets: sets.length,
            date: log.workout_date
          };
        }
      });
      return performance;
    },
    enabled: !!selectedTrainee,
  });

  const addExercise = (exercise) => {
    const lastData = lastPerformance?.[exercise.name_he] || {};
    setExercises([...exercises, {
      exercise_id: exercise.id,
      exercise_name: exercise.name_he,
      target_sets: lastData.sets || 3,
      target_reps_min: lastData.reps ? lastData.reps - 2 : 8,
      target_reps_max: lastData.reps ? lastData.reps + 2 : 12,
      target_weight: lastData.weight || 0,
      rest_seconds: 90,
      video_url: '',
      instructions: '',
      notes: ''
    }]);
  };

  const updateExercise = (index, field, value) => {
    const updated = [...exercises];
    updated[index][field] = value;
    setExercises(updated);
  };

  const removeExercise = (index) => {
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const template = await base44.entities.OnlineWorkoutTemplate.create({
        coach_email: user.email,
        trainee_email: selectedTrainee,
        title: title || 'אימון יומי אישי',
        type: 'daily_personal',
        start_date: new Date().toISOString().split('T')[0],
        status: 'active',
        notes
      });

      for (let i = 0; i < exercises.length; i++) {
        await base44.entities.OnlineWorkoutItem.create({
          template_id: template.id,
          day_index: 1,
          day_name: 'יום 1',
          order_index: i + 1,
          ...exercises[i]
        });
      }

      await base44.entities.OnlineWorkoutAssignment.create({
        trainee_email: selectedTrainee,
        template_id: template.id,
        status: 'active',
        assigned_at: new Date().toISOString(),
        current_day: 1,
        completed_days: []
      });

      return template;
    },
    onSuccess: () => {
      toast.success('האימון נשלח למתאמן בהצלחה!');
      queryClient.invalidateQueries({ queryKey: ['onlineTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['onlineAssignments'] });
      navigate(createPageUrl('OnlineTraining'));
    },
    onError: (error) => {
      toast.error('שגיאה בשליחת האימון: ' + error.message);
    }
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 pb-20" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowRight className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold text-indigo-900">אימון יומי אישי</h1>
        </div>

        <Card className="p-6 bg-white mb-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">בחר מתאמן</label>
              <Select value={selectedTrainee} onValueChange={setSelectedTrainee}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר מתאמן..." />
                </SelectTrigger>
                <SelectContent>
                  {trainees.map(t => (
                    <SelectItem key={t.id} value={t.user_email}>
                      {t.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">כותרת האימון</label>
              <Input 
                placeholder="למשל: אימון חזה וידיים"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">הערות כלליות</label>
              <Textarea 
                placeholder="הערות למתאמן..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </Card>

        {selectedTrainee && (
          <>
            <Card className="p-4 bg-white mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">תרגילים</h3>
                <ExerciseAutocomplete
                  exercises={exerciseBank}
                  onSelect={addExercise}
                  buttonText="הוסף תרגיל"
                  icon={Plus}
                />
              </div>

              {exercises.length === 0 ? (
                <p className="text-center py-6 text-slate-400">הוסף תרגילים לאימון</p>
              ) : (
                <div className="space-y-4">
                  {exercises.map((ex, idx) => {
                    const last = lastPerformance?.[ex.exercise_name];
                    return (
                      <Card key={idx} className="p-4 bg-slate-50">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <p className="font-bold text-slate-800">{ex.exercise_name}</p>
                            {last && (
                              <p className="text-xs text-blue-600">
                                ביצוע אחרון: {last.weight}kg × {last.reps} × {last.sets} ({new Date(last.date).toLocaleDateString('he-IL')})
                              </p>
                            )}
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => removeExercise(idx)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="text-xs text-slate-600">סטים</label>
                            <Input 
                              type="number"
                              value={ex.target_sets}
                              onChange={(e) => updateExercise(idx, 'target_sets', Number(e.target.value))}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-600">חזרות (min-max)</label>
                            <div className="flex gap-1">
                              <Input 
                                type="number"
                                value={ex.target_reps_min}
                                onChange={(e) => updateExercise(idx, 'target_reps_min', Number(e.target.value))}
                                placeholder="8"
                              />
                              <Input 
                                type="number"
                                value={ex.target_reps_max}
                                onChange={(e) => updateExercise(idx, 'target_reps_max', Number(e.target.value))}
                                placeholder="12"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-slate-600">משקל (kg)</label>
                            <Input 
                              type="number"
                              value={ex.target_weight}
                              onChange={(e) => updateExercise(idx, 'target_weight', Number(e.target.value))}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-600">מנוחה (שניות)</label>
                            <Input 
                              type="number"
                              value={ex.rest_seconds}
                              onChange={(e) => updateExercise(idx, 'rest_seconds', Number(e.target.value))}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Video className="w-4 h-4 text-slate-500" />
                            <Input 
                              placeholder="קישור לסרטון הדרכה (YouTube / Drive)"
                              value={ex.video_url}
                              onChange={(e) => updateExercise(idx, 'video_url', e.target.value)}
                            />
                          </div>
                          <Textarea 
                            placeholder="הוראות ביצוע..."
                            value={ex.instructions}
                            onChange={(e) => updateExercise(idx, 'instructions', e.target.value)}
                            rows={2}
                          />
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </Card>

            <Button 
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              onClick={() => createMutation.mutate()}
              disabled={!selectedTrainee || !title || exercises.length === 0 || createMutation.isPending}
            >
              <Save className="w-4 h-4 ml-2" />
              {createMutation.isPending ? 'שולח...' : 'שלח אימון למתאמן'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}