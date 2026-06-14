import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Save, Scale, Lightbulb } from 'lucide-react';
import { extractGramsFromName, isYogurtProduct } from '../shared/UnitsHelper';

export default function FoodUnitsManager({ foodItem, open, onClose }) {
  const [editingUnit, setEditingUnit] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const queryClient = useQueryClient();

  // Get all applicable units for this food item
  const { data: allUnits = [] } = useQuery({
    queryKey: ['foodUnits', foodItem?.id],
    queryFn: async () => {
      const units = await base44.entities.FoodUnit.list();
      
      // Filter: global + category match + food-specific
      return units.filter(u => 
        u.scope_type === 'global' ||
        (u.scope_type === 'category' && u.scope_value === foodItem?.category) ||
        (u.scope_type === 'food' && u.scope_value === foodItem?.id)
      ).sort((a, b) => a.display_order - b.display_order);
    },
    enabled: !!foodItem && open,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.FoodUnit.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foodUnits'] });
      setShowDialog(false);
      setEditingUnit(null);
      toast.success('יחידה נוספה');
    },
    onError: (err) => toast.error(`שגיאה: ${err.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.FoodUnit.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foodUnits'] });
      setShowDialog(false);
      setEditingUnit(null);
      toast.success('יחידה עודכנה');
    },
    onError: (err) => toast.error(`שגיאה: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.FoodUnit.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foodUnits'] });
      toast.success('יחידה נמחקה');
    },
  });

  const handleSave = (data) => {
    if (editingUnit?.id) {
      updateMutation.mutate({ id: editingUnit.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-teal-600" />
                ניהול יחידות - {foodItem?.name_he}
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Auto-detected info for yogurt */}
            {isYogurtProduct(foodItem?.name_he) && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-800">מוצר יוגורט זוהה</p>
                    {(() => {
                      const detected = extractGramsFromName(foodItem.name_he);
                      if (detected) {
                        return (
                          <p className="text-xs text-blue-700 mt-1">
                            זוהה משקל: <span className="font-bold">{detected}g</span> מתוך השם
                            <br />
                            המערכת תציע "גביע (לפי האריזה)" = {detected}g למתאמנים
                          </p>
                        );
                      } else {
                        return (
                          <p className="text-xs text-blue-700 mt-1">
                            לא זוהה משקל בשם. ברירת מחדל: גביע 200g
                          </p>
                        );
                      }
                    })()}
                  </div>
                </div>
              </div>
            )}

            <Button 
              onClick={() => { setEditingUnit(null); setShowDialog(true); }}
              className="w-full bg-teal-600 hover:bg-teal-700"
            >
              <Plus className="w-4 h-4 ml-2" />
              הוסף יחידה למוצר זה
            </Button>

            <div className="space-y-2">
              {allUnits.map(unit => (
                <div 
                  key={unit.id} 
                  className={`p-3 rounded-lg border ${
                    unit.scope_type === 'food' ? 'bg-purple-50 border-purple-200' :
                    unit.scope_type === 'category' ? 'bg-green-50 border-green-200' :
                    'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{unit.unit_name_he}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          unit.scope_type === 'food' ? 'bg-purple-200 text-purple-800' :
                          unit.scope_type === 'category' ? 'bg-green-200 text-green-800' :
                          'bg-slate-200 text-slate-800'
                        }`}>
                          {unit.scope_type === 'food' ? 'ספציפי למוצר' :
                           unit.scope_type === 'category' ? 'קטגוריה' : 'גלובלי'}
                        </span>
                        {unit.is_default && (
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-200 text-blue-800">
                            ברירת מחדל
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        {unit.grams_per_unit} גרם ליחידה
                      </div>
                      {unit.notes && (
                        <div className="text-xs text-slate-500 mt-1">{unit.notes}</div>
                      )}
                    </div>
                    
                    {unit.scope_type === 'food' && (
                      <div className="flex gap-2">
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => { setEditingUnit(unit); setShowDialog(true); }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => {
                            if (window.confirm(`למחוק את היחידה "${unit.unit_name_he}"?`)) {
                              deleteMutation.mutate(unit.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit/Create Dialog */}
      <UnitFormDialog
        open={showDialog}
        onClose={() => { setShowDialog(false); setEditingUnit(null); }}
        unit={editingUnit}
        foodItem={foodItem}
        onSave={handleSave}
      />
    </>
  );
}

function UnitFormDialog({ open, onClose, unit, foodItem, onSave }) {
  const [formData, setFormData] = useState({
    unit_name_he: '',
    grams_per_unit: '',
    notes: '',
  });

  const detectedGrams = React.useMemo(() => {
    if (foodItem && isYogurtProduct(foodItem.name_he)) {
      return extractGramsFromName(foodItem.name_he);
    }
    return null;
  }, [foodItem]);

  React.useEffect(() => {
    if (unit) {
      setFormData({
        unit_name_he: unit.unit_name_he || '',
        grams_per_unit: unit.grams_per_unit || '',
        notes: unit.notes || '',
      });
    } else {
      setFormData({
        unit_name_he: '',
        grams_per_unit: '',
        notes: '',
      });
    }
  }, [unit, open]);

  const handleSubmit = () => {
    if (!formData.unit_name_he) {
      toast.error('שם היחידה חובה');
      return;
    }
    if (!formData.grams_per_unit || formData.grams_per_unit <= 0) {
      toast.error('גרמים חייבים להיות מספר חיובי');
      return;
    }

    onSave({
      scope_type: 'food',
      scope_value: foodItem.id,
      unit_name_he: formData.unit_name_he,
      grams_per_unit: parseFloat(formData.grams_per_unit),
      notes: formData.notes,
      display_order: 50, // Food-specific units appear in the middle
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{unit?.id ? 'עריכת יחידה' : 'יחידה חדשה למוצר'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {detectedGrams && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-green-700">
                  <p className="font-medium">זוהה אוטומטית: {detectedGrams}g</p>
                  <p className="mt-1">מומלץ להגדיר "גביע (מאמן)" עם {detectedGrams}g</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <Label>שם היחידה *</Label>
            <Input
              value={formData.unit_name_he}
              onChange={(e) => setFormData({ ...formData, unit_name_he: e.target.value })}
              placeholder={detectedGrams ? 'לדוגמה: גביע (מאמן)' : 'לדוגמה: חבילה, פחית, מנה'}
            />
          </div>

          <div>
            <Label>גרמים ליחידה *</Label>
            <Input
              type="number"
              value={formData.grams_per_unit}
              onChange={(e) => setFormData({ ...formData, grams_per_unit: e.target.value })}
              placeholder={detectedGrams ? detectedGrams.toString() : "0"}
            />
            {detectedGrams && !formData.grams_per_unit && (
              <p className="text-xs text-green-600 mt-1">
                💡 לחץ כאן למילוי אוטומטי:{' '}
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, grams_per_unit: detectedGrams })}
                  className="underline font-medium"
                >
                  {detectedGrams}g
                </button>
              </p>
            )}
          </div>

          <div>
            <Label>הערות (אופציונלי)</Label>
            <Input
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="הערות נוספות"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSubmit} className="bg-teal-600 hover:bg-teal-700">
            <Save className="w-4 h-4 ml-2" />
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}