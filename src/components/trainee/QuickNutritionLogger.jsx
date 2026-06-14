import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Star, Zap, Clock, TrendingUp, BookmarkPlus, Sparkles, Loader2 } from 'lucide-react';
import { normalizeFoodName, toggleFavoriteFood } from './nutritionLearning';
import NutritionActionMealBuilder from './NutritionActionMealBuilder';
import { toast } from 'sonner';

const bucketNow = () => {
  const hour = new Date().getHours();
  if (hour < 11) return 'morning';
  if (hour < 14) return 'noon';
  if (hour < 18) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
};

const toMealData = (food, mealType, dateStr) => {
  const quantity = food.default_quantity || food.serving_size || 100;
  const unit = food.default_unit || food.unit || 'gram';
  const grams = unit === 'gram' || unit === 'גרם' ? quantity : (food.serving_size || quantity || 100);
  const factor = grams / 100;
  return {
    trainee_email: food.trainee_email,
    date: dateStr,
    meal_type: mealType || food.meal_type || 'snack',
    food_name: food.food_name,
    food_item_id: food.food_id,
    user_food_item_id: food.user_food_item_id,
    food_database_scope: food.source_scope || 'personal',
    learning_event_type: 'search',
    quantity,
    amount: quantity,
    unit,
    unit_name: unit,
    grams_equivalent: Math.round(grams * 10) / 10,
    grams_final: Math.round(grams * 10) / 10,
    calories: Math.round((food.calories_per_100g || 0) * factor),
    protein: Math.round((food.protein_per_100g || 0) * factor * 10) / 10,
    carbs: Math.round((food.carbs_per_100g || 0) * factor * 10) / 10,
    fat: Math.round((food.fat_per_100g || 0) * factor * 10) / 10,
    per100_kcal:    food.calories_per_100g || 0,
    per100_protein: food.protein_per_100g  || 0,
    per100_carbs:   food.carbs_per_100g    || 0,
    per100_fat:     food.fat_per_100g      || 0,
  };
};

function FoodChip({ food, onAdd, onFavorite }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-white p-2 shadow-sm">
      <button onClick={() => onAdd(food)} className="flex-1 text-right min-h-0 justify-start">
        <p className="truncate text-sm font-semibold text-slate-800">{food.food_name}</p>
        <p className="text-xs text-slate-500">{food.default_quantity || food.serving_size || 100} {food.default_unit || food.unit || 'גרם'} · {food.calories_per_100g || 0} קל׳/100ג</p>
      </button>
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onFavorite(food)}>
        <Star className={`h-4 w-4 ${food.favorite ? 'fill-amber-400 text-amber-500' : 'text-slate-300'}`} />
      </Button>
    </div>
  );
}

