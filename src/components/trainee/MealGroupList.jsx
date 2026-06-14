import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { base44 } from '@/api/base44Client';
import SaveMealButton from './SaveMealButton';

const MEAL_TYPES = {
  breakfast: { label: 'ארוחת בוקר', icon: '🌅', color: 'bg-amber-50 border-amber-200' },
  lunch: { label: 'ארוחת צהריים', icon: '☀️', color: 'bg-orange-50 border-orange-200' },
  dinner: { label: 'ארוחת ערב', icon: '🌙', color: 'bg-indigo-50 border-indigo-200' },
  snack: { label: 'חטיפים', icon: '🍎', color: 'bg-green-50 border-green-200' },
};

// Inline row for editing a single ingredient's grams + auto-recalc
function IngredientRow({ meal, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [grams, setGrams] = useState(meal.grams_final || meal.grams_equivalent || meal.quantity || 100);

  React.useEffect(() => {
    const g = meal.grams_final || meal.grams_equivalent || meal.quantity || 100;
    const derivedPer100 = g > 0 ? (meal.calories || 0) / g * 100 : 0;
    console.log('[RENDER-TRACE] IngredientRow mounted:', {
      id: meal.id,
      food_name: meal.food_name,
      meal_type: meal.meal_type,
      date: meal.date,
      calories_stored: meal.calories,
      grams: g,
      // If per100_kcal is undefined/null → it was NOT persisted in the MealEntry schema
      per100_kcal_from_db: meal.per100_kcal,
      per100_kcal_would_derive: +derivedPer100.toFixed(4),
      per100_missing: !meal.per100_kcal,
      source_entity: 'MealEntry',
      source_id: meal.id,
    });
  }, [meal.id]);


  const handleSave = () => {
    const g = parseFloat(grams) || 0;
    if (g <= 0) return;
    const origGrams = meal.grams_final || meal.grams_equivalent || meal.quantity || 100;
    const per100Kcal    = meal.per100_kcal    || ((meal.calories || 0) / origGrams * 100);
    const per100Protein = meal.per100_protein || ((meal.protein  || 0) / origGrams * 100);
    const per100Carbs   = meal.per100_carbs   || ((meal.carbs    || 0) / origGrams * 100);
    const per100Fat     = meal.per100_fat     || ((meal.fat      || 0) / origGrams * 100);
    // Compute final values using full-precision per100 — round only here at the final stage
    const newCalories = (per100Kcal    / 100) * g;
    const newProtein  = (per100Protein / 100) * g;
    const newCarbs    = (per100Carbs   / 100) * g;
    const newFat      = (per100Fat     / 100) * g;
    console.log('[SMOKE] IngredientRow update:', {
      name: meal.food_name,
      id: meal.id,
      meal_type: meal.meal_type,
      date: meal.date,
      newGrams: g,
      origGrams,
      // [TRACE] These tell us whether per100 survived in the DB record
      had_stored_per100: !!(meal.per100_kcal),
      meal_per100_kcal_raw: meal.per100_kcal,
      meal_per100_protein_raw: meal.per100_protein,
      // The values actually used for recalculation (stored or derived)
      per100Kcal: per100Kcal.toFixed(4),
      per100Protein: per100Protein.toFixed(4),
      newCalories: Math.round(newCalories),
      newProtein: Math.round(newProtein * 10) / 10,
    });
    // Spread the full existing meal record first so Base44 PUT never wipes food_name/meal_type/date/etc.
    // Then override only the fields that gram-editing should change.
    const { id: _id, created_date: _cd, updated_date: _ud, ...mealWithoutSystemFields } = meal;
    onUpdate(meal.id, {
      ...mealWithoutSystemFields,
      quantity: g,
      unit: 'gram',
      grams_equivalent: g,
      grams_final: g,
      // Always persist the immutable per100 anchor
      per100_kcal:    per100Kcal,
      per100_protein: per100Protein,
      per100_carbs:   per100Carbs,
      per100_fat:     per100Fat,
      // Final rounded display values — derived from per100, never from previous calories
      calories: Math.round(newCalories),
      protein:  Math.round(newProtein  * 10) / 10,
      carbs:    Math.round(newCarbs    * 10) / 10,
      fat:      Math.round(newFat      * 10) / 10,
    });
    setEditing(false);
  };

  const displayGrams = meal.grams_final || meal.grams_equivalent || meal.quantity;
  const unitStr = meal.unit === 'gram' || meal.unit === '100g' ? 'ג׳'
    : meal.unit === 'unit' ? 'יח׳'
    : meal.unit === 'tablespoon' ? 'כף'
    : meal.unit === 'teaspoon' ? 'כפית'
    : meal.unit || '';

  return (
    <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-100 gap-2">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-700 text-sm truncate">{meal.food_name}</p>
        {editing ? (
          <div className="flex items-center gap-1 mt-1">
            <Input
              type="number"
              value={grams}
              onChange={e => setGrams(e.target.value)}
              className="h-7 w-20 text-sm"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
            />
            <span className="text-xs text-slate-400">ג׳</span>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={handleSave}>
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400" onClick={() => setEditing(false)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            {displayGrams}{unitStr && ` ${unitStr}`}
            {' · '}ח: {Math.round(meal.protein || 0)}
            {' '}פ: {Math.round(meal.carbs || 0)}
            {' '}ש: {Math.round(meal.fat || 0)} ג׳
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="font-medium text-emerald-600 text-sm">{meal.calories} קל׳</span>
        {!editing && (
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 text-slate-400 hover:text-blue-500"
            onClick={() => setEditing(true)}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button
          variant="ghost" size="icon"
          className="h-7 w-7 text-slate-400 hover:text-red-500"
          onClick={() => onDelete(meal.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function MealGroupList({
  mealsByType,
  deleteMealMutation,
  addMealMutation,
  setAddingMealType,
  setShowMealDialog,
  setEditingMeal,
  trainee,
  onAddItem,
}) {
  const handleUpdate = (id, data) => {
    addMealMutation.mutate({ data, id });
  };

  return (
    <div className="space-y-4">
      {Object.entries(MEAL_TYPES).map(([type, { label, icon, color }]) => {
        const items = mealsByType[type] || [];
        const total = items.reduce((sum, m) => sum + (m.calories || 0), 0);

        return (
          <Card key={type} className={`p-4 border ${color}`}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{icon}</span>
              <h3 className="font-bold text-slate-700">{label}</h3>
              <span className="text-sm text-slate-400 mr-auto">{total} קל׳</span>
              <SaveMealButton trainee={trainee} mealType={type} meals={items} />
              <Button
                size="icon" variant="ghost" className="h-7 w-7"
                title="הוסף רכיב"
                onClick={() => onAddItem ? onAddItem(type) : (setAddingMealType(type), setShowMealDialog(true))}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Ingredient lines */}
            {items.length === 0 ? (
              <button
                className="w-full text-sm text-slate-400 text-center py-3 border-2 border-dashed border-slate-200 rounded-lg hover:border-slate-300 hover:text-slate-500 transition-colors"
                onClick={() => onAddItem ? onAddItem(type) : (setAddingMealType(type), setShowMealDialog(true))}
              >
                + הוסף פריט
              </button>
            ) : (
              <div className="space-y-1.5">
                {items.map(meal => (
                  <IngredientRow
                    key={meal.id}
                    meal={meal}
                    onDelete={(id) => deleteMealMutation.mutate(id)}
                    onUpdate={handleUpdate}
                  />
                ))}

                {/* Add ingredient button */}
                <button
                  className="w-full text-xs text-slate-400 py-1.5 border border-dashed border-slate-200 rounded-lg hover:border-slate-300 hover:text-slate-500 transition-colors flex items-center justify-center gap-1 mt-1"
                  onClick={() => onAddItem ? onAddItem(type) : (setAddingMealType(type), setShowMealDialog(true))}
                >
                  <Plus className="w-3 h-3" />
                  הוסף רכיב
                </button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}