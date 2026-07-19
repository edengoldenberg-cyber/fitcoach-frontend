import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Star, Zap, Clock, BookmarkPlus, Sparkles, Loader2, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { normalizeFoodName, toggleFavoriteFood } from './nutritionLearning';
import NutritionActionMealBuilder from './NutritionActionMealBuilder';
import { toast } from 'sonner';

const MEAL_TYPE_LABELS = {
  breakfast: 'הוסף לארוחת בוקר',
  lunch:     'הוסף לארוחת צהריים',
  dinner:    'הוסף לארוחת ערב',
  snack:     'הוסף לארוחת ביניים',
};
const MEAL_TYPE_NAMES = {
  breakfast: 'ארוחת בוקר',
  lunch:     'ארוחת צהריים',
  dinner:    'ארוחת ערב',
  snack:     'ארוחת ביניים',
};

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
  const [addingSavedMealId, setAddingSavedMealId] = useState(null);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const [search, setSearch] = useState('');
  const [builderIntent, setBuilderIntent] = useState(null);
  const [showAllSavedMeals, setShowAllSavedMeals] = useState(false);

  // Edit saved meal state
  const [editingSavedMeal, setEditingSavedMeal] = useState(null);
  const [editName, setEditName] = useState('');
  const [editMealType, setEditMealType] = useState('snack');
  const [editFoods, setEditFoods] = useState([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [isDeletingId, setIsDeletingId] = useState(null);

  const queryClient = useQueryClient();

  const { data: recent = [] } = useQuery({
    queryKey: ['quickRecentFoods', trainee?.id],
    queryFn: () => base44.entities.UserRecentFoods.filter({ trainee_id: trainee?.id }),
    enabled: !!trainee?.id
  });

  const { data: favorites = [] } = useQuery({
    queryKey: ['quickFavoriteFoods', trainee?.id],
    queryFn: () => base44.entities.UserRecentFoods.filter({ trainee_id: trainee?.id, favorite: true }),
    enabled: !!trainee?.id
  });

  const { data: savedMeals = [], isLoading: savedMealsLoading } = useQuery({
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
    if (addingSavedMealId) return;

    const foodItems = savedMeal.foods || [];
    if (!foodItems.length) {
      toast.error('הארוחה השמורה ריקה');
      return;
    }

    // If logger opened from a specific meal section, use that type; otherwise use the saved type.
    const mealType = defaultMealType || savedMeal.meal_type || 'snack';

    setAddingSavedMealId(savedMeal.id);
    try {
      // Create one MealEntry per food item — matches the canonical Nutrition Engine
      // architecture used by photo, AI text, manual, and barcode save paths.
      for (const f of foodItems) {
        const calories = Number.isFinite(Number(f.calories)) ? Math.round(Number(f.calories)) : 0;
        if (!calories && !f.food_name) continue;
        await base44.entities.MealEntry.create({
          trainee_email:       trainee.user_email,
          date:                dateStr,
          meal_type:           mealType,
          food_name:           f.food_name || 'פריט לא ידוע',
          calories,
          protein:  Number.isFinite(Number(f.protein)) ? Number(f.protein) : 0,
          carbs:    Number.isFinite(Number(f.carbs))   ? Number(f.carbs)   : 0,
          fat:      Number.isFinite(Number(f.fat))     ? Number(f.fat)     : 0,
          quantity: f.grams_equivalent || f.grams_final || f.quantity || 100,
          unit:     f.unit || 'gram',
          source:   'saved_meal',
          learning_event_type: 'search',
        });
      }

      // Update usage_count only after all individual creates succeed.
      await base44.entities.UserSavedMeals.update(savedMeal.id, {
        usage_count:  (savedMeal.usage_count || 0) + 1,
        last_used_at: new Date().toISOString(),
      });

      queryClient.invalidateQueries({ queryKey: ['meals'] });
      queryClient.invalidateQueries({ queryKey: ['quickSavedMeals'] });
      toast.success(`"${savedMeal.meal_name}" נוספה`);
    } catch (err) {
      console.error('[addSavedMeal] error:', err);
      toast.error('שגיאה בהוספת הארוחה — נסה שנית');
    } finally {
      setAddingSavedMealId(null);
    }
  };

  const openEditMeal = (meal) => {
    setEditingSavedMeal(meal);
    setEditName(meal.meal_name || '');
    setEditMealType(meal.meal_type || 'snack');
    setEditFoods(
      (meal.foods || []).map(f => ({
        ...f,
        _grams: String(f.grams_equivalent || f.grams_final || f.quantity || 100),
      }))
    );
  };

  const updateEditFoodGrams = (index, gramsStr) => {
    setEditFoods(prev => prev.map((f, i) => i === index ? { ...f, _grams: gramsStr } : f));
  };

  const saveEditedMeal = async () => {
    if (!editingSavedMeal || isSavingEdit) return;
    const trimmedName = editName.trim();
    if (!trimmedName) { toast.error('נא להזין שם לארוחה'); return; }

    const updatedFoods = editFoods.map(f => {
      const { _grams, ...rest } = f;
      const g = parseFloat(_grams) || 100;
      const origGrams = rest.grams_equivalent || rest.grams_final || rest.quantity || 100;
      const per100Kcal    = rest.per100_kcal    || (origGrams > 0 ? (rest.calories || 0) / origGrams * 100 : 0);
      const per100Protein = rest.per100_protein || (origGrams > 0 ? (rest.protein  || 0) / origGrams * 100 : 0);
      const per100Carbs   = rest.per100_carbs   || (origGrams > 0 ? (rest.carbs    || 0) / origGrams * 100 : 0);
      const per100Fat     = rest.per100_fat     || (origGrams > 0 ? (rest.fat      || 0) / origGrams * 100 : 0);
      return {
        ...rest,
        grams_equivalent: g,
        grams_final:      g,
        quantity:         g,
        per100_kcal:    per100Kcal,
        per100_protein: per100Protein,
        per100_carbs:   per100Carbs,
        per100_fat:     per100Fat,
        calories: Math.round((per100Kcal    / 100) * g),
        protein:  Math.round(((per100Protein / 100) * g) * 10) / 10,
        carbs:    Math.round(((per100Carbs   / 100) * g) * 10) / 10,
        fat:      Math.round(((per100Fat     / 100) * g) * 10) / 10,
      };
    });

    const newMacros = updatedFoods.reduce(
      (sum, f) => ({
        calories: sum.calories + (f.calories || 0),
        protein:  Math.round((sum.protein + (f.protein || 0)) * 10) / 10,
        carbs:    Math.round((sum.carbs   + (f.carbs   || 0)) * 10) / 10,
        fat:      Math.round((sum.fat     + (f.fat     || 0)) * 10) / 10,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    setIsSavingEdit(true);
    try {
      await base44.entities.UserSavedMeals.update(editingSavedMeal.id, {
        meal_name:       trimmedName,
        meal_type:       editMealType,
        foods:           updatedFoods,
        macros_snapshot: newMacros,
      });
      queryClient.invalidateQueries({ queryKey: ['quickSavedMeals'] });
      toast.success('הארוחה עודכנה');
      setEditingSavedMeal(null);
    } catch (err) {
      console.error('[saveEditedMeal] error:', err);
      toast.error('שגיאה בעדכון הארוחה — נסה שנית');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const deleteSavedMeal = async (mealId) => {
    if (isDeletingId) return;
    setIsDeletingId(mealId);
    try {
      await base44.entities.UserSavedMeals.delete(mealId);
      queryClient.invalidateQueries({ queryKey: ['quickSavedMeals'] });
      toast.success('הארוחה נמחקה');
      setConfirmDeleteId(null);
    } catch (err) {
      console.error('[deleteSavedMeal] error:', err);
      toast.error('שגיאה במחיקת הארוחה — נסה שנית');
    } finally {
      setIsDeletingId(null);
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

  const visibleSavedMeals = showAllSavedMeals ? savedMeals : savedMeals.slice(0, 4);

  // The add button uses the context meal type when the logger was opened from a specific
  // meal section, otherwise falls back to the saved meal's own type.
  const addButtonLabel = (savedMealType) =>
    MEAL_TYPE_LABELS[defaultMealType || savedMealType] || MEAL_TYPE_LABELS.snack;

  // Live calorie total for the edit dialog preview
  const editTotalCalories = editFoods.reduce((sum, f) => {
    const g = parseFloat(f._grams) || 100;
    const origGrams = f.grams_equivalent || f.grams_final || f.quantity || 100;
    const per100Kcal = f.per100_kcal || (origGrams > 0 ? (f.calories || 0) / origGrams * 100 : 0);
    return sum + Math.round((per100Kcal / 100) * g);
  }, 0);

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

          {/* Search */}
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חפש: קפה, נס, יוג, חלב..." className="h-11 rounded-xl" autoFocus />

          {/* AI suggestion block */}
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

          {/* Saved Meals */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-1 text-sm font-bold text-slate-700">
              <BookmarkPlus className="h-4 w-4 text-emerald-600" /> ארוחות שמורות
            </h3>

            {savedMealsLoading ? (
              <div className="space-y-2">
                <div className="h-20 rounded-xl bg-slate-100 animate-pulse" />
                <div className="h-20 rounded-xl bg-slate-100 animate-pulse" />
              </div>
            ) : savedMeals.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center">
                <p className="text-sm text-slate-500">עדיין לא שמרת ארוחות</p>
                <p className="mt-0.5 text-xs text-slate-400">אפשר לשמור ארוחה קיימת ולהוסיף אותה שוב בלחיצה אחת</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {visibleSavedMeals.map((meal) => {
                    const isAdding = addingSavedMealId === meal.id;
                    const isConfirmingDelete = confirmDeleteId === meal.id;
                    const protein = meal.macros_snapshot?.protein;
                    return (
                      <div
                        key={meal.id}
                        className={`rounded-xl border border-emerald-100 bg-emerald-50 p-3 transition-opacity ${isAdding ? 'opacity-60' : ''}`}
                      >
                        {isConfirmingDelete ? (
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-slate-700">למחוק את "{meal.meal_name}"?</p>
                            <div className="flex gap-1.5 flex-shrink-0">
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 px-2 text-xs"
                                onClick={() => deleteSavedMeal(meal.id)}
                                disabled={isDeletingId === meal.id}
                              >
                                {isDeletingId === meal.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'מחק'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => setConfirmDeleteId(null)}
                                disabled={!!isDeletingId}
                              >
                                ביטול
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-emerald-900 truncate">{meal.meal_name}</p>
                                <p className="text-xs text-emerald-700 mt-0.5">
                                  {meal.foods?.length || 0} פריטים
                                  {' · '}{meal.macros_snapshot?.calories || 0} קל׳
                                  {protein > 0 && ` · ${protein}ג׳ חלבון`}
                                </p>
                                <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                  {MEAL_TYPE_NAMES[meal.meal_type] || meal.meal_type || 'חטיף'}
                                </span>
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => openEditMeal(meal)}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-100 hover:text-emerald-700 transition-colors"
                                  disabled={!!addingSavedMealId}
                                  title="ערוך ארוחה"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(meal.id)}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                  disabled={!!addingSavedMealId}
                                  title="מחק ארוחה"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            <Button
                              size="sm"
                              className="w-full h-8 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-medium"
                              onClick={() => addSavedMeal(meal)}
                              disabled={!!addingSavedMealId}
                            >
                              {isAdding
                                ? <><Loader2 className="h-3 w-3 animate-spin ml-1" /> מוסיף...</>
                                : addButtonLabel(meal.meal_type)
                              }
                            </Button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {savedMeals.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setShowAllSavedMeals(v => !v)}
                    className="w-full py-1 text-xs text-emerald-600 hover:text-emerald-700 flex items-center justify-center gap-1"
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAllSavedMeals ? 'rotate-180' : ''}`} />
                    {showAllSavedMeals ? 'הצג פחות' : `הצג את כל הארוחות השמורות (${savedMeals.length})`}
                  </button>
                )}
              </>
            )}
          </section>

          {/* Favorites */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-1 text-sm font-bold text-slate-700"><Star className="h-4 w-4 text-amber-500" /> מועדפים</h3>
            {(filteredFoods.filter(f => f.favorite).slice(0, 5)).map((food) => (
              <FoodChip key={`fav-${food.id}`} food={food} onAdd={addFood} onFavorite={favoriteFood} />
            ))}
          </section>

          {/* Recent foods */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-1 text-sm font-bold text-slate-700"><Clock className="h-4 w-4" /> אחרונים ונפוצים</h3>
            {filteredFoods.length === 0
              ? <p className="text-center text-sm text-slate-400 py-6">עדיין אין מזונות בזיכרון האישי</p>
              : filteredFoods.map((food) => <FoodChip key={food.id} food={food} onAdd={addFood} onFavorite={favoriteFood} />)
            }
          </section>
        </DialogContent>
      </Dialog>

      {/* Edit Saved Meal Dialog */}
      <Dialog open={!!editingSavedMeal} onOpenChange={(v) => { if (!v && !isSavingEdit) setEditingSavedMeal(null); }}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת ארוחה שמורה</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-600">שם הארוחה</p>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="לדוגמה: סלט בוקר"
                disabled={isSavingEdit}
                onKeyDown={(e) => e.key === 'Enter' && saveEditedMeal()}
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-600">סוג ארוחה</p>
              <Select value={editMealType} onValueChange={setEditMealType} disabled={isSavingEdit}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">ארוחת בוקר</SelectItem>
                  <SelectItem value="lunch">ארוחת צהריים</SelectItem>
                  <SelectItem value="dinner">ארוחת ערב</SelectItem>
                  <SelectItem value="snack">ארוחת ביניים</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editFoods.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-600">פריטי הארוחה</p>
                <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50 p-2">
                  {editFoods.map((f, i) => {
                    const g = parseFloat(f._grams) || 100;
                    const origGrams = f.grams_equivalent || f.grams_final || f.quantity || 100;
                    const per100Kcal = f.per100_kcal || (origGrams > 0 ? (f.calories || 0) / origGrams * 100 : 0);
                    const previewCal = Math.round((per100Kcal / 100) * g);
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <p className="flex-1 text-xs text-slate-700 truncate min-w-0">{f.food_name}</p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Input
                            type="number"
                            value={f._grams}
                            onChange={e => updateEditFoodGrams(i, e.target.value)}
                            className="h-7 w-16 text-xs text-center"
                            disabled={isSavingEdit}
                          />
                          <span className="text-xs text-slate-400 w-4">ג׳</span>
                        </div>
                        <span className="text-xs font-medium text-emerald-600 w-14 text-left flex-shrink-0">
                          {previewCal} קל׳
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 text-left">סה״כ: {editTotalCalories} קל׳</p>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setEditingSavedMeal(null)}
              disabled={isSavingEdit}
              className="flex-1"
            >
              ביטול
            </Button>
            <Button
              onClick={saveEditedMeal}
              disabled={isSavingEdit}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSavingEdit
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> שומר...</>
                : 'שמור'
              }
            </Button>
          </DialogFooter>
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
