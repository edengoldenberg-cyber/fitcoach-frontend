import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { BookmarkPlus } from 'lucide-react';
import { toast } from 'sonner';

const bucketNow = () => {
  const hour = new Date().getHours();
  if (hour < 11) return 'morning';
  if (hour < 14) return 'noon';
  if (hour < 18) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
};

export default function SaveMealButton({ trainee, mealType, meals }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  if (!meals?.length) return null;

  const saveMeal = async () => {
    if (isSaving) return;

    if (!trainee?.id) {
      toast.error('פרטי המתאמן לא נטענו — נסה שנית');
      return;
    }

    const validFoods = (meals || []).filter(m =>
      m?.food_name &&
      Number.isFinite(Number(m?.calories)) &&
      Number.isFinite(Number(m?.protein)) &&
      Number.isFinite(Number(m?.carbs)) &&
      Number.isFinite(Number(m?.fat))
    );

    if (!validFoods.length) {
      toast.error('אין פריטי מזון תקינים לשמירה');
      return;
    }

    const mealName = name.trim() || 'ארוחה שמורה';

    const foods = validFoods.map((meal) => ({
      food_name:          meal.food_name,
      food_id:            meal.food_item_id,
      user_food_item_id:  meal.user_food_item_id,
      quantity:           meal.quantity || 0,
      unit:               meal.unit || 'gram',
      grams_equivalent:   meal.grams_equivalent || meal.grams_final || 0,
      grams_final:        meal.grams_final || meal.grams_equivalent || 0,
      calories:           Number.isFinite(Number(meal.calories))    ? Number(meal.calories)    : 0,
      protein:            Number.isFinite(Number(meal.protein))     ? Number(meal.protein)     : 0,
      carbs:              Number.isFinite(Number(meal.carbs))       ? Number(meal.carbs)       : 0,
      fat:                Number.isFinite(Number(meal.fat))         ? Number(meal.fat)         : 0,
      per100_kcal:        Number.isFinite(Number(meal.per100_kcal))    ? Number(meal.per100_kcal)    : 0,
      per100_protein:     Number.isFinite(Number(meal.per100_protein)) ? Number(meal.per100_protein) : 0,
      per100_carbs:       Number.isFinite(Number(meal.per100_carbs))   ? Number(meal.per100_carbs)   : 0,
      per100_fat:         Number.isFinite(Number(meal.per100_fat))     ? Number(meal.per100_fat)     : 0,
    }));

    const macros = foods.reduce((sum, food) => ({
      calories: sum.calories + food.calories,
      protein:  Math.round((sum.protein + food.protein) * 10) / 10,
      carbs:    Math.round((sum.carbs   + food.carbs)   * 10) / 10,
      fat:      Math.round((sum.fat     + food.fat)     * 10) / 10,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    setIsSaving(true);
    try {
      // trainee_id and trainee_email are injected from JWT on the backend;
      // sending trainee_email here is belt-and-suspenders only.
      await base44.entities.UserSavedMeals.create({
        trainee_email:      trainee.user_email || trainee.email,
        meal_name:          mealName,
        meal_type:          mealType,
        foods,
        macros_snapshot:    macros,
        usage_count:        0,
        favorite:           false,
        time_of_day_bucket: bucketNow(),
      });
      queryClient.invalidateQueries({ queryKey: ['quickSavedMeals'] });
      toast.success(`"${mealName}" נשמרה להוספה מהירה`);
      setOpen(false);
      setName('');
    } catch (err) {
      console.error('[SaveMealButton] save failed:', err);
      toast.error('שמירת הארוחה נכשלה — נסה שנית');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs text-slate-500"
        onClick={() => setOpen(true)}
        disabled={!trainee?.id}
      >
        <BookmarkPlus className="h-3.5 w-3.5" /> שמור
      </Button>
      <Dialog open={open} onOpenChange={(v) => { if (!isSaving) setOpen(v); }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>שמירת ארוחה</DialogTitle></DialogHeader>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="לדוגמה: קפה של הבוקר"
            disabled={isSaving}
            onKeyDown={(e) => e.key === 'Enter' && saveMeal()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>ביטול</Button>
            <Button onClick={saveMeal} disabled={isSaving}>
              {isSaving ? 'שומר...' : 'שמור ארוחה'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
