import React from 'react';
import { Dumbbell, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function TodayWorkoutCard({ todayDailyWorkout, todayTemplates = [], rotationSessionToday, onlineDailyWorkout, traineeWorkout, onAddManual }) {
  const navigate = useNavigate();
  const isDone = !!traineeWorkout || rotationSessionToday?.status === 'completed';
  const hasMultipleTemplates = todayTemplates.length > 1;
  const todayTemplate = todayTemplates?.[0] || null;
  const workout = hasMultipleTemplates ? todayTemplate : (todayDailyWorkout || todayTemplate || rotationSessionToday || onlineDailyWorkout);
  const exercisePreview = rotationSessionToday?.exercises?.slice(0, 3).map(e => e.exercise_name || e.name).filter(Boolean).join(' • ');
  const exerciseCount = todayDailyWorkout?.exercises?.length || todayTemplate?.exercises?.length || onlineDailyWorkout?.exercises?.length || 0;
  const workoutTitle = hasMultipleTemplates
    ? `${todayTemplates.length} אימונים זמינים היום`
    : (todayDailyWorkout?.title_he || todayTemplate?.title || rotationSessionToday?.title || onlineDailyWorkout?.title || 'אימון היום');

  return (
    <div className="rounded-2xl p-4 mb-4 border-2" style={{
      background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
      borderColor: '#c4b5fd'
    }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-purple-500 flex items-center justify-center">
            <Dumbbell className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-xs text-purple-500 font-medium">האימון שלי היום</p>
            {isDone && <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full">✓ בוצע</span>}
          </div>
        </div>
        {isDone && <span className="text-2xl">🎉</span>}
      </div>

      {workout ? (
        <>
          <h3 className="text-base font-bold text-purple-900 mb-1">
            {workoutTitle}
          </h3>
          {(hasMultipleTemplates || rotationSessionToday?.exercises || todayDailyWorkout?.exercises || todayTemplate?.exercises) && (
            <p className="text-xs text-purple-600 mb-3">
              {hasMultipleTemplates
                ? 'לחצו כדי לבחור איזה אימון לבצע'
                : (exercisePreview || `${exerciseCount} תרגילים`)}
            </p>
          )}
          <button
            onClick={() => navigate(createPageUrl(rotationSessionToday || onlineDailyWorkout ? 'TraineeOnlineTraining' : 'WorkoutLog'))}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl py-3 text-sm font-semibold transition-colors"
          >
            {hasMultipleTemplates ? '🏋️ בחר אימון' : (isDone ? '📊 צפה באימון' : '💪 התחל אימון')}
            <ChevronLeft className="w-4 h-4" />
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-purple-600 mb-3">אין אימון מוקצה להיום</p>
          <button
            onClick={onAddManual}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl py-3 text-sm font-semibold transition-colors"
          >
            + הוסף אימון ידנית
          </button>
        </>
      )}
    </div>
  );
}