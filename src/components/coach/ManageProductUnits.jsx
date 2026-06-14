import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit2, Check } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const AVAILABLE_UNITS = [
  'גרם', '100 גרם', 'כפית', 'כף', 'כוס', 'פרוסה', 'יחידה',
  'ביצה', 'בננה', 'תפוח', 'פיתה', 'לחמניה', 'קרקר', 'פריכית',
  'גביע', 'קופסה', 'פחית', 'מנה'
];

export default function ManageProductUnits({ open, onClose, productId, productName }) {
  const [editingUnit, setEditingUnit] = useState(null);
  const [formData, setFormData] = useState({
    unit_name: '',
    grams_per_unit: '',
    is_default: false,
    notes: ''
  });

  const queryClient = useQueryClient();

  const { data: overrides = [] } = useQuery({
    queryKey: ['productUnitOverrides', productId],
    queryFn: async () => {
      const data = await base44.entities.ProductUnitOverride.filter({ product_id: productId });
      return data.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
    },
    enabled: !!productId,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ProductUnitOverride.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productUnitOverrides', productId] });
      toast.success('יחידה נוספה בהצלחה');
      resetForm();
    },
    onError: (err) => {
      toast.error(`שגיאה: ${err.message}`);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProductUnitOverride.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productUnitOverrides', productId] });
      toast.success('יחידה עודכנה בהצלחה');
      resetForm();
    },
    onError: (err) => {
      toast.error(`שגיאה: ${err.message}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ProductUnitOverride.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productUnitOverrides', productId] });
      toast.success('יחידה נמחקה');
    },
    onError: (err) => {
      toast.error(`שגיאה: ${err.message}`);
    }
  });

  const handleSave = () => {
    if (!formData.unit_name || !formData.grams_per_unit) {
      toast.error('נא למלא שם יחידה וגרמים');
      return;
    }

    const grams = parseFloat(formData.grams_per_unit);
    if (isNaN(grams) || grams <= 0) {
      toast.error('ערך גרמים לא תקין');
      return;
    }

    const payload = {
      product_id: productId,
      unit_name: formData.unit_name,
      grams_per_unit: grams,
      is_default: formData.is_default,
      notes: formData.notes || ''
    };

    if (editingUnit) {
      updateMutation.mutate({ id: editingUnit.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (unit) => {
    setEditingUnit(unit);
    setFormData({
      unit_name: unit.unit_name,
      grams_per_unit: unit.grams_per_unit,
      is_default: unit.is_default,
      notes: unit.notes || ''
    });
  };

  const handleDelete = (id) => {
    if (confirm('האם למחוק יחידה זו?')) {
      deleteMutation.mutate(id);
    }
  };

  const resetForm = () => {
    setEditingUnit(null);
    setFormData({
      unit_name: '',
      grams_per_unit: '',
      is_default: false,
      notes: ''
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>ניהול יחידות מידה - {productName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing Units */}
          <div>
            <h3 className="font-medium text-sm mb-2">יחידות קיימות ({overrides.length})</h3>
            {overrides.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded-lg text-center text-sm text-slate-500">
                אין יחידות מותאמות למוצר זה. נעשה שימוש ביחידות ברירת מחדל.
              </div>
            ) : (
              <div className="space-y-2">
                {overrides.map(unit => (
                  <div key={unit.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{unit.unit_name}</span>
                        <span className="text-slate-600">= {unit.grams_per_unit}ג׳</span>
                        {unit.is_default && (
                          <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded">ברירת מחדל</span>
                        )}
                      </div>
                      {unit.notes && (
                        <p className="text-xs text-slate-500 mt-1">{unit.notes}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(unit)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(unit.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add/Edit Form */}
          <div className="border-t pt-4">
            <h3 className="font-medium text-sm mb-3">
              {editingUnit ? 'עריכת יחידה' : 'הוספת יחידה חדשה'}
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>שם יחידה *</Label>
                  <Select 
                    value={formData.unit_name} 
                    onValueChange={(v) => setFormData({ ...formData, unit_name: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="בחר יחידה..." />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_UNITS.map(unit => (
                        <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>גרמים ליחידה *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.grams_per_unit}
                    onChange={(e) => setFormData({ ...formData, grams_per_unit: e.target.value })}
                    placeholder="לדוגמה: 30"
                  />
                </div>
              </div>

              <div>
                <Label>הערות (אופציונלי)</Label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="לדוגמה: מדידה משוערת"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label htmlFor="is_default" className="text-sm cursor-pointer">
                  הגדר כיחידת ברירת מחדל למוצר זה
                </Label>
              </div>

              <div className="flex gap-2">
                {editingUnit && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetForm}
                    className="flex-1"
                  >
                    ביטול
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleSave}
                  className="flex-1 bg-teal-600 hover:bg-teal-700"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editingUnit ? (
                    <>
                      <Check className="w-4 h-4 ml-1" />
                      עדכן
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 ml-1" />
                      הוסף יחידה
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}