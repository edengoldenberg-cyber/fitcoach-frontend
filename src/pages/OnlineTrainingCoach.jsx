import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Plus, Trash2, Video, Send, Dumbbell, GripVertical, UserPlus, Bug, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import AddTraineeQuickDialog from '../components/coach/AddTraineeQuickDialog';
import DailyWorkoutExerciseCard from '../components/coach/DailyWorkoutExerciseCard';
import { WorkoutListSkeleton } from '../components/shared/LoadingSkeleton';
import { parseReps } from '../components/shared/repsParser';

export default function OnlineTrainingCoach() {
  const queryClient = useQueryClient();
  const [selectedTrainees, setSelectedTrainees] = useState([]); // array of user_email
  const [searchTrainee, setSearchTrainee] = useState('');
  const [showAddTrainee, setShowAddTrainee] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState('');
  const [selectedMuscleFilter, setSelectedMuscleFilter] = useState('all');
  
  const selectedTrainee = selectedTrainees[0] || ''; // backward compat for debug/copy

  // Daily mode
  const [dailyExercises, setDailyExercises] = useState([]);
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0]);
  const [workoutStatus, setWorkoutStatus] = useState('draft'); // draft, ready, sent
  
  // Rotation mode
  const [programTitle, setProgramTitle] = useState('');
  const [slots, setSlots] = useState({ A: [], B: [], C: [] });
  const [currentSlot, setCurrentSlot] = useState('A');

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

  // Merge regular trainees and external trainees
  const trainees = [
    ...regularTrainees,
    ...externalTrainees.map(ext => ({
      id: ext.id,
      full_name: ext.full_name,
      user_email: ext.phone_e164, // Use phone as identifier
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
      console.log('[ExerciseBank] Loaded exercises:', exercises.length);
      return exercises.filter(ex => ex.status === 'active');
    },
  });

  const { data: debugData } = useQuery({
    queryKey: ['onlineDebug', selectedTrainee],
    queryFn: async () => {
      const assignments = await base44.entities.OnlineAssignment.filter({ trainee_email: selectedTrainee });
      const history = await base44.entities.ExerciseHistory.filter({ trainee_email: selectedTrainee });
      
      // Enrich assignments with workout details
      const enrichedAssignments = await Promise.all(assignments.map(async (a) => {
        if (a.mode === 'DAILY') {
          const workouts = await base44.entities.OnlineDailyWorkout.filter({ assignment_id: a.id });
          const workout = workouts[0];
          let itemsCount = 0;
          if (workout) {
            const items = await base44.entities.OnlineDailyWorkoutItem.filter({ daily_workout_id: workout.id });
            itemsCount = items.length;
          }
          return { ...a, workout, itemsCount };
        }
        return a;
      }));
      
      // Get today's sent assignments count
      const today = new Date().toISOString().split('T')[0];
      const todayAssignments = enrichedAssignments.filter(a => a.created_date?.startsWith(today));
      
      return { 
        assignments: enrichedAssignments, 
        history,
        todayCount: todayAssignments.length,
        lastSent: enrichedAssignments[0] || null
      };
    },
    enabled: showDebug && !!selectedTrainee,
  });

  const { data: sentWorkoutsHistory = [] } = useQuery({
    queryKey: ['sentWorkouts', user?.email],
    queryFn: async () => {
      const assignments = await base44.entities.OnlineAssignment.filter({ 
        coach_email: user?.email,
        mode: 'DAILY'
      });
      return assignments.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 10);
    },
    enabled: !!user?.email,
  });

  const filteredTrainees = trainees.filter(t =>
    t.full_name?.toLowerCase().includes(searchTrainee.toLowerCase()) ||
    t.phone?.includes(searchTrainee) ||
    t.user_email?.toLowerCase().includes(searchTrainee.toLowerCase())
  );

  const addExerciseToDaily = (exercise) => {
    setDailyExercises([...dailyExercises, {
      exercise_id: exercise.id,
      exercise_name: exercise.name_he,
      muscle_group: exercise.muscle_group_primary,
      video_url: exercise.video_url || '',
      sets: 3,
      reps: '8-12',
      weight: 0,
      rest_seconds: 60,
      tempo: '',
      notes: '',
      order_index: dailyExercises.length
    }]);
    setShowExercisePicker(false);
    setExerciseSearchQuery('');
    toast.success(`נוסף: ${exercise.name_he}`);
  };

  const copyFromLastWorkout = async (index) => {
    const exercise = dailyExercises[index];
    if (!exercise.exercise_id || !selectedTrainee) {
      toast.error('לא ניתן להעתיק - חסר מידע');
      return;
    }

    try {
      const history = await base44.entities.ExerciseHistory.filter({
        trainee_email: selectedTrainee,
        exercise_id: exercise.exercise_id
      });

      if (history.length === 0) {
        toast.error('אין אימון קודם למתאמן זה');
        return;
      }

      // Get most recent
      const last = history.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      
      updateDailyExercise(index, 'sets', last.sets);
      updateDailyExercise(index, 'reps', last.reps);
      updateDailyExercise(index, 'weight', last.weight);
      updateDailyExercise(index, 'rest_seconds', last.rest_seconds);
      
      toast.success(`הועתק מאימון מ-${new Date(last.date).toLocaleDateString('he-IL')}`);
    } catch (err) {
      toast.error('שגיאה בהעתקה: ' + err.message);
    }
  };

  const addExerciseToSlot = (exercise) => {
    const slotExercises = slots[currentSlot] || [];
    setSlots({
      ...slots,
      [currentSlot]: [...slotExercises, {
        exercise_id: exercise.id,
        exercise_name: exercise.name_he,
        video_url_override: exercise.video_url || '',
        sets_default: 3,
        reps_default: 10,
        weight_default: 0,
        rest_default_seconds: 90,
        notes_default: '',
        order_index: slotExercises.length
      }]
    });
    setShowExercisePicker(false);
  };

  const updateDailyExercise = (index, field, value) => {
    const updated = [...dailyExercises];
    updated[index][field] = value;
    setDailyExercises(updated);
  };

  const updateSlotExercise = (slot, index, field, value) => {
    const updated = [...slots[slot]];
    updated[index][field] = value;
    setSlots({ ...slots, [slot]: updated });
  };

  const removeDailyExercise = (index) => {
    setDailyExercises(dailyExercises.filter((_, i) => i !== index));
  };

  const removeSlotExercise = (slot, index) => {
    setSlots({ ...slots, [slot]: slots[slot].filter((_, i) => i !== index) });
  };

  const sendDailyMutation = useMutation({
    mutationFn: async () => {
      if (selectedTrainees.length === 0) throw new Error('חייב לבחור לפחות מתאמן אחד');
      if (dailyExercises.length === 0) throw new Error('חייב להוסיף לפחות תרגיל אחד');

      const results = [];

      for (const email of selectedTrainees) {
        const traineeObj = trainees.find(t => t.user_email === email);
        if (!traineeObj) continue;

        const assignment = await base44.entities.OnlineAssignment.create({
          trainee_id: traineeObj.id,
          trainee_email: email,
          coach_id: user.id,
          coach_email: user.email,
          mode: 'DAILY',
          status: 'ACTIVE',
          start_date: dailyDate
        });

        const workout = await base44.entities.OnlineDailyWorkout.create({
          assignment_id: assignment.id,
          trainee_id: traineeObj.id,
          trainee_email: email,
          coach_id: user.id,
          coach_email: user.email,
          workout_date: dailyDate,
          title: 'אימון יומי פרטי'
        });

        let itemsCount = 0;
        for (const ex of dailyExercises) {
          const repsParsed = parseReps(ex.reps);
          await base44.entities.OnlineDailyWorkoutItem.create({
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
            tempo: ex.tempo || ''
          }).catch(() => {});
          itemsCount++;
        }
        results.push({ name: traineeObj.full_name, itemsCount });
      }

      return results;
    },
    onSuccess: (results) => {
      toast.success(`אימון נשלח ל-${results.length} מתאמנים ✅ (${dailyExercises.length} תרגילים לכל אחד)`);
      setDailyExercises([]);
      setWorkoutStatus('sent');
      queryClient.invalidateQueries({ queryKey: ['onlineDebug'] });
      queryClient.invalidateQueries({ queryKey: ['sentWorkouts'] });
    },
    onError: (err) => {
      toast.error('שגיאה: ' + err.message);
    }
  });

  const sendProgramMutation = useMutation({
    mutationFn: async () => {
      const program = await base44.entities.OnlineProgram.create({
        coach_email: user.email,
        title: programTitle,
        slots_enabled: ['A', 'B', 'C']
      });

      for (const [slot, exercises] of Object.entries(slots)) {
        for (const ex of exercises) {
          await base44.entities.OnlineProgramExercise.create({
            program_id: program.id,
            slot,
            ...ex
          });
        }
      }

      const assignment = await base44.entities.OnlineAssignment.create({
        trainee_email: selectedTrainee,
        coach_email: user.email,
        mode: 'ROTATION',
        status: 'ACTIVE',
        program_id: program.id,
        next_slot: 'A',
        start_date: new Date().toISOString().split('T')[0]
      });

      return assignment;
    },
    onSuccess: () => {
      toast.success('תוכנית נשלחה למתאמן ✅');
      setProgramTitle('');
      setSlots({ A: [], B: [], C: [] });
      queryClient.invalidateQueries({ queryKey: ['onlineDebug'] });
    },
    onError: (err) => {
      toast.error('שגיאה: ' + err.message);
    }
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">אימון אונליין</h1>
          {selectedTrainee && (
            <Button variant="outline" size="sm" onClick={() => setShowDebug(true)}>
              <Bug className="w-4 h-4 ml-2" />
              Debug
            </Button>
          )}
        </div>

        {/* Top Control Panel */}
        <Card className="card-premium mb-6 border-2" style={{ borderColor: '#79DBD6' }}>
          <div className="grid gap-4">
            {/* Trainee Selection - Multi */}
            <div>
              <label className="block text-sm font-bold mb-2 flex items-center gap-2">
                <span className="text-red-500">*</span>
                בחר מתאמנים
                {workoutStatus === 'sent' && (
                  <Badge className="bg-green-500">נשלח</Badge>
                )}
                {selectedTrainees.length > 0 && (
                  <Badge style={{ backgroundColor: '#79DBD6' }}>{selectedTrainees.length} נבחרו</Badge>
                )}
              </label>

              {/* Selected trainees chips */}
              {selectedTrainees.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3 p-3 bg-teal-50 rounded-lg border-2 border-teal-300">
                  {selectedTrainees.map(email => {
                    const t = trainees.find(t => t.user_email === email);
                    return (
                      <div key={email} className="flex items-center gap-1 bg-white border border-teal-300 rounded-full px-3 py-1 text-sm">
                        <span className="font-medium text-teal-800">{t?.full_name || email}</span>
                        <button
                          className="text-red-400 hover:text-red-600 mr-1"
                          onClick={() => setSelectedTrainees(prev => prev.filter(e => e !== email))}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    className="text-xs text-red-500 underline pr-1"
                    onClick={() => setSelectedTrainees([])}
                  >
                    נקה הכל
                  </button>
                </div>
              )}

              <Input
                placeholder="🔍 חפש לפי שם, טלפון או מייל..."
                value={searchTrainee}
                onChange={(e) => setSearchTrainee(e.target.value)}
                className="mb-2 h-11"
              />
              {searchTrainee && (
                <div className="max-h-48 overflow-y-auto border-2 rounded-lg mb-2">
                  {filteredTrainees.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 text-sm">
                      לא נמצאו מתאמנים
                    </div>
                  ) : (
                    filteredTrainees.map(t => {
                      const isSelected = selectedTrainees.includes(t.user_email);
                      return (
                        <div
                          key={t.id}
                          className={`p-3 cursor-pointer hover:bg-slate-50 border-b last:border-b-0 ${isSelected ? 'bg-teal-50' : ''}`}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedTrainees(prev => prev.filter(e => e !== t.user_email));
                            } else {
                              setSelectedTrainees(prev => [...prev, t.user_email]);
                            }
                            setSearchTrainee('');
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{isSelected ? '✅' : '⬜'}</span>
                            <p className="font-medium">{t.full_name}</p>
                            {t.isExternal && (
                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                {t.source === 'ARBOX' ? '📦 Arbox' : '👤 ידני'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mr-8">{t.phone || t.user_email}</p>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
              <Button 
                variant="outline" 
                className="w-full h-11 border-2" 
                onClick={() => setShowAddTrainee(true)}
              >
                <UserPlus className="w-5 h-5 ml-2" />
                הוסף מתאמן ידנית
              </Button>
            </div>

            {/* Workout Date */}
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
        </Card>

        {selectedTrainees.length > 0 && (
          <Tabs defaultValue="daily" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="daily">אימון יומי פרטי</TabsTrigger>
              <TabsTrigger value="rotation">תוכנית A/B/C</TabsTrigger>
            </TabsList>

            {/* Daily Workout */}
            <TabsContent value="daily">
              <Card className="p-6 bg-white">
                {/* Add Exercise Button - Prominent */}
                <Button 
                  onClick={() => setShowExercisePicker(true)}
                  className="w-full mb-6 h-14 text-lg font-bold text-white shadow-lg"
                  style={{ backgroundColor: '#79DBD6' }}
                  disabled={selectedTrainees.length === 0}
                >
                  <Plus className="w-6 h-6 ml-2" />
                  הוסף תרגיל מהמאגר
                </Button>

                {/* Exercises List */}
                {dailyExercises.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Dumbbell className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg">טרם נוספו תרגילים</p>
                    <p className="text-sm mt-2">לחץ על "הוסף תרגיל" להתחיל</p>
                  </div>
                ) : (
                  <div className="space-y-4 mb-6">
                    {dailyExercises.map((ex, i) => (
                      <DailyWorkoutExerciseCard
                        key={i}
                        exercise={ex}
                        index={i}
                        onUpdate={updateDailyExercise}
                        onRemove={removeDailyExercise}
                        onCopyFromLast={copyFromLastWorkout}
                        canCopyFromLast={!!selectedTrainee && !!ex.exercise_id}
                      />
                    ))}
                  </div>
                )}

                {/* Warning if no trainee selected */}
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
                  <Send className="w-6 h-6 ml-2" />
                  {sendDailyMutation.isPending ? 'שולח...' : `שלח אימון ל-${selectedTrainees.length} מתאמנים (${dailyExercises.length} תרגילים)`}
                </Button>
                
                {/* Send Summary */}
                {dailyExercises.length > 0 && selectedTrainees.length > 0 && (
                  <Card className="mt-4 p-4 bg-teal-50 border-2 border-teal-200">
                    <p className="text-sm font-bold text-teal-800 mb-1">📋 סיכום שליחה:</p>
                    <p className="text-xs text-teal-700">
                      <strong>למתאמנים:</strong> {selectedTrainees.map(e => trainees.find(t => t.user_email === e)?.full_name).join(', ')}
                    </p>
                    <p className="text-xs text-teal-700">
                      <strong>תאריך:</strong> {new Date(dailyDate).toLocaleDateString('he-IL')}
                    </p>
                    <p className="text-xs text-teal-700">
                      <strong>תרגילים:</strong> {dailyExercises.length}
                    </p>
                  </Card>
                )}

                {/* Sent Workouts History */}
                {sentWorkoutsHistory.length > 0 && (
                  <Card className="mt-4 p-4 bg-slate-50">
                    <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                      📊 היסטוריית שליחות אחרונות
                    </h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {sentWorkoutsHistory.map(a => (
                        <div key={a.id} className="text-xs p-2 bg-white rounded border">
                          <span className="font-medium">{a.trainee_email}</span>
                          {' • '}
                          <span className="text-slate-600">
                            {new Date(a.created_date).toLocaleDateString('he-IL')}
                          </span>
                          {' • '}
                          <Badge variant="outline" className="text-xs">
                            {a.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </Card>
            </TabsContent>

            {/* Rotation Program */}
            <TabsContent value="rotation">
              <Card className="p-6 bg-white">
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">שם התוכנית</label>
                  <Input
                    placeholder="למשל: תוכנית 12 שבועות"
                    value={programTitle}
                    onChange={(e) => setProgramTitle(e.target.value)}
                  />
                </div>

                <Tabs value={currentSlot} onValueChange={setCurrentSlot} className="w-full">
                  <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="A">אימון A</TabsTrigger>
                    <TabsTrigger value="B">אימון B</TabsTrigger>
                    <TabsTrigger value="C">אימון C</TabsTrigger>
                  </TabsList>

                  {['A', 'B', 'C'].map(slot => (
                    <TabsContent key={slot} value={slot}>
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold">תרגילים - אימון {slot}</h3>
                        <Button variant="outline" size="sm" onClick={() => setShowExercisePicker(true)}>
                          <Plus className="w-4 h-4 ml-2" />
                          הוסף תרגיל
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {(slots[slot] || []).map((ex, i) => (
                          <Card key={i} className="p-4 bg-slate-50">
                            <div className="flex justify-between items-start mb-3">
                              <p className="font-medium">{ex.exercise_name}</p>
                              <Button variant="ghost" size="icon" onClick={() => removeSlotExercise(slot, i)}>
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-4 gap-2 mb-2">
                              <Input
                                type="number"
                                placeholder="סטים"
                                value={ex.sets_default}
                                onChange={(e) => updateSlotExercise(slot, i, 'sets_default', parseInt(e.target.value))}
                              />
                              <Input
                                type="number"
                                placeholder="חזרות"
                                value={ex.reps_default}
                                onChange={(e) => updateSlotExercise(slot, i, 'reps_default', parseInt(e.target.value))}
                              />
                              <Input
                                type="number"
                                placeholder="משקל"
                                value={ex.weight_default}
                                onChange={(e) => updateSlotExercise(slot, i, 'weight_default', parseFloat(e.target.value))}
                              />
                              <Input
                                type="number"
                                placeholder="מנוחה"
                                value={ex.rest_default_seconds}
                                onChange={(e) => updateSlotExercise(slot, i, 'rest_default_seconds', parseInt(e.target.value))}
                              />
                            </div>
                            <Input
                              placeholder="קישור וידאו (אופציונלי)"
                              value={ex.video_url_override}
                              onChange={(e) => updateSlotExercise(slot, i, 'video_url_override', e.target.value)}
                              className="mb-2"
                            />
                            <Textarea
                              placeholder="הערות"
                              value={ex.notes_default}
                              onChange={(e) => updateSlotExercise(slot, i, 'notes_default', e.target.value)}
                              rows={2}
                            />
                          </Card>
                        ))}
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>

                {selectedTrainees.length === 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-amber-800 font-medium">
                      ⚠️ חייב לבחור לפחות מתאמן אחד לפני שליחה
                    </p>
                  </div>
                )}

                <Button
                  className="w-full mt-4 bg-teal-600 hover:bg-teal-700 h-12"
                  onClick={() => sendProgramMutation.mutate()}
                  disabled={selectedTrainees.length === 0 || !programTitle || sendProgramMutation.isPending}
                >
                  <Send className="w-5 h-5 ml-2" />
                  {sendProgramMutation.isPending ? 'שולח...' : 'שלח תוכנית למתאמן'}
                </Button>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Exercise Picker Dialog - Enhanced */}
        <Dialog open={showExercisePicker} onOpenChange={setShowExercisePicker}>
          <DialogContent dir="rtl" className="max-w-3xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Dumbbell className="w-6 h-6" style={{ color: '#79DBD6' }} />
                בחר תרגיל מהמאגר
              </DialogTitle>
            </DialogHeader>
            
            {/* Search and Filter */}
            <div className="space-y-3 pb-4 border-b">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder="חפש תרגיל לפי שם..."
                  value={exerciseSearchQuery}
                  onChange={(e) => setExerciseSearchQuery(e.target.value)}
                  className="pr-10 h-12 text-base"
                />
              </div>
              
              <div className="flex gap-2 overflow-x-auto pb-2">
                <Badge 
                  variant={selectedMuscleFilter === 'all' ? 'default' : 'outline'}
                  className="cursor-pointer whitespace-nowrap"
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

            {/* Exercise List */}
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
                    className="p-4 hover:bg-slate-50 cursor-pointer transition-all border-2 hover:border-teal-300"
                    onClick={() => {
                      if (dailyExercises.length >= 0 && currentSlot === 'A') {
                        addExerciseToDaily(exercise);
                      } else {
                        addExerciseToSlot(exercise);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-bold text-slate-800 text-lg">{exercise.name_he}</p>
                        <div className="flex gap-2 mt-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {exercise.muscle_group_primary}
                          </Badge>
                          {exercise.video_url && (
                            <Badge variant="outline" className="text-xs flex items-center gap-1">
                              <Video className="w-3 h-3" />
                              יש וידאו
                            </Badge>
                          )}
                          {exercise.equipment && exercise.equipment.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {exercise.equipment[0]}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button size="sm" className="mr-3 bg-teal-600 hover:bg-teal-700 text-white">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              
              {exerciseBank.filter(ex => {
                const matchesSearch = !exerciseSearchQuery || 
                  ex.name_he.toLowerCase().includes(exerciseSearchQuery.toLowerCase());
                const matchesMuscle = selectedMuscleFilter === 'all' || 
                  ex.muscle_group_primary === selectedMuscleFilter;
                return matchesSearch && matchesMuscle;
              }).length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>לא נמצאו תרגילים</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Debug Dialog */}
        <Dialog open={showDebug} onOpenChange={setShowDebug}>
          <DialogContent dir="rtl" className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>🔍 QA & Debug - אימון אונליין</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Today's Stats */}
              <Card className="p-3 bg-teal-50 border-teal-200">
                <h3 className="font-bold text-sm mb-2">📊 סטטיסטיקות היום:</h3>
                <p className="text-xs"><strong>אימונים שנשלחו היום:</strong> {debugData?.todayCount || 0}</p>
                {debugData?.lastSent && (
                  <div className="mt-2 pt-2 border-t border-teal-200">
                    <p className="text-xs font-medium mb-1">שליחה אחרונה:</p>
                    <p className="text-xs">Trainee ID: {debugData.lastSent.trainee_id || '⚠️ חסר'}</p>
                    <p className="text-xs">Status: {debugData.lastSent.status}</p>
                  </div>
                )}
              </Card>

              <div>
                <h3 className="font-bold mb-2">שיוכים פעילים:</h3>
                {debugData?.assignments?.length === 0 && (
                  <p className="text-sm text-slate-500">אין שיוכים</p>
                )}
                {debugData?.assignments?.map(a => (
                  <Card key={a.id} className="p-3 mb-2 bg-slate-50">
                    <p><strong>Assignment ID:</strong> {a.id}</p>
                    <p><strong>Trainee ID:</strong> {a.trainee_id || '⚠️ חסר'}</p>
                    <p><strong>מצב:</strong> {a.mode} - {a.status}</p>
                    {a.mode === 'DAILY' && (
                      <>
                        <p><strong>תאריך אימון:</strong> {a.workout?.workout_date || '⚠️ אין workout'}</p>
                        <p><strong>כמות תרגילים:</strong> {a.itemsCount || 0}</p>
                        {a.itemsCount === 0 && (
                          <p className="text-red-600 font-bold mt-1">⚠️ נשלח ללא תרגילים!</p>
                        )}
                      </>
                    )}
                    {a.mode === 'ROTATION' && (
                      <p><strong>אימון הבא:</strong> {a.next_slot || 'N/A'}</p>
                    )}
                    <p><strong>אימון אחרון:</strong> {a.last_completed_at ? new Date(a.last_completed_at).toLocaleString('he-IL') : 'אין'}</p>
                  </Card>
                ))}
              </div>
              <div>
                <h3 className="font-bold mb-2">היסטוריית אימונים (אחרונים):</h3>
                <p className="text-sm text-slate-600">סה"כ {debugData?.history?.length || 0} רשומות</p>
                {debugData?.history?.slice(0, 5).map(h => (
                  <Card key={h.id} className="p-2 mb-1 bg-slate-50 text-xs">
                    <p>{h.exercise_name} - {h.sets}×{h.reps} @ {h.weight}kg - {new Date(h.date).toLocaleDateString('he-IL')}</p>
                  </Card>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <AddTraineeQuickDialog
          open={showAddTrainee}
          onOpenChange={(open) => {
            setShowAddTrainee(open);
            if (!open) {
              // Auto-select newly created trainee
              queryClient.invalidateQueries({ queryKey: ['coachTrainees'] }).then(() => {
                // Give time for query to refresh
                setTimeout(() => {
                  const newTrainee = trainees[trainees.length - 1];
                  if (newTrainee && !selectedTrainee) {
                    setSelectedTrainees(prev => [...prev, newTrainee.user_email]);
                    toast.success('מתאמן נבחר אוטומטית');
                  }
                }, 500);
              });
            }
          }}
          coachEmail={user?.email}
        />
      </div>
    </div>
  );
}