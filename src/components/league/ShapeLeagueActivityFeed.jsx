import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, startOfWeek, endOfWeek } from 'date-fns';

const ACTIVITY_EMOJIS = {
  'כוח': '🏋️',
  'פילאטיס': '🧘',
  'ריצה': '🏃',
  'הליכה': '🚶',
  'טניס': '🎾',
  'אופניים': '🚴',
  'שחייה': '🏊',
  'פונקציונלי': '🥊',
  'ריקוד': '🕺',
  'ספורט קבוצתי': '⚽',
  'טיול': '🥾',
  'מתיחות/mobility': '🧎',
};

export default function ShapeLeagueActivityFeed() {
  const weekStart = format(startOfWeek(new Date()), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(new Date()), 'yyyy-MM-dd');

  const { data: weekActivities } = useQuery({
    queryKey: ['weekActivities', weekStart],
    queryFn: async () => {
      const all = await base44.entities.ShapeLeagueActivityLog.list('-logged_at', 50);
      return all.filter(a => a.activity_date >= weekStart && a.activity_date <= weekEnd);
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: allTrainees } = useQuery({
    queryKey: ['allTraineesForFeed'],
    queryFn: () => base44.entities.Trainee.list(),
    staleTime: 1000 * 60 * 10,
  });

  const getTraineeName = (email) => {
    const trainee = allTrainees?.find(t => t.user_email === email);
    return trainee?.full_name || email?.split('@')[0] || 'מתאמן';
  };

  const cappedWeekActivities = React.useMemo(() => {
    const totalsByDay = {};
    return (weekActivities || []).map((activity) => {
      const key = `${activity.trainee_id || activity.trainee_email}|${activity.activity_date}`;
      const used = totalsByDay[key] || 0;
      const effectivePoints = Math.max(0, Math.min(activity.points_awarded || 0, 30 - used));
      totalsByDay[key] = used + effectivePoints;
      return { ...activity, effective_points: effectivePoints };
    }).filter(activity => activity.effective_points > 0);
  }, [weekActivities]);

  const getRelativeTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'עכשיו';
    if (diffMins < 60) return `לפני ${diffMins} דק׳`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `לפני ${diffHours} שעות`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `לפני ${diffDays} ימים`;
  };

  if (!cappedWeekActivities || cappedWeekActivities.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 text-center">
        <p className="text-slate-400 text-sm">🔥 לא מסתתרים פעילויות השבוע...</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5" dir="rtl">
      <h2 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
        <span>🔥</span> פעילויות השבוע
      </h2>

      <div className="space-y-3">
        {cappedWeekActivities.slice(0, 15).map(activity => (
          <div
            key={activity.id}
            className="flex items-center justify-between p-3 bg-slate-700/50 rounded-xl hover:bg-slate-700 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-xl flex-shrink-0">
                {ACTIVITY_EMOJIS[activity.activity_type] || '✨'}
              </span>
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">
                  {getTraineeName(activity.trainee_email)} סיים/ה {activity.activity_type}
                </p>
                <p className="text-slate-500 text-xs">
                  {activity.duration_minutes && `${activity.duration_minutes} דק׳`}
                  {activity.distance_km && `${activity.distance_km} ק״מ`}
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-yellow-400 font-bold text-sm">+{activity.effective_points}</p>
              <p className="text-slate-500 text-xs">{getRelativeTime(activity.logged_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}