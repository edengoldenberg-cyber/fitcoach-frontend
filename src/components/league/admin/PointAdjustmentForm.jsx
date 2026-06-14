import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function PointAdjustmentForm({ trainees, onSubmit }) {
  const [traineeId, setTraineeId] = React.useState('');
  const [pointsDelta, setPointsDelta] = React.useState('');
  const [reason, setReason] = React.useState('');

  const submit = () => {
    if (!traineeId || !pointsDelta || !reason.trim()) return;
    onSubmit({ traineeId, pointsDelta: Number(pointsDelta), reason });
    setTraineeId('');
    setPointsDelta('');
    setReason('');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <h3 className="font-bold text-slate-900">התאמת ניקוד ידנית</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <Select value={traineeId} onValueChange={setTraineeId}>
          <SelectTrigger><SelectValue placeholder="בחר מתאמן" /></SelectTrigger>
          <SelectContent>{trainees.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="number" value={pointsDelta} onChange={(e) => setPointsDelta(e.target.value)} placeholder="שינוי נקודות (+/-)" />
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="סיבה חובה" className="md:col-span-1" />
        <Button onClick={submit} disabled={!traineeId || !pointsDelta || !reason.trim()}>רשום התאמה</Button>
      </div>
    </div>
  );
}