import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowRight, Medal } from 'lucide-react';
import AchievementProgressCard from '@/components/league/AchievementProgressCard';

// RARITY: common | rare | epic | legendary
const ALL_ACHIEVEMENTS = [
  { key: 'first_workout', category: 'workout', icon: '💪', title: 'אימון ראשון', description: 'הגעת לאימון הראשון שלך!', rarity: 'common', target_value: 1, bonus_points: 50 },
  { key: '5_workouts_week', category: 'workout', icon: '🔥', title: '5 אימונים בשבוע', description: 'השלמת 5 אימונים בשבוע אחד', rarity: 'rare', target_value: 5, bonus_points: 100 },
  { key: '20_workouts_total', category: 'workout', icon: '🏋️', title: '20 אימונים', description: 'השלמת 20 אימונים בסה"כ', rarity: 'epic', target_value: 20, bonus_points: 200 },
  { key: 'first_meal_logged', category: 'nutrition', icon: '🥗', title: 'ארוחה ראשונה', description: 'רשמת את הארוחה הראשונה שלך', rarity: 'common', target_value: 1, bonus_points: 50 },
  { key: '7_days_nutrition', category: 'nutrition', icon: '🍽️', title: 'שבוע של תזונה', description: '7 ימים רצופים עם רישום ארוחות', rarity: 'rare', target_value: 7, bonus_points: 100 },
  { key: '7_day_water_goal', category: 'water', icon: '💧', title: 'שבוע מים', description: 'הגעת ליעד המים 7 ימים ברצף', rarity: 'rare', target_value: 7, bonus_points: 100 },
  { key: 'top_10', category: 'league', icon: '⭐', title: 'טופ 10', description: 'הגעת ל-10 הראשונים בדירוג השבועי', rarity: 'rare', target_value: 1, bonus_points: 150 },
  { key: 'top_3', category: 'league', icon: '🏅', title: 'פודיום', description: 'הגעת למקום 1-3 בדירוג השבועי', rarity: 'epic', target_value: 1, bonus_points: 250 },
  { key: 'first_place', category: 'league', icon: '👑', title: 'מלך/ת הליגה', description: 'הגעת למקום הראשון בליגה!', rarity: 'legendary', target_value: 1, bonus_points: 500 },
  { key: 'winning_team_member', category: 'group', icon: '🤝', title: 'קבוצה מנצחת', description: 'הייתה חלק מהקבוצה המנצחת', rarity: 'epic', target_value: 1, bonus_points: 200 },
  { key: '7_day_streak', category: 'consistency', icon: '🔥🔥', title: 'שבוע אש', description: '7 ימים פעילים ברצף', rarity: 'epic', target_value: 7, bonus_points: 100 },
  { key: '30_day_streak', category: 'consistency', icon: '👑', title: 'חודש מלא', description: '30 ימים פעילים ברצף!', rarity: 'legendary', target_value: 30, bonus_points: 300 },
];

const RARITY_CONFIG = {
  common:    { label: 'נפוץ',      border: 'border-slate-500/40',   bg: 'from-slate-800 to-slate-700',   glow: '',                                            badge: 'bg-slate-600/60 text-slate-300' },
  rare:      { label: 'נדיר',      border: 'border-blue-400/50',    bg: 'from-slate-800 to-blue-900/40', glow: 'shadow-[0_0_14px_rgba(96,165,250,0.2)]',      badge: 'bg-blue-500/20 text-blue-300' },
  epic:      { label: 'אפי',       border: 'border-purple-400/60',  bg: 'from-slate-800 to-purple-900/40',glow: 'shadow-[0_0_18px_rgba(168,85,247,0.25)]',    badge: 'bg-purple-500/20 text-purple-300' },
  legendary: { label: 'אגדתי',    border: 'border-yellow-400/80',  bg: 'from-yellow-900/30 to-slate-800', glow: 'shadow-[0_0_24px_rgba(250,204,21,0.35)]',   badge: 'bg-yellow-500/30 text-yellow-300 font-bold' },
};

const CATEGORY_LABELS = {
  workout: '💪 אימונים',
  nutrition: '🥗 תזונה',
  water: '💧 מים',
  league: '🏆 ליגה',
  group: '👥 קבוצה',
  consistency: '🔥 עקביות',
};

const CATEGORIES = ['workout', 'nutrition', 'water', 'league', 'group', 'consistency'];

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-7 h-7 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function ShapeLeagueAchievements() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  const { data: myData, isLoading } = useQuery({
    queryKey: ['leagueMyData', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('leagueStreakAndAchievements', { action: 'get_my_data' });
      return res.data;
    },
    enabled: !!user?.email,
  });

  // Trigger achievement check on load
  useEffect(() => {
    if (!user?.email) return;
    base44.functions.invoke('leagueStreakAndAchievements', { action: 'check_achievements' })
      .then(() => queryClient.invalidateQueries({ queryKey: ['leagueMyData'] }))
      .catch(() => {});
  }, [user?.email]);

  const unlockedKeys = new Set((myData?.achievements || []).map(a => a.achievement_key));
  const progressByKey = myData?.achievements_progress || {};
  const unlockedCount = unlockedKeys.size;
  const totalCount = ALL_ACHIEVEMENTS.length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 pb-24" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-900/90 backdrop-blur border-b border-slate-700 px-4 py-3 flex items-center gap-3">
        <Link to="/ShapeLeagueHome" className="text-slate-400 hover:text-white min-h-0 min-w-0">
          <ArrowRight className="w-5 h-5" />
        </Link>
        <Medal className="w-5 h-5 text-yellow-400" />
        <span className="text-white font-bold text-lg flex-1">🏅 הישגים</span>
        {!isLoading && (
          <span className="text-yellow-400 text-sm font-bold">{unlockedCount}/{totalCount}</span>
        )}
      </div>

      {isLoading ? <Spinner /> : (
        <div className="px-4 pt-4 max-w-lg mx-auto space-y-6">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1.5">
              <span>התקדמות כללית</span>
              <span>{unlockedCount} מתוך {totalCount} הישגים</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2.5">
              <div
                className="bg-gradient-to-r from-yellow-400 to-orange-400 h-2.5 rounded-full transition-all"
                style={{ width: `${(unlockedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>

          {/* Categories */}
          {CATEGORIES.map(cat => {
            const catAchievements = ALL_ACHIEVEMENTS.filter(a => a.category === cat);
            const catUnlocked = catAchievements.filter(a => unlockedKeys.has(a.key)).length;
            return (
              <div key={cat}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-white font-semibold text-sm">{CATEGORY_LABELS[cat]}</h3>
                  <span className="text-slate-500 text-xs">{catUnlocked}/{catAchievements.length}</span>
                </div>
                <div className="space-y-2">
                  {catAchievements.map(ach => {
                    const unlocked = unlockedKeys.has(ach.key);
                    const unlockedData = myData?.achievements?.find(a => a.achievement_key === ach.key);
                    const rarity = ach.rarity || 'common';
                    const rc = RARITY_CONFIG[rarity];
                    return (
                      <AchievementProgressCard
                        key={ach.key}
                        achievement={ach}
                        unlocked={unlocked}
                        unlockedData={unlockedData}
                        progress={progressByKey[ach.key]}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}