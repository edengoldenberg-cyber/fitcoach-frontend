import React, { useMemo } from 'react';
import { Sword } from 'lucide-react';

// Computes closest rival from ranking data
function findRival(myTraineeId, rankingData) {
  if (!rankingData?.ranking?.length || !myTraineeId) return null;
  const ranking = rankingData.ranking.filter(r => r.trainee_id !== myTraineeId && r.total_points > 0);
  const mine = rankingData.ranking.find(r => r.trainee_id === myTraineeId);
  if (!mine || ranking.length === 0) return null;

  // Find closest score (prefer someone slightly above)
  const above = ranking.filter(r => r.total_points >= mine.total_points).sort((a, b) => a.total_points - b.total_points);
  const below = ranking.filter(r => r.total_points < mine.total_points).sort((a, b) => b.total_points - a.total_points);
  const rival = above[0] || below[0];
  if (!rival) return null;

  return {
    name: rival.trainee_name || 'מתאמן',
    points: rival.total_points,
    rank: rival.rank,
    myPoints: mine.total_points,
    myRank: mine.rank,
    diff: rival.total_points - mine.total_points,
  };
}

export default function RivalCard({ traineeId, rankingData, leagueStreak, loading }) {
  const rival = useMemo(() => findRival(traineeId, rankingData), [traineeId, rankingData]);

  if (loading) return null;
  if (!rival) return null;

  const isAhead = rival.diff > 0; // rival is ahead
  const diff = Math.abs(rival.diff);
  const myPercent = rival.points > 0 ? Math.min(100, Math.round((rival.myPoints / rival.points) * 100)) : 100;
  const rivalPercent = 100;

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-red-500/30 rounded-2xl p-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Sword className="w-5 h-5 text-red-400" />
        <h3 className="text-white font-bold">⚔️ היריב השבועי שלך</h3>
      </div>

      {/* Rival vs Me */}
      <div className="flex items-center justify-between mb-4">
        {/* Me */}
        <div className="text-center flex-1">
          <div className="w-12 h-12 rounded-full bg-teal-400/20 border-2 border-teal-400 flex items-center justify-center mx-auto mb-1">
            <span className="text-lg">🏋️</span>
          </div>
          <p className="text-teal-300 font-bold text-sm">את/ה</p>
          <p className="text-teal-400 font-black text-xl">{rival.myPoints}</p>
          <p className="text-slate-500 text-xs">#{rival.myRank}</p>
        </div>

        {/* VS */}
        <div className="flex flex-col items-center px-3">
          <div className="bg-red-500/20 border border-red-500/50 rounded-full w-10 h-10 flex items-center justify-center">
            <span className="text-red-400 font-black text-sm">VS</span>
          </div>
          <p className="text-slate-600 text-xs mt-1">השבוע</p>
        </div>

        {/* Rival */}
        <div className="text-center flex-1">
          <div className="w-12 h-12 rounded-full bg-red-400/20 border-2 border-red-400 flex items-center justify-center mx-auto mb-1">
            <span className="text-lg">⚔️</span>
          </div>
          <p className="text-red-300 font-bold text-sm truncate">{rival.name.split(' ')[0]}</p>
          <p className="text-red-400 font-black text-xl">{rival.points}</p>
          <p className="text-slate-500 text-xs">#{rival.rank}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>את/ה</span>
          <span>{rival.name.split(' ')[0]}</span>
        </div>
        <div className="h-3 bg-slate-700 rounded-full overflow-hidden flex">
          <div
            className="bg-gradient-to-r from-teal-500 to-teal-400 transition-all duration-700"
            style={{ width: `${isAhead ? myPercent : 100}%` }}
          />
        </div>
        <div className="h-3 bg-slate-700 rounded-full overflow-hidden flex mt-1">
          <div
            className="bg-gradient-to-r from-red-500 to-red-400 transition-all duration-700"
            style={{ width: `${isAhead ? rivalPercent : Math.min(100, Math.round((rival.points / (rival.myPoints || 1)) * 100))}%` }}
          />
        </div>
      </div>

      {/* Call to action */}
      <div className={`rounded-xl px-4 py-2.5 text-center text-sm font-semibold ${
        isAhead
          ? 'bg-red-500/10 border border-red-500/30 text-red-300'
          : 'bg-green-500/10 border border-green-500/30 text-green-300'
      }`}>
        {isAhead
          ? `עוד ${diff} נק׳ כדי לעקוף את ${rival.name.split(' ')[0]} 🔥`
          : `אתה לפני ${rival.name.split(' ')[0]} ב-${diff} נק׳ — שמור על הפער! 💪`
        }
      </div>
    </div>
  );
}