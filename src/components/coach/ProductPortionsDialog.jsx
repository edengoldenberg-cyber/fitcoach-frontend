import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ProductPortionsDialog({ open, onClose, product }) {
  const [editingPortion, setEditingPortion] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    unit_name: '',
    grams_per_unit: '',
    is_default: false,
  });
  const queryClient = useQueryClient();

  const { data: portions = [] } = useQuery({
    queryKey: ['foodItemPortions', product?.id],
    queryFn: () => base44.entities.FoodItemPortions.filter({ food_item_id: product?.id }),
    enabled: !!product?.id,
  });

  const { data: portionReferences = [] } = useQuery({
    queryKey: ['portionReferences'],
    queryFn: () => base44.entities.PortionReference.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.FoodItemPortions.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foodItemPortions'] });
      setShowForm(false);
      setFormData({ unit_name: '', grams_per_unit: '', is_default: false });
      toast.success('יחידה נוספה');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.FoodItemPortions.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foodItemPortions'] });
      setShowForm(false);
      setEditingPortion(null);
      setFormData({ unit_name: '', grams_per_unit: '', is_default: false });
      toast.success('יחידה עודכנה');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.FoodItemPortions.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foodItemPortions'] });
      toast.success('יחידה נמחקה');
    },
  });

  const handleSave = () => {
    if (!formData.unit_name || !formData.grams_per_unit) {
      toast.error('נא למלא את כל השדות');
      return;
    }

    const data = {
      food_item_id: product.id,
      unit_name: formData.unit_name,
      grams_per_unit: parseFloat(formData.grams_per_unit),
      is_default: formData.is_default,
    };

    if (editingPortion) {
      updateMutation.mutate({ id: editingPortion.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (portion) => {
    setEditingPortion(portion);
    setFormData({
      unit_name: portion.unit_name,
      grams_per_unit: portion.grams_per_unit,
      is_default: portion.is_default,
    });
    setShowForm(true);
  };

  const handleDelete = (portion) => {
    if (window.confirm(`למחוק את היחידה "${portion.unit_name}"?`)) {
      deleteMutation.mutate(portion.id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>יחידות למוצר: {product?.name_he}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing Portions */}
          {portions.length > 0 ? (
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-slate-700">יחידות מוגדרות:</h4>
              {portions.map(portion => (
                <div key={portion.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium">{portion.unit_name}</p>
                    <p className="text-sm text-slate-600">{portion.grams_per_unit} גרם</p>
                    {portion.is_default && (
                      <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded">ברירת מחדל</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="icon" variant="ghost" onClick={() => handleEdit(portion)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(portion)}>
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">לא הוגדרו יחידות למוצר זה</p>
          )}

          {/* Add/Edit Form */}
          {showForm ? (
            <div className="border rounded-lg p-4 bg-slate-50 space-y-3">
              <h4 className="font-medium text-sm">{editingPortion ? 'עריכת יחידה' : 'הוספת יחידה'}</h4>
              
              <div>
                <Label>שם היחידה</Label>
                <Select value={formData.unit_name} onValueChange={(v) => setFormData({ ...formData, unit_name: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר יחידה..." />
                  </SelectTrigger>
                  <SelectContent>
                    {portionReferences.map(ref => (
                      <SelectItem key={ref.unit_name} value={ref.unit_name}>
                        {ref.unit_name} ({ref.grams_default}g ברירת מחדל)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>גרמים ליחידה</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.grams_per_unit}
                  onChange={(e) => setFormData({ ...formData, grams_per_unit: e.target.value })}
                  placeholder="לדוגמה: 30"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label>יחידת ברירת מחדל</Label>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} className="flex-1 bg-teal-600 hover:bg-teal-700">
                  שמור
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingPortion(null);
                    setFormData({ unit_name: '', grams_per_unit: '', is_default: false });
                  }}
                  className="flex-1"
                >
                  ביטול
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setShowForm(true)} className="w-full bg-teal-600 hover:bg-teal-700">
              <Plus className="w-4 h-4 ml-2" />
              הוסף יחידה חדשה
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>סגור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}