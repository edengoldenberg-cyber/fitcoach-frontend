import React from 'react';
import { Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function RecentFoodHistory({ traineeId, onSelect, title = 'מאכלים אחרונים' }) {
  const { data: recentFoods = [] } = useQuery({
    queryKey: ['recentFoodHistory', traineeId],
    queryFn: () => base44.entities.UserRecentFoods.filter({ trainee_id: traineeId }, '-last_used_at', 8),
    enabled: !!traineeId,
  });

  if (!recentFoods.length) return null;

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1 text-sm font-bold text-slate-700">
        <Clock className="h-4 w-4 text-slate-500" /> {title}
      </h3>
      <div className="space-y-2">
        {recentFoods.slice(0, 6).map((food) => (
          <button
            key={food.id}
            type="button"
            onClick={() => onSelect(food)}
            className="w-full min-h-0 rounded-xl border bg-white p-3 text-right shadow-sm hover:bg-slate-50"
          >
            <p className="truncate text-sm font-semibold text-slate-800">{food.food_name}</p>
            <p className="text-xs text-slate-500">
              {food.default_quantity || 100} {food.default_unit || 'גרם'} · {Math.round(food.calories_per_100g || 0)} קל׳/100ג
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}