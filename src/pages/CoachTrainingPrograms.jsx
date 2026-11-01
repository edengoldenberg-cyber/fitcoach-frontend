/**
 * CoachTrainingPrograms — build and assign personalized training programs.
 *
 * Features:
 *   • Program list with status (draft/active/completed/archived)
 *   • Create/edit programs with multiple workouts (A, B, C, D)
 *   • Add exercises to each workout from the Exercise Library
 *   • Assign program to a specific trainee
 *   • Duplicate and edit existing programs
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus, Edit2, Copy, Trash2, Archive, ArchiveRestore, Send,
  Dumbbell, Users, ChevronDown, ChevronUp, X, Search,
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_LABELS = {
  draft:     { label: 'טיוטה',   color: 'bg-amber-100 text-amber-800' },
  active:    { label: 'פעיל',    color: 'bg-green-100 text-green-800' },
  completed: { label: 'הסתיים',  color: 'bg-slate-100 text-slate-600' },
  archived:  { label: 'ארכיון',  color: 'bg-slate-100 text-slate-500' },
};

// ── WorkoutEditor — one workout within a program ──────────────────────────────

function WorkoutEditor({ workout, idx, onUpdate, onRemove, exerciseBank, onAddExercise, onRemoveExercise }) {
  const [open, setOpen]         = useState(idx === 0);
  const [exSearch, setExSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const filteredBank = exerciseBank.filter(ex =>
    !exSearch.trim() ||
    (ex.name_he || ex.name || '').toLowerCase().includes(exSearch.toLowerCase())
  ).slice(0, 30);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-teal-600 text-white font-bold text-sm flex items-center justify-center">
            {workout.label || String.fromCharCode(65 + idx)}
          </span>
          <span className="font-semibold text-slate-800">{workout.title || `אימון ${String.fromCharCode(65 + idx)}`}</span>
          <span className="text-xs text-slate-400">({workout.exercises?.length || 0} תרגילים)</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1 text-red-400 hover:text-red-600"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {open && (
        <div className="p-4 space-y-3">
          {/* Workout title */}
          <Input
            value={workout.title || ''}
            onChange={e => onUpdate({ ...workout, title: e.target.value })}
            placeholder={`שם האימון (לדוגמה: גוף עליון)`}
            className="text-sm"
          />

          {/* Exercise list */}
          {(workout.exercises || []).length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4 border border-dashed rounded-lg">
              לא נוספו תרגילים
            </p>
          ) : (
            <div className="space-y-2">
              {(workout.exercises || []).map((ex, ei) => (
                <div key={ei} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {ei + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium truncate">{ex.exercise_name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Input
                      type="number"
                      min={1}
                      value={ex.sets || 3}
                      onChange={e => {
                        const exs = [...(workout.exercises || [])];
                        exs[ei] = { ...exs[ei], sets: parseInt(e.target.value) || 3 };
                        onUpdate({ ...workout, exercises: exs });
                      }}
                      className="w-12 h-7 text-xs text-center p-1"
                      title="סטים"
                    />
                    <span className="text-xs text-slate-400">×</span>
                    <Input
                      value={`${ex.reps_min || 8}${ex.reps_max ? '-' + ex.reps_max : ''}`}
                      onChange={e => {
                        const val = e.target.value;
                        const parts = val.split('-');
                        const exs = [...(workout.exercises || [])];
                        exs[ei] = { ...exs[ei], reps_min: parseInt(parts[0]) || 8, reps_max: parseInt(parts[1]) || null };
                        onUpdate({ ...workout, exercises: exs });
                      }}
                      className="w-16 h-7 text-xs text-center p-1"
                      title="חזרות (8-12)"
                    />
                    <button type="button" onClick={() => onRemoveExercise(idx, ei)} className="text-red-400 hover:text-red-600 ml-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add exercise */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full border-dashed text-orange-600 border-orange-300 hover:bg-orange-50"
            onClick={() => setShowPicker(true)}
          >
            <Plus className="w-3.5 h-3.5 ml-1" />
            הוסף תרגיל
          </Button>

          {/* Exercise picker */}
          {showPicker && (
            <div className="border rounded-xl p-3 bg-white shadow-inner">
              <div className="relative mb-2">
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  value={exSearch}
                  onChange={e => setExSearch(e.target.value)}
                  placeholder="חפש תרגיל..."
                  className="h-8 text-sm pr-8"
                  autoFocus
                />
              </div>
              <div className="max-h-48 overflow-y-auto divide-y">
                {filteredBank.map(ex => (
                  <button
                    key={ex.id}
                    type="button"
                    className="w-full text-right p-2 text-sm hover:bg-orange-50 flex items-center justify-between"
                    onClick={() => {
                      onAddExercise(idx, {
                        exercise_id: ex.id,
                        exercise_name: ex.name_he || ex.name,
                        sets: 3,
                        reps_min: 8,
                        reps_max: 12,
                        rest_seconds: 60,
                      });
                      setExSearch('');
                      setShowPicker(false);
                    }}
                  >
                    <span>{ex.name_he || ex.name}</span>
                    {(ex.muscle_group) && (
                      <span className="text-xs text-slate-400">{ex.muscle_group}</span>
                    )}
                  </button>
                ))}
                {filteredBank.length === 0 && exSearch.trim() && (
                  <button
                    type="button"
                    className="w-full text-right p-2 text-sm text-orange-600 hover:bg-orange-50"
                    onClick={() => {
                      onAddExercise(idx, {
                        exercise_id: null,
                        exercise_name: exSearch.trim(),
                        sets: 3,
                        reps_min: 8,
                        reps_max: 12,
                        rest_seconds: 60,
                      });
                      setExSearch('');
                      setShowPicker(false);
                    }}
                  >
                    ➕ הוסף "{exSearch.trim()}" כתרגיל מותאם
                  </button>
                )}
              </div>
              <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => setShowPicker(false)}>
                ביטול
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ProgramForm ───────────────────────────────────────────────────────────────

function ProgramForm({ program, trainees, exerciseBank, onSave, onClose, isPending }) {
  const [form, setForm] = useState({
    name:           program?.name           || '',
    objective:      program?.objective      || '',
    duration_weeks: program?.duration_weeks || '',
    frequency_week: program?.frequency_week || '',
    trainee_email:  program?.trainee_email  || '',
    workouts:       program?.workouts       || [],
  });

  const addWorkout = () => {
    const letters = ['א', 'ב', 'ג', 'ד', 'ה'];
    setForm(f => ({
      ...f,
      workouts: [...f.workouts, {
        _tempId: Date.now(),
        label: letters[f.workouts.length] || String.fromCharCode(65 + f.workouts.length),
        title: '',
        order_index: f.workouts.length,
        exercises: [],
      }],
    }));
  };

  const updateWorkout = (idx, updated) => {
    setForm(f => {
      const wks = [...f.workouts];
      wks[idx] = { ...updated, order_index: idx };
      return { ...f, workouts: wks };
    });
  };

  const removeWorkout = (idx) => {
    setForm(f => ({ ...f, workouts: f.workouts.filter((_, i) => i !== idx) }));
  };

  const addExercise = (workoutIdx, exercise) => {
    setForm(f => {
      const wks = [...f.workouts];
      wks[workoutIdx] = {
        ...wks[workoutIdx],
        exercises: [...(wks[workoutIdx].exercises || []), exercise],
      };
      return { ...f, workouts: wks };
    });
  };

  const removeExercise = (workoutIdx, exerciseIdx) => {
    setForm(f => {
      const wks = [...f.workouts];
      wks[workoutIdx] = {
        ...wks[workoutIdx],
        exercises: wks[workoutIdx].exercises.filter((_, i) => i !== exerciseIdx),
      };
      return { ...f, workouts: wks };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('נדרש שם לתוכנית'); return; }
    if (form.workouts.length === 0) { toast.error('הוסף לפחות אימון אחד'); return; }
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Program name */}
      <div>
        <label className="text-sm font-semibold block mb-1">שם התוכנית *</label>
        <Input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="פיתוח כוח — 8 שבועות"
          required
        />
      </div>

      {/* Objective */}
      <div>
        <label className="text-sm font-semibold block mb-1">מטרה</label>
        <Textarea
          value={form.objective}
          onChange={e => setForm(f => ({ ...f, objective: e.target.value }))}
          placeholder="בניית כוח ומסת שריר..."
          rows={2}
          className="resize-none text-sm"
        />
      </div>

      {/* Duration + frequency */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-semibold block mb-1">משך (שבועות)</label>
          <Input
            type="number"
            min={1}
            value={form.duration_weeks}
            onChange={e => setForm(f => ({ ...f, duration_weeks: parseInt(e.target.value) || '' }))}
            placeholder="8"
          />
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">תדירות (אימונים/שבוע)</label>
          <Input
            type="number"
            min={1}
            max={7}
            value={form.frequency_week}
            onChange={e => setForm(f => ({ ...f, frequency_week: parseInt(e.target.value) || '' }))}
            placeholder="3"
          />
        </div>
      </div>

      {/* Assign to trainee */}
      <div>
        <label className="text-sm font-semibold block mb-1">שייך למתאמן</label>
        <Select value={form.trainee_email} onValueChange={v => setForm(f => ({ ...f, trainee_email: v }))}>
          <SelectTrigger><SelectValue placeholder="בחר מתאמן (אופציונלי)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">ללא שיוך (תבנית)</SelectItem>
            {trainees.map(t => (
              <SelectItem key={t.id} value={t.user_email || t.id}>
                {t.full_name || t.user_email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Workouts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-semibold">אימונים ({form.workouts.length})</label>
          <Button type="button" size="sm" variant="outline" onClick={addWorkout}>
            <Plus className="w-3.5 h-3.5 ml-1" />
            הוסף אימון
          </Button>
        </div>
        <div className="space-y-2">
          {form.workouts.map((wk, i) => (
            <WorkoutEditor
              key={wk.id || wk._tempId || i}
              workout={wk}
              idx={i}
              onUpdate={(updated) => updateWorkout(i, updated)}
              onRemove={() => removeWorkout(i)}
              exerciseBank={exerciseBank}
              onAddExercise={addExercise}
              onRemoveExercise={removeExercise}
            />
          ))}
          {form.workouts.length === 0 && (
            <div
              onClick={addWorkout}
              className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center text-slate-400 cursor-pointer hover:border-orange-300 hover:text-orange-500 transition-colors"
            >
              <Plus className="w-6 h-6 mx-auto mb-1" />
              <p className="text-sm">לחץ להוספת אימון ראשון</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1">ביטול</Button>
        <Button type="submit" disabled={isPending} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white">
          {isPending ? 'שומר...' : program ? 'עדכן תוכנית' : 'צור תוכנית'}
        </Button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CoachTrainingPrograms() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm]             = useState(false);
  const [editingProgram, setEditingProgram] = useState(null);
  const [search, setSearch]                 = useState('');
  const [statusFilter, setStatusFilter]     = useState('all');

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  const { data: programs = [], isLoading } = useQuery({
    queryKey: ['trainingPrograms', user?.email],
    queryFn: () => base44.entities.TrainingProgram.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['coachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email, status: 'active' }),
    enabled: !!user?.email,
  });

  const { data: exerciseBank = [] } = useQuery({
    queryKey: ['allExercises'],
    queryFn: () => base44.entities.Exercise.filter({ status: 'active' }),
  });

  const filtered = programs.filter(p => {
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchSearch = !search.trim() || (p.name || '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const saveProgramMutation = useMutation({
    mutationFn: async (form) => {
      const { workouts: wks } = form;

      if (editingProgram) {
        // Update program metadata (trainee_email is handled via assignTrainingProgram below)
        await base44.entities.TrainingProgram.update(editingProgram.id, {
          name: form.name,
          objective: form.objective,
          duration_weeks: form.duration_weeks,
          frequency_week: form.frequency_week,
          status: form.trainee_email ? 'active' : 'draft',
        });

        // Delete old workouts (cascade deletes exercises)
        const oldWorkouts = editingProgram.workouts || [];
        for (const wk of oldWorkouts) {
          if (wk.id) await base44.entities.TrainingProgramWorkout.delete(wk.id).catch(() => {});
        }

        // Recreate workouts + exercises
        for (let i = 0; i < wks.length; i++) {
          const wk = wks[i];
          const newWk = await base44.entities.TrainingProgramWorkout.create({
            program_id: editingProgram.id,
            label: wk.label || String.fromCharCode(65 + i),
            title: wk.title || '',
            order_index: i,
          });
          for (let j = 0; j < (wk.exercises || []).length; j++) {
            const ex = wk.exercises[j];
            await base44.entities.TrainingProgramExercise.create({
              workout_id: newWk.id,
              exercise_id: ex.exercise_id || null,
              exercise_name: ex.exercise_name,
              order_index: j,
              sets: ex.sets || 3,
              reps_min: ex.reps_min || null,
              reps_max: ex.reps_max || null,
              rest_seconds: ex.rest_seconds || 60,
              notes: ex.notes || '',
            });
          }
        }

        // Assign to trainee if selected
        if (form.trainee_email && editingProgram) {
          await base44.functions.invoke('assignTrainingProgram', {
            program_id: editingProgram.id,
            trainee_email: form.trainee_email,
          });
        }
      } else {
        // Create new program
        const prog = await base44.entities.TrainingProgram.create({
          name: form.name,
          objective: form.objective,
          duration_weeks: form.duration_weeks,
          frequency_week: form.frequency_week,
          coach_email: user?.email,
          status: 'draft',
        });

        for (let i = 0; i < wks.length; i++) {
          const wk = wks[i];
          const newWk = await base44.entities.TrainingProgramWorkout.create({
            program_id: prog.id,
            label: wk.label || String.fromCharCode(65 + i),
            title: wk.title || '',
            order_index: i,
          });
          for (let j = 0; j < (wk.exercises || []).length; j++) {
            const ex = wk.exercises[j];
            await base44.entities.TrainingProgramExercise.create({
              workout_id: newWk.id,
              exercise_id: ex.exercise_id || null,
              exercise_name: ex.exercise_name,
              order_index: j,
              sets: ex.sets || 3,
              reps_min: ex.reps_min || null,
              reps_max: ex.reps_max || null,
              rest_seconds: ex.rest_seconds || 60,
              notes: ex.notes || '',
            });
          }
        }

        // Assign to trainee if selected
        if (form.trainee_email && prog?.id) {
          await base44.functions.invoke('assignTrainingProgram', {
            program_id: prog.id,
            trainee_email: form.trainee_email,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainingPrograms'] });
      toast.success(editingProgram ? 'תוכנית עודכנה ✅' : 'תוכנית נוצרה ✅');
      setShowForm(false);
      setEditingProgram(null);
    },
    onError: (err) => toast.error(`שגיאה: ${err.message}`),
  });

  const changeStatusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.TrainingProgram.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainingPrograms'] });
      toast.success('עודכן');
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (program) => {
      // Load full program with workouts
      const full = await base44.entities.TrainingProgram.get(program.id);
      const newProg = await base44.entities.TrainingProgram.create({
        coach_email: user?.email,
        name: (program.name || '') + ' (עותק)',
        objective: program.objective,
        duration_weeks: program.duration_weeks,
        frequency_week: program.frequency_week,
        status: 'draft',
      });
      for (const wk of (full.workouts || [])) {
        const newWk = await base44.entities.TrainingProgramWorkout.create({
          program_id: newProg.id,
          label: wk.label,
          title: wk.title,
          order_index: wk.order_index,
        });
        for (const ex of (wk.exercises || [])) {
          await base44.entities.TrainingProgramExercise.create({
            workout_id: newWk.id,
            exercise_id: ex.exercise_id,
            exercise_name: ex.exercise_name,
            order_index: ex.order_index,
            sets: ex.sets,
            reps_min: ex.reps_min,
            reps_max: ex.reps_max,
            rest_seconds: ex.rest_seconds,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainingPrograms'] });
      toast.success('תוכנית שוכפלה');
    },
  });

  const openEdit = async (program) => {
    // Load full program with embedded workouts+exercises
    const full = await base44.entities.TrainingProgram.get(program.id).catch(() => program);
    setEditingProgram(full);
    setShowForm(true);
  };

  if (isLoading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto p-4">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">תוכניות אימונים</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {programs.filter(p => p.status === 'active').length} פעילות · {programs.length} סך הכל
            </p>
          </div>
          <Button onClick={() => { setEditingProgram(null); setShowForm(true); }} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="w-4 h-4 ml-2" />
            תוכנית חדשה
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חפש תוכנית..." className="pr-10" />
          </div>
          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 shrink-0">
            {[{ k: 'all', l: 'הכל' }, { k: 'draft', l: 'טיוטות' }, { k: 'active', l: 'פעילות' }, { k: 'archived', l: 'ארכיון' }].map(f => (
              <button key={f.k} onClick={() => setStatusFilter(f.k)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${statusFilter === f.k ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {f.l}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <Card className="p-10 text-center border-2 border-dashed border-slate-200">
            <Dumbbell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">{programs.length === 0 ? 'אין תוכניות עדיין' : 'אין תוצאות'}</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map(prog => {
              const st = STATUS_LABELS[prog.status] || STATUS_LABELS.draft;
              const wkCount = prog.workouts?.length || 0;
              const trainee = trainees.find(t => t.user_email === prog.trainee_email || t.id === prog.trainee_id);

              return (
                <Card key={prog.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-800">{prog.name || 'ללא שם'}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                        {trainee && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {trainee.full_name || trainee.user_email}
                          </span>
                        )}
                        <span>{wkCount} אימונים</span>
                        {prog.duration_weeks && <span>{prog.duration_weeks} שבועות</span>}
                        {prog.frequency_week && <span>{prog.frequency_week}×/שבוע</span>}
                      </div>
                      {prog.objective && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-1">{prog.objective}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {prog.status === 'draft' && prog.trainee_email && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white text-xs h-8 px-2"
                          onClick={() => changeStatusMutation.mutate({ id: prog.id, status: 'active' })}>
                          <Send className="w-3 h-3 ml-1" />
                          שלח
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="w-8 h-8 text-blue-600" onClick={() => openEdit(prog)} title="ערוך">
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="w-8 h-8 text-slate-500" onClick={() => duplicateMutation.mutate(prog)} title="שכפל">
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      {prog.status !== 'archived' ? (
                        <Button size="icon" variant="ghost" className="w-8 h-8 text-slate-400" onClick={() => changeStatusMutation.mutate({ id: prog.id, status: 'archived' })} title="ארכיון">
                          <Archive className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <Button size="icon" variant="ghost" className="w-8 h-8 text-blue-400" onClick={() => changeStatusMutation.mutate({ id: prog.id, status: 'draft' })} title="שחזר">
                          <ArchiveRestore className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={showForm} onOpenChange={o => { if (!o) { setShowForm(false); setEditingProgram(null); } }}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProgram ? 'עריכת תוכנית' : 'תוכנית חדשה'}</DialogTitle>
          </DialogHeader>
          <ProgramForm
            program={editingProgram}
            trainees={trainees}
            exerciseBank={exerciseBank}
            onSave={(form) => saveProgramMutation.mutate(form)}
            onClose={() => { setShowForm(false); setEditingProgram(null); }}
            isPending={saveProgramMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
