import React from 'react';
import { Card } from '@/components/ui/card';

export function ExerciseCardSkeleton() {
  return (
    <Card className="p-6 bg-white animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-6 h-6 bg-slate-200 rounded" />
        <div className="flex-1 space-y-4">
          <div className="h-6 bg-slate-200 rounded w-3/4" />
          <div className="grid grid-cols-4 gap-3">
            <div className="h-12 bg-slate-200 rounded-xl" />
            <div className="h-12 bg-slate-200 rounded-xl" />
            <div className="h-12 bg-slate-200 rounded-xl" />
            <div className="h-12 bg-slate-200 rounded-xl" />
          </div>
          <div className="h-10 bg-slate-200 rounded-xl w-full" />
        </div>
        <div className="w-6 h-6 bg-slate-200 rounded" />
      </div>
    </Card>
  );
}

export function WorkoutListSkeleton() {
  return (
    <div className="space-y-4">
      <ExerciseCardSkeleton />
      <ExerciseCardSkeleton />
      <ExerciseCardSkeleton />
    </div>
  );
}

export function TraineeCardSkeleton() {
  return (
    <Card className="p-4 bg-white animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-slate-200 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="h-5 bg-slate-200 rounded w-1/2" />
          <div className="h-4 bg-slate-200 rounded w-1/3" />
        </div>
        <div className="h-10 w-24 bg-slate-200 rounded-xl" />
      </div>
    </Card>
  );
}