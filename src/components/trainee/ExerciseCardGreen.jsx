import React, { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from '@/api/base44Client';
import { Loader2, Plus, Copy, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ExerciseCardGreen({ 
  exercise, 
  traineeEmail, 
  workoutDate, 
  onSaveSuccess 
}) {
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastPerformance, setLastPerformance] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Load previous performance
  useEffect(() => {
    loadLastPerformance();
  }, [exercise.exercise_id, exercise.name]);

  const loadLastPerformance = async () => {
    try {
      setLoadingHistory(true);
      console.log('[ExerciseCardGreen] LOAD_LAST_TIME_START');
      
      const response = await base44.functions.invoke('getLastExercisePerformance', {
        trainee_email: traineeEmail,
        exercise_id: exercise.exercise_id || null,
        exercise_name: exercise.name || exercise.exercise_name
      });

      if (response.data?.success) {
        setLastPerformance(response.data.data);
        console.log('[ExerciseCardGreen] LOAD_LAST_TIME_SUCCESS:', response.data.data);
      } else {
        console.log('[ExerciseCardGreen] LOAD_LAST_TIME_EMPTY');
        setLastPerformance({ date: null, sets: [], summary: 'אין נתונים קודמים' });
      }
    } catch (error) {
      console.error('[ExerciseCardGreen] LOAD_LAST_TIME_ERROR:', error);
      setLastPerformance({ date: null, sets: [], summary: 'שגיאה בטעינה' });
    } finally {
      setLoadingHistory(false);
    }
  };

  // Initialize sets
  useEffect(() => {
    if (exercise.sets && Array.isArray(exercise.sets) && exercise.sets.length > 0) {
      setSets(exercise.sets.map((s, i) => ({
        setIndex: i + 1,
        weight: s.weight || '',
        reps: s.reps || '',
        reps_min: s.reps_min || null,
        reps_max: s.reps_max || null
      })));
    } else {
      // Support both sets_count (old) and sets (number from DailyWorkout)
      const defaultSetsCount = exercise.sets_count || (typeof exercise.sets === 'number' ? exercise.sets : null) || 3;
      setSets(Array.from({ length: defaultSetsCount }, (_, i) => ({
        setIndex: i + 1,
        weight: '',
        reps: '',
        reps_min: exercise.reps_min || exercise.target_reps_min || null,
        reps_max: exercise.reps_max || exercise.target_reps_max || null
      })));
    }
  }, [exercise]);

  const updateSet = (index, field, value) => {
    const updated = [...sets];
    updated[index][field] = value;
    setSets(updated);
  };

  const addSet = () => {
    setSets([...sets, { 
      setIndex: sets.length + 1, 
      weight: '', 
      reps: '',
      reps_min: exercise.reps_min || null,
      reps_max: exercise.reps_max || null
    }]);
  };

  const copyLastTime = () => {
    if (!lastPerformance || !lastPerformance.sets || lastPerformance.sets.length === 0) {
      toast.error('אין נתונים קודמים להעתקה');
      return;
    }

    const copiedSets = lastPerformance.sets.map((s, i) => ({
      setIndex: i + 1,
      weight: s.weight,
      reps: s.reps,
      reps_min: exercise.reps_min || null,
      reps_max: exercise.reps_max || null
    }));

    setSets(copiedSets);
    toast.success('הועתק מהפעם הקודמת');
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      console.log('[ExerciseCardGreen] SAVE_EXERCISE_START');

      // Validate all sets have data
      const validSets = sets.filter(s => s.weight && s.reps);
      
      if (validSets.length === 0) {
        toast.error('יש למלא לפחות סט אחד');
        setSaving(false);
        return;
      }

      const response = await base44.functions.invoke('saveExerciseProgress', {
        trainee_email: traineeEmail,
        date: workoutDate,
        exercise_id: exercise.exercise_id || null,
        exercise_name: exercise.name || exercise.exercise_name,
        sets: validSets
      });

      if (response.data?.success) {
        console.log('[ExerciseCardGreen] SAVE_EXERCISE_SUCCESS');
        toast.success('✅ התרגיל נשמר');
        if (onSaveSuccess) onSaveSuccess();
      } else {
        throw new Error(response.data?.error || 'Save failed');
      }
    } catch (error) {
      console.error('[ExerciseCardGreen] SAVE_EXERCISE_ERROR:', error);
      toast.error(`שגיאה: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const exerciseName = exercise.name || exercise.exercise_name || 'תרגיל';

  return (
    <Card className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 shadow-md">
      {/* Exercise Name */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-green-800">{exerciseName}</h3>
        {exercise.video_link && (
          <a 
            href={exercise.video_link} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-blue-600 underline"
          >
            📹 וידאו
          </a>
        )}
      </div>

      {exercise.notes && (
        <p className="text-sm text-green-700 mb-3 bg-green-100 p-2 rounded">
          💡 {exercise.notes}
        </p>
      )}

      {/* Previous Workout */}
      <div className="mb-4 p-3 bg-white/70 rounded-lg border border-green-300">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-green-700">🕐 פעם קודמת:</p>
          {loadingHistory && <Loader2 className="w-3 h-3 animate-spin text-green-600" />}
        </div>
        
        {loadingHistory ? (
          <p className="text-xs text-slate-500">טוען...</p>
        ) : !lastPerformance || lastPerformance.sets.length === 0 ? (
          <p className="text-xs text-slate-500">אין נתונים קודמים</p>
        ) : (
          <div className="space-y-1">
            <p className="text-xs text-slate-600 mb-1">{lastPerformance.date}</p>
            {lastPerformance.sets.map((set, i) => (
              <div key={i} className="text-xs text-slate-700 flex gap-2">
                <span className="font-medium">סט {i + 1}:</span>
                <span>{set.weight}kg × {set.reps} חזרות</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Today's Workout Input */}
      <div className="space-y-2 mb-4">
        <Label className="text-sm font-bold text-green-800">📝 אימון היום:</Label>
        {sets.map((set, index) => (
          <div key={index} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-green-200">
            <span className="text-xs font-medium text-slate-600 w-12">סט {set.setIndex}</span>
            <div className="flex-1 flex gap-2">
              <div className="flex-1">
                <Input
                  type="number"
                  value={set.weight}
                  onChange={(e) => updateSet(index, 'weight', e.target.value)}
                  placeholder="משקל"
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex-1">
                <Input
                  type="number"
                  value={set.reps}
                  onChange={(e) => updateSet(index, 'reps', e.target.value)}
                  placeholder="חזרות"
                  className="h-9 text-sm"
                />
              </div>
            </div>
            {set.reps_min && set.reps_max && (
              <span className="text-xs text-slate-500 whitespace-nowrap">
                ({set.reps_min}-{set.reps_max})
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={addSet}
          variant="outline"
          size="sm"
          className="flex-1 border-green-300 text-green-700 hover:bg-green-100"
        >
          <Plus className="w-4 h-4 ml-1" />
          הוסף סט
        </Button>
        
        <Button
          onClick={copyLastTime}
          variant="outline"
          size="sm"
          className="flex-1 border-blue-300 text-blue-700 hover:bg-blue-100"
          disabled={!lastPerformance || lastPerformance.sets.length === 0 || loadingHistory}
        >
          <Copy className="w-4 h-4 ml-1" />
          העתק מהפעם הקודמת
        </Button>

        <Button
          onClick={handleSave}
          size="sm"
          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 ml-1 animate-spin" />
          ) : (
            <Save className="w-4 h-4 ml-1" />
          )}
          שמור
        </Button>
      </div>
    </Card>
  );
}