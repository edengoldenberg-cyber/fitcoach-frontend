import React from 'react';
import { Gift, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RewardFormDialog from './RewardFormDialog';
import RewardClaimsManager from './RewardClaimsManager';
import LeagueRewardCard from './LeagueRewardCard';
import { REWARD_CATEGORIES } from './rewardConstants';

export default function RewardAdminPanel({ rewards, claims, userEmail, onCreate, onUpdate, onUpdateClaim }) {
  const [editing, setEditing] = React.useState(null);
  const [formOpen, setFormOpen] = React.useState(false);

  const submit = async (data) => {
    if (editing) await onUpdate(editing, { ...data, updated_by_coach_email: userEmail });
    else await onCreate({ ...data, created_by_coach_email: userEmail, updated_by_coach_email: userEmail });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm">
        <div><h2 className="text-xl font-black text-slate-900">🎁 פרסים</h2><p className="text-sm text-slate-500">יצירה, עריכה וניהול מימושים — ללא תשלומים וללא התראות</p></div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Gift className="ml-1 h-4 w-4" />הוסף פרס</Button>
      </div>

      {REWARD_CATEGORIES.map((category) => {
        const items = rewards.filter((reward) => category.types.includes(reward.reward_type));
        return (
          <section key={category.key} className="space-y-3">
            <h3 className="text-lg font-bold text-slate-900">{category.title}</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {items.map((reward) => (
                <LeagueRewardCard key={reward.id} reward={reward} adminActions={<Button variant="outline" className="bg-white text-slate-900" onClick={() => { setEditing(reward); setFormOpen(true); }}><Pencil className="ml-1 h-4 w-4" />ערוך</Button>} />
              ))}
            </div>
            {items.length === 0 && <p className="rounded-xl border border-dashed bg-white p-4 text-center text-sm text-slate-400">אין פרסים בקטגוריה זו</p>}
          </section>
        );
      })}

      <RewardClaimsManager claims={claims} onUpdate={onUpdateClaim} />
      <RewardFormDialog open={formOpen} reward={editing} onClose={() => setFormOpen(false)} onSubmit={submit} />
    </div>
  );
}