import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, X } from "lucide-react";

const CATEGORIES = [
  { value: 'protein', label: 'חלבון' },
  { value: 'carbs', label: 'פחמימות' },
  { value: 'vegetables', label: 'ירקות' },
  { value: 'fruits', label: 'פירות' },
  { value: 'dairy', label: 'חלב ודרייס' },
  { value: 'fats', label: 'שומנים' },
  { value: 'snacks', label: 'חטיפים' },
  { value: 'drinks', label: 'משקאות' },
  { value: 'other', label: 'אחר' },
];

export default function ProductManagementDialog({ open, onClose }) {
  const [formData, setFormData] = useState({
    name: '',
    category: 'other',
    calories_per_100g: 0,
    protein_per_100g: 0,
    carbs_per_100g: 0,
    fat_per_100g: 0,
    serving_size_grams: 100,
    tablespoon_grams: null,
    teaspoon_grams: null,
    unit_grams: null,
    slice_grams: null,
    cup_grams: null,
  });
  const [error, setError] = useState(null);
  const queryClient = useQueryClient();

  const addProductMutation = useMutation({
    mutationFn: (data) => base44.entities.FoodItem.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foodItems'] });
      setFormData({
        name: '',
        category: 'other',
        calories_per_100g: 0,
        protein_per_100g: 0,
        carbs_per_100g: 0,
        fat_per_100g: 0,
        serving_size_grams: 100,
        tablespoon_grams: null,
        teaspoon_grams: null,
        unit_grams: null,
        slice_grams: null,
        cup_grams: null,
      });
      setError(null);
      onClose();
    },
    onError: (err) => {
      setError('שגיאה בהוספת המוצר');
    },
  });

  const handleAdd = () => {
    if (!formData.name.trim()) {
      setError('חובה להזין שם מוצר');
      return;
    }
    if (formData.calories_per_100g < 0 || formData.protein_per_100g < 0 || formData.carbs_per_100g < 0 || formData.fat_per_100g < 0) {
      setError('ערכים תזונתיים לא יכולים להיות שליליים');
      return;
    }
    addProductMutation.mutate(formData);
  };

  const handleClose = () => {
    setError(null);
    setFormData({
      name: '',
      category: 'other',
      calories_per_100g: 0,
      protein_per_100g: 0,
      carbs_per_100g: 0,
      fat_per_100g: 0,
      serving_size_grams: 100,
      tablespoon_grams: null,
      teaspoon_grams: null,
      unit_grams: null,
      slice_grams: null,
      cup_grams: null,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">הוסף מוצר חדש למאגר</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
            <h3 className="font-bold text-slate-700">מידע בסיסי</h3>
            
            <div>
              <Label>שם המוצר *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="למשל: עוף חזה, אורז לבן, חלב 3%"
              />
            </div>

            <div>
              <Label>קטגוריה</Label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                className="w-full p-2 border rounded-lg bg-white"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>משקל הגשה (גרם) - לחישובי ערכים</Label>
              <Input
                type="number"
                value={formData.serving_size_grams}
                onChange={(e) => setFormData({...formData, serving_size_grams: +e.target.value})}
                min={1}
              />
            </div>
          </div>

          {/* Nutritional Values per 100g */}
          <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
            <h3 className="font-bold text-slate-700">ערכים תזונתיים (לכל 100 גרם)</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>קלוריות *</Label>
                <Input
                  type="number"
                  value={formData.calories_per_100g}
                  onChange={(e) => setFormData({...formData, calories_per_100g: +e.target.value})}
                  min={0}
                />
              </div>
              <div>
                <Label>חלבון (ג׳) *</Label>
                <Input
                  type="number"
                  value={formData.protein_per_100g}
                  onChange={(e) => setFormData({...formData, protein_per_100g: +e.target.value})}
                  min={0}
                  step={0.1}
                />
              </div>
              <div>
                <Label>פחמימות (ג׳) *</Label>
                <Input
                  type="number"
                  value={formData.carbs_per_100g}
                  onChange={(e) => setFormData({...formData, carbs_per_100g: +e.target.value})}
                  min={0}
                  step={0.1}
                />
              </div>
              <div>
                <Label>שומן (ג׳) *</Label>
                <Input
                  type="number"
                  value={formData.fat_per_100g}
                  onChange={(e) => setFormData({...formData, fat_per_100g: +e.target.value})}
                  min={0}
                  step={0.1}
                />
              </div>
            </div>
          </div>

          {/* Unit Conversions - Optional */}
          <div className="space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-bold text-blue-700">המרות יחידות (אופציונלי - לחישוב מדויק יותר)</h3>
            <p className="text-xs text-blue-600">הזן את משקל הגרמים לכל יחידה כדי לשפר את הדיוק</p>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>גרם לכף</Label>
                <Input
                  type="number"
                  value={formData.tablespoon_grams || ''}
                  onChange={(e) => setFormData({...formData, tablespoon_grams: e.target.value ? +e.target.value : null})}
                  placeholder="15"
                  min={0}
                  step={0.5}
                />
              </div>
              <div>
                <Label>גרם לכפית</Label>
                <Input
                  type="number"
                  value={formData.teaspoon_grams || ''}
                  onChange={(e) => setFormData({...formData, teaspoon_grams: e.target.value ? +e.target.value : null})}
                  placeholder="5"
                  min={0}
                  step={0.5}
                />
              </div>
              <div>
                <Label>גרם ליחידה (ביצה, כריך וכו׳)</Label>
                <Input
                  type="number"
                  value={formData.unit_grams || ''}
                  onChange={(e) => setFormData({...formData, unit_grams: e.target.value ? +e.target.value : null})}
                  placeholder="50"
                  min={0}
                  step={0.5}
                />
              </div>
              <div>
                <Label>גרם לפרוסה</Label>
                <Input
                  type="number"
                  value={formData.slice_grams || ''}
                  onChange={(e) => setFormData({...formData, slice_grams: e.target.value ? +e.target.value : null})}
                  placeholder="30"
                  min={0}
                  step={0.5}
                />
              </div>
              <div>
                <Label>גרם לכוס</Label>
                <Input
                  type="number"
                  value={formData.cup_grams || ''}
                  onChange={(e) => setFormData({...formData, cup_grams: e.target.value ? +e.target.value : null})}
                  placeholder="240"
                  min={0}
                  step={0.5}
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          {formData.name && (
            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <p className="text-sm font-bold text-emerald-800 mb-2">תצוגה מקדימה:</p>
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                <div className="p-2 bg-white rounded">
                  <p className="text-emerald-600 font-bold">{formData.calories_per_100g}</p>
                  <p className="text-xs text-slate-500">קל׳</p>
                </div>
                <div className="p-2 bg-white rounded">
                  <p className="text-blue-600 font-bold">{formData.protein_per_100g}ג׳</p>
                  <p className="text-xs text-slate-500">חלבון</p>
                </div>
                <div className="p-2 bg-white rounded">
                  <p className="text-orange-600 font-bold">{formData.carbs_per_100g}ג׳</p>
                  <p className="text-xs text-slate-500">פחמימות</p>
                </div>
                <div className="p-2 bg-white rounded">
                  <p className="text-purple-600 font-bold">{formData.fat_per_100g}ג׳</p>
                  <p className="text-xs text-slate-500">שומן</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={handleClose}
              variant="outline"
              className="flex-1"
            >
              ביטול
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!formData.name || addProductMutation.isPending}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600"
            >
              {addProductMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  מוסיף...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 ml-2" />
                  הוסף למאגר
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}