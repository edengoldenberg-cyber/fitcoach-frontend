import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Copy, Loader2, Save, CheckCircle, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const toNumberString = (value) => (value === 0 || value ? String(value) : '');

export default function ExerciseCardV2({ exercise, traineeEmail, traineeId, workoutDate, workoutId, onSaveSuccess, onVolumeChange }) {
  const [expanded, setExpanded] = useState(true);
  const [sets, setSets] = useState([]);
  const [lastPerformance, setLastPerformance] = useState(null);
  const [savedCurrentSets, setSavedCurrentSets] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [debug, setDebug] = useState({ lastSavedPayload: null, saveResponse: null, historyResult: null, error: null });

  const exerciseName = exercise.name || exercise.exercise_name || 'תרגיל';
  const exerciseId = exercise.exercise_id || exercise.id || null;
  const exerciseKey = `${workoutDate || ''}:${workoutId || ''}:${exerciseId || ''}:${exerciseName}`;

  const plannedSets = useMemo(() => {
    if (Array.isArray(exercise.sets) && exercise.sets.length > 0) {
      return exercise.sets.map((set, index) => ({
        set_number: index + 1,
        setIndex: index + 1,
        weight: toNumberString(set.weight),
        reps: toNumberString(set.reps),
        reps_min: set.reps_min || exercise.reps_min || exercise.target_reps_min || null,
        reps_max: set.reps_max || exercise.reps_max || exercise.target_reps_max || null,
        completed: Boolean(set.completed),
        notes: set.notes || ''
      }));
    }

    const count = exercise.sets_count || (typeof exercise.sets === 'number' ? exercise.sets : null) || 3;
    return Array.from({ length: count }, (_, index) => ({
      set_number: index + 1,
      setIndex: index + 1,
      weight: '',
      reps: '',
      reps_min: exercise.reps_min || exercise.target_reps_min || null,
      reps_max: exercise.reps_max || exercise.target_reps_max || null,
      completed: false,
      notes: ''
    }));
  }, [exerciseKey, exercise.sets_count, exercise.reps_min, exercise.reps_max, exercise.target_reps_min, exercise.target_reps_max]);

  useEffect(() => {
    loadLastPerformance();
  }, [exerciseKey, traineeEmail]);

  useEffect(() => {
    const sourceSets = savedCurrentSets.length > 0 ? savedCurrentSets : plannedSets;
    setSets(sourceSets.map((set, index) => ({
      set_number: index + 1,
      setIndex: index + 1,
      weight: toNumberString(set.weight),
      reps: toNumberString(set.reps),
      reps_min: set.reps_min || plannedSets[index]?.reps_min || null,
      reps_max: set.reps_max || plannedSets[index]?.reps_max || null,
      completed: Boolean(set.completed),
      notes: set.notes || ''
    })));
    setSaved(savedCurrentSets.length > 0);
  }, [exerciseKey, savedCurrentSets, plannedSets]);

  useEffect(() => {
    if (onVolumeChange) {
      const volume = sets.reduce((sum, set) => {
        const weight = Number.parseFloat(set.weight) || 0;
        const reps = Number.parseInt(set.reps, 10) || 0;
        return sum + weight * reps;
      }, 0);
      onVolumeChange(volume);
    }
  }, [sets, onVolumeChange]);

  const loadLastPerformance = async () => {
    try {
      setLoadingHistory(true);
      const response = await base44.functions.invoke('getLastExercisePerformance', {
        trainee_email: traineeEmail,
        exercise_id: exerciseId,
        exercise_name: exerciseName,
        date: workoutDate,
        current_date: workoutDate
      });

      const data = response.data?.data || { date: null, sets: [], current_sets: [], summary: 'אין היסטוריה עדיין' };
      setLastPerformance(data);
      setSavedCurrentSets(Array.isArray(data.current_sets) ? data.current_sets : []);
      setDebug(prev => ({ ...prev, historyResult: data, error: null }));
    } catch (error) {
      const fallback = { date: null, sets: [], current_sets: [], summary: 'שגיאה בטעינת היסטוריה' };
      setLastPerformance(fallback);
      setDebug(prev => ({ ...prev, historyResult: fallback, error: error.message }));
    } finally {
      setLoadingHistory(false);
    }
  };

  const updateSet = (index, field, value) => {
    setSaved(false);
    setSets(prev => prev.map((set, currentIndex) => currentIndex === index ? { ...set, [field]: value } : set));
  };

  const repeatLastSet = (index) => {
    const source = index > 0 ? sets[index - 1] : lastPerformance?.sets?.[0];
    if (!source) {
      toast.error('אין סט קודם לשכפול');
      return;
    }

    setSets(prev => prev.map((set, currentIndex) => currentIndex === index ? {
      ...set,
      weight: toNumberString(source.weight),
      reps: toNumberString(source.reps)
    } : set));
    setSaved(false);
  };

  const addWeight = (index, delta) => {
    const current = Number.parseFloat(sets[index]?.weight) || 0;
    updateSet(index, 'weight', String(Math.max(0, current + delta)));
  };

  const toggleCompleted = (index) => {
    setSaved(false);
    setSets(prev => prev.map((set, currentIndex) => currentIndex === index ? { ...set, completed: !set.completed } : set));
  };

  const duplicateSet = (index) => {
    const source = sets[index];
    setSets(prev => [...prev, { ...source, set_number: prev.length + 1, setIndex: prev.length + 1, completed: false }]);
    setSaved(false);
  };

  const removeSet = (index) => {
    setSets(prev => prev.filter((_, currentIndex) => currentIndex !== index).map((set, nextIndex) => ({ ...set, set_number: nextIndex + 1, setIndex: nextIndex + 1 })));
    setSaved(false);
  };

  const addSet = () => {
    const last = sets[sets.length - 1];
    setSets(prev => [...prev, {
      set_number: prev.length + 1,
      setIndex: prev.length + 1,
      weight: last?.weight || '',
      reps: last?.reps || '',
      reps_min: exercise.reps_min || exercise.target_reps_min || null,
      reps_max: exercise.reps_max || exercise.target_reps_max || null,
      completed: false,
      notes: ''
    }]);
    setSaved(false);
  };

  const copyLastTime = () => {
    if (!lastPerformance?.sets?.length) {
      toast.error('אין היסטוריה עדיין');
      return;
    }

    setSets(lastPerformance.sets.map((set, index) => ({
      set_number: index + 1,
      setIndex: index + 1,
      weight: toNumberString(set.weight),
      reps: toNumberString(set.reps),
      reps_min: exercise.reps_min || exercise.target_reps_min || null,
      reps_max: exercise.reps_max || exercise.target_reps_max || null,
      completed: false,
      notes: set.notes || ''
    })));
    setSaved(false);
    toast.success('הועתק מהפעם הקודמת');
  };

  const buildSavePayload = () => ({
    trainee_id: traineeId || null,
    trainee_email: traineeEmail,
    workout_id: workoutId || null,
    date: workoutDate,
    exercise_id: exerciseId,
    exercise_name: exerciseName,
    sets: sets.map((set, index) => ({
      set_number: index + 1,
      setIndex: index + 1,
      weight: set.weight === '' ? 0 : Number.parseFloat(set.weight) || 0,
      reps: set.reps === '' ? 0 : Number.parseInt(set.reps, 10) || 0,
      completed: Boolean(set.completed),
      notes: set.notes || ''
    }))
  });

  const handleSave = async () => {
    if (saving) return;
    const payload = buildSavePayload();
    const hasAnySetData = payload.sets.some((set) => set.weight > 0 || set.reps > 0);
    if (!hasAnySetData) {
      toast.error('יש למלא לפחות סט אחד');
      return;
    }

    try {
      setSaving(true);
      setDebug(prev => ({ ...prev, lastSavedPayload: payload, saveResponse: null, error: null }));
      const response = await base44.functions.invoke('saveExerciseProgress', payload);
      setDebug(prev => ({ ...prev, saveResponse: response.data, error: null }));

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'שגיאה בשמירה');
      }

      setSaved(true);
      setSavedCurrentSets(response.data.sets || payload.sets);
      toast.success('✅ התרגיל נשמר');
      if (onSaveSuccess) onSaveSuccess(response.data);
    } catch (error) {
      setDebug(prev => ({ ...prev, error: error.message }));
      toast.error(`שגיאה: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const copyDebugJson = async () => {
    const debugJson = {
      workout_id: workoutId || null,
      exercise_id: exerciseId,
      exercise_name: exerciseName,
      sets_local_state: sets,
      last_saved_payload: debug.lastSavedPayload,
      save_response: debug.saveResponse,
      history_query_result: debug.historyResult,
      error: debug.error
    };
    await navigator.clipboard.writeText(JSON.stringify(debugJson, null, 2));
    toast.success('Workout Debug JSON הועתק');
  };

  const completedSets = sets.filter(set => set.completed).length;
  const totalSets = sets.length;
  const hasData = sets.some(set => set.weight !== '' || set.reps !== '');
  const previousSummary = !loadingHistory && lastPerformance?.sets?.length
    ? lastPerformance.sets.slice(0, 2).map(set => `${set.weight}kg × ${set.reps}`).join(', ')
    : null;
  const currentSavedSummary = !loadingHistory && savedCurrentSets?.length
    ? savedCurrentSets.filter(set => (Number(set.weight) || 0) > 0 || (Number(set.reps) || 0) > 0).slice(0, 2).map(set => `${set.weight}kg × ${set.reps}`).join(', ')
    : null;

  return (
    <div className={`rounded-2xl border-2 transition-all duration-200 overflow-hidden shadow-sm ${
      saved ? 'border-green-400 bg-green-50' : expanded ? 'border-orange-300 bg-white shadow-md' : 'border-slate-200 bg-white'
    }`}>
      <button className="w-full flex items-center justify-between px-4 py-3 text-right" onClick={() => setExpanded(value => !value)}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${saved ? 'bg-green-500' : completedSets > 0 ? 'bg-orange-400' : 'bg-slate-300'}`} />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800 text-sm truncate">{exerciseName}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-slate-500">{totalSets} סטים</span>
              {previousSummary && <span className="text-xs text-slate-400 truncate">· {previousSummary}</span>}
              {completedSets > 0 && <span className="text-xs text-orange-600 font-medium">{completedSets}/{totalSets} ✓</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {saved && <CheckCircle className="w-4 h-4 text-green-500" />}
          {!saved && hasData && (
            <button
              disabled={saving}
              onClick={event => { event.stopPropagation(); handleSave(); }}
              className="px-3 py-1 bg-green-500 text-white text-xs rounded-full font-medium disabled:opacity-60"
            >
              {saving ? 'שומר...' : 'שמור'}
            </button>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100">
          {exercise.notes && <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 mt-3">💡 {exercise.notes}</div>}

          <div className="bg-slate-50 rounded-xl px-3 py-2">
            {loadingHistory ? (
              <span className="text-xs text-slate-500">טוען היסטוריה...</span>
            ) : lastPerformance?.sets?.length > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">🕐 פעם קודמת: {previousSummary}</span>
                  <button onClick={copyLastTime} className="text-xs text-blue-600 font-medium flex items-center gap-1">
                    <Copy className="w-3 h-3" /> העתק
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {lastPerformance.sets.map((set, index) => (
                    <span key={index} className="text-xs bg-slate-200 px-2 py-0.5 rounded-full text-slate-700">
                      {set.weight}kg × {set.reps}
                    </span>
                  ))}
                </div>
              </>
            ) : currentSavedSummary ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-green-700">✅ נשמר היום: {currentSavedSummary}</span>
                <span className="text-[11px] text-slate-400">היסטוריה מאימון קודם תופיע אחרי האימון הבא</span>
              </div>
            ) : (
              <span className="text-xs text-slate-500">אין היסטוריה עדיין</span>
            )}
          </div>

          <div className="space-y-2">
            {sets.map((set, index) => (
              <SetRow
                key={`${exerciseKey}_${index}`}
                set={set}
                index={index}
                onUpdate={(field, value) => updateSet(index, field, value)}
                onRepeatLast={() => repeatLastSet(index)}
                onAddWeight={delta => addWeight(index, delta)}
                onToggleComplete={() => toggleCompleted(index)}
                onDuplicate={() => duplicateSet(index)}
                onRemove={() => removeSet(index)}
              />
            ))}
          </div>

          <button onClick={addSet} className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:border-orange-300 hover:text-orange-500 transition-colors">
            <Plus className="w-4 h-4" /> הוסף סט
          </button>

          <Button onClick={handleSave} disabled={saving || !hasData} className={`w-full h-11 text-sm font-bold ${saved ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-500 hover:bg-orange-600'} text-white`}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Save className="w-4 h-4 ml-2" />}
            {saved ? '✅ נשמר' : 'שמור תרגיל'}
          </Button>

          <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold">Workout Debug</summary>
            <div className="mt-2 space-y-1 overflow-auto max-h-52" dir="ltr">
              <pre>{JSON.stringify({ workout_id: workoutId || null, exercise_id: exerciseId, sets_local_state: sets, last_saved_payload: debug.lastSavedPayload, save_response: debug.saveResponse, history_query_result: debug.historyResult, error: debug.error }, null, 2)}</pre>
            </div>
            <button onClick={copyDebugJson} className="mt-2 w-full rounded-lg bg-slate-800 text-white py-2 text-xs font-semibold">
              Copy Workout Debug JSON
            </button>
          </details>
        </div>
      )}
    </div>
  );
}

