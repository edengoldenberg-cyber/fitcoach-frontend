import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, startOfWeek, endOfWeek } from 'date-fns';

export default function LeagueSocialProof() {
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');

  const { data: weekPoints } = useQuery({
    queryKey: ['socialProofWeekPoints', weekStart],
    queryFn: async () => {
      const all = await base44.entities.UserPointsDaily.list();
      return all.filter(r => r.date >= weekStart && r.date <= weekEnd);
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: allGroups } = useQuery({
    queryKey: ['socialProofGroups'],
    queryFn: () => base44.entities.ShapeLeagueGroup.list(),
    staleTime: 1000 * 60 * 5,
  });

  if (!weekPoints || !allGroups) return null;

  const activeTrainees = new Set(weekPoints.map(r => r.trainee_id)).size;
  const totalPoints = weekPoints.reduce((sum, r) => sum + (r.total_points || 0), 0);
  const totalWorkoutPoints = weekPoints.reduce((sum, r) => sum + (r.workout_points || 0), 0);
  const activeGroups = allGroups.filter(g => g.members?.length && weekPoints.some(r => g.members.includes(r.trainee_id))).length;
  const workoutsThisWeek = Math.round(totalWorkoutPoints / 30);

  if (activeTrainees === 0) return null;

  const stats = [
    { icon: '🔥', value: activeTrainees, label: 'פעילים השבוע' },
    { icon: '🏆', value: activeGroups, label: 'קבוצות פעילות' },
    { icon: '⚡', value: workoutsThisWeek, label: 'אימונים' },
    { icon: '💧', value: totalPoints, label: "נק' הושגו" },
  ];

  return (
    <div className="bg-gradient-to-r from-teal-500/10 to-purple-500/10 border border-teal-500/20 rounded-2xl px-4 py-4">
      <p className="text-slate-400 text-xs text-center font-semibold uppercase tracking-wider mb-3">🔴 LIVE — מה קורה בליגה</p>
      <div className="grid grid-cols-4 gap-2">
        {stats.map((s, i) => (
          <div key={i} className="text-center">
            <div className="text-xl">{s.icon}</div>
            <div className="text-white font-black text-lg leading-tight">{s.value}</div>
            <div className="text-slate-500 text-[10px] leading-tight">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}