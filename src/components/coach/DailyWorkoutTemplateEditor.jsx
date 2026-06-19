import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Send, X, Link2 } from "lucide-react";
import { toast } from 'sonner';
import { ExerciseSupersetBadge, getGroups, GROUP_COLORS, GROUP_LABELS } from './SupersetManager';

const WORKOUT_TYPES = [
  { value: 'strength', label: '💪 כוח' },
  { value: 'pilates', label: '🧘 פילאטיס' },
  { value: 'functional', label: '⚡ פונקציונלי' },
  { value: 'cardio', label: '🏃 קרדיו' },
  { value: 'mobility', label: '🌿 מוביליטי' },
  { value: 'home', label: '🏠 ביתי' },
  { value: 'mixed', label: '🔀 מעורב' },
];

const DIFFICULTY = [
  { value: 'easy', label: 'קל' },
  { value: 'medium', label: 'בינוני' },
  { value: 'hard', label: 'קשה' },
];

export default function DailyWorkoutTemplateEditor({ 
  open, 
  onClose, 
  date, 
  coachEmail, 
  editingTemplate = null,
  exerciseLibrary = []
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [workoutType, setWorkoutType] = useState('strength');
  const [difficulty, setDifficulty] = useState('medium');
  const [duration, setDuration] = useState('');
  const [exercises, setExercises] = useState([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (editingTemplate) {
      setTitle(editingTemplate.title || '');
      setDescription(editingTemplate.description || '');
      setWorkoutType(editingTemplate.workout_type || 'strength');
      setDifficulty(editingTemplate.difficulty || 'medium');
      setDuration(editingTemplate.estimated_duration_minutes || '');
      setExercises(editingTemplate.exercises || []);
    } else {
      setTitle('');
      setDescription('');
      setWorkoutType('strength');
      setDifficulty('medium');
      setDuration('');
      setExercises([]);
    }
  }, [editingTemplate, open]);

  const saveMutation = useMutation({
    mutationFn: async ({ publish }) => {
      if (!title.trim()) throw new Error('יש להזין כותרת');
      if (exercises.length === 0) throw new Error('יש להוסיף לפחות תרגיל אחד');

      const data = {
        date,
        coach_email: coachEmail,
        title: title.trim(),
        exercises: JSON.stringify(exercises),
        ...(publish ? { status: 'published' } : { status: 'draft' }),
      };

      if (editingTemplate) {
        await base44.entities.DailyWorkoutTemplate.update(editingTemplate.id, data);
      } else {
        await base44.entities.DailyWorkoutTemplate.create(data);
      }
    },
    onSuccess: (_, { publish }) => {
      queryClient.invalidateQueries({ queryKey: ['dailyWorkoutTemplates'] });
      toast.success(publish ? '✅ האימון פורסם בהצלחה!' : '💾 האימון נשמר כטיוטה');
      onClose();
    },
    onError: (err) => {
      toast.error(`❌ ${err.message}`);
    },
  });

  const addExercise = (ex) => {
    setExercises(prev => [...prev, {
      exercise_name: ex.name_he || ex.name || ex,
      sets: ex.default_sets || 4,
      set_type: 'reps',
      reps_min: ex.default_reps_min || null,
      reps_max: ex.default_reps_max || null,
      notes: '',
      // group fields left undefined — standalone by default
    }]);
    setShowExercisePicker(false);
    setSearchTerm('');
  };

  const addCustomExercise = () => {
    if (!searchTerm.trim()) return;
    addExercise({ name_he: searchTerm.trim() });
  };

  const removeExercise = (idx) => setExercises(prev => prev.filter((_, i) => i !== idx));

  const updateExercise = (idx, field, val) => {
    setExercises(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: val };
      return updated;
    });
  };

  const filteredLib = exerciseLibrary.filter(ex => {
    if (!searchTerm.trim()) return true;
    const name = (ex.name_he || ex.name || '').toLowerCase();
    return name.includes(searchTerm.toLowerCase());
  }).slice(0, 30);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-orange-700">
            {editingTemplate ? '✏️ עריכת אימון' : '➕ אימון חדש'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>כותרת האימון *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="לדוגמה: אימון כוח קבוצתי" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>סוג</Label>
              <Select value={workoutType} onValueChange={setWorkoutType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WORKOUT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>רמת קושי</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIFFICULTY.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>משך משוער (דק׳)</Label>
              <Input type="number" value={duration} onChange={e => setDuration(e.target.value)} placeholder="45" />
            </div>
          </div>

          <div>
            <Label>תיאור / הערות</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="הערות כלליות..." />
          </div>

          {/* Exercises */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>תרגילים ({exercises.length})</Label>
              <Button size="sm" onClick={() => setShowExercisePicker(true)}>
                <Plus className="w-4 h-4 ml-1" /> הוסף תרגיל
              </Button>
            </div>

            {exercises.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4 border rounded-lg border-dashed">טרם נוספו תרגילים</p>
            ) : (
              <div className="space-y-1">
                {exercises.map((ex, idx) => {
                  const isGrouped = !!ex.group_id;
                  const colors = isGrouped ? GROUP_COLORS[ex.group_type] || GROUP_COLORS.superset : null;
                  const groups = getGroups(exercises);
                  const groupMeta = isGrouped ? groups[ex.group_id] : null;
                  const isFirstInGroup = isGrouped && groupMeta?.indices?.[0] === idx;
                  const isLastInGroup = isGrouped && groupMeta?.indices?.[groupMeta.indices.length - 1] === idx;

                  return (
                    <div
                      key={idx}
                      className={`relative ${
                        isGrouped
                          ? `border-r-4 ${colors.border} ${isFirstInGroup ? 'rounded-t-xl' : ''} ${isLastInGroup ? 'rounded-b-xl mb-1' : 'border-b border-dashed border-slate-200'}`
                          : 'rounded-xl mb-1'
                      } p-3 bg-white border border-slate-200`}
                    >
                      {/* Group label header — only on first exercise */}
                      {isFirstInGroup && (
                        <div className={`flex items-center gap-2 mb-2 pb-2 border-b ${colors.border}`}>
                          <Link2 className={`w-3 h-3 ${colors.text}`} />
                          <span className={`text-xs font-bold ${colors.text}`}>
                            {GROUP_LABELS[ex.group_type]} {ex.group_label}
                          </span>
                          {/* Round/rest config on first exercise */}
                          <div className="flex items-center gap-2 mr-auto">
                            <span className="text-xs text-slate-500">סבבים:</span>
                            <input
                              type="number"
                              value={ex.round_count || 3}
                              onChange={e => {
                                const val = parseInt(e.target.value) || 3;
                                setExercises(prev => prev.map(item =>
                                  item.group_id === ex.group_id ? { ...item, round_count: val } : item
                                ));
                              }}
                              className="w-12 h-6 text-xs border border-slate-200 rounded text-center"
                              min={1} max={10}
                            />
                            <span className="text-xs text-slate-500">מנוחה:</span>
                            <input
                              type="number"
                              value={ex.rest_after_round_seconds || 60}
                              onChange={e => {
                                const val = parseInt(e.target.value) || 60;
                                setExercises(prev => prev.map(item =>
                                  item.group_id === ex.group_id ? { ...item, rest_after_round_seconds: val } : item
                                ));
                              }}
                              className="w-14 h-6 text-xs border border-slate-200 rounded text-center"
                              min={0} max={300}
                              step={15}
                            />
                            <span className="text-xs text-slate-400">שנ׳</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {isGrouped && (
                            <span className={`w-6 h-6 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${colors.badge}`}>
                              {ex.group_label}{ex.group_order || ''}
                            </span>
                          )}
                          <span className="font-medium text-sm text-slate-800">
                            {!isGrouped && `${idx + 1}. `}{ex.exercise_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <ExerciseSupersetBadge
                            exercise={ex}
                            idx={idx}
                            exercises={exercises}
                            onUpdate={setExercises}
                          />
                          <button onClick={() => removeExercise(idx)} className="text-red-400 hover:text-red-600 p-1">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">סטים</Label>
                          <Input type="number" value={ex.sets || 4} onChange={e => updateExercise(idx, 'sets', parseInt(e.target.value) || 4)} className="h-8 text-sm" min={1} max={20} />
                        </div>
                        <div>
                          <Label className="text-xs">חז׳ מינ</Label>
                          <Input type="number" value={ex.reps_min || ''} onChange={e => updateExercise(idx, 'reps_min', e.target.value ? parseInt(e.target.value) : null)} className="h-8 text-sm" placeholder="8" />
                        </div>
                        <div>
                          <Label className="text-xs">חז׳ מקס</Label>
                          <Input type="number" value={ex.reps_max || ''} onChange={e => updateExercise(idx, 'reps_max', e.target.value ? parseInt(e.target.value) : null)} className="h-8 text-sm" placeholder="12" />
                        </div>
                      </div>
                      <div className="mt-2">
                        <Input value={ex.notes || ''} onChange={e => updateExercise(idx, 'notes', e.target.value)} placeholder="הערות לתרגיל..." className="h-8 text-sm" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => saveMutation.mutate({ publish: true })}
              disabled={saveMutation.isPending || !title.trim() || exercises.length === 0}
              className="flex-1 bg-orange-500 hover:bg-orange-600"
            >
              <Send className="w-4 h-4 ml-1" />
              {editingTemplate?.is_published ? 'עדכן ופרסם' : 'פרסם'}
            </Button>
            <Button
              variant="outline"
              onClick={() => saveMutation.mutate({ publish: false })}
              disabled={saveMutation.isPending || !title.trim()}
            >
              שמור טיוטה
            </Button>
          </div>
        </div>

        {/* Exercise picker sub-dialog */}
        <Dialog open={showExercisePicker} onOpenChange={setShowExercisePicker}>
          <DialogContent className="max-w-sm max-h-[70vh] flex flex-col" dir="rtl">
            <DialogHeader>
              <DialogTitle>בחר תרגיל</DialogTitle>
            </DialogHeader>
            <Input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="חפש תרגיל..."
              className="mb-2"
              autoFocus
            />
            <div className="flex-1 overflow-y-auto divide-y border rounded-lg">
              {searchTerm.trim() && (
                <button
                  onClick={addCustomExercise}
                  className="w-full text-right p-3 hover:bg-orange-50 text-sm font-medium text-orange-600"
                >
                  ➕ הוסף "{searchTerm}" כתרגיל חדש
                </button>
              )}
              {filteredLib.map(ex => (
                <button
                  key={ex.id}
                  onClick={() => addExercise(ex)}
                  className="w-full text-right p-3 hover:bg-orange-50 text-sm"
                >
                  {ex.name_he || ex.name}
                  {ex.muscle_group_primary && (
                    <span className="text-xs text-slate-400 mr-2">· {ex.muscle_group_primary}</span>
                  )}
                </button>
              ))}
              {filteredLib.length === 0 && !searchTerm.trim() && (
                <p className="text-sm text-slate-400 text-center py-6">הקלד לחיפוש תרגיל</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}