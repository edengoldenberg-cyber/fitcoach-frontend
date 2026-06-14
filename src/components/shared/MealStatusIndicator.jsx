import React from 'react';
import { Check, Circle } from "lucide-react";

export default function MealStatusIndicator({ meals }) {
  const mealTypes = [
    { key: 'breakfast', label: 'בוקר' },
    { key: 'lunch', label: 'צהריים' },
    { key: 'dinner', label: 'ערב' }
  ];

  return (
    <div className="flex gap-4 justify-center">
      {mealTypes.map(({ key, label }) => {
        const filled = meals?.includes(key);
        return (
          <div key={key} className="flex flex-col items-center gap-1">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              filled 
                ? 'bg-emerald-100 text-emerald-600' 
                : 'bg-slate-100 text-slate-400'
            }`}>
              {filled ? <Check className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
            </div>
            <span className={`text-xs font-medium ${filled ? 'text-emerald-600' : 'text-slate-400'}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}