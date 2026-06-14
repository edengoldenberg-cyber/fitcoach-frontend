import React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function PlayerRow({ trainee, group, groups, blocked, points, onMove, onRemove, onBlock, onUnblock, onReset }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_0.8fr_1.6fr] gap-3 items-center bg-white border border-slate-200 rounded-2xl p-3">
      <div>
        <p className="font-bold text-slate-900">{trainee.full_name}</p>
        <p className="text-xs text-slate-500">{trainee.user_email}</p>
      </div>
      <div className="text-sm text-slate-700">{group ? `${group.badge_icon || ''} ${group.display_name || group.name}` : 'ללא קבוצה'}</div>
      <div className="text-sm font-bold text-teal-700">{points} נק׳</div>
      <div className="flex flex-wrap gap-2 justify-start lg:justify-end">
        <Select onValueChange={(groupId) => onMove(trainee, groupId)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="העבר לקבוצה" /></SelectTrigger>
          <SelectContent>{groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.display_name || g.name}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" onClick={() => onRemove(trainee)}>הסר מהליגה</Button>
        {blocked ? <Button variant="outline" onClick={() => onUnblock(trainee)}>שחרר חסימה</Button> : <Button variant="outline" onClick={() => onBlock(trainee)}>חסום</Button>}
        <Button variant="ghost" className="text-red-600" onClick={() => onReset(trainee)}>איפוס</Button>
      </div>
    </div>
  );
}