export default function QuickNutritionLogger({ trainee, dateStr, defaultMealType, onAddMeal, onAddMealAsync, open: controlledOpen, onOpenChange, hideTrigger = false, title = 'הוספה מהירה' }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const [search, setSearch] = useState('');
  const [builderIntent, setBuilderIntent] = useState(null);
  const queryClient = useQueryClient();

  const { data: recent = [] } = useQuery({
    queryKey: ['quickRecentFoods', trainee?.id],
    queryFn: () => base44.entities.UserRecentFoods.filter({ trainee_id: trainee?.id }),
    enabled: !!trainee?.id
  });

  const { data: favorites = [] } = useQuery({
    queryKey: ['quickFavoriteFoods', trainee?.id],
    queryFn: () => base44.entities.UserFavoriteFoods.filter({ trainee_id: trainee?.id }),
    enabled: !!trainee?.id
  });

  const { data: savedMeals = [] } = useQuery({
    queryKey: ['quickSavedMeals', trainee?.id],
    queryFn: () => base44.entities.UserSavedMeals.filter({ trainee_id: trainee?.id }),
    enabled: !!trainee?.id
  });

  const { data: smartSuggestions, isLoading: loadingSuggestions } = useQuery({
    queryKey: ['quickSmartMealSuggestions', trainee?.user_email, dateStr],
    queryFn: async () => {
      const res = await base44.functions.invoke('generateSmartMealSuggestions', { trainee_email: trainee.user_email });
      return res.data;
    },
    enabled: open && !!trainee?.user_email,
    staleTime: 60 * 1000,
    retry: 1
  });

  const foods = useMemo(() => {
    const map = new Map();
    [...favorites, ...recent].forEach((item) => {
      const key = item.user_food_item_id || item.food_id || normalizeFoodName(item.food_name);
      map.set(key, { ...map.get(key), ...item, favorite: item.favorite || favorites.some(f => (f.user_food_item_id || f.food_id || normalizeFoodName(f.food_name)) === key) });
    });
    return Array.from(map.values());
  }, [recent, favorites]);

  const filteredFoods = useMemo(() => {
    const q = normalizeFoodName(search);
    return foods
      .filter((food) => !q || normalizeFoodName(food.food_name).includes(q))
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        if ((a.usage_count || 0) !== (b.usage_count || 0)) return (b.usage_count || 0) - (a.usage_count || 0);
        return new Date(b.last_used_at || 0) - new Date(a.last_used_at || 0);
      })
      .slice(0, 20);
  }, [foods, search]);

  const addFood = async (food) => {
    const mealData = toMealData({ ...food, trainee_email: trainee.user_email }, defaultMealType, dateStr);
    await onAddMeal(mealData);
    // recordQuickFoodUse is called by NutritionLog.handleAddMeal for learning_event_type:'search'.
    // Calling it here again was incrementing usage_count twice per quick-add.
    queryClient.invalidateQueries({ queryKey: ['quickRecentFoods'] });
    toast.success('נוסף במהירות');
  };

  const addSavedMeal = async (savedMeal) => {
    const saveOne = onAddMealAsync || onAddMeal;
    const foods = savedMeal.foods || [];
    let failedFood = null;
    try {
      for (const food of foods) {
        await saveOne({ ...food, trainee_email: trainee.user_email, date: dateStr, meal_type: savedMeal.meal_type || defaultMealType || 'snack', learning_event_type: 'search' });
      }
      // Only update usage_count after every ingredient saved successfully.
      await base44.entities.UserSavedMeals.update(savedMeal.id, { usage_count: (savedMeal.usage_count || 0) + 1, last_used_at: new Date().toISOString() });
      queryClient.invalidateQueries({ queryKey: ['quickSavedMeals'] });
      toast.success('הארוחה השמורה נוספה');
    } catch (err) {
      failedFood = err?.food_name || '';
      console.error('[addSavedMeal] partial save failure', err);
      toast.error(`שגיאה בשמירת הארוחה${failedFood ? ` (${failedFood})` : ''} — חלק מהמרכיבים לא נשמרו`);
    }
  };

  const favoriteFood = async (food) => {
    await toggleFavoriteFood({ trainee, food, favorite: !food.favorite, timeOfDayBucket: bucketNow() });
    queryClient.invalidateQueries({ queryKey: ['quickFavoriteFoods'] });
    queryClient.invalidateQueries({ queryKey: ['quickRecentFoods'] });
  };

  const quickSuggestionCards = (smartSuggestions?.recommendation_cards || [])
    .filter(card => (card.actions || []).some(action => ['build_meal', 'protein_boost', 'snack'].includes(action)))
    .slice(0, 2);

  return (
    <>
      {!hideTrigger && (
        <Button onClick={() => setOpen(true)} className="w-full h-11 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 shadow-sm">
          <Zap className="h-4 w-4" /> הוספה מהירה
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto p-4" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg"><Zap className="h-5 w-5 text-amber-500" /> {title}</DialogTitle>
          </DialogHeader>

          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חפש: קפה, נס, יוג, חלב..." className="h-11 rounded-xl" autoFocus />

          <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <h3 className="flex items-center gap-1 text-sm font-bold text-amber-900"><Sparkles className="h-4 w-4" /> הצע לי מה לאכול עכשיו</h3>
            <p className="text-xs leading-relaxed text-amber-800">מבוסס על נתוני העבר ומה שנשאר לך היום.</p>
            {loadingSuggestions ? (
              <div className="flex items-center gap-2 text-xs text-amber-700">
                <Loader2 className="h-3 w-3 animate-spin" /> טוען הצעות אישיות...
              </div>
            ) : quickSuggestionCards.length > 0 ? (
              <div className="space-y-2">
                {quickSuggestionCards.map((card) => {
                  const action = (card.actions || []).find(item => ['build_meal', 'protein_boost', 'snack'].includes(item)) || 'build_meal';
                  return (
                    <button key={card.id} type="button" onClick={() => setBuilderIntent(action)} className="w-full rounded-xl bg-white p-3 text-right shadow-sm min-h-0">
                      <p className="text-sm font-bold text-slate-900">{card.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">{card.action || card.insight}</p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <Button type="button" onClick={() => setBuilderIntent('build_meal')} className="w-full rounded-xl bg-amber-500 text-white hover:bg-amber-600">
                <Sparkles className="h-4 w-4" /> בנה לי ארוחה מהירה
              </Button>
            )}
          </section>

          {savedMeals.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1 text-sm font-bold text-slate-700"><BookmarkPlus className="h-4 w-4" /> ארוחות שמורות</h3>
              <div className="grid grid-cols-2 gap-2">
                {savedMeals.slice(0, 4).map((meal) => (
                  <button key={meal.id} onClick={() => addSavedMeal(meal)} className="rounded-xl border bg-emerald-50 p-2 text-right min-h-0">
                    <p className="text-sm font-bold text-emerald-900 truncate">{meal.meal_name}</p>
                    <p className="text-xs text-emerald-700">{meal.macros_snapshot?.calories || 0} קל׳ · {meal.foods?.length || 0} פריטים</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="flex items-center gap-1 text-sm font-bold text-slate-700"><Star className="h-4 w-4 text-amber-500" /> מועדפים</h3>
            {(filteredFoods.filter(f => f.favorite).slice(0, 5)).map((food) => <FoodChip key={`fav-${food.id}`} food={food} onAdd={addFood} onFavorite={favoriteFood} />)}
          </section>

          <section className="space-y-2">
            <h3 className="flex items-center gap-1 text-sm font-bold text-slate-700"><Clock className="h-4 w-4" /> אחרונים ונפוצים</h3>
            {filteredFoods.length === 0 ? <p className="text-center text-sm text-slate-400 py-6">עדיין אין מזונות בזיכרון האישי</p> : filteredFoods.map((food) => <FoodChip key={food.id} food={food} onAdd={addFood} onFavorite={favoriteFood} />)}
          </section>
        </DialogContent>
      </Dialog>

      <NutritionActionMealBuilder
        open={!!builderIntent}
        onClose={() => setBuilderIntent(null)}
        traineeEmail={trainee?.user_email}
        dateStr={dateStr}
        mealType={defaultMealType || 'snack'}
        intent={builderIntent || 'build_meal'}
        onAddMeal={onAddMeal}
      />
    </>
  );
}