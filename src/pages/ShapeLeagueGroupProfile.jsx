import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { ArrowRight, Crown, Trophy, Flame, Users, Edit2, Check, X, Zap, UserPlus, LogOut } from 'lucide-react';
import GroupInviteModal from '@/components/league/GroupInviteModal';
import AddGroupMembersModal from '@/components/league/AddGroupMembersModal';

const BADGE_OPTIONS = ['🐺', '🔥', '⚡', '👑', '🐉', '💀', '🛡️', '💪', '⭐', '🐯'];
const BADGE_NAMES = { '🐺': 'זאב', '🔥': 'אש', '⚡': 'ברק', '👑': 'כתר', '🐉': 'דרקון', '💀': 'גולגולת', '🛡️': 'מגן', '💪': 'כוח', '⭐': 'כוכב', '🐯': 'נמר' };

// Build real activity feed from actual points records
function buildRealActivityFeed(memberTrainees, pointsRecords) {
  const feed = [];
  for (const r of pointsRecords) {
    const t = memberTrainees.find(m => m.id === r.trainee_id);
    const name = t?.full_name?.split(' ')[0] || 'מתאמן';
    if ((r.workout_points || 0) > 0) feed.push({ id: `w-${r.id}`, text: `${name} השלים אימון 💪`, date: r.date });
    if ((r.water_points || 0) > 0) feed.push({ id: `wt-${r.id}`, text: `${name} הגיעה ליעד המים 💧`, date: r.date });
    if ((r.meal_points || 0) >= 30) feed.push({ id: `m-${r.id}`, text: `${name} רשמה 3 ארוחות ✅`, date: r.date });
    if ((r.bonus_points || 0) >= 20) feed.push({ id: `b-${r.id}`, text: `${name} השיגה יום מושלם 🔥`, date: r.date });
  }
  return feed.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
}

