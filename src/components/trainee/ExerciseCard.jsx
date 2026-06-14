import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Save, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

export default function ExerciseCard({ 
  exercise, 
  index, 
  previousData,
  onSave 
}) {
  const [sets, setSets] = useState(() => {
    // Normalize sets data - handle undefined/object/array
    const rawSets = exercise?.sets;
    let normalizedSets = [];
    
    if (Array.isArray(rawSets)) {
      normalizedSets = rawSets;
    } else if (rawSets && typeof rawSets === 'object') {
      // Convert object to array
      normalizedSets = Object.values(rawSets);
    }
    
    // If we have normalized sets, use them
    if (normalizedSets.length > 0) {
      return normalizedSets.map((s, idx) => ({
        weight: s?.weight ?? '',
        reps: s?.reps ?? '',
        setIndex: idx + 1
      }));
    }
    
    // Otherwise create default sets
    const numSets = exercise?.default_sets_count || exercise?.sets_count || 3;
    return Array.from({ length: numSets }, (_, idx) => ({
      weight: '',
      reps: '',
      setIndex: idx + 1
    }));
  });

  // PHASE 3 — re-hydrate sets when exercise prop changes (e.g. coach updates template)
  // Guard: only sync if no in-progress edits (all fields still empty or default)
  useEffect(() => {
    const hasUserEdits = sets.some(s => s.weight !== '' && s.weight !== 0);
    if (hasUserEdits) return; // do not overwrite user input

    const rawSets = exercise?.sets;
    let normalized = [];
    if (Array.isArray(rawSets) && rawSets.length > 0) {
      normalized = rawSets.map((s, idx) => ({ weight: s?.weight ?? '', reps: s?.reps ?? '', setIndex: idx + 1 }));
    } else if (rawSets && typeof rawSets === 'object' && !Array.isArray(rawSets)) {
      normalized = Object.values(rawSets).map((s, idx) => ({ weight: s?.weight ?? '', reps: s?.reps ?? '', setIndex: idx + 1 }));
    }
    if (normalized.length > 0) {
      setSets(normalized);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise]);

  const [saving, setSaving] = useState(false);

  const updateSet = (index, field, value) => {
    const updated = [...sets];
    updated[index][field] = value;
    setSets(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(exercise, sets);
      toast.success('נשמר ✅', {
        description: new Date().toLocaleTimeString('he-IL', { 
          hour: '2-digit', 
          minute: '2-digit' 
        })
      });
    } catch (error) {
      toast.error('שגיאה בשמירה', {
        description: error.message
      });
    } finally {
      setSaving(false);
    }
  };

  const hasData = sets.some(s => s.weight || s.reps);

  return (
    <Card className="p-4 bg-white border-2 border-slate-200" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-bold">
              {index + 1}
            </div>
            <h3 className="font-bold text-lg text-slate-800">
              {exercise.exercise_name || exercise.name}
            </h3>
          </div>
          
          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge variant="secondary" className="bg-blue-50 text-blue-700">
              {sets.length} סטים
            </Badge>
            {exercise.target_reps_min && exercise.target_reps_max && (
              <Badge variant="secondary" className="bg-purple-50 text-purple-700">
                {exercise.target_reps_min}–{exercise.target_reps_max} חזרות
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Exercise History - Last 3 Workouts */}
      {previousData && Array.isArray(previousData) && previousData.length > 0 ? (
        <div className="mb-4 p-3 bg-gradient-to-l from-green-50 to-emerald-50 rounded-lg border-2 border-green-300">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <span className="text-xs font-bold text-green-800">היסטוריית אימונים ({previousData.length})</span>
          </div>
          <div className="space-y-2">
            {previousData.slice(0, 3).map((workout, workoutIdx) => (
              <div key={workoutIdx} className="bg-white/70 rounded-lg p-2 border border-green-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-green-700">
                    אימון {workoutIdx + 1}
                  </span>
                  <span className="text-xs text-green-600">
                    {new Date(workout.date).toLocaleDateString('he-IL')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {workout.sets && Array.isArray(workout.sets) && workout.sets.map((set, setIdx) => (
                    <Badge key={setIdx} className="bg-green-100 text-green-800 border-green-300 text-xs font-medium">
                      {set.weight}kg × {set.reps}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
          <span className="text-xs text-slate-500">אין היסטוריה עדיין</span>
        </div>
      )}

      {/* Sets Input */}
      <div className="space-y-2 mb-4">
        <div className="grid grid-cols-3 gap-2 text-xs font-bold text-slate-600 mb-1 px-2">
          <span>סט</span>
          <span className="text-center">משקל (ק"ג)</span>
          <span className="text-center">חזרות</span>
        </div>
        {sets.map((set, idx) => (
          <div key={idx} className="grid grid-cols-3 gap-2 items-center">
            <span className="text-sm font-bold text-slate-600">סט {set.setIndex}</span>
            <Input
              type="number"
              inputMode="decimal"
              value={set.weight}
              onChange={(e) => updateSet(idx, 'weight', e.target.value)}
              placeholder="משקל"
              className="h-10 text-center"
            />
            <Input
              type="number"
              inputMode="numeric"
              value={set.reps}
              onChange={(e) => updateSet(idx, 'reps', e.target.value)}
              placeholder="חזרות"
              className="h-10 text-center"
            />
          </div>
        ))}
      </div>

      {/* Notes */}
      {exercise.notes && (
        <div className="mb-3 p-2 bg-blue-50 rounded text-xs text-blue-800">
          💡 {exercise.notes}
        </div>
      )}

      {/* Save Button - Large Green */}
      <Button
        onClick={handleSave}
        disabled={saving || !hasData}
        className="w-full h-12 text-base font-bold bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 shadow-md"
      >
        {saving ? (
          <>
            <div className="w-5 h-5 ml-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
            שומר...
          </>
        ) : (
          <>
            <Save className="w-5 h-5 ml-2" />
            שמור תרגיל
          </>
        )}
      </Button>
    </Card>
  );
}