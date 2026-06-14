import React from 'react';

function Bar({ label, value, max, color, emoji, showCount }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-slate-300 text-xs flex items-center gap-1">{emoji} {label}</span>
        <span className="text-white text-xs font-semibold">{showCount ? `${value}/${max}` : `${value} נק׳`}</span>
      </div>
      <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StreakDots({ streak }) {
  const dots = 7;
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-slate-300 text-xs">🔥 סטריק שבועי</span>
        <span className="text-white text-xs font-semibold">{streak}/7 ימים</span>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: dots }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-3 rounded-sm transition-all ${
              i < streak
                ? 'bg-gradient-to-r from-orange-400 to-red-500 shadow-[0_0_6px_rgba(251,146,60,0.5)]'
                : 'bg-slate-700'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default function ShapeLeagueProgressBars({ todayPoints, weekTotal, myRank, leagueStreak, loading }) {
  if (loading) return null;

  const streak = leagueStreak?.current_streak || 0;
  const tp = todayPoints || {};

  // Perfect day: workout + 3 meals + water
  const perfectSteps = [
    (tp.workout_points || 0) > 0,
    (tp.meals_logged_count || 0) >= 3,
    (tp.water_points || 0) > 0,
  ];
  const perfectDone = perfectSteps.filter(Boolean).length;

  // Weekly target: 100 pts
  const weeklyTarget = 100;

  // Top 10 push: show only if ranked > 10 or not ranked
  const myPoints = myRank?.total_points || weekTotal || 0;
  const top10Target = 100;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-blue-400 text-lg">📊</span>
        <h2 className="text-white font-semibold">התקדמות</h2>
      </div>

      <Bar
        emoji="⭐"
        label="יום מושלם"
        value={perfectDone}
        max={3}
        color="bg-gradient-to-r from-yellow-400 to-orange-400"
        showCount
      />

      <Bar
        emoji="🏆"
        label="יעד שבועי"
        value={weekTotal}
        max={weeklyTarget}
        color="bg-gradient-to-r from-purple-400 to-indigo-500"
      />

      <StreakDots streak={Math.min(streak, 7)} />

      {(myRank?.rank > 10 || !myRank) && (
        <Bar
          emoji="🎯"
          label="לטופ 10"
          value={myPoints}
          max={top10Target}
          color="bg-gradient-to-r from-teal-400 to-green-500"
        />
      )}
    </div>
  );
}