import React from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dumbbell, Clock, ChevronLeft, Zap } from "lucide-react";

const TYPE_LABELS = {
  strength: '💪 כוח',
  pilates: '🧘 פילאטיס',
  functional: '⚡ פונקציונלי',
  cardio: '🏃 קרדיו',
  mobility: '🌿 מוביליטי',
  home: '🏠 ביתי',
  mixed: '🔀 מעורב',
};

const DIFFICULTY_LABELS = {
  easy: { label: 'קל', color: 'text-green-600 bg-green-50' },
  medium: { label: 'בינוני', color: 'text-amber-600 bg-amber-50' },
  hard: { label: 'קשה', color: 'text-red-600 bg-red-50' },
};

export default function DailyWorkoutSelector({ workouts, onSelect }) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-slate-800">🏋️ אימונים זמינים היום</h2>
        <p className="text-sm text-slate-500 mt-1">{workouts.length} אימונים זמינים — בחר אחד להתחיל</p>
      </div>

      {workouts.map((workout) => {
        const diff = DIFFICULTY_LABELS[workout.difficulty] || DIFFICULTY_LABELS.medium;
        const typeLabel = TYPE_LABELS[workout.workout_type] || workout.workout_type || '💪 כוח';
        const exerciseCount = workout.exercises?.length || 0;

        return (
          <Card
            key={workout.id}
            className="p-4 bg-white border-2 border-slate-100 hover:border-orange-300 hover:shadow-md transition-all cursor-pointer"
            onClick={() => onSelect(workout)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-slate-800 text-base">{workout.title}</h3>
                </div>
                {workout.description && (
                  <p className="text-sm text-slate-500 mb-2 line-clamp-2">{workout.description}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2 py-1 bg-orange-50 text-orange-700 rounded-full">{typeLabel}</span>
                  {workout.difficulty && (
                    <span className={`text-xs px-2 py-1 rounded-full ${diff.color}`}>{diff.label}</span>
                  )}
                  {exerciseCount > 0 && (
                    <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">
                      <Dumbbell className="w-3 h-3 inline ml-1" />{exerciseCount} תרגילים
                    </span>
                  )}
                  {workout.estimated_duration_minutes && (
                    <span className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-full">
                      <Clock className="w-3 h-3 inline ml-1" />{workout.estimated_duration_minutes} דק׳
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 shrink-0 flex items-center gap-1"
                onClick={(e) => { e.stopPropagation(); onSelect(workout); }}
              >
                התחל
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}