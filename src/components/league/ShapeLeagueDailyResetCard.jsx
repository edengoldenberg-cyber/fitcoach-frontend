import React from 'react';
import { format } from 'date-fns';

/**
 * End/start-of-day emotional card.
 * Shows after 20:00 local time with day summary.
 * Shows "new day" message before activity starts.
 */
export default function ShapeLeagueDailyResetCard({ todayPoints, myRank, myGroupRankEntry, leagueStreak }) {
  const hour = new Date().getHours();
  const tp = todayPoints || {};
  const total = tp.total_points || 0;
  const streak = leagueStreak?.current_streak || 0;
  const rank = myRank?.rank;
  const groupRank = myGroupRankEntry?.rank;
  const hasBonus = (tp.bonus_points || 0) > 0;

  // Only show if:
  // - Evening (after 20:00) with activity
  // - OR early day with no points yet (motivational)
  const isEvening = hour >= 20;
  const hasActivity = total > 0;

  if (!isEvening && hasActivity) return null; // daytime + active = hide (use live mission card instead)
  if (!isEvening && !hasActivity && hour > 9) return null; // mid-day idle = hide

  if (isEvening && hasActivity) {
    // Evening summary
    const lines = [];
    if (rank) lines.push(`🌙 היום הסתיים במקום #${rank}`);
    if (streak > 0) lines.push(`🔥 סטריק ${streak} ימים נשמר`);
    if (hasBonus) lines.push('⭐ הגעת ליום מושלם!');
    if (groupRank === 1) lines.push('👑 הקבוצה שלך במקום ראשון!');
    else if (groupRank) lines.push(`👥 הקבוצה שלך במקום #${groupRank}`);
    lines.push('⚡ מחר — הזדמנות חדשה להשתלט');

    return (
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-600 rounded-2xl p-5 text-center space-y-1.5">
        <div className="text-slate-400 text-[10px] uppercase tracking-widest font-semibold mb-2">סיכום היום</div>
        {lines.map((l, i) => (
          <p key={i} className="text-white text-sm font-medium leading-relaxed">{l}</p>
        ))}
        <p className="text-slate-600 text-xs mt-2 pt-2 border-t border-slate-700">😈 הליגה מחכה לך מחר...</p>
      </div>
    );
  }

  // Early morning / no activity yet
  if (!hasActivity) {
    const hour0 = new Date().getHours();
    if (hour0 < 10 || hour0 >= 20) {
      return (
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 rounded-2xl p-4 text-center">
          <p className="text-slate-300 text-sm font-medium">☀️ יום חדש — הזדמנות חדשה</p>
          <p className="text-slate-500 text-xs mt-1">😈 הליגה מחכה לך...</p>
        </div>
      );
    }
  }

  return null;
}