function Spinner() {
  return (
    <div className="flex justify-center py-6">
      <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function ShapeLeagueGroupProfile() {
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('groupId');
  const queryClient = useQueryClient();

  const [editingName, setEditingName] = useState(false);
  const [editingBadge, setEditingBadge] = useState(false);
  const [editingSlogan, setEditingSlogan] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlogan, setNewSlogan] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      return trainees[0] || null;
    },
    enabled: !!user?.email,
  });

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');

  // Load group
  const { data: group, isLoading: loadingGroup } = useQuery({
    queryKey: ['leagueGroup', groupId],
    queryFn: async () => {
      if (groupId) {
        const all = await base44.entities.ShapeLeagueGroup.list();
        return all.find(g => g.id === groupId) || null;
      }
      // Fallback: find my group
      const all = await base44.entities.ShapeLeagueGroup.list();
      return all.find(g => Array.isArray(g.members) && g.members.includes(trainee?.id)) || null;
    },
    enabled: !!trainee?.id || !!groupId,
  });

  // Load members — one filter per member instead of listing all trainees
  const { data: memberTrainees = [] } = useQuery({
    queryKey: ['groupMemberTrainees', group?.id],
    queryFn: async () => {
      const results = await Promise.all(
        group.members.map(id => base44.entities.Trainee.filter({ id }))
      );
      return results.flat();
    },
    enabled: !!group?.members?.length,
  });

  // Weekly points per member — one filter per member instead of listing all points system-wide
  const { data: weeklyData = { memberPoints: [], rawRecords: [] } } = useQuery({
    queryKey: ['groupMemberWeeklyPoints', group?.id, weekStart],
    queryFn: async () => {
      const memberPointsArrays = await Promise.all(
        group.members.map(id => base44.entities.UserPointsDaily.filter({ trainee_id: id }))
      );
      const weekRecords = memberPointsArrays.flat().filter(r =>
        r.date >= weekStart && r.date <= weekEnd
      );
      const byMember = {};
      for (const r of weekRecords) {
        byMember[r.trainee_id] = (byMember[r.trainee_id] || 0) + (r.total_points || 0);
      }
      const memberPoints = group.members.map(tid => ({
        trainee_id: tid,
        total_points: byMember[tid] || 0,
      })).sort((a, b) => b.total_points - a.total_points);
      return { memberPoints, rawRecords: weekRecords };
    },
    enabled: !!group?.members?.length,
  });
  const memberPoints = weeklyData.memberPoints;

  // Group ranking
  const { data: groupRankingData } = useQuery({
    queryKey: ['groupWeeklyRanking', weekStart],
    queryFn: async () => {
      const res = await base44.functions.invoke('calculateGroupWeeklyRanking', {});
      return res.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const myGroupRankEntry = groupRankingData?.ranking?.find(g => g.group_id === group?.id);

  const isCapt = group?.captain_trainee_id === trainee?.id;

  // Leave group mutation
  const leaveGroup = useMutation({
    mutationFn: async () => {
      const newMembers = group.members.filter(id => id !== trainee.id);
      // If captain leaves and others remain, transfer captain to first member
      const updates = { members: newMembers };
      if (isCapt && newMembers.length > 0) {
        updates.captain_trainee_id = newMembers[0];
      }
      return base44.entities.ShapeLeagueGroup.update(group.id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagueGroup'] });
      queryClient.invalidateQueries({ queryKey: ['myLeagueGroup'] });
      window.location.href = '/ShapeLeagueHome';
    },
  });

  // Update group mutation (captain only)
  const updateGroup = useMutation({
    mutationFn: (data) => base44.entities.ShapeLeagueGroup.update(group.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagueGroup', groupId] });
      queryClient.invalidateQueries({ queryKey: ['myLeagueGroup', trainee?.id] });
      setEditingName(false);
      setEditingBadge(false);
    },
  });

  const getMemberName = (tid) => {
    const t = memberTrainees.find(m => m.id === tid);
    return t?.full_name || t?.user_email || 'מתאמן';
  };

  const captainId = group?.captain_trainee_id;
  const groupName = group?.display_name || group?.name || 'הקבוצה שלי';
  const badge = group?.badge_icon || '🔥';
  const slogan = group?.slogan || '';
  const totalWeekly = memberPoints.reduce((s, e) => s + e.total_points, 0);
  const avgWeekly = memberPoints.length > 0 ? Math.round(totalWeekly / memberPoints.length) : 0;
  const activityFeed = buildRealActivityFeed(memberTrainees, weeklyData.rawRecords || []);

  // Daily activity: how many members have > 0 points today
  const today = format(new Date(), 'yyyy-MM-dd');
  const activeToday = (group?.members || []).filter(tid =>
    (weeklyData.rawRecords || []).some(r => r.trainee_id === tid && r.date === today && (r.total_points || 0) > 0)
  ).length;
  const totalMembers = group?.members?.length || 0;

  // "Most active team" indicator — avg above 70
  const isMostActive = avgWeekly >= 70;

  if (loadingGroup) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4" dir="rtl">
        <div className="text-5xl">😅</div>
        <p className="text-white font-bold">לא נמצאה קבוצה</p>
        <Link to="/ShapeLeagueHome" className="text-teal-400 underline text-sm min-h-0 min-w-0">חזרה לליגה</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 pb-24" dir="rtl">

      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-900/80 backdrop-blur border-b border-slate-700 px-4 py-3 flex items-center gap-3">
        <Link to="/ShapeLeagueHome" className="text-slate-400 hover:text-white transition-colors min-h-0 min-w-0">
          <ArrowRight className="w-5 h-5" />
        </Link>
        <span className="text-2xl">{badge}</span>
        <span className="text-white font-bold text-lg flex-1 truncate">{groupName}</span>
        {isCapt && (
          <span className="text-xs bg-yellow-400/20 border border-yellow-400/40 text-yellow-300 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Crown className="w-3 h-3" /> קפטן
          </span>
        )}
      </div>

      {/* Hero */}
      <div className="px-4 pt-8 pb-5 text-center">
        {/* Large badge */}
        <div className="text-8xl mb-3 drop-shadow-lg">{badge}</div>

        {/* Most active indicator */}
        {isMostActive && (
          <div className="inline-flex items-center gap-1.5 bg-yellow-400/20 border border-yellow-400/50 text-yellow-300 text-xs font-bold px-3 py-1 rounded-full mb-3">
            <Zap className="w-3 h-3" /> הקבוצה הכי פעילה
          </div>
        )}

        {/* Group Name (editable by captain) */}
        {editingName ? (
          <div className="flex items-center gap-2 justify-center mb-1">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="bg-slate-700 border border-teal-400 text-white rounded-xl px-3 py-1.5 text-center text-lg font-bold focus:outline-none"
              maxLength={30}
              autoFocus
            />
            <button onClick={() => updateGroup.mutate({ display_name: newName })} className="text-green-400 hover:text-green-300 min-h-0 min-w-0 w-8 h-8">
              <Check className="w-5 h-5" />
            </button>
            <button onClick={() => setEditingName(false)} className="text-slate-400 hover:text-white min-h-0 min-w-0 w-8 h-8">
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 mb-1">
            <h1 className="text-2xl font-black text-white">{groupName}</h1>
            {isCapt && (
              <button onClick={() => { setNewName(groupName); setEditingName(true); }} className="text-slate-500 hover:text-teal-400 transition-colors min-h-0 min-w-0 w-6 h-6">
                <Edit2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Slogan (editable by captain) */}
        {editingSlogan ? (
          <div className="flex items-center gap-2 justify-center mt-1 mb-2">
            <input
              value={newSlogan}
              onChange={e => setNewSlogan(e.target.value)}
              placeholder="סלוגן קבוצה (עד 40 תווים)"
              className="bg-slate-700 border border-purple-400 text-white rounded-xl px-3 py-1 text-center text-sm focus:outline-none w-56"
              maxLength={40}
              autoFocus
            />
            <button onClick={() => { updateGroup.mutate({ slogan: newSlogan }); setEditingSlogan(false); }} className="text-green-400 min-h-0 min-w-0 w-7 h-7">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => setEditingSlogan(false)} className="text-slate-400 min-h-0 min-w-0 w-7 h-7">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1 mt-0.5 mb-1">
            {slogan ? (
              <p className="text-slate-400 text-sm italic">"{slogan}"</p>
            ) : isCapt ? (
              <p className="text-slate-600 text-xs">+ הוסף סלוגן לקבוצה</p>
            ) : null}
            {isCapt && (
              <button onClick={() => { setNewSlogan(slogan); setEditingSlogan(true); }} className="text-slate-600 hover:text-purple-400 transition-colors min-h-0 min-w-0 w-5 h-5">
                <Edit2 className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Stats row */}
        <div className="flex justify-center gap-5 mt-3 flex-wrap">
          <div className="text-center">
            <div className="text-yellow-400 font-bold text-lg">{myGroupRankEntry ? `#${myGroupRankEntry.rank}` : '—'}</div>
            <div className="text-slate-500 text-xs">מקום בליגה</div>
          </div>
          <div className="text-center">
            <div className="text-purple-400 font-bold text-lg">{avgWeekly}</div>
            <div className="text-slate-500 text-xs">ממוצע שבועי</div>
          </div>
          <div className="text-center">
            <div className="text-teal-400 font-bold text-lg">{group.members?.length || 0}/5</div>
            <div className="text-slate-500 text-xs">חברים</div>
          </div>
          <div className="text-center">
            <div className={`font-bold text-lg ${activeToday >= totalMembers * 0.6 ? 'text-green-400' : 'text-slate-400'}`}>
              {activeToday}/{totalMembers}
            </div>
            <div className="text-slate-500 text-xs">פעילים היום</div>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4 max-w-lg mx-auto">

        {/* Badge Picker (captain only) */}
        {isCapt && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-semibold text-sm">🎨 שנה תג קבוצה</span>
              {editingBadge ? (
                <button onClick={() => setEditingBadge(false)} className="text-slate-400 text-xs min-h-0 min-w-0">סגור</button>
              ) : (
                <button onClick={() => setEditingBadge(true)} className="text-teal-400 text-xs min-h-0 min-w-0">שנה</button>
              )}
            </div>
            {editingBadge && (
              <div className="grid grid-cols-5 gap-2">
                {BADGE_OPTIONS.map(b => (
                  <button
                    key={b}
                    onClick={() => updateGroup.mutate({ badge_icon: b })}
                    className={`text-3xl py-2 rounded-xl border transition-all min-h-0 min-w-0 ${b === badge ? 'border-yellow-400 bg-yellow-400/10' : 'border-slate-600 hover:border-slate-400 bg-slate-700'}`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}
            {editingBadge && (
              <div className="mt-2 text-center text-slate-500 text-xs">
                {BADGE_NAMES[badge] && `תג נוכחי: ${BADGE_NAMES[badge]}`}
              </div>
            )}
          </div>
        )}

        {/* Members */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-teal-400" />
            <h2 className="text-white font-bold text-lg">חברי הקבוצה</h2>
          </div>
          <div className="space-y-2">
            {memberPoints.map((entry, idx) => {
              const isMe = entry.trainee_id === trainee?.id;
              const isCap = entry.trainee_id === captainId;
              const name = getMemberName(entry.trainee_id);
              return (
                <div key={entry.trainee_id} className={`flex items-center gap-3 px-4 py-3 rounded-xl ${isMe ? 'bg-teal-400/10 border border-teal-400/30' : 'bg-slate-700/50'}`}>
                  <span className="text-slate-400 text-sm w-5">{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isCap && <Crown className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />}
                      <span className={`text-sm font-medium truncate ${isMe ? 'text-teal-300' : 'text-white'}`}>
                        {isMe ? `${name} (את/ה)` : name}
                      </span>
                      {isCap && <span className="text-xs text-yellow-400/70 hidden sm:inline">קפטן</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`font-bold text-sm ${isMe ? 'text-teal-400' : 'text-purple-400'}`}>{entry.total_points}</span>
                    <span className="text-slate-500 text-xs mr-1">נק'</span>
                  </div>
                </div>
              );
            })}
            {group.members?.length < 5 && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-slate-600 text-slate-500 text-sm">
                <span>+</span>
                <span>מחכים לחברים ({5 - (group.members?.length || 0)} מקומות פנויים)</span>
              </div>
            )}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-5 h-5 text-orange-400" />
            <h2 className="text-white font-bold text-lg">פעילות אחרונה</h2>
          </div>
          {activityFeed.length > 0 ? (
            <div className="space-y-2">
              {activityFeed.map(item => (
                <div key={item.id} className="flex items-start justify-between px-3 py-2 rounded-xl bg-slate-700/40">
                  <span className="text-white text-sm">{item.text}</span>
                  <span className="text-slate-500 text-xs flex-shrink-0 mr-2">{item.date}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-slate-500 text-sm py-3">אין פעילות מוגדרת השבוע — תתחילו לאמן! 🏋️</div>
          )}
        </div>

        {/* Group Rank Card */}
        {myGroupRankEntry && (
          <div className="bg-gradient-to-r from-orange-500/20 to-yellow-500/10 border border-orange-400/30 rounded-2xl p-5 text-center">
            <div className="text-4xl font-bold text-orange-400 mb-1">#{myGroupRankEntry.rank}</div>
            <div className="text-white text-sm font-semibold">מקום בדירוג הקבוצות</div>
            <div className="text-slate-400 text-xs mt-1">ממוצע: {myGroupRankEntry.group_average_points} נק'</div>
          </div>
        )}

        {/* Invite Button — available to all members */}
        {group.members?.length < 5 && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="w-full flex items-center justify-center gap-3 bg-teal-500/20 hover:bg-teal-500/30 border border-teal-400/50 text-teal-300 font-bold py-4 rounded-2xl transition-colors min-h-0"
          >
            <UserPlus className="w-5 h-5" />
            הזמן חברים לקבוצה
          </button>
        )}

        {/* Captain-only: add existing app users */}
        {isCapt && group.members?.length < 5 && (
          <button
            onClick={() => setShowAddMembersModal(true)}
            className="w-full flex items-center justify-center gap-3 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-400/40 text-purple-300 font-bold py-4 rounded-2xl transition-colors min-h-0"
          >
            <Users className="w-5 h-5" />
            צרף משתמשים מהאפליקציה
          </button>
        )}

        {/* Leave Group Button */}
        <button
          onClick={() => setShowLeaveConfirm(true)}
          className="w-full flex items-center justify-center gap-3 bg-red-500/10 hover:bg-red-500/20 border border-red-400/30 text-red-400 font-bold py-4 rounded-2xl transition-colors min-h-0"
        >
          <LogOut className="w-5 h-5" />
          צא מהקבוצה
        </button>

        {/* Invite Modal */}
        {showInviteModal && (
          <GroupInviteModal group={group} onClose={() => setShowInviteModal(false)} />
        )}

        {/* Add Existing Users Modal */}
        {showAddMembersModal && (
          <AddGroupMembersModal group={group} onClose={() => setShowAddMembersModal(false)} />
        )}

        {/* Leave Confirm Modal */}
        {showLeaveConfirm && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowLeaveConfirm(false)}>
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <div className="text-3xl text-center mb-3">⚠️</div>
              <h3 className="text-white font-bold text-lg text-center mb-2">יציאה מהקבוצה</h3>
              <p className="text-slate-400 text-sm text-center mb-6">
                האם אתה בטוח שברצונך לצאת מ{groupName}?
                {isCapt && group.members?.length > 1 && (
                  <span className="block mt-2 text-yellow-400">
                    כקפטן, הקפטנות תעבור לחבר הבא בקבוצה.
                  </span>
                )}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 font-medium min-h-0"
                >
                  ביטול
                </button>
                <button
                  onClick={() => leaveGroup.mutate()}
                  disabled={leaveGroup.isPending}
                  className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold min-h-0 disabled:opacity-50"
                >
                  {leaveGroup.isPending ? 'יוצא...' : 'כן, צא'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}