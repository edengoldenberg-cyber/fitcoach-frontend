import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Trophy, ShieldCheck, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SeasonControlCard from '@/components/league/admin/SeasonControlCard';
import ResetToolsPanel from '@/components/league/admin/ResetToolsPanel';
import CreateGroupPanel from '@/components/league/admin/CreateGroupPanel';
import GroupEditorCard from '@/components/league/admin/GroupEditorCard';
import MoveTraineePanel from '@/components/league/admin/MoveTraineePanel';
import PlayerRow from '@/components/league/admin/PlayerRow';
import CaptainPanel from '@/components/league/admin/CaptainPanel';
import PointAdjustmentForm from '@/components/league/admin/PointAdjustmentForm';
import PointsBreakdownTable from '@/components/league/admin/PointsBreakdownTable';
import BlockedPlayersPanel from '@/components/league/admin/BlockedPlayersPanel';
import AnalyticsPanel from '@/components/league/admin/AnalyticsPanel';
import AdminLogTable from '@/components/league/admin/AdminLogTable';
import AdminConfirm from '@/components/league/admin/AdminConfirm';
import RewardAdminPanel from '@/components/league/rewards/RewardAdminPanel';

const nowIso = () => new Date().toISOString();

export default function CoachShapeLeagueControlCenter() {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const [confirmAction, setConfirmAction] = React.useState(null);

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const { data: seasons = [] } = useQuery({ queryKey: ['shapeLeagueSeasons'], queryFn: () => base44.entities.ShapeLeagueSeason.list('-created_date', 20) });
  const { data: groups = [] } = useQuery({ queryKey: ['shapeLeagueGroupsAdmin'], queryFn: () => base44.entities.ShapeLeagueGroup.list('-updated_date', 200) });
  const { data: trainees = [] } = useQuery({ queryKey: ['shapeLeagueTraineesAdmin'], queryFn: () => base44.entities.Trainee.list('-updated_date', 500) });
  const { data: dailyPoints = [] } = useQuery({ queryKey: ['shapeLeagueDailyPointsAdmin'], queryFn: () => base44.entities.UserPointsDaily.list('-date', 1000) });
  const { data: blocked = [] } = useQuery({ queryKey: ['shapeLeagueBlockedAdmin'], queryFn: () => base44.entities.ShapeLeagueBlockedPlayer.filter({ is_active: true }) });
  const { data: logs = [] } = useQuery({ queryKey: ['shapeLeagueAdminLogs'], queryFn: () => base44.entities.ShapeLeagueAdminLog.list('-timestamp', 200) });
  const { data: adjustments = [] } = useQuery({ queryKey: ['shapeLeagueAdjustments'], queryFn: () => base44.entities.ShapeLeaguePointAdjustment.list('-created_at', 200) });
  const { data: rewards = [] } = useQuery({ queryKey: ['leagueRewardsAdmin'], queryFn: () => base44.entities.LeagueReward.list('-updated_date', 200) });
  const { data: rewardClaims = [] } = useQuery({ queryKey: ['leagueRewardClaimsAdmin'], queryFn: () => base44.entities.LeagueRewardClaim.list('-claimed_at', 500) });

  const currentSeason = seasons.find((s) => ['active', 'paused', 'draft'].includes(s.status)) || seasons[0];
  const traineesById = React.useMemo(() => Object.fromEntries(trainees.map((t) => [t.id, t])), [trainees]);
  const groupsById = React.useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const activeBlockedIds = React.useMemo(() => new Set(blocked.map((b) => b.trainee_id)), [blocked]);
  const pointsByTrainee = React.useMemo(() => {
    const map = {};
    dailyPoints.forEach((p) => { map[p.trainee_id] = (map[p.trainee_id] || 0) + (p.total_points || 0); });
    adjustments.forEach((a) => { map[a.trainee_id] = (map[a.trainee_id] || 0) + (a.points_delta || 0); });
    return map;
  }, [dailyPoints, adjustments]);
  const groupByMember = React.useMemo(() => {
    const map = {};
    groups.forEach((g) => (g.members || []).forEach((id) => { map[id] = g; }));
    return map;
  }, [groups]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['shapeLeagueGroupsAdmin'] });
    queryClient.invalidateQueries({ queryKey: ['shapeLeagueAdminLogs'] });
    queryClient.invalidateQueries({ queryKey: ['shapeLeagueBlockedAdmin'] });
    queryClient.invalidateQueries({ queryKey: ['shapeLeagueDailyPointsAdmin'] });
    queryClient.invalidateQueries({ queryKey: ['shapeLeagueSeasons'] });
    queryClient.invalidateQueries({ queryKey: ['shapeLeagueAdjustments'] });
    queryClient.invalidateQueries({ queryKey: ['leagueRewardsAdmin'] });
    queryClient.invalidateQueries({ queryKey: ['leagueRewardClaimsAdmin'] });
  };

  const logAction = async (action_type, { traineeId, groupId, beforeState, afterState, reason } = {}) => {
    await base44.entities.ShapeLeagueAdminLog.create({
      action_type,
      coach_id: user?.id || 'unknown',
      coach_email: user?.email,
      target_trainee_id: traineeId,
      target_group_id: groupId,
      before_state: beforeState || null,
      after_state: afterState || null,
      reason: reason || '',
      timestamp: nowIso()
    });
  };

  const updateGroup = async (group, data, action = 'update_group', reason = '') => {
    const members = Array.from(new Set(data.members || group.members || [])).slice(0, group.max_members || 5);
    const next = { ...data, members };
    await base44.entities.ShapeLeagueGroup.update(group.id, next);
    await logAction(action, { groupId: group.id, beforeState: group, afterState: next, reason });
    invalidate();
  };

  const moveTrainee = async (trainee, targetGroupId) => {
    if (!trainee || activeBlockedIds.has(trainee.id)) return;
    const target = groupsById[targetGroupId];
    if (!target) return;
    const targetMembers = Array.from(new Set([...(target.members || []), trainee.id]));
    if (targetMembers.length > (target.max_members || 5)) return;
    const source = groupByMember[trainee.id];
    if (source && source.id !== target.id) {
      await base44.entities.ShapeLeagueGroup.update(source.id, { members: (source.members || []).filter((id) => id !== trainee.id) });
    }
    await base44.entities.ShapeLeagueGroup.update(target.id, { members: targetMembers });
    await logAction('move_trainee_between_groups', { traineeId: trainee.id, groupId: target.id, beforeState: { source }, afterState: { target, members: targetMembers }, reason: 'העברה ידנית' });
    invalidate();
  };

  const removeFromLeagueNow = async (trainee) => {
    const source = groupByMember[trainee.id];
    if (!source) return;
    await base44.entities.ShapeLeagueGroup.update(source.id, { members: (source.members || []).filter((id) => id !== trainee.id), captain_trainee_id: source.captain_trainee_id === trainee.id ? null : source.captain_trainee_id });
    await logAction('remove_trainee_from_league', { traineeId: trainee.id, groupId: source.id, beforeState: source, afterState: { removed: trainee.id }, reason: 'הסרה ידנית מהליגה' });
    invalidate();
  };

  const removeFromLeague = async (trainee) => setConfirmAction({
    title: 'הסרת שחקן מהליגה',
    description: `${trainee.full_name} יוסר/ת מהקבוצה הנוכחית בליגה.`,
    run: async () => removeFromLeagueNow(trainee)
  });

  const createSeason = async (form) => {
    const season = await base44.entities.ShapeLeagueSeason.create({ ...form, status: 'active', started_at: nowIso(), created_by_coach_id: user?.id, created_by_coach_email: user?.email });
    await logAction('start_new_season', { afterState: season, reason: form.season_name });
    invalidate();
  };

  const updateSeasonStatus = async (season, status) => {
    const execute = async () => {
      const stamp = status === 'active' ? 'started_at' : status === 'paused' ? 'paused_at' : status === 'ended' ? 'ended_at' : 'archived_at';
      const next = { status, [stamp]: nowIso() };
      await base44.entities.ShapeLeagueSeason.update(season.id, next);
      await logAction(`season_${status}`, { beforeState: season, afterState: next });
      invalidate();
    };

    if (['ended', 'archived'].includes(status)) {
      setConfirmAction({
        title: status === 'ended' ? 'סיום עונת ליגה' : 'ארכוב עונת ליגה',
        description: 'פעולה זו תשנה את מצב העונה ותירשם בלוג הפעולות.',
        run: execute
      });
      return;
    }

    await execute();
  };

  const createGroup = async ({ name, slogan }) => {
    const group = await base44.entities.ShapeLeagueGroup.create({ name, display_name: name, slogan, badge_icon: '🔥', members: [], max_members: 5, is_auto_group: false });
    await logAction('create_group', { groupId: group.id, afterState: group });
    invalidate();
  };

  const archiveGroup = async (group) => setConfirmAction({
    title: 'ארכוב קבוצה',
    description: `הקבוצה ${group.display_name || group.name} תתרוקן ותסומן כמאורכבת בשם שלה.`,
    run: async () => updateGroup(group, { members: [], display_name: `[ארכיון] ${group.display_name || group.name}` }, 'archive_group', 'ארכוב קבוצה')
  });

  const blockTrainee = async (trainee) => setConfirmAction({
    title: 'חסימת שחקן מהליגה',
    description: `${trainee.full_name} ייחסם/תחסם מהצטרפות לקבוצות ויוסר/ת מהליגה. הגישה הרגילה לאפליקציה לא תושפע.`,
    run: async () => {
      if (activeBlockedIds.has(trainee.id)) return;
      await removeFromLeagueNow(trainee);
      const record = await base44.entities.ShapeLeagueBlockedPlayer.create({ trainee_id: trainee.id, trainee_email: trainee.user_email, trainee_name: trainee.full_name, reason: 'חסימה ידנית', blocked_by_coach_id: user?.id, blocked_by_coach_email: user?.email, blocked_at: nowIso(), is_active: true });
      await logAction('block_trainee_from_league', { traineeId: trainee.id, afterState: record, reason: 'חסימה ידנית' });
      invalidate();
    }
  });

  const unblockTrainee = async (target) => {
    const item = target.trainee_id ? target : blocked.find((b) => b.trainee_id === target.id);
    if (!item) return;
    await base44.entities.ShapeLeagueBlockedPlayer.update(item.id, { is_active: false, unblocked_at: nowIso() });
    await logAction('unblock_trainee_from_league', { traineeId: item.trainee_id, beforeState: item, afterState: { is_active: false } });
    invalidate();
  };

  const resetTraineeData = async (trainee) => setConfirmAction({
    title: 'איפוס נתוני שחקן',
    description: `כל ניקוד הליגה היומי של ${trainee.full_name} יימחק.`,
    run: async () => {
      const rows = dailyPoints.filter((p) => p.trainee_id === trainee.id);
      await Promise.all(rows.map((p) => base44.entities.UserPointsDaily.delete(p.id)));
      await logAction('reset_trainee_league_data', { traineeId: trainee.id, beforeState: { rows }, reason: 'איפוס שחקן' });
      invalidate();
    }
  });

  const resetAction = (actionKey, label) => setConfirmAction({
    title: label,
    description: 'פעולת איפוס/ארכוב תשפיע על נתוני הליגה בלבד ותירשם בלוג.',
    run: async () => {
      await base44.entities.ShapeLeagueStandingArchive.create({ archive_type: actionKey === 'reset_group_rankings' ? 'group_rankings' : actionKey === 'reset_personal_rankings' ? 'personal_rankings' : 'full_month', season_id: currentSeason?.id, snapshot: { groups, dailyPoints }, created_by_coach_id: user?.id, created_by_coach_email: user?.email, created_at: nowIso() });
      if (['reset_personal_rankings', 'keep_groups_reset_points', 'reset_group_rankings'].includes(actionKey)) {
        await Promise.all(dailyPoints.map((p) => base44.entities.UserPointsDaily.delete(p.id)));
      }
      if (actionKey === 'reset_groups') {
        await Promise.all(groups.map((g) => base44.entities.ShapeLeagueGroup.update(g.id, { members: [], captain_trainee_id: null })));
      }
      await logAction(actionKey, { beforeState: { groups, dailyPoints }, reason: label });
      invalidate();
    }
  });

  const autoFillEmptySpots = async () => {
    const assigned = new Set(groups.flatMap((g) => g.members || []));
    const available = trainees.filter((t) => t.status !== 'deleted' && !assigned.has(t.id) && !activeBlockedIds.has(t.id));
    let index = 0;
    for (const group of groups) {
      const members = [...(group.members || [])];
      while (members.length < (group.max_members || 5) && index < available.length) members.push(available[index++].id);
      await base44.entities.ShapeLeagueGroup.update(group.id, { members: Array.from(new Set(members)) });
    }
    await logAction('auto_fill_empty_spots', { afterState: { filled: index } });
    invalidate();
  };

  const mergeWeakGroups = async () => setConfirmAction({
    title: 'מיזוג קבוצות חלשות',
    description: 'קבוצות קטנות ימוזגו וקבוצות המקור יתרוקנו.',
    run: async () => {
      const weak = groups.filter((g) => (g.members || []).length > 0 && (g.members || []).length <= 2);
      if (weak.length < 2) return;
      const target = weak[0];
      const combined = Array.from(new Set(weak.flatMap((g) => g.members || []))).slice(0, target.max_members || 5);
      await base44.entities.ShapeLeagueGroup.update(target.id, { members: combined });
      await Promise.all(weak.slice(1).map((g) => base44.entities.ShapeLeagueGroup.update(g.id, { members: [], display_name: `[מוזגה] ${g.display_name || g.name}` })));
      await logAction('merge_weak_groups', { groupId: target.id, beforeState: weak, afterState: { target, members: combined } });
      invalidate();
    }
  });

  const splitLargeGroups = async () => setConfirmAction({
    title: 'פיצול קבוצה גדולה',
    description: 'קבוצה עם יותר מ־5 חברים תפוצל לקבוצה נוספת.',
    run: async () => {
      const large = groups.find((g) => (g.members || []).length > 5);
      if (!large) return;
      const extra = (large.members || []).slice(5);
      await base44.entities.ShapeLeagueGroup.update(large.id, { members: (large.members || []).slice(0, 5) });
      const group = await base44.entities.ShapeLeagueGroup.create({ name: `${large.name} ב`, display_name: `${large.display_name || large.name} ב`, badge_icon: large.badge_icon || '🔥', members: extra.slice(0, 5), max_members: 5, is_auto_group: false });
      await logAction('split_large_group', { groupId: large.id, beforeState: large, afterState: group });
      invalidate();
    }
  });

  const assignCaptain = async (group, trainee) => updateGroup(group, { captain_trainee_id: trainee.id }, 'assign_captain', `קפטן: ${trainee.full_name}`);
  const removeCaptain = async (group) => updateGroup(group, { captain_trainee_id: null }, 'remove_captain', 'הסרת קפטן');
  const autoAssignCaptain = async (group) => {
    const bestId = [...(group.members || [])].sort((a, b) => (pointsByTrainee[b] || 0) - (pointsByTrainee[a] || 0))[0];
    if (bestId) await assignCaptain(group, traineesById[bestId]);
  };

  const adjustPoints = async ({ traineeId, pointsDelta, reason }) => {
    const trainee = traineesById[traineeId];
    const row = await base44.entities.ShapeLeaguePointAdjustment.create({ trainee_id: traineeId, trainee_email: trainee?.user_email, points_delta: pointsDelta, reason, coach_id: user?.id, coach_email: user?.email, created_at: nowIso() });
    await logAction('manual_points_adjustment', { traineeId, afterState: row, reason });
    invalidate();
  };

  const createReward = async (data) => {
    const reward = await base44.entities.LeagueReward.create(data);
    await logAction('create_league_reward', { afterState: reward, reason: data.title });
    invalidate();
  };

  const updateReward = async (reward, data) => {
    await base44.entities.LeagueReward.update(reward.id, data);
    await logAction('update_league_reward', { beforeState: reward, afterState: data, reason: data.title });
    invalidate();
  };

  const updateRewardClaim = async (claim, status) => {
    const data = { status, managed_by_coach_email: user?.email };
    if (status === 'redeemed') data.redeemed_at = nowIso();
    if (status === 'cancelled') data.cancelled_at = nowIso();
    await base44.entities.LeagueRewardClaim.update(claim.id, data);
    await logAction(`reward_claim_${status}`, { beforeState: claim, afterState: data, reason: claim.reward_title });
    invalidate();
  };

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const activeLeagueTrainees = trainees.filter((t) => !activeBlockedIds.has(t.id));
  const topTrainees = activeLeagueTrainees.map((t) => ({ id: t.id, name: t.full_name, points: pointsByTrainee[t.id] || 0 })).sort((a, b) => b.points - a.points).slice(0, 10);
  const topGroups = groups.map((g) => ({ id: g.id, name: g.display_name || g.name, points: (g.members || []).reduce((sum, id) => sum + (pointsByTrainee[id] || 0), 0) })).sort((a, b) => b.points - a.points).slice(0, 10);
  const inactivePlayers = activeLeagueTrainees.filter((t) => !dailyPoints.some((p) => p.trainee_id === t.id && p.date >= weekAgo)).slice(0, 20);
  const stats = {
    activeUsers: activeLeagueTrainees.length,
    activeToday: new Set(dailyPoints.filter((p) => p.date === today).map((p) => p.trainee_id)).size,
    activeWeek: new Set(dailyPoints.filter((p) => p.date >= weekAgo).map((p) => p.trainee_id)).size,
    totalGroups: groups.length,
    averagePoints: activeLeagueTrainees.length ? Math.round(Object.values(pointsByTrainee).reduce((a, b) => a + b, 0) / activeLeagueTrainees.length) : 0,
    mostActiveGroup: topGroups[0]?.name,
    mostImproved: topTrainees[0]?.name
  };
  const filteredTrainees = activeLeagueTrainees.filter((t) => `${t.full_name} ${t.user_email}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="bg-gradient-to-l from-slate-900 to-teal-900 rounded-3xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-3"><Trophy className="w-8 h-8 text-amber-300" /><div><h1 className="text-2xl md:text-3xl font-bold">ניהול Shape League</h1><p className="text-teal-100">מרכז שליטה למאמן — מצב בטוח עם לוג מלא לכל פעולה</p></div></div>
        </div>

        <Tabs defaultValue="season" className="space-y-4">
          <TabsList className="w-full h-auto flex flex-wrap justify-start bg-white border rounded-2xl p-2">
            <TabsTrigger value="season">עונת ליגה</TabsTrigger><TabsTrigger value="groups">קבוצות</TabsTrigger><TabsTrigger value="players">שחקנים</TabsTrigger><TabsTrigger value="captains">קפטנים</TabsTrigger><TabsTrigger value="points">ניקוד</TabsTrigger><TabsTrigger value="rewards">🎁 פרסים</TabsTrigger><TabsTrigger value="blocked">חסומים</TabsTrigger><TabsTrigger value="analytics">אנליטיקה</TabsTrigger><TabsTrigger value="logs">לוג פעולות</TabsTrigger>
          </TabsList>

          <TabsContent value="season" className="space-y-4"><SeasonControlCard season={currentSeason} onCreate={createSeason} onUpdateStatus={updateSeasonStatus} /><ResetToolsPanel onAction={resetAction} /></TabsContent>
          <TabsContent value="groups" className="space-y-4">
            <CreateGroupPanel onCreate={createGroup} />
            <MoveTraineePanel trainees={activeLeagueTrainees} groups={groups} onMove={moveTrainee} />
            <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={autoFillEmptySpots}><Plus className="w-4 h-4 ml-1" />מלא מקומות פנויים</Button><Button variant="outline" onClick={mergeWeakGroups}>מזג קבוצות חלשות</Button><Button variant="outline" onClick={splitLargeGroups}>פצל קבוצות גדולות</Button></div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{groups.map((group) => <GroupEditorCard key={group.id} group={group} members={(group.members || []).map((id) => traineesById[id]).filter(Boolean)} onSave={(g, data) => updateGroup(g, data)} onArchive={archiveGroup} onRemoveMember={(g, t) => removeFromLeague(t)} onMakeCaptain={assignCaptain} onRemoveCaptain={removeCaptain} />)}</div>
          </TabsContent>
          <TabsContent value="players" className="space-y-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש מתאמן..." className="bg-white" />
            {filteredTrainees.map((t) => <PlayerRow key={t.id} trainee={t} group={groupByMember[t.id]} groups={groups} blocked={activeBlockedIds.has(t.id)} points={pointsByTrainee[t.id] || 0} onMove={moveTrainee} onRemove={removeFromLeague} onBlock={blockTrainee} onUnblock={unblockTrainee} onReset={resetTraineeData} />)}
          </TabsContent>
          <TabsContent value="captains"><CaptainPanel groups={groups} traineesById={traineesById} pointsByTrainee={pointsByTrainee} onAutoAssign={autoAssignCaptain} onRemoveCaptain={removeCaptain} /></TabsContent>
          <TabsContent value="points" className="space-y-4"><PointAdjustmentForm trainees={activeLeagueTrainees} onSubmit={adjustPoints} /><PointsBreakdownTable rows={dailyPoints} traineesById={traineesById} /></TabsContent>
          <TabsContent value="rewards"><RewardAdminPanel rewards={rewards} claims={rewardClaims} userEmail={user?.email} onCreate={createReward} onUpdate={updateReward} onUpdateClaim={updateRewardClaim} /></TabsContent>
          <TabsContent value="blocked"><BlockedPlayersPanel blockedPlayers={blocked} onUnblock={unblockTrainee} /></TabsContent>
          <TabsContent value="analytics"><AnalyticsPanel stats={stats} topTrainees={topTrainees} topGroups={topGroups} inactivePlayers={inactivePlayers} blockedPlayers={blocked} /></TabsContent>
          <TabsContent value="logs"><AdminLogTable logs={logs} traineesById={traineesById} groupsById={groupsById} /></TabsContent>
        </Tabs>
      </div>
      <AdminConfirm open={!!confirmAction} title={confirmAction?.title} description={confirmAction?.description} onCancel={() => setConfirmAction(null)} onConfirm={async () => { const action = confirmAction; setConfirmAction(null); await action.run(); }} />
    </div>
  );
}