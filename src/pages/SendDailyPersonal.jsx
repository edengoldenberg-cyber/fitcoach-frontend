import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, Plus, Trash2, Video, Send, GripVertical, UserPlus, Dumbbell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import AddTraineeQuickDialog from '../components/coach/AddTraineeQuickDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function SendDailyPersonal() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTrainee, setSelectedTrainee] = useState('');
  const [exercises, setExercises] = useState([]);
  const [showAddTrainee, setShowAddTrainee] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);

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
    queryKey: ['rotationLastPerformance', selectedTrainee],
    queryFn: async () => {
      if (!selectedTrainee) return {};
      const logs = await base44.entities.RotationExerciseLog.filter({ trainee_email: selectedTrainee });
      const performance = {};
      logs.forEach(log => {
        if (!performance[log.exercise_name]) {
          const sets = log.sets || [];
          const lastSet = sets[sets.length - 1];
          performance[log.exercise_name] = {
            weight: lastSet?.weight || 0,
            reps: lastSet?.reps || 0,
            sets: sets.length,
            date: log.created_date
          };
        }
      });
      return performance;
    },
    enabled: !!selectedTrainee,
  });

  const addExercise = (exercise) => {
    const last = lastPerformance?.[exercise.name_he] || {};
    setExercises([...exercises, {
      exercise_id: exercise.id,
      exercise_name: exercise.name_he,
      video_url: exercise.video_url || '',
      target_sets: 3,
      target_reps_min: 10,
      target_reps_max: 10,
      target_weight: 0,
      rest_seconds: 90,
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

  const sendMutation = useMutation({
    mutationFn: async () => {
      // Validate all exercises first
      const invalidExercises = exercises.filter(ex => {
        const repsMinValid = !ex.target_reps_min || !isNaN(Number(ex.target_reps_min));
        const repsMaxValid = !ex.target_reps_max || !isNaN(Number(ex.target_reps_max));
        return !repsMinValid || !repsMaxValid;
      });

      if (invalidExercises.length > 0) {
        const names = invalidExercises.map(ex => ex.exercise_name).join(', ');
        throw new Error(`חזרות חייבות להיות מספר בלבד בתרגילים: ${names}`);
      }

      // Create one-time program
      const program = await base44.entities.RotationProgram.create({
        coach_email: user.email,
        name: `אימון פרטני - ${trainees.find(t => t.user_email === selectedTrainee)?.full_name}`,
        sequence: ['SINGLE'],
        loop_enabled: false,
        status: 'active'
      });

      // Create category
      const category = await base44.entities.RotationCategory.create({
        program_id: program.id,
        category_letter: 'SINGLE',
        name: 'אימון יומי'
      });

      // Add exercises
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        
        // Parse reps - ensure they are numbers
        const repsMin = ex.target_reps_min ? Number(ex.target_reps_min) : null;
        const repsMax = ex.target_reps_max ? Number(ex.target_reps_max) : null;
        
        await base44.entities.RotationCategoryExercise.create({
          category_id: category.id,
          order_index: i + 1,
          exercise_id: ex.exercise_id,
          exercise_name: ex.exercise_name,
          video_url: ex.video_url || '',
          target_sets: Number(ex.target_sets) || 3,
          target_reps_min: repsMin,
          target_reps_max: repsMax,
          target_weight: Number(ex.target_weight) || 0,
          rest_seconds: Number(ex.rest_seconds) || 90,
          notes: ex.notes || ''
        });
      }

      // Assign to trainee
      const assignment = await base44.entities.RotationAssignment.create({
        trainee_email: selectedTrainee,
        program_id: program.id,
        current_index: 0,
        status: 'active',
        start_date: new Date().toISOString().split('T')[0]
      });

      // Create session instance
      await base44.entities.RotationSessionInstance.create({
        assignment_id: assignment.id,
        category_id: category.id,
        category_letter: 'SINGLE',
        date: new Date().toISOString().split('T')[0],
        status: 'ready'
      });

      return program;
    },
    onSuccess: () => {
      toast.success('האימון נשלח למתאמן ✅');
      queryClient.invalidateQueries({ queryKey: ['rotationPrograms'] });
      queryClient.invalidateQueries({ queryKey: ['rotationAssignments'] });
      navigate(-1);
    },
    onError: (error) => {
      toast.error('שגיאה: ' + error.message);
    }
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-100 pb-20" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowRight className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold text-teal-900">אימון יומי פרטני</h1>
        </div>

        <Card className="p-6 bg-white mb-4">
          <label className="block text-sm font-medium mb-2">בחר מתאמן</label>
          <Select value={selectedTrainee} onValueChange={setSelectedTrainee}>
            <SelectTrigger>
              <SelectValue placeholder="בחר מתאמן..." />
            </SelectTrigger>
            <SelectContent>
              {trainees.map(t => (
                <SelectItem key={t.id} value={t.user_email}>
                  {t.full_name} • {t.phone || t.user_email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            className="w-full mt-3"
            onClick={() => setShowAddTrainee(true)}
          >
            <UserPlus className="w-4 h-4 ml-2" />
            הוסף מתאמן ידנית
          </Button>
        </Card>

        <AddTraineeQuickDialog 
          open={showAddTrainee} 
          onOpenChange={setShowAddTrainee}
          coachEmail={user?.email}
        />

        {selectedTrainee && (
          <>
            <Card className="p-4 bg-white mb-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold">תרגילים</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowExercisePicker(true)}
                >
                  <Plus className="w-4 h-4 ml-2" />
                  הוסף תרגיל
                </Button>
              </div>

              {exercises.length === 0 ? (
                <p className="text-center py-6 text-slate-400">הוסף תרגילים לאימון</p>
              ) : (
                <div className="space-y-4">
                  {exercises.map((ex, idx) => {
                    const last = lastPerformance?.[ex.exercise_name];
                    return (
                      <Card key={idx} className="p-4 bg-slate-50">
                        <div className="flex items-start gap-2 mb-3">
                          <GripVertical className="w-5 h-5 text-slate-400 mt-1" />
                          <div className="flex-1">
                            <p className="font-bold text-slate-800">{ex.exercise_name}</p>
                            {last && (
                              <p className="text-xs text-blue-600">
                                פעם קודמת: {last.sets}×{last.reps} @ {last.weight}kg ({new Date(last.date).toLocaleDateString('he-IL')})
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

                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Video className="w-4 h-4 text-slate-500" />
                            <Input 
                              placeholder="קישור לסרטון (YouTube / Drive)"
                              value={ex.video_url}
                              onChange={(e) => updateExercise(idx, 'video_url', e.target.value)}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-slate-600">סטים</label>
                              <Input 
                                type="number"
                                value={ex.target_sets}
                                onChange={(e) => updateExercise(idx, 'target_sets', e.target.value ? Number(e.target.value) : 0)}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-600">חזרות (טווח) - מספר בלבד</label>
                              <div className="flex gap-1">
                                <Input 
                                  type="number"
                                  value={ex.target_reps_min}
                                  onChange={(e) => updateExercise(idx, 'target_reps_min', e.target.value)}
                                  placeholder="8"
                                  className={ex.target_reps_min && isNaN(Number(ex.target_reps_min)) ? 'border-red-500' : ''}
                                />
                                <Input 
                                  type="number"
                                  value={ex.target_reps_max}
                                  onChange={(e) => updateExercise(idx, 'target_reps_max', e.target.value)}
                                  placeholder="12"
                                  className={ex.target_reps_max && isNaN(Number(ex.target_reps_max)) ? 'border-red-500' : ''}
                                />
                              </div>
                              {(ex.target_reps_min && isNaN(Number(ex.target_reps_min))) || (ex.target_reps_max && isNaN(Number(ex.target_reps_max))) ? (
                                <p className="text-xs text-red-500 mt-1">חזרות חייבות להיות מספר בלבד</p>
                              ) : null}
                            </div>
                            <div>
                              <label className="text-xs text-slate-600">משקל (kg)</label>
                              <Input 
                                type="number"
                                value={ex.target_weight}
                                onChange={(e) => updateExercise(idx, 'target_weight', e.target.value ? Number(e.target.value) : 0)}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-600">מנוחה (שניות)</label>
                              <Input 
                                type="number"
                                value={ex.rest_seconds}
                                onChange={(e) => updateExercise(idx, 'rest_seconds', e.target.value ? Number(e.target.value) : 0)}
                              />
                            </div>
                          </div>

                          <Textarea 
                            placeholder="הערות לתרגיל..."
                            value={ex.notes}
                            onChange={(e) => updateExercise(idx, 'notes', e.target.value)}
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
              className="w-full bg-teal-600 hover:bg-teal-700 h-12"
              onClick={() => sendMutation.mutate()}
              disabled={exercises.length === 0 || sendMutation.isPending}
            >
              <Send className="w-5 h-5 ml-2" />
              {sendMutation.isPending ? 'שולח...' : 'שלח למתאמן'}
            </Button>
          </>
        )}

        {/* Exercise Picker Dialog */}
        <Dialog open={showExercisePicker} onOpenChange={setShowExercisePicker}>
          <DialogContent dir="rtl" className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Dumbbell className="w-5 h-5" />
                בחר תרגיל מהמאגר
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {exerciseBank.map(exercise => (
                <div
                  key={exercise.id}
                  className="p-3 bg-slate-50 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                  onClick={() => {
                    addExercise(exercise);
                    setShowExercisePicker(false);
                  }}
                >
                  <p className="font-medium text-slate-800">{exercise.name_he}</p>
                  <p className="text-xs text-slate-500">
                    {exercise.muscle_group_primary}
                    {exercise.video_url && ' • יש סרטון'}
                  </p>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}