import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CLAIM_STATUSES, labelFor } from './rewardConstants';

export default function RewardClaimsManager({ claims, onUpdate }) {
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');

  const rows = claims.filter((claim) => {
    const text = `${claim.trainee_name || ''} ${claim.trainee_email || ''} ${claim.sponsor || ''} ${claim.reward_title || ''}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (status === 'all' || claim.status === status);
  });

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900">ניהול מימושים</h3>
      <div className="my-4 grid grid-cols-1 md:grid-cols-2 gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="סינון לפי מתאמן / ספונסר / פרס" />
        <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">כל הסטטוסים</SelectItem>{CLAIM_STATUSES.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="space-y-2">
        {rows.map((claim) => (
          <div key={claim.id} className="rounded-xl border p-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div>
                <p className="font-bold text-slate-900">{claim.reward_title}</p>
                <p className="text-sm text-slate-500">{claim.trainee_name || claim.trainee_email} · {claim.claim_code}</p>
                <p className="text-xs text-slate-400">{claim.sponsor ? `בחסות ${claim.sponsor}` : 'פרס מטעם Shape'} · {labelFor(CLAIM_STATUSES, claim.status)}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={claim.status === 'redeemed'} onClick={() => onUpdate(claim, 'redeemed')}>סמן מומש</Button>
                <Button size="sm" variant="destructive" disabled={claim.status === 'cancelled'} onClick={() => onUpdate(claim, 'cancelled')}>בטל</Button>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="py-8 text-center text-sm text-slate-400">אין מימושים להצגה</p>}
      </div>
    </div>
  );
}