import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassWater, Droplets } from "lucide-react";
import { getIsraelDateString } from '@/utils/nutritionSync';

const CONTAINERS = [
  { type: 'disposable_cup', label: 'כוס חד פעמית', amount: 200, icon: '🥤' },
  { type: 'small_bottle', label: 'בקבוק קטן', amount: 500, icon: '🫙' },
  { type: 'large_bottle', label: 'בקבוק גדול', amount: 750, icon: '🍶' },
];

export default function AddWaterDialog({ open, onClose, onSave, traineeEmail, editingWater = null }) {
  const [selectedContainer, setSelectedContainer] = useState(null);
  const [customAmount, setCustomAmount] = useState(250);

  // Load editing water data
  React.useEffect(() => {
    if (editingWater && open) {
      setCustomAmount(editingWater.amount_ml);
    } else if (!open) {
      setCustomAmount(250);
      setSelectedContainer(null);
    }
  }, [editingWater, open]);

  const handleSave = (amount, containerType) => {
    if (!traineeEmail) {
      console.error('[AddWaterDialog] Missing traineeEmail!');
      return;
    }
    
    if (!amount || amount <= 0) {
      console.error('[AddWaterDialog] Invalid amount:', amount);
      return;
    }

    const entry = {
      trainee_email: traineeEmail,
      date: editingWater?.date || getIsraelDateString(),
      amount_ml: amount,
      container_type: containerType,
      time: editingWater?.time || new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
    };
    
    console.log('[AddWaterDialog] Saving water entry:', entry);
    onSave(entry, editingWater?.id);
    setSelectedContainer(null);
    setCustomAmount(250);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Droplets className="w-6 h-6 text-blue-500" />
            {editingWater ? 'ערוך שתיית מים' : 'הוסף שתיית מים'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!editingWater && (
            <div className="grid grid-cols-3 gap-3">
              {CONTAINERS.map(container => (
                <button
                  key={container.type}
                  onClick={() => handleSave(container.amount, container.type)}
                  className="p-4 border-2 border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all flex flex-col items-center gap-2 active:scale-95"
                >
                  <span className="text-3xl">{container.icon}</span>
                  <span className="text-sm font-medium text-slate-700">{container.label}</span>
                  <span className="text-xs text-blue-600 font-bold">{container.amount} מ״ל</span>
                </button>
              ))}
            </div>
          )}

          <div className={editingWater ? '' : 'border-t pt-4'}>
            <Label className="text-sm font-medium">{editingWater ? 'כמות' : 'כמות מותאמת אישית'}</Label>
            <div className="flex gap-2 mt-2">
              <Input
                type="number"
                value={customAmount}
                onChange={(e) => setCustomAmount(+e.target.value)}
                min={50}
                step={50}
                className="flex-1"
              />
              <span className="flex items-center text-slate-500">מ״ל</span>
              <Button 
                onClick={() => handleSave(customAmount, editingWater?.container_type || 'custom')}
                className="bg-blue-500 hover:bg-blue-600"
              >
                {editingWater ? 'שמור' : 'הוסף'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}