import React from 'react';

const RARITY_CONFIG = {
  common: { label: 'נפוץ', border: 'border-slate-500/40', bg: 'from-slate-800 to-slate-700', glow: '', badge: 'bg-slate-600/60 text-slate-300' },
  rare: { label: 'נדיר', border: 'border-blue-400/50', bg: 'from-slate-800 to-blue-900/40', glow: 'shadow-[0_0_14px_rgba(96,165,250,0.2)]', badge: 'bg-blue-500/20 text-blue-300' },
  epic: { label: 'אפי', border: 'border-purple-400/60', bg: 'from-slate-800 to-purple-900/40', glow: 'shadow-[0_0_18px_rgba(168,85,247,0.25)]', badge: 'bg-purple-500/20 text-purple-300' },
  legendary: { label: 'אגדתי', border: 'border-yellow-400/80', bg: 'from-yellow-900/30 to-slate-800', glow: 'shadow-[0_0_24px_rgba(250,204,21,0.35)]', badge: 'bg-yellow-500/30 text-yellow-300 font-bold' },
};

export default function AchievementProgressCard({ achievement, unlocked, unlockedData, progress }) {
  const rarity = achievement.rarity || 'common';
  const rc = RARITY_CONFIG[rarity];
  const current = Math.min(progress?.current_value || 0, progress?.target_value || achievement.target_value || 1);
  const target = progress?.target_value || achievement.target_value || 1;
  const percent = Math.min(100, Math.round((current / Math.max(target, 1)) * 100));
  const remaining = Math.max(0, target - current);
  const bonus = progress?.bonus_points || achievement.bonus_points || 0;

  return (
    <div
      className={`rounded-2xl p-4 border transition-all ${
        unlocked
          ? `bg-gradient-to-r ${rc.bg} ${rc.border} ${rc.glow}`
          : 'bg-slate-800/70 border-slate-700/60'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className={`text-3xl flex-shrink-0 ${unlocked ? '' : 'grayscale opacity-60'}`}>
          {unlocked ? achievement.icon : '🔒'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={`font-semibold text-sm ${unlocked ? 'text-white' : 'text-slate-300'}`}>{achievement.title}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${rc.badge}`}>{rc.label}</span>
            {bonus > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 font-bold">
                +{bonus} בונוס
              </span>
            )}
          </div>
          <div className={`text-xs ${unlocked ? 'text-slate-400' : 'text-slate-500'}`}>{achievement.description}</div>
          {unlocked && unlockedData?.unlocked_at && (
            <div className="text-yellow-500/70 text-xs mt-1">
              ✓ הושג ב-{new Date(unlockedData.unlocked_at).toLocaleDateString('he-IL')}
            </div>
          )}
        </div>
        {unlocked && (
          <div className="flex-shrink-0">
            <div className={`${rarity === 'legendary' ? 'w-3 h-3 animate-pulse shadow-[0_0_10px_rgba(234,179,8,1)]' : 'w-2 h-2 shadow-[0_0_6px_rgba(234,179,8,0.8)]'} bg-yellow-400 rounded-full`} />
          </div>
        )}
      </div>

      {!unlocked && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{current}/{target} הושלם</span>
            <span className="text-yellow-300 font-bold">נשארו {remaining}</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-yellow-400 to-orange-400 h-2.5 rounded-full transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}