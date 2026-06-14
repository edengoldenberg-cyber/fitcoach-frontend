import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronDown, ChevronUp, Link2 } from 'lucide-react';
import { GROUP_COLORS, GROUP_LABELS } from '@/components/coach/SupersetManager';
import ExerciseCard from './ExerciseCard';

export default function SupersetGroupCard({ exercises, groupMeta, previousWorkouts, onSave }) {
  const [expanded, setExpanded] = useState(true);
  const [completedRounds, setCompletedRounds] = useState(0);

  const groupType = groupMeta.group_type || 'superset';
  const colors = GROUP_COLORS[groupType] || GROUP_COLORS.superset;
  const roundCount = groupMeta.round_count || 3;
  const restSeconds = groupMeta.rest_after_round_seconds || 60;
  const label = exercises[0]?.group_label || '';

  const sortedExercises = [...exercises].sort((a, b) => (a.group_order || 0) - (b.group_order || 0));

  const orderLetters = ['A', 'B', 'C', 'D'];

  return (
    <div className={`rounded-2xl border-2 overflow-hidden shadow-sm ${colors.border}`}>
      {/* Group Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 cursor-pointer select-none ${colors.bg}`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Link2 className={`w-4 h-4 ${colors.text}`} />
          <span className={`text-sm font-bold ${colors.text}`}>
            {GROUP_LABELS[groupType]} {label}
          </span>
          <span className={`text-xs text-white font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>
            {roundCount} סבבים
          </span>
          {restSeconds > 0 && (
            <span className="text-xs text-slate-500 hidden sm:inline">
              | מנוחה {restSeconds}″
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{sortedExercises.length} תרגילים</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {/* Round progress */}
      {expanded && (
        <div className={`px-4 py-2 flex items-center gap-2 ${colors.bg} border-b border-slate-100`}>
          <span className="text-xs text-slate-600 font-medium">סבבים שהושלמו:</span>
          <div className="flex gap-1">
            {Array.from({ length: roundCount }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCompletedRounds(i < completedRounds ? i : i + 1)}
                className={`w-7 h-7 rounded-full text-xs font-bold transition-colors border-2 ${
                  i < completedRounds
                    ? `${colors.badge} text-white border-transparent`
                    : 'bg-white text-slate-400 border-slate-200'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          {completedRounds === roundCount && (
            <span className="text-xs font-bold text-green-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              הושלם!
            </span>
          )}
        </div>
      )}

      {/* Exercises */}
      {expanded && (
        <div className="bg-white">
          {sortedExercises.map((ex, i) => {
            const exerciseKey = ex?.exercise_id || ex?.exercise_name || `ex_${i}`;
            const previousData = previousWorkouts?.[exerciseKey];
            const orderBadge = `${label}${i + 1}`;

            return (
              <div key={exerciseKey} className={`relative ${i < sortedExercises.length - 1 ? 'border-b border-slate-100' : ''}`}>
                {/* Order badge */}
                <div className={`absolute right-3 top-3 z-10 w-7 h-7 rounded-full text-xs font-bold text-white flex items-center justify-center ${colors.badge}`}>
                  {orderBadge}
                </div>
                <div className="pr-10">
                  <ExerciseCard
                    exercise={{
                      exercise_name: ex?.exercise_name || 'תרגיל',
                      exercise_id: ex?.exercise_id || null,
                      default_sets_count: ex?.sets || 3,
                      target_reps_min: ex?.reps_min,
                      target_reps_max: ex?.reps_max,
                      notes: ex?.notes,
                      sets: ex?.sets || []
                    }}
                    index={i}
                    previousData={previousData}
                    onSave={onSave}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rest reminder */}
      {expanded && restSeconds > 0 && (
        <div className={`px-4 py-2 text-center text-xs text-slate-500 ${colors.bg}`}>
          ⏱ אחרי כל סבב — מנוחה {restSeconds} שניות
        </div>
      )}
    </div>
  );
}