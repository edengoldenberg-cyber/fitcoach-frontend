import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { CheckCircle, Clock, Zap } from 'lucide-react';

export default function ShapeLeagueDailyMissionCard({ trainee }) {
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: todayMission } = useQuery({
    queryKey: ['dailyMission', today],
    queryFn: async () => {
      const missions = await base44.entities.ShapeLeagueMission.filter({ date: today });
      // Return first active mission (ideally should be randomized daily)
      return missions[0] || null;
    },
  });

  const { data: userCompletion } = useQuery({
    queryKey: ['missionCompletion', todayMission?.id, trainee?.id],
    queryFn: async () => {
      if (!todayMission?.id) return null;
      const completions = await base44.entities.ShapeLeagueMissionCompletion.filter({
        mission_id: todayMission.id,
        trainee_id: trainee?.id,
      });
      return completions[0] || null;
    },
    enabled: !!todayMission?.id && !!trainee?.id,
  });

  if (!todayMission) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 mb-4">
        <p className="text-slate-400 text-sm text-center">📋 משימת היום נוצרת בקרוב...</p>
      </div>
    );
  }

  const isCompleted = !!userCompletion;

  return (
    <div className={`rounded-2xl p-5 mb-4 border transition-all ${
      isCompleted
        ? 'bg-green-900/20 border-green-500/40'
        : 'bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-yellow-500/40'
    }`} dir="rtl">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          <span className="text-3xl">{todayMission.emoji}</span>
          <div>
            <h3 className="text-white font-bold">{todayMission.title_he}</h3>
            <p className="text-slate-400 text-xs mt-1">{todayMission.description_he}</p>
          </div>
        </div>
        {isCompleted && <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />}
      </div>

      <div className="bg-slate-900/50 rounded-xl p-3 mb-3">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-sm">יעד:</span>
          <span className="text-white font-semibold">
            {todayMission.target_value} {todayMission.unit}
          </span>
        </div>
        {isCompleted && (
          <div className="flex items-center justify-between mt-2 text-green-400 text-sm">
            <span>✓ הושלמה!</span>
            <span>+{userCompletion.bonus_points_awarded} נקודות בונוס</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-yellow-400 text-sm">
        <Zap className="w-4 h-4" />
        <span>+{todayMission.bonus_points} נקודות בונוס</span>
      </div>
    </div>
  );
}