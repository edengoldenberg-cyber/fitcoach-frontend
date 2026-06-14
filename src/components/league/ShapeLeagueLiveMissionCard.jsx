import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/**
 * Generates ONE high-priority mission from REAL data only.
 * Returns null if no real data to build a mission from.
 */
function buildMission({ todayPoints, weekTotal, myRank, personAbove, leagueStreak, myGroupRankEntry, groupAbove }) {
  const tp = todayPoints || {};
  const hasWorkout = (tp.workout_points || 0) > 0;
  const hasWater = (tp.water_points || 0) > 0;
  const hasMeals = (tp.meals_logged_count || 0) >= 3;
  const hasBonus = (tp.bonus_points || 0) > 0;
  const streak = leagueStreak?.current_streak || 0;
  const myPoints = myRank?.total_points || 0;

  // 1. Perfect day incomplete
  if (!hasBonus) {
    const missing = [];
    if (!hasWorkout) missing.push('אימון');
    if (!hasMeals) missing.push('3 ארוחות');
    if (!hasWater) missing.push('יעד מים');
    if (missing.length > 0 && missing.length <= 2) {
      return {
        emoji: missing.includes('אימון') ? '🏋️' : '⭐',
        text: `עוד ${missing.join(' + ')} = יום מושלם +20 בונוס!`,
        accent: 'from-yellow-500/20 to-orange-500/10 border-yellow-500/40',
        textColor: 'text-yellow-300',
        link: missing.includes('אימון') ? '/WorkoutLog' : null,
      };
    }
  }

  // 2. Streak risk (streak > 0, no activity today yet)
  if (streak >= 3 && tp.total_points === 0) {
    return {
      emoji: '🔥',
      text: `סטריק ${streak} ימים — אל תשבור אותו היום!`,
      accent: 'from-orange-500/20 to-red-500/10 border-orange-500/40',
      textColor: 'text-orange-300',
      link: null,
    };
  }

  // 3. Close individual ranking battle
  if (personAbove && myPoints > 0) {
    const needed = personAbove.total_points - myPoints;
    if (needed > 0 && needed <= 40) {
      return {
        emoji: '⚡',
        text: `עוד ${needed} נק׳ ואתה עוקף את מקום ${myRank.rank - 1}!`,
        accent: 'from-purple-500/20 to-blue-500/10 border-purple-500/40',
        textColor: 'text-purple-300',
        link: '/ShapeLeagueTable',
      };
    }
  }

  // 4. Group battle
  if (groupAbove && myGroupRankEntry) {
    const needed = Math.ceil(groupAbove.group_average_points - myGroupRankEntry.group_average_points);
    if (needed > 0 && needed <= 30) {
      return {
        emoji: '👥',
        text: `עוד ${needed} נק׳ ממוצע ועוקפים את ${groupAbove.group_name}!`,
        accent: 'from-teal-500/20 to-green-500/10 border-teal-500/40',
        textColor: 'text-teal-300',
        link: null,
      };
    }
  }

  // 5. Group fell from #1
  if (myGroupRankEntry?.rank === 2) {
    return {
      emoji: '👑',
      text: 'הקבוצה שלך במקום 2 — עוד קצת ואתם חוזרים למקום ראשון!',
      accent: 'from-yellow-500/20 to-orange-500/10 border-yellow-500/40',
      textColor: 'text-yellow-300',
      link: null,
    };
  }

  // 6. Missing workout
  if (!hasWorkout) {
    return {
      emoji: '💪',
      text: 'אימון היום = +30 נק׳ לדירוג',
      accent: 'from-teal-500/20 to-blue-500/10 border-teal-500/40',
      textColor: 'text-teal-300',
      link: '/WorkoutLog',
    };
  }

  // 7. Missing water
  if (!hasWater) {
    return {
      emoji: '💧',
      text: 'סגור יעד מים = +15 נק׳ ומתקרב ליום מושלם',
      accent: 'from-blue-500/20 to-cyan-500/10 border-blue-500/40',
      textColor: 'text-blue-300',
      link: '/WaterLog',
    };
  }

  return null;
}

export default function ShapeLeagueLiveMissionCard({ todayPoints, weekTotal, myRank, personAbove, leagueStreak, myGroupRankEntry, groupAbove, loading }) {
  if (loading) return null;

  const mission = buildMission({ todayPoints, weekTotal, myRank, personAbove, leagueStreak, myGroupRankEntry, groupAbove });
  if (!mission) return null;

  const content = (
    <div className={`bg-gradient-to-r ${mission.accent} border rounded-2xl px-5 py-4 flex items-center gap-3`}>
      <span className="text-3xl flex-shrink-0">{mission.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="text-white/60 text-[10px] font-semibold uppercase tracking-wider mb-0.5">משימה חיה</div>
        <p className={`font-bold text-sm leading-snug ${mission.textColor}`}>{mission.text}</p>
      </div>
      {mission.link && <ChevronLeft className="w-4 h-4 text-slate-500 flex-shrink-0" />}
    </div>
  );

  if (mission.link) {
    return <Link to={mission.link} className="block min-h-0 min-w-0">{content}</Link>;
  }
  return content;
}