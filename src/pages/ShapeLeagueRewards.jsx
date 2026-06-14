import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowRight, Trophy, Gift, Crown, Medal } from 'lucide-react';
import LeagueRewardCard from '@/components/league/rewards/LeagueRewardCard';
import { REWARD_CATEGORIES } from '@/components/league/rewards/rewardConstants';

function Spinner() {
  return (
    <div className="flex justify-center py-6">
      <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function generateClaimCode() {
  return `SL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export default function ShapeLeagueRewards() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      return trainees[0] || null;
    },
    enabled: !!user?.email,
  });

  const { data: rewards = [], isLoading } = useQuery({
    queryKey: ['leagueRewardsPublic'],
    queryFn: () => base44.entities.LeagueReward.filter({ status: 'active' }),
  });

  const { data: claims = [] } = useQuery({
    queryKey: ['myLeagueRewardClaims', trainee?.id],
    queryFn: () => base44.entities.LeagueRewardClaim.filter({ trainee_id: trainee?.id }),
    enabled: !!trainee?.id,
  });

  const activeRewards = React.useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return rewards.filter((reward) => !reward.valid_until || reward.valid_until >= today);
  }, [rewards]);

  const claimsByRewardId = React.useMemo(() => {
    return Object.fromEntries(claims.map((claim) => [claim.reward_id, claim]));
  }, [claims]);

  const handleClaim = async (reward) => {
    if (!trainee || claimsByRewardId[reward.id]) return;
    await base44.entities.LeagueRewardClaim.create({
      reward_id: reward.id,
      reward_title: reward.title,
      reward_type: reward.reward_type,
      trainee_id: trainee.id,
      trainee_email: trainee.user_email,
      trainee_name: trainee.full_name,
      sponsor: reward.sponsor || '',
      claim_code: generateClaimCode(),
      status: 'claimed',
      claimed_at: new Date().toISOString(),
    });
    queryClient.invalidateQueries({ queryKey: ['myLeagueRewardClaims', trainee.id] });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 pb-24" dir="rtl">
      <div className="sticky top-0 z-10 bg-slate-900/80 backdrop-blur border-b border-slate-700 px-4 py-3 flex items-center gap-3">
        <Link to="/ShapeLeagueHome" className="text-slate-400 hover:text-white transition-colors min-h-0 min-w-0">
          <ArrowRight className="w-5 h-5" />
        </Link>
        <Trophy className="w-5 h-5 text-yellow-400" />
        <h1 className="text-white font-bold text-lg">פרסי Shape League</h1>
      </div>

      <div className="px-4 pt-8 pb-6 text-center">
        <div className="text-6xl mb-3">🎁</div>
        <h2 className="text-3xl font-black text-white mb-1">פרסים והטבות</h2>
        <p className="text-yellow-400 font-semibold text-lg">צוברים, פותחים ודורשים פרסים</p>
      </div>

      <div className="px-4 space-y-6 max-w-lg mx-auto">
        {isLoading ? <Spinner /> : (
          REWARD_CATEGORIES.map((category) => {
            const items = activeRewards.filter((reward) => category.types.includes(reward.reward_type));
            return (
              <section key={category.key} className="space-y-3">
                <h2 className="text-white font-bold text-lg">{category.title}</h2>
                {items.map((reward) => (
                  <LeagueRewardCard
                    key={reward.id}
                    reward={reward}
                    claim={claimsByRewardId[reward.id]}
                    onClaim={handleClaim}
                  />
                ))}
                {items.length === 0 && (
                  <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-5 text-center text-sm text-slate-400">
                    אין כרגע פרסים פעילים בקטגוריה הזו
                  </div>
                )}
              </section>
            );
          })
        )}

        {claims.length > 0 && (
          <section className="bg-slate-800 border border-yellow-500/20 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Gift className="w-5 h-5 text-yellow-400" />
              <h2 className="text-white font-bold text-lg">הפרסים שלי</h2>
            </div>
            <div className="space-y-2">
              {claims.map((claim) => (
                <div key={claim.id} className="rounded-xl border border-slate-600 bg-slate-700/50 p-3">
                  <p className="font-bold text-white">{claim.reward_title}</p>
                  <p className="text-xs text-slate-400">קוד: {claim.claim_code} · סטטוס: {claim.status}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="bg-slate-800 border border-yellow-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Medal className="w-5 h-5 text-yellow-400" />
            <h2 className="text-white font-bold text-lg">🏅 היכל האלופים</h2>
          </div>
          <div className="space-y-2 text-center text-sm text-slate-500 py-4">
            <Crown className="w-8 h-8 mx-auto text-yellow-400" />
            ההיכל יתמלא בתום החודש הראשון 🏆
          </div>
        </div>

        <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/40 rounded-2xl p-5 text-center">
          <p className="text-yellow-300 text-xl font-black">כל נקודה מקרבת אותך לפרס 🔥</p>
          <Link to="/ShapeLeagueHome" className="inline-block mt-3 bg-yellow-400/20 hover:bg-yellow-400/30 border border-yellow-400/50 text-yellow-300 font-semibold px-5 py-2 rounded-xl text-sm transition-all min-h-0 min-w-0">
            חזרה לליגה 🏆
          </Link>
        </div>
      </div>
    </div>
  );
}