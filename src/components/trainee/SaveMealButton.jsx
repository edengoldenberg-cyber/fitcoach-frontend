import React, { useState } from 'react';
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

  if (!meals?.length) return null;

  const saveMeal = async () => {
    const foods = meals.map((meal) => ({
      food_name: meal.food_name,
      food_id: meal.food_item_id,
      user_food_item_id: meal.user_food_item_id,
      quantity: meal.quantity,
      unit: meal.unit,
      grams_equivalent: meal.grams_equivalent || meal.grams_final,
      grams_final: meal.grams_final || meal.grams_equivalent,
      calories: meal.calories || 0,
      protein: meal.protein || 0,
      carbs: meal.carbs || 0,
      fat: meal.fat || 0,
      per100_kcal:    meal.per100_kcal    || 0,
      per100_protein: meal.per100_protein || 0,
      per100_carbs:   meal.per100_carbs   || 0,
      per100_fat:     meal.per100_fat     || 0,
    }));
    const macros = foods.reduce((sum, food) => ({
      calories: sum.calories + (food.calories || 0),
      protein: Math.round((sum.protein + (food.protein || 0)) * 10) / 10,
      carbs: Math.round((sum.carbs + (food.carbs || 0)) * 10) / 10,
      fat: Math.round((sum.fat + (food.fat || 0)) * 10) / 10
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    await base44.entities.UserSavedMeals.create({
      trainee_id: trainee?.id,
      trainee_email: trainee?.user_email || trainee?.email,
      meal_name: name.trim() || 'ארוחה שמורה',
      meal_type: mealType,
      foods,
      macros_snapshot: macros,
      usage_count: 0,
      favorite: false,
      time_of_day_bucket: bucketNow(),
      created_at: new Date().toISOString()
    });
    toast.success('הארוחה נשמרה להוספה מהירה');
    setOpen(false);
    setName('');
  };

  return (
    <>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-500" onClick={() => setOpen(true)}>
        <BookmarkPlus className="h-3.5 w-3.5" /> שמור
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>שמירת ארוחה</DialogTitle></DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: קפה של הבוקר" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
            <Button onClick={saveMeal}>שמור ארוחה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}