function SetRow({ set, index, onUpdate, onRepeatLast, onAddWeight, onToggleComplete, onDuplicate, onRemove }) {
  return (
    <div className={`rounded-xl border transition-all ${set.completed ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-xs font-bold text-slate-500 w-8 text-center">{index + 1}</span>
        <input
          type="number"
          inputMode="decimal"
          value={set.weight}
          onChange={event => onUpdate('weight', event.target.value)}
          placeholder="kg"
          className="min-w-0 flex-1 h-11 text-center text-base font-bold border-2 border-slate-300 rounded-lg bg-white focus:border-orange-400 focus:outline-none"
        />
        <span className="text-slate-400 text-sm">×</span>
        <input
          type="number"
          inputMode="numeric"
          value={set.reps}
          onChange={event => onUpdate('reps', event.target.value)}
          placeholder={set.reps_min && set.reps_max ? `${set.reps_min}-${set.reps_max}` : 'חזרות'}
          className="min-w-0 flex-1 h-11 text-center text-base font-bold border-2 border-slate-300 rounded-lg bg-white focus:border-orange-400 focus:outline-none"
        />
        <button onClick={onToggleComplete} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${set.completed ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
          <CheckCircle className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-1 px-3 pb-2">
        <button onClick={onRepeatLast} className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
          חזור
        </button>
        <button onClick={() => onAddWeight(2.5)} className="text-[10px] px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">+2.5</button>
        <button onClick={() => onAddWeight(5)} className="text-[10px] px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">+5</button>
        <button onClick={() => onAddWeight(-2.5)} className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">-2.5</button>
        <div className="flex-1" />
        <button onClick={onDuplicate} className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">שכפל</button>
        <button onClick={onRemove} className="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-red-400">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}