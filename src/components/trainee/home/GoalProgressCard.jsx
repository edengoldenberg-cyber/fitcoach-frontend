import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function GoalProgressCard({ trainee, measurements }) {
  const navigate = useNavigate();

  if (!trainee || !measurements || measurements.length === 0) return null;

  const sorted = [...measurements].sort((a, b) => new Date(a.date || a.created_date) - new Date(b.date || b.created_date));
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];

  const startWeight = first?.weight_kg || trainee.weight_kg;
  const currentWeight = latest?.weight_kg || trainee.weight_kg;
  if (!startWeight || !currentWeight) return null;

  const goal = trainee.goal || 'maintain';
  const targetWeight = trainee.target_weight_kg;
  const change = currentWeight - startWeight;
  const absChange = Math.abs(change);

  const goalLabel = goal === 'lose' ? 'ירידה במשקל' : goal === 'gain' ? 'עלייה במשקל' : 'שמירה על משקל';
  const isOnTrack =
    goal === 'lose' ? change <= 0 :
    goal === 'gain' ? change >= 0 :
    absChange < 1;

  // Progress toward target
  let progressPct = 50;
  if (targetWeight && startWeight !== targetWeight) {
    const totalNeeded = Math.abs(targetWeight - startWeight);
    const achieved = Math.abs(currentWeight - startWeight);
    progressPct = Math.min(100, Math.round((achieved / totalNeeded) * 100));
  }

  const TrendIcon = change < -0.2 ? TrendingDown : change > 0.2 ? TrendingUp : Minus;
  const trendColor = isOnTrack ? '#10b981' : '#ef4444';

  return (
    <div
      className="rounded-2xl p-4 mb-4 bg-white border-2 border-slate-100 cursor-pointer active:scale-95 transition-all"
      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
      onClick={() => navigate(createPageUrl('Metrics'))}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: isOnTrack ? '#d1fae5' : '#fee2e2' }}>
            <TrendIcon className="w-4 h-4" style={{ color: trendColor }} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">התקדמות לעבר היעד</p>
            <p className="text-sm font-bold text-slate-800">{goalLabel}</p>
          </div>
        </div>
        <div className="text-left">
          <p className="text-xl font-bold" style={{ color: trendColor }}>
            {change > 0 ? '+' : ''}{change.toFixed(1)} ק"ג
          </p>
          <p className="text-xs text-slate-400">מתחילת המסלול</p>
        </div>
      </div>

      {/* Weight bar */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs text-slate-500 w-10 text-right">{startWeight} ק"ג</span>
        <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progressPct}%`,
              background: isOnTrack ? 'linear-gradient(90deg, #34d399, #10b981)' : 'linear-gradient(90deg, #fca5a5, #ef4444)'
            }}
          />
        </div>
        {targetWeight ? (
          <span className="text-xs text-slate-500 w-10">{targetWeight} ק"ג</span>
        ) : (
          <span className="text-xs font-bold w-10" style={{ color: trendColor }}>{currentWeight} ק"ג</span>
        )}
      </div>

      <div className="flex justify-between text-xs text-slate-400">
        <span>משקל נוכחי: <strong className="text-slate-700">{currentWeight} ק"ג</strong></span>
        {targetWeight && <span>{progressPct}% מהיעד</span>}
      </div>
    </div>
  );
}