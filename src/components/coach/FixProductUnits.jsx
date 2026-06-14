import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Wrench, Plus, Trash2 } from 'lucide-react';

/**
 * תיקון יחידות למוצר (מאמן)
 */
export default function FixProductUnits({ open, onClose, product }) {
  const queryClient = useQueryClient();
  const [newUnitId, setNewUnitId] = useState('');
  const [newGrams, setNewGrams] = useState('');

  // טען overrides קיימים
  const { data: existingOverrides = [] } = useQuery({
    queryKey: ['productOverrides', product?.id],
    queryFn: () => base44.entities.ProductUnitOverride.filter({ product_id: product?.id }),
    enabled: !!product?.id,
  });

  // טען כל היחידות הזמינות
  const { data: allUnits = [] } = useQuery({
    queryKey: ['allUnits'],
    queryFn: async () => {
      const portions = await base44.entities.PortionReference.list();
      return portions.map(p => ({
        id: p.id,
        name: p.name_he || p.legacy_label_he,
        default_grams: p.grams || p.grams_per_unit,
      }));
    },
  });

  // הוספת override
  const addOverrideMutation = useMutation({
    mutationFn: (data) => base44.entities.ProductUnitOverride.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productOverrides'] });
      toast.success('יחידה נוספה');
      setNewUnitId('');
      setNewGrams('');
    },
  });

  // מחיקת override
  const deleteOverrideMutation = useMutation({
    mutationFn: (id) => base44.entities.ProductUnitOverride.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productOverrides'] });
      toast.success('יחידה הוסרה');
    },
  });

  const handleAddOverride = () => {
    if (!newUnitId || !newGrams) {
      toast.error('נא למלא את כל השדות');
      return;
    }

    const selectedUnit = allUnits.find(u => u.id === newUnitId);

    addOverrideMutation.mutate({
      product_id: product.id,
      unit_id: newUnitId,
      unit_name: selectedUnit?.name,
      grams_override: parseFloat(newGrams),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-blue-500" />
            תיקון יחידות: {product?.name_he || product?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Overrides קיימים */}
          <div>
            <h3 className="font-bold mb-3">יחידות קיימות ({existingOverrides.length})</h3>
            {existingOverrides.length === 0 ? (
              <div className="text-slate-500 text-sm bg-slate-50 p-4 rounded-lg">
                אין יחידות מוגדרות למוצר זה
              </div>
            ) : (
              <div className="space-y-2">
                {existingOverrides.map(override => (
                  <div key={override.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg">
                    <div>
                      <div className="font-medium">{override.unit_name}</div>
                      <div className="text-xs text-slate-600">
                        {override.grams_override} גרם | unit_id: {override.unit_id || '❌ חסר'}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteOverrideMutation.mutate(override.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* הוסף יחידה */}
          <div className="border-t pt-4">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              הוסף יחידה חדשה
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-2">בחר יחידה</label>
                <Select value={newUnitId} onValueChange={setNewUnitId}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר יחידה..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allUnits.map(unit => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name} (ברירת מחדל: {unit.default_grams}g)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">גרמים ליחידה (למוצר זה)</label>
                <Input
                  type="number"
                  placeholder="למשל: 250"
                  value={newGrams}
                  onChange={(e) => setNewGrams(e.target.value)}
                />
              </div>

              <Button
                onClick={handleAddOverride}
                disabled={addOverrideMutation.isPending}
                className="w-full"
              >
                {addOverrideMutation.isPending ? 'מוסיף...' : 'הוסף יחידה'}
              </Button>
            </div>
          </div>

          {/* הנחיות */}
          <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-sm">
            <div className="font-bold text-blue-800 mb-1">💡 הנחיות</div>
            <ul className="text-blue-700 text-xs space-y-1 list-disc list-inside">
              <li>כל יחידה חייבת לכלול unit_id תקין</li>
              <li>הגדר גרמים ספציפיים למוצר זה (עוקף ברירת מחדל)</li>
              <li>אם אין יחידה מתאימה - צור אותה תחילה ב-PortionReference</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}