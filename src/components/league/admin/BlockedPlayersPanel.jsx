import React from 'react';
import { Button } from '@/components/ui/button';

export default function BlockedPlayersPanel({ blockedPlayers, onUnblock }) {
  return (
    <div className="space-y-2">
      {blockedPlayers.map((item) => (
        <div key={item.id} className="bg-white border border-slate-200 rounded-2xl p-3 flex items-center justify-between gap-3">
          <div>
            <p className="font-bold text-slate-900">{item.trainee_name || item.trainee_email || item.trainee_id}</p>
            <p className="text-xs text-slate-500">{item.reason || 'ללא סיבה'} · {item.blocked_at ? new Date(item.blocked_at).toLocaleString('he-IL') : ''}</p>
          </div>
          <Button variant="outline" onClick={() => onUnblock(item)}>שחרור חסימה</Button>
        </div>
      ))}
      {blockedPlayers.length === 0 && <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">אין שחקנים חסומים</div>}
    </div>
  );
}