import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { Trophy, Users, TrendingUp, Star, Edit2, Plus, ArrowRight, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import ShapeLeagueCoachPanel from '@/components/coach/ShapeLeagueCoachPanel';

const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');
const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');

export default function CoachShapeLeagueDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedTrainee, setSelectedTrainee] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: rankingData, isLoading: loadingRanking } = useQuery({
    queryKey: ['coachLeagueRanking', weekStart],
    queryFn: async () => {
      const res = await base44.functions.invoke('calculateWeeklyRanking', {});
      return res.data;
    },
    staleTime: 1000 * 60 * 2,
  });

  const { data: groupRankingData, isLoading: loadingGroupRanking } = useQuery({
    queryKey: ['coachGroupRanking', weekStart],
    queryFn: async () => {
      const res = await base44.functions.invoke('calculateGroupWeeklyRanking', {});
      return res.data;
    },
    staleTime: 1000 * 60 * 2,
  });

  const { data: allGroups, isLoading: loadingGroups } = useQuery({
    queryKey: ['allLeagueGroups'],
    queryFn: () => base44.entities.ShapeLeagueGroup.list(),
  });

  const { data: allTrainees } = useQuery({
    queryKey: ['allTrainees', currentUser?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: currentUser.email }),
    enabled: !!currentUser?.email,
  });

  const { data: allWeekPoints } = useQuery({
    queryKey: ['allWeekPoints', weekStart],
    queryFn: async () => {
      const all = await base44.entities.UserPointsDaily.list();
      return all.filter(r => r.date >= weekStart && r.date <= weekEnd);
    },
  });

  const getTraineeName = (tid) => {
    const t = allTrainees?.find(t => t.id === tid);
    return t?.full_name || t?.user_email || tid;
  };

  const getTraineeEmail = (tid) => {
    return allTrainees?.find(t => t.id === tid)?.user_email || '';
  };

  const getGroupForTrainee = (tid) => {
    return allGroups?.find(g => Array.isArray(g.members) && g.members.includes(tid));
  };

  const getTraineeWeekPoints = (tid) => {
    return allWeekPoints?.filter(r => r.trainee_id === tid).reduce((s, r) => s + (r.total_points || 0), 0) || 0;
  };

  // Overview stats
  const activeThisWeek = new Set(allWeekPoints?.map(r => r.trainee_id) || []).size;
  const totalGroups = allGroups?.length || 0;
  const topTrainee = rankingData?.ranking?.[0];
  const topGroup = groupRankingData?.ranking?.[0];
  const avgPoints = rankingData?.ranking?.length
    ? Math.round(rankingData.ranking.reduce((s, r) => s + r.total_points, 0) / rankingData.ranking.length)
    : 0;

  // Group management actions
  const renameGroup = async (groupId, name) => {
    await base44.entities.ShapeLeagueGroup.update(groupId, { name });
    queryClient.invalidateQueries({ queryKey: ['allLeagueGroups'] });
    queryClient.invalidateQueries({ queryKey: ['coachGroupRanking'] });
    setEditingGroup(null);
    toast.success('שם הקבוצה עודכן');
  };

  const moveTrainee = async (traineeId, fromGroupId, toGroupId) => {
    const fromGroup = allGroups.find(g => g.id === fromGroupId);
    const toGroup = allGroups.find(g => g.id === toGroupId);
    if (!fromGroup || !toGroup) return;
    if ((toGroup.members?.length || 0) >= 5) {
      toast.error('הקבוצה המיועדת מלאה (מקסימום 5 חברים)');
      return;
    }
    await Promise.all([
      base44.entities.ShapeLeagueGroup.update(fromGroupId, {
        members: fromGroup.members.filter(id => id !== traineeId),
      }),
      base44.entities.ShapeLeagueGroup.update(toGroupId, {
        members: [...(toGroup.members || []), traineeId],
      }),
    ]);
    queryClient.invalidateQueries({ queryKey: ['allLeagueGroups'] });
    queryClient.invalidateQueries({ queryKey: ['coachGroupRanking'] });
    toast.success(`המתאמן הועבר ל-${toGroup.name}`);
  };

  const removeFromGroup = async (traineeId, groupId) => {
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return;
    await base44.entities.ShapeLeagueGroup.update(groupId, {
      members: group.members.filter(id => id !== traineeId),
    });
    queryClient.invalidateQueries({ queryKey: ['allLeagueGroups'] });
    toast.success('המתאמן הוסר מהקבוצה');
  };

  const createNewGroup = async () => {
    const name = newGroupName.trim() || `Team ${(allGroups?.length || 0) + 1}`;
    await base44.entities.ShapeLeagueGroup.create({ name, members: [], max_members: 5 });
    queryClient.invalidateQueries({ queryKey: ['allLeagueGroups'] });
    setNewGroupName('');
    toast.success(`קבוצה "${name}" נוצרה`);
  };

  const autoFillGroups = async () => {
    const unassigned = allTrainees?.filter(t => !getGroupForTrainee(t.id) && t.status === 'active') || [];
    if (unassigned.length === 0) { toast.info('אין מתאמנים לא משויכים'); return; }
    for (const t of unassigned) {
      await base44.functions.invoke('assignUserToLeagueGroup', { trainee_id: t.id });
    }
    queryClient.invalidateQueries({ queryKey: ['allLeagueGroups'] });
    toast.success(`${unassigned.length} מתאמנים שויכו לקבוצות`);
  };

  const rankMedal = (rank) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

  const TABS = [
    { id: 'overview', label: 'סקירה' },
    { id: 'personal', label: 'דירוג אישי' },
    { id: 'groups_rank', label: 'דירוג קבוצות' },
    { id: 'manage', label: 'ניהול קבוצות' },
  ];

  return (
    <div className="min-h-screen bg-slate-900 pb-10" dir="rtl">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Trophy className="w-7 h-7 text-yellow-400" />
          <h1 className="text-2xl font-bold text-white">Shape League — Coach</h1>
        </div>
        <p className="text-slate-400 text-xs">ניהול ליגה שבועית</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 mb-4 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors min-h-0 min-w-0 ${activeTab === t.id ? 'bg-yellow-400 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
            {t.label}
          </button>
        ))}
        <button onClick={() => queryClient.invalidateQueries()}
          className="mr-auto bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1.5 rounded-lg min-h-0 min-w-0">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 max-w-2xl mx-auto space-y-4">

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="פעילים השבוע" value={activeThisWeek} icon="🏃" />
              <StatCard label="קבוצות" value={totalGroups} icon="👥" />
              <StatCard label="ממוצע נקודות" value={avgPoints} icon="⭐" />
              <StatCard label="שורה ראשונה" value={topTrainee ? getTraineeName(topTrainee.trainee_id) : '-'} icon="🥇" small />
            </div>
            {topGroup && (
              <div className="bg-slate-800 border border-yellow-400/30 rounded-2xl p-4">
                <div className="text-slate-400 text-xs mb-2">🏆 קבוצה מובילה השבוע</div>
                <div className="text-yellow-400 font-bold text-lg">{topGroup.group_name}</div>
                <div className="text-slate-300 text-sm">ממוצע: {topGroup.group_average_points} נק' | {topGroup.active_members}/{topGroup.member_count} פעילים</div>
              </div>
            )}
          </>
        )}

        {/* PERSONAL RANKING TAB */}
        {activeTab === 'personal' && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <h3 className="text-white font-semibold">TOP 20 — השבוע</h3>
            </div>
            {loadingRanking ? <Spinner /> : (
              <div className="divide-y divide-slate-700">
                {(rankingData?.ranking || []).map(entry => (
                  <div key={entry.trainee_id}
                    className="flex items-center justify-between px-4 py-3 hover:bg-slate-700/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedTrainee(entry.trainee_id)}>
                    <div className="flex items-center gap-3">
                      <span className="text-base w-7">{rankMedal(entry.rank)}</span>
                      <div>
                        <div className="text-white text-sm font-medium">{entry.trainee_name}</div>
                        <div className="text-slate-500 text-xs">{getTraineeEmail(entry.trainee_id)}</div>
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-purple-400 font-bold text-sm">{entry.total_points} נק'</div>
                      <div className="text-slate-500 text-xs flex gap-1">
                        <span>🏋️{entry.workout_points}</span>
                        <span>🥗{entry.meal_points}</span>
                        <span>💧{entry.water_points}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {!rankingData?.ranking?.length && (
                  <div className="text-center text-slate-500 py-8">אין נקודות השבוע</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* GROUP RANKING TAB */}
        {activeTab === 'groups_rank' && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <h3 className="text-white font-semibold">דירוג קבוצות — השבוע</h3>
              <p className="text-slate-500 text-xs mt-0.5">ממוצע נקודות לחבר (מניעת יתרון לקבוצות גדולות)</p>
            </div>
            {loadingGroupRanking ? <Spinner /> : (
              <div className="divide-y divide-slate-700">
                {(groupRankingData?.ranking || []).map(group => (
                  <div key={group.group_id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{rankMedal(group.rank)}</span>
                        <span className="text-white font-semibold text-sm">{group.group_name}</span>
                      </div>
                      <div className="text-left">
                        <span className="text-orange-400 font-bold text-sm">{group.group_average_points} ממוצע</span>
                        <span className="text-slate-500 text-xs mr-2">({group.group_total_points} סה"כ)</span>
                      </div>
                    </div>
                    <div className="text-slate-500 text-xs">{group.active_members}/{group.member_count} פעילים</div>
                  </div>
                ))}
                {!groupRankingData?.ranking?.length && (
                  <div className="text-center text-slate-500 py-8">אין קבוצות עם נקודות</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* GROUP MANAGEMENT TAB */}
        {activeTab === 'manage' && (
          <>
            <div className="flex gap-2">
              <input
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder="שם קבוצה חדשה..."
                className="flex-1 bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600 focus:outline-none focus:border-teal-400"
              />
              <Button onClick={createNewGroup} size="sm" className="bg-teal-500 hover:bg-teal-400 text-white min-h-0">
                <Plus className="w-4 h-4 mr-1" /> צור
              </Button>
              <Button onClick={autoFillGroups} size="sm" className="bg-purple-600 hover:bg-purple-500 text-white min-h-0 text-xs">
                ⚡ מלא אוטו
              </Button>
            </div>

            {loadingGroups ? <Spinner /> : (allGroups || []).map(group => (
              <div key={group.id} className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                  {editingGroup === group.id ? (
                    <div className="flex gap-2 flex-1">
                      <input
                        defaultValue={group.name}
                        id={`rename-${group.id}`}
                        className="flex-1 bg-slate-700 text-white rounded px-2 py-1 text-sm border border-teal-400 focus:outline-none"
                        autoFocus
                      />
                      <button onClick={() => renameGroup(group.id, document.getElementById(`rename-${group.id}`).value)}
                        className="text-teal-400 text-xs font-bold min-h-0 min-w-0 px-2">שמור</button>
                      <button onClick={() => setEditingGroup(null)} className="text-slate-400 min-h-0 min-w-0 px-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-white font-semibold">{group.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-xs">{group.members?.length || 0}/5</span>
                        <button onClick={() => setEditingGroup(group.id)}
                          className="text-slate-400 hover:text-white min-h-0 min-w-0 p-1">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div className="divide-y divide-slate-700/50">
                  {(group.members || []).length === 0 && (
                    <div className="text-slate-500 text-xs text-center py-4">קבוצה ריקה</div>
                  )}
                  {(group.members || []).map(tid => (
                    <div key={tid} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <div className="text-white text-sm">{getTraineeName(tid)}</div>
                        <div className="text-slate-500 text-xs">{getTraineeWeekPoints(tid)} נק' השבוע</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <select
                          className="bg-slate-700 text-slate-300 text-xs rounded px-1.5 py-1 border border-slate-600 focus:outline-none min-h-0"
                          defaultValue=""
                          onChange={e => { if (e.target.value) moveTrainee(tid, group.id, e.target.value); e.target.value = ''; }}>
                          <option value="">העבר ל...</option>
                          {(allGroups || []).filter(g => g.id !== group.id).map(g => (
                            <option key={g.id} value={g.id}>{g.name} ({g.members?.length || 0}/5)</option>
                          ))}
                        </select>
                        <button onClick={() => removeFromGroup(tid, group.id)}
                          className="text-red-400 hover:text-red-300 min-h-0 min-w-0 p-1">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

      </div>

      {/* Coach Control Panel */}
      <ShapeLeagueCoachPanel />

      {/* Trainee Detail Modal */}
      {selectedTrainee && (
        <TraineeLeagueProfile
          traineeId={selectedTrainee}
          allWeekPoints={allWeekPoints}
          allGroups={allGroups}
          rankingData={rankingData}
          weekStart={weekStart}
          weekEnd={weekEnd}
          onClose={() => setSelectedTrainee(null)}
        />
      )}
    </div>
  );
}

function TraineeLeagueProfile({ traineeId, allWeekPoints, allGroups, rankingData, weekStart, weekEnd, onClose }) {
  const { data: trainee } = useQuery({
    queryKey: ['traineeById', traineeId],
    queryFn: async () => {
      // filter({ id }) performs a primary-key lookup — avoids loading all trainees
      const results = await base44.entities.Trainee.filter({ id: traineeId });
      return results[0] || null;
    },
    enabled: !!traineeId,
  });

  const { data: todayPoints } = useQuery({
    queryKey: ['todayPointsCoach', traineeId],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const recs = await base44.entities.UserPointsDaily.filter({ trainee_id: traineeId, date: today });
      return recs[0] || null;
    },
  });

  const weekRecords = allWeekPoints?.filter(r => r.trainee_id === traineeId) || [];
  const weekTotal = weekRecords.reduce((s, r) => s + (r.total_points || 0), 0);
  const myGroup = allGroups?.find(g => Array.isArray(g.members) && g.members.includes(traineeId));
  const globalRank = rankingData?.ranking?.find(r => r.trainee_id === traineeId);

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-end justify-center" onClick={onClose}>
      <div className="bg-slate-800 rounded-t-2xl w-full max-w-lg max-h-[92dvh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="flex justify-between items-center p-5 pb-3 border-b border-slate-700/60 flex-shrink-0">
          <h3 className="text-white font-bold text-lg">{trainee?.full_name || 'מתאמן'}</h3>
          <button onClick={onClose} className="text-slate-400 min-h-0 min-w-0 p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5 pt-4 pb-10">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="נקודות היום" value={todayPoints?.total_points || 0} icon="🔥" />
            <StatCard label="נקודות השבוע" value={weekTotal} icon="⭐" />
            <StatCard label="דירוג גלובלי" value={globalRank ? `#${globalRank.rank}` : '-'} icon="🏆" />
            <StatCard label="קבוצה" value={myGroup?.name || 'לא משויך'} icon="👥" small />
          </div>
          {todayPoints && (
            <div className="bg-slate-700 rounded-xl p-3 grid grid-cols-4 gap-2 text-center text-xs">
              <div><div className="text-teal-400 font-bold">{todayPoints.workout_points}</div><div className="text-slate-400">אימון</div></div>
              <div><div className="text-green-400 font-bold">{todayPoints.meal_points}</div><div className="text-slate-400">תזונה</div></div>
              <div><div className="text-blue-400 font-bold">{todayPoints.water_points}</div><div className="text-slate-400">מים</div></div>
              <div><div className="text-yellow-400 font-bold">{todayPoints.bonus_points}</div><div className="text-slate-400">בונוס</div></div>
            </div>
          )}
          <div className="space-y-1">
            <div className="text-slate-400 text-xs font-semibold">ימים פעילים השבוע</div>
            {weekRecords.sort((a, b) => b.date.localeCompare(a.date)).map(r => (
              <div key={r.id} className="flex justify-between items-center py-1.5 border-b border-slate-700 text-sm">
                <span className="text-slate-400">{r.date}</span>
                <span className="text-white font-semibold">{r.total_points} נק'</span>
              </div>
            ))}
            {weekRecords.length === 0 && <div className="text-slate-500 text-xs">אין פעילות השבוע</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, small }) {
  return (
    <div className="bg-slate-700/60 border border-slate-600 rounded-xl p-3 text-center">
      <div className="text-xl mb-1">{icon}</div>
      <div className={`font-bold text-white ${small ? 'text-sm' : 'text-2xl'} truncate`}>{value}</div>
      <div className="text-slate-400 text-xs mt-0.5">{label}</div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-6">
      <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}