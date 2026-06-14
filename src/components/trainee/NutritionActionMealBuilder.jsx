import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Sparkles } from 'lucide-react';

const intentTitles = {
  build_meal: 'ארוחה מותאמת',
  protein_boost: 'השלמת חלבון',
  snack: 'נשנוש מתאים'
};

export default function NutritionActionMealBuilder({ open, onClose, traineeEmail, dateStr, mealType, intent, onAddMeal }) {
  const [loading, setLoading] = useState(false);
  const [meal, setMeal] = useState(null);

  useEffect(() => {
    if (!open || !traineeEmail) return;
    setMeal(null);
    setLoading(true);
    base44.functions.invoke('buildNutritionActionMeal', {
      trainee_email: traineeEmail,
      meal_type: mealType,
      intent,
      selected_date: dateStr
    }).then((res) => {
      setMeal(res.data);
    }).finally(() => setLoading(false));
  }, [open, traineeEmail, mealType, intent, dateStr]);

  const addMeal = () => {
    if (!meal?.ingredients?.length) return;
    const finalMealType = meal.meal_type || mealType || 'snack';
    meal.ingredients.forEach((item) => {
      onAddMeal({
        trainee_email: traineeEmail,
        date: dateStr,
        meal_type: finalMealType,
        food_name: item.food_name,
        quantity: item.quantity || item.grams || 1,
        amount: item.quantity || item.grams || 1,
        unit: item.unit || 'גרם',
        unit_name: item.unit || 'גרם',
        grams_equivalent: item.grams || item.quantity || 0,
        grams_final: item.grams || item.quantity || 0,
        calories: Math.round(item.calories || 0),
        protein: Math.round((item.protein || 0) * 10) / 10,
        carbs: Math.round((item.carbs || 0) * 10) / 10,
        fat: Math.round((item.fat || 0) * 10) / 10,
        learning_event_type: 'ai'
      });
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            {intentTitles[intent] || 'ארוחה מותאמת'}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="py-10 text-center text-slate-600">
            <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-amber-500" />
            בונה הצעה לפי מה שנשאר לך היום...
          </div>
        )}

        {!loading && meal?.not_enough_data && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {meal.message}
          </div>
        )}

        {!loading && meal && !meal.not_enough_data && (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-gradient-to-br from-amber-50 to-orange-50 p-4">
              <h3 className="text-lg font-bold text-slate-900">{meal.meal_name}</h3>
              <p className="mt-1 text-sm text-slate-600">{meal.explanation}</p>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-lg bg-white p-2"><b className="text-emerald-600">{Math.round(meal.totals?.calories || 0)}</b><br />קל׳</div>
                <div className="rounded-lg bg-white p-2"><b className="text-blue-600">{Math.round(meal.totals?.protein || 0)}ג׳</b><br />חלבון</div>
                <div className="rounded-lg bg-white p-2"><b className="text-orange-600">{Math.round(meal.totals?.carbs || 0)}ג׳</b><br />פחמימות</div>
                <div className="rounded-lg bg-white p-2"><b className="text-purple-600">{Math.round(meal.totals?.fat || 0)}ג׳</b><br />שומן</div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-bold text-slate-700">מרכיבים</h4>
              {meal.ingredients?.map((item, index) => (
                <div key={`${item.food_name}-${index}`} className="flex justify-between rounded-xl border bg-white p-3 text-sm">
                  <span className="font-medium text-slate-800">{item.food_name}</span>
                  <span className="text-slate-500">{item.quantity} {item.unit}</span>
                </div>
              ))}
            </div>

            <Button onClick={addMeal} className="w-full bg-emerald-500 text-white hover:bg-emerald-600">
              <Plus className="h-4 w-4 ml-1" />
              הוסף לארוחה
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}