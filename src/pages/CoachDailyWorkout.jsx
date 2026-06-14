import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dumbbell, Plus, Trash2, Send, Copy, Check, Upload, Users, BookOpen, Eye, EyeOff, Pencil, Link2 } from "lucide-react";
import { addLog } from '@/components/shared/diagnostics/logger';
import AddExerciseToBank from '../components/coach/AddExerciseToBank';
import ImportExercisesCSV from '../components/coach/ImportExercisesCSV';
import MergeDuplicatesDialog from '../components/coach/MergeDuplicatesDialog';
import CopyWorkoutDialog from '../components/coach/CopyWorkoutDialog';
import DailyWorkoutTemplateEditor from '../components/coach/DailyWorkoutTemplateEditor';
import { ExerciseSupersetBadge, getGroups, GROUP_COLORS, GROUP_LABELS, nextGroupLetter } from '../components/coach/SupersetManager';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { toast } from 'sonner';

export default function CoachDailyWorkout() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [exercises, setExercises] = useState([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAddToBank, setShowAddToBank] = useState(false);
  const [showImportCSV, setShowImportCSV] = useState(false);
  const [showMergeDuplicates, setShowMergeDuplicates] = useState(false);
  const [showCopyWorkout, setShowCopyWorkout] = useState(false);
  const [pendingExercise, setPendingExercise] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: exerciseLibrary = [], isLoading: libraryLoading } = useQuery({
    queryKey: ['allExercises'],
    queryFn: async () => {
      try {
        addLog('info', 'workout', 'LOAD_EXERCISE_BANK_START', {});
        const exercises = await base44.entities.Exercise.filter({ status: 'active' }, '-created_date', 500);
        addLog('success', 'workout', 'LOAD_EXERCISE_BANK_COUNT', { count: exercises.length });
        console.log('[CoachDailyWorkout] Loaded exercises:', exercises.length);
        return exercises;
      } catch (err) {
        addLog('error', 'workout', 'EXERCISE_BANK_LOAD_ERROR', { error: err.message });
        console.error('Failed to load exercise library:', err);
        return [];
      }
    },
  });

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Multi-workout templates for today
  const { data: todayTemplates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ['dailyWorkoutTemplates', user?.email, todayStr],
    queryFn: () => base44.entities.DailyWorkoutTemplate.filter({ coach_email: user?.email, date: todayStr }, '-created_date', 50),
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

  // Initialize if today's workout exists
  React.useEffect(() => {
    if (!todayWorkout) return;
    
    setTitle(todayWorkout.title_he || '');
    setDescription(todayWorkout.description_he || '');
    
    // Load from exercises JSON array
    if (todayWorkout.exercises && Array.isArray(todayWorkout.exercises)) {
      const loadedExercises = todayWorkout.exercises.map(ex => ({
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
        sets: null
      }));
      
      setExercises(loadedExercises);
      console.log('[CoachDailyWorkout] Loaded', loadedExercises.length, 'exercises from JSON');
    }
  }, [todayWorkout]);

  const filteredExercises = exerciseLibrary.filter(ex => {
    if (!searchTerm.trim()) return true;
    const searchLower = searchTerm.toLowerCase();
    const nameHe = ex?.name_he || ex?.name || '';
    const muscleGroup = ex?.muscle_group_primary || ex?.category || '';
    return nameHe.toLowerCase().includes(searchLower) || 
           muscleGroup.toLowerCase().includes(searchLower) ||
           (ex?.movement_pattern || '').toLowerCase().includes(searchLower);
  });

  const addExercise = (exerciseName, exerciseId = null, exerciseData = null) => {
    const newExercise = {
      exercise_id: exerciseId,
      exercise_name: exerciseName,
      custom_name: exerciseId ? null : exerciseName,
      default_sets_count: exerciseData?.default_sets || 4,
      target_reps_min: exerciseData?.default_reps_min || null,
      target_reps_max: exerciseData?.default_reps_max || null,
      notes_he: exerciseData?.default_notes || '',
    };
    
    setExercises([...exercises, newExercise]);
    setShowAddDialog(false);
    setPendingExercise('');
    setSearchTerm('');
  };

  const removeExercise = (index) => {
    const removed = exercises[index];
    const remaining = exercises.filter((_, i) => i !== index);

    if (removed?.group_id && remaining.filter(ex => ex.group_id === removed.group_id).length === 1) {
      setExercises(remaining.map(ex => {
        if (ex.group_id !== removed.group_id) return ex;
        const { group_id, group_type, group_label, group_order, round_count, rest_after_round_seconds, ...rest } = ex;
        return rest;
      }));
      return;
    }

    setExercises(remaining);
  };

  const updateExercise = (index, field, value) => {
    const updated = [...exercises];
    updated[index][field] = value;
    setExercises(updated);
  };

  const updateExercisesList = (nextExercises) => {
    setExercises(nextExercises);
  };

  const addSupersetBlock = () => {
    const groupId = `grp_${Date.now().toString(36)}`;
    const letter = nextGroupLetter(exercises);
    const baseExercise = {
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
      sets: null
    };

    setExercises([
      ...exercises,
      { ...baseExercise, exercise_name: 'תרגיל 1 בסופר סט', group_order: 1 },
      { ...baseExercise, exercise_name: 'תרגיל 2 בסופר סט', group_order: 2 }
    ]);
    toast.success(`נוסף סופר סט ${letter}`);
  };

  const [lastPublishTime, setLastPublishTime] = React.useState(0);
  const [retryCount, setRetryCount] = React.useState(0);

  const publishMutation = useMutation({
    mutationFn: async () => {
      // Debounce
      const now = Date.now();
      if (now - lastPublishTime < 1500) {
        throw new Error('נא להמתין בין פרסומים');
      }
      setLastPublishTime(now);

      // Validation
      if (!title.trim()) {
        throw new Error('יש להזין כותרת לאימון');
      }
      
      if (exercises.length === 0) {
        throw new Error('יש להוסיף לפחות תרגיל אחד לאימון');
      }
      
      const debugId = `PUB-${Date.now().toString(36).toUpperCase()}`;
      
      console.log('=== PUBLISH_DAILY_WORKOUT ===');
      console.log('Debug ID:', debugId);
      console.log('Date:', todayStr);
      console.log('Title:', title);
      console.log('Exercises:', exercises.length);

      // Step 1: Create or save workout with exercises (draft)
      let workoutId = todayWorkout?.id;

      const exercisesJson = exercises.map(ex => ({
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
        rest_after_round_seconds: ex.rest_after_round_seconds || null
      }));

      if (!workoutId) {
        // Create new draft
        const newWorkout = await base44.entities.DailyWorkout.create({
          coach_email: user.email,
          date: todayStr,
          title_he: title,
          description_he: description || null,
          exercises: exercisesJson,
          status: 'draft'
        });
        workoutId = newWorkout.id;
        console.log('Created draft workout:', workoutId);
      } else {
        // Update existing with latest data
        await base44.entities.DailyWorkout.update(workoutId, {
          title_he: title,
          description_he: description || null,
          exercises: exercisesJson
        });
        console.log('Updated workout:', workoutId);
      }

      // Step 2: Validate workout ID exists
      if (!workoutId) {
        throw new Error('מזהה אימון חסר - לא ניתן לפרסם');
      }

      // Step 2.5: Sync exercises into DailyWorkoutTemplate so trainee selector picks them up
      // This is the CANONICAL path trainee WorkoutLog reads from.
      try {
        const existingTemplates = await base44.entities.DailyWorkoutTemplate.filter({
          coach_email: user.email,
          date: todayStr,
        });

        // Find a template that was created from the main builder (marked with source: 'main_builder')
        const mainBuilderTemplate = existingTemplates.find(t => t.source === 'main_builder');

        const templatePayload = {
          coach_email: user.email,
          date: todayStr,
          title: title,
          description: description || null,
          workout_type: 'strength',
          difficulty: 'medium',
          exercises: exercisesJson,
          is_published: true,
          published_at: new Date().toISOString(),
          source: 'main_builder', // marker so we can find/update this one
        };

        if (mainBuilderTemplate) {
          await base44.entities.DailyWorkoutTemplate.update(mainBuilderTemplate.id, templatePayload);
          console.log('Updated main_builder template:', mainBuilderTemplate.id);
        } else {
          const created = await base44.entities.DailyWorkoutTemplate.create(templatePayload);
          console.log('Created main_builder template:', created.id);
        }
      } catch (syncErr) {
        // Non-fatal — DailyWorkout publish still proceeds
        console.error('Template sync failed (non-fatal):', syncErr);
      }

      // Step 3: Publish (just update status)
      try {
        await base44.entities.DailyWorkout.update(workoutId, {
          status: 'published',
          published_at: new Date().toISOString()
        });
        console.log('Workout published successfully');
      } catch (publishError) {
        console.error('❌ Publish failed:', publishError);
        
        await base44.entities.SystemAuditLog.create({
          debug_id: debugId,
          action_type: 'PUBLISH_DAILY_WORKOUT',
          actor_role: 'coach',
          actor_email: user.email,
          source_workout_id: workoutId,
          status: 'fail',
          error_code: 'PUBLISH_STATUS_UPDATE_FAILED',
          error_message_he: 'נכשל בעדכון סטטוס הפרסום',
          details: { 
            error: publishError.message,
            status: publishError.status || publishError.code,
            workout_id: workoutId
          }
        });
        
        const errorMsg = `שגיאה בפרסום:\n\nStatus: ${publishError.status || publishError.code || 'Unknown'}\nError: ${publishError.message}\nWorkout ID: ${workoutId}\n\n🔍 מזהה תקלה: ${debugId}`;
        throw new Error(errorMsg);
      }

      // Success audit
      const totalSets = exercisesJson.reduce((sum, ex) => sum + (ex.sets || 0), 0);
      await base44.entities.SystemAuditLog.create({
        debug_id: debugId,
        action_type: 'PUBLISH_DAILY_WORKOUT',
        actor_role: 'coach',
        actor_email: user.email,
        source_workout_id: workoutId,
        status: 'success',
        payload_summary: { 
          exercises_count: exercisesJson.length, 
          sets_count: totalSets 
        },
        details: {
          workout_title: title,
          date: todayStr
        }
      });

      // Send notifications via backend function (avoids rate limits)
      try {
        const result = await base44.functions.invoke('sendWorkoutNotifications', {
          workout_id: workoutId,
          coach_email: user.email,
          date: todayStr
        });
        console.log('Notifications sent:', result);
      } catch (notifError) {
        console.error('Failed to send notifications:', notifError);
        // Don't fail the whole publish if notifications fail
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
      
      const exercisesCount = exercises.length;
      toast.success(`✅ האימון פורסם עם ${exercisesCount} תרגילים — המתאמנים יראו אותו עכשיו`);
    },
    onError: (error) => {
      const errorMsg = error.message || 'שגיאה בפרסום האימון';
      alert(`❌ שגיאה בפרסום:\n\n${errorMsg}`);
    },
  });

  const copyFromYesterdayMutation = useMutation({
    mutationFn: async () => {
      if (!yesterdayWorkout) throw new Error('אין אימון מאתמול');
      
      setTitle(yesterdayWorkout.title_he);
      setDescription(yesterdayWorkout.description_he || '');
      
      // Copy from exercises JSON
      if (yesterdayWorkout.exercises && Array.isArray(yesterdayWorkout.exercises)) {
        const copiedExercises = yesterdayWorkout.exercises.map(ex => ({
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
          sets: null
        }));
        
        setExercises(copiedExercises);
      }
    },
    onError: (error) => {
      alert(`❌ שגיאה בהעתקה:\n${error.message}`);
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-slate-100 p-6 pb-24" dir="rtl">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card className="bg-white border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <Users className="w-6 h-6" />
              אימון קבוצתי - {format(new Date(), 'd בMMMM', { locale: he })}
            </CardTitle>
            <p className="text-sm text-slate-500 mt-1">אימון יומי לכל המתאמנים בסטודיו</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>כותרת האימון</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="לדוגמה: אימון חזה וטריצפס"
              />
            </div>

            <div>
              <Label>תיאור (אופציונלי)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="הערות כלליות לאימון..."
                rows={3}
              />
            </div>

            {retryCount > 0 && (
              <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800 text-center">
                ⏳ יש עומס רגעי, מנסה שוב... (ניסיון {retryCount}/3)
              </div>
            )}

            <div className="flex gap-2">
              <Button 
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending || !title.trim() || exercises.length === 0}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {publishMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 ml-2 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>תרגילי האימון</CardTitle>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => setShowMergeDuplicates(true)} size="sm" variant="outline" className="text-purple-600 border-purple-300 hover:bg-purple-50">
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
                <Button onClick={addSupersetBlock} size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50">
                  <Link2 className="w-4 h-4 ml-1" />
                  הוסף סופר סט
                </Button>
                <Button onClick={() => setShowAddDialog(true)} size="sm">
                  <Plus className="w-4 h-4 ml-1" />
                  הוסף תרגיל
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {exercises.length === 0 ? (
              <p className="text-center text-slate-400 py-6">טרם נוספו תרגילים</p>
            ) : (
              <div className="space-y-3">
                {exercises.map((ex, idx) => {
                  const isGrouped = !!ex.group_id;
                  const groups = getGroups(exercises);
                  const groupMeta = isGrouped ? groups[ex.group_id] : null;
                  const isFirstInGroup = isGrouped && groupMeta?.indices?.[0] === idx;
                  const colors = isGrouped ? GROUP_COLORS[ex.group_type] || GROUP_COLORS.superset : null;

                  return (
                  <div key={idx} className={`p-4 rounded-lg border ${isGrouped ? `${colors.bg} ${colors.border} border-2` : 'bg-slate-50 border-slate-200'}`}>
                    {isFirstInGroup && (
                      <div className={`mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-white/70 p-2 ${colors.border}`}>
                        <Link2 className={`w-4 h-4 ${colors.text}`} />
                        <span className={`text-sm font-bold ${colors.text}`}>{GROUP_LABELS[ex.group_type]} {ex.group_label}</span>
                        <span className="text-xs text-slate-500">סבבים</span>
                        <Input
                          type="number"
                          value={ex.round_count || 3}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 3;
                            setExercises(prev => prev.map(item => item.group_id === ex.group_id ? { ...item, round_count: val } : item));
                          }}
                          className="h-8 w-16 text-center"
                          min={1}
                          max={10}
                        />
                        <span className="text-xs text-slate-500">מנוחה בין סבבים</span>
                        <Input
                          type="number"
                          value={ex.rest_after_round_seconds || 60}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 60;
                            setExercises(prev => prev.map(item => item.group_id === ex.group_id ? { ...item, rest_after_round_seconds: val } : item));
                          }}
                          className="h-8 w-20 text-center"
                          min={0}
                          max={300}
                          step={15}
                        />
                        <span className="text-xs text-slate-400">שניות</span>
                      </div>
                    )}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                        <span className="text-sm font-bold text-orange-600">{idx + 1}</span>
                      </div>
                      <div className="flex-1 space-y-2">
                        <Input
                          value={ex.exercise_name || ''}
                          onChange={(e) => updateExercise(idx, 'exercise_name', e.target.value)}
                          className="h-9 font-bold text-slate-800"
                        />
                        <ExerciseSupersetBadge
                          exercise={ex}
                          idx={idx}
                          exercises={exercises}
                          onUpdate={updateExercisesList}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeExercise(idx)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="space-y-3">
                     <div className="grid grid-cols-2 gap-3">
                       <div>
                         <Label className="text-xs">מספר סטים</Label>
                         <Input
                           type="number"
                           value={ex.default_sets_count}
                           onChange={(e) => updateExercise(idx, 'default_sets_count', parseInt(e.target.value) || 4)}
                           min={1}
                           max={20}
                           className="h-9"
                         />
                       </div>
                       <div>
                         <Label className="text-xs">סוג סט</Label>
                         <Select
                           value={ex.set_type || 'reps'}
                           onValueChange={(value) => updateExercise(idx, 'set_type', value)}
                         >
                           <SelectTrigger className="h-9">
                             <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                             <SelectItem value="reps">חזרות</SelectItem>
                             <SelectItem value="time">זמן עבודה</SelectItem>
                           </SelectContent>
                         </Select>
                       </div>
                     </div>

                     {(!ex.set_type || ex.set_type === 'reps') && (
                       <div>
                         <Label className="text-xs">חזרות מומלצות (טווח)</Label>
                         <div className="flex gap-1">
                           <Input
                             type="number"
                             value={ex.target_reps_min || ''}
                             onChange={(e) => updateExercise(idx, 'target_reps_min', e.target.value ? parseInt(e.target.value) : null)}
                             placeholder="מינ׳"
                             className="h-9"
                           />
                           <Input
                             type="number"
                             value={ex.target_reps_max || ''}
                             onChange={(e) => updateExercise(idx, 'target_reps_max', e.target.value ? parseInt(e.target.value) : null)}
                             placeholder="מקס׳"
                             className="h-9"
                           />
                         </div>
                       </div>
                     )}

                     {ex.set_type === 'time' && (
                       <div>
                         <Label className="text-xs">זמן עבודה (שניות)</Label>
                         <Input
                           type="number"
                           value={ex.target_time_seconds || ''}
                           onChange={(e) => updateExercise(idx, 'target_time_seconds', e.target.value ? parseInt(e.target.value) : null)}
                           placeholder="לדוגמה: 60"
                           className="h-9"
                         />
                       </div>
                     )}
                    </div>

                    {/* Sets Editor */}
                    {!ex.sets && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          const defaultSets = [];
                          for (let i = 0; i < (ex.default_sets_count || 4); i++) {
                            defaultSets.push({ 
                              set_index: i + 1, 
                              target_weight: null, 
                              target_reps_min: ex.target_reps_min || null,
                              target_reps_max: ex.target_reps_max || null,
                              target_rir: null,
                              notes: null 
                            });
                          }
                          updateExercise(idx, 'sets', defaultSets);
                        }}
                        className="mt-2 w-full"
                      >
                        הוסף סטים מפורטים (אופציונלי)
                      </Button>
                    )}

                    {ex.sets && (
                      <div className="mt-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <Label className="text-xs">סטים מפורטים</Label>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => updateExercise(idx, 'sets', null)}
                            className="h-6 text-xs"
                          >
                            הסר
                          </Button>
                        </div>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {ex.sets.map((set, setIdx) => (
                            <div key={setIdx} className="flex gap-2 items-center text-xs">
                              <span className="w-8 text-slate-500">סט {setIdx + 1}:</span>
                              <Input
                                type="number"
                                value={set.target_weight || ''}
                                onChange={(e) => {
                                  const newSets = [...ex.sets];
                                  newSets[setIdx].target_weight = e.target.value ? parseFloat(e.target.value) : null;
                                  updateExercise(idx, 'sets', newSets);
                                }}
                                placeholder="משקל"
                                className="h-7 w-16"
                              />
                              <Input
                                type="number"
                                value={set.target_reps_min || ''}
                                onChange={(e) => {
                                  const newSets = [...ex.sets];
                                  newSets[setIdx].target_reps_min = e.target.value ? parseInt(e.target.value) : null;
                                  updateExercise(idx, 'sets', newSets);
                                }}
                                placeholder="חזרות"
                                className="h-7 w-16"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-3">
                      <Label className="text-xs">הערות/הנחיות</Label>
                      <Textarea
                        value={ex.notes_he || ''}
                        onChange={(e) => updateExercise(idx, 'notes_he', e.target.value)}
                        placeholder="למשל: 'שמור על טכניקה נכונה', 'מקסימום משקל'"
                        rows={2}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Exercise Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle>בחירת תרגיל</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3 flex flex-col flex-1 min-h-0">
            <div>
              <Label>חיפוש במאגר</Label>
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="הקלד שם תרגיל..."
                className="mt-1"
              />
            </div>

            {libraryLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
              </div>
            ) : exerciseLibrary.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="font-medium text-red-500">לא נמצאו תרגילים במאגר</p>
                <p className="text-xs mt-1">לחץ "הוסף למאגר" להוספת תרגילים</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto border rounded-lg">
                {filteredExercises.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">לא נמצאו תרגילים התואמים את החיפוש</p>
                ) : (
                  <div className="divide-y">
                    {filteredExercises.map(ex => {
                      const exerciseName = ex?.name_he || ex?.name || 'תרגיל ללא שם';
                      const muscleGroup = ex?.muscle_group_primary || ex?.category || '';
                      const equipment = ex?.equipment || [];
                      const equipmentStr = Array.isArray(equipment) ? equipment.join(', ') : equipment;
                      
                      return (
                        <button
                          key={ex.id}
                          onClick={() => addExercise(exerciseName, ex.id, ex)}
                          className="w-full text-right p-3 hover:bg-orange-50 transition-colors"
                        >
                          <div className="font-medium text-slate-800">{exerciseName}</div>
                          <div className="flex gap-2 mt-1 text-xs text-slate-500">
                            {muscleGroup && (
                              <span className="px-2 py-0.5 bg-slate-100 rounded">
                                {muscleGroup}
                              </span>
                            )}
                            {equipmentStr && (
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded">
                                {equipmentStr}
                              </span>
                            )}
                          </div>
                          </button>
                          );
                          })}
                          </div>
                          )}
                          </div>
                          )}
                          </div>
                          </DialogContent>
                          </Dialog>

                            <AddExerciseToBank
                            open={showAddToBank}
                            onClose={() => setShowAddToBank(false)}
                            onSuccess={(exercise) => {
                            addExercise(exercise.name_he, exercise.id);
                            }}
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
                                exercises: exercises
                              }}
                            />

      {/* ===== MULTI-WORKOUT LIBRARY SECTION ===== */}
      <div className="max-w-2xl mx-auto mt-6">
        <Card className="bg-white border-0 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-slate-700">
                <BookOpen className="w-5 h-5 text-blue-600" />
                📋 אימונים שנוצרו היום
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
            <p className="text-xs text-slate-500 mt-1">צור מספר אימונים להיום — המתאמנים יוכלו לבחור איזה לבצע</p>
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
                {todayTemplates.map(tmpl => (
                  <div key={tmpl.id} className="p-3 rounded-xl border-2 border-slate-100 bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800 truncate">{tmpl.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${tmpl.is_published ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {tmpl.is_published ? '✅ מפורסם' : '📝 טיוטה'}
                          </span>
                        </div>
                        <div className="flex gap-3 mt-1 text-xs text-slate-500">
                          {tmpl.workout_type && <span>{tmpl.workout_type}</span>}
                          <span>{tmpl.exercises?.length || 0} תרגילים</span>
                          {tmpl.estimated_duration_minutes && <span>{tmpl.estimated_duration_minutes} דק׳</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8"
                          title={tmpl.is_published ? 'בטל פרסום' : 'פרסם'}
                          onClick={() => togglePublishMutation.mutate({ id: tmpl.id, current: tmpl.is_published })}
                        >
                          {tmpl.is_published ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-green-600" />}
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
                          onClick={() => { if (window.confirm('למחוק את האימון?')) deleteTemplateMutation.mutate(tmpl.id); }}
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