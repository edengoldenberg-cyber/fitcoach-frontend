import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Send, Plus, Trash2, Video, Dumbbell, Search, Save, FolderOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import TraineeMultiSelect from '../components/coach/TraineeMultiSelect';
import SetBySetInput from '../components/coach/SetBySetInput';
import { parseReps } from '../components/shared/repsParser';

export default function OnlineTrainingCoachV2() {
  const queryClient = useQueryClient();
  
  // Multi-trainee selection
  const [selectedTrainees, setSelectedTrainees] = useState([]);
  
  // Daily workout state
  const [dailyExercises, setDailyExercises] = useState([]);
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0]);
  const [programName, setProgramName] = useState('אימון פרטי');
  const [blockCounter, setBlockCounter] = useState(0);
  
  // UI state
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState('');
  const [selectedMuscleFilter, setSelectedMuscleFilter] = useState('all');
  
  // Template state
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: regularTrainees = [] } = useQuery({
    queryKey: ['coachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email, status: 'active' }),
    enabled: !!user?.email,
  });

  const { data: externalTrainees = [] } = useQuery({
    queryKey: ['externalTrainees', user?.email],
    queryFn: () => base44.entities.ExternalTrainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const trainees = [
    ...regularTrainees,
    ...externalTrainees.map(ext => ({
      id: ext.id,
      full_name: ext.full_name,
      user_email: ext.phone_e164,
      phone: ext.phone_e164,
      status: 'active',
      isExternal: true,
      source: ext.source
    }))
  ];

  const { data: exerciseBank = [] } = useQuery({
    queryKey: ['exerciseBank'],
    queryFn: async () => {
      const exercises = await base44.entities.Exercise.list();
      return exercises.filter(ex => ex.status === 'active');
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['workoutTemplates', user?.email],
    queryFn: () => base44.entities.WorkoutTemplate.filter({ 
      coach_email: user?.email,
      is_active: true 
    }),
    enabled: !!user?.email,
  });

  const addExerciseToDaily = (exercise) => {
    setDailyExercises([...dailyExercises, {
      exercise_id: exercise.id,
      exercise_name: exercise.name_he,
      muscle_group: exercise.muscle_group_primary,
      video_url: exercise.video_url || '',
      sets: 3,
      reps: '10',
      weight: 0,
      rest_seconds: 60,
      tempo: '',
      notes: '',
      order_index: dailyExercises.length,
      setsData: [],
      block_type: 'single',
      block_id: null
    }]);
    setShowExercisePicker(false);
    setExerciseSearchQuery('');
    toast.success(`נוסף: ${exercise.name_he}`);
  };

  const addSuperset = () => {
    const newBlockId = `block_${Date.now()}`;
    setBlockCounter(blockCounter + 1);
    
    const exercise1 = {
      exercise_id: null,
      exercise_name: 'תרגיל 1',
      muscle_group: '',
      video_url: '',
      sets: 3,
      reps: '10',
      weight: 0,
      rest_seconds: 90,
      tempo: '',
      notes: '',
      order_index: dailyExercises.length,
      setsData: [],
      block_type: 'superset',
      block_id: newBlockId
    };

    const exercise2 = {
      exercise_id: null,
      exercise_name: 'תרגיל 2',
      muscle_group: '',
      video_url: '',
      sets: 3,
      reps: '10',
      weight: 0,
      rest_seconds: 90,
      tempo: '',
      notes: '',
      order_index: dailyExercises.length + 1,
      setsData: [],
      block_type: 'superset',
      block_id: newBlockId
    };

    setDailyExercises([...dailyExercises, exercise1, exercise2]);
    toast.success('נוסף Superset');
  };

  const updateDailyExercise = (index, field, value) => {
    const updated = [...dailyExercises];
    updated[index][field] = value;
    setDailyExercises(updated);
  };

  const removeDailyExercise = (index) => {
    setDailyExercises(dailyExercises.filter((_, i) => i !== index));
  };

  // Save as template
  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!templateName || dailyExercises.length === 0) {
        throw new Error('חייב להזין שם תבנית ולפחות תרגיל אחד');
      }

      return await base44.entities.WorkoutTemplate.create({
        coach_email: user.email,
        template_name: templateName,
        description: templateDescription,
        exercises: dailyExercises,
        is_active: true
      });
    },
    onSuccess: () => {
      toast.success('התבנית נשמרה בהצלחה ✅');
      setShowSaveTemplate(false);
      setTemplateName('');
      setTemplateDescription('');
      queryClient.invalidateQueries({ queryKey: ['workoutTemplates'] });
    },
    onError: (err) => {
      toast.error('שגיאה בשמירת תבנית: ' + err.message);
    }
  });

  // Load template
  const loadTemplate = (template) => {
    setDailyExercises(template.exercises || []);
    setProgramName(template.template_name);
    setShowTemplates(false);
    toast.success(`תבנית "${template.template_name}" נטענה`);
  };

  // Send workout to multiple trainees
  const sendDailyMutation = useMutation({
    mutationFn: async () => {
      if (selectedTrainees.length === 0) {
        throw new Error('חייב לבחור לפחות מתאמן אחד');
      }
      if (dailyExercises.length === 0) {
        throw new Error('חייב להוסיף לפחות תרגיל אחד');
      }

      const results = await Promise.all(
        selectedTrainees.map(async (traineeEmail) => {
          try {
            const traineeObj = trainees.find(t => t.user_email === traineeEmail);
            if (!traineeObj) throw new Error(`מתאמן לא נמצא: ${traineeEmail}`);

            // Create assignment
            const assignment = await base44.entities.OnlineAssignment.create({
              trainee_id: traineeObj.id,
              trainee_email: traineeEmail,
              coach_id: user.id,
              coach_email: user.email,
              mode: 'DAILY',
              status: 'ACTIVE',
              start_date: dailyDate
            });

            // Create workout
            const workout = await base44.entities.OnlineDailyWorkout.create({
              assignment_id: assignment.id,
              trainee_id: traineeObj.id,
              trainee_email: traineeEmail,
              coach_id: user.id,
              coach_email: user.email,
              workout_date: dailyDate,
              title: programName
            });

            // Create exercises
            const exercisePromises = dailyExercises.map(async (ex) => {
              const repsParsed = parseReps(ex.reps);
              return await base44.entities.OnlineDailyWorkoutItem.create({
                daily_workout_id: workout.id,
                exercise_id: ex.exercise_id,
                exercise_name: ex.exercise_name,
                order_index: ex.order_index,
                sets: Number(ex.sets) || 3,
                reps: repsParsed.min || null,
                reps_text: repsParsed.text || (repsParsed.min !== repsParsed.max ? `${repsParsed.min}-${repsParsed.max}` : null),
                weight: Number(ex.weight) || 0,
                rest_seconds: Number(ex.rest_seconds) || 90,
                notes: ex.notes || '',
                video_url: ex.video_url || '',
                muscle_group: ex.muscle_group || '',
                tempo: ex.tempo || '',
                setsData: ex.setsData || [],
                block_type: ex.block_type || 'single',
                block_id: ex.block_id || null
              });
            });

            await Promise.all(exercisePromises);

            return { success: true, trainee: traineeObj.full_name };
          } catch (err) {
            return { success: false, trainee: traineeEmail, error: err.message };
          }
        })
      );

      return results;
    },
    onSuccess: (results) => {
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      if (successful.length > 0) {
        toast.success(`האימון נשלח ל-${successful.length} מתאמנים בהצלחה ✅`);
      }
      if (failed.length > 0) {
        toast.error(`נכשל עבור ${failed.length} מתאמנים: ${failed.map(f => f.trainee).join(', ')}`);
      }

      // Reset form
      setDailyExercises([]);
      setSelectedTrainees([]);
      setProgramName('אימון פרטי');
      queryClient.invalidateQueries({ queryKey: ['sentWorkouts'] });
    },
    onError: (err) => {
      toast.error('שגיאה: ' + err.message);
    }
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">🌐 אימון אונליין מקצועי</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTemplates(true)}
            >
              <FolderOpen className="w-4 h-4 ml-2" />
              תבניות ({templates.length})
            </Button>
          </div>
        </div>

        {/* Control Panel */}
        <Card className="p-6 mb-6 border-2 border-teal-400">
          <div className="space-y-4">
            {/* Trainee Multi-Select */}
            <TraineeMultiSelect
              trainees={trainees}
              selectedTrainees={selectedTrainees}
              onSelectionChange={setSelectedTrainees}
            />

            {/* Program Name & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold mb-2">שם התוכנית</label>
                <Input
                  value={programName}
                  onChange={(e) => setProgramName(e.target.value)}
                  placeholder="למשל: חיזוק כוח עליון"
                  className="h-11"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">תאריך האימון</label>
                <Input
                  type="date"
                  value={dailyDate}
                  onChange={(e) => setDailyDate(e.target.value)}
                  className="h-11"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Main Content */}
        <Card className="p-6 bg-white">
          {/* Add Exercise Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-6">
            <Button
              onClick={() => setShowExercisePicker(true)}
              className="h-14 text-base font-bold text-white shadow-lg"
              style={{ backgroundColor: '#79DBD6' }}
            >
              <Plus className="w-5 h-5 ml-2" />
              הוסף תרגיל
            </Button>
            <Button
              onClick={addSuperset}
              className="h-14 text-base font-bold text-white shadow-lg"
              style={{ backgroundColor: '#f59e0b' }}
            >
              <Plus className="w-5 h-5 ml-2" />
              Superset
            </Button>
            {dailyExercises.length > 0 && (
              <Button
                onClick={() => setShowSaveTemplate(true)}
                variant="outline"
                className="h-14"
              >
                <Save className="w-5 h-5 ml-2" />
                שמור כתבנית
              </Button>
            )}
          </div>

          {/* Exercises List */}
          {dailyExercises.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Dumbbell className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">טרם נוספו תרגילים</p>
            </div>
          ) : (
            <div className="space-y-4 mb-6">
              {dailyExercises.map((ex, i) => {
                const isSuperset = ex.block_type === 'superset' || ex.block_type === 'dropset';
                const isFirstInBlock = isSuperset && (i === 0 || dailyExercises[i - 1]?.block_id !== ex.block_id);
                const isLastInBlock = isSuperset && (i === dailyExercises.length - 1 || dailyExercises[i + 1]?.block_id !== ex.block_id);

                return (
                  <div key={i}>
                    {isFirstInBlock && (
                      <div className="bg-amber-100 border-2 border-amber-300 rounded-t-lg px-4 py-2">
                        <Badge className="bg-amber-600 text-white font-bold">
                          🔗 {ex.block_type === 'superset' ? 'SUPERSET' : 'DROP SET'}
                        </Badge>
                      </div>
                    )}
                    <Card className={`p-4 bg-slate-50 border-2 hover:border-teal-300 transition-all ${
                      isSuperset ? (isFirstInBlock ? 'rounded-t-none' : isLastInBlock ? 'rounded-b-lg' : 'rounded-none border-t-0') : ''
                    }`}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3 flex-1">
                          <div className={`flex items-center justify-center w-10 h-10 rounded-full text-white text-base font-bold ${
                            isSuperset ? 'bg-amber-600' : 'bg-teal-600'
                          }`}>
                            {i + 1}
                          </div>
                          <div className="flex-1">
                            <Input
                              value={ex.exercise_name}
                              onChange={(e) => updateDailyExercise(i, 'exercise_name', e.target.value)}
                              className="font-bold text-xl h-12 mb-2 bg-white"
                              placeholder="שם התרגיל..."
                            />
                            {ex.muscle_group && (
                              <Badge variant="outline" className="text-xs">
                                {ex.muscle_group}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeDailyExercise(i)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>

                      {/* Set By Set Input Component */}
                      <SetBySetInput
                        exercise={ex}
                        onUpdate={(field, value) => updateDailyExercise(i, field, value)}
                      />

                      {/* Tempo & Notes */}
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <Input
                          placeholder="טמפו (3-1-3)"
                          value={ex.tempo}
                          onChange={(e) => updateDailyExercise(i, 'tempo', e.target.value)}
                          className="h-9 text-sm"
                        />
                        <Input
                          placeholder="קישור וידאו"
                          value={ex.video_url}
                          onChange={(e) => updateDailyExercise(i, 'video_url', e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <Textarea
                        placeholder="הערות לתרגיל..."
                        value={ex.notes}
                        onChange={(e) => updateDailyExercise(i, 'notes', e.target.value)}
                        rows={2}
                        className="mt-2 text-sm"
                      />
                    </Card>
                  </div>
                );
              })}
            </div>
          )}

          {/* Warning */}
          {selectedTrainees.length === 0 && (
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800 font-bold text-center">
                ⚠️ חייב לבחור לפחות מתאמן אחד לפני שליחה
              </p>
            </div>
          )}

          {/* Send Button */}
          <Button
            className="w-full h-16 text-lg font-bold text-white shadow-xl"
            style={{ backgroundColor: '#10b981' }}
            onClick={() => sendDailyMutation.mutate()}
            disabled={selectedTrainees.length === 0 || dailyExercises.length === 0 || sendDailyMutation.isPending}
          >
            {sendDailyMutation.isPending ? (
              <>
                <Loader2 className="w-6 h-6 ml-2 animate-spin" />
                שולח לכל המתאמנים...
              </>
            ) : (
              <>
                <Send className="w-6 h-6 ml-2" />
                שלח ל-{selectedTrainees.length} מתאמנים ({dailyExercises.length} תרגילים)
              </>
            )}
          </Button>
        </Card>

        {/* Exercise Picker Dialog */}
        <Dialog open={showExercisePicker} onOpenChange={setShowExercisePicker}>
          <DialogContent dir="rtl" className="max-w-3xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Dumbbell className="w-6 h-6" style={{ color: '#79DBD6' }} />
                בחר תרגיל מהמאגר
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 pb-4 border-b">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder="חפש תרגיל..."
                  value={exerciseSearchQuery}
                  onChange={(e) => setExerciseSearchQuery(e.target.value)}
                  className="pr-10 h-12"
                />
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2">
                <Badge
                  variant={selectedMuscleFilter === 'all' ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setSelectedMuscleFilter('all')}
                >
                  הכל
                </Badge>
                {['חזה', 'גב', 'כתפיים', 'יד קדמית', 'יד אחורית', 'רגליים', 'ישבן', 'ליבה'].map(muscle => (
                  <Badge
                    key={muscle}
                    variant={selectedMuscleFilter === muscle ? 'default' : 'outline'}
                    className="cursor-pointer whitespace-nowrap"
                    onClick={() => setSelectedMuscleFilter(muscle)}
                  >
                    {muscle}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {exerciseBank
                .filter(ex => {
                  const matchesSearch = !exerciseSearchQuery || 
                    ex.name_he.toLowerCase().includes(exerciseSearchQuery.toLowerCase());
                  const matchesMuscle = selectedMuscleFilter === 'all' || 
                    ex.muscle_group_primary === selectedMuscleFilter;
                  return matchesSearch && matchesMuscle;
                })
                .map(exercise => (
                  <Card
                    key={exercise.id}
                    className="p-4 hover:bg-slate-50 cursor-pointer border-2 hover:border-teal-300"
                    onClick={() => addExerciseToDaily(exercise)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-bold text-lg">{exercise.name_he}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {exercise.muscle_group_primary}
                          </Badge>
                          {exercise.video_url && (
                            <Badge variant="outline" className="text-xs flex items-center gap-1">
                              <Video className="w-3 h-3" />
                              וידאו
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Templates Dialog */}
        <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
          <DialogContent dir="rtl" className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>תבניות אימון שמורות</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 overflow-y-auto max-h-[60vh]">
              {templates.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p>אין תבניות שמורות</p>
                </div>
              ) : (
                templates.map(template => (
                  <Card
                    key={template.id}
                    className="p-4 cursor-pointer hover:bg-slate-50 border-2 hover:border-teal-300"
                    onClick={() => loadTemplate(template)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-lg">{template.template_name}</p>
                        {template.description && (
                          <p className="text-sm text-slate-600 mt-1">{template.description}</p>
                        )}
                        <Badge variant="outline" className="mt-2">
                          {template.exercises?.length || 0} תרגילים
                        </Badge>
                      </div>
                      <Button size="sm" className="bg-teal-600 text-white">טען</Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Save Template Dialog */}
        <Dialog open={showSaveTemplate} onOpenChange={setShowSaveTemplate}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>שמור תבנית אימון</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-2">שם התבנית *</label>
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="למשל: פול בודי א'"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">תיאור (אופציונלי)</label>
                <Textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="תיאור קצר של התוכנית..."
                  rows={3}
                />
              </div>
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-sm text-slate-600">
                  התבנית תכלול {dailyExercises.length} תרגילים
                </p>
              </div>
              <Button
                className="w-full bg-teal-600 hover:bg-teal-700"
                onClick={() => saveTemplateMutation.mutate()}
                disabled={!templateName || saveTemplateMutation.isPending}
              >
                {saveTemplateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    שומר...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 ml-2" />
                    שמור תבנית
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}