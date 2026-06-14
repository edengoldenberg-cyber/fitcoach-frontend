import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { Trophy, Star, Flame, Dumbbell, Droplets, Utensils, Medal, TrendingUp, Users, BookOpen, Crown, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { startupTrace } from '@/components/shared/StartupTraceOverlay';
import MotivationCards from '@/components/league/MotivationCards';
import StreakBadge from '@/components/league/StreakBadge';
import ShapeLeagueLiveMissionCard from '@/components/league/ShapeLeagueLiveMissionCard';
import ShapeLeagueLiveFeed from '@/components/league/ShapeLeagueLiveFeed';
import ShapeLeagueProgressBars from '@/components/league/ShapeLeagueProgressBars';
import ShapeLeagueDailyResetCard from '@/components/league/ShapeLeagueDailyResetCard';
import LeagueVictoryOverlay, { useVictoryEffect } from '@/components/league/LeagueVictoryEffect';
import RivalCard from '@/components/league/RivalCard';
import PrestigeProfile from '@/components/league/PrestigeProfile';
import SocialPressureCards from '@/components/league/SocialPressureCards';
import ReturnHooks from '@/components/league/ReturnHooks';
import ShapeLeagueWelcomeFlow from '@/components/league/ShapeLeagueWelcomeFlow';
import LeagueSocialProof from '@/components/league/LeagueSocialProof';
import LeagueEmptyState from '@/components/league/LeagueEmptyState';
import ShapeLeagueSafeSection from '@/components/league/ShapeLeagueSafeSection';
import ShapeLeagueActivityLogger from '@/components/league/ShapeLeagueActivityLogger';
import ShapeLeagueDailyMissionCard from '@/components/league/ShapeLeagueDailyMissionCard';
import ShapeLeagueActivityFeed from '@/components/league/ShapeLeagueActivityFeed';
import ShapeLeagueGroupMissions from '@/components/league/ShapeLeagueGroupMissions';
import ShapeLeagueWeeklyEvent from '@/components/league/ShapeLeagueWeeklyEvent';

class ShapeLeagueErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { crashed: false, error: null }; }
  static getDerivedStateFromError(e) { return { crashed: true, error: e }; }
  componentDidCatch(e) {
    startupTrace.error('shape_league_loaded', 'crashed: ' + e.message);
  }
  render() {
    if (this.state.crashed) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6" dir="rtl">
          <div className="text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-slate-300 text-sm mb-2">Shape League נתקלה בשגיאה</p>
            <p className="text-slate-500 text-xs mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => this.setState({ crashed: false })}
              className="bg-teal-500 text-white px-4 py-2 rounded-lg text-sm"
            >נסה שוב</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ShapeLeagueHomeInner() {
  const queryClient = useQueryClient();
  const assignAttempted = useRef(false);
  const [showWelcome, setShowWelcome] = useState(
    !localStorage.getItem('league_onboarding_done')
  );

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

  // Find my group — now trainee is defined
  const { data: myGroup, isLoading: loadingGroup, refetch: refetchGroup } = useQuery({
    queryKey: ['myLeagueGroup', trainee?.id],
    queryFn: async () => {
      const allGroups = await base44.entities.ShapeLeagueGroup.list();
      return allGroups.find(g => Array.isArray(g.members) && g.members.includes(trainee.id)) || null;
    },
    enabled: !!trainee?.id,
  });

  // If user already has a group, mark onboarding as done and skip welcome
  React.useEffect(() => {
    if (myGroup) {
      localStorage.setItem('league_onboarding_done', '1');
      setShowWelcome(false);
    }
  }, [myGroup]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');
  // eslint-disable-next-line no-unused-vars
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');

  const { data: todayPoints, isLoading: loadingToday } = useQuery({
    queryKey: ['pointsToday', trainee?.id, today],
    queryFn: async () => {
      const records = await base44.entities.UserPointsDaily.filter({ trainee_id: trainee.id, date: today });
      return records
        .sort((a, b) => (b.total_points || 0) - (a.total_points || 0) || new Date(b.updated_date || b.created_date || 0) - new Date(a.updated_date || a.created_date || 0))[0] || null;
    },
    enabled: !!trainee?.id,
  });

  const { data: weekPoints, isLoading: loadingWeek } = useQuery({
    queryKey: ['pointsWeek', trainee?.id, weekStart],
    queryFn: async () => {
      const records = await base44.entities.UserPointsDaily.filter({ trainee_id: trainee.id });
      return records.filter(r => r.date >= weekStart && r.date <= weekEnd);
    },
    enabled: !!trainee?.id,
  });

  const { data: rankingData, isLoading: loadingRanking } = useQuery({
    queryKey: ['weeklyRanking', weekStart],
    queryFn: async () => {
      const res = await base44.functions.invoke('calculateWeeklyRanking', {});
      return res.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch group member names — one filter per member instead of listing all trainees
  const { data: groupMemberTrainees } = useQuery({
    queryKey: ['groupMembers', myGroup?.id],
    queryFn: async () => {
      if (!myGroup?.members?.length) return [];
      const results = await Promise.all(
        myGroup.members.map(id => base44.entities.Trainee.filter({ id }))
      );
      return results.flat();
    },
    enabled: !!myGroup?.id,
  });

  // Fetch weekly points for group members — one filter per member (3-5 requests)
  // instead of listing all UserPointsDaily records system-wide
  const { data: groupWeeklyPoints } = useQuery({
    queryKey: ['groupWeeklyPoints', myGroup?.id, weekStart],
    queryFn: async () => {
      if (!myGroup?.members?.length) return [];
      const memberPointsArrays = await Promise.all(
        myGroup.members.map(id => base44.entities.UserPointsDaily.filter({ trainee_id: id }))
      );
      const weekRecords = memberPointsArrays.flat().filter(
        r => r.date >= weekStart && r.date <= weekEnd
      );
      const byMember = {};
      for (const r of weekRecords) {
        byMember[r.trainee_id] = (byMember[r.trainee_id] || 0) + (r.total_points || 0);
      }
      return myGroup.members.map(tid => ({
        trainee_id: tid,
        total_points: byMember[tid] || 0,
      })).sort((a, b) => b.total_points - a.total_points);
    },
    enabled: !!myGroup?.id,
  });

  // Trace shape league loaded
  useEffect(() => {
    if (!loadingToday && !loadingWeek) {
      startupTrace.ok('shape_league_loaded', 'points loaded');
    }
  }, [loadingToday, loadingWeek]);

  useEffect(() => {
    if (!loadingRanking) {
      startupTrace.ok('rankings_loaded', `${rankingData?.ranking?.length || 0} entries`);
    }
  }, [loadingRanking]);

  // === REMOVED: Auto-assign silently ===
  // Users must NOW explicitly choose how to participate (create, join by code, or auto-assign)
  // This is handled by LeagueEmptyState component
  useEffect(() => {
    if (!loadingGroup) {
      const status = myGroup ? `group: ${myGroup.id}` : 'awaiting user choice';
      startupTrace.ok('group_assignment_checked', status);
    }
  }, [loadingGroup, myGroup]);

  const weekTotal = weekPoints?.reduce((sum, r) => sum + (r.total_points || 0), 0) || 0;
  const tp = todayPoints;

  const myRank = rankingData?.ranking?.find(r => r.trainee_id === trainee?.id);
  const myRankIndex = rankingData?.ranking?.findIndex(r => r.trainee_id === trainee?.id);
  const personAbove = myRankIndex > 0 ? rankingData?.ranking[myRankIndex - 1] : null;
  const pointsNeeded = personAbove ? personAbove.total_points - (myRank?.total_points || 0) : 0;
  const top5 = rankingData?.ranking?.slice(0, 5) || [];

  // Streak + achievements data
  const { data: leagueMyData } = useQuery({
    queryKey: ['leagueMyData', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('leagueStreakAndAchievements', { action: 'get_my_data' });
      return res.data;
    },
    enabled: !!user?.email,
    staleTime: 1000 * 60 * 5,
  });

  // Fire streak update in background
  useEffect(() => {
    if (!trainee?.id) return;
    base44.functions.invoke('leagueStreakAndAchievements', { action: 'update_streak' }).catch(() => {});
  }, [trainee?.id]);

  // All trainees for live feed
  const { data: allTrainees } = useQuery({
    queryKey: ['allTraineesForFeed'],
    queryFn: () => base44.entities.Trainee.list(),
    staleTime: 1000 * 60 * 10,
  });

  // All points this week for live feed
  const { data: allWeekPoints } = useQuery({
    queryKey: ['allWeekPoints', weekStart],
    queryFn: async () => {
      const all = await base44.entities.UserPointsDaily.list();
      return all.filter(r => r.date >= weekStart && r.date <= weekEnd);
    },
    staleTime: 1000 * 60 * 5,
  });

  // All achievements this week for live feed
  const { data: allWeekAchievements } = useQuery({
    queryKey: ['allWeekAchievements', weekStart],
    queryFn: async () => {
      const all = await base44.entities.ShapeLeagueAchievement.list('-unlocked_at', 50);
      return all.filter(a => a.unlocked_at && a.unlocked_at >= weekStart);
    },
    staleTime: 1000 * 60 * 5,
  });

  // Victory effect
  const { showGlow, message, fire: fireVictory } = useVictoryEffect();

  // Group weekly ranking
  const { data: groupRankingData, isLoading: loadingGroupRanking } = useQuery({
    queryKey: ['groupWeeklyRanking', weekStart],
    queryFn: async () => {
      const res = await base44.functions.invoke('calculateGroupWeeklyRanking', {});
      return res.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const myGroupRankEntry = groupRankingData?.ranking?.find(g => g.group_id === myGroup?.id);
  const myGroupRankIndex = groupRankingData?.ranking?.findIndex(g => g.group_id === myGroup?.id);
  const groupAbove = myGroupRankIndex > 0 ? groupRankingData?.ranking[myGroupRankIndex - 1] : null;
  const groupPointsNeeded = groupAbove
    ? groupAbove.group_average_points - (myGroupRankEntry?.group_average_points || 0)
    : 0;
  const top5Groups = groupRankingData?.ranking?.slice(0, 5) || [];

  // My rank inside group
  const myGroupRank = groupWeeklyPoints?.findIndex(r => r.trainee_id === trainee?.id);
  const getMemberName = (tid) => {
    const t = groupMemberTrainees?.find(m => m.id === tid);
    return t?.full_name || t?.user_email || 'מתאמן';
  };

  const rankMedal = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  // === STATE GATE: Show welcome flow for first-time users (before any group selection) ===
  if (showWelcome && trainee) {
    return (
      <ShapeLeagueWelcomeFlow
        trainee={trainee}
        onComplete={() => {
          localStorage.setItem('league_onboarding_done', '1');
          setShowWelcome(false);
          queryClient.invalidateQueries({ queryKey: ['myLeagueGroup', trainee?.id] });
        }}
        onAutoAssign={() => {
          queryClient.invalidateQueries({ queryKey: ['myLeagueGroup', trainee?.id] });
        }}
      />
    );
  }

  // === STATE GATE: If no group yet, show empty state with options (don't auto-assign silently) ===
  if (!loadingGroup && !myGroup && trainee && localStorage.getItem('league_onboarding_done')) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 pb-24" dir="rtl">
        <div className="px-4 pt-8 pb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Trophy className="w-8 h-8 text-yellow-400" />
            <h1 className="text-3xl font-bold text-white">Shape League</h1>
            <Trophy className="w-8 h-8 text-yellow-400" />
          </div>
          <p className="text-slate-400 text-sm">צא לתחרות עם הקבוצה שלך</p>
        </div>
        <div className="px-4 max-w-lg mx-auto">
          <LeagueEmptyState trainee={trainee} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 pb-24" dir="rtl">
      {/* Header */}
      <div className="px-4 pt-8 pb-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Trophy className="w-8 h-8 text-yellow-400" />
          <h1 className="text-3xl font-bold text-white">Shape League</h1>
          <Trophy className="w-8 h-8 text-yellow-400" />
        </div>
        <p className="text-slate-400 text-sm">מערכת הליגה של Shape</p>
        
        {/* CTA Buttons for group management */}
        <div className="flex gap-2 mt-4 justify-center flex-wrap">
          <Link to="/ShapeLeagueCreateGroup" className="inline-flex items-center gap-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 text-sm font-medium px-4 py-2 rounded-xl transition-colors border border-green-500/40 min-h-0 min-w-0">
            ➕ צור קבוצה
          </Link>
          <button className="inline-flex items-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-sm font-medium px-4 py-2 rounded-xl transition-colors border border-blue-500/40 min-h-0 min-w-0">
            🎟️ קוד הזמנה
          </button>
        </div>

        <div className="flex gap-2 mt-3 justify-center flex-wrap">
          <Link to="/ShapeLeagueRules" className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors border border-slate-600 min-h-0 min-w-0">
            <BookOpen className="w-4 h-4 text-yellow-400" />
            📜 חוקי הליגה
          </Link>
          <Link to="/ShapeLeagueRewards" className="inline-flex items-center gap-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-sm font-medium px-4 py-2 rounded-xl transition-colors border border-yellow-500/40 min-h-0 min-w-0">
            🏆 פרסים
          </Link>
          <Link to="/ShapeLeagueTable" className="inline-flex items-center gap-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-sm font-medium px-4 py-2 rounded-xl transition-colors border border-purple-500/40 min-h-0 min-w-0">
            📊 טבלת ליגה
          </Link>
          <Link to="/ShapeLeagueAchievements" className="inline-flex items-center gap-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-sm font-medium px-4 py-2 rounded-xl transition-colors border border-yellow-500/40 min-h-0 min-w-0">
            🏅 הישגים
          </Link>
        </div>
      </div>

      <LeagueVictoryOverlay showGlow={showGlow} message={message} />

      <div className="px-4 space-y-4 max-w-lg mx-auto">
        {/* Weekly Event */}
        <ShapeLeagueSafeSection name="WeeklyEvent">
          <ShapeLeagueWeeklyEvent />
        </ShapeLeagueSafeSection>

        {/* Daily Mission */}
        <ShapeLeagueSafeSection name="DailyMission">
          <ShapeLeagueDailyMissionCard trainee={trainee} />
        </ShapeLeagueSafeSection>

        {/* Activity Logger */}
        <ShapeLeagueSafeSection name="ActivityLogger">
          <ShapeLeagueActivityLogger trainee={trainee} />
        </ShapeLeagueSafeSection>

        {/* Live Social Proof */}
        <LeagueSocialProof />

        {/* Live Mission Card — top priority */}
        <ShapeLeagueLiveMissionCard
          loading={loadingToday || loadingRanking}
          todayPoints={todayPoints}
          weekTotal={weekTotal}
          myRank={myRank}
          personAbove={personAbove}
          leagueStreak={leagueMyData?.streak}
          myGroupRankEntry={myGroupRankEntry}
          groupAbove={groupAbove}
        />

        {/* Daily Reset Card */}
        <ShapeLeagueDailyResetCard
          todayPoints={todayPoints}
          myRank={myRank}
          myGroupRankEntry={myGroupRankEntry}
          leagueStreak={leagueMyData?.streak}
        />

        {/* Motivation Cards */}
        <MotivationCards
          loading={loadingToday || loadingRanking}
          todayPoints={todayPoints}
          weekTotal={weekTotal}
          myRank={myRank}
          personAbove={personAbove}
          rankingData={rankingData}
          groupWeeklyPoints={groupWeeklyPoints}
          traineeId={trainee?.id}
          groupMemberTrainees={groupMemberTrainees}
          myGroupRankEntry={myGroupRankEntry}
          groupAbove={groupAbove}
        />

        {/* Prestige Profile */}
        {trainee && <PrestigeProfile
          trainee={trainee}
          weekTotal={weekTotal}
          streak={leagueMyData?.streak}
          achievements={leagueMyData?.achievements}
          myRank={myRank}
        />}

        {/* Rival Card */}
        {trainee?.id && <RivalCard
          traineeId={trainee.id}
          rankingData={rankingData}
          leagueStreak={leagueMyData?.streak}
          loading={loadingRanking}
        />}

        {/* Social Pressure Cards */}
        {trainee?.id && <SocialPressureCards
          myGroup={myGroup}
          groupMemberTrainees={groupMemberTrainees}
          groupWeeklyPoints={groupWeeklyPoints}
          traineeId={trainee.id}
          myRank={myRank}
          personAbove={personAbove}
          groupRankingData={groupRankingData}
          myGroupRankEntry={myGroupRankEntry}
          groupAbove={groupAbove}
          today={today}
          weeklyData={allWeekPoints}
          loading={loadingToday || loadingRanking}
        />}

        {/* Return Hooks */}
        {trainee?.id && <ReturnHooks
          traineeId={trainee.id}
          leagueStreak={leagueMyData?.streak}
          myRank={myRank}
          personAbove={personAbove}
          myGroupRankEntry={myGroupRankEntry}
          groupAbove={groupAbove}
          todayPoints={todayPoints}
          weekTotal={weekTotal}
          loading={loadingToday}
        />}

        {/* Streak Badge */}
        <StreakBadge streak={leagueMyData?.streak} loading={!leagueMyData} />

        {/* Achievements quick link */}
        <Link to="/ShapeLeagueAchievements" className="flex items-center justify-between bg-slate-800 border border-slate-700 hover:border-yellow-500/50 rounded-2xl px-5 py-3.5 transition-all min-h-0 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏅</span>
            <div>
              <div className="text-white font-semibold text-sm">הישגים</div>
              <div className="text-slate-400 text-xs">
                {leagueMyData?.achievements?.length || 0} הישגים נפתחו
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </Link>

        {/* Today's Points */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-5 h-5 text-orange-400" />
            <h2 className="text-white font-semibold text-lg">הנקודות שלך היום</h2>
          </div>
          {loadingToday ? <Spinner /> : (
            <>
              <div className="text-center mb-4">
                <span className="text-5xl font-bold text-yellow-400">{tp?.total_points || 0}</span>
                <span className="text-slate-400 text-sm mr-2">נקודות</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <PointBadge icon={<Dumbbell className="w-4 h-4" />} label="אימון" value={tp?.workout_points || 0} color="text-teal-400" />
                <PointBadge icon={<Utensils className="w-4 h-4" />} label="תזונה" value={tp?.meal_points || 0} color="text-green-400" />
                <PointBadge icon={<Droplets className="w-4 h-4" />} label="מים" value={tp?.water_points || 0} color="text-blue-400" />
              </div>
              {tp?.bonus_points > 0 && (
                <div className="mt-3 text-center bg-yellow-400/10 rounded-xl py-2">
                  <span className="text-yellow-400 font-semibold text-sm">⭐ בונוס יום מושלם: +{tp.bonus_points}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Weekly Points */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 text-purple-400" />
            <h2 className="text-white font-semibold text-lg">הנקודות השבועיות שלך</h2>
          </div>
          {loadingWeek ? <Spinner /> : (
            <>
              <div className="text-center mb-4">
                <span className="text-5xl font-bold text-purple-400">{weekTotal}</span>
                <span className="text-slate-400 text-sm mr-2">נקודות השבוע</span>
              </div>
              {weekPoints && weekPoints.length > 0 && (
                <div className="space-y-1">
                  {weekPoints.sort((a, b) => b.date.localeCompare(a.date)).map(r => (
                    <div key={r.id} className="flex justify-between items-center py-1.5 border-b border-slate-700 last:border-0">
                      <span className="text-slate-400 text-sm">{r.date}</span>
                      <span className="text-white font-semibold">{r.total_points} נק'</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* My Group */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-teal-400" />
            <h2 className="text-white font-semibold text-lg">👥 הקבוצה שלך</h2>
          </div>

          {loadingGroup ? <Spinner /> : !myGroup ? (
            <LeagueEmptyState trainee={trainee} />
          ) : (
            <>
              {/* Clickable group header */}
              <Link to={`/ShapeLeagueGroupProfile?groupId=${myGroup.id}`} className="flex items-center gap-3 bg-slate-700/60 rounded-xl px-4 py-3 mb-4 hover:bg-slate-700 transition-colors min-h-0 min-w-0">
                <span className="text-3xl">{myGroup.badge_icon || '🔥'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-teal-300 font-bold truncate">{myGroup.display_name || myGroup.name}</div>
                  <div className="text-slate-500 text-xs">{myGroup.members?.length || 0} חברים</div>
                </div>
                {myGroup.captain_trainee_id === trainee?.id && (
                  <Crown className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                )}
                <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
              </Link>

              {/* Members list */}
              <div className="space-y-2 mb-4">
                {myGroup.members?.map((tid, idx) => {
                  const isMe = tid === trainee?.id;
                  const name = getMemberName(tid);
                  return (
                    <div key={tid} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${isMe ? 'bg-teal-400/15 border border-teal-400/40' : 'bg-slate-700/50'}`}>
                      <span className="text-slate-400 text-sm w-5">{idx + 1}.</span>
                      <span className={`text-sm font-medium flex-1 ${isMe ? 'text-teal-300' : 'text-white'}`}>
                        {isMe ? `${name} (את/ה)` : name}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Group Internal Ranking */}
              <div className="border-t border-slate-700 pt-3">
                <div className="text-slate-400 text-xs font-semibold uppercase mb-2">📊 דירוג בתוך הקבוצה</div>
                {groupWeeklyPoints && groupWeeklyPoints.length > 0 ? (
                  <div className="space-y-2">
                    {groupWeeklyPoints.map((entry, idx) => {
                      const isMe = entry.trainee_id === trainee?.id;
                      return (
                        <div key={entry.trainee_id} className={`flex items-center justify-between px-3 py-2 rounded-xl ${isMe ? 'bg-yellow-400/15 border border-yellow-400/30' : 'bg-slate-700/40'}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-base">{rankMedal(idx + 1)}</span>
                            <span className={`text-sm ${isMe ? 'text-yellow-300 font-semibold' : 'text-white'}`}>
                              {isMe ? 'את/ה' : getMemberName(entry.trainee_id)}
                            </span>
                          </div>
                          <span className={`font-bold text-sm ${isMe ? 'text-yellow-400' : 'text-purple-400'}`}>
                            {entry.total_points} נק'
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs text-center py-2">אין נקודות עדיין השבוע</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Progress Bars */}
        <ShapeLeagueProgressBars
          todayPoints={todayPoints}
          weekTotal={weekTotal}
          myRank={myRank}
          leagueStreak={leagueMyData?.streak}
          loading={loadingToday}
        />

        {/* Group Missions */}
        {myGroup && <ShapeLeagueSafeSection name="GroupMissions">
          <ShapeLeagueGroupMissions myGroup={myGroup} groupMemberTrainees={groupMemberTrainees} />
        </ShapeLeagueSafeSection>}

        {/* Activity Feed */}
        <ShapeLeagueSafeSection name="ActivityFeed">
          <ShapeLeagueActivityFeed />
        </ShapeLeagueSafeSection>

        {/* Live Feed */}
        <ShapeLeagueLiveFeed
          allPoints={allWeekPoints}
          allTrainees={allTrainees}
          allAchievements={allWeekAchievements}
          weekStart={weekStart}
          weekEnd={weekEnd}
          loading={!allWeekPoints}
        />

        {/* Global Weekly Ranking */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Medal className="w-5 h-5 text-yellow-400" />
            <h2 className="text-white font-semibold text-lg">🏆 הדירוג השבועי שלך</h2>
          </div>

          {loadingRanking ? <Spinner /> : (
            <>
              {myRank ? (
                <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-4 mb-4 text-center">
                  <div className="text-yellow-400 text-4xl font-bold mb-1">{rankMedal(myRank.rank)}</div>
                  <div className="text-white text-sm">המקום שלך השבוע</div>
                  <div className="text-purple-400 font-bold mt-1">{myRank.total_points} נקודות</div>
                  {personAbove && pointsNeeded > 0 && (
                    <div className="mt-2 text-xs text-slate-300 flex items-center justify-center gap-1">
                      <TrendingUp className="w-3 h-3 text-green-400" />
                      עוד <span className="text-green-400 font-bold mx-1">{pointsNeeded}</span> נקודות ואתה עוקף את מקום {myRank.rank - 1}
                    </div>
                  )}
                  {myRank.rank === 1 && (
                    <div className="mt-2 text-xs text-yellow-300">👑 אתה במקום הראשון! המשך כך!</div>
                  )}
                </div>
              ) : (
                <div className="text-center text-slate-400 text-sm mb-4 py-3">
                  אין לך נקודות השבוע עדיין — התחל לאמן! 💪
                </div>
              )}

              {top5.filter(e => e.total_points > 0).length > 0 ? (
                <div>
                  <div className="text-slate-400 text-xs mb-2 font-semibold uppercase">TOP 5 השבוע</div>
                  <div className="space-y-2">
                    {top5.filter(e => e.total_points > 0).map(entry => {
                      const isMe = entry.trainee_id === trainee?.id;
                      return (
                        <div key={entry.trainee_id} className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${isMe ? 'bg-yellow-400/15 border border-yellow-400/40' : 'bg-slate-700/50'}`}>
                          <div className="flex items-center gap-3">
                            <span className="text-lg w-8 text-center">{rankMedal(entry.rank)}</span>
                            <span className={`text-sm font-medium ${isMe ? 'text-yellow-300' : 'text-white'}`}>
                              {isMe ? 'את/ה' : entry.trainee_name}
                            </span>
                          </div>
                          <div>
                            <span className={`font-bold text-sm ${isMe ? 'text-yellow-400' : 'text-purple-400'}`}>{entry.total_points}</span>
                            <span className="text-slate-500 text-xs mr-1">נק'</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 space-y-1">
                  <div className="text-2xl">🚀</div>
                  <p className="text-slate-400 text-sm">הליגה מתחממת…</p>
                  <p className="text-slate-500 text-xs">הדירוג יתעדכן אחרי הפעילות הראשונה</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Group Leaderboard */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-orange-400" />
            <h2 className="text-white font-semibold text-lg">🏆 דירוג קבוצות</h2>
          </div>

          {loadingGroupRanking ? <Spinner /> : (
            <>
              {myGroupRankEntry ? (
                <div className="bg-orange-400/10 border border-orange-400/30 rounded-xl p-4 mb-4 text-center">
                  <div className="text-orange-400 text-4xl font-bold mb-1">{rankMedal(myGroupRankEntry.rank)}</div>
                  <div className="text-teal-300 font-semibold">{myGroupRankEntry.group_name}</div>
                  <div className="text-slate-400 text-xs mt-1">ממוצע שבועי</div>
                  <div className="text-orange-400 font-bold text-2xl">{myGroupRankEntry.group_average_points} נק'</div>
                  <div className="text-slate-500 text-xs mt-1">
                    {myGroupRankEntry.active_members} פעילים מתוך {myGroupRankEntry.member_count} חברים
                  </div>
                  {groupAbove && groupPointsNeeded > 0 && (
                    <div className="mt-2 text-xs text-slate-300 flex items-center justify-center gap-1">
                      <TrendingUp className="w-3 h-3 text-green-400" />
                      עוד <span className="text-green-400 font-bold mx-1">{groupPointsNeeded}</span> נק' ממוצע ואתם עוקפים את {groupAbove.group_name}
                    </div>
                  )}
                  {myGroupRankEntry.rank === 1 && (
                    <div className="mt-2 text-xs text-yellow-300">👑 הקבוצה שלכם במקום הראשון!</div>
                  )}
                </div>
              ) : myGroup ? (
                <div className="text-center text-slate-400 text-sm mb-4 py-3">הקבוצה שלך טרם נכנסה לדירוג</div>
              ) : null}

              {top5Groups.length > 0 && (
                <div>
                  <div className="text-slate-400 text-xs mb-2 font-semibold uppercase">TOP 5 קבוצות</div>
                  <div className="space-y-2">
                    {top5Groups.map(group => {
                      const isMyGroup = group.group_id === myGroup?.id;
                      return (
                        <div key={group.group_id} className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${isMyGroup ? 'bg-orange-400/15 border border-orange-400/40' : 'bg-slate-700/50'}`}>
                          <div className="flex items-center gap-3">
                            <span className="text-lg w-8 text-center">{rankMedal(group.rank)}</span>
                            <div>
                              <span className={`text-sm font-medium block ${isMyGroup ? 'text-orange-300' : 'text-white'}`}>
                                {group.group_name} {isMyGroup ? '(שלך)' : ''}
                              </span>
                              <span className="text-slate-500 text-xs">{group.active_members}/{group.member_count} פעילים</span>
                            </div>
                          </div>
                          <div className="text-left">
                            <span className={`font-bold text-sm block ${isMyGroup ? 'text-orange-400' : 'text-purple-400'}`}>{group.group_average_points}</span>
                            <span className="text-slate-500 text-xs">ממוצע</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Coming Soon */}
        <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-2xl p-5 text-center">
          <p className="text-yellow-300 text-xl font-bold">הליגה תעלה בקרוב 🔥</p>
          <p className="text-slate-400 text-sm mt-1">תחרויות קבוצתיות ופרסים</p>
        </div>
      </div>
    </div>
  );
}

export default function ShapeLeagueHome() {
  return (
    <ShapeLeagueErrorBoundary>
      <ShapeLeagueHomeInner />
    </ShapeLeagueErrorBoundary>
  );
}

function PointBadge({ icon, label, value, color }) {
  return (
    <div className="bg-slate-700/50 rounded-xl p-3 text-center">
      <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-slate-400 text-xs">{label}</div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-4">
      <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}