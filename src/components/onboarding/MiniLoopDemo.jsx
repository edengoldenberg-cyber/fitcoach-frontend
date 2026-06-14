import React from 'react';
import { Camera, Dumbbell, Utensils } from 'lucide-react';

const demoConfig = {
  meal: {
    icon: Utensils,
    title: 'סריקת ארוחה',
    steps: ['צלם', 'AI מזהה', 'שמור'],
    color: 'from-orange-400 to-amber-500'
  },
  workout: {
    icon: Dumbbell,
    title: 'מעקב אימון',
    steps: ['פתח', 'סמן סט', 'צבור נקודות'],
    color: 'from-emerald-400 to-teal-500'
  },
  scan: {
    icon: Camera,
    title: 'צילום מהיר',
    steps: ['צלם', 'בדוק', 'אשר'],
    color: 'from-purple-400 to-fuchsia-500'
  }
};

export default function MiniLoopDemo({ type = 'meal' }) {
  const config = demoConfig[type] || demoConfig.meal;
  const Icon = config.icon;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm overflow-hidden" dir="rtl">
      <div className={`relative h-28 rounded-xl bg-gradient-to-br ${config.color} text-white p-3`}>
        <div className="absolute inset-0 bg-white/10 animate-pulse" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-sm font-bold">{config.title}</p>
            <p className="text-xs opacity-85">דוגמה קצרה</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-white/25 flex items-center justify-center">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-2">
          {config.steps.map((step, index) => (
            <div key={step} className="rounded-lg bg-white/20 px-2 py-2 text-center animate-bounce" style={{ animationDelay: `${index * 220}ms`, animationDuration: '1.8s' }}>
              <span className="block text-[11px] font-semibold">{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}