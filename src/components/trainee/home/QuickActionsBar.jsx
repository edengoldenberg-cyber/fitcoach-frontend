import React from 'react';
import { Camera, Sparkles, Droplets, Dumbbell, BookOpen } from 'lucide-react';

const actions = [
  { id: 'photo', icon: Camera, label: 'צלם ארוחה', color: '#8B5CF6', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
  { id: 'ai', icon: Sparkles, label: 'ארוחה AI', color: '#79DBD6', bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700' },
  { id: 'water', icon: Droplets, label: 'הוסף מים', color: '#3b82f6', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  { id: 'workout', icon: Dumbbell, label: 'הוסף אימון', color: '#f97316', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
  { id: 'mealplan', icon: BookOpen, label: 'תפריט AI', color: '#10b981', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
];

export default function QuickActionsBar({ onAction, visibleModules }) {
  const filtered = actions.filter(a => {
    if (a.id === 'water') return visibleModules.water;
    if (a.id === 'workout') return visibleModules.workouts;
    if (a.id === 'photo' || a.id === 'ai') return visibleModules.nutrition;
    return true;
  });

  return (
    <div className="mb-4">
      <p className="text-xs text-slate-400 font-medium mb-2 px-1">פעולות מהירות</p>
      <div className="grid grid-cols-4 gap-2">
        {filtered.map(({ id, icon: Icon, label, bg, border, text }) => (
          <button
            key={id}
            onClick={() => onAction(id)}
            className={`${bg} ${border} border rounded-2xl p-3 flex flex-col items-center gap-1.5 active:scale-95 transition-all`}
          >
            <Icon className={`w-5 h-5 ${text}`} />
            <span className={`text-xs font-medium ${text} text-center leading-tight`}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}