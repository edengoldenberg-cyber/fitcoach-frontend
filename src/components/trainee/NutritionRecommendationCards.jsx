import React from 'react';
import { Button } from '@/components/ui/button';

const labels = {
  build_meal: 'בנה לי ארוחה מותאמת',
  protein_boost: 'הצע השלמה לחלבון',
  snack: 'הצע נשנוש מתאים',
  water_plan: 'תכנן לי מים להיום',
  ignore: 'התעלם'
};

const styles = {
  protein: 'border-blue-200 bg-blue-50',
  water: 'border-cyan-200 bg-cyan-50',
  meal_balance: 'border-amber-200 bg-amber-50',
  skipped_meal: 'border-orange-200 bg-orange-50',
  info: 'border-slate-200 bg-slate-50',
  general: 'border-emerald-200 bg-emerald-50'
};

export default function NutritionRecommendationCards({ cards = [], hiddenIds = [], onAction }) {
  const visibleCards = cards.filter((card) => !hiddenIds.includes(card.id));

  if (!visibleCards.length) return null;

  return (
    <div className="space-y-3">
      {visibleCards.slice(0, 3).map((card) => (
        <div key={card.id} className={`rounded-2xl border p-4 shadow-sm ${styles[card.type] || styles.general}`}>
          <h3 className="mb-2 text-sm font-bold text-slate-900">{card.title}</h3>
          <p className="text-sm leading-relaxed text-slate-700">{card.insight} {card.why}</p>
          <p className="mt-2 text-sm font-semibold text-slate-800">{card.action}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(card.actions || []).map((action) => (
              <Button
                key={action}
                type="button"
                size="sm"
                variant={action === 'ignore' ? 'ghost' : 'outline'}
                onClick={() => onAction(action, card)}
                className="h-9 rounded-xl bg-white/70 text-xs"
              >
                {labels[action] || action}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}