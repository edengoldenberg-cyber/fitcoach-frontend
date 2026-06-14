import React from 'react';

function getStreakMilestone(streak) {
  if (streak >= 60) return '🏆';
  if (streak >= 30) return '👑';
  if (streak >= 14) return '⚡';
  if (streak >= 7) return '🔥🔥';
  if (streak >= 3) return '🔥';
  return null;
}

export default function StreakBadge({ streak, loading }) {
  if (loading) return null;

  const current = streak?.current_streak || 0;
  const best = streak?.best_streak || 0;
  const milestone = getStreakMilestone(current);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{current >= 3 ? '🔥' : '💤'}</span>
        <div>
          <div className="text-white font-semibold text-sm">רצף פעילות</div>
          <div className="text-slate-400 text-xs">שיא אישי: {best} ימים</div>
        </div>
      </div>
      <div className="text-right">
        <div className="flex items-center gap-1.5 justify-end">
          {milestone && <span className="text-xl">{milestone}</span>}
          <span className="text-2xl font-bold text-orange-400">{current}</span>
          <span className="text-slate-400 text-sm">ימים</span>
        </div>
        {current >= 3 && (
          <div className="text-orange-400 text-xs mt-0.5">🔥 רצף פעיל!</div>
        )}
        {current === 0 && (
          <div className="text-slate-500 text-xs mt-0.5">התחל היום</div>
        )}
      </div>
    </div>
  );
}