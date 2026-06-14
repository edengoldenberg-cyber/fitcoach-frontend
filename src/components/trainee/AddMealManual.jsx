import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Plus, Loader2 } from "lucide-react";
import FavoriteToggle from './FavoriteToggle';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { computeNutrition, ERROR_MESSAGES } from '../shared/NutritionEngine';
import { resolveUnitsForFood } from '../shared/unitsTestRunner';
import { mergeUnits } from '../shared/unitsResolver';
import { bumpUserFoodUsage, normalizeFoodName, upsertPersonalFoodItem } from './nutritionLearning';
import RecentFoodHistory from './RecentFoodHistory';

const DEFAULT_PORTIONS = {
  'גרם': 1,
  'כפית': 5,
  'כף': 15,
  'כוס': 240,
  'פרוסה': 30,
  'יחידה': 100,
  'ביצה': 60,
  'תפוח': 150,
  'בננה': 120,
  'פיתה': 100,
  'לאפה': 180,
  'מ״ל': 1,
};

const MEAL_TYPES = [
  { value: 'breakfast', label: 'ארוחת בוקר' },
  { value: 'lunch', label: 'ארוחת צהריים' },
  { value: 'dinner', label: 'ארוחת ערב' },
  { value: 'snack', label: 'חטיף' },
];

