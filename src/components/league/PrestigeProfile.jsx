import React, { useMemo } from 'react';
import { Crown } from 'lucide-react';

// Division system
const DIVISIONS = [
  { key: 'bronze',   label: 'Bronze',   emoji: '🥉', minScore: 0,   color: 'from-amber-700 to-amber-600',  border: 'border-amber-600/50', text: 'text-amber-400', title: 'Bronze Warrior' },
  { key: 'silver',   label: 'Silver',   emoji: '🥈', minScore: 100, color: 'from-slate-500 to-slate-400',  border: 'border-slate-400/50', text: 'text-slate-300', title: 'Silver Grinder' },
  { key: 'gold',     label: 'Gold',     emoji: '🥇', minScore: 250, color: 'from-yellow-600 to-yellow-500', border: 'border-yellow-500/60', text: 'text-yellow-400', title: 'Gold Elite' },
  { key: 'platinum', label: 'Platinum', emoji: '💎', minScore: 500, color: 'from-cyan-600 to-cyan-400',    border: 'border-cyan-400/60',  text: 'text-cyan-300',  title: 'Platinum Beast' },
  { key: 'elite',    label: 'Elite',    emoji: '👑', minScore: 900, color: 'from-purple-600 to-pink-500',  border: 'border-purple-400/70', text: 'text-purple-300', title: 'Elite Champion' },
];

export function getDivision(totalScore) {
  let div = DIVISIONS[0];
  for (const d of DIVISIONS) {
    if (totalScore >= d.minScore) div = d;
    else break;
  }
  return div;
}

export function getPrestigeScore({ weekTotal = 0, streak = 0, achievementCount = 0, rank = 999 }) {
  let score = weekTotal;
  score += streak * 10;
  score += achievementCount * 15;
  if (rank <= 3) score += 100;
  else if (rank <= 10) score += 50;
  else if (rank <= 25) score += 20;
  return Math.round(score);
}

function nextDivision(div) {
  const idx = DIVISIONS.findIndex(d => d.key === div.key);
  return DIVISIONS[idx + 1] || null;
}

export default function PrestigeProfile({
  trainee,
  weekTotal = 0,
  streak = 0,
  achievements = [],
  myRank,
  compact = false,
}) {
  const score = useMemo(() => getPrestigeScore({
    weekTotal,
    streak: streak?.current_streak || 0,
    achievementCount: achievements?.length || 0,
    rank: myRank?.rank || 999,
  }), [weekTotal, streak, achievements, myRank]);

  const division = getDivision(score);
  const next = nextDivision(division);
  const progressToNext = next
    ? Math.min(100, Math.round(((score - division.minScore) / (next.minScore - division.minScore)) * 100))
    : 100;

  const firstName = trainee?.full_name?.split(' ')[0] || 'שחקן';
  const topAchievement = achievements?.[achievements.length - 1];

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 bg-gradient-to-r ${division.color} px-3 py-1.5 rounded-full border ${division.border}`}>
        <span className="text-base">{division.emoji}</span>
        <span className={`text-xs font-bold ${division.text}`}>{division.title}</span>
      </div>
    );
  }

  return (
    <div className={`bg-slate-800 border ${division.border} rounded-2xl p-5 relative overflow-hidden`} dir="rtl">
      {/* Glow background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${division.color} opacity-5 pointer-events-none`} />

      {/* Division Badge */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${division.color} flex items-center justify-center text-3xl border ${division.border} shadow-lg`}>
            {division.emoji}
          </div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest ${division.text} opacity-70`}>{division.label}</p>
            <p className={`font-black text-lg ${division.text}`}>{division.title}</p>
            <p className="text-slate-400 text-xs">{firstName}</p>
          </div>
        </div>
        {myRank?.rank && myRank.rank <= 3 && (
          <div className="text-3xl">
            {myRank.rank === 1 ? '👑' : myRank.rank === 2 ? '🥈' : '🥉'}
          </div>
        )}
      </div>

      {/* Prestige Score */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-400 text-xs">Prestige Score</span>
        <span className={`font-bold text-sm ${division.text}`}>{score}</span>
      </div>

      {/* Progress to next division */}
      {next && (
        <div className="mb-4">
          <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${division.color} transition-all duration-700 rounded-full`}
              style={{ width: `${progressToNext}%` }}
            />
          </div>
          <p className="text-slate-500 text-xs mt-1">
            עוד {next.minScore - score} נק׳ ל-{next.emoji} {next.label}
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-700/50 rounded-xl py-2">
          <p className="text-orange-400 font-bold">{streak?.current_streak || 0}</p>
          <p className="text-slate-500 text-xs">סטריק</p>
        </div>
        <div className="bg-slate-700/50 rounded-xl py-2">
          <p className="text-yellow-400 font-bold">{achievements?.length || 0}</p>
          <p className="text-slate-500 text-xs">הישגים</p>
        </div>
        <div className="bg-slate-700/50 rounded-xl py-2">
          <p className={`font-bold ${division.text}`}>#{myRank?.rank || '—'}</p>
          <p className="text-slate-500 text-xs">דירוג</p>
        </div>
      </div>

      {/* Top Achievement */}
      {topAchievement && (
        <div className="mt-3 flex items-center gap-2 bg-yellow-400/5 border border-yellow-400/20 rounded-xl px-3 py-2">
          <span className="text-xl">{topAchievement.icon || '🏅'}</span>
          <div className="min-w-0">
            <p className="text-yellow-300 text-xs font-semibold truncate">{topAchievement.title}</p>
            <p className="text-slate-500 text-xs">הישג אחרון</p>
          </div>
        </div>
      )}
    </div>
  );
}