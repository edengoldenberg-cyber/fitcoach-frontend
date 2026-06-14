import React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function MoveTraineePanel({ trainees, groups, onMove }) {
  const [traineeId, setTraineeId] = React.useState('');
  const [groupId, setGroupId] = React.useState('');

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <h3 className="font-bold text-slate-900">העברת מתאמן בין קבוצות</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Select value={traineeId} onValueChange={setTraineeId}>
          <SelectTrigger><SelectValue placeholder="בחר מתאמן" /></SelectTrigger>
          <SelectContent>{trainees.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger><SelectValue placeholder="בחר קבוצה" /></SelectTrigger>
          <SelectContent>{groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.display_name || g.name}</SelectItem>)}</SelectContent>
        </Select>
        <Button disabled={!traineeId || !groupId} onClick={() => onMove(trainees.find((t) => t.id === traineeId), groupId)}>העבר</Button>
      </div>
    </div>
  );
}