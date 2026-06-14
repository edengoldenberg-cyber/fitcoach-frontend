import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { CheckCircle, Users, Zap } from 'lucide-react';

export default function ShapeLeagueGroupMissions({ myGroup, groupMemberTrainees = [] }) {
  const weekStart = format(startOfWeek(new Date()), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(new Date()), 'yyyy-MM-dd');

  const { data: groupMissions } = useQuery({
    queryKey: ['groupMissions', weekStart],
    queryFn: async () => {
      const all = await base44.entities.ShapeLeagueMission.filter({ is_group_mission: true });
      return all.filter(m => m.date >= weekStart && m.date <= weekEnd);
    },
  });

  const { data: weekActivities } = useQuery({
    queryKey: ['groupWeekActivities', myGroup?.id, weekStart],
    queryFn: async () => {
      if (!myGroup?.members?.length) return [];
      const all = await base44.entities.ShapeLeagueActivityLog.list();
      return all.filter(a => 
        a.activity_date >= weekStart && 
        a.activity_date <= weekEnd &&
        myGroup.members.includes(a.trainee_id)
      );
    },
    enabled: !!myGroup?.members?.length,
  });

  if (!groupMissions || groupMissions.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-500/40 rounded-2xl p-5 mb-4" dir="rtl">
      <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
        <Users className="w-5 h-5 text-purple-400" />
        משימות הקבוצה
      </h3>

      <div className="space-y-3">
        {groupMissions.map(mission => {
          const activitiesCount = weekActivities?.filter(
            a => a.trainee_id && myGroup?.members?.includes(a.trainee_id)
          ).length || 0;

          const progress = Math.min(activitiesCount / mission.group_target_members, 1);
          const isCompleted = progress >= 1;

          return (
            <div
              key={mission.id}
              className={`p-4 rounded-xl border ${
                isCompleted
                  ? 'bg-green-900/20 border-green-500/40'
                  : 'bg-slate-800/50 border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-start gap-3 flex-1">
                  <span className="text-2xl">{mission.emoji}</span>
                  <div>
                    <p className="text-white font-semibold">{mission.title_he}</p>
                    <p className="text-slate-400 text-xs mt-1">{mission.description_he}</p>
                  </div>
                </div>
                {isCompleted && <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />}
              </div>

              {/* Progress Bar */}
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-400 text-xs">
                    {activitiesCount}/{mission.group_target_members} חברים
                  </span>
                  <span className="text-yellow-400 text-xs font-semibold flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    +{mission.bonus_points}
                  </span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}