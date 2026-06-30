import React, { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Users,
  Plus,
  Send,
  Copy,
  Upload,
  Check,
  Link2,
  BookOpen,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Dumbbell,
} from 'lucide-react';
import { addLog } from '@/components/shared/diagnostics/logger';
import AddExerciseToBank from '../components/coach/AddExerciseToBank';
import ImportExercisesCSV from '../components/coach/ImportExercisesCSV';
import MergeDuplicatesDialog from '../components/coach/MergeDuplicatesDialog';
import CopyWorkoutDialog from '../components/coach/CopyWorkoutDialog';
import DailyWorkoutTemplateEditor from '../components/coach/DailyWorkoutTemplateEditor';
import { nextGroupLetter } from '../components/coach/SupersetManager';
import ExerciseSelector from '../components/workout/ExerciseSelector';
import WorkoutExerciseCard from '../components/workout/WorkoutExerciseCard';
import { format } from 'date-fns';
import { he } from 'date-fns/locale/he';
import { toast } from 'sonner';

export default function CoachDailyWorkout() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [exercises, setExercises] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [showAddToBank, setShowAddToBank] = useState(false);
  const [showImportCSV, setShowImportCSV] = useState(false);
  const [showMergeDuplicates, setShowMergeDuplicates] = useState(false);
  const [showCopyWorkout, setShowCopyWorkout] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [lastPublishTime, setLastPublishTime] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: exerciseLibrary = [], isLoading: libraryLoading } = useQuery({
    queryKey: ['allExercises'],
    queryFn: async () => {
      try {
        addLog('LOAD_EXERCISE_BANK_START', {}, 'info');
        const exs = await base44.entities.Exercise.filter({ status: 'active' }, '-created_date', 500);
        addLog('LOAD_EXERCISE_BANK_COUNT', { count: exs.length }, 'info');
        return exs;
      } catch (err) {
        addLog('EXERCISE_BANK_LOAD_ERROR', { error: err.message }, 'error');
        console.error('Failed to load exercise library:', err);
        return [];
      }
    },
  });

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const DRAFT_KEY = user?.email ? `fitcoach_workout_draft_${user.email}_${todayStr}` : null;

  // Today's templates
  const { data: todayTemplates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ['dailyWorkoutTemplates', user?.email, todayStr],
    queryFn: () =>
      base44.entities.DailyWorkoutTemplate.filter(
        { coach_email: user?.email, date: todayStr },
        '-created_date',
        50
      ),
    enabled: !!user?.email,
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id) => base44.entities.DailyWorkoutTemplate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyWorkoutTemplates'] });
      toast.success('האימון נמחק');
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async ({ id, current }) => {
      await base44.entities.DailyWorkoutTemplate.update(id, {
        is_published: !current,
        ...(!current ? { published_at: new Date().toISOString() } : {}),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dailyWorkoutTemplates'] }),
  });

  const { data: todayWorkout, refetch: refetchTodayWorkout } = useQuery({
    queryKey: ['todayDailyWorkout', user?.email, todayStr],
    queryFn: async () => {
      const workouts = await base44.entities.DailyWorkout.filter({
        coach_email: user?.email,
        date: todayStr,
      });
      return workouts[0];
    },
    enabled: !!user?.email,
  });

  const { data: yesterdayWorkout } = useQuery({
    queryKey: ['yesterdayDailyWorkout', user?.email],
    queryFn: async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
      const workouts = await base44.entities.DailyWorkout.filter({
        coach_email: user?.email,
        date: yesterdayStr,
      });
      return workouts[0];
    },
    enabled: !!user?.email,
  });

  // Load today's workout from server
  useEffect(() => {
    if (!todayWorkout) return;
    setTitle(todayWorkout.title_he || '');
    setDescription(todayWorkout.description_he || '');
    if (todayWorkout.exercises && Array.isArray(todayWorkout.exercises)) {
      setExercises(
        todayWorkout.exercises.map((ex) => ({
          exercise_name: ex.exercise_name,
          notes_he: ex.notes || '',
          default_sets_count: ex.sets || 4,
          set_type: ex.set_type || 'reps',
          target_reps_min: ex.reps_min || null,
          target_reps_max: ex.reps_max || null,
          target_time_seconds: ex.time_seconds || null,
          group_id: ex.group_id,
          group_type: ex.group_type,
          group_label: ex.group_label,
          group_order: ex.group_order,
          round_count: ex.round_count,
          rest_after_round_seconds: ex.rest_after_round_seconds,
          sets: null,
        }))
      );
    }
  }, [todayWorkout]);

  // Restore draft from localStorage (only if no server workout exists)
  useEffect(() => {
    if (todayWorkout || !DRAFT_KEY) return;
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      const age = Date.now() - draft.savedAt;
      if (age < 86400000) {
        setTitle(draft.title || '');
        setDescription(draft.description || '');
        setExercises(draft.exercises || []);
        toast.info('טיוטה שוחזרה');
      }
    } catch {}
  }, [todayWorkout, DRAFT_KEY]);

  // Autosave draft to localStorage
  useEffect(() => {
    if (!DRAFT_KEY || !isDirty) return;
    const timer = setTimeout(() => {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ title, description, exercises, savedAt: Date.now() })
      );
    }, 1500);
    return () => clearTimeout(timer);
  }, [exercises, title, description, isDirty, DRAFT_KEY]);

  // ─── Stable exercise mutation callbacks ───

  const updateExercise = useCallback((index, field, value) => {
    setExercises((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setIsDirty(true);
  }, []);

  const removeExercise = useCallback((index) => {
    setExercises((prev) => {
      const removed = prev[index];
      const remaining = prev.filter((_, i) => i !== index);
      if (
        removed?.group_id &&
        remaining.filter((ex) => ex.group_id === removed.group_id).length === 1
      ) {
        return remaining.map((ex) => {
          if (ex.group_id !== removed.group_id) return ex;
          const { group_id, group_type, group_label, group_order, round_count, rest_after_round_seconds, ...rest } = ex;
          return rest;
        });
      }
      return remaining;
    });
    setIsDirty(true);
  }, []);

  const duplicateExercise = useCallback((index) => {
    setExercises((prev) => {
      const { group_id, group_type, group_label, group_order, ...rest } = prev[index];
      const copy = { ...rest };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setIsDirty(true);
  }, []);

  const addExercise = useCallback((exerciseName, exerciseId = null, exerciseData = null) => {
    const newEx = {
      exercise_id: exerciseId,
      exercise_name: exerciseName,
      custom_name: exerciseId ? null : exerciseName,
      default_sets_count: exerciseData?.default_sets || 4,
      target_reps_min: exerciseData?.default_reps_min || null,
      target_reps_max: exerciseData?.default_reps_max || null,
      notes_he: exerciseData?.default_notes || '',
      set_type: 'reps',
    };
    setExercises((prev) => [...prev, newEx]);
    setIsDirty(true);
  }, []);

  const addSupersetBlock = useCallback(() => {
    setExercises((prev) => {
      const groupId = `grp_${Date.now().toString(36)}`;
      const letter = nextGroupLetter(prev);
      const base = {
        default_sets_count: 3,
        set_type: 'reps',
        target_reps_min: null,
        target_reps_max: null,
        target_time_seconds: null,
        notes_he: '',
        group_id: groupId,
        group_type: 'superset',
        group_label: letter,
        round_count: 3,
        rest_after_round_seconds: 60,
        sets: null,
      };
      toast.success(`נוסף סופר סט ${letter}`);
      return [
        ...prev,
        { ...base, exercise_name: 'תרגיל 1 בסופר סט', group_order: 1 },
        { ...base, exercise_name: 'תרגיל 2 בסופר סט', group_order: 2 },
      ];
    });
    setIsDirty(true);
  }, []);

  const handleDragEnd = useCallback((result) => {
    if (!result.destination) return;
    setExercises((prev) => {
      const items = Array.from(prev);
      const [reordered] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, reordered);
      return items;
    });
    setIsDirty(true);
  }, []);

  // ─── Publish mutation ───
  const publishMutation = useMutation({
    mutationFn: async () => {
      const now = Date.now();
      if (now - lastPublishTime < 1500) throw new Error('נא להמתין בין פרסומים');
      setLastPublishTime(now);

      if (!title.trim()) throw new Error('יש להזין כותרת לאימון');
      if (exercises.length === 0) throw new Error('יש להוסיף לפחות תרגיל אחד לאימון');

      const debugId = `PUB-${Date.now().toString(36).toUpperCase()}`;
      console.log('=== PUBLISH_DAILY_WORKOUT ===', debugId);

      let workoutId = todayWorkout?.id;

      const exercisesJson = exercises.map((ex) => ({
        exercise_name: ex.exercise_name,
        sets: ex.default_sets_count || 4,
        set_type: ex.set_type || 'reps',
        reps_min: ex.target_reps_min || null,
        reps_max: ex.target_reps_max || null,
        time_seconds: ex.target_time_seconds || null,
        notes: ex.notes_he || '',
        group_id: ex.group_id || null,
        group_type: ex.group_type || null,
        group_label: ex.group_label || null,
        group_order: ex.group_order || null,
        round_count: ex.round_count || null,
        rest_after_round_seconds: ex.rest_after_round_seconds || null,
      }));
      const exercisesStr = JSON.stringify(exercisesJson);

      if (!workoutId) {
        const newWorkout = await base44.entities.DailyWorkout.create({
          coach_email: user.email,
          date: todayStr,
          title_he: title,
          description_he: description || null,
          exercises: exercisesStr,
          status: 'draft',
        });
        workoutId = newWorkout.id;
      } else {
        await base44.entities.DailyWorkout.update(workoutId, {
          title_he: title,
          description_he: description || null,
          exercises: exercisesStr,
        });
      }

      if (!workoutId) throw new Error('מזהה אימון חסר - לא ניתן לפרסם');

      // Clean up any duplicate DailyWorkoutTemplate records for today that are NOT the main
      // workout (the DailyWorkout entity and DailyWorkoutTemplate share the same DB table;
      // a previous bug caused an extra template record to be created on every publish).
      try {
        const allTodayRecords = await base44.entities.DailyWorkoutTemplate.filter({
          coach_email: user.email,
          date: todayStr,
        });
        // Delete any records that are NOT the main workout ID
        for (const rec of allTodayRecords) {
          if (rec.id !== workoutId) {
            await base44.entities.DailyWorkoutTemplate.delete(rec.id).catch(() => {});
          }
        }
      } catch (cleanupErr) {
        console.error('Duplicate cleanup failed (non-fatal):', cleanupErr);
      }

      try {
        await base44.entities.DailyWorkout.update(workoutId, {
          status: 'published',
          published_at: new Date().toISOString(),
        });
      } catch (publishError) {
        throw new Error(
          `שגיאה בפרסום:\n\nStatus: ${publishError.status || 'Unknown'}\nError: ${publishError.message}\nWorkout ID: ${workoutId}\n\nמזהה תקלה: ${debugId}`
        );
      }

      try {
        await base44.functions.invoke('sendWorkoutNotifications', {
          workout_id: workoutId,
          coach_email: user.email,
          date: todayStr,
        });
      } catch (notifError) {
        console.error('Failed to send notifications:', notifError);
      }

      return workoutId;
    },
    onSuccess: () => {
      refetchTodayWorkout();
      refetchTemplates();
      queryClient.invalidateQueries({ queryKey: ['todayDailyWorkout'] });
      queryClient.invalidateQueries({ queryKey: ['dailyWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['dailyWorkoutTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
      setRetryCount(0);
      setIsDirty(false);
      if (DRAFT_KEY) localStorage.removeItem(DRAFT_KEY);
      toast.success(`האימון פורסם עם ${exercises.length} תרגילים — המתאמנים יראו אותו עכשיו`);
    },
    onError: (error) => {
      alert(`שגיאה בפרסום:\n\n${error.message}`);
    },
  });

  const copyFromYesterdayMutation = useMutation({
    mutationFn: async () => {
      if (!yesterdayWorkout) throw new Error('אין אימון מאתמול');
      setTitle(yesterdayWorkout.title_he);
      setDescription(yesterdayWorkout.description_he || '');
      if (yesterdayWorkout.exercises && Array.isArray(yesterdayWorkout.exercises)) {
        setExercises(
          yesterdayWorkout.exercises.map((ex) => ({
            exercise_name: ex.exercise_name,
            notes_he: ex.notes || '',
            default_sets_count: ex.sets || 4,
            set_type: ex.set_type || 'reps',
            target_reps_min: ex.reps_min || null,
            target_reps_max: ex.reps_max || null,
            target_time_seconds: ex.time_seconds || null,
            group_id: ex.group_id,
            group_type: ex.group_type,
            group_label: ex.group_label,
            group_order: ex.group_order,
            round_count: ex.round_count,
            rest_after_round_seconds: ex.rest_after_round_seconds,
            sets: null,
          }))
        );
        setIsDirty(true);
      }
    },
    onError: (error) => {
      alert(`שגיאה בהעתקה:\n${error.message}`);
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-slate-50 pb-24" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* ── HEADER CARD ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-orange-500" />
              <h1 className="font-bold text-slate-800 text-lg">
                אימון קבוצתי — {format(new Date(), "d 'ב'MMMM", { locale: he })}
              </h1>
            </div>
            {isDirty && (
              <span className="text-xs text-slate-400 animate-pulse">שמירה אוטומטית...</span>
            )}
          </div>
          <p className="text-sm text-slate-500 -mt-2">אימון יומי לכל המתאמנים בסטודיו</p>

          <div>
            <Label>כותרת האימון</Label>
            <Input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setIsDirty(true); }}
              placeholder="לדוגמה: אימון חזה וטריצפס"
              className="mt-1"
            />
          </div>

          <div>
            <Label>תיאור (אופציונלי)</Label>
            <Textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); setIsDirty(true); }}
              placeholder="הערות כלליות לאימון..."
              rows={3}
              className="mt-1 resize-none"
            />
          </div>

          {retryCount > 0 && (
            <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800 text-center">
              יש עומס רגעי, מנסה שוב... (ניסיון {retryCount}/3)
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending || !title.trim() || exercises.length === 0}
              className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50"
            >
              {publishMutation.isPending ? (
                <>
                  <div className="w-4 h-4 ml-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  מפרסם...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 ml-2" />
                  פרסם להיום
                </>
              )}
            </Button>

            <Button
              onClick={() => copyFromYesterdayMutation.mutate()}
              disabled={!yesterdayWorkout || copyFromYesterdayMutation.isPending}
              variant="outline"
            >
              <Copy className="w-4 h-4 ml-2" />
              שכפל מאתמול
            </Button>

            <Button
              onClick={() => setShowCopyWorkout(true)}
              disabled={exercises.length === 0}
              variant="outline"
            >
              <Copy className="w-4 h-4 ml-2" />
              העתק אימון
            </Button>
          </div>
        </div>

        {/* ── EXERCISE BUILDER CARD ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Card toolbar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-700">תרגילי האימון</h2>
            <div className="flex gap-2 flex-wrap justify-end">
              <Button
                onClick={() => setShowMergeDuplicates(true)}
                size="sm"
                variant="outline"
                className="text-purple-600 border-purple-300 hover:bg-purple-50"
              >
                <Check className="w-4 h-4 ml-1" />
                איחוד כפילויות
              </Button>
              <Button onClick={() => setShowImportCSV(true)} size="sm" variant="outline">
                <Upload className="w-4 h-4 ml-1" />
                ייבא CSV
              </Button>
              <Button onClick={() => setShowAddToBank(true)} size="sm" variant="outline">
                <Plus className="w-4 h-4 ml-1" />
                הוסף למאגר
              </Button>
              <Button
                onClick={addSupersetBlock}
                size="sm"
                variant="outline"
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                <Link2 className="w-4 h-4 ml-1" />
                הוסף סופר סט
              </Button>
            </div>
          </div>

          {/* Empty state */}
          {exercises.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Dumbbell className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-base font-medium">לא נוספו תרגילים</p>
              <p className="text-sm mt-1 opacity-70">לחץ + להוספת תרגיל ראשון</p>
            </div>
          )}

          {/* DnD exercise list */}
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="exercises">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="p-4 space-y-3"
                >
                  {exercises.map((ex, idx) => (
                    <Draggable key={`ex-${idx}`} draggableId={`ex-${idx}`} index={idx}>
                      {(provided, snapshot) => (
                        <WorkoutExerciseCard
                          ref={provided.innerRef}
                          exercise={ex}
                          index={idx}
                          onUpdate={updateExercise}
                          onRemove={removeExercise}
                          onDuplicate={duplicateExercise}
                          exercises={exercises}
                          onUpdateList={setExercises}
                          draggableProps={provided.draggableProps}
                          dragHandleProps={provided.dragHandleProps}
                          isDragging={snapshot.isDragging}
                        />
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {/* Exercise selector at bottom */}
          <div className="px-4 pb-4">
            <ExerciseSelector
              exercises={exerciseLibrary}
              isLoading={libraryLoading}
              onSelect={(ex) => addExercise(ex.name_he || ex.name, ex.id, ex)}
              onCreateCustom={(name) => addExercise(name)}
            />
          </div>
        </div>

        {/* ── TEMPLATES SECTION ── */}
        <Card className="bg-white border-0 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-slate-700">
                <BookOpen className="w-5 h-5 text-blue-600" />
                אימונים שנוצרו היום
                {todayTemplates.length > 0 && (
                  <span className="text-sm bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-normal">
                    {todayTemplates.length}
                  </span>
                )}
              </CardTitle>
              <Button
                size="sm"
                onClick={() => { setEditingTemplate(null); setShowTemplateEditor(true); }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 ml-1" />
                צור אימון נוסף
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              צור מספר אימונים להיום — המתאמנים יוכלו לבחור איזה לבצע
            </p>
          </CardHeader>
          <CardContent>
            {todayTemplates.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">אין אימונים מוגדרים עדיין</p>
                <p className="text-xs mt-1">לחץ "צור אימון נוסף" להוספה</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayTemplates.map((tmpl) => (
                  <div key={tmpl.id} className="p-3 rounded-xl border-2 border-slate-100 bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800 truncate">{tmpl.title}</span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                              tmpl.is_published
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {tmpl.is_published ? 'מפורסם' : 'טיוטה'}
                          </span>
                        </div>
                        <div className="flex gap-3 mt-1 text-xs text-slate-500">
                          {tmpl.workout_type && <span>{tmpl.workout_type}</span>}
                          <span>{tmpl.exercises?.length || 0} תרגילים</span>
                          {tmpl.estimated_duration_minutes && (
                            <span>{tmpl.estimated_duration_minutes} דק'</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8"
                          title={tmpl.is_published ? 'בטל פרסום' : 'פרסם'}
                          onClick={() =>
                            togglePublishMutation.mutate({ id: tmpl.id, current: tmpl.is_published })
                          }
                        >
                          {tmpl.is_published ? (
                            <EyeOff className="w-4 h-4 text-slate-400" />
                          ) : (
                            <Eye className="w-4 h-4 text-green-600" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8"
                          title="ערוך"
                          onClick={() => { setEditingTemplate(tmpl); setShowTemplateEditor(true); }}
                        >
                          <Pencil className="w-4 h-4 text-blue-500" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8"
                          title="מחק"
                          onClick={() => {
                            if (window.confirm('למחוק את האימון?'))
                              deleteTemplateMutation.mutate(tmpl.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Dialogs (unchanged) ── */}
      <AddExerciseToBank
        open={showAddToBank}
        onClose={() => setShowAddToBank(false)}
        onSuccess={(exercise) => addExercise(exercise.name_he, exercise.id)}
      />

      <ImportExercisesCSV
        open={showImportCSV}
        onClose={() => setShowImportCSV(false)}
      />

      <MergeDuplicatesDialog
        open={showMergeDuplicates}
        onClose={() => setShowMergeDuplicates(false)}
      />

      <CopyWorkoutDialog
        open={showCopyWorkout}
        onClose={() => setShowCopyWorkout(false)}
        workout={{
          coach_email: user?.email,
          date: format(new Date(), 'yyyy-MM-dd'),
          title_he: title,
          description_he: description,
          exercises,
        }}
      />

      <DailyWorkoutTemplateEditor
        open={showTemplateEditor}
        onClose={() => { setShowTemplateEditor(false); setEditingTemplate(null); }}
        date={todayStr}
        coachEmail={user?.email}
        editingTemplate={editingTemplate}
        exerciseLibrary={exerciseLibrary}
      />
    </div>
  );
}