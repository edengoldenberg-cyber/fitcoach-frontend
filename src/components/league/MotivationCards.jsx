import React, { useMemo } from 'react';
import { TrendingUp, Flame, Droplets, Users, Dumbbell, Zap } from 'lucide-react';

// Generate motivation cards based on real data only
function generateCards({ todayPoints, weekTotal, myRank, personAbove, rankingData, groupWeeklyPoints, traineeId, groupMemberTrainees, myGroupRankEntry, groupAbove }) {
  const cards = [];

  // 1. Overtake card — you're close to person above
  if (personAbove && myRank) {
    const needed = personAbove.total_points - (myRank.total_points || 0);
    if (needed > 0 && needed <= 40) {
      cards.push({
        id: 'overtake',
        priority: 10,
        icon: '🔥',
        color: 'from-orange-500/20 to-red-500/20 border-orange-500/40',
        textColor: 'text-orange-300',
        text: `עוד ${needed} נקודות ואתה עוקף את מקום ${myRank.rank - 1}`,
      });
    }
  }

  // 2. Top 10 proximity
  if (myRank && myRank.rank > 10) {
    const top10Entry = rankingData?.ranking?.[9];
    if (top10Entry) {
      const needed = top10Entry.total_points - (myRank.total_points || 0);
      if (needed > 0 && needed <= 50) {
        cards.push({
          id: 'top10',
          priority: 8,
          icon: '⭐',
          color: 'from-yellow-500/20 to-amber-500/20 border-yellow-500/40',
          textColor: 'text-yellow-300',
          text: `חסרות לך רק ${needed} נקודות לטופ 10!`,
        });
      }
    }
  }

  // 3. Perfect day card — missing workout
  if (todayPoints) {
    const hasWorkout = (todayPoints.workout_points || 0) > 0;
    const hasMeals = (todayPoints.meal_points || 0) >= 20;
    const hasWater = (todayPoints.water_points || 0) > 0;

    if (!hasWorkout && hasMeals) {
      cards.push({
        id: 'workout_needed',
        priority: 7,
        icon: '💪',
        color: 'from-teal-500/20 to-green-500/20 border-teal-500/40',
        textColor: 'text-teal-300',
        text: 'עוד אימון אחד ואתה על דרך ליום מושלם!',
      });
    }

    // 4. Water goal card
    if (!hasWater && (hasWorkout || hasMeals)) {
      cards.push({
        id: 'water_needed',
        priority: 6,
        icon: '💧',
        color: 'from-blue-500/20 to-cyan-500/20 border-blue-500/40',
        textColor: 'text-blue-300',
        text: 'סגור יעד מים כדי לקבל +15 נקודות בונוס!',
      });
    }

    // 5. Bonus close — almost perfect day
    if (hasWorkout && hasMeals && hasWater && (todayPoints.bonus_points || 0) === 0) {
      cards.push({
        id: 'bonus',
        priority: 9,
        icon: '⭐',
        color: 'from-purple-500/20 to-pink-500/20 border-purple-500/40',
        textColor: 'text-purple-300',
        text: 'כל כך קרוב ליום מושלם! +20 בונוס מחכה לך',
      });
    }
  }

  // 6. Group activity — teammates who trained today
  if (groupWeeklyPoints && groupMemberTrainees && traineeId) {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    // We only know weekly, so check members with points > 0 this week
    const activeMembers = groupWeeklyPoints.filter(m => m.trainee_id !== traineeId && m.total_points > 0);
    if (activeMembers.length >= 2) {
      cards.push({
        id: 'group_active',
        priority: 5,
        icon: '👥',
        color: 'from-indigo-500/20 to-violet-500/20 border-indigo-500/40',
        textColor: 'text-indigo-300',
        text: `${activeMembers.length} חברי קבוצה כבר צברו נקודות השבוע — קדימה!`,
      });
    }
  }

  // 7. Group rank up card
  if (myGroupRankEntry && groupAbove) {
    const needed = Math.ceil(groupAbove.group_average_points - myGroupRankEntry.group_average_points);
    if (needed > 0 && needed <= 30) {
      cards.push({
        id: 'group_overtake',
        priority: 8,
        icon: '🥇',
        color: 'from-orange-500/20 to-yellow-500/20 border-orange-500/40',
        textColor: 'text-orange-300',
        text: `הקבוצה שלך קרובה — עוד ${needed} נק' ממוצע לעלות מקום!`,
      });
    }
  }

  // 8. First place holding card
  if (myRank?.rank === 1) {
    cards.push({
      id: 'holding_first',
      priority: 9,
      icon: '👑',
      color: 'from-yellow-500/20 to-amber-500/20 border-yellow-400/60',
      textColor: 'text-yellow-300',
      text: 'אתה במקום הראשון! אל תעצור עכשיו 👑',
    });
  }

  // Sort by priority, take top 2
  return cards.sort((a, b) => b.priority - a.priority).slice(0, 2);
}

export default function MotivationCards({ todayPoints, weekTotal, myRank, personAbove, rankingData, groupWeeklyPoints, traineeId, groupMemberTrainees, myGroupRankEntry, groupAbove, loading }) {
  const cards = useMemo(() => {
    if (loading) return [];
    return generateCards({ todayPoints, weekTotal, myRank, personAbove, rankingData, groupWeeklyPoints, traineeId, groupMemberTrainees, myGroupRankEntry, groupAbove });
  }, [todayPoints, weekTotal, myRank, personAbove, rankingData, groupWeeklyPoints, traineeId, groupMemberTrainees, myGroupRankEntry, groupAbove]);

  if (loading || cards.length === 0) return null;

  return (
    <div className="space-y-2 mb-2">
      {cards.map(card => (
        <div key={card.id} className={`bg-gradient-to-r ${card.color} border rounded-2xl px-4 py-3 flex items-center gap-3`}>
          <span className="text-2xl flex-shrink-0">{card.icon}</span>
          <p className={`text-sm font-semibold ${card.textColor} leading-snug`}>{card.text}</p>
        </div>
      ))}
    </div>
  );
}