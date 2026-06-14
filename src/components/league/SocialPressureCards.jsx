import React, { useMemo } from 'react';
import { Flame, Zap, Trophy, Crown, Users } from 'lucide-react';

function buildPressureCards({
  myGroup,
  groupMemberTrainees,
  groupWeeklyPoints,
  traineeId,
  myRank,
  personAbove,
  groupRankingData,
  myGroupRankEntry,
  groupAbove,
  today,
  weeklyData,
}) {
  const cards = [];

  if (!traineeId) return cards;

  // How many group members are active today
  const activeToday = (myGroup?.members || []).filter(tid => {
    if (tid === traineeId) return false;
    return (weeklyData || []).some(r => r.trainee_id === tid && r.date === today && (r.total_points || 0) > 0);
  }).length;
  const totalOthers = (myGroup?.members?.length || 1) - 1;
  const amIActiveToday = (weeklyData || []).some(r => r.trainee_id === traineeId && r.date === today && (r.total_points || 0) > 0);

  // Card: most group members active, I'm not
  if (activeToday >= 2 && !amIActiveToday && myGroup) {
    cards.push({
      id: 'group_active_without_me',
      icon: '🔥',
      iconColor: 'text-orange-400',
      bg: 'from-orange-500/15 to-orange-500/5',
      border: 'border-orange-500/40',
      text: `${activeToday} מתוך ${totalOthers + 1} חברי הקבוצה כבר פעילים היום`,
      sub: 'הקבוצה שלך מחכה לך 💪',
      urgent: true,
    });
  }

  // Card: I'm the ONLY inactive in group
  if (activeToday === totalOthers && !amIActiveToday && totalOthers >= 2 && myGroup) {
    cards.push({
      id: 'only_inactive',
      icon: '⚡',
      iconColor: 'text-yellow-400',
      bg: 'from-yellow-500/15 to-yellow-500/5',
      border: 'border-yellow-500/50',
      text: 'את/ה היחיד/ה בקבוצה שעדיין לא פעיל/ה היום',
      sub: 'אל תשאר/י מאחור!',
      urgent: true,
    });
  }

  // Card: rival/person-above gap
  if (personAbove && (personAbove.total_points - (myRank?.total_points || 0)) <= 20) {
    const diff = personAbove.total_points - (myRank?.total_points || 0);
    const rivalName = personAbove.trainee_name?.split(' ')[0] || 'מתאמן';
    cards.push({
      id: 'close_to_rank',
      icon: '🏆',
      iconColor: 'text-teal-400',
      bg: 'from-teal-500/15 to-teal-500/5',
      border: 'border-teal-500/40',
      text: `מקום ${(myRank?.rank || 2) - 1} במרחק ${diff} נק' — ${rivalName} לפניך`,
      sub: 'אחד יותר ואתה עוקף!',
    });
  }

  // Card: group dropped a rank
  if (myGroupRankEntry && groupAbove) {
    const diff = Math.round((groupAbove.group_average_points || 0) - (myGroupRankEntry.group_average_points || 0));
    if (diff > 0 && diff <= 30) {
      cards.push({
        id: 'group_close',
        icon: '🚀',
        iconColor: 'text-purple-400',
        bg: 'from-purple-500/15 to-purple-500/5',
        border: 'border-purple-500/40',
        text: `הקבוצה שלך רק ${diff} נק' ממוצע מאחורי ${groupAbove.group_name}`,
        sub: 'עוד מאמץ קטן ואתם עוקפים!',
      });
    }
  }

  // Card: rank 1 — stay there
  if (myRank?.rank === 1) {
    cards.push({
      id: 'stay_top',
      icon: '👑',
      iconColor: 'text-yellow-400',
      bg: 'from-yellow-500/10 to-yellow-500/5',
      border: 'border-yellow-400/50',
      text: 'אתה במקום הראשון! אל תתן לאחרים לעקוף אותך',
      sub: 'שמור על הכתר 👑',
    });
  }

  return cards.slice(0, 2); // Show max 2 cards
}

const iconMap = {
  '🔥': Flame,
  '⚡': Zap,
  '🏆': Trophy,
  '👑': Crown,
  '🚀': Users,
};

export default function SocialPressureCards({
  myGroup,
  groupMemberTrainees,
  groupWeeklyPoints,
  traineeId,
  myRank,
  personAbove,
  groupRankingData,
  myGroupRankEntry,
  groupAbove,
  today,
  weeklyData,
  loading,
}) {
  const cards = useMemo(() => buildPressureCards({
    myGroup, groupMemberTrainees, groupWeeklyPoints,
    traineeId, myRank, personAbove, groupRankingData,
    myGroupRankEntry, groupAbove, today, weeklyData,
  }), [myGroup, groupMemberTrainees, groupWeeklyPoints, traineeId, myRank, personAbove, groupRankingData, myGroupRankEntry, groupAbove, today, weeklyData]);

  if (loading || cards.length === 0) return null;

  return (
    <div className="space-y-3" dir="rtl">
      {cards.map(card => (
        <div key={card.id} className={`bg-gradient-to-r ${card.bg} border ${card.border} rounded-2xl px-4 py-3.5`}>
          <div className="flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">{card.icon}</span>
            <div className="min-w-0">
              <p className={`text-white text-sm font-semibold leading-snug ${card.urgent ? 'text-base' : ''}`}>
                {card.text}
              </p>
              <p className="text-slate-400 text-xs mt-0.5">{card.sub}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}