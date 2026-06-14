import React from 'react';
import { Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CaptainPanel({ groups, traineesById, pointsByTrainee, onAutoAssign, onRemoveCaptain }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {groups.map((group) => {
        const captain = traineesById[group.captain_trainee_id];
        return (
          <div key={group.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold text-slate-900">{group.badge_icon} {group.display_name || group.name}</h3>
              <Crown className="w-5 h-5 text-amber-500" />
            </div>
            <p className="text-sm text-slate-700">קפטן: <b>{captain ? `👑 ${captain.full_name}` : 'אין קפטן'}</b></p>
            <div className="text-xs text-slate-500 space-y-1">
              {(group.members || []).map((id) => <div key={id}>{traineesById[id]?.full_name || id} — {pointsByTrainee[id] || 0} נק׳</div>)}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onAutoAssign(group)}>בחר לפי ניקוד שבועי</Button>
              <Button variant="ghost" onClick={() => onRemoveCaptain(group)} className="text-red-600">הסר קפטן</Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}