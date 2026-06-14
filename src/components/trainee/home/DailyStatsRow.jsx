import React from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Utensils, Droplets, Dumbbell } from 'lucide-react';

function StatPill({ icon: Icon, label, value, target, color, unit = '', onClick }) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const colors = {
    green: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', bar: '#10b981', icon: 'text-emerald-500' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', bar: '#3b82f6', icon: 'text-blue-500' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', bar: '#8b5cf6', icon: 'text-purple-500' },
  };
  const c = colors[color];

  return (
    <div
      className={`${c.bg} ${c.border} border rounded-2xl p-3 flex-1 ${onClick ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`w-4 h-4 ${c.icon}`} />
        <span className={`text-xs font-medium ${c.text}`}>{label}</span>
      </div>
      <p className={`text-xl font-bold ${c.text} leading-none mb-1`}>
        {value}{unit}
      </p>
      <p className="text-xs text-slate-400 mb-2">מתוך {target}{unit}</p>
      {/* Progress bar */}
      <div className="h-1.5 bg-white rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: c.bar }}
        />
      </div>
    </div>
  );
}

export default function DailyStatsRow({ totals, targets, totalWater, todayWorkouts, visibleModules, onWaterClick }) {
  const navigate = useNavigate();
  return (
    <div className="flex gap-2 mb-4">
      {visibleModules.nutrition && (
        <StatPill
          icon={Utensils}
          label="קלוריות"
          value={Math.round(totals.calories || 0)}
          target={targets.calories}
          color="green"
          unit=" קק״ל"
          onClick={() => navigate(createPageUrl('NutritionLog'))}
        />
      )}
      {visibleModules.water && (
        <StatPill
          icon={Droplets}
          label="מים"
          value={Math.round(totalWater || 0)}
          target={targets.water}
          color="blue"
          unit=" מ״ל"
          onClick={() => navigate(createPageUrl('NutritionLog'))}
        />
      )}
      {visibleModules.workouts && (
        <StatPill
          icon={Dumbbell}
          label="אימונים"
          value={todayWorkouts?.length || 0}
          target={1}
          color="purple"
          unit=""
        />
      )}
    </div>
  );
}