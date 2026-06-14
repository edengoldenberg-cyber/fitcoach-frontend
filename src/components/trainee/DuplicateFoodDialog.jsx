import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function DuplicateFoodDialog({ open, duplicate, incoming, onMerge, onAddNew, onCancel }) {
  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>המוצר הזה כבר קיים בארוחה</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm text-slate-600">
          <p>מצאנו את <strong>{duplicate?.food_name}</strong> באותה ארוחה.</p>
          <p>לאחד כמויות או להוסיף כפריט חדש?</p>
          <div className="rounded-lg bg-slate-50 p-2 text-xs">
            חדש: {incoming?.quantity || incoming?.grams_equivalent || 0} {incoming?.unit || 'גרם'} · {incoming?.calories || 0} קל׳
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancel}>ביטול</Button>
          <Button variant="outline" onClick={onAddNew}>הוסף חדש</Button>
          <Button onClick={onMerge} className="bg-emerald-600 hover:bg-emerald-700">איחוד</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}