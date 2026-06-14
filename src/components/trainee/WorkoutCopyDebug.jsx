import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Info } from 'lucide-react';

export default function WorkoutCopyDebug({ user, dailyWorkout, targetDate }) {
  const isCoachOrAdmin = user?.role === 'admin';

  const { data: traineeWorkouts = [] } = useQuery({
    queryKey: ['debugTraineeWorkouts', user?.email, targetDate],
    queryFn: () => base44.entities.TraineeWorkout.filter({
      trainee_email: user?.email,
      date: targetDate
    }),
    enabled: !!user?.email && isCoachOrAdmin,
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['debugAuditLogs', dailyWorkout?.id],
    queryFn: () => base44.entities.SystemAuditLog.filter({
      source_workout_id: dailyWorkout?.id
    }),
    enabled: !!dailyWorkout?.id && isCoachOrAdmin,
  });

  if (!isCoachOrAdmin) return null;

  const traineeWorkout = traineeWorkouts[0];
  const lastCopy = auditLogs
    .filter(log => log.action_type === 'COPY_DAILY_TO_TRAINEE')
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];

  return (
    <Card className="border-purple-300 bg-purple-50">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2 text-purple-700">
          <Info className="w-4 h-4" />
          Debug Panel (Coach Only)
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="font-medium text-purple-800">Daily Workout ID:</div>
            <div className="text-purple-600 font-mono text-[10px]">{dailyWorkout?.id || 'N/A'}</div>
          </div>
          <div>
            <div className="font-medium text-purple-800">Trainee Workout ID:</div>
            <div className="text-purple-600 font-mono text-[10px]">{traineeWorkout?.id || 'N/A'}</div>
          </div>
        </div>

        <div>
          <div className="font-medium text-purple-800">Exercises in Daily Workout:</div>
          <div className="text-purple-600">{dailyWorkout?.exercises?.length || 0}</div>
        </div>

        <div>
          <div className="font-medium text-purple-800">Exercises in Trainee Workout:</div>
          <div className="text-purple-600">{traineeWorkout?.exercises?.length || 0}</div>
        </div>

        {lastCopy && (
          <div className="pt-2 border-t border-purple-200">
            <div className="font-medium text-purple-800">Last Copy Result:</div>
            <div className={`text-xs ${lastCopy.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {lastCopy.status === 'success' ? '✅' : '❌'} {lastCopy.status}
            </div>
            {lastCopy.error_message_he && (
              <div className="text-red-600 text-[10px] mt-1">
                {lastCopy.error_message_he}
              </div>
            )}
            {lastCopy.payload_summary && (
              <div className="text-purple-600 text-[10px] mt-1">
                Exercises: {lastCopy.payload_summary.exercises_count} | 
                Sets: {lastCopy.payload_summary.sets_count}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}