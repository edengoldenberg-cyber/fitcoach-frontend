import React, { useMemo } from 'react';
import { Flame } from 'lucide-react';
import { format } from 'date-fns';

function buildReturnHooks({
  traineeId,
  leagueStreak,
  myRank,
  personAbove,
  myGroupRankEntry,
  groupAbove,
  todayPoints,
  weekTotal,
}) {
  const hooks = [];
  const today = format(new Date(), 'yyyy-MM-dd');

  // Streak at risk
  const streak = leagueStreak?.current_streak || 0;
  if (streak >= 3) {
    const hasActivityToday = (todayPoints?.total_points || 0) > 0;
    if (!hasActivityToday) {
      hooks.push({
        id: 'streak_risk',
        emoji: '🔥',
        title: `סטריק ${streak} ימים בסכנה!`,
        body: 'יום ללא פעילות ישבור את הרצף שלך',
        urgency: 'high',
        color: 'border-orange-500/60 bg-orange-500/10',
      });
    }
  }

  // Unfinished mission — no workout today
  if (!(todayPoints?.workout_points > 0)) {
    hooks.push({
      id: 'unfinished_workout',
      emoji: '💪',
      title: 'האימון של היום מחכה לך',
      body: '+30 נק׳ עבור השלמת אימון — עדיין פנוי',
      urgency: 'medium',
      color: 'border-teal-500/40 bg-teal-500/8',
    });
  }

  // Rival pressure
  if (personAbove) {
    const diff = (personAbove.total_points || 0) - (myRank?.total_points || 0);
    if (diff > 0 && diff <= 40) {
      hooks.push({
        id: 'rival_pressure',
        emoji: '⚔️',
        title: `${personAbove.trainee_name?.split(' ')[0] || 'מתאמן'} עדיין לפניך`,
        body: `רק ${diff} נק׳ מפרידים ביניכם`,
        urgency: 'medium',
        color: 'border-red-500/40 bg-red-500/8',
      });
    }
  }

  // Team dependence
  if (myGroupRankEntry) {
    hooks.push({
      id: 'team_depends',
      emoji: '🏆',
      title: 'הקבוצה שלך צריכה אותך',
      body: `אתם במקום #${myGroupRankEntry.rank} — כל נקודה קובעת`,
      urgency: 'low',
      color: 'border-purple-500/40 bg-purple-500/8',
    });
  }

  // Reward chase — close to top 10
  if (myRank?.rank > 10 && myRank?.rank <= 15) {
    hooks.push({
      id: 'reward_chase',
      emoji: '🎁',
      title: `עוד קצת ואתה בטופ 10!`,
      body: `אתה במקום #${myRank.rank} — הפרסים ממתינים`,
      urgency: 'low',
      color: 'border-yellow-500/40 bg-yellow-500/8',
    });
  }

  return hooks.slice(0, 2);
}

export default function ReturnHooks({
  traineeId, leagueStreak, myRank, personAbove,
  myGroupRankEntry, groupAbove, todayPoints, weekTotal,
  loading,
}) {
  const hooks = useMemo(() => buildReturnHooks({
    traineeId, leagueStreak, myRank, personAbove,
    myGroupRankEntry, groupAbove, todayPoints, weekTotal,
  }), [traineeId, leagueStreak, myRank, personAbove, myGroupRankEntry, groupAbove, todayPoints, weekTotal]);

  if (loading || hooks.length === 0) return null;

  return (
    <div className="space-y-3" dir="rtl">
      {hooks.map(hook => (
        <div key={hook.id} className={`border ${hook.color} rounded-2xl px-4 py-3.5 flex items-start gap-3`}>
          <span className="text-2xl flex-shrink-0">{hook.emoji}</span>
          <div>
            <p className="text-white text-sm font-bold">{hook.title}</p>
            <p className="text-slate-400 text-xs mt-0.5">{hook.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}