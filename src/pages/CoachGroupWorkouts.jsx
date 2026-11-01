import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Plus, Edit2, Copy, Trash2, Send, Clock, Search,
  Archive, ArchiveRestore, EyeOff, Calendar, Dumbbell,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import DailyWorkoutExerciseCard from '../components/coach/DailyWorkoutExerciseCard';
import { WorkoutListSkeleton } from '../components/shared/LoadingSkeleton';

const STATUS_LABELS = {
  draft:     { label: 'טיוטה',   color: 'bg-amber-100 text-amber-800 border-amber-200' },
  published: { label: 'פורסם',   color: 'bg-green-100 text-green-800 border-green-200' },
  archived:  { label: 'בארכיון', color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const STATUS_FILTERS = [
  { key: 'all',       label: 'הכל' },
  { key: 'draft',     label: 'טיוטות' },
  { key: 'published', label: 'פורסמו' },
  { key: 'archived',  label: 'ארכיון' },
];

export default function CoachGroupWorkouts() {
  const queryClient = useQueryClient();

  // ── List filters ──
  const [searchTerm, setSearchTerm]           = useState('');
  const [statusFilter, setStatusFilter]       = useState('all');

  // ── Dialog state ──
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog]     = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [editingSession, setEditingSession]     = useState(null);
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState('');
  const [selectedMuscleFilter, setSelectedMuscleFilter] = useState('all');

  // ── Form state ──
  const [sessionTitle, setSessionTitle]         = useState('');
  const [sessionDescription, setSessionDescription] = useState('');
  const [sessionDate, setSessionDate]           = useState(new Date().toISOString().split('T')[0]);
  const [sessionStartTime, setSessionStartTime] = useState('');
  const [sessionEndTime, setSessionEndTime]     = useState('');
  const [sessionGroupTag, setSessionGroupTag]   = useState('');
  const [sessionExercises, setSessionExercises] = useState([]);

  // ── Data ──
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['groupSessions', user?.email],
    queryFn: () => base44.entities.GroupWorkoutSession.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: exerciseBank = [] } = useQuery({
    queryKey: ['exerciseBank'],
    queryFn: () => base44.entities.Exercise.filter({ status: 'active' }),
  });

  // ── Filtered & sorted sessions ──
  const filteredSessions = sessions
    .filter(s => {
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
      const matchesSearch = !searchTerm.trim() ||
        (s.title || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // ── Mutations ──
  const createSessionMutation = useMutation({
    mutationFn: async (data) => {
      const session = await base44.entities.GroupWorkoutSession.create({
        coach_email: user.email,
        date: data.date,
        title: data.title,
        description: data.description,
        start_time: data.start_time,
        end_time: data.end_time,
        group_tag: data.group_tag,
        status: 'draft',
      });
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
          notes: ex.notes || '',
        });
      }
      return session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groupSessions'] });
      resetForm();
      setShowCreateDialog(false);
      toast.success('אימון נוצר בהצלחה');
    },
    onError: (err) => {
      toast.error(`שגיאה ביצירת אימון: ${err.message}`);
    },
  });

  const updateSessionMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.GroupWorkoutSession.update(data.id, {
        title: data.title,
        description: data.description,
        date: data.date,
        start_time: data.start_time,
        end_time: data.end_time,
        group_tag: data.group_tag,
      });
      const oldExercises = await base44.entities.GroupWorkoutSessionExercise.filter({ session_id: data.id });
      for (const ex of oldExercises) {
        await base44.entities.GroupWorkoutSessionExercise.delete(ex.id);
      }
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
          notes: ex.notes || '',
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groupSessions'] });
      resetForm();
      setShowEditDialog(false);
      toast.success('אימון עודכן');
    },
    onError: (err) => {
      toast.error(`שגיאה בעדכון אימון: ${err.message}`);
    },
  });

  const changeStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      await base44.entities.GroupWorkoutSession.update(id, { status });
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['groupSessions'] });
      const msg = status === 'published' ? 'אימון פורסם ✅' :
                  status === 'draft'     ? 'פרסום בוטל' :
                  status === 'archived'  ? 'אימון הועבר לארכיון' : 'עודכן';
      toast.success(msg);
    },
    onError: (err) => {
      toast.error(`שגיאה: ${err.message}`);
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId) => {
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
    onError: (err) => {
      toast.error(`שגיאה במחיקה: ${err.message}`);
    },
  });

  const duplicateSessionMutation = useMutation({
    mutationFn: async (session) => {
      const exercises = await base44.entities.GroupWorkoutSessionExercise.filter({ session_id: session.id });
      const newSession = await base44.entities.GroupWorkoutSession.create({
        coach_email: user.email,
        date: session.date || new Date().toISOString().split('T')[0],
        title: session.title + ' (עותק)',
        description: session.description,
        start_time: session.start_time,
        end_time: session.end_time,
        group_tag: session.group_tag,
        status: 'draft',
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
          notes: ex.notes,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groupSessions'] });
      toast.success('אימון שוכפל');
    },
    onError: (err) => {
      toast.error(`שגיאה בשכפול: ${err.message}`);
    },
  });

  // ── Form helpers ──
  const resetForm = () => {
    setSessionTitle('');
    setSessionDescription('');
    setSessionDate(new Date().toISOString().split('T')[0]);
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
    setSessionTitle(session.title || '');
    setSessionDescription(session.description || '');
    setSessionDate(session.date || new Date().toISOString().split('T')[0]);
    setSessionStartTime(session.start_time || '');
    setSessionEndTime(session.end_time || '');
    setSessionGroupTag(session.group_tag || '');
    // Load exercises — prefer embedded (from buildInclude), fall back to fetch
    const exs = Array.isArray(session.exercises) && session.exercises.length > 0
      ? session.exercises
      : await base44.entities.GroupWorkoutSessionExercise.filter({ session_id: session.id });
    setSessionExercises(exs.sort((a, b) => (a.order_index || 0) - (b.order_index || 0)));
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
      date: sessionDate,
      start_time: sessionStartTime,
      end_time: sessionEndTime,
      group_tag: sessionGroupTag,
      exercises: sessionExercises,
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
      exercise_name: exercise.name_he || exercise.name,
      muscle_group: exercise.muscle_group || exercise.muscle_group_primary,
      sets: 3,
      reps: '8-12',
      weight: 0,
      rest_seconds: 60,
      video_url: exercise.video_url || '',
      notes: '',
      order_index: sessionExercises.length,
    }]);
    setShowExercisePicker(false);
    setExerciseSearchQuery('');
    toast.success(`נוסף: ${exercise.name_he || exercise.name}`);
  };

  const updateSessionExercise = (index, field, value) => {
    const updated = [...sessionExercises];
    updated[index] = { ...updated[index], [field]: value };
    setSessionExercises(updated);
  };

  const removeSessionExercise = (index) => {
    setSessionExercises(sessionExercises.filter((_, i) => i !== index));
  };

  const handleDelete = (session) => {
    if (!window.confirm(`למחוק את האימון "${session.title}"? פעולה זו אינה ניתנת לביטול.`)) return;
    deleteSessionMutation.mutate(session.id);
  };

  // ── Workout index (sequential number across all sessions by creation date) ──
  const allByDate = [...sessions].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const workoutNumberMap = Object.fromEntries(allByDate.map((s, i) => [s.id, i + 1]));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20" dir="rtl">
        <div className="max-w-4xl mx-auto p-6"><WorkoutListSkeleton /></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto p-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">אימוני סטודיו</h1>
            <p className="text-sm text-slate-500 mt-1">
              {sessions.length > 0 ? `${sessions.length} אימונים בסך הכל` : 'לא נוצרו אימונים עדיין'}
            </p>
          </div>
          <Button onClick={openCreateDialog} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="w-4 h-4 ml-2" />
            אימון חדש
          </Button>
        </div>

        {/* ── Search + Status filter ── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="חיפוש לפי שם..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>
          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  statusFilter === f.key
                    ? 'bg-orange-500 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Workout list ── */}
        {filteredSessions.length === 0 ? (
          <Card className="border-2 border-dashed border-slate-200 p-12 text-center">
            <Dumbbell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              {sessions.length === 0 ? 'לא נוצרו אימונים עדיין' : 'אין אימונים התואמים את הסינון'}
            </p>
            {sessions.length === 0 && (
              <Button onClick={openCreateDialog} variant="outline" className="mt-4">
                <Plus className="w-4 h-4 ml-2" /> צור אימון ראשון
              </Button>
            )}
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((session) => {
              const num = workoutNumberMap[session.id] || '—';
              const exCount = Array.isArray(session.exercises) ? session.exercises.length : 0;
              const st = STATUS_LABELS[session.status] || STATUS_LABELS.draft;
              const createdDate = session.created_at
                ? format(new Date(session.created_at), 'dd/MM/yyyy')
                : '—';

              return (
                <Card key={session.id} className="bg-white border border-slate-200 hover:shadow-md transition-shadow p-4">
                  <div className="flex items-start gap-3">
                    {/* Workout number */}
                    <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-700 font-bold text-sm flex items-center justify-center shrink-0 mt-0.5">
                      {num}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-800 text-base">{session.title || 'ללא שם'}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${st.color}`}>
                          {st.label}
                        </span>
                        {session.group_tag && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                            {session.group_tag}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500 flex-wrap">
                        {session.date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {session.date}
                          </span>
                        )}
                        {session.start_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {session.start_time}{session.end_time ? ` – ${session.end_time}` : ''}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Dumbbell className="w-3 h-3" />
                          {exCount} תרגילים
                        </span>
                        <span>נוצר: {createdDate}</span>
                      </div>

                      {session.description && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-1">{session.description}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Publish / Unpublish */}
                      {session.status === 'draft' && (
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white text-xs h-8 px-2"
                          onClick={() => changeStatusMutation.mutate({ id: session.id, status: 'published' })}
                          disabled={changeStatusMutation.isPending}
                          title="פרסם"
                        >
                          <Send className="w-3.5 h-3.5 ml-1" />
                          פרסם
                        </Button>
                      )}
                      {session.status === 'published' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-amber-600 border-amber-300 hover:bg-amber-50 text-xs h-8 px-2"
                          onClick={() => changeStatusMutation.mutate({ id: session.id, status: 'draft' })}
                          disabled={changeStatusMutation.isPending}
                          title="בטל פרסום"
                        >
                          <EyeOff className="w-3.5 h-3.5 ml-1" />
                          בטל
                        </Button>
                      )}

                      {/* Edit */}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEditDialog(session)}
                        className="w-8 h-8 text-blue-600 hover:bg-blue-50"
                        title="ערוך"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>

                      {/* Duplicate */}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => duplicateSessionMutation.mutate(session)}
                        className="w-8 h-8 text-slate-600 hover:bg-slate-100"
                        title="שכפל"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>

                      {/* Archive / Unarchive */}
                      {session.status !== 'archived' ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => changeStatusMutation.mutate({ id: session.id, status: 'archived' })}
                          className="w-8 h-8 text-slate-500 hover:bg-slate-100"
                          title="העבר לארכיון"
                        >
                          <Archive className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => changeStatusMutation.mutate({ id: session.id, status: 'draft' })}
                          className="w-8 h-8 text-blue-500 hover:bg-blue-50"
                          title="שחזר מארכיון"
                        >
                          <ArchiveRestore className="w-4 h-4" />
                        </Button>
                      )}

                      {/* Delete */}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(session)}
                        className="w-8 h-8 text-red-500 hover:bg-red-50"
                        title="מחק"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create / Edit Dialog ── */}
      <Dialog
        open={showCreateDialog || showEditDialog}
        onOpenChange={(open) => {
          if (!open) { setShowCreateDialog(false); setShowEditDialog(false); resetForm(); }
        }}
      >
        <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle>{editingSession ? 'עריכת אימון' : 'אימון חדש'}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Title */}
            <div>
              <label className="text-sm font-semibold block mb-1.5">
                כותרת האימון <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="למשל: כוח גוף מלא"
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
              />
            </div>

            {/* Date + Group tag */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-semibold block mb-1.5">תאריך</label>
                <Input
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-semibold block mb-1.5">תג קבוצה</label>
                <Input
                  placeholder="מתחילים, מתקדמים..."
                  value={sessionGroupTag}
                  onChange={(e) => setSessionGroupTag(e.target.value)}
                />
              </div>
            </div>

            {/* Times */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-semibold block mb-1.5">שעת התחלה</label>
                <Input
                  type="time"
                  value={sessionStartTime}
                  onChange={(e) => setSessionStartTime(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-semibold block mb-1.5">שעת סיום</label>
                <Input
                  type="time"
                  value={sessionEndTime}
                  onChange={(e) => setSessionEndTime(e.target.value)}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-semibold block mb-1.5">תיאור</label>
              <Textarea
                placeholder="הערות כלליות..."
                value={sessionDescription}
                onChange={(e) => setSessionDescription(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>

            {/* Exercises */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold">
                  תרגילים ({sessionExercises.length})
                  {sessionExercises.length === 0 && (
                    <span className="text-red-500 mr-1">*</span>
                  )}
                </label>
                <Button size="sm" onClick={() => setShowExercisePicker(true)} className="bg-orange-500 hover:bg-orange-600 text-white">
                  <Plus className="w-3.5 h-3.5 ml-1" />
                  הוסף תרגיל
                </Button>
              </div>

              {sessionExercises.length === 0 ? (
                <div
                  onClick={() => setShowExercisePicker(true)}
                  className="border-2 border-dashed border-slate-200 rounded-xl py-8 text-center text-slate-400 cursor-pointer hover:border-orange-300 hover:text-orange-500 transition-colors"
                >
                  <Dumbbell className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">לחץ להוספת תרגיל ראשון</p>
                </div>
              ) : (
                <div className="space-y-3">
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
          </div>

          <div className="p-4 border-t bg-white flex gap-2">
            <Button
              variant="outline"
              onClick={() => { setShowCreateDialog(false); setShowEditDialog(false); resetForm(); }}
              className="flex-1"
            >
              ביטול
            </Button>
            <Button
              onClick={handleSave}
              disabled={createSessionMutation.isPending || updateSessionMutation.isPending}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
            >
              {createSessionMutation.isPending || updateSessionMutation.isPending ? 'שומר...' :
               editingSession ? 'עדכן אימון' : 'שמור אימון'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Exercise Picker Dialog ── */}
      <Dialog open={showExercisePicker} onOpenChange={setShowExercisePicker}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>בחר תרגיל</DialogTitle>
          </DialogHeader>

          <div className="relative mb-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="חיפוש תרגיל..."
              value={exerciseSearchQuery}
              onChange={(e) => setExerciseSearchQuery(e.target.value)}
              className="pr-10"
              autoFocus
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2">
            {['הכל', 'חזה', 'גב', 'כתפיים', 'ידיים', 'רגליים', 'ישבן', 'ליבה'].map(muscle => (
              <button
                key={muscle}
                onClick={() => setSelectedMuscleFilter(muscle === 'הכל' ? 'all' : muscle)}
                className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${
                  (muscle === 'הכל' ? 'all' : muscle) === selectedMuscleFilter
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {muscle}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto divide-y border rounded-lg">
            {exerciseBank
              .filter(ex => {
                const matchesSearch = !exerciseSearchQuery ||
                  (ex.name_he || ex.name || '').toLowerCase().includes(exerciseSearchQuery.toLowerCase());
                const matchesMuscle = selectedMuscleFilter === 'all' ||
                  (ex.muscle_group || ex.muscle_group_primary) === selectedMuscleFilter;
                return matchesSearch && matchesMuscle;
              })
              .slice(0, 40)
              .map(exercise => (
                <button
                  key={exercise.id}
                  onClick={() => addExerciseToSession(exercise)}
                  className="w-full text-right p-3 hover:bg-orange-50 transition-colors flex items-center justify-between gap-2"
                >
                  <div>
                    <p className="font-medium text-sm text-slate-800">{exercise.name_he || exercise.name}</p>
                    {(exercise.muscle_group || exercise.muscle_group_primary) && (
                      <p className="text-xs text-slate-400">{exercise.muscle_group || exercise.muscle_group_primary}</p>
                    )}
                  </div>
                  <Plus className="w-4 h-4 text-orange-500 shrink-0" />
                </button>
              ))}
            {exerciseBank.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">לא נמצאו תרגילים במאגר</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
