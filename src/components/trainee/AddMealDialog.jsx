import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus } from "lucide-react";
import ProductManagementDialog from './ProductManagementDialog';

const UNITS = [
  { value: 'gram', label: 'גרם', multiplier: 1 },
  { value: '100g', label: '100 גרם', multiplier: 100 },
  { value: 'ml', label: 'מ"ל', multiplier: 1 },
  { value: 'tablespoon', label: 'כף', multiplier: null },
  { value: 'teaspoon', label: 'כפית', multiplier: null },
  { value: 'unit', label: 'יחידה', multiplier: null },
  { value: 'slice', label: 'פרוסה', multiplier: null },
  { value: 'half_slice', label: 'חצי פרוסה', multiplier: null },
  { value: 'cup', label: 'כוס', multiplier: null },
  { value: 'half_cup', label: 'חצי כוס', multiplier: null },
];

const MEAL_TYPES = [
  { value: 'breakfast', label: 'ארוחת בוקר' },
  { value: 'lunch', label: 'ארוחת צהריים' },
  { value: 'dinner', label: 'ארוחת ערב' },
  { value: 'snack', label: 'חטיף' },
];

export default function AddMealDialog({ open, onClose, onSave, traineeEmail, editingMeal = null, defaultMealType = null }) {
  const [search, setSearch] = useState('');
  const [selectedFood, setSelectedFood] = useState(null);
  const [quantity, setQuantity] = useState(100);
  const [unit, setUnit] = useState('gram');
  const [mealType, setMealType] = useState(defaultMealType || 'breakfast');
  const [customFood, setCustomFood] = useState({ name: '', calories: 0, protein: 0, carbs: 0, fat: 0, per100_kcal: null, per100_protein: null, per100_carbs: null, per100_fat: null });
  const [showCustom, setShowCustom] = useState(false);
  const [showProductManager, setShowProductManager] = useState(false);

  // Load editing meal data
  React.useEffect(() => {
    if (editingMeal && open) {
      setMealType(editingMeal.meal_type);
      setQuantity(editingMeal.quantity);
      setUnit(editingMeal.unit);
      if (editingMeal.food_item_id) {
        // Will be loaded from FoodItem
      } else {
        setShowCustom(true);
        setCustomFood({
          name: editingMeal.food_name,
          calories: editingMeal.calories,
          protein: editingMeal.protein,
          carbs: editingMeal.carbs,
          fat: editingMeal.fat,
          // per100 fields populated when meal came from barcode scan, enabling gram-based recalculation
          per100_kcal: editingMeal.per100_kcal || null,
          per100_protein: editingMeal.per100_protein || null,
          per100_carbs: editingMeal.per100_carbs || null,
          per100_fat: editingMeal.per100_fat || null,
        });
      }
    } else if (!open) {
      resetForm();
    } else if (open && !editingMeal && defaultMealType) {
      setMealType(defaultMealType);
    }
  }, [editingMeal, open, defaultMealType]);

  const { data: foodItems = [] } = useQuery({
    queryKey: ['foodItems'],
    queryFn: () => base44.entities.FoodItem.list(),
  });

  const filteredFoods = foodItems.filter(f => 
    f.name?.toLowerCase().includes(search.toLowerCase())
  );

  const calculateNutrition = () => {
    if (showCustom) {
      // If per100 values are available (e.g. from barcode scan) and unit is gram,
      // re-scale macros based on current quantity so the user sees the correct values.
      if (customFood.per100_kcal != null && unit === 'gram' && quantity > 0) {
        const grams = quantity;
        return {
          calories: Math.round(customFood.per100_kcal * grams / 100),
          protein: Math.round(customFood.per100_protein * grams / 100 * 10) / 10,
          carbs: Math.round(customFood.per100_carbs * grams / 100 * 10) / 10,
          fat: Math.round(customFood.per100_fat * grams / 100 * 10) / 10,
          grams,
        };
      }
      return {
        calories: customFood.calories,
        protein: customFood.protein,
        carbs: customFood.carbs,
        fat: customFood.fat,
        grams: null,
      };
    }
    
    if (!selectedFood) return { calories: 0, protein: 0, carbs: 0, fat: 0, grams: 0 };

    let grams = quantity;
    
    // Convert units to grams
    if (unit === 'gram') grams = quantity;
    else if (unit === '100g') grams = quantity * 100;
    else if (unit === 'ml') grams = quantity; // assume 1ml = 1g for liquids
    else if (unit === 'tablespoon') grams = quantity * (selectedFood.tablespoon_grams || 15);
    else if (unit === 'teaspoon') grams = quantity * (selectedFood.teaspoon_grams || 5);
    else if (unit === 'unit') grams = quantity * (selectedFood.unit_grams || 50);
    else if (unit === 'slice') grams = quantity * (selectedFood.slice_grams || 30);
    else if (unit === 'half_slice') grams = quantity * ((selectedFood.slice_grams || 30) / 2);
    else if (unit === 'cup') grams = quantity * (selectedFood.cup_grams || 240);
    else if (unit === 'half_cup') grams = quantity * ((selectedFood.cup_grams || 240) / 2);

    const multiplier = grams / 100;
    return {
      calories: Math.round(selectedFood.calories_per_100g * multiplier),
      protein: Math.round(selectedFood.protein_per_100g * multiplier * 10) / 10,
      carbs: Math.round(selectedFood.carbs_per_100g * multiplier * 10) / 10,
      fat: Math.round(selectedFood.fat_per_100g * multiplier * 10) / 10,
      grams: Math.round(grams),
    };
  };

  const nutrition = calculateNutrition();

  const handleSave = () => {
    // Derive per100 values for correct macro scaling on future gram edits.
    // Priority: explicit per100 from barcode scan > computed from calories/grams > fallback to 0.
    const grams = nutrition.grams || quantity || 100;
    const per100_kcal = customFood.per100_kcal != null
      ? customFood.per100_kcal
      : (showCustom && grams > 0 ? (customFood.calories / grams) * 100 : selectedFood?.calories_per_100g || 0);
    const per100_protein = customFood.per100_protein != null
      ? customFood.per100_protein
      : (showCustom && grams > 0 ? (customFood.protein / grams) * 100 : selectedFood?.protein_per_100g || 0);
    const per100_carbs = customFood.per100_carbs != null
      ? customFood.per100_carbs
      : (showCustom && grams > 0 ? (customFood.carbs / grams) * 100 : selectedFood?.carbs_per_100g || 0);
    const per100_fat = customFood.per100_fat != null
      ? customFood.per100_fat
      : (showCustom && grams > 0 ? (customFood.fat / grams) * 100 : selectedFood?.fat_per_100g || 0);

    const entry = {
      trainee_email: traineeEmail,
      date: editingMeal?.date || new Date().toISOString().split('T')[0],
      meal_type: mealType,
      food_name: showCustom ? customFood.name : selectedFood?.name,
      food_item_id: showCustom ? null : selectedFood?.id,
      quantity,
      unit,
      grams_equivalent: nutrition.grams,
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      per100_kcal,
      per100_protein,
      per100_carbs,
      per100_fat,
    };
    onSave(entry, editingMeal?.id);
    onClose();
    resetForm();
  };

  const resetForm = () => {
    setSelectedFood(null);
    setQuantity(100);
    setUnit('gram');
    setSearch('');
    setShowCustom(false);
    setCustomFood({ name: '', calories: 0, protein: 0, carbs: 0, fat: 0, per100_kcal: null, per100_protein: null, per100_carbs: null, per100_fat: null });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{editingMeal ? 'ערוך ארוחה' : 'הוסף ארוחה'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>סוג ארוחה</Label>
            <Select value={mealType} onValueChange={setMealType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEAL_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!showCustom ? (
            <>
              <div>
                <Label>חפש מוצר</Label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="הקלד שם מוצר..."
                    className="pr-10"
                  />
                </div>
              </div>

              {search && filteredFoods.length > 0 && !selectedFood && (
                <div className="max-h-40 overflow-y-auto border rounded-lg divide-y">
                  {filteredFoods.slice(0, 10).map(food => (
                    <button
                      key={food.id}
                      onClick={() => { setSelectedFood(food); setSearch(''); }}
                      className="w-full p-3 text-right hover:bg-slate-50 transition-colors"
                    >
                      <p className="font-medium">{food.name}</p>
                      <p className="text-xs text-slate-500">
                        ל-100ג׳: {food.calories_per_100g} קל׳ | ח: {food.protein_per_100g}ג׳ | פ: {food.carbs_per_100g}ג׳ | ש: {food.fat_per_100g}ג׳
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {selectedFood && (
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-emerald-800">{selectedFood.name}</span>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedFood(null)}>
                      שנה
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Button variant="outline" onClick={() => setShowProductManager(true)} className="w-full">
                  <Plus className="w-4 h-4 ml-2" />
                  הוסף מוצר חדש למאגר
                </Button>
                <Button variant="outline" onClick={() => setShowCustom(true)} className="w-full">
                  <Plus className="w-4 h-4 ml-2" />
                  הוסף ידני (ערכים משוערים)
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
              <Button variant="ghost" size="sm" onClick={() => setShowCustom(false)}>
                ← חזור לחיפוש
              </Button>
              <div>
                <Label>שם המוצר</Label>
                <Input
                  value={customFood.name}
                  onChange={(e) => setCustomFood({...customFood, name: e.target.value})}
                  placeholder="שם המוצר"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>קלוריות</Label>
                  <Input
                    type="number"
                    value={customFood.calories}
                    onChange={(e) => setCustomFood({...customFood, calories: +e.target.value})}
                  />
                </div>
                <div>
                  <Label>חלבון (ג׳)</Label>
                  <Input
                    type="number"
                    value={customFood.protein}
                    onChange={(e) => setCustomFood({...customFood, protein: +e.target.value})}
                  />
                </div>
                <div>
                  <Label>פחמימות (ג׳)</Label>
                  <Input
                    type="number"
                    value={customFood.carbs}
                    onChange={(e) => setCustomFood({...customFood, carbs: +e.target.value})}
                  />
                </div>
                <div>
                  <Label>שומן (ג׳)</Label>
                  <Input
                    type="number"
                    value={customFood.fat}
                    onChange={(e) => setCustomFood({...customFood, fat: +e.target.value})}
                  />
                </div>
              </div>
            </div>
          )}

          {(selectedFood || showCustom) && !showCustom && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>כמות</Label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(+e.target.value)}
                  min={1}
                />
              </div>
              <div>
                <Label>יחידה</Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {(selectedFood || (showCustom && customFood.name)) && (
            <div className="p-4 bg-slate-100 rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-sm font-medium text-slate-600">ערכים תזונתיים:</p>
                {nutrition.grams && (
                  <p className="text-xs text-slate-500">≈ {nutrition.grams} גרם</p>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-emerald-600">{nutrition.calories}</p>
                  <p className="text-xs text-slate-500">קלוריות</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-blue-600">{nutrition.protein}ג׳</p>
                  <p className="text-xs text-slate-500">חלבון</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-orange-600">{nutrition.carbs}ג׳</p>
                  <p className="text-xs text-slate-500">פחמימות</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-purple-600">{nutrition.fat}ג׳</p>
                  <p className="text-xs text-slate-500">שומן</p>
                </div>
              </div>
            </div>
          )}

          <Button 
            onClick={handleSave} 
            disabled={!selectedFood && (!showCustom || !customFood.name)}
            className="w-full bg-emerald-500 hover:bg-emerald-600"
          >
            {editingMeal ? 'שמור שינויים' : 'הוסף לארוחה'}
          </Button>
        </div>
      </DialogContent>

      <ProductManagementDialog 
        open={showProductManager}
        onClose={() => setShowProductManager(false)}
      />
    </Dialog>
  );
}