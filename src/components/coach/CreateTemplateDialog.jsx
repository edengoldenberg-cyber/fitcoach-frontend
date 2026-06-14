import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, Search, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { resolveUnitsForFood } from '../shared/unitsTestRunner';

const MEAL_TYPES = [
  { value: 'breakfast', label: '🌅 בוקר' },
  { value: 'lunch', label: '☀️ צהריים' },
  { value: 'dinner', label: '🌙 ערב' },
  { value: 'snack', label: '🍎 נשנוש' }
];

const ROLES = [
  { value: 'protein', label: '💪 חלבון' },
  { value: 'carbs', label: '🍞 פחמימה' },
  { value: 'vegetables', label: '🥗 ירקות' },
  { value: 'fat', label: '🥑 שומן' },
  { value: 'fruit', label: '🍎 פרי' },
  { value: 'dairy', label: '🥛 חלבי' }
];

export default function CreateTemplateDialog({ open, onClose, editTemplate }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mealType, setMealType] = useState('breakfast');
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  
  const queryClient = useQueryClient();

  // Load edit data
  useEffect(() => {
    if (editTemplate) {
      setName(editTemplate.name || '');
      setDescription(editTemplate.description || '');
      setMealType(editTemplate.meal_type || 'breakfast');
      setItems(editTemplate.items || []);
    } else {
      // Reset for new template
      setName('');
      setDescription('');
      setMealType('breakfast');
      setItems([]);
    }
  }, [editTemplate, open]);

  const { data: allFoods = [] } = useQuery({
    queryKey: ['allFoods'],
    queryFn: () => base44.entities.FoodItem.list(),
    enabled: open
  });

  const { data: allUnits = [] } = useQuery({
    queryKey: ['allFoodUnits'],
    queryFn: () => base44.entities.FoodUnit.list(),
    enabled: open
  });

  const { data: allOverrides = [] } = useQuery({
    queryKey: ['allProductUnitOverrides'],
    queryFn: () => base44.entities.ProductUnitOverride.list(),
    enabled: open
  });

  const { data: allCategoryDefaults = [] } = useQuery({
    queryKey: ['allCategoryUnitDefaults'],
    queryFn: () => base44.entities.CategoryUnitDefault.list(),
    enabled: open
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (data) => {
      if (editTemplate) {
        return base44.entities.MealTemplate.update(editTemplate.id, data);
      } else {
        return base44.entities.MealTemplate.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealTemplates'] });
      toast.success(editTemplate ? '✅ טמפלט עודכן' : '✅ טמפלט נוצר');
      onClose();
    },
    onError: (err) => {
      toast.error('❌ שגיאה בשמירה: ' + err?.message);
    }
  });

  // Get available units for a food item using existing system
  const getUnitsForFood = (foodId) => {
    const foodItem = allFoods.find(f => f.id === foodId);
    if (!foodItem) return [{ id: 'global_gram', name: 'גרם', grams_per_unit: 1 }];

    const productOverrides = allOverrides.filter(o => o.product_id === foodId);
    const categoryDefaults = allCategoryDefaults.filter(c => c.category === foodItem.category);

    // Use existing units resolution system
    const unitsMap = resolveUnitsForFood(foodItem, productOverrides, categoryDefaults, allUnits);
    
    // Convert map to array of unit objects with IDs
    const unitsArray = Object.entries(unitsMap).map(([unitName, gramsPerUnit]) => {
      // Try to find matching unit ID from allUnits
      const matchingUnit = allUnits.find(u => u.name_he === unitName);
      const unitId = matchingUnit?.id || `unit_${unitName.replace(/\s+/g, '_')}`;
      
      return {
        id: unitId,
        name: unitName,
        grams_per_unit: gramsPerUnit
      };
    });

    // FALLBACK: If no units, return grams only
    if (unitsArray.length === 0) {
      return [{ id: 'global_gram', name: 'גרם', grams_per_unit: 1 }];
    }

    return unitsArray;
  };

  // Calculate grams from unit + quantity
  const calculateGrams = (foodId, unitId, quantity) => {
    const units = getUnitsForFood(foodId);
    const unit = units.find(u => u.id === unitId);
    
    // FALLBACK: if unit not found, assume grams
    if (!unit) {
      console.warn('[TEMPLATE_CALC] Unit not found, fallback to grams', { foodId, unitId, availableUnits: units.length });
      return quantity; // Assume quantity is in grams
    }

    const grams = unit.grams_per_unit * quantity;
    console.log('[TEMPLATE_CALC]', { 
      food: foodId, 
      unit: unit.name, 
      quantity, 
      gramsPerUnit: unit.grams_per_unit, 
      totalGrams: grams 
    });
    
    return grams;
  };

  // Calculate totals from items
  const totals = items.reduce((acc, item) => {
    const foodItem = allFoods.find(f => f.id === item.food_item_id);
    if (!foodItem) {
      console.warn('[TEMPLATE_CALC] Food not found', { food_item_id: item.food_item_id });
      return acc;
    }

    const grams = calculateGrams(item.food_item_id, item.unit_id, item.quantity);
    const ratio = grams / 100;
    
    const cals = Math.round(ratio * (parseFloat(foodItem.per100_kcal) || 0));
    const prot = Math.round(ratio * (parseFloat(foodItem.per100_protein) || 0));
    const carb = Math.round(ratio * (parseFloat(foodItem.per100_carbs) || 0));
    const f = Math.round(ratio * (parseFloat(foodItem.per100_fat) || 0));

    return {
      calories: acc.calories + cals,
      protein: acc.protein + prot,
      carbs: acc.carbs + carb,
      fat: acc.fat + f
    };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // GUARD: Check for invalid macros
  const hasInvalidMacros = !Number.isFinite(totals.calories) || 
                           !Number.isFinite(totals.protein) || 
                           !Number.isFinite(totals.carbs) || 
                           !Number.isFinite(totals.fat);

  if (hasInvalidMacros) {
    console.error('[INVALID_MACROS]', { totals, items });
  }

  const handleAddFood = (foodItem) => {
    // GUARD: Check if food has valid macros
    const kcalPer100 = parseFloat(foodItem.per100_kcal);
    if (!kcalPer100 || kcalPer100 <= 0 || !Number.isFinite(kcalPer100)) {
      toast.error('❌ חסר ערכים תזונתיים למוצר: ' + foodItem.name_he);
      console.error('[MISSING_MACROS]', { food: foodItem.name_he, per100_kcal: foodItem.per100_kcal });
      return;
    }

    // GUARD: Check if food has units
    const units = getUnitsForFood(foodItem.id);
    if (units.length === 0) {
      toast.error('❌ למוצר הזה אין יחידות מידה מוגדרות');
      console.error('[NO_UNITS]', { food: foodItem.name_he });
      return;
    }

    const newItem = {
      food_item_id: foodItem.id,
      unit_id: units[0].id, // Default to first unit
      quantity: 1,
      role: 'protein'
    };

    setItems([...items, newItem]);
    setSearchTerm(''); // Clear search but keep modal open
    toast.success('✅ מוצר נוסף לטמפלט');
  };

  const handleRemoveItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index, field, value) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSave = () => {
    // Validation
    if (!name.trim()) {
      toast.error('❌ הזן שם לטמפלט');
      return;
    }

    if (items.length === 0) {
      toast.error('❌ הוסף לפחות מוצר אחד');
      return;
    }

    // GUARD: Check for NaN/Infinity in totals
    if (hasInvalidMacros) {
      toast.error('❌ שגיאה בחישוב ערכים תזונתיים - בדוק את המוצרים');
      console.error('[INVALID_MACROS_ON_SAVE]', { totals, items });
      return;
    }

    const templateData = {
      name,
      description,
      meal_type: mealType,
      items,
      base_calories: totals.calories, // Store base calories for scaling
      is_active: true
    };

    console.log('[TEMPLATE_SAVE]', templateData);
    saveTemplateMutation.mutate(templateData);
  };

  // Filter foods for search
  const filteredFoods = searchTerm
    ? allFoods.filter(f => 
        f.name_he?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.name?.toLowerCase().includes(searchTerm.toLowerCase())
      ).slice(0, 20)
    : [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            {editTemplate ? 'ערוך טמפלט' : 'צור טמפלט חדש'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">שם הטמפלט</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="לדוגמה: בוקר חלבוני יוגורט"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">תיאור (אופציונלי)</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="תיאור קצר של הטמפלט"
                rows={2}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">סוג ארוחה</label>
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
          </div>

          {/* Foods List */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-sm font-medium">מוצרים</label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSearch(!showSearch)}
              >
                <Plus className="w-4 h-4 ml-1" />
                הוסף מוצר
              </Button>
            </div>

            {/* Search */}
            {showSearch && (
              <Card className="p-4 mb-4 bg-slate-50">
                <div className="relative mb-3">
                  <Search className="absolute right-3 top-3 w-4 h-4 text-slate-400" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="חפש מוצר..."
                    className="pr-10"
                  />
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1">
                  {filteredFoods.map(food => (
                    <div
                      key={food.id}
                      onClick={() => handleAddFood(food)}
                      className="p-2 hover:bg-white rounded cursor-pointer transition-colors"
                    >
                      <div className="font-medium text-sm">{food.name_he || food.name}</div>
                      <div className="text-xs text-slate-500">
                        {food.category} • {food.per100_kcal}קל׳/100ג׳
                      </div>
                    </div>
                  ))}
                  {searchTerm && filteredFoods.length === 0 && (
                    <div className="text-center py-4 text-slate-500">
                      לא נמצאו מוצרים
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Items */}
            <div className="space-y-3">
              {items.map((item, idx) => {
                const foodItem = allFoods.find(f => f.id === item.food_item_id);
                const units = getUnitsForFood(item.food_item_id);
                const grams = calculateGrams(item.food_item_id, item.unit_id, item.quantity);
                const ratio = grams / 100;
                const cals = foodItem ? Math.round(ratio * (parseFloat(foodItem.per100_kcal) || 0)) : 0;

                return (
                  <Card key={idx} className="p-3 bg-white">
                    <div className="flex gap-3 items-start">
                      <div className="flex-1">
                        <div className="font-medium text-sm mb-2">
                          {foodItem?.name_he || foodItem?.name || 'מוצר לא ידוע'}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-slate-600">כמות</label>
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleUpdateItem(idx, 'quantity', parseFloat(e.target.value) || 1)}
                              className="h-8 text-sm"
                              min="0.1"
                              step="0.1"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-600">יחידה</label>
                            <Select
                              value={item.unit_id}
                              onValueChange={(val) => handleUpdateItem(idx, 'unit_id', val)}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {units.map(u => (
                                  <SelectItem key={u.id} value={u.id}>
                                    {u.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-600">תפקיד</label>
                            <Select
                              value={item.role}
                              onValueChange={(val) => handleUpdateItem(idx, 'role', val)}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLES.map(r => (
                                  <SelectItem key={r.value} value={r.value}>
                                    {r.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {Math.round(grams)}ג׳ • {cals} קלוריות
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                );
              })}

              {items.length === 0 && (
                <div className="text-center py-8 text-slate-400 border-2 border-dashed rounded-lg">
                  לחץ "הוסף מוצר" כדי להתחיל
                </div>
              )}
            </div>
          </div>

          {/* Totals */}
          {items.length > 0 && (
            <Card className={`p-4 ${hasInvalidMacros ? 'bg-red-50 border-red-300' : 'bg-teal-50 border-teal-300'}`}>
              {hasInvalidMacros ? (
                <div className="flex items-center gap-2 text-red-800">
                  <AlertCircle className="w-5 h-5" />
                  <div>
                    <div className="font-bold">שגיאה בחישוב ערכים</div>
                    <div className="text-sm">בדוק שלכל המוצרים יש ערכים תזונתיים תקינים</div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="font-bold text-teal-800 mb-2">סיכום תזונתי</div>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-teal-600">{totals.calories}</div>
                      <div className="text-xs text-teal-700">קלוריות</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-teal-600">{totals.protein}ג׳</div>
                      <div className="text-xs text-teal-700">חלבון</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-teal-600">{totals.carbs}ג׳</div>
                      <div className="text-xs text-teal-700">פחמימות</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-teal-600">{totals.fat}ג׳</div>
                      <div className="text-xs text-teal-700">שומן</div>
                    </div>
                  </div>
                </>
              )}
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              ביטול
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveTemplateMutation.isPending || hasInvalidMacros || items.length === 0}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {saveTemplateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  שומר...
                </>
              ) : (
                editTemplate ? 'עדכן טמפלט' : 'צור טמפלט'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}