import React from 'react';
import ExerciseCardV2 from './ExerciseCardV2';
import SupersetGroupCardV2 from './SupersetGroupCardV2';

const normalizeExercise = (exercise) => ({
  ...exercise,
  name: exercise.name || exercise.exercise_name,
  exercise_name: exercise.exercise_name || exercise.name,
  sets_count: exercise.sets_count || (typeof exercise.sets === 'number' ? exercise.sets : null) || 3,
});

const buildRenderItems = (exercises = []) => {
  const items = [];
  const seenGroups = new Set();

  exercises.forEach((exercise, index) => {
    if (!exercise?.group_id) {
      items.push({ type: 'exercise', exercise, index });
      return;
    }

    if (seenGroups.has(exercise.group_id)) return;
    seenGroups.add(exercise.group_id);

    const groupExercises = exercises.filter(item => item?.group_id === exercise.group_id);
    items.push({
      type: 'group',
      groupId: exercise.group_id,
      exercises: groupExercises,
      groupMeta: {
        group_type: exercise.group_type || 'superset',
        group_label: exercise.group_label,
        round_count: exercise.round_count,
        rest_after_round_seconds: exercise.rest_after_round_seconds,
      }
    });
  });

  return items;
};

export default function WorkoutExerciseList({ exercises = [], traineeEmail, traineeId, workoutDate, workoutId, onVolumeChange, onSaveSuccess }) {
  return (
    <div className="space-y-3">
      {buildRenderItems(exercises).map((item) => {
        if (item.type === 'group') {
          return (
            <SupersetGroupCardV2
              key={item.groupId}
              exercises={item.exercises}
              groupMeta={item.groupMeta}
              traineeEmail={traineeEmail}
              traineeId={traineeId}
              workoutDate={workoutDate}
              workoutId={workoutId}
              onVolumeChange={onVolumeChange}
              onSaveSuccess={onSaveSuccess}
            />
          );
        }

        return (
          <ExerciseCardV2
            key={`${workoutId}_${item.index}_${item.exercise?.exercise_id || item.exercise?.exercise_name || item.exercise?.name}`}
            exercise={normalizeExercise(item.exercise)}
            traineeEmail={traineeEmail}
            traineeId={traineeId}
            workoutDate={workoutDate}
            workoutId={workoutId}
            onVolumeChange={(volume) => onVolumeChange?.(item.index, volume)}
            onSaveSuccess={onSaveSuccess}
          />
        );
      })}
    </div>
  );
}