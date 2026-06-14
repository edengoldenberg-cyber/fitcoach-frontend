import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { resolveUnitsForFood } from '@/components/shared/unitsTestRunner';

const DEFAULT_PORTIONS = {
  'גרם': 1,
  'כפית': 5,
  'כף': 15,
  'כוס': 240,
  'פרוסה': 30,
  'יחידה': 100,
};

export default function QuantityInputStep({ component, onSubmit, onBack }) {
  const food = component.selected_product;
  
  // Fetch category defaults and overrides for unit resolution
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

  // Resolve units dynamically with category defaults
  const resolvedUnits = useMemo(() => {
    if (!food || !allUnits.length || !allCategoryDefaults.length) {
      return DEFAULT_PORTIONS;
    }
    
    const productOverrides = allOverrides.filter(o => o.product_id === food.id);
    const categoryDefaults = allCategoryDefaults.filter(c => c.category === food.category);
    
    // Use wrapper function
    const unitsMap = resolveUnitsForFood(food, productOverrides, categoryDefaults, allUnits);
    
    return { ...DEFAULT_PORTIONS, ...unitsMap };
  }, [food, allUnits, allOverrides, allCategoryDefaults]);
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState(food.is_portion_based ? 'portion' : 'גרם');
  const [customInput, setCustomInput] = useState('');

  const calculatePreview = () => {
    if (food.is_portion_based) {
      if (!food.portion_weight_grams) return null;
      
      const grams = food.portion_weight_grams * quantity;
      return {
        grams: Math.round(grams * 10) / 10,
        calories: Math.round((food.per100_kcal * grams) / 100),
        protein: Math.round((food.per100_protein * grams) / 100 * 10) / 10,
        carbs: Math.round((food.per100_carbs * grams) / 100 * 10) / 10,
        fat: Math.round((food.per100_fat * grams) / 100 * 10) / 10,
      };
    } else {
      let grams = quantity;
      if (unit !== 'גרם') {
        grams = quantity * (resolvedUnits[unit] || 100);
      }
      
      return {
        grams: Math.round(grams * 10) / 10,
        calories: Math.round((food.per100_kcal * grams) / 100),
        protein: Math.round((food.per100_protein * grams) / 100 * 10) / 10,
        carbs: Math.round((food.per100_carbs * grams) / 100 * 10) / 10,
        fat: Math.round((food.per100_fat * grams) / 100 * 10) / 10,
      };
    }
  };

  const handleSubmit = () => {
    if (!quantity || quantity <= 0) {
      alert('נא להזין כמות תקינה');
      return;
    }

    const finalQuantity = food.is_portion_based ? quantity : (unit === 'גרם' ? quantity : quantity * (resolvedUnits[unit] || 100));
    onSubmit(finalQuantity);
  };

  const preview = calculatePreview();

  return (
    <div className="space-y-4">
      <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
        <p className="font-bold text-sm">{food.name_he}</p>
        {food.brand && <p className="text-xs text-slate-500">{food.brand}</p>}
        {food.is_portion_based && (
          <p className="text-xs text-purple-700 mt-1">
            📦 {food.portion_name || 'מנה'}: {food.portion_weight_grams}ג׳
          </p>
        )}
      </div>

      {food.is_portion_based ? (
        // Portion-based UI
        <div>
          <Label className="text-sm">כמה {food.portion_name || 'מנות'}?</Label>
          <div className="flex gap-2 mb-2">
            {[0.5, 1, 1.5, 2].map(qty => (
              <Button
                key={qty}
                type="button"
                size="sm"
                variant={quantity === qty ? 'default' : 'outline'}
                onClick={() => setQuantity(qty)}
                className="flex-1 bg-purple-500 hover:bg-purple-600 data-[variant=outline]:bg-white"
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
        </div>
      ) : (
        // Regular grams UI
        <div className="space-y-3">
          <Label className="text-sm font-semibold">כמה אכלת?</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs font-medium">כמות</Label>
              <Input
                type="number"
                step="0.1"
                value={quantity}
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                placeholder="100"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">יחידה</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="גרם">גרם</SelectItem>
                  <SelectItem value="כפית">כפית (5ג׳)</SelectItem>
                  <SelectItem value="כף">כף (15ג׳)</SelectItem>
                  <SelectItem value="כוס">כוס (240ג׳)</SelectItem>
                  <SelectItem value="פרוסה">פרוסה (30ג׳)</SelectItem>
                  <SelectItem value="יחידה">יחידה (100ג׳)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {unit !== 'גרם' && (
            <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
              <strong>{quantity}</strong> {unit} = <strong>{Math.round(quantity * (resolvedUnits[unit] || 100) * 10) / 10}</strong> גרם
            </div>
          )}
        </div>
      )}

      {preview && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="text-xs font-medium text-emerald-800 mb-2">📊 תצוגה מקדימה:</p>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div>
              <p className="font-bold text-green-600">{preview.calories}</p>
              <p className="text-slate-600">קל׳</p>
            </div>
            <div>
              <p className="font-bold text-blue-600">{preview.protein}ג׳</p>
              <p className="text-slate-600">חלבון</p>
            </div>
            <div>
              <p className="font-bold text-orange-600">{preview.carbs}ג׳</p>
              <p className="text-slate-600">פחמימות</p>
            </div>
            <div>
              <p className="font-bold text-purple-600">{preview.fat}ג׳</p>
              <p className="text-slate-600">שומן</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 text-center mt-2">
            ({preview.grams}ג׳ סה״כ)
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button 
          variant="outline" 
          onClick={onBack}
          className="flex-1"
        >
          חזור
        </Button>
        <Button 
          onClick={handleSubmit}
          className="flex-1 bg-purple-500 hover:bg-purple-600"
          disabled={!quantity || quantity <= 0}
        >
          המשך
        </Button>
      </div>
    </div>
  );
}