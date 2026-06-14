import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, startOfWeek } from 'date-fns';
import { Zap } from 'lucide-react';

export default function ShapeLeagueWeeklyEvent() {
  const weekStart = format(startOfWeek(new Date()), 'yyyy-MM-dd');

  const { data: weekEvent } = useQuery({
    queryKey: ['weeklyEvent', weekStart],
    queryFn: async () => {
      const all = await base44.entities.ShapeLeagueWeeklyEvent.list();
      return all.find(e => e.week_start_date === weekStart && e.is_active);
    },
  });

  if (!weekEvent) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/40 rounded-2xl p-4 mb-4 flex items-center gap-3" dir="rtl">
      <div className="flex-shrink-0 text-3xl">{weekEvent.emoji}</div>
      <div className="flex-1">
        <h3 className="text-yellow-300 font-bold">{weekEvent.title_he}</h3>
        <p className="text-slate-400 text-xs">{weekEvent.description}</p>
      </div>
      <div className="flex-shrink-0">
        <div className="bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1">
          <Zap className="w-3 h-3" />
          x{weekEvent.point_multiplier}
        </div>
      </div>
    </div>
  );
}