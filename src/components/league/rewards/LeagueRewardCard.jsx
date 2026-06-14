import React from 'react';
import { Gift, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PLACEMENTS, REWARD_TYPES, labelFor } from './rewardConstants';

export default function LeagueRewardCard({ reward, claim, onClaim, adminActions }) {
  return (
    <div className="rounded-2xl border border-yellow-400/30 bg-slate-800/80 p-4 text-white shadow-lg">
      {reward.image_url && <img src={reward.image_url} alt="" className="mb-3 h-28 w-full rounded-xl object-cover" />}
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-400/15 text-2xl">🎁</div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-black text-white">{reward.title}</h3>
          <p className="mt-1 text-sm text-slate-300">{reward.description}</p>
          <p className="mt-2 text-xs font-semibold text-yellow-300">
            {reward.sponsor ? `בחסות ${reward.sponsor}` : 'פרס מטעם Shape'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-slate-700 px-3 py-1">{labelFor(REWARD_TYPES, reward.reward_type)}</span>
        <span className="rounded-full bg-slate-700 px-3 py-1">{labelFor(PLACEMENTS, reward.assigned_placement)}</span>
        {reward.reward_value && <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-200">{reward.reward_value}</span>}
        {reward.quantity_limit ? <span className="rounded-full bg-slate-700 px-3 py-1">מלאי: {reward.quantity_limit}</span> : null}
      </div>

      {reward.redemption_instructions && <p className="mt-3 rounded-xl bg-slate-900/60 p-3 text-xs text-slate-300">{reward.redemption_instructions}</p>}
      {claim && <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">קוד מימוש: <b>{claim.claim_code}</b> · {claim.status}</div>}

      <div className="mt-4 flex gap-2">
        {onClaim && !claim && <Button onClick={() => onClaim(reward)} className="flex-1 bg-yellow-400 text-slate-900 hover:bg-yellow-300"><Gift className="ml-1 h-4 w-4" />דרוש פרס</Button>}
        {onClaim && claim && <Button disabled className="flex-1 bg-emerald-600"><CheckCircle2 className="ml-1 h-4 w-4" />כבר נדרש</Button>}
        {adminActions}
      </div>
    </div>
  );
}