export default function AddMealManual({ open, onClose, onSave, traineeEmail, editingMeal = null, defaultMealType = null, initialMode = 'choose' }) {
  const [mode, setMode] = useState(initialMode); // 'choose' | 'search' | 'manual'
  const [mealType, setMealType] = useState(defaultMealType || editingMeal?.meal_type || 'breakfast');

  React.useEffect(() => {
    if (open) {
      setMode(initialMode);
      setMealType(defaultMealType || editingMeal?.meal_type || 'breakfast');
    }
  }, [open, initialMode, defaultMealType, editingMeal?.meal_type]);
  const [brandFilter, setBrandFilter] = useState('all'); // 'all' | 'generic' | 'branded'
  const [saving, setSaving] = useState(false);

  // Get trainee ID for favorites
  const { data: trainee } = useQuery({
    queryKey: ['trainee', traineeEmail],
    queryFn: async () => {
      if (!traineeEmail) return null;
      const trainees = await base44.entities.Trainee.filter({ user_email: traineeEmail });
      return trainees[0] || null;
    },
    enabled: !!traineeEmail && open
  });

  // Search mode state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFood, setSelectedFood] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('גרם');

  // Manual mode state
  const [manualFood, setManualFood] = useState({
    name: '',
    quantity: 100,
    unit: 'gram',
    entryMode: 'per100', // 'per100' | 'perUnit'
    per100_kcal: '',
    per100_protein: '',
    per100_carbs: '',
    per100_fat: '',
    perUnit_kcal: '',
    perUnit_protein: '',
    perUnit_carbs: '',
    perUnit_fat: '',
    gramsPerUnit: '',
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    enabled: open
  });

  const { data: personalFoods = [] } = useQuery({
    queryKey: ['personalUserFoods', trainee?.id],
    queryFn: () => base44.entities.UserFoodItem.filter({ trainee_id: trainee?.id, visibility: 'personal', active: true }),
    enabled: mode === 'search' && !!trainee?.id,
  });

  const { data: coachFoods = [] } = useQuery({
    queryKey: ['coachUserFoods', trainee?.coach_email],
    queryFn: () => base44.entities.UserFoodItem.filter({ coach_email: trainee?.coach_email, visibility: 'coach', active: true }),
    enabled: mode === 'search' && !!trainee?.coach_email,
  });

  const { data: globalUserFoods = [] } = useQuery({
    queryKey: ['globalUserFoods'],
    queryFn: () => base44.entities.UserFoodItem.filter({ visibility: 'global', active: true }),
    enabled: mode === 'search',
  });

  const { data: portionReferences = [] } = useQuery({
    queryKey: ['portionReferences'],
    queryFn: () => base44.entities.PortionReference.list(),
  });

  const { data: foodItemPortions = [] } = useQuery({
    queryKey: ['foodItemPortions', selectedFood?.id],
    queryFn: () => base44.entities.FoodItemPortions.filter({ food_item_id: selectedFood?.id }),
    enabled: !!selectedFood?.id,
  });

  const { data: allProducts = [] } = useQuery({
    queryKey: ['foodItems'],
    queryFn: () => base44.entities.FoodItem.list(),
  });

  const { data: allUnits = [] } = useQuery({
    queryKey: ['allFoodUnits'],
    queryFn: () => base44.entities.FoodUnit.list(),
  });

  const { data: allOverrides = [] } = useQuery({
    queryKey: ['allProductUnitOverrides'],
    queryFn: () => base44.entities.ProductUnitOverride.list(),
  });

  const { data: allCategoryDefaults = [] } = useQuery({
    queryKey: ['allCategoryUnitDefaults'],
    queryFn: () => base44.entities.CategoryUnitDefault.list(),
  });

  const userFoodResults = [...personalFoods, ...coachFoods, ...globalUserFoods].map(item => ({
    id: `userfood:${item.id}`,
    user_food_item_id: item.id,
    name_he: item.food_name,
    name: item.food_name,
    normalized_name: item.normalized_name,
    brand: item.brand_name || '',
    per100_kcal: item.calories_per_100g,
    per100_protein: item.protein_per_100g,
    per100_carbs: item.carbs_per_100g,
    per100_fat: item.fat_per_100g,
    serving_grams: item.serving_size,
    is_generic: !item.brand_name,
    is_user_food: true,
    visibility: item.visibility,
    usage_count: item.usage_count || 0,
    source_priority: item.visibility === 'personal' ? 1 : item.visibility === 'coach' ? 3 : 4
  }));

  const filteredFoods = [...userFoodResults, ...allProducts.map(item => ({ ...item, source_priority: 4 }))]
    .filter(item => {
      if (!searchTerm) return false;
      const search = normalizeFoodName(searchTerm);
      const matchesSearch = (
        normalizeFoodName(item.name).includes(search) ||
        normalizeFoodName(item.name_he).includes(search) ||
        normalizeFoodName(item.brand).includes(search) ||
        item.barcode?.includes(search)
      );
      if (!matchesSearch) return false;
      if (brandFilter === 'generic' && !item.is_generic) return false;
      if (brandFilter === 'branded' && item.is_generic) return false;
      return true;
    })
    .sort((a, b) => {
      const search = normalizeFoodName(searchTerm);
      const aExactPersonal = a.visibility === 'personal' && normalizeFoodName(a.name_he || a.name) === search;
      const bExactPersonal = b.visibility === 'personal' && normalizeFoodName(b.name_he || b.name) === search;
      if (aExactPersonal && !bExactPersonal) return -1;
      if (!aExactPersonal && bExactPersonal) return 1;
      if ((a.source_priority || 4) !== (b.source_priority || 4)) return (a.source_priority || 4) - (b.source_priority || 4);
      if ((a.usage_count || 0) !== (b.usage_count || 0)) return (b.usage_count || 0) - (a.usage_count || 0);
      return (a.name_he || a.name || '').localeCompare(b.name_he || b.name || '', 'he');
    })
    .slice(0, 20);

  // Get available units from UnitsResolver (includes Override → Category → Convenience → Global)
  const availableUnits = React.useMemo(() => {
    if (!selectedFood) return [];
    
    const productOverrides = allOverrides.filter(o => o.product_id === selectedFood.id);
    const categoryDefaults = allCategoryDefaults.filter(c => c.category === selectedFood.category);
    
    // Use wrapper function
    const unitsMap = resolveUnitsForFood(selectedFood, productOverrides, categoryDefaults, allUnits);
    
    // Map to AddMealManual format
    return Object.keys(unitsMap).map(name => ({
      id: name,
      name_he: name,
      default_grams: unitsMap[name],
      source: 'merged',
      confidence: 'exact'
    }));
  }, [selectedFood, allUnits, allOverrides, allCategoryDefaults]);

  const calculateNutrition = (grams, per100Value) => {
    return Math.round((grams / 100) * (per100Value || 0) * 10) / 10;
  };

  // Calculate nutrition for portion-based products
  const calculatePortionNutrition = (portionQty, food) => {
    if (!food.is_portion_based || !food.portion_weight_grams) {
      console.warn('[PortionBased] Missing data:', { 
        is_portion_based: food.is_portion_based, 
        portion_weight_grams: food.portion_weight_grams 
      });
      return null;
    }

    // Validate per100 values
    if (!food.per100_kcal || food.per100_protein === undefined || 
        food.per100_carbs === undefined || food.per100_fat === undefined) {
      console.warn('[PortionBased] Missing per100 values');
      return null;
    }

    const portionCalories = (food.per100_kcal * food.portion_weight_grams) / 100;
    const portionProtein = (food.per100_protein * food.portion_weight_grams) / 100;
    const portionCarbs = (food.per100_carbs * food.portion_weight_grams) / 100;
    const portionFat = (food.per100_fat * food.portion_weight_grams) / 100;

    return {
      calories: Math.round(portionCalories * portionQty * 10) / 10,
      protein: Math.round(portionProtein * portionQty * 10) / 10,
      carbs: Math.round(portionCarbs * portionQty * 10) / 10,
      fat: Math.round(portionFat * portionQty * 10) / 10,
      grams: Math.round(food.portion_weight_grams * portionQty * 10) / 10
    };
  };

  const handleSaveSearch = async () => {
    if (!selectedFood) {
      toast.error('נא לבחור מזון');
      return;
    }

    if (!quantity || quantity <= 0) {
      toast.error('נא להזין כמות תקינה');
      return;
    }

    if (!selectedUnit) {
      toast.error('נא לבחור יחידה');
      return;
    }

    setSaving(true);
    toast.loading('מוסיף לארוחה...', { id: 'addMeal' });

    try {
      // Direct calculation using unit grams (already includes override if exists)
      const gramsPerUnit = selectedUnit.default_grams || 1;
      const totalGrams = quantity * gramsPerUnit;
      const factor = totalGrams / 100;
      
      const nutrition = {
        grams: Math.round(totalGrams * 10) / 10,
        total_kcal: Math.round(selectedFood.per100_kcal * factor),
        total_protein: Math.round(selectedFood.per100_protein * factor * 10) / 10,
        total_carbs: Math.round(selectedFood.per100_carbs * factor * 10) / 10,
        total_fat: Math.round(selectedFood.per100_fat * factor * 10) / 10,
        gramsPerUnit,
        source: selectedUnit.source,
        productName: selectedFood.name_he,
        unitName: selectedUnit.name_he
      };

      const mealData = {
        trainee_email: traineeEmail,
        date: new Date().toISOString().split('T')[0],
        meal_type: mealType,
        food_item_id: selectedFood.is_user_food ? undefined : selectedFood.id,
        user_food_item_id: selectedFood.user_food_item_id,
        food_database_scope: selectedFood.visibility || (selectedFood.is_user_food ? 'personal' : 'global'),
        learning_event_type: 'search',
        food_name: selectedFood.name_he || selectedFood.name,
        quantity,
        unit: selectedUnit.name_he,
        unit_name: selectedUnit.name_he,
        amount: quantity,
        grams_final: nutrition.grams,
        grams_equivalent: nutrition.grams,
        calories: nutrition.total_kcal,
        protein: nutrition.total_protein,
        carbs: nutrition.total_carbs,
        fat: nutrition.total_fat,
        per100_kcal:    selectedFood.per100_kcal    || 0,
        per100_protein: selectedFood.per100_protein || 0,
        per100_carbs:   selectedFood.per100_carbs   || 0,
        per100_fat:     selectedFood.per100_fat     || 0,
      };

      await bumpUserFoodUsage(selectedFood);
      await onSave(mealData);
      toast.success(`✓ נוסף (${nutrition.grams}ג׳ | ${nutrition.total_kcal} קק״ל)`, { id: 'addMeal' });
      handleReset();
    } catch (err) {
      console.error('[AddMeal] Error:', err);
      const errorMsg = err.code ? ERROR_MESSAGES[err.code] : err.message;
      toast.error(`לא נוסף: ${errorMsg} (${err.code || 'ERROR'})`, { id: 'addMeal' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveManual = async () => {
    if (!manualFood.name || !manualFood.name.trim()) {
      alert('נא למלא שם מזון');
      return;
    }
    if (manualFood.quantity === '' || manualFood.quantity === null || manualFood.quantity <= 0) {
      alert('נא למלא כמות תקינה (מינימום 1)');
      return;
    }

    let finalCalories = 0;
    let finalProtein = 0;
    let finalCarbs = 0;
    let finalFat = 0;
    let gramsEquivalent = 0;

    if (manualFood.entryMode === 'per100') {
      if (!manualFood.per100_kcal) {
        alert('נא למלא קלוריות ל-100 גרם');
        return;
      }

      // All manual entries are ALWAYS stored per 100g base, then multiplied by quantity
      // Unit is ignored in per100 mode — only quantity matters
      gramsEquivalent = manualFood.quantity; // Direct grams

      const factor = gramsEquivalent / 100;
      finalCalories = parseFloat(manualFood.per100_kcal) * factor;
      finalProtein = parseFloat(manualFood.per100_protein || 0) * factor;
      finalCarbs = parseFloat(manualFood.per100_carbs || 0) * factor;
      finalFat = parseFloat(manualFood.per100_fat || 0) * factor;
    } else {
      if (!manualFood.perUnit_kcal) {
        alert('נא למלא קלוריות ליחידה');
        return;
      }

      finalCalories = parseFloat(manualFood.perUnit_kcal) * manualFood.quantity;
      finalProtein = parseFloat(manualFood.perUnit_protein || 0) * manualFood.quantity;
      finalCarbs = parseFloat(manualFood.perUnit_carbs || 0) * manualFood.quantity;
      finalFat = parseFloat(manualFood.perUnit_fat || 0) * manualFood.quantity;

      if (manualFood.gramsPerUnit) {
        gramsEquivalent = parseFloat(manualFood.gramsPerUnit) * manualFood.quantity;
      } else {
        gramsEquivalent = manualFood.quantity;
      }
    }

    const per100 = manualFood.entryMode === 'per100'
      ? {
          calories: parseFloat(manualFood.per100_kcal || 0),
          protein: parseFloat(manualFood.per100_protein || 0),
          carbs: parseFloat(manualFood.per100_carbs || 0),
          fat: parseFloat(manualFood.per100_fat || 0)
        }
      : {
          calories: gramsEquivalent ? (finalCalories / gramsEquivalent) * 100 : finalCalories,
          protein: gramsEquivalent ? (finalProtein / gramsEquivalent) * 100 : finalProtein,
          carbs: gramsEquivalent ? (finalCarbs / gramsEquivalent) * 100 : finalCarbs,
          fat: gramsEquivalent ? (finalFat / gramsEquivalent) * 100 : finalFat
        };

    setSaving(true);
    const savedFood = await upsertPersonalFoodItem({ user, trainee, manualFood, per100 });

    const mealData = {
      trainee_email: traineeEmail,
      date: new Date().toISOString().split('T')[0],
      meal_type: mealType,
      food_name: manualFood.name,
      user_food_item_id: savedFood?.id,
      food_database_scope: 'personal',
      learning_event_type: 'manual',
      quantity: manualFood.quantity,
      unit: manualFood.unit,
      grams_equivalent: Math.round(gramsEquivalent * 10) / 10,
      grams_final:      Math.round(gramsEquivalent * 10) / 10,
      calories: Math.round(finalCalories),
      protein: Math.round(finalProtein * 10) / 10,
      carbs: Math.round(finalCarbs * 10) / 10,
      fat: Math.round(finalFat * 10) / 10,
      per100_kcal:    per100.calories || 0,
      per100_protein: per100.protein  || 0,
      per100_carbs:   per100.carbs    || 0,
      per100_fat:     per100.fat      || 0,
    };

    console.log('[AddMealManual] Saving meal:', mealData);
    await onSave(mealData);
    setSaving(false);
    alert('✅ הפריט נוסף ונשמר למאגר האישי');
    handleReset();
  };

  const handleRecentFoodSelect = (food) => {
    setMode('manual');
    setManualFood({
      name: food.food_name || '',
      quantity: food.default_quantity || 100,
      unit: food.default_unit || 'gram',
      entryMode: 'per100',
      per100_kcal: food.calories_per_100g || '',
      per100_protein: food.protein_per_100g || '',
      per100_carbs: food.carbs_per_100g || '',
      per100_fat: food.fat_per_100g || '',
      perUnit_kcal: '',
      perUnit_protein: '',
      perUnit_carbs: '',
      perUnit_fat: '',
      gramsPerUnit: '',
    });
  };

  const handleReset = () => {
    setMode('choose');
    setSearchTerm('');
    setSelectedFood(null);
    setSelectedUnit(null);
    setQuantity(1);
    setUnit('גרם');
    setManualFood({
      name: '',
      quantity: 100,
      unit: 'gram',
      entryMode: 'per100',
      per100_kcal: '',
      per100_protein: '',
      per100_carbs: '',
      per100_fat: '',
      perUnit_kcal: '',
      perUnit_protein: '',
      perUnit_carbs: '',
      perUnit_fat: '',
      gramsPerUnit: '',
    });
  };

  const currentNutrition = React.useMemo(() => {
    if (!selectedFood || !selectedUnit || quantity <= 0) return null;

    try {
      const gramsPerUnit = selectedUnit.default_grams || 1;
      const totalGrams = quantity * gramsPerUnit;
      const factor = totalGrams / 100;
      
      return {
        grams: Math.round(totalGrams * 10) / 10,
        total_kcal: Math.round(selectedFood.per100_kcal * factor),
        total_protein: Math.round(selectedFood.per100_protein * factor * 10) / 10,
        total_carbs: Math.round(selectedFood.per100_carbs * factor * 10) / 10,
        total_fat: Math.round(selectedFood.per100_fat * factor * 10) / 10,
        gramsPerUnit,
        source: selectedUnit.source,
        hasOverride: selectedUnit.hasOverride,
        productName: selectedFood.name_he,
        unitName: selectedUnit.name_he
      };
    } catch (err) {
      console.warn('[CurrentNutrition] Calculation failed:', err);
      return null;
    }
  }, [selectedFood, selectedUnit, quantity]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>הוסף ארוחה ידנית</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Meal Type */}
          <div>
            <Label>סוג ארוחה</Label>
            <Select value={mealType} onValueChange={setMealType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEAL_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mode Selection */}
          {mode === 'choose' && (
            <div className="space-y-3 py-4">
              <Button
                type="button"
                onClick={() => setMode('search')}
                className="w-full h-auto py-4"
                style={{ backgroundColor: '#79DBD6', color: 'white' }}
              >
                <div className="text-center">
                  <p className="font-bold text-lg mb-1">🔍 חיפוש מזון במאגר</p>
                  <p className="text-xs opacity-90">חפש לפי שם, ברקוד או מותג</p>
                </div>
              </Button>

              <Button
                type="button"
                onClick={() => setMode('manual')}
                className="w-full h-auto py-4"
                variant="outline"
              >
                <div className="text-center">
                  <p className="font-bold text-lg mb-1">✍️ הזנה ידנית</p>
                  <p className="text-xs text-slate-600">הזן ערכים תזונתיים ידנית</p>
                </div>
              </Button>

              <RecentFoodHistory traineeId={trainee?.id} onSelect={handleRecentFoodSelect} title="אחרונים להזנה מהירה" />
            </div>
          )}

          {mode !== 'choose' && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMode('choose')}
              className="w-full"
            >
              ← חזור לבחירת אפשרות
            </Button>
          )}

          {/* Search Mode */}
          {mode === 'search' && (
            <div className="space-y-3">
              <div>
                <Label>חיפוש מזון</Label>
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="הקלד שם מזון, מותג או ברקוד..."
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={brandFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setBrandFilter('all')}
                  className="flex-1 text-xs"
                >
                  הכל
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={brandFilter === 'generic' ? 'default' : 'outline'}
                  onClick={() => setBrandFilter('generic')}
                  className="flex-1 text-xs"
                >
                  גנרי בלבד
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={brandFilter === 'branded' ? 'default' : 'outline'}
                  onClick={() => setBrandFilter('branded')}
                  className="flex-1 text-xs"
                >
                  מותגים בלבד
                </Button>
              </div>

              {searchTerm && filteredFoods.length > 0 && (
                <div className="max-h-60 overflow-y-auto border rounded-lg p-2 space-y-1">
                  {filteredFoods.map(food => {
                    const isGeneric = food.is_generic !== false || !food.brand;
                    return (
                      <div key={food.id} className="flex items-center gap-1">
                        <FavoriteToggle 
                          foodId={food.id} 
                          traineeId={trainee?.id} 
                          currentMealType={mealType}
                        />
                        <button
                          onClick={() => setSelectedFood(food)}
                          className={`flex-1 text-right p-2 rounded hover:bg-slate-100 transition ${
                            selectedFood?.id === food.id ? 'bg-slate-200' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="font-medium text-sm">{food.name_he || food.name}</p>
                              <p className="text-xs text-slate-500">
                                {food.per100_kcal} קל׳ / 100 גרם
                              </p>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded ${
                              food.visibility === 'personal'
                                ? 'bg-amber-100 text-amber-800'
                                : food.visibility === 'coach'
                                ? 'bg-purple-100 text-purple-800'
                                : isGeneric 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {food.visibility === 'personal' ? 'שלי' : food.visibility === 'coach' ? 'מאמן' : isGeneric ? 'גלובלי' : `מותג: ${food.brand}`}
                            </span>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedFood && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                  <div>
                    <p className="font-bold">{selectedFood.name_he || selectedFood.name}</p>
                    <p className="text-xs text-slate-600">{selectedFood.brand}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {availableUnits.length} יחידות זמינות
                      {allOverrides.filter(o => o.product_id === selectedFood.id).length > 0 && (
                        <span className="text-purple-600 mr-1">• יחידות ספציפיות למוצר ★</span>
                      )}
                    </p>
                  </div>

                  {selectedFood.is_portion_based ? (
                    // Portion-Based UI
                    <div>
                      <Label className="text-xs">כמות מנות</Label>
                      <div className="flex gap-2 mb-2">
                        {[0.5, 1, 1.5, 2].map(qty => (
                          <Button
                            key={qty}
                            type="button"
                            size="sm"
                            variant={quantity === qty ? 'default' : 'outline'}
                            onClick={() => setQuantity(qty)}
                            className="flex-1"
                          >
                            {qty}
                          </Button>
                        ))}
                      </div>
                      <Input
                        type="number"
                        step="0.1"
                        value={quantity}
                        onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                        placeholder="ערך אחר..."
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        {selectedFood.portion_name || 'מנה'}: {selectedFood.portion_weight_grams}ג׳
                      </p>
                    </div>
                  ) : (
                    // Regular UI
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">כמות</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={quantity}
                          onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">יחידה</Label>
                        <Select value={selectedUnit?.id || ''} onValueChange={(unitId) => {
                          const unit = availableUnits.find(u => u.id === unitId);
                          setSelectedUnit(unit);
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="בחר יחידה" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableUnits.map(u => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.name_he}
                                {u.hasOverride && <span className="text-[10px] text-purple-600 mr-1"> ★למוצר</span>}
                                {u.source === 'legacy' && <span className="text-[10px] text-slate-400 mr-1"> (legacy)</span>}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {currentNutrition && (
                    <>
                      <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded">
                        <p className="text-center font-semibold mb-1">
                          {quantity} {selectedUnit?.name_he} = <span className="text-green-600 font-bold">{currentNutrition.grams}ג׳</span>
                        </p>
                        {currentNutrition.hasOverride && (
                          <p className="text-[10px] text-purple-600 text-center">★ יחידות ספציפיות למוצר</p>
                        )}
                        {currentNutrition.source === 'legacy' && (
                          <p className="text-[10px] text-orange-500 text-center">(legacy)</p>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-4 gap-2 text-center text-xs bg-white p-2 rounded border">
                        <div>
                          <p className="font-bold text-green-600">{currentNutrition.total_kcal}</p>
                          <p className="text-slate-500">קל׳</p>
                        </div>
                        <div>
                          <p className="font-bold text-blue-600">{currentNutrition.total_protein}ג׳</p>
                          <p className="text-slate-500">חלבון</p>
                        </div>
                        <div>
                          <p className="font-bold text-orange-600">{currentNutrition.total_carbs}ג׳</p>
                          <p className="text-slate-500">פחמימות</p>
                        </div>
                        <div>
                          <p className="font-bold text-purple-600">{currentNutrition.total_fat}ג׳</p>
                          <p className="text-slate-500">שומן</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Manual Mode */}
          {mode === 'manual' && (
            <div className="space-y-4 p-4 bg-slate-50 rounded-lg border">
              <h3 className="font-bold text-sm text-slate-700">הזנת מזון ידנית</h3>

              <div>
                <Label>שם המזון *</Label>
                <Input
                  value={manualFood.name}
                  onChange={(e) => setManualFood({ ...manualFood, name: e.target.value })}
                  placeholder="לדוגמה: סלט ירקות"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>כמות *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={manualFood.quantity}
                    onChange={(e) => setManualFood({ ...manualFood, quantity: parseFloat(e.target.value) || 0 })}
                    placeholder="100"
                  />
                </div>
                <div>
                  <Label>יחידה</Label>
                  <Select value={manualFood.unit} onValueChange={(v) => setManualFood({ ...manualFood, unit: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gram">גרם</SelectItem>
                      <SelectItem value="tablespoon">כף</SelectItem>
                      <SelectItem value="teaspoon">כפית</SelectItem>
                      <SelectItem value="cup">כוס</SelectItem>
                      <SelectItem value="unit">יחידה</SelectItem>
                      <SelectItem value="slice">פרוסה</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={manualFood.entryMode === 'per100' ? 'default' : 'outline'}
                  onClick={() => setManualFood({ ...manualFood, entryMode: 'per100' })}
                  className="flex-1"
                >
                  ערכים ל-100 גרם
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={manualFood.entryMode === 'perUnit' ? 'default' : 'outline'}
                  onClick={() => setManualFood({ ...manualFood, entryMode: 'perUnit' })}
                  className="flex-1"
                >
                  ערכים ליחידה
                </Button>
              </div>

              {manualFood.entryMode === 'per100' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600 bg-blue-50 p-2 rounded">
                    💡 <strong>כל הערכים הם ל-100 גרם בלבד</strong> — המערכת תחשב לפי הכמות שהזנת
                  </p>
                  
                  {/* Preview Calculation */}
                  {manualFood.per100_kcal && manualFood.quantity && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-emerald-800 mb-2">📊 תצוגה מקדימה ({manualFood.quantity}ג׳ = פי {(manualFood.quantity / 100).toFixed(1)}):</p>
                      <div className="grid grid-cols-4 gap-2 text-center text-xs">
                        <div>
                          <p className="font-bold text-green-600">
                            {Math.round((manualFood.quantity / 100) * parseFloat(manualFood.per100_kcal))}
                          </p>
                          <p className="text-slate-600">קל׳</p>
                        </div>
                        <div>
                          <p className="font-bold text-blue-600">
                            {Math.round((manualFood.quantity / 100) * parseFloat(manualFood.per100_protein || 0) * 10) / 10}ג׳
                          </p>
                          <p className="text-slate-600">חלבון</p>
                        </div>
                        <div>
                          <p className="font-bold text-orange-600">
                            {Math.round((manualFood.quantity / 100) * parseFloat(manualFood.per100_carbs || 0) * 10) / 10}ג׳
                          </p>
                          <p className="text-slate-600">פחמימות</p>
                        </div>
                        <div>
                          <p className="font-bold text-purple-600">
                            {Math.round((manualFood.quantity / 100) * parseFloat(manualFood.per100_fat || 0) * 10) / 10}ג׳
                          </p>
                          <p className="text-slate-600">שומן</p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>קלוריות ל-100 גרם *</Label>
                      <Input
                        type="number"
                        value={manualFood.per100_kcal}
                        onChange={(e) => setManualFood({ ...manualFood, per100_kcal: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>חלבון ל-100 גרם (ג׳)</Label>
                      <Input
                        type="number"
                        value={manualFood.per100_protein}
                        onChange={(e) => setManualFood({ ...manualFood, per100_protein: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>פחמימות ל-100 גרם (ג׳)</Label>
                      <Input
                        type="number"
                        value={manualFood.per100_carbs}
                        onChange={(e) => setManualFood({ ...manualFood, per100_carbs: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>שומן ל-100 גרם (ג׳)</Label>
                      <Input
                        type="number"
                        value={manualFood.per100_fat}
                        onChange={(e) => setManualFood({ ...manualFood, per100_fat: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              )}

              {manualFood.entryMode === 'perUnit' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600 bg-blue-50 p-2 rounded">
                    💡 הזן ערכים תזונתיים ליחידה אחת
                  </p>
                  
                  {/* Preview Calculation */}
                  {manualFood.perUnit_kcal && manualFood.quantity && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-emerald-800 mb-2">📊 תצוגה מקדימה:</p>
                      <div className="grid grid-cols-4 gap-2 text-center text-xs">
                        <div>
                          <p className="font-bold text-green-600">
                            {Math.round(parseFloat(manualFood.perUnit_kcal) * manualFood.quantity)}
                          </p>
                          <p className="text-slate-600">קל׳</p>
                        </div>
                        <div>
                          <p className="font-bold text-blue-600">
                            {Math.round(parseFloat(manualFood.perUnit_protein || 0) * manualFood.quantity * 10) / 10}ג׳
                          </p>
                          <p className="text-slate-600">חלבון</p>
                        </div>
                        <div>
                          <p className="font-bold text-orange-600">
                            {Math.round(parseFloat(manualFood.perUnit_carbs || 0) * manualFood.quantity * 10) / 10}ג׳
                          </p>
                          <p className="text-slate-600">פחמימות</p>
                        </div>
                        <div>
                          <p className="font-bold text-purple-600">
                            {Math.round(parseFloat(manualFood.perUnit_fat || 0) * manualFood.quantity * 10) / 10}ג׳
                          </p>
                          <p className="text-slate-600">שומן</p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>קלוריות ליחידה *</Label>
                      <Input
                        type="number"
                        value={manualFood.perUnit_kcal}
                        onChange={(e) => setManualFood({ ...manualFood, perUnit_kcal: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>חלבון ליחידה (ג׳)</Label>
                      <Input
                        type="number"
                        value={manualFood.perUnit_protein}
                        onChange={(e) => setManualFood({ ...manualFood, perUnit_protein: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>פחמימות ליחידה (ג׳)</Label>
                      <Input
                        type="number"
                        value={manualFood.perUnit_carbs}
                        onChange={(e) => setManualFood({ ...manualFood, perUnit_carbs: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>שומן ליחידה (ג׳)</Label>
                      <Input
                        type="number"
                        value={manualFood.perUnit_fat}
                        onChange={(e) => setManualFood({ ...manualFood, perUnit_fat: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>גרמים ליחידה (אופציונלי)</Label>
                      <Input
                        type="number"
                        value={manualFood.gramsPerUnit}
                        onChange={(e) => setManualFood({ ...manualFood, gramsPerUnit: e.target.value })}
                        placeholder="לדוגמה: 30"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {mode !== 'choose' && (
            <>
              <Button type="button" variant="outline" onClick={onClose}>
                ביטול
              </Button>
              <Button
                type="button"
                onClick={mode === 'search' ? handleSaveSearch : handleSaveManual}
                style={{ backgroundColor: '#79DBD6', color: 'white' }}
                disabled={saving || (mode === 'search' && (!selectedFood || !selectedUnit))}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-1 animate-spin" />
                    מוסיף...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 ml-1" />
                    הוסף לארוחה
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}