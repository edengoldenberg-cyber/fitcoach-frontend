import React, { useState } from 'react';
import { ArrowLeftRight, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function MealItemRow({ item, itemIndex, mealIndex, dayIndex, planId, onMealUpdated }) {
  const [showAlt, setShowAlt] = useState(false);
  const [aiAlternatives, setAiAlternatives] = useState(null);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const fetchAIAlternatives = async () => {
    if (aiAlternatives) { setShowAlt(v => !v); return; }
    setLoading(true);
    setShowAlt(true);
    try {
      const res = await base44.functions.invoke('replaceItemInMeal', {
        plan_id: planId,
        meal_index: mealIndex,
        item_index: itemIndex,
        day_index: dayIndex ?? 0,
        action: 'replace'
      });
      setAiAlternatives(res.data?.alternatives || []);
    } catch (err) {
      console.error('fetchAIAlternatives failed:', err.message);
      setShowAlt(false);
    } finally {
      setLoading(false);
    }
  };

  const removeItem = async () => {
    setRemoving(true);
    try {
      const res = await base44.functions.invoke('replaceItemInMeal', {
        plan_id: planId,
        meal_index: mealIndex,
        item_index: itemIndex,
        action: 'remove'
      });
      if (res.data?.updatedMeal) onMealUpdated(mealIndex, res.data.updatedMeal);
    } catch (err) {
      console.error('removeItem failed:', err.message);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-right flex-1">
          <div className="font-medium text-slate-800 text-sm">{item.food_item}</div>
          <div className="text-xs text-slate-500">{item.quantity_description || `${item.quantity_grams}ג`}</div>
          <div className="flex gap-2 mt-0.5 text-[11px]">
            <span className="text-slate-600">{Math.round(item.calories)} קק"ל</span>
            <span className="text-blue-500">ח:{Math.round(item.protein)}ג</span>
            <span className="text-amber-500">פ:{Math.round(item.carbs)}ג</span>
            <span className="text-green-500">ש:{Math.round(item.fat)}ג</span>
          </div>
          {item.alternative && (
            <div className="mt-1 text-[11px] text-slate-400">
              ↔ חלופה: <span className="text-teal-600 font-medium">{item.alternative}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={fetchAIAlternatives}
            disabled={loading}
            className="flex items-center gap-1 text-xs text-teal-600 border border-teal-200 rounded-lg px-2 py-1 bg-teal-50 hover:bg-teal-100 transition-colors"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowLeftRight className="w-3 h-3" />}
            חלופות
          </button>
          <button
            onClick={removeItem}
            disabled={removing}
            className="flex items-center gap-1 text-xs text-red-400 border border-red-100 rounded-lg px-2 py-1 bg-red-50 hover:bg-red-100 transition-colors"
          >
            {removing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {showAlt && (
        <div className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-100">
          <div className="flex items-center gap-1 mb-2">
            <Sparkles className="w-3 h-3 text-teal-500" />
            <p className="text-xs font-medium text-teal-700">חלופות AI (לחץ להחלפה):</p>
          </div>
          {loading && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
              <span className="text-xs text-slate-500 mr-2">מחפש חלופות...</span>
            </div>
          )}
          {!loading && aiAlternatives && aiAlternatives.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">לא נמצאו חלופות מתאימות, נסה שוב</p>
          )}
          {aiAlternatives?.map((alt, ai) => (
            <div key={ai} className="flex items-center gap-2 text-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" />
              <div className="flex-1 text-right">
                <span className="text-slate-700 font-medium">{alt.food_item}</span>
                <span className="text-slate-400 text-xs mr-1">{alt.quantity_description || `${alt.quantity_grams}ג`}</span>
              </div>
              {alt.calories && (
                <div className="text-[11px] text-slate-500 text-left flex-shrink-0">
                  <div>{Math.round(alt.calories)} קק"ל</div>
                  {alt.protein && <div className="text-blue-400">ח:{Math.round(alt.protein)}ג</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}