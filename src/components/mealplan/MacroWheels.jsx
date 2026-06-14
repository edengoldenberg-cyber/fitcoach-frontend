import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Settings } from 'lucide-react';

const COLORS = {
  protein: '#3b82f6',
  carbs: '#f59e0b',
  fat: '#10b981'
};

function MacroCircle({ label, value, target, color, unit = 'ג' }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const circumference = 2 * Math.PI * 30;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="30" fill="none" stroke="#f1f5f9" strokeWidth="8" />
          <circle
            cx="40" cy="40" r="30" fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-slate-800">{Math.round(value)}</span>
          <span className="text-[9px] text-slate-500">{unit}</span>
        </div>
      </div>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {target > 0 && (
        <span className="text-[10px] text-slate-400">יעד: {Math.round(target)}{unit}</span>
      )}
    </div>
  );
}

export default function MacroWheels({ calories, protein, carbs, fat, targetCalories, targetProtein, targetCarbs, targetFat, title = "ערכים תזונתיים יומיים", onEditTargets }) {
  const pieData = [
    { name: 'חלבון', value: protein * 4, color: COLORS.protein },
    { name: 'פחמימות', value: carbs * 4, color: COLORS.carbs },
    { name: 'שומן', value: fat * 9, color: COLORS.fat },
  ].filter(d => d.value > 0);

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-slate-800">{title}</h3>
        {onEditTargets && (
          <button
            onClick={onEditTargets}
            className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 bg-teal-50 hover:bg-teal-100 px-2.5 py-1.5 rounded-full transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            ערוך יעדים
          </button>
        )}
      </div>

      {/* Calorie circle - big */}
      <div className="flex flex-col items-center mb-5">
        <div className="relative w-28 h-28">
          <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
            <circle cx="56" cy="56" r="44" fill="none" stroke="#f1f5f9" strokeWidth="10" />
            <circle
              cx="56" cy="56" r="44" fill="none"
              stroke="#79DBD6" strokeWidth="10"
              strokeDasharray={2 * Math.PI * 44}
              strokeDashoffset={targetCalories > 0 ? (2 * Math.PI * 44) * (1 - Math.min(1, calories / targetCalories)) : 0}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-slate-800">{Math.round(calories)}</span>
            <span className="text-xs text-slate-500">קלוריות</span>
          </div>
        </div>
        {targetCalories > 0 && (
          <span className="text-xs text-slate-400 mt-1">יעד: {Math.round(targetCalories)} קק"ל</span>
        )}
      </div>

      {/* Macro circles */}
      <div className="flex justify-around">
        <MacroCircle label="חלבון" value={protein} target={targetProtein} color={COLORS.protein} />
        <MacroCircle label="פחמימות" value={carbs} target={targetCarbs} color={COLORS.carbs} />
        <MacroCircle label="שומן" value={fat} target={targetFat} color={COLORS.fat} />
      </div>

      {/* Macro breakdown bar */}
      {calories > 0 && (
        <div className="mt-4">
          <div className="flex rounded-full overflow-hidden h-3">
            <div style={{ width: `${Math.round((protein * 4 / calories) * 100)}%`, backgroundColor: COLORS.protein }} />
            <div style={{ width: `${Math.round((carbs * 4 / calories) * 100)}%`, backgroundColor: COLORS.carbs }} />
            <div style={{ width: `${Math.round((fat * 9 / calories) * 100)}%`, backgroundColor: COLORS.fat }} />
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {[
              { label: 'חלבון', color: COLORS.protein, pct: Math.round((protein * 4 / calories) * 100) },
              { label: 'פחמימות', color: COLORS.carbs, pct: Math.round((carbs * 4 / calories) * 100) },
              { label: 'שומן', color: COLORS.fat, pct: Math.round((fat * 9 / calories) * 100) },
            ].map(m => (
              <div key={m.label} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                <span className="text-[11px] text-slate-600">{m.label} {m.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}