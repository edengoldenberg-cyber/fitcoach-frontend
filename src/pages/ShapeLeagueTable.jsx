import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { ArrowRight, Trophy, Users, TrendingUp, Medal } from 'lucide-react';

function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function rankMedal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

export default function ShapeLeagueTable() {
  const [tab, setTab] = useState('personal');

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      return trainees[0] || null;
    },
    enabled: !!user?.email,
  });

  const { data: personalData, isLoading: loadingPersonal } = useQuery({
    queryKey: ['weeklyRankingFull'],
    queryFn: async () => {
      const res = await base44.functions.invoke('calculateWeeklyRanking', {});
      return res.data;
    },
    staleTime: 1000 * 60 * 3,
  });

  const { data: groupData, isLoading: loadingGroups } = useQuery({
    queryKey: ['groupWeeklyRankingFull'],
    queryFn: async () => {
      const res = await base44.functions.invoke('calculateGroupWeeklyRanking', {});
      return res.data;
    },
    staleTime: 1000 * 60 * 3,
  });

  const myEntry = personalData?.ranking?.find(r => r.trainee_id === trainee?.id);
  const myIdx = personalData?.ranking?.findIndex(r => r.trainee_id === trainee?.id) ?? -1;
  const personAbove = myIdx > 0 ? personalData?.ranking[myIdx - 1] : null;
  const pointsNeeded = personAbove ? personAbove.total_points - (myEntry?.total_points || 0) : 0;

  const { data: myGroup } = useQuery({
    queryKey: ['myLeagueGroup', trainee?.id],
    queryFn: async () => {
      const allGroups = await base44.entities.ShapeLeagueGroup.list();
      return allGroups.find(g => Array.isArray(g.members) && g.members.includes(trainee.id)) || null;
    },
    enabled: !!trainee?.id,
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 pb-24" dir="rtl">

      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-900/90 backdrop-blur border-b border-slate-700 px-4 py-3 flex items-center gap-3">
        <Link to="/ShapeLeagueHome" className="text-slate-400 hover:text-white min-h-0 min-w-0">
          <ArrowRight className="w-5 h-5" />
        </Link>
        <Trophy className="w-5 h-5 text-yellow-400" />
        <span className="text-white font-bold text-lg flex-1">טבלת הליגה</span>
      </div>

      {/* My rank highlight */}
      {myEntry && (
        <div className="px-4 pt-4">
          <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-yellow-300 font-bold text-sm">המיקום שלך השבוע</div>
              <div className="text-white text-xs mt-0.5">{myEntry.days_active} ימים פעילים</div>
              {personAbove && pointsNeeded > 0 && (
                <div className="flex items-center gap-1 mt-1.5 text-xs text-green-400">
                  <TrendingUp className="w-3 h-3" />
                  עוד {pointsNeeded} נק' ואתה עוקף את מקום {myEntry.rank - 1}
                </div>
              )}
              {myEntry.rank === 1 && (
                <div className="text-xs text-yellow-300 mt-1">👑 אתה במקום הראשון!</div>
              )}
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-yellow-400">{rankMedal(myEntry.rank)}</div>
              <div className="text-purple-400 font-bold text-lg">{myEntry.total_points}</div>
              <div className="text-slate-500 text-xs">נק'</div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 mt-4">
        <div className="flex bg-slate-800 rounded-xl p-1 border border-slate-700">
          <button
            onClick={() => setTab('personal')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all min-h-0 min-w-0 ${tab === 'personal' ? 'bg-yellow-400 text-slate-900' : 'text-slate-400'}`}
          >
            👤 אישי
          </button>
          <button
            onClick={() => setTab('groups')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all min-h-0 min-w-0 ${tab === 'groups' ? 'bg-orange-400 text-slate-900' : 'text-slate-400'}`}
          >
            👥 קבוצות
          </button>
        </div>
      </div>

      <div className="px-4 mt-4 max-w-lg mx-auto">

        {/* Personal Leaderboard */}
        {tab === 'personal' && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
              <Medal className="w-4 h-4 text-yellow-400" />
              <span className="text-white font-semibold text-sm">TOP 20 — השבוע</span>
              {personalData?.week_start && (
                <span className="text-slate-500 text-xs mr-auto">{personalData.week_start}</span>
              )}
            </div>

            {loadingPersonal ? <Spinner /> : (
              <div className="divide-y divide-slate-700/50">
                {(personalData?.ranking || []).map(entry => {
                  const isMe = entry.trainee_id === trainee?.id;
                  return (
                    <div key={entry.trainee_id} className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-yellow-400/10' : ''}`}>
                      <span className="w-8 text-center text-base flex-shrink-0">{rankMedal(entry.rank)}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${isMe ? 'text-yellow-300' : 'text-white'}`}>
                          {isMe ? `${entry.trainee_name} (את/ה)` : entry.trainee_name}
                        </div>
                        <div className="text-slate-500 text-xs">{entry.days_active} ימים פעילים</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className={`font-bold text-sm ${isMe ? 'text-yellow-400' : 'text-purple-400'}`}>{entry.total_points}</span>
                        <span className="text-slate-500 text-xs mr-1">נק'</span>
                      </div>
                    </div>
                  );
                })}
                {(!personalData?.ranking?.length) && (
                  <div className="text-center text-slate-500 text-sm py-8">אין נקודות השבוע עדיין</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Groups Leaderboard */}
        {tab === 'groups' && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
              <Users className="w-4 h-4 text-orange-400" />
              <span className="text-white font-semibold text-sm">דירוג קבוצות — השבוע</span>
            </div>

            {loadingGroups ? <Spinner /> : (
              <div className="divide-y divide-slate-700/50">
                {(groupData?.ranking || []).map(group => {
                  const isMyGroup = group.group_id === myGroup?.id;
                  return (
                    <Link
                      key={group.group_id}
                      to={`/ShapeLeagueGroupProfile?groupId=${group.group_id}`}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-700/50 min-h-0 min-w-0 ${isMyGroup ? 'bg-orange-400/10' : ''}`}
                    >
                      <span className="w-8 text-center text-base flex-shrink-0">{rankMedal(group.rank)}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${isMyGroup ? 'text-orange-300' : 'text-white'}`}>
                          {group.group_name} {isMyGroup ? '(שלך)' : ''}
                        </div>
                        <div className="text-slate-500 text-xs">{group.active_members}/{group.member_count} פעילים</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`font-bold text-sm ${isMyGroup ? 'text-orange-400' : 'text-purple-400'}`}>{group.group_average_points}</div>
                        <div className="text-slate-500 text-xs">ממוצע</div>
                      </div>
                    </Link>
                  );
                })}
                {(!groupData?.ranking?.length) && (
                  <div className="text-center text-slate-500 text-sm py-8">אין קבוצות עדיין</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}