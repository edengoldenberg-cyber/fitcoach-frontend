import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit2, Copy, Trash2, Send, Users, Clock, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import DailyWorkoutExerciseCard from '../components/coach/DailyWorkoutExerciseCard';
import { WorkoutListSkeleton } from '../components/shared/LoadingSkeleton';

export default function CoachGroupWorkouts() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState('');
  const [selectedMuscleFilter, setSelectedMuscleFilter] = useState('all');
  
  // Form state
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionDescription, setSessionDescription] = useState('');
  const [sessionStartTime, setSessionStartTime] = useState('');
  const [sessionEndTime, setSessionEndTime] = useState('');
  const [sessionGroupTag, setSessionGroupTag] = useState('');
  const [sessionExercises, setSessionExercises] = useState([]);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['groupSessions', user?.email, selectedDate],
    queryFn: () => base44.entities.GroupWorkoutSession.filter({
      coach_email: user?.email,
      date: selectedDate
    }),
    enabled: !!user?.email,
  });

  const { data: exerciseBank = [] } = useQuery({
    queryKey: ['exerciseBank'],
    queryFn: () => base44.entities.Exercise.filter({ status: 'active' }),
  });

  const createSessionMutation = useMutation({
    mutationFn: async (data) => {
      const session = await base44.entities.GroupWorkoutSession.create({
        coach_email: user.email,
        date: selectedDate,
        title: data.title,
        description: data.description,
        start_time: data.start_time,
        end_time: data.end_time,
        group_tag: data.group_tag,
        status: 'draft'
      });

      // Create exercises
      for (let i = 0; i < data.exercises.length; i++) {
        const ex = data.exercises[i];
        await base44.entities.GroupWorkoutSessionExercise.create({
          session_id: session.id,
          exercise_id: ex.exercise_id,
          exercise_name: ex.exercise_name,
          order_index: i,
          sets: ex.sets || 3,
          reps: ex.reps || '8-12',
          weight_kg: ex.weight || 0,
          rest_seconds: ex.rest_seconds || 60,
          video_url: ex.video_url || '',
          notes: ex.notes || ''
        });
      }

      return session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groupSessions'] });
      resetForm();
      setShowCreateDialog(false);
      setShowEditDialog(false);
      toast.success('אימון נוצר בהצלחה');
    },
  });

  const updateSessionMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.GroupWorkoutSession.update(data.id, {
        title: data.title,
        description: data.description,
        start_time: data.start_time,
        end_time: data.end_time,
        group_tag: data.group_tag
      });

      // Delete old exercises
      const oldExercises = await base44.entities.GroupWorkoutSessionExercise.filter({
        session_id: data.id
      });
      for (const ex of oldExercises) {
        await base44.entities.GroupWorkoutSessionExercise.delete(ex.id);
      }

      // Create new exercises
      for (let i = 0; i < data.exercises.length; i++) {
        const ex = data.exercises[i];
        await base44.entities.GroupWorkoutSessionExercise.create({
          session_id: data.id,
          exercise_id: ex.exercise_id,
          exercise_name: ex.exercise_name,
          order_index: i,
          sets: ex.sets || 3,
          reps: ex.reps || '8-12',
          weight_kg: ex.weight || 0,
          rest_seconds: ex.rest_seconds || 60,
          video_url: ex.video_url || '',
          notes: ex.notes || ''
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groupSessions'] });
      resetForm();
      setShowEditDialog(false);
      toast.success('אימון עודכן');
    },
  });

  const publishSessionMutation = useMutation({
    mutationFn: async (sessionId) => {
      await base44.entities.GroupWorkoutSession.update(sessionId, {
        status: 'published',
        published_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groupSessions'] });
      toast.success('אימון פורסם ✅');
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId) => {
      // Delete exercises first
      const exercises = await base44.entities.GroupWorkoutSessionExercise.filter({ session_id: sessionId });
      for (const ex of exercises) {
        await base44.entities.GroupWorkoutSessionExercise.delete(ex.id);
      }
      await base44.entities.GroupWorkoutSession.delete(sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groupSessions'] });
      toast.success('אימון נמחק');
    },
  });

  const duplicateSessionMutation = useMutation({
    mutationFn: async (session) => {
      const exercises = await base44.entities.GroupWorkoutSessionExercise.filter({
        session_id: session.id
      });

      const newSession = await base44.entities.GroupWorkoutSession.create({
        coach_email: user.email,
        date: selectedDate,
        title: session.title + ' (עותק)',
        description: session.description,
        start_time: session.start_time,
        end_time: session.end_time,
        group_tag: session.group_tag,
        status: 'draft'
      });

      for (const ex of exercises) {
        await base44.entities.GroupWorkoutSessionExercise.create({
          session_id: newSession.id,
          exercise_id: ex.exercise_id,
          exercise_name: ex.exercise_name,
          order_index: ex.order_index,
          sets: ex.sets,
          reps: ex.reps,
          weight_kg: ex.weight_kg,
          rest_seconds: ex.rest_seconds,
          video_url: ex.video_url,
          notes: ex.notes
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groupSessions'] });
      toast.success('אימון שוכפל');
    },
  });

  const resetForm = () => {
    setSessionTitle('');
    setSessionDescription('');
    setSessionStartTime('');
    setSessionEndTime('');
    setSessionGroupTag('');
    setSessionExercises([]);
    setEditingSession(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setShowCreateDialog(true);
  };

  const openEditDialog = async (session) => {
    setEditingSession(session);
    setSessionTitle(session.title);
    setSessionDescription(session.description || '');
    setSessionStartTime(session.start_time || '');
    setSessionEndTime(session.end_time || '');
    setSessionGroupTag(session.group_tag || '');

    // Load exercises
    const exercises = await base44.entities.GroupWorkoutSessionExercise.filter({
      session_id: session.id
    });
    setSessionExercises(exercises.sort((a, b) => a.order_index - b.order_index));
    setShowEditDialog(true);
  };

  const handleSave = () => {
    if (!sessionTitle.trim()) {
      toast.error('יש להזין כותרת לאימון');
      return;
    }
    if (sessionExercises.length === 0) {
      toast.error('יש להוסיף לפחות תרגיל אחד');
      return;
    }

    const data = {
      id: editingSession?.id,
      title: sessionTitle,
      description: sessionDescription,
      start_time: sessionStartTime,
      end_time: sessionEndTime,
      group_tag: sessionGroupTag,
      exercises: sessionExercises
    };

    if (editingSession) {
      updateSessionMutation.mutate(data);
    } else {
      createSessionMutation.mutate(data);
    }
  };

  const addExerciseToSession = (exercise) => {
    setSessionExercises([...sessionExercises, {
      exercise_id: exercise.id,
      exercise_name: exercise.name_he,
      muscle_group: exercise.muscle_group_primary,
      sets: 3,
      reps: '8-12',
      weight: 0,
      rest_seconds: 60,
      video_url: exercise.video_url || '',
      notes: '',
      order_index: sessionExercises.length
    }]);
    setShowExercisePicker(false);
    setExerciseSearchQuery('');
    toast.success(`נוסף: ${exercise.name_he}`);
  };

  const updateSessionExercise = (index, field, value) => {
    const updated = [...sessionExercises];
    updated[index][field] = value;
    setSessionExercises(updated);
  };

  const removeSessionExercise = (index) => {
    setSessionExercises(sessionExercises.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20" dir="rtl">
        <div className="max-w-4xl mx-auto p-6">
          <WorkoutListSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="title-large mb-2">אימוני סטודיו</h1>
          <p className="body-text text-slate-600">ניהול אימונים קבוצתיים</p>
        </div>

        {/* Date Selector + Create Button */}
        <Card className="card-premium mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="small-text font-semibold block mb-2">בחר תאריך</label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="input-premium"
              />
            </div>
            <div className="pt-6">
              <Button
                onClick={openCreateDialog}
                className="btn-primary h-14 px-6"
              >
                <Plus className="w-5 h-5 ml-2" />
                צור אימון חדש
              </Button>
            </div>
          </div>
        </Card>

        {/* Sessions List */}
        {sessions.length === 0 ? (
          <Card className="card-premium border-2 border-dashed border-slate-300">
            <div className="empty-state">
              <Users className="empty-state-icon" />
              <h3 className="empty-state-title">אין אימונים מתוזמנים</h3>
              <p className="empty-state-description">לחץ על "צור אימון חדש" כדי להתחיל</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {sessions
              .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
              .map(session => (
                <Card key={session.id} className="card-premium">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="title-medium">{session.title}</h3>
                        <Badge variant={session.status === 'published' ? 'default' : 'outline'}>
                          {session.status === 'published' ? '✓ פורסם' : 'טיוטה'}
                        </Badge>
                        {session.group_tag && (
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                            {session.group_tag}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 small-text text-slate-600">
                        {session.start_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {session.start_time}
                            {session.end_time && ` - ${session.end_time}`}
                          </span>
                        )}
                      </div>
                      {session.description && (
                        <p className="small-text text-slate-600 mt-2">{session.description}</p>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEditDialog(session)}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => duplicateSessionMutation.mutate(session)}
                        className="text-green-600 hover:text-green-700"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      {session.status === 'draft' && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteSessionMutation.mutate(session.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {session.status === 'draft' && (
                    <Button
                      onClick={() => publishSessionMutation.mutate(session.id)}
                      className="btn-success w-full"
                      disabled={publishSessionMutation.isPending}
                    >
                      <Send className="w-5 h-5 ml-2" />
                      פרסם אימון
                    </Button>
                  )}
                </Card>
              ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog 
          open={showCreateDialog || showEditDialog} 
          onOpenChange={(open) => {
            if (!open) {
              setShowCreateDialog(false);
              setShowEditDialog(false);
              resetForm();
            }
          }}
        >
          <DialogContent dir="rtl" className="max-w-4xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-4 border-b">
              <DialogTitle className="title-medium">
                {editingSession ? 'עריכת אימון' : 'אימון חדש'}
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="small-text font-semibold block mb-2">
                    כותרת האימון <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="למשל: בוקר, כוח עליון"
                    value={sessionTitle}
                    onChange={(e) => setSessionTitle(e.target.value)}
                    className="input-premium"
                  />
                </div>
                <div>
                  <label className="small-text font-semibold block mb-2">תג קבוצה</label>
                  <Input
                    placeholder="למשל: קבוצה A, מתחילים"
                    value={sessionGroupTag}
                    onChange={(e) => setSessionGroupTag(e.target.value)}
                    className="input-premium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="small-text font-semibold block mb-2">שעת התחלה</label>
                  <Input
                    type="time"
                    value={sessionStartTime}
                    onChange={(e) => setSessionStartTime(e.target.value)}
                    className="input-premium"
                  />
                </div>
                <div>
                  <label className="small-text font-semibold block mb-2">שעת סיום</label>
                  <Input
                    type="time"
                    value={sessionEndTime}
                    onChange={(e) => setSessionEndTime(e.target.value)}
                    className="input-premium"
                  />
                </div>
              </div>

              <div>
                <label className="small-text font-semibold block mb-2">תיאור</label>
                <Textarea
                  placeholder="הערות כלליות לאימון..."
                  value={sessionDescription}
                  onChange={(e) => setSessionDescription(e.target.value)}
                  rows={3}
                  className="rounded-xl border-2 border-slate-200 focus:border-teal-400 p-3"
                />
              </div>

              {/* Add Exercise Button */}
              <Button
                onClick={() => setShowExercisePicker(true)}
                className="btn-primary w-full h-14"
              >
                <Plus className="w-5 h-5 ml-2" />
                הוסף תרגיל
              </Button>

              {/* Exercises List */}
              {sessionExercises.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p>טרם נוספו תרגילים</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sessionExercises.map((ex, i) => (
                    <DailyWorkoutExerciseCard
                      key={i}
                      exercise={ex}
                      index={i}
                      onUpdate={updateSessionExercise}
                      onRemove={removeSessionExercise}
                      onCopyFromLast={() => {}}
                      canCopyFromLast={false}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t bg-white sticky bottom-0">
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateDialog(false);
                    setShowEditDialog(false);
                    resetForm();
                  }}
                  className="btn-secondary flex-1"
                >
                  ביטול
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={createSessionMutation.isPending || updateSessionMutation.isPending}
                  className="btn-success flex-1"
                >
                  {editingSession ? 'עדכן' : 'שמור'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Exercise Picker Dialog */}
        <Dialog open={showExercisePicker} onOpenChange={setShowExercisePicker}>
          <DialogContent dir="rtl" className="max-w-3xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Users className="w-6 h-6" style={{ color: '#79DBD6' }} />
                בחר תרגיל מהמאגר
              </DialogTitle>
            </DialogHeader>

            {/* Search */}
            <div className="space-y-3 pb-4 border-b">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder="חפש תרגיל..."
                  value={exerciseSearchQuery}
                  onChange={(e) => setExerciseSearchQuery(e.target.value)}
                  className="pr-10 input-premium"
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
            <div className="flex-1 overflow-y-auto space-y-2">
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
                    onClick={() => addExerciseToSession(exercise)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-bold text-slate-800 text-lg">{exercise.name_he}</p>
                        <div className="flex gap-2 mt-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {exercise.muscle_group_primary}
                          </Badge>
                          {exercise.video_url && (
                            <Badge variant="outline" className="text-xs">
                              יש וידאו
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
      </div>
    </div>
  );
}