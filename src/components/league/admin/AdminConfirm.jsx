import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const CONFIRM_TEXT = 'אני מבין/ה שהפעולה תשפיע על הליגה';

export default function AdminConfirm({ open, title, description, onCancel, onConfirm }) {
  const [value, setValue] = React.useState('');

  React.useEffect(() => {
    if (open) setValue('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" /> {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{description}</p>
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            כדי לאשר, הקלידו בדיוק: <b>{CONFIRM_TEXT}</b>
          </div>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={CONFIRM_TEXT} />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onCancel}>ביטול</Button>
            <Button variant="destructive" disabled={value !== CONFIRM_TEXT} onClick={onConfirm}>אישור פעולה</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}