import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Link2 } from 'lucide-react';
import ExerciseCardV2 from './ExerciseCardV2';

const GROUP_STYLES = {
  superset: {
    label: 'סופר סט',
    border: 'border-blue-300',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    badge: 'bg-blue-500'
  },
  triset: {
    label: 'טרי סט',
    border: 'border-purple-300',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    badge: 'bg-purple-500'
  },
  circuit: {
    label: 'סבב',
    border: 'border-emerald-300',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    badge: 'bg-emerald-500'
  }
};

const normalizeExercise = (exercise) => ({
  ...exercise,
  name: exercise.name || exercise.exercise_name,
  exercise_name: exercise.exercise_name || exercise.name,
  sets_count: exercise.sets_count || (typeof exercise.sets === 'number' ? exercise.sets : null) || 3,
});

export default function SupersetGroupCardV2({ exercises = [], groupMeta = {}, traineeEmail, traineeId, workoutDate, workoutId, onSaveSuccess, onVolumeChange }) {
  const [expanded, setExpanded] = useState(true);
  const groupType = groupMeta.group_type || 'superset';
  const style = GROUP_STYLES[groupType] || GROUP_STYLES.superset;
  const sortedExercises = [...exercises].sort((a, b) => (a.group_order || 0) - (b.group_order || 0));
  const roundCount = groupMeta.round_count || sortedExercises[0]?.round_count || 3;
  const restSeconds = groupMeta.rest_after_round_seconds || sortedExercises[0]?.rest_after_round_seconds || 0;
  const label = groupMeta.group_label || sortedExercises[0]?.group_label || '';

  return (
    <div className={`rounded-2xl border-2 overflow-hidden shadow-md ${style.border} bg-white`}>
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 ${style.bg}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Link2 className={`w-4 h-4 ${style.text}`} />
          <span className={`text-sm font-bold ${style.text}`}>{style.label} {label}</span>
          <span className={`text-xs text-white font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>{roundCount} סבבים</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{sortedExercises.length} תרגילים</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="p-3 space-y-3">
          {sortedExercises.map((exercise, index) => (
            <div key={`${exercise.group_id || workoutId}_${exercise.exercise_id || exercise.exercise_name || index}`} className="relative">
              <div className={`absolute -right-1 top-3 z-10 w-7 h-7 rounded-full text-xs font-bold text-white flex items-center justify-center ${style.badge}`}>
                {label}{index + 1}
              </div>
              <div className="pr-7">
                <ExerciseCardV2
                  exercise={normalizeExercise(exercise)}
                  traineeEmail={traineeEmail}
                  traineeId={traineeId}
                  workoutDate={workoutDate}
                  workoutId={workoutId}
                  onVolumeChange={(volume) => onVolumeChange?.(`${exercise.group_id}_${index}`, volume)}
                  onSaveSuccess={onSaveSuccess}
                />
              </div>
            </div>
          ))}
          {restSeconds > 0 && (
            <div className={`text-center text-xs text-slate-600 rounded-xl px-3 py-2 ${style.bg}`}>
              ⏱ אחרי כל סבב — מנוחה {restSeconds} שניות
            </div>
          )}
        </div>
      )}
    </div>
  );
}