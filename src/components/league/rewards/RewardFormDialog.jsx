import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { REWARD_STATUSES, REWARD_TYPES, PLACEMENTS } from './rewardConstants';

const emptyForm = {
  title: '', description: '', reward_type: 'individual', assigned_placement: 'custom', sponsor: '', reward_value: '', quantity_limit: '', valid_until: '', coupon_code: '', redemption_instructions: '', image_url: '', status: 'draft'
};

export default function RewardFormDialog({ open, reward, onClose, onSubmit }) {
  const [form, setForm] = React.useState(emptyForm);

  React.useEffect(() => {
    setForm(reward ? { ...emptyForm, ...reward, quantity_limit: reward.quantity_limit || '' } : emptyForm);
  }, [reward, open]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = async () => {
    await onSubmit({ ...form, quantity_limit: form.quantity_limit ? Number(form.quantity_limit) : undefined });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>{reward ? 'עריכת פרס' : 'הוסף פרס'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2"><Label>כותרת הפרס</Label><Input value={form.title} onChange={(e) => update('title', e.target.value)} /></div>
          <div className="md:col-span-2"><Label>תיאור</Label><Textarea value={form.description} onChange={(e) => update('description', e.target.value)} /></div>
          <div><Label>סוג פרס</Label><Select value={form.reward_type} onValueChange={(v) => update('reward_type', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{REWARD_TYPES.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>שיוך למיקום</Label><Select value={form.assigned_placement} onValueChange={(v) => update('assigned_placement', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PLACEMENTS.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>ספונסר / עסק</Label><Input value={form.sponsor} onChange={(e) => update('sponsor', e.target.value)} placeholder="אופציונלי" /></div>
          <div><Label>שווי הפרס</Label><Input value={form.reward_value} onChange={(e) => update('reward_value', e.target.value)} placeholder="אופציונלי" /></div>
          <div><Label>מגבלת כמות</Label><Input type="number" value={form.quantity_limit} onChange={(e) => update('quantity_limit', e.target.value)} /></div>
          <div><Label>בתוקף עד</Label><Input type="date" value={form.valid_until} onChange={(e) => update('valid_until', e.target.value)} /></div>
          <div><Label>קוד קופון</Label><Input value={form.coupon_code} onChange={(e) => update('coupon_code', e.target.value)} /></div>
          <div><Label>סטטוס</Label><Select value={form.status} onValueChange={(v) => update('status', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{REWARD_STATUSES.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="md:col-span-2"><Label>תמונה / לוגו URL</Label><Input value={form.image_url} onChange={(e) => update('image_url', e.target.value)} /></div>
          <div className="md:col-span-2"><Label>הוראות מימוש</Label><Textarea value={form.redemption_instructions} onChange={(e) => update('redemption_instructions', e.target.value)} /></div>
        </div>
        <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>ביטול</Button><Button onClick={submit} disabled={!form.title}>שמירה</Button></div>
      </DialogContent>
    </Dialog>
